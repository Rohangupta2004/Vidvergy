import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { friendlyAppName, setAppView, type AppId, type AppView } from '../../../lib/appBridge';

/**
 * Every registered studio mounts INLINE, attached to the chat — either as a
 * docked panel beside the conversation ('side') or invisibly for Autopilot
 * ('hidden'). There is deliberately no separate popup/window mode: a 'popup'
 * request from older callers is coerced to the docked panel.
 */
const EMBEDDED: Partial<Record<AppId, LazyExoticComponent<ComponentType<Record<string, never>>>>> = {
  'script-to-video': lazy(() => import('../../ScriptToVideo/App')),
  'ugc-studio': lazy(() => import('../../UGCStudio/App')),
  faceless: lazy(() => import('../../Faceless/App')),
  'video-enhancer': lazy(() => import('../../VideoEnhancer/App')),
  sceneforge: lazy(() => import('../../SceneForge/App')),
  'ads-studio': lazy(() => import('../../AdsStudio/App')),
  cineagent: lazy(() => import('../../CineAgent/App')),
  'brand-context': lazy(() => import('../../BrandContext/App')),
};

type OpenState = { appId: AppId; view: 'side' | 'hidden'; nonce: string } | null;

function coerceView(view: unknown): 'side' | 'hidden' {
  return view === 'hidden' ? 'hidden' : 'side';
}

function EmbeddedApp({ appId }: { appId: AppId }) {
  const Component = EMBEDDED[appId];
  if (!Component) {
    return <div className="grid h-full place-items-center p-8 text-center text-sm text-[var(--vg-secondary)]">This studio is loading a new version. Close this panel and ask Verger again.</div>;
  }
  return <Component />;
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
  const full = () => window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: open.appId } }));
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
      className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden border border-[color-mix(in_srgb,var(--vg-accent)_60%,var(--vg-border))] bg-[var(--vg-bg)] shadow-[0_0_60px_color-mix(in_srgb,var(--vg-accent)_18%,transparent)] lg:inset-y-4 lg:bottom-auto lg:left-auto lg:right-4 lg:h-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[min(54vw,860px)] lg:rounded-2xl"
      aria-label={`${friendlyAppName(open.appId)} beside chat`}
    >
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--vg-border)] bg-[var(--vg-surface)] px-3">
        <strong className="min-w-0 flex-1 truncate text-sm text-[var(--vg-text)]">{friendlyAppName(open.appId)}</strong>
        <span className="hidden text-[10px] text-[var(--vg-muted)] sm:inline">Verger is connected</span>
        <button type="button" onClick={full} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]" aria-label="Open full screen"><ExternalLink size={16} /></button>
        <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]" aria-label="Close studio"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </aside>
  );
}
