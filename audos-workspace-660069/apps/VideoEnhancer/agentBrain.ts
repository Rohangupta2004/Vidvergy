import { claudeText, CLAUDE_OPUS } from '../../lib/aiModels';
import { visionQA, type VisionQAResult } from '../../lib/visionQA';
import { askModel, planNaturalLanguageEdit } from './studioAgent';
import {
  CAPTION_STYLE_IDS, applyEditorOperations, editorDuration, editorSource, validateEditorOperations,
  type EditorOperation, type EditorProject, type EditorWord,
} from './modernEditorModel';
import { MUSIC_BEDS } from './nleCore';
import { WORKSPACE_UUID } from './enhancerCore';
import { workspaceFetch } from '../../lib/workspace';

export type AgentModel = 'Claude Opus 5' | 'GPT 6.1 Sol' | 'Deterministic';
export interface VisionNote {
  t: number;
  faces: { x: number; y: number; w: number; h: number }[];
  subject?: { x: number; y: number; w: number; h: number };
  text?: string;
  shot?: 'close' | 'medium' | 'wide' | 'screen';
  sceneChange?: boolean;
  tooDark?: boolean;
  blurry?: boolean;
  brollMoment?: boolean;
}
export interface BrainStep { id: 'listen' | 'watch' | 'plan' | 'check'; label: string; status: 'running' | 'done' | 'skipped' | 'failed' }
export interface AgentPlan {
  summary: string;
  question?: string;
  operations: EditorOperation[];
  model: AgentModel;
  steps: BrainStep[];
  transcript: EditorWord[];
  vision: VisionNote[];
}
export interface RunAgentOptions {
  project: EditorProject;
  instruction: string;
  mode: 'manual' | 'auto';
  creditCap: number;
  sourceFile?: Blob;
  onStep?: (step: BrainStep) => void;
  forceFailure?: 'opus' | 'all';
}

const transcriptCache = new Map<string, EditorWord[]>();
const visionCache = new Map<string, VisionNote[]>();
const fillerPattern = /^(um+|uh+|erm+|hmm+|basically|actually|literally)$/i;
const cleanJson = (value: string) => JSON.parse(String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
const token = () => String((window as any).__workspaceDb?.token || '');
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Planning timed out.')), ms);
    work.then((value) => { window.clearTimeout(timer); resolve(value); }, (error) => { window.clearTimeout(timer); reject(error); });
  });
}

async function hashSource(project: EditorProject, blob?: Blob): Promise<string> {
  const source = editorSource(project);
  if (source?.hash) return source.hash;
  if (blob?.arrayBuffer && crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  return `${source?.url || 'empty'}:${source?.duration || 0}`;
}

async function sourceBlob(project: EditorProject, supplied?: Blob): Promise<Blob> {
  if (supplied?.size) return supplied;
  const source = editorSource(project);
  if (!source?.url) throw new Error('Add source footage before running the agent.');
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Could not read source footage (HTTP ${response.status}).`);
  return response.blob();
}

export async function listenToVideo(project: EditorProject, supplied?: Blob): Promise<EditorWord[]> {
  const key = await hashSource(project, supplied);
  const cached = transcriptCache.get(key);
  if (cached) return cached.map((word) => ({ ...word }));
  const media = await sourceBlob(project, supplied);
  const form = new FormData();
  form.append('audio', media, editorSource(project)?.name || 'source.mp4');
  const response = await workspaceFetch(`/api/workspaces/${WORKSPACE_UUID}/audio/transcribe-timestamped`, {
    method: 'POST', body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(String(payload?.error?.message || payload?.error || 'Deepgram transcription failed.'));
  const words: EditorWord[] = (Array.isArray(payload.words) ? payload.words : []).map((word: any, index: number) => ({
    id: `w_${index}_${Math.round((Number(word.start) || 0) * 1000)}`,
    text: String(word.word || word.punctuated_word || '').trim(), start: Math.max(0, Number(word.start) || 0),
    end: Math.max(Number(word.start) || 0, Number(word.end) || 0), confidence: Number(word.confidence) || 0,
    speaker: Number.isFinite(Number(word.speaker)) ? Number(word.speaker) : null,
    filler: fillerPattern.test(String(word.word || '')), removed: false, role: 'normal',
  })).filter((word: EditorWord) => word.text && word.end >= word.start);
  if (!words.length) throw new Error('Deepgram returned no timed words. Captions are off, but the visual plan can still run.');
  transcriptCache.set(key, words);
  return words.map((word) => ({ ...word }));
}

async function captureContactSheets(url: string, duration: number): Promise<{ image: string; times: number[] }[]> {
  if (!url || typeof document === 'undefined') return [];
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto';
  await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Source frames could not be decoded.')); video.src = url; });
  const times = Array.from({ length: Math.min(24, Math.max(1, Math.ceil(duration / 2))) }, (_, index) => Math.min(duration - .05, index * 2 + .1)).filter((value) => value >= 0);
  const frame = document.createElement('canvas'); frame.width = 384; frame.height = 216;
  const frameContext = frame.getContext('2d');
  if (!frameContext) return [];
  const seek = (at: number) => new Promise<void>((resolve) => { const guard = window.setTimeout(resolve, 3000); video.onseeked = () => { window.clearTimeout(guard); resolve(); }; video.currentTime = at; });
  const shots: { image: string; times: number[] }[] = [];
  for (let page = 0; page < times.length; page += 12) {
    const batch = times.slice(page, page + 12);
    const sheet = document.createElement('canvas'); sheet.width = 1152; sheet.height = 864;
    const context = sheet.getContext('2d');
    if (!context) continue;
    context.fillStyle = '#000'; context.fillRect(0, 0, sheet.width, sheet.height);
    for (let index = 0; index < batch.length; index += 1) {
      await seek(batch[index]);
      frameContext.drawImage(video, 0, 0, frame.width, frame.height);
      const x = (index % 3) * 384; const y = Math.floor(index / 3) * 216;
      context.drawImage(frame, x, y);
      context.fillStyle = 'rgba(0,0,0,.72)'; context.fillRect(x + 8, y + 8, 72, 24);
      context.fillStyle = '#FFF'; context.font = '500 16px ui-monospace'; context.fillText(`${batch[index].toFixed(1)}s`, x + 14, y + 26);
    }
    shots.push({ image: sheet.toDataURL('image/jpeg', .78), times: batch });
  }
  video.removeAttribute('src'); video.load();
  return shots;
}

async function askVision(dataUrl: string, prompt: string): Promise<string> {
  const [meta, image] = dataUrl.split(',');
  const response = await workspaceFetch('/api/generate/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Id': String((window as any).__APP_ID__ || (window as any).__SPACE_ID__ || '') },
    body: JSON.stringify({ image, mimeType: /data:([^;]+)/.exec(meta || '')?.[1] || 'image/jpeg', prompt }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) throw new Error(String(payload?.error || 'Gemini vision was unavailable.'));
  return String(payload?.result || payload?.text || '');
}

export async function watchVideo(project: EditorProject): Promise<VisionNote[]> {
  const source = editorSource(project);
  if (!source?.url) return [];
  const key = await hashSource(project);
  const cached = visionCache.get(key);
  if (cached) return cached.map((note) => ({ ...note, faces: [...note.faces] }));
  const sheets = await captureContactSheets(source.preview || source.url, source.duration || editorDuration(project));
  const notes: VisionNote[] = [];
  for (const sheet of sheets) {
    const answer = await askVision(sheet.image, `This is a 3x4 contact sheet with timestamps burned into each tile. Return JSON only: {"frames":[{"t":number,"faces":[{"x":0-1,"y":0-1,"w":0-1,"h":0-1}],"subject":{"x":0-1,"y":0-1,"w":0-1,"h":0-1},"text":"","shot":"close|medium|wide|screen","sceneChange":boolean,"tooDark":boolean,"blurry":boolean,"brollMoment":boolean}]}. Return one entry for each of these timestamps: ${sheet.times.join(', ')}.`);
    const parsed = cleanJson(answer);
    (Array.isArray(parsed.frames) ? parsed.frames : []).forEach((frame: any) => notes.push({
      t: Math.max(0, Number(frame.t) || 0), faces: Array.isArray(frame.faces) ? frame.faces.slice(0, 8) : [],
      subject: frame.subject, text: String(frame.text || ''), shot: frame.shot, sceneChange: frame.sceneChange === true,
      tooDark: frame.tooDark === true, blurry: frame.blurry === true, brollMoment: frame.brollMoment === true,
    }));
  }
  visionCache.set(key, notes);
  return notes;
}

function nearestWordBoundary(value: number, words: EditorWord[], duration: number): number {
  const points = words.flatMap((word) => [word.start, word.end]).filter((point) => point >= 0 && point <= duration);
  if (!points.length) return Math.max(0, Math.min(duration, value));
  return points.reduce((best, point) => Math.abs(point - value) < Math.abs(best - value) ? point : best, points[0]);
}

function sanitizeOperations(value: unknown, project: EditorProject, words: EditorWord[], creditCap: number): EditorOperation[] {
  const duration = editorDuration(project);
  let spent = 0;
  return validateEditorOperations(value).flatMap((operation) => {
    const next = { ...operation };
    if (!project.caption.enabled && ['add_captions', 'set_caption_behind'].includes(next.type)) return [];
    if (!project.silence.enabled && next.type === 'remove_silences') return [];
    if (typeof next.start === 'number') next.start = Math.max(0, Math.min(duration, next.type === 'cut' ? nearestWordBoundary(next.start, words, duration) : next.start));
    if (typeof next.end === 'number') next.end = Math.max(Number(next.start) || 0, Math.min(duration, next.type === 'cut' ? nearestWordBoundary(next.end, words, duration) : next.end));
    if (next.type === 'add_broll') {
      const cost = Math.max(0, Number(next.credits) || 0);
      if (spent + cost > creditCap) return [];
      spent += cost;
    }
    return [next];
  });
}

function deterministicPlan(project: EditorProject): EditorOperation[] {
  const operations: EditorOperation[] = [];
  if (project.words.some((word) => word.filler && !word.removed)) operations.push({ type: 'remove_fillers', why: 'Removed filler words from timed transcript', t: 0 });
  const live = project.words.filter((word) => !word.removed);
  if (project.silence.enabled && live.some((word, index) => index > 0 && word.start - live[index - 1].end >= .6)) operations.push({ type: 'remove_silences', why: 'Closed measured pauses longer than 0.6s', t: 0 });
  if (project.caption.enabled && project.words.length && !project.items.some((item) => item.track === 'caption')) operations.push({ type: 'add_captions', why: 'Added word-timed captions', t: 0 });
  return operations;
}

async function planWithOpus(options: RunAgentOptions, words: EditorWord[], vision: VisionNote[]): Promise<{ summary: string; question?: string; operations: EditorOperation[] }> {
  if (options.forceFailure === 'opus' || options.forceFailure === 'all') throw new Error('Forced Opus failure.');
  const system = 'You are the planning brain of a professional video editor. Return JSON only. Never invent a timecode, cover a face with text, or exceed the credit cap. Prefer free stock B-roll. Every operation needs why and t.';
  const user = JSON.stringify({
    instruction: options.instruction, mode: options.mode, creditCap: options.creditCap,
    duration: editorDuration(options.project), transcriptWords: words.map(({ id, text, start, end, filler, role }) => ({ id, text, start, end, filler, role })),
    vision, project: { aspect: options.project.aspect, caption: options.project.caption, items: options.project.items.map(({ id, track, name, start, duration, transition }) => ({ id, track, name, start, duration, transition })) },
    allowedOperations: ['cut', 'remove_silences', 'remove_fillers', 'add_broll', 'add_text', 'add_captions', 'set_style', 'set_word_role', 'set_caption_behind', 'add_transition', 'add_sfx', 'add_voiceover', 'add_effect', 'add_music'],
    captionStyles: CAPTION_STYLE_IDS,
    shape: { summary: 'string', question: null, operations: [{ type: 'string', why: 'string', t: 0 }] },
  });
  const raw = await withTimeout(claudeText({ task: 'planning', system, user, maxTokens: 16000 }), 45000);
  const parsed = cleanJson(raw);
  return { summary: String(parsed.summary || 'Edit plan ready.'), question: parsed.question ? String(parsed.question) : undefined, operations: sanitizeOperations(parsed.operations, options.project, words, options.creditCap) };
}

async function planWithGpt(options: RunAgentOptions, words: EditorWord[], vision: VisionNote[]) {
  if (options.forceFailure === 'all') throw new Error('Forced GPT failure.');
  const raw = await withTimeout(askModel([
    { role: 'system', content: 'Plan a precise video edit. JSON only: {"summary":string,"question":null|string,"operations":[]}. Use only valid editor operations. Include why and t. Never invent timecodes. Prefer free stock B-roll.' },
    { role: 'user', content: JSON.stringify({ instruction: options.instruction, duration: editorDuration(options.project), creditCap: options.creditCap, words, vision, project: options.project, styles: CAPTION_STYLE_IDS }) },
  ]), 45000);
  const parsed = cleanJson(raw);
  return { summary: String(parsed.summary || 'Backup plan ready.'), question: parsed.question ? String(parsed.question) : undefined, operations: sanitizeOperations(parsed.operations, options.project, words, options.creditCap) };
}

export async function runAgentBrain(options: RunAgentOptions): Promise<AgentPlan> {
  const steps: BrainStep[] = [];
  const emit = (step: BrainStep) => { steps.push(step); options.onStep?.(step); };
  let words = options.project.words;
  if (options.project.caption.enabled) {
    emit({ id: 'listen', label: 'Listening to every word · Deepgram', status: 'running' });
    try { words = await listenToVideo(options.project, options.sourceFile); steps[steps.length - 1] = { id: 'listen', label: 'Listened to every word · Deepgram', status: 'done' }; options.onStep?.(steps[steps.length - 1]); }
    catch { steps[steps.length - 1] = { id: 'listen', label: 'Timed transcript unavailable · plan continues', status: 'failed' }; options.onStep?.(steps[steps.length - 1]); }
  } else {
    emit({ id: 'listen', label: 'Captions off · transcription not started', status: 'skipped' });
  }
  let vision: VisionNote[] = [];
  emit({ id: 'watch', label: 'Watching every shot · Gemini vision', status: 'running' });
  try { vision = await watchVideo(options.project); steps[steps.length - 1] = { id: 'watch', label: 'Watched every shot · Gemini vision', status: 'done' }; options.onStep?.(steps[steps.length - 1]); }
  catch { steps[steps.length - 1] = { id: 'watch', label: 'Vision notes skipped · plan still works', status: 'skipped' }; options.onStep?.(steps[steps.length - 1]); }
  emit({ id: 'plan', label: 'Planning edits · Claude Opus', status: 'running' });
  try {
    const plan = await planWithOpus(options, words, vision);
    steps[steps.length - 1] = { id: 'plan', label: `Planned ${plan.operations.length} edits · ${CLAUDE_OPUS === 'claude-opus-5' ? 'Claude Opus 5' : 'Claude Opus'}`, status: 'done' };
    options.onStep?.(steps[steps.length - 1]);
    return { ...plan, operations: plan.operations, model: 'Claude Opus 5', steps, transcript: words, vision };
  } catch {
    try {
      const plan = await planWithGpt(options, words, vision);
      steps[steps.length - 1] = { id: 'plan', label: `Planned ${plan.operations.length} edits · GPT 6.1 Sol`, status: 'done' };
      options.onStep?.(steps[steps.length - 1]);
      return { ...plan, operations: plan.operations, model: 'GPT 6.1 Sol', steps, transcript: words, vision };
    } catch {
      const natural = await planNaturalLanguageEdit(options.instruction, { ...options.project, words }).catch(() => null);
      const fallbackOperations = natural?.operations.length ? natural.operations : deterministicPlan({ ...options.project, words });
      const operations = sanitizeOperations(fallbackOperations, options.project, words, options.creditCap);
      steps[steps.length - 1] = { id: 'plan', label: `Planned ${operations.length} measured edits · deterministic backup`, status: 'done' };
      options.onStep?.(steps[steps.length - 1]);
      return { summary: natural?.summary || 'Measured edit plan ready.', question: natural?.question, operations, model: 'Deterministic', steps, transcript: words, vision };
    }
  }
}

export function previewAgentOperations(project: EditorProject, operations: EditorOperation[]): EditorProject {
  return applyEditorOperations(project, operations, CAPTION_STYLE_IDS, [...MUSIC_BEDS]);
}

export async function checkAcceptedCut(project: EditorProject, videoUrl: string): Promise<VisionQAResult> {
  return visionQA({
    videoUrl, durationS: editorDuration(project), app: 'video-enhancer', engine: 'gemini-vision', contentType: 'edited-video', finalVideo: false,
    planText: 'Check exactly once: caption over a face, caption outside top 11% or bottom 19%, unreadable contrast, black/frozen frame, off-topic B-roll, or awkward jump. Safe fixes may move a caption, choose the next B-roll candidate, or nudge a cut by at most 0.2 seconds.',
  });
}
