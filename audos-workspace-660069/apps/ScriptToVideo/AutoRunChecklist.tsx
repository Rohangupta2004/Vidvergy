/**
 * ONE-PRESS RUN — the live step checklist for a film started with
 * "Start video" (execution_mode 'automatic').
 *
 * Every step's state is DERIVED from the saved film and scene rows; nothing
 * here invents progress. A failed step retries itself on a short bounded
 * backoff, then stops and offers one "Retry this step" button. Errors are
 * always shown through friendlyErrors, never raw.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Circle, Loader2, RefreshCw } from 'lucide-react';
import type { Film, FilmScene } from './api';
import { classifyError, friendlyErrorMessage } from './friendlyErrors';

export type RunStepStatus = 'pending' | 'running' | 'done' | 'failed';
export type RunStepId = 'script' | 'scenes' | 'cast' | 'frames' | 'prepare' | 'clips' | 'join';

export interface RunStep {
  id: RunStepId;
  label: string;
  status: RunStepStatus;
  detail: string;
  /** Raw failure, classified for the auto-retry decision; never displayed. */
  error?: unknown;
  retry?: () => Promise<unknown>;
  retryKey?: string;
  /** Needs a click: retrying would start paid work the creator has not re-confirmed. */
  noAuto?: boolean;
}

/** Waits before the 1st and 2nd automatic retry of a failed step. */
export const AUTO_RETRY_DELAYS_MS = [6000, 20000];

const IN_FLIGHT = new Set(['queued', 'submitted', 'processing', 'generating', 'retrying']);
const FINISHED = new Set(['completed', 'skipped', 'succeeded']);
const FAILED = new Set(['failed', 'error', 'needs_action']);

// ---------------------------------------------------------------------------
// Checkpoints. The film itself is saved in WorkspaceDB after every step; these
// keys only remember WHICH film a one-press run belongs to, so a reload lands
// back on it, and that a Start was pressed before the film existed.
// ---------------------------------------------------------------------------
const AUTO_RUN_KEY = 's2v:autorun:film:v1';
const QUICK_START_PENDING_KEY = 's2v:quickstart:pending:v1';

export function writeAutoRunCheckpoint(filmId: number): void {
  try { window.localStorage.setItem(AUTO_RUN_KEY, JSON.stringify({ filmId, at: Date.now() })); } catch { /* preference only */ }
}

export function readAutoRunCheckpoint(): number | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTO_RUN_KEY) || 'null');
    const id = Number(saved?.filmId);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch { return null; }
}

export function clearAutoRunCheckpoint(): void {
  try { window.localStorage.removeItem(AUTO_RUN_KEY); } catch { /* preference only */ }
}

export function markQuickStartPending(scriptChars: number): void {
  try { window.localStorage.setItem(QUICK_START_PENDING_KEY, JSON.stringify({ chars: scriptChars, at: Date.now() })); } catch { /* preference only */ }
}

/** A Start that was pressed but whose film was never created (the tab closed
 * while the plan was being written). Older than a day is ignored. */
export function readQuickStartPending(): { chars: number; at: number } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(QUICK_START_PENDING_KEY) || 'null');
    if (!saved || Date.now() - Number(saved.at) > 24 * 3600_000) return null;
    return { chars: Number(saved.chars) || 0, at: Number(saved.at) };
  } catch { return null; }
}

export function clearQuickStartPending(): void {
  try { window.localStorage.removeItem(QUICK_START_PENDING_KEY); } catch { /* preference only */ }
}

export interface RunHandlers {
  onRetryCast: () => Promise<unknown>;
  onRetryStoryboards: () => Promise<unknown>;
  onStartProduction: () => Promise<unknown>;
  onRetryClip: (scene: FilmScene) => Promise<unknown>;
  onRetryJoin: () => Promise<unknown>;
}

export function deriveRunSteps(film: Film, scenes: FilmScene[], ctx: RunHandlers & { busy: boolean; assemblyActive: boolean; appError?: string }): RunStep[] {
  const plan: any = film.plan || {};
  const background = plan.background || {};
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const active = ordered.filter((scene) => String(scene.status) !== 'skipped');
  const started = background.enabled === true || ordered.some((scene) => !['waiting', 'ready', 'idle', 'pending'].includes(String(scene.status)));
  const cast = (Array.isArray(film.character_refs) ? film.character_refs : []).filter((character: any) => character.sheet_required !== false && character.kind !== 'narrator');
  const missing = cast.filter((character: any) => !character.url);

  const steps: RunStep[] = [
    { id: 'script', label: 'Script saved', status: 'done', detail: 'Kept exactly as you wrote it.' },
    {
      id: 'scenes', label: 'Split into scenes',
      status: ordered.length ? 'done' : 'running',
      detail: ordered.length ? `${ordered.length} scene${ordered.length === 1 ? '' : 's'} planned.` : 'Reading the script…',
    },
  ];

  if (!cast.length) steps.push({ id: 'cast', label: 'Character sheets', status: 'done', detail: 'No recurring characters to lock.' });
  else if (!missing.length) steps.push({ id: 'cast', label: 'Character sheets', status: 'done', detail: `${cast.length} character sheet${cast.length === 1 ? '' : 's'} ready and locked.` });
  else if (ctx.busy && !missing.some((character: any) => character.image_error)) steps.push({ id: 'cast', label: 'Character sheets', status: 'running', detail: `Drawing ${missing.length} character sheet${missing.length === 1 ? '' : 's'}…` });
  else {
    const raw = (missing.find((character: any) => character.image_error) as any)?.image_error || 'A character sheet still needs an image.';
    steps.push({
      id: 'cast', label: 'Character sheets', status: 'failed', error: raw,
      detail: `${missing.map((character: any) => character.name).join(', ')}: ${friendlyErrorMessage(raw)}`,
      retry: ctx.onRetryCast, retryKey: `cast:${missing.map((character: any) => character.id).join(',')}`,
    });
  }

  const boards = ordered.map((scene) => String((scene.spec as any)?.storyboard_status || ''));
  const boardErrors = ordered.filter((scene) => (scene.spec as any)?.storyboard_status === 'error');
  const boardReady = boards.filter((status) => status === 'ready').length;
  if (boards.some((status) => status === 'loading')) steps.push({ id: 'frames', label: 'Storyboard frames', status: 'running', detail: `${boardReady} of ${ordered.length} frames drawn…` });
  else if (boardErrors.length && !started) {
    steps.push({
      id: 'frames', label: 'Storyboard frames', status: 'failed', error: (boardErrors[0].spec as any)?.storyboard_error,
      detail: `${boardErrors.length} frame${boardErrors.length === 1 ? '' : 's'} could not be drawn yet. The film can still be made without them.`,
      retry: ctx.onRetryStoryboards, retryKey: `frames:${boardErrors.map((scene) => scene.id).join(',')}`,
    });
  } else if (boardErrors.length) steps.push({ id: 'frames', label: 'Storyboard frames', status: 'done', detail: `${boardReady} of ${ordered.length} frames ready; the rest use the character sheets as their guide.` });
  else steps.push({ id: 'frames', label: 'Storyboard frames', status: 'done', detail: boardReady ? `${boardReady} frame${boardReady === 1 ? '' : 's'} ready.` : 'Not needed for this film.' });

  const castDone = steps[2].status === 'done';
  const written = active.filter((scene) => String(scene.prompt || '').trim()).length;
  if (active.length && written === active.length) steps.push({ id: 'prepare', label: 'Prepare scenes', status: 'done', detail: `${written} detailed shot prompt${written === 1 ? '' : 's'} written.` });
  else if (!castDone) steps.push({ id: 'prepare', label: 'Prepare scenes', status: 'pending', detail: 'Starts as soon as every character sheet is ready.' });
  else if (ctx.busy || started) steps.push({ id: 'prepare', label: 'Prepare scenes', status: 'running', detail: `Writing shot prompts — ${written} of ${active.length}…`, retry: ctx.onStartProduction });
  else if (plan.cast_reviewed === true && plan.orchestration?.checkpoint !== 'character_reference_required' && !plan.orchestration?.paused && !['paused', 'cancelled'].includes(String(background.stage || '')) && plan.orchestration?.state !== 'cancelled') {
    // The cast is approved but production never began (for example the start
    // was refused). Starting spends credits, so this one waits for a click.
    steps.push({ id: 'prepare', label: 'Prepare scenes', status: 'failed', detail: 'Production has not started yet. Press Retry this step to start it.', retry: ctx.onStartProduction, retryKey: 'prepare:not-started', noAuto: true });
  } else steps.push({ id: 'prepare', label: 'Prepare scenes', status: 'pending', detail: 'Starting automatically…', retry: ctx.onStartProduction });

  const finished = ordered.filter((scene) => FINISHED.has(String(scene.status))).length;
  const failedScene = ordered.find((scene) => FAILED.has(String(scene.status)));
  const rendering = ordered.find((scene) => IN_FLIGHT.has(String(scene.status)));
  if (ordered.length && finished === ordered.length) steps.push({ id: 'clips', label: 'Generate clips', status: 'done', detail: `${finished} of ${ordered.length} clips ready, each continuing from the last frame of the one before.` });
  else if (failedScene) {
    steps.push({
      id: 'clips', label: 'Generate clips', status: 'failed', error: failedScene.error,
      detail: `Block ${failedScene.idx + 1}: ${friendlyErrorMessage(failedScene.error || 'This block did not finish.')}`,
      retry: () => ctx.onRetryClip(failedScene), retryKey: `clip:${failedScene.id}:${String(failedScene.error || '').slice(0, 80)}`,
    });
  } else if (rendering || background.enabled || (ctx.busy && started)) steps.push({ id: 'clips', label: 'Generate clips', status: 'running', detail: `${finished} of ${ordered.length} ready${rendering ? ` — block ${rendering.idx + 1} rendering` : ''}…` });
  else steps.push({ id: 'clips', label: 'Generate clips', status: 'pending', detail: `${finished} of ${ordered.length} ready.` });

  const clipsDone = ordered.length > 0 && finished === ordered.length;
  if (film.status === 'ready' && film.final_video_url) steps.push({ id: 'join', label: 'Join final video', status: 'done', detail: 'Your film is ready to watch and download.' });
  else if (!clipsDone) steps.push({ id: 'join', label: 'Join final video', status: 'pending', detail: 'Joins automatically when every clip is ready.' });
  else if (ctx.assemblyActive || film.status === 'assembling' || ctx.busy) steps.push({ id: 'join', label: 'Join final video', status: 'running', detail: 'Adding sound and joining the clips into one film…' });
  else if (film.error) steps.push({ id: 'join', label: 'Join final video', status: 'failed', error: film.error, detail: friendlyErrorMessage(film.error), retry: ctx.onRetryJoin, retryKey: `join:${String(film.error).slice(0, 80)}` });
  else steps.push({ id: 'join', label: 'Join final video', status: 'pending', detail: 'Joins automatically when every clip is ready.', retry: ctx.onRetryJoin });

  // An error the studio raised while running the current step belongs to the
  // first unfinished step, so the creator sees it in one place with one Retry.
  if (ctx.appError && !ctx.busy) {
    const current = steps.find((step) => step.status !== 'done');
    if (current && current.status !== 'failed' && current.retry) {
      current.status = 'failed';
      current.error = ctx.appError;
      current.detail = friendlyErrorMessage(ctx.appError);
      current.retryKey = `${current.id}:app:${ctx.appError.slice(0, 80)}`;
    }
  }
  return steps;
}

const STATUS_WORD: Record<RunStepStatus, string> = { pending: 'Waiting', running: 'Running', done: 'Done', failed: 'Needs attention' };

export default function AutoRunChecklist(props: RunHandlers & {
  film: Film;
  scenes: FilmScene[];
  busy: boolean;
  assemblyActive: boolean;
  appError?: string;
}) {
  const { film, scenes, busy, assemblyActive, appError } = props;
  const steps = useMemo(
    () => deriveRunSteps(film, scenes, { ...props }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [film, scenes, busy, assemblyActive, appError],
  );
  const [open, setOpen] = useState(true);
  const [retrying, setRetrying] = useState('');
  const [countdown, setCountdown] = useState<{ key: string; at: number } | null>(null);
  const [, setTick] = useState(0);
  const attempts = useRef(new Map<string, number>());

  const failed = steps.find((step) => step.status === 'failed' && step.retry);
  const failedKey = failed ? (failed.retryKey || `${failed.id}:${failed.detail}`) : '';
  const autoAllowed = failed && !failed.noAuto ? classifyError(failed.error ?? failed.detail).canRetry : false;
  const autoUsed = failedKey ? attempts.current.get(failedKey) || 0 : 0;
  const autoLeft = failed && autoAllowed ? Math.max(0, AUTO_RETRY_DELAYS_MS.length - autoUsed) : 0;

  useEffect(() => {
    if (!failed || busy || retrying || !autoAllowed) { setCountdown(null); return; }
    const used = attempts.current.get(failedKey) || 0;
    if (used >= AUTO_RETRY_DELAYS_MS.length) { setCountdown(null); return; }
    const delay = AUTO_RETRY_DELAYS_MS[used];
    setCountdown({ key: failedKey, at: Date.now() + delay });
    const timer = window.setTimeout(() => {
      attempts.current.set(failedKey, used + 1);
      setCountdown(null);
      void (failed.retry as () => Promise<unknown>)().catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedKey, busy, retrying, autoAllowed]);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const doneCount = steps.filter((step) => step.status === 'done').length;
  const allDone = doneCount === steps.length;
  const current = steps.find((step) => step.status !== 'done');
  const secondsLeft = countdown ? Math.max(0, Math.ceil((countdown.at - Date.now()) / 1000)) : 0;

  async function retryNow(step: RunStep) {
    if (!step.retry || retrying) return;
    setRetrying(step.id);
    try { await step.retry(); } catch { /* the step re-derives from the saved film */ } finally { setRetrying(''); }
  }

  return (
    <section className="s2v-run" aria-label="Video progress">
      <div className="s2v-run-head">
        <div>
          <h2>{allDone ? 'Your video is ready' : 'Making your video'}</h2>
          <p>{allDone ? 'Every step finished.' : `Runs by itself. Finished steps are saved, so a reload picks up where it left off.${current ? ` Now: ${current.label.toLowerCase()}.` : ''}`}</p>
        </div>
        <button type="button" className="s2v-run-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />} {open ? 'Hide steps' : 'Show steps'}
        </button>
      </div>
      <div className="s2v-run-progress" role="progressbar" aria-label="Steps finished" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
        <span style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
      </div>
      {open ? (
        <ol className="s2v-run-list">
          {steps.map((step) => (
            <li key={step.id} className={`s2v-run-step is-${step.status}`} aria-current={current?.id === step.id ? 'step' : undefined}>
              <span className="s2v-run-icon" aria-hidden>
                {step.status === 'done' ? <Check size={15} /> : step.status === 'running' ? <Loader2 size={15} className="s2v-run-spin" /> : step.status === 'failed' ? <AlertCircle size={15} /> : <Circle size={12} />}
              </span>
              <span className="s2v-run-label">
                {step.label}
                <span className="s2v-run-detail" role={step.status === 'failed' ? 'alert' : undefined}>
                  {step.detail}
                  {step.status === 'failed' && countdown?.key === failedKey && failed?.id === step.id ? ` Retrying automatically in ${secondsLeft}s…` : ''}
                  {step.status === 'failed' && failed?.id === step.id && !countdown && autoAllowed && autoLeft === 0 ? ' Automatic retries did not fix it.' : ''}
                </span>
              </span>
              {step.status === 'failed' && step.retry ? (
                <button type="button" className="s2v-run-retry" disabled={busy || Boolean(retrying)} onClick={() => void retryNow(step)} aria-label={`Retry this step: ${step.label}`}>
                  <RefreshCw size={14} aria-hidden className={retrying === step.id ? 's2v-run-spin' : undefined} /> Retry this step
                </button>
              ) : <span className="s2v-run-status">{STATUS_WORD[step.status]}</span>}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
