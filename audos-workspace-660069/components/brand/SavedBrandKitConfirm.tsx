/**
 * "Use my saved Brand Kit" — the only way saved brand details reach a studio's
 * prompt, brief or render. Nothing from the Brand Kit is applied until the user
 * presses the button and confirms what will be used. They can instead look up a
 * website and its real logo (sceneforge-brand-lookup, read-only) and confirm
 * those details. Stored Brand Kit data is never changed here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkCheck, Check, Globe, ImageOff, Loader2, Search, X } from 'lucide-react';
import { getDefaultBrand, makeBrandRecord, useBrandKit, type BrandRecord } from '../brandKitStore';
import { BRAND_CONSENT_EVENT, brandDocFields, confirmBrandUse, confirmedBrandRecord, revokeBrandUse } from '../../lib/brandDoc';
import { callHook } from '../../lib/workspace';

interface LogoCandidate { id: string; url: string; label: string; lowRes?: boolean }
interface LookupResult {
  ok: boolean;
  error?: string;
  name?: string;
  website?: { url: string; read: boolean; name?: string; colors?: string[]; error?: string } | null;
  candidates?: LogoCandidate[];
  siteSuggestions?: Array<{ url: string; title: string }>;
  notes?: string[];
}

const card = { background: 'var(--space-surface-card)', border: '1px solid var(--space-border-default)', borderRadius: 14, color: 'var(--space-text-primary)', display: 'grid', gap: 10, padding: 12 } as const;
const input = { background: 'var(--space-surface-panel)', border: '1px solid var(--space-border-strong)', borderRadius: 10, color: 'var(--space-text-primary)', fontSize: 13, minHeight: 40, padding: '0 10px', width: '100%' } as const;
const chip = { alignItems: 'center', background: 'var(--space-surface-panel)', border: '1px solid var(--space-border-default)', borderRadius: 999, color: 'var(--space-text-secondary)', cursor: 'pointer', display: 'inline-flex', fontSize: 12, gap: 6, minHeight: 34, padding: '0 12px' } as const;
const primary = { ...chip, background: 'var(--space-surface-accent-soft)', borderColor: 'var(--space-brand-primary-500)', color: 'var(--space-text-brand)', fontWeight: 700 } as const;
const muted = { color: 'var(--space-text-muted)', fontSize: 11.5, lineHeight: '16px' } as const;

function Swatches({ colors }: { colors: string[] }) {
  if (!colors.length) return <span style={muted}>No colours saved</span>;
  return <span style={{ display: 'inline-flex', gap: 4 }}>{colors.slice(0, 6).map((color) => <span key={color} title={color} style={{ background: color, border: '1px solid var(--space-border-default)', borderRadius: 6, display: 'inline-block', height: 20, width: 20 }} />)}</span>;
}

export default function SavedBrandKitConfirm({ onChange, allowLookup = true }: { onChange?: (brand: BrandRecord | null) => void; allowLookup?: boolean }) {
  const { document: kit } = useBrandKit();
  const [mode, setMode] = useState<'idle' | 'review' | 'lookup'>('idle');
  const [confirmed, setConfirmed] = useState<BrandRecord | null>(() => confirmedBrandRecord(kit));
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const sync = () => {
      const next = confirmedBrandRecord(kit);
      setConfirmed(next);
      onChangeRef.current?.(next);
    };
    sync();
    window.addEventListener(BRAND_CONSENT_EVENT, sync);
    return () => window.removeEventListener(BRAND_CONSENT_EVENT, sync);
  }, [kit]);

  const saved = useMemo(() => kit.brands.find((brand) => brand.id === selectedId) || getDefaultBrand(kit), [kit, selectedId]);
  const fields = useMemo(() => brandDocFields(saved), [saved]);
  const candidates = (lookup?.candidates || []).filter((item) => !broken[item.id]);
  const lookupColors = (lookup?.website?.colors || []).slice(0, 4);

  const runLookup = async () => {
    if (busy) return;
    if (!name.trim() && !website.trim()) { setError('Type the brand name or website first.'); return; }
    setBusy(true); setError(''); setBroken({}); setLogoUrl('');
    try {
      const data = await callHook<LookupResult>('sceneforge-brand-lookup', { name: name.trim(), url: website.trim() });
      if (!data?.ok) throw new Error(data?.error || 'The lookup did not answer.');
      setLookup(data);
    } catch (cause: any) {
      setError(String(cause?.message || cause || 'The lookup failed.'));
    } finally { setBusy(false); }
  };

  const confirmLookup = () => {
    const brandName = name.trim() || lookup?.website?.name || lookup?.name || '';
    const record = makeBrandRecord({
      websiteUrl: lookup?.website?.read ? lookup.website.url : website.trim(),
      identity: { businessName: brandName, tagline: '' },
      offer: { summary: '', features: [], benefits: [], pricing: [], offersCtas: [] },
      audienceTone: { audience: '', tone: '' },
      visuals: { logoUrl, colors: lookupColors, fonts: [], images: [], socialLinks: [], clips: [] },
      pages: [], gaps: [], sources: { lookup: 'Confirmed by the user from a website lookup' }, fetchedAt: '', limited: true,
    });
    confirmBrandUse(record, 'lookup');
    setMode('idle');
  };

  if (confirmed) {
    const confirmedFields = brandDocFields(confirmed);
    return (
      <div style={{ ...card, gridTemplateColumns: 'auto 1fr auto', alignItems: 'center' }} data-testid="saved-brand-confirmed">
        <BookmarkCheck size={16} color="var(--space-text-brand)" />
        <span style={{ fontSize: 12.5, lineHeight: '18px' }}>Using {confirmedFields.name || 'your brand'} for this session{confirmedFields.logoUrls[0] ? ' · logo confirmed' : ' · no logo'}. <span style={muted}>Only what you confirmed is used.</span></span>
        <button type="button" onClick={revokeBrandUse} style={chip}><X size={13} /> Stop using</button>
      </div>
    );
  }

  if (mode === 'idle') {
    return (
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="saved-brand-option">
        {kit.brands.length ? <button type="button" onClick={() => { setSelectedId(''); setMode('review'); }} style={primary} data-testid="button-use-saved-brand-kit"><BookmarkCheck size={14} /> Use my saved Brand Kit</button> : null}
        {allowLookup ? <button type="button" onClick={() => setMode('lookup')} style={chip} data-testid="button-brand-lookup"><Search size={14} /> Look up my website &amp; logo</button> : null}
        <span style={muted}>Optional. Nothing from your Brand Kit is used unless you choose it.</span>
      </div>
    );
  }

  if (mode === 'review') {
    return (
      <div style={card} data-testid="saved-brand-review">
        <strong style={{ fontSize: 13 }}>Use these saved details?</strong>
        {kit.brands.length > 1 ? (
          <select value={saved?.id || ''} onChange={(event) => setSelectedId(event.target.value)} style={input}>
            {kit.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.identity.businessName || 'Untitled brand'}</option>)}
          </select>
        ) : null}
        <div style={{ display: 'grid', fontSize: 12.5, gap: 6, lineHeight: '18px' }}>
          <span><b>Name:</b> {fields.name || <i>not saved</i>}</span>
          <span><b>Website:</b> {fields.website || <i>not saved</i>}</span>
          {fields.tone ? <span><b>Tone:</b> {fields.tone}</span> : null}
          {fields.audience ? <span><b>Audience:</b> {fields.audience}</span> : null}
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}><b>Colours:</b> <Swatches colors={fields.colors} /></span>
          <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}><b>Logo:</b> {fields.logoUrls[0] ? <img src={fields.logoUrls[0]} alt="Saved logo" style={{ background: '#F7F7F4', borderRadius: 6, height: 34, maxWidth: 110, objectFit: 'contain', padding: 4 }} /> : <i>not saved</i>}</span>
        </div>
        <span style={muted}>These are sent to the AI exactly as saved. Anything not listed is left out, never guessed.</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" disabled={!saved} onClick={() => { if (saved) confirmBrandUse(saved, 'saved'); setMode('idle'); }} style={primary} data-testid="button-confirm-saved-brand"><Check size={14} /> Confirm and use</button>
          <button type="button" onClick={() => setMode('idle')} style={chip}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={card} data-testid="brand-lookup-panel">
      <strong style={{ fontSize: 13 }}>Look up your website and logo</strong>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} placeholder="Brand or product name" style={input} />
        <input value={website} onChange={(event) => setWebsite(event.target.value.slice(0, 200))} placeholder="Website, e.g. example.com" inputMode="url" style={input} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => void runLookup()} style={primary}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {busy ? 'Checking the website and the web…' : lookup ? 'Search again' : 'Find my logo'}</button>
        <button type="button" onClick={() => setMode('idle')} style={chip}>Cancel</button>
      </div>
      {error ? <div role="alert" style={{ color: 'var(--space-semantic-danger-500, #e5484d)', fontSize: 12.5 }}>{error}</div> : null}
      {lookup?.website ? <span style={{ ...muted, alignItems: 'center', display: 'flex', gap: 6 }}><Globe size={13} /> {lookup.website.read ? `Read ${lookup.website.url}` : `${lookup.website.url}: ${lookup.website.error || 'could not be read'}`}</span> : null}
      {lookup?.siteSuggestions?.length && !website.trim() ? (
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}><span style={muted}>Possible websites (check before using):</span>{lookup.siteSuggestions.map((site) => <button key={site.url} type="button" onClick={() => setWebsite(site.url)} style={chip}>{site.url.replace(/^https?:\/\//, '')}</button>)}</div>
      ) : null}
      {(lookup?.notes || []).map((note) => <span key={note} style={muted}>{note}</span>)}
      {lookup ? (
        <>
          {candidates.length ? (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {candidates.map((item) => (
                <button key={item.id} type="button" onClick={() => setLogoUrl(item.url)} style={{ ...chip, alignItems: 'stretch', borderColor: logoUrl === item.url ? 'var(--space-brand-primary-500)' : 'var(--space-border-default)', borderRadius: 12, display: 'grid', gap: 4, padding: 6 }}>
                  <span style={{ alignItems: 'center', aspectRatio: '3 / 2', background: '#F7F7F4', borderRadius: 8, display: 'flex', justifyContent: 'center', overflow: 'hidden', padding: 6 }}><img src={item.url} alt={item.label} referrerPolicy="no-referrer" onError={() => setBroken((current) => ({ ...current, [item.id]: true }))} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} /></span>
                  <span style={{ ...muted, textAlign: 'left' }}>{logoUrl === item.url ? 'Selected' : item.label}{item.lowRes ? ' · low resolution' : ''}</span>
                </button>
              ))}
            </div>
          ) : <span style={muted}>No logo was found. Continue without one; nothing will be invented.</span>}
          {lookupColors.length ? <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}><span style={muted}>Colours seen on the website:</span><Swatches colors={lookupColors} /></span> : null}
          <span style={{ ...muted, alignItems: 'center', display: 'flex', gap: 6 }}>{logoUrl ? <Check size={13} /> : <ImageOff size={13} />} {logoUrl ? 'This logo will be used.' : 'No logo selected: the video will not show one.'}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={!name.trim() && !lookup.website?.name && !lookup.name} onClick={confirmLookup} style={primary} data-testid="button-confirm-lookup-brand"><Check size={14} /> Confirm these details</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
