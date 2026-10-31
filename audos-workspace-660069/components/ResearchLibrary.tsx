import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Check, ExternalLink, Filter, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import {
  analyzeResearchItem,
  listSavedResearchTopics,
  loadResearchItems,
  researchTopic,
  type CreativeBreakdown,
  type PlatformResearchStatus,
  type ResearchItem,
  type ResearchPlatform,
  type ResearchTopic,
} from '../lib/researchLibrary';

const platformOptions: Array<{ id: ResearchPlatform; label: string }> = [
  { id: 'meta', label: 'Meta' }, { id: 'tiktok', label: 'TikTok' }, { id: 'linkedin', label: 'LinkedIn' },
  { id: 'instagram', label: 'Instagram' }, { id: 'youtube', label: 'YouTube' }, { id: 'reddit', label: 'Reddit' }, { id: 'web', label: 'Web' },
];
const shell = 'rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)]';
const control = 'min-h-11 rounded-xl border border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] px-3 text-sm text-[var(--space-text-primary)] outline-none focus:border-[var(--space-brand-primary-500)]';
function compactNumber(value: number): string { return value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(Math.round(value)); }
function dateLabel(value?: string | null): string { return value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'not completed'; }
function engagementLabel(item: ResearchItem): string { const values = Object.entries(item.engagement || {}).filter(([, value]) => Number(value) > 0); return values.length ? values.slice(0, 2).map(([key, value]) => `${compactNumber(value)} ${key}`).join(' · ') : 'No engagement reported'; }

export default function ResearchLibrary({
  onUseItem,
  actionLabel = 'Use as inspiration',
  title = 'Research library',
  subtitle = 'Search once, save the evidence, and reuse it across both studios.',
}: {
  onUseItem?: (item: ResearchItem, breakdown: CreativeBreakdown | null) => void;
  actionLabel?: string;
  title?: string;
  subtitle?: string;
}) {
  const [topics, setTopics] = useState<ResearchTopic[]>([]);
  const [activeTopic, setActiveTopic] = useState<ResearchTopic | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [platforms, setPlatforms] = useState<ResearchPlatform[]>(['meta', 'tiktok', 'instagram']);
  const [statuses, setStatuses] = useState<PlatformResearchStatus[]>([]);
  const [busy, setBusy] = useState('loading');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ResearchItem | null>(null);
  const [breakdown, setBreakdown] = useState<CreativeBreakdown | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<'all' | ResearchPlatform>('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [minimumScore, setMinimumScore] = useState(0);

  async function refreshTopics(selectId?: number) {
    const saved = await listSavedResearchTopics();
    setTopics(saved);
    if (selectId) setActiveTopic(saved.find((topic) => topic.id === selectId) || null);
  }

  useEffect(() => {
    let alive = true;
    listSavedResearchTopics().then((saved) => { if (alive) setTopics(saved); }).catch((caught) => { if (alive) setError(caught instanceof Error ? caught.message : String(caught)); }).finally(() => { if (alive) setBusy(''); });
    return () => { alive = false; };
  }, []);

  async function openTopic(topic: ResearchTopic) {
    setBusy('load'); setError(''); setNotice(''); setSelected(null); setBreakdown(null);
    try {
      setActiveTopic(topic); setTopicInput(topic.label); setPlatforms(Array.isArray(topic.platforms) ? topic.platforms : []);
      setStatuses(Array.isArray(topic.platform_status) ? topic.platform_status : []);
      setItems(await loadResearchItems(topic.id));
      setNotice(`Saved on ${dateLabel(topic.scraped_at)} · loaded without a new scrape.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  async function runResearch(refresh = false) {
    if (!topicInput.trim()) { setError('Enter a topic, niche, competitor, handle, or URL.'); return; }
    if (!platforms.length) { setError('Choose at least one platform.'); return; }
    setBusy(refresh ? 'refresh' : 'research'); setError(''); setNotice(''); setSelected(null); setBreakdown(null);
    try {
      const result = await researchTopic(topicInput, platforms, {
        refresh,
        onProgress(nextStatuses, message) { setStatuses(nextStatuses); setNotice(message); },
      });
      setActiveTopic(result.topic); setItems(result.items); setStatuses(result.topic.platform_status || []);
      setNotice(result.fromCache ? `Saved on ${dateLabel(result.topic.scraped_at)} · no new scrape was run.` : `Saved ${result.items.length} item${result.items.length === 1 ? '' : 's'} on ${dateLabel(result.topic.scraped_at)}.`);
      await refreshTopics(result.topic.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  async function selectItem(item: ResearchItem) {
    setSelected(item); setBreakdown(null); setAnalysisBusy(true); setError('');
    try { setBreakdown(await analyzeResearchItem(item)); }
    catch (caught) { setError(`Creative breakdown unavailable: ${caught instanceof Error ? caught.message : String(caught)}`); }
    finally { setAnalysisBusy(false); }
  }

  const formats = useMemo(() => Array.from(new Set(items.map((item) => item.format || '').filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => (platformFilter === 'all' || item.platform === platformFilter) && (formatFilter === 'all' || item.format === formatFilter) && Number(item.performance_score || 0) >= minimumScore).sort((a, b) => Number(b.performance_score || 0) - Number(a.performance_score || 0)), [items, platformFilter, formatFilter, minimumScore]);
  const activeStatuses = statuses.length ? statuses : activeTopic?.platform_status || [];

  return <div className="min-h-full bg-[var(--space-surface-bg)] text-[var(--space-text-primary)]">
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[var(--space-text-brand)]">Public creative evidence</p><h1 className="mt-1 font-['Space_Grotesk'] text-2xl font-bold sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--space-text-secondary)]">{subtitle}</p></div><div className="rounded-full border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] px-3 py-2 text-xs text-[var(--space-text-muted)]">Performance score = estimate from observed signals only</div></header>

      {error && <div className="mt-4 flex gap-2 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-4 text-sm text-[var(--vg-danger)]"><AlertCircle size={18} className="shrink-0"/><span>{error}</span></div>}
      {notice && <div className="mt-4 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-4 text-sm text-[var(--space-text-secondary)]">{notice}</div>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={`${shell} h-fit p-4`}><div className="flex items-center justify-between"><h2 className="font-bold">Saved topics</h2><span className="text-xs text-[var(--space-text-muted)]">{topics.length}</span></div>{busy === 'loading' ? <Loader2 className="mx-auto mt-7 animate-spin text-[var(--space-text-brand)]"/> : topics.length ? <div className="mt-3 space-y-2">{topics.map((topic) => <button key={topic.id} type="button" onClick={() => void openTopic(topic)} className={`w-full rounded-xl border p-3 text-left transition ${activeTopic?.id === topic.id ? 'border-[var(--space-brand-primary-500)] bg-[var(--space-surface-accent-soft)]' : 'border-[var(--space-border-default)] bg-[var(--space-surface-panel)] hover:bg-[var(--space-surface-card-hover)]'}`}><div className="flex items-start justify-between gap-2"><strong className="text-sm">{topic.label}</strong><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${topic.status === 'complete' ? 'bg-[var(--vg-success)]' : topic.status === 'failed' ? 'bg-[var(--vg-danger)]' : 'bg-[var(--vg-warning)]'}`}/></div><p className="mt-1 text-[11px] text-[var(--space-text-muted)]">{topic.item_count} items · {dateLabel(topic.scraped_at)}</p></button>)}</div> : <p className="mt-5 text-sm leading-6 text-[var(--space-text-muted)]">No saved research yet. Your first completed topic will appear here and persist across reloads.</p>}</aside>

        <div className="min-w-0 space-y-5">
          <section className={`${shell} p-4 sm:p-5`}><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3.5 text-[var(--space-text-muted)]"/><input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !busy) void runResearch(false); }} placeholder="Topic, niche, competitor, handle, or URL" className={`${control} w-full pl-10`}/></div><button type="button" disabled={Boolean(busy)} onClick={() => void runResearch(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-5 text-sm font-bold text-[var(--vg-on-accent)] disabled:opacity-45">{busy === 'research' ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>}Research</button>{activeTopic && <button type="button" disabled={Boolean(busy)} onClick={() => void runResearch(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--space-border-strong)] bg-[var(--space-surface-panel)] px-4 text-sm font-bold disabled:opacity-45">{busy === 'refresh' ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Refresh</button>}</div><div className="mt-4 flex flex-wrap gap-2">{platformOptions.map((platform) => { const chosen = platforms.includes(platform.id); return <button key={platform.id} type="button" disabled={Boolean(busy)} onClick={() => setPlatforms((current) => chosen ? current.filter((value) => value !== platform.id) : [...current, platform.id])} className={`rounded-full border px-3 py-2 text-xs font-bold ${chosen ? 'border-[var(--space-brand-primary-500)] bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]' : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)]'}`}>{chosen && <Check size={12} className="mr-1 inline"/>}{platform.label}</button>; })}</div>
            {activeStatuses.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{activeStatuses.map((status) => <div key={status.platform} className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs capitalize">{status.platform}</strong><span className={`text-[10px] font-bold uppercase ${status.status === 'success' ? 'text-[var(--vg-success)]' : status.status === 'failed' || status.status === 'access_denied' ? 'text-[var(--vg-danger)]' : status.status === 'running' ? 'text-[var(--space-text-brand)]' : 'text-[var(--space-text-muted)]'}`}>{status.status.replace('_', ' ')}</span></div><p className="mt-1 truncate text-[10px] text-[var(--space-text-muted)]">{status.actorId || status.message || 'Waiting'}</p>{status.status === 'access_denied' && <p className="mt-1 text-[11px] text-[var(--vg-danger)]">Actor access not granted. No substitute data was used.</p>}</div>)}</div>}
          </section>

          <section><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Ranked evidence</h2><p className="mt-1 text-xs text-[var(--space-text-muted)]">{filtered.length} saved item{filtered.length === 1 ? '' : 's'} · source platform shown on every card</p></div><div className="flex flex-wrap items-center gap-2"><Filter size={15} className="text-[var(--space-text-muted)]"/><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value as any)} className={control}><option value="all">All platforms</option>{platformOptions.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}</select><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} className={control}><option value="all">All formats</option>{formats.map((format) => <option key={format}>{format}</option>)}</select><select value={minimumScore} onChange={(event) => setMinimumScore(Number(event.target.value))} className={control}><option value={0}>Any estimate</option><option value={25}>25+</option><option value={50}>50+</option><option value={75}>75+</option></select></div></div>
            {busy === 'load' ? <div className={`${shell} mt-4 grid min-h-56 place-items-center`}><Loader2 className="animate-spin text-[var(--space-text-brand)]"/></div> : filtered.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <button key={item.id} type="button" onClick={() => void selectItem(item)} className={`${shell} overflow-hidden text-left transition hover:-translate-y-0.5 hover:border-[var(--space-border-strong)] ${selected?.id === item.id ? 'ring-1 ring-[var(--space-brand-primary-500)]' : ''}`}>{item.thumbnail_url ? <img src={item.thumbnail_url} alt="Source creative thumbnail" className="aspect-[16/10] w-full bg-black object-cover"/> : <div className="grid aspect-[16/10] place-items-center bg-[var(--space-surface-panel)]"><BarChart3 className="text-[var(--space-text-muted)]"/></div>}<div className="p-4"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-[var(--space-border-default)] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--space-text-brand)]">{item.platform}</span><span className="text-sm font-black">{Number(item.performance_score || 0).toFixed(1)} <small className="font-medium text-[var(--space-text-muted)]">est.</small></span></div><h3 className="mt-3 truncate font-bold">{item.advertiser || 'Advertiser not reported'}</h3><p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--space-text-secondary)]">{item.copy_transcript || 'No copy or transcript was returned by the source.'}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--space-text-muted)]"><span>{item.format || 'format unavailable'}</span><span>{item.run_days == null ? 'run length unavailable' : `${item.run_days} run days`}</span><span>{engagementLabel(item)}</span></div></div></button>)}</div> : <div className={`${shell} mt-4 p-10 text-center`}><Search className="mx-auto text-[var(--space-text-muted)]"/><h3 className="mt-3 font-bold">{activeTopic ? 'No items match these filters' : 'Start with a saved or new topic'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--space-text-muted)]">Research runs only for a new topic or when you explicitly press Refresh. Repeating a saved topic loads its existing library.</p></div>}
          </section>

          {selected && <section className={`${shell} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[var(--space-text-brand)]">Creative detail · {selected.platform}</p><h2 className="mt-1 text-xl font-bold">{selected.advertiser || 'Source creative'}</h2></div><div className="flex gap-2">{selected.creative_url && <a href={selected.creative_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--space-border-strong)] px-3 text-xs font-bold"><ExternalLink size={14}/>Original</a>}{onUseItem && <button type="button" disabled={analysisBusy} onClick={() => onUseItem(selected, breakdown)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-4 text-xs font-bold text-[var(--vg-on-accent)] disabled:opacity-45"><Sparkles size={14}/>{actionLabel}</button>}</div></div>{analysisBusy ? <div className="mt-6 flex items-center gap-2 text-sm text-[var(--space-text-secondary)]"><Loader2 size={16} className="animate-spin"/>Extracting the observed hook, angle, offer, CTA and structure…</div> : breakdown ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{([['Hook', breakdown.hook], ['Angle', breakdown.angle], ['Offer', breakdown.offer], ['CTA', breakdown.cta], ['Format', breakdown.format]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-3"><p className="text-[10px] font-black uppercase tracking-wider text-[var(--space-text-muted)]">{label}</p><p className="mt-2 text-sm leading-5">{value}</p></div>)}<div className="sm:col-span-2 lg:col-span-5"><p className="text-xs text-[var(--space-text-muted)]">Structure: {breakdown.structure.join(' → ') || 'Not observable'} · {breakdown.evidenceNote}</p></div></div> : <p className="mt-4 text-sm text-[var(--space-text-muted)]">The source fields remain visible even when AI breakdown is unavailable; no missing detail is invented.</p>}</section>}
        </div>
      </div>
    </div>
  </div>;
}
