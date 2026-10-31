import { useEffect } from 'react';

export type AppId = 'script-to-video' | 'ugc-studio' | 'ads-studio' | 'sceneforge' | 'faceless' | 'video-enhancer' | 'motion' | 'brand-context' | 'cineagent';
export type AppView = 'side' | 'popup' | 'hidden' | 'fullscreen';

/** Studio ids that are actually registered in config.json and mountable inline beside the chat. */
export const EMBEDDABLE_APP_IDS = ['script-to-video', 'ugc-studio', 'ads-studio', 'sceneforge', 'faceless', 'video-enhancer', 'brand-context', 'cineagent'] as const;

const APP_NAMES: Record<string, string> = {
  'script-to-video': 'Script-to-Video',
  'ugc-studio': 'UGC Studio',
  'ads-studio': 'Vergeye Ads Studio',
  sceneforge: 'SceneForge',
  faceless: 'Faceless',
  'video-enhancer': 'Video Enhancer',
  'brand-context': 'Brand Kit',
  cineagent: 'Studio',
};

export function friendlyAppName(id: string): string {
  return APP_NAMES[id] || String(id || 'the studio').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Agents sometimes name a studio loosely ("video-generator", "vidverge",
 * "video"). Every opener resolves through this table so a loose id lands on a
 * real registered app instead of timing out against an app that cannot exist.
 */
const APP_ALIASES: Record<string, AppId> = {
  'video-generator': 'script-to-video',
  'video-gen': 'script-to-video',
  video: 'script-to-video',
  videos: 'script-to-video',
  vidverge: 'script-to-video',
  generator: 'script-to-video',
  'text-to-video': 'script-to-video',
  script: 'script-to-video',
  s2v: 'script-to-video',
  film: 'script-to-video',
  motion: 'script-to-video',
  'motion-engine': 'script-to-video',
  scripttovideo: 'script-to-video',
  ugc: 'ugc-studio',
  'ugc-video': 'ugc-studio',
  ugcstudio: 'ugc-studio',
  'creator-ad': 'ugc-studio',
  ads: 'ads-studio',
  ad: 'ads-studio',
  'ad-studio': 'ads-studio',
  adsstudio: 'ads-studio',
  vergeye: 'ads-studio',
  enhancer: 'video-enhancer',
  editor: 'video-enhancer',
  edit: 'video-enhancer',
  'video-editor': 'video-enhancer',
  videoenhancer: 'video-enhancer',
  'scene-forge': 'sceneforge',
  avatar: 'sceneforge',
  presenter: 'sceneforge',
  'avatar-video': 'sceneforge',
  brand: 'brand-context',
  'brand-kit': 'brand-context',
  brandkit: 'brand-context',
  brandcontext: 'brand-context',
  cine: 'cineagent',
  'cine-agent': 'cineagent',
  studio: 'cineagent',
  'faceless-video': 'faceless',
};

export function resolveAppId(raw: unknown): AppId | null {
  const id = String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!id) return null;
  if ((EMBEDDABLE_APP_IDS as readonly string[]).includes(id)) return id as AppId;
  if (APP_ALIASES[id]) return APP_ALIASES[id];
  if (id.includes('ugc')) return 'ugc-studio';
  if (id.includes('faceless')) return 'faceless';
  if (id.includes('scene') || id.includes('avatar') || id.includes('presenter')) return 'sceneforge';
  if (id.includes('enhanc') || id.includes('edit')) return 'video-enhancer';
  if (id.includes('brand')) return 'brand-context';
  if (id.includes('cine')) return 'cineagent';
  if (id.includes('ads') || id.includes('campaign')) return 'ads-studio';
  if (id.includes('script') || id.includes('video') || id.includes('motion') || id.includes('film') || id.includes('gen')) return 'script-to-video';
  return null;
}

/** Raised when a studio mounted beside the chat but never registered its live controller. */
export class BridgeConnectError extends Error {
  appId: AppId;
  constructor(appId: AppId) {
    super(`${friendlyAppName(appId)} is taking a moment to connect.`);
    this.name = 'BridgeConnectError';
    this.appId = appId;
  }
}

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'longtext' | 'choice' | 'multi' | 'number' | 'toggle' | 'file' | 'actor' | 'voice' | 'model';
  required: boolean;
  options?: () => Promise<Array<{ value: string; label: string; disabled?: string }>>;
  defaultFrom?: 'brandKit' | 'library' | 'request' | 'none';
}

export interface ActionSpec {
  key: string;
  label: string;
  paid: boolean;
  estimate?: (values: Record<string, unknown>) => Promise<{ credits: number }>;
}

export type AppEvent =
  | { type: 'field_changed'; key: string; value: unknown; by: 'user' | 'verger' }
  | { type: 'screen'; screen: string }
  | { type: 'shot'; index: number; status: 'waiting' | 'rendering' | 'done' | 'failed'; videoUrl?: string; error?: string }
  | { type: 'progress'; label: string; done: number; total: number }
  | { type: 'gate'; kind: 'look_check'; videoUrl: string }
  | { type: 'finished'; videoId: string; url: string; width: number; height: number; durationS: number }
  | { type: 'error'; message: string; actions?: string[] };

export interface AppController {
  appId: AppId;
  schema(): { fields: FieldSpec[]; actions: ActionSpec[] };
  getState(): { values: Record<string, unknown>; screen: string; busy: boolean; can: Record<string, { ok: boolean; reason?: string }> };
  fill(values: Record<string, unknown>, opts?: { animate?: boolean }): Promise<{ applied: string[]; rejected: Array<{ key: string; reason: string }> }>;
  run(action: string, opts?: { approvedCredits?: number; note?: string }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  subscribe(listener: (event: AppEvent) => void): () => void;
}

const controllers = new Map<AppId, AppController>();
const views = new Map<AppId, AppView>();

export function registerAppController(controller: AppController): () => void {
  controllers.set(controller.appId, controller);
  window.dispatchEvent(new CustomEvent('verger:bridge-controller', { detail: { appId: controller.appId } }));
  return () => {
    if (controllers.get(controller.appId) === controller) controllers.delete(controller.appId);
  };
}

export function useAppController(controller: AppController | null): void {
  useEffect(() => controller ? registerAppController(controller) : undefined, [controller]);
}

export function getAppController(id: AppId): AppController | null {
  return controllers.get(id) || null;
}

export function currentAppView(id: AppId): AppView {
  return views.get(id) || 'fullscreen';
}

export function setAppView(id: AppId, view: AppView): void {
  views.set(id, view);
  window.dispatchEvent(new CustomEvent('verger:bridge-view', { detail: { appId: id, view } }));
}

/** Retained for compatibility with older callers. Apps now always open docked beside the chat. */
export function rememberAppView(view: AppView): void {
  if (view !== 'side' && view !== 'popup') return;
  try { window.localStorage.setItem('verger:app-view', view); } catch { /* preference only */ }
}

const CONNECT_ATTEMPTS = 3;
const CONNECT_TIMEOUT_MS = 6_000;

function waitForController(id: AppId, timeoutMs: number): Promise<AppController | null> {
  const current = getAppController(id);
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const finish = (controller: AppController | null) => {
      window.clearTimeout(timer);
      window.removeEventListener('verger:bridge-controller', onController);
      resolve(controller);
    };
    const timer = window.setTimeout(() => finish(getAppController(id)), timeoutMs);
    const onController = (event: Event) => {
      if ((event as CustomEvent).detail?.appId !== id) return;
      const connected = getAppController(id);
      if (connected) finish(connected);
    };
    window.addEventListener('verger:bridge-controller', onController);
  });
}

/** Mount (or remount) a studio inline without waiting for its controller. */
export function mountEmbeddedApp(id: AppId, view: 'side' | 'hidden', remount = false): void {
  setAppView(id, view);
  window.dispatchEvent(new CustomEvent('verger:bridge-open', {
    detail: { appId: id, view, nonce: remount ? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : undefined },
  }));
}

/**
 * Open a studio attached to the chat and wait for its live controller.
 *
 * Apps ALWAYS render inline — docked beside the conversation (`side`) or
 * invisibly for Autopilot (`hidden`) — never in a separate popup or window,
 * and never with a full-screen requirement. The handshake retries
 * automatically with a fresh mount each attempt before giving up with a
 * BridgeConnectError that the chat turns into a Retry button.
 */
export async function openApp(rawId: AppId | string, view: AppView = 'side'): Promise<AppController> {
  const id = resolveAppId(rawId);
  if (!id) throw new Error(`"${String(rawId)}" does not match any Vidverge studio.`);
  const resolvedView: 'side' | 'hidden' = view === 'hidden' ? 'hidden' : 'side';
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
    mountEmbeddedApp(id, resolvedView, attempt > 0);
    const controller = await waitForController(id, CONNECT_TIMEOUT_MS * (attempt + 1));
    if (controller) return controller;
  }
  throw new BridgeConnectError(id);
}

export function createControllerBus() {
  const listeners = new Set<(event: AppEvent) => void>();
  return {
    emit(event: AppEvent) { listeners.forEach((listener) => listener(event)); },
    subscribe(listener: (event: AppEvent) => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function bridgeRequest<T = unknown>(appId: AppId, operation: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const done = (error?: unknown, value?: unknown) => {
      if (settled) return;
      settled = true;
      error ? reject(error instanceof Error ? error : new Error(String(error))) : resolve(value as T);
    };
    window.dispatchEvent(new CustomEvent('verger:app-request', { detail: { appId, operation, payload, done } }));
    window.setTimeout(() => done(new Error(`${appId} did not answer ${operation}.`)), 300_000);
  });
}
