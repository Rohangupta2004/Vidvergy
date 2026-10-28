import { useCallback, useEffect, useRef, useState } from 'react';
import { withBrandContext } from '../../components/BrandContextLayer';
import VergerChat from './components/VergerChat';
import { openVidvergeStudio, saveVidvergeHandoff, type VidvergeAttachment } from '../../lib/vidvergeHandoff';
import { listVideoHistory } from '../../lib/videoHistory';
import { callHook, workspaceFetch, WORKSPACE_ID } from '../../lib/workspace';
import { TARGET_APPS, type QueueJob } from './types';
import { appCapability } from './lib/capabilities';
import { motionEngine } from '../../lib/motionEngineSdk';

const ROUTED_JOBS_KEY = 'verger_routed_jobs_v2';
const MAX_ROUTED = 8;

const VERGER_FEATURES = [
  { title: 'Website → video', detail: 'Paste a URL; Verger uses Brand Kit context and routes the production.' },
  { title: 'Script & concept', detail: 'Turn an idea or script into the right scene plan and studio handoff.' },
  { title: 'Presenter & faceless', detail: 'Coordinate SceneForge or Faceless from one conversation.' },
  { title: 'Edit saved videos', detail: 'Plan targeted, versioned edits without overwriting active work.' },
  { title: 'Visible execution', detail: 'Follow planning, specialist steps, approvals and verified results.' },
] as const;

interface RoutedJob {
  id: string;
  appId: string;
  name: string;
  at: number;
}

function loadRoutedJobs(): RoutedJob[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROUTED_JOBS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ROUTED) : [];
  } catch {
    return [];
  }
}

function saveRoutedJobs(jobs: RoutedJob[]): void {
  try {
    window.localStorage.setItem(ROUTED_JOBS_KEY, JSON.stringify(jobs.slice(0, MAX_ROUTED)));
  } catch {
    // Private browsing can disable storage. Conversation persistence handles
    // that independently and shows its own non-blocking warning.
  }
}

function appName(appId: string): string {
  return TARGET_APPS.find((app) => app.id === appId)?.name || appCapability(appId)?.name || appId;
}

/** Hidden operational context for Verger. It is never rendered as an agent or specialist surface. */
async function assembleJobs(routed: RoutedJob[]): Promise<QueueJob[]> {
  const jobs: QueueJob[] = routed.map((job) => ({
    id: job.id,
    projectId: job.id,
    name: job.name,
    stage: 'Brief handed off — open the studio to continue',
    app: appName(job.appId),
    appId: job.appId,
    state: 'waiting' as const,
    updatedAt: new Date(job.at).toISOString(),
  }));

  try {
    const motion = await motionEngine.list(5);
    (motion.jobs || []).forEach((job) => {
      jobs.unshift({
        id: `motion-${job.id}`,
        projectId: String(job.projectId || ''),
        name: motion.projects?.find((project) => String(project.id) === String(job.projectId))?.name || 'Motion project',
        stage: job.stage || job.status,
        app: 'Motion Engine',
        appId: 'vidverge-agent',
        state: job.status === 'complete' ? 'completed' : job.status === 'failed' || job.status === 'cancelled' ? 'failed' : job.status === 'awaiting_approval' ? 'waiting' : 'active',
        updatedAt: job.updatedAt,
      });
    });
  } catch {
    // Queue context is optional; chat remains available.
  }

  try {
    const s2v = await callHook<any>('s2v-agent-status', {});
    if (s2v?.success && s2v.state !== 'none') {
      jobs.unshift({
        id: `s2v-${s2v.project_id || s2v.handoff_id || 'brief'}`,
        projectId: String(s2v.project_id || s2v.handoff_id || ''),
        name: String(s2v.title || 'Script-to-Video film'),
        stage: String(s2v.stage || s2v.message || s2v.state),
        app: 'Script-to-Video',
        appId: 'script-to-video',
        state: s2v.final_video_url ? 'completed' : s2v.needs_action ? 'failed' : s2v.state === 'brief_saved' ? 'waiting' : 'active',
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Queue context is optional; chat remains available.
  }

  try {
    const history = await listVideoHistory(4);
    history.forEach((video) => {
      jobs.push({
        id: `done-${video.id}`,
        projectId: video.id,
        name: video.title,
        stage: 'Finished video in your library',
        app: appName(video.app_id),
        appId: video.app_id,
        state: 'completed',
        updatedAt: video.created_at,
      });
    });
  } catch {
    // Library context is optional; the turn itself reloads it when needed.
  }

  return jobs.slice(0, 10);
}

function VergerApp() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [routed, setRouted] = useState<RoutedJob[]>(() => loadRoutedJobs());
  const routedRef = useRef(routed);
  routedRef.current = routed;

  const refreshJobs = useCallback(async () => {
    setJobs(await assembleJobs(routedRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (!cancelled) void refreshJobs().catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener('sle-fields-changed', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('sle-fields-changed', refresh);
    };
  }, [refreshJobs]);

  const handleRouteStudio = useCallback(async (route: { appId: string; brief: string }, attachment: VidvergeAttachment | null) => {
    let actionMessage = '';
    if (route.appId === 'script-to-video') {
      const suppliedScript = /(?:^|\n)\s*(?:scene\s+\d+|script\s*:|screenplay\s*:)/i.test(route.brief);
      const result = await callHook<any>('s2v-agent-handoff', {
        op: 'create_handoff',
        brief: route.brief,
        script: suppliedScript ? route.brief : '',
        entry_type: suppliedScript ? 'script' : 'idea',
        duration_seconds: Math.max(2, Math.min(600, Number(route.brief.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[1]) || 30)),
        aspect_ratio: /\b9:16\b|\bvertical\b|\bportrait\b/i.test(route.brief) ? '9:16' : /\b1:1\b|\bsquare\b/i.test(route.brief) ? '1:1' : '16:9',
        model: 'auto',
        audio_policy: /\bsilent\b|\bno audio\b/i.test(route.brief) ? 'fully-silent' : /\bnarrat/i.test(route.brief) ? 'narration-voiceover' : 'no-narration',
        storyboard_requested: /\bstoryboard\b/i.test(route.brief),
        source: 'verger',
      });
      actionMessage = String(result?.message || 'Your Script-to-Video brief is saved.');
    } else {
      saveVidvergeHandoff({ appId: route.appId, prompt: route.brief, attachment });
      actionMessage = `Your brief is ready in ${appName(route.appId)}.`;
    }

    const entry: RoutedJob = {
      id: `route-${Date.now()}`,
      appId: route.appId,
      name: route.brief.replace(/\s+/g, ' ').slice(0, 64) || `Brief for ${appName(route.appId)}`,
      at: Date.now(),
    };
    setRouted((previous) => {
      const next = [entry, ...previous].slice(0, MAX_ROUTED);
      saveRoutedJobs(next);
      return next;
    });
    openVidvergeStudio(route.appId);
    window.setTimeout(() => void refreshJobs().catch(() => undefined), 400);
    return { message: actionMessage };
  }, [refreshJobs]);

  const handleUploadAttachment = useCallback(async (file: File): Promise<VidvergeAttachment> => {
    const form = new FormData();
    form.append('file', file);
    form.append('workspaceId', WORKSPACE_ID);
    form.append('folder', 'verger-attachments');
    const response = await workspaceFetch('/api/upload/file', { method: 'POST', body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.url) throw new Error(String(data?.error || 'The attachment could not be uploaded.'));
    return { url: String(data.url), name: file.name, type: file.type || 'application/octet-stream' };
  }, []);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--vg-bg)] text-[var(--vg-text)]"
      style={{ fontFamily: 'Manrope, "Segoe UI", sans-serif' }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-34%] h-[72%] w-[88%] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_9%,transparent)] blur-[120px]" />
        <div className="absolute bottom-[-46%] right-[-18%] h-[64%] w-[58%] rounded-full bg-[color-mix(in_srgb,var(--vg-bronze)_10%,transparent)] blur-[120px]" />
      </div>
      <main className="relative z-10 flex min-h-0 flex-1 justify-center overflow-hidden px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="flex h-full min-h-0 w-full max-w-[1240px] gap-4">
          <aside className="hidden w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_18%,var(--vg-border))] bg-[color-mix(in_srgb,var(--vg-surface)_90%,transparent)] p-4 backdrop-blur-xl lg:flex">
            <div className="border-b border-[var(--vg-border)] pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--vg-accent)]">Agent features</p>
              <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-[var(--vg-text)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>One brief, coordinated end to end</h2>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--vg-muted)]">Verger is the single assistant operating every production workflow.</p>
            </div>
            <ul className="mt-3 space-y-2 overflow-y-auto">
              {VERGER_FEATURES.map((feature, index) => (
                <li key={feature.title} className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--vg-accent)_14%,transparent)] text-[10px] font-bold text-[var(--vg-accent)]">{index + 1}</span>
                    <span className="text-[12px] font-semibold text-[var(--vg-text)]">{feature.title}</span>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--vg-secondary)]">{feature.detail}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-[var(--vg-border)] pt-3">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--vg-muted)]">Saved videos</p>
              <div className="mt-2 space-y-1.5">
                {jobs.filter((job) => job.state === 'completed').slice(0, 3).map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => { window.location.hash = 'library'; }}
                    className="block w-full truncate rounded-lg border border-[var(--vg-border)] bg-[var(--vg-raised)] px-2.5 py-2 text-left text-[10px] text-[var(--vg-secondary)] transition-colors hover:border-[var(--vg-control-border)] hover:text-[var(--vg-text)]"
                    title={job.name}
                  >
                    {job.name}
                  </button>
                ))}
                {!jobs.some((job) => job.state === 'completed') && (
                  <p className="text-[10px] leading-relaxed text-[var(--vg-muted)]">Finished videos will stay here and in Videos.</p>
                )}
              </div>
            </div>
            <p className="mt-auto border-t border-[var(--vg-border)] pt-3 text-[10px] leading-relaxed text-[var(--vg-muted)]">Generation starts only after the exact seconds and credits are approved.</p>
          </aside>
          <div className="min-w-0 flex-1">
            <VergerChat jobs={jobs} onRouteStudio={handleRouteStudio} onUploadAttachment={handleUploadAttachment} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default withBrandContext(VergerApp, 'Verger');
