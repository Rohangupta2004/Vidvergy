/**
 * Enhancer Agent — project store and runner.
 *
 * Module-level (so work keeps running while the UI re-renders or another tab
 * of the app is open) and persisted twice: a localStorage cache for instant
 * restore and the account-scoped `video_enhancer_agent_projects` table, so
 * in-flight Omni chunks and renders resume after a reload or on another device.
 *
 * Billing follows the Enhance queue: credits are charged right before paid
 * work is submitted (each Omni chunk, each b-roll clip and the final render
 * have their own idempotency key, persisted BEFORE the charge) and refunded on
 * every failure path. Nothing paid starts above the project's auto-spend cap
 * without the user pressing Continue.
 */
import { useSyncExternalStore } from 'react';
import { getSessionEmail, getSessionId } from '../../../lib/workspace';
import { hasTenantDelegationAuth } from '../../../lib/tenant-delegation-scope';
import {
  authorizeCredits, isCreditAuthorizationError, isInsufficientCreditsError, newChargeKey, refreshCredits, refundCreditsStrict,
} from '../../../lib/credits';
import { saveVideoToHistory } from '../../../lib/videoHistory';
import { analyseVideo, persistMaster, probeVideo, remoteSize, uploadWithProgress } from '../enhance/enhanceIO';
import { estimateCredits, titleFromName, validateDuration, validateFile } from '../enhance/enhanceModel';
import {
  AUDIO_DECODE_MAX_BYTES, DEFAULT_CREDIT_CAP, MAX_STEPS_PER_PROJECT, OMNI_CONCURRENCY, OMNI_CREDITS_PER_SECOND, RESTORE_MAX_S, TRANSPARENT_MAX_S,
} from './agentConfig';
import {
  activeSteps, audioStageRequest, chromaStageRequest, composeRender, isStageStep, originalMedia, restoreStageRequest, stageInput, stageReady, stitchRequest, workingMedia,
} from './agentCompose';
import {
  NoAudioError, cleanAudio, decodeAudio, detectKeyColour, detectSilences, fetchBlob, generateBackgroundImage, generateBroll,
  measureShake, pollOmni, readable, resampleMono, runRender, submitOmni, trackSubject, transcribe, transparentCutout, trimClip,
} from './agentMedia';
import { LOOK_PRESETS, OP_META, engineFor, estimateStep, isSingleton, omniSpan, stepLabel } from './agentOps';
import { planEdit } from './agentPlanner';
import { omniAspect, omniPrompt, planChunks } from './omniChunks';
import type {
  AgentProject, Billing, ChatMessage, ExportRecord, MediaRef, OmniChunk, PlannedStep, RenderState, Step, StepResult,
} from './agentTypes';

const STORAGE_KEY = 'video-enhancer:agent-projects:v1';
const TABLE = 'video_enhancer_agent_projects';
const MAX_PROJECTS = 24;
const MAX_MESSAGES = 80;

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const shortId = () => `s_${Math.random().toString(36).slice(2, 8)}`;
const noBilling = (): Billing => ({ entryKey: null, credits: 0, state: 'none' });
const idleRender = (): RenderState => ({ status: 'idle', stage: '', hash: null, operationId: null, geometry: null, url: null, error: null, billing: noBilling(), startedAt: null, output: null, aspect: null });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Snapshot { projects: AgentProject[]; loaded: boolean }

function normalizeProject(raw: any): AgentProject | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const src = raw.source && typeof raw.source === 'object' ? raw.source : {};
  return {
    id: raw.id,
    rowId: Number(raw.rowId) || null,
    title: String(raw.title || 'Untitled clip'),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    source: {
      name: String(src.name || raw.title || 'clip'),
      bytes: Number(src.bytes) || 0,
      width: Number(src.width) || 0,
      height: Number(src.height) || 0,
      duration: Number(src.duration) || 0,
      url: typeof src.url === 'string' && src.url ? src.url : null,
      poster: typeof src.poster === 'string' ? src.poster : null,
      upload: src.upload && typeof src.upload === 'object' ? { state: src.upload.state || 'idle', progress: Number(src.upload.progress) || 0 } : { state: src.url ? 'done' : 'idle', progress: src.url ? 1 : 0 },
      greenScreen: typeof src.greenScreen === 'string' ? src.greenScreen : null,
      checkedKey: src.checkedKey === true,
    },
    analysis: raw.analysis && typeof raw.analysis === 'object' ? raw.analysis : null,
    steps: (Array.isArray(raw.steps) ? raw.steps : []).filter((s: any) => s && s.id && OP_META[s.type as keyof typeof OP_META]).map((s: any) => ({
      id: String(s.id), type: s.type, params: s.params || {}, label: String(s.label || stepLabel(s.type, s.params || {})), why: String(s.why || ''),
      enabled: s.enabled !== false, status: s.status || 'pending', engine: s.engine || OP_META[s.type as keyof typeof OP_META].engine,
      detail: String(s.detail || ''), error: s.error ? String(s.error) : null, progress: typeof s.progress === 'number' ? s.progress : null,
      estimate: Number(s.estimate) || 0, billing: s.billing || noBilling(), result: s.result || null, chunks: Array.isArray(s.chunks) ? s.chunks : null,
      supersededBy: s.supersededBy || null, turnId: s.turnId || null, createdAt: Number(s.createdAt) || Date.now(), updatedAt: Number(s.updatedAt) || Date.now(),
    })),
    messages: (Array.isArray(raw.messages) ? raw.messages : []).filter((m: any) => m && m.id && m.text).slice(-MAX_MESSAGES),
    render: { ...idleRender(), ...(raw.render && typeof raw.render === 'object' ? raw.render : {}) },
    exports: (Array.isArray(raw.exports) ? raw.exports : []).filter((e: any) => e && /^https:\/\//.test(String(e.url || ''))).slice(0, 30),
    creditCap: Number.isFinite(Number(raw.creditCap)) ? Number(raw.creditCap) : DEFAULT_CREDIT_CAP,
    approvedCredits: Number(raw.approvedCredits) || 0,
    phase: raw.phase || 'idle',
    error: raw.error ? String(raw.error) : null,
  };
}

function readLocal(): AgentProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed.map(normalizeProject).filter(Boolean) as AgentProject[]) : [];
  } catch {
    return [];
  }
}

let projects: AgentProject[] = readLocal();
let loaded = false;
let loading = false;
let snapshot: Snapshot = { projects, loaded };
const listeners = new Set<() => void>();
const running = new Set<string>();
const rerun = new Set<string>();
const files = new Map<string, File>();
const previews = new Map<string, string>();
const persistTimers = new Map<string, number>();
const inserting = new Map<string, Promise<void>>();
const planning = new Set<string>();
let localTimer = 0;

function notify(): void {
  snapshot = { projects, loaded };
  listeners.forEach((listener) => listener());
  window.clearTimeout(localTimer);
  localTimer = window.setTimeout(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, MAX_PROJECTS))); } catch { /* storage full or disabled */ }
  }, 500);
}

export function getProject(id: string): AgentProject | null {
  return projects.find((project) => project.id === id) || null;
}

function patchProject(id: string, change: Partial<AgentProject> | ((p: AgentProject) => Partial<AgentProject>), persist = true): void {
  let found = false;
  projects = projects.map((project) => {
    if (project.id !== id) return project;
    found = true;
    const delta = typeof change === 'function' ? change(project) : change;
    return { ...project, ...delta, updatedAt: Date.now() };
  });
  if (!found) return;
  notify();
  if (persist) queuePersist(id);
}

function getStep(pid: string, sid: string): Step | null {
  return getProject(pid)?.steps.find((step) => step.id === sid) || null;
}

function patchStep(pid: string, sid: string, change: Partial<Step> | ((s: Step) => Partial<Step>), persist = true): void {
  patchProject(pid, (project) => ({
    steps: project.steps.map((step) => {
      if (step.id !== sid) return step;
      const delta = typeof change === 'function' ? change(step) : change;
      return { ...step, ...delta, updatedAt: Date.now() };
    }),
  }), persist);
}

function patchChunk(pid: string, sid: string, index: number, change: Partial<OmniChunk>, persist = true): void {
  patchStep(pid, sid, (step) => ({ chunks: (step.chunks || []).map((chunk) => (chunk.index === index ? { ...chunk, ...change } : chunk)) }), persist);
}

function message(pid: string, entry: Omit<ChatMessage, 'id' | 'at'>): string {
  const id = uid();
  patchProject(pid, (project) => ({ messages: [...project.messages, { ...entry, id, at: Date.now() }].slice(-MAX_MESSAGES) }));
  return id;
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

function toRow(project: AgentProject): Record<string, unknown> {
  const { rowId: _rowId, ...doc } = project;
  return {
    user_id: accountId(),
    client_id: project.id,
    status: project.phase,
    title: project.title,
    source_url: project.source.url,
    result_url: project.render.url,
    doc,
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

function queuePersist(id: string): void {
  window.clearTimeout(persistTimers.get(id));
  persistTimers.set(id, window.setTimeout(() => { void persistProject(id); }, 800));
}

async function persistProject(id: string): Promise<void> {
  window.clearTimeout(persistTimers.get(id));
  const pending = inserting.get(id);
  if (pending) await pending;
  const project = getProject(id);
  if (!project || !canPersist()) return;
  try {
    if (project.rowId) {
      await db().from(TABLE).update(project.rowId, toRow(project));
      return;
    }
    const insert = (async () => {
      const row = pickRow(await db().from(TABLE).insert(toRow(project)));
      const rowId = Number(row?.id);
      if (Number.isFinite(rowId) && rowId > 0) {
        projects = projects.map((entry) => (entry.id === id ? { ...entry, rowId } : entry));
        notify();
      }
    })();
    inserting.set(id, insert);
    try { await insert; } finally { inserting.delete(id); }
    const latest = getProject(id);
    if (latest?.rowId && latest.updatedAt > project.updatedAt) await db().from(TABLE).update(latest.rowId, toRow(latest));
  } catch (error) {
    console.warn('[Enhancer Agent] project could not be saved to your account:', error);
  }
}

export async function loadProjects(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    if (canPersist()) {
      // Agent Store buyers read only through their injected session, never a shared read.
      const result = await db().from(TABLE, hasTenantDelegationAuth() ? undefined : { shared: true }).eq('user_id', accountId()).orderBy('updated_at', 'desc').limit(40).get();
      const rows: any[] = Array.isArray(result?.data) ? result.data : [];
      const deleted = new Set(rows.filter((row) => row?.status === 'deleted').map((row) => Number(row.id)));
      const remote = rows
        .filter((row) => row?.status !== 'deleted' && row?.doc)
        .map((row) => normalizeProject({ ...(typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc), rowId: row.id }))
        .filter(Boolean) as AgentProject[];
      const merged = projects.filter((project) => !(project.rowId && deleted.has(project.rowId)));
      for (const incoming of remote) {
        const index = merged.findIndex((project) => project.id === incoming.id || (project.rowId && project.rowId === incoming.rowId));
        if (index < 0) merged.push(incoming);
        else if (!running.has(merged[index].id) && incoming.updatedAt > merged[index].updatedAt) merged[index] = incoming;
        else if (!merged[index].rowId) merged[index] = { ...merged[index], rowId: incoming.rowId };
      }
      projects = merged.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROJECTS);
    }
  } catch (error) {
    console.warn('[Enhancer Agent] projects could not be loaded:', error);
  } finally {
    loaded = true;
    loading = false;
    notify();
    resumeAll();
  }
}

function resumeAll(): void {
  for (const project of projects) {
    if (running.has(project.id)) continue;
    settleRefunds(project.id);
    if (project.source.upload.state === 'uploading' && !files.has(project.id)) {
      patchProject(project.id, (p) => ({ source: { ...p.source, upload: { state: 'error', progress: 0 } }, phase: 'error', error: 'The upload was interrupted when the page closed. Choose the same file again to continue.' }));
      continue;
    }
    if (project.phase === 'planning') {
      patchProject(project.id, { phase: 'idle' });
      message(project.id, { role: 'system', text: 'Planning was interrupted when the page closed. Send your request again.', tone: 'info' });
      continue;
    }
    if ((project.phase === 'running' || project.phase === 'rendering') && project.source.url) {
      // Work that was mid-flight restarts; anything already submitted is re-attached, not re-charged.
      patchProject(project.id, (p) => ({
        steps: p.steps.map((step) => (step.status === 'running' && step.engine !== 'omni' && step.type !== 'broll' ? { ...step, status: 'pending' } : step)),
      }));
      void runProject(project.id);
    }
  }
}

function settleRefunds(pid: string): void {
  const project = getProject(pid);
  if (!project) return;
  const settle = async (billing: Billing, apply: (b: Billing) => void) => {
    if (billing.state !== 'refund_pending' || !billing.entryKey) return;
    try { await refundCreditsStrict(billing.entryKey, 'Enhancer Agent refund retry'); apply({ ...billing, state: 'refunded' }); void refreshCredits(); } catch { /* retried next load */ }
  };
  void settle(project.render.billing, (b) => patchProject(pid, (p) => ({ render: { ...p.render, billing: b } })));
  for (const step of project.steps) {
    void settle(step.billing, (b) => patchStep(pid, step.id, { billing: b }));
    for (const chunk of step.chunks || []) void settle(chunk.billing, (b) => patchChunk(pid, step.id, chunk.index, { billing: b }));
  }
}

export function useAgentProjects(): Snapshot {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot,
    () => snapshot,
  );
}

export function previewSource(project: AgentProject): string | null {
  return previews.get(project.id) || project.source.url;
}

export function hasLocalFile(id: string): boolean {
  return files.has(id);
}

export function isBusy(project: AgentProject): boolean {
  return running.has(project.id) || planning.has(project.id) || project.phase === 'planning';
}

/** True while a planner call for this project is in flight, whatever the runner is doing. */
export function isPlanning(id: string): boolean {
  return planning.has(id);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (projects.some((project) => project.source.upload.state === 'uploading')) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function blankProject(id: string, title: string, source: Partial<AgentProject['source']>): AgentProject {
  const now = Date.now();
  return {
    id, rowId: null, title, createdAt: now, updatedAt: now,
    source: { name: title, bytes: 0, width: 0, height: 0, duration: 0, url: null, poster: null, upload: { state: 'idle', progress: 0 }, greenScreen: null, checkedKey: false, ...source },
    analysis: null, steps: [], messages: [], render: idleRender(), exports: [], creditCap: readCap(), approvedCredits: 0, phase: 'idle', error: null,
  };
}

const CAP_KEY = 'video-enhancer:agent-credit-cap';
function readCap(): number {
  try { const n = Number(window.localStorage.getItem(CAP_KEY)); return Number.isFinite(n) && window.localStorage.getItem(CAP_KEY) !== null ? n : DEFAULT_CREDIT_CAP; } catch { return DEFAULT_CREDIT_CAP; }
}

export function createFromFile(file: File): { id: string | null; error: string | null } {
  const problem = validateFile(file);
  if (problem) return { id: null, error: problem };
  const id = uid();
  files.set(id, file);
  previews.set(id, URL.createObjectURL(file));
  projects = [blankProject(id, titleFromName(file.name), { name: file.name, bytes: file.size }), ...projects].slice(0, MAX_PROJECTS);
  notify();
  void prepareLocal(id);
  return { id, error: null };
}

export function createFromLibrary(row: { title: string; video_url: string; thumbnail_url?: string | null; duration_sec?: number | null }): string | null {
  if (!/^https:\/\//i.test(row.video_url || '')) return null;
  const id = uid();
  const project = blankProject(id, titleFromName(row.title || 'Library video'), { name: row.title || 'Library video', url: row.video_url, poster: row.thumbnail_url || null, duration: Number(row.duration_sec) || 0, upload: { state: 'done', progress: 1 } });
  projects = [project, ...projects].slice(0, MAX_PROJECTS);
  notify();
  void prepareRemote(id);
  return id;
}

export function reattachFile(id: string, file: File): string | null {
  const project = getProject(id);
  if (!project) return 'This project no longer exists.';
  const problem = validateFile(file);
  if (problem) return problem;
  const old = previews.get(id);
  if (old) URL.revokeObjectURL(old);
  files.set(id, file);
  previews.set(id, URL.createObjectURL(file));
  patchProject(id, (p) => ({ source: { ...p.source, name: file.name, bytes: file.size, url: null, upload: { state: 'idle', progress: 0 } }, phase: p.steps.length ? 'running' : 'idle', error: null }));
  void prepareLocal(id);
  return null;
}

async function inspect(id: string, url: string): Promise<void> {
  const project = getProject(id);
  if (!project) return;
  const [result, key] = await Promise.all([analyseVideo(url, project.source.duration), project.source.checkedKey ? Promise.resolve(project.source.greenScreen) : detectKeyColour(url, project.source.duration)]);
  patchProject(id, (p) => ({ analysis: result.analysis || p.analysis, source: { ...p.source, poster: p.source.poster || result.poster, greenScreen: key, checkedKey: true } }));
}

async function prepareLocal(id: string): Promise<void> {
  const local = previews.get(id);
  const project = getProject(id);
  if (!local || !project) return;
  try {
    const probe = await probeVideo(local);
    const problem = validateDuration(project.source.name, probe.duration);
    if (problem) {
      patchProject(id, (p) => ({ phase: 'error', error: problem, source: { ...p.source, ...probe } }));
      return;
    }
    patchProject(id, (p) => ({ source: { ...p.source, width: probe.width, height: probe.height, duration: probe.duration } }));
    void inspect(id, local);
    void uploadSource(id);
  } catch (error) {
    patchProject(id, { phase: 'error', error: readable(error) });
  }
}

async function prepareRemote(id: string): Promise<void> {
  const project = getProject(id);
  if (!project?.source.url) return;
  try {
    const probe = await probeVideo(project.source.url);
    const problem = validateDuration(project.source.name, probe.duration);
    if (problem) { patchProject(id, { phase: 'error', error: problem }); return; }
    patchProject(id, (p) => ({ source: { ...p.source, width: probe.width, height: probe.height, duration: probe.duration } }));
    void inspect(id, project.source.url);
    void remoteSize(project.source.url).then((bytes) => { if (bytes) patchProject(id, (p) => ({ source: { ...p.source, bytes } })); });
  } catch (error) {
    patchProject(id, { phase: 'error', error: `This library video could not be opened: ${readable(error)}` });
  }
}

async function uploadSource(id: string): Promise<void> {
  const file = files.get(id);
  if (!file) {
    patchProject(id, (p) => ({ source: { ...p.source, upload: { state: 'error', progress: 0 } }, error: 'Choose the file again to upload it.' }));
    return;
  }
  patchProject(id, (p) => ({ source: { ...p.source, upload: { state: 'uploading', progress: 0 } } }));
  let shown = 0;
  try {
    const url = await uploadWithProgress(file, (fraction) => {
      if (fraction - shown < 0.01 && fraction < 1) return;
      shown = fraction;
      patchProject(id, (p) => ({ source: { ...p.source, upload: { state: 'uploading', progress: fraction } } }), false);
    });
    patchProject(id, (p) => ({ source: { ...p.source, url, upload: { state: 'done', progress: 1 } }, error: p.phase === 'error' ? p.error : null }));
    await persistProject(id);
    if (getProject(id)?.steps.some((step) => step.enabled)) void runProject(id);
  } catch (error) {
    patchProject(id, (p) => ({ source: { ...p.source, upload: { state: 'error', progress: 0 } }, phase: 'error', error: `Upload failed: ${readable(error)}` }));
  }
}

export function retryUpload(id: string): 'ok' | 'needs-file' {
  if (!files.has(id)) return 'needs-file';
  patchProject(id, { phase: 'idle', error: null });
  void uploadSource(id);
  return 'ok';
}

// ---------------------------------------------------------------------------
// Planning and the stack
// ---------------------------------------------------------------------------

function makeStep(project: AgentProject, planned: PlannedStep, turnId: string): Step {
  const green = Boolean(project.source.greenScreen);
  const now = Date.now();
  return {
    id: shortId(), type: planned.type, params: planned.params, label: stepLabel(planned.type, planned.params), why: planned.why,
    enabled: true, status: 'pending', engine: engineFor(planned.type, planned.params, green), detail: '', error: null, progress: null,
    estimate: estimateStep(planned.type, planned.params, project.source.duration, green), billing: noBilling(), result: null, chunks: null,
    supersededBy: null, turnId, createdAt: now, updatedAt: now,
  };
}

function addSteps(pid: string, planned: PlannedStep[], turnId: string): Step[] {
  const project = getProject(pid);
  if (!project) return [];
  const added = planned.map((entry) => makeStep(project, entry, turnId));
  patchProject(pid, (p) => {
    let steps = [...p.steps];
    for (const step of added) {
      if (isSingleton(step.type) || step.type === 'motion_fx') {
        steps = steps.map((existing) => (existing.enabled && !existing.supersededBy && existing.type === step.type && (step.type !== 'motion_fx' || existing.params.effect === step.params.effect)
          ? { ...existing, supersededBy: step.id }
          : existing));
      }
      steps.push(step);
    }
    // Stages run first so every later step reads the final working source.
    const stages = steps.filter((s) => isStageStep(s));
    const rest = steps.filter((s) => !isStageStep(s));
    const ordered = [...stages, ...rest];
    return { steps: ordered.length > MAX_STEPS_PER_PROJECT ? ordered.filter((s, i) => i >= ordered.length - MAX_STEPS_PER_PROJECT || (s.enabled && !s.supersededBy)) : ordered };
  });
  return added;
}

function applyUndo(pid: string, refs: string[]): string[] {
  const project = getProject(pid);
  if (!project || !refs.length) return [];
  const hits = activeSteps(project).filter((step) => refs.includes(step.id) || refs.includes(step.type));
  for (const step of hits) setEnabled(pid, step.id, false, false);
  return hits.map((step) => step.label);
}

async function waitForMetadata(pid: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const project = getProject(pid);
    if (!project || project.source.duration > 0 || project.phase === 'error') return;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
}

export async function sendMessage(pid: string, text: string): Promise<void> {
  const trimmed = text.trim();
  const project = getProject(pid);
  if (!trimmed || !project || planning.has(pid)) return;
  planning.add(pid);
  try {
    await planTurn(pid, trimmed);
  } finally {
    planning.delete(pid);
    notify();
  }
}

async function planTurn(pid: string, trimmed: string): Promise<void> {
  message(pid, { role: 'user', text: trimmed.slice(0, 2000) });
  patchProject(pid, { phase: 'planning', error: null });
  await waitForMetadata(pid);
  const current = getProject(pid);
  if (!current?.source.duration) {
    patchProject(pid, { phase: 'error' });
    message(pid, { role: 'agent', text: current?.error || 'This video could not be read, so I cannot plan an edit for it.', tone: 'bad' });
    return;
  }
  const plan = await planEdit(current, trimmed);
  const undone = applyUndo(pid, plan.undo);
  const turnId = uid();
  const added = addSteps(pid, plan.steps, turnId);
  const estimate = added.reduce((sum, step) => sum + step.estimate, 0);
  const reply = plan.reply || (added.length ? `On it — ${added.length} step${added.length === 1 ? '' : 's'}.` : undone.length ? 'Done.' : 'I could not turn that into an edit. Try describing the look or change you want.');
  patchProject(pid, { phase: added.length || undone.length ? 'running' : 'idle', approvedCredits: 0 });
  message(pid, { role: 'agent', text: undone.length ? `${reply} Switched off: ${undone.join(', ')}.` : reply, stepIds: added.map((step) => step.id), model: plan.model, estimate });
  if (added.length || undone.length) void runProject(pid);
}

export function applyPreset(pid: string, presetId: string): void {
  const preset = LOOK_PRESETS.find((entry) => entry.id === presetId);
  const project = getProject(pid);
  if (!preset || !project) return;
  const added = addSteps(pid, preset.steps, uid());
  message(pid, { role: 'agent', text: `${preset.label} look: ${preset.hint}`, stepIds: added.map((step) => step.id), model: 'Preset', estimate: 0 });
  patchProject(pid, { phase: 'running', approvedCredits: 0 });
  void runProject(pid);
}

function setEnabled(pid: string, sid: string, enabled: boolean, run = true): void {
  const step = getStep(pid, sid);
  if (!step) return;
  patchProject(pid, (p) => ({
    steps: p.steps.map((s) => {
      if (s.id === sid) return { ...s, enabled, supersededBy: enabled ? null : s.supersededBy, updatedAt: Date.now() };
      // Undoing a step brings back the one it replaced; redoing it replaces that one again.
      if (!enabled && s.supersededBy === sid) return { ...s, supersededBy: null };
      if (enabled && s.type === step.type && s.enabled && !s.supersededBy && s.id !== sid && (isSingleton(step.type) || (step.type === 'motion_fx' && s.params.effect === step.params.effect))) return { ...s, supersededBy: sid };
      return s;
    }),
  }));
  if (run) {
    patchProject(pid, { phase: 'running', approvedCredits: 0 });
    void runProject(pid);
  }
}

export function toggleStep(pid: string, sid: string): void {
  const step = getStep(pid, sid);
  if (!step) return;
  setEnabled(pid, sid, !(step.enabled && !step.supersededBy));
}

export function removeStep(pid: string, sid: string): boolean {
  const step = getStep(pid, sid);
  if (!step || step.status === 'running') return false;
  patchProject(pid, (p) => ({ steps: p.steps.filter((s) => s.id !== sid).map((s) => (s.supersededBy === sid ? { ...s, supersededBy: null } : s)) }));
  patchProject(pid, { phase: 'running', approvedCredits: 0 });
  void runProject(pid);
  return true;
}

export function retryStep(pid: string, sid: string): void {
  patchStep(pid, sid, (step) => ({
    status: 'pending', error: null, detail: '',
    chunks: step.chunks ? step.chunks.map((chunk) => (chunk.status === 'error' ? { ...chunk, status: 'pending', error: null, attempts: 0 } : chunk)) : null,
  }));
  patchProject(pid, { phase: 'running', error: null });
  void runProject(pid);
}

export function retryChunk(pid: string, sid: string, index: number): void {
  patchChunk(pid, sid, index, { status: 'pending', error: null, attempts: 0 });
  patchStep(pid, sid, { status: 'pending', error: null });
  patchProject(pid, { phase: 'running', error: null });
  void runProject(pid);
}

export function retryRender(pid: string): void {
  patchProject(pid, (p) => ({ render: { ...p.render, status: 'idle', error: null, operationId: null }, phase: 'running', error: null }));
  void runProject(pid);
}

export function approvePaid(pid: string): void {
  const project = getProject(pid);
  if (!project) return;
  const due = pendingPaid(project);
  patchProject(pid, (p) => ({
    approvedCredits: Math.max(due, 1),
    phase: 'running',
    messages: p.messages.map((m) => (m.awaitingApproval ? { ...m, awaitingApproval: false } : m)),
    steps: p.steps.map((s) => (s.status === 'awaiting' ? { ...s, status: 'pending' } : s)),
  }));
  void runProject(pid);
}

export function setCreditCap(pid: string | null, cap: number): void {
  try { window.localStorage.setItem(CAP_KEY, String(cap)); } catch { /* storage unavailable */ }
  if (!pid) return;
  patchProject(pid, { creditCap: cap });
  const project = getProject(pid);
  if (project?.phase === 'awaiting' && pendingPaid(project) <= cap) void runProject(pid);
}

export function deleteProject(pid: string): boolean {
  const project = getProject(pid);
  if (!project || running.has(pid)) return false;
  const local = previews.get(pid);
  if (local) URL.revokeObjectURL(local);
  previews.delete(pid);
  files.delete(pid);
  projects = projects.filter((entry) => entry.id !== pid);
  notify();
  if (project.rowId && canPersist()) {
    void Promise.resolve(db().from(TABLE).update(project.rowId, { status: 'deleted' })).catch((error: unknown) => console.warn('[Enhancer Agent] delete not saved:', error));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

function chargeMessage(error: unknown): string {
  if (isInsufficientCreditsError(error)) return `Not enough credits: this needs ${error.required} and you have ${error.balance}. Top up, then press Retry.`;
  if (isCreditAuthorizationError(error)) return error.message;
  return `Credits could not be confirmed: ${readable(error)}`;
}

/** Real engine + media seconds behind a charge, priced by lib/pricing.ts. */
interface ChargePricing { engine: string; seconds: number }

async function charge(credits: number, billing: Billing, source: string, note: string, save: (b: Billing) => void, pid: string, pricing?: ChargePricing): Promise<Billing> {
  if (billing.state === 'charged' && billing.entryKey) return billing;
  if (billing.state === 'refund_pending' && billing.entryKey) {
    try { await refundCreditsStrict(billing.entryKey, 'Enhancer Agent refund retry'); } catch { throw new Error('A refund for the previous attempt is still settling. Try again in a moment.'); }
  }
  const entryKey = billing.entryKey && billing.state === 'none' ? billing.entryKey : newChargeKey('veh-agent');
  const pending: Billing = { entryKey, credits, state: 'none' };
  save(pending);
  await persistProject(pid);
  // The chat already showed this cost and the auto-spend cap / Continue gate approved it.
  const result = await authorizeCredits(pricing
    ? { seconds: pricing.seconds, engine: pricing.engine, options: { seconds: pricing.seconds }, entryKey, source, label: note.slice(0, 120), note: note.slice(0, 180), preconfirmed: true }
    : { seconds: credits, entryKey, source, note: note.slice(0, 180), preconfirmed: true });
  const charged: Billing = { entryKey, credits: result.metered ? result.charged : 0, state: 'charged' };
  save(charged);
  await persistProject(pid);
  return charged;
}

/** Refund a charge; returns the sentence to append to the error. */
async function refund(billing: Billing, reason: string, save: (b: Billing) => void, pid: string): Promise<string> {
  if (billing.state !== 'charged' || !billing.entryKey) return 'No credits were charged.';
  save({ ...billing, state: 'refund_pending' });
  await persistProject(pid);
  try {
    await refundCreditsStrict(billing.entryKey, `Enhancer Agent: ${reason}`.slice(0, 180));
    save({ ...billing, state: 'refunded' });
    void refreshCredits();
    return billing.credits ? `${billing.credits} credit${billing.credits === 1 ? '' : 's'} refunded.` : 'Nothing was charged.';
  } catch {
    return 'Your refund is pending and will be retried automatically.';
  }
}

/** Paid work the next run would start, in credits. `stale` is paid work an undo made obsolete. */
export function paidWork(project: AgentProject): { total: number; stale: number; staleLabels: string[] } {
  let total = 0;
  let stale = 0;
  const staleLabels: string[] = [];
  for (const step of activeSteps(project)) {
    if (step.type === 'broll') {
      if (step.status !== 'done' && step.billing.state !== 'charged') total += step.estimate;
      continue;
    }
    if (step.engine !== 'omni') continue;
    const input = stageInput(project, step.id);
    const generated = Boolean(step.chunks?.some((chunk) => chunk.status === 'done'));
    const outdated = !step.chunks?.length || !input || step.result?.inputUrl !== input.url;
    if (step.status === 'done' && !outdated) continue;
    if (outdated) {
      const cost = input ? estimateStep(step.type, step.params, input.duration, false) : step.estimate;
      total += cost;
      if (generated) { stale += cost; staleLabels.push(step.label); }
    } else {
      total += (step.chunks || []).filter((c) => c.status !== 'done' && c.billing.state !== 'charged').reduce((sum, c) => sum + Math.ceil((c.end - c.start) * OMNI_CREDITS_PER_SECOND - 1e-6), 0);
    }
  }
  const composed = composeRender(project);
  const render = project.render;
  const renderDue = !composed || (composed.hash !== render.hash && !project.exports.some((e) => e.hash === composed.hash));
  const renderCharged = render.status === 'rendering' && render.billing.state === 'charged' && (!composed || render.hash === composed.hash);
  if (renderDue && !renderCharged) total += composed ? composed.credits : estimateCredits(project.source.duration);
  return { total, stale, staleLabels };
}

export function pendingPaid(project: AgentProject): number {
  return paidWork(project).total;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runProject(pid: string): Promise<void> {
  if (running.has(pid)) { rerun.add(pid); return; }
  running.add(pid);
  notify();
  try {
    do {
      rerun.delete(pid);
      await runOnce(pid);
    } while (rerun.has(pid));
  } catch (error) {
    patchProject(pid, { phase: 'error', error: `Something went wrong: ${readable(error)}` });
  } finally {
    running.delete(pid);
    notify();
  }
}

async function sourceBlob(pid: string, media: MediaRef | null, maxBytes: number): Promise<Blob> {
  const project = getProject(pid);
  const local = files.get(pid);
  if (local && project && (!media || media.url === project.source.url)) return local;
  if (!media?.url) throw new Error('The source video is not uploaded yet.');
  return fetchBlob(media.url, maxBytes);
}

function originalAudio(pid: string): Promise<AudioBuffer> {
  const project = getProject(pid);
  return decodeAudio(`${pid}:${project?.source.url || 'local'}`, () => sourceBlob(pid, project ? originalMedia(project) : null, AUDIO_DECODE_MAX_BYTES));
}

const speech16k = new Map<string, Promise<Float32Array>>();
function originalSpeech(pid: string): Promise<Float32Array> {
  const key = `${pid}:${getProject(pid)?.source.url || 'local'}`;
  const cached = speech16k.get(key);
  if (cached) return cached;
  const work = originalAudio(pid).then((buffer) => resampleMono(buffer, 16000));
  speech16k.set(key, work);
  work.catch(() => speech16k.delete(key));
  return work;
}

async function runOnce(pid: string): Promise<void> {
  let project = getProject(pid);
  if (!project) return;
  if (!project.source.url) {
    if (project.source.upload.state === 'error') patchProject(pid, { phase: 'error' });
    return;
  }
  if (!project.steps.some((step) => step.enabled) && !project.render.url) {
    patchProject(pid, { phase: 'idle' });
    return;
  }

  // Key detection can land after planning: route background steps that have not started yet.
  if (project.source.checkedKey) {
    const green = Boolean(project.source.greenScreen);
    const stale = project.steps.some((s) => s.type === 'remove_bg' && s.params.mode !== 'transparent' && (s.status === 'pending' || s.status === 'awaiting') && !s.chunks?.length && s.engine !== engineFor(s.type, s.params, green));
    if (stale) {
      patchProject(pid, (p) => ({
        steps: p.steps.map((s) => (s.type === 'remove_bg' && s.params.mode !== 'transparent' && (s.status === 'pending' || s.status === 'awaiting') && !s.chunks?.length
          ? { ...s, engine: engineFor(s.type, s.params, green), estimate: estimateStep(s.type, s.params, p.source.duration, green) }
          : s)),
      }));
      project = getProject(pid)!;
    }
  }

  // Budget gate: nothing paid starts above the cap, and nothing already
  // generated is regenerated, without an explicit Continue.
  const work = paidWork(project);
  const allowance = Math.max(project.creditCap, project.approvedCredits);
  const needsApproval = work.total > allowance || (work.stale > 0 && project.approvedCredits < work.total);
  if (needsApproval) {
    patchProject(pid, (p) => ({
      phase: 'awaiting',
      steps: p.steps.map((s) => (s.enabled && !s.supersededBy && s.status !== 'done' && s.status !== 'running' && (s.engine === 'omni' || s.type === 'broll') ? { ...s, status: 'awaiting' } : s)),
    }));
    if (!getProject(pid)?.messages.some((m) => m.awaitingApproval)) {
      const text = work.stale > 0
        ? `That change alters the input of ${work.staleLabels.join(', ')}, so it would be regenerated for about ${work.total} credits. Press Continue to regenerate it, or undo that step as well.`
        : `This needs about ${work.total} credits, above your auto-spend limit of ${project.creditCap}. Press Continue to run it, or raise the limit.`;
      message(pid, { role: 'system', text, estimate: work.total, awaitingApproval: true, tone: 'info' });
    }
    return;
  }
  patchProject(pid, (p) => ({
    phase: 'running',
    error: null,
    messages: p.messages.some((m) => m.awaitingApproval) ? p.messages.map((m) => (m.awaitingApproval ? { ...m, awaitingApproval: false } : m)) : p.messages,
  }));

  // Pass 1: stages, in order. A failed stage stops the chain.
  for (const step of activeSteps(project)) {
    if (!isStageStep(step)) continue;
    const input = stageInput(getProject(pid)!, step.id);
    if (!input) return;
    const current = getStep(pid, step.id)!;
    if (stageReady(current) && current.result?.inputUrl === input.url) continue;
    if (current.status === 'error') { patchProject(pid, { phase: 'error' }); return; }
    const ok = step.type === 'audio_cleanup' ? await runAudioStage(pid, step.id, input)
      : step.engine === 'stage' ? await runFilterStage(pid, step.id, input)
        : await runOmniStage(pid, step.id, input);
    if (!ok) {
      patchProject(pid, { phase: 'error' });
      const failed = getStep(pid, step.id);
      message(pid, { role: 'agent', text: `${failed?.label || 'A step'} did not finish: ${failed?.error || 'unknown error'}`, tone: 'bad' });
      return;
    }
    if (rerun.has(pid)) return;
  }

  project = getProject(pid)!;
  const media = workingMedia(project);
  if (!media) return;

  // Pass 2: analysis and assets for compose steps, then exports.
  const problems: string[] = [];
  for (const step of activeSteps(project)) {
    if (isStageStep(step)) continue;
    const current = getStep(pid, step.id)!;
    const inputUrl = ['cut_silences', 'captions'].includes(step.type) ? project.source.url! : media.url;
    if ((current.status === 'done' || current.status === 'skipped') && (current.result?.inputUrl === inputUrl || !needsInput(step))) continue;
    if (current.status === 'error') { problems.push(`${current.label}: ${current.error}`); continue; }
    await runComposeStep(pid, step.id, media, inputUrl);
    const after = getStep(pid, step.id);
    if (after?.status === 'error') problems.push(`${after.label}: ${after.error}`);
    if (rerun.has(pid)) return;
  }

  await runFinalRender(pid, problems);
}

function needsInput(step: Step): boolean {
  return ['cut_silences', 'captions', 'reframe', 'stabilize', 'export'].includes(step.type) || step.engine === 'export';
}

async function runComposeStep(pid: string, sid: string, media: MediaRef, inputUrl: string): Promise<void> {
  const step = getStep(pid, sid);
  if (!step) return;
  const done = (result: StepResult, detail: string) => patchStep(pid, sid, { status: 'done', result: { ...result, inputUrl }, detail, error: null, progress: null });
  const progress = (fraction: number, detail: string) => patchStep(pid, sid, { progress: fraction, detail }, false);
  patchStep(pid, sid, { status: 'running', error: null, detail: 'Working…', progress: null });
  try {
    switch (step.type) {
      case 'cut_silences': {
        progress(0.2, 'Measuring pauses in the audio');
        const samples = await originalSpeech(pid);
        const project = getProject(pid)!;
        const result = detectSilences(samples, 16000, project.source.duration, { minSilence: step.params.minSilence, padding: step.params.padding });
        const cuts = Math.max(0, result.keep.length - 1);
        done({ keep: result.keep, removedSeconds: result.removed }, result.removed > 0.05 ? `Removed ${cuts || 1} pause${cuts === 1 ? '' : 's'} · −${result.removed.toFixed(1)}s` : 'No pauses long enough to cut');
        return;
      }
      case 'captions': {
        progress(0.2, 'Listening with Deepgram');
        const words = await transcribe(await originalSpeech(pid));
        done({ words }, `${words.length} words timed`);
        return;
      }
      case 'reframe': {
        if (!step.params.track) { done({ focus: [] }, 'Centre crop'); return; }
        const local = media.url === getProject(pid)!.source.url ? previewSource(getProject(pid)!) || media.url : media.url;
        const focus = await trackSubject(local, media.duration, (f) => progress(f, `Tracking the subject ${Math.round(f * 100)}%`));
        done({ focus }, focus.length ? `Tracked the subject across ${focus.length} points` : 'No clear subject found · centre crop');
        return;
      }
      case 'stabilize': {
        const local = media.url === getProject(pid)!.source.url ? previewSource(getProject(pid)!) || media.url : media.url;
        const result = await measureShake(local, media.duration, step.params.strength, (f) => progress(f, `Measuring camera shake ${Math.round(f * 100)}%`));
        done({ shake: result.keys, margin: result.margin }, result.shakiness < 0.15 ? 'Footage is already steady · light smoothing' : `Smoothed the camera path · ${Math.round((result.margin - 1) * 100)}% stabilization margin`);
        return;
      }
      case 'remove_bg': {
        if (step.engine === 'export') { await runCutout(pid, sid, media); return; }
        done({}, 'Applied in the render');
        return;
      }
      case 'broll': {
        let billing = step.billing;
        const saveBilling = (b: Billing) => patchStep(pid, sid, { billing: b });
        try {
          billing = await charge(step.estimate, billing, 'video-enhancer-agent-broll', `Enhancer Agent b-roll: ${step.params.duration}s`, saveBilling, pid, { engine: 'gemini-omni-1.1-flash', seconds: Number(step.params.duration) || 0 });
        } catch (error) {
          patchStep(pid, sid, { status: 'error', error: chargeMessage(error), detail: 'Not started' });
          return;
        }
        try {
          const aspect = composeRender(getProject(pid)!)?.aspect || '16:9';
          const url = await generateBroll(step.params.prompt, aspect, step.params.duration, (text) => progress(0.5, text));
          done({ url }, `Generated a ${step.params.duration}s cutaway`);
        } catch (error) {
          const note = await refund(billing, 'b-roll failed', saveBilling, pid);
          patchStep(pid, sid, { status: 'error', error: `${readable(error)} ${note}`, detail: 'Failed' });
        }
        return;
      }
      default:
        done({}, 'Applied in the render');
    }
  } catch (error) {
    if (error instanceof NoAudioError) {
      patchStep(pid, sid, { status: 'skipped', detail: 'This video has no audio track', result: { inputUrl }, progress: null });
      return;
    }
    patchStep(pid, sid, { status: 'error', error: readable(error), detail: 'Failed', progress: null });
  }
}

async function runCutout(pid: string, sid: string, media: MediaRef): Promise<void> {
  if (media.duration > TRANSPARENT_MAX_S) {
    patchStep(pid, sid, { status: 'error', error: `Transparent cut-outs work on clips up to ${TRANSPARENT_MAX_S} seconds. Trim the video first, or replace the background with a colour instead.`, detail: 'Too long' });
    return;
  }
  const blob = await sourceBlob(pid, media, 250 * 1024 * 1024);
  const url = await transparentCutout(blob, (text) => patchStep(pid, sid, { detail: text }, false));
  const record: ExportRecord = { id: uid(), kind: 'cutout', url, createdAt: Date.now(), label: 'Transparent cut-out (WebM with alpha)', width: 0, height: 0, duration: media.duration, hash: null, steps: [sid] };
  patchStep(pid, sid, { status: 'done', result: { url, inputUrl: media.url, route: 'export' }, detail: 'Alpha WebM ready in Exports', error: null, progress: null });
  patchProject(pid, (p) => ({ exports: [record, ...p.exports].slice(0, 30) }));
}

async function finishStage(pid: string, sid: string, url: string, input: MediaRef, extra: Partial<StepResult> = {}): Promise<MediaRef> {
  patchStep(pid, sid, { detail: 'Saving the new working copy' }, false);
  const durable = (await persistMaster(url, input.duration)) || url;
  let media: MediaRef = { url: durable, width: input.width, height: input.height, duration: input.duration };
  try {
    const probe = await probeVideo(durable);
    media = { url: durable, width: probe.width, height: probe.height, duration: probe.duration || input.duration };
  } catch { /* the input geometry is the fallback */ }
  patchStep(pid, sid, (step) => ({ status: 'done', progress: null, error: null, result: { ...(step.result || {}), ...extra, url: durable, media, inputUrl: input.url } }));
  await persistProject(pid);
  return media;
}

async function runAudioStage(pid: string, sid: string, input: MediaRef): Promise<boolean> {
  const step = getStep(pid, sid);
  if (!step) return false;
  patchStep(pid, sid, { status: 'running', error: null, detail: 'Decoding the soundtrack', progress: 0.05 });
  try {
    const buffer = await originalAudio(pid);
    const wav = await cleanAudio(buffer, step.params.strength, (f) => patchStep(pid, sid, { progress: f * 0.5, detail: f < 0.7 ? 'Cleaning the voice' : 'Uploading the clean track' }, false));
    patchStep(pid, sid, { detail: 'Laying the clean track under the picture', progress: 0.55 });
    const current = getStep(pid, sid)!;
    const outcome = await runRender(audioStageRequest(input, wav), {
      operationId: current.result?.inputUrl === input.url ? current.result?.stitchOperationId : null,
      geometry: current.result?.stitchGeometry,
      onSubmitted: async (operationId, geometry) => { patchStep(pid, sid, (s) => ({ result: { ...(s.result || {}), stitchOperationId: operationId, stitchGeometry: geometry, inputUrl: input.url } })); await persistProject(pid); },
      onStage: (text) => patchStep(pid, sid, { detail: text }, false),
    });
    await finishStage(pid, sid, outcome.url, input, { summary: 'Rumble and hiss filtered, voice compressed and levelled' });
    patchStep(pid, sid, { detail: 'Voice cleaned and levelled' });
    return true;
  } catch (error) {
    if (error instanceof NoAudioError) {
      patchStep(pid, sid, { status: 'done', detail: 'No audio track to clean', progress: null, result: { media: input, url: input.url, inputUrl: input.url } });
      return true;
    }
    patchStep(pid, sid, (s) => ({ status: 'error', error: readable(error), detail: 'Failed', progress: null, result: { ...(s.result || {}), stitchOperationId: null } }));
    return false;
  }
}

/** Restore (denoise/sharpen) and green-screen keying: one single-clip render each. */
async function runFilterStage(pid: string, sid: string, input: MediaRef): Promise<boolean> {
  const step = getStep(pid, sid);
  if (!step) return false;
  const keying = step.type === 'remove_bg';
  if (!keying && input.duration > RESTORE_MAX_S) {
    patchStep(pid, sid, { status: 'skipped', error: null, progress: null, detail: `Denoise and sharpen run on clips up to ${RESTORE_MAX_S}s; trim the video to use them. The render still masters at 1080p.`, result: { media: input, url: input.url, inputUrl: input.url } });
    return true;
  }
  patchStep(pid, sid, { status: 'running', error: null, detail: keying ? 'Keying the green screen' : 'Denoising and sharpening a 1080p master', progress: 0.1 });
  try {
    let request: Record<string, unknown>;
    if (keying) {
      const project = getProject(pid)!;
      let backgroundUrl: string | null = step.params.mode === 'image' ? String(step.params.imageUrl) : step.result?.url || null;
      if (step.params.mode === 'generated' && !backgroundUrl) {
        patchStep(pid, sid, { detail: 'Generating a background plate' }, false);
        backgroundUrl = await generateBackgroundImage(step.params.prompt, input.width < input.height ? '9:16' : '16:9');
        patchStep(pid, sid, (s) => ({ result: { ...(s.result || {}), url: backgroundUrl || undefined } }));
      }
      const color = project.source.greenScreen || '#00b140';
      request = chromaStageRequest(input, { color, backgroundColor: step.params.colour || '#101114', backgroundUrl: step.params.mode === 'colour' ? null : backgroundUrl });
    } else {
      request = restoreStageRequest(input, { denoise: Number(step.params.denoise) || 0, sharpen: Number(step.params.sharpen) || 0 });
    }
    const current = getStep(pid, sid)!;
    const outcome = await runRender(request, {
      operationId: current.result?.inputUrl === input.url ? current.result?.stitchOperationId : null,
      geometry: current.result?.inputUrl === input.url ? current.result?.stitchGeometry : null,
      onSubmitted: async (operationId, geometry) => { patchStep(pid, sid, (s) => ({ result: { ...(s.result || {}), stitchOperationId: operationId, stitchGeometry: geometry, inputUrl: input.url } })); await persistProject(pid); },
      onStage: (text) => patchStep(pid, sid, { detail: `${keying ? 'Keying' : 'Restoring'} · ${text.toLowerCase()}` }, false),
    });
    const media = await finishStage(pid, sid, outcome.url, input, keying ? { route: 'chroma' } : {});
    patchStep(pid, sid, { detail: keying ? `Green screen keyed to ${step.params.mode === 'colour' ? step.params.colour : 'the new background'}` : `Denoised, sharpened and mastered at ${media.width}×${media.height}` });
    return true;
  } catch (error) {
    patchStep(pid, sid, (s) => ({ status: 'error', error: readable(error), detail: 'Failed', progress: null, result: { ...(s.result || {}), stitchOperationId: null } }));
    return false;
  }
}

function freshChunks(start: number, end: number, duration: number): OmniChunk[] {
  return planChunks(start, end, duration).map((w) => ({
    index: w.index, start: w.start, end: w.end, status: 'pending', trimUrl: null, operationId: null, outputUrl: null, outputDuration: null,
    billing: noBilling(), error: null, attempts: 0, startedAt: null,
  }));
}

async function runOmniStage(pid: string, sid: string, input: MediaRef): Promise<boolean> {
  let step = getStep(pid, sid);
  if (!step) return false;
  const span = omniSpan(step.params, input.duration);
  if (!step.chunks?.length || step.result?.inputUrl !== input.url) {
    patchStep(pid, sid, { chunks: freshChunks(span.start, span.end, input.duration), result: { inputUrl: input.url, route: 'omni' }, estimate: estimateStep(step.type, step.params, input.duration, false) });
    await persistProject(pid);
    step = getStep(pid, sid)!;
  }
  const total = step.chunks!.length;
  patchStep(pid, sid, { status: 'running', error: null, detail: `Omni Flash · ${total} segment${total === 1 ? '' : 's'} of ≤8s`, progress: 0 });
  const aspect = omniAspect(input.width, input.height);
  const reference = step.type === 'remove_bg' && step.params.mode === 'image' ? String(step.params.imageUrl) : null;

  const queue = step.chunks!.filter((chunk) => chunk.status !== 'done').map((chunk) => chunk.index);
  const worker = async () => {
    for (;;) {
      const index = queue.shift();
      if (index === undefined) return;
      await runChunk(pid, sid, index, input, aspect, reference, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(OMNI_CONCURRENCY, queue.length) }, worker));

  step = getStep(pid, sid)!;
  const chunks = step.chunks || [];
  const failed = chunks.filter((chunk) => chunk.status !== 'done');
  if (failed.length) {
    patchStep(pid, sid, { status: 'error', error: `${failed.length} of ${chunks.length} segment${chunks.length === 1 ? '' : 's'} failed. Retry them one by one in the stack.`, detail: 'Some segments failed', progress: null });
    return false;
  }
  patchStep(pid, sid, { detail: 'Stitching segments with crossfades and re-syncing the original audio', progress: 0.92 });
  try {
    const current = getStep(pid, sid)!;
    const outcome = await runRender(stitchRequest(input, chunks, span, aspect), {
      operationId: current.result?.stitchOperationId,
      geometry: current.result?.stitchGeometry,
      onSubmitted: async (operationId, geometry) => { patchStep(pid, sid, (s) => ({ result: { ...(s.result || {}), stitchOperationId: operationId, stitchGeometry: geometry } })); await persistProject(pid); },
      onStage: (text) => patchStep(pid, sid, { detail: `Stitching · ${text.toLowerCase()}` }, false),
    });
    await finishStage(pid, sid, outcome.url, input);
    patchStep(pid, sid, { detail: `${chunks.length} Omni segment${chunks.length === 1 ? '' : 's'} stitched · audio re-synced` });
    return true;
  } catch (error) {
    patchStep(pid, sid, (s) => ({ status: 'error', error: `The segments are ready but stitching failed: ${readable(error)}`, detail: 'Stitch failed', progress: null, result: { ...(s.result || {}), stitchOperationId: null } }));
    return false;
  }
}

async function runChunk(pid: string, sid: string, index: number, input: MediaRef, aspect: '16:9' | '9:16', reference: string | null, total: number): Promise<void> {
  const read = () => getStep(pid, sid)?.chunks?.find((c) => c.index === index) || null;
  let chunk = read();
  const step = getStep(pid, sid);
  if (!chunk || !step || chunk.status === 'done') return;
  const saveBilling = (b: Billing) => patchChunk(pid, sid, index, { billing: b });
  const length = chunk.end - chunk.start;
  const credits = Math.ceil(length * OMNI_CREDITS_PER_SECOND - 1e-6);
  const updateProgress = () => {
    const chunks = getStep(pid, sid)?.chunks || [];
    const doneCount = chunks.filter((c) => c.status === 'done').length;
    patchStep(pid, sid, { progress: (doneCount / Math.max(1, chunks.length)) * 0.9, detail: `Omni Flash · ${doneCount}/${chunks.length} segments done` }, false);
  };
  for (let attempt = chunk.attempts; attempt < 2; attempt += 1) {
    chunk = read()!;
    try {
      if (!chunk.operationId) {
        let trimUrl = chunk.trimUrl;
        if (!trimUrl) {
          patchChunk(pid, sid, index, { status: 'trimming', error: null }, false);
          trimUrl = chunk.start <= 0.01 && chunk.end >= input.duration - 0.01 ? input.url : await trimClip(input.url, chunk.start, chunk.end);
          patchChunk(pid, sid, index, { trimUrl });
        }
        try {
          await charge(credits, read()!.billing, 'video-enhancer-agent-omni', `Enhancer Agent Omni Flash: segment ${index + 1}/${total} (${length.toFixed(1)}s)`, saveBilling, pid, { engine: 'gemini-omni-1.1-flash', seconds: length });
        } catch (error) {
          patchChunk(pid, sid, index, { status: 'error', error: chargeMessage(error), attempts: 2 });
          return;
        }
        patchChunk(pid, sid, index, { status: 'submitting' }, false);
        const prompt = omniPrompt(step.type, step.params, { index, total });
        const operationId = await submitOmni({ videoUrl: trimUrl, prompt, aspect, seconds: length, referenceImageUrl: reference });
        patchChunk(pid, sid, index, { operationId, status: 'generating', startedAt: Date.now() });
        await persistProject(pid);
      } else {
        patchChunk(pid, sid, index, { status: 'generating' }, false);
      }
      const current = read()!;
      const outputUrl = await pollOmni(current.operationId!, undefined, current.startedAt || Date.now());
      let outputDuration: number | null = null;
      try { outputDuration = (await probeVideo(outputUrl)).duration || null; } catch { /* stitched at nominal length */ }
      patchChunk(pid, sid, index, { status: 'done', outputUrl, outputDuration, error: null });
      await persistProject(pid);
      updateProgress();
      return;
    } catch (error) {
      const note = await refund(read()!.billing, `Omni segment ${index + 1} failed`, saveBilling, pid);
      const final = attempt >= 1;
      patchChunk(pid, sid, index, { status: final ? 'error' : 'pending', operationId: null, attempts: attempt + 1, error: `${readable(error)} ${note}` });
      if (final) return;
    }
  }
}

async function runFinalRender(pid: string, problems: string[]): Promise<void> {
  const project = getProject(pid)!;
  const composed = composeRender(project);
  if (!composed) return;
  const summary = activeSteps(project).map((step) => step.label);
  if (project.render.status === 'done' && project.render.hash === composed.hash && project.render.url) {
    patchProject(pid, { phase: 'done' });
    return;
  }
  const cached = project.exports.find((record) => record.kind === 'mp4' && record.hash === composed.hash);
  if (cached) {
    patchProject(pid, { phase: 'done', render: { ...idleRender(), status: 'done', hash: composed.hash, url: cached.url, output: { url: cached.url, width: cached.width, height: cached.height, duration: cached.duration }, aspect: composed.aspect, stage: 'Done' } });
    message(pid, { role: 'agent', text: 'Restored that version from your export history — no new render needed.', tone: 'good' });
    return;
  }

  const resuming = project.render.status === 'rendering' && project.render.hash === composed.hash;
  let billing = resuming ? project.render.billing : noBilling();
  const saveBilling = (b: Billing) => patchProject(pid, (p) => ({ render: { ...p.render, billing: b } }));
  patchProject(pid, (p) => ({
    phase: 'rendering',
    render: resuming ? { ...p.render, stage: p.render.operationId ? 'Reconnecting to the render' : 'Checking credits' } : { ...idleRender(), status: 'rendering', hash: composed.hash, stage: 'Checking credits', startedAt: Date.now(), aspect: composed.aspect, billing },
  }));
  try {
    billing = await charge(composed.credits, billing, 'video-enhancer-agent-render', `Enhancer Agent render: ${Math.round(composed.outDuration)}s`, saveBilling, pid, { engine: 'remotion/render', seconds: composed.outDuration });
  } catch (error) {
    patchProject(pid, (p) => ({ phase: 'error', render: { ...p.render, status: 'error', error: chargeMessage(error), stage: 'Not started', billing: noBilling() } }));
    message(pid, { role: 'agent', text: chargeMessage(error), tone: 'bad' });
    return;
  }
  try {
    const current = getProject(pid)!;
    const outcome = await runRender(composed.request, {
      operationId: current.render.operationId,
      geometry: current.render.geometry,
      submittedAt: current.render.startedAt,
      onSubmitted: async (operationId, geometry) => { patchProject(pid, (p) => ({ render: { ...p.render, operationId, geometry, stage: 'Rendering on the render farm' } })); await persistProject(pid); },
      onStage: (text) => patchProject(pid, (p) => ({ render: { ...p.render, stage: text } }), false),
    });
    patchProject(pid, (p) => ({ render: { ...p.render, stage: 'Saving the master copy' } }), false);
    const url = (await persistMaster(outcome.url, composed.outDuration)) || outcome.url;
    let output: MediaRef = { url, width: composed.width, height: composed.height, duration: composed.outDuration };
    try { const probe = await probeVideo(url); output = { url, width: probe.width, height: probe.height, duration: probe.duration || composed.outDuration }; } catch { /* planned geometry */ }
    const record: ExportRecord = { id: uid(), kind: 'mp4', url, createdAt: Date.now(), label: `${output.width}×${output.height} MP4`, width: output.width, height: output.height, duration: output.duration, hash: composed.hash, steps: summary };
    patchProject(pid, (p) => ({
      phase: 'done',
      render: { ...p.render, status: 'done', url, output, stage: 'Done', error: null, geometry: outcome.geometry || p.render.geometry },
      exports: [record, ...p.exports].slice(0, 30),
      approvedCredits: 0,
    }));
    await persistProject(pid);
    void saveVideoToHistory({ appId: 'video-enhancer', title: `${project.title} (agent edit)`, videoUrl: url, thumbnailUrl: null, durationSec: Math.round(output.duration) });
    void refreshCredits();
    const charged = billing.credits ? ` · ${billing.credits} credit${billing.credits === 1 ? '' : 's'}` : '';
    message(pid, {
      role: 'agent',
      text: problems.length
        ? `Rendered ${output.width}×${output.height}, ${Math.round(output.duration)}s${charged}. Some steps were skipped: ${problems.join(' · ').slice(0, 300)}`
        : `Done — ${output.width}×${output.height}, ${Math.round(output.duration)}s${charged}. Drag the slider to compare, or undo any step.${outcome.note ? ` ${outcome.note}` : ''}`,
      tone: problems.length ? 'info' : 'good',
    });
  } catch (error) {
    const note = await refund(billing, 'render failed', saveBilling, pid);
    patchProject(pid, (p) => ({ phase: 'error', render: { ...p.render, status: 'error', error: `${readable(error)} ${note}`, stage: 'Failed', operationId: null } }));
    message(pid, { role: 'agent', text: `The render failed: ${readable(error)} ${note} Press Retry render.`, tone: 'bad' });
  }
}
