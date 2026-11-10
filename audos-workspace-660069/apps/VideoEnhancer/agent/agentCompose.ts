/**
 * Enhancer Agent — compiles the operation stack into veh-render requests.
 *
 * Pure functions only. The render request uses exactly the fields veh-render
 * already understands (clips, captions, text layers, b-roll overlays, chroma,
 * vfx, reframe, music). SVG-filter work (denoise/sharpen, chroma key) only
 * renders reliably on a single clip, so it runs as its own stage render and
 * the multi-clip final render never carries an SVG filter.
 */
import {
  NO_FINISH, ZERO_ADJUST, computeGrade, estimateCredits, gradeFilter, planOutput,
  type EnhanceSettings, type FrameAnalysis, type GradeValues,
} from '../enhance/enhanceModel';
import { LUT_EFFECT } from './agentOps';
import { overlapBefore } from './omniChunks';
import type { AgentProject, MediaRef, OmniChunk, Step, TimedWord } from './agentTypes';

// ---------------------------------------------------------------------------
// The working source: original → enabled stages, in stack order
// ---------------------------------------------------------------------------

export function originalMedia(project: AgentProject): MediaRef | null {
  const s = project.source;
  return s.url ? { url: s.url, width: s.width, height: s.height, duration: s.duration } : null;
}

export function isStageStep(step: Step): boolean {
  return step.engine === 'stage' || step.engine === 'omni';
}

/** The media a stage step reads from: the output of the previous enabled stage. */
export function stageInput(project: AgentProject, stepId: string): MediaRef | null {
  let current = originalMedia(project);
  for (const step of project.steps) {
    if (step.id === stepId) return current;
    if (!step.enabled || !isStageStep(step)) continue;
    if (stageReady(step)) current = step.result!.media!;
    else return null;
  }
  return current;
}

/** The final working source, or null while a stage is still pending. */
export function workingMedia(project: AgentProject): MediaRef | null {
  let current = originalMedia(project);
  for (const step of project.steps) {
    if (!step.enabled || !isStageStep(step)) continue;
    if (stageReady(step)) current = step.result!.media!;
    else return null;
  }
  return current;
}

/** A finished stage, or one skipped as a pass-through of its input. */
export function stageReady(step: Step): boolean {
  return (step.status === 'done' || step.status === 'skipped') && Boolean(step.result?.media);
}

export function activeSteps(project: AgentProject): Step[] {
  return project.steps.filter((step) => step.enabled && !step.supersededBy);
}

const last = <T extends Step['type']>(project: AgentProject, type: T): Step | null => {
  const list = activeSteps(project).filter((step) => step.type === type);
  return list.length ? list[list.length - 1] : null;
};

// ---------------------------------------------------------------------------
// Time map: source time → output time after trims, silence cuts and speed
// ---------------------------------------------------------------------------

export interface Piece { srcStart: number; srcEnd: number; outStart: number; rate: number; ramp: string }

function intersect(a: { start: number; end: number }[], b: { start: number; end: number }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end - start > 0.05) out.push({ start, end });
  }
  return out.sort((p, q) => p.start - q.start);
}

export function buildPieces(project: AgentProject, duration: number): Piece[] {
  let keep = [{ start: 0, end: duration }];
  const trim = last(project, 'trim');
  if (trim && trim.params.start !== undefined) keep = intersect(keep, [{ start: trim.params.start, end: Math.min(duration, trim.params.end) }]);
  const silences = last(project, 'cut_silences');
  if (silences?.status === 'done' && silences.result?.keep?.length) keep = intersect(keep, silences.result.keep);
  if (!keep.length) keep = [{ start: 0, end: duration }];

  const speeds = activeSteps(project).filter((step) => step.type === 'speed');
  const boundaries = new Set<number>();
  for (const seg of keep) { boundaries.add(seg.start); boundaries.add(seg.end); }
  for (const s of speeds) {
    if (s.params.start !== undefined) { boundaries.add(s.params.start); boundaries.add(s.params.end); }
  }
  const cuts = Array.from(boundaries).sort((a, b) => a - b);
  const pieces: Piece[] = [];
  let out = 0;
  for (const seg of keep) {
    const inner = cuts.filter((t) => t > seg.start + 0.04 && t < seg.end - 0.04);
    const edges = [seg.start, ...inner, seg.end];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const a = edges[i];
      const b = edges[i + 1];
      const mid = (a + b) / 2;
      const speed = [...speeds].reverse().find((s) => s.params.start === undefined || (mid >= s.params.start && mid <= s.params.end));
      const ramp = speed && speed.params.ramp && speed.params.ramp !== 'none' ? String(speed.params.ramp) : 'none';
      const rate = speed && ramp === 'none' ? Number(speed.params.rate) || 1 : 1;
      pieces.push({ srcStart: a, srcEnd: b, outStart: out, rate, ramp });
      out += (b - a) / rate;
    }
  }
  return pieces;
}

export function outputDuration(pieces: Piece[]): number {
  const tail = pieces[pieces.length - 1];
  return tail ? tail.outStart + (tail.srcEnd - tail.srcStart) / tail.rate : 0;
}

/** Output time for a source time, or null when that moment was cut. */
export function mapTime(pieces: Piece[], t: number): number | null {
  for (const p of pieces) if (t >= p.srcStart - 1e-6 && t <= p.srcEnd + 1e-6) return p.outStart + (t - p.srcStart) / p.rate;
  return null;
}

/** Nearest kept output time for a source time (for overlays anchored in cut regions). */
export function mapTimeNearest(pieces: Piece[], t: number): number {
  const exact = mapTime(pieces, t);
  if (exact !== null) return exact;
  const next = pieces.find((p) => p.srcStart >= t);
  return next ? next.outStart : outputDuration(pieces);
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

export function gradeSettings(step: Step | null, analysis: FrameAnalysis | null): EnhanceSettings {
  if (!step) return { preset: 'custom', mode: 'remaster', strength: 0, look: 'none', adjust: { ...ZERO_ADJUST }, finish: { ...NO_FINISH }, audio: 'keep' };
  const p = step.params;
  return {
    preset: 'custom',
    mode: analysis ? 'auto' : 'color',
    strength: Number(p.strength) || 0,
    look: p.look || 'none',
    adjust: { ...ZERO_ADJUST, ...(p.adjust || {}) },
    finish: { vignette: Number(p.vignette) || 0, filmGrain: Number(p.filmGrain) || 0, bloom: Number(p.bloom) || 0 },
    audio: 'keep',
  };
}

export function projectGrade(project: AgentProject): GradeValues {
  return computeGrade(gradeSettings(last(project, 'grade'), project.analysis), project.analysis);
}

/** The CSS filter the live preview applies; mirrors the render's clip filter. */
export function previewFilter(project: AgentProject, restoreFilterId: string | null): string {
  const grade = projectGrade(project);
  const parts: string[] = [];
  if (restoreFilterId) parts.push(`url(#${restoreFilterId})`);
  const base = gradeFilter(grade);
  if (base !== 'none') parts.push(base);
  const lut = last(project, 'grade')?.params.lut;
  if (lut === 'teal_orange') parts.push('saturate(1.22) hue-rotate(-9deg) contrast(1.08)');
  if (lut === 'warm_retro') parts.push('sepia(.28) saturate(1.15) hue-rotate(-8deg)');
  if (lut === 'faded_film') parts.push('saturate(.72) contrast(.9) brightness(1.08)');
  if (lut === 'mono') parts.push('grayscale(1) contrast(1.12)');
  return parts.length ? parts.join(' ') : 'none';
}

export function restoreParams(project: AgentProject): { denoise: number; sharpen: number } | null {
  const step = last(project, 'restore');
  if (!step || step.status === 'skipped') return null;
  return { denoise: Number(step.params.denoise) || 0, sharpen: Number(step.params.sharpen) || 0 };
}

// ---------------------------------------------------------------------------
// Output geometry
// ---------------------------------------------------------------------------

const ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export function outputGeometry(project: AgentProject, media: MediaRef): { aspect: string; width: number; height: number; reframed: boolean } {
  const reframe = last(project, 'reframe');
  if (reframe) {
    const aspect = String(reframe.params.aspect);
    const srcRatio = media.width / Math.max(1, media.height);
    const [aw, ah] = aspect.split(':').map(Number);
    if (Math.abs(srcRatio - aw / ah) / (aw / ah) > 0.03) return { aspect, ...ASPECT_SIZE[aspect], reframed: true };
  }
  const plan = planOutput(media);
  return { aspect: plan.aspect, width: plan.width, height: plan.height, reframed: false };
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export interface Cue { text: string; start: number; end: number; words: TimedWord[] }

export function buildCues(words: TimedWord[], pieces: Piece[], maxWords: number, uppercase: boolean): Cue[] {
  const mapped: TimedWord[] = [];
  for (const w of words) {
    const midOut = mapTime(pieces, (w.start + w.end) / 2);
    if (midOut === null) continue;
    const start = mapTime(pieces, w.start) ?? midOut - 0.05;
    const end = mapTime(pieces, w.end) ?? midOut + 0.05;
    const value = uppercase ? w.text.toUpperCase() : w.text;
    mapped.push({ text: value, start, end: Math.max(start + 0.08, end) });
  }
  const cues: Cue[] = [];
  let current: TimedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({ text: current.map((w) => w.text).join(' '), start: current[0].start, end: current[current.length - 1].end, words: current });
    current = [];
  };
  for (const w of mapped) {
    const prev = current[current.length - 1];
    const chars = current.reduce((sum, item) => sum + item.text.length + 1, 0);
    if (prev && (w.start - prev.end > 0.6 || current.length >= maxWords || chars + w.text.length > 42)) flush();
    current.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return cues.map((cue, i) => ({ ...cue, end: i < cues.length - 1 ? Math.min(cue.end + 0.25, cues[i + 1].start) : cue.end + 0.3 }));
}

const CAPTION_Y: Record<string, { position: string; y: number }> = {
  bottom: { position: 'bottom', y: 0.86 },
  'lower-third': { position: 'lower-third', y: 0.76 },
  middle: { position: 'middle', y: 0.62 },
  top: { position: 'top', y: 0.16 },
};

// ---------------------------------------------------------------------------
// Render request
// ---------------------------------------------------------------------------

export interface ComposedRender {
  request: Record<string, unknown>;
  hash: string;
  outDuration: number;
  aspect: string;
  width: number;
  height: number;
  credits: number;
  stepIds: string[];
}

function hashString(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + value.length.toString(36);
}

const TEXT_Y: Record<string, number> = { top: 0.16, center: 0.5, 'lower-third': 0.72, bottom: 0.86 };

function textLayer(step: Step, pieces: Piece[], outDur: number): Record<string, unknown> | null {
  const p = step.params;
  const start = mapTimeNearest(pieces, Number(p.start) || 0);
  const endMapped = mapTime(pieces, Number(p.end) || 0);
  const end = Math.min(outDur, endMapped ?? start + Math.max(0.8, (Number(p.end) || 0) - (Number(p.start) || 0)));
  if (end - start < 0.3) return null;
  const style = String(p.style);
  return {
    text: p.text,
    start,
    end,
    x: 0.5,
    y: TEXT_Y[p.position] ?? 0.16,
    fontId: style === 'clean' ? 'montserrat' : style === 'kinetic' ? 'bebas' : 'anton',
    size: style === 'clean' ? 64 : style === 'kinetic' ? 120 : 96,
    weight: style === 'clean' ? 700 : 900,
    color: p.color || '#ffffff',
    outlineColor: '#000000',
    outlineWidth: style === 'bold' ? 2 : 0,
    shadowBlur: style === 'clean' ? 14 : 24,
    entrance: style === 'kinetic' ? 'slideUp' : style === 'clean' ? 'fadeIn' : 'scalePop',
    exit: 'fadeOut',
    animDuration: 0.45,
    align: 'center',
    glow: { enabled: style === 'glow', intensity: 60, color: '#f2b544', rays: false },
  };
}

/** Everything the final render needs. Null until every stage is done. */
export function composeRender(project: AgentProject): ComposedRender | null {
  const media = workingMedia(project);
  if (!media || !media.duration) return null;
  const steps = activeSteps(project);
  const pieces = buildPieces(project, media.duration);
  const outDur = outputDuration(pieces);
  const geo = outputGeometry(project, media);
  const grade = projectGrade(project);
  const gradeStep = last(project, 'grade');

  const stab = last(project, 'stabilize');
  const shake = stab?.status === 'done' ? stab.result?.shake || [] : [];
  const margin = stab?.status === 'done' ? Number(stab.result?.margin) || 1 : 1;
  const srcRatio = media.width / Math.max(1, media.height);
  const stageRatio = geo.width / geo.height;
  // How far one source-width fraction moves on the stage, for each fit mode.
  const fit = geo.reframed ? 'cover' : 'contain';
  const kx = fit === 'cover' ? Math.max(1, srcRatio / stageRatio) : Math.min(1, srcRatio / stageRatio);
  const ky = fit === 'cover' ? Math.max(1, stageRatio / srcRatio) : Math.min(1, stageRatio / srcRatio);

  const fxSteps = steps.filter((step) => step.type === 'motion_fx');
  const hasFx = (id: string) => fxSteps.find((step) => step.params.effect === id);
  const zoom = hasFx('zoomPunch');
  const shakeFx = hasFx('shake');

  const clips = pieces.map((piece, index) => {
    const local = shake.filter((k) => k.t >= piece.srcStart - 0.2 && k.t <= piece.srcEnd + 0.2);
    const stride = Math.max(1, Math.ceil(local.length / 380));
    const keyframes = local.length && margin > 1
      ? local.filter((_, i) => i % stride === 0).map((k) => ({
        t: Math.max(0, Math.round(((k.t - piece.srcStart) / piece.rate) * 1000) / 1000),
        x: Math.round(k.dx * kx * 10000) / 10000,
        y: Math.round(k.dy * ky * 10000) / 10000,
        scale: margin,
        opacity: 1,
      }))
      : [];
    const motion: Record<string, unknown> = {};
    if (piece.ramp !== 'none') motion.ramp = { enabled: true, curve: piece.ramp, intensity: 0.6 };
    if (zoom && index > 0) motion.zoomCut = { enabled: true, intensity: zoom.params.intensity > 66 ? 'high' : zoom.params.intensity > 33 ? 'medium' : 'low', direction: 'in' };
    if (shakeFx) motion.shake = { enabled: true, intensity: shakeFx.params.intensity, frequency: 'medium', seed: 7 };
    return {
      url: media.url,
      in: Math.round(piece.srcStart * 1000) / 1000,
      out: Math.round(piece.srcEnd * 1000) / 1000,
      speed: piece.rate,
      opacity: 1,
      brightness: grade.brightness, contrast: grade.contrast, saturation: grade.saturation,
      highlights: grade.highlights, shadows: grade.shadows, temperature: grade.temperature, tint: grade.tint,
      fit,
      focusable: geo.reframed,
      muted: false,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      effects: gradeStep?.params.lut && LUT_EFFECT[gradeStep.params.lut] ? [{ id: LUT_EFFECT[gradeStep.params.lut], intensity: gradeStep.params.lutIntensity }] : [],
      keyframes,
      motion,
    };
  });

  const globalEffects: { id: string; intensity: number }[] = grade.effects.map((e) => ({ id: e.id, intensity: e.intensity }));
  for (const id of ['filmGrain', 'vignette', 'bloom', 'halation', 'chromaticAberration', 'dustScratches', 'lensFlare']) {
    const step = hasFx(id);
    if (!step) continue;
    const existing = globalEffects.find((e) => e.id === id);
    if (existing) existing.intensity = Math.max(existing.intensity, step.params.intensity);
    else globalEffects.push({ id, intensity: step.params.intensity });
  }
  const leak = hasFx('lightLeak');
  const vhs = hasFx('vhs');
  const glitch = hasFx('glitch');
  const vfx = {
    leak: { enabled: Boolean(leak), presetId: 'amberSweep', trigger: outDur > 12 ? 'loop' : 'start', blend: 'screen', intensity: leak?.params.intensity ?? 60 },
    vhs: { enabled: Boolean(vhs), intensity: vhs?.params.intensity ?? 50 },
    glitch: { enabled: Boolean(glitch), intensity: glitch?.params.intensity ?? 50 },
  };

  const cap = last(project, 'captions');
  const words = cap?.status === 'done' ? cap.result?.words || [] : [];
  const cues = cap && words.length ? buildCues(words, pieces, Number(cap.params.maxWords) || 4, cap.params.uppercase === true) : [];
  const capPos = CAPTION_Y[cap?.params.position || 'lower-third'] || CAPTION_Y['lower-third'];

  const textLayers = steps.filter((step) => step.type === 'text').map((step) => textLayer(step, pieces, outDur)).filter(Boolean);

  const videoOverlays = steps
    .filter((step) => step.type === 'broll' && step.status === 'done' && step.result?.url)
    .map((step) => {
      const start = mapTimeNearest(pieces, Number(step.params.at) || 0);
      const length = Math.min(Number(step.params.duration) || 4, Math.max(0.5, outDur - start));
      return { url: step.result!.url, start, end: start + length, sourceIn: 0, sourceOut: length, position: step.params.position === 'pip' ? 'pipTopRight' : 'full', scale: 0.36, opacity: 1, muted: true, fadeOut: true };
    })
    .filter((o) => o.end - o.start > 0.4);

  const music = last(project, 'music');
  const focus = last(project, 'reframe')?.result?.focus || [];

  const request: Record<string, unknown> = {
    aspect: geo.aspect,
    width: geo.width,
    height: geo.height,
    grade: grade.look,
    globalEffects,
    reframe: geo.reframed ? (focus.length ? { mode: 'auto', focus } : { mode: 'center' }) : { mode: 'center' },
    clips,
    captions: cues.map((cue) => ({ text: cue.text, start: cue.start, end: cue.end, words: cue.words })),
    captionSettings: cap ? {
      enabled: true,
      burnIn: true,
      styleId: cap.params.style,
      fontId: cap.params.font,
      position: capPos.position,
      y: capPos.y,
      uppercase: cap.params.uppercase === true,
      activeColor: cap.params.highlight,
      animation: 'preset',
      background: 'preset',
    } : { enabled: false, burnIn: false },
    textLayers,
    overlays: [],
    videoOverlays,
    vfx,
    musicUrl: '',
    musicBedId: music ? music.params.bed : '',
    musicVolume: music ? music.params.volume : 0.28,
  };
  const hash = hashString(JSON.stringify(request));
  return {
    request,
    hash,
    outDuration: outDur,
    aspect: geo.aspect,
    width: geo.width,
    height: geo.height,
    credits: estimateCredits(outDur),
    stepIds: steps.filter((step) => !isStageStep(step) && step.engine !== 'export').map((step) => step.id),
  };
}

// ---------------------------------------------------------------------------
// Stage renders
// ---------------------------------------------------------------------------

function stageGeometry(media: MediaRef): { aspect: string; width: number; height: number } {
  const plan = planOutput(media);
  return { aspect: plan.aspect, width: plan.width, height: plan.height };
}

const plainClip = (url: string, inS: number, outS: number, extra: Record<string, unknown> = {}) => ({
  url, in: inS, out: outS, speed: 1, opacity: 1, brightness: 100, contrast: 100, saturation: 100,
  highlights: 0, shadows: 0, temperature: 0, tint: 0, fit: 'contain', focusable: false, muted: true, crop: { x: 0, y: 0, w: 1, h: 1 }, ...extra,
});

const stageBase = (media: MediaRef) => ({
  ...stageGeometry(media),
  grade: 'none', globalEffects: [], reframe: { mode: 'center' },
  captions: [], captionSettings: { enabled: false, burnIn: false }, textLayers: [], overlays: [], videoOverlays: [], vfx: {}, musicUrl: '',
});

/** Spatial denoise and unsharp-mask sharpen, mastered at 1080p. */
export function restoreStageRequest(media: MediaRef, restore: { denoise: number; sharpen: number }): Record<string, unknown> {
  return { ...stageBase(media), clips: [plainClip(media.url, 0, media.duration, { muted: false })], restore };
}

/** Green/blue screen keyed over a colour or an image. */
export function chromaStageRequest(media: MediaRef, key: { color: string; backgroundColor: string; backgroundUrl: string | null }): Record<string, unknown> {
  return {
    ...stageBase(media),
    clips: [plainClip(media.url, 0, media.duration, { muted: false })],
    chroma: {
      enabled: true, color: key.color, tolerance: 0.45, softness: 0.3, spill: 0.6,
      background: key.backgroundUrl ? 'image' : 'color', backgroundUrl: key.backgroundUrl || '', backgroundColor: key.backgroundColor,
    },
  };
}

/** Picture from `media`, audio from the cleaned WAV, same length. */
export function audioStageRequest(media: MediaRef, audioUrl: string): Record<string, unknown> {
  return {
    ...stageGeometry(media),
    grade: 'none', globalEffects: [], reframe: { mode: 'center' },
    clips: [plainClip(media.url, 0, media.duration)],
    captions: [], captionSettings: { enabled: false, burnIn: false }, textLayers: [], overlays: [], videoOverlays: [], vfx: {},
    musicUrl: audioUrl, musicVolume: 1,
  };
}

/**
 * Omni chunks crossfaded across their overlaps, untouched source either side
 * of the span, and the input's own audio re-laid underneath so speech stays in
 * sync however each chunk came back.
 */
export function stitchRequest(media: MediaRef, chunks: OmniChunk[], span: { start: number; end: number }, aspect: '16:9' | '9:16'): Record<string, unknown> {
  const clips: Record<string, unknown>[] = [];
  const geo = aspect === '9:16' ? { aspect: '9:16', width: 1080, height: 1920 } : { aspect: '16:9', width: 1920, height: 1080 };
  const fade = (seconds: number) => (seconds > 0.04 ? { transitionIn: { id: 'crossfade', duration: Math.min(2, Math.max(0.1, seconds)) } } : {});
  if (span.start > 0.05) clips.push(plainClip(media.url, 0, span.start, { fit: 'cover' }));
  chunks.forEach((chunk, index) => {
    const length = chunk.end - chunk.start;
    const produced = Math.max(0.2, Number(chunk.outputDuration) || length);
    const used = Math.min(produced, length);
    const speed = Math.max(0.25, Math.min(4, used / length));
    const overlap = index === 0 ? (span.start > 0.05 ? Math.min(0.5, length / 4) : 0) : overlapBefore(chunks, index);
    clips.push(plainClip(String(chunk.outputUrl), 0, used, { speed, fit: 'cover', ...fade(overlap) }));
  });
  if (span.end < media.duration - 0.05) {
    const tail = Math.min(0.5, (media.duration - span.end) / 2);
    clips.push(plainClip(media.url, Math.max(0, span.end - tail), media.duration, { fit: 'cover', ...fade(tail) }));
  }
  if (span.start > 0.05 && clips.length > 1) {
    // The lead-in fade into chunk 0 borrows from the head clip, so extend it to keep sync.
    const head = clips[0] as any;
    const first = clips[1] as any;
    const borrow = first.transitionIn?.duration || 0;
    head.out = Math.min(media.duration, head.out + borrow);
  }
  return {
    ...geo,
    grade: 'none', globalEffects: [], reframe: { mode: 'center' },
    clips,
    captions: [], captionSettings: { enabled: false, burnIn: false }, textLayers: [], overlays: [],
    videoOverlays: [{ url: media.url, start: 0, end: media.duration, sourceIn: 0, sourceOut: media.duration, position: 'full', opacity: 0, muted: false }],
    vfx: {},
    musicUrl: '',
  };
}
