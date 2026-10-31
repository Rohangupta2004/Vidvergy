import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Loader2, Sparkles, Wand2 } from 'lucide-react';
import ResearchLibrary from '../../../components/ResearchLibrary';
import { brandToContextText, getDefaultBrand, useBrandKit } from '../../../components/brandKitStore';
import { buildOriginalUgcRecreation, generateThreeUgcVariants, type ResearchItem, type UgcRecreation } from '../../../lib/researchLibrary';
import type { UgcActor } from '../../../lib/engines/ugc';

const box = 'rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)]';
const field = 'w-full rounded-xl border border-[var(--space-border-strong)] bg-[var(--space-surface-bg)] p-3 text-sm text-[var(--space-text-primary)] outline-none focus:border-[var(--space-brand-primary-500)]';
function actorId(actor: UgcActor): string { return String(actor.actor_key || actor.id); }
function actorReady(actor: UgcActor): boolean { return ['approved', 'provisional'].includes(String(actor.status || '')) && Boolean((actor.stills || []).length); }

export default function RecreatePanel({ actors, selectedActor, onAdopt, onClose }: {
  actors: UgcActor[];
  selectedActor: UgcActor | null;
  onAdopt: (input: { item: ResearchItem; brief: UgcRecreation; actor: UgcActor | null; product: string }) => void;
  onClose: () => void;
}) {
  const { document: brandKit } = useBrandKit();
  const brand = getDefaultBrand(brandKit);
  const brandContext = brand ? brandToContextText(brand) : '';
  const [item, setItem] = useState<ResearchItem | null>(null);
  const [brief, setBrief] = useState<UgcRecreation | null>(null);
  const [variants, setVariants] = useState<UgcRecreation[]>([]);
  const [actorKey, setActorKey] = useState(selectedActor ? actorId(selectedActor) : '');
  const [product, setProduct] = useState(brand ? `${brand.identity.businessName}: ${brand.offer.summary}` : '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const readyActors = useMemo(() => actors.filter(actorReady), [actors]);

  async function chooseSource(selected: ResearchItem) {
    setItem(selected); setBusy('adapt'); setError(''); setVariants([]);
    try {
      const adapted = await buildOriginalUgcRecreation(selected, brandContext, product || brand?.offer.summary || '', 15);
      setBrief(adapted);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  function patchBrief(patch: Partial<UgcRecreation>) { setBrief((current) => current ? { ...current, ...patch } : current); }
  function patchScene(index: number, patch: Partial<UgcRecreation['scenes'][number]>) { setBrief((current) => current ? { ...current, scenes: current.scenes.map((scene, sceneIndex) => sceneIndex === index ? { ...scene, ...patch } : scene) } : current); }

  async function makeVariants() {
    if (!item || !brief) return;
    setBusy('variants'); setError('');
    try { setVariants(await generateThreeUgcVariants(item, brief, brandContext, product)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(''); }
  }

  const chosenActor = readyActors.find((actor) => actorId(actor) === actorKey) || selectedActor;
  if (!brief) return <div><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[var(--space-text-brand)]">Original structure adaptation</p><h1 className="mt-1 text-2xl font-bold">Recreate top performer</h1><p className="mt-2 max-w-2xl text-sm text-[var(--space-text-secondary)]">Pick saved public evidence or run research first. UGC Studio extracts structure and pacing, then writes original copy for your product.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-[var(--space-border-strong)] px-4 py-2 text-sm font-bold">Back to studio</button></div>{error && <div className="mb-4 flex gap-2 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-4 text-sm text-[var(--vg-danger)]"><AlertCircle size={18}/>{error}</div>}{busy === 'adapt' && <div className={`${box} mb-4 flex items-center gap-3 p-5 text-sm text-[var(--space-text-secondary)]`}><Loader2 className="animate-spin text-[var(--space-text-brand)]"/>Extracting the hook, script structure, pacing and format, then adapting them with original copy…</div>}<ResearchLibrary title="Choose source evidence" subtitle="Saved topics are shared with Vergeye Ads Studio. Repeated topics load from the library without scraping again." actionLabel="Recreate top performer" onUseItem={(selected) => void chooseSource(selected)}/></div>;

  return <div className="mx-auto max-w-6xl p-4 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[var(--space-text-brand)]">Source: {item?.platform} · structure only</p><h1 className="mt-1 text-2xl font-bold">Recreate top performer</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--space-text-secondary)]">Everything below is editable. Competitor footage, branding, names and exact wording are excluded.</p></div><button type="button" onClick={() => { setBrief(null); setItem(null); }} className="rounded-xl border border-[var(--space-border-strong)] px-4 py-2 text-sm font-bold">Change source</button></div>
    {error && <div className="mt-4 flex gap-2 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-4 text-sm text-[var(--vg-danger)]"><AlertCircle size={18}/>{error}</div>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className={`${box} p-4 sm:p-6`}><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">Your brand / product</span><textarea value={product} onChange={(event) => setProduct(event.target.value)} rows={3} className={field} placeholder="Describe your product and only claims you can support"/></label><label><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">Hook</span><textarea value={brief.hook} onChange={(event) => patchBrief({ hook: event.target.value })} rows={3} className={field}/></label><label><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">CTA</span><textarea value={brief.cta} onChange={(event) => patchBrief({ cta: event.target.value })} rows={3} className={field}/></label><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">Editable full script</span><textarea value={brief.script} onChange={(event) => patchBrief({ script: event.target.value })} rows={5} className={field}/></label><label><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">Format</span><select value={brief.format} onChange={(event) => patchBrief({ format: event.target.value })} className={field}><option value="talking-camera">Talking to camera</option><option value="demo">Demo</option><option value="unboxing">Unboxing</option><option value="before-after">Before → after</option><option value="problem-solution">Problem → solution</option></select></label><label><span className="mb-2 block text-xs font-bold text-[var(--space-text-secondary)]">Length · {brief.length}s</span><input type="range" min={4} max={30} value={brief.length} onChange={(event) => patchBrief({ length: Number(event.target.value) })} className="mt-3 w-full accent-[var(--space-brand-primary-500)]"/></label></div>
        <div className="mt-6"><div className="flex items-center justify-between"><h2 className="font-bold">Scene-by-scene script</h2><span className="text-xs text-[var(--space-text-muted)]">{brief.pacing}</span></div><div className="mt-3 space-y-3">{brief.scenes.map((scene, index) => <article key={index} className="rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-4"><div className="grid gap-3 sm:grid-cols-[120px_100px_1fr]"><select value={scene.role} onChange={(event) => patchScene(index, { role: event.target.value as any })} className={field}><option value="hook">Hook</option><option value="demo">Demo</option><option value="proof">Proof</option><option value="cta">CTA</option></select><input type="number" min={4} max={15} value={scene.duration} onChange={(event) => patchScene(index, { duration: Number(event.target.value) })} className={field}/><input value={scene.action} onChange={(event) => patchScene(index, { action: event.target.value })} className={field} placeholder="Actor action"/></div><textarea value={scene.line} onChange={(event) => patchScene(index, { line: event.target.value })} rows={2} className={`${field} mt-3`} placeholder="Original spoken line"/></article>)}</div></div>
      </section>
      <aside className="space-y-4"><section className={`${box} p-4`}><h2 className="font-bold">Actor</h2><select value={actorKey} onChange={(event) => setActorKey(event.target.value)} className={`${field} mt-3`}><option value="">Choose a ready actor</option>{readyActors.map((actor) => <option key={actorId(actor)} value={actorId(actor)}>{actor.name} · {actor.persona}</option>)}</select><p className="mt-3 text-xs leading-5 text-[var(--space-text-muted)]">The selected actor and product flow into the existing UGC generation pipeline unchanged.</p></section><section className={`${box} p-4`}><h2 className="font-bold">Source structure</h2><ol className="mt-3 space-y-2 text-sm text-[var(--space-text-secondary)]">{brief.sourceStructure.map((line, index) => <li key={index}>{index + 1}. {line}</li>)}</ol></section><button type="button" disabled={Boolean(busy)} onClick={() => void makeVariants()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--space-brand-primary-500)] bg-[var(--space-surface-accent-soft)] px-4 font-bold text-[var(--space-text-brand)] disabled:opacity-45">{busy === 'variants' ? <Loader2 size={17} className="animate-spin"/> : <Sparkles size={17}/>}Generate 3 variants</button><button type="button" disabled={!chosenActor || !product.trim() || brief.scenes.some((scene) => !scene.line.trim())} onClick={() => item && onAdopt({ item, brief, actor: chosenActor || null, product })} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-4 font-bold text-[var(--vg-on-accent)] disabled:opacity-45"><Wand2 size={17}/>Continue to product & generation<ArrowRight size={16}/></button></aside>
    </div>
    {variants.length > 0 && <section className="mt-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Three original hooks</h2><span className="text-xs text-[var(--space-text-muted)]">Choose one to keep editing</span></div><div className="mt-3 grid gap-3 md:grid-cols-3">{variants.map((variant, index) => <button key={index} type="button" onClick={() => setBrief(variant)} className={`${box} p-4 text-left transition hover:border-[var(--space-brand-primary-500)]`}><div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-[var(--space-text-brand)]">Variant {index + 1}</span>{brief.hook === variant.hook && <Check size={15} className="text-[var(--vg-success)]"/>}</div><p className="mt-3 font-bold leading-6">{variant.hook}</p><p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--space-text-secondary)]">{variant.script}</p></button>)}</div></section>}
  </div>;
}
