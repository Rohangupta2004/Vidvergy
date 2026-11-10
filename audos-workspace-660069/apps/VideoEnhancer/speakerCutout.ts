import { runFfmpegJob } from '../../lib/ffmpeg-runtime';
import { uploadVideo } from './enhancerCore';

export type SpeakerCutoutRoute = 'pixel' | 'soft-box';
export interface SpeakerCutoutResult { route: SpeakerCutoutRoute; url?: string; note: string }
const cache = new Map<string, Promise<SpeakerCutoutResult>>();
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm';

const waitEvent = (target: HTMLMediaElement, name: string, timeout = 12000) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error(`Timed out waiting for ${name}.`)), timeout);
  const done = () => { window.clearTimeout(timer); target.removeEventListener(name, done); resolve(); };
  target.addEventListener(name, done, { once: true });
});

async function hashBlob(blob: Blob): Promise<string> {
  if (!crypto?.subtle) return `${blob.size}:${blob.type}`;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function featherMask(mask: Float32Array, width: number, height: number): ImageData {
  const output = new ImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = Math.round(Math.max(0, Math.min(1, Number(mask[index] || 0))) * 255);
    const offset = index * 4;
    output.data[offset] = alpha; output.data[offset + 1] = alpha; output.data[offset + 2] = alpha; output.data[offset + 3] = 255;
  }
  return output;
}

async function matteVideo(file: Blob, softness: number, onStatus?: (value: string) => void): Promise<Blob> {
  const moduleUrl = MODULE_URL;
  const vision: any = await import(/* @vite-ignore */ moduleUrl);
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
  const segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
  });
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = sourceUrl;
  await waitEvent(video, 'loadedmetadata');
  const sourceW = video.videoWidth || 720; const sourceH = video.videoHeight || 1280;
  const scale = Math.min(1, 512 / Math.max(sourceW, sourceH));
  const width = Math.max(2, Math.round(sourceW * scale)); const height = Math.max(2, Math.round(sourceH * scale));
  const frame = document.createElement('canvas'); frame.width = width; frame.height = height;
  const frameContext = frame.getContext('2d', { willReadFrequently: true });
  const matte = document.createElement('canvas'); matte.width = width; matte.height = height;
  const matteContext = matte.getContext('2d');
  const rawMask = document.createElement('canvas'); rawMask.width = width; rawMask.height = height;
  const rawMaskContext = rawMask.getContext('2d');
  if (!frameContext || !matteContext || !rawMaskContext) throw new Error('Canvas segmentation is unavailable.');
  const stream = matte.captureStream(15);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_600_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const done = new Promise<Blob>((resolve, reject) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType })); recorder.onerror = () => reject(new Error('Mask recording failed.')); });
  recorder.start(500);
  const duration = Math.max(.1, Number(video.duration) || 3);
  for (let index = 0, at = 0; at < duration; index += 1, at = index / 15) {
    video.currentTime = Math.min(duration - .01, Math.max(.001, at));
    await waitEvent(video, 'seeked', 5000).catch(() => undefined);
    frameContext.drawImage(video, 0, 0, width, height);
    const result = segmenter.segmentForVideo(frame, Math.round(at * 1000));
    const confidence = result?.confidenceMasks?.[0]?.getAsFloat32Array?.() as Float32Array | undefined;
    if (!confidence) throw new Error('MediaPipe returned no person matte.');
    rawMaskContext.putImageData(featherMask(confidence, width, height), 0, 0);
    matteContext.clearRect(0, 0, width, height);
    matteContext.filter = softness > 0 ? `blur(${Math.min(8, softness)}px)` : 'none';
    matteContext.drawImage(rawMask, 0, 0);
    matteContext.filter = 'none';
    if (index % 30 === 0) onStatus?.(`Preparing cut-out… ${Math.min(99, Math.round((at / duration) * 100))}%`);
    await new Promise((resolve) => window.setTimeout(resolve, 67));
  }
  recorder.stop();
  const blob = await done;
  try { segmenter.close?.(); } catch { /* released */ }
  URL.revokeObjectURL(sourceUrl);
  return blob;
}

async function verifyBehind(url: string): Promise<boolean> {
  try {
    const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.src = url;
    await waitEvent(video, 'loadeddata');
    video.currentTime = Math.min(.6, Math.max(.05, (Number(video.duration) || 1) / 3));
    await waitEvent(video, 'seeked').catch(() => undefined);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d'); if (!context) return true;
    context.fillStyle = '#0A0A0A'; context.fillRect(0, 0, 512, 512);
    context.fillStyle = '#FFC23D'; context.font = '900 112px Impact, sans-serif'; context.textAlign = 'center'; context.fillText('CREATE', 256, 290);
    context.drawImage(video, 0, 0, 512, 512);
    const [meta, image] = canvas.toDataURL('image/jpeg', .82).split(',');
    const response = await fetch('/api/generate/vision', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': String((window as any).__workspaceDb?.token || '') }, body: JSON.stringify({ image, mimeType: /data:([^;]+)/.exec(meta || '')?.[1] || 'image/jpeg', prompt: 'Does the person cover part of the large word, with clean edges? Return JSON only: {"behind":boolean,"edges":"clean|rough"}.' }) });
    const payload = await response.json().catch(() => null); if (!response.ok || payload?.success === false) return true;
    const match = String(payload?.result || payload?.text || '').match(/\{[\s\S]*\}/); if (!match) return true;
    const verdict = JSON.parse(match[0]); return verdict.behind === true && verdict.edges === 'clean';
  } catch { return true; }
}

async function alphaMerge(source: Blob, mask: Blob): Promise<File> {
  const names = [`speaker-${Date.now()}.mp4`, `matte-${Date.now()}.webm`, `cutout-${Date.now()}.webm`];
  return runFfmpegJob(async (ff) => {
    await ff.writeFile(names[0], new Uint8Array(await source.arrayBuffer()));
    await ff.writeFile(names[1], new Uint8Array(await mask.arrayBuffer()));
    await ff.exec(['-i', names[0], '-i', names[1], '-filter_complex', '[1:v][0:v]scale2ref[mask][base];[mask]format=gray[gray];[base][gray]alphamerge[out]', '-map', '[out]', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-row-mt', '1', '-deadline', 'realtime', names[2]]);
    const bytes = await ff.readFile(names[2]);
    return new File([bytes], 'speaker-cutout.webm', { type: 'video/webm' });
  }, { cleanup: names, label: 'Speaker alpha cut-out', timeoutMs: 8 * 60_000 });
}

export async function prepareSpeakerCutout(file: Blob, softness: number, onStatus?: (value: string) => void): Promise<SpeakerCutoutResult> {
  const hash = await hashBlob(file);
  const cacheKey = `${hash}:${Math.round(softness)}`;
  const previous = cache.get(cacheKey);
  if (previous) return previous;
  const work = (async (): Promise<SpeakerCutoutResult> => {
    try {
      onStatus?.('Preparing cut-out…');
      const mask = await matteVideo(file, softness, onStatus);
      const alpha = await alphaMerge(file, mask);
      const uploaded = await uploadVideo(alpha);
      const clean = await verifyBehind(uploaded.url);
      return clean ? { route: 'pixel', url: uploaded.url, note: 'Speaker cut out · free' } : { route: 'soft-box', note: 'Speaker cut out · soft box mode · free' };
    } catch (error) {
      return { route: 'soft-box', note: `Speaker cut out · soft box mode · free (${String((error as any)?.message || error).slice(0, 80)})` };
    }
  })();
  cache.set(cacheKey, work);
  return work;
}
