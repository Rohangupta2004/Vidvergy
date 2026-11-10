/**
 * SceneForge — answer the delivery-notes brand questions on a finished Auto Editor project.
 *
 * Only the fields that are still blank are offered. Nothing is guessed: the saved Brand Kit is used
 * only when the user presses "Use my saved Brand Kit" (it fills empty fields here, nothing else), and
 * a logo counts only once the user picks a candidate, uploads their own or chooses "No logo".
 * Saving goes through the `auto_brand_answers` pipeline op, which merges just these answers into the
 * project's brand context and re-runs the existing re-edit (no new charge).
 */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookmarkCheck, Check, ExternalLink, Globe, ImageOff, Loader2, Search, Upload, Wand2 } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { getDefaultBrand, useBrandKit } from '../../../components/brandKitStore';
import { callHook } from '../../../lib/workspace';
import { uploadProjectLogo, type AutoBrandAnswers } from '../lib/forgeClient';
import type { ForgeProject } from '../lib/forgeTypes';
import { safeErrorText } from '../lib/safeError';
import { rehostLogo, type LogoCandidate, type LookupResult } from './ForgeBrandBrief';

type LogoSelection = { choice: NonNullable<AutoBrandAnswers['logoChoice']>; url?: string; original?: string; source?: string; key?: string | null };

/** Which of the answerable brand fields are still blank on this project. */
export function blankBrandFields(project: ForgeProject): { name: boolean; website: boolean; cta: boolean; logo: boolean } {
  const config: any = project.studio_config || {};
  const ctx = config.brandContext && typeof config.brandContext === 'object' ? config.brandContext : {};
  const brand = config.brand && typeof config.brand === 'object' ? config.brand : {};
  return {
    name: !String(ctx.name || '').trim(),
    website: !String(ctx.website || brand.website || '').trim(),
    cta: !(Array.isArray(ctx.ctas) ? ctx.ctas : []).some((item: unknown) => String(item || '').trim()),
    logo: !brand.logoUrl && String(ctx.logoSource || '').toLowerCase() !== 'none',
  };
}

export default function AutoBrandAnswersForm({ project, saving, onSave }: {
  project: ForgeProject;
  saving: boolean;
  onSave: (answers: AutoBrandAnswers) => void;
}) {
  const blank = useMemo(() => blankBrandFields(project), [project]);
  const ctx: any = (project.studio_config as any)?.brandContext || {};
  const { document: brandKit } = useBrandKit();
  const savedBrand = useMemo(() => getDefaultBrand(brandKit), [brandKit]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [cta, setCta] = useState('');
  const [logo, setLogo] = useState<LogoSelection | null>(null);
  const [usedKit, setUsedKit] = useState(false);
  const [kitCandidate, setKitCandidate] = useState<LogoCandidate | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState<'' | 'lookup' | 'pick' | 'upload'>('');
  const [error, setError] = useState('');
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  if (!blank.name && !blank.website && !blank.cta && !blank.logo) return null;

  const lookupName = (name || String(ctx.name || '')).trim();
  const lookupWebsite = (website || String(ctx.website || '')).trim();
  const candidates = [kitCandidate, ...(lookup?.candidates || [])].filter((item): item is LogoCandidate => Boolean(item && !broken[item.id]));
  const answers: AutoBrandAnswers = {};
  if (blank.name && name.trim()) answers.name = name.trim();
  if (blank.website && website.trim()) answers.website = website.trim();
  if (blank.cta && cta.trim()) answers.cta = cta.trim();
  if (blank.logo && logo) {
    answers.logoChoice = logo.choice;
    if (logo.choice !== 'none') {
      answers.logoUrl = logo.url;
      answers.logoOriginalUrl = logo.original;
      answers.logoSource = logo.source;
      answers.logoKey = logo.key ?? null;
    }
  }
  if (usedKit && Object.keys(answers).length) answers.usedBrandKit = true;
  const hasAnswer = Object.keys(answers).length > 0;

  const runLookup = async () => {
    if (busy) return;
    if (!lookupName && !lookupWebsite) { setError('Type the brand name or website first.'); return; }
    setBusy('lookup'); setError(''); setBroken({});
    try {
      const data = await callHook<LookupResult>('sceneforge-brand-lookup', { name: lookupName, url: lookupWebsite });
      if (!data?.ok) throw new Error(data?.error || 'The lookup did not answer.');
      setLookup(data);
    } catch (cause: any) {
      setError(String(cause?.message || cause || 'The lookup failed. You can still upload the logo.'));
    } finally { setBusy(''); }
  };

  const pick = async (candidate: LogoCandidate) => {
    if (busy) return;
    setBusy('pick'); setError('');
    try {
      const url = candidate.kind === 'brand_kit' ? candidate.url : await rehostLogo(candidate.url, project.id);
      const host = String(candidate.source || '').replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
      setLogo({ choice: candidate.kind === 'web' ? 'web' : candidate.kind === 'brand_kit' ? 'brand_kit' : 'site', url, original: candidate.url, source: host ? `${candidate.label} · ${host}` : candidate.label });
    } finally { setBusy(''); }
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (allowed.indexOf(file.type) < 0) { setError('Choose a PNG, SVG, JPG or WebP logo.'); return; }
    setBusy('upload'); setError('');
    try {
      const stored = await uploadProjectLogo(file, project.id);
      setLogo({ choice: 'upload', url: stored.url, key: stored.key, source: 'Uploaded by you' });
    } catch (cause: any) {
      setError(String(cause?.message || cause || 'The logo could not be uploaded.'));
    } finally {
      setBusy('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applySavedKit = () => {
    if (!savedBrand) return;
    if (blank.name && !name.trim()) setName(String(savedBrand.identity.businessName || '').slice(0, 80));
    if (blank.website && !website.trim()) setWebsite(String(savedBrand.websiteUrl || '').slice(0, 200));
    if (blank.cta && !cta.trim()) setCta(String((savedBrand.offer.offersCtas || []).filter(Boolean)[0] || '').slice(0, 60));
    const kitLogo = savedBrand.visuals.logoUrl;
    setKitCandidate(blank.logo && kitLogo ? { id: 'brand-kit', url: kitLogo, kind: 'brand_kit', label: 'Logo saved in your Brand Kit' } : null);
    setUsedKit(true);
  };

  const label = { color: COLORS.text, display: 'grid', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 600, gap: 5 } as const;
  const input = { background: COLORS.input, border: 'none', borderRadius: RADIUS.sm, boxSizing: 'border-box', color: COLORS.text, fontFamily: FONT.body, fontSize: 14, minHeight: 42, padding: '0 12px', width: '100%' } as const;
  const chip = { alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: 999, color: COLORS.secondary, cursor: 'pointer', display: 'inline-flex', fontSize: 12, gap: 6, minHeight: 32, padding: '0 12px' } as const;
  const selectedUrl = logo && logo.choice !== 'none' ? logo.url : '';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...chip, background: COLORS.accentSoft, borderColor: COLORS.accent, color: COLORS.accent, fontFamily: FONT.heading, fontWeight: 700, width: 'fit-content' }} data-testid="button-open-brand-answers">
        <Wand2 size={14} /> Answer these now and re-edit
      </button>
    );
  }

  return (
    <div style={{ background: COLORS.surface, borderRadius: RADIUS.card, display: 'grid', gap: 12, padding: 12 }} data-testid="sceneforge-brand-answers">
      <span style={{ color: COLORS.secondary, fontSize: 12 }}>Answer only what applies — anything left blank stays out of the video. Nothing is guessed, and your saved Brand Kit is used only if you ask for it.</span>
      {savedBrand ? (
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={applySavedKit} style={{ ...chip, borderColor: usedKit ? COLORS.accent : COLORS.border, color: usedKit ? COLORS.accent : COLORS.secondary }} data-testid="button-answers-use-brand-kit">
            <BookmarkCheck size={14} /> {usedKit ? 'Filled from your saved Brand Kit' : `Use my saved Brand Kit${savedBrand.identity.businessName ? ` (${savedBrand.identity.businessName})` : ''}`}
          </button>
          <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Optional — only fills the empty answers below.</span>
        </div>
      ) : null}

      {blank.name || blank.website || blank.cta ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {blank.name ? (
            <label style={label}>Brand or product name
              <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} placeholder="e.g. HoopViz" style={input} data-testid="input-answers-name" />
            </label>
          ) : null}
          {blank.website ? (
            <label style={label}>Website URL
              <input value={website} onChange={(event) => setWebsite(event.target.value.slice(0, 200))} placeholder="e.g. hoopviz.com" inputMode="url" style={input} data-testid="input-answers-website" />
            </label>
          ) : null}
          {blank.cta ? (
            <label style={label}>Call to action
              <input value={cta} onChange={(event) => setCta(event.target.value.slice(0, 60))} placeholder="e.g. Start your free trial" style={input} data-testid="input-answers-cta" />
            </label>
          ) : null}
        </div>
      ) : null}

      {blank.logo ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ alignItems: 'center', color: COLORS.text, display: 'flex', flexWrap: 'wrap', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 600, gap: 8 }}>
            Which logo should the video use?
            <button type="button" disabled={Boolean(busy)} onClick={() => void runLookup()} style={{ ...chip, background: COLORS.accentSoft, borderColor: COLORS.accent, color: COLORS.accent, cursor: busy ? 'wait' : 'pointer', fontFamily: FONT.heading, fontWeight: 700 }} data-testid="button-answers-lookup">
              {busy === 'lookup' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {busy === 'lookup' ? 'Checking your website and the web…' : lookup ? 'Search again' : 'Find my logo (website + web search)'}
            </button>
            <input ref={inputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(event) => void onUpload(event.target.files?.[0])} />
            <button type="button" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()} style={chip} data-testid="button-answers-upload-logo">
              {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload my own
            </button>
            <button type="button" onClick={() => setLogo({ choice: 'none' })} style={{ ...chip, borderColor: logo?.choice === 'none' ? COLORS.accent : COLORS.border, color: logo?.choice === 'none' ? COLORS.accent : COLORS.secondary }} data-testid="button-answers-no-logo">
              <ImageOff size={14} /> No logo
            </button>
          </div>

          {selectedUrl ? (
            <div style={{ alignItems: 'center', background: COLORS.raised, borderRadius: RADIUS.sm, display: 'flex', flexWrap: 'wrap', gap: 12, padding: 10 }}>
              <span style={{ alignItems: 'center', background: '#F7F7F4', borderRadius: 8, display: 'flex', height: 48, justifyContent: 'center', padding: 6, width: 86 }}><img src={selectedUrl} alt="Logo you chose" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} /></span>
              <span style={{ color: COLORS.success, flex: 1, fontSize: 12.5, lineHeight: '18px', minWidth: 160 }}>Confirmed — {logo?.source || 'your logo'}</span>
            </div>
          ) : logo?.choice === 'none' ? (
            <div style={{ color: COLORS.success, fontSize: 12.5 }}>No logo — the video will not show one.</div>
          ) : null}

          {lookup?.website ? (
            <div style={{ alignItems: 'center', color: lookup.website.read ? COLORS.secondary : COLORS.warning, display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 6 }}>
              <Globe size={13} /> {lookup.website.read ? `Read ${lookup.website.url}` : `${lookup.website.url}: ${safeErrorText(lookup.website.error, 'could not be read', { maxLength: 120, context: 'brand lookup website error' })}`}
              {lookup.website.read && lookup.website.name && blank.name && !name.trim() ? <button type="button" onClick={() => setName(String(lookup.website?.name || '').slice(0, 80))} style={chip}>Use “{lookup.website.name}” as the name</button> : null}
            </div>
          ) : null}
          {lookup?.siteSuggestions?.length && blank.website && !website.trim() ? (
            <div style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 6 }}>
              Possible websites (check before using):
              {lookup.siteSuggestions.map((site) => <button key={site.url} type="button" onClick={() => setWebsite(site.url.slice(0, 200))} style={chip} title={site.title}>{site.url.replace(/^https?:\/\//, '')}</button>)}
            </div>
          ) : null}
          {(lookup?.notes || []).map((note) => <div key={note} style={{ alignItems: 'flex-start', color: COLORS.muted, display: 'flex', fontSize: 12, gap: 6, lineHeight: '17px' }}><AlertTriangle size={13} style={{ flex: '0 0 auto', marginTop: 2 }} /> {note}</div>)}

          {candidates.length ? (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }} data-testid="sceneforge-answers-logo-candidates">
              {candidates.map((candidate) => {
                const selected = Boolean(logo && logo.choice !== 'none' && logo.original === candidate.url);
                return (
                  <div key={candidate.id} style={{ background: COLORS.raised, border: `1px solid ${selected ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.sm, display: 'grid', gap: 6, padding: 8 }}>
                    <span style={{ alignItems: 'center', aspectRatio: '3 / 2', background: '#F7F7F4', borderRadius: 6, display: 'flex', justifyContent: 'center', overflow: 'hidden', padding: 8 }}>
                      <img src={candidate.url} alt={candidate.title || candidate.label} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken((current) => ({ ...current, [candidate.id]: true }))} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                    </span>
                    <span style={{ color: COLORS.secondary, fontSize: 11.5, lineHeight: '15px' }}>{candidate.label}</span>
                    {candidate.lowRes ? <span style={{ color: COLORS.warning, fontSize: 11, lineHeight: '15px' }}>Low resolution{candidate.kind === 'web' ? ' · may not be your brand' : ''}</span> : null}
                    {candidate.kind === 'social' ? <span style={{ color: COLORS.muted, fontSize: 11, lineHeight: '15px' }}>Usually a banner, not a logo</span> : null}
                    <div style={{ alignItems: 'center', display: 'flex', gap: 6, justifyContent: 'space-between' }}>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void pick(candidate)} style={{ ...chip, background: selected ? COLORS.accentSoft : COLORS.surface, borderColor: selected ? COLORS.accent : COLORS.border, color: selected ? COLORS.accent : COLORS.text, minHeight: 30, padding: '0 10px' }}>
                        {busy === 'pick' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {selected ? 'Selected' : 'Use this'}
                      </button>
                      {candidate.source && /^https?:\/\//i.test(candidate.source) ? <a href={candidate.source} target="_blank" rel="noreferrer" aria-label="Open source page" style={{ color: COLORS.muted, display: 'inline-flex' }}><ExternalLink size={13} /></a> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {lookup && !candidates.length ? <div style={{ color: COLORS.warning, fontSize: 12.5 }}>No logo was found. Please upload your logo file, or choose “No logo” — SceneForge will not draw a fake one.</div> : null}
        </div>
      ) : null}

      {error ? <div role="alert" style={{ color: COLORS.danger, fontSize: 12.5 }}>{safeErrorText(error, 'That didn’t work — please try again, or upload the logo yourself.', { maxLength: 220, context: 'brand answers error' })}</div> : null}

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" disabled={!hasAnswer || saving || Boolean(busy)} onClick={() => onSave(answers)} style={{ alignItems: 'center', background: hasAnswer && !saving ? COLORS.accent : COLORS.raised, border: 'none', borderRadius: RADIUS.sm, color: hasAnswer && !saving ? COLORS.onAccent : COLORS.muted, cursor: hasAnswer && !saving ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, minHeight: 42, padding: '0 16px' }} data-testid="button-save-brand-answers">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Save answers and re-edit
        </button>
        <button type="button" disabled={saving} onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 12.5, padding: 0 }}>Cancel</button>
        <span style={{ color: COLORS.muted, fontSize: 12 }}>Re-runs the edit with the avatar, voice and assets reused — no new charge.</span>
      </div>
    </div>
  );
}
