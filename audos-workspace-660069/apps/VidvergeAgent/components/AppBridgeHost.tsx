import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Loader2, X } from 'lucide-react';
import { createControllerBus, currentAppView, friendlyAppName, mountEmbeddedApp, setAppView, useAppController, type AppController, type AppId, type AppView } from '../../../lib/appBridge';
import { saveVidvergeHandoff } from '../../../lib/vidvergeHandoff';

/**
 * Copilot studios open as centered overlays above the conversation. Autopilot
 * keeps the same studios hidden while their bridge controllers do the work.
 */
const EMBEDDED: Partial<Record<AppId, LazyExoticComponent<ComponentType<any>>>> = {
  'script-to-video': lazy(() => import('../../ScriptToVideo/App')),
  'video-provider-lab': lazy(() => import('../../VideoProviderLab/App')),
  'ugc-studio': lazy(() => import('../../UGCStudio/App')),
  faceless: lazy(() => import('../../Faceless/App')),
  'video-enhancer': lazy(() => import('../../VideoEnhancer/App')),
  sceneforge: lazy(() => import('../../SceneForge/App')),
  'ads-studio': lazy(() => import('../../AdsStudio/App')),
  cineagent: lazy(() => import('../../CineAgent/App')),
  'brand-context': lazy(() => import('../../BrandContext/App')),
};

type OpenState = { appId: AppId; view: 'popup' | 'hidden'; nonce: string } | null;

function coerceView(view: unknown): 'popup' | 'hidden' {
  return view === 'hidden' ? 'hidden' : 'popup';
}

const NATIVE_CONTROLLER_APPS = new Set<AppId>(['script-to-video', 'video-provider-lab']);

/**
 * Older studios consume a saved Verger handoff but never registered an
 * AppController, which made open_app wait until it failed even though the app
 * itself had mounted. This small controller exposes exactly that truthful
 * contract: the intake is connected and can accept a brief; generation stays
 * inside the studio's existing workflow.
 */
function HandoffController({ appId }: { appId: AppId }) {
  const values = useRef<Record<string, unknown>>({ brief: '' });
  const bus = useRef(createControllerBus()).current;
  const controller = useMemo<AppController>(() => ({
    appId,
    schema: () => ({
      fields: [{ key: 'brief', label: 'Brief', type: 'longtext', required: true, defaultFrom: 'request' }],
      actions: [],
    }),
    getState: () => ({ values: { ...values.current }, screen: 'intake', busy: false, can: {} }),
    fill: async (next) => {
      const brief = String(next.brief || next.idea || next.script || '').trim();
      values.current = { ...values.current, ...next, ...(brief ? { brief } : {}) };
      if (brief) {
        saveVidvergeHandoff({ appId, prompt: brief });
        mountEmbeddedApp(appId, currentAppView(appId) === 'hidden' ? 'hidden' : 'side', true);
      }
      const applied = Object.keys(next);
      applied.forEach((key) => bus.emit({ type: 'field_changed', key, value: next[key], by: 'verger' }));
      return { applied, rejected: [] };
    },
    run: async () => ({ ok: false, error: `${friendlyAppName(appId)} accepts the brief here; its own workflow controls production.` }),
    subscribe: bus.subscribe,
  }), [appId, bus]);
  useAppController(controller);
  return null;
}

function EmbeddedApp({ appId }: { appId: AppId }) {
  const Component = EMBEDDED[appId];
  if (!Component) {
    return <div className="grid h-full place-items-center p-8 text-center text-sm text-[var(--vg-secondary)]">This studio is loading a new version. Close this panel and ask Verger again.</div>;
  }
  return <>{!NATIVE_CONTROLLER_APPS.has(appId) ? <HandoffController appId={appId} /> : null}<Component /></>;
}

export default function AppBridgeHost() {
  const [open, setOpen] = useState<OpenState>(null);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (!detail.appId) return;
      setOpen((current) => ({
        appId: detail.appId,
        view: coerceView(detail.view),
        // A fresh nonce forces a remount so the studio re-reads any saved
        // handoff and re-registers its controller on a handshake retry.
        nonce: String(detail.nonce || (current && current.appId === detail.appId ? current.nonce : 'initial')),
      }));
    };
    const onView = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setOpen((current) => current && current.appId === detail.appId ? { ...current, view: coerceView(detail.view) } : current);
    };
    window.addEventListener('verger:bridge-open', onOpen);
    window.addEventListener('verger:bridge-view', onView);
    return () => {
      window.removeEventListener('verger:bridge-open', onOpen);
      window.removeEventListener('verger:bridge-view', onView);
    };
  }, []);
  if (!open) return null;
  const close = () => {
    setAppView(open.appId, 'hidden');
    setOpen(null);
  };
  const body = (
    <Suspense fallback={<div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[var(--vg-accent)] motion-reduce:animate-none" /></div>}>
      <EmbeddedApp key={`${open.appId}-${open.nonce}`} appId={open.appId} />
    </Suspense>
  );
  if (open.view === 'hidden') {
    return <div aria-hidden className="pointer-events-none fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0">{body}</div>;
  }
  return (
    <aside
      className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden border border-[var(--vg-control-border)] bg-[var(--vg-bg)] shadow-2xl sm:inset-[4%] sm:h-[92%] sm:w-[92%] sm:rounded-xl"
      aria-label={`${friendlyAppName(open.appId)} over chat`}
    >
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--vg-border)] bg-[var(--vg-surface)] px-3">
        <strong className="min-w-0 flex-1 truncate text-sm text-[var(--vg-text)]">{friendlyAppName(open.appId)}</strong>
        <span className="hidden text-xs text-[var(--vg-muted)] sm:inline">Verger is filling this in…</span>
        <button type="button" onClick={close} className="flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]" aria-label="Back to chat"><X size={16} /> Back to chat</button>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </aside>
  );
}
