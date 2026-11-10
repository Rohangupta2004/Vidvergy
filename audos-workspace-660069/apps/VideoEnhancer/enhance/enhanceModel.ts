/**
 * Video Enhancer — enhancement model.
 *
 * Everything here is pure: settings, presets, the grade maths, output planning,
 * credit estimates and file validation. The grade maths is a line-for-line port
 * of clipFilter()/effectLayers() in the `veh-render` server function, so the
 * live preview applies exactly the CSS filters the render farm applies.
 */

import { quote } from '../../../lib/pricing';

export type EnhanceMode = 'auto' | 'color' | 'remaster';
export type LookId = 'none' | 'cinematic' | 'warm' | 'cool' | 'bw' | 'vintage';
export type PresetId = 'social' | 'ad' | 'archival' | 'custom';
export type FinishId = 'vignette' | 'filmGrain' | 'bloom';

export interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
}

export interface EnhanceSettings {
  preset: PresetId;
  mode: EnhanceMode;
  /** 0–100: how much of the measured auto correction is applied. */
  strength: number;
  look: LookId;
  /** Manual offsets on top of the auto correction (−50…+50). */
  adjust: Adjust;
  /** Finishing layer intensities, 0 = off. */
  finish: Record<FinishId, number>;
  audio: 'keep' | 'mute';
}

/** Measured from sampled frames in the browser (all values 0–1 except warmth, which is −1…+1). */
export interface FrameAnalysis {
  luma: number;
  spread: number;
  saturation: number;
  warmth: number;
  p5: number;
  p95: number;
  samples: number;
}

/** Absolute values in the renderer's own units. */
export interface GradeValues {
  brightness: number;
  contrast: number;
  saturation: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  look: LookId;
  effects: { id: FinishId; intensity: number }[];
}

export const ZERO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0 };
export const NO_FINISH: Record<FinishId, number> = { vignette: 0, filmGrain: 0, bloom: 0 };

export const MODES: { id: EnhanceMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto enhance', hint: 'Measures exposure, contrast, saturation and colour cast across the clip and corrects them.' },
  { id: 'color', label: 'Manual colour', hint: 'Only your own adjustments and look. Nothing is measured or changed automatically.' },
  { id: 'remaster', label: 'Remaster only', hint: 'No colour changes. Conforms the clip to a clean 1080p / 30 fps H.264 master.' },
];

export const LOOKS: { id: LookId; label: string }[] = [
  { id: 'none', label: 'Natural' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bw', label: 'B&W' },
];

export const ADJUST_FIELDS: { key: keyof Adjust; label: string }[] = [
  { key: 'brightness', label: 'Exposure' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'tint', label: 'Tint' },
];

export const FINISH_FIELDS: { id: FinishId; label: string }[] = [
  { id: 'vignette', label: 'Vignette' },
  { id: 'filmGrain', label: 'Film grain' },
  { id: 'bloom', label: 'Bloom' },
];

export const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string; hint: string; settings: Omit<EnhanceSettings, 'preset'> }[] = [
  {
    id: 'social',
    label: 'Social',
    hint: 'Bright, punchy colour that reads on a phone screen.',
    settings: { mode: 'auto', strength: 75, look: 'none', adjust: { ...ZERO_ADJUST, contrast: 6, saturation: 10 }, finish: { ...NO_FINISH }, audio: 'keep' },
  },
  {
    id: 'ad',
    label: 'Ad',
    hint: 'Polished commercial grade with a soft vignette.',
    settings: { mode: 'auto', strength: 85, look: 'cinematic', adjust: { ...ZERO_ADJUST, contrast: 4, highlights: -4 }, finish: { ...NO_FINISH, vignette: 35 }, audio: 'keep' },
  },
  {
    id: 'archival',
    label: 'Archival',
    hint: 'Gentle, faithful restoration. Never cropped, no stylised look.',
    settings: { mode: 'auto', strength: 45, look: 'none', adjust: { ...ZERO_ADJUST, shadows: 6 }, finish: { ...NO_FINISH }, audio: 'keep' },
  },
];

export function presetSettings(id: Exclude<PresetId, 'custom'>): EnhanceSettings {
  const preset = PRESETS.find((entry) => entry.id === id) || PRESETS[0];
  return { preset: preset.id, ...preset.settings, adjust: { ...preset.settings.adjust }, finish: { ...preset.settings.finish } };
}

export const DEFAULT_SETTINGS: EnhanceSettings = presetSettings('social');

export function normalizeSettings(value: unknown): EnhanceSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<EnhanceSettings>;
  const base = DEFAULT_SETTINGS;
  const num = (input: unknown, min: number, max: number, fallback: number) => {
    const n = Number(input);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  };
  const adjust = { ...ZERO_ADJUST };
  for (const field of ADJUST_FIELDS) adjust[field.key] = num(raw.adjust?.[field.key], -50, 50, 0);
  const finish = { ...NO_FINISH };
  for (const field of FINISH_FIELDS) finish[field.id] = num(raw.finish?.[field.id], 0, 100, 0);
  return {
    preset: (['social', 'ad', 'archival', 'custom'] as PresetId[]).includes(raw.preset as PresetId) ? raw.preset as PresetId : base.preset,
    mode: (['auto', 'color', 'remaster'] as EnhanceMode[]).includes(raw.mode as EnhanceMode) ? raw.mode as EnhanceMode : base.mode,
    strength: num(raw.strength, 0, 100, base.strength),
    look: LOOKS.some((look) => look.id === raw.look) ? raw.look as LookId : base.look,
    adjust,
    finish,
    audio: raw.audio === 'mute' ? 'mute' : 'keep',
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** The correction auto enhance would apply at 100% strength. */
export function autoCorrection(a: FrameAnalysis): Adjust {
  return {
    brightness: clamp((0.46 - a.luma) * 110, -22, 28),
    contrast: clamp((0.74 - a.spread) * 55, -8, 22),
    saturation: clamp((0.3 - a.saturation) * 90, -12, 28),
    shadows: a.p5 < 0.03 && a.luma < 0.42 ? clamp((0.42 - a.luma) * 60, 0, 18) : 0,
    highlights: a.p95 > 0.97 ? -clamp((a.p95 - 0.95) * 500, 0, 20) : 0,
    temperature: clamp(-a.warmth * 140, -24, 24),
    tint: 0,
  };
}

export function computeGrade(settings: EnhanceSettings, analysis: FrameAnalysis | null): GradeValues {
  const values = { brightness: 100, contrast: 100, saturation: 100, highlights: 0, shadows: 0, temperature: 0, tint: 0 };
  if (settings.mode === 'remaster') return { ...values, look: 'none', effects: [] };
  if (settings.mode === 'auto' && analysis) {
    const k = settings.strength / 100;
    const auto = autoCorrection(analysis);
    for (const field of ADJUST_FIELDS) values[field.key] += auto[field.key] * k;
  }
  for (const field of ADJUST_FIELDS) values[field.key] += settings.adjust[field.key];
  return {
    brightness: Math.round(clamp(values.brightness, 50, 160)),
    contrast: Math.round(clamp(values.contrast, 50, 160)),
    saturation: Math.round(clamp(values.saturation, 0, 200)),
    highlights: Math.round(clamp(values.highlights, -50, 50)),
    shadows: Math.round(clamp(values.shadows, -50, 50)),
    temperature: Math.round(clamp(values.temperature, -50, 50)),
    tint: Math.round(clamp(values.tint, -50, 50)),
    look: settings.look,
    effects: FINISH_FIELDS.filter((field) => settings.finish[field.id] > 0).map((field) => ({ id: field.id, intensity: settings.finish[field.id] })),
  };
}

const GRADES: Record<LookId, string> = {
  none: '',
  cinematic: 'contrast(1.12) saturate(1.22) hue-rotate(8deg)',
  warm: 'sepia(0.18) saturate(1.24) contrast(1.05) brightness(1.04)',
  cool: 'saturate(1.1) contrast(1.08) hue-rotate(-12deg) brightness(1.02)',
  bw: 'grayscale(1) contrast(1.16)',
  vintage: 'sepia(0.3) saturate(0.86) contrast(0.95) brightness(1.06)',
};

/** Same CSS filter chain veh-render's clipFilter() builds for the clip. */
export function gradeFilter(g: GradeValues): string {
  const f: string[] = [];
  if (g.brightness !== 100) f.push(`brightness(${(g.brightness / 100).toFixed(3)})`);
  if (g.contrast !== 100) f.push(`contrast(${(g.contrast / 100).toFixed(3)})`);
  if (g.saturation !== 100) f.push(`saturate(${(g.saturation / 100).toFixed(3)})`);
  if (g.highlights) {
    f.push(`brightness(${(1 + g.highlights / 500).toFixed(3)})`);
    f.push(`contrast(${(1 + g.highlights / 250).toFixed(3)})`);
  }
  if (g.shadows) {
    f.push(`brightness(${(1 + g.shadows / 250).toFixed(3)})`);
    f.push(`contrast(${(1 - g.shadows / 500).toFixed(3)})`);
  }
  const chromaMix = Math.min(0.35, (Math.abs(g.temperature) + Math.abs(g.tint)) * 0.0035);
  const hue = g.temperature * -0.24 + g.tint * 0.36;
  if (chromaMix > 0.0001) f.push(`sepia(${chromaMix.toFixed(3)})`);
  if (Math.abs(hue) > 0.001) f.push(`hue-rotate(${hue.toFixed(2)}deg)`);
  if (GRADES[g.look]) f.push(GRADES[g.look]);
  return f.length ? f.join(' ') : 'none';
}

const GRAIN = 'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27220%27 height=%27220%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27 stitchTiles=%27stitch%27/></filter><rect width=%27220%27 height=%27220%27 filter=%27url(%23n)%27 opacity=%270.55%27/></svg>")';

export interface EffectLayer { key: string; background: string; opacity: number; blend: string }

/** Same overlay layers veh-render's EffectLayers draws (opacity × intensity). */
export function effectLayers(g: GradeValues): EffectLayer[] {
  const out: EffectLayer[] = [];
  for (const effect of g.effects) {
    const strength = clamp(effect.intensity / 100, 0, 1);
    if (effect.id === 'vignette') out.push({ key: 'vignette', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(0,0,0,0.62) 100%)', opacity: strength, blend: 'normal' });
    if (effect.id === 'bloom') out.push({ key: 'bloom', background: 'radial-gradient(ellipse at 50% 42%, rgba(255,246,214,0.3) 0%, rgba(255,246,214,0) 62%)', opacity: strength, blend: 'screen' });
    if (effect.id === 'filmGrain') out.push({ key: 'grain', background: GRAIN, opacity: 0.1 * strength, blend: 'overlay' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output planning — the platform render service is fixed at 1920x1080 @ 30fps.
// Portrait is lifted to a true 1080x1920 master by veh-render's finalize step.
// ---------------------------------------------------------------------------

export const OUTPUT_FPS = 30;
export const MAX_DURATION_S = 600;
export const MIN_DURATION_S = 0.5;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export interface OutputPlan {
  aspect: '16:9' | '9:16';
  width: number;
  height: number;
  label: string;
  notes: string[];
}

export function planOutput(source: { width: number; height: number; fps?: number | null }): OutputPlan {
  const width = Math.max(1, source.width || 1920);
  const height = Math.max(1, source.height || 1080);
  const ratio = width / height;
  const portrait = ratio < 1;
  const notes: string[] = [];
  const shortSide = Math.min(width, height);
  if (source.width && source.height) {
    if (shortSide < 1060) notes.push(`Upscaled from ${shortSide}p to 1080p (high-quality resampling)`);
    else if (shortSide > 1100) notes.push(`Downscaled from ${shortSide}p to the 1080p master`);
    const target = portrait ? 9 / 16 : 16 / 9;
    if (Math.abs(ratio - target) / target > 0.03) notes.push(portrait ? 'Letterboxed so no part of the frame is cropped' : 'Pillarboxed so no part of the frame is cropped');
  }
  if (source.fps && Math.abs(source.fps - OUTPUT_FPS) > 0.6) notes.push(`Frame rate conformed from ≈${formatFps(source.fps)} to ${OUTPUT_FPS} fps`);
  return portrait
    ? { aspect: '9:16', width: 1080, height: 1920, label: '1080 × 1920', notes }
    : { aspect: '16:9', width: 1920, height: 1080, label: '1920 × 1080', notes };
}

// ---------------------------------------------------------------------------
// Credits. Enhancement generates no footage: its real cost is the cloud
// Remotion render (lib/pricing.ts — $0.05 per render of up to 180 s), billed
// at cost + 30% like every other engine.
// ---------------------------------------------------------------------------

export const RENDER_ENGINE = 'remotion/render';

export function estimateCredits(durationS: number): number {
  if (!Number.isFinite(durationS) || durationS <= 0) return 0;
  return quote(RENDER_ENGINE, { seconds: durationS }).credits;
}

// ---------------------------------------------------------------------------
// Validation and formatting
// ---------------------------------------------------------------------------

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];

export function validateFile(file: File): string | null {
  const typeOk = VIDEO_TYPES.includes(file.type) || (!file.type && VIDEO_EXT.test(file.name)) || (file.type.startsWith('video/') && VIDEO_EXT.test(file.name));
  if (!typeOk) return `${file.name}: unsupported format. Use MP4, MOV, M4V or WebM.`;
  if (file.size <= 0) return `${file.name}: the file is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name}: ${formatBytes(file.size)} is over the 500 MB limit. Trim or compress it first.`;
  return null;
}

export function validateDuration(name: string, duration: number): string | null {
  if (!Number.isFinite(duration) || duration < MIN_DURATION_S) return `${name}: the clip is too short or has no readable duration.`;
  if (duration > MAX_DURATION_S) return `${name}: ${formatDuration(duration)} is longer than the 10-minute render limit. Trim it first.`;
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatFps(fps: number | null | undefined): string {
  const n = Number(fps);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const common = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  const near = common.find((value) => Math.abs(value - n) < 0.35);
  const value = near ?? Math.round(n);
  return `${Number.isInteger(value) ? value : value.toFixed(2)} fps`;
}

/** HH:MM:SS:FF at the given frame rate. */
export function timecode(seconds: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps || OUTPUT_FPS));
  const frames = Math.max(0, Math.floor(seconds * rate + 1e-6));
  const total = Math.floor(frames / rate);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60, frames % rate].map((v) => String(v).padStart(2, '0')).join(':');
}

export function titleFromName(name: string): string {
  return (name || 'Untitled clip').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 80) || 'Untitled clip';
}

export function safeFileName(title: string): string {
  return (title || 'video').replace(/[^a-z0-9-_ ]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'video';
}
