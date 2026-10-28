import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, Play, RefreshCw, RotateCcw, Save, ShieldCheck, X } from 'lucide-react';
import { campaignContextClient, type CampaignSummary, type CampaignVideo, type CampaignVideoSet } from '../../lib/campaignContext';

const api = campaignContextClient('ads-studio');
const C = {
  bg: 'var(--vg-bg)', panel: 'var(--vg-surface)', raised: 'var(--vg-raised)', border: 'var(--vg-border)', strong: 'var(--vg-control-border)',
  text: 'var(--vg-text)', muted: 'var(--vg-muted)', secondary: 'var(--vg-secondary)', accent: 'var(--vg-accent)', on: 'var(--vg-on-accent)',
  good: 'var(--vg-success)', bad: 'var(--vg-danger)', warn: 'var(--vg-warning)',
};
const card: CSSProperties = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
const input: CSSProperties = { minHeight: 44, width: '100%', color: C.text, background: C.bg, border: `1px solid ${C.strong}`, borderRadius: 10, padding: '10px 12px', font: 'inherit' };
const button = (primary = false): CSSProperties => ({ minHeight: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, border: primary ? 'none' : `1px solid ${C.strong}`, background: primary ? 'var(--vg-gradient-action)' : C.raised, color: primary ? C.on : C.text, padding: '9px 13px', fontWeight: 750, cursor: 'pointer' });
function asList(value: any): any[] { return Array.isArray(value) ? value : []; }
function statusColor(value: string) { return value === 'complete' ? C.good : value === 'failed' || value === 'partial' ? C.bad : value === 'awaiting_approval' ? C.warn : C.accent; }
function Pill({ children, color = C.secondary }: { children: ReactNode; color?: string }) { return <span style={{ color, border: `1px solid color-mix(in srgb,${color} 45%,transparent)`, background: `color-mix(in srgb,${color} 10%,transparent)`, borderRadius: 999, padding: '3px 8px', fontSize: 10.5, fontWeight: 800 }}>{children}</span>; }

export default function CampaignContextView({ onBack }: { onBack: () => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [sets, setSets] = useState<CampaignVideoSet[]>([]);
  const [setDetails, setSetDetails] = useState<Record<string, CampaignVideo[]>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [comparisonId, setComparisonId] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [claim, setClaim] = useState('');
  const [pack, setPack] = useState({ name: 'Competitor comparison pack', packType: 'competitor-comparison', videoCount: 2, platform: 'Instagram Reels', aspectRatio: '9:16' as const, durationSec: 15, style: 'confident, evidence-led', budgetCap: 30 });

  const load = useCallback(async (preferId?: string) => {
    const listed = await api.listCampaigns();
    setCampaigns(listed.campaigns || []);
    const id = preferId || selectedId || listed.campaigns?.[0]?.campaign_id || '';
    if (!id) { setSelectedId(''); setDetail(null); setSets([]); return; }
    setSelectedId(id);
    const [campaign, packs] = await Promise.all([api.getCampaign(id), api.listSets(id)]);
    setDetail(campaign); setSets(packs.sets || []);
    setBrandUrl(String(campaign.context?.brand_profile?.source_url || campaign.context?.master_brief?.brand_url || ''));
    const details = await Promise.all((packs.sets || []).map(async (item) => {
      try { const full = await api.getSet(item.set_id); return [item.set_id, full.videos || []] as const; }
      catch { return [item.set_id, []] as const; }
    }));
    setSetDetails(Object.fromEntries(details));
  }, [selectedId]);

  useEffect(() => { setBusy('load'); load().catch((e) => setError(String(e?.message || e))).finally(() => setBusy('')); }, []);
  const active = useMemo(() => sets.some((item) => !['complete', 'partial', 'failed', 'cancelled', 'awaiting_approval'].includes(item.status)), [sets]);
  useEffect(() => {
    if (!selectedId || !active) return;
    const timer = window.setInterval(() => { void load(selectedId); }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedId, active, load]);

  async function run(name: string, work: () => Promise<any>, reloadId?: string) {
    setBusy(name); setError('');
    try { const result = await work(); await load(reloadId || result?.campaign_id || selectedId); return result; }
    catch (e: any) { setError(String(e?.message || e)); return null; }
    finally { setBusy(''); }
  }
  const context = detail?.context || {};
  const findings = asList(context.findings);
  const scripts = asList(context.master_scripts);

  return <div style={{ minHeight: '100%', background: C.bg, color: C.text, padding: '18px clamp(14px,3vw,28px) 110px', fontFamily: 'var(--space-font-body,Manrope,sans-serif)' }}>
    <style>{`@media(max-width:820px){.vc-grid{grid-template-columns:1fr!important}.vc-sidebar{position:static!important}.vc-form{grid-template-columns:1fr!important}.vc-actions{width:100%}}`}</style>
    <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ flex: 1, minWidth: 260 }}><Pill color={C.accent}>Canonical Campaign Context</Pill><h1 style={{ margin: '10px 0 5px', fontSize: 24 }}>Analyze once. Produce many version-pinned video sets.</h1><p style={{ margin: 0, color: C.muted, lineHeight: 1.55, fontSize: 13 }}>Research, claims, scripts, clips and final renders persist server-side. Every set keeps the exact context and script version it used.</p></div>
      <button style={button()} onClick={onBack}>← Discover &amp; Research</button>
    </header>
    {error ? <div role="alert" style={{ ...card, borderColor: C.bad, color: C.bad, marginBottom: 14, display: 'flex', gap: 8 }}><AlertTriangle size={16} />{error}<button aria-label="Dismiss" onClick={() => setError('')} style={{ marginLeft: 'auto', border: 0, color: C.bad, background: 'none' }}><X size={14} /></button></div> : null}

    <div className="vc-grid" style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <aside className="vc-sidebar" style={{ ...card, position: 'sticky', top: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}><b>Campaigns</b><button aria-label="Refresh campaigns" onClick={() => void load()} style={{ border: 0, background: 'none', color: C.accent, cursor: 'pointer' }}><RefreshCw size={14} /></button></div>
        {busy === 'load' ? <div style={{ color: C.muted, display: 'flex', gap: 7 }}><Loader2 size={14} className="animate-spin" />Loading…</div> : null}
        {campaigns.map((item) => <button key={item.campaign_id} onClick={() => { setSelectedId(item.campaign_id); void run('select', () => api.getCampaign(item.campaign_id), item.campaign_id); }} style={{ width: '100%', textAlign: 'left', marginBottom: 6, padding: 10, borderRadius: 9, border: `1px solid ${selectedId === item.campaign_id ? C.accent : C.border}`, background: selectedId === item.campaign_id ? 'color-mix(in srgb,var(--vg-accent) 9%,transparent)' : C.raised, color: C.text, cursor: 'pointer' }}><b style={{ display: 'block', fontSize: 12.5 }}>{item.name}</b><span style={{ color: C.muted, fontSize: 10.5 }}>Context v{item.current_context_version} · {item.status}</span></button>)}
        {!campaigns.length && busy !== 'load' ? <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>No campaign yet. Import a saved Vergeye comparison or analyze one public brand URL.</p> : null}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: 'grid', gap: 8 }}>
          <label style={{ color: C.muted, fontSize: 11 }}>Existing Vergeye comparison ID<input style={{ ...input, marginTop: 5 }} value={comparisonId} onChange={(e) => setComparisonId(e.target.value)} placeholder="e.g. 6" /></label>
          <button disabled={!comparisonId || !!busy} style={button(true)} onClick={() => void run('import', () => api.importFromVergeye(Number(comparisonId)))}>{busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Import once</button>
          <label style={{ color: C.muted, fontSize: 11 }}>Or public brand URL<input style={{ ...input, marginTop: 5 }} value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} placeholder="https://brand.com" /></label>
          <button disabled={!brandUrl || !!busy} style={button()} onClick={() => void run('analyze', () => api.analyze(brandUrl))}>{busy === 'analyze' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Analyze &amp; save v1</button>
        </div>
      </aside>

      <main style={{ minWidth: 0, display: 'grid', gap: 14 }}>
        {!detail ? <div style={{ ...card, color: C.muted }}>Choose or create a campaign to inspect its canonical context.</div> : <>
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 19 }}>{detail.campaign.name}</h2><Pill color={C.good}>Context v{detail.context_version}</Pill><Pill>{detail.context_hash}</Pill>{detail.campaign.source_comparison_id ? <Pill color={C.accent}>Vergeye #{detail.campaign.source_comparison_id}</Pill> : null}</div>
            <p style={{ margin: '9px 0 0', color: C.secondary, fontSize: 12.5, lineHeight: 1.55 }}>{String(context.positioning || context.master_brief?.objective || 'Saved campaign context')}</p>
            <div className="vc-form" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginTop: 12 }}><input style={input} value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Add an approved claim to create context vNext" /><button disabled={!claim || !!busy} style={button(true)} onClick={() => void run('claim', () => api.updateContext(selectedId, { approved_claims: [...asList(context.approved_claims), { claim, approved_at: new Date().toISOString() }] }, `Approved claim: ${claim}`)).then(() => setClaim(''))}><Check size={14} />Save new version</button><button disabled={!brandUrl || !!busy} style={button()} onClick={() => void run('refresh', () => api.refreshResearch(selectedId, brandUrl, 'Explicit research refresh from Campaign Context view'))}><RefreshCw size={14} />Refresh research</button></div>
          </section>

          <section style={card}><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Saved research &amp; competitor findings</h3>{findings.length ? <div style={{ display: 'grid', gap: 8 }}>{findings.map((f, i) => <div key={`${f.kind}-${i}`} style={{ padding: 10, borderRadius: 9, background: C.raised, border: `1px solid ${C.border}` }}><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><Pill color={f.kind === 'strength' ? C.good : C.accent}>{f.kind || 'finding'}</Pill>{f.observed_at ? <span style={{ color: C.muted, fontSize: 10.5 }}>{new Date(f.observed_at).toLocaleString()}</span> : null}</div><div style={{ marginTop: 6, color: C.text, fontSize: 12.5, lineHeight: 1.5 }}>{f.claim}</div>{f.source_url ? <a href={f.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, color: C.accent, fontSize: 10.5 }}><ExternalLink size={10} />{f.source_url}</a> : null}</div>)}</div> : <div style={{ color: C.muted, fontSize: 12 }}>No structured findings were saved yet. Use Refresh research or import a completed Vergeye comparison.</div>}</section>

          <section style={card}><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Master brief &amp; approved scripts</h3><pre style={{ margin: 0, padding: 11, borderRadius: 9, background: C.bg, color: C.secondary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify(context.master_brief || {}, null, 2)}</pre>{scripts.map((s, i) => <div key={`${s.script_id}-${s.version}-${i}`} style={{ marginTop: 9, padding: 11, borderRadius: 9, background: C.raised, border: `1px solid ${C.border}` }}><div style={{ display: 'flex', gap: 7 }}><Pill color={s.approved ? C.good : C.warn}>{s.approved ? 'approved' : 'draft'}</Pill><Pill>{s.script_id} · v{s.version}</Pill></div><p style={{ margin: '8px 0 0', color: C.secondary, whiteSpace: 'pre-wrap', fontSize: 12 }}>{s.text}</p></div>)}</section>

          <section style={card}><h3 style={{ margin: '0 0 5px', fontSize: 15 }}>Create a named video set</h3><p style={{ margin: '0 0 12px', color: C.muted, fontSize: 11.5 }}>Scripts are generated from saved findings with gpt-5.6-sol. The set pins Context v{detail.context_version}; video spend waits for explicit approval.</p><div className="vc-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(150px,1fr))', gap: 8 }}><input style={input} value={pack.name} onChange={(e) => setPack({ ...pack, name: e.target.value })} aria-label="Set name" /><select style={input} value={pack.packType} onChange={(e) => setPack({ ...pack, packType: e.target.value })}><option value="competitor-comparison">Competitor comparison</option><option value="problem-solution">Problem / solution ads</option><option value="product-launch">Product launch</option><option value="short-form-social">Short-form social</option><option value="alternative-hooks">Alternative hooks</option></select><select style={input} value={pack.videoCount} onChange={(e) => setPack({ ...pack, videoCount: Number(e.target.value) })}><option value={2}>2 videos</option><option value={3}>3 videos</option><option value={4}>4 videos</option></select><select style={input} value={pack.aspectRatio} onChange={(e) => setPack({ ...pack, aspectRatio: e.target.value as any })}><option>9:16</option><option>16:9</option></select><select style={input} value={pack.durationSec} onChange={(e) => setPack({ ...pack, durationSec: Number(e.target.value) })}><option value={15}>15 seconds</option><option value={20}>20 seconds</option></select><input style={input} type="number" min={1} value={pack.budgetCap} onChange={(e) => setPack({ ...pack, budgetCap: Number(e.target.value) })} aria-label="Budget cap" /></div><button disabled={!!busy} style={{ ...button(true), marginTop: 10 }} onClick={() => void run('create-set', () => api.createSet({ campaignId: selectedId, ...pack, objective: pack.packType }))}>{busy === 'create-set' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Generate scripts &amp; estimate</button></section>

          <section style={card}><h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Video sets across apps</h3>{sets.length ? <div style={{ display: 'grid', gap: 10 }}>{sets.map((set) => <div key={set.set_id} style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: 12, background: C.raised }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><b style={{ fontSize: 13 }}>{set.name}</b><Pill color={statusColor(set.status)}>{set.status}</Pill><Pill>{set.target_app}</Pill><Pill>Context v{set.context_version}</Pill><Pill>{set.model_ids?.video_actual || set.model_ids?.video_requested || 'model pending'}</Pill></div><div style={{ marginTop: 6, color: C.muted, fontSize: 11 }}>Progress: {JSON.stringify(set.progress_json)} · estimated {set.estimated_cost} credits · actual {set.actual_cost}</div><div className="vc-actions" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>{set.status === 'awaiting_approval' ? <button style={button(true)} disabled={!!busy} onClick={() => void run(`approve-${set.set_id}`, () => api.approveSpend(set.set_id))}><ShieldCheck size={13} />Approve spend</button> : null}{['partial','failed'].includes(set.status) ? <button style={button()} disabled={!!busy} onClick={() => void run(`retry-${set.set_id}`, () => api.retrySet(set.set_id))}><RotateCcw size={13} />Retry failed stages</button> : null}{!['complete','partial','failed','cancelled'].includes(set.status) ? <button style={button()} disabled={!!busy} onClick={() => void run(`cancel-${set.set_id}`, () => api.cancelSet(set.set_id))}><X size={13} />Cancel future work</button> : null}</div>{(setDetails[set.set_id] || []).map((video) => <div key={video.video_id} style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.border}` }}><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><Pill>#{video.ordinal + 1}</Pill><Pill color={statusColor(video.status)}>{video.status} · {video.stage}</Pill><Pill>{video.creative_angle}</Pill><Pill>script v{video.script_version}</Pill></div><b style={{ display: 'block', marginTop: 6, fontSize: 12.5 }}>{video.hook}</b><p style={{ margin: '5px 0', color: C.secondary, whiteSpace: 'pre-wrap', fontSize: 11.5 }}>{video.script_text}</p>{video.render_record?.final_url ? <video src={video.render_record.final_url} controls preload="metadata" style={{ width: 'min(100%,420px)', maxHeight: 320, borderRadius: 9, background: '#000' }} /> : null}{video.error_json ? <div style={{ color: C.bad, fontSize: 11 }}>{JSON.stringify(video.error_json)}</div> : null}{video.status === 'failed' ? <button style={{ ...button(), marginTop: 6 }} disabled={!!busy} onClick={() => void run(`retry-video-${video.video_id}`, () => api.retryVideo(video.video_id))}><RotateCcw size={12} />Retry this video only</button> : null}</div>)}</div>)}</div> : <div style={{ color: C.muted, fontSize: 12 }}>No sets yet. Create one above; progress resumes from the server after a reload.</div>}</section>
        </>}
      </main>
    </div>
  </div>;
}
