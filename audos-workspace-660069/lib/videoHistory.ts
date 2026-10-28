/**
 * SHARED CROSS-APP VIDEO HISTORY — the client side.
 *
 * Every app in the suite that finishes a video writes one row here, and the
 * shared `components/VideoHistory.tsx` list reads them back. Both directions go
 * through server functions (`vge-save-video` / `vge-list-videos`) rather than
 * the browser's `window.__workspaceDb` client, for two reasons:
 *
 *   1. ONE TABLE FOR EVERY APP. The old history read `vge_video_jobs`, which is
 *      the Vidverge engine's own job table and carries a pipeline CHECK
 *      constraint no other app can satisfy. `vv_video_history` has no such
 *      constraint, so Faceless, SceneForge, Ads Studio and the rest can all
 *      land a row in it.
 *   2. THE ROW IS SERVER-OWNED. A published space bundle carries a public
 *      workspace token, so anything the browser can write, anyone can forge.
 *      The functions stamp `session_id` from the validated `session.id` and
 *      ignore any identity in the request body.
 *
 * AUTH: both functions are gated with `executeAuth: 'workspace_session'`, which
 * means the caller must present a real platform-issued session id in
 * `X-Session-Id`. A workspace DB token does NOT satisfy that gate, so these
 * calls follow the same convention as `lib/credits.ts`: the canonical session
 * id from `spaceSessionId()`, plus `X-App-Id` because space pages are served
 * `Referrer-Policy: no-referrer` and a bare fetch resolves to no space.
 *
 * NOTHING HERE THROWS. Saving a video to history is a side effect of a
 * generation that already succeeded — a failed save must never surface as a
 * failed render, so every path resolves to `false` / `[]` instead.
 */
import { callHook, getSessionId, refreshWorkspaceSession } from './workspace';

export interface VideoHistoryRow {
  id: string;
  app_id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  created_at: string;
}

export interface VideoHistoryPage {
  videos: VideoHistoryRow[];
  hasMore: boolean;
}

export interface ProviderLabBackfillResult {
  scanned: number;
  inserted: number;
  deduplicated: number;
}

/**
 * One call to a history function. Returns null when there is nobody to attach
 * the row to (no session yet) or the function could not be reached — callers
 * must read null as "unknown", never as "empty".
 */
async function callHistory(name: string, payload: Record<string, unknown>): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  if (!getSessionId()) await refreshWorkspaceSession();
  if (!getSessionId()) return null;
  try {
    const data = await callHook<any>(name, payload);
    return data && typeof data === 'object' ? data : null;
  } catch (error) {
    console.warn(`[video-history] ${name} unreachable:`, error);
    return null;
  }
}

/**
 * Record one finished video in the shared history.
 *
 * FIRE AND FORGET. Call it as `void saveVideoToHistory({ … })` from the point
 * where the final URL is confirmed — never `await` it, and never let it gate
 * what the customer sees. It resolves `false` rather than throwing.
 */
export async function saveVideoToHistory(opts: {
  appId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
}): Promise<boolean> {
  if (!opts || typeof opts.videoUrl !== 'string' || !/^https?:\/\//i.test(opts.videoUrl)) {
    return false;
  }
  const data = await callHistory('vge-save-video', {
    app_id: opts.appId,
    title: opts.title,
    video_url: opts.videoUrl,
    thumbnail_url: opts.thumbnailUrl ?? null,
    duration_sec: opts.durationSec ?? null,
  });
  if (!data || data.success !== true) {
    if (data) console.warn('[video-history] not saved:', data.error || 'unknown refusal');
    return false;
  }
  return true;
}

function normalizeRows(rows: unknown[]): VideoHistoryRow[] {
  return rows
    .map(
      (raw: any): VideoHistoryRow => ({
        id: String(raw?.id || ''),
        app_id: String(raw?.app_id || 'unknown'),
        title: String(raw?.title || 'Untitled'),
        video_url: String(raw?.video_url || ''),
        thumbnail_url: raw?.thumbnail_url ? String(raw.thumbnail_url) : null,
        duration_sec:
          raw?.duration_sec == null || !Number.isFinite(Number(raw.duration_sec))
            ? null
            : Math.round(Number(raw.duration_sec)),
        created_at: raw?.created_at ? String(raw.created_at) : '',
      }),
    )
    .filter((row: VideoHistoryRow) => Boolean(row.id && row.video_url));
}

/** One page of this visitor's own videos across every app, newest first. */
export async function listVideoHistoryPage(limit = 48, offset = 0): Promise<VideoHistoryPage> {
  const data = await callHistory('vge-list-videos', { limit, offset });
  const rows = data && Array.isArray(data.videos) ? data.videos : [];
  return { videos: normalizeRows(rows), hasMore: data?.has_more === true };
}

/** Backward-compatible first-page helper used by compact history lists. */
export async function listVideoHistory(limit = 12): Promise<VideoHistoryRow[]> {
  return (await listVideoHistoryPage(limit, 0)).videos;
}

/**
 * Ask the server to adopt completed Provider Lab renders owned by the validated
 * session. The operation is idempotent on session + video URL and never gates a
 * render; callers may safely invoke it on first open and from a manual button.
 */
export async function backfillProviderLabHistory(): Promise<ProviderLabBackfillResult | null> {
  const data = await callHistory('vge-backfill-provider-lab', {});
  if (!data || data.success !== true) return null;
  return {
    scanned: Math.max(0, Number(data.scanned) || 0),
    inserted: Math.max(0, Number(data.inserted) || 0),
    deduplicated: Math.max(0, Number(data.deduplicated) || 0),
  };
}
