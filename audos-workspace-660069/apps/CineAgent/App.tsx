// CineAgent — the autonomous AI video editor.
//
// Upload → the agent analyzes, directs, edits, renders, reviews → download the
// finished MP4. The customer never configures a pipeline: preferences are
// optional, the plan is inspectable but never a prerequisite, and a refresh
// resumes the run from its last checkpoint (cine_projects).
//
// Laid out as the second design's studio workspace: inputs on the left, the
// stage in the centre, the inspector with the one gold action on the right.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Clapperboard, Download, Film, Loader2, RefreshCw, Settings2,
  Sparkles, Square, Trash2, Upload, Wand2, X, CheckCircle2, AlertTriangle, Eye, Circle,
} from 'lucide-react';
import type { ActivityLine, ProjectRow, QAReport, StageId, UserPrefs } from './lib/types';
import { STAGE_LABELS, STAGE_ORDER } from './lib/types';
import { createProject, deleteProject, listProjects, loadProject } from './lib/store';
import { runPipeline, type PipelineHandle } from './lib/pipeline';
import { computeTiming } from './lib/plan';
import { waitForWorkspaceBridge } from './lib/platform';
import VideoErrorCard from '../../components/video/VideoErrorCard';
import { withBrandContext } from '../../components/BrandContextLayer';
import { VideoHistory } from '../../components/VideoHistory';
import { saveVideoToHistory } from '../../lib/videoHistory';
import { CAPTIONS_NOTES, FRAMING_NOTES, FRAMING_PREVIEWS, MOTION_NOTES, MUSIC_NOTES, OptionThumb, PREFS_HELPER } from './optionPreviews';

const accent = 'var(--vg-accent)';
const textPrimary = 'var(--vg-text)';
const textMuted = 'var(--vg-muted)';

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

const BrandedCineAgent = withBrandContext(App, 'CineAgent');
export default BrandedCineAgent;
function App() {
  const [view, setView] = useState<'home' | 'run'>('home');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [active, setActive] = useState<ProjectRow | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<UserPrefs>({ captions: 'auto', music: 'auto', framing: 'auto', intensity: 'balanced' });
  const [dragOver, setDragOver] = useState(false);
  const [homeError, setHomeError] = useState('');
  const handleRef = useRef<PipelineHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runningRef = useRef(false);

  const refreshProjects = useCallback(async () => {
    try { setProjects(await listProjects(24)); } catch { /* table empty / not ready */ }
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);
  useEffect(() => () => { if (handleRef.current) handleRef.current.cancelled = true; }, []);

  // SHARED CROSS-APP HISTORY. The finished cut arrives on the project row
  // through the pipeline's onRow callback. Reopening a project that is already
  // finished seeds the set below (see resumeRun), so an old film is never
  // recorded a second time.
  const recordedResultUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const url = active?.status === 'done' ? String(active.result?.url || '') : '';
    if (!url || recordedResultUrls.current.has(url)) return;
    recordedResultUrls.current.add(url);
    void saveVideoToHistory({
      appId: 'cineagent',
      title: active?.plan?.title || active?.name || 'CineAgent edit',
      videoUrl: url,
      durationSec: active?.result?.durationSec ? Math.round(active.result.durationSec) : null,
    });
  }, [active?.status, active?.result?.url, active?.result?.durationSec, active?.plan?.title, active?.name]);

  const startRun = useCallback(async (file: File) => {
    setHomeError('');
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
      setHomeError('Please choose a video file (MP4, MOV, WebM).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setHomeError('This file is over the 50 MB upload limit. Trim or compress it, then try again. Nothing was charged.');
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const cleanPrefs: UserPrefs = { ...prefs };
      if (!cleanPrefs.tone?.trim()) delete cleanPrefs.tone;
      // The platform injects the workspace session asynchronously — starting
      // before it lands used to surface as a "sign in" error on first click.
      await waitForWorkspaceBridge(10000);
      const created = await createProject(file.name.replace(/\.[a-z0-9]+$/i, ''), cleanPrefs);
      const row = await loadProject(created.id);
      if (!row) throw new Error('Could not open the new project.');
      if (created.local) {
        row.activity = [...(row.activity || []), {
          t: Date.now(),
          text: 'Heads up: your session was not ready, so this project is saved on this device only (it still edits normally, but resumes only from this browser).',
          kind: 'warn',
        }];
      }
      const handle: PipelineHandle = { cancelled: false };
      handleRef.current = handle;
      setActive(row);
      setView('run');
      runPipeline(row, file, handle, { onRow: (r) => setActive({ ...r }) })
        .finally(() => { runningRef.current = false; refreshProjects(); });
    } catch (error) {
      runningRef.current = false;
      setHomeError(error instanceof Error ? error.message : String(error));
    }
  }, [prefs, refreshProjects]);

  const resumeRun = useCallback(async (row: ProjectRow) => {
    const fresh = (await loadProject(row.id)) || row;
    if (fresh.status === 'done' && fresh.result?.url) {
      recordedResultUrls.current.add(String(fresh.result.url));
    }
    setActive(fresh);
    setView('run');
    if (fresh.status === 'running' && !runningRef.current) {
      runningRef.current = true;
      const handle: PipelineHandle = { cancelled: false };
      handleRef.current = handle;
      runPipeline(fresh, null, handle, { onRow: (r) => setActive({ ...r }) })
        .finally(() => { runningRef.current = false; refreshProjects(); });
    }
  }, [refreshProjects]);

  const stopRun = useCallback(() => {
    if (handleRef.current) handleRef.current.cancelled = true;
  }, []);

  return (
    <div className="cine2" style={{ minHeight: '100%', color: textPrimary, fontFamily: 'var(--body)', padding: '14px clamp(12px, 2vw, 18px) 48px' }}>
      <style>{cineCss}</style>
      <div className="cine2-bar">
        <span className="cine2-eyebrow">{view === 'run' ? 'Editing' : 'New edit'}</span>
        <span style={{ flex: 1 }} />
        {view === 'run' ? (
          <button onClick={() => { setView('home'); refreshProjects(); }} className="cine2-btn">
            <X size={15} /> All projects
          </button>
        ) : null}
      </div>

      {view === 'home' ? (
        <HomeView
          projects={projects}
          prefs={prefs}
          setPrefs={setPrefs}
          prefsOpen={prefsOpen}
          setPrefsOpen={setPrefsOpen}
          dragOver={dragOver}
          setDragOver={setDragOver}
          error={homeError}
          onPick={() => fileInputRef.current?.click()}
          onFile={startRun}
          onOpen={resumeRun}
          onDelete={async (row) => { await deleteProject(row.id).catch(() => undefined); refreshProjects(); }}
        />
      ) : active ? (
        <RunView row={active} onStop={stopRun} onResume={() => resumeRun(active)} running={runningRef.current} />
      ) : null}

      <input
        ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) startRun(f); e.currentTarget.value = ''; }}
      />

      <div style={{ marginTop: 22 }}>
        <VideoHistory />
      </div>
    </div>
  );
}

const cineCss = `
@keyframes cine-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.cine2{--cine-hue:var(--hue,#5bb8ff);--cine-panel:linear-gradient(180deg,var(--vg-raised),var(--vg-surface));--cine-line:color-mix(in srgb,var(--vg-border) 80%,transparent);--cine-grad:linear-gradient(135deg,#ffefb8 0%,#f2c14a 42%,#c48a12 100%)}
.cine2-bar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.cine2-eyebrow{font-size:12.5px;font-weight:600;color:var(--vg-muted)}
.cine2-ws{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr) minmax(260px,300px);gap:12px;align-items:start}
.cine2-panel{background:var(--cine-panel);border:1px solid var(--cine-line);border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
.cine2-panel h2,.cine2-panel h3{margin:0;font-family:var(--display);letter-spacing:-.02em}
.cine2-label{font-size:12.5px;font-weight:600;color:var(--vg-secondary);display:block;margin-bottom:6px}
.cine2-hint{font-size:12.5px;line-height:1.5;color:var(--vg-muted);margin:0}
.cine2-stage{position:relative;min-height:440px;border-radius:22px;border:1px solid var(--cine-line);background:#000;display:grid;place-items:center;padding:20px;overflow:hidden;color:#fbf4e2}
.cine2-stage::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 100% 0%,color-mix(in srgb,var(--cine-hue) 14%,transparent),transparent 70%);pointer-events:none}
.cine2-stage>*{position:relative}
.cine2-stage video{width:100%;max-height:560px;border-radius:12px;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.7)}
.cine2-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;max-width:420px}
.cine2-empty h3{font-family:var(--display);font-size:26px;letter-spacing:-.03em;margin:0;color:#fbf4e2}
.cine2-empty p{margin:0;font-size:13.5px;line-height:1.55;color:rgba(251,244,226,.72)}
.cine2-icon{width:60px;height:60px;border-radius:18px;display:grid;place-items:center;color:var(--cine-hue);background:color-mix(in srgb,var(--cine-hue) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cine-hue) 40%,transparent)}
.cine2-steps{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:8px;width:100%;text-align:left}
.cine2-steps li{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:rgba(255,232,180,.06);border:1px solid rgba(255,225,160,.12);font-size:13px;color:#fbf4e2}
.cine2-steps li.is-on{border-color:var(--cine-hue)}
.cine2-steps li.is-done{color:rgba(251,244,226,.78)}
.cine2-steps .n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-family:'Geist Mono',ui-monospace,monospace;font-size:11.5px;border:1px solid rgba(255,225,160,.3)}
.cine2-steps li.is-on .n{background:var(--cine-hue);color:#140e00;border-color:transparent}
.cine2-steps li.is-done .n{border-color:var(--cine-hue);color:var(--cine-hue)}
.cine2-steps .st{font-size:11.5px;color:rgba(251,244,226,.6)}
.cine2-drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:26px 16px;border-radius:16px;border:1.5px dashed color-mix(in srgb,var(--vg-gold) 45%,var(--cine-line));background:color-mix(in srgb,var(--vg-surface) 70%,transparent);transition:border-color .2s ease,background .2s ease}
.cine2-drop.is-drag{border-color:var(--vg-gold);background:color-mix(in srgb,var(--vg-gold) 9%,transparent)}
.cine2-btn{display:inline-flex;min-height:40px;align-items:center;justify-content:center;gap:8px;padding:0 16px;font-size:13.5px;font-weight:600;background:color-mix(in srgb,var(--vg-raised) 80%,transparent);color:var(--vg-text);border:1px solid var(--vg-control-border);border-radius:999px;cursor:pointer;text-decoration:none;transition:border-color .2s ease,background .2s ease,transform .15s ease}
.cine2-btn:hover{border-color:var(--vg-gold)}
.cine2-btn:active{transform:scale(.98)}
.cine2-btn:focus-visible,.cine2-gold:focus-visible{outline:2px solid var(--vg-focus);outline-offset:3px}
.cine2-gold{display:inline-flex;min-height:52px;width:100%;align-items:center;justify-content:center;gap:8px;padding:0 22px;font-size:15px;font-weight:700;background:var(--cine-grad);color:#1a1200;border:0;border-radius:999px;cursor:pointer;text-decoration:none;box-shadow:0 0 0 1px rgba(255,222,140,.4),0 10px 38px rgba(242,193,74,.3),inset 0 1px 0 rgba(255,255,255,.6);transition:box-shadow .2s ease,transform .15s ease}
.cine2-gold:hover{box-shadow:0 0 0 1px rgba(255,230,150,.6),0 12px 44px rgba(242,193,74,.46),inset 0 1px 0 rgba(255,255,255,.7)}
.cine2-gold:active{transform:scale(.98)}
.cine2-input{width:100%;padding:11px 13px;font-size:13px;color:var(--vg-text);background:rgba(255,232,180,.06);border:1px solid var(--cine-line);border-radius:12px;outline:none;box-sizing:border-box;transition:border-color .2s ease,box-shadow .2s ease}
.cine2-input:focus{border-color:var(--vg-gold);box-shadow:0 0 0 4px color-mix(in srgb,var(--vg-gold) 14%,transparent)}
.cine2-kv{display:flex;flex-direction:column}
.cine2-kv div{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--cine-line)}
.cine2-kv div:last-child{border-bottom:0}
.cine2-kv span{color:var(--vg-muted)}
.cine2-kv b{font-weight:600;text-align:right;text-transform:capitalize}
.cine2-bar-track{height:4px;border-radius:99px;background:rgba(255,232,180,.08);overflow:hidden}
.cine2-bar-track>i{display:block;height:100%;border-radius:99px;background:var(--cine-grad);transition:width .5s ease}
.cine2-strip{margin-top:16px}
.cine2-strip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:10px}
.cine2-card{background:var(--cine-panel);border:1px solid var(--cine-line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:9px;cursor:pointer;transition:transform .2s ease,border-color .2s ease}
.cine2-card:hover{transform:translateY(-2px);border-color:var(--cine-hue)}
.cine2-section-title{margin:0 0 10px;font-family:var(--display);font-size:20px;letter-spacing:-.02em}
@media(max-width:1180px){.cine2-ws{grid-template-columns:minmax(300px,360px) minmax(0,1fr)}.cine2-right{grid-column:1/-1}}
@media(max-width:820px){.cine2-ws{grid-template-columns:minmax(0,1fr)}.cine2-stage{order:-1;min-height:280px}}
`;

const WORKSPACE_STEPS = ['Upload footage', 'Set preferences', 'Agent edits', 'Review the cut'];

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function HomeView(props: {
  projects: ProjectRow[];
  prefs: UserPrefs; setPrefs: (p: UserPrefs) => void;
  prefsOpen: boolean; setPrefsOpen: (b: boolean) => void;
  dragOver: boolean; setDragOver: (b: boolean) => void;
  error: string;
  onPick: () => void; onFile: (f: File) => void;
  onOpen: (row: ProjectRow) => void; onDelete: (row: ProjectRow) => void;
}) {
  const { projects, prefs, setPrefs, prefsOpen, setPrefsOpen, dragOver, setDragOver, error, onPick, onFile, onOpen, onDelete } = props;
  return (
    <div>
      <div className="cine2-ws">
        <aside className="cine2-panel" aria-label="Your footage">
          <div>
            <h2 style={{ fontSize: 18 }}>Your footage</h2>
            <p className="cine2-hint" style={{ marginTop: 6 }}>Talking head, tutorial, screen recording, ad, podcast or vlog. Up to 50MB per upload.</p>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            className={'cine2-drop' + (dragOver ? ' is-drag' : '')}
          >
            <Upload size={26} color={accent as string} />
            <b style={{ fontSize: 14 }}>Drop your footage here</b>
            <span className="cine2-hint">or choose a file with the button on the right</span>
            <button onClick={onPick} className="cine2-btn"><Film size={15} /> Choose a video</button>
          </div>
          {/* The failure is described rather than dumped: a wallet stop, a
              refused model and a dropped connection need different next steps,
              and Retry reopens the picker only when retrying can help. */}
          {error ? <VideoErrorCard error={error} subject="this edit" onRetry={onPick} compact /> : null}

          <div>
            <button onClick={() => setPrefsOpen(!prefsOpen)} className="cine2-btn" style={{ minHeight: 36, fontSize: 12.5 }}>
              <Settings2 size={14} /> {prefsOpen ? 'Hide' : 'Optional'} creative preferences
            </button>
          </div>
          {prefsOpen ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <p className="cine2-hint">{PREFS_HELPER}</p>
              <label>
                <span className="cine2-label">Note for the director</span>
                <input
                  value={prefs.tone || ''}
                  onChange={(e) => setPrefs({ ...prefs, tone: e.target.value })}
                  placeholder="Tone, audience, must-keep moments (optional)"
                  className="cine2-input"
                />
              </label>
              <div style={{ display: 'grid', gap: 12 }}>
                <PrefSelect label="Captions" value={prefs.captions || 'auto'} options={['auto', 'on', 'off']} notes={CAPTIONS_NOTES} onChange={(v) => setPrefs({ ...prefs, captions: v as UserPrefs['captions'] })} />
                <PrefSelect label="Music" value={prefs.music || 'auto'} options={['auto', 'on', 'off']} notes={MUSIC_NOTES} onChange={(v) => setPrefs({ ...prefs, music: v as UserPrefs['music'] })} />
                <PrefSelect label="Framing" value={prefs.framing || 'auto'} options={['auto', 'fit', 'cover']} notes={FRAMING_NOTES} previews={FRAMING_PREVIEWS} onChange={(v) => setPrefs({ ...prefs, framing: v as UserPrefs['framing'] })} />
                <PrefSelect label="Motion" value={prefs.intensity || 'balanced'} options={['subtle', 'balanced', 'expressive']} notes={MOTION_NOTES} onChange={(v) => setPrefs({ ...prefs, intensity: v as UserPrefs['intensity'] })} />
              </div>
            </div>
          ) : null}
        </aside>

        <section className="cine2-stage" aria-label="Finished cut preview">
          <div className="cine2-empty">
            <span className="cine2-icon"><Wand2 size={28} aria-hidden /></span>
            <h3>Your finished cut appears here</h3>
            <p>The agent watches your footage, writes the edit, designs the motion graphics, scores it, renders it and reviews its own cut.</p>
            <ol className="cine2-steps">
              {WORKSPACE_STEPS.map((step, i) => (
                <li key={step} className={i === 0 ? 'is-on' : ''}><span className="n">{i + 1}</span><span>{step}</span><span className="st">{i === 0 ? 'Next' : ''}</span></li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="cine2-panel cine2-right" aria-label="What you get">
          <span className="cine2-eyebrow">What you get</span>
          <div className="cine2-kv">
            <div><span>Output</span><b>1080p MP4</b></div>
            <div><span>Captions</span><b>{prefs.captions || 'auto'}</b></div>
            <div><span>Music</span><b>{prefs.music || 'auto'}</b></div>
            <div><span>Framing</span><b>{prefs.framing || 'auto'}</b></div>
            <div><span>Motion</span><b>{prefs.intensity || 'balanced'}</b></div>
          </div>
          <p className="cine2-hint">The plan is saved as it goes. Close the tab and reopen the project to pick up where it left off.</p>
          <button onClick={onPick} className="cine2-gold"><Film size={17} /> Choose a video</button>
        </aside>
      </div>

      {projects.length ? (
        <section className="cine2-strip">
          <h3 className="cine2-section-title">Your projects</h3>
          <div className="cine2-strip-grid">
            {projects.map((p) => <ProjectCard key={p.id} row={p} onOpen={() => onOpen(p)} onDelete={() => onDelete(p)} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PrefSelect({ label, value, options, onChange, notes, previews }: { label: string; value: string; options: string[]; onChange: (v: string) => void; notes?: Record<string, string>; previews?: Record<string, string | undefined> }) {
  const note = notes?.[value];
  const preview = previews?.[value];
  return (
    <div style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}>
      <label>
        <span className="cine2-label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="cine2-input" style={{ textTransform: 'capitalize' }}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      {note ? <div style={{ fontSize: 11.5, lineHeight: 1.4, color: textMuted }}>{note}</div> : null}
      {preview ? (
        <div style={{ width: '100%', maxWidth: 220 }}>
          <OptionThumb key={preview} src={preview} style={{ border: '1px solid var(--vg-border)' }} />
        </div>
      ) : null}
    </div>
  );
}

function ProjectCard({ row, onOpen, onDelete }: { row: ProjectRow; onOpen: () => void; onDelete: () => void }) {
  const statusColor = row.status === 'done' ? 'var(--vg-success)'
    : row.status === 'failed' ? 'var(--vg-danger)' : accent;
  const pct = row.status === 'done' ? 100 : row.progress?.pct || 0;
  return (
    <div className="cine2-card" onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clapperboard size={17} color={statusColor as string} />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name || 'Untitled'}</div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete project" aria-label="Delete project" className="cine2-btn" style={{ minHeight: 32, width: 32, padding: 0 }}><Trash2 size={13} /></button>
      </div>
      <div style={{ fontSize: 12, color: textMuted }}>
        {row.status === 'done' && row.result ? ('Finished — ' + fmtClock(row.result.durationSec)) : row.status === 'failed' ? 'Failed — open for details' : (STAGE_LABELS[row.stage as StageId] || 'Running') + (row.progress?.detail ? ' · ' + row.progress.detail : '')}
      </div>
      <div className="cine2-bar-track"><i style={{ width: pct + '%', background: row.status === 'failed' ? 'var(--vg-danger)' : undefined }} /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run view
// ---------------------------------------------------------------------------

function RunView({ row, onStop, onResume, running }: { row: ProjectRow; onStop: () => void; onResume: () => void; running: boolean }) {
  const [showPlan, setShowPlan] = useState(false);
  const stageIdx = Math.max(0, STAGE_ORDER.indexOf(row.stage as StageId));
  const latestQA: QAReport | null = Array.isArray(row.qa) && row.qa.length ? row.qa[row.qa.length - 1] : null;
  const timing = row.plan ? computeTiming(row.plan) : null;
  const pct = row.status === 'done' ? 100 : row.progress?.pct || 0;
  const statusLine = row.status === 'done' ? 'Finished — review and download.'
    : row.status === 'failed' ? 'The run stopped — details below.'
    : (STAGE_LABELS[row.stage as StageId] || 'Working') + (row.progress?.detail ? ' · ' + row.progress.detail : '');
  const spin: CSSProperties = { animation: 'cine-spin 1s linear infinite' };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="cine2-ws">
        <aside className="cine2-panel" aria-label="Progress">
          <div>
            <h2 style={{ fontSize: 18 }}>{row.plan?.title || row.name || 'Your film'}</h2>
            <p className="cine2-hint" style={{ marginTop: 6 }}>{statusLine}</p>
          </div>
          <div className="cine2-bar-track"><i style={{ width: pct + '%', background: row.status === 'failed' ? 'var(--vg-danger)' : undefined }} /></div>
          <ol className="cine2-steps" style={{ marginTop: 0 }}>
            {STAGE_ORDER.map((s, i) => {
              const done = row.status === 'done' || i < stageIdx;
              const activeStage = row.status === 'running' && i === stageIdx;
              return (
                <li key={s} className={done ? 'is-done' : activeStage ? 'is-on' : ''} style={{ background: 'color-mix(in srgb, var(--vg-raised) 70%, transparent)', borderColor: activeStage ? undefined : 'var(--cine-line)', color: 'var(--vg-text)' }}>
                  <span className="n">{done ? <CheckCircle2 size={13} /> : activeStage ? <Loader2 size={13} style={spin} /> : i + 1}</span>
                  <span>{STAGE_LABELS[s]}</span>
                  <span className="st" style={{ color: 'var(--vg-muted)' }}>{done ? 'Done' : activeStage ? 'Running' : ''}</span>
                </li>
              );
            })}
          </ol>
          {row.status === 'running' && running ? (
            <button onClick={onStop} className="cine2-btn"><Square size={14} /> Pause</button>
          ) : row.status === 'running' ? (
            <button onClick={onResume} className="cine2-gold"><RefreshCw size={15} /> Resume run</button>
          ) : null}
        </aside>

        <section className="cine2-stage" aria-label="Finished cut">
          {row.status === 'done' && row.result ? (
            <video controls playsInline src={row.result.url} />
          ) : row.status === 'failed' ? (
            <div className="cine2-empty">
              <span className="cine2-icon" style={{ color: 'var(--vg-danger)' }}><AlertTriangle size={26} aria-hidden /></span>
              <h3>The run could not finish</h3>
              <p>{row.error || 'Unknown error.'}</p>
              <p>Completed stages are saved. Fix the cause (for example wallet balance or file size) and start again; analysis and finished assets are reused where possible.</p>
            </div>
          ) : (
            <div className="cine2-empty">
              <span className="cine2-icon"><Loader2 size={26} style={spin} aria-hidden /></span>
              <h3>{STAGE_LABELS[row.stage as StageId] || 'Working'}</h3>
              <p>{row.progress?.detail || 'The agent is working on your cut. It appears here the moment it is rendered.'}</p>
              <div className="cine2-bar-track" style={{ width: '100%', background: 'rgba(255,255,255,.12)' }}><i style={{ width: pct + '%' }} /></div>
            </div>
          )}
        </section>

        <aside className="cine2-panel cine2-right" aria-label="Review and download">
          <span className="cine2-eyebrow">Review</span>
          {latestQA ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontFamily: 'var(--display)', fontSize: 38, letterSpacing: '-.03em', lineHeight: 1 }}>{Math.round(latestQA.score * 100)}</b>
              <span style={{ color: textMuted, fontSize: 13 }}>/100 review score</span>
              <Sparkles size={15} color={latestQA.shippable ? 'var(--vg-success)' : accent as string} style={{ marginLeft: 'auto' }} />
            </div>
          ) : <p className="cine2-hint">The agent reviews its own cut before handing it over. The score appears here.</p>}
          {latestQA?.summary ? <p className="cine2-hint" style={{ color: textPrimary }}>{latestQA.summary}</p> : null}
          {latestQA && latestQA.defects.filter((d) => d.action !== 'accept').length ? (
            <div style={{ fontSize: 12.5, color: textMuted }}>
              <div style={{ fontWeight: 700, color: accent, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} /> Open notes from the reviewer</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {latestQA.defects.filter((d) => d.action !== 'accept').slice(0, 5).map((d, i) => <li key={i}>{d.where}: {d.issue}</li>)}
              </ul>
            </div>
          ) : null}
          {row.status === 'done' && row.result ? (
            <>
              <div className="cine2-kv">
                <div><span>Length</span><b>{fmtClock(row.result.durationSec)}</b></div>
                <div><span>Quality</span><b>1080p</b></div>
                <div><span>Rendered</span><b style={{ textTransform: 'none' }}>{new Date(row.result.renderedAt).toLocaleString()}</b></div>
              </div>
              <a href={row.result.url} download={(row.plan?.title || row.name || 'cineagent') + '.mp4'} target="_blank" rel="noreferrer" className="cine2-gold">
                <Download size={16} /> Download MP4
              </a>
            </>
          ) : <p className="cine2-hint">Download unlocks when the cut is finished.</p>}
        </aside>
      </div>

      {/* Director's plan (optional transparency) */}
      {row.plan ? (
        <div className="cine2-panel">
          <button onClick={() => setShowPlan(!showPlan)} className="cine2-btn" style={{ alignSelf: 'flex-start' }}>
            <Eye size={15} /> {showPlan ? 'Hide' : 'See'} what the agent decided
          </button>
          {showPlan ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {row.plan.direction ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: textPrimary }}><b style={{ color: accent }}>Director’s note:</b> {row.plan.direction}</p> : null}
              <div style={{ fontSize: 12.5, color: textMuted }}>
                {row.plan.timeline.length} segments · {row.plan.overlays.length} motion graphics · {row.plan.assets.length} generated assets
                {timing ? ' · ' + fmtClock(timing.duration) + ' planned cut' : ''}
                {' · captions ' + (row.plan.captions.enabled ? 'on (' + row.plan.captions.style.preset + ')' : 'off')}
                {row.plan.audio.music ? ' · scored' : ''}
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
                {row.plan.timeline.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '8px 12px', background: 'var(--vg-raised)', borderRadius: 9 }}>
                    <span style={{ color: accent, fontWeight: 700, minWidth: 74, textTransform: 'uppercase', fontSize: 11 }}>{s.kind}</span>
                    <span style={{ color: textMuted }}>
                      {s.kind === 'source' && s.src ? fmtClock(s.src.start) + '–' + fmtClock(s.src.end) : (s.duration || 0).toFixed(1) + 's'}
                    </span>
                    <span style={{ flex: 1, color: textPrimary }}>{s.note || (s.kind === 'board' && s.board ? s.board.type : s.assetId || '')}</span>
                  </div>
                ))}
                {row.plan.overlays.map((o) => (
                  <div key={o.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '8px 12px', background: 'var(--vg-gold-tint)', borderRadius: 9 }}>
                    <span style={{ color: 'var(--vg-accent-hover)', fontWeight: 700, minWidth: 74, fontSize: 11 }}>GRAPHIC</span>
                    <span style={{ color: textMuted }}>{fmtClock(o.at)} · {o.duration.toFixed(1)}s</span>
                    <span style={{ flex: 1, color: textPrimary }}>{o.spec.type}{o.note ? ' — ' + o.note : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Activity log */}
      <div className="cine2-panel">
        <div className="cine2-eyebrow">Agent activity</div>
        <ActivityLog lines={row.activity || []} />
      </div>
    </div>
  );
}

function ActivityLog({ lines }: { lines: ActivityLine[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [lines.length]);
  if (!lines.length) return <div style={{ fontSize: 13, color: textMuted, display: 'flex', alignItems: 'center', gap: 8 }}><Circle size={10} /> Waiting for the agent…</div>;
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 7, fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: 12 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, lineHeight: 1.5 }}>
          <span style={{ color: textMuted, flexShrink: 0 }}>{new Date(l.t).toLocaleTimeString()}</span>
          <span style={{
            color: l.kind === 'error' ? 'var(--vg-danger)'
              : l.kind === 'warn' ? accent
              : l.kind === 'ok' ? 'var(--vg-success)'
              : textPrimary,
          }}>{l.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
