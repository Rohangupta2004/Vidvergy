import { WORKSPACE_ID } from '../../../lib/workspace';
import type { MotionLayer, MotionProject, MotionScene, MotionTranscript, MotionWord } from '../../../lib/motionEngineSdk';
import type { ForgeProject } from './forgeTypes';
import { FORGE_OPUS_LABEL, FORGE_OPUS_MODEL, isForgeOpusModel, type ForgeOpusModel } from './forgeModels';
import { safeErrorText } from './safeError';

export type VisionEditorModel = ForgeOpusModel | 'gpt-6.1-sol';
export type VisionFrame = { timestamp: number; data: string; mediaType: 'image/jpeg'; bytes: number };
export type CaptionWord = MotionWord & { captionIndex: number; captionLine: number; emphasis: boolean };

export interface VisionEditProposal {
  modelUsed: VisionEditorModel | 'mixed' | 'deterministic';
  notes: string[];
  timeline: MotionProject['timeline'];
  graphicLayers: MotionLayer[];
  transcript: MotionTranscript;
  globalArtDirection: MotionProject['globalArtDirection'];
  frameCount: number;
  fallbackReason?: string;
}

type PartialPlan = {
  notes?: unknown[];
  scenes?: unknown[];
  graphicLayers?: unknown[];
  captionPlacements?: unknown[];
  musicDucking?: unknown[];
};

const MAX_FRAME_BATCH = 24;
const MAX_IMAGE_CHARS_PER_REQUEST = 176_000;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with', 'you', 'your']);

function clamp(value: unknown, min: number, max: number, fallback = min): number {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

function cleanToken(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function buildCaptionMetadata(words: Array<MotionWord & { word: string }>): CaptionWord[] {
  const result: CaptionWord[] = [];
  let captionIndex = 0;
  let pending: Array<MotionWord & { word: string }> = [];
  let chars = 0;

  const flush = () => {
    if (!pending.length) return;
    let line = 0;
    let lineChars = 0;
    const candidates = pending
      .map((entry, index) => ({ index, token: cleanToken(entry.word) }))
      .filter((entry) => entry.token.length >= 5 && !STOP_WORDS.has(entry.token))
      .sort((a, b) => b.token.length - a.token.length)
      .slice(0, 2)
      .map((entry) => entry.index);
    pending.forEach((entry, index) => {
      const nextLength = lineChars + (lineChars ? 1 : 0) + entry.word.length;
      if (nextLength > 42 && line === 0) { line = 1; lineChars = 0; }
      lineChars += (lineChars ? 1 : 0) + entry.word.length;
      result.push({ ...entry, captionIndex, captionLine: line, emphasis: candidates.includes(index) });
    });
    captionIndex += 1;
    pending = [];
    chars = 0;
  };

  words.forEach((entry) => {
    const nextChars = chars + (chars ? 1 : 0) + entry.word.length;
    const punctuationBreak = /[.!?;:]$/.test(entry.word) && pending.length >= 3;
    if (pending.length && (nextChars > 78 || pending.length >= 12)) flush();
    pending.push(entry);
    chars += (chars ? 1 : 0) + entry.word.length;
    if (punctuationBreak) flush();
  });
  flush();
  return result;
}

/** Keep the user's script verbatim while borrowing only timing from ASR. */
export function alignKnownScript(script: string, asrWords: MotionWord[], durationSec: number): MotionTranscript {
  const sourceWords = String(script || '').trim().split(/\s+/).filter(Boolean);
  const cleanAsr = (Array.isArray(asrWords) ? asrWords : [])
    .map((entry) => ({ word: String(entry.word || '').trim(), start: Number(entry.start), end: Number(entry.end), confidence: entry.confidence }))
    .filter((entry) => entry.word && Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end >= entry.start)
    .sort((a, b) => a.start - b.start);
  const text = sourceWords.length ? sourceWords.join(' ') : cleanAsr.map((entry) => entry.word).join(' ');
  if (!sourceWords.length || !cleanAsr.length) {
    const fallback = cleanAsr.length
      ? cleanAsr
      : text.split(/\s+/).filter(Boolean).map((word, index, all) => ({ word, start: (durationSec * index) / Math.max(1, all.length), end: (durationSec * (index + 1)) / Math.max(1, all.length) }));
    return { text, words: buildCaptionMetadata(fallback), provider: cleanAsr.length ? 'deepgram' : 'sceneforge_timing_estimate', provenance: { scriptSource: sourceWords.length ? 'project_script' : 'raw_asr', aligned: false } };
  }

  const matches = new Map<number, number>();
  let asrCursor = 0;
  sourceWords.forEach((word, scriptIndex) => {
    const needle = cleanToken(word);
    let bestIndex = -1;
    let bestScore = 0;
    for (let candidate = asrCursor; candidate < Math.min(cleanAsr.length, asrCursor + 12); candidate += 1) {
      const score = similarity(needle, cleanToken(cleanAsr[candidate].word)) - (candidate - asrCursor) * 0.025;
      if (score > bestScore) { bestScore = score; bestIndex = candidate; }
    }
    if (bestIndex >= 0 && bestScore >= (needle.length <= 3 ? 0.82 : 0.62)) {
      matches.set(scriptIndex, bestIndex);
      asrCursor = bestIndex + 1;
    }
  });

  const overallStart = Math.max(0, cleanAsr[0].start);
  const overallEnd = Math.max(overallStart + 0.03, cleanAsr[cleanAsr.length - 1].end || durationSec);
  const aligned: MotionWord[] = sourceWords.map((word, index) => {
    const match = matches.get(index);
    if (match != null) return { word, start: cleanAsr[match].start, end: cleanAsr[match].end, confidence: cleanAsr[match].confidence };
    let previous = index - 1;
    while (previous >= 0 && !matches.has(previous)) previous -= 1;
    let next = index + 1;
    while (next < sourceWords.length && !matches.has(next)) next += 1;
    const left = previous >= 0 ? cleanAsr[matches.get(previous)!].end : overallStart;
    const right = next < sourceWords.length ? cleanAsr[matches.get(next)!].start : overallEnd;
    const slot = index - previous;
    const slots = next - previous;
    const start = left + ((right - left) * (slot - 1)) / Math.max(1, slots - 1);
    const end = left + ((right - left) * slot) / Math.max(1, slots - 1);
    return { word, start, end: Math.max(start + 0.03, end) };
  });
  aligned[0].start = overallStart;
  aligned[aligned.length - 1].end = overallEnd;
  for (let index = 1; index < aligned.length; index += 1) {
    aligned[index].start = Math.max(aligned[index].start, aligned[index - 1].start + 0.001);
    aligned[index].end = Math.max(aligned[index].start + 0.03, Math.min(overallEnd, aligned[index].end));
  }
  return {
    text,
    words: buildCaptionMetadata(aligned),
    provider: 'deepgram_script_aligned',
    model: 'nova-3',
    provenance: { verifiedTiming: true, textSource: 'project_script', timingSource: 'deepgram_asr', matchedWords: matches.size, scriptWords: sourceWords.length, overallStart, overallEnd },
  };
}

function speechRanges(words: MotionWord[], durationSec: number) {
  const speech: Array<{ start: number; end: number }> = [];
  words.forEach((word) => {
    const current = speech[speech.length - 1];
    if (current && word.start - current.end <= 0.45) current.end = Math.max(current.end, word.end);
    else speech.push({ start: word.start, end: word.end });
  });
  const silence: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  speech.forEach((range) => {
    if (range.start - cursor >= 0.35) silence.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  });
  if (durationSec - cursor >= 0.35) silence.push({ start: cursor, end: durationSec });
  return { speech, silence };
}

function sceneBoundaries(project: ForgeProject, durationSec: number): number[] {
  const times = new Set<number>();
  for (let second = 0; second < durationSec; second += 1) times.add(Number(second.toFixed(3)));
  const scenes = Array.isArray(project.director_plan?.scene_layouts) ? project.director_plan!.scene_layouts! : [];
  scenes.forEach((scene) => { times.add(clamp(scene.start, 0, durationSec)); times.add(clamp(scene.end, 0, durationSec)); });
  const events = Array.isArray(project.director_plan?.events) ? project.director_plan!.events! : [];
  events.forEach((event: any) => { times.add(clamp(event.start, 0, durationSec)); times.add(clamp(event.end, 0, durationSec)); });
  return [...times].filter((time) => time < Math.max(0.01, durationSec)).sort((a, b) => a - b);
}

async function frameToJpeg(url: string, timestamp: number): Promise<VisionFrame> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Frame at ${timestamp.toFixed(1)}s could not be read.`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const width = Math.min(768, bitmap.width || 768);
  const height = Math.max(1, Math.round((bitmap.height / Math.max(1, bitmap.width)) * width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare vision frames.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const uri = canvas.toDataURL('image/jpeg', 0.44);
  const data = uri.slice(uri.indexOf(',') + 1);
  return { timestamp, data, mediaType: 'image/jpeg', bytes: Math.ceil(data.length * 0.75) };
}

export async function sampleVideoFrames(videoUrl: string, timestamps: number[], onProgress?: (done: number, total: number) => void): Promise<VisionFrame[]> {
  const extracted: Array<{ timestamp: number; url: string }> = [];
  for (let start = 0; start < timestamps.length; start += 20) {
    const group = timestamps.slice(start, start + 20);
    const response = await fetch('/api/video/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, timestamps: group, workspaceId: WORKSPACE_ID }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.frames)) throw new Error(data?.error || `Frame extraction failed (HTTP ${response.status}).`);
    data.frames.forEach((frame: any) => { if (frame?.url) extracted.push({ timestamp: Number(frame.timestamp), url: String(frame.url) }); });
  }
  const frames: VisionFrame[] = [];
  for (const frame of extracted) {
    frames.push(await frameToJpeg(frame.url, frame.timestamp));
    onProgress?.(frames.length, extracted.length);
  }
  return frames;
}

function batches(frames: VisionFrame[]): VisionFrame[][] {
  const result: VisionFrame[][] = [];
  let current: VisionFrame[] = [];
  let chars = 0;
  frames.forEach((frame) => {
    if (current.length && (current.length >= MAX_FRAME_BATCH || chars + frame.data.length > MAX_IMAGE_CHARS_PER_REQUEST)) {
      result.push(current); current = []; chars = 0;
    }
    current.push(frame); chars += frame.data.length;
  });
  if (current.length) result.push(current);
  return result;
}

function parseJson(value: string): PartialPlan {
  const source = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The vision model did not return a JSON object.');
  return JSON.parse(source.slice(start, end + 1));
}

function tokenHeader(): Record<string, string> {
  const token = (window as any).__workspaceDb?.token;
  if (!token) throw new Error('The workspace token is unavailable for AI vision.');
  return { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token };
}

async function callOpus(prompt: string, frames: VisionFrame[]): Promise<PartialPlan> {
  const content: any[] = [{ type: 'text', text: prompt }];
  frames.forEach((frame) => {
    content.push({ type: 'text', text: `Frame timestamp: ${frame.timestamp.toFixed(3)} seconds` });
    content.push({ type: 'image', source: { type: 'base64', media_type: frame.mediaType, data: frame.data } });
  });
  const response = await fetch('/proxy/anthropic/v1/messages', {
    method: 'POST', headers: tokenHeader(),
    body: JSON.stringify({ model: FORGE_OPUS_MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, system: VISION_SYSTEM, messages: [{ role: 'user', content }] }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `${FORGE_OPUS_LABEL} failed (${response.status}).`);
  return parseJson((data?.content || []).filter((block: any) => block?.type === 'text').map((block: any) => block.text).join(''));
}

async function callGpt(prompt: string, frames: VisionFrame[]): Promise<PartialPlan> {
  const content: any[] = [{ type: 'text', text: prompt }];
  frames.forEach((frame) => content.push({ type: 'image_url', image_url: { url: `data:${frame.mediaType};base64,${frame.data}`, detail: 'low' } }));
  const response = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST', headers: tokenHeader(),
    body: JSON.stringify({ model: 'gpt-6.1-sol', reasoning_effort: 'high', max_completion_tokens: 16000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: VISION_SYSTEM }, { role: 'user', content }] }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `GPT 6.1 Sol failed (${response.status}).`);
  return parseJson(data?.choices?.[0]?.message?.content || '');
}

const VISION_SYSTEM = `You are SceneForge's senior vision editor. You receive the KNOWN SCRIPT with ASR-derived timing, scene metadata, audio speech/silence cues, brand rules, and timestamp-labelled frames sampled across the whole film. Return strict JSON only. Never transcribe, correct, paraphrase, translate, or invent visible wording: caption and kinetic-text copy must be exact contiguous words from the known script. Use what is actually visible to avoid faces and key subjects. Make a restrained, non-destructive edit decision list compatible with the supplied timeline/layer schema. Include cuts/trims/order/durations, subject-aware caption placement, emphasis words, zoom/pan/punch-in targets, transitions, kinetic text, lower thirds, callouts/arrows/highlights tied to visible subjects, B-roll/overlay cues, and music ducking. Use existing media/components and brand colours. At most one non-caption graphic at once and roughly one major graphic per 3 seconds. Clamp all decisions to the batch time range. Output exactly {"notes":["short note"],"scenes":[{"id":"scene-id","startSec":0,"endSec":1,"sourceStartSec":0,"sourceEndSec":1,"order":0,"purpose":"","speechAnchors":["exact script phrase"],"visualDecision":"","tool":"remotion|existing_media","placement":"","transitionIn":"cut|dissolve|wipe|match-cut","transitionOut":"cut|dissolve|wipe|match-cut","camera":{"type":"static|zoom|pan|punch-in","target":{"x":0.5,"y":0.5},"scale":1}}],"captionPlacements":[{"startSec":0,"endSec":1,"placement":"bottom|top|left|right","x":0.5,"y":0.85,"reason":""}],"graphicLayers":[{"id":"layer-id","kind":"kinetic_text|lower_third|callout|arrow|highlight|broll|overlay","label":"","startSec":0,"endSec":1,"x":0.1,"y":0.1,"width":0.4,"height":0.2,"text":"exact script words or empty","target":{"x":0.5,"y":0.5,"subject":"visible subject"},"style":{},"animation":{}}],"musicDucking":[{"startSec":0,"endSec":1,"gainDb":-18,"reason":"speech"}]}.`;

function promptForBatch(project: ForgeProject, transcript: MotionTranscript, frames: VisionFrame[], batchIndex: number, batchCount: number, durationSec: number): string {
  const range = { start: frames[0]?.timestamp || 0, end: frames[frames.length - 1]?.timestamp || durationSec };
  const cues = speechRanges(transcript.words, durationSec);
  return JSON.stringify({
    task: 'Produce one partial edit decision list for these timestamped frames; later batches will be merged.',
    batch: { index: batchIndex + 1, count: batchCount, range },
    durationSec,
    knownScript: project.script || transcript.text || '',
    alignedWords: transcript.words,
    scenes: project.director_plan?.scene_layouts || project.studio_config.avatar_script || [],
    existingEvents: project.director_plan?.events || [],
    audioCues: { ...cues, musicUrlAvailable: Boolean(project.music_url), beatOrLoudnessPeaks: 'not available from current analysis' },
    brand: project.studio_config.brand || {},
    existingAssets: { broll: project.director_plan?.broll_previews || [], images: project.director_plan?.images || [] },
    frameLabels: frames.map((frame) => frame.timestamp),
  });
}

function exactScriptText(candidate: unknown, script: string): string {
  const value = String(candidate || '').trim();
  if (!value) return '';
  const normalizedScript = String(script || '').replace(/[^\p{L}\p{N}]+/gu, ' ').toLocaleLowerCase();
  const normalizedValue = value.replace(/[^\p{L}\p{N}]+/gu, ' ').toLocaleLowerCase().trim();
  return normalizedValue && normalizedScript.includes(normalizedValue) ? value : '';
}

function deterministicProposal(project: ForgeProject, transcript: MotionTranscript, durationSec: number, rawReason?: string): VisionEditProposal {
  const reason = rawReason ? safeErrorText(rawReason, 'the AI vision pass was unavailable', { script: project.script, maxLength: 160, context: 'vision editor fallback' }) : undefined;
  const existingScenes = Array.isArray(project.director_plan?.scene_layouts) ? project.director_plan!.scene_layouts! : [];
  const events = Array.isArray(project.director_plan?.events) ? project.director_plan!.events! : [];
  const scenes: MotionScene[] = existingScenes.length ? existingScenes.map((scene, index) => ({
    id: `scene-${index + 1}`, startSec: clamp(scene.start, 0, durationSec), endSec: clamp(scene.end, 0, durationSec), purpose: scene.diagram?.title || `Scene ${index + 1}`,
    speechAnchors: scene.diagram?.elements?.map((item) => item.keyword).filter(Boolean) || [], visualDecision: scene.reason || scene.layout, tool: 'remotion', placement: scene.safeZone,
    sourceStartSec: clamp(scene.start, 0, durationSec), sourceEndSec: clamp(scene.end, 0, durationSec), order: index, camera: { type: index % 3 === 1 ? 'punch-in' : 'static', scale: index % 3 === 1 ? 1.06 : 1 },
  })) : [{ id: 'scene-1', startSec: 0, endSec: durationSec, purpose: 'Preserve presenter master', speechAnchors: [], visualDecision: 'Use the existing subject-safe SceneForge treatment.', tool: 'remotion', placement: 'subject-safe overlay' }];
  const captionGroups = new Map<number, CaptionWord[]>();
  (transcript.words as CaptionWord[]).forEach((word) => captionGroups.set(word.captionIndex || 0, [...(captionGroups.get(word.captionIndex || 0) || []), word]));
  const captionLayers: MotionLayer[] = [...captionGroups.entries()].map(([index, words]) => ({
    id: `caption-${index}`, kind: 'captions', label: `Caption ${index + 1}`, startSec: words[0].start, endSec: words[words.length - 1].end + 0.18, visible: true, locked: false,
    x: 0.12, y: 0.76, width: 0.76, height: 0.16, text: words.map((word) => word.word).join(' '), style: { maxCharsPerLine: 42, maxLines: 2, placement: 'bottom', emphasisWords: words.filter((word) => word.emphasis).map((word) => word.word) }, animation: { type: 'active-word', timing: 'word' },
  }));
  const eventLayers: MotionLayer[] = events.slice(0, Math.floor(durationSec / 3) + 2).map((event: any, index) => ({
    id: `director-${index + 1}`, kind: event.kind === 'arrow' ? 'arrow' : 'kinetic_text', label: event.kind || 'Director graphic', startSec: clamp(event.start, 0, durationSec), endSec: clamp(event.end, 0, durationSec), x: 0.62, y: 0.18, width: 0.3, height: 0.2,
    text: exactScriptText(event.text, project.script || transcript.text || ''), style: { brandSafe: true }, animation: { type: 'scene-reveal' },
  }));
  return {
    modelUsed: 'deterministic', frameCount: 0, fallbackReason: reason,
    notes: [reason ? `AI vision fallback: ${reason}` : 'Used the existing SceneForge direction with script-aligned captions.', 'Caption text comes only from the known script; Deepgram supplies timing only.', 'Graphics remain density-capped and inside the existing subject-safe layout.'],
    timeline: { version: 1, scenes, tracks: [{ id: 'avatar', kind: 'video', sourceId: 'sceneforge-avatar', locked: true }, { id: 'graphics', kind: 'motion' }, { id: 'captions', kind: 'captions' }, { id: 'music', kind: 'audio' }], editDecisionList: scenes },
    graphicLayers: [...captionLayers, ...eventLayers], transcript,
    globalArtDirection: { version: 1, concept: 'Script-led, frame-aware presenter edit', palette: project.studio_config.brand?.colors || {}, typography: { heading: 'Manrope', body: 'Inter' }, motionLanguage: 'Restrained speech-synced motion with one clear focal action at a time.', safeAreas: { captions: 0.18, faceAvoidance: true }, locked: false },
  };
}

function mergePlans(project: ForgeProject, transcript: MotionTranscript, partials: PartialPlan[], durationSec: number, modelUsed: VisionEditProposal['modelUsed'], frameCount: number): VisionEditProposal {
  const script = project.script || transcript.text || '';
  const rawScenes = partials.flatMap((partial) => Array.isArray(partial.scenes) ? partial.scenes : []) as any[];
  const scenes: MotionScene[] = rawScenes.map((scene, index) => {
    const startSec = clamp(scene?.startSec, 0, durationSec);
    const endSec = clamp(scene?.endSec, startSec + 0.05, durationSec, Math.min(durationSec, startSec + 2));
    return { ...scene, id: String(scene?.id || `vision-scene-${index + 1}`).slice(0, 120), startSec, endSec, sourceStartSec: clamp(scene?.sourceStartSec, 0, durationSec, startSec), sourceEndSec: clamp(scene?.sourceEndSec, 0, durationSec, endSec), order: index, speechAnchors: Array.isArray(scene?.speechAnchors) ? scene.speechAnchors.map((value: unknown) => exactScriptText(value, script)).filter(Boolean).slice(0, 8) : [] };
  }).filter((scene) => scene.endSec > scene.startSec).sort((a, b) => a.startSec - b.startSec);

  const placements = partials.flatMap((partial) => Array.isArray(partial.captionPlacements) ? partial.captionPlacements : []) as any[];
  const captionGroups = new Map<number, CaptionWord[]>();
  (transcript.words as CaptionWord[]).forEach((word) => captionGroups.set(word.captionIndex || 0, [...(captionGroups.get(word.captionIndex || 0) || []), word]));
  const captions: MotionLayer[] = [...captionGroups.entries()].map(([index, words]) => {
    const placement = placements.find((item) => Number(item?.startSec) <= words[0].start && Number(item?.endSec) >= words[0].start) || {};
    const side = ['top', 'left', 'right', 'bottom'].includes(String(placement.placement)) ? String(placement.placement) : 'bottom';
    return { id: `caption-${index}`, kind: 'captions', label: `Caption ${index + 1}`, startSec: words[0].start, endSec: Math.min(durationSec, words[words.length - 1].end + 0.18), visible: true, x: clamp(placement.x, 0.04, 0.8, side === 'left' ? 0.06 : side === 'right' ? 0.56 : 0.12), y: clamp(placement.y, 0.04, 0.88, side === 'top' ? 0.08 : 0.76), width: 0.76, height: 0.16, text: words.map((word) => word.word).join(' '), style: { maxCharsPerLine: 42, maxLines: 2, placement: side, avoidFaces: true, emphasisWords: words.filter((word) => word.emphasis).map((word) => word.word) }, animation: { type: 'active-word', timing: 'word' } };
  });

  const rawLayers = partials.flatMap((partial) => Array.isArray(partial.graphicLayers) ? partial.graphicLayers : []) as any[];
  const graphics: MotionLayer[] = [];
  rawLayers.sort((a, b) => Number(a?.startSec) - Number(b?.startSec)).forEach((layer, index) => {
    const startSec = clamp(layer?.startSec, 0, durationSec);
    const endSec = clamp(layer?.endSec, startSec + 0.1, durationSec, Math.min(durationSec, startSec + 2));
    if (graphics.length >= Math.floor(durationSec / 3) + 2) return;
    if (graphics.some((entry) => startSec < Number(entry.endSec) - 0.2 && endSec > Number(entry.startSec) + 0.2)) return;
    const text = exactScriptText(layer?.text, script);
    if (layer?.text && !text) return;
    graphics.push({ ...layer, id: String(layer?.id || `vision-graphic-${index + 1}`).slice(0, 120), kind: String(layer?.kind || 'overlay'), label: String(layer?.label || layer?.kind || 'Vision graphic').slice(0, 120), startSec, endSec, x: clamp(layer?.x, 0, 0.9, 0.1), y: clamp(layer?.y, 0, 0.9, 0.1), width: clamp(layer?.width, 0.05, 1, 0.35), height: clamp(layer?.height, 0.04, 1, 0.18), text, visible: true, style: { ...(layer?.style || {}), brandSafe: true, avoidFaces: true }, animation: layer?.animation || { type: 'scene-reveal' } });
  });
  const ducking = partials.flatMap((partial) => Array.isArray(partial.musicDucking) ? partial.musicDucking : []).map((entry: any) => ({ startSec: clamp(entry?.startSec, 0, durationSec), endSec: clamp(entry?.endSec, 0, durationSec), gainDb: clamp(entry?.gainDb, -30, 0, -18), reason: String(entry?.reason || 'speech').slice(0, 120) }));
  const notes = partials.flatMap((partial) => Array.isArray(partial.notes) ? partial.notes : []).map(String).filter(Boolean).slice(0, 8);
  const safeScenes = scenes.length ? scenes : deterministicProposal(project, transcript, durationSec).timeline.scenes || [];
  return {
    modelUsed, frameCount, notes: notes.length ? notes : ['Vision pass used the full sampled film and kept the edit restrained.', 'Caption wording remains locked to the known script.'],
    timeline: { version: 1, scenes: safeScenes, tracks: [{ id: 'avatar', kind: 'video', sourceId: 'sceneforge-avatar', locked: true }, { id: 'graphics', kind: 'motion' }, { id: 'captions', kind: 'captions' }, { id: 'music', kind: 'audio', automation: ducking }], editDecisionList: safeScenes, musicDucking: ducking },
    graphicLayers: [...captions, ...graphics], transcript,
    globalArtDirection: { version: 1, concept: 'Frame-aware script-led edit', palette: project.studio_config.brand?.colors || {}, typography: { heading: 'Manrope', body: 'Inter' }, motionLanguage: 'Subject-aware camera emphasis, kinetic text and callouts grounded in visible content and spoken timing.', safeAreas: { captions: 0.18, faceAvoidance: true, keySubjectAvoidance: true }, locked: false },
  };
}

export async function createVisionEdit(project: ForgeProject, transcript: MotionTranscript, preferredModel: VisionEditorModel, onProgress?: (message: string) => void): Promise<VisionEditProposal> {
  const videoUrl = project.heygen_video_url || project.heygen_chunks.find((chunk) => chunk.video_url)?.video_url || '';
  const durationSec = Math.max(1, Number(project.avatar_duration_sec || project.estimated_duration_sec) || Math.max(...transcript.words.map((word) => word.end), 1));
  if (!videoUrl) return deterministicProposal(project, transcript, durationSec, 'The avatar master is unavailable for frame analysis.');
  try {
    const timestamps = sceneBoundaries(project, durationSec);
    onProgress?.(`Extracting ${timestamps.length} timestamped frames…`);
    const frames = await sampleVideoFrames(videoUrl, timestamps, (done, total) => onProgress?.(`Preparing vision frames ${done}/${total}…`));
    if (!frames.length) throw new Error('No vision frames were extracted.');
    const groups = batches(frames);
    const partials: PartialPlan[] = [];
    const models: VisionEditorModel[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const prompt = promptForBatch(project, transcript, groups[index], index, groups.length, durationSec);
      onProgress?.(`Directing frame batch ${index + 1}/${groups.length} with ${isForgeOpusModel(preferredModel) ? FORGE_OPUS_LABEL : 'GPT 6.1 Sol'}…`);
      if (isForgeOpusModel(preferredModel)) {
        try { partials.push(await callOpus(prompt, groups[index])); models.push(FORGE_OPUS_MODEL); }
        catch { partials.push(await callGpt(prompt, groups[index])); models.push('gpt-6.1-sol'); }
      } else {
        partials.push(await callGpt(prompt, groups[index])); models.push('gpt-6.1-sol');
      }
    }
    const modelUsed = new Set(models).size > 1 ? 'mixed' : models[0];
    return mergePlans(project, transcript, partials, durationSec, modelUsed, frames.length);
  } catch (error: any) {
    return deterministicProposal(project, transcript, durationSec, String(error?.message || error || 'Vision planning failed.'));
  }
}
