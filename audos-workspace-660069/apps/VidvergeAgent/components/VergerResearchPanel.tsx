import { useEffect, useState } from 'react';
import { BarChart3, ExternalLink, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import {
  buildOriginalUgcRecreation,
  listSavedResearchTopics,
  loadResearchItems,
  type ResearchItem,
  type ResearchTopic,
  type UgcRecreation,
} from '../../../lib/researchLibrary';

function statusText(topic: ResearchTopic): string {
  const statuses = Array.isArray(topic.platform_status) ? topic.platform_status : [];
  if (statuses.some((entry) => entry.status === 'success')) return `${topic.item_count} result${topic.item_count === 1 ? '' : 's'}`;
  if (statuses.some((entry) => entry.status === 'empty')) return 'No data found';
  return topic.status === 'failed' ? 'All actors failed' : topic.status;
}

export default function VergerResearchPanel({
  refreshKey,
  onClose,
  onBrief,
}: {
  refreshKey: number;
  onClose: () => void;
  onBrief: (brief: UgcRecreation, source: ResearchItem, topic: ResearchTopic) => Promise<void> | void;
}) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [active, setActive] = useState<ResearchTopic | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');

  async function reload() {
    setBusy('load'); setError('');
    try {
      const saved = await listSavedResearchTopics();
      setTopics(saved);
      const next = active ? saved.find((topic) => topic.id === active.id) || saved[0] : saved[0];
      setActive(next || null);
      setItems(next ? await loadResearchItems(next.id) : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  useEffect(() => { void reload(); }, [refreshKey]);

  async function openTopic(topic: ResearchTopic) {
    setActive(topic); setBusy('items'); setError('');
    try { setItems(await loadResearchItems(topic.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  async function recreate(item: ResearchItem) {
    if (!active) return;
    setBusy(`brief-${item.id}`); setError('');
    try {
      const brief = await buildOriginalUgcRecreation(item, '', active.label, 15);
      await onBrief(brief, item, active);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  const statuses = active?.platform_status || [];
  return <aside className="absolute right-3 top-[60px] z-40 flex max-h-[min(72vh,680px)] w-[min(430px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_45%,var(--vg-border))] bg-[var(--vg-bg)] shadow-2xl" aria-label="Saved research">
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--vg-border)] p-3">
      <BarChart3 size={16} className="text-[var(--vg-accent)]" />
      <div className="min-w-0 flex-1"><strong className="text-sm text-[var(--vg-text)]">Research</strong><p className="text-[10px] text-[var(--vg-muted)]">Shared with Vergeye Ads Studio</p></div>
      <button type="button" onClick={() => void reload()} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]" aria-label="Refresh saved research"><RefreshCw size={14}/></button>
      <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]" aria-label="Close research"><X size={15}/></button>
    </div>
    <div className="min-h-0 overflow-y-auto p-3">
      {error ? <div className="mb-3 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-3 text-xs text-[var(--vg-danger)]">{error}</div> : null}
      {busy === 'load' ? <div className="flex items-center gap-2 p-3 text-xs text-[var(--vg-muted)]"><Loader2 size={14} className="animate-spin"/>Loading saved research…</div> : null}
      <div className="flex gap-2 overflow-x-auto pb-2">{topics.map((topic) => <button key={topic.id} type="button" onClick={() => void openTopic(topic)} className={`min-w-[150px] rounded-xl border p-3 text-left ${active?.id === topic.id ? 'border-[var(--vg-accent)] bg-[color-mix(in_srgb,var(--vg-accent)_10%,transparent)]' : 'border-[var(--vg-border)] bg-[var(--vg-raised)]'}`}><strong className="block truncate text-xs text-[var(--vg-text)]">{topic.label}</strong><span className="mt-1 block text-[10px] text-[var(--vg-muted)]">{statusText(topic)}</span></button>)}</div>
      {!topics.length && busy !== 'load' ? <p className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-4 text-xs leading-5 text-[var(--vg-muted)]">No saved research yet. Ask Verger to research a competitor, niche, profile, ad library, page, or discovery query.</p> : null}
      {active ? <>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{statuses.map((status) => <div key={status.platform} className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-2.5"><div className="flex justify-between gap-2"><strong className="text-[11px] capitalize text-[var(--vg-text)]">{status.platform}</strong><span className={`text-[9px] font-bold uppercase ${status.status === 'success' ? 'text-[var(--vg-success)]' : status.status === 'failed' || status.status === 'access_denied' ? 'text-[var(--vg-danger)]' : 'text-[var(--vg-muted)]'}`}>{status.status === 'empty' ? 'No data found' : status.status === 'failed' ? 'All actors failed' : status.status.replace('_', ' ')}</span></div><p className="mt-1 break-words text-[9px] leading-4 text-[var(--vg-muted)]">{status.actorId ? `Actor: ${status.actorId}${status.costUsd != null ? ` · $${Number(status.costUsd).toFixed(4)}` : ''}` : 'No actor returned data.'}{status.message ? ` · ${status.message}` : ''}</p></div>)}</div>
        <p className="mt-3 text-[10px] text-[var(--vg-muted)]">Research itself uses no video credits. Saved evidence is cached for 24 hours; actor cost and failures remain visible.</p>
        {busy === 'items' ? <Loader2 size={15} className="mx-auto my-5 animate-spin text-[var(--vg-accent)]"/> : <div className="mt-3 space-y-2">{items.slice(0, 8).map((item, index) => <article key={item.id} className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--vg-accent)_14%,transparent)] text-[10px] font-black text-[var(--vg-accent)]">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-[var(--vg-text)]">{item.advertiser || 'Source creative'}</strong><span className="text-[10px] font-bold text-[var(--vg-secondary)]">{Number(item.performance_score || 0).toFixed(1)} est.</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--vg-muted)]">{item.copy_transcript || 'No caption or transcript was returned.'}</p><p className="mt-1 text-[9px] text-[var(--vg-muted)]">{item.platform} · {item.source_actor}</p><div className="mt-2 flex gap-2">{item.creative_url ? <a href={item.creative_url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--vg-border)] px-2 text-[10px] text-[var(--vg-secondary)]"><ExternalLink size={11}/>Source</a> : null}<button type="button" disabled={Boolean(busy)} onClick={() => void recreate(item)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--vg-accent)] px-2 text-[10px] font-bold text-[var(--vg-accent)] disabled:opacity-40">{busy === `brief-${item.id}` ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>}Recreate top performer</button></div></div></div></article>)}</div>}
      </> : null}
    </div>
  </aside>;
}
