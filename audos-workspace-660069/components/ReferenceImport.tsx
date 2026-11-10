import { useState } from 'react';
import { AlertCircle, Check, Loader2, RefreshCw, Search } from 'lucide-react';
import { researchReference, type ReferenceResearch } from '../lib/researchLibrary';

export default function ReferenceImport({
  kind = 'auto',
  label = 'Import from URL',
  placeholder = 'https://…',
  onImport,
}: {
  kind?: 'auto' | 'web' | 'social' | 'ad';
  label?: string;
  placeholder?: string;
  onImport: (result: ReferenceResearch) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ReferenceResearch | null>(null);

  async function run(refresh = false) {
    if (!url.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const found = await researchReference(url.trim(), kind, refresh);
      setResult(found);
      onImport(found);
    } catch (caught) {
      setResult(null);
      // Per-step scraper failures ride on the error object; log them so a failed import is diagnosable.
      console.warn('[ReferenceImport] import failed for', url.trim(), caught, (caught as any)?.failures || []);
      setError(caught instanceof Error ? caught.message : 'The import did not finish.');
    } finally { setBusy(false); }
  }

  return <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-3">
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        value={url}
        onChange={(event) => { setUrl(event.target.value); setResult(null); setError(''); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void run(false); } }}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] px-3 text-sm text-[var(--space-text-primary)] outline-none focus:border-[var(--space-brand-primary-500)]"
      />
      <button type="button" disabled={busy || !url.trim()} onClick={() => void run(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--space-brand-primary-500)] bg-[color-mix(in_srgb,var(--space-brand-primary-500)_12%,transparent)] px-4 text-sm font-bold text-[var(--space-text-brand)] disabled:opacity-40">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}{busy ? 'Scraping…' : label}
      </button>
    </div>
    {result ? <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--space-text-secondary)]"><span className="inline-flex items-center gap-1 rounded-full border border-[var(--space-border-default)] px-2 py-1"><Check size={11} className="text-[var(--vg-success)]" />Scraped from {result.sourceUrl}</span><span>Used {result.actorId}{result.fallbackIndex ? ` (fallback #${result.fallbackIndex})` : ''}</span>{result.fromCache ? <span>cached from {new Date(result.cachedAt).toLocaleString()}</span> : null}<button type="button" disabled={busy} onClick={() => void run(true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--space-border-default)] px-2"><RefreshCw size={11} />Refresh</button></div> : null}
    {error ? <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--vg-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--vg-danger)_8%,transparent)] p-2 text-xs text-[var(--vg-danger)]">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Import didn’t finish</span>
        <span className="block mt-0.5">{error}</span>
        <span className="block mt-1 text-[var(--space-text-secondary)]">You can retry, or continue without importing — just describe the product in the brief yourself.</span>
      </span>
      <button type="button" disabled={busy} onClick={() => void run(true)} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--space-border-default)] px-2 font-bold text-[var(--space-text-primary)]"><RefreshCw size={11} />Retry</button>
    </div> : null}
  </div>;
}
