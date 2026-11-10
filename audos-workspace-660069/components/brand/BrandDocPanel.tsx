import React from 'react';
import { Check, Globe2, Image as ImageIcon, Loader2, Palette, Plus, Save, Sparkles, Star, Trash2, X } from 'lucide-react';
import { fetchBrandFromWebsite, getDefaultBrand, useBrandKit, type BrandRecord } from '../brandKitStore';
import { applyBrandDoc, brandDocFields, splitList, upsertBrand, type BrandDocFields } from '../../lib/brandDoc';

interface ListText { fonts: string; dos: string; donts: string }

const INPUT = 'w-full min-h-11 rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--void)] px-3 py-2 text-sm text-[var(--ivory)] outline-none transition placeholder:text-[var(--faint)] focus:border-[var(--line-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)]';
const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-[var(--muted)]';
const GOLD = '#F2B544';

function lines(value: string): string[] { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function textFor(fields: BrandDocFields): ListText { return { fonts: fields.fonts.join(', '), dos: fields.dos.join('\n'), donts: fields.donts.join('\n') }; }
function hex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split('').map((c) => c + c).join('')}`;
  return GOLD;
}
function isUrl(value: string): boolean { return /^https?:\/\/\S+$/i.test(value.trim()); }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--line)] py-5 first:border-t-0 first:pt-1">
      <h3 className="text-base font-bold text-[var(--ivory)]">{title}</h3>
      {hint ? <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{hint}</p> : null}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={LABEL}>{label}</span>{children}</label>;
}

export default function BrandDocPanel({ onClose, variant = 'drawer' }: { onClose?: () => void; variant?: 'drawer' | 'page' }) {
  const { document, loading, saving, error: storageError, save } = useBrandKit();
  const [brandId, setBrandId] = React.useState<string | null>(null);
  const [base, setBase] = React.useState<BrandRecord | null>(null);
  const [fields, setFields] = React.useState<BrandDocFields>(() => brandDocFields(null));
  const [text, setText] = React.useState<ListText>(() => textFor(brandDocFields(null)));
  const [dirty, setDirty] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [fetching, setFetching] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [failure, setFailure] = React.useState('');

  React.useEffect(() => {
    if (dirty) return;
    const brand = (brandId ? document.brands.find((item) => item.id === brandId) : null) || getDefaultBrand(document);
    const next = brandDocFields(brand);
    setBase(brand);
    setBrandId(brand?.id || null);
    setFields(next);
    setText(textFor(next));
    setUrl(brand?.websiteUrl || '');
  }, [document, brandId, dirty]);

  const touch = () => { setDirty(true); setNotice(''); setFailure(''); };
  const update = (patch: Partial<BrandDocFields>) => { setFields((current) => ({ ...current, ...patch })); touch(); };
  const updateText = (patch: Partial<ListText>) => { setText((current) => ({ ...current, ...patch })); touch(); };
  const isDefault = Boolean(base && document.defaultBrandId === base.id) || document.brands.length <= 1;

  const selectBrand = (id: string) => {
    if (dirty && !window.confirm('Discard unsaved Brand doc changes?')) return;
    setDirty(false);
    setBrandId(id);
  };

  const newBrand = () => {
    if (dirty && !window.confirm('Discard unsaved Brand doc changes?')) return;
    const empty = brandDocFields(null);
    setBase(null);
    setBrandId(null);
    setFields(empty);
    setText(textFor(empty));
    setUrl('');
    setDirty(true);
    setNotice('New brand — fill it in or read it from a website, then save.');
  };

  const persist = async (makeDefault: boolean) => {
    setFailure('');
    const record = applyBrandDoc(base, { ...fields, fonts: splitList(text.fonts), dos: lines(text.dos), donts: lines(text.donts) });
    if (!record.identity.businessName) { setFailure('Add the brand name so Verger can recognise “for my brand” and “for ' + 'your brand name”.'); return; }
    try {
      await save(upsertBrand(document, record, makeDefault || !base));
      setBrandId(record.id);
      setDirty(false);
      setNotice('Saved. Verger and every studio use this from the next request.');
    } catch (caught) {
      setFailure(caught instanceof Error && caught.message ? caught.message : 'The Brand doc could not be saved. Sign in and try again.');
    }
  };

  const fillFromWebsite = async () => {
    if (!url.trim() || fetching) return;
    setFetching(true);
    setFailure('');
    try {
      const fetched = await fetchBrandFromWebsite(url.trim());
      const incoming = brandDocFields(fetched);
      setFields((current) => {
        const merged: BrandDocFields = { ...current };
        (Object.keys(incoming) as Array<keyof BrandDocFields>).forEach((key) => {
          const now = merged[key];
          const next = incoming[key];
          if (Array.isArray(now)) { if (!now.length) (merged as any)[key] = next; }
          else if (!String(now || '').trim()) (merged as any)[key] = next;
        });
        return merged;
      });
      setText((current) => ({ ...current, fonts: current.fonts.trim() ? current.fonts : incoming.fonts.join(', ') }));
      if (!base) setBase(fetched);
      setDirty(true);
      setNotice(fetched.limited ? 'Filled what the website shows (some pages were limited). Review, then save.' : 'Filled the empty sections from the website. Review, then save.');
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'The website could not be read.');
    } finally {
      setFetching(false);
    }
  };

  const setColor = (index: number, value: string) => update({ colors: fields.colors.map((color, i) => (i === index ? value : color)) });
  const setLogo = (index: number, value: string) => update({ logoUrls: fields.logoUrls.map((logo, i) => (i === index ? value : logo)) });

  return (
    <div className={`flex h-full min-h-0 flex-col bg-[var(--ash)] text-[var(--ivory)] ${variant === 'page' ? 'mx-auto w-full max-w-3xl' : ''}`}>
      <header className="flex flex-none items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-[var(--line-gold)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] text-[var(--gold)]"><Sparkles className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[var(--vg-accent)]">Brand doc</p>
          <h2 className="truncate text-xl font-bold tracking-tight">{fields.name || 'Your brand'}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">Verger and every studio read this automatically — say “for my brand”{fields.name ? ` or “for ${fields.name}”` : ''} and these details are filled in for you.</p>
        </div>
        {onClose ? <button type="button" onClick={onClose} aria-label="Close Brand doc" className="grid h-11 w-11 flex-none place-items-center rounded-full border border-[var(--line-2)] text-[var(--muted)] hover:border-[var(--line-gold)] hover:text-[var(--ivory)]"><X className="h-4 w-4" /></button> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
        {document.brands.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select aria-label="Brand" value={brandId || ''} onChange={(event) => selectBrand(event.target.value)} className={`${INPUT} w-auto min-w-[180px] flex-1`}>
              {!brandId ? <option value="">New brand (unsaved)</option> : null}
              {document.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.identity.businessName || 'Untitled brand'}{brand.id === document.defaultBrandId ? ' · default' : ''}</option>)}
            </select>
            {base && !isDefault ? <button type="button" disabled={saving} onClick={() => void persist(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-control)] border border-[var(--line-2)] px-3 text-xs font-bold hover:border-[var(--line-gold)]"><Star className="h-3.5 w-3.5 text-[var(--gold)]" />Make default</button> : null}
            <button type="button" onClick={newBrand} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-control)] border border-[var(--line-2)] px-3 text-xs font-bold hover:border-[var(--line-gold)]"><Plus className="h-3.5 w-3.5" />New brand</button>
          </div>
        ) : null}

        {loading && !document.brands.length ? <p className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Loading your Brand doc…</p> : null}
        {storageError ? <p role="alert" className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] px-3 py-2 text-xs text-[var(--vg-danger)]">{storageError}</p> : null}

        <div className="mb-2 rounded-[var(--r-media)] border border-[color-mix(in_srgb,var(--vg-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--vg-accent)_9%,transparent)] p-3">
          <span className={LABEL}>Fill from a website</span>
          <div className="flex gap-2">
            <input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void fillFromWebsite(); } }} placeholder="yourbrand.com" className={INPUT} inputMode="url" />
            <button type="button" onClick={() => void fillFromWebsite()} disabled={!url.trim() || fetching} className="inline-flex min-h-11 flex-none items-center gap-2 rounded-[var(--r-control)] bg-[var(--vg-btn)] px-4 text-sm font-bold text-[var(--vg-on-btn)] hover:bg-[var(--vg-btn-hover)] active:bg-[var(--vg-btn-pressed)] disabled:opacity-40">{fetching ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Globe2 className="h-4 w-4" />}{fetching ? 'Reading…' : 'Read site'}</button>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">Only empty sections are filled. Nothing is saved until you press Save.</p>
        </div>

        <Section title="Identity">
          <Field label="Brand name"><input value={fields.name} onChange={(event) => update({ name: event.target.value })} placeholder="e.g. SwingCaddy" className={INPUT} /></Field>
          <Field label="Tagline"><input value={fields.tagline} onChange={(event) => update({ tagline: event.target.value })} placeholder="One line that sums the brand up" className={INPUT} /></Field>
          <Field label="Website"><input value={fields.website} onChange={(event) => update({ website: event.target.value })} placeholder="https://" className={INPUT} inputMode="url" /></Field>
        </Section>

        <Section title="Voice & tone" hint="How the brand sounds in scripts, captions and voiceover.">
          <Field label="Voice"><textarea value={fields.voice} onChange={(event) => update({ voice: event.target.value })} rows={3} placeholder="Warm coach, short sentences, light humour, never salesy" className={`${INPUT} resize-y`} /></Field>
          <Field label="Tone"><input value={fields.tone} onChange={(event) => update({ tone: event.target.value })} placeholder="Confident, energetic, credible" className={INPUT} /></Field>
        </Section>

        <Section title="Audience">
          <Field label="Who it is for"><textarea value={fields.audience} onChange={(event) => update({ audience: event.target.value })} rows={2} placeholder="Weekend golfers aged 25–45 who want a lower handicap" className={`${INPUT} resize-y`} /></Field>
        </Section>

        <Section title="Products" hint="What you sell and why it matters. One product per line works well.">
          <Field label="Product descriptions"><textarea value={fields.products} onChange={(event) => update({ products: event.target.value })} rows={4} placeholder="SwingCaddy app — AI swing analysis from one phone video" className={`${INPUT} resize-y`} /></Field>
        </Section>

        <Section title="Colours" hint="Used for captions, graphics and the look of every video.">
          <div className="flex flex-wrap gap-2">
            {fields.colors.map((color, index) => (
              <div key={index} className="flex items-center gap-1.5 rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--void)] p-1.5">
                <input type="color" aria-label={`Colour ${index + 1}`} value={hex(color)} onChange={(event) => setColor(index, event.target.value.toUpperCase())} className="h-8 w-8 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                <input value={color} onChange={(event) => setColor(index, event.target.value)} aria-label={`Colour ${index + 1} hex`} className="w-[86px] bg-transparent font-mono text-xs uppercase text-[var(--ivory)] outline-none" />
                <button type="button" aria-label={`Remove colour ${index + 1}`} onClick={() => update({ colors: fields.colors.filter((_, i) => i !== index) })} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:text-[var(--ivory)]"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => update({ colors: [...fields.colors, GOLD] })} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-control)] border border-dashed border-[var(--line-gold)] px-3 text-xs font-bold text-[var(--vg-accent)]"><Palette className="h-3.5 w-3.5" />Add colour</button>
          </div>
        </Section>

        <Section title="Fonts">
          <Field label="Fonts — comma separated"><input value={text.fonts} onChange={(event) => updateText({ fonts: event.target.value })} placeholder="Space Grotesk, Manrope" className={INPUT} /></Field>
        </Section>

        <Section title="Logos" hint="The first logo is the primary one studios place on videos.">
          {fields.logoUrls.map((logo, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-lg border border-[var(--line-2)] bg-[var(--void)]">{isUrl(logo) ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <ImageIcon className="h-4 w-4 text-[var(--faint)]" />}</span>
              <input value={logo} onChange={(event) => setLogo(index, event.target.value)} placeholder="https://…/logo.png" aria-label={index === 0 ? 'Primary logo URL' : `Logo ${index + 1} URL`} className={INPUT} inputMode="url" />
              <button type="button" aria-label={`Remove logo ${index + 1}`} onClick={() => update({ logoUrls: fields.logoUrls.filter((_, i) => i !== index) })} className="grid h-11 w-11 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--muted)] hover:text-[var(--ivory)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => update({ logoUrls: [...fields.logoUrls, ''] })} className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[var(--r-control)] border border-dashed border-[var(--line-gold)] px-3 text-xs font-bold text-[var(--vg-accent)]"><Plus className="h-3.5 w-3.5" />Add logo URL</button>
        </Section>

        <Section title="Characters & mascots" hint="Recurring people, presenters or mascots and how they look.">
          <Field label="Notes"><textarea value={fields.characters} onChange={(event) => update({ characters: event.target.value })} rows={3} placeholder="Caddy — friendly golden retriever in a green polo, always beside the golfer" className={`${INPUT} resize-y`} /></Field>
        </Section>

        <Section title="Do & don't" hint="One rule per line. Studios follow these in scripts and visuals.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Do"><textarea value={text.dos} onChange={(event) => updateText({ dos: event.target.value })} rows={4} placeholder={'Show the app on a real phone\nEnd with the download CTA'} className={`${INPUT} resize-y`} /></Field>
            <Field label="Don't"><textarea value={text.donts} onChange={(event) => updateText({ donts: event.target.value })} rows={4} placeholder={'No competitor names\nNo stock-photo smiles'} className={`${INPUT} resize-y`} /></Field>
          </div>
        </Section>

        {base?.visuals.clips?.length || base?.visuals.socialProfiles?.length ? (
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Also kept with this brand: {[base?.visuals.clips?.length ? `${base.visuals.clips.length} founder clip${base.visuals.clips.length === 1 ? '' : 's'}` : '', base?.visuals.socialProfiles?.length ? `${base.visuals.socialProfiles.length} social profile${base.visuals.socialProfiles.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}.</p>
        ) : null}
      </div>

      <footer className="flex flex-none flex-wrap items-center gap-3 border-t border-[var(--line)] bg-[var(--ash)] px-5 py-3">
        <span role="status" className={`min-w-0 flex-1 text-xs ${failure ? 'text-[var(--vg-danger)]' : 'text-[var(--muted)]'}`}>
          {failure || notice || (dirty ? 'Unsaved changes' : base ? 'Saved — in use by Verger and every studio' : 'Not saved yet')}
        </span>
        <button type="button" onClick={() => void persist(false)} disabled={saving || !dirty} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-control)] bg-[var(--vg-btn)] px-5 text-sm font-bold text-[var(--vg-on-btn)] hover:bg-[var(--vg-btn-hover)] active:bg-[var(--vg-btn-pressed)] shadow-[0_10px_28px_color-mix(in_srgb,var(--gold)_18%,transparent)] disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}{saving ? 'Saving…' : 'Save Brand doc'}</button>
      </footer>
    </div>
  );
}
