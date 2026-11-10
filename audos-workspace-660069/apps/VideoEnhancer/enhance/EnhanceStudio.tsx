import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, ReactNode } from 'react';
import {
  AlertCircle, Check, Clock, Download, ExternalLink, Film, Library, Loader2, RefreshCw, RotateCcw, Sparkles, Trash2, Upload, Wand2, X,
} from 'lucide-react';
import { useCredits } from '../../../lib/credits';
import { openPricing } from '../../../lib/plans';
import { listVideoHistory, type VideoHistoryRow } from '../../../lib/videoHistory';
import ComparePlayer from './ComparePlayer';
import { downloadFile } from './enhanceIO';
import {
  ADJUST_FIELDS, DEFAULT_SETTINGS, FINISH_FIELDS, LOOKS, MAX_DURATION_S, MODES, OUTPUT_FPS, PRESETS, ZERO_ADJUST,
  computeGrade, effectLayers, estimateCredits, formatBytes, formatDuration, formatFps, gradeFilter, normalizeSettings, planOutput, presetSettings, safeFileName,
  type EnhanceSettings, type FrameAnalysis,
} from './enhanceModel';
import {
  addFiles, addFromLibrary, applySettingsToDrafts, cancelQueued, deleteJob, duplicateJob, isEditable, loadJobs, previewUrl, replaceSource,
  startAll, startJob, updateSettings, useEnhanceJobs, type EnhanceJob,
} from './enhanceStore';
import { ENHANCE_CSS } from './enhanceStyles';
import { ENHANCE_LOOK_HELP, ENHANCE_MODE_HELP, ENHANCE_PRESET_HELP, LOOK_NOTES, OptionThumb, previewFor } from '../optionPreviews';

const DEFAULTS_KEY = 'video-enhancer:enhance-defaults:v1';
type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };

function readDefaults(): EnhanceSettings {
  try { return normalizeSettings(JSON.parse(window.localStorage.getItem(DEFAULTS_KEY) || 'null') || DEFAULT_SETTINGS); } catch { return DEFAULT_SETTINGS; }
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function resolution(width: number, height: number): string {
  return width && height ? `${width} × ${height}` : '—';
}

function statusChip(job: EnhanceJob): { label: string; tone: string } {
  if (job.upload.state === 'uploading' && job.status !== 'error') return { label: `Uploading ${Math.round(job.upload.progress * 100)}%`, tone: 'info' };
  if (job.status === 'processing') return { label: 'Rendering', tone: 'active' };
  if (job.status === 'queued') return { label: 'Queued', tone: 'info' };
  if (job.status === 'done') return { label: 'Done', tone: 'good' };
  if (job.status === 'error') return { label: 'Failed', tone: 'bad' };
  return { label: 'Draft', tone: 'neutral' };
}

function sourceFormat(job: EnhanceJob): string {
  const pick = (value: string) => { const match = /\.([a-z0-9]{2,5})$/i.exec(value.split('?')[0]); return match ? match[1].toUpperCase() : ''; };
  return pick(job.source.name) || pick(job.source.url || '') || '—';
}

function analysisSummary(job: EnhanceJob): string {
  if (job.analysing) return 'Measuring exposure, contrast and colour across 8 frames…';
  const a: FrameAnalysis | null = job.analysis;
  if (!a) return 'Frame analysis is unavailable for this source, so Auto enhance applies only your manual adjustments.';
  const cast = Math.abs(a.warmth) < 0.02 ? 'neutral' : a.warmth > 0 ? 'warm' : 'cool';
  return `Measured: average exposure ${Math.round(a.luma * 100)}%, tonal range ${Math.round(a.spread * 100)}%, saturation ${Math.round(a.saturation * 100)}%, ${cast} colour balance.`;
}

function Slider({ label, value, min, max, disabled, suffix = '', onChange, reset = 0 }: { label: string; value: number; min: number; max: number; disabled?: boolean; suffix?: string; onChange: (value: number) => void; reset?: number }) {
  return (
    <label className={`ve-slider${disabled ? ' is-disabled' : ''}`} onDoubleClick={() => { if (!disabled) onChange(reset); }} title="Double-click to reset">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} />
      <b>{value > 0 && min < 0 ? `+${value}` : value}{suffix}</b>
    </label>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="ve-section"><header><h3>{title}</h3>{aside}</header>{children}</section>;
}

export default function EnhanceStudio() {
  const { jobs, loaded } = useEnhanceJobs();
  const { credits, loading: creditsLoading } = useCredits();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<EnhanceSettings>(readDefaults);
  const [dragOver, setDragOver] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<{ state: 'idle' | 'loading' | 'ready' | 'error'; rows: VideoHistoryRow[] }>({ state: 'idle', rows: [] });
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [detectedFps, setDetectedFps] = useState<Record<string, number>>({});
  const addInput = useRef<HTMLInputElement | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const replaceTarget = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = (toastId.current += 1);
    setToasts((items) => [...items.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), tone === 'bad' ? 9000 : 5000);
  }, []);

  useEffect(() => {
    void loadJobs();
    const reload = () => { void loadJobs(); };
    window.addEventListener('audos:session-established', reload);
    return () => window.removeEventListener('audos:session-established', reload);
  }, []);

  const busy = jobs.some((job) => job.status === 'processing' || job.status === 'queued' || job.upload.state === 'uploading');
  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  const selected = useMemo(() => jobs.find((job) => job.id === selectedId) || jobs[0] || null, [jobs, selectedId]);
  const drafts = jobs.filter((job) => job.status === 'draft' && job.failure !== 'source');
  const rendering = jobs.filter((job) => job.status === 'processing').length;
  const queued = jobs.filter((job) => job.status === 'queued').length;

  const onFiles = useCallback((list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const result = addFiles(files, defaults);
    for (const problem of result.rejected) notify(problem, 'bad');
    if (result.added.length) {
      setSelectedId(result.added[0]);
      notify(result.added.length === 1 ? 'Video added. It uploads while you choose settings.' : `${result.added.length} videos added to the queue.`, 'good');
    }
  }, [defaults, notify]);

  const changeSettings = (job: EnhanceJob, next: EnhanceSettings) => {
    updateSettings(job.id, next);
    setDefaults(next);
    try { window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const start = (job: EnhanceJob) => {
    const result = startJob(job.id);
    if (result === 'needs-file') { replaceTarget.current = job.id; replaceInput.current?.click(); return; }
    if (result === 'not-ready') { notify(job.error || 'This video is still being read. Try again in a moment.', 'bad'); return; }
    if (result === 'ok') notify(job.status === 'error' ? 'Retrying — the job is back in the queue.' : 'Enhancement queued.', 'good');
  };

  const download = async (job: EnhanceJob) => {
    if (!job.resultUrl || downloads[job.id] !== undefined) return;
    setDownloads((items) => ({ ...items, [job.id]: 0 }));
    const height = job.output?.height || planOutput(job.source).height;
    const result = await downloadFile(job.resultUrl, `${safeFileName(job.title)}-enhanced-${height}p.mp4`, (fraction) => setDownloads((items) => ({ ...items, [job.id]: fraction })));
    setDownloads((items) => { const next = { ...items }; delete next[job.id]; return next; });
    notify(result === 'saved' ? 'Download started.' : 'Opened the master in a new tab. Use your browser’s Save option to keep it.', result === 'saved' ? 'good' : 'info');
  };

  const remove = (job: EnhanceJob) => {
    if (confirmRemove !== job.id) {
      setConfirmRemove(job.id);
      window.setTimeout(() => setConfirmRemove((value) => (value === job.id ? null : value)), 8000);
      return;
    }
    setConfirmRemove(null);
    if (deleteJob(job.id)) {
      if (selected?.id === job.id) setSelectedId(null);
      notify('Removed from your queue. Finished videos stay in your Video Library.', 'info');
    }
  };

  const openLibrary = async () => {
    setLibraryOpen(true);
    setLibrary({ state: 'loading', rows: [] });
    try {
      const rows = (await listVideoHistory(36)).filter((row) => /^https:\/\//.test(row.video_url));
      setLibrary({ state: 'ready', rows });
    } catch {
      setLibrary({ state: 'error', rows: [] });
    }
  };

  const importRow = (row: VideoHistoryRow) => {
    const id = addFromLibrary(row, defaults);
    setLibraryOpen(false);
    if (!id) { notify('That library video has no downloadable source.', 'bad'); return; }
    setSelectedId(id);
    notify(`${row.title || 'Library video'} added from your Video Library.`, 'good');
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

  const creditLabel = creditsLoading && !credits ? 'Checking credits…' : !credits ? 'Sign in to use credits' : credits.unlimited ? 'Unlimited credits' : `${credits.balance.toLocaleString()} credits`;

  return (
    <div className="ves" onDragEnter={onDragEnter} onDragOver={(event) => { if (Array.from(event.dataTransfer.types || []).includes('Files')) event.preventDefault(); }} onDragLeave={onDragLeave} onDrop={onDrop}>
      <style>{ENHANCE_CSS}</style>
      <input ref={addInput} hidden type="file" multiple accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm" onChange={(event) => { onFiles(event.target.files); event.target.value = ''; }} />
      <input ref={replaceInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        const id = replaceTarget.current;
        replaceTarget.current = null;
        if (!file || !id) return;
        const problem = replaceSource(id, file);
        if (problem) notify(problem, 'bad'); else notify('File re-attached. The upload has restarted.', 'good');
      }} />

      <header className="ves-head">
        <div className="ves-title">
          <h2>Enhance</h2>
          <p>{jobs.length ? `${jobs.length} in queue${rendering ? ` · ${rendering} rendering` : ''}${queued ? ` · ${queued} waiting` : ''}` : 'Colour-correct, restore and remaster footage to a clean 1080p master.'}</p>
        </div>
        <span className="ve-credit-chip" title="Your credit balance">{creditLabel}</span>
        <button type="button" className="ve-btn" onClick={() => void openLibrary()}><Library size={15} />Import from library</button>
        <button type="button" className="ve-btn primary" onClick={() => addInput.current?.click()}><Upload size={15} />Add videos</button>
      </header>

      {!loaded && !jobs.length ? (
        <div className="ves-loading"><Loader2 size={18} className="ve-spin" />Loading your enhancement history…</div>
      ) : !jobs.length ? (
        <EmptyState onChoose={() => addInput.current?.click()} onLibrary={() => void openLibrary()} />
      ) : (
        <div className="ves-body">
          <aside className="ves-queue" aria-label="Enhancement queue">
            <div className="ves-queue-head">
              <h3>Queue</h3>
              {drafts.length > 1 ? (
                <button type="button" className="ve-btn small" onClick={() => { const count = startAll(); if (count) notify(`${count} enhancements queued.`, 'good'); }}>
                  <Wand2 size={13} />Enhance all {drafts.length}
                </button>
              ) : null}
            </div>
            <ul className="ves-queue-list">
              {jobs.map((job) => {
                const chip = statusChip(job);
                const on = selected?.id === job.id;
                const elapsedFrom = job.timing.submittedAt || job.timing.queuedAt;
                return (
                  <li key={job.id} className={on ? 'on' : ''}>
                    <button type="button" className="ves-job" onClick={() => setSelectedId(job.id)} aria-current={on ? 'true' : undefined}>
                      <span className="ves-thumb">{job.source.poster ? <img src={job.source.poster} alt="" /> : <Film size={16} />}</span>
                      <span className="ves-job-text">
                        <b title={job.title}>{job.title}</b>
                        <small>{[job.source.duration ? formatDuration(job.source.duration) : '', job.source.width ? `${job.source.height}p` : '', job.source.bytes ? formatBytes(job.source.bytes) : ''].filter(Boolean).join(' · ') || 'Reading video…'}</small>
                        <span className="ves-job-status">
                          <i className={`ve-chip ${chip.tone}`}>{chip.tone === 'active' ? <Loader2 size={11} className="ve-spin" /> : null}{chip.label}</i>
                          {job.status === 'processing' && elapsedFrom ? <em><Clock size={11} />{clock(now - elapsedFrom)}</em> : null}
                        </span>
                      </span>
                    </button>
                    {job.upload.state === 'uploading' ? <div className="ve-bar"><span style={{ width: `${Math.round(job.upload.progress * 100)}%` }} /></div> : null}
                    {job.status === 'processing' ? <div className="ve-bar indeterminate"><span /></div> : null}
                    <div className="ves-job-actions">
                      {job.status === 'done' ? <button type="button" className="ve-icon-btn small" onClick={() => void download(job)} disabled={downloads[job.id] !== undefined} aria-label={`Download ${job.title}`} title="Download master"><Download size={14} /></button> : null}
                      {job.status === 'error' && job.failure !== 'source' ? <button type="button" className="ve-icon-btn small" onClick={() => start(job)} aria-label={`Retry ${job.title}`} title="Retry"><RefreshCw size={14} /></button> : null}
                      {job.status === 'queued' ? <button type="button" className="ve-icon-btn small" onClick={() => cancelQueued(job.id)} aria-label={`Cancel ${job.title}`} title="Cancel (nothing is charged yet)"><X size={14} /></button> : null}
                      {job.status !== 'processing' ? (
                        confirmRemove === job.id ? (
                          <button type="button" className="ve-btn small danger" onClick={() => remove(job)} aria-label={`Confirm removing ${job.title}`} title="Click to remove from the queue">Remove?</button>
                        ) : (
                          <button type="button" className="ve-icon-btn small" onClick={() => remove(job)} aria-label={`Remove ${job.title}`} title="Remove from queue"><Trash2 size={14} /></button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="ves-add-more" onClick={() => addInput.current?.click()}><Upload size={14} />Add more or drop files anywhere</button>
          </aside>

          <main className="ves-main">
            {selected ? (
              <JobView
                key={selected.id}
                job={selected}
                now={now}
                fps={detectedFps[selected.id] || selected.source.fps || OUTPUT_FPS}
                downloading={downloads[selected.id]}
                onFps={(fps) => setDetectedFps((items) => (items[selected.id] ? items : { ...items, [selected.id]: fps }))}
                onDownload={() => void download(selected)}
                onRetry={() => start(selected)}
                onRemove={() => remove(selected)}
                confirmRemove={confirmRemove === selected.id}
              />
            ) : null}
          </main>

          {selected ? (
            <SettingsPanel
              job={selected}
              drafts={drafts}
              balance={credits ? (credits.unlimited ? Infinity : credits.balance) : null}
              onChange={(next) => changeSettings(selected, next)}
              onStart={() => start(selected)}
              onApplyAll={() => { const count = applySettingsToDrafts(selected.settings); notify(`Settings applied to ${count} draft${count === 1 ? '' : 's'}.`, 'good'); }}
              onRerun={() => { const id = duplicateJob(selected.id); if (id) { setSelectedId(id); notify('New draft created from the same source. Adjust the settings and enhance again.', 'good'); } }}
            />
          ) : null}
        </div>
      )}

      {dragOver ? <div className="ves-drop-overlay"><Upload size={26} /><b>Drop videos to add them to the queue</b><span>MP4, MOV, M4V or WebM · up to 500 MB · up to 10 minutes</span></div> : null}

      {libraryOpen ? (
        <div className="ves-modal" role="dialog" aria-modal="true" aria-label="Import from Video Library" onClick={() => setLibraryOpen(false)}>
          <div className="ves-modal-card" onClick={(event) => event.stopPropagation()}>
            <header><h3>Import from Video Library</h3><button type="button" className="ve-icon-btn" onClick={() => setLibraryOpen(false)} aria-label="Close"><X size={16} /></button></header>
            {library.state === 'loading' ? <div className="ves-modal-state"><Loader2 size={18} className="ve-spin" />Loading your videos…</div> : null}
            {library.state === 'error' ? <div className="ves-modal-state bad"><AlertCircle size={18} />Your library could not be loaded.<button type="button" className="ve-btn small" onClick={() => void openLibrary()}><RefreshCw size={13} />Retry</button></div> : null}
            {library.state === 'ready' && !library.rows.length ? <div className="ves-modal-state"><Film size={18} />No videos in your library yet. Finished videos from every Vidverge app appear here.</div> : null}
            {library.state === 'ready' && library.rows.length ? (
              <ul className="ves-library">
                {library.rows.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => importRow(row)}>
                      <span className="ves-thumb">{row.thumbnail_url ? <img src={row.thumbnail_url} alt="" /> : <Film size={16} />}</span>
                      <span className="ves-job-text"><b>{row.title || 'Untitled video'}</b><small>{[row.app_id.replace(/-/g, ' '), row.duration_sec ? formatDuration(row.duration_sec) : ''].filter(Boolean).join(' · ')}</small></span>
                      <span className="ve-btn small">Enhance</span>
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

function EmptyState({ onChoose, onLibrary }: { onChoose: () => void; onLibrary: () => void }) {
  return (
    <div className="ves-empty">
      <div className="ves-empty-drop">
        <Upload size={28} />
        <h3>Drop videos here to enhance them</h3>
        <p>MP4, MOV, M4V or WebM · up to 500 MB and 10 minutes each. Add several at once to batch them.</p>
        <div className="ves-empty-actions">
          <button type="button" className="ve-btn primary" onClick={onChoose}><Upload size={15} />Choose videos</button>
          <button type="button" className="ve-btn" onClick={onLibrary}><Library size={15} />Import from Video Library</button>
        </div>
      </div>
      <ol className="ves-steps">
        <li><b>1 · Add footage</b><span>Uploads start straight away, with real progress.</span></li>
        <li><b>2 · Pick a preset</b><span>Social, Ad or Archival, then fine-tune with a live before/after preview.</span></li>
        <li><b>3 · Enhance &amp; compare</b><span>Renders a 1080p master in the cloud. Credits are refunded automatically if a render fails.</span></li>
      </ol>
    </div>
  );
}

function JobView({ job, now, fps, downloading, onFps, onDownload, onRetry, onRemove, confirmRemove }: {
  job: EnhanceJob; now: number; fps: number; downloading: number | undefined;
  onFps: (fps: number) => void; onDownload: () => void; onRetry: () => void; onRemove: () => void; confirmRemove: boolean;
}) {
  const source = previewUrl(job);
  const grade = computeGrade(job.settings, job.analysis);
  const plan = planOutput({ ...job.source, fps: job.source.fps || (fps !== OUTPUT_FPS ? fps : null) });
  const aspect = job.source.width && job.source.height ? job.source.width / job.source.height : 16 / 9;
  const output = job.output;
  const elapsedFrom = job.timing.submittedAt || job.timing.queuedAt;
  const done = job.status === 'done' && Boolean(job.resultUrl);

  return (
    <div className="ves-view">
      {source && job.failure !== 'source' ? (
        <ComparePlayer
          beforeSrc={source}
          afterSrc={done ? job.resultUrl : null}
          afterFilter={gradeFilter(grade)}
          afterLayers={effectLayers(grade)}
          aspect={done && output?.width && output?.height ? output.width / output.height : aspect}
          fps={done ? OUTPUT_FPS : fps}
          afterLabel={done ? 'Enhanced' : 'Enhanced preview'}
          onFpsDetected={done ? undefined : onFps}
        />
      ) : (
        <div className="ves-noplayer">
          {job.failure === 'source' ? <AlertCircle size={22} /> : <Loader2 size={22} className="ve-spin" />}
          <b>{job.failure === 'source' ? 'This video can’t be used' : 'Preparing preview…'}</b>
          <span>{job.failure === 'source' ? job.error : 'Reading the file.'}</span>
          {job.failure === 'source' ? <button type="button" className={`ve-btn${confirmRemove ? ' danger' : ''}`} onClick={onRemove}><Trash2 size={14} />{confirmRemove ? 'Click again to remove' : 'Remove'}</button> : null}
        </div>
      )}

      {job.status === 'draft' && job.failure !== 'source' ? (
        <div className="ves-banner info">
          <Sparkles size={16} />
          <div>
            <b>Live preview</b>
            <span>The right side applies your settings with the same filter maths the renderer uses. {job.settings.mode === 'auto' ? analysisSummary(job) : ''}</span>
          </div>
        </div>
      ) : null}
      {job.status === 'queued' || job.status === 'processing' ? (
        <div className="ves-banner active">
          <Loader2 size={16} className="ve-spin" />
          <div>
            <b>{job.status === 'queued' ? (job.upload.state === 'uploading' ? `Uploading ${Math.round(job.upload.progress * 100)}% — the render starts right after` : 'Queued — waiting for a free render slot') : job.stage || 'Rendering'}</b>
            <span>{job.status === 'processing' && elapsedFrom ? `Elapsed ${clock(now - elapsedFrom)}. ` : ''}You can close this page; the render keeps going and this queue resumes it when you come back.</span>
          </div>
        </div>
      ) : null}
      {done ? (
        <div className="ves-banner good">
          <Check size={16} />
          <div>
            <b>Enhanced master ready</b>
            <span>Saved to your Video Library{job.note ? `. ${job.note}` : '.'}</span>
          </div>
          <div className="ves-banner-actions">
            <button type="button" className="ve-btn primary" onClick={onDownload} disabled={downloading !== undefined}>
              {downloading !== undefined ? <Loader2 size={14} className="ve-spin" /> : <Download size={14} />}
              {downloading !== undefined ? (downloading > 0 ? `Downloading ${Math.round(downloading * 100)}%` : 'Preparing download…') : 'Download MP4'}
            </button>
            <a className="ve-btn" href={job.resultUrl || undefined} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open</a>
          </div>
        </div>
      ) : null}
      {job.status === 'error' && job.failure !== 'source' ? (
        <div className="ves-banner bad" role="alert">
          <AlertCircle size={16} />
          <div>
            <b>{job.failure === 'upload' ? 'Upload failed' : job.failure === 'credits' ? 'Not started' : job.failure === 'timeout' ? 'Render timed out' : 'Render failed'}</b>
            <span>{job.error || 'Something went wrong.'}</span>
          </div>
          <div className="ves-banner-actions">
            <button type="button" className="ve-btn primary" onClick={onRetry}><RotateCcw size={14} />{job.failure === 'upload' && !job.source.url ? 'Choose file & retry' : 'Retry'}</button>
            {job.failure === 'credits' && /credits/i.test(job.error || '') ? <button type="button" className="ve-btn" onClick={() => openPricing('credits', { required: job.billing.credits })}>Top up</button> : null}
          </div>
        </div>
      ) : null}

      <div className="ves-specs" role="table" aria-label="Source and output specs">
        <div role="row" className="head"><span role="columnheader" /><span role="columnheader">Source</span><span role="columnheader">{done ? 'Enhanced master' : 'Output (planned)'}</span></div>
        <div role="row"><span role="rowheader">Resolution</span><span>{resolution(job.source.width, job.source.height)}</span><span>{done && output?.width ? resolution(output.width, output.height) : plan.label}</span></div>
        <div role="row"><span role="rowheader">Frame rate</span><span>{fps !== OUTPUT_FPS || job.source.fps ? `≈${formatFps(fps)}` : 'Measured during playback'}</span><span>{OUTPUT_FPS} fps</span></div>
        <div role="row"><span role="rowheader">Duration</span><span>{job.source.duration ? formatDuration(job.source.duration) : '—'}</span><span>{done && output?.duration ? formatDuration(output.duration) : job.source.duration ? formatDuration(job.source.duration) : '—'}</span></div>
        <div role="row"><span role="rowheader">File size</span><span>{formatBytes(job.source.bytes)}</span><span>{done ? formatBytes(output?.bytes) : 'After render'}</span></div>
        <div role="row"><span role="rowheader">Format</span><span>{sourceFormat(job)}</span><span>H.264 MP4 · AAC audio</span></div>
      </div>
      {plan.notes.length ? <ul className="ves-notes">{plan.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    </div>
  );
}

function SettingsPanel({ job, drafts, balance, onChange, onStart, onApplyAll, onRerun }: {
  job: EnhanceJob; drafts: EnhanceJob[]; balance: number | null;
  onChange: (next: EnhanceSettings) => void; onStart: () => void; onApplyAll: () => void; onRerun: () => void;
}) {
  const editable = isEditable(job) && job.failure !== 'source';
  const s = job.settings;
  const cost = estimateCredits(job.source.duration);
  const short = balance !== null && Number.isFinite(balance) && cost > balance;
  const set = (patch: Partial<EnhanceSettings>) => onChange({ ...s, ...patch, preset: 'custom' });
  const otherDrafts = drafts.filter((entry) => entry.id !== job.id);
  const blocked = !job.source.duration ? 'Reading the video…' : job.source.duration > MAX_DURATION_S ? 'Longer than the 10-minute render limit' : '';
  const [lookThumbFailed, setLookThumbFailed] = useState<Record<string, boolean>>({});

  return (
    <aside className="ves-settings" aria-label="Enhancement settings">
      <div className="ves-settings-scroll">
        {!editable && job.status !== 'error' ? (
          <div className="ves-locked">
            <b>{job.status === 'done' ? 'Settings used for this master' : 'Settings are locked while this job runs'}</b>
            {job.status === 'done' ? <button type="button" className="ve-btn small" onClick={onRerun}><RefreshCw size={13} />Re-run with new settings</button> : null}
          </div>
        ) : null}

        <Section title="Preset">
          <p className="ve-help" style={{ margin: '0 0 8px' }}>{ENHANCE_PRESET_HELP}</p>
          <div className="ves-presets">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={`ves-preset${s.preset === preset.id ? ' on' : ''}`} aria-pressed={s.preset === preset.id} disabled={!editable} onClick={() => onChange(presetSettings(preset.id))}>
                <OptionThumb src={previewFor('preset', preset.id)} style={{ marginBottom: 4 }} />
                <b>{preset.label}</b><small>{preset.hint}</small>
              </button>
            ))}
          </div>
          {s.preset === 'custom' ? <p className="ve-help">Custom settings. Pick a preset to start over.</p> : null}
        </Section>

        <Section title="Enhancement type">
          <p className="ve-help" style={{ margin: '0 0 8px' }}>{ENHANCE_MODE_HELP}</p>
          <div className="ve-seg full" role="group" aria-label="Enhancement type">
            {MODES.map((mode) => <button key={mode.id} type="button" className={s.mode === mode.id ? 'on' : ''} aria-pressed={s.mode === mode.id} disabled={!editable} onClick={() => set({ mode: mode.id })}>{mode.label}</button>)}
          </div>
          <p className="ve-help">{MODES.find((mode) => mode.id === s.mode)?.hint}</p>
          {s.mode === 'auto' ? (
            <Slider label="Strength" value={s.strength} min={0} max={100} suffix="%" disabled={!editable} reset={75} onChange={(strength) => set({ strength })} />
          ) : null}
        </Section>

        {s.mode !== 'remaster' ? (
          <Section title="Look">
            <p className="ve-help" style={{ margin: '0 0 8px' }}>{ENHANCE_LOOK_HELP}</p>
            <div className="ves-chips">
              {LOOKS.map((look) => {
                const thumb = lookThumbFailed[look.id] ? undefined : previewFor('look', look.id);
                return (
                  <button key={look.id} type="button" className={`ve-pill${s.look === look.id ? ' on' : ''}`} aria-pressed={s.look === look.id} disabled={!editable} onClick={() => set({ look: look.id })} style={thumb ? { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 5, borderRadius: 10 } : undefined}>
                    <OptionThumb src={thumb} ratio="1 / 1" style={{ width: 52, height: 52, borderRadius: 6 }} onFail={() => setLookThumbFailed((items) => ({ ...items, [look.id]: true }))} />
                    {look.label}
                  </button>
                );
              })}
            </div>
            {LOOK_NOTES[s.look] ? <p className="ve-help">{LOOK_NOTES[s.look]}</p> : null}
          </Section>
        ) : null}

        {s.mode !== 'remaster' ? (
          <details className="ves-advanced">
            <summary>Advanced adjustments</summary>
            <div className="ves-advanced-body">
              {ADJUST_FIELDS.map((field) => (
                <Slider key={field.key} label={field.label} value={s.adjust[field.key]} min={-50} max={50} disabled={!editable} onChange={(value) => set({ adjust: { ...s.adjust, [field.key]: value } })} />
              ))}
              <h4>Finishing</h4>
              {FINISH_FIELDS.map((field) => (
                <Slider key={field.id} label={field.label} value={s.finish[field.id]} min={0} max={100} suffix="%" disabled={!editable} onChange={(value) => set({ finish: { ...s.finish, [field.id]: value } })} />
              ))}
              <button type="button" className="ve-btn small" disabled={!editable} onClick={() => set({ adjust: { ...ZERO_ADJUST }, finish: { vignette: 0, filmGrain: 0, bloom: 0 } })}><RotateCcw size={13} />Reset adjustments</button>
            </div>
          </details>
        ) : null}

        <Section title="Audio">
          <div className="ve-seg full" role="group" aria-label="Audio">
            <button type="button" className={s.audio === 'keep' ? 'on' : ''} aria-pressed={s.audio === 'keep'} disabled={!editable} onClick={() => set({ audio: 'keep' })}>Keep original</button>
            <button type="button" className={s.audio === 'mute' ? 'on' : ''} aria-pressed={s.audio === 'mute'} disabled={!editable} onClick={() => set({ audio: 'mute' })}>Remove audio</button>
          </div>
        </Section>

        <Section title="Output">
          <p className="ves-output"><b>{planOutput(job.source).label}</b> · {OUTPUT_FPS} fps · H.264 MP4</p>
          <p className="ve-help">Every job is mastered at 1080p / 30 fps on the render farm. The whole frame is kept: other shapes are pillarboxed or letterboxed, never cropped.</p>
        </Section>
      </div>

      <div className="ves-cta">
        <div className="ves-cost">
          <span className="ve-credit-chip strong">{cost ? `${cost} credit${cost === 1 ? '' : 's'}` : '— credits'}</span>
          <small>{job.status === 'done' && job.billing.state === 'charged' ? `Charged ${job.billing.credits} credit${job.billing.credits === 1 ? '' : 's'} for this master.` : 'Charged when the render starts, refunded automatically if it fails.'}</small>
        </div>
        {short && editable ? (
          <div className="ves-short"><AlertCircle size={14} />You have {balance} credits; this needs {cost}.<button type="button" className="ve-btn small" onClick={() => openPricing('credits', { required: cost, balance: balance ?? 0 })}>Top up</button></div>
        ) : null}
        {editable ? (
          <button type="button" className="ve-btn primary wide" disabled={Boolean(blocked)} onClick={onStart} title={blocked || undefined}>
            <Wand2 size={16} />{blocked || (job.status === 'error' ? `Retry · ${cost} credit${cost === 1 ? '' : 's'}` : `Enhance · ${cost} credit${cost === 1 ? '' : 's'}`)}
          </button>
        ) : job.status === 'done' ? (
          <button type="button" className="ve-btn wide" onClick={onRerun}><RefreshCw size={15} />Re-run with new settings</button>
        ) : null}
        {editable && otherDrafts.length ? (
          <button type="button" className="ve-link" onClick={onApplyAll}>Apply these settings to {otherDrafts.length} other draft{otherDrafts.length === 1 ? '' : 's'}</button>
        ) : null}
      </div>
    </aside>
  );
}
