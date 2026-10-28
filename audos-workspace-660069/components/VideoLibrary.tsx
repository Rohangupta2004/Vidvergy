import { useEffect, useMemo, useState } from 'react';
import {
  Check, Copy, Download, Film, Loader2, Pencil, Play, RefreshCw, Search, X,
} from 'lucide-react';
import {
  backfillProviderLabHistory,
  listVideoHistoryPage,
  type VideoHistoryRow,
} from '../lib/videoHistory';
import LibraryVideoEditor from './LibraryVideoEditor';

export const APP_LABELS: Record<string, string> = {
  vidverge: 'Video Engine',
  'vidverge-engine': 'Video Engine',
  'vidverge-agent': 'Verger',
  faceless: 'Faceless',
  'video-enhancer': 'Video Enhancer',
  'script-to-video': 'Script-to-Video',
  sceneforge: 'SceneForge',
  'ads-studio': 'Vergeye Ads Studio',
  'video-provider-lab': 'Provider Lab',
  cineagent: 'CineAgent',
  'cine-agent': 'CineAgent',
};

const PAGE_SIZE = 48;
const PROVIDER_BACKFILL_KEY = 'vv:provider-lab-history-backfill:v1';

function appLabel(id: string): string {
  return APP_LABELS[id] || id.split(/[-_]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function dateLabel(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

function durationLabel(value: number | null): string {
  if (!value || value < 1) return '';
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

export default function VideoLibrary() {
  const [rows, setRows] = useState<VideoHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [playing, setPlaying] = useState<VideoHistoryRow | null>(null);
  const [editing, setEditing] = useState<VideoHistoryRow | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const [fetchingProvider, setFetchingProvider] = useState(false);
  const [providerNotice, setProviderNotice] = useState('');

  const load = async (reset = true, quiet = false) => {
    if (quiet) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const offset = reset ? 0 : rows.length;
      const page = await listVideoHistoryPage(PAGE_SIZE, offset);
      setRows((current) => reset ? page.videos : [...current, ...page.videos.filter((item) => !current.some((row) => row.id === item.id))]);
      setHasMore(page.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Your video library could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const alreadyRan = window.localStorage.getItem(PROVIDER_BACKFILL_KEY) === 'done';
        if (!alreadyRan) {
          const result = await backfillProviderLabHistory();
          if (result && !cancelled) window.localStorage.setItem(PROVIDER_BACKFILL_KEY, 'done');
        }
      } catch {
        // Best effort only. The manual action stays available in the header.
      }
      if (!cancelled) await load(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [playing]);

  const apps = useMemo(() => {
    const ids = Array.from(new Set(rows.map((row) => row.app_id)));
    return ids.sort((a, b) => appLabel(a).localeCompare(appLabel(b)));
  }, [rows]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => appFilter === 'all' || row.app_id === appFilter)
      .filter((row) => !needle || row.title.toLowerCase().includes(needle))
      .sort((a, b) => {
        const difference = (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
        return sort === 'oldest' ? difference : -difference;
      });
  }, [appFilter, rows, search, sort]);

  const fetchProviderRenders = async () => {
    if (fetchingProvider) return;
    setFetchingProvider(true);
    setProviderNotice('');
    try {
      const result = await backfillProviderLabHistory();
      if (!result) throw new Error('Provider Lab renders could not be checked.');
      window.localStorage.setItem(PROVIDER_BACKFILL_KEY, 'done');
      setProviderNotice(result.inserted
        ? `${result.inserted} Provider Lab render${result.inserted === 1 ? '' : 's'} added.`
        : 'Provider Lab is up to date.');
      await load(true, true);
    } catch (fetchError) {
      setProviderNotice(fetchError instanceof Error ? fetchError.message : 'Provider Lab renders could not be checked.');
    } finally {
      setFetchingProvider(false);
    }
  };

  const copyLink = async (row: VideoHistoryRow) => {
    try {
      await copyText(row.video_url);
      setCopiedId(row.id);
      window.setTimeout(() => setCopiedId((current) => current === row.id ? '' : current), 1800);
    } catch {
      setProviderNotice('The video link could not be copied.');
    }
  };

  return (
    <main className="min-h-full bg-[radial-gradient(ellipse_70%_36%_at_50%_-8%,color-mix(in_srgb,var(--vg-accent)_10%,transparent),transparent_66%),var(--vg-bg)] px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--vg-accent)]">Every finished render</p>
            <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold tracking-tight text-[var(--vg-text)]">Library</h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--vg-secondary)]">Search, preview and download videos made across Verger and every specialist studio.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchProviderRenders()}
              disabled={fetchingProvider}
              className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-surface)] px-4 text-sm font-semibold text-[var(--vg-text)] transition-colors hover:bg-[var(--vg-hover)] disabled:opacity-50"
            >
              {fetchingProvider ? <Loader2 className="h-4 w-4 animate-spin text-[var(--vg-accent)]" /> : <Film className="h-4 w-4 text-[var(--vg-accent)]" />}
              Fetch Provider Lab renders
            </button>
            <button
              type="button"
              onClick={() => void load(true, true)}
              disabled={loading || refreshing}
              className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-surface)] px-4 text-sm font-semibold text-[var(--vg-text)] transition-colors hover:bg-[var(--vg-hover)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 text-[var(--vg-accent)] ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {providerNotice ? (
          <div className="mb-4 rounded-[10px] border border-[color-mix(in_srgb,var(--vg-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--vg-accent)_8%,transparent)] px-4 py-3 text-sm text-[var(--vg-secondary)]" role="status">
            {providerNotice}
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <section className="mb-5 space-y-3" aria-label="Library controls">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vg-muted)]" />
                <span className="sr-only">Search videos by title</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by title"
                  className="min-h-11 w-full rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-surface)] pl-10 pr-4 text-sm text-[var(--vg-text)] outline-none placeholder:text-[var(--vg-muted)] focus:border-[var(--vg-focus)] focus:outline focus:outline-2 focus:outline-offset-[3px] focus:outline-[var(--vg-focus)]"
                />
              </label>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')}
                aria-label="Sort videos"
                className="min-h-11 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-surface)] px-3 text-sm font-semibold text-[var(--vg-text)] outline-none focus:border-[var(--vg-focus)] focus:outline focus:outline-2 focus:outline-offset-[3px] focus:outline-[var(--vg-focus)]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by app">
              {['all', ...apps].map((id) => {
                const active = appFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAppFilter(id)}
                    className="min-h-11 shrink-0 rounded-[10px] border px-4 text-sm font-semibold transition-colors"
                    style={{
                      borderColor: active ? 'var(--vg-accent)' : 'var(--vg-border)',
                      background: active ? 'var(--vg-accent-soft)' : 'var(--vg-surface)',
                      color: active ? 'var(--vg-accent)' : 'var(--vg-secondary)',
                    }}
                  >
                    {id === 'all' ? 'All apps' : appLabel(id)}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] text-sm text-[var(--vg-muted)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--vg-accent)]" /> Loading your library…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] bg-[var(--vg-danger-bg)] p-5">
            <p className="font-semibold text-[var(--vg-danger)]">Library unavailable</p>
            <p className="mt-1 text-sm text-[var(--vg-secondary)]">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-[10px] border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] px-4 text-sm font-semibold text-[var(--vg-danger)]">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No finished videos yet" body="Start from Create. Completed renders appear here automatically." />
        ) : shown.length === 0 ? (
          <EmptyState title="No videos match this view" body="Try another app filter or clear the title search." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((row) => (
                <article key={row.id} className="overflow-hidden rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] transition-colors hover:border-[var(--vg-control-border)]">
                  <button type="button" onClick={() => setPlaying(row)} className="group relative block aspect-video w-full bg-black" aria-label={`Play ${row.title}`}>
                    {row.thumbnail_url ? (
                      <img src={row.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <video src={row.video_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/20 transition-colors group-hover:bg-black/35">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--vg-accent)] text-[var(--vg-on-accent)]"><Play className="h-5 w-5" /></span>
                    </span>
                    {row.duration_sec ? <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-white">{durationLabel(row.duration_sec)}</span> : null}
                  </button>
                  <div className="p-4">
                    <h2 className="truncate text-sm font-semibold text-[var(--vg-text)]" title={row.title}>{row.title}</h2>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-[var(--vg-accent)]">{appLabel(row.app_id)}</span>
                      <span className="shrink-0 text-[var(--vg-muted)]">{dateLabel(row.created_at)}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2">
                      <button type="button" onClick={() => setEditing(row)} className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] px-3 text-sm font-semibold text-[var(--vg-text)] hover:bg-[var(--vg-hover)]"><Pencil className="h-4 w-4 text-[var(--vg-accent)]" /> Edit</button>
                      <a href={row.video_url} download target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] px-3 text-sm font-semibold text-[var(--vg-on-accent)]">
                        <Download className="h-4 w-4" /> Download
                      </a>
                      <button type="button" onClick={() => void copyLink(row)} className="grid min-h-11 min-w-11 place-items-center rounded-[10px] border border-[var(--vg-control-border)] text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]" aria-label={`Copy link for ${row.title}`} title="Copy video link">
                        {copiedId === row.id ? <Check className="h-4 w-4 text-[var(--vg-success)]" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {hasMore ? (
              <div className="mt-6 flex justify-center">
                <button type="button" onClick={() => void load(false)} disabled={loadingMore} className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-surface)] px-5 text-sm font-semibold text-[var(--vg-text)] hover:bg-[var(--vg-hover)] disabled:opacity-50">
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin text-[var(--vg-accent)]" /> : null}
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {playing ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={`Playing ${playing.title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPlaying(null); }}>
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--vg-control-border)] bg-[var(--vg-surface)] shadow-2xl">
            <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--vg-border)] px-4">
              <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--vg-text)]">{playing.title}</h2><p className="text-xs text-[var(--vg-muted)]">{appLabel(playing.app_id)}</p></div>
              <button type="button" onClick={() => setPlaying(null)} className="grid min-h-11 min-w-11 place-items-center rounded-[10px] text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]" aria-label="Close player"><X className="h-5 w-5" /></button>
            </header>
            <video src={playing.video_url} controls autoPlay playsInline className="max-h-[72vh] w-full bg-black object-contain" />
            <footer className="flex flex-wrap justify-end gap-2 p-4">
              <button type="button" onClick={() => void copyLink(playing)} className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] px-4 text-sm font-semibold text-[var(--vg-text)] hover:bg-[var(--vg-hover)]"><Copy className="h-4 w-4" /> Copy link</button>
              <button type="button" onClick={() => { setEditing(playing); setPlaying(null); }} className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] px-4 text-sm font-semibold text-[var(--vg-text)]"><Pencil className="h-4 w-4 text-[var(--vg-accent)]" /> Edit in Library</button>
              <a href={playing.video_url} download target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] px-4 text-sm font-semibold text-[var(--vg-on-accent)]"><Download className="h-4 w-4" /> Download</a>
            </footer>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-[125] overflow-y-auto bg-black/85 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Editing ${editing.title}`}>
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--vg-control-border)] bg-[var(--vg-surface)] shadow-2xl">
            <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--vg-border)] px-4"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--vg-text)]">{editing.title}</h2><p className="text-xs text-[var(--vg-muted)]">Saved video · edits autosave here</p></div><button type="button" onClick={() => setEditing(null)} className="grid min-h-11 min-w-11 place-items-center rounded-[10px] text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]" aria-label="Close editor"><X className="h-5 w-5" /></button></header>
            <LibraryVideoEditor row={editing} onUpdated={(next) => { setEditing(next); setRows((current) => current.map((item) => item.id === next.id ? next : item)); }} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--vg-control-border)] bg-[var(--vg-surface)] px-6 text-center">
      <Film className="h-7 w-7 text-[var(--vg-accent)]" />
      <h2 className="mt-3 font-['Space_Grotesk'] text-lg font-semibold text-[var(--vg-text)]">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-[var(--vg-secondary)]">{body}</p>
    </div>
  );
}
