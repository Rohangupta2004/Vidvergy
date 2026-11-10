/**
 * SceneForge — "Quick questions before we generate".
 *
 * Nothing about the brand is assumed: the saved Brand Kit is only used when the
 * user presses "Use my saved Brand Kit", and the logo must be explicitly
 * confirmed (a candidate found on their website / the web, their own upload,
 * or "No logo"). The Remotion agent only receives what is answered here.
 */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookmarkCheck, Check, ExternalLink, Globe, ImageOff, Loader2, Search, Upload } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { getDefaultBrand, useBrandKit } from '../../../components/brandKitStore';
import { callHook } from '../../../lib/workspace';
import { uploadProjectLogo } from '../lib/forgeClient';
import { getStylePreset, type ProjectBrand } from '../lib/stylePresets';
import type { ForgeBrandBrief } from '../lib/forgeTypes';
import { deriveRoles, extractPalette } from './ForgeBrandStep';

export interface LogoCandidate {
  id: string;
  url: string;
  kind: 'schema' | 'header' | 'logo-img' | 'icon' | 'social' | 'favicon' | 'web' | 'brand_kit';
  label: string;
  source?: string;
  title?: string;
  lowRes?: boolean;
}

export interface LookupResult {
  ok: boolean;
  error?: string;
  name?: string;
  website?: { url: string; read: boolean; name?: string; description?: string; colors?: string[]; error?: string } | null;
  candidates?: LogoCandidate[];
  siteSuggestions?: Array<{ url: string; title: string }>;
  notes?: string[];
}

/** Decisions that must be made before generation. Text answers may be blank (left out, never guessed). */
export function brandBriefMissing(brief: ForgeBrandBrief | undefined, brand: ProjectBrand | undefined): string[] {
  const missing: string[] = [];
  const b = brief || {};
  const logoDecided = b.logoChoice === 'none'
    ? !brand?.logoUrl
    : Boolean(brand?.logoUrl && b.logoUrl && b.logoUrl === brand.logoUrl);
  if (!logoDecided) missing.push('which logo to use (or no logo)');
  if (!b.colorsChoice) missing.push('your brand colours (confirm them, or choose none)');
  return missing;
}

export async function rehostLogo(url: string, projectId: string): Promise<string> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return url;
    const blob = await response.blob();
    if (!/^image\//i.test(blob.type) || blob.size > 8 * 1024 * 1024) return url;
    const ext = blob.type.includes('svg') ? 'svg' : blob.type.includes('webp') ? 'webp' : blob.type.includes('jpeg') ? 'jpg' : 'png';
    const stored = await uploadProjectLogo(new File([blob], `brand-logo.${ext}`, { type: blob.type }), projectId);
    return stored.url || url;
  } catch {
    // Most sites block cross-origin reads; the renderer can still load the public URL.
    return url;
  }
}

export default function ForgeBrandBrief({ projectId, styleId, brief, onBriefChange, brand, onBrandChange, formatLabel, lengthLabel, onEditSettings }: {
  projectId: string;
  styleId?: string | null;
  brief?: ForgeBrandBrief;
  onBriefChange: (brief: ForgeBrandBrief) => void;
  brand: ProjectBrand;
  onBrandChange: (brand: ProjectBrand) => void;
  formatLabel: string;
  lengthLabel: string;
  onEditSettings: () => void;
}) {
  const b = brief || {};
  const base = useMemo(() => getStylePreset(styleId), [styleId]);
  const { document: brandKit } = useBrandKit();
  const savedBrand = useMemo(() => getDefaultBrand(brandKit), [brandKit]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [kitCandidate, setKitCandidate] = useState<LogoCandidate | null>(null);
  const [busy, setBusy] = useState<'' | 'lookup' | 'pick' | 'upload'>('');
  const [error, setError] = useState('');
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const set = (patch: Partial<ForgeBrandBrief>) => onBriefChange({ ...b, ...patch });
  const missing = brandBriefMissing(b, brand);
  const logoConfirmed = Boolean(brand.logoUrl && b.logoUrl === brand.logoUrl);
  const candidates = [kitCandidate, ...(lookup?.candidates || [])].filter((item): item is LogoCandidate => Boolean(item && !broken[item.id]));

  const runLookup = async () => {
    if (busy) return;
    const name = (b.name || '').trim();
    const website = (b.website || '').trim();
    if (!name && !website) { setError('Type the brand name or website first.'); return; }
    setBusy('lookup'); setError(''); setBroken({});
    try {
      const data = await callHook<LookupResult>('sceneforge-brand-lookup', { name, url: website });
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
      const url = candidate.kind === 'brand_kit' ? candidate.url : await rehostLogo(candidate.url, projectId);
      onBrandChange({ ...brand, logoUrl: url, logoKey: null, logoHasBackground: undefined });
      const host = String(candidate.source || '').replace(/^https?:\/\//i, '').split(/[/?#]/)[0];
      onBriefChange({ ...b, logoChoice: candidate.kind === 'web' ? 'web' : candidate.kind === 'brand_kit' ? 'brand_kit' : 'site', logoUrl: url, logoOriginalUrl: candidate.url, logoSource: host ? `${candidate.label} · ${host}` : candidate.label });
    } finally { setBusy(''); }
  };

  const confirmCurrent = () => {
    if (!brand.logoUrl) return;
    set({ logoChoice: b.logoChoice && b.logoChoice !== 'none' ? b.logoChoice : 'upload', logoUrl: brand.logoUrl, logoSource: b.logoSource || 'Uploaded by you' });
  };

  const chooseNoLogo = () => {
    onBrandChange({ ...brand, logoUrl: undefined, logoKey: null, logoHasBackground: undefined });
    onBriefChange({ ...b, logoChoice: 'none', logoUrl: undefined, logoOriginalUrl: undefined, logoSource: undefined });
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (allowed.indexOf(file.type) < 0) { setError('Choose a PNG, SVG, JPG or WebP logo.'); return; }
    setBusy('upload'); setError('');
    try {
      const palette = await extractPalette(file, base.colorRoles);
      const stored = await uploadProjectLogo(file, projectId);
      onBrandChange({ ...brand, logoUrl: stored.url, logoKey: stored.key, logoHasBackground: palette.hasBackground, colors: palette.roles, autoColors: palette.roles, textAdjusted: palette.adjusted });
      // The palette changed with the new logo, so the colour answer is asked again.
      onBriefChange({ ...b, logoChoice: 'upload', logoUrl: stored.url, logoOriginalUrl: undefined, logoSource: 'Uploaded by you', colorsChoice: undefined });
    } catch (cause: any) {
      setError(String(cause?.message || cause || 'The logo could not be uploaded.'));
    } finally {
      setBusy('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyColors = (colors: string[]) => {
    const palette = deriveRoles(colors.slice(0, 3), base.colorRoles);
    onBrandChange({ ...brand, colors: palette.roles, autoColors: palette.roles, textAdjusted: palette.adjusted });
    set({ colorsChoice: undefined });
  };

  const applySavedKit = () => {
    if (!savedBrand) return;
    const kitColors = (savedBrand.visuals.colors || []).filter((color) => /^#[0-9a-f]{3,6}$/i.test(String(color || '').trim()));
    onBriefChange({
      ...b,
      name: b.name || savedBrand.identity.businessName || '',
      website: b.website || savedBrand.websiteUrl || '',
      tone: b.tone || savedBrand.audienceTone.tone || '',
      keyMessage: b.keyMessage || savedBrand.offer.summary || '',
      cta: b.cta || (savedBrand.offer.offersCtas || []).filter(Boolean)[0] || '',
      fonts: b.fontsChoice === 'neutral' ? b.fonts : (b.fonts || (savedBrand.visuals.fonts || []).filter(Boolean).slice(0, 4).join(', ')),
      usedBrandKit: true,
      colorsChoice: undefined,
    });
    if (kitColors.length) {
      const palette = deriveRoles(kitColors.slice(0, 3), base.colorRoles);
      onBrandChange({ ...brand, colors: palette.roles, autoColors: palette.roles, textAdjusted: palette.adjusted });
    }
    const kitLogo = savedBrand.visuals.logoUrl;
    setKitCandidate(kitLogo ? { id: 'brand-kit', url: kitLogo, kind: 'brand_kit', label: 'Logo saved in your Brand Kit' } : null);
  };

  const label = { color: COLORS.text, display: 'grid', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 6 } as const;
  const input = { background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, fontFamily: FONT.body, fontSize: 14, minHeight: 44, padding: '0 12px', width: '100%' } as const;
  const chip = { alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: 999, color: COLORS.secondary, cursor: 'pointer', display: 'inline-flex', fontSize: 12, gap: 6, minHeight: 32, padding: '0 12px' } as const;
  const numberDot = (n: number, done: boolean) => (
    <span style={{ alignItems: 'center', background: done ? COLORS.accentSoft : COLORS.raised, border: `1px solid ${done ? COLORS.accent : COLORS.border}`, borderRadius: 999, color: done ? COLORS.accent : COLORS.muted, display: 'inline-flex', flex: '0 0 auto', fontSize: 11, fontWeight: 700, height: 20, justifyContent: 'center', width: 20 }}>{done ? <Check size={12} /> : n}</span>
  );

  return (
    <section style={{ background: COLORS.surface, border: `1px solid ${missing.length ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 18, maxWidth: 960, padding: 18 }} data-testid="sceneforge-brand-brief">
      <div style={{ display: 'grid', gap: 6 }}>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 17, fontWeight: 700, margin: 0 }}>Quick questions before we generate</h3>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: '19px', margin: 0 }}>
          SceneForge never guesses your logo, name, colours or facts. Answer what applies — anything left blank is simply left out of the video, not invented.
        </p>
        {savedBrand ? (
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={applySavedKit} style={{ ...chip, borderColor: b.usedBrandKit ? COLORS.accent : COLORS.border, color: b.usedBrandKit ? COLORS.accent : COLORS.secondary }} data-testid="button-use-saved-brand-kit">
              <BookmarkCheck size={14} /> {b.usedBrandKit ? 'Filled from your saved Brand Kit' : `Use my saved Brand Kit${savedBrand.identity.businessName ? ` (${savedBrand.identity.businessName})` : ''}`}
            </button>
            <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Optional — only fills empty answers; you still confirm the logo and colours.</span>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <label style={label}>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>{numberDot(1, Boolean((b.name || '').trim()))} Brand or product name</span>
          <input value={b.name || ''} onChange={(event) => set({ name: event.target.value.slice(0, 80) })} placeholder="e.g. HoopViz" style={input} data-testid="input-brief-name" />
        </label>
        <label style={label}>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>{numberDot(2, Boolean((b.website || '').trim()))} Website URL</span>
          <input value={b.website || ''} onChange={(event) => set({ website: event.target.value.slice(0, 200) })} placeholder="e.g. hoopviz.com" inputMode="url" style={input} data-testid="input-brief-website" />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ alignItems: 'center', color: COLORS.text, display: 'flex', flexWrap: 'wrap', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 8 }}>
          {numberDot(3, missing.every((item) => !item.startsWith('which logo')))} Which logo should the video use?
          <button type="button" disabled={Boolean(busy)} onClick={() => void runLookup()} style={{ ...chip, background: COLORS.accentSoft, borderColor: COLORS.accent, color: COLORS.accent, cursor: busy ? 'wait' : 'pointer', fontFamily: FONT.heading, fontWeight: 700 }} data-testid="button-brief-lookup">
            {busy === 'lookup' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {busy === 'lookup' ? 'Checking your website and the web…' : lookup ? 'Search again' : 'Find my logo (website + web search)'}
          </button>
          <input ref={inputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(event) => void onUpload(event.target.files?.[0])} />
          <button type="button" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()} style={chip} data-testid="button-brief-upload-logo">
            {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload my own
          </button>
          <button type="button" onClick={chooseNoLogo} style={{ ...chip, borderColor: b.logoChoice === 'none' ? COLORS.accent : COLORS.border, color: b.logoChoice === 'none' ? COLORS.accent : COLORS.secondary }} data-testid="button-brief-no-logo">
            <ImageOff size={14} /> No logo
          </button>
        </div>

        {brand.logoUrl ? (
          <div style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${logoConfirmed ? COLORS.success : COLORS.warning}`, borderRadius: RADIUS.sm, display: 'flex', flexWrap: 'wrap', gap: 12, padding: 10 }}>
            <span style={{ alignItems: 'center', background: '#F7F7F4', borderRadius: 8, display: 'flex', height: 52, justifyContent: 'center', padding: 6, width: 92 }}><img src={brand.logoUrl} alt="Logo in use" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} /></span>
            <span style={{ color: logoConfirmed ? COLORS.success : COLORS.warning, flex: 1, fontSize: 12.5, lineHeight: '18px', minWidth: 180 }}>
              {logoConfirmed ? `Confirmed — ${b.logoSource || 'your logo'}` : 'Is this your logo? It has not been confirmed yet.'}
            </span>
            {!logoConfirmed ? <button type="button" onClick={confirmCurrent} style={{ ...chip, background: COLORS.accentSoft, borderColor: COLORS.accent, color: COLORS.accent }} data-testid="button-brief-confirm-logo"><Check size={14} /> Yes, use this logo</button> : null}
          </div>
        ) : b.logoChoice === 'none' ? (
          <div style={{ color: COLORS.success, fontSize: 12.5 }}>No logo — the video will not show one.</div>
        ) : null}

        {lookup?.website ? (
          <div style={{ alignItems: 'center', color: lookup.website.read ? COLORS.secondary : COLORS.warning, display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 6 }}>
            <Globe size={13} /> {lookup.website.read ? `Read ${lookup.website.url}` : `${lookup.website.url}: ${lookup.website.error || 'could not be read'}`}
            {lookup.website.read && lookup.website.name && !(b.name || '').trim() ? <button type="button" onClick={() => set({ name: lookup.website?.name || '' })} style={chip}>Use “{lookup.website.name}” as the name</button> : null}
          </div>
        ) : null}
        {lookup?.siteSuggestions?.length && !(b.website || '').trim() ? (
          <div style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 6 }}>
            Possible websites (check before using):
            {lookup.siteSuggestions.map((site) => <button key={site.url} type="button" onClick={() => set({ website: site.url })} style={chip} title={site.title}>{site.url.replace(/^https?:\/\//, '')}</button>)}
          </div>
        ) : null}
        {(lookup?.notes || []).map((note) => <div key={note} style={{ alignItems: 'flex-start', color: COLORS.muted, display: 'flex', fontSize: 12, gap: 6, lineHeight: '17px' }}><AlertTriangle size={13} style={{ flex: '0 0 auto', marginTop: 2 }} /> {note}</div>)}

        {candidates.length ? (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }} data-testid="sceneforge-logo-candidates">
            {candidates.map((candidate) => {
              const selected = Boolean(logoConfirmed && b.logoOriginalUrl === candidate.url);
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

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ alignItems: 'center', color: COLORS.text, display: 'flex', flexWrap: 'wrap', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 8 }}>
          {numberDot(4, Boolean(b.colorsChoice))} Brand colours
          <span style={{ display: 'inline-flex', gap: 4 }}>{[brand.colors.primary, brand.colors.secondary, brand.colors.accent, brand.colors.background].map((color, index) => <span key={`${color}-${index}`} title={color} style={{ background: color, border: `1px solid ${COLORS.border}`, borderRadius: 6, display: 'inline-block', height: 22, width: 22 }} />)}</span>
        </div>
        {lookup?.website?.colors?.length ? (
          <div style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 6 }}>
            Colours seen on your website:
            {lookup.website.colors.map((color) => <span key={color} title={color} style={{ background: color, border: `1px solid ${COLORS.border}`, borderRadius: 6, display: 'inline-block', height: 18, width: 18 }} />)}
            <button type="button" onClick={() => applyColors(lookup.website?.colors || [])} style={chip}>Use these</button>
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => set({ colorsChoice: 'confirmed' })} style={{ ...chip, borderColor: b.colorsChoice === 'confirmed' ? COLORS.accent : COLORS.border, color: b.colorsChoice === 'confirmed' ? COLORS.accent : COLORS.secondary }} data-testid="button-brief-colors-confirm">
            <Check size={14} /> These are my brand colours (edit them in the palette below)
          </button>
          <button type="button" onClick={() => set({ colorsChoice: 'none' })} style={{ ...chip, borderColor: b.colorsChoice === 'none' ? COLORS.accent : COLORS.border, color: b.colorsChoice === 'none' ? COLORS.accent : COLORS.secondary }} data-testid="button-brief-colors-none">
            No brand colours — let the editor pick a neutral look
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <label style={label}>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>{numberDot(5, Boolean((b.tone || '').trim()))} Tone / style</span>
          <input value={b.tone || ''} onChange={(event) => set({ tone: event.target.value.slice(0, 160) })} placeholder="e.g. energetic and sporty, premium and calm" style={input} data-testid="input-brief-tone" />
        </label>
        <label style={label}>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>{numberDot(6, Boolean((b.keyMessage || '').trim()))} Key message</span>
          <input value={b.keyMessage || ''} onChange={(event) => set({ keyMessage: event.target.value.slice(0, 300) })} placeholder="The one thing viewers should remember" style={input} data-testid="input-brief-key-message" />
        </label>
        <label style={label}>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}>{numberDot(7, Boolean((b.cta || '').trim()))} Call to action</span>
          <input value={b.cta || ''} onChange={(event) => set({ cta: event.target.value.slice(0, 60) })} placeholder="e.g. Start your free trial" style={input} data-testid="input-brief-cta" />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 8 }} data-testid="sceneforge-brief-fonts">
        <label htmlFor="input-brief-fonts" style={{ alignItems: 'center', color: COLORS.text, display: 'flex', flexWrap: 'wrap', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 8 }}>
          {numberDot(8, Boolean((b.fonts || '').trim()) || b.fontsChoice === 'neutral')} Brand fonts <span style={{ color: COLORS.muted, fontFamily: FONT.body, fontSize: 11.5, fontWeight: 400 }}>(optional)</span>
        </label>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input id="input-brief-fonts" value={b.fonts || ''} onChange={(event) => set({ fonts: event.target.value.slice(0, 120), fontsChoice: undefined })} placeholder="e.g. Montserrat, Libre Baskerville" style={{ ...input, flex: '1 1 240px', width: 'auto' }} data-testid="input-brief-fonts" />
          <button type="button" onClick={() => set(b.fontsChoice === 'neutral' ? { fontsChoice: undefined } : { fontsChoice: 'neutral', fonts: '' })} style={{ ...chip, borderColor: b.fontsChoice === 'neutral' ? COLORS.accent : COLORS.border, color: b.fontsChoice === 'neutral' ? COLORS.accent : COLORS.secondary }} aria-pressed={b.fontsChoice === 'neutral'} data-testid="button-brief-fonts-neutral">
            {b.fontsChoice === 'neutral' ? <Check size={14} /> : null} No brand font / neutral is fine
          </button>
        </div>
        <span style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: '17px' }}>The renderer can only draw a small set of fonts (Manrope, Inter, Space Grotesk, Montserrat, Libre Baskerville, JetBrains Mono). A brand font outside that set is replaced by the closest available one, and the delivery notes will say so. Leave blank to be asked again later.</span>
      </div>

      <div style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', flexWrap: 'wrap', fontSize: 12.5, gap: 8 }}>
        {numberDot(9, true)} Format & length: <strong style={{ color: COLORS.text }}>{formatLabel} · {lengthLabel}</strong>
        <button type="button" onClick={onEditSettings} style={{ background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', fontSize: 12.5, padding: 0 }}>Change</button>
      </div>

      {error ? <div role="alert" style={{ color: COLORS.danger, fontSize: 13 }}>{error}</div> : null}
      {missing.length ? (
        <div style={{ alignItems: 'flex-start', background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.warning, display: 'flex', fontSize: 12.5, gap: 8, lineHeight: '18px', padding: 10 }} data-testid="sceneforge-brief-missing">
          <AlertTriangle size={14} style={{ flex: '0 0 auto', marginTop: 2 }} /> Before starting, please confirm {missing.join(' and ')}.
        </div>
      ) : null}
    </section>
  );
}
