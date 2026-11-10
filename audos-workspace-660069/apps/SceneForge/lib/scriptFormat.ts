/**
 * SceneForge structured script format.
 *
 *   Act N — Title (start–end)            + a one-line summary
 *   Scene N · start–end · Title
 *   Shot: camera movement … Ends on: continuity frame
 *   Full cinematic prompt paragraph (style prefix, the full character
 *   description repeated verbatim, setting, lighting), "Camera:" and "Audio:"
 *   lines, and one quoted line of dialogue (Pip says: "…").
 *   Optional trailing sections: production tips, and a music prompt with
 *   timestamped cues.
 *
 * The parser is deliberately tolerant and never throws: anything that is not
 * recognisably in this format returns null so callers keep the plain-script
 * behaviour.
 */

export interface StructuredDialogue {
  speaker: string;
  line: string;
}

export interface StructuredScene {
  index: number;
  act: number | null;
  start: number;
  end: number;
  title: string;
  shot: string;
  endsOn: string;
  /** Every scene line except the header, Shot and Ends-on lines, verbatim. */
  prompt: string;
  camera: string;
  audio: string;
  dialogue: StructuredDialogue[];
}

export interface StructuredAct {
  index: number;
  title: string;
  start: number;
  end: number;
  summary: string;
  scenes: StructuredScene[];
}

export interface StructuredMusicCue {
  start: number;
  end: number | null;
  text: string;
}

export interface StructuredScript {
  acts: StructuredAct[];
  scenes: StructuredScene[];
  start: number;
  end: number;
  durationSec: number;
  productionTips: string[];
  musicPrompt: string;
  musicCues: StructuredMusicCue[];
  warnings: string[];
}

/** Compact, prompt-free copy stored with the project. */
export interface StructuredOutline {
  durationSec: number;
  acts: Array<{ index: number; title: string; start: number; end: number; summary: string }>;
  scenes: Array<{ index: number; act: number | null; start: number; end: number; title: string; shot: string; endsOn: string; dialogue: string }>;
  musicCues: StructuredMusicCue[];
}

const TC = String.raw`(\d{1,2}):([0-5]\d)(?::([0-5]\d))?`;
const RANGE_SEP = String.raw`\s*(?:–|—|-|‑|−|to)\s*`;
const RANGE_RE = new RegExp(TC + RANGE_SEP + TC);
const SCENE_RE = /^scene\s+(\d{1,3})\b(.*)$/i;
const ACT_RE = /^act\s+(\d{1,2}|[ivx]{1,5}|one|two|three|four|five|six)\b(.*)$/i;
const SHOT_RE = /^shot\s*[:\-–—]\s*(.*)$/i;
const ENDS_ON_RE = /^ends?\s+on\s*[:\-–—]\s*(.*)$/i;
const ENDS_ON_INLINE_RE = /[\s(·•|;,.—–-]*ends?\s+on\s*[:\-–—]\s*(.+)$/i;
const CAMERA_RE = /^camera\s*:\s*(.*)$/i;
const AUDIO_RE = /^audio\s*:\s*(.*)$/i;
const TIPS_RE = /^(?:production\s+tips|production\s+notes|tips(?:\s+for\s+production)?)\s*(?::\s*(.*)|\s*)$/i;
const MUSIC_RE = /^(?:music\s+prompt|music\s+cues?|music|soundtrack|score)\s*(?::\s*(.*)|\s*)$/i;
const MUSIC_IN_SCENE_RE = /^(?:music\s+prompt|music\s+cues?|soundtrack)\s*(?::\s*(.*)|\s*)$/i;
const SAYS_VERBS = 'says|said|whispers|shouts|asks|exclaims|sings|calls|replies|narrates|murmurs|giggles|laughs|cheers|gasps|yells|adds|sighs|declares';
const SAYS_RE = new RegExp(String.raw`([A-Z][\p{L}\p{N}'’\- ]{0,40}?)\s+(?:${SAYS_VERBS})\b[^“"\n]{0,30}?[:,]?\s*[“"]([^”"\n]{1,600})[”"]`, 'gu');
const LABELLED_LINE_RE = /^(dialogue|line|vo|v\.o\.|voice\s*-?\s*over|narrator|narration)\s*(?:\(([^)]{1,40})\))?\s*:\s*[“"]?(.+?)[”"]?\s*$/i;

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function timecodeSeconds(a: string, b: string, c?: string): number {
  return c != null && c !== '' ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
}

function parseRange(text: string): { start: number; end: number; rest: string } | null {
  const match = RANGE_RE.exec(text);
  if (!match) return null;
  const start = timecodeSeconds(match[1], match[2], match[3]);
  const end = timecodeSeconds(match[4], match[5], match[6]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const rest = (text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length)).replace(/\(\s*\)|\[\s*\]/g, ' ');
  return { start, end, rest };
}

function stripDecoration(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s+|[-*•]\s+|\d+[.)]\s+(?=(?:act|scene)\b))/i, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\*(.+)\*$/, '$1')
    .trim();
}

function cleanTitle(text: string): string {
  return text
    .replace(/^[\s·•|:—–\-]+|[\s·•|:—–\-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .trim();
}

function actNumber(raw: string): number {
  const lower = raw.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  return ROMAN[lower] || WORDS[lower] || 0;
}

/** One time label: 0:08, 1:20, 1:02:03. */
export function formatTimecode(totalSec: number): string {
  const sec = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatTimeRange(start: number, end: number): string {
  return `${formatTimecode(start)}–${formatTimecode(end)}`;
}

function extractDialogue(body: string[]): StructuredDialogue[] {
  const found: StructuredDialogue[] = [];
  for (const raw of body) {
    const line = raw.trim();
    const labelled = LABELLED_LINE_RE.exec(line);
    if (labelled) {
      const text = labelled[3].trim();
      if (text) found.push({ speaker: (labelled[2] || labelled[1]).trim(), line: text });
      continue;
    }
    SAYS_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SAYS_RE.exec(line))) {
      const speaker = match[1].trim().split(/\s+/).slice(-3).join(' ');
      const text = match[2].trim();
      if (text) found.push({ speaker, line: text });
    }
  }
  return found;
}

/** Cheap check before the full parse: at least one "Scene N" line with a time range. */
export function looksStructured(text: string): boolean {
  try {
    const source = String(text || '');
    if (source.length < 20 || source.length > 200000) return false;
    return /^[\s#>*\-•\d.)]*\**scene\s+\d{1,3}\b[^\n]*\d{1,2}:[0-5]\d/im.test(source);
  } catch {
    return false;
  }
}

/**
 * Parses the structured format. Returns null (never throws) when the text has
 * fewer than two timed scenes, so plain scripts keep the existing behaviour.
 */
export function parseStructuredScript(text: string): StructuredScript | null {
  try {
    if (!looksStructured(text)) return null;
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const acts: StructuredAct[] = [];
    const scenes: StructuredScene[] = [];
    const tips: string[] = [];
    const musicLines: string[] = [];
    const musicCues: StructuredMusicCue[] = [];
    let currentAct: StructuredAct | null = null;
    let currentScene: (StructuredScene & { body: string[] }) | null = null;
    let section: 'none' | 'act' | 'scene' | 'tips' | 'music' = 'none';
    let actNeedsSummary = false;

    const closeScene = () => {
      if (!currentScene) return;
      const body = currentScene.body;
      scenes.push({
        index: currentScene.index,
        act: currentScene.act,
        start: currentScene.start,
        end: currentScene.end,
        title: currentScene.title,
        shot: currentScene.shot,
        endsOn: currentScene.endsOn,
        prompt: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
        camera: currentScene.camera,
        audio: currentScene.audio,
        dialogue: extractDialogue(body),
      });
      currentScene = null;
    };

    for (const rawLine of lines) {
      const line = stripDecoration(rawLine);
      if (!line) {
        if (currentScene) currentScene.body.push('');
        continue;
      }

      const sceneMatch = SCENE_RE.exec(line);
      const sceneRange = sceneMatch ? parseRange(sceneMatch[2]) : null;
      if (sceneMatch && sceneRange) {
        closeScene();
        section = 'scene';
        actNeedsSummary = false;
        currentScene = {
          index: Number(sceneMatch[1]),
          act: currentAct ? currentAct.index : null,
          start: sceneRange.start,
          end: sceneRange.end,
          title: cleanTitle(sceneRange.rest),
          shot: '',
          endsOn: '',
          prompt: '',
          camera: '',
          audio: '',
          dialogue: [],
          body: [],
        };
        continue;
      }

      const actMatch = ACT_RE.exec(line);
      if (actMatch && actNumber(actMatch[1]) > 0) {
        const rest = actMatch[2];
        const range = parseRange(rest);
        const afterRange = range ? range.rest : rest;
        const parts = afterRange.replace(/^[\s·•|:—–\-]+/, '').split(/\s+(?:\+|—|–|-|·|:)\s+(?=[A-Z“"])/);
        const title = cleanTitle(parts[0] || '');
        if (title.length <= 120) {
          closeScene();
          const summary = cleanTitle(parts.slice(1).join(' — '));
          currentAct = { index: actNumber(actMatch[1]), title, start: range ? range.start : NaN, end: range ? range.end : NaN, summary, scenes: [] };
          acts.push(currentAct);
          section = 'act';
          actNeedsSummary = !summary;
          continue;
        }
      }

      const tipsMatch = TIPS_RE.exec(line);
      if (tipsMatch && line.length <= 160 && (scenes.length || currentScene)) {
        closeScene();
        section = 'tips';
        if ((tipsMatch[1] || '').trim()) tips.push((tipsMatch[1] || '').trim());
        continue;
      }
      const bareMusic = MUSIC_RE.exec(line);
      const musicMatch = section === 'scene' ? MUSIC_IN_SCENE_RE.exec(line) || (bareMusic && !(bareMusic[1] || '').trim() ? bareMusic : null) : bareMusic;
      if (musicMatch && (scenes.length || currentScene)) {
        closeScene();
        section = 'music';
        if ((musicMatch[1] || '').trim()) musicLines.push((musicMatch[1] || '').trim());
        continue;
      }

      if (section === 'act' && currentAct) {
        if (actNeedsSummary) {
          currentAct.summary = cleanTitle(line);
          actNeedsSummary = false;
        }
        continue;
      }

      if (section === 'scene' && currentScene) {
        const shot = SHOT_RE.exec(line);
        if (shot) {
          const inline = ENDS_ON_INLINE_RE.exec(shot[1]);
          if (inline) {
            currentScene.shot = cleanTitle(shot[1].slice(0, inline.index));
            currentScene.endsOn = cleanTitle(inline[1]);
          } else {
            currentScene.shot = cleanTitle(shot[1]);
          }
          continue;
        }
        const endsOn = ENDS_ON_RE.exec(line);
        if (endsOn) {
          currentScene.endsOn = cleanTitle(endsOn[1]);
          continue;
        }
        const camera = CAMERA_RE.exec(line);
        if (camera) currentScene.camera = camera[1].trim();
        const audio = AUDIO_RE.exec(line);
        if (audio) currentScene.audio = audio[1].trim();
        currentScene.body.push(rawLine.trim());
        continue;
      }

      if (section === 'tips') {
        const tip = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
        if (tip) tips.push(tip);
        continue;
      }

      if (section === 'music') {
        const cueLine = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '');
        const range = new RegExp('^\\[?' + TC + '(?:' + RANGE_SEP + TC + ')?\\]?\\s*[:·•|\\-–—]?\\s*(.*)$').exec(cueLine);
        if (range) {
          const start = timecodeSeconds(range[1], range[2], range[3]);
          const end = range[4] != null ? timecodeSeconds(range[4], range[5], range[6]) : null;
          musicCues.push({ start, end: end != null && end >= start ? end : null, text: range[7].trim() });
        } else {
          musicLines.push(cueLine.trim());
        }
      }
    }
    closeScene();

    if (scenes.length < 2) return null;

    for (const act of acts) {
      act.scenes = scenes.filter((scene) => scene.act === act.index);
      if (!Number.isFinite(act.start)) act.start = act.scenes.length ? act.scenes[0].start : 0;
      if (!Number.isFinite(act.end)) act.end = act.scenes.length ? act.scenes[act.scenes.length - 1].end : act.start;
    }

    const start = Math.min(...scenes.map((scene) => scene.start));
    const end = Math.max(...scenes.map((scene) => scene.end));
    const warnings: string[] = [];
    scenes.forEach((scene, i) => {
      const label = `Scene ${scene.index}`;
      if (!scene.shot) warnings.push(`${label} has no "Shot:" line.`);
      if (!scene.endsOn && i < scenes.length - 1) warnings.push(`${label} has no "Ends on:" continuity frame.`);
      if (!scene.dialogue.length) warnings.push(`${label} has no quoted dialogue line.`);
      const next = scenes[i + 1];
      if (next && Math.abs(next.start - scene.end) > 0.5) warnings.push(`${label} ends at ${formatTimecode(scene.end)} but Scene ${next.index} starts at ${formatTimecode(next.start)}.`);
    });

    return {
      acts,
      scenes,
      start,
      end,
      durationSec: Math.max(0, end - start),
      productionTips: tips,
      musicPrompt: musicLines.join('\n').trim(),
      musicCues,
      warnings,
    };
  } catch (error) {
    console.warn('[SceneForge] structured script parse skipped:', error);
    return null;
  }
}

/** The words the presenter speaks: each scene's dialogue lines, in order. */
export function spokenLinesFromStructured(parsed: StructuredScript | null): string[] {
  if (!parsed) return [];
  return parsed.scenes.flatMap((scene) => scene.dialogue.map((entry) => entry.line.trim())).filter(Boolean);
}

export function spokenScriptFromStructured(parsed: StructuredScript | null): string {
  return spokenLinesFromStructured(parsed).join('\n');
}

export function structuredOutline(parsed: StructuredScript): StructuredOutline {
  return {
    durationSec: parsed.durationSec,
    acts: parsed.acts.map((act) => ({ index: act.index, title: act.title.slice(0, 160), start: act.start, end: act.end, summary: act.summary.slice(0, 300) })),
    scenes: parsed.scenes.map((scene) => ({
      index: scene.index,
      act: scene.act,
      start: scene.start,
      end: scene.end,
      title: scene.title.slice(0, 160),
      shot: scene.shot.slice(0, 400),
      endsOn: scene.endsOn.slice(0, 300),
      dialogue: scene.dialogue.map((entry) => entry.line).join(' ').slice(0, 600),
    })),
    musicCues: parsed.musicCues.slice(0, 40).map((cue) => ({ ...cue, text: cue.text.slice(0, 300) })),
  };
}

/** Scene/act layout the script writer is asked to follow for a target length. */
export function structuredPlanFor(targetSeconds: number): { scenes: number; acts: number; sceneSec: number; totalSec: number } {
  const total = Math.max(16, Math.min(600, Math.round(Number(targetSeconds) || 120)));
  const scenes = Math.max(2, Math.min(40, Math.round(total / 8)));
  const acts = scenes >= 9 ? 3 : scenes >= 4 ? 2 : 1;
  return { scenes, acts, sceneSec: Math.round((total / scenes) * 10) / 10, totalSec: total };
}

export const STRUCTURED_SCRIPT_FORMAT_GUIDE = [
  'Write the script in this exact structured format, plain text, no markdown headings or bold:',
  '',
  'Act N — Title (m:ss–m:ss)',
  'One-line summary of the act.',
  '',
  'Scene N · m:ss–m:ss · Title',
  'Shot: the camera movement for this scene. Ends on: the exact continuity frame this scene ends on.',
  'One full cinematic prompt paragraph: start with the same style prefix in every scene (for example "Cinematic 3D animated film, Pixar-style stylized toon, soft global illumination, … 16:9"), then the FULL character description repeated word-for-word in every scene so the character stays consistent, then the setting and the lighting.',
  'Camera: lens, framing and movement.',
  'Audio: ambience and sound effects for this scene.',
  'Name says: "the one line of dialogue spoken in this scene."',
  '',
  'Rules:',
  '- Number scenes from 1 and acts from 1. Timecodes are continuous: each scene starts exactly where the previous one ended, and the act range covers its scenes.',
  '- Every scene\'s "Ends on:" frame is the opening frame of the next scene, so clips can be chained.',
  '- Exactly one quoted dialogue line per scene, short enough to be spoken comfortably within the scene length (about 2.3 words per second).',
  '- Only the quoted dialogue is spoken aloud; everything else is production direction.',
  '- After the last scene you may add "Production tips:" (reference image first, chain each clip\'s last frame into the next clip, voiceover, title card added in editing only, one continuous music track) and "Music prompt:" followed by timestamped cues such as "0:00–0:40 — gentle plucked strings".',
].join('\n');
