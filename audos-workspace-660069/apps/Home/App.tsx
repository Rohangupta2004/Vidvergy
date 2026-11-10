import React from 'react';
import {
  ArrowRight, Bot, CheckCircle2, Clapperboard, Film, FlaskConical, Image as ImageIcon, LayoutGrid, Library,
  Loader2, MessageCircle, Palette, Play, RefreshCw, Send, Sparkles, Target, Video, Wand2,
} from 'lucide-react';
import GlobalStyles from '../../components/ui/GlobalStyles';
import { Rim } from '../../components/ui/Molten';
import BrandContextLayer from '../../components/BrandContextLayer';
import BrandDocPanel from '../../components/brand/BrandDocPanel';
import SavedBrandKitConfirm from '../../components/brand/SavedBrandKitConfirm';
import { getDefaultBrand, useBrandKit } from '../../components/brandKitStore';
import { BRAND_DOC_OPEN_EVENT, brandDocFields, consumeBrandDocRequest } from '../../lib/brandDoc';
import { prefillVerger, saveVidvergeHandoff } from '../../lib/vidvergeHandoff';
import { listVideoHistory, type VideoHistoryRow } from '../../lib/videoHistory';
import { loadBackgroundJobs } from '../../components/shared/BackgroundJobsTray';
import { callHook } from '../../lib/workspace';

interface StudioDef { id: string; name: string; description: string; icon: React.ComponentType<any>; keywords: string[] }
interface HomeJob { id: string; name: string; studio: string; progress: number; state: 'running' | 'waiting' | 'failed'; actionId: string }
interface TemplateDef { id: string; name: string; category: string; studioId: string; prompt: string; ratio: string }
interface TemplateExample { id: number; template_key: string; style_key: string; studio_id: string; title: string; video_url: string; thumbnail_url: string; duration_sec: number | null; source_video_id: string }
interface Reel { id: string; appId: string; title: string; url: string; poster?: string; vertical?: boolean }

const STUDIOS: StudioDef[] = [
  { id: 'vidverge-agent', name: 'Verger', description: 'Plan and run any production from one conversation.', icon: Bot, keywords: ['help', 'plan', 'campaign'] },
  { id: 'script-to-video', name: 'Script-to-Video', description: 'Turn an idea or approved script into a complete film.', icon: Clapperboard, keywords: ['script', 'film', 'story', 'cinematic'] },
  { id: 'ads-studio', name: 'Vergeye Ads Studio', description: 'Research winning ads and build an original campaign.', icon: Target, keywords: ['ad', 'campaign', 'competitor', 'meta', 'tiktok'] },
  { id: 'ugc-studio', name: 'UGC Studio', description: 'Synthetic creator-led product videos with regional actors.', icon: Video, keywords: ['ugc', 'creator', 'testimonial', 'actor'] },
  { id: 'faceless', name: 'Faceless', description: 'Narration-first films with timed visuals and captions.', icon: Film, keywords: ['faceless', 'documentary', 'explainer', 'narration'] },
  { id: 'sceneforge', name: 'SceneForge', description: 'Presenter and avatar explainers with voice and captions.', icon: Sparkles, keywords: ['avatar', 'presenter', 'scene', 'talking'] },
  { id: 'video-enhancer', name: 'Video Enhancer', description: 'Edit, caption, reframe and polish existing footage.', icon: Wand2, keywords: ['edit', 'enhance', 'caption', 'footage', 'silence'] },
  { id: 'video-provider-lab', name: 'Provider Lab', description: 'Generate a direct shot with Seedance, Kling or Omni Flash.', icon: FlaskConical, keywords: ['shot', 'clip', 'seedance', 'kling', 'omni'] },
  { id: 'cineagent', name: 'Studio', description: 'Upload raw footage and let the editor create a finished cut.', icon: ImageIcon, keywords: ['upload', 'raw', 'cut', 'montage'] },
];

const QUICK_STARTS = [
  'Make a 30-second product launch ad for my brand',
  'Turn my script into a cinematic film',
  'Create a Hinglish UGC testimonial',
  'Polish my footage for Reels',
];

const TEMPLATES: TemplateDef[] = [
  { id: 'launch', name: 'Product launch', category: 'Ads', studioId: 'ads-studio', ratio: '9:16', prompt: 'Create a punchy 30-second product launch ad for my brand with a strong first-second hook, three benefits and a clear call to action.' },
  { id: 'ugc-proof', name: 'Creator proof', category: 'UGC', studioId: 'ugc-studio', ratio: '9:16', prompt: 'Create a natural UGC testimonial that opens with the problem, demonstrates the product and ends with a believable result.' },
  { id: 'explainer', name: 'Calm explainer', category: 'Faceless', studioId: 'faceless', ratio: '16:9', prompt: 'Create a concise faceless explainer with a clear narration arc, visual evidence and word-timed captions.' },
  { id: 'presenter', name: 'Presenter lesson', category: 'Presenter', studioId: 'sceneforge', ratio: '16:9', prompt: 'Create a presenter-led educational video with a warm voice, scene-specific visuals and mandatory captions.' },
  { id: 'highlight', name: '30s highlight', category: 'Editing', studioId: 'video-enhancer', ratio: '9:16', prompt: 'Turn my footage into a 30-second vertical highlight, remove silences and filler words, and add clean captions.' },
  { id: 'cinematic', name: 'Cinematic story', category: 'Film', studioId: 'script-to-video', ratio: '16:9', prompt: 'Turn this idea into a cinematic story with consistent characters, motivated camera movement and a strong final beat.' },
];

/** Finished films made in each studio — the same reels the public landing page shows. */
const APP_REELS: Reel[] = [
  { id: 'fl-shipwrecks', appId: 'faceless', title: 'The 7 Shipwrecks', url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1791266089359.mp4' },
  { id: 's2v-discovery', appId: 'script-to-video', title: 'The Discovery', url: 'https://storage.googleapis.com/audos-images/uploads/s2v/db7f2cdc-d92b-4140-a047-baeff2f50f48.mp4' },
  { id: 'launch-vicharak', appId: 'vidverge-agent', title: 'VicharakAI launch film', url: 'https://storage.googleapis.com/remotioncloudrun-29i6x7bt7e/renders/03ad1f56-7dc0-420c-b6ec-46b872811515/out.mp4' },
  { id: 'fl-byzantine', appId: 'faceless', title: 'The Byzantine Bureaucracy', url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790851696192.mp4' },
  { id: 's2v-beef', appId: 'script-to-video', title: 'B.E.E.F. Basketball Shooting Form', url: 'https://storage.googleapis.com/audos-images/uploads/s2v/f552955a-bd54-41ba-b0c0-b1306adae2a6.mp4', vertical: true },
  { id: 's2v-fineglaze', appId: 'script-to-video', title: 'FineGlaze — Monsoon Facade Leakage', url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790966536543.mp4' },
  { id: 'fl-emu', appId: 'faceless', title: 'The Great Emu War', url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790842437622.mp4' },
];

const VERGE_CSS = `
@keyframes vgMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.vg-marquee{-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.vg-marquee-track{animation:vgMarquee var(--vg-marquee-s,70s) linear infinite}
.vg-marquee:hover .vg-marquee-track,.vg-marquee:focus-within .vg-marquee-track{animation-play-state:paused}
@media (prefers-reduced-motion:reduce){.vg-marquee{overflow-x:auto;-webkit-mask-image:none;mask-image:none}.vg-marquee-track{animation:none}}
`;

function studioName(appId: string): string {
  return STUDIOS.find((item) => item.id === appId)?.name || appId;
}

function routePrompt(value: string): StudioDef {
  const text = value.toLowerCase();
  let best = STUDIOS[1];
  let score = 0;
  STUDIOS.forEach((studio) => {
    const next = studio.keywords.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
    if (next > score) { best = studio; score = next; }
  });
  return best;
}

function openStudio(studioId: string, prompt = '') {
  if (prompt.trim()) {
    if (studioId === 'vidverge-agent') prefillVerger(prompt.trim());
    else saveVidvergeHandoff({ appId: studioId, prompt: prompt.trim(), attachment: null });
  }
  window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: studioId } }));
}

function media(row?: VideoHistoryRow, className = '') {
  if (!row) return <div className={`h-full w-full bg-[radial-gradient(circle_at_28%_18%,color-mix(in_srgb,var(--gold)_34%,transparent),transparent_30%),linear-gradient(145deg,var(--ash-3),var(--void))] ${className}`} />;
  return row.thumbnail_url
    ? <img src={row.thumbnail_url} alt="" className={`h-full w-full object-cover ${className}`} />
    : <video src={row.video_url} muted playsInline preload="metadata" className={`h-full w-full object-cover ${className}`} />;
}

/** Plays only while on screen, so a row of reels never decodes off-screen video. */
function ReelVideo({ src, poster, className = '' }: { src: string; poster?: string; className?: string }) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  React.useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === 'undefined') return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !reduce) void video.play().catch(() => undefined);
      else video.pause();
    }, { threshold: 0.3 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);
  return <video ref={ref} src={src} poster={poster || undefined} muted loop playsInline preload="metadata" className={className} />;
}

function ReelCarousel({ reels }: { reels: Reel[] }) {
  if (!reels.length) return null;
  const loop = [...reels, ...reels];
  return (
    <div className="vg-marquee relative mt-6 overflow-hidden pb-2" style={{ ['--vg-marquee-s' as any]: `${Math.max(36, reels.length * 7)}s` }}>
      <div className="vg-marquee-track flex w-max">
        {loop.map((reel, index) => {
          const copy = index >= reels.length;
          return (
            <button
              key={`${reel.id}-${index}`}
              type="button"
              tabIndex={copy ? -1 : 0}
              aria-hidden={copy ? true : undefined}
              onClick={() => openStudio(reel.appId)}
              aria-label={`${reel.title} — open ${studioName(reel.appId)}`}
              className={`group relative mr-4 h-[220px] shrink-0 overflow-hidden rounded-[var(--r-media)] border border-[var(--line-gold)] bg-[var(--ash)] text-left shadow-[0_18px_44px_color-mix(in_srgb,var(--void)_70%,transparent)] transition duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] ${reel.vertical ? 'w-[124px]' : 'w-[330px]'}`}
            >
              <ReelVideo src={reel.url} poster={reel.poster} className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--void)_92%,transparent))] p-3 pt-10">
                <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-[var(--vg-accent-hover)]">{studioName(reel.appId)}</span>
                <strong className="mt-0.5 block truncate text-sm text-white">{reel.title}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateMedia({ example, ratio }: { example?: TemplateExample; ratio: string }) {
  const [hovered, setHovered] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const active = hovered || pinned;
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => undefined);
    else { video.pause(); video.currentTime = 0; }
  }, [active]);
  if (!example) return <div className="absolute inset-0 grid place-items-center text-sm text-[var(--muted)]">Example is being prepared</div>;
  return (
    <div className="absolute inset-0" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <img src={example.thumbnail_url} alt={`${example.title} poster`} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${active ? 'opacity-0' : 'opacity-100'}`} />
      <video ref={videoRef} src={example.video_url} poster={example.thumbnail_url} muted={!pinned} controls={pinned} loop playsInline preload="metadata" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
      <button type="button" onClick={() => setPinned((value) => !value)} aria-label={pinned ? `Pause ${example.title} preview` : `Play ${example.title} preview`} className={`absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-black/55 text-white backdrop-blur transition ${active ? 'opacity-0 hover:opacity-100 focus:opacity-100' : 'opacity-100'}`}><Play className="ml-0.5 h-5 w-5" /></button>
      <span className="absolute left-3 top-3 rounded-full border border-[var(--line-gold)] bg-[var(--glass)] px-2.5 py-1 text-xs text-[var(--gold-hi)]">{ratio}</span>
      {example.duration_sec ? <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">{example.duration_sec}s</span> : null}
    </div>
  );
}

export default function VergeApp() {
  const [prompt, setPrompt] = React.useState('');
  const [renders, setRenders] = React.useState<VideoHistoryRow[]>([]);
  const [templateExamples, setTemplateExamples] = React.useState<TemplateExample[]>([]);
  const [jobs, setJobs] = React.useState<HomeJob[]>([]);
  const [category, setCategory] = React.useState('All');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [brandOpen, setBrandOpen] = React.useState(false);
  const { document: brandKit } = useBrandKit();
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const studiosRef = React.useRef<HTMLElement | null>(null);
  const brandRef = React.useRef<HTMLElement | null>(null);
  const route = routePrompt(prompt);
  const brand = getDefaultBrand(brandKit);
  const brandFields = brandDocFields(brand);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try { setRenders(await listVideoHistory(16)); } catch { setRenders([]); }
    try {
      const result = await callHook<{ examples?: TemplateExample[] }>('vidverge-template-examples', { op: 'list' });
      setTemplateExamples(Array.isArray(result?.examples) ? result.examples : []);
    } catch { setTemplateExamples([]); }
    try {
      const allJobs = await loadBackgroundJobs();
      setJobs(allJobs.filter((job) => job.status !== 'complete').map((job) => ({
        id: job.id,
        name: job.title,
        studio: job.app,
        progress: job.progress,
        state: job.status === 'failed' ? 'failed' : job.status === 'waiting' ? 'waiting' : 'running',
        actionId: job.appId,
      })));
    } catch { setJobs([]); }
    setLoading(false);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  React.useEffect(() => {
    const open = () => { if (consumeBrandDocRequest()) setBrandOpen(true); };
    open();
    window.addEventListener(BRAND_DOC_OPEN_EVENT, open);
    return () => window.removeEventListener(BRAND_DOC_OPEN_EVENT, open);
  }, []);

  React.useEffect(() => {
    if (!brandOpen) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setBrandOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [brandOpen]);

  const submit = async (target?: string) => {
    if (!prompt.trim() || sending) return;
    setSending(true);
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    openStudio(target || route.id, prompt);
    setSending(false);
  };

  const reels = React.useMemo(() => {
    const ratioByTemplate = new Map(TEMPLATES.map((item) => [item.id, item.ratio]));
    const fromTemplates: Reel[] = templateExamples.filter((example) => example.video_url).map((example) => ({ id: `tpl-${example.id}`, appId: example.studio_id, title: example.title, url: example.video_url, poster: example.thumbnail_url, vertical: ratioByTemplate.get(example.template_key) === '9:16' }));
    const fromRenders: Reel[] = renders.filter((row) => row.video_url).slice(0, 6).map((row) => ({ id: `render-${row.id}`, appId: row.app_id, title: row.title, url: row.video_url, poster: row.thumbnail_url || undefined }));
    const seen = new Set<string>();
    return [...fromTemplates, ...APP_REELS, ...fromRenders].filter((reel) => {
      if (!reel.url || seen.has(reel.url)) return false;
      seen.add(reel.url);
      return true;
    }).slice(0, 14);
  }, [templateExamples, renders]);
  const reelByApp = React.useMemo(() => {
    const map = new Map<string, Reel>();
    reels.forEach((reel) => { if (!map.has(reel.appId)) map.set(reel.appId, reel); });
    return map;
  }, [reels]);

  const categories = ['All', ...Array.from(new Set(TEMPLATES.map((item) => item.category)))];
  const visibleTemplates = category === 'All' ? TEMPLATES : TEMPLATES.filter((item) => item.category === category);
  const exampleByTemplate = React.useMemo(() => new Map(templateExamples.map((example) => [example.template_key, example])), [templateExamples]);
  const scrollTo = (element: HTMLElement | null) => element?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="vv-app-shell min-h-full bg-[var(--void)] text-[var(--ivory)]">
      <GlobalStyles />
      <style>{VERGE_CSS}</style>
      <BrandContextLayer />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-4 pt-8 sm:px-8 sm:pt-12">
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-[var(--space-text-brand)]">Verge</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-.045em] sm:text-6xl">What should we make?</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">Describe the outcome once. Verger chooses the right studio, carries your brief across, and keeps every render in one library. Your Brand doc is used only when you choose it.</p>
        </header>

        <Rim working={sending} className="mt-8 overflow-hidden p-3 sm:p-4">
          <textarea ref={promptRef} aria-label="Describe your video" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }} placeholder="A 30-second vertical ad for my brand, energetic but credible, aimed at first-time founders…" className="min-h-[116px] w-full resize-none border-0 bg-transparent px-2 py-2 text-lg leading-7 outline-none placeholder:text-[var(--faint)]" />
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--muted)]"><Sparkles className="h-4 w-4 shrink-0 text-[var(--gold)]" /><span>{prompt.trim() ? <>Verger will open <b className="text-[var(--vg-accent-hover)]">{route.name}</b></> : 'Verger will choose the right studio'}</span></div>
            <button type="button" onClick={() => setBrandOpen(true)} className="inline-flex min-h-9 max-w-[220px] items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--vg-accent)_50%,transparent)] bg-[var(--vg-gold-tint)] px-3 text-xs font-semibold text-[var(--ivory)]" title="Your Brand doc is only used after you choose “Use my saved Brand Kit” and confirm it">
              <Palette className="h-3.5 w-3.5 shrink-0 text-[var(--vg-accent)]" />
              <span className="truncate">{brandFields.name ? `Brand: ${brandFields.name}` : 'Add your brand'}</span>
            </button>
            <span className="ml-auto hidden text-xs text-[var(--faint)] lg:block">⌘/Ctrl + Enter</span>
            <button type="button" onClick={() => void submit('vidverge-agent')} disabled={!prompt.trim() || sending} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-[var(--r-control)] border border-[var(--line-gold)] px-4 text-sm font-bold text-[var(--ivory)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] disabled:opacity-40 lg:ml-0"><MessageCircle className="h-4 w-4 text-[var(--gold)]" /> Ask Verger</button>
            <button type="button" onClick={() => void submit()} disabled={!prompt.trim() || sending} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-control)] bg-[var(--vg-btn)] px-5 text-sm font-bold text-[var(--vg-on-btn)] shadow-[0_10px_28px_color-mix(in_srgb,var(--gold)_18%,transparent)] hover:bg-[var(--vg-btn-hover)] active:bg-[var(--vg-btn-pressed)] disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Start</button>
          </div>
        </Rim>

        <div className="mt-3"><SavedBrandKitConfirm /></div>

        <div className="mt-4 flex flex-wrap gap-2">{QUICK_STARTS.map((item) => <button key={item} type="button" onClick={() => setPrompt(item)} className="min-h-10 rounded-full border border-[var(--line-2)] bg-[var(--ash)] px-4 text-sm text-[var(--chip-ink)] transition hover:border-[var(--line-gold)] hover:text-[var(--ivory)]">{item}</button>)}</div>

        <button type="button" onClick={() => openStudio('vidverge-agent')} className="group mt-6 flex w-full items-center gap-4 rounded-[var(--r-media)] border border-[var(--line)] bg-[linear-gradient(110deg,color-mix(in_srgb,var(--gold)_9%,var(--ash)),var(--ash)_60%,color-mix(in_srgb,var(--gold)_6%,var(--ash)))] p-4 text-left transition hover:border-[var(--line-gold)] sm:p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--vg-btn)] text-[var(--vg-on-btn)]"><Bot className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-base">Chat with Verger</strong><span className="mt-0.5 block text-sm text-[var(--muted)]">Plan, create, edit and track every video from one conversation. It checks your brand details with you first.</span></span>
          <ArrowRight className="h-5 w-5 shrink-0 text-[var(--gold)] transition group-hover:translate-x-1" />
        </button>

        <section className="mt-14" aria-labelledby="verge-reels">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Made with Vidverge</p><h2 id="verge-reels" className="mt-2 text-2xl font-bold">Every studio, in motion</h2></div><span className="text-xs text-[var(--faint)]">Hover to pause · tap a film to open its studio</span></div>
          <ReelCarousel reels={reels} />
        </section>

        <section ref={brandRef} className="mt-14 grid scroll-mt-6 gap-5 rounded-[var(--r-media)] border border-[var(--line-gold)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--gold)_10%,var(--ash)),var(--ash)_55%,color-mix(in_srgb,var(--gold)_6%,var(--ash)))] p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-7" aria-labelledby="verge-brand">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--line-gold)] bg-[var(--void)]">{brandFields.logoUrls[0] ? <img src={brandFields.logoUrls[0]} alt="" className="h-full w-full object-contain p-1" /> : <Palette className="h-6 w-6 text-[var(--gold)]" />}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Brand doc</p>
              <h2 id="verge-brand" className="mt-1 truncate text-2xl font-bold">{brandFields.name || 'Set up your brand once'}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">{brandFields.name ? 'Choose “Use my saved Brand Kit” and confirm it, and Verger and the studios will use your saved name, colours, tone, logo and audience. Nothing is applied until you choose it.' : 'Name, voice, colours, fonts, logos, audience, products, characters and do/don’t rules — written once, used in every video.'}</p>
              {brandFields.colors.length || brandFields.tone ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {brandFields.colors.slice(0, 6).map((color) => <span key={color} title={color} className="h-6 w-6 rounded-full border border-white/20" style={{ background: color }} />)}
                  {brandFields.tone ? <span className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs text-[var(--chip-ink)]">{brandFields.tone}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => setBrandOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-control)] bg-[var(--vg-btn)] px-5 text-sm font-bold text-[var(--vg-on-btn)] hover:bg-[var(--vg-btn-hover)] active:bg-[var(--vg-btn-pressed)]"><Palette className="h-4 w-4" />{brand ? 'Edit Brand doc' : 'Create Brand doc'}</button>
        </section>

        <section className="mt-16 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Latest work</p><h2 className="mt-2 text-3xl font-bold">Pick up where you left off</h2><p className="mt-3 max-w-xl text-[var(--muted)]">Your latest finished renders are ready in Library, with their real poster frames and source studio attached.</p><button type="button" onClick={() => { window.location.hash = 'library'; }} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--r-control)] border border-[var(--line-2)] px-4 text-sm font-semibold hover:border-[var(--line-gold)]">Open Library <ArrowRight className="h-4 w-4" /></button></div>
          <button type="button" onClick={() => { window.location.hash = 'library'; }} className="group relative mx-auto h-[270px] w-[260px]" aria-label="Open latest renders in Library">{[2, 1, 0].map((index) => <span key={index} className="absolute inset-x-5 top-0 h-[230px] overflow-hidden rounded-[var(--r-media)] border border-[var(--line-gold)] bg-[var(--ash)] shadow-2xl transition duration-300 group-hover:translate-y-0" style={{ transform: `rotate(${(index - 1) * 8}deg) translate(${(index - 1) * 18}px, ${Math.abs(index - 1) * 15}px)`, zIndex: 4 - index }}>{media(renders[index])}</span>)}<span className="absolute left-1/2 top-[92px] z-10 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full border border-[var(--line-gold)] bg-black/55 text-[var(--gold-hi)] backdrop-blur"><Play className="ml-1 h-5 w-5" /></span></button>
        </section>

        <section className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Live queue</p><h2 className="mt-2 text-2xl font-bold">In production</h2></div><button type="button" onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-control)] border border-[var(--line-2)] px-4 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{jobs.length ? jobs.map((job) => <article key={job.id} className="rounded-[var(--r-media)] border border-[var(--line)] bg-[var(--ash)] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{job.name}</h3><p className="mt-1 text-sm text-[var(--muted)]">{job.studio} · {job.state === 'failed' ? 'Needs you' : job.state === 'waiting' ? 'Waiting for approval' : 'Rendering'}</p></div>{job.state === 'failed' ? <button type="button" onClick={() => openStudio(job.actionId)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[color-mix(in_srgb,var(--bad)_45%,transparent)] px-3 text-xs font-bold text-[var(--bad)]"><RefreshCw className="h-3.5 w-3.5" /> Open to retry</button> : <span className="text-sm font-bold tabular-nums text-[var(--vg-accent)]">{job.progress}%</span>}</div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--ash-3)]"><div className="h-full rounded-full bg-[var(--vg-accent)]" style={{ width: `${job.progress}%` }} /></div></article>) : <div className="col-span-full flex min-h-28 items-center gap-3 rounded-[var(--r-media)] border border-dashed border-[var(--line-2)] bg-[var(--ash)] px-5 text-sm text-[var(--muted)]"><CheckCircle2 className="h-5 w-5 text-[var(--ok)]" /> Nothing is waiting. Start from the prompt above or choose a template.</div>}</div>
        </section>

        <section className="mt-16">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">A faster start</p><h2 className="mt-2 text-2xl font-bold">Templates</h2>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className="min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold" style={{ borderColor: category === item ? 'var(--vg-selected)' : 'var(--line-2)', background: category === item ? 'var(--vg-selected-soft)' : 'var(--ash)', color: category === item ? 'var(--vg-on-selected)' : 'var(--muted)' }}>{item}</button>)}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleTemplates.map((template) => { const example = exampleByTemplate.get(template.id); return <article key={template.id} className="group overflow-hidden rounded-[var(--r-media)] border border-[var(--line)] bg-[var(--ash)]"><div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--gold)_28%,transparent),transparent_32%),linear-gradient(145deg,var(--ash-3),var(--void))]"><TemplateMedia example={example} ratio={template.ratio} /></div><div className="p-4"><h3 className="font-semibold">{template.name}</h3><p className="mt-1 truncate text-sm text-[var(--muted)]">{example?.title || studioName(template.studioId)}</p><button type="button" onClick={() => openStudio(template.studioId, template.prompt)} className="mt-3 min-h-11 w-full rounded-[var(--r-control)] bg-[var(--vg-btn)] px-3 text-sm font-bold text-[var(--vg-on-btn)] hover:bg-[var(--vg-btn-hover)] active:bg-[var(--vg-btn-pressed)]">Use template</button></div></article>; })}</div>
        </section>

        <section className="mt-16"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Your output</p><h2 className="mt-2 text-2xl font-bold">Recent renders</h2></div><button type="button" onClick={() => { window.location.hash = 'library'; }} className="text-sm font-semibold text-[var(--vg-accent)]">See all →</button></div><div className="mt-5 flex gap-4 overflow-x-auto pb-3">{renders.slice(0, 8).map((row) => <button key={row.id} type="button" onClick={() => { window.location.hash = 'library'; }} className="w-48 shrink-0 text-left"><span className="block aspect-[9/12] overflow-hidden rounded-[var(--r-media)] border border-[var(--line)] bg-[var(--ash)]">{media(row)}</span><strong className="mt-2 block truncate text-sm">{row.title}</strong><span className="text-xs text-[var(--muted)]">{studioName(row.app_id)}</span></button>)}{!renders.length && !loading ? <p className="text-sm text-[var(--muted)]">Finished renders will appear here automatically.</p> : null}</div></section>

        <section ref={studiosRef} className="mt-16 scroll-mt-6" aria-labelledby="verge-studios">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Every capability</p><h2 id="verge-studios" className="mt-2 text-2xl font-bold">Studios</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{STUDIOS.map((studio) => { const Icon = studio.icon; const reel = reelByApp.get(studio.id); return (
            <button key={studio.id} type="button" onClick={() => openStudio(studio.id)} className="group overflow-hidden rounded-[var(--r-media)] border border-[var(--line)] bg-[var(--ash)] text-left transition hover:-translate-y-0.5 hover:border-[var(--line-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)]">
              <span className="relative block aspect-[16/8] overflow-hidden bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--gold)_26%,transparent),transparent_34%),radial-gradient(circle_at_85%_90%,color-mix(in_srgb,var(--gold)_10%,transparent),transparent_40%),linear-gradient(145deg,var(--ash-3),var(--void))]">
                {reel ? <ReelVideo src={reel.url} poster={reel.poster} className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-300 group-hover:opacity-100" /> : <span className="absolute inset-0 grid place-items-center"><Icon className="h-10 w-10 text-[color-mix(in_srgb,var(--gold)_70%,transparent)]" /></span>}
              </span>
              <span className="grid grid-cols-[44px_1fr_20px] items-center gap-3 p-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--line-gold)] bg-[var(--icon-tile)] text-[var(--gold)]"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0"><strong className="block">{studio.name}</strong><span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{studio.description}</span></span>
                <ArrowRight className="h-4 w-4 text-[var(--faint)] transition group-hover:translate-x-0.5 group-hover:text-[var(--gold)]" />
              </span>
            </button>
          ); })}</div>
        </section>

        <nav aria-label="Verge sections" className="sticky bottom-3 z-30 mx-auto mt-12 flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--line-gold)] bg-[color-mix(in_srgb,var(--void)_88%,transparent)] p-1.5 shadow-[0_18px_44px_color-mix(in_srgb,var(--void)_80%,transparent)] backdrop-blur-xl" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'create', label: 'Create', Icon: Sparkles, onClick: () => { promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => promptRef.current?.focus(), 300); } },
            { id: 'studios', label: 'Studios', Icon: LayoutGrid, onClick: () => scrollTo(studiosRef.current) },
            { id: 'brand', label: 'Brand', Icon: Palette, onClick: () => setBrandOpen(true) },
            { id: 'library', label: 'Library', Icon: Library, onClick: () => { window.location.hash = 'library'; } },
            { id: 'verger', label: 'Verger', Icon: MessageCircle, onClick: () => openStudio('vidverge-agent') },
          ].map(({ id, label, Icon, onClick }) => (
            <button key={id} type="button" onClick={onClick} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition sm:px-4 ${id === 'create' ? 'bg-[var(--vg-btn)] text-[var(--vg-on-btn)]' : 'text-[var(--chip-ink)] hover:bg-[var(--ash)] hover:text-[var(--ivory)]'}`}>
              <Icon className={`h-4 w-4 ${id === 'brand' ? 'text-[var(--vg-accent)]' : ''}`} />{label}
            </button>
          ))}
        </nav>
      </main>

      {brandOpen ? (
        <div className="fixed inset-0 z-[140] flex justify-end bg-[color-mix(in_srgb,var(--void)_62%,transparent)] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Brand doc" onMouseDown={(event) => { if (event.target === event.currentTarget) setBrandOpen(false); }}>
          <div className="h-full w-full max-w-[580px] border-l border-[var(--line-gold)] shadow-[-30px_0_80px_color-mix(in_srgb,var(--void)_80%,transparent)]">
            <BrandDocPanel onClose={() => setBrandOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
