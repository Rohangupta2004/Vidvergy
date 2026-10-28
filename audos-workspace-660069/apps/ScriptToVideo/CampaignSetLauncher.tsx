import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Film, Loader2, RefreshCw } from 'lucide-react';
import { campaignContextClient, type CampaignSummary, type CampaignVideo, type CampaignVideoSet } from '../../lib/campaignContext';
import { T } from './api';

const api = campaignContextClient('script-to-video');
const control: CSSProperties = { minHeight: 44, borderRadius: 9, border: `1px solid ${T.dim}`, background: T.canvas, color: T.bone, padding: '9px 11px', font: 'inherit' };
const action: CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 0, borderRadius: 9, padding: '9px 14px', background: 'var(--vg-gradient-action)', color: 'var(--vg-on-accent)', fontWeight: 800, cursor: 'pointer' };

export default function CampaignSetLauncher({ onUseScript }: { onUseScript: (script: string) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [contextMeta, setContextMeta] = useState<{ version: number; hash: string } | null>(null);
  const [sets, setSets] = useState<CampaignVideoSet[]>([]);
  const [videos, setVideos] = useState<Record<string, CampaignVideo[]>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = async (preferred?: string) => {
    const listed = await api.listCampaigns();
    setCampaigns(listed.campaigns || []);
    const id = preferred || campaignId || listed.campaigns?.[0]?.campaign_id || '';
    setCampaignId(id);
    if (!id) { setSets([]); setContextMeta(null); return; }
    const [context, packs] = await Promise.all([
      api.getContextFields(id, ['brand_profile', 'differentiators', 'pain_points', 'approved_claims', 'forbidden_claims', 'master_brief', 'master_scripts']),
      api.listSets(id),
    ]);
    setContextMeta({ version: context.context_version, hash: context.context_hash });
    const mine = (packs.sets || []).filter((item) => item.target_app === 'script-to-video');
    setSets(mine);
    const rows = await Promise.all(mine.map(async (item) => {
      try { const full = await api.getSet(item.set_id); return [item.set_id, full.videos || []] as const; }
      catch { return [item.set_id, []] as const; }
    }));
    setVideos(Object.fromEntries(rows));
  };

  useEffect(() => { setBusy('load'); refresh().catch((e) => setError(String(e?.message || e))).finally(() => setBusy('')); }, []);
  useEffect(() => {
    if (!sets.some((set) => !['complete', 'partial', 'failed', 'cancelled', 'awaiting_approval'].includes(set.status))) return;
    const timer = window.setInterval(() => { void refresh(campaignId); }, 5000);
    return () => window.clearInterval(timer);
  }, [campaignId, sets.map((set) => `${set.set_id}:${set.status}`).join('|')]);

  async function createSet() {
    if (!campaignId || busy) return;
    setBusy('create'); setError('');
    try {
      await api.createSet({ campaignId, packType: 'short-form-social', objective: 'Short-form social and product launch variants', name: 'Script-to-Video social pack', videoCount: 2, platform: 'TikTok / Reels', aspectRatio: '9:16', durationSec: 15, style: 'cinematic, direct, brand-consistent', budgetCap: 30 });
      await refresh(campaignId);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(''); }
  }

  return <section style={{ maxWidth: 1100, margin: '0 auto', background: T.raised, border: `1px solid ${T.dim}`, borderRadius: 14, padding: 16 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'color-mix(in srgb,var(--vg-accent) 13%,transparent)', color: T.live }}><Film size={17} /></span>
      <div style={{ flex: 1, minWidth: 240 }}><b style={{ display: 'block', color: T.bone, fontSize: 14 }}>Create from Campaign Context</b><span style={{ color: T.muted, fontSize: 11.5, lineHeight: 1.5 }}>Fetch the same server-side research used by Ads Studio, pin its hash/version, then create a separate short-form pack for this workflow.</span></div>
      <button aria-label="Refresh campaign sets" onClick={() => void refresh(campaignId)} style={{ ...control, width: 44, padding: 0, cursor: 'pointer' }}><RefreshCw size={14} /></button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) auto', gap: 8, marginTop: 12 }}>
      <select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); void refresh(e.target.value); }} style={control} aria-label="Campaign Context">{!campaigns.length ? <option value="">No campaigns available</option> : null}{campaigns.map((item) => <option key={item.campaign_id} value={item.campaign_id}>{item.name} · context v{item.current_context_version}</option>)}</select>
      <button disabled={!campaignId || !!busy} onClick={() => void createSet()} style={{ ...action, opacity: !campaignId || busy ? .55 : 1 }}>{busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}Generate 2 scripts &amp; estimate</button>
    </div>
    {contextMeta ? <div style={{ marginTop: 8, color: T.muted, fontFamily: T.mono, fontSize: 10.5 }}>Shared context v{contextMeta.version} · {contextMeta.hash}</div> : null}
    {error ? <div role="alert" style={{ marginTop: 9, color: T.fault, fontSize: 11.5 }}>{error}</div> : null}
    {sets.map((set) => <div key={set.set_id} style={{ marginTop: 10, padding: 11, borderRadius: 10, border: `1px solid ${T.line}`, background: T.canvas }}><div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ color: T.bone, fontSize: 12 }}>{set.name}</b><span style={{ color: set.status === 'complete' ? T.done : set.status === 'failed' ? T.fault : T.live, fontSize: 10.5, fontWeight: 800 }}>{set.status}</span><span style={{ color: T.muted, fontSize: 10.5 }}>Context v{set.context_version} · {set.requested_video_count} videos</span></div>{set.status === 'awaiting_approval' ? <button style={{ ...action, marginTop: 8 }} onClick={async () => { setBusy('approve'); setError(''); try { await api.approveSpend(set.set_id); await refresh(campaignId); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } }}><Check size={13} />Approve {set.estimated_cost} credit estimate</button> : null}{(videos[set.set_id] || []).map((video) => <div key={video.video_id} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}><div style={{ color: T.bone, fontSize: 11.5, fontWeight: 750 }}>{video.creative_angle}: {video.hook}</div><div style={{ color: T.muted, fontSize: 10.5, marginTop: 3 }}>Script v{video.script_version} · context v{video.context_version} · {video.status}</div><button onClick={() => onUseScript(video.script_text)} style={{ ...control, marginTop: 6, cursor: 'pointer', color: T.live }}>Use this approved script in a new film</button></div>)}</div>)}
  </section>;
}
