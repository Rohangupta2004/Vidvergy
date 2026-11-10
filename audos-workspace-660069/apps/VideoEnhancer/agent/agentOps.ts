/**
 * Enhancer Agent — the operation catalog.
 *
 * Every operation the planner may emit is defined here: its parameter rules,
 * label, engine and credit estimate. Planner output is untrusted, so
 * normalizeStep() clamps every value and drops anything unknown before the
 * runner ever sees it.
 */
import type { LookId } from '../enhance/enhanceModel';
import { OMNI_CREDITS_PER_SECOND, MAX_STEPS_PER_TURN } from './agentConfig';
import { planChunks } from './omniChunks';
import type { AgentPlan, Engine, OpType, PlannedStep } from './agentTypes';

export const LOOK_IDS: LookId[] = ['none', 'cinematic', 'warm', 'cool', 'vintage', 'bw'];
export const LUT_IDS = ['none', 'teal_orange', 'warm_retro', 'faded_film', 'mono'] as const;
export const LUT_EFFECT: Record<string, string> = { teal_orange: 'gradeTealOrange', warm_retro: 'gradeWarmRetro', faded_film: 'gradeFaded', mono: 'gradeBw' };
export const CAPTION_STYLES = ['minimal', 'bold', 'gradient', 'karaoke', 'tiktok', 'neon', 'cinematic', 'handwritten', 'creator', 'newsroom', 'comic', 'luxury', 'gaming', 'desi'] as const;
export const CAPTION_FONTS = ['inter', 'anton', 'bebas', 'montserrat', 'roboto', 'impact', 'oswald', 'playfair', 'caveat', 'mono'] as const;
export const CAPTION_POSITIONS = ['bottom', 'lower-third', 'middle', 'top'] as const;
export const ASPECTS = ['9:16', '1:1', '16:9', '4:5'] as const;
export const TEXT_POSITIONS = ['top', 'center', 'lower-third', 'bottom'] as const;
export const TEXT_STYLES = ['bold', 'clean', 'glow', 'kinetic'] as const;
export const FX_IDS = ['lightLeak', 'vhs', 'glitch', 'filmGrain', 'vignette', 'bloom', 'halation', 'chromaticAberration', 'dustScratches', 'lensFlare', 'zoomPunch', 'shake'] as const;
export const MUSIC_BEDS = ['inspiring', 'cinematic-dark', 'energetic', 'calm', 'luxury'] as const;
export const RAMPS = ['none', 'punch', 'easeIn', 'easeOut'] as const;
export const BG_MODES = ['transparent', 'colour', 'image', 'generated'] as const;

export const OP_TYPES: OpType[] = [
  'grade', 'restore', 'stabilize', 'speed', 'trim', 'cut_silences', 'captions', 'reframe', 'text', 'motion_fx',
  'broll', 'music', 'audio_cleanup', 'remove_bg', 'replace_bg', 'isolate', 'restyle', 'omni_effect',
];

/** Only one enabled step of these types applies; a new one supersedes the old. */
const SINGLETONS: OpType[] = ['grade', 'restore', 'stabilize', 'trim', 'cut_silences', 'captions', 'reframe', 'music', 'audio_cleanup'];

export const OP_META: Record<OpType, { label: string; short: string; engine: Engine }> = {
  grade: { label: 'Colour grade', short: 'Grade', engine: 'compose' },
  restore: { label: 'Denoise, sharpen & 1080p upscale', short: 'Restore', engine: 'stage' },
  stabilize: { label: 'Stabilize', short: 'Stabilize', engine: 'compose' },
  speed: { label: 'Speed', short: 'Speed', engine: 'compose' },
  trim: { label: 'Trim', short: 'Trim', engine: 'compose' },
  cut_silences: { label: 'Cut silences', short: 'Silences', engine: 'compose' },
  captions: { label: 'Auto-captions', short: 'Captions', engine: 'compose' },
  reframe: { label: 'Reframe', short: 'Reframe', engine: 'compose' },
  text: { label: 'Text overlay', short: 'Text', engine: 'compose' },
  motion_fx: { label: 'Motion effect', short: 'Effect', engine: 'compose' },
  broll: { label: 'B-roll', short: 'B-roll', engine: 'compose' },
  music: { label: 'Music bed', short: 'Music', engine: 'compose' },
  audio_cleanup: { label: 'Audio cleanup', short: 'Audio', engine: 'stage' },
  remove_bg: { label: 'Background removal', short: 'Background', engine: 'omni' },
  replace_bg: { label: 'AI background scene', short: 'New scene', engine: 'omni' },
  isolate: { label: 'Isolate subject', short: 'Isolate', engine: 'omni' },
  restyle: { label: 'Style transfer', short: 'Restyle', engine: 'omni' },
  omni_effect: { label: 'Generative effect', short: 'AI effect', engine: 'omni' },
};

export function isSingleton(type: OpType): boolean {
  return SINGLETONS.includes(type);
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (list.includes(String(value) as T) ? (String(value) as T) : fallback);
const text = (value: unknown, max: number): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const hex = (value: unknown, fallback: string): string => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback);

function range(raw: Record<string, any>, duration: number): { start?: number; end?: number } {
  const hasStart = raw.start !== undefined && raw.start !== null && raw.start !== '';
  const hasEnd = raw.end !== undefined && raw.end !== null && raw.end !== '';
  if (!hasStart && !hasEnd) return {};
  const start = round(clamp(raw.start, 0, Math.max(0, duration - 0.2), 0));
  const end = round(clamp(raw.end, start + 0.2, duration || start + 0.2, duration || start + 0.2));
  if (start <= 0.05 && end >= duration - 0.05) return {};
  return { start, end };
}

/** Clamp one planner step into a safe, renderable shape. Null means drop it. */
export function normalizeStep(raw: unknown, duration: number): PlannedStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const type = String(r.type || '') as OpType;
  if (!OP_TYPES.includes(type)) return null;
  const p = (r.params && typeof r.params === 'object' ? r.params : r) as Record<string, any>;
  const why = text(r.why, 120);
  const d = Math.max(0.5, duration || 0);
  let params: Record<string, any> = {};
  switch (type) {
    case 'grade': {
      const adjust: Record<string, number> = {};
      for (const key of ['brightness', 'contrast', 'saturation', 'highlights', 'shadows', 'temperature', 'tint']) {
        if (p[key] !== undefined) adjust[key] = Math.round(clamp(p[key], -50, 50, 0));
      }
      params = {
        look: pick(p.look, LOOK_IDS, 'none'),
        strength: Math.round(clamp(p.strength, 0, 100, 75)),
        lut: pick(p.lut, LUT_IDS, 'none'),
        lutIntensity: Math.round(clamp(p.lutIntensity, 0, 100, 55)),
        adjust,
        vignette: Math.round(clamp(p.vignette, 0, 100, 0)),
        filmGrain: Math.round(clamp(p.filmGrain, 0, 100, 0)),
        bloom: Math.round(clamp(p.bloom, 0, 100, 0)),
      };
      break;
    }
    case 'restore':
      params = { denoise: Math.round(clamp(p.denoise, 0, 100, 35)), sharpen: Math.round(clamp(p.sharpen, 0, 100, 35)) };
      if (!params.denoise && !params.sharpen) params.sharpen = 20;
      break;
    case 'stabilize':
      params = { strength: Math.round(clamp(p.strength, 10, 100, 60)) };
      break;
    case 'speed': {
      const ramp = pick(p.ramp, RAMPS, 'none');
      params = { rate: round(clamp(p.rate, 0.25, 4, ramp === 'none' ? 0.5 : 1)), ramp, ...range(p, d) };
      if (ramp === 'none' && Math.abs(params.rate - 1) < 0.02) return null;
      break;
    }
    case 'trim': {
      const keep = range(p, d);
      if (keep.start === undefined) return null;
      params = keep;
      break;
    }
    case 'cut_silences':
      params = { minSilence: round(clamp(p.minSilence, 0.3, 2.5, 0.6)), padding: round(clamp(p.padding, 0.04, 0.4, 0.12)) };
      break;
    case 'captions':
      params = {
        style: pick(p.style, CAPTION_STYLES, 'creator'),
        font: pick(p.font, CAPTION_FONTS, 'anton'),
        position: pick(p.position, CAPTION_POSITIONS, 'lower-third'),
        uppercase: p.uppercase === true,
        maxWords: Math.round(clamp(p.maxWords, 1, 8, 4)),
        highlight: hex(p.highlight, '#f2b544'),
      };
      break;
    case 'reframe':
      params = { aspect: pick(p.aspect, ASPECTS, '9:16'), track: p.track !== false };
      break;
    case 'text': {
      const value = text(p.text, 120);
      if (!value) return null;
      const start = round(clamp(p.start, 0, Math.max(0, d - 0.3), 0));
      params = {
        text: value,
        start,
        end: round(clamp(p.end, start + 0.4, d, Math.min(d, start + 3))),
        position: pick(p.position, TEXT_POSITIONS, 'top'),
        style: pick(p.style, TEXT_STYLES, 'bold'),
        color: hex(p.color, '#ffffff'),
      };
      break;
    }
    case 'motion_fx':
      params = { effect: pick(p.effect, FX_IDS, 'lightLeak'), intensity: Math.round(clamp(p.intensity, 5, 100, 50)) };
      break;
    case 'broll': {
      const prompt = text(p.prompt, 400);
      if (prompt.length < 10) return null;
      const duration = Math.round(clamp(p.duration, 4, 8, 5));
      params = { prompt, at: round(clamp(p.at, 0, Math.max(0, d - 1), Math.min(d / 3, Math.max(0, d - 1)))), duration, position: p.position === 'pip' ? 'pip' : 'full' };
      break;
    }
    case 'music':
      params = { bed: pick(p.bed, MUSIC_BEDS, 'inspiring'), volume: round(clamp(p.volume, 0.05, 0.6, 0.22)) };
      break;
    case 'audio_cleanup':
      params = { strength: Math.round(clamp(p.strength, 10, 100, 60)) };
      break;
    case 'remove_bg': {
      const mode = pick(p.mode, BG_MODES, 'colour');
      params = { mode, colour: hex(p.colour ?? p.color, '#101114') };
      if (mode === 'image') {
        if (!/^https:\/\//.test(String(p.imageUrl || ''))) return null;
        params.imageUrl = String(p.imageUrl).slice(0, 600);
      }
      if (mode === 'generated') params.prompt = text(p.prompt, 300) || 'a soft, out-of-focus modern studio with warm gold accent light';
      if (mode !== 'transparent') Object.assign(params, range(p, d));
      break;
    }
    case 'replace_bg': {
      const prompt = text(p.prompt, 300);
      if (prompt.length < 4) return null;
      params = { prompt, ...range(p, d) };
      break;
    }
    case 'isolate':
      params = { subject: text(p.subject, 120) || 'the main person', backdrop: pick(p.backdrop, ['black', 'white', 'blur'] as const, 'black'), ...range(p, d) };
      break;
    case 'restyle':
    case 'omni_effect': {
      const prompt = text(p.prompt, 400);
      if (prompt.length < 4) return null;
      params = { prompt, ...range(p, d) };
      break;
    }
    default:
      return null;
  }
  return { type, params, why };
}

export function normalizePlan(raw: unknown, duration: number, model: string): AgentPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const steps = (Array.isArray(r.steps) ? r.steps : [])
    .map((entry: unknown) => normalizeStep(entry, duration))
    .filter(Boolean)
    .slice(0, MAX_STEPS_PER_TURN) as PlannedStep[];
  const undo = (Array.isArray(r.undo) ? r.undo : []).map((value: unknown) => text(value, 60)).filter(Boolean).slice(0, 10);
  return { reply: text(r.reply, 400), steps, undo, model };
}

// ---------------------------------------------------------------------------
// Labels and costs
// ---------------------------------------------------------------------------

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const span = (p: Record<string, any>) => (p.start !== undefined ? ` · ${fmt(p.start)}–${fmt(p.end)}` : '');

export function stepLabel(type: OpType, p: Record<string, any>): string {
  switch (type) {
    case 'grade': {
      const look = p.look && p.look !== 'none' ? `${String(p.look)[0].toUpperCase()}${String(p.look).slice(1)} look` : 'Auto colour';
      return p.lut && p.lut !== 'none' ? `${look} + ${String(p.lut).replace(/_/g, ' ')} LUT` : look;
    }
    case 'restore': return `Restore · denoise ${p.denoise} · sharpen ${p.sharpen} · 1080p`;
    case 'stabilize': return `Stabilize · ${p.strength}%`;
    case 'speed': return p.ramp && p.ramp !== 'none' ? `Speed ramp (${p.ramp})${span(p)}` : `${p.rate}× speed${span(p)}`;
    case 'trim': return `Trim to ${fmt(p.start)}–${fmt(p.end)}`;
    case 'cut_silences': return `Cut pauses over ${p.minSilence}s`;
    case 'captions': return `Captions · ${p.style}${p.uppercase ? ' · caps' : ''}`;
    case 'reframe': return `Reframe ${p.aspect}${p.track ? ' · subject tracking' : ''}`;
    case 'text': return `Text “${String(p.text).slice(0, 28)}${String(p.text).length > 28 ? '…' : ''}”`;
    case 'motion_fx': return `${String(p.effect).replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())} · ${p.intensity}%`;
    case 'broll': return `B-roll at ${fmt(p.at)} · ${p.duration}s`;
    case 'music': return `Music · ${String(p.bed).replace('-', ' ')}`;
    case 'audio_cleanup': return `Audio cleanup · ${p.strength}%`;
    case 'remove_bg': return p.mode === 'transparent' ? 'Remove background · transparent' : p.mode === 'colour' ? `Background → ${p.colour}${span(p)}` : p.mode === 'image' ? `Background → your image${span(p)}` : `Background → generated${span(p)}`;
    case 'replace_bg': return `New scene: ${String(p.prompt).slice(0, 34)}${span(p)}`;
    case 'isolate': return `Isolate ${String(p.subject).slice(0, 30)}${span(p)}`;
    case 'restyle': return `Restyle: ${String(p.prompt).slice(0, 34)}${span(p)}`;
    case 'omni_effect': return `AI effect: ${String(p.prompt).slice(0, 34)}${span(p)}`;
    default: return String(type);
  }
}

/** The span of the working source an Omni step regenerates. */
export function omniSpan(p: Record<string, any>, duration: number): { start: number; end: number } {
  if (p.start !== undefined && p.end !== undefined) return { start: Math.max(0, p.start), end: Math.min(duration, p.end) };
  return { start: 0, end: duration };
}

export function omniCost(p: Record<string, any>, duration: number): number {
  const { start, end } = omniSpan(p, duration);
  return planChunks(start, end, duration).reduce((sum, chunk) => sum + Math.ceil((chunk.end - chunk.start) * OMNI_CREDITS_PER_SECOND - 1e-6), 0);
}

/** Credits the step will spend, assuming no green screen for background work. */
export function estimateStep(type: OpType, p: Record<string, any>, duration: number, greenScreen: boolean): number {
  if (type === 'broll') return Math.ceil((Number(p.duration) || 0) * OMNI_CREDITS_PER_SECOND - 1e-6);
  if (type === 'remove_bg' && (p.mode === 'transparent' || greenScreen)) return 0;
  if (OP_META[type].engine === 'omni') return omniCost(p, duration);
  return 0;
}

export function engineFor(type: OpType, p: Record<string, any>, greenScreen: boolean): Engine {
  if (type === 'remove_bg') {
    if (p.mode === 'transparent') return 'export';
    if (greenScreen) return 'stage';
  }
  return OP_META[type].engine;
}

// ---------------------------------------------------------------------------
// One-click looks. Pure data — no planner call and no tokens.
// ---------------------------------------------------------------------------

export interface LookPreset { id: string; label: string; hint: string; steps: PlannedStep[] }

export const LOOK_PRESETS: LookPreset[] = [
  {
    id: 'cinematic',
    label: 'Cinematic',
    hint: 'Teal-orange grade, film grain, vignette, steadier camera and a dark score.',
    steps: [
      { type: 'grade', params: { look: 'cinematic', strength: 70, lut: 'teal_orange', lutIntensity: 45, adjust: { contrast: 6, highlights: -6 }, vignette: 35, filmGrain: 22 }, why: 'Film-style colour' },
      { type: 'stabilize', params: { strength: 55 }, why: 'Smooth handheld shake' },
      { type: 'restore', params: { denoise: 25, sharpen: 25 }, why: 'Clean, crisp 1080p master' },
      { type: 'music', params: { bed: 'cinematic-dark', volume: 0.22 }, why: 'Moody score' },
    ],
  },
  {
    id: 'talking-head',
    label: 'Clean Talking Head',
    hint: 'Cuts dead air, cleans the voice, flattering colour and readable captions.',
    steps: [
      { type: 'cut_silences', params: { minSilence: 0.6, padding: 0.12 }, why: 'Tighter delivery' },
      { type: 'audio_cleanup', params: { strength: 60 }, why: 'Clear, even voice' },
      { type: 'grade', params: { look: 'none', strength: 80, adjust: { shadows: 6, saturation: 4 } }, why: 'Natural, flattering skin' },
      { type: 'restore', params: { denoise: 35, sharpen: 20 }, why: 'Less sensor noise' },
      { type: 'captions', params: { style: 'creator', font: 'montserrat', position: 'lower-third', maxWords: 5 }, why: 'Readable without sound' },
    ],
  },
  {
    id: 'product-pop',
    label: 'Product Pop',
    hint: 'Punchy colour and detail, soft bloom, zoom accents and an upbeat bed.',
    steps: [
      { type: 'grade', params: { look: 'none', strength: 85, adjust: { saturation: 14, contrast: 8, highlights: -4 } }, why: 'Colours that pop' },
      { type: 'restore', params: { denoise: 15, sharpen: 45 }, why: 'Crisp product detail' },
      { type: 'motion_fx', params: { effect: 'bloom', intensity: 30 }, why: 'Premium glow' },
      { type: 'motion_fx', params: { effect: 'zoomPunch', intensity: 45 }, why: 'Energy on every cut' },
      { type: 'music', params: { bed: 'energetic', volume: 0.25 }, why: 'Upbeat energy' },
    ],
  },
  {
    id: 'social-vertical',
    label: 'Social Vertical',
    hint: '9:16 with subject tracking, jump cuts and bold word-by-word captions.',
    steps: [
      { type: 'reframe', params: { aspect: '9:16', track: true }, why: 'Full-screen on phones' },
      { type: 'cut_silences', params: { minSilence: 0.45, padding: 0.08 }, why: 'Fast pacing' },
      { type: 'captions', params: { style: 'tiktok', font: 'anton', position: 'middle', uppercase: true, maxWords: 3 }, why: 'Sound-off viewing' },
      { type: 'grade', params: { look: 'none', strength: 75, adjust: { saturation: 10, contrast: 5 } }, why: 'Reads on small screens' },
      { type: 'music', params: { bed: 'energetic', volume: 0.16 }, why: 'Low music bed under the voice' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Offline planner — used only when both AI planners are unreachable.
// ---------------------------------------------------------------------------

export function keywordPlan(instruction: string, duration: number): AgentPlan {
  const t = instruction.toLowerCase();
  const steps: PlannedStep[] = [];
  const add = (type: OpType, params: Record<string, any>, why: string) => {
    const step = normalizeStep({ type, params, why }, duration);
    if (step) steps.push(step);
  };
  const preset = LOOK_PRESETS.find((entry) => t.includes(entry.label.toLowerCase()) || t.includes(entry.id.replace('-', ' ')));
  if (preset) return { reply: `Applying the ${preset.label} look.`, steps: preset.steps.map((s) => normalizeStep(s, duration)).filter(Boolean) as PlannedStep[], undo: [], model: 'Offline planner' };
  const quoted = /"([^"]{2,120})"|“([^”]{2,120})”/.exec(instruction);
  if (/(vertical|9:16|tiktok|reels?|shorts)/.test(t)) add('reframe', { aspect: '9:16', track: true }, 'Vertical for social');
  else if (/(square|1:1)/.test(t)) add('reframe', { aspect: '1:1', track: true }, 'Square crop');
  else if (/(16:9|landscape|widescreen)/.test(t)) add('reframe', { aspect: '16:9', track: true }, 'Landscape');
  if (/(silence|pause|dead air|tighten|jump cut)/.test(t)) add('cut_silences', {}, 'Remove pauses');
  if (/(caption|subtitle)/.test(t)) add('captions', { style: /tiktok|bold/.test(t) ? 'tiktok' : 'creator', uppercase: /caps|bold/.test(t) }, 'Captions');
  if (/(stabili|shak|smooth)/.test(t)) add('stabilize', {}, 'Steadier camera');
  if (/(denoise|noise|grain(?!y look)|sharpen|upscale|blurry|restore|4k|1080)/.test(t)) add('restore', { denoise: /noise/.test(t) ? 45 : 25, sharpen: /sharp|blurry|upscale/.test(t) ? 45 : 25 }, 'Cleaner detail');
  const look = (['cinematic', 'warm', 'cool', 'vintage'] as const).find((id) => t.includes(id)) || (/(black and white|b&w|monochrome)/.test(t) ? 'bw' : null);
  if (look || /(colou?r|grade|bright|dark|exposure|lut)/.test(t)) add('grade', { look: look || 'none', strength: 75, lut: /teal|orange/.test(t) ? 'teal_orange' : 'none' }, 'Colour correction');
  if (/(slow.?mo|slow motion)/.test(t)) add('speed', { rate: 0.5 }, 'Slow motion');
  if (/speed ramp/.test(t)) add('speed', { ramp: 'punch' }, 'Speed ramp');
  if (/(audio|voice|hiss|echo|clean.*sound)/.test(t)) add('audio_cleanup', {}, 'Cleaner voice');
  if (/(music|soundtrack|score)/.test(t)) add('music', { bed: /calm|chill/.test(t) ? 'calm' : /dark|cinematic/.test(t) ? 'cinematic-dark' : /luxury|premium/.test(t) ? 'luxury' : 'energetic' }, 'Music bed');
  if (/(transparent|cut ?out|alpha)/.test(t)) add('remove_bg', { mode: 'transparent' }, 'Transparent cut-out');
  else if (/(background|backdrop)/.test(t)) {
    const scene = /(?:background|backdrop)\s+(?:to|with|of|into)\s+(?:an?\s+)?([^.,!]{4,80})/.exec(instruction);
    if (scene) add('replace_bg', { prompt: scene[1] }, 'New background');
    else add('remove_bg', { mode: 'colour' }, 'Clean backdrop');
  }
  if (/(style|anime|cartoon|claymation|watercolou?r|pixar|painting)/.test(t)) add('restyle', { prompt: instruction.slice(0, 200) }, 'Style transfer');
  if (/(light leak|vhs|glitch|film grain|vignette)/.test(t)) add('motion_fx', { effect: /vhs/.test(t) ? 'vhs' : /glitch/.test(t) ? 'glitch' : /grain/.test(t) ? 'filmGrain' : /vignette/.test(t) ? 'vignette' : 'lightLeak' }, 'Finishing effect');
  if (quoted) add('text', { text: quoted[1] || quoted[2], start: 0, end: Math.min(duration, 3), position: 'top' }, 'Title');
  if (!steps.length) {
    add('grade', { look: 'none', strength: 75 }, 'Balanced colour');
    add('restore', { denoise: 25, sharpen: 25 }, 'Cleaner detail');
  }
  return { reply: 'Here is a measured edit based on your request.', steps, undo: [], model: 'Offline planner' };
}
