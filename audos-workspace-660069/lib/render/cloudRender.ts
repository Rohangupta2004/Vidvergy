/**
 * Shared cloud Remotion client.
 *
 * This is the only module that may call POST /api/render/remotion. Every app
 * submits its own self-contained composition through this client, then polls
 * the platform job for a durable MP4 URL. The platform renders only
 * 1920x1080 at 30fps; portrait/square delivery is finished by the overlay
 * compositor after the landscape master completes.
 *
 * Billing/queue contract:
 * - each accepted Remotion render costs $0.05 from the workspace wallet;
 * - only one render is submitted at a time in this browser/workspace;
 * - an identical in-flight request reuses its operation id, avoiding an
 *   accidental second charge;
 * - each POST replaces the composition used by Otto's demo-video renderer.
 */
import { WORKSPACE_ID, getSessionId, getWorkspaceToken, refreshWorkspaceSession } from '../workspace';
import { poll } from '../poll';

export type Aspect = '9:16' | '16:9' | '1:1';
export type CloudRenderPhase = 'queued' | 'submitting' | 'pending' | 'rendering' | 'finishing' | 'complete';
export type CloudRenderStatusHandler = (phase: CloudRenderPhase, detail?: string) => void;

export const CLOUD_RENDER_COST_USD = 0.05;
export const CLOUD_RENDER_MAX_SECONDS = 180;
export const CLOUD_RENDER_MAX_FRAMES = CLOUD_RENDER_MAX_SECONDS * 30;
export const RENDER_FRAME = { width: 1920, height: 1080, fps: 30 } as const;
export const STAGE: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

const ALLOWED_COMPOSITION_IMPORTS = new Set([
  'react',
  'remotion',
  'framer-motion',
  'lucide-react',
  'zod',
  '@remotion/media-utils',
]);
const ACTIVE_RENDER_KEY = 'vidverge:cloud-remotion-active:v1';
const ACTIVE_RENDER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface ActiveRender {
  operationId: string;
  fingerprint: string;
  createdAt: number;
}

export function outputSize(aspect: Aspect): { width: number; height: number } {
  return aspect === '16:9' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

export function needsPortraitFinish(aspect: Aspect): boolean {
  return aspect !== '16:9';
}

export function stageTransform(aspect: Aspect): Record<string, string | number> {
  const stage = STAGE[aspect];
  const scale = Math.min(RENDER_FRAME.width / stage.width, RENDER_FRAME.height / stage.height);
  return {
    position: 'absolute', left: '50%', top: '50%',
    width: `${stage.width}px`, height: `${stage.height}px`,
    transform: `translate(-50%, -50%) scale(${scale})`,
    transformOrigin: 'center center', overflow: 'hidden',
  };
}

export function framesFor(seconds: number, fps = RENDER_FRAME.fps): number {
  return Math.max(1, Math.min(CLOUD_RENDER_MAX_FRAMES, Math.round(seconds * fps)));
}

export interface RenderRequest {
  compositionTsx: string;
  props?: Record<string, unknown>;
  durationInFrames?: number;
  durationSeconds?: number;
  fps?: number;
  aspect: Aspect;
  musicUrl?: string;
  musicVolume?: number;
}

export interface SubmitRenderOptions {
  token?: string;
  signal?: AbortSignal;
  onStatus?: CloudRenderStatusHandler;
  /** How long this request may wait behind an earlier render. */
  queueTimeoutMs?: number;
}

export interface RenderResult {
  status: 'complete';
  videoUrl: string;
  operationId: string;
  aspect: Aspect;
  width: number;
  height: number;
  durationInFrames: number;
  portraitFinished: boolean;
}

export class RenderError extends Error {
  stage: 'validate' | 'queue' | 'submit' | 'poll' | 'finish';
  operationId?: string;
  constructor(message: string, stage: RenderError['stage'], operationId?: string) {
    super(message);
    this.name = 'RenderError';
    this.stage = stage;
    this.operationId = operationId;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function normalizeOptions(tokenOrOptions?: string | SubmitRenderOptions): SubmitRenderOptions {
  return typeof tokenOrOptions === 'string' ? { token: tokenOrOptions } : (tokenOrOptions || {});
}

async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}, explicitToken?: string): Promise<Response> {
  const send = async (): Promise<Response> => {
    const token = explicitToken || await getWorkspaceToken();
    const sessionId = getSessionId();
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('X-Workspace-DB-Token', token);
    if (sessionId) headers.set('X-Session-Id', sessionId);
    headers.set('X-App-Id', typeof window !== 'undefined' ? String(window.__APP_ID__ || window.__SPACE_ID__ || 'workspace-660069') : 'workspace-660069');
    return fetch(input, { ...init, credentials: 'include', headers });
  };
  let response = await send();
  if (response.status === 401 || response.status === 403) {
    await refreshWorkspaceSession();
    response = await send();
  }
  return response;
}

export function auditCompositionImports(compositionTsx: string): string[] {
  const imports = new Set<string>();
  const source = String(compositionTsx || '');
  const pattern = /(?:from\s*|import\s*)['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) imports.add(match[1]);
  return [...imports].filter((name) => !ALLOWED_COMPOSITION_IMPORTS.has(name));
}

export function assertCloudCompatibleComposition(compositionTsx: string): void {
  if (!String(compositionTsx || '').trim()) throw new RenderError('The Remotion composition is empty.', 'validate');
  const unsupported = auditCompositionImports(compositionTsx);
  if (unsupported.length) {
    throw new RenderError(`Cloud Remotion cannot import: ${unsupported.join(', ')}. Inline the code or use an allowed package.`, 'validate');
  }
}

function fingerprintRequest(request: RenderRequest, durationInFrames: number): string {
  const text = JSON.stringify({
    compositionTsx: request.compositionTsx,
    props: request.props || {},
    durationInFrames,
    aspect: request.aspect,
  });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readActiveRender(): ActiveRender | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVE_RENDER_KEY) || 'null');
    if (!parsed?.operationId || !parsed?.fingerprint || Date.now() - Number(parsed.createdAt || 0) > ACTIVE_RENDER_MAX_AGE_MS) {
      window.localStorage.removeItem(ACTIVE_RENDER_KEY);
      return null;
    }
    return parsed as ActiveRender;
  } catch { return null; }
}

function writeActiveRender(value: ActiveRender | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(ACTIVE_RENDER_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(ACTIVE_RENDER_KEY);
  } catch { /* queue persistence is best-effort */ }
}

function clearActiveRender(operationId: string): void {
  const active = readActiveRender();
  if (active?.operationId === operationId) writeActiveRender(null);
}

export function normalizeStatus(body: any): { state: 'pending' | 'rendering' | 'complete' | 'failed'; videoUrl: string; error: string } {
  const raw = String(body?.status || '').toLowerCase();
  const videoUrl = String(body?.videoUrl || body?.video_url || body?.downloadUrl || body?.renderUrl || '');
  const error = String(body?.error || body?.errorMessage || '');
  if (['complete', 'completed', 'done', 'succeeded'].includes(raw)) return { state: 'complete', videoUrl, error };
  if (['failed', 'error'].includes(raw)) return { state: 'failed', videoUrl, error: error || 'The render failed.' };
  if (['rendering', 'processing', 'running'].includes(raw)) return { state: 'rendering', videoUrl, error };
  return { state: 'pending', videoUrl, error };
}

export async function readRender(operationId: string, token?: string) {
  const res = await authenticatedFetch(`/api/render/remotion/${encodeURIComponent(operationId)}`, {}, token);
  const body = await res.json().catch(() => null);
  const status = normalizeStatus(body);
  if (status.state === 'complete' || status.state === 'failed') clearActiveRender(operationId);
  return status;
}

async function waitForQueueSlot(fingerprint: string, options: SubmitRenderOptions): Promise<string | null> {
  const deadline = Date.now() + (options.queueTimeoutMs ?? 60 * 60 * 1000);
  let delay = 2500;
  while (Date.now() < deadline) {
    const active = readActiveRender();
    if (!active) return null;
    if (active.fingerprint === fingerprint) {
      options.onStatus?.('queued', 'Reusing the identical in-flight render to avoid another $0.05 charge.');
      return active.operationId;
    }
    options.onStatus?.('queued', 'Another cloud render is ahead of this one. Renders run one at a time.');
    const status = await readRender(active.operationId, options.token).catch(() => null);
    if (status && (status.state === 'complete' || status.state === 'failed')) continue;
    await sleep(delay, options.signal);
    delay = Math.min(12_000, Math.round(delay * 1.25));
  }
  throw new RenderError('This render timed out while waiting in the cloud queue. No new render was submitted.', 'queue');
}

/** Submit once and persist the operation id so reloads can resume polling. */
export async function submitRender(request: RenderRequest, tokenOrOptions?: string | SubmitRenderOptions): Promise<{ operationId: string; durationInFrames: number }> {
  const options = normalizeOptions(tokenOrOptions);
  assertCloudCompatibleComposition(request.compositionTsx);
  const durationInFrames = request.durationInFrames ?? framesFor(request.durationSeconds ?? 10);
  if (!Number.isFinite(durationInFrames) || durationInFrames < 1 || durationInFrames > CLOUD_RENDER_MAX_FRAMES) {
    throw new RenderError(`Cloud Remotion compositions are limited to ${CLOUD_RENDER_MAX_SECONDS} seconds. Split this video into shorter chunks before rendering.`, 'validate');
  }
  const fingerprint = fingerprintRequest(request, durationInFrames);
  const reused = await waitForQueueSlot(fingerprint, options);
  if (reused) return { operationId: reused, durationInFrames };

  options.onStatus?.('submitting', 'Submitting the $0.05 cloud render.');
  // Platform contract: this call also replaces Otto's demo-video composition.
  const res = await authenticatedFetch('/api/render/remotion', {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: WORKSPACE_ID,
      compositionTsx: request.compositionTsx,
      props: { ...(request.props || {}), aspect: request.aspect },
      durationInFrames,
      fps: RENDER_FRAME.fps,
      width: RENDER_FRAME.width,
      height: RENDER_FRAME.height,
    }),
    signal: options.signal,
  }, options.token);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.operationId) {
    const funding = res.status === 402 ? ' The workspace wallet needs at least $0.05.' : '';
    throw new RenderError(String(body?.error || `The render service refused the job (HTTP ${res.status}).`) + funding, 'submit');
  }
  const operationId = String(body.operationId);
  writeActiveRender({ operationId, fingerprint, createdAt: Date.now() });
  options.onStatus?.('pending', 'Cloud render queued.');
  return { operationId, durationInFrames };
}

export async function finishPortrait(masterUrl: string, options: { musicUrl?: string; musicVolume?: number; durationSeconds?: number } = {}, token?: string): Promise<string> {
  const res = await authenticatedFetch(`/api/workspaces/${WORKSPACE_ID}/videos/overlay`, {
    method: 'POST',
    body: JSON.stringify({
      base_video_url: masterUrl,
      overlays: [],
      dimensions: { width: 1080, height: 1920 },
      output_format: 'mp4',
      ...(options.durationSeconds ? { duration_seconds: options.durationSeconds } : {}),
      ...(options.musicUrl ? { music_url: options.musicUrl, music_volume: options.musicVolume ?? 0.2 } : {}),
    }),
  }, token);
  const body = await res.json().catch(() => null);
  if (!body?.success || !body?.overlayUrl) throw new RenderError(String(body?.error || `Portrait conversion failed (HTTP ${res.status}).`), 'finish');
  return String(body.overlayUrl);
}

export async function renderToMp4(request: RenderRequest, options: SubmitRenderOptions = {}): Promise<RenderResult> {
  const { operationId, durationInFrames } = await submitRender(request, options);
  const final = await poll(() => readRender(operationId, options.token), {
    interval: 4_000,
    timeout: 30 * 60 * 1_000,
    backoff: 1.15,
    maxInterval: 15_000,
    signal: options.signal,
    until: (s) => s.state === 'complete' || s.state === 'failed',
    onTick: (s) => options.onStatus?.(s.state === 'rendering' ? 'rendering' : 'pending', s.state === 'rendering' ? 'Rendering in the cloud…' : 'Waiting in the cloud queue…'),
  });
  if (final.state === 'failed' || !final.videoUrl) throw new RenderError(final.error || 'The render finished without producing a video.', 'poll', operationId);

  let videoUrl = final.videoUrl;
  let portraitFinished = false;
  if (needsPortraitFinish(request.aspect)) {
    options.onStatus?.('finishing', 'Preparing the portrait MP4…');
    videoUrl = await finishPortrait(videoUrl, {
      musicUrl: request.musicUrl,
      musicVolume: request.musicVolume,
      durationSeconds: durationInFrames / RENDER_FRAME.fps,
    }, options.token);
    portraitFinished = true;
  }
  const size = outputSize(request.aspect);
  options.onStatus?.('complete', 'Cloud MP4 ready.');
  return { status: 'complete', videoUrl, operationId, aspect: request.aspect, width: size.width, height: size.height, durationInFrames, portraitFinished };
}
