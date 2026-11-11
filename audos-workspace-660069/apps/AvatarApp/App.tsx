import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, Bot, Boxes, CheckCircle2, Clapperboard, Download, Languages, Layers3, Loader2, Music2, Palette, Play, RefreshCw, Scissors, Sparkles, TerminalSquare, UserRound, Video } from 'lucide-react';
import { COLORS, FONT, GRADIENT, RADIUS } from '../../components/theme';
import CreditBalance from '../../components/CreditBalance';
import { authorizeCredits, getCachedCredits, newChargeKey, refundCredits } from '../../lib/credits';
import { type ForgeAvatar } from '../SceneForge/lib/forgeTypes';
import { bundleAvatars } from '../SceneForge/lib/forgeClient';
import { FORGE_STYLES } from '../SceneForge/lib/stylePresets';
import { avatarApi, buildHyperframesComposition, directorTurn, estimateCredits, heygen, HEYGEN_ENDPOINTS, listPage, pollVideo, probeHeygen, renderHyperframes, resolveEngine, validateVoice } from './lib/avatarApi';
import { AUDIO_TYPE_NOTES, BATCH_TYPE_NOTES, ENGINE_NOTES, EXPORT_FORMAT_NOTES, FORMAT_NOTES, HELPER, MODE_NOTES, OptionThumb, previewFor, TRANSLATE_MODE_NOTES } from './optionPreviews';

type Tab = 'create' | 'compose' | 'director' | 'library' | 'translate' | 'batch' | 'brand' | 'tools' | 'api';
type Connection = 'checking' | 'ready' | 'error';
type PickedLook = { id: string; voiceId: string; nonce: number };
type Message = { role: 'user' | 'assistant'; content: string };

const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: 'create', label: 'Create', icon: Video }, { id: 'compose', label: 'HyperFrames', icon: Layers3 },
  { id: 'director', label: 'Director', icon: Bot }, { id: 'library', label: 'Avatars', icon: UserRound },
  { id: 'translate', label: 'Translate', icon: Languages }, { id: 'batch', label: 'Batches', icon: Boxes },
  { id: 'brand', label: 'Brand', icon: Palette }, { id: 'tools', label: 'Tools', icon: Scissors },
  { id: 'api', label: 'API Console', icon: TerminalSquare },
];
const FORMATS = { '9:16': { width: 1080, height: 1920 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1920, height: 1080 } } as const;
const inputStyle: CSSProperties = { background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, fontFamily: FONT.body, fontSize: 13.5, minHeight: 44, padding: '0 11px', width: '100%' };
const labelStyle: CSSProperties = { color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 6 };
const noteStyle: CSSProperties = { color: COLORS.muted, fontFamily: FONT.body, fontSize: 11.5, fontWeight: 400, lineHeight: '16px' };
const formatThumbStyle: CSSProperties = { height: 90, justifySelf: 'start', maxWidth: '100%', width: 'auto' };
const cardStyle: CSSProperties = { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 16 };
const primary: CSSProperties = { alignItems: 'center', background: GRADIENT.action, border: 0, borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: 'pointer', display: 'inline-flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 800, gap: 8, justifyContent: 'center', minHeight: 44, padding: '0 16px' };
const secondary: CSSProperties = { ...primary, background: COLORS.raised, border: `1px solid ${COLORS.border}`, color: COLORS.secondary };

function json(value: unknown) { return JSON.stringify(value, null, 2); }
function unwrap(value: any) { return value?.data ?? value; }

export default function App() {
  const [tab, setTab] = useState<Tab>('create');
  const [connection, setConnection] = useState<Connection>('checking');
  const [picked, setPicked] = useState<PickedLook | null>(null);
  const [globalError, setGlobalError] = useState('');
  const [busy, setBusy] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);

  const checkConnection = async () => {
    setConnection('checking'); setGlobalError('');
    try { await probeHeygen(); setConnection('ready'); }
    catch (error: any) { setConnection('error'); setGlobalError(String(error?.message || error)); }
  };
  useEffect(() => { void checkConnection(); }, []);

  const shell: CSSProperties = { background: COLORS.bg, color: COLORS.text, fontFamily: FONT.body, minHeight: '100%', padding: '18px clamp(12px, 3vw, 28px) 48px' };
  return <div style={shell}>
    <header style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <span style={{ color: COLORS.muted, fontSize: 12.5, fontWeight: 600 }}>HeyGen v3 production · HyperFrames finishing · one secure workspace connection</span>
      <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginLeft: 'auto' }}>{connection !== 'error' ? <ConnectionPill state={connection} /> : null}<CreditBalance variant="chrome" /></div>
    </header>

    {connection !== 'ready' ? <div role="alert" style={{ ...cardStyle, alignItems: 'flex-start', background: connection === 'checking' ? COLORS.surface : COLORS.warningBg, borderColor: connection === 'checking' ? COLORS.border : COLORS.warning, display: 'flex', gap: 10, marginBottom: 14 }}>
      {connection === 'checking' ? <Loader2 size={17} className="animate-spin" /> : <AlertTriangle size={17} color={COLORS.warning} />}
      <div style={{ flex: 1 }}><strong style={{ display: 'block', fontFamily: FONT.heading, fontSize: 13.5 }}>{connection === 'checking' ? 'Checking HeyGen connection…' : 'HeyGen is unavailable right now'}</strong><span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, lineHeight: '18px', marginTop: 3 }}>{globalError || 'Reaching HeyGen through the Audos workspace connection.'}</span></div>
      {connection !== 'checking' ? <button type="button" onClick={checkConnection} style={secondary}><RefreshCw size={14} /> Retry</button> : null}
    </div> : null}

    <nav aria-label="Avatar App sections" style={{ display: 'flex', gap: 6, marginBottom: 18, overflowX: 'auto', paddingBottom: 4 }}>
      {TABS.map((item) => { const Icon = item.icon; const selected = tab === item.id; return <button key={item.id} type="button" onClick={() => setTab(item.id)} style={{ alignItems: 'center', background: selected ? COLORS.accentSoft : COLORS.surface, border: `1px solid ${selected ? COLORS.accent : COLORS.border}`, borderRadius: 999, color: selected ? COLORS.accent : COLORS.secondary, cursor: 'pointer', display: 'flex', flex: '0 0 auto', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 6, minHeight: 40, padding: '0 13px' }}><Icon size={14} />{item.label}</button>; })}
    </nav>

    {globalError && connection === 'ready' ? <div role="alert" style={{ background: COLORS.dangerBg, border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.danger, fontSize: 13, marginBottom: 14, padding: 10 }}>{globalError}</div> : null}
    {tab === 'create' ? <CreateStudio connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} picked={picked} result={lastResult} /> : null}
    {tab === 'compose' ? <Composer connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {tab === 'director' ? <Director /> : null}
    {tab === 'library' ? <AvatarLibrary connection={connection} onUse={(look) => { setPicked({ ...look, nonce: Date.now() }); setTab('create'); }} /> : null}
    {tab === 'translate' ? <Translate connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {tab === 'batch' ? <BatchPanel connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {tab === 'brand' ? <BrandPanel connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {tab === 'tools' ? <ToolsPanel connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {tab === 'api' ? <ApiConsole connection={connection} busy={busy} setBusy={setBusy} setError={setGlobalError} setResult={setLastResult} /> : null}
    {lastResult ? <ResultPanel value={lastResult} onClose={() => setLastResult(null)} /> : null}
  </div>;
}

function ConnectionPill({ state }: { state: Connection }) {
  const okay = state === 'ready';
  return <span style={{ alignItems: 'center', background: okay ? COLORS.successBg : COLORS.raised, border: `1px solid ${okay ? COLORS.success : COLORS.border}`, borderRadius: 999, color: okay ? COLORS.success : COLORS.muted, display: 'flex', fontSize: 11.5, gap: 6, minHeight: 30, padding: '0 9px' }}>{okay ? <CheckCircle2 size={13} /> : state === 'checking' ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}{okay ? 'HeyGen connected' : 'Checking HeyGen…'}</span>;
}

const AV2_CSS = `
.av2{--av-hue:var(--hue,#d08a4a);--av-line:color-mix(in srgb,var(--vg-border) 80%,transparent)}
.av2-ws{display:grid;grid-template-columns:minmax(320px,400px) minmax(0,1fr) minmax(240px,290px);gap:12px;align-items:start}
.av2-panel{background:linear-gradient(180deg,var(--vg-raised),var(--vg-surface));border:1px solid var(--av-line);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
.av2-stage{position:relative;min-height:460px;border-radius:22px;border:1px solid var(--av-line);background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;overflow:hidden}
.av2-stage::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 100% 0%,color-mix(in srgb,var(--av-hue) 16%,transparent),transparent 70%);pointer-events:none}
.av2-stage>*{position:relative}
.av2-frame{max-height:62vh;border-radius:14px;border:1px solid rgba(255,225,160,.18);background:radial-gradient(80% 60% at 50% 30%,rgba(255,232,180,.08),transparent 70%),#0a0805;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;box-shadow:0 30px 80px rgba(0,0,0,.7)}
.av2-frame.has-img{align-items:flex-end}
.av2-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.av2-frame-copy{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:18px 16px;color:#fbf4e2;width:100%;box-sizing:border-box}
.av2-frame.has-img .av2-frame-copy{background:linear-gradient(180deg,transparent,rgba(0,0,0,.82))}
.av2-frame-copy b{font-family:var(--display);font-size:18px;letter-spacing:-.02em}
.av2-frame-copy span{font-size:12.5px;line-height:1.5;color:rgba(251,244,226,.74);max-width:340px}
.av2-video{max-height:62vh;border-radius:14px;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.7)}
.av2-meta{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.av2-meta span{font-family:'Geist Mono',ui-monospace,monospace;font-size:11px;color:rgba(251,244,226,.75);padding:4px 9px;border-radius:999px;border:1px solid rgba(255,225,160,.18);background:rgba(255,232,180,.06)}
.av2-eyebrow{font-size:12.5px;font-weight:600;color:var(--vg-muted)}
.av2-big{display:flex;align-items:baseline;gap:8px}
.av2-big b{font-family:var(--display);font-size:40px;letter-spacing:-.03em;line-height:1;color:var(--vg-text)}
.av2-big span{color:var(--vg-muted);font-size:13px}
.av2-kv{display:flex;flex-direction:column}
.av2-kv div{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--av-line)}
.av2-kv div:last-child{border-bottom:0}
.av2-kv span{color:var(--vg-muted)}
.av2-kv b{font-weight:600;text-align:right}
.av2-gold{display:inline-flex;min-height:52px;width:100%;align-items:center;justify-content:center;gap:8px;padding:0 22px;font-family:var(--display);font-size:15px;font-weight:700;background:linear-gradient(135deg,#ffefb8 0%,#f2c14a 42%,#c48a12 100%);color:#1a1200;border:0;border-radius:999px;cursor:pointer;box-shadow:0 0 0 1px rgba(255,222,140,.4),0 10px 38px rgba(242,193,74,.3),inset 0 1px 0 rgba(255,255,255,.6);transition:box-shadow .2s ease,transform .15s ease}
.av2-gold:hover{box-shadow:0 0 0 1px rgba(255,230,150,.6),0 12px 44px rgba(242,193,74,.46),inset 0 1px 0 rgba(255,255,255,.7)}
.av2-gold:active{transform:scale(.98)}
.av2-gold:disabled{cursor:not-allowed}
.av2-gold:focus-visible{outline:2px solid var(--vg-focus);outline-offset:3px}
@media(max-width:1180px){.av2-ws{grid-template-columns:minmax(300px,380px) minmax(0,1fr)}.av2-ws>aside{grid-column:1/-1}}
@media(max-width:820px){.av2-ws{grid-template-columns:minmax(0,1fr)}.av2-stage{order:-1;min-height:300px}}
`;

function CreateStudio({ connection, busy, setBusy, setError, setResult, picked, result }: any) {
  const [mode, setMode] = useState('avatar'); const [script, setScript] = useState(''); const [title, setTitle] = useState('Avatar App video');
  const [avatarId, setAvatarId] = useState(picked?.id || ''); const [voiceId, setVoiceId] = useState(picked?.voiceId || ''); const [mediaUrl, setMediaUrl] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16'); const [engine, setEngine] = useState('avatar_iv'); const [duration, setDuration] = useState(10);
  const [looks, setLooks] = useState<any[]>([]); const [voices, setVoices] = useState<any[]>([]); const [progress, setProgress] = useState('');
  useEffect(() => { if (picked?.id) { setAvatarId(picked.id); setVoiceId(picked.voiceId || ''); } }, [picked?.nonce]);
  useEffect(() => {
    if (connection !== 'ready') return;
    listPage('v3/avatars/looks', { limit: 50 }).then((page) => setLooks(page.items)).catch(() => setLooks([]));
    listPage('v3/voices', { limit: 100 }).then((page) => setVoices(page.items)).catch(() => setVoices([]));
  }, [connection]);
  const chargeEngineFor = (resolvedEngine: string) => mode === 'video-agent' ? 'heygen/video-agent' : mode === 'cinematic' ? 'heygen/cinematic-avatar' : `heygen/${resolvedEngine}`;
  const chargeOptions = { avatarType: mode === 'image' ? 'photo' : undefined, resolution: mode === 'cinematic' ? '720p' : '1080p' };
  const quote = estimateCredits(script, mode === 'cinematic' ? duration : undefined, chargeEngineFor(engine), chargeOptions);
  const run = async () => {
    if (connection !== 'ready' || busy) return; setBusy('create'); setError(''); setProgress('');
    try {
      const lookId = avatarId.trim(); let voice = voiceId.trim(); let path = 'v3/videos'; let body: any; let resolvedEngine = engine;
      if (mode === 'video-agent') {
        if (voice) { setProgress('Validating voice…'); await validateVoice(voice); }
        path = 'v3/video-agents'; body = { prompt: script, mode: 'generate', orientation: aspect === '9:16' ? 'portrait' : 'landscape', avatar_id: lookId || undefined, voice_id: voice || undefined };
      } else if (mode === 'cinematic') body = { type: 'cinematic_avatar', model: 'heygen_video_1', prompt: script, avatar_id: avatarId.split(',').map((v) => v.trim()).filter(Boolean), aspect_ratio: aspect === '1:1' ? '16:9' : aspect, resolution: '720p', duration: Math.max(5, Math.min(15, duration)), title };
      else if (mode === 'image') {
        if (!voice) throw new Error('Choose a voice for image to video.');
        setProgress('Validating voice…'); await validateVoice(voice);
        body = { type: 'image', image: { type: 'url', url: mediaUrl }, script, voice_id: voice, title, resolution: '1080p', aspect_ratio: aspect };
      } else {
        if (!lookId) throw new Error('Choose an avatar look first.');
        setProgress('Checking which engines this look supports…');
        const resolved = await resolveEngine(lookId, engine);
        resolvedEngine = resolved.engine;
        if (resolved.engine !== engine) setEngine(resolved.engine);
        const base = { type: 'avatar', avatar_id: lookId, engine: { type: resolved.engine }, title, resolution: '1080p', aspect_ratio: aspect, fit: 'cover' };
        if (mode === 'audio') body = { ...base, audio_url: mediaUrl, output_format: 'mp4' };
        else {
          voice = voice || String(resolved.look.default_voice_id || '');
          if (!voice) throw new Error('This look has no default voice. Choose a voice.');
          setProgress('Validating voice…'); await validateVoice(voice);
          body = { ...base, script, voice_id: voice, voice_settings: { speed: 1 }, output_format: mode === 'transparent' ? 'webm' : 'mp4', ...(mode === 'transparent' ? {} : { background: { type: 'color', value: '#0C0A06' } }) };
        }
      }
      const engineId = chargeEngineFor(resolvedEngine);
      const priced = estimateCredits(script, mode === 'cinematic' ? duration : undefined, engineId, chargeOptions);
      const wallet = getCachedCredits();
      const balanceText = wallet ? (wallet.unlimited ? 'Owner access — not deducted.' : `Your balance: ${wallet.balance} credits.`) : '';
      if (!window.confirm(`${priced.label} · about ${priced.seconds}s · ${priced.credits} Vidverge credits (real HeyGen cost + 30%). ${balanceText} Failed renders are refunded. Continue?`)) return;
      const creditKey = newChargeKey('avatar-app');
      setProgress('Reserving credits…');
      await authorizeCredits({ seconds: priced.seconds, engine: engineId, options: { ...chargeOptions, seconds: priced.seconds }, entryKey: creditKey, source: 'avatar-app', preconfirmed: true, label: `Avatar App · ${priced.label} · ${priced.seconds}s`, note: title.slice(0, 120) });
      setProgress('Submitting to HeyGen…');
      let created: any;
      try { created = await heygen(path, { method: 'POST', body }); }
      catch (submitError) { await refundCredits(creditKey, 'HeyGen did not accept the render'); throw submitError; }
      const videoId = String(created?.data?.video_id || created?.video_id || '');
      if (!videoId) { setResult(created); return; }
      setProgress('Rendering · waiting…');
      try { setResult(await pollVideo(videoId, (detail) => setProgress(`Rendering · ${detail.status || 'pending'}…`))); }
      catch (renderError: any) {
        if (/failed/i.test(String(renderError?.message || renderError))) await refundCredits(creditKey, 'HeyGen render failed');
        throw renderError;
      }
    } catch (error: any) { setError(String(error?.message || error)); } finally { setBusy(''); setProgress(''); }
  };
  const modes = [{ id: 'avatar', label: 'Avatar III / IV / V' }, { id: 'image', label: 'Image to video' }, { id: 'audio', label: 'Audio to video' }, { id: 'cinematic', label: 'Cinematic avatar' }, { id: 'transparent', label: 'Transparent avatar' }, { id: 'video-agent', label: 'Video Agent' }];
  const modeLabel = modes.find((item) => item.id === mode)?.label || 'Avatar';
  const lookRow = looks.find((look) => look.id === avatarId.trim());
  const stageImage = mode === 'image' ? mediaUrl.trim() : String(lookRow?.preview_image_url || lookRow?.image_url || lookRow?.thumbnail_url || '');
  const resultData = unwrap(result);
  const resultUrl = String(resultData?.video_url || resultData?.videoUrl || result?.videoUrl || '');
  const frameWidth = aspect === '9:16' ? 'min(250px, 100%)' : aspect === '1:1' ? 'min(400px, 100%)' : '100%';
  return <section className="av2">
    <style>{AV2_CSS}</style>
    <div className="av2-ws">
    <div className="av2-panel">
    <div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>Avatar production</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>Choose a documented HeyGen v3 mode. Every paid action shows a credit estimate first.</p></div>
    <p style={{ ...noteStyle, margin: '0 0 -8px' }}>{HELPER.mode}</p>
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>{modes.map((item) => <button key={item.id} onClick={() => setMode(item.id)} type="button" style={{ ...secondary, background: mode === item.id ? COLORS.accentSoft : COLORS.surface, borderColor: mode === item.id ? COLORS.accent : COLORS.border, color: mode === item.id ? COLORS.accent : COLORS.secondary }}><span style={{ display: 'grid', gap: 3, padding: '8px 0', textAlign: 'center' }}><span>{item.label}</span>{MODE_NOTES[item.id] ? <span style={noteStyle}>{MODE_NOTES[item.id]}</span> : null}</span></button>)}</div>
    <div style={{ display: 'grid', gap: 13 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}><label style={labelStyle}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Format<select value={aspect} onChange={(e) => setAspect(e.target.value as any)} style={inputStyle}><option>9:16</option><option>1:1</option><option>16:9</option></select><OptionThumb src={previewFor('format', aspect)} ratio={aspect.replace(':', ' / ')} style={formatThumbStyle} /><span style={noteStyle}>{FORMAT_NOTES[aspect]}</span></label>{!['cinematic','video-agent','image'].includes(mode) ? <label style={labelStyle}>Engine (switches to one the look supports)<select value={engine} onChange={(e) => setEngine(e.target.value)} style={inputStyle}><option value="avatar_iii">Avatar III</option><option value="avatar_iv">Avatar IV</option><option value="avatar_v">Avatar V</option></select>{ENGINE_NOTES[engine] ? <span style={noteStyle}>{ENGINE_NOTES[engine]}</span> : null}</label> : null}</div>
      {mode !== 'image' ? <label style={labelStyle}>{mode === 'cinematic' ? 'Avatar look IDs (up to 3, comma separated)' : 'Avatar look ID'}<input list="avatar-app-looks" value={avatarId} onChange={(e) => setAvatarId(e.target.value)} style={inputStyle} placeholder="Pick a look or paste a look ID" /><datalist id="avatar-app-looks">{looks.map((look) => <option key={look.id} value={look.id}>{look.name || look.id}</option>)}</datalist><span style={noteStyle}>{HELPER.look}</span></label> : null}
      {['avatar','image','transparent'].includes(mode) ? <label style={labelStyle}>Voice ID (optional when the look has a default voice)<input list="avatar-app-voices" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} style={inputStyle} placeholder="Pick a voice or paste a voice ID" /><datalist id="avatar-app-voices">{voices.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{[voice.name, voice.language].filter(Boolean).join(' · ')}</option>)}</datalist><span style={noteStyle}>{HELPER.voice}</span></label> : null}
      {['image','audio'].includes(mode) ? <label style={labelStyle}>{mode === 'image' ? 'Public image URL' : 'Public audio URL'}<input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} style={inputStyle} placeholder="https://…" /></label> : null}
      {mode === 'cinematic' ? <label style={labelStyle}>Duration · 5–15 seconds<input type="number" min={5} max={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} /></label> : null}
      {mode !== 'audio' ? <label style={labelStyle}>{mode === 'cinematic' || mode === 'video-agent' ? 'Creative prompt' : 'Script'}<textarea value={script} onChange={(e) => setScript(e.target.value)} style={{ ...inputStyle, minHeight: 120, padding: 11, resize: 'vertical' }} /></label> : null}
    </div>
    </div>
    <div className="av2-stage" aria-label="Video preview">
      {resultUrl && !busy ? <video key={resultUrl} src={resultUrl} controls playsInline className="av2-video" style={{ aspectRatio: aspect.replace(':', ' / '), width: frameWidth }} /> : <div className={'av2-frame' + (stageImage ? ' has-img' : '')} style={{ aspectRatio: aspect.replace(':', ' / '), width: frameWidth }}>
        {stageImage ? <img src={stageImage} alt="" /> : null}
        <div className="av2-frame-copy">
          {busy === 'create' ? <Loader2 size={26} className="animate-spin" /> : stageImage ? null : <UserRound size={30} />}
          <b>{busy === 'create' ? (progress || 'Working…') : (title || 'Your avatar video')}</b>
          {busy === 'create' ? null : <span>{script.trim() ? script.trim().slice(0, 160) + (script.trim().length > 160 ? '…' : '') : 'Your presenter appears here. Pick a look, write the script and press Generate.'}</span>}
        </div>
      </div>}
      <div className="av2-meta"><span>{aspect}</span><span>{modeLabel}</span><span>about {quote.seconds}s</span></div>
    </div>
    <aside className="av2-panel">
      <span className="av2-eyebrow">Cost</span>
      <div className="av2-big"><b>{quote.credits}</b><span>credits</span></div>
      <div className="av2-kv"><div><span>Length</span><b>about {quote.seconds}s</b></div><div><span>Mode</span><b>{modeLabel}</b></div><div><span>Format</span><b>{aspect}</b></div></div>
      <p style={{ ...noteStyle, margin: 0 }}>Real HeyGen cost + 30%, in $0.15 credits. You confirm before anything is charged, and failed renders are refunded.</p>
      <button type="button" disabled={connection !== 'ready' || Boolean(busy)} onClick={run} className="av2-gold" style={{ opacity: connection === 'ready' ? 1 : .5 }}>{busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}Generate</button>
      {progress ? <span style={{ alignItems: 'center', color: COLORS.accent, display: 'flex', fontSize: 12.5, gap: 7 }}><Loader2 size={14} className="animate-spin" />{progress}</span> : null}
    </aside>
    </div>
  </section>;
}

function Composer({ connection, busy, setBusy, setError, setResult }: any) {
  const [script, setScript] = useState(''); const [avatarUrl, setAvatarUrl] = useState(''); const [backgroundUrl, setBackgroundUrl] = useState(''); const [logoUrl, setLogoUrl] = useState('');
  const [title, setTitle] = useState('Avatar App composition'); const [endCard, setEndCard] = useState('Made with Avatar App'); const [aspect, setAspect] = useState<keyof typeof FORMATS>('9:16'); const [duration, setDuration] = useState(20);
  const quote = estimateCredits(script, duration, 'heygen/hyperframes');
  const run = async () => { if (connection !== 'ready' || busy) return; setBusy('hyperframes'); setError(''); try { if (!window.confirm(`HyperFrames ${aspect} render · ${duration}s · ${quote.credits} Vidverge credits (real HeyGen cost + 30%). Failed renders are refunded. Continue?`)) return; const size = FORMATS[aspect]; const built = buildHyperframesComposition({ script, avatarUrl, backgroundUrl, logoUrl, title, endCard, width: size.width, height: size.height, duration }); const creditKey = newChargeKey('avatar-hyperframes'); await authorizeCredits({ seconds: built.timeline.duration, engine: 'heygen/hyperframes', options: { seconds: built.timeline.duration }, entryKey: creditKey, source: 'avatar-app', preconfirmed: true, label: `HyperFrames ${aspect} · ${duration}s`, note: title.slice(0, 120) }); let result: any; try { result = await renderHyperframes({ html: built.html, width: size.width, height: size.height, duration: built.timeline.duration, title: `${title} (${aspect})` }); } catch (error) { await refundCredits(creditKey, 'HyperFrames render failed'); throw error; } if (result?.success === false) await refundCredits(creditKey, 'HyperFrames render failed'); setResult(result); } catch (error: any) { setError(String(error?.message || error)); } finally { setBusy(''); } };
  return <section style={{ display: 'grid', gap: 16, maxWidth: 1000 }}><div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>HyperFrames finishing</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>Deterministic HTML → MP4 on HeyGen HyperFrames. Captions, motion graphics, alpha-avatar compositing, backgrounds and end cards are rendered here—not with Remotion.</p></div><div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}><label style={labelStyle}>Export format<select value={aspect} onChange={(e) => setAspect(e.target.value as any)} style={inputStyle}><option>9:16</option><option>1:1</option><option>16:9</option></select><OptionThumb src={previewFor('format', aspect)} ratio={aspect.replace(':', ' / ')} style={formatThumbStyle} /><span style={noteStyle}>{EXPORT_FORMAT_NOTES[aspect]}</span></label><label style={labelStyle}>Duration seconds<input type="number" min={4} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} /></label><label style={labelStyle}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></label></div>
    <label style={labelStyle}>Transparent avatar WebM URL<input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} style={inputStyle} placeholder="Completed HeyGen output_format:webm URL" /></label><label style={labelStyle}>Background video or image URL<input value={backgroundUrl} onChange={(e) => setBackgroundUrl(e.target.value)} style={inputStyle} placeholder="https://…" /></label><label style={labelStyle}>Logo URL (optional)<input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Caption script<textarea value={script} onChange={(e) => setScript(e.target.value)} style={{ ...inputStyle, minHeight: 110, padding: 11 }} /></label><label style={labelStyle}>End card line<input value={endCard} onChange={(e) => setEndCard(e.target.value)} style={inputStyle} /></label>
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 9 }}><span style={{ color: COLORS.accent, fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700 }}>{duration}s · {quote.credits} credits</span><span style={{ color: COLORS.muted, fontSize: 11.5 }}>Render each format separately so every layout is native.</span><button type="button" onClick={run} disabled={connection !== 'ready' || Boolean(busy) || !script.trim()} style={{ ...primary, marginLeft: 'auto' }}>{busy === 'hyperframes' ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}Render {aspect}</button></div>
  </div></section>;
}

function Director() {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Tell me the goal, audience, format and presenter. I’ll use planning tools to prepare a credit-aware production brief; I never start paid generation from chat.' }]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const send = async () => { if (!text.trim() || busy) return; const next = [...messages, { role: 'user', content: text.trim() } as Message]; setMessages(next); setText(''); setBusy(true); setError(''); try { let response: any = await directorTurn(next, { styles: FORGE_STYLES.map((s) => ({ id: s.id, name: s.name, bestFor: s.bestFor })), formats: Object.keys(FORMATS), renderer: 'HyperFrames' }); const toolCalls = Array.isArray(response?.tool_calls) ? response.tool_calls : []; if (toolCalls.length) { const toolMessages: any[] = [...next, response]; for (const call of toolCalls) { const args = JSON.parse(call.function?.arguments || '{}'); let result: any = {}; if (call.function?.name === 'estimate_credits') result = estimateCredits(String(args.script || ''), Number(args.seconds) || undefined); else if (call.function?.name === 'prepare_production') result = { reviewRequired: true, renderer: 'HyperFrames', ...args }; else result = { available: HEYGEN_ENDPOINTS.some((item) => item.label.toLowerCase().includes(String(args.capability || '').toLowerCase()) || item.category.toLowerCase().includes(String(args.capability || '').toLowerCase())), endpointFamilies: [...new Set(HEYGEN_ENDPOINTS.map((item) => item.category))] }; toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) }); } response = await directorTurn(toolMessages, { styles: FORGE_STYLES.map((s) => s.id), renderer: 'HyperFrames' }); } setMessages((current) => [...current, { role: 'assistant', content: String(response?.content || 'I prepared the production plan. Review it before generating.') }]); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(false); } };
  return <section style={{ display: 'grid', gap: 12, maxWidth: 900 }}><div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>Director agent</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>Uses tool calls for credit estimates, capability checks and reviewable production plans.</p></div><div style={{ ...cardStyle, display: 'grid', gap: 10, maxHeight: 470, overflowY: 'auto' }}>{messages.map((message, index) => <div key={index} style={{ background: message.role === 'user' ? COLORS.accentSoft : COLORS.raised, border: `1px solid ${message.role === 'user' ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.sm, color: message.role === 'user' ? COLORS.text : COLORS.secondary, justifySelf: message.role === 'user' ? 'end' : 'start', lineHeight: '20px', maxWidth: '82%', padding: '10px 12px', whiteSpace: 'pre-wrap' }}>{message.content}</div>)}{busy ? <span style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', gap: 7 }}><Loader2 size={14} className="animate-spin" />Director is using planning tools…</span> : null}</div>{error ? <span style={{ color: COLORS.danger }}>{error}</span> : null}<div style={{ display: 'flex', gap: 8 }}><textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...inputStyle, minHeight: 70, padding: 10 }} placeholder="Create a 30-second presenter ad for…" /><button type="button" disabled={busy || !text.trim()} onClick={send} style={primary}><Sparkles size={15} />Send</button></div></section>;
}

function AvatarLibrary({ connection, onUse }: { connection: Connection; onUse: (look: { id: string; voiceId: string }) => void }) {
  const [rows, setRows] = useState<ForgeAvatar[]>([]); const [defaultVoices, setDefaultVoices] = useState<Record<string, string>>({}); const [nextToken, setNextToken] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = async (token?: string | null) => { if (connection !== 'ready') return; setLoading(true); setError(''); try { const page = await listPage('v3/avatars/looks', { limit: 50, token }); setDefaultVoices((current) => ({ ...(token ? current : {}), ...Object.fromEntries(page.items.map((item: any) => [String(item.id || ''), String(item.default_voice_id || '')])) })); setNextToken(page.hasMore ? page.nextToken : null); const mapped = page.items.map((item: any) => ({ id: String(item.id || ''), groupId: String(item.group_id || ''), name: String(item.name || item.look_name || item.id), gender: String(item.gender || 'unspecified'), age: '', region: '', ethnicity: '', style: String(item.avatar_type || 'avatar'), category: String(item.ownership || ''), description: '', tags: [], previewImage: String(item.preview_image_url || item.image_url || item.thumbnail_url || ''), previewVideo: String(item.preview_video_url || ''), gestures: [], emotions: [], supportedEngines: Array.isArray(item.supported_api_engines) ? item.supported_api_engines : [] })).filter((item: ForgeAvatar) => item.id); setRows((current) => [...(token ? current : []), ...mapped]); } catch (e: any) { setError(String(e?.message || e)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [connection]); const groups = useMemo(() => bundleAvatars(rows), [rows]);
  return <section style={{ display: 'grid', gap: 14 }}><div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>Saved avatar library</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>Live HeyGen looks grouped with SceneForge’s existing avatar bundling logic.</p></div>{connection !== 'ready' ? <span style={{ color: COLORS.muted, fontSize: 13 }}>{connection === 'checking' ? 'Connecting to HeyGen…' : 'The library loads once HeyGen is reachable. Use Retry above.'}</span> : null}{error ? <div role="alert" style={{ alignItems: 'center', background: COLORS.dangerBg, border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.danger, display: 'flex', flexWrap: 'wrap', fontSize: 13, gap: 10, padding: 10 }}><span style={{ flex: 1 }}>{error}</span><button type="button" onClick={() => load()} style={{ ...secondary, minHeight: 34 }}><RefreshCw size={13} />Retry</button></div> : null}{connection === 'ready' && !loading && !error && rows.length === 0 ? <div style={{ ...cardStyle, color: COLORS.secondary, fontSize: 13, lineHeight: '19px' }}>No avatar looks in this HeyGen account yet. Create one from API Console with “Create photo, prompt or Digital Twin avatar”, then come back here.</div> : null}{<div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>{groups.map((group) => { const look = group.looks[0]; return <article key={group.key} style={{ ...cardStyle, padding: 10 }}>{look.previewImage ? <img src={look.previewImage} alt="" style={{ aspectRatio: '16/10', borderRadius: 8, objectFit: 'cover', width: '100%' }} /> : <div style={{ alignItems: 'center', aspectRatio: '16/10', background: COLORS.raised, borderRadius: 8, display: 'flex', justifyContent: 'center' }}><UserRound size={28} color={COLORS.muted} /></div>}<strong style={{ display: 'block', fontFamily: FONT.heading, fontSize: 13.5, marginTop: 9 }}>{group.name}</strong><span style={{ color: COLORS.muted, display: 'block', fontSize: 11.5, marginTop: 3 }}>{group.looks.length} look{group.looks.length === 1 ? '' : 's'} · {look.supportedEngines.join(', ') || 'engine not reported'}</span><code style={{ color: COLORS.accent, display: 'block', fontSize: 10.5, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{look.id}</code><button type="button" onClick={() => onUse({ id: look.id, voiceId: defaultVoices[look.id] || '' })} style={{ ...secondary, marginTop: 8, minHeight: 34, width: '100%' }}><Video size={13} />Use in Create</button></article>; })}</div>}{loading ? <span style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', gap: 7 }}><Loader2 size={14} className="animate-spin" /> Loading looks…</span> : null}{nextToken && !loading ? <button type="button" onClick={() => load(nextToken)} style={{ ...secondary, width: 'fit-content' }}>Load more looks</button> : null}</section>;
}

function Translate({ connection, busy, setBusy, setError, setResult }: any) {
  const [url, setUrl] = useState(''); const [languages, setLanguages] = useState('Spanish'); const [mode, setMode] = useState('speed');
  const run = async () => { if (connection !== 'ready' || busy) return; setBusy('translate'); setError(''); try { if (!window.confirm('Translation uses HeyGen voice cloning and lip-sync and may incur upstream charges. Continue?')) return; const result = await avatarApi('translations.create', { body: { video_url: url, output_languages: languages.split(',').map((v) => v.trim()).filter(Boolean), mode } }); setResult(result); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } };
  return <SimpleSection title="Translate and dub" blurb="Speed for turnaround; Precision for higher-quality lip-sync and optional proofread sessions."><label style={labelStyle}>Source video URL<input value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Languages (comma separated)<input value={languages} onChange={(e) => setLanguages(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Mode<select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}><option value="speed">Speed</option><option value="precision">Precision</option></select>{TRANSLATE_MODE_NOTES[mode] ? <span style={noteStyle}>{TRANSLATE_MODE_NOTES[mode]}</span> : null}</label><button type="button" onClick={run} disabled={!url || Boolean(busy)} style={primary}>{busy === 'translate' ? <Loader2 size={15} className="animate-spin" /> : <Languages size={15} />}Start translation</button></SimpleSection>;
}

function BatchPanel({ connection, busy, setBusy, setError, setResult }: any) {
  const [kind, setKind] = useState('videos'); const [payload, setPayload] = useState('[\n  {\n    "type": "avatar",\n    "avatar_id": "LOOK_ID",\n    "script": "Variant one",\n    "voice_id": "VOICE_ID",\n    "aspect_ratio": "9:16",\n    "resolution": "1080p"\n  }\n]');
  const run = async () => { if (connection !== 'ready' || busy) return; setBusy('batch'); setError(''); try { const items = JSON.parse(payload); if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new Error('Provide 1–100 batch items.'); if (!window.confirm(`Submit ${items.length} paid ${kind} item(s)?`)) return; const endpoint = kind === 'videos' ? 'batches.videos.create' : kind === 'translations' ? 'batches.translations.create' : 'batches.lipsyncs.create'; const key = kind === 'videos' ? 'videos' : kind === 'translations' ? 'video_translations' : 'lipsyncs'; setResult(await avatarApi(endpoint, { body: { [key]: items } })); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } };
  return <SimpleSection title="Series and ad batches" blurb="Submit up to 100 avatar videos, translations or lipsync jobs and poll one batch id."><label style={labelStyle}>Batch type<select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}><option value="videos">Video series / ad variants</option><option value="translations">Translation batch</option><option value="lipsyncs">Lipsync batch</option></select>{BATCH_TYPE_NOTES[kind] ? <span style={noteStyle}>{BATCH_TYPE_NOTES[kind]}</span> : null}</label><label style={labelStyle}>Items JSON<textarea value={payload} onChange={(e) => setPayload(e.target.value)} style={{ ...inputStyle, minHeight: 260, padding: 10, fontFamily: 'monospace' }} /></label><button type="button" onClick={run} disabled={Boolean(busy)} style={primary}>{busy === 'batch' ? <Loader2 size={15} className="animate-spin" /> : <Boxes size={15} />}Submit batch</button></SimpleSection>;
}

function BrandPanel({ connection, busy, setBusy, setError, setResult }: any) {
  const [url, setUrl] = useState(''); const [name, setName] = useState('Brand glossary'); const [term, setTerm] = useState('');
  const run = async (action: 'kit' | 'glossary' | 'list') => { if (connection !== 'ready' || busy) return; setBusy(`brand-${action}`); setError(''); try { if (action === 'kit') setResult(await avatarApi('brand-kits.create', { body: { url } })); else if (action === 'glossary') setResult(await avatarApi('glossaries.create', { body: { name, terms: term ? [{ term, pronunciation: term }] : [] } })); else setResult({ kits: await avatarApi('brand-kits.list'), glossaries: await avatarApi('glossaries.list') }); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } };
  return <SimpleSection title="Brand Kit and glossary" blurb="Import logos, colours and fonts from a public site, then protect pronunciations and translations."><label style={labelStyle}>Public brand website<input value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} /></label><button type="button" onClick={() => run('kit')} disabled={!url || Boolean(busy)} style={primary}><Palette size={15} />Import Brand Kit</button><div style={{ borderTop: `1px solid ${COLORS.border}`, margin: '8px 0' }} /><label style={labelStyle}>Glossary name<input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>First protected term<input value={term} onChange={(e) => setTerm(e.target.value)} style={inputStyle} /></label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" onClick={() => run('glossary')} disabled={Boolean(busy)} style={primary}>Create glossary</button><button type="button" onClick={() => run('list')} disabled={Boolean(busy)} style={secondary}>List saved brand resources</button></div></SimpleSection>;
}

function ToolsPanel({ connection, busy, setBusy, setError, setResult }: any) {
  const [query, setQuery] = useState('upbeat cinematic product launch'); const [type, setType] = useState('music'); const [videoUrl, setVideoUrl] = useState('');
  const run = async (kind: 'audio' | 'clips' | 'fillers') => { if (connection !== 'ready' || busy) return; setBusy(`tool-${kind}`); setError(''); try { if (kind === 'audio') setResult(await avatarApi('audio.search', { query: { q: query, type } })); else { if (!window.confirm(`${kind === 'clips' ? 'AI clipping' : 'Filler-word removal'} is a paid HeyGen operation. Continue?`)) return; setResult(await avatarApi(kind === 'clips' ? 'clipping.create' : 'fillers.create', { body: kind === 'clips' ? { video_url: videoUrl, output_settings: { captions: true } } : { video_url: videoUrl } })); } } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } };
  return <SimpleSection title="Audio and post-production tools" blurb="Search background music or SFX, create short clips and remove filler words."><label style={labelStyle}>Audio search<input value={query} onChange={(e) => setQuery(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Type<select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}><option value="music">Background music</option><option value="sound_effects">Sound effects</option></select>{AUDIO_TYPE_NOTES[type] ? <span style={noteStyle}>{AUDIO_TYPE_NOTES[type]}</span> : null}</label><button type="button" onClick={() => run('audio')} disabled={Boolean(busy)} style={secondary}><Music2 size={15} />Search audio</button><div style={{ borderTop: `1px solid ${COLORS.border}`, margin: '8px 0' }} /><label style={labelStyle}>Source video URL<input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} style={inputStyle} /></label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" onClick={() => run('clips')} disabled={!videoUrl || Boolean(busy)} style={primary}>AI clipping</button><button type="button" onClick={() => run('fillers')} disabled={!videoUrl || Boolean(busy)} style={secondary}>Remove filler words</button></div></SimpleSection>;
}

function ApiConsole({ connection, busy, setBusy, setError, setResult }: any) {
  const [endpointId, setEndpointId] = useState('users.me'); const endpoint = HEYGEN_ENDPOINTS.find((item) => item.id === endpointId) || HEYGEN_ENDPOINTS[0]; const [params, setParams] = useState('{}'); const [query, setQuery] = useState('{}'); const [body, setBody] = useState('{}');
  useEffect(() => { setBody(json(endpoint.sample || {})); setParams(json(Object.fromEntries([...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => [match[1], ''])))); setQuery('{}'); }, [endpointId]);
  const run = async () => { if (connection !== 'ready' || busy) return; setBusy('api'); setError(''); try { if (endpoint.paid && !window.confirm(`${endpoint.label} may be billable. Continue?`)) return; setResult(await avatarApi(endpoint.id, { params: JSON.parse(params), query: JSON.parse(query), body: endpoint.method === 'GET' ? undefined : JSON.parse(body) })); } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); } };
  const categories = [...new Set(HEYGEN_ENDPOINTS.map((item) => item.category))];
  return <section style={{ display: 'grid', gap: 14, maxWidth: 1050 }}><div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>Docs-verified API console</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>{HEYGEN_ENDPOINTS.length} fixed endpoint actions across {categories.length} families. Every request runs through the Audos HeyGen proxy.</p></div><div style={{ ...cardStyle, display: 'grid', gap: 12 }}><label style={labelStyle}>Endpoint<select value={endpointId} onChange={(e) => setEndpointId(e.target.value)} style={inputStyle}>{categories.map((category) => <optgroup key={category} label={category}>{HEYGEN_ENDPOINTS.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.method} · {item.label}</option>)}</optgroup>)}</select></label><code style={{ background: COLORS.bg, borderRadius: 8, color: COLORS.accent, padding: 10 }}>{endpoint.method} {endpoint.path}{endpoint.paid ? ' · may be billable' : ''}</code><div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}><label style={labelStyle}>Path parameters JSON<textarea value={params} onChange={(e) => setParams(e.target.value)} style={{ ...inputStyle, minHeight: 100, padding: 10, fontFamily: 'monospace' }} /></label><label style={labelStyle}>Query JSON<textarea value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, minHeight: 100, padding: 10, fontFamily: 'monospace' }} /></label></div>{endpoint.method !== 'GET' ? <label style={labelStyle}>Request body JSON<textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ ...inputStyle, minHeight: 220, padding: 10, fontFamily: 'monospace' }} /></label> : null}<button type="button" onClick={run} disabled={Boolean(busy)} style={{ ...primary, width: 'fit-content' }}>{busy === 'api' ? <Loader2 size={15} className="animate-spin" /> : <TerminalSquare size={15} />}Run endpoint</button></div><div style={{ ...cardStyle, background: COLORS.raised }}><strong style={{ fontFamily: FONT.heading, fontSize: 13.5 }}>Live Avatar status</strong><p style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px', margin: '5px 0 0' }}>Not connected here: HeyGen’s LiveAvatar product uses a separate host and SDK, not api.heygen.com. The Audos HeyGen proxy does not cover that service.</p></div></section>;
}

function SimpleSection({ title, blurb, children }: { title: string; blurb: string; children: any }) { return <section style={{ display: 'grid', gap: 14, maxWidth: 820 }}><div><h2 style={{ fontFamily: FONT.heading, fontSize: 19, margin: 0 }}>{title}</h2><p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0 0' }}>{blurb}</p></div><div style={{ ...cardStyle, display: 'grid', gap: 12 }}>{children}</div></section>; }
function ResultPanel({ value, onClose }: { value: any; onClose: () => void }) { const data = unwrap(value); const url = data?.video_url || data?.videoUrl || value?.videoUrl; return <aside style={{ ...cardStyle, bottom: 18, boxShadow: '0 20px 60px rgba(0,0,0,.55)', display: 'grid', gap: 10, maxHeight: '70vh', maxWidth: 480, overflow: 'auto', position: 'fixed', right: 18, width: 'calc(100vw - 36px)', zIndex: 40 }}><div style={{ alignItems: 'center', display: 'flex', gap: 8 }}><CheckCircle2 size={16} color={COLORS.success} /><strong style={{ fontFamily: FONT.heading, fontSize: 14 }}>Request result</strong><button type="button" onClick={onClose} style={{ ...secondary, marginLeft: 'auto', minHeight: 32, padding: '0 9px' }}>Close</button></div>{url ? <><video src={url} controls playsInline style={{ background: '#000', borderRadius: 8, maxHeight: 280, width: '100%' }} /><a href={url} target="_blank" rel="noreferrer" style={{ ...primary, textDecoration: 'none' }}><Download size={14} />Open video</a></> : null}<pre style={{ background: COLORS.bg, borderRadius: 8, color: COLORS.secondary, fontSize: 10.5, margin: 0, overflow: 'auto', padding: 10, whiteSpace: 'pre-wrap' }}>{json(value)}</pre></aside>; }
