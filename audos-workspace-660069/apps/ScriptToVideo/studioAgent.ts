/**
 * Script-to-Video studio agent (Nov 2026 rebuild).
 *
 * Every text call here — idea → script, script improvement, scene planning,
 * per-scene video prompts and storyboard prompts — runs on Claude Opus 5.5
 * through the platform Anthropic proxy (adaptive thinking, medium effort).
 *
 * Planning never fails on length: `fitScenesToModel` deterministically splits
 * or re-times every scene so each clip fits the selected model, and the
 * per-scene prompt writer falls back to a deterministic prompt if a batch
 * call fails, so the review step always has a complete plan.
 */
import { getWorkspaceToken, workspaceTokenNow } from '../../lib/workspace';
import type { StudioModel } from './studioModels';
import { legalSeconds } from './studioModels';

export const STUDIO_TEXT_MODEL = 'claude-opus-5-5';
const ANTHROPIC_PROXY = '/proxy/anthropic/v1/messages';
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export class StudioAgentError extends Error {
  friendly: string;
  constructor(friendly: string, detail?: string) {
    super(detail || friendly);
    this.friendly = friendly;
  }
}

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function askOpus(system: string, user: string, maxTokens = 12000): Promise<string> {
  const token = workspaceTokenNow() || await getWorkspaceToken();
  if (!token) throw new StudioAgentError('Your session is still loading. Wait a moment and try again.');
  const payload = {
    model: STUDIO_TEXT_MODEL,
    max_tokens: Math.min(16000, Math.max(2000, Math.round(maxTokens))),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system,
    messages: [{ role: 'user', content: user }],
  };
  let lastDetail = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(ANTHROPIC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': workspaceTokenNow() || token },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const text = (Array.isArray(data.content) ? data.content : [])
          .filter((block: any) => block && block.type === 'text')
          .map((block: any) => String(block.text || ''))
          .join('')
          .trim();
        if (text) return text;
        lastDetail = data.stop_reason === 'max_tokens' ? 'The answer ran out of room.' : 'The AI returned an empty answer.';
      } else {
        lastDetail = String(data?.error?.message || data?.error || data?.code || `HTTP ${res.status}`);
        if (!RETRYABLE.has(res.status)) break;
      }
    } catch (error: any) {
      lastDetail = String(error?.message || error);
    }
    await sleep([1200, 3500, 8000][attempt]);
  }
  throw new StudioAgentError('The writing assistant is busy right now. Please try again in a moment.', lastDetail);
}

export function parseJsonLoose<T = any>(raw: string): T | null {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced ? fenced[1] : '', text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.search(/[[{]/);
    if (start < 0) continue;
    const open = candidate[start];
    const close = open === '{' ? '}' : ']';
    const end = candidate.lastIndexOf(close);
    if (end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)) as T; } catch { /* try next */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Script writing
// ---------------------------------------------------------------------------

export interface ScriptBrief {
  aspect: string;
  targetSeconds: number;
  tone?: string;
  audience?: string;
  model: StudioModel;
  characterNotes?: string;
}

function briefLines(brief: ScriptBrief): string {
  return [
    `Target length: about ${brief.targetSeconds} seconds of finished video.`,
    `Frame: ${brief.aspect}.`,
    brief.tone ? `Tone: ${brief.tone}.` : '',
    brief.audience ? `Audience: ${brief.audience}.` : '',
    `Video model: ${brief.model.label} — clips of at most ${brief.model.maxSeconds}s, ${brief.model.audio ? 'renders spoken dialogue and sound' : 'renders silent video (voice is added later as narration)'}.`,
    brief.characterNotes ? `Saved characters the user referenced with @: ${brief.characterNotes}` : '',
  ].filter(Boolean).join('\n');
}

const SCRIPT_FORMAT = `Write the script as plain text in this exact shape, one block per scene:

SCENE 1 — <short title> (<seconds>s)
VISUAL: <what we see, in rich concrete detail: subject, wardrobe, setting, lighting, camera framing and movement>
DIALOGUE:
<SPEAKER>: <exact spoken line>
NARRATION: <voice-over line, or "none">
ON-SCREEN TEXT: <exact text, or "none">

Keep any @name mentions exactly as written (for example @maya) — they refer to saved characters.`;

export async function ideaToScript(idea: string, brief: ScriptBrief): Promise<string> {
  const system = `You are an award-winning screenwriter and commercial director. You turn a short idea into a complete, ultra-detailed, production-ready short video script. Every scene must be filmable by an AI video model: concrete subjects, wardrobe, locations, lighting, camera language and performance, with natural dialogue or narration. Never add brands, facts or numbers the user did not give. ${SCRIPT_FORMAT}`;
  const user = `IDEA:\n${idea.trim()}\n\nBRIEF:\n${briefLines(brief)}\n\nReturn ONLY the script.`;
  return (await askOpus(system, user, 12000)).replace(/^```[a-z]*\s*|```$/gi, '').trim();
}

export async function improveScript(script: string, brief: ScriptBrief): Promise<string> {
  const system = `You are a senior script editor for AI-generated video. Improve the user's script so it films beautifully, while keeping their intent, story, characters, facts, brand names, numbers and every spoken line's meaning the same. Sharpen visuals (subject, wardrobe, setting, lighting, lens, camera movement), tighten pacing for the target length, make each scene a clear filmable beat, and keep dialogue natural. Do not invent new plot points, products, claims or characters. ${SCRIPT_FORMAT}`;
  const user = `ORIGINAL SCRIPT:\n${script.trim()}\n\nBRIEF:\n${briefLines(brief)}\n\nReturn ONLY the improved script.`;
  return (await askOpus(system, user, 12000)).replace(/^```[a-z]*\s*|```$/gi, '').trim();
}

// ---------------------------------------------------------------------------
// Scene planning
// ---------------------------------------------------------------------------

export interface StudioDialogueLine { speaker: string; line: string; delivery?: string }

export interface StudioPromptFields {
  subject: string;
  wardrobe: string;
  setting: string;
  lighting: string;
  lens: string;
  camera_movement: string;
  motion: string;
  dialogue: string;
  sound: string;
  continuity: string;
}

export interface StudioCharacter {
  id: string;
  name: string;
  appearance: string;
  wardrobe: string;
  voice?: string;
  /** Saved @reference slug this character maps to, when one exists. */
  mention?: string;
  /** Reference image used to keep this character's look consistent. */
  imageUrl?: string;
}

export interface StudioReference { url: string; label: string }

export interface StudioScene {
  key: string;
  title: string;
  duration_s: number;
  summary: string;
  script_segment: string;
  cut_type: 'continuous' | 'new_shot';
  characters: string[];
  dialogue: StudioDialogueLine[];
  narration: string;
  on_screen_text: string[];
  camera: string;
  prompt_fields: StudioPromptFields | null;
  /** The full prompt sent to the video model (editable). */
  prompt: string;
  references: StudioReference[];
  storyboard_url?: string;
  storyboard_status?: 'idle' | 'loading' | 'ready' | 'error';
  part?: { index: number; of: number };
  notes?: string[];
}

export interface StudioPlan {
  title: string;
  logline: string;
  visual_style: string;
  world: string;
  characters: StudioCharacter[];
  scenes: StudioScene[];
  model_id: string;
  planned_at: string;
  notes: string[];
  /** Script version this plan was built from. */
  script_version_id?: string;
}

function newKey(): string {
  return `sc_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function str(value: unknown, max = 4000): string {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function slugId(value: string, fallback: string): string {
  const slug = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return slug || fallback;
}

/** Spoken words take about 2.6 words per second. */
export function speechSeconds(scene: Pick<StudioScene, 'dialogue' | 'narration'>): number {
  const words = [...scene.dialogue.map((d) => d.line), scene.narration].join(' ').split(/\s+/).filter(Boolean).length;
  return words ? Math.ceil(words / 2.6) : 0;
}

/** Merge two neighbouring scenes into one clip that plays them as timed beats. */
function mergeScenes(a: StudioScene, b: StudioScene): StudioScene {
  const total = a.duration_s + b.duration_s;
  const beat = (scene: StudioScene) => scene.summary || scene.title;
  return {
    ...a,
    title: `${a.title} + ${b.title}`,
    duration_s: total,
    summary: `0–${a.duration_s}s: ${beat(a)} Then ${a.duration_s}–${total}s: ${beat(b)}`,
    script_segment: [a.script_segment, b.script_segment].filter(Boolean).join('\n'),
    characters: Array.from(new Set([...a.characters, ...b.characters])),
    dialogue: [...a.dialogue, ...b.dialogue],
    narration: [a.narration, b.narration].filter(Boolean).join(' '),
    on_screen_text: [...a.on_screen_text, ...b.on_screen_text],
    camera: [a.camera, b.camera].filter(Boolean).join('; then '),
    references: [...a.references, ...b.references].filter((ref, i, list) => list.findIndex((other) => other.url === ref.url) === i),
    prompt_fields: null,
    prompt: '',
    storyboard_url: undefined,
    storyboard_status: 'idle',
    part: undefined,
  };
}

/** Full-length clips first; only the last clip carries the remainder. */
function splitLengths(wanted: number, model: StudioModel): number[] {
  const parts = Math.ceil(wanted / model.maxSeconds);
  const lengths = Array.from({ length: parts }, (_, k) => (k < parts - 1 ? model.maxSeconds : wanted - model.maxSeconds * (parts - 1)));
  return lengths.map((seconds) => legalSeconds(model, Math.max(model.minSeconds, seconds)));
}

/**
 * Fit every scene to the model using as FEW clips as possible, each as close
 * to the model's maximum clip length as the content allows. This never throws:
 * a scene longer than one clip becomes full-length parts plus one remainder,
 * and neighbouring short scenes are merged into one clip (played as timed
 * beats) whenever they fit together, so an 8s model never renders two 4s clips
 * where one 8s clip would do.
 */
export function fitScenesToModel(scenes: StudioScene[], model: StudioModel): { scenes: StudioScene[]; notes: string[] } {
  const split: StudioScene[] = [];
  const notes: string[] = [];
  scenes.forEach((scene, sceneIndex) => {
    const wanted = Math.max(model.minSeconds, Math.round(Number(scene.duration_s) || model.maxSeconds), Math.min(speechSeconds(scene), model.maxSeconds * 6));
    if (wanted <= model.maxSeconds) {
      split.push({ ...scene, duration_s: wanted });
      return;
    }
    const lengths = splitLengths(wanted, model);
    const lines = scene.dialogue.slice();
    const perPart = Math.ceil(lines.length / lengths.length);
    notes.push(`Scene ${sceneIndex + 1} (${wanted}s) became ${lengths.length} clips (${lengths.join('s + ')}s) for ${model.label}.`);
    lengths.forEach((seconds, k) => {
      split.push({
        ...scene,
        key: k === 0 ? scene.key : newKey(),
        title: `${scene.title} (${k + 1}/${lengths.length})`,
        duration_s: seconds,
        cut_type: k === 0 ? scene.cut_type : 'continuous',
        dialogue: lines.slice(k * perPart, (k + 1) * perPart),
        narration: k === 0 ? scene.narration : '',
        on_screen_text: k === 0 ? scene.on_screen_text : [],
        prompt_fields: null,
        prompt: '',
        storyboard_url: undefined,
        storyboard_status: 'idle',
        part: { index: k + 1, of: lengths.length },
      });
    });
  });
  const packed: StudioScene[] = [];
  let merges = 0;
  split.forEach((scene) => {
    const last = packed[packed.length - 1];
    if (last && last.duration_s + scene.duration_s <= model.maxSeconds) {
      const merged = mergeScenes(last, scene);
      if (speechSeconds(merged) <= model.maxSeconds) {
        packed[packed.length - 1] = merged;
        merges += 1;
        return;
      }
    }
    packed.push(scene);
  });
  if (merges) notes.push(`${merges} short scene${merges === 1 ? ' was' : 's were'} combined so each clip uses up to the full ${model.maxSeconds}s ${model.label} allows — fewer clips, faster renders.`);
  const fitted = packed.map((scene) => ({ ...scene, duration_s: legalSeconds(model, scene.duration_s) }));
  return { scenes: fitted, notes };
}

export function composePrompt(fields: StudioPromptFields | null, scene: StudioScene, plan: Pick<StudioPlan, 'visual_style' | 'world'>, model: StudioModel): string {
  const f = fields || fallbackFields(scene, plan, model);
  const lines = [
    `SUBJECT & ACTION: ${f.subject}`,
    `WARDROBE: ${f.wardrobe}`,
    `SETTING: ${f.setting}`,
    `LIGHTING: ${f.lighting}`,
    `LENS: ${f.lens}`,
    `CAMERA MOVEMENT: ${f.camera_movement}`,
    `MOTION & PERFORMANCE: ${f.motion}`,
    `DIALOGUE: ${model.audio ? f.dialogue : 'None spoken on camera — this model renders silent video; convey emotion through performance.'}`,
    `SOUND: ${model.audio ? f.sound : 'Silent clip (audio is added in post).'}`,
    `CONTINUITY: ${f.continuity}`,
    plan.visual_style ? `STYLE: ${plan.visual_style}` : '',
    'No on-screen text, captions, logos or watermarks.',
  ];
  return lines.filter(Boolean).join('\n');
}

function fallbackFields(scene: StudioScene, plan: Pick<StudioPlan, 'visual_style' | 'world'>, model: StudioModel): StudioPromptFields {
  const spoken = scene.dialogue.map((d) => `${d.speaker}${d.delivery ? ` (${d.delivery})` : ''}: "${d.line}"`).join(' ');
  return {
    subject: scene.summary || scene.script_segment || scene.title,
    wardrobe: 'Consistent with the character references and earlier scenes.',
    setting: plan.world || 'As described in the script.',
    lighting: 'Motivated, cinematic lighting that matches the mood of the scene.',
    lens: '35mm cinematic lens, shallow depth of field.',
    camera_movement: scene.camera || 'Slow, steady push-in.',
    motion: 'Natural, believable movement for the full clip.',
    dialogue: model.audio && spoken ? spoken : 'None.',
    sound: model.audio ? 'Natural ambient sound for the location.' : 'Silent.',
    continuity: scene.part && scene.part.index > 1 ? 'Direct continuation of the previous clip: same characters, wardrobe, location, lighting and camera direction.' : 'Keep characters, wardrobe and look consistent with the rest of the film.',
  };
}

function normalizeFields(raw: any): StudioPromptFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const fields: StudioPromptFields = {
    subject: str(raw.subject, 1200),
    wardrobe: str(raw.wardrobe, 600),
    setting: str(raw.setting, 800),
    lighting: str(raw.lighting, 500),
    lens: str(raw.lens, 300),
    camera_movement: str(raw.camera_movement || raw.camera, 500),
    motion: str(raw.motion, 700),
    dialogue: str(raw.dialogue, 1200) || 'None.',
    sound: str(raw.sound, 500) || 'Natural ambient sound.',
    continuity: str(raw.continuity, 600),
  };
  return fields.subject ? fields : null;
}

function normalizeScene(raw: any, index: number): StudioScene {
  const dialogue = (Array.isArray(raw?.dialogue) ? raw.dialogue : [])
    .map((d: any) => ({ speaker: str(d?.speaker, 60) || 'Narrator', line: str(d?.line, 600), delivery: str(d?.delivery, 120) }))
    .filter((d: StudioDialogueLine) => d.line);
  return {
    key: newKey(),
    title: str(raw?.title, 120) || `Scene ${index + 1}`,
    duration_s: Math.max(1, Math.round(Number(raw?.duration_s) || 6)),
    summary: str(raw?.summary, 600),
    script_segment: str(raw?.script_segment, 2000),
    cut_type: raw?.cut_type === 'continuous' ? 'continuous' : 'new_shot',
    characters: (Array.isArray(raw?.characters) ? raw.characters : []).map((c: unknown) => str(c, 40)).filter(Boolean),
    dialogue,
    narration: str(raw?.narration, 800).replace(/^none$/i, ''),
    on_screen_text: (Array.isArray(raw?.on_screen_text) ? raw.on_screen_text : []).map((t: unknown) => str(t, 200)).filter((t: string) => t && !/^none$/i.test(t)),
    camera: str(raw?.camera, 300),
    prompt_fields: null,
    prompt: '',
    references: [],
    storyboard_status: 'idle',
  };
}

/** Break a script into a fallback plan without AI, one scene per SCENE block or paragraph. */
export function deterministicBreakdown(script: string): { scenes: StudioScene[] } {
  const blocks = script.split(/\n(?=\s*SCENE\s+\d+)/i).map((b) => b.trim()).filter(Boolean);
  const chunks = blocks.length > 1 ? blocks : script.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const scenes = (chunks.length ? chunks : [script]).map((chunk, i) => {
    const title = (chunk.match(/SCENE\s+\d+\s*[—-]\s*([^\n(]+)/i)?.[1] || '').trim();
    const visual = (chunk.match(/VISUAL:\s*([^\n]+)/i)?.[1] || chunk.split('\n')[0] || '').trim();
    const dialogue: StudioDialogueLine[] = [];
    chunk.split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z@][A-Za-z0-9 @_-]{0,30}):\s*(.+)$/);
      if (m && !/^(VISUAL|DIALOGUE|NARRATION|ON-SCREEN TEXT|SCENE)/i.test(m[1])) dialogue.push({ speaker: m[1].trim(), line: m[2].trim() });
    });
    const seconds = Number(chunk.match(/\((\d{1,3})\s*s\)/i)?.[1]) || 6;
    return normalizeScene({ title: title || `Scene ${i + 1}`, duration_s: seconds, summary: visual, script_segment: chunk, dialogue, cut_type: i === 0 ? 'new_shot' : 'continuous' }, i);
  });
  return { scenes };
}

export interface PlanOptions {
  aspect: string;
  targetSeconds: number;
  model: StudioModel;
  savedCharacters: StudioCharacter[];
  onProgress?: (label: string) => void;
}

const BREAKDOWN_SYSTEM = `You are the director and first assistant director of an AI video production. Read the WHOLE script, then break it into filmable scenes for an AI video model. Keep the story, order, intent and every spoken line word for word. Return ONLY JSON in this shape:
{
  "title": string,
  "logline": string,
  "visual_style": string (one rich paragraph: look, palette, lens language, film stock, grade, mood),
  "world": string (the shared setting/era/place),
  "characters": [{ "id": string (snake_case), "name": string, "appearance": string (face, hair, skin, build, age — very specific), "wardrobe": string, "voice": string, "mention": string (the @slug if the script used @name, else "") }],
  "scenes": [{ "title": string, "duration_s": number, "summary": string, "script_segment": string (the exact part of the script this covers), "cut_type": "new_shot" | "continuous", "characters": [character ids on screen], "dialogue": [{ "speaker": string, "line": string (exact words), "delivery": string }], "narration": string, "on_screen_text": [string], "camera": string }]
}`;

export async function breakdownScript(script: string, opts: PlanOptions): Promise<Omit<StudioPlan, 'model_id' | 'planned_at' | 'notes'>> {
  const saved = opts.savedCharacters.map((c) => `@${c.mention || c.id}: ${c.name}${c.appearance ? ` — ${c.appearance}` : ''}`).join('\n');
  const user = [
    `SCRIPT:\n${script.trim()}`,
    `TARGET LENGTH: about ${opts.targetSeconds}s. FRAME: ${opts.aspect}.`,
    `VIDEO MODEL: ${opts.model.label}. Each clip can be ${opts.model.minSeconds}–${opts.model.maxSeconds}s${opts.model.durations ? ` (allowed lengths: ${opts.model.durations.join(', ')}s)` : ''}. Make every scene as close as possible to the model's MAXIMUM clip length (${opts.model.maxSeconds}s): group consecutive beats into one scene (described as timed beats) instead of making short scenes — fewer, fuller clips render faster. A beat that truly needs longer than ${opts.model.maxSeconds}s keeps its real length (it will be split into full-length clips automatically).`,
    opts.model.audio ? 'This model renders spoken dialogue and sound, so keep on-camera dialogue in the scene.' : 'This model renders SILENT video; keep dialogue lines in the plan (they become narration/voice-over), but stage scenes so they read without lip sync.',
    saved ? `SAVED CHARACTERS (use their exact @slug in "mention" and keep their appearance):\n${saved}` : '',
  ].filter(Boolean).join('\n\n');
  const raw = await askOpus(BREAKDOWN_SYSTEM, user, 14000);
  const json = parseJsonLoose<any>(raw);
  if (!json || !Array.isArray(json.scenes) || !json.scenes.length) {
    throw new StudioAgentError('The planner could not read that script. Try again, or shorten it a little.', 'breakdown JSON missing');
  }
  const characters: StudioCharacter[] = (Array.isArray(json.characters) ? json.characters : []).map((c: any, i: number) => ({
    id: slugId(str(c?.id) || str(c?.name), `char_${i + 1}`),
    name: str(c?.name, 80) || `Character ${i + 1}`,
    appearance: str(c?.appearance, 800),
    wardrobe: str(c?.wardrobe, 400),
    voice: str(c?.voice, 200),
    mention: str(c?.mention, 40).replace(/^@/, '').toLowerCase(),
  }));
  return {
    title: str(json.title, 120) || 'Untitled film',
    logline: str(json.logline, 400),
    visual_style: str(json.visual_style, 1500),
    world: str(json.world, 800),
    characters,
    scenes: json.scenes.map((s: any, i: number) => normalizeScene(s, i)),
  };
}

const PROMPT_SYSTEM = `You are a world-class cinematographer writing prompts for an AI video model. For each scene you receive, write the MOST detailed possible video prompt as structured fields. Be concrete and visual: exact subject and action beat by beat, wardrobe (fabric, colour, fit), setting (place, props, time of day, weather), lighting (key/fill/practicals, colour temperature, contrast), lens (focal length, aperture, depth of field), camera movement (type, speed, direction, start and end framing), motion and performance (body language, micro-expressions, pacing over the clip), dialogue (speaker, exact words in quotes, delivery, lip-sync note), sound (ambience, foley, music cue), and continuity notes (what must match the previous and next clip: characters, wardrobe, props, screen direction, lighting). When a scene summary lists timed beats (for example \"0–4s: … Then 4–8s: …\"), describe every beat in order with its timing inside the one clip, including any cut between them. Never put on-screen text in the image. Keep characters' appearance exactly as described. Return ONLY JSON: { "scenes": [{ "index": number, "subject": string, "wardrobe": string, "setting": string, "lighting": string, "lens": string, "camera_movement": string, "motion": string, "dialogue": string, "sound": string, "continuity": string }] }`;

async function writePromptBatch(batch: Array<{ index: number; scene: StudioScene }>, plan: Omit<StudioPlan, 'model_id' | 'planned_at' | 'notes'>, all: StudioScene[], model: StudioModel, aspect: string): Promise<Map<number, StudioPromptFields>> {
  const cast = plan.characters.map((c) => `${c.id} = ${c.name}: ${c.appearance}; wardrobe: ${c.wardrobe}`).join('\n');
  const describe = batch.map(({ index, scene }) => {
    const prev = all[index - 1];
    const next = all[index + 1];
    return [
      `SCENE ${index}: ${scene.title} — ${scene.duration_s}s, ${scene.cut_type === 'continuous' ? 'continues directly from the previous clip' : 'new shot'}${scene.part ? ` (part ${scene.part.index} of ${scene.part.of})` : ''}`,
      `Summary: ${scene.summary}`,
      scene.script_segment ? `Script: ${scene.script_segment}` : '',
      `On screen: ${scene.characters.join(', ') || 'no named characters'}`,
      scene.dialogue.length ? `Dialogue: ${scene.dialogue.map((d) => `${d.speaker}: "${d.line}"${d.delivery ? ` (${d.delivery})` : ''}`).join(' | ')}` : 'Dialogue: none',
      scene.narration ? `Narration (voice-over, added in post): ${scene.narration}` : '',
      scene.camera ? `Camera idea: ${scene.camera}` : '',
      prev ? `Previous clip: ${prev.title} — ${prev.summary}` : 'This is the opening clip.',
      next ? `Next clip: ${next.title} — ${next.summary}` : 'This is the final clip.',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  const user = [
    `FILM: ${plan.title}. ${plan.logline}`,
    `VISUAL STYLE: ${plan.visual_style}`,
    `WORLD: ${plan.world}`,
    cast ? `CAST:\n${cast}` : 'CAST: none named',
    `MODEL: ${model.label}, frame ${aspect}. ${model.audio ? 'It renders dialogue and sound: include exact dialogue with delivery and lip-sync notes.' : 'It renders SILENT video: write "None" for dialogue and describe performance instead.'}`,
    describe,
  ].join('\n\n');
  const raw = await askOpus(PROMPT_SYSTEM, user, 14000);
  const json = parseJsonLoose<any>(raw);
  const out = new Map<number, StudioPromptFields>();
  (Array.isArray(json?.scenes) ? json.scenes : []).forEach((item: any) => {
    const fields = normalizeFields(item);
    if (fields && Number.isFinite(Number(item?.index))) out.set(Number(item.index), fields);
  });
  return out;
}

async function mapLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/** Attach saved @characters (with images) to the cast and to the scenes that mention them. */
export function linkSavedCharacters(plan: Omit<StudioPlan, 'model_id' | 'planned_at' | 'notes'>, saved: StudioCharacter[], script: string): void {
  const mentioned = new Set((script.match(/@([a-zA-Z][\w-]*)/g) || []).map((m) => m.slice(1).toLowerCase()));
  saved.forEach((ref) => {
    const slug = String(ref.mention || ref.id).toLowerCase();
    if (!mentioned.has(slug)) return;
    let cast = plan.characters.find((c) => c.mention === slug || c.id === slug || c.name.toLowerCase() === ref.name.toLowerCase());
    if (!cast) {
      cast = { id: slugId(slug, `char_${plan.characters.length + 1}`), name: ref.name, appearance: ref.appearance, wardrobe: ref.wardrobe, mention: slug };
      plan.characters.push(cast);
    }
    cast.mention = slug;
    cast.imageUrl = ref.imageUrl;
    if (!cast.appearance && ref.appearance) cast.appearance = ref.appearance;
    plan.scenes.forEach((scene) => {
      const text = `${scene.script_segment} ${scene.summary} ${scene.dialogue.map((d) => `${d.speaker} ${d.line}`).join(' ')}`.toLowerCase();
      if (text.includes(`@${slug}`) || text.includes(cast!.name.toLowerCase())) {
        if (!scene.characters.includes(cast!.id)) scene.characters.push(cast!.id);
      }
    });
  });
}

export async function planForModel(script: string, opts: PlanOptions): Promise<StudioPlan> {
  opts.onProgress?.('Reading the whole script…');
  let base: Omit<StudioPlan, 'model_id' | 'planned_at' | 'notes'>;
  const notes: string[] = [];
  try {
    base = await breakdownScript(script, opts);
  } catch (error) {
    base = { title: 'Untitled film', logline: '', visual_style: '', world: '', characters: [], scenes: deterministicBreakdown(script).scenes };
    notes.push('The AI planner was unavailable, so scenes were split directly from your script. You can regenerate the plan any time.');
  }
  linkSavedCharacters(base, opts.savedCharacters, script);
  opts.onProgress?.(`Fitting scenes to ${opts.model.label}…`);
  const fitted = fitScenesToModel(base.scenes, opts.model);
  base.scenes = fitted.scenes;
  notes.push(...fitted.notes);
  opts.onProgress?.('Writing detailed video prompts…');
  const batches: Array<Array<{ index: number; scene: StudioScene }>> = [];
  for (let i = 0; i < base.scenes.length; i += 5) batches.push(base.scenes.slice(i, i + 5).map((scene, k) => ({ index: i + k, scene })));
  const fields = new Map<number, StudioPromptFields>();
  let failedBatches = 0;
  await mapLimit(batches, 3, async (batch) => {
    try {
      const got = await writePromptBatch(batch, base, base.scenes, opts.model, opts.aspect);
      got.forEach((value, key) => fields.set(key, value));
    } catch {
      failedBatches += 1;
    }
  });
  if (failedBatches) notes.push('Some prompts were written from the scene notes because the assistant was busy. Use "Rewrite prompt" on any scene to retry.');
  base.scenes = base.scenes.map((scene, index) => {
    const promptFields = fields.get(index) || null;
    return { ...scene, prompt_fields: promptFields, prompt: composePrompt(promptFields, scene, base, opts.model) };
  });
  return { ...base, model_id: opts.model.id, planned_at: new Date().toISOString(), notes };
}

export async function rewriteScenePrompt(plan: StudioPlan, index: number, model: StudioModel, aspect: string): Promise<StudioScene> {
  const scene = plan.scenes[index];
  const got = await writePromptBatch([{ index, scene }], plan, plan.scenes, model, aspect);
  const promptFields = got.get(index) || null;
  if (!promptFields) throw new StudioAgentError('That prompt could not be rewritten. Please try again.');
  return { ...scene, prompt_fields: promptFields, prompt: composePrompt(promptFields, scene, plan, model) };
}

// ---------------------------------------------------------------------------
// Storyboard prompts
// ---------------------------------------------------------------------------

export async function writeStoryboardPrompts(plan: StudioPlan, aspect: string): Promise<string[]> {
  const system = 'You are a storyboard artist. For each scene write one still-image prompt that captures its key frame: subject, wardrobe, setting, lighting, lens and composition, in the film\'s visual style. No text, captions or logos in the image. Return ONLY JSON: { "frames": [string, ...] } with exactly one prompt per scene, in order.';
  const user = [
    `VISUAL STYLE: ${plan.visual_style}`,
    `CAST: ${plan.characters.map((c) => `${c.name}: ${c.appearance}; ${c.wardrobe}`).join(' | ') || 'none'}`,
    `FRAME: ${aspect}`,
    plan.scenes.map((s, i) => `${i + 1}. ${s.title}: ${s.prompt_fields?.subject || s.summary}`).join('\n'),
  ].join('\n\n');
  try {
    const json = parseJsonLoose<any>(await askOpus(system, user, 8000));
    const frames = Array.isArray(json?.frames) ? json.frames.map((f: unknown) => str(f, 1800)) : [];
    return plan.scenes.map((scene, i) => frames[i] || storyboardFallback(scene, plan));
  } catch {
    return plan.scenes.map((scene) => storyboardFallback(scene, plan));
  }
}

export function storyboardFallback(scene: StudioScene, plan: StudioPlan): string {
  const f = scene.prompt_fields;
  return [
    `Cinematic storyboard key frame. ${f?.subject || scene.summary || scene.title}.`,
    f?.wardrobe ? `Wardrobe: ${f.wardrobe}.` : '',
    f?.setting ? `Setting: ${f.setting}.` : '',
    f?.lighting ? `Lighting: ${f.lighting}.` : '',
    plan.visual_style ? `Style: ${plan.visual_style}.` : '',
    'No text, captions or logos.',
  ].filter(Boolean).join(' ');
}
