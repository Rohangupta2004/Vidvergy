/**
 * Video Enhancer — browser I/O: upload with real progress, metadata probing,
 * frame analysis for auto enhance, poster capture and downloads.
 */
import { WORKSPACE_ID, getSessionId, getWorkspaceToken, refreshWorkspaceSession, spaceId, workspaceFetch } from '../../../lib/workspace';
import type { FrameAnalysis } from './enhanceModel';

const BUFFERED_UPLOAD_BYTES = 50 * 1024 * 1024;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

class UploadError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function xhrSend(opts: {
  method: 'POST' | 'PUT';
  url: string;
  body: Document | XMLHttpRequestBodyInit;
  headers: Record<string, string>;
  credentials: boolean;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url, true);
    xhr.withCredentials = opts.credentials;
    for (const [key, value] of Object.entries(opts.headers)) if (value) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) opts.onProgress(event.loaded / event.total); };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || '' });
    xhr.onerror = () => reject(new UploadError('The connection dropped during upload.', 0, true));
    xhr.ontimeout = () => reject(new UploadError('The upload timed out.', 0, true));
    xhr.onabort = () => reject(new UploadError('Upload cancelled.', 0, false));
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(opts.body);
  });
}

function parseJson(text: string): any {
  try { return JSON.parse(text); } catch { return null; }
}

async function uploadBuffered(file: File, onProgress: (f: number) => void, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('workspaceId', WORKSPACE_ID);
  form.append('folder', 'video-enhancer');
  const send = async () => xhrSend({
    method: 'POST',
    url: '/api/upload/file',
    body: form,
    headers: { 'X-Workspace-DB-Token': await getWorkspaceToken(), 'X-Session-Id': getSessionId(), 'X-App-Id': spaceId() },
    credentials: true,
    onProgress,
    signal,
  });
  let res = await send();
  if (res.status === 401 || res.status === 403) {
    await refreshWorkspaceSession();
    res = await send();
  }
  const data = parseJson(res.text);
  if (res.status >= 200 && res.status < 300 && data?.success && data.url) return String(data.url);
  const detail = typeof data?.error === 'string' ? data.error : '';
  throw new UploadError(detail || `The upload was refused (HTTP ${res.status}).`, res.status, res.status >= 500 || res.status === 429);
}

async function uploadSigned(file: File, onProgress: (f: number) => void, signal?: AbortSignal): Promise<string> {
  const contentType = file.type || 'video/mp4';
  const grantRes = await workspaceFetch('/api/upload/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: file.size, contentType }),
    signal,
  });
  const grant = await grantRes.json().catch(() => null);
  if (!grantRes.ok || !grant?.uploadUrl) {
    const code = String(grant?.error || '');
    if (grantRes.status === 404 || /app_context_not_found/i.test(code)) {
      throw new UploadError('Files over 50 MB need the large-upload channel, which this page cannot use yet. Trim or compress the video to under 50 MB and add it again.', grantRes.status, false);
    }
    throw new UploadError(code || `The large upload could not be authorised (HTTP ${grantRes.status}).`, grantRes.status, grantRes.status >= 500);
  }
  const put = await xhrSend({
    method: 'PUT',
    url: String(grant.uploadUrl),
    body: file,
    headers: { 'Content-Type': contentType, 'x-goog-content-length-range': `${file.size},${file.size}`, 'x-goog-if-generation-match': '0' },
    credentials: false,
    onProgress,
    signal,
  });
  if (put.status < 200 || put.status >= 300) throw new UploadError(`The large upload failed (HTTP ${put.status}).`, put.status, put.status >= 500 || put.status === 0);
  return String(grant.uploadUrl).split('?')[0];
}

/** Durable public URL for the file. Retries dropped connections and 5xx twice. */
export async function uploadWithProgress(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  let lastError: unknown = null;
  for (const delay of [0, 2500, 6000]) {
    if (delay) await wait(delay);
    if (signal?.aborted) break;
    try {
      onProgress(0);
      return file.size <= BUFFERED_UPLOAD_BYTES
        ? await uploadBuffered(file, onProgress, signal)
        : await uploadSigned(file, onProgress, signal);
    } catch (error) {
      lastError = error;
      if (!(error instanceof UploadError) || !error.retryable) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The upload failed.');
}

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
}

/** `cors` is only for pixel reads; hosts without CORS headers refuse a crossOrigin element outright. */
function makeVideo(url: string, cors = false): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (cors && isRemote(url)) video.crossOrigin = 'anonymous';
  video.src = url;
  return video;
}

function once(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('decode')); };
    const cleanup = () => { window.clearTimeout(timer); video.removeEventListener(event, ok); video.removeEventListener('error', bad); };
    video.addEventListener(event, ok, { once: true });
    video.addEventListener('error', bad, { once: true });
  });
}

export interface ProbeResult { duration: number; width: number; height: number }

export async function probeVideo(url: string): Promise<ProbeResult> {
  const video = makeVideo(url);
  video.preload = 'metadata';
  try {
    await once(video, 'loadedmetadata', 25000);
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Some WebM files report Infinity until the end is touched.
      try { video.currentTime = 1e7; await once(video, 'durationchange', 8000); duration = video.duration; } catch { /* keep Infinity */ }
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error('This file has no video track your browser can decode. Try an H.264 MP4.');
    return { duration: Number.isFinite(duration) ? duration : 0, width: video.videoWidth, height: video.videoHeight };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'timeout') throw new Error('The video took too long to open. Check the file and try again.');
    if (message === 'decode') throw new Error('Your browser cannot decode this video. Export it as an H.264 MP4 and try again.');
    throw error;
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

export interface AnalyseResult { analysis: FrameAnalysis | null; poster: string | null }

/**
 * Samples eight frames across the clip on a small canvas. Measures exposure,
 * tonal spread, saturation and colour cast for auto enhance, and keeps a tiny
 * JPEG poster for the queue. Cross-origin sources without CORS return nulls.
 */
export async function analyseVideo(url: string, duration: number): Promise<AnalyseResult> {
  const video = makeVideo(url, true);
  try {
    await once(video, 'loadeddata', 25000);
    const w = 96;
    const h = Math.max(1, Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { analysis: null, poster: null };
    const lumas: number[] = [];
    let satSum = 0;
    let warmSum = 0;
    let count = 0;
    let poster: string | null = null;
    const span = Math.max(0.1, duration || video.duration || 1);
    const points = [0.06, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9];
    for (let index = 0; index < points.length; index += 1) {
      const t = Math.min(span - 0.05, Math.max(0, span * points[index]));
      try {
        video.currentTime = t;
        await once(video, 'seeked', 8000);
      } catch { continue; }
      ctx.drawImage(video, 0, 0, w, h);
      let data: Uint8ClampedArray;
      try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { analysis: null, poster: null }; }
      for (let p = 0; p < data.length; p += 8) {
        const r = data[p] / 255;
        const g = data[p + 1] / 255;
        const b = data[p + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        lumas.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
        satSum += max <= 0 ? 0 : (max - min) / max;
        warmSum += r - b;
        count += 1;
      }
      if (index === 1 && !poster) {
        const pc = document.createElement('canvas');
        pc.width = 160;
        pc.height = Math.max(1, Math.round((160 * video.videoHeight) / Math.max(1, video.videoWidth)));
        pc.getContext('2d')?.drawImage(video, 0, 0, pc.width, pc.height);
        try { poster = pc.toDataURL('image/jpeg', 0.62); } catch { poster = null; }
      }
    }
    if (!count) return { analysis: null, poster };
    const sorted = lumas.sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
    const p5 = pick(0.05);
    const p95 = pick(0.95);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    return {
      analysis: { luma: mean, spread: p95 - p5, saturation: satSum / count, warmth: warmSum / count, p5, p95, samples: points.length },
      poster,
    };
  } catch {
    return { analysis: null, poster: null };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Stream-copies a finished render into the workspace's own storage, which
 * serves CORS headers (the render farm bucket does not), so downloads, size
 * and pixel reads work. Returns null when the copy is unavailable.
 */
export async function persistMaster(url: string, durationSec: number): Promise<string | null> {
  if (!(durationSec > 0)) return null;
  try {
    const res = await workspaceFetch('/api/video/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrlOrKey: url, startSec: 0, endSec: Math.round(durationSec * 1000) / 1000, workspaceId: WORKSPACE_ID }),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data?.success && /^https:\/\//.test(String(data.url || '')) ? String(data.url) : null;
  } catch {
    return null;
  }
}

/** Content-Length of a stored file, or null when the host does not expose it. */
export async function remoteSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const length = Number(res.headers.get('content-length'));
    return res.ok && Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

/**
 * Saves the original-quality MP4 under a readable name. Streams with progress
 * when the storage host allows it, otherwise opens the file in a new tab.
 */
export async function downloadFile(url: string, fileName: string, onProgress?: (fraction: number) => void): Promise<'saved' | 'opened'> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total) onProgress?.(received / total);
      }
    }
    const blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || 'video/mp4' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    return 'saved';
  } catch {
    window.open(url, '_blank', 'noopener');
    return 'opened';
  }
}
