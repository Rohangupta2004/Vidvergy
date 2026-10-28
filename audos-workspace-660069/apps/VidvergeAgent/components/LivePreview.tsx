import { useEffect, useState } from 'react';
import { Film, Loader2, Play, RefreshCw } from 'lucide-react';
import { listVideoHistory, type VideoHistoryRow } from '../../../lib/videoHistory';

export default function LivePreview({ projectTitle }: { projectTitle: string }) {
  const [videos, setVideos] = useState<VideoHistoryRow[]>([]);
  const [selected, setSelected] = useState<VideoHistoryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const rows = await listVideoHistory(8);
      setVideos(rows);
      setSelected((current) => rows.find((row) => row.id === current?.id) || rows[0] || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Preview could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-[var(--vg-border)] bg-[var(--vg-surface)] lg:sticky lg:top-4 lg:self-start">
      <header className="flex min-h-14 items-center gap-3 border-b border-[var(--vg-border)] px-4" style={{ background: 'var(--vg-gradient-surface)' }}>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--vg-accent-soft)] text-[var(--vg-accent)]"><Play className="h-4 w-4" /></span>
        <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--vg-text)]">Live preview</h2><p className="truncate text-[10px] text-[var(--vg-muted)]">{projectTitle || 'Latest saved video'}</p></div>
        <button type="button" onClick={() => void load()} className="ml-auto grid min-h-10 min-w-10 place-items-center rounded-[10px] text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]" aria-label="Refresh preview"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </header>

      <div className="p-3">
        {loading && !selected ? <div className="grid aspect-video place-items-center rounded-xl bg-black text-[var(--vg-muted)]"><Loader2 className="h-5 w-5 animate-spin" /></div> : selected ? <video key={selected.video_url} src={selected.video_url} poster={selected.thumbnail_url || undefined} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black object-contain" /> : <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-4 text-center"><Film className="h-6 w-6 text-[var(--vg-accent)]" /><p className="mt-2 text-xs font-semibold text-[var(--vg-text)]">No saved video yet</p><p className="mt-1 text-[10px] text-[var(--vg-muted)]">Finished studio results appear here automatically.</p></div>}
        {error ? <p className="mt-2 text-xs text-[var(--vg-danger)]">{error}</p> : null}

        {videos.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{videos.map((video) => <button key={video.id} type="button" onClick={() => setSelected(video)} className={`min-w-[138px] rounded-[10px] border p-2 text-left ${selected?.id === video.id ? 'border-[var(--vg-accent)] bg-[var(--vg-accent-soft)]' : 'border-[var(--vg-border)] bg-[var(--vg-raised)]'}`}><span className="block truncate text-[11px] font-semibold text-[var(--vg-text)]">{video.title}</span><span className="mt-1 block text-[9px] text-[var(--vg-muted)]">{video.duration_sec ? `${video.duration_sec}s` : 'Saved video'}</span></button>)}</div> : null}

        <button type="button" onClick={() => { window.location.hash = 'library'; }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] text-sm font-semibold text-[var(--vg-text)] hover:bg-[var(--vg-hover)]"><Film className="h-4 w-4 text-[var(--vg-accent)]" /> Open Library to edit</button>
        <p className="mt-2 text-center text-[9px] text-[var(--vg-muted)]">Preview is read-only. Manual and Verger edits both live in Library with autosave and undo.</p>
      </div>
    </aside>
  );
}
