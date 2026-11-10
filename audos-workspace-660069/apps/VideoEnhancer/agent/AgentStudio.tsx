import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AlertCircle, ArrowUp, Bot, Check, Clock, Download, ExternalLink, Film, Layers, Library, Loader2, Plus, Redo2, RefreshCw,
  RotateCcw, Sparkles, Trash2, Undo2, Upload, Wand2, X,
} from 'lucide-react';
import { useCredits } from '../../../lib/credits';
import { openPricing } from '../../../lib/plans';
import { listVideoHistory, type VideoHistoryRow } from '../../../lib/videoHistory';
import ComparePlayer from '../enhance/ComparePlayer';
import { downloadFile } from '../enhance/enhanceIO';
import { OUTPUT_FPS, effectLayers, formatBytes, formatDuration, safeFileName } from '../enhance/enhanceModel';
import { ENHANCE_CSS } from '../enhance/enhanceStyles';
import { CREDIT_CAP_CHOICES, OMNI_MAX_CHUNK_S } from './agentConfig';
import { activeSteps, buildPieces, isStageStep, previewFilter, projectGrade, restoreParams, workingMedia } from './agentCompose';
import { LOOK_PRESETS, OP_META } from './agentOps';
import {
  applyPreset, approvePaid, createFromFile, createFromLibrary, deleteProject, isBusy, isPlanning, loadProjects, paidWork, previewSource, reattachFile,
  removeStep, retryChunk, retryRender, retryStep, retryUpload, sendMessage, setCreditCap, toggleStep, useAgentProjects,
} from './agentStore';
import { AGENT_CSS } from './agentStyles';
import type { AgentProject, ChatMessage, OmniChunk, Step } from './agentTypes';
import { AGENT_LOOKS_HELP, OptionThumb, previewFor } from '../optionPreviews';

const SELECTED_KEY = 'video-enhancer:agent-selected';
const RESTORE_FILTER_ID = 'vea-restore';
const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm';

const EXAMPLES = [
  'Make it cinematic, steady the camera and add a moody score',
  'Cut the pauses, clean up my voice and add bold captions',
  'Turn this into a 9:16 reel that follows me, with captions',
  'Replace the background with a sunlit modern office',
  'Restyle the first 8 seconds as a hand-drawn anime scene',
];

type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function readSelected(): string | null {
  try { return window.localStorage.getItem(SELECTED_KEY); } catch { return null; }
}

function stepTone(step: Step): { label: string; tone: string } {
  if (!step.enabled || step.supersededBy) return { label: step.supersededBy ? 'Replaced' : 'Undone', tone: 'neutral' };
  switch (step.status) {
    case 'running': return { label: 'Running', tone: 'active' };
    case 'done': return { label: 'Done', tone: 'good' };
    case 'error': return { label: 'Failed', tone: 'bad' };
    case 'awaiting': return { label: 'Needs OK', tone: 'info' };
    case 'skipped': return { label: 'Skipped', tone: 'neutral' };
    default: return { label: 'Queued', tone: 'info' };
  }
}

function RestoreDefs({ project }: { project: AgentProject | null }) {
  const restore = project ? restoreParams(project) : null;
  if (!restore || (!restore.denoise && !restore.sharpen)) return null;
  const amount = (restore.sharpen / 100) * 0.9;
  const base = restore.denoise > 0 ? 'veaSoft' : 'SourceGraphic';
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id={RESTORE_FILTER_ID} colorInterpolationFilters="sRGB">
          {restore.denoise > 0 ? <feGaussianBlur in="SourceGraphic" stdDeviation={(0.2 + (restore.denoise / 100) * 0.6).toFixed(3)} result="veaSoft" /> : null}
          {restore.sharpen > 0 ? <feGaussianBlur in={base} stdDeviation="1" result="veaWide" /> : null}
          {restore.sharpen > 0 ? <feComposite in={base} in2="veaWide" operator="arithmetic" k1={0} k2={1 + amount} k3={-amount} k4={0} /> : null}
        </filter>
      </defs>
    </svg>
  );
}

export default function AgentStudio() {
  const { projects, loaded } = useAgentProjects();
  const { credits, loading: creditsLoading } = useCredits();
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [dragOver, setDragOver] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<{ state: 'idle' | 'loading' | 'ready' | 'error'; rows: VideoHistoryRow[] }>({ state: 'idle', rows: [] });
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [panel, setPanel] = useState<'stack' | 'exports'>('stack');
  const addInput = useRef<HTMLInputElement | null>(null);
  const reattachInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = (toastId.current += 1);
    setToasts((items) => [...items.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), tone === 'bad' ? 9000 : 5000);
  }, []);

  useEffect(() => {
    void loadProjects();
    const reload = () => { void loadProjects(); };
    window.addEventListener('audos:session-established', reload);
    return () => window.removeEventListener('audos:session-established', reload);
  }, []);

  const project = useMemo(() => projects.find((p) => p.id === selectedId) || projects[0] || null, [projects, selectedId]);

  useEffect(() => {
    try { if (project) window.localStorage.setItem(SELECTED_KEY, project.id); } catch { /* storage unavailable */ }
  }, [project?.id]);

  const onFiles = useCallback((list: FileList | File[] | null) => {
    const file = Array.from(list || [])[0];
    if (!file) return;
    const result = createFromFile(file);
    if (result.error || !result.id) { notify(result.error || 'That file could not be added.', 'bad'); return; }
    setSelectedId(result.id);
    if (pendingPrompt.trim()) {
      const prompt = pendingPrompt;
      setPendingPrompt('');
      void sendMessage(result.id, prompt);
    }
    notify('Video added. It uploads while the agent plans.', 'good');
  }, [notify, pendingPrompt]);

  const openLibrary = async () => {
    setLibraryOpen(true);
    setLibrary({ state: 'loading', rows: [] });
    try {
      setLibrary({ state: 'ready', rows: (await listVideoHistory(36)).filter((row) => /^https:\/\//.test(row.video_url)) });
    } catch {
      setLibrary({ state: 'error', rows: [] });
    }
  };

  const importRow = (row: VideoHistoryRow) => {
    const id = createFromLibrary(row);
    setLibraryOpen(false);
    if (!id) { notify('That library video has no downloadable source.', 'bad'); return; }
    setSelectedId(id);
    notify(`${row.title || 'Library video'} is ready for the agent.`, 'good');
  };

  const onDragEnter = (event: ReactDragEvent) => {
    if (!Array.from(event.dataTransfer.types || []).includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragOver(false);
  };
  const onDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    onFiles(event.dataTransfer.files);
  };

  const balance = credits ? (credits.unlimited ? Infinity : credits.balance) : null;
  const creditLabel = creditsLoading && !credits ? 'Checking credits…' : !credits ? 'Sign in to use credits' : credits.unlimited ? 'Unlimited credits' : `${credits.balance.toLocaleString()} credits`;

  return (
    <div className="ves vea" onDragEnter={onDragEnter} onDragOver={(event) => { if (Array.from(event.dataTransfer.types || []).includes('Files')) event.preventDefault(); }} onDragLeave={onDragLeave} onDrop={onDrop}>
      <style>{ENHANCE_CSS}{AGENT_CSS}</style>
      <RestoreDefs project={project} />
      <input ref={addInput} hidden type="file" accept={ACCEPT} onChange={(event) => { onFiles(event.target.files); event.target.value = ''; }} />
      <input ref={reattachInput} hidden type="file" accept={ACCEPT} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !project) return;
        const problem = reattachFile(project.id, file);
        notify(problem || 'File re-attached. The upload has restarted.', problem ? 'bad' : 'good');
      }} />

      <header className="ves-head vea-head">
        <div className="ves-title">
          <h2><Bot size={17} /> Enhancer Agent</h2>
          <p>{project ? `${project.title} · ${formatDuration(project.source.duration)}${project.source.bytes ? ` · ${formatBytes(project.source.bytes)}` : ''}` : 'Describe the edit in plain words. The agent plans it, runs it and lets you undo any step.'}</p>
        </div>
        {projects.length ? (
          <label className="vea-picker">
            <span className="sr-only">Project</span>
            <select value={project?.id || ''} onChange={(event) => setSelectedId(event.target.value)} aria-label="Choose a project">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        ) : null}
        <span className="ve-credit-chip" title="Your credit balance">{creditLabel}</span>
        <button type="button" className="ve-btn hide-sm" onClick={() => void openLibrary()}><Library size={15} />Library</button>
        <button type="button" className="ve-btn primary" onClick={() => addInput.current?.click()}><Plus size={15} />New video</button>
      </header>

      {!loaded && !projects.length ? (
        <div className="ves-loading"><Loader2 size={18} className="ve-spin" />Loading your agent projects…</div>
      ) : !project ? (
        <AgentEmpty prompt={pendingPrompt} setPrompt={setPendingPrompt} onChoose={() => addInput.current?.click()} onLibrary={() => void openLibrary()} />
      ) : (
        <div className="vea-body">
          <ChatPanel key={`chat-${project.id}`} project={project} balance={balance} />
          <main className="vea-main">
            <PreviewPanel key={`prev-${project.id}`} project={project} onReattach={() => reattachInput.current?.click()} notify={notify} />
            <Timeline project={project} />
          </main>
          <aside className="vea-side" aria-label="Operation stack and exports">
            <div className="ve-seg full vea-side-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={panel === 'stack'} className={panel === 'stack' ? 'on' : ''} onClick={() => setPanel('stack')}><Layers size={13} /> Stack</button>
              <button type="button" role="tab" aria-selected={panel === 'exports'} className={panel === 'exports' ? 'on' : ''} onClick={() => setPanel('exports')}><Download size={13} /> Exports{project.exports.length ? ` (${project.exports.length})` : ''}</button>
            </div>
            {panel === 'stack' ? <StackPanel project={project} /> : <ExportsPanel project={project} notify={notify} />}
            <div className="vea-side-foot">
              <button type="button" className="ve-link" disabled={isBusy(project)} onClick={() => { if (window.confirm(`Remove “${project.title}” from your agent projects? Exported videos stay in your Video Library.`) && deleteProject(project.id)) setSelectedId(null); }}>
                <Trash2 size={12} /> Remove project
              </button>
            </div>
          </aside>
        </div>
      )}

      {dragOver ? <div className="ves-drop-overlay"><Upload size={26} /><b>Drop a video to start a new agent edit</b><span>MP4, MOV, M4V or WebM · up to 500 MB · up to 10 minutes</span></div> : null}

      {libraryOpen ? (
        <div className="ves-modal" role="dialog" aria-modal="true" aria-label="Import from Video Library" onClick={() => setLibraryOpen(false)}>
          <div className="ves-modal-card" onClick={(event) => event.stopPropagation()}>
            <header><h3>Edit a video from your library</h3><button type="button" className="ve-icon-btn" onClick={() => setLibraryOpen(false)} aria-label="Close"><X size={16} /></button></header>
            {library.state === 'loading' ? <div className="ves-modal-state"><Loader2 size={18} className="ve-spin" />Loading your videos…</div> : null}
            {library.state === 'error' ? <div className="ves-modal-state bad"><AlertCircle size={18} />Your library could not be loaded.<button type="button" className="ve-btn small" onClick={() => void openLibrary()}><RefreshCw size={13} />Retry</button></div> : null}
            {library.state === 'ready' && !library.rows.length ? <div className="ves-modal-state"><Film size={18} />No videos in your library yet.</div> : null}
            {library.state === 'ready' && library.rows.length ? (
              <ul className="ves-library">
                {library.rows.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => importRow(row)}>
                      <span className="ves-thumb">{row.thumbnail_url ? <img src={row.thumbnail_url} alt="" /> : <Film size={16} />}</span>
                      <span className="ves-job-text"><b>{row.title || 'Untitled video'}</b><small>{[row.app_id.replace(/-/g, ' '), row.duration_sec ? formatDuration(row.duration_sec) : ''].filter(Boolean).join(' · ')}</small></span>
                      <span className="ve-btn small">Edit</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="ves-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ves-toast ${toast.tone}`} role={toast.tone === 'bad' ? 'alert' : 'status'}>
            <span>{toast.text}</span>
            <button type="button" className="ve-icon-btn small" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Dismiss"><X size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentEmpty({ prompt, setPrompt, onChoose, onLibrary }: { prompt: string; setPrompt: (value: string) => void; onChoose: () => void; onLibrary: () => void }) {
  return (
    <div className="ves-empty vea-empty">
      <div className="ves-empty-drop">
        <Sparkles size={28} />
        <h3>Drop a video, then tell the agent what you want</h3>
        <p>It plans the edit, runs every step automatically and shows you a before/after. Undo anything with one tap.</p>
        <textarea className="vea-empty-prompt" rows={2} value={prompt} placeholder="Optional: describe the edit now, e.g. “cut the pauses and add bold captions”" onChange={(event) => setPrompt(event.target.value)} aria-label="Describe the edit" />
        <div className="ves-empty-actions">
          <button type="button" className="ve-btn primary" onClick={onChoose}><Upload size={15} />Choose a video</button>
          <button type="button" className="ve-btn" onClick={onLibrary}><Library size={15} />From your Video Library</button>
        </div>
        <small className="ve-help">MP4, MOV, M4V or WebM · up to 500 MB and 10 minutes</small>
      </div>
      <ol className="ves-steps vea-looks">
        {LOOK_PRESETS.map((preset) => <li key={preset.id}><b>{preset.label}</b><span>{preset.hint}</span></li>)}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function ChatPanel({ project, balance }: { project: AgentProject; balance: number | null }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const planning = project.phase === 'planning' || isPlanning(project.id);
  const work = paidWork(project);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [project.messages.length, planning]);

  const send = (text = draft) => {
    if (!text.trim() || planning) return;
    void sendMessage(project.id, text);
    setDraft('');
  };
  const onKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
  };
  const stepsById = new Map(project.steps.map((step) => [step.id, step]));

  return (
    <section className="vea-chat" aria-label="Enhancer Agent chat">
      <div className="vea-messages" ref={listRef} aria-live="polite">
        {!project.messages.length ? (
          <div className="vea-greeting">
            <Bot size={20} />
            <b>What should this video become?</b>
            <p>Describe the result in your own words — the look, the pacing, the format. I’ll plan the steps, run them and show a before/after. Free steps run straight away; paid AI steps show their credit cost first.</p>
            <div className="vea-suggest">
              {EXAMPLES.map((example) => <button key={example} type="button" className="ve-pill" onClick={() => send(example)}>{example}</button>)}
            </div>
          </div>
        ) : null}
        {project.messages.map((m) => <MessageBubble key={m.id} message={m} steps={stepsById} project={project} balance={balance} />)}
        {planning ? <div className="vea-msg agent thinking"><Loader2 size={14} className="ve-spin" /> Planning your edit…</div> : null}
      </div>
      <div className="vea-composer">
        <textarea
          rows={2}
          value={draft}
          disabled={planning}
          placeholder={planning ? 'Planning…' : 'Tell the agent what to change…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKey}
          aria-label="Message the Enhancer Agent"
        />
        <button type="button" className="ve-icon-btn primary vea-send" disabled={planning || !draft.trim()} onClick={() => send()} aria-label="Send"><ArrowUp size={16} /></button>
      </div>
      <div className="vea-cap">
        <label>
          Auto-spend up to
          <select value={project.creditCap} onChange={(event) => setCreditCap(project.id, Number(event.target.value))} aria-label="Credits the agent may spend without asking">
            {CREDIT_CAP_CHOICES.map((value) => <option key={value} value={value}>{value === 0 ? '0 (always ask)' : `${value} credits`}</option>)}
          </select>
        </label>
        <small title="Priced at real engine cost + 30% ($0.15 per credit): Omni Flash steps by the seconds they process, the final Remotion render per 3-minute part.">
          {work.total ? `Next run ≈ ${work.total} credit${work.total === 1 ? '' : 's'}` : 'Nothing paid pending'}
        </small>
      </div>
    </section>
  );
}

function MessageBubble({ message, steps, project, balance }: { message: ChatMessage; steps: Map<string, Step>; project: AgentProject; balance: number | null }) {
  const linked = (message.stepIds || []).map((id) => steps.get(id)).filter(Boolean) as Step[];
  const short = message.awaitingApproval && balance !== null && Number.isFinite(balance) && (message.estimate || 0) > balance;
  return (
    <div className={`vea-msg ${message.role}${message.tone ? ` ${message.tone}` : ''}`}>
      {message.role !== 'user' && message.model ? <span className="vea-model">{message.model}</span> : null}
      <p>{message.text}</p>
      {linked.length ? (
        <ul className="vea-plan">
          {linked.map((step) => {
            const tone = stepTone(step);
            return (
              <li key={step.id} className={!step.enabled || step.supersededBy ? 'off' : ''}>
                <i className={`ve-chip ${tone.tone}`}>{tone.tone === 'active' ? <Loader2 size={10} className="ve-spin" /> : tone.tone === 'good' ? <Check size={10} /> : null}{tone.label}</i>
                <span>{step.label}</span>
                {step.estimate ? <em>{step.estimate} cr</em> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {message.estimate && message.role === 'agent' && linked.some((s) => s.estimate) ? <small className="vea-cost">Paid steps ≈ {message.estimate} credits · the final render adds 1 credit per started 3 minutes</small> : null}
      {message.awaitingApproval ? (
        <div className="vea-approve">
          <button type="button" className="ve-btn primary small" disabled={short} onClick={() => approvePaid(project.id)}><Wand2 size={13} />Continue · {message.estimate} credits</button>
          {short ? <button type="button" className="ve-btn small" onClick={() => openPricing('credits', { required: message.estimate })}>Top up</button> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function PreviewPanel({ project, onReattach, notify }: { project: AgentProject; onReattach: () => void; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [now, setNow] = useState(Date.now());
  const [downloading, setDownloading] = useState<number | null>(null);
  const before = previewSource(project);
  const working = workingMedia(project);
  const render = project.render;
  const rendered = render.status === 'done' && render.url ? render.url : null;
  const stageUrl = working && working.url !== project.source.url ? working.url : null;
  const after = rendered || stageUrl;
  const restore = restoreParams(project);
  const filter = after ? 'none' : previewFilter(project, restore && (restore.denoise || restore.sharpen) ? RESTORE_FILTER_ID : null);
  const layers = after ? [] : effectLayers(projectGrade(project));
  const aspect = rendered && render.output?.width && render.output?.height
    ? render.output.width / render.output.height
    : project.source.width && project.source.height ? project.source.width / project.source.height : 16 / 9;
  const active = project.phase === 'running' || project.phase === 'rendering' || project.phase === 'planning' || project.source.upload.state === 'uploading';
  const runningStep = project.steps.find((step) => step.enabled && step.status === 'running');

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const download = async () => {
    if (!rendered || downloading !== null) return;
    setDownloading(0);
    const result = await downloadFile(rendered, `${safeFileName(project.title)}-agent-${render.output?.height || 1080}p.mp4`, (f) => setDownloading(f));
    setDownloading(null);
    notify(result === 'saved' ? 'Download started.' : 'Opened the video in a new tab. Use your browser’s Save option to keep it.', result === 'saved' ? 'good' : 'info');
  };

  return (
    <div className="vea-preview">
      {before ? (
        <ComparePlayer
          beforeSrc={before}
          afterSrc={after}
          afterFilter={filter}
          afterLayers={layers}
          aspect={aspect}
          fps={OUTPUT_FPS}
          afterLabel={rendered ? 'Agent edit' : stageUrl ? 'AI stage' : 'Live preview'}
        />
      ) : (
        <div className="ves-noplayer"><Loader2 size={22} className="ve-spin" /><b>Preparing preview…</b><span>Reading the file.</span></div>
      )}

      {project.source.upload.state === 'uploading' ? (
        <div className="ves-banner active"><Loader2 size={16} className="ve-spin" /><div><b>Uploading {Math.round(project.source.upload.progress * 100)}%</b><span>The agent can plan while this finishes; steps start as soon as the upload lands.</span></div></div>
      ) : null}
      {project.source.upload.state === 'error' ? (
        <div className="ves-banner bad" role="alert"><AlertCircle size={16} /><div><b>Upload failed</b><span>{project.error || 'The upload did not finish.'}</span></div>
          <div className="ves-banner-actions"><button type="button" className="ve-btn primary" onClick={() => { if (retryUpload(project.id) === 'needs-file') onReattach(); }}><RotateCcw size={14} />Retry upload</button></div>
        </div>
      ) : null}
      {project.phase === 'error' && project.source.upload.state !== 'error' && !project.source.duration ? (
        <div className="ves-banner bad" role="alert"><AlertCircle size={16} /><div><b>This video can’t be used</b><span>{project.error}</span></div></div>
      ) : null}
      {project.phase === 'running' && project.source.url ? (
        <div className="ves-banner active"><Loader2 size={16} className="ve-spin" /><div><b>{runningStep ? runningStep.label : 'Working through the plan'}</b><span>{runningStep?.detail || 'Running each step in order.'}{runningStep?.progress != null ? ` · ${Math.round(runningStep.progress * 100)}%` : ''}</span></div></div>
      ) : null}
      {project.phase === 'awaiting' ? (
        <div className="ves-banner info"><Clock size={16} /><div><b>Waiting for your OK</b><span>Paid steps are paused above your auto-spend limit. Press Continue in the chat.</span></div></div>
      ) : null}
      {render.status === 'rendering' ? (
        <div className="ves-banner active"><Loader2 size={16} className="ve-spin" /><div><b>{render.stage || 'Rendering'}</b><span>{render.startedAt ? `Elapsed ${clock(now - render.startedAt)}. ` : ''}You can close this page; the render keeps going and resumes here.</span></div></div>
      ) : null}
      {rendered && project.phase !== 'rendering' ? (
        <div className="ves-banner good"><Check size={16} /><div><b>Agent edit ready · {render.output ? `${render.output.width}×${render.output.height} · ${formatDuration(render.output.duration)}` : ''}</b><span>Saved to Exports and your Video Library. Undo any step to compare versions.</span></div>
          <div className="ves-banner-actions">
            <button type="button" className="ve-btn primary" onClick={() => void download()} disabled={downloading !== null}>
              {downloading !== null ? <Loader2 size={14} className="ve-spin" /> : <Download size={14} />}{downloading !== null ? (downloading > 0 ? `Downloading ${Math.round(downloading * 100)}%` : 'Preparing…') : 'Download MP4'}
            </button>
            <a className="ve-btn" href={rendered} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open</a>
          </div>
        </div>
      ) : null}
      {render.status === 'error' ? (
        <div className="ves-banner bad" role="alert"><AlertCircle size={16} /><div><b>Render failed</b><span>{render.error}</span></div>
          <div className="ves-banner-actions"><button type="button" className="ve-btn primary" onClick={() => retryRender(project.id)}><RotateCcw size={14} />Retry render</button></div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Timeline({ project }: { project: AgentProject }) {
  const duration = project.source.duration || 0;
  if (!duration) return null;
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0.4, ((Math.min(duration, b) - Math.max(0, a)) / duration) * 100)}%`;
  const pieces = buildPieces(project, duration);
  const steps = activeSteps(project);
  const omni = steps.filter((step) => step.engine === 'omni' && step.chunks?.length);
  const texts = steps.filter((step) => step.type === 'text');
  const broll = steps.filter((step) => step.type === 'broll');
  const captions = steps.find((step) => step.type === 'captions' && step.result?.words?.length);
  const ticks = Array.from({ length: 6 }, (_, i) => (duration * i) / 5);
  return (
    <section className="vea-timeline" aria-label="Timeline">
      <header><h3>Timeline</h3><small>{pieces.length > 1 ? `${pieces.length} segments kept` : 'Full clip'}{omni.length ? ` · Omni segments ≤${OMNI_MAX_CHUNK_S}s` : ''}</small></header>
      <div className="vea-ruler">{ticks.map((t) => <span key={t} style={{ left: pct(t) }}>{formatDuration(t)}</span>)}</div>
      <div className="vea-lane"><b>Picture</b><div className="vea-track cut">
        {pieces.map((piece) => <span key={piece.srcStart} className={`keep${piece.rate !== 1 || piece.ramp !== 'none' ? ' speed' : ''}`} style={{ left: pct(piece.srcStart), width: width(piece.srcStart, piece.srcEnd) }} title={`${formatDuration(piece.srcStart)}–${formatDuration(piece.srcEnd)}${piece.rate !== 1 ? ` · ${piece.rate}×` : ''}${piece.ramp !== 'none' ? ` · ${piece.ramp} ramp` : ''}`} />)}
      </div></div>
      {omni.map((step) => (
        <div className="vea-lane" key={step.id}><b title={step.label}>{OP_META[step.type].short}</b><div className="vea-track">
          {(step.chunks || []).map((chunk) => <ChunkBlock key={chunk.index} chunk={chunk} style={{ left: pct(chunk.start), width: width(chunk.start, chunk.end) }} onRetry={() => retryChunk(project.id, step.id, chunk.index)} />)}
        </div></div>
      ))}
      {captions ? (
        <div className="vea-lane"><b>Captions</b><div className="vea-track">
          {captions.result!.words!.filter((_, i) => i % 3 === 0).map((w, i) => <span key={i} className="word" style={{ left: pct(w.start) }} />)}
        </div></div>
      ) : null}
      {texts.length || broll.length ? (
        <div className="vea-lane"><b>Overlays</b><div className="vea-track">
          {texts.map((step) => <span key={step.id} className="overlay text" style={{ left: pct(step.params.start), width: width(step.params.start, step.params.end) }} title={step.label}>{String(step.params.text).slice(0, 18)}</span>)}
          {broll.map((step) => <span key={step.id} className={`overlay broll${step.status === 'error' ? ' bad' : ''}`} style={{ left: pct(step.params.at), width: width(step.params.at, step.params.at + step.params.duration) }} title={step.label}>B-roll</span>)}
        </div></div>
      ) : null}
    </section>
  );
}

function ChunkBlock({ chunk, style, onRetry }: { chunk: OmniChunk; style: { left: string; width: string }; onRetry: () => void }) {
  const label = `Segment ${chunk.index + 1}: ${formatDuration(chunk.start)}–${formatDuration(chunk.end)} · ${chunk.status}${chunk.error ? ` · ${chunk.error}` : ''}`;
  if (chunk.status === 'error') {
    return <button type="button" className="chunk error" style={style} onClick={onRetry} title={`${label}. Click to retry this segment.`} aria-label={`Retry segment ${chunk.index + 1}`}><RotateCcw size={10} /></button>;
  }
  return <span className={`chunk ${chunk.status}`} style={style} title={label}>{chunk.index + 1}</span>;
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

function StackPanel({ project }: { project: AgentProject }) {
  const busy = isBusy(project);
  const ordered = [...project.steps].sort((a, b) => Number(isStageStep(b)) - Number(isStageStep(a)));
  return (
    <div className="vea-stack">
      <section className="ves-section">
        <header><h3>One-click looks</h3></header>
        <p className="ve-help" style={{ margin: '0 0 8px' }}>{AGENT_LOOKS_HELP}</p>
        <div className="vea-preset-grid">
          {LOOK_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="ves-preset" disabled={!project.source.duration || project.phase === 'planning'} onClick={() => applyPreset(project.id, preset.id)} title={preset.hint}>
              <OptionThumb src={previewFor('agent-look', preset.id)} style={{ marginBottom: 4 }} />
              <b>{preset.label}</b><small>{preset.hint}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="ves-section">
        <header><h3>Operation stack</h3><small className="ve-help">{project.steps.filter((s) => s.enabled && !s.supersededBy).length} active</small></header>
        {!ordered.length ? <p className="ve-help">Steps the agent plans appear here in the order they run. Undo or retry any of them.</p> : null}
        <ol className="vea-steps">
          {ordered.map((step) => <StepRow key={step.id} project={project} step={step} busy={busy} />)}
        </ol>
      </section>
    </div>
  );
}

function StepRow({ project, step, busy }: { project: AgentProject; step: Step; busy: boolean }) {
  const tone = stepTone(step);
  const on = step.enabled && !step.supersededBy;
  const chunks = step.chunks || [];
  const doneChunks = chunks.filter((c) => c.status === 'done').length;
  return (
    <li className={`vea-step${on ? '' : ' off'}`}>
      <div className="vea-step-head">
        <i className={`ve-chip ${tone.tone}`}>{tone.tone === 'active' ? <Loader2 size={10} className="ve-spin" /> : null}{tone.label}</i>
        <b title={step.why || step.label}>{step.label}</b>
        {step.estimate ? <em className="vea-credits" title="Credits for this step">{step.estimate} cr</em> : null}
      </div>
      {step.detail || step.error ? <p className={step.error && on ? 'bad' : ''}>{on && step.error ? step.error : step.detail}</p> : null}
      {step.progress != null && step.status === 'running' ? <div className="ve-bar"><span style={{ width: `${Math.round(step.progress * 100)}%` }} /></div> : null}
      {chunks.length ? (
        <div className="vea-chunks" aria-label={`${doneChunks} of ${chunks.length} Omni segments done`}>
          {chunks.map((chunk) => (
            chunk.status === 'error'
              ? <button key={chunk.index} type="button" className="chunk error" onClick={() => retryChunk(project.id, step.id, chunk.index)} title={`Segment ${chunk.index + 1} failed: ${chunk.error || ''} Click to retry.`}><RotateCcw size={10} /></button>
              : <span key={chunk.index} className={`chunk ${chunk.status}`} title={`Segment ${chunk.index + 1} · ${formatDuration(chunk.start)}–${formatDuration(chunk.end)} · ${chunk.status}`}>{chunk.status === 'done' ? <Check size={9} /> : chunk.status === 'pending' ? chunk.index + 1 : <Loader2 size={9} className="ve-spin" />}</span>
          ))}
          <small>{doneChunks}/{chunks.length}</small>
        </div>
      ) : null}
      <div className="vea-step-actions">
        <button type="button" className="ve-btn small" onClick={() => toggleStep(project.id, step.id)} disabled={step.status === 'running'} title={on ? 'Switch this step off and re-render' : 'Switch this step back on'}>
          {on ? <><Undo2 size={12} />Undo</> : <><Redo2 size={12} />Redo</>}
        </button>
        {step.status === 'error' && on ? <button type="button" className="ve-btn small" onClick={() => retryStep(project.id, step.id)}><RefreshCw size={12} />Retry</button> : null}
        {!on ? <button type="button" className="ve-icon-btn small" onClick={() => removeStep(project.id, step.id)} disabled={busy} aria-label={`Remove ${step.label}`} title="Remove from the stack"><Trash2 size={12} /></button> : null}
      </div>
    </li>
  );
}

function ExportsPanel({ project, notify }: { project: AgentProject; notify: (text: string, tone?: Toast['tone']) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (url: string, kind: string, id: string) => {
    setBusy(id);
    const result = await downloadFile(url, `${safeFileName(project.title)}-${kind === 'cutout' ? 'cutout.webm' : 'agent.mp4'}`);
    setBusy(null);
    notify(result === 'saved' ? 'Download started.' : 'Opened in a new tab.', result === 'saved' ? 'good' : 'info');
  };
  if (!project.exports.length) return <div className="vea-stack"><p className="ve-help vea-pad">Every finished render lands here, newest first. Re-applying a version you already rendered reuses it for free.</p></div>;
  return (
    <div className="vea-stack">
      <ol className="vea-exports">
        {project.exports.map((record) => (
          <li key={record.id} className={record.url === project.render.url ? 'on' : ''}>
            <div>
              <b>{record.label}</b>
              <small>{new Date(record.createdAt).toLocaleString()} · {formatDuration(record.duration)}</small>
              {record.steps.length ? <small className="vea-export-steps">{record.steps.slice(0, 6).join(' · ')}</small> : null}
            </div>
            <div className="vea-export-actions">
              <button type="button" className="ve-icon-btn small" onClick={() => void save(record.url, record.kind, record.id)} disabled={busy === record.id} aria-label="Download" title="Download">{busy === record.id ? <Loader2 size={13} className="ve-spin" /> : <Download size={13} />}</button>
              <a className="ve-icon-btn small" href={record.url} target="_blank" rel="noreferrer" aria-label="Open" title="Open"><ExternalLink size={13} /></a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
