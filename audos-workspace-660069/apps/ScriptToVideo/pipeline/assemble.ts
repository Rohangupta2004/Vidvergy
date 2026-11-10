/**
 * ASSEMBLY LAYER — FFmpeg.wasm in the browser.
 *
 * Ready scenes are normalized to one H.264/AAC shape, with a real silent track
 * added to graphics/mockups, then concatenated. An optional second pass can
 * mix ElevenLabs narration and a music bed while preserving Veo's native sound,
 * and burn scene-timed captions. No Remotion or server renderer is involved.
 */

import { fetchFile } from 'https://esm.sh/@ffmpeg/util@0.12.1';
import { getSharedFFmpeg, resetSharedFFmpeg, runFfmpegJob } from '../../../lib/ffmpeg-runtime';
import { Aspect, OnScreenTextItem, uploadBlob } from '../api';
import { WORKSPACE_ID, getWorkspaceToken, spaceId } from '../../../lib/workspace';

/** Stop an in-browser assembly immediately. Saved scenes and audio stay in
 * WorkspaceDB; the next Retry loads a fresh FFmpeg instance and resumes. */
const aspectRetrying = new Set<string>();
/** Length of the optional soft (dip-through-black) transition at each cut. */
const SOFT_EDGE_S = 0.25;

/** FFmpeg.wasm's libass is built without fontconfig and ships no fonts: with
 * no font file in its virtual FS, `subtitles=` exits 0 and draws NOTHING
 * ("can't find selected font provider"). Every burned style names this family
 * and the matching TTF is written to OVERLAY_FONT_DIR before the burn. */
const OVERLAY_FONT_FAMILY = 'DejaVu Sans';
const OVERLAY_FONT_DIR = '/s2v-fonts';
const OVERLAY_FONT_FILE = 'DejaVuSans-Bold.ttf';
const OVERLAY_FONT_URLS = [
  `https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/${OVERLAY_FONT_FILE}`,
  `https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/${OVERLAY_FONT_FILE}`,
];
let overlayFontBytes: Uint8Array | null = null;

async function ensureOverlayFont(ff: any): Promise<string> {
  if (!overlayFontBytes) {
    const failures: string[] = [];
    for (const url of OVERLAY_FONT_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength < 1024) throw new Error('empty font file');
        overlayFontBytes = bytes;
        break;
      } catch (e: any) {
        failures.push(`${url}: ${String(e?.message || e)}`);
      }
    }
    if (!overlayFontBytes) throw new Error(`The on-screen text font could not be downloaded (${failures.join(' | ')}).`);
  }
  try { await ff.createDir(OVERLAY_FONT_DIR); } catch { /* already exists */ }
  // writeFile transfers the buffer to the worker, so hand it a copy and keep the cache.
  await ff.writeFile(`${OVERLAY_FONT_DIR}/${OVERLAY_FONT_FILE}`, overlayFontBytes.slice());
  return OVERLAY_FONT_DIR;
}

export function interruptAssembly(): void {
  aspectRetrying.clear();
  void resetSharedFFmpeg();
}

/** Compatibility export for older callers. New work should use runFfmpegJob so
 * extraction and assembly cannot overlap in the shared virtual filesystem. */
export async function loadFFmpeg(): Promise<any> {
  return getSharedFFmpeg();
}

/**
 * The platform joiner. The workspace-scoped stitch endpoint is the only real
 * one — a bare '/videos/stitch' does not exist on the space origin, so the
 * serving layer answers it HTTP 200 with an HTML page, which is why the old
 * fallback died with "Platform joiner: HTTP 200". The real endpoint answers
 * JSON: { success, stitchedUrl } on success and { error } on failure — both
 * are checked explicitly, including error bodies that arrive with HTTP 200.
 */
export async function platformStitch(urls: string[]): Promise<string> {
  const token = await getWorkspaceToken();
  const res = await fetch(`/api/workspaces/${WORKSPACE_ID}/videos/stitch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': spaceId(),
      ...(token ? { 'X-Workspace-DB-Token': token } : {}),
    },
    body: JSON.stringify({ videoUrls: urls }),
  });
  const raw = await res.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* non-JSON page */ }
  if (!data) throw new Error(`the joiner answered HTTP ${res.status} with a non-JSON page (${raw.slice(0, 80).replace(/\s+/g, ' ')})`);
  const url = data.stitchedUrl || data.videoUrl || data.url;
  if (!res.ok || data.success === false || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new Error(String(data.error || data.message || `HTTP ${res.status} without a stitched video URL`));
  }
  return String(url);
}

function assemblySize(aspect: Aspect): { W: number; H: number } {
  return aspect === '9:16' ? { W: 720, H: 1280 }
    : aspect === '1:1' ? { W: 1080, H: 1080 }
      : { W: 1280, H: 720 };
}

function videoExt(url: string): string {
  const m = /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'mp4';
}

export interface AssemblyInput {
  sceneKey: string;
  url: string;
  /** ElevenLabs narration mixed over this scene. In the Final Assembly flow
   * this is the scene's AUTHORITATIVE voice (native audio drops to ambience
   * via nativeVolume); legacy captured scenes use it the old way. */
  narrationUrl?: string | null;
  /** Native clip audio level (0..1, default 1). Final Assembly passes ~0.16 on
   * narrated scenes so the clip's own sound becomes ambience under the voice —
   * exactly one authoritative voice per scene. Dialogue scenes pass 1. */
  nativeVolume?: number;
  /** Real clip duration (seconds) — needed to extend the scene when the
   * narration slightly overruns it. */
  durationS?: number;
  /** Extend the scene to this length by holding its last frame (capped at
   * +3s) when the narration needs the room. */
  targetDurationS?: number;
  /** Scene SFX dropped in at their offsets, subtle by design. */
  sfx?: { url: string; atS: number; volume: number; durationS?: number }[] | null;
  /** Final Assembly: a failed scene audio mix must FAIL the assembly (the
   * export must contain every audio layer), never silently ship silent. */
  strictAudio?: boolean;
  /** Narration gain for this scene (0..2, default 1) — the Finish voice level. */
  narrationVolume?: number;
  /** Clip length measured from the file itself. Edge fades are only applied
   * when this is known: a planned length could fade the sound out early. */
  measuredDurationS?: number;
}
export interface AssemblyFinish {
  durationS: number;
  narrationUrls?: string[];
  musicUrl?: string;
  /** Music bed level under the mix (0..1, default 0.22). Ducking under speech
   * is automatic on top of this. */
  musicVolume?: number;
  captionsSrt?: string;
  /** Exact display copy rendered after the clips are joined. */
  textOverlays?: OnScreenTextItem[];
  /** Audio-on exports must contain a measurable, non-silent stream. */
  requireAudibleAudio?: boolean;
  /** Styled, timed captions (ASS). Preferred over captionsSrt when present. */
  captionsAss?: string;
  /** Narration placed on the film timeline. When present it is the ONLY key
   * the music ducks under; an empty array means "no narration" and the music
   * ducks gently under the clips' own sound instead. */
  voiceTrack?: { url: string; atS: number }[];
  /** Level the final mix to one integrated loudness before the limiter. */
  loudnessNormalize?: boolean;
  /** 'cut' (default) or a short dip through black at every cut. */
  transition?: 'cut' | 'soft';
  /** Download name for the uploaded MP4 (no path). */
  fileName?: string;
}
export interface AssemblyResult { url: string; durationS: number; via: 'ffmpeg_wasm' | 'platform_stitch'; audioMeanDb?: number; bytes?: number }

export type CaptionStyle = 'bold-pop' | 'clean' | 'karaoke';
export interface CaptionCue { startS: number; endS: number; text: string }

async function writeNarration(ff: any, urls: string[], cleanup: string[]): Promise<string | null> {
  if (!urls.length) return null;
  const names: string[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    const name = `narration_${i}.mp3`;
    await ff.writeFile(name, await fetchFile(urls[i]));
    names.push(name);
    cleanup.push(name);
  }
  if (names.length === 1) return names[0];
  const listName = 'narration-list.txt';
  const output = 'narration-joined.mp3';
  await ff.writeFile(listName, new TextEncoder().encode(names.map((n) => `file '${n}'`).join('\n')));
  cleanup.push(listName, output);
  const rc = await ff.exec(['-y', '-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', output]);
  if (rc !== 0) throw new Error('The narration segments could not be joined.');
  return output;
}

function assTime(seconds: number): string {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total - Math.floor(total)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function assText(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, '\\N');
}

/** ASS is FFmpeg's deterministic timed-text format. FontSize 20 and Outline 2
 * intentionally match the existing burned-caption settings in this file; only
 * emphasis, backing and screen alignment vary by the user's style/position. */
function buildTextOverlayAss(items: OnScreenTextItem[], aspect: Aspect): string {
  const { W, H } = assemblySize(aspect);
  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Clean,${OVERLAY_FONT_FAMILY},20,&H00FFFFFF,&H00FFFFFF,&H90000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,2,28,28,34,1`,
    `Style: Boxed,${OVERLAY_FONT_FAMILY},20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,1,0,2,28,28,34,1`,
    `Style: Accent,${OVERLAY_FONT_FAMILY},20,&H0044B5F2,&H0044B5F2,&H90000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,2,28,28,34,1`, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = items.map((item) => {
    const alignment = item.position === 'top' ? 8 : item.position === 'center' ? 5 : 2;
    const style = item.style === 'boxed' ? 'Boxed' : item.style === 'accent' ? 'Accent' : 'Clean';
    return `Dialogue: 1,${assTime(item.start_s)},${assTime(item.end_s)},${style},,0,0,0,,{\\an${alignment}}${assText(item.text)}`;
  });
  return [...header, ...events].join('\n');
}

function captionWords(text: string): string[] {
  return String(text || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[*_#`{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Burned-in captions. Sizes and margins are relative to the output frame so
 * 9:16 keeps clear of platform UI at the bottom and 16:9 stays in the title-
 * safe area. Cue time is shared across chunks by word length; Karaoke adds a
 * per-word \k highlight across the same span. */
export function buildCaptionAss(cues: CaptionCue[], aspect: Aspect, style: CaptionStyle = 'clean'): string {
  const { W, H } = assemblySize(aspect);
  const portrait = H > W;
  const base = Math.min(W, H);
  const pop = style === 'bold-pop';
  const fontSize = Math.round(base * (pop ? 0.072 : 0.058));
  const marginV = Math.round(H * (portrait ? 0.17 : 0.08));
  const marginLR = Math.round(W * 0.08);
  const lineChars = pop ? (portrait ? 16 : 24) : (portrait ? 24 : 40);
  const maxLines = pop ? 1 : 2;
  const WHITE = '&H00FFFFFF';
  const GOLD = '&H0037AFD4';
  const BLACK = '&H00000000';
  const SHADE = '&H96000000';
  const primary = style === 'karaoke' ? GOLD : WHITE;
  const outline = pop ? 4 : style === 'karaoke' ? 3 : 2.5;
  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${OVERLAY_FONT_FAMILY},${fontSize},${primary},${WHITE},${BLACK},${SHADE},-1,0,0,0,100,100,0,0,1,${outline},${pop ? 0 : 1},2,${marginLR},${marginLR},${marginV},1`, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const cue of cues) {
    const words = captionWords(pop ? String(cue.text || '').toUpperCase() : cue.text);
    const span = Number(cue.endS) - Number(cue.startS);
    if (!words.length || !(span > 0.2)) continue;
    const chunks: string[][][] = [];
    let lines: string[][] = [[]];
    for (const word of words) {
      const line = lines[lines.length - 1];
      const next = [...line, word].join(' ');
      if (!line.length || next.length <= lineChars) { line.push(word); continue; }
      if (lines.length < maxLines) { lines.push([word]); continue; }
      chunks.push(lines);
      lines = [[word]];
    }
    if (lines[0].length) chunks.push(lines);
    const weightOf = (chunk: string[][]) => chunk.flat().reduce((n, w) => n + w.length + 1, 0);
    const total = chunks.reduce((n, c) => n + weightOf(c), 0) || 1;
    let used = 0;
    for (const chunk of chunks) {
      const weight = weightOf(chunk);
      const start = cue.startS + (span * used) / total;
      const end = Math.max(start + 0.2, cue.startS + (span * (used + weight)) / total);
      used += weight;
      let text: string;
      if (style === 'karaoke') {
        const cs = Math.max(1, Math.round((end - start) * 100));
        text = chunk.map((line) => line.map((w) => `{\\k${Math.max(1, Math.round((cs * (w.length + 1)) / weight))}}${assText(w)}`).join(' ')).join('\\N');
      } else {
        text = chunk.map((line) => line.map(assText).join(' ')).join('\\N');
        if (pop) text = `{\\fscx82\\fscy82\\t(0,120,\\fscx100\\fscy100)}${text}`;
      }
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${text}`);
    }
  }
  return events.length ? [...header, ...events].join('\n') : '';
}

async function applyFinish(
  ff: any,
  joinedName: string,
  finish: AssemblyFinish,
  aspect: Aspect,
  cleanup: string[],
  say: (note: string, fraction: number) => void,
): Promise<string> {
  const narration = await writeNarration(ff, (finish.narrationUrls || []).filter(Boolean), cleanup);
  let music: string | null = null;
  if (finish.musicUrl) {
    music = 'music.mp3';
    await ff.writeFile(music, await fetchFile(finish.musicUrl));
    cleanup.push(music);
  }
  let captions = '';
  let captionsAss = '';
  if (finish.captionsAss?.trim()) {
    captionsAss = 'captions.ass';
    await ff.writeFile(captionsAss, new TextEncoder().encode(finish.captionsAss));
    cleanup.push(captionsAss);
  } else if (finish.captionsSrt?.trim()) {
    captions = 'captions.srt';
    await ff.writeFile(captions, new TextEncoder().encode(finish.captionsSrt));
    cleanup.push(captions);
  }
  let overlays = '';
  const textOverlays = (finish.textOverlays || []).filter((item) => item.text && item.end_s > item.start_s);
  if (textOverlays.length) {
    overlays = 'text-overlays.ass';
    await ff.writeFile(overlays, new TextEncoder().encode(buildTextOverlayAss(textOverlays, aspect)));
    cleanup.push(overlays);
  }

  let fontsOpt = '';
  if (overlays || captionsAss || captions) {
    try {
      fontsOpt = `:fontsdir=${await ensureOverlayFont(ff)}`;
    } catch (e: any) {
      say(`On-screen text font unavailable — ${String(e?.message || e).slice(0, 120)}`, 0.94);
    }
  }

  const duckNames: { name: string; atS: number }[] = [];
  const voiceTrack = (finish.voiceTrack || []).filter((v) => v && /^https?:/.test(String(v.url || '')));
  if (music && voiceTrack.length) {
    for (let i = 0; i < voiceTrack.length; i += 1) {
      const name = `duck_${i}.mp3`;
      await ff.writeFile(name, await fetchFile(voiceTrack[i].url));
      cleanup.push(name);
      duckNames.push({ name, atS: Math.max(0, Number(voiceTrack[i].atS) || 0) });
    }
  }

  const duration = Math.max(0.25, Number(finish.durationS) || 0).toFixed(3);
  const output = 'final.mp4';
  const buildArgs = (normalize: boolean): string[] => {
  const args: string[] = ['-y', '-i', joinedName];
  let nextInput = 1;
  let narrationIndex = -1;
  let musicIndex = -1;
  const duckIndexes: { index: number; atS: number }[] = [];
  if (narration) { narrationIndex = nextInput; nextInput += 1; args.push('-i', narration); }
  // The music bed is composed in one provider request (at most 600s of
  // audio), but the film can be any length: `-stream_loop -1` repeats the bed
  // for as long as the mix needs it, and the music filter's atrim plus
  // `-shortest` end it exactly at the film's duration.
  if (music) { musicIndex = nextInput; nextInput += 1; args.push('-stream_loop', '-1', '-i', music); }
  for (const duck of duckNames) { duckIndexes.push({ index: nextInput, atS: duck.atS }); nextInput += 1; args.push('-i', duck.name); }

  // One integrated loudness for narration, music and clip sound; the limiter
  // after it catches inter-sample peaks so nothing clips.
  const master = normalize ? 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,' : '';
  const filters: string[] = ['[0:a:0]aformat=sample_rates=44100:channel_layouts=stereo[native]'];
  if (narrationIndex >= 0) {
    filters.push(`[${narrationIndex}:a:0]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=0:${duration},asetpts=N/SR/TB[narr]`);
    filters.push('[native][narr]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[spoken]');
  } else {
    filters.push('[native]anull[spoken]');
  }
  if (musicIndex >= 0) {
    // Music always SUPPORTS: base level from the plan, an automatic sidechain
    // duck under every spoken moment, and clean fade-in/fade-out edges.
    const musicVol = Math.min(0.6, Math.max(0.02, Number(finish.musicVolume) || 0.22));
    const fadeOutStart = Math.max(0, Number(duration) - 2.2).toFixed(3);
    filters.push(`[${musicIndex}:a:0]aformat=sample_rates=44100:channel_layouts=stereo,volume=${musicVol.toFixed(2)},apad,atrim=0:${duration},afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOutStart}:d=2,asetpts=N/SR/TB[musicbed]`);
    let duckFilter = 'sidechaincompress=threshold=0.035:ratio=10:attack=20:release=650';
    if (duckIndexes.length) {
      duckIndexes.forEach((duck, k) => {
        const ms = Math.round(duck.atS * 1000);
        filters.push(`[${duck.index}:a:0]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},apad,atrim=0:${duration},asetpts=N/SR/TB[dk${k}]`);
      });
      filters.push(duckIndexes.length === 1
        ? '[dk0]anull[duckkey]'
        : `${duckIndexes.map((_, k) => `[dk${k}]`).join('')}amix=inputs=${duckIndexes.length}:duration=longest:dropout_transition=0:normalize=0[duckkey]`);
      filters.push('[spoken]anull[spokenout]');
      duckFilter = 'sidechaincompress=threshold=0.03:ratio=8:attack=20:release=600';
    } else {
      filters.push('[spoken]asplit=2[spokenout][duckkey]');
      // No narration: the key is the clips' own sound, so duck gently — the
      // bed must not vanish under ambience, but on-camera dialogue stays on top.
      if (finish.voiceTrack) duckFilter = 'sidechaincompress=threshold=0.12:ratio=3:attack=30:release=700';
    }
    filters.push(`[musicbed][duckkey]${duckFilter}[ducked]`);
    filters.push(`[spokenout][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,${master}alimiter=limit=0.95[outa]`);
  } else {
    filters.push(`[spoken]${master}alimiter=limit=0.95[outa]`);
  }

  args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[outa]');
  const videoFilters: string[] = [];
  if (overlays) videoFilters.push(`subtitles=${overlays}${fontsOpt}`);
  if (captionsAss) videoFilters.push(`subtitles=${captionsAss}${fontsOpt}`);
  else if (captions) videoFilters.push(`subtitles=${captions}${fontsOpt}:force_style='FontName=${OVERLAY_FONT_FAMILY},FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=34'`);
  if (videoFilters.length) {
    args.push('-vf', videoFilters.join(','));
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p');
  } else {
    args.push('-c:v', 'copy');
  }
  args.push('-c:a', 'aac', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', '-shortest', output);
  return args;
  };
  const burnsCaptions = !!(captionsAss || captions);
  say(overlays ? 'Burning the approved on-screen text…' : burnsCaptions ? 'Mixing sound and burning captions…' : 'Mixing the finishing audio…', 0.95);
  let rc = await ff.exec(buildArgs(!!finish.loudnessNormalize));
  if (rc !== 0 && finish.loudnessNormalize) {
    say('Loudness levelling was unavailable — mixing at the set levels instead…', 0.96);
    rc = await ff.exec(buildArgs(false));
  }
  if (rc !== 0) throw new Error(overlays ? 'FFmpeg could not burn the on-screen text into this film.' : burnsCaptions ? 'FFmpeg could not burn the captions into this film.' : 'FFmpeg could not mix the finishing audio.');
  cleanup.push(output);
  return output;
}

/** Free FFmpeg.wasm intermediates the moment they are no longer needed. The
 * in-memory FS would otherwise hold every downloaded clip and every normalized
 * copy until the end of the run — fine for a dozen scenes, fatal for a long
 * film of 60–120 clips. */
async function verifyAudibleAudio(ff: any, fileName: string): Promise<number> {
  const logs: string[] = [];
  const listener = ({ message }: any) => logs.push(String(message || ''));
  ff.on('log', listener);
  let rc = 1;
  try {
    rc = await ff.exec(['-i', fileName, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
  } finally {
    try { ff.off('log', listener); } catch { /* older ffmpeg wrapper */ }
  }
  const joined = logs.join('\n');
  const match = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(joined);
  if (rc !== 0 || !match) throw new Error('Audio is ON, but the assembled MP4 has no readable audio stream. The export was not accepted.');
  const meanDb = Number(match[1]);
  if (!Number.isFinite(meanDb) || meanDb <= -65) throw new Error(`Audio is ON, but the assembled track is effectively silent (${Number.isFinite(meanDb) ? meanDb.toFixed(1) : '-∞'} dB mean). The export was not accepted.`);
  return meanDb;
}

async function verifyOutputAspect(ff: any, fileName: string, aspect: Aspect): Promise<void> {
  const logs: string[] = [];
  const listener = ({ message }: any) => logs.push(String(message || ''));
  ff.on('log', listener);
  try { await ff.exec(['-i', fileName]); } finally { try { ff.off('log', listener); } catch {} }
  const dimensions = Array.from(logs.join('\n').matchAll(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/g)).map((match) => ({ width: Number(match[1]), height: Number(match[2]) }));
  const actual = dimensions.find((item) => item.width >= 320 && item.height >= 320);
  if (!actual) throw new Error('The finished MP4 dimensions could not be verified. Your clips are safe; tap Retry.');
  const valid = aspect === '9:16' ? actual.height > actual.width : aspect === '1:1' ? Math.abs(actual.width - actual.height) <= 2 : actual.width > actual.height;
  if (!valid) throw new Error(`The finished ${aspect} film came back ${actual.width}×${actual.height}. It was not delivered; your clips are safe. Tap Retry.`);
}

async function drop(ff: any, cleanup: string[], ...names: string[]): Promise<void> {
  for (const name of names) {
    try { await ff.deleteFile(name); } catch { /* already gone */ }
    const at = cleanup.indexOf(name);
    if (at >= 0) cleanup.splice(at, 1);
  }
}

export async function assembleFilm(
  clips: AssemblyInput[],
  aspect: Aspect,
  onProgress?: (note: string, fraction: number) => void,
  finish?: AssemblyFinish,
): Promise<AssemblyResult> {
  if (!clips.length) throw new Error('No scene clips to assemble.');
  const say = (note: string, f: number) => { try { onProgress?.(note, f); } catch { /* UI only */ } };
  // Per-scene audio work (narration / SFX / ambience ducking) only exists on
  // the FFmpeg path — the platform stitch fallback would silently drop it, so
  // any clip carrying audio layers makes FFmpeg mandatory.
  const sceneAudioRequested = clips.some((c) => c.narrationUrl || (c.sfx && c.sfx.length) || (typeof c.nativeVolume === 'number' && c.nativeVolume < 0.999) || c.strictAudio);
  const finishRequested = !!(finish && ((finish.narrationUrls?.length || 0) > 0 || finish.musicUrl || finish.captionsSrt || finish.captionsAss || (finish.textOverlays?.length || 0) > 0 || finish.requireAudibleAudio)) || sceneAudioRequested;

  try {
    return await runFfmpegJob(async (ff) => {
    const { W, H } = assemblySize(aspect);
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`;
    const names: string[] = [];
    const cleanup: string[] = [];

    for (let i = 0; i < clips.length; i += 1) {
      const clip = clips[i];
      say(`Joining clip ${i + 1} of ${clips.length}…`, (i / (clips.length + 1)) * 0.88);
      const inName = `in_${i}.${videoExt(clip.url)}`;
      const outName = `seg_${i}.mp4`;
      await ff.writeFile(inName, await fetchFile(clip.url));
      cleanup.push(inName, outName);
      const common = ['-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];
      // Tiny audio fades at every cut stop clicks; the optional soft transition
      // dips the picture through black. A scene held for its narration gets its
      // closing fades in the mix pass below instead.
      const measured = Number(clip.measuredDurationS) || 0;
      const holdsTail = Number(clip.targetDurationS) > Math.max(0.25, Number(clip.durationS) || 0) + 0.05;
      const soft = finish?.transition === 'soft';
      const clipVf = [vf];
      if (soft) clipVf.push(`fade=t=in:st=0:d=${SOFT_EDGE_S}`);
      if (soft && measured > SOFT_EDGE_S * 2 && !holdsTail) clipVf.push(`fade=t=out:st=${(measured - SOFT_EDGE_S).toFixed(3)}:d=${SOFT_EDGE_S}`);
      const clipAf = ['afade=t=in:st=0:d=0.015'];
      if (measured > 0.1 && !holdsTail) clipAf.push(`afade=t=out:st=${Math.max(0, measured - 0.03).toFixed(3)}:d=0.03`);
      const vfArg = clipVf.join(',');
      let rc = await ff.exec(['-y', '-i', inName, '-vf', vfArg, '-af', clipAf.join(','), ...common, '-map', '0:v:0', '-map', '0:a:0', outName]);
      if (rc !== 0) {
        rc = await ff.exec(['-y', '-i', inName, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-vf', vfArg, ...common, '-map', '0:v:0', '-map', '1:a:0', '-shortest', outName]);
      }
      if (rc !== 0) throw new Error(`Scene ${i + 1} could not be normalized for assembly.`);
      await drop(ff, cleanup, inName);
      // Per-scene audio mix: the authoritative ElevenLabs narration rides over
      // the clip with the native audio reduced to ambience, scene SFX drop in
      // at their offsets, and a narration that slightly overruns extends the
      // scene by holding its last frame (never by speeding the voice up).
      let segName = outName;
      const sfxList = (clip.sfx || []).filter((f) => f && /^https?:/.test(String(f.url || '')));
      const nativeVol = typeof clip.nativeVolume === 'number' ? Math.min(1, Math.max(0, clip.nativeVolume)) : 1;
      const narrVol = typeof clip.narrationVolume === 'number' ? Math.min(2, Math.max(0, clip.narrationVolume)) : 1;
      const clipDur = Math.max(0.25, Number(clip.durationS) || 0);
      const targetDur = clipDur
        ? Math.max(clipDur, Math.min(Number(clip.targetDurationS) || clipDur, clipDur + 3))
        : Math.max(0.25, Number(clip.targetDurationS) || 0);
      const pad = clipDur && targetDur > clipDur + 0.05 ? targetDur - clipDur : 0;
      const needsMix = !!clip.narrationUrl || sfxList.length > 0 || nativeVol < 0.999 || pad > 0;
      const sceneTemp: string[] = [];
      if (needsMix) {
        try {
          const mixName = `segmix_${i}.mp4`;
          sceneTemp.push(mixName);
          const args2: string[] = ['-y', '-i', outName];
          let inputIdx = 1;
          let narrIdx = -1;
          if (clip.narrationUrl) {
            const narrName = `narr_${i}.mp3`;
            await ff.writeFile(narrName, await fetchFile(clip.narrationUrl));
            cleanup.push(narrName);
            sceneTemp.push(narrName);
            narrIdx = inputIdx; inputIdx += 1;
            args2.push('-i', narrName);
          }
          const fxIdx: number[] = [];
          for (let k = 0; k < sfxList.length; k += 1) {
            const fxName = `sfx_${i}_${k}.mp3`;
            await ff.writeFile(fxName, await fetchFile(sfxList[k].url));
            cleanup.push(fxName);
            sceneTemp.push(fxName);
            fxIdx.push(inputIdx); inputIdx += 1;
            args2.push('-i', fxName);
          }
          const T = (targetDur || clipDur || 6).toFixed(3);
          // A scene is held to a fixed length ONLY when it is being padded to
          // make room for its narration. Otherwise it runs its full natural
          // length: `durationS` is the PLANNED duration whenever the real one
          // could not be probed, and capping the output at it is what chopped
          // honest 8s and 10s clips back to the planned 4s or 6s. With the
          // native leg unbounded, amix's duration=first follows the clip.
          const holdToTarget = pad > 0;
          const nativeBound = holdToTarget ? `,apad,atrim=0:${T}` : '';
          const f2: string[] = [];
          const mixIns: string[] = [];
          f2.push(`[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${nativeVol.toFixed(3)}${nativeBound},asetpts=N/SR/TB[na]`);
          mixIns.push('[na]');
          if (narrIdx >= 0) {
            f2.push(`[${narrIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${narrVol.toFixed(2)},apad,atrim=0:${T},asetpts=N/SR/TB[nr]`);
            mixIns.push('[nr]');
          }
          sfxList.forEach((fx, k) => {
            const delayMs = Math.max(0, Math.round((Number(fx.atS) || 0) * 1000));
            const vol = Math.min(1, Math.max(0.05, Number(fx.volume) || 0.25));
            const fxDur = Math.min(2.5, Math.max(0.2, Number(fx.durationS) || 2.5));
            f2.push(`[${fxIdx[k]}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${fxDur.toFixed(2)},afade=t=out:st=${Math.max(0, fxDur - 0.35).toFixed(2)}:d=0.35,volume=${vol.toFixed(2)},adelay=${delayMs}|${delayMs},apad,atrim=0:${T},asetpts=N/SR/TB[fx${k}]`);
            mixIns.push(`[fx${k}]`);
          });
          const tailFade = holdToTarget ? `,afade=t=out:st=${Math.max(0, Number(T) - 0.03).toFixed(3)}:d=0.03` : '';
          f2.push(`${mixIns.join('')}amix=inputs=${mixIns.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95${tailFade}[a]`);
          let mapVideo = '0:v:0';
          if (pad > 0) {
            const softOut = soft ? `,fade=t=out:st=${Math.max(0, Number(T) - SOFT_EDGE_S).toFixed(3)}:d=${SOFT_EDGE_S}` : '';
            f2.push(`[0:v]tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}${softOut}[v]`);
            mapVideo = '[v]';
          }
          args2.push('-filter_complex', f2.join(';'), '-map', mapVideo, '-map', '[a]');
          if (pad > 0) args2.push('-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p');
          else args2.push('-c:v', 'copy');
          args2.push('-c:a', 'aac', '-ar', '44100', '-ac', '2');
          if (holdToTarget) args2.push('-t', T);
          args2.push(mixName);
          cleanup.push(mixName);
          const mixRc = await ff.exec(args2);
          if (mixRc !== 0) throw new Error(`Scene ${i + 1}: the narration/SFX mix failed inside FFmpeg.`);
          segName = mixName;
        } catch (e: any) {
          // Final Assembly must never silently drop an audio layer.
          if (clip.strictAudio) throw e instanceof Error ? e : new Error(String(e));
          say(`Scene ${i + 1}: the scene audio could not be mixed — the scene ships with native sound only.`, (i / (clips.length + 1)) * 0.88);
        }
      }
      // Only the segment that goes into the join stays in memory.
      await drop(ff, cleanup, ...sceneTemp.filter((n) => n !== segName), ...(segName !== outName ? [outName] : []));
      names.push(segName);
    }

    say('Joining scenes…', 0.90);
    const listName = 'scene-list.txt';
    const joinedName = 'joined.mp4';
    await ff.writeFile(listName, new TextEncoder().encode(names.map((n) => `file '${n}'`).join('\n')));
    cleanup.push(listName, joinedName);
    const joinRc = await ff.exec(['-y', '-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', '-movflags', '+faststart', joinedName]);
    if (joinRc !== 0) throw new Error('The final join failed inside FFmpeg.');

    const finishLayers = !!(finish && ((finish.narrationUrls?.length || 0) > 0 || finish.musicUrl || finish.captionsSrt || finish.captionsAss || finish.loudnessNormalize || (finish.textOverlays?.length || 0) > 0));
    const outputName = finishLayers ? await applyFinish(ff, joinedName, finish!, aspect, cleanup, say) : joinedName;
    const audioMeanDb = finish?.requireAudibleAudio ? await verifyAudibleAudio(ff, outputName) : undefined;
    await verifyOutputAspect(ff, outputName, aspect);
    const bytes = await ff.readFile(outputName);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    for (const name of [...new Set(cleanup)]) { try { await ff.deleteFile(name); } catch { /* fs cleanup */ } }
    if (!blob.size) throw new Error('FFmpeg produced an empty film.');

    say('Publishing the film…', 0.98);
    const url = await uploadBlob(blob, finish?.fileName || `s2v-film-${Date.now()}.mp4`);
    return { url, durationS: Number(finish?.durationS) || 0, via: 'ffmpeg_wasm', audioMeanDb, bytes: blob.size };
    }, { label: 'Script-to-Video assembly', timeoutMs: 8 * 60_000 });
  } catch (wasmError: any) {
    if (aspect !== '16:9') {
      const retryKey = `${aspect}:${clips.map((clip) => clip.url).join('|')}`;
      if (!aspectRetrying.has(retryKey)) {
        aspectRetrying.add(retryKey);
        try {
          say(`Resetting the video engine and retrying ${aspect} assembly once…`, 0.25);
          await resetSharedFFmpeg();
          return await assembleFilm(clips, aspect, onProgress, finish);
        } finally { aspectRetrying.delete(retryKey); }
      }
      throw new Error(`${aspect} assembly failed after one clean FFmpeg retry: ${String(wasmError?.message || wasmError).slice(0, 220)}. No landscape fallback was created; your clips are safe. Tap Retry.`);
    }
    // Finishing cannot silently disappear. The stitch fallback has no audio or
    // caption mixer, so an opted-in finish must fail clearly and preserve the
    // previously assembled film.
    if (finishRequested) throw wasmError;
    say('FFmpeg unavailable — using the 16:9 platform joiner…', 0.5);
    try {
      const url = await platformStitch(clips.map((c) => c.url));
      return { url, durationS: 0, via: 'platform_stitch' };
    } catch (stitchError: any) {
      throw new Error(`Assembly failed. In-browser FFmpeg: ${String(wasmError?.message || wasmError).slice(0, 160)}. Platform joiner: ${String(stitchError?.message || stitchError).slice(0, 200)}`);
    }
  }
}
