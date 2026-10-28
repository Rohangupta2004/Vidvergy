import { callHook, getWorkspaceToken, WORKSPACE_ID } from './workspace';

export const MOTION_API_VERSION = 'v1' as const;
export const MOTION_PROJECT_SCHEMA_VERSION = '1.0' as const;

export type MotionAspect = '16:9' | '9:16' | '1:1';
export type MotionOperation =
  | 'capabilities' | 'estimate' | 'list' | 'create' | 'analyze' | 'plan'
  | 'generate' | 'edit' | 'revise' | 'render' | 'status' | 'cancel'
  | 'retry' | 'listVersions' | 'restoreVersion' | 'export';

export type MotionJobStatus =
  | 'motion_queued' | 'motion_analyzing' | 'motion_planning' | 'motion_assets'
  | 'motion_coding' | 'awaiting_approval' | 'queued' | 'compiling' | 'rendering'
  | 'finishing' | 'visual_quality_check' | 'visual_repair' | 'complete'
  | 'failed' | 'cancelled';

export interface MotionWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface MotionTranscript {
  text?: string;
  transcript?: string;
  words: MotionWord[];
  provider: 'deepgram' | 'nova-3' | 'heygen' | 'user_verified' | 'sceneforge_timing_estimate' | string;
  model?: string;
  provenance?: Record<string, unknown>;
}

export interface MotionSourceMedia {
  id: string;
  kind: 'video' | 'avatar_video' | 'screen_recording' | 'screenshot' | 'image'
    | 'audio' | 'website' | 'approved_render' | 'reference' | string;
  url?: string;
  mimeType?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  approved?: boolean;
  provenance?: Record<string, unknown>;
}

export interface MotionScene {
  id: string;
  startSec: number;
  endSec: number;
  purpose?: string;
  speechAnchors?: string[];
  visualDecision?: string;
  tool?: 'remotion' | 'existing_media' | 'generate_image' | 'generate_video' | 'stock';
  placement?: string;
  assetIds?: string[];
  [key: string]: unknown;
}

export interface MotionTrack {
  id: string;
  kind: 'video' | 'audio' | 'motion' | 'captions' | 'overlay' | string;
  sourceId?: string;
  muted?: boolean;
  locked?: boolean;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface MotionLayer {
  id?: string;
  kind?: string;
  label?: string;
  startSec?: number;
  endSec?: number;
  visible?: boolean;
  locked?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  style?: Record<string, unknown>;
  animation?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GlobalArtDirection {
  version?: number;
  concept?: string;
  palette?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  motionLanguage?: string;
  lightingAndGrade?: string;
  characterRules?: string;
  safeAreas?: Record<string, unknown>;
  references?: unknown[];
  locked?: boolean;
}

export interface MotionProject {
  id: number;
  schemaVersion: string;
  version: number;
  app: string;
  name: string;
  status: string;
  aspectRatio: MotionAspect;
  frameRate: number;
  brief: Record<string, unknown>;
  sourceMedia: MotionSourceMedia[];
  timeline: { version?: number; scenes?: MotionScene[]; tracks?: MotionTrack[]; [key: string]: unknown };
  transcript: MotionTranscript | Record<string, unknown>;
  graphicLayers: MotionLayer[];
  assets: Array<Record<string, unknown>>;
  brand: Record<string, unknown>;
  globalArtDirection: GlobalArtDirection;
  qaFindings: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  finalVideoUrl: string | null;
  compatibility: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MotionJob {
  id: string;
  apiVersion: string;
  projectId: string;
  operation: MotionOperation;
  kind: string;
  status: MotionJobStatus;
  stage: string;
  aspectRatio: MotionAspect;
  priority: number;
  checkpoints: Record<string, unknown>;
  cancelRequested: boolean;
  modelUsage: Array<Record<string, unknown>>;
  assetProvenance: Array<Record<string, unknown>>;
  degraded: boolean;
  result: Record<string, unknown> | null;
  videoUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MotionCapabilities {
  apiVersion: string;
  projectSchema: string;
  operations: MotionOperation[];
  aspects: Record<MotionAspect, { design: boolean; nativeExport: boolean; note?: string }>;
  models: Record<string, Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  security: Record<string, unknown>;
  concurrency: Record<string, unknown>;
}

export interface MotionCreateInput {
  app?: string;
  sourceApp?: string;
  name: string;
  prompt?: string;
  brief?: Record<string, unknown>;
  mode?: string;
  durationSeconds?: number;
  aspectRatio?: MotionAspect;
  targetPlatform?: string;
  sourceMedia?: MotionSourceMedia[];
  transcript?: MotionTranscript | Record<string, unknown>;
  timeline?: Record<string, unknown>;
  graphicLayers?: MotionLayer[];
  assets?: Array<Record<string, unknown>>;
  brand?: Record<string, unknown>;
  globalArtDirection?: GlobalArtDirection;
  compositionSource?: string;
  compatibility?: Record<string, unknown>;
  legacyRef?: { type: 'trackb' | 'sceneforge' | 'faceless' | 'video-enhancer' | string; id: string | number };
  autoStart?: boolean;
  startOperation?: 'analyze' | 'plan' | 'generate' | 'render';
  submittedBy?: string;
  job?: MotionJobInput;
}

export interface MotionJobInput {
  idempotencyKey?: string;
  billingAuthorized?: boolean;
  durationSeconds?: number;
  aspectRatio?: MotionAspect;
  mode?: string;
  priority?: number;
  submittedBy?: string;
  parallelAssets?: number;
  parallelScenes?: number;
  compositionTsx?: string;
  musicUrl?: string;
  dependencies?: Record<string, unknown>;
  providerLimits?: Record<string, unknown>;
}

export interface MotionResponse {
  ok: boolean;
  apiVersion?: string;
  project?: MotionProject;
  projects?: MotionProject[];
  job?: MotionJob;
  jobs?: MotionJob[];
  capabilities?: MotionCapabilities;
  estimate?: Record<string, unknown>;
  versions?: Array<Record<string, unknown>>;
  currentVersion?: number;
  deduplicated?: boolean;
  code?: string;
  error?: string;
}

export class MotionEngineError extends Error {
  code: string;
  constructor(message: string, code = 'motion_engine_error') {
    super(message);
    this.name = 'MotionEngineError';
    this.code = code;
  }
}

async function request<T extends MotionResponse = MotionResponse>(
  operation: MotionOperation,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const result = await callHook<T>('vv-motion-engine', {
    apiVersion: MOTION_API_VERSION,
    operation,
    ...payload,
  }, { signal });
  if (!result?.ok) throw new MotionEngineError(result?.error || 'The motion engine could not complete that operation.', result?.code);
  return result;
}

function operation(
  name: Exclude<MotionOperation, 'capabilities' | 'estimate' | 'list' | 'create' | 'status' | 'cancel' | 'retry' | 'listVersions' | 'restoreVersion'>,
) {
  return (projectId: number, job: MotionJobInput = {}, extra: Record<string, unknown> = {}, signal?: AbortSignal) =>
    request(name, { projectId, job, ...extra }, signal);
}

export const motionEngine = {
  capabilities: (signal?: AbortSignal) => request('capabilities', {}, signal),
  estimate: (input: { durationSeconds?: number; generatedSeconds?: number; assetRequests?: unknown[] }, signal?: AbortSignal) => request('estimate', input, signal),
  list: (limit = 20, signal?: AbortSignal) => request('list', { limit }, signal),
  create: (input: MotionCreateInput, signal?: AbortSignal) => request('create', input as unknown as Record<string, unknown>, signal),
  adoptSceneForge: (legacyId: string, input: Omit<MotionCreateInput, 'legacyRef'>, signal?: AbortSignal) =>
    request('create', { ...input, legacyRef: { type: 'sceneforge', id: legacyId } }, signal),
  adoptTrackB: (legacyId: number, input: Omit<MotionCreateInput, 'legacyRef'>, signal?: AbortSignal) =>
    request('create', { ...input, legacyRef: { type: 'trackb', id: legacyId } }, signal),
  analyze: operation('analyze'),
  plan: operation('plan'),
  generate: operation('generate'),
  edit: operation('edit'),
  revise: operation('revise'),
  render: operation('render'),
  export: operation('export'),
  status: (input: { projectId?: number; jobId?: string }, signal?: AbortSignal) => request('status', input, signal),
  cancel: (projectId: number, jobId: string, signal?: AbortSignal) => request('cancel', { projectId, jobId }, signal),
  retry: (projectId: number, jobId: string, job: MotionJobInput = {}, signal?: AbortSignal) => request('retry', { projectId, jobId, job }, signal),
  listVersions: (projectId: number, signal?: AbortSignal) => request('listVersions', { projectId }, signal),
  restoreVersion: (projectId: number, versionId: number, signal?: AbortSignal) => request('restoreVersion', { projectId, versionId }, signal),
};

export async function pollMotionJob(
  projectId: number,
  jobId: string,
  options: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number; onProgress?: (job: MotionJob, project?: MotionProject) => void } = {},
): Promise<MotionResponse> {
  const started = Date.now();
  const interval = Math.max(1000, options.intervalMs || 4000);
  const timeout = Math.max(interval, options.timeoutMs || 30 * 60 * 1000);
  for (;;) {
    if (options.signal?.aborted) throw new DOMException('Motion job polling was cancelled.', 'AbortError');
    const response = await motionEngine.status({ projectId, jobId }, options.signal);
    if (response.job) options.onProgress?.(response.job, response.project);
    if (response.job && ['complete', 'failed', 'cancelled', 'awaiting_approval'].includes(response.job.status)) return response;
    if (Date.now() - started >= timeout) throw new MotionEngineError('The motion job is still running in the background. Reopen it from the project list to continue watching.', 'poll_timeout');
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, interval);
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
    });
  }
}

/** Read real media metadata in the browser; the returned provenance makes it explicit that values were measured, not inferred. */
export function inspectVideoMetadata(url: string): Promise<Pick<MotionSourceMedia, 'durationSec' | 'width' | 'height' | 'provenance'>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => reject(new MotionEngineError('Video metadata timed out.', 'metadata_timeout')), 20000);
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve({
        durationSec: Number.isFinite(video.duration) ? video.duration : undefined,
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        provenance: { source: 'browser_media_metadata', verifiedAt: new Date().toISOString() },
      });
    };
    video.onerror = () => { window.clearTimeout(timer); reject(new MotionEngineError('The source video metadata could not be read.', 'metadata_failed')); };
    video.src = url;
  });
}

/**
 * Obtain genuine Deepgram word timings for SceneForge's already-generated audio.
 * The browser supplies bytes directly to the documented multipart endpoint; no token is persisted in project state.
 */
export async function transcribeAudioUrls(
  clips: Array<{ url: string; durationSec?: number }>,
  options: { language?: string; signal?: AbortSignal } = {},
): Promise<MotionTranscript> {
  const token = await getWorkspaceToken();
  if (!token) throw new MotionEngineError('Your workspace session is not ready for timestamped transcription.', 'workspace_token_required');
  const words: MotionWord[] = [];
  const transcripts: string[] = [];
  let offset = 0;
  const evidence: Array<Record<string, unknown>> = [];
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const audioResponse = await fetch(clip.url, { signal: options.signal });
    if (!audioResponse.ok) throw new MotionEngineError(`Audio ${index + 1} could not be read for transcription.`, 'audio_fetch_failed');
    const audio = await audioResponse.blob();
    const form = new FormData();
    form.append('audio', audio, `sceneforge-${index + 1}.${audio.type.includes('wav') ? 'wav' : 'mp3'}`);
    if (options.language) form.append('language', options.language);
    const response = await fetch(`/api/workspaces/${WORKSPACE_ID}/audio/transcribe-timestamped`, {
      method: 'POST',
      headers: { 'X-Workspace-DB-Token': token },
      body: form,
      signal: options.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !Array.isArray(result.words)) {
      throw new MotionEngineError(String(result?.error || `Timestamped transcription failed (HTTP ${response.status}).`), String(result?.code || 'transcription_failed'));
    }
    result.words.forEach((entry: any) => {
      const start = Number(entry.start);
      const end = Number(entry.end);
      const word = String(entry.word || entry.punctuated_word || '').trim();
      if (word && Number.isFinite(start) && Number.isFinite(end)) words.push({ word, start: offset + start, end: offset + end, confidence: Number(entry.confidence) || undefined });
    });
    transcripts.push(String(result.transcript || '').trim());
    const measured = Number(result.duration);
    const clipDuration = Number.isFinite(measured) && measured > 0 ? measured : Math.max(0, Number(clip.durationSec) || 0);
    evidence.push({ index, provider: result.provider || 'deepgram', model: result.model || 'nova-3', durationSec: clipDuration, wordCount: result.words.length });
    offset += clipDuration;
  }
  if (!words.length) throw new MotionEngineError('Timestamped transcription returned no words.', 'transcription_empty');
  return {
    text: transcripts.filter(Boolean).join(' '),
    words,
    provider: 'deepgram',
    model: 'nova-3',
    provenance: { verified: true, clips: evidence, createdAt: new Date().toISOString() },
  };
}
