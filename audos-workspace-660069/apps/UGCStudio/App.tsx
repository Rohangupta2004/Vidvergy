import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import {
  AlertCircle, CheckCircle2, Download, ExternalLink, Film, Image as ImageIcon,
  Loader2, RefreshCw, Sparkles, Upload, UserRound, Wand2, X,
} from 'lucide-react';
import { useSpaceRuntime } from '../../SpaceRuntimeContext';
import { callHook, getWorkspaceToken } from '../../lib/workspace';
import { isUsableReference, runwayUpload } from '../../lib/runway';

type ImageMode = 'upload' | 'ai';
type Busy = 'upload' | 'image' | 'quote' | 'generate' | null;

type ExactQuote = {
  credits: number;
  usd: number;
  outputs: number;
  label: string;
  raw: unknown;
};

type Job = {
  id: number;
  task_id?: string | null;
  status: string;
  video_url?: string | null;
  error_message?: string | null;
  product_image_url?: string | null;
  script?: string | null;
  product_description?: string | null;
  created_at?: string;
};

const TERMINAL = ['succeeded', 'failed', 'cancelled', 'canceled'];
const LIVE_STATUSES = ['submitting', 'admitting', 'charged', 'queued', 'running', 'throttled', 'persisting', 'uncertain'];

function exactError(value: unknown, fallback = 'The request failed.'): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const raw = value as any;
    return String(raw.error?.message || raw.error || raw.message || fallback);
  }
  return fallback;
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-4 sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--space-text-brand)]">{eyebrow}</p>
      <h2 className="mt-1 font-['Space_Grotesk'] text-lg font-semibold text-[var(--space-text-primary)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function statusClass(status: string): string {
  if (status === 'succeeded') return 'border-[var(--vg-success)] bg-[var(--vg-success-bg)] text-[var(--vg-success)]';
  if (status === 'failed' || status === 'cancelled' || status === 'canceled') return 'border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] text-[var(--vg-danger)]';
  if (status === 'uncertain') return 'border-[var(--vg-warning)] bg-[var(--vg-warning-bg)] text-[var(--vg-warning)]';
  return 'border-[var(--space-border-default)] bg-[var(--space-surface-panel-strong)] text-[var(--space-text-secondary)]';
}

function statusCopy(status: string): string {
  switch (status) {
    case 'submitting': return 'Submitting the saved job to Runway…';
    case 'admitting': return 'Checking the workspace wallet…';
    case 'charged': return 'Credits reserved. Starting Runway…';
    case 'queued': return 'Queued at Runway…';
    case 'running': return 'Runway is generating your video…';
    case 'throttled': return 'Waiting for a Runway slot…';
    case 'persisting': return 'Saving the durable MP4…';
    case 'uncertain': return 'Waiting for Runway to reconcile this task. It will not be submitted twice.';
    case 'succeeded': return 'Your video is ready.';
    case 'failed': return 'Generation failed.';
    case 'cancelled': return 'Generation was cancelled.';
    default: return 'Ready to generate.';
  }
}

function actionTitle(row: Job): string {
  const text = String(row.script || row.product_description || 'UGC product video').replace(/\s+/g, ' ').trim();
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

export default function UGCStudioApp() {
  const { sessionId } = useSpaceRuntime();
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const autoResumeRef = useRef(false);
  const [imageMode, setImageMode] = useState<ImageMode>('upload');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [dragging, setDragging] = useState(false);
  const [quote, setQuote] = useState<ExactQuote | null>(null);
  const [approved, setApproved] = useState(false);
  const [contractReady, setContractReady] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<Error | null>(null);

  const refreshHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    void callHook<any>('ugc-studio-runway', { op: 'list' })
      .then((result) => setHistory(Array.isArray(result?.jobs) ? result.jobs : []))
      .catch((cause) => setHistoryError(cause instanceof Error ? cause : new Error(exactError(cause))))
      .finally(() => setHistoryLoading(false));
  }, []);

  const hasImage = isUsableReference(productImageUrl);
  const hasAction = Boolean(action.trim());
  const inputsReady = hasImage && hasAction;
  const activeStatus = String(activeJob?.status || 'idle').toLowerCase();
  const generating = Boolean(activeJob && LIVE_STATUSES.includes(activeStatus));
  const outputUrl = String(activeJob?.video_url || '');

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    void callHook<any>('ugc-studio-runway', { op: 'contract' }).then((result) => {
      if (!cancelled) setContractReady(result?.recipe?.id === 'product_ugc');
    }).catch((cause) => {
      if (!cancelled) setError(exactError(cause, 'Runway product_ugc is unavailable.'));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setQuote(null);
    setApproved(false);
  }, [productImageUrl, action]);

  useEffect(() => {
    if (!activeJob?.id || TERMINAL.includes(activeStatus)) return;
    let cancelled = false;
    const refreshStatus = async () => {
      try {
        const result = await callHook<any>('ugc-studio-runway', { op: 'status', job_id: activeJob.id });
        if (cancelled || !result?.job) return;
        setActiveJob(result.job as Job);
        if (TERMINAL.includes(String(result.job.status || '').toLowerCase())) refreshHistory();
      } catch (cause) {
        if (!cancelled) setError(exactError(cause));
      }
    };
    const timer = window.setInterval(() => void refreshStatus(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeJob?.id, activeStatus, refreshHistory]);

  useEffect(() => {
    if (historyLoading || autoResumeRef.current || activeJob || !history.length) return;
    autoResumeRef.current = true;
    const row = history.find((item: Job) => LIVE_STATUSES.includes(String(item.status || '').toLowerCase()));
    if (!row?.id) return;
    void resumeJob(row, true);
  }, [historyLoading, history, activeJob]);

  async function run(nextBusy: Busy, operation: () => Promise<void>) {
    setBusy(nextBusy);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (cause) {
      setError(exactError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function uploadProduct(file: File) {
    await run('upload', async () => {
      if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, or WebP image.');
      const url = await runwayUpload(file);
      if (!isUsableReference(url)) throw new Error('Workspace storage did not return a durable HTTPS image URL.');
      setProductImageUrl(url);
      setProductDescription('');
      setNotice('Product image uploaded to durable workspace storage.');
    });
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadProduct(file);
  }

  async function generateProductImage() {
    await run('image', async () => {
      const description = productDescription.trim();
      if (!description) throw new Error('Describe your product first.');
      const token = await getWorkspaceToken();
      if (!token) throw new Error('Workspace authentication is unavailable. Please sign in again.');
      const response = await fetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-DB-Token': token,
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: `Create a clean, realistic product reference image for a creator-style UGC video. Show one clearly identifiable product on a simple neutral background, with no hands, people, logos, captions, or invented claims. Product: ${description}`,
          aspectRatio: '1:1',
          quality: 'standard',
          returnBase64: false,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(exactError(payload, `GPT image generation failed (HTTP ${response.status}).`));
      const url = String(payload?.imageUrl || payload?.url || '');
      if (!isUsableReference(url)) throw new Error('GPT image generation returned no durable HTTPS image URL.');
      setProductImageUrl(url);
      setNotice('GPT created and saved a durable product image.');
    });
  }

  async function getQuote() {
    await run('quote', async () => {
      if (!inputsReady) throw new Error('Add a product image and describe what should happen first.');
      const result = await callHook<any>('ugc-studio-runway', {
        op: 'quote',
        product_image_url: productImageUrl,
        action: action.trim(),
      });
      if (!result?.quote) throw new Error('Runway returned no quote.');
      setQuote(result.quote as ExactQuote);
      setApproved(false);
      setNotice(`Exact Runway quote: ${result.quote.label}`);
    });
  }

  async function generateVideo() {
    await run('generate', async () => {
      if (!inputsReady) throw new Error('Both inputs are required.');
      if (!quote || !approved) throw new Error('Get and approve the exact Runway quote first.');
      const result = await callHook<any>('ugc-studio-runway', {
        op: 'start',
        product_image_url: productImageUrl,
        action: action.trim(),
        approved: true,
        approved_credits: quote.credits,
        approved_usd: quote.usd,
      });
      const job = result?.job;
      if (!job?.job_id || !job?.task_id) throw new Error('The server did not return a persisted Runway job.');
      setActiveJob({
        id: Number(job.job_id),
        task_id: String(job.task_id),
        status: String(job.status || 'queued'),
        product_image_url: productImageUrl,
        script: action.trim(),
      });
      refreshHistory();
      setNotice(job.fallback_notice || 'Generation is running on the server. You can close this page and return later.');
    });
  }

  async function resumeJob(row: Job, resumeServer = true) {
    setError('');
    try {
      const result = await callHook<any>('ugc-studio-runway', {
        op: 'status',
        job_id: Number(row.id),
        resume: resumeServer,
      });
      const job = (result?.job || row) as Job;
      setActiveJob(job);
      if (job.product_image_url) setProductImageUrl(String(job.product_image_url));
      const savedAction = String(job.script || job.product_description || '');
      if (savedAction) setAction(savedAction);
      if (resumeServer && !TERMINAL.includes(String(job.status || '').toLowerCase())) {
        setNotice('This saved job is still running on the server. Progress has resumed here.');
      }
    } catch (cause) {
      setError(exactError(cause));
    }
  }

  function newVideo() {
    setImageMode('upload');
    setProductImageUrl('');
    setProductDescription('');
    setAction('');
    setQuote(null);
    setApproved(false);
    setActiveJob(null);
    setNotice('');
    setError('');
    autoResumeRef.current = true;
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--space-surface-bg)] p-6 text-[var(--space-text-primary)]">
        <div className="max-w-md rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-6 text-center">
          <UserRound className="mx-auto h-8 w-8 text-[var(--space-text-brand)]" />
          <h1 className="mt-4 font-['Space_Grotesk'] text-xl font-semibold">Sign in to use UGC Studio</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--space-text-secondary)]">Runway generation and persistent history require your email session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(ellipse_70%_38%_at_50%_-8%,color-mix(in_srgb,var(--space-brand-primary-500)_10%,transparent),transparent_66%),var(--space-surface-bg)] text-[var(--space-text-primary)]">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 sm:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--space-brand-primary-500)_32%,transparent)] bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]"><Film className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--space-text-brand)]">Runway product UGC</p>
              <h1 className="mt-1 font-['Space_Grotesk'] text-2xl font-semibold tracking-tight sm:text-3xl">UGC Studio</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--space-text-secondary)]">One product image. One direction. A creator-style video that keeps generating even if you close the page.</p>
            </div>
          </div>
          <button type="button" onClick={newVideo} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-panel)] px-4 text-sm font-semibold hover:bg-[var(--space-surface-card-hover)]"><RefreshCw className="h-4 w-4" /> New video</button>
        </header>

        {error ? <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-4 text-sm text-[var(--vg-danger)]" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{error}</span></div> : null}
        {notice ? <div className="mb-5 flex items-start gap-3 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-4 text-sm text-[var(--space-text-secondary)]" role="status"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--space-text-brand)]" /><span>{notice}</span></div> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <div className="space-y-5">
            <Section eyebrow="Input 1" title="Product image">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-bg)] p-1.5">
                <button type="button" onClick={() => setImageMode('upload')} className={`min-h-11 rounded-[10px] px-3 text-sm font-semibold transition ${imageMode === 'upload' ? 'bg-[var(--space-surface-card-hover)] text-[var(--space-text-primary)]' : 'text-[var(--space-text-secondary)] hover:text-[var(--space-text-primary)]'}`}><Upload className="mr-2 inline h-4 w-4" />Upload</button>
                <button type="button" onClick={() => setImageMode('ai')} className={`min-h-11 rounded-[10px] px-3 text-sm font-semibold transition ${imageMode === 'ai' ? 'bg-[var(--space-surface-card-hover)] text-[var(--space-text-primary)]' : 'text-[var(--space-text-secondary)] hover:text-[var(--space-text-primary)]'}`}><Sparkles className="mr-2 inline h-4 w-4" />Generate with AI</button>
              </div>

              {imageMode === 'upload' ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => pickerRef.current?.click()}
                    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    disabled={busy === 'upload'}
                    className={`flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm transition disabled:opacity-50 ${dragging ? 'border-[var(--space-brand-primary-500)] bg-[var(--space-surface-accent-soft)]' : 'border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] hover:border-[var(--space-brand-primary-500)]'}`}
                  >
                    {busy === 'upload' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-[var(--space-text-brand)]" />}
                    <span className="font-semibold">Drop an image here or choose a file</span>
                    <span className="text-xs text-[var(--space-text-muted)]">PNG, JPG, or WebP · saved to durable workspace storage</span>
                  </button>
                  <input ref={pickerRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProduct(file); event.target.value = ''; }} />
                </div>
              ) : (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--space-text-secondary)]">Describe your product</label>
                  <textarea value={productDescription} onChange={(event) => setProductDescription(event.target.value)} rows={4} placeholder="e.g. A matte black insulated travel mug with a slim gold band and leak-proof lid" className="min-h-28 w-full resize-y rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] p-3 text-sm leading-6 outline-none placeholder:text-[var(--space-text-muted)] focus:border-[var(--space-brand-primary-500)]" />
                  <button type="button" onClick={() => void generateProductImage()} disabled={!productDescription.trim() || busy === 'image'} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] px-4 text-sm font-semibold text-[var(--vg-on-accent)] disabled:cursor-not-allowed disabled:opacity-50">{busy === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{productImageUrl ? 'Regenerate' : 'Generate product image'}</button>
                </div>
              )}

              {productImageUrl ? (
                <div className="relative mt-4 overflow-hidden rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-bg)]">
                  <img src={productImageUrl} alt="Product reference" className="aspect-square max-h-[420px] w-full object-contain" />
                  <button type="button" onClick={() => setProductImageUrl('')} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-panel)]" aria-label="Remove product image"><X className="h-4 w-4" /></button>
                  <div className="flex items-center gap-2 border-t border-[var(--space-border-default)] p-3 text-xs text-[var(--vg-success)]"><CheckCircle2 className="h-4 w-4" />Durable product image ready</div>
                </div>
              ) : null}
            </Section>

            <Section eyebrow="Input 2" title="What should happen?">
              <label className="mb-1.5 block text-xs font-semibold text-[var(--space-text-secondary)]">Action, script, or scene direction</label>
              <textarea value={action} onChange={(event) => setAction(event.target.value)} rows={7} placeholder="e.g. A creator picks up the product, shows how it fits into their morning routine, explains the main benefit in a natural first-person voice, and ends on a clear product close-up." className="min-h-44 w-full resize-y rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] p-3 text-sm leading-6 outline-none placeholder:text-[var(--space-text-muted)] focus:border-[var(--space-brand-primary-500)]" />
              <p className="mt-2 text-xs leading-5 text-[var(--space-text-muted)]">This is sent unchanged as the Runway recipe’s creative direction. UGC Studio uses a fixed natural creator, 4-second vertical output, and audio so no other setup is required.</p>
            </Section>

            <Section eyebrow="Generate" title="Confirm the exact credit quote">
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--space-brand-primary-500)_35%,transparent)] bg-[var(--space-surface-accent-soft)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold">No charge until you approve</p><p className="mt-1 text-xs leading-5 text-[var(--space-text-secondary)]">The server validates these exact two inputs against the live product_ugc recipe.</p></div>
                  <button type="button" onClick={() => void getQuote()} disabled={!inputsReady || !contractReady || busy === 'quote' || generating} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-panel-strong)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{busy === 'quote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}Get exact quote</button>
                </div>
                {quote ? (
                  <div className="mt-4 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-4">
                    <p className="text-base font-semibold text-[var(--space-text-brand)]">{quote.label}</p>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[var(--space-text-secondary)]"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} className="mt-1 accent-[var(--space-brand-primary-500)]" /><span>I approve this exact Runway generation and workspace-wallet charge.</span></label>
                    <button type="button" onClick={() => void generateVideo()} disabled={!inputsReady || !approved || busy === 'generate' || generating} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] px-4 text-sm font-semibold text-[var(--vg-on-accent)] disabled:cursor-not-allowed disabled:opacity-50">{busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}Generate UGC video</button>
                  </div>
                ) : null}
              </div>
            </Section>
          </div>

          <aside className="space-y-5">
            <Section eyebrow="Server job" title="Generation progress">
              {activeJob ? (
                <div>
                  <div className={`rounded-lg border p-3 text-xs leading-5 ${statusClass(activeStatus)}`}>
                    <div className="flex items-center gap-2"><p className="font-semibold capitalize">{activeStatus}</p>{generating ? <Loader2 className="ml-auto h-4 w-4 animate-spin" /> : null}</div>
                    <p className="mt-1 break-words">{activeJob.error_message || statusCopy(activeStatus)}</p>
                    {activeJob.task_id ? <p className="mt-2 break-all font-mono text-[10px] opacity-80">task: {activeJob.task_id}</p> : null}
                  </div>
                  {outputUrl ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--space-border-default)] bg-black">
                      <video src={outputUrl} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[520px] w-full object-contain" />
                      <div className="grid grid-cols-2 gap-2 bg-[var(--space-surface-card)] p-3"><a href={outputUrl} download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] px-3 text-sm font-semibold text-[var(--vg-on-accent)]"><Download className="h-4 w-4" />Download</a><a href={outputUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-panel)] px-3 text-sm font-semibold"><ExternalLink className="h-4 w-4" />Open</a></div>
                    </div>
                  ) : null}
                </div>
              ) : <div className="rounded-xl border border-dashed border-[var(--space-border-default)] p-5 text-center"><Film className="mx-auto h-6 w-6 text-[var(--space-text-muted)]" /><p className="mt-2 text-sm text-[var(--space-text-secondary)]">No active generation.</p><p className="mt-1 text-xs leading-5 text-[var(--space-text-muted)]">A submitted job keeps running on the server after this page closes.</p></div>}
            </Section>

            <Section eyebrow="Persistent" title="UGC history">
              {historyLoading ? <div className="flex items-center gap-2 text-sm text-[var(--space-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" />Loading saved jobs…</div> : historyError ? <div className="rounded-lg border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-3 text-xs text-[var(--vg-danger)]">{historyError.message}</div> : history.length ? <div className="space-y-3">{history.map((row: Job) => {
                const rowStatus = String(row.status || '').toLowerCase();
                return <article key={row.id} className={`overflow-hidden rounded-xl border bg-[var(--space-surface-panel)] ${activeJob?.id === Number(row.id) ? 'border-[var(--space-brand-primary-500)]' : 'border-[var(--space-border-default)]'}`}>{row.video_url ? <video src={row.video_url} controls muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" /> : <div className="flex aspect-video items-center justify-center bg-[var(--space-surface-bg)]">{rowStatus && !TERMINAL.includes(rowStatus) ? <Loader2 className="h-6 w-6 animate-spin text-[var(--space-text-brand)]" /> : <ImageIcon className="h-6 w-6 text-[var(--space-text-muted)]" />}</div>}<div className="p-3"><div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 text-sm font-semibold leading-5">{actionTitle(row)}</p><span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${statusClass(rowStatus)}`}>{rowStatus}</span></div>{row.error_message ? <p className="mt-2 break-words text-[11px] leading-5 text-[var(--vg-danger)]">{row.error_message}</p> : null}<button type="button" onClick={() => void resumeJob(row, !TERMINAL.includes(rowStatus))} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--space-border-strong)] bg-[var(--space-surface-panel-strong)] px-3 text-xs font-semibold hover:bg-[var(--space-surface-card-hover)]"><RefreshCw className="h-3.5 w-3.5" />{rowStatus === 'succeeded' ? 'Open saved video' : 'Resume job'}</button></div></article>;
              })}</div> : <div className="rounded-xl border border-dashed border-[var(--space-border-default)] p-5 text-center"><Film className="mx-auto h-6 w-6 text-[var(--space-text-muted)]" /><p className="mt-2 text-sm text-[var(--space-text-secondary)]">No UGC videos yet.</p></div>}
            </Section>
          </aside>
        </div>
      </main>
    </div>
  );
}
