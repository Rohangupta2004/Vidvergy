/**
 * Enhancer Agent — media work that runs in the browser or calls a platform
 * endpoint: audio analysis and cleanup, transcription, subject tracking,
 * motion estimation for stabilization, key detection, Omni Flash submit/poll,
 * b-roll, generated backgrounds and the veh-render runner.
 */
import { WORKSPACE_ID, callHook, workspaceFetch } from '../../../lib/workspace';
import { checkGroupA, describeHttpError, postGeneration } from '../../../lib/videoEngineClient';
import type { AppId } from '../../../lib/appIds';
import { uploadWithProgress } from '../enhance/enhanceIO';
import { prepareSpeakerCutout } from '../speakerCutout';
import {
  AGENT_APP_ID, AUDIO_DECODE_MAX_BYTES, OMNI_MAX_CHUNK_S, OMNI_MODEL, OMNI_POLL_TIMEOUT_MS, RENDER_POLL_BUDGET_MS, RENDER_TIMEOUT_MS,
} from './agentConfig';
import type { TimedWord } from './agentTypes';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
export const readable = (error: unknown) => (error instanceof Error ? error.message : String(error || 'Unknown error')).slice(0, 260);
const appId = AGENT_APP_ID as AppId;

// ---------------------------------------------------------------------------
// Source bytes
// ---------------------------------------------------------------------------

export async function fetchBlob(url: string, maxBytes: number): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The video could not be read back from storage (HTTP ${res.status}).`);
  const length = Number(res.headers.get('content-length')) || 0;
  if (length > maxBytes) throw new Error(`This file is ${Math.round(length / 1048576)} MB, above the ${Math.round(maxBytes / 1048576)} MB the browser can analyse. Trim it first.`);
  const blob = await res.blob();
  if (blob.size > maxBytes) throw new Error(`This file is ${Math.round(blob.size / 1048576)} MB, above the ${Math.round(maxBytes / 1048576)} MB the browser can analyse. Trim it first.`);
  return blob;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export class NoAudioError extends Error {
  constructor() { super('This video has no audio track.'); this.name = 'NoAudioError'; }
}

const decoded = new Map<string, Promise<AudioBuffer>>();

export function decodeAudio(key: string, getBlob: () => Promise<Blob>): Promise<AudioBuffer> {
  const cached = decoded.get(key);
  if (cached) return cached;
  const work = (async () => {
    const blob = await getBlob();
    if (blob.size > AUDIO_DECODE_MAX_BYTES) throw new Error(`Audio analysis works on files up to ${Math.round(AUDIO_DECODE_MAX_BYTES / 1048576)} MB. Trim or compress the video first.`);
    const bytes = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    try {
      return await ctx.decodeAudioData(bytes);
    } catch {
      throw new NoAudioError();
    }
  })();
  decoded.set(key, work);
  work.catch(() => decoded.delete(key));
  return work;
}

export async function resampleMono(buffer: AudioBuffer, rate: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(buffer.duration * rate));
  const ctx = new OfflineAudioContext(1, length, rate);
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  node.start();
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

function windowDb(samples: Float32Array, rate: number, seconds: number): Float32Array {
  const size = Math.max(1, Math.round(rate * seconds));
  const count = Math.floor(samples.length / size);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let j = i * size; j < (i + 1) * size; j += 1) sum += samples[j] * samples[j];
    out[i] = 20 * Math.log10(Math.sqrt(sum / size) + 1e-9);
  }
  return out;
}

const quantile = (values: Float32Array, q: number) => {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? -90;
};

/** Measured pauses from the audio envelope. Works with or without speech. */
export function detectSilences(samples: Float32Array, rate: number, duration: number, opts: { minSilence: number; padding: number }): { keep: { start: number; end: number }[]; removed: number } {
  const step = 0.02;
  const db = windowDb(samples, rate, step);
  if (db.length < 10) return { keep: [{ start: 0, end: duration }], removed: 0 };
  const floor = quantile(db, 0.1);
  const loud = quantile(db, 0.95);
  if (loud - floor < 10) return { keep: [{ start: 0, end: duration }], removed: 0 };
  const threshold = Math.min(loud - 18, Math.max(floor + 9, loud - 35));
  const cuts: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let i = 0; i <= db.length; i += 1) {
    const silent = i < db.length && db[i] < threshold;
    if (silent && runStart < 0) runStart = i;
    if (!silent && runStart >= 0) {
      const s = runStart * step;
      const e = Math.min(duration, i * step);
      if (e - s >= opts.minSilence) {
        const cs = s === 0 ? 0 : s + opts.padding;
        const ce = e >= duration - step ? duration : e - opts.padding;
        if (ce - cs > 0.08) cuts.push({ start: cs, end: ce });
      }
      runStart = -1;
    }
  }
  const keep: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start - cursor > 0.05) keep.push({ start: round3(cursor), end: round3(cut.start) });
    cursor = cut.end;
  }
  if (duration - cursor > 0.05) keep.push({ start: round3(cursor), end: round3(duration) });
  if (!keep.length) return { keep: [{ start: 0, end: duration }], removed: 0 };
  const kept = keep.reduce((sum, seg) => sum + seg.end - seg.start, 0);
  return { keep, removed: Math.max(0, duration - kept) };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Deepgram word timings from a small 16 kHz mono WAV rather than the whole video. */
export async function transcribe(samples16k: Float32Array): Promise<TimedWord[]> {
  const form = new FormData();
  form.append('audio', encodeWav(samples16k, 16000), 'speech.wav');
  const res = await workspaceFetch(`/api/workspaces/${WORKSPACE_ID}/audio/transcribe-timestamped`, { method: 'POST', body: form });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) throw new Error(String(payload?.error?.message || payload?.error || `Transcription failed (HTTP ${res.status}).`));
  const words: TimedWord[] = (Array.isArray(payload?.words) ? payload.words : [])
    .map((w: any) => ({ text: String(w.punctuated_word || w.word || '').trim(), start: Math.max(0, Number(w.start) || 0), end: Math.max(0, Number(w.end) || 0) }))
    .filter((w: TimedWord) => w.text && w.end >= w.start);
  if (!words.length) throw new Error('No speech was found, so there is nothing to caption.');
  return words;
}

/**
 * Voice cleanup: rumble and hiss filters, presence lift, compression, a gentle
 * downward expander between phrases and loudness normalisation. Returns an
 * uploaded WAV the render lays under the picture.
 */
export async function cleanAudio(buffer: AudioBuffer, strength: number, onProgress?: (fraction: number) => void): Promise<string> {
  const rate = 32000;
  const k = Math.max(0.1, Math.min(1, strength / 100));
  const length = Math.max(1, Math.ceil(buffer.duration * rate));
  const ctx = new OfflineAudioContext(1, length, rate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70 + 40 * k; hp.Q.value = 0.7;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 300; mud.Q.value = 1; mud.gain.value = -2.5 * k;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9; presence.gain.value = 2.5 * k;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 15000 - 4000 * k; lp.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20 - 8 * k; comp.knee.value = 10; comp.ratio.value = 2.5 + 2 * k; comp.attack.value = 0.006; comp.release.value = 0.22;
  src.connect(hp); hp.connect(mud); mud.connect(presence); presence.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
  src.start();
  onProgress?.(0.2);
  const rendered = await ctx.startRendering();
  const data = new Float32Array(rendered.getChannelData(0));
  onProgress?.(0.55);

  const win = Math.round(rate * 0.02);
  const db = windowDb(data, rate, 0.02);
  const floor = quantile(db, 0.12);
  const loud = quantile(db, 0.95);
  if (loud - floor > 8) {
    const gate = floor + 6;
    const maxCut = 10 + 8 * k;
    let gain = 1;
    for (let i = 0; i < db.length; i += 1) {
      const below = Math.max(0, gate - db[i]);
      const target = 10 ** (-Math.min(maxCut, below * 1.5) / 20);
      for (let j = i * win; j < (i + 1) * win && j < data.length; j += 1) {
        gain += (target - gain) * (target < gain ? 0.0015 : 0.01);
        data[j] *= gain;
      }
    }
  }
  const active = windowDb(data, rate, 0.4).filter((value) => value > loud - 25);
  const level = active.length ? quantile(active, 0.5) : quantile(db, 0.8);
  let normal = 10 ** ((-18 - level) / 20);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  if (peak * normal > 0.89) normal = 0.89 / Math.max(1e-6, peak);
  normal = Math.max(0.25, Math.min(8, normal));
  for (let i = 0; i < data.length; i += 1) data[i] *= normal;
  onProgress?.(0.7);
  const file = new File([encodeWav(data, rate)], `voice-clean-${Date.now()}.wav`, { type: 'audio/wav' });
  return uploadWithProgress(file, (fraction) => onProgress?.(0.7 + fraction * 0.3));
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

interface FrameSource { video: HTMLVideoElement; width: number; height: number; seek: (t: number) => Promise<void>; close: () => void }

async function openFrames(url: string): Promise<FrameSource> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (/^https?:\/\//i.test(url) && !url.startsWith(window.location.origin)) video.crossOrigin = 'anonymous';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('The video took too long to open for analysis.')), 25000);
    video.addEventListener('loadeddata', () => { window.clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error('The video could not be decoded for analysis.')); }, { once: true });
  });
  const seek = (t: number) => new Promise<void>((resolve) => {
    const guard = window.setTimeout(resolve, 4000);
    video.addEventListener('seeked', () => { window.clearTimeout(guard); resolve(); }, { once: true });
    video.currentTime = Math.max(0, Math.min((video.duration || t) - 0.02, t));
  });
  return { video, width: video.videoWidth || 16, height: video.videoHeight || 9, seek, close: () => { video.removeAttribute('src'); video.load(); } };
}

function canvasFor(width: number, height: number, w: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; h: number } {
  const h = Math.max(2, Math.round((w * height) / Math.max(1, width)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas analysis is unavailable in this browser.');
  return { canvas, ctx, h };
}

/** Dominant chroma-key colour when the border of the frame is a green or blue screen. */
export async function detectKeyColour(url: string, duration: number): Promise<string | null> {
  let frames: FrameSource | null = null;
  try {
    frames = await openFrames(url);
    const { ctx, h } = canvasFor(frames.width, frames.height, 64);
    let green = 0; let blue = 0; let total = 0; const sum = [0, 0, 0];
    for (const p of [0.2, 0.5, 0.8]) {
      await frames.seek(Math.max(0.05, duration * p));
      ctx.drawImage(frames.video, 0, 0, 64, h);
      const data = ctx.getImageData(0, 0, 64, h).data;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          if (x > 8 && x < 56 && y > h * 0.14 && y < h * 0.86) continue;
          const i = (y * 64 + x) * 4;
          const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
          total += 1;
          if (g > 0.3 && g > r * 1.35 && g > b * 1.35) { green += 1; sum[0] += r; sum[1] += g; sum[2] += b; }
          else if (b > 0.3 && b > r * 1.35 && b > g * 1.2) blue += 1;
        }
      }
    }
    if (total && green / total > 0.5) {
      const toHex = (v: number) => Math.round((v / green) * 255).toString(16).padStart(2, '0');
      return `#${toHex(sum[0])}${toHex(sum[1])}${toHex(sum[2])}`;
    }
    if (total && blue / total > 0.5) return '#0047bb';
    return null;
  } catch {
    return null;
  } finally {
    frames?.close();
  }
}

const MP_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm';
const MP_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

function smoothTrack(points: { t: number; x: number; y: number }[], radius: number): { t: number; x: number; y: number }[] {
  return points.map((point, index) => {
    let sx = 0; let sy = 0; let n = 0;
    for (let j = Math.max(0, index - radius); j <= Math.min(points.length - 1, index + radius); j += 1) { sx += points[j].x; sy += points[j].y; n += 1; }
    return { t: point.t, x: Math.round((sx / n) * 1000) / 1000, y: Math.round((sy / n) * 1000) / 1000 };
  });
}

/** Where the subject is over time, for reframing. Person matte first, vision model if no person. */
export async function trackSubject(url: string, duration: number, onProgress?: (fraction: number) => void): Promise<{ t: number; x: number; y: number }[]> {
  const count = Math.max(2, Math.min(120, Math.ceil(duration / 0.5)));
  const times = Array.from({ length: count }, (_, i) => Math.min(duration - 0.05, (i + 0.5) * (duration / count)));
  let frames: FrameSource | null = null;
  try {
    frames = await openFrames(url);
    const { canvas, ctx, h } = canvasFor(frames.width, frames.height, 256);
    const vision: any = await import(/* @vite-ignore */ MP_MODULE);
    const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
    const segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    const points: { t: number; x: number; y: number }[] = [];
    let found = 0;
    try {
      for (let i = 0; i < times.length; i += 1) {
        await frames.seek(times[i]);
        ctx.drawImage(frames.video, 0, 0, 256, h);
        const result = segmenter.segment(canvas);
        const mask = result?.confidenceMasks?.[0];
        const values: Float32Array | undefined = mask?.getAsFloat32Array?.();
        const mw = Number(mask?.width) || 256;
        let sx = 0; let sy = 0; let sw = 0;
        if (values) {
          for (let p = 0; p < values.length; p += 2) {
            const c = values[p];
            if (c > 0.4) { sx += (p % mw) * c; sy += Math.floor(p / mw) * c; sw += c; }
          }
        }
        result?.close?.();
        const coverage = values ? (sw * 2) / values.length : 0;
        if (coverage > 0.015) {
          found += 1;
          points.push({ t: times[i], x: sx / sw / mw, y: Math.max(0, sy / sw / (values!.length / mw) - 0.08) });
        } else if (points.length) points.push({ ...points[points.length - 1], t: times[i] });
        onProgress?.((i + 1) / times.length);
      }
    } finally {
      try { segmenter.close?.(); } catch { /* released */ }
    }
    if (found >= Math.max(1, times.length * 0.3)) return smoothTrack(points, 2);
  } catch {
    /* fall through to the vision model */
  } finally {
    frames?.close();
  }
  return trackWithVision(url, duration);
}

async function trackWithVision(url: string, duration: number): Promise<{ t: number; x: number; y: number }[]> {
  const frames = await openFrames(url);
  try {
    const times = Array.from({ length: 12 }, (_, i) => Math.min(duration - 0.05, (i + 0.5) * (duration / 12)));
    const sheet = document.createElement('canvas');
    sheet.width = 960; sheet.height = 720;
    const ctx = sheet.getContext('2d');
    if (!ctx) return [];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 960, 720);
    for (let i = 0; i < times.length; i += 1) {
      await frames.seek(times[i]);
      ctx.drawImage(frames.video, (i % 3) * 320, Math.floor(i / 3) * 180, 320, 180);
    }
    const [meta, image] = sheet.toDataURL('image/jpeg', 0.7).split(',');
    const res = await workspaceFetch('/api/generate/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType: /data:([^;]+)/.exec(meta || '')?.[1] || 'image/jpeg', prompt: 'A 3x4 grid of video frames in time order (left to right, top to bottom). For each tile give the centre of the main subject as fractions of that tile. JSON only: {"points":[{"i":0,"x":0.5,"y":0.4}]} with 12 entries.' }),
    });
    const payload = await res.json().catch(() => null);
    const match = String(payload?.result || payload?.text || '').match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const pts = (Array.isArray(parsed?.points) ? parsed.points : []).slice(0, 12).map((p: any, index: number) => ({
      t: times[Math.max(0, Math.min(11, Number.isFinite(Number(p.i)) ? Number(p.i) : index))],
      x: Math.max(0, Math.min(1, Number(p.x) || 0.5)),
      y: Math.max(0, Math.min(1, Number(p.y) || 0.45)),
    }));
    return smoothTrack(pts.sort((a: any, b: any) => a.t - b.t), 1);
  } catch {
    return [];
  } finally {
    frames.close();
  }
}

/**
 * Global camera motion by block matching downscaled frames, then the
 * difference between the raw and smoothed camera path. The render applies the
 * difference as a small counter-translation with a matching zoom margin.
 */
export async function measureShake(url: string, duration: number, strength: number, onProgress?: (fraction: number) => void): Promise<{ keys: { t: number; dx: number; dy: number }[]; margin: number; shakiness: number }> {
  const step = Math.max(0.1, duration / 360);
  const count = Math.max(2, Math.floor(duration / step));
  const frames = await openFrames(url);
  try {
    const W = 128;
    const { ctx, h: H } = canvasFor(frames.width, frames.height, W);
    const R = 8;
    let prev: Uint8Array | null = null;
    const path: { t: number; x: number; y: number }[] = [];
    let x = 0; let y = 0; let total = 0;
    for (let i = 0; i < count; i += 1) {
      const t = Math.min(duration - 0.03, i * step);
      await frames.seek(t);
      ctx.drawImage(frames.video, 0, 0, W, H);
      let rgba: Uint8ClampedArray;
      try { rgba = ctx.getImageData(0, 0, W, H).data; } catch { throw new Error('This video cannot be analysed for shake (storage blocked pixel access).'); }
      const gray = new Uint8Array(W * H);
      for (let p = 0, q = 0; p < gray.length; p += 1, q += 4) gray[p] = (rgba[q] * 77 + rgba[q + 1] * 150 + rgba[q + 2] * 29) >> 8;
      if (prev) {
        let best = Infinity; let bx = 0; let by = 0;
        for (let dy = -R; dy <= R; dy += 1) {
          for (let dx = -R; dx <= R; dx += 1) {
            let sad = 0;
            for (let yy = R; yy < H - R; yy += 2) {
              const row = yy * W; const rowShift = (yy + dy) * W + dx;
              for (let xx = R; xx < W - R; xx += 2) sad += Math.abs(gray[rowShift + xx] - prev[row + xx]);
              if (sad >= best) break;
            }
            if (sad < best) { best = sad; bx = dx; by = dy; }
          }
        }
        x += bx; y += by; total += Math.hypot(bx, by);
      }
      path.push({ t, x, y });
      prev = gray;
      if (i % 6 === 0) onProgress?.((i + 1) / count);
    }
    const radius = Math.max(1, Math.round((0.3 + 1.7 * (strength / 100)) / step / 2));
    const smooth = smoothTrack(path, radius);
    let maxFrac = 0;
    const raw = path.map((point, i) => {
      const dx = (smooth[i].x - point.x) / W;
      const dy = (smooth[i].y - point.y) / H;
      maxFrac = Math.max(maxFrac, Math.abs(dx), Math.abs(dy));
      return { t: Math.round(point.t * 1000) / 1000, dx, dy };
    });
    const margin = Math.max(1.03, Math.min(1.15, 1 + 2 * maxFrac + 0.01));
    const limit = (margin - 1) / 2;
    const keys = raw.map((k) => ({ t: k.t, dx: Math.round(Math.max(-limit, Math.min(limit, k.dx)) * 10000) / 10000, dy: Math.round(Math.max(-limit, Math.min(limit, k.dy)) * 10000) / 10000 }));
    onProgress?.(1);
    return { keys, margin: Math.round(margin * 1000) / 1000, shakiness: total / Math.max(1, count - 1) };
  } finally {
    frames.close();
  }
}

// ---------------------------------------------------------------------------
// Platform calls
// ---------------------------------------------------------------------------

export async function trimClip(url: string, start: number, end: number): Promise<string> {
  const res = await workspaceFetch('/api/video/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrlOrKey: url, startSec: Math.round(start * 1000) / 1000, endSec: Math.round(end * 1000) / 1000, workspaceId: WORKSPACE_ID }),
  });
  const data = await res.json().catch(() => null);
  const out = String(data?.url || '');
  if (!res.ok || !/^https:\/\//.test(out)) throw new Error(String(data?.error || `This segment could not be cut from the source (HTTP ${res.status}).`));
  return out;
}

export async function submitOmni(opts: { videoUrl: string; prompt: string; aspect: '16:9' | '9:16'; seconds: number; referenceImageUrl?: string | null }): Promise<string> {
  const body: Record<string, unknown> = {
    model: OMNI_MODEL,
    prompt: opts.prompt,
    videoData: opts.videoUrl,
    videoMimeType: 'video/mp4',
    aspectRatio: opts.aspect,
    duration: Math.max(2, Math.min(OMNI_MAX_CHUNK_S, Math.ceil(opts.seconds - 1e-6))),
    resolution: '720p',
    generateAudio: false,
    safetyFilterLevel: 'block_only_high',
  };
  if (opts.referenceImageUrl) body.referenceImages = [{ imageData: opts.referenceImageUrl, referenceType: 'asset' }];
  let { res, data } = await postGeneration('/api/veo/generate/video', body, appId);
  if (!res.ok && res.status === 400 && body.referenceImages) {
    delete body.referenceImages;
    ({ res, data } = await postGeneration('/api/veo/generate/video', body, appId));
  }
  if (!res.ok) throw describeHttpError(res.status, data, 'The Omni Flash request');
  const operationId = data && (data.operationId || data.operation_id);
  const failed = data?.success === false || String(data?.status || '').toLowerCase() === 'failed';
  if (typeof operationId !== 'string' || !operationId || failed || /_error_\d+$/.test(operationId)) {
    throw new Error(String(data?.errorMessage || data?.error || 'Omni Flash did not accept this segment.'));
  }
  return operationId;
}

export async function pollOmni(operationId: string, onTick?: (progress: number | null) => void, startedAt = Date.now()): Promise<string> {
  let misses = 0;
  for (;;) {
    if (Date.now() - startedAt > OMNI_POLL_TIMEOUT_MS) throw new Error('Omni Flash took longer than 15 minutes on this segment.');
    const status = await checkGroupA(operationId, appId);
    if (status.status === 'completed' && status.videoUrl) return status.videoUrl;
    if (status.status === 'failed') throw new Error(status.error || 'Omni Flash failed on this segment.');
    if (status.error) {
      misses += 1;
      if (misses >= 6) throw new Error(`Omni Flash stopped answering: ${status.error}`);
    } else misses = 0;
    onTick?.(typeof status.progress === 'number' ? status.progress : null);
    await wait(5000);
  }
}

export async function generateBroll(prompt: string, aspect: string, duration: number, onStage?: (text: string) => void): Promise<string> {
  let operationId = '';
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > OMNI_POLL_TIMEOUT_MS) throw new Error('The b-roll clip took longer than 15 minutes.');
    const result: any = await callHook('veh-broll-generate', operationId ? { operationId, budgetMs: 200000 } : { prompt, aspect: aspect === '9:16' ? '9:16' : aspect === '1:1' ? '1:1' : '16:9', durationS: duration, budgetMs: 200000 });
    if (result?.status === 'completed' && /^https:\/\//.test(String(result.videoUrl || ''))) return String(result.videoUrl);
    if (result?.status === 'failed') throw new Error(String(result.error || 'B-roll generation failed.'));
    if (!result?.operationId) throw new Error('The b-roll service gave no job id.');
    operationId = String(result.operationId);
    onStage?.('Generating b-roll on Omni Flash…');
  }
}

/** A still for a replaced background. Returns a durable https URL. */
export async function generateBackgroundImage(prompt: string, aspect: '16:9' | '9:16' | '1:1'): Promise<string> {
  const res = await workspaceFetch('/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${prompt}. Photographic background plate, no people, no text.`, aspectRatio: aspect, quality: 'standard' }),
  });
  const data = await res.json().catch(() => null);
  const url = String(data?.imageUrl || data?.url || '');
  if (!res.ok || !url) throw new Error(String(data?.error || `The background image could not be generated (HTTP ${res.status}).`));
  if (/^https:\/\//.test(url)) return url;
  if (url.startsWith('data:')) {
    const blob = await (await fetch(url)).blob();
    return uploadWithProgress(new File([blob], `background-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`, { type: blob.type || 'image/jpeg' }), () => undefined);
  }
  throw new Error('The background image came back in an unusable form.');
}

export async function transparentCutout(blob: Blob, onStatus?: (text: string) => void): Promise<string> {
  const result = await prepareSpeakerCutout(blob, 2, onStatus);
  if (result.route === 'pixel' && result.url) return result.url;
  throw new Error(`A clean person matte could not be made for this clip. ${result.note.replace(/^Speaker cut out · /, '')}`);
}

// ---------------------------------------------------------------------------
// veh-render
// ---------------------------------------------------------------------------

function renderError(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return 'The render farm stopped without giving a reason.';
  if (/https url is required/i.test(value)) return 'The render farm could not reach one of the source videos.';
  return `The render farm reported: ${value.slice(0, 200)}`;
}

export interface RenderOutcome { url: string; geometry: string; note: string | null }

/**
 * Submit (or resume) one veh-render job and poll it to completion.
 * `onSubmitted` runs as soon as an operation id exists so it can be persisted.
 */
export async function runRender(request: Record<string, unknown>, opts: {
  operationId?: string | null;
  geometry?: string | null;
  submittedAt?: number | null;
  onSubmitted: (operationId: string, geometry: string | null) => void | Promise<void>;
  onStage?: (text: string) => void;
  isCancelled?: () => boolean;
}): Promise<RenderOutcome> {
  let operationId = opts.operationId || '';
  let geometry = opts.geometry || null;
  const submittedAt = opts.submittedAt || Date.now();
  if (!operationId) {
    opts.onStage?.('Submitting to the render farm');
    const started: any = await callHook('veh-render', { ...request, budgetMs: RENDER_POLL_BUDGET_MS });
    if (started?.status === 'complete' && started.renderUrl) return { url: String(started.renderUrl), geometry: String(started.geometry || ''), note: started.note ? String(started.note) : null };
    if (started?.status === 'failed' || !started?.operationId) throw new Error(renderError(started?.error));
    operationId = String(started.operationId);
    geometry = started.geometry ? String(started.geometry) : null;
    await opts.onSubmitted(operationId, geometry);
  }
  let misses = 0;
  for (;;) {
    if (opts.isCancelled?.()) throw new Error('The render was cancelled.');
    if (Date.now() - submittedAt > RENDER_TIMEOUT_MS) throw new Error('The render took longer than 45 minutes and was stopped.');
    let status: any;
    try {
      status = await callHook('veh-render', { operationId, geometry, aspect: request.aspect, budgetMs: RENDER_POLL_BUDGET_MS });
      misses = 0;
    } catch {
      misses += 1;
      opts.onStage?.(`Reconnecting to the render service (attempt ${misses})`);
      if (misses > 12) throw new Error('The render service stopped answering. Press Retry to reconnect.');
      await wait(Math.min(60000, 4000 * misses));
      continue;
    }
    if (status?.status === 'complete' && status.renderUrl) return { url: String(status.renderUrl), geometry: String(status.geometry || geometry || ''), note: status.note ? String(status.note) : null };
    if (status?.status === 'failed') throw new Error(renderError(status.error));
    opts.onStage?.('Rendering on the render farm');
    await wait(2500);
  }
}
