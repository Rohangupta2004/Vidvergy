/**
 * Video Enhancer — enhancement job queue.
 *
 * A module-level store (so jobs keep running while the UI re-renders or the
 * Editor tab is open) persisted twice: a localStorage cache for instant
 * restore, and the account-scoped `video_enhancer_jobs` table so in-flight
 * renders resume after a reload or on another device.
 *
 * Credits: the wallet has no hold/capture, so a job is charged right before it
 * is submitted and refunded automatically on every failure path (submit error,
 * render failure, timeout, interrupted submit). Only successful jobs keep
 * their charge. The idempotency key is persisted before the charge so a
 * reload can always settle a refund.
 */
import { useSyncExternalStore } from 'react';
import { callHook, getSessionEmail, getSessionId } from '../../../lib/workspace';
import {
  authorizeCredits, isCreditAuthorizationError, isInsufficientCreditsError, newChargeKey, refreshCredits, refundCreditsStrict,
} from '../../../lib/credits';
import { saveVideoToHistory } from '../../../lib/videoHistory';
import { analyseVideo, persistMaster, probeVideo, remoteSize, uploadWithProgress } from './enhanceIO';
import {
  OUTPUT_FPS, computeGrade, estimateCredits, normalizeSettings, planOutput, titleFromName, validateDuration, validateFile,
  type EnhanceSettings, type FrameAnalysis,
} from './enhanceModel';

export type JobStatus = 'draft' | 'queued' | 'processing' | 'done' | 'error';
export type FailureKind = 'source' | 'upload' | 'credits' | 'render' | 'timeout' | 'interrupted';

export interface JobSource {
  name: string;
  bytes: number;
  width: number;
  height: number;
  duration: number;
  fps: number | null;
  poster: string | null;
  url: string | null;
}

export interface JobOutput { width: number; height: number; duration: number; bytes: number | null; fps: number }
export interface JobBilling { entryKey: string | null; credits: number; state: 'none' | 'charged' | 'refunded' | 'refund_pending' }

export interface EnhanceJob {
  id: string;
  rowId: number | null;
  title: string;
  status: JobStatus;
  stage: string;
  createdAt: number;
  updatedAt: number;
  settings: EnhanceSettings;
  analysis: FrameAnalysis | null;
  analysing: boolean;
  source: JobSource;
  upload: { state: 'idle' | 'uploading' | 'done' | 'error'; progress: number };
  operationId: string | null;
  geometry: string | null;
  resultUrl: string | null;
  output: JobOutput | null;
  billing: JobBilling;
  error: string | null;
  failure: FailureKind | null;
  note: string | null;
  timing: { queuedAt?: number; submittedAt?: number; completedAt?: number };
}

const STORAGE_KEY = 'video-enhancer:enhance-jobs:v1';
const TABLE = 'video_enhancer_jobs';
const MAX_ACTIVE = 2;
const MAX_JOBS = 40;
const RENDER_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_BUDGET_MS = 15000;
const STAGE_RENDERING = 'Rendering on the render farm';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const readable = (error: unknown) => (error instanceof Error ? error.message : String(error || 'Unknown error')).slice(0, 240);
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function readLocal(): EnhanceJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((job) => job && typeof job.id === 'string').map((job) => ({ ...job, settings: normalizeSettings(job.settings) })) : [];
  } catch {
    return [];
  }
}

interface Snapshot { jobs: EnhanceJob[]; loaded: boolean }

let jobs: EnhanceJob[] = readLocal();
let loaded = false;
let loading = false;
let snapshot: Snapshot = { jobs, loaded };
const listeners = new Set<() => void>();
const running = new Set<string>();
const files = new Map<string, File>();
const previews = new Map<string, string>();
const persistTimers = new Map<string, number>();
const inserting = new Map<string, Promise<void>>();
let localTimer = 0;

function notify(): void {
  snapshot = { jobs, loaded };
  listeners.forEach((listener) => listener());
  window.clearTimeout(localTimer);
  localTimer = window.setTimeout(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_JOBS))); } catch { /* storage full or disabled */ }
  }, 400);
}

export function getJob(id: string): EnhanceJob | null {
  return jobs.find((job) => job.id === id) || null;
}

function patch(id: string, change: Partial<EnhanceJob> | ((job: EnhanceJob) => Partial<EnhanceJob>), persist = true): void {
  let found = false;
  jobs = jobs.map((job) => {
    if (job.id !== id) return job;
    found = true;
    const delta = typeof change === 'function' ? change(job) : change;
    return { ...job, ...delta, updatedAt: Date.now() };
  });
  if (!found) return;
  notify();
  if (persist) queuePersist(id);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function db(): any {
  return typeof window !== 'undefined' ? (window as any).__workspaceDb : null;
}

function accountId(): string {
  return getSessionEmail() || getSessionId();
}

function canPersist(): boolean {
  return Boolean(db()?.from && getSessionId().startsWith('wses_') && accountId());
}

function toRow(job: EnhanceJob): Record<string, unknown> {
  const { url: _url, ...sourceMeta } = job.source;
  return {
    user_id: accountId(),
    status: job.status,
    title: job.title,
    stage: job.stage,
    video_url: job.source.url,
    result_url: job.resultUrl,
    settings: { ...job.settings, analysis: job.analysis, clientId: job.id, clientUpdatedAt: job.updatedAt, createdAt: job.createdAt, uploadState: job.upload.state, failure: job.failure, note: job.note },
    operation_id: job.operationId,
    geometry: job.geometry,
    billing: job.billing,
    error_text: job.error,
    source_meta: sourceMeta,
    output_meta: job.output,
    timing: job.timing,
  };
}

function pickRow(result: any): any {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] || null;
  if (Array.isArray(result.data)) return result.data[0] || null;
  if (result.data && typeof result.data === 'object') return result.data;
  if (Array.isArray(result.rows)) return result.rows[0] || null;
  return result.id != null ? result : null;
}

function fromRow(row: any): EnhanceJob | null {
  if (!row || row.id == null) return null;
  const extra = row.settings && typeof row.settings === 'object' ? row.settings : {};
  const meta = row.source_meta && typeof row.source_meta === 'object' ? row.source_meta : {};
  const status: JobStatus = (['draft', 'queued', 'processing', 'done', 'error'] as JobStatus[]).includes(row.status) ? row.status : 'draft';
  const billing = row.billing && typeof row.billing === 'object' ? row.billing : {};
  const createdAt = Number(extra.createdAt) || Date.parse(row.created_at) || Date.now();
  return {
    id: String(extra.clientId || `row-${row.id}`),
    rowId: Number(row.id),
    title: String(row.title || titleFromName(String(meta.name || ''))),
    status,
    stage: String(row.stage || ''),
    createdAt,
    updatedAt: Number(extra.clientUpdatedAt) || Date.parse(row.updated_at) || createdAt,
    settings: normalizeSettings(extra),
    analysis: extra.analysis && typeof extra.analysis === 'object' ? extra.analysis : null,
    analysing: false,
    source: {
      name: String(meta.name || row.title || 'clip'),
      bytes: Number(meta.bytes) || 0,
      width: Number(meta.width) || 0,
      height: Number(meta.height) || 0,
      duration: Number(meta.duration) || 0,
      fps: Number(meta.fps) || null,
      poster: typeof meta.poster === 'string' ? meta.poster : null,
      url: row.video_url ? String(row.video_url) : null,
    },
    upload: { state: row.video_url ? 'done' : (extra.uploadState === 'uploading' ? 'uploading' : 'idle'), progress: row.video_url ? 1 : 0 },
    operationId: row.operation_id ? String(row.operation_id) : null,
    geometry: row.geometry ? String(row.geometry) : null,
    resultUrl: row.result_url ? String(row.result_url) : null,
    output: row.output_meta && typeof row.output_meta === 'object' ? row.output_meta : null,
    billing: {
      entryKey: billing.entryKey ? String(billing.entryKey) : null,
      credits: Number(billing.credits) || 0,
      state: (['none', 'charged', 'refunded', 'refund_pending'] as JobBilling['state'][]).includes(billing.state) ? billing.state : 'none',
    },
    error: row.error_text ? String(row.error_text) : null,
    failure: extra.failure || null,
    note: extra.note || null,
    timing: row.timing && typeof row.timing === 'object' ? row.timing : {},
  };
}

function queuePersist(id: string): void {
  window.clearTimeout(persistTimers.get(id));
  persistTimers.set(id, window.setTimeout(() => { void persistJob(id); }, 700));
}

async function persistJob(id: string): Promise<void> {
  window.clearTimeout(persistTimers.get(id));
  const pending = inserting.get(id);
  if (pending) await pending;
  const job = getJob(id);
  if (!job || !canPersist()) return;
  try {
    if (job.rowId) {
      await db().from(TABLE).update(job.rowId, toRow(job));
      return;
    }
    const insert = (async () => {
      const row = pickRow(await db().from(TABLE).insert(toRow(job)));
      const rowId = Number(row?.id);
      if (Number.isFinite(rowId) && rowId > 0) {
        jobs = jobs.map((entry) => (entry.id === id ? { ...entry, rowId } : entry));
        notify();
      }
    })();
    inserting.set(id, insert);
    try { await insert; } finally { inserting.delete(id); }
    const latest = getJob(id);
    if (latest?.rowId && latest.updatedAt > job.updatedAt) await db().from(TABLE).update(latest.rowId, toRow(latest));
  } catch (error) {
    console.warn('[VideoEnhancer] job could not be saved to your account:', error);
  }
}

export async function loadJobs(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    if (canPersist()) {
      const result = await db().from(TABLE, { shared: true }).eq('user_id', accountId()).orderBy('updated_at', 'desc').limit(80).get();
      const rows: any[] = Array.isArray(result?.data) ? result.data : [];
      const deleted = new Set(rows.filter((row) => row?.status === 'deleted').map((row) => Number(row.id)));
      const remote = rows.filter((row) => row?.status !== 'deleted').map(fromRow).filter(Boolean) as EnhanceJob[];
      const merged = jobs.filter((job) => !(job.rowId && deleted.has(job.rowId)));
      for (const incoming of remote) {
        const index = merged.findIndex((job) => job.id === incoming.id || (job.rowId && job.rowId === incoming.rowId));
        if (index < 0) merged.push(incoming);
        else if (!running.has(merged[index].id) && incoming.updatedAt >= merged[index].updatedAt) merged[index] = { ...incoming, id: merged[index].id };
        else if (!merged[index].rowId) merged[index] = { ...merged[index], rowId: incoming.rowId };
      }
      jobs = merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_JOBS);
    }
  } catch (error) {
    console.warn('[VideoEnhancer] job history could not be loaded:', error);
  } finally {
    loaded = true;
    loading = false;
    notify();
    resumeAll();
  }
}

function resumeAll(): void {
  for (const job of jobs) {
    if (running.has(job.id)) continue;
    if (job.billing.state === 'refund_pending') void settleRefund(job.id);
    if (job.upload.state === 'uploading' && !files.has(job.id)) {
      patch(job.id, { status: 'error', failure: 'upload', upload: { state: 'error', progress: 0 }, stage: 'Upload interrupted', error: 'The upload was interrupted when the page closed. Choose the same file again to continue.' });
      continue;
    }
    if (job.status === 'processing') {
      if (job.operationId) void run(job.id);
      else if (job.billing.state === 'charged') void refundAndFail(job.id, 'interrupted', 'The page closed before the render was submitted.');
      else patch(job.id, { status: 'queued', stage: 'Queued' });
    }
    if (job.analysing && !job.analysis && job.source.url) void analyse(job.id, job.source.url);
  }
  schedule();
}

export function useEnhanceJobs(): Snapshot {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot,
    () => snapshot,
  );
}

export function previewUrl(job: EnhanceJob): string | null {
  return previews.get(job.id) || job.source.url;
}

export function hasLocalFile(id: string): boolean {
  return files.has(id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (jobs.some((job) => job.upload.state === 'uploading')) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

// ---------------------------------------------------------------------------
// Adding sources
// ---------------------------------------------------------------------------

function blankJob(id: string, title: string, settings: EnhanceSettings, source: Partial<JobSource>): EnhanceJob {
  const now = Date.now();
  return {
    id, rowId: null, title, status: 'draft', stage: 'Reading video', createdAt: now, updatedAt: now,
    settings: normalizeSettings(settings), analysis: null, analysing: true,
    source: { name: title, bytes: 0, width: 0, height: 0, duration: 0, fps: null, poster: null, url: null, ...source },
    upload: { state: 'idle', progress: 0 }, operationId: null, geometry: null, resultUrl: null, output: null,
    billing: { entryKey: null, credits: 0, state: 'none' }, error: null, failure: null, note: null, timing: {},
  };
}

export function addFiles(list: File[], settings: EnhanceSettings): { added: string[]; rejected: string[] } {
  const added: string[] = [];
  const rejected: string[] = [];
  for (const file of list) {
    const problem = validateFile(file);
    if (problem) { rejected.push(problem); continue; }
    const id = uid();
    files.set(id, file);
    previews.set(id, URL.createObjectURL(file));
    jobs = [blankJob(id, titleFromName(file.name), settings, { name: file.name, bytes: file.size }), ...jobs];
    added.push(id);
  }
  if (added.length) notify();
  for (const id of added) void prepareLocal(id);
  return { added, rejected };
}

export function addFromLibrary(row: { title: string; video_url: string; thumbnail_url?: string | null; duration_sec?: number | null }, settings: EnhanceSettings): string | null {
  if (!/^https:\/\//i.test(row.video_url || '')) return null;
  const id = uid();
  const job = blankJob(id, titleFromName(row.title || 'Library video'), settings, { name: row.title || 'Library video', url: row.video_url, poster: row.thumbnail_url || null, duration: Number(row.duration_sec) || 0 });
  jobs = [{ ...job, upload: { state: 'done', progress: 1 } }, ...jobs];
  notify();
  void prepareRemote(id);
  return id;
}

export function replaceSource(id: string, file: File): string | null {
  const job = getJob(id);
  if (!job) return 'This job no longer exists.';
  const problem = validateFile(file);
  if (problem) return problem;
  const old = previews.get(id);
  if (old) URL.revokeObjectURL(old);
  files.set(id, file);
  previews.set(id, URL.createObjectURL(file));
  patch(id, { status: job.timing.queuedAt ? 'queued' : 'draft', error: null, failure: null, stage: 'Reading video', analysing: !job.analysis, source: { ...job.source, name: file.name, bytes: file.size, url: null }, upload: { state: 'idle', progress: 0 } });
  void prepareLocal(id);
  return null;
}

async function prepareLocal(id: string): Promise<void> {
  const local = previews.get(id);
  const job = getJob(id);
  if (!local || !job) return;
  try {
    const probe = await probeVideo(local);
    const problem = validateDuration(job.source.name, probe.duration);
    if (problem) {
      patch(id, { status: 'error', failure: 'source', stage: 'Not supported', error: problem, analysing: false, source: { ...job.source, ...probe } });
      return;
    }
    patch(id, (current) => ({ stage: current.status === 'queued' ? 'Waiting for upload' : 'Uploading', source: { ...current.source, width: probe.width, height: probe.height, duration: probe.duration }, billing: { ...current.billing, credits: estimateCredits(probe.duration) } }));
    void analyse(id, local);
    void uploadJob(id);
  } catch (error) {
    patch(id, { status: 'error', failure: 'source', stage: 'Not supported', analysing: false, error: readable(error) });
  }
}

async function prepareRemote(id: string): Promise<void> {
  const job = getJob(id);
  if (!job?.source.url) return;
  try {
    const probe = await probeVideo(job.source.url);
    const problem = validateDuration(job.source.name, probe.duration);
    if (problem) {
      patch(id, { status: 'error', failure: 'source', stage: 'Not supported', error: problem, analysing: false });
      return;
    }
    patch(id, (current) => ({ stage: 'Ready', source: { ...current.source, width: probe.width, height: probe.height, duration: probe.duration }, billing: { ...current.billing, credits: estimateCredits(probe.duration) } }));
    void analyse(id, job.source.url);
    void remoteSize(job.source.url).then((bytes) => { if (bytes) patch(id, (current) => ({ source: { ...current.source, bytes } })); });
  } catch (error) {
    patch(id, { status: 'error', failure: 'source', stage: 'Not supported', analysing: false, error: `This library video could not be opened: ${readable(error)}` });
  }
}

async function analyse(id: string, url: string): Promise<void> {
  const job = getJob(id);
  if (!job) return;
  patch(id, { analysing: true }, false);
  const result = await analyseVideo(url, job.source.duration);
  patch(id, (current) => ({ analysing: false, analysis: result.analysis || current.analysis, source: { ...current.source, poster: current.source.poster || result.poster } }));
}

async function uploadJob(id: string): Promise<void> {
  const file = files.get(id);
  if (!file) {
    patch(id, { status: 'error', failure: 'upload', upload: { state: 'error', progress: 0 }, stage: 'Upload needed', error: 'Choose the file again to upload it.' });
    return;
  }
  patch(id, { upload: { state: 'uploading', progress: 0 } });
  let lastShown = 0;
  try {
    const url = await uploadWithProgress(file, (fraction) => {
      if (fraction - lastShown < 0.01 && fraction < 1) return;
      lastShown = fraction;
      patch(id, (current) => ({ upload: { state: 'uploading', progress: fraction }, stage: current.status === 'queued' ? 'Uploading before render' : 'Uploading' }), false);
    });
    patch(id, (current) => ({ upload: { state: 'done', progress: 1 }, source: { ...current.source, url }, stage: current.status === 'queued' ? 'Queued' : 'Ready' }));
    schedule();
  } catch (error) {
    patch(id, { status: 'error', failure: 'upload', upload: { state: 'error', progress: 0 }, stage: 'Upload failed', error: `Upload failed: ${readable(error)}` });
  }
}

// ---------------------------------------------------------------------------
// Editing and lifecycle
// ---------------------------------------------------------------------------

export function isEditable(job: EnhanceJob): boolean {
  return job.status === 'draft' || job.status === 'error';
}

export function updateSettings(id: string, settings: EnhanceSettings): void {
  const job = getJob(id);
  if (job && isEditable(job)) patch(id, { settings: normalizeSettings(settings) });
}

export function applySettingsToDrafts(settings: EnhanceSettings): number {
  const targets = jobs.filter(isEditable);
  for (const job of targets) patch(job.id, { settings: normalizeSettings(settings) });
  return targets.length;
}

export type StartResult = 'ok' | 'needs-file' | 'not-ready' | 'busy';

export function startJob(id: string): StartResult {
  const job = getJob(id);
  if (!job) return 'not-ready';
  if (!isEditable(job)) return 'busy';
  if (job.failure === 'source') return 'not-ready';
  if (!job.source.url && !files.has(id)) return 'needs-file';
  if (!job.source.duration) return 'not-ready';
  const billing: JobBilling = job.billing.state === 'refund_pending'
    ? job.billing
    : { entryKey: job.billing.state === 'none' ? job.billing.entryKey : null, credits: estimateCredits(job.source.duration), state: job.billing.state === 'charged' ? 'charged' : 'none' };
  patch(id, {
    status: 'queued', error: null, failure: null, note: null, resultUrl: null, output: null,
    operationId: billing.state === 'charged' ? job.operationId : null,
    billing,
    stage: job.source.url ? 'Queued' : 'Waiting for upload',
    timing: { queuedAt: Date.now() },
  });
  if (!job.source.url && job.upload.state !== 'uploading') void uploadJob(id);
  schedule();
  return 'ok';
}

export function startAll(): number {
  let count = 0;
  for (const job of jobs.filter((entry) => entry.status === 'draft')) if (startJob(job.id) === 'ok') count += 1;
  return count;
}

export function cancelQueued(id: string): void {
  const job = getJob(id);
  if (job?.status === 'queued' && !running.has(id)) patch(id, { status: 'draft', stage: job.source.url ? 'Ready' : 'Uploading', timing: {} });
}

export function deleteJob(id: string): boolean {
  const job = getJob(id);
  if (!job || job.status === 'processing' || running.has(id)) return false;
  const local = previews.get(id);
  if (local) URL.revokeObjectURL(local);
  previews.delete(id);
  files.delete(id);
  jobs = jobs.filter((entry) => entry.id !== id);
  notify();
  if (job.rowId && canPersist()) {
    void Promise.resolve(db().from(TABLE).update(job.rowId, { status: 'deleted' })).catch((error: unknown) => console.warn('[VideoEnhancer] delete not saved:', error));
  }
  return true;
}

/** New draft from the same stored source, for re-running with new settings. */
export function duplicateJob(id: string): string | null {
  const job = getJob(id);
  if (!job?.source.url) return null;
  const copy = blankJob(uid(), job.title, job.settings, job.source);
  jobs = [{ ...copy, analysis: job.analysis, analysing: false, stage: 'Ready', upload: { state: 'done', progress: 1 }, billing: { entryKey: null, credits: estimateCredits(job.source.duration), state: 'none' } }, ...jobs];
  notify();
  queuePersist(copy.id);
  return copy.id;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function buildRenderRequest(job: EnhanceJob): Record<string, unknown> {
  const plan = planOutput(job.source);
  const grade = computeGrade(job.settings, job.analysis);
  return {
    aspect: plan.aspect,
    width: plan.width,
    height: plan.height,
    grade: grade.look,
    globalEffects: grade.effects,
    reframe: { mode: 'center' },
    clips: [{
      url: job.source.url, in: 0, out: job.source.duration, speed: 1, opacity: 1,
      brightness: grade.brightness, contrast: grade.contrast, saturation: grade.saturation,
      highlights: grade.highlights, shadows: grade.shadows, temperature: grade.temperature, tint: grade.tint,
      fit: 'contain', focusable: false, muted: job.settings.audio === 'mute', volume: 1, crop: { x: 0, y: 0, w: 1, h: 1 },
    }],
    captions: [],
    captionSettings: { enabled: false, burnIn: false },
    videoOverlays: [],
    textLayers: [],
    overlays: [],
    vfx: {},
    musicUrl: '',
  };
}

function renderError(raw: unknown): string {
  const text = String(raw || '').trim();
  if (!text) return 'The render farm stopped without giving a reason.';
  if (/https url is required/i.test(text)) return 'The render farm could not reach the uploaded source video.';
  return `The render farm reported: ${text.slice(0, 200)}`;
}

function schedule(): void {
  let slots = MAX_ACTIVE - jobs.filter((job) => job.status === 'processing').length;
  const waiting = jobs.filter((job) => job.status === 'queued' && job.source.url && job.upload.state === 'done' && !running.has(job.id))
    .sort((a, b) => (a.timing.queuedAt || 0) - (b.timing.queuedAt || 0));
  for (const job of waiting) {
    if (slots <= 0) break;
    slots -= 1;
    void run(job.id);
  }
}

function fail(id: string, kind: FailureKind, message: string, extra: Partial<EnhanceJob> = {}): void {
  patch(id, { status: 'error', failure: kind, error: message, stage: 'Failed', ...extra });
}

async function refundAndFail(id: string, kind: FailureKind, message: string): Promise<void> {
  const job = getJob(id);
  if (!job) return;
  if (job.billing.state !== 'charged' || !job.billing.entryKey) {
    fail(id, kind, `${message} No credits were charged.`);
    return;
  }
  patch(id, { billing: { ...job.billing, state: 'refund_pending' } });
  await persistJob(id);
  try {
    await refundCreditsStrict(job.billing.entryKey, `Video Enhancer ${kind}: ${message}`.slice(0, 180));
    const credits = job.billing.credits;
    fail(id, kind, `${message} ${credits ? `${credits} credit${credits === 1 ? '' : 's'} refunded.` : 'Nothing was charged.'}`, { billing: { ...job.billing, state: 'refunded' } });
    void refreshCredits();
  } catch {
    fail(id, kind, `${message} Your refund is pending and will be retried automatically.`);
  }
}

async function settleRefund(id: string): Promise<void> {
  const job = getJob(id);
  if (!job?.billing.entryKey || job.billing.state !== 'refund_pending') return;
  try {
    await refundCreditsStrict(job.billing.entryKey, 'Video Enhancer refund retry');
    patch(id, (current) => ({ billing: { ...current.billing, state: 'refunded' }, error: current.error ? current.error.replace('Your refund is pending and will be retried automatically.', 'Credits refunded.') : current.error }));
    void refreshCredits();
  } catch { /* retried on next load */ }
}

async function finish(id: string, result: { renderUrl: string; geometry?: string; note?: string }): Promise<void> {
  const job = getJob(id);
  if (!job) return;
  patch(id, { stage: 'Checking the output' });
  let url = String(result.renderUrl);
  const geometry = String(result.geometry || job.geometry || '');
  const match = /(\d{3,4})x(\d{3,4})/.exec(geometry);
  const output: JobOutput = { width: match ? Number(match[1]) : 0, height: match ? Number(match[2]) : 0, duration: job.source.duration, bytes: null, fps: OUTPUT_FPS };
  try {
    const probe = await probeVideo(url);
    output.width = probe.width;
    output.height = probe.height;
    if (probe.duration) output.duration = probe.duration;
  } catch { /* geometry from the render service is the fallback */ }
  patch(id, { stage: 'Saving the master copy' }, false);
  const durable = await persistMaster(url, output.duration);
  if (durable) url = durable;
  output.bytes = await remoteSize(url);
  patch(id, { status: 'done', stage: 'Done', resultUrl: url, output, geometry: geometry || null, note: result.note || null, error: null, failure: null, timing: { ...job.timing, completedAt: Date.now() } });
  void saveVideoToHistory({ appId: 'video-enhancer', title: `${job.title} (enhanced)`, videoUrl: url, thumbnailUrl: null, durationSec: Math.round(output.duration) });
  void refreshCredits();
}

async function run(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    let job = getJob(id);
    if (!job || !job.source.url) return;
    const plan = planOutput(job.source);
    patch(id, { status: 'processing', stage: job.operationId ? 'Reconnecting to the render' : 'Checking credits' });

    if (!job.operationId && job.billing.state !== 'charged') {
      const credits = estimateCredits(job.source.duration);
      const entryKey = job.billing.entryKey || newChargeKey('veh-enhance');
      patch(id, { billing: { entryKey, credits, state: 'none' } });
      await persistJob(id);
      try {
        const charge = await authorizeCredits({ seconds: job.source.duration, engine: 'remotion/render', options: { seconds: job.source.duration }, entryKey, source: 'video-enhancer-enhance', label: `Video Enhancer re-master · ${Math.round(job.source.duration)}s`, note: `Video Enhancer: ${Math.round(job.source.duration)}s source re-master` });
        patch(id, { billing: { entryKey, credits: charge.metered ? charge.charged : 0, state: 'charged' } });
        await persistJob(id);
      } catch (error) {
        const message = isInsufficientCreditsError(error)
          ? `Not enough credits: this enhancement needs ${error.required} and you have ${error.balance}. Top up, then press Retry.`
          : isCreditAuthorizationError(error) ? error.message : `Credits could not be confirmed: ${readable(error)}`;
        fail(id, 'credits', message, { billing: { entryKey: null, credits, state: 'none' } });
        return;
      }
    }

    job = getJob(id);
    if (!job) return;
    if (!job.operationId) {
      patch(id, { stage: 'Submitting to the render farm' });
      let started: any;
      try {
        started = await callHook('veh-render', { ...buildRenderRequest(job), budgetMs: POLL_BUDGET_MS });
      } catch (error) {
        await refundAndFail(id, 'render', `The render could not be started: ${readable(error)}.`);
        return;
      }
      if (started?.status === 'complete' && started.renderUrl) { await finish(id, started); return; }
      if (started?.status === 'failed' || !started?.operationId) { await refundAndFail(id, 'render', renderError(started?.error)); return; }
      patch(id, (current) => ({ operationId: String(started.operationId), geometry: started.geometry ? String(started.geometry) : null, stage: STAGE_RENDERING, timing: { ...current.timing, submittedAt: Date.now() } }));
      await persistJob(id);
    }

    let misses = 0;
    for (;;) {
      job = getJob(id);
      if (!job || job.status !== 'processing' || !job.operationId) return;
      const submittedAt = job.timing.submittedAt || job.updatedAt;
      if (Date.now() - submittedAt > RENDER_TIMEOUT_MS) {
        await refundAndFail(id, 'timeout', 'The render took longer than 45 minutes and was stopped.');
        return;
      }
      let status: any;
      try {
        status = await callHook('veh-render', { operationId: job.operationId, geometry: job.geometry, aspect: plan.aspect, budgetMs: POLL_BUDGET_MS });
        misses = 0;
      } catch {
        misses += 1;
        patch(id, { stage: `Reconnecting to the render service (attempt ${misses})` }, false);
        await wait(Math.min(60000, 4000 * misses));
        continue;
      }
      if (status?.status === 'complete' && status.renderUrl) { await finish(id, status); return; }
      if (status?.status === 'failed') { await refundAndFail(id, 'render', renderError(status.error)); return; }
      if (getJob(id)?.stage !== STAGE_RENDERING) patch(id, { stage: STAGE_RENDERING }, false);
      await wait(2500);
    }
  } catch (error) {
    await refundAndFail(id, 'render', `Something went wrong while processing: ${readable(error)}.`);
  } finally {
    running.delete(id);
    schedule();
  }
}
