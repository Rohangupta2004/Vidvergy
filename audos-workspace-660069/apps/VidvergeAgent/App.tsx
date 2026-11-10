import { useCallback, useEffect, useRef, useState } from 'react';
import BrandContextLayer from '../../components/BrandContextLayer';
import VergerChat from './components/VergerChat';
import AppBridgeHost from './components/AppBridgeHost';
import { saveVidvergeHandoff, type VidvergeAttachment } from '../../lib/vidvergeHandoff';
import { friendlyAppName, mountEmbeddedApp, openApp as openBridgedApp, resolveAppId, type AppController, type AppView } from '../../lib/appBridge';
import { listVideoHistory } from '../../lib/videoHistory';
import { callHook, workspaceFetch, WORKSPACE_ID } from '../../lib/workspace';
import { TARGET_APPS, type QueueJob } from './types';
import { appCapability } from './lib/capabilities';
import { motionEngine } from '../../lib/motionEngineSdk';

const ROUTED_JOBS_KEY = 'verger_routed_jobs_v2';
const MAX_ROUTED = 8;

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
  return TARGET_APPS.find((app) => app.id === appId)?.name || appCapability(appId)?.name || friendlyAppName(appId);
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

  /**
   * Open a studio over the chat for Copilot, or hidden for Autopilot. The
   * customer stays in one conversation and never gets redirected.
   */
  const handleRouteStudio = useCallback(async (route: { appId: string; brief: string; view?: AppView }, attachment: VidvergeAttachment | null): Promise<{ message: string; controller: AppController | null }> => {
    const appId = resolveAppId(route.appId) || 'script-to-video';
    const view: 'popup' | 'hidden' = route.view === 'hidden' ? 'hidden' : 'popup';
    let controller: AppController | null = null;
    try {
      controller = await openBridgedApp(appId, view);
    } catch {
      saveVidvergeHandoff({ appId, prompt: route.brief, attachment });
      mountEmbeddedApp(appId, view, true);
      controller = null;
    }
    const entry: RoutedJob = {
      id: `route-${Date.now()}`,
      appId,
      name: route.brief.replace(/\s+/g, ' ').slice(0, 64) || `Brief for ${appName(appId)}`,
      at: Date.now(),
    };
    setRouted((previous) => {
      const next = [entry, ...previous].slice(0, MAX_ROUTED);
      saveRoutedJobs(next);
      return next;
    });
    window.setTimeout(() => void refreshJobs().catch(() => undefined), 400);
    return {
      message: controller
        ? `${appName(appId)} is connected to this chat.`
        : `${appName(appId)} is open over this chat with your brief already filled in.`,
      controller,
    };
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
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-[var(--vg-bg)] text-[var(--vg-text)]" style={{ fontFamily: 'var(--body)' }}>
      <main className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
          <VergerChat jobs={jobs} onRouteStudio={handleRouteStudio} onUploadAttachment={handleUploadAttachment} />
        </div>
      </main>
      <AppBridgeHost />
      <BrandContextLayer />
    </div>
  );
}

export default VergerApp;
