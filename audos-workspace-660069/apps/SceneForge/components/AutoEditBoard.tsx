/**
 * SceneForge — Auto Editor board (default for new projects).
 * Read-only progress for the fully automatic chain (voice → avatar → timing →
 * Remotion agent plan → Director assets → compose → render), then the one
 * finished MP4 with download, an opt-in QA audit (never automatic) and a single
 * optional re-edit box.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Film, Link2, Loader2, RotateCcw, Sparkles, Trash2, Wand2, XCircle, Zap } from 'lucide-react';
import StageResultPreviews, { AudioResultPlayer, GOLD_BUTTON_BG, MediaFallback, SOFT_BUTTON_BG, SOFT_INSET, SOFT_PANEL } from './StagePreviews';
import QaAuditPanel, { QaReportCard } from './QaAuditPanel';
import AutoBrandAnswersForm, { blankBrandFields } from './AutoBrandAnswersForm';
import type { AutoBrandAnswers } from '../lib/forgeClient';
import { COLORS, FONT, GRADIENT, RADIUS } from '../../../components/theme';
import { openPricing } from '../../../lib/plans';
import type { ForgeProject, ForgeStatus } from '../lib/forgeTypes';
import { FORGE_OPUS_LABEL, forgeOpusLabel, isForgeOpusModel } from '../lib/forgeModels';
import { friendlyFailure, logErrorDetails, safeErrorText } from '../lib/safeError';
import SafeBoundary from './SafeBoundary';

const STEPS: Array<{ id: ForgeStatus[]; label: string }> = [
  { id: ['voicing'], label: 'Voice track' },
  { id: ['avatar'], label: 'Avatar video (HeyGen)' },
  { id: ['transcribe'], label: 'Word timing from speech' },
  { id: ['direct'], label: 'Remotion agent plans the edit' },
  { id: ['assets'], label: 'Director creates the requested assets' },
  { id: ['code'], label: 'Compose motion graphics + captions' },
  { id: ['final_render'], label: 'Render' },
];

function stepIndex(status: ForgeStatus): number {
  if (status === 'done' || status === 'qa') return STEPS.length;
  return STEPS.findIndex((step) => step.id.indexOf(status) >= 0);
}

type StageState = 'done' | 'running' | 'failed' | 'pending';

const STAGE_BADGE: Record<StageState, { label: string; color: string; bg: string }> = {
  done: { label: 'Done', color: COLORS.accent, bg: COLORS.accentSoft },
  running: { label: 'Running', color: COLORS.onAccent, bg: GOLD_BUTTON_BG },
  failed: { label: 'Failed', color: COLORS.danger, bg: COLORS.dangerBg },
  pending: { label: 'Pending', color: COLORS.muted, bg: 'var(--vg-info-bg)' },
};

const SCENE_LABELS: Record<string, string> = {
  FULL_AVATAR: 'Presenter full-frame',
  PIP_MOTION_GRAPHIC: 'PiP + motion graphic',
  PIP_BROLL: 'PiP + video clip',
  PIP_IMAGE: 'PiP + image',
  SPLIT: 'Side-by-side',
  FULL_GRAPHIC: 'Full-screen graphic',
  CTA: 'Call to action',
};

function modelLabel(model: string | null | undefined): string {
  if (isForgeOpusModel(model)) return forgeOpusLabel(model);
  if (model === 'gpt-6.1-sol') return 'GPT 6.1 Sol (fallback)';
  if (model === 'built-in-plan') return 'Built-in edit plan';
  return 'Remotion agent';
}

function formatElapsed(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`;
}

const RENDER_STUCK_MS = 3 * 60 * 1000;
// A single unreadable render status is transient; only surface it after this many in a row.
const STATUS_MISS_ALERT = 5;

function slug(value: string): string {
  return (value || 'sceneforge-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sceneforge-video';
}

export default function AutoEditBoard({
  project,
  insufficient,
  onRetry,
  onRetryRender,
  onReedit,
  onCancel,
  onDelete,
  onRunQa,
  onQaFixes,
  onBrandAnswers,
}: {
  project: ForgeProject;
  insufficient: { required: number; shortfall: number | null } | null;
  onRetry: () => Promise<void>;
  onRetryRender?: () => Promise<void>;
  onReedit: (instruction: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRunQa?: () => Promise<void>;
  onQaFixes?: (approve: string[], ignore: string[]) => Promise<void>;
  onBrandAnswers?: (answers: AutoBrandAnswers) => Promise<void>;
}) {
  const auto = project.auto || null;
  const failure = project.status === 'failed' ? friendlyFailure(project) : null;
  const safeNote = (raw: unknown, fallback: string, maxLength = 320) => safeErrorText(raw, fallback, { script: project.script, maxLength, context: 'hidden SceneForge status details' });
  const statusLine = failure ? failure.title : safeNote(project.stage_note, String(project.status || ''));
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const format = auto?.format || project.studio_config.outputFormat || '16:9';
  const portrait = format === '9:16';
  const running = project.status !== 'done' && project.status !== 'failed' && project.status !== 'draft';
  const current = stepIndex(project.status);
  const qa = auto?.qa || null;
  const auditing = project.status === 'qa' && Boolean(qa?.opt_in);
  const videoUrl = project.status === 'done' || auditing ? project.final_video_url : null;
  const previousUrl = !videoUrl && project.final_video_url && running ? project.final_video_url : null;
  const progress = Math.round(Math.max(0, Math.min(1, auto?.render?.progress || 0)) * 100);
  const render = auto?.render || null;
  const renderSubmitted = render?.submitted_at ? Date.parse(render.submitted_at) : NaN;
  const renderElapsedSec = project.status === 'final_render' && Number.isFinite(renderSubmitted) ? (Date.now() - renderSubmitted) / 1000 : null;
  const lastRenderActivity = Math.max(Date.parse(project.updated_at || '') || 0, Date.parse(render?.last_poll_at || '') || 0);
  const renderStuck = project.status === 'final_render' && lastRenderActivity > 0 && Date.now() - lastRenderActivity > RENDER_STUCK_MS;
  const statusReadError = /^Render status could not be read/.test(String(render?.last_error || ''));
  const showRenderIssue = Boolean(render?.last_error) && (!statusReadError || Number(render?.status_misses || 0) >= STATUS_MISS_ALERT);
  const renderFailed = project.status === 'failed' && (project.failed_step === 'final_render' || project.failed_step === 'qa');
  const renderFallback = project.status === 'done' && Boolean(render?.fallback);
  const canRetryRender = Boolean(onRetryRender) && (renderStuck || renderFailed || renderFallback);
  const retryRenderButton = canRetryRender && onRetryRender ? (
    <button type="button" onClick={() => void run('retry-render', onRetryRender)} disabled={Boolean(pending['retry-render'])} style={{ alignItems: 'center', background: GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: pending['retry-render'] ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44, padding: '0 16px', width: 'fit-content' }} data-testid="button-retry-render">
      {pending['retry-render'] ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Retry render
    </button>
  ) : null;
  const canReedit = (project.status === 'done' || project.status === 'failed') && Boolean(project.heygen_video_url);
  const failedIndex = project.status === 'failed' && project.failed_step ? STEPS.findIndex((step) => step.id.indexOf(project.failed_step as ForgeStatus) >= 0) : -1;
  const showStages = (running && !auditing) || failedIndex >= 0;
  const [finalAttempt, setFinalAttempt] = useState(0);
  const [finalError, setFinalError] = useState(false);
  useEffect(() => { setFinalError(false); }, [videoUrl, finalAttempt]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (pending[key]) return;
    setPending((value) => ({ ...value, [key]: true }));
    setActionError('');
    try { await action(); }
    catch (error: any) {
      logErrorDetails(`action "${key}" failed`, error);
      setActionError(safeNote(error?.message || error, 'That didn’t work — please try again in a moment.', 240));
    }
    finally { setPending((value) => { const next = { ...value }; delete next[key]; return next; }); }
  };

  const finalVideoRef = useRef<HTMLVideoElement | null>(null);
  const seekFinal = (t: number) => {
    const element = finalVideoRef.current;
    if (!element) return;
    try {
      element.currentTime = Math.max(0, t);
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      /* metadata not loaded yet */
    }
  };
  const qaBusy = pending['run-qa'] ? 'run-qa' : pending['qa-fixes'] ? 'qa-fixes' : null;
  const runQa = onRunQa ? () => void run('run-qa', onRunQa) : undefined;
  const qaFixes = onQaFixes ? (approve: string[], ignore: string[]) => void run('qa-fixes', () => onQaFixes(approve, ignore)) : undefined;

  const download = async () => {
    if (!videoUrl) return;
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `${slug(project.topic)}-${format.replace(':', 'x')}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
    } catch {
      window.open(videoUrl, '_blank', 'noopener');
    }
  };

  const copyLink = async () => {
    if (!videoUrl) return;
    try { await navigator.clipboard.writeText(videoUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.open(videoUrl, '_blank', 'noopener'); }
  };

  const panel = { ...SOFT_PANEL, padding: 16 } as const;
  const skill = auto?.skill || null;
  const skillReport = skill?.report || null;
  const skillList = (title: string, items: string[] | undefined, testId: string) => (items && items.length ? (
    <div style={{ display: 'grid', gap: 4 }} data-testid={testId}>
      <strong style={{ color: COLORS.text, fontSize: 12.5 }}>{title}</strong>
      <ul style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 3, lineHeight: '18px', margin: 0, paddingLeft: 18 }}>
        {items.map((item, index) => <li key={`${testId}-${index}`}>{item}</li>)}
      </ul>
    </div>
  ) : null);

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1100 }} data-testid="sceneforge-auto-board">
      <div style={{ ...panel, alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12, padding: '12px 16px' }}>
        {project.status === 'failed' ? <XCircle size={18} color={COLORS.danger} /> : project.status === 'done' ? <Check size={18} color={COLORS.success} /> : <Loader2 size={18} color={COLORS.accent} className="animate-spin" />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 600 }}>{project.topic}</div>
          <div style={{ color: project.status === 'failed' ? COLORS.danger : COLORS.secondary, fontSize: 13, lineHeight: '19px' }}>{statusLine}</div>
        </div>
        <span style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: 999, color: COLORS.secondary, display: 'flex', fontSize: 11.5, gap: 6, padding: '5px 10px', whiteSpace: 'nowrap' }}>
          <Sparkles size={12} color={COLORS.accent} /> {auto?.plan ? modelLabel(auto.plan.model) : `Remotion agent: ${FORGE_OPUS_LABEL}`} · {format}
        </span>
      </div>

      {actionError ? <div role="alert" style={{ background: COLORS.dangerBg, border: 'none', borderRadius: RADIUS.card, color: COLORS.danger, fontSize: 13, padding: '10px 12px' }}>{actionError}</div> : null}

      {auto?.plan?.notice ? (
        <div style={{ alignItems: 'flex-start', background: COLORS.warningBg, border: 'none', borderRadius: 16, color: COLORS.text, display: 'flex', fontSize: 13, gap: 10, lineHeight: '19px', padding: '12px 14px' }} data-testid="sceneforge-plan-notice">
          <AlertTriangle size={16} color={COLORS.warning} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <span>{safeNote(auto.plan.notice, 'The Remotion agent was unavailable, so SceneForge used its built-in edit plan instead.', 420)}</span>
        </div>
      ) : null}

      {project.status === 'failed' ? (
        <div role="alert" style={{ background: 'linear-gradient(180deg, var(--vg-danger-bg), color-mix(in srgb, var(--vg-danger-bg) 40%, transparent))', border: 'none', borderRadius: 16, display: 'grid', gap: 10, padding: 16 }} data-testid="sceneforge-failed-panel">
          <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>This step stopped</strong>
          <span style={{ color: COLORS.danger, fontSize: 13.5, lineHeight: '19px' }} data-testid="sceneforge-failure-message">{failure?.title || 'Something went wrong while making this video.'}</span>
          {failure?.reason ? <span style={{ color: COLORS.muted, fontSize: 12 }}>Reason: {failure.reason}</span> : null}
          {renderFailed && retryRenderButton ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {retryRenderButton}
              <span style={{ alignSelf: 'center', color: COLORS.muted, fontSize: 12 }}>Render failed — re-renders only the composed edit with the existing avatar video and assets.</span>
            </div>
          ) : null}
          <button type="button" onClick={() => void run('retry', onRetry)} disabled={Boolean(pending.retry)} style={{ alignItems: 'center', background: renderFailed && retryRenderButton ? SOFT_BUTTON_BG : GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: renderFailed && retryRenderButton ? COLORS.text : COLORS.onAccent, cursor: pending.retry ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44, width: 230 }} data-testid="button-retry-failed-step">
            {pending.retry ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Retry from this step
          </button>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>Earlier outputs are reused; SceneForge does not restart or charge the project again.</span>
        </div>
      ) : null}

      {renderStuck ? (
        <div role="alert" style={{ background: COLORS.warningBg, border: 'none', borderRadius: 16, display: 'grid', gap: 10, padding: 16 }} data-testid="sceneforge-render-stuck">
          <strong style={{ alignItems: 'center', color: COLORS.text, display: 'flex', fontFamily: FONT.heading, fontSize: 14, gap: 8 }}><AlertTriangle size={16} color={COLORS.warning} /> The render has not reported progress for {formatElapsed((Date.now() - lastRenderActivity) / 1000)}</strong>
          <span style={{ color: COLORS.secondary, fontSize: 13 }}>SceneForge is checking it again automatically. If it stays stuck, retry the render — a render that already finished is picked up instead of redone, and the avatar, voice and assets are reused with no new charge.</span>
          {render?.last_error ? <span style={{ color: COLORS.warning, fontSize: 12.5 }}><strong>Last error:</strong> {safeNote(render.last_error, 'The render service reported a temporary problem.', 240)}</span> : null}
          {retryRenderButton}
        </div>
      ) : null}

      {insufficient ? (
        <div style={{ alignItems: 'center', background: COLORS.warningBg, border: 'none', borderRadius: 16, display: 'flex', flexWrap: 'wrap', gap: 10, padding: '12px 16px' }}>
          <AlertTriangle size={16} color={COLORS.warning} />
          <span style={{ color: COLORS.text, fontSize: 13.5 }}>This video needs {insufficient.required} credits{insufficient.shortfall ? ` (${insufficient.shortfall} short)` : ''}.</span>
          <button type="button" onClick={() => openPricing('credits')} style={{ background: GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, minHeight: 40, padding: '0 14px' }} data-testid="button-topup">Top up credits</button>
          <button type="button" disabled={Boolean(pending['resume-credits'])} onClick={() => void run('resume-credits', onRetry)} style={{ background: SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.text, cursor: pending['resume-credits'] ? 'wait' : 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, minHeight: 40, padding: '0 14px' }} data-testid="button-resume-credits">{pending['resume-credits'] ? 'Resuming…' : 'Resume saved job'}</button>
        </div>
      ) : null}

      {showStages ? (
        <section style={{ ...panel, display: 'grid', gap: 10 }} data-testid="sceneforge-auto-progress">
          <ol style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map((step, index) => {
              const state: StageState = failedIndex >= 0
                ? (index < failedIndex ? 'done' : index === failedIndex ? 'failed' : 'pending')
                : (index < current ? 'done' : index === current ? 'running' : 'pending');
              const badge = STAGE_BADGE[state];
              const isRender = step.id.indexOf('final_render') >= 0;
              const isQa = step.id.indexOf('qa') >= 0;
              return (
                <li key={step.label} style={{ ...SOFT_INSET, background: state === 'running' ? 'linear-gradient(180deg, color-mix(in srgb, var(--vg-gold) 14%, var(--vg-raised)), var(--vg-raised))' : state === 'failed' ? 'linear-gradient(180deg, var(--vg-danger-bg), var(--vg-raised))' : SOFT_INSET.background, color: state === 'pending' ? COLORS.muted : COLORS.text, display: 'grid', gap: 8, minHeight: 64, padding: '10px 12px' }} data-testid={`sceneforge-stage-${index}`} data-state={state}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}>
                    <span style={{ alignItems: 'center', background: badge.bg, borderRadius: 999, color: badge.color, display: 'flex', flex: '0 0 auto', height: 24, justifyContent: 'center', width: 24 }}>
                      {state === 'done' ? <Check size={13} /> : state === 'running' ? <Loader2 size={13} className="animate-spin" /> : state === 'failed' ? <XCircle size={13} /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{index + 1}</span>}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: state === 'running' ? 600 : 500, lineHeight: '17px', minWidth: 0 }}>{step.label}</span>
                    <span style={{ background: badge.bg, borderRadius: 999, color: badge.color, flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 8px', textTransform: 'uppercase' }}>{badge.label}</span>
                  </div>
                  {state === 'running' && isRender ? <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700 }}>{progress > 0 ? `${progress}%` : renderElapsedSec != null ? `${formatElapsed(renderElapsedSec)} elapsed` : 'starting'}</span> : null}
                  {state === 'running' && isQa && qa?.total ? <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 700 }}>{qa.checked}/{qa.total} frames</span> : null}
                  {state === 'running' ? (
                    <div style={{ background: 'var(--vg-info-bg)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
                      {isRender && progress > 0 ? <div style={{ background: GOLD_BUTTON_BG, height: '100%', transition: 'width 240ms cubic-bezier(.2,0,0,1)', width: `${progress}%` }} />
                        : isQa && qa?.total ? <div style={{ background: GOLD_BUTTON_BG, height: '100%', transition: 'width 240ms cubic-bezier(.2,0,0,1)', width: `${Math.round(Math.min(1, qa.checked / qa.total) * 100)}%` }} />
                        : <div className="animate-pulse" style={{ background: GOLD_BUTTON_BG, height: '100%', opacity: 0.55, width: '100%' }} />}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {project.status === 'final_render' && statusReadError && !showRenderIssue && !renderStuck ? <span style={{ color: COLORS.muted, fontSize: 12 }} data-testid="sceneforge-render-reconnecting">Reconnecting to the render service — SceneForge checks again automatically. The render keeps going.</span> : null}
          {project.status === 'final_render' && showRenderIssue && !renderStuck ? <span style={{ color: COLORS.warning, fontSize: 12.5 }} data-testid="sceneforge-render-error"><strong>Render issue:</strong> {safeNote(render?.last_error, 'The render service reported a temporary problem. SceneForge keeps checking automatically.', 240)}</span> : null}
          {project.status === 'final_render' && render?.cap_minutes ? <span style={{ color: COLORS.muted, fontSize: 12 }}>The render service does not report a percentage. SceneForge restarts the render automatically (up to 2 times) if it stalls or runs past {render.cap_minutes} minutes.</span> : null}
          {!running ? null : project.status === 'avatar' ? <span style={{ color: COLORS.muted, fontSize: 12 }}>Keep SceneForge open while HeyGen renders the avatar — your signed-in tab drives that step. Everything after it runs on the server.</span> : <span style={{ color: COLORS.muted, fontSize: 12 }}>No approvals needed — you can close this tab; the edit keeps going and appears here when it is ready.</span>}
        </section>
      ) : null}

      {auto?.look ? (
        <section style={{ ...panel, display: 'grid', gap: 10 }} data-testid="sceneforge-auto-plan">
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Wand2 size={16} color={COLORS.accent} />
            <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5 }}>{auto.look.name}</strong>
            <span aria-label="Palette" style={{ display: 'flex', gap: 4 }}>{Object.values(auto.look.palette || {}).slice(0, 7).map((color, index) => <span key={`${color}-${index}`} title={color} style={{ background: color, border: '1px solid rgba(255,255,255,.2)', borderRadius: 999, height: 14, width: 14 }} />)}</span>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>{auto.look.headingFont} · {auto.look.energy} energy · {auto.look.transition} transitions · {auto.look.captionStyle} captions</span>
          </div>
          {auto.look.why ? <div style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px' }}>{auto.look.why}</div> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(auto.beat_types || {}).map(([type, count]) => <span key={type} style={{ background: SOFT_BUTTON_BG, border: 'none', borderRadius: 999, color: COLORS.secondary, fontSize: 11.5, padding: '4px 9px' }}>{count} × {type}</span>)}
          </div>
          {auto.scene_mix && Object.keys(auto.scene_mix).length ? (
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="sceneforge-scene-mix">
              <span style={{ color: COLORS.muted, fontSize: 12 }}>Scenes:</span>
              {Object.entries(auto.scene_mix).map(([scene, count]) => <span key={scene} style={{ background: COLORS.accentSoft, border: 'none', borderRadius: 999, color: COLORS.text, fontSize: 11.5, padding: '4px 9px' }}>{count} × {SCENE_LABELS[scene] || scene}</span>)}
            </div>
          ) : null}
          {auto.assets?.length ? (
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {auto.assets.map((asset) => (
                <div key={asset.id} title={asset.purpose} style={{ background: asset.status === 'failed' ? COLORS.warningBg : SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.card, gridColumn: asset.url && (asset.kind === 'music' || asset.kind === 'sfx') ? '1 / -1' : undefined, overflow: 'hidden' }}>
                  {asset.url && (asset.kind === 'music' || asset.kind === 'sfx') ? <AudioResultPlayer url={asset.url} label={asset.purpose || asset.kind} filename={`${slug(project.topic)}-${asset.kind}-${asset.id}.mp3`} /> : asset.url && asset.kind !== 'broll' ? <img src={asset.url} alt={asset.purpose || asset.id} style={{ aspectRatio: '16 / 9', display: 'block', objectFit: 'cover', width: '100%' }} /> : asset.url ? <video src={asset.url} muted playsInline preload="metadata" style={{ aspectRatio: '16 / 9', background: '#000', display: 'block', width: '100%' }} /> : <div style={{ alignItems: 'center', aspectRatio: '16 / 9', color: COLORS.muted, display: 'flex', fontSize: 11.5, justifyContent: 'center' }}>{asset.status === 'failed' ? 'Replaced by graphics' : 'Generating…'}</div>}
                  <div style={{ color: COLORS.muted, fontSize: 11, padding: '5px 7px' }}>{asset.kind}{asset.style ? ` · ${asset.style}` : ''} · {asset.status}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {skill && skillReport ? (
        <section style={{ ...panel, display: 'grid', gap: 10 }} data-testid="sceneforge-skill-report">
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Zap size={16} color={COLORS.accent} />
            <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5 }}>{skill.title} · delivery notes</strong>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>Skill v{skill.version} · {skill.trigger === 'choice' ? 'chosen in settings' : skill.trigger === 'reedit' ? 'asked for in your re-edit' : 'asked for in your instructions'}</span>
          </div>
          {skill.note && safeNote(skill.note, '', 300) ? <div style={{ background: COLORS.warningBg, borderRadius: RADIUS.card, color: COLORS.text, fontSize: 12.5, lineHeight: '18px', padding: '8px 10px' }}>{safeNote(skill.note, '', 300)}</div> : null}
          <div style={{ color: COLORS.secondary, fontSize: 12.5 }} data-testid="sceneforge-skill-measured">
            {formatElapsed(skillReport.durationSec)} · {skillReport.format} · {skillReport.loudness ? `${skillReport.loudness.lufs} LUFS, true peak ${skillReport.loudness.truePeakDbtp} dBTP` : 'loudness not measured'}
          </div>
          {skillReport.concept && (skillReport.concept.bigIdea || skillReport.concept.hook) ? (
            <div style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 3, lineHeight: '18px' }} data-testid="sceneforge-skill-concept">
              <strong style={{ color: COLORS.text }}>Concept: {skillReport.concept.bigIdea || skillReport.concept.hook}</strong>
              {skillReport.concept.hook && skillReport.concept.bigIdea ? <span>Hook: {skillReport.concept.hook}</span> : null}
              {skillReport.concept.why ? <span>Why: {skillReport.concept.why}</span> : null}
            </div>
          ) : null}
          {skillList('On-screen text that is not in the voice-over — please confirm it', skillReport.onScreenTextNotInVoiceover, 'sceneforge-skill-offscript')}
          {skillList('Left out', skillReport.leftOut, 'sceneforge-skill-leftout')}
          {skillList('Creative choices that differ from the skill defaults', (skillReport.tier2Deviations || []).map((d) => (d.why ? `${d.what} — ${d.why}` : d.what)), 'sceneforge-skill-deviations')}
          {skillList('Checks the editor could not guarantee', skillReport.qaRisks, 'sceneforge-skill-risks')}
          {skillReport.brandQuestions?.length ? (
            <div style={{ background: COLORS.warningBg, borderRadius: RADIUS.card, display: 'grid', gap: 6, padding: '10px 12px' }} data-testid="sceneforge-skill-brand-questions">
              <strong style={{ alignItems: 'center', color: COLORS.text, display: 'flex', fontSize: 12.5, gap: 6 }}><AlertTriangle size={14} color={COLORS.warning} /> Questions about your brand</strong>
              <ul style={{ color: COLORS.text, display: 'grid', fontSize: 12.5, gap: 3, lineHeight: '18px', margin: 0, paddingLeft: 18 }}>
                {skillReport.brandQuestions.map((question, index) => <li key={`brand-q-${index}`}>{question}</li>)}
              </ul>
              {(() => {
                const blankFields = blankBrandFields(project);
                const answerable = canReedit && onBrandAnswers && (blankFields.name || blankFields.website || blankFields.cta || blankFields.logo);
                return answerable ? (
                  <>
                    <span style={{ color: COLORS.secondary, fontSize: 12 }}>This video leaves these out instead of guessing. Answer them here to re-edit this video (no new charge), or on the Brand step (“Quick questions before we generate”) for your next video.</span>
                    <AutoBrandAnswersForm project={project} saving={Boolean(pending['brand-answers'])} onSave={(answers) => void run('brand-answers', () => onBrandAnswers!(answers))} />
                  </>
                ) : (
                  <span style={{ color: COLORS.secondary, fontSize: 12 }}>This video leaves these out instead of guessing. Answer them on the Brand step (“Quick questions before we generate”) for your next video.</span>
                );
              })()}
            </div>
          ) : null}
          {skillReport.notMeasured?.length ? <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{skillReport.notMeasured.join(' ')}</span> : null}
        </section>
      ) : null}

      {previousUrl ? (
        <section style={{ ...panel, display: 'grid', gap: 8 }}>
          <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 13.5 }}>Previous version (still available while the re-edit runs)</strong>
          <video controls playsInline preload="metadata" src={previousUrl} style={{ aspectRatio: portrait ? '9 / 16' : '16 / 9', background: '#000', borderRadius: RADIUS.sm, maxHeight: 360, width: portrait ? 'auto' : '100%' }} />
        </section>
      ) : null}

      <SafeBoundary label="stage previews">
        <StageResultPreviews project={project} extra={videoUrl ? <QaReportCard project={project} busy={qaBusy} onRun={runQa} /> : undefined} />
      </SafeBoundary>

      {videoUrl ? (
        <section style={{ ...panel, display: 'grid', gap: 14 }} data-testid="sceneforge-auto-delivery">
          <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}><Film size={17} color={COLORS.accent} /><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15 }}>Your finished video</strong></div>
          <div style={{ background: '#000', borderRadius: RADIUS.card, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
            {finalError ? (
              <div style={{ aspectRatio: portrait ? '9 / 16' : '16 / 9', maxHeight: portrait ? 640 : 620, maxWidth: '100%', width: portrait ? 'auto' : '100%' }}>
                <MediaFallback fill message="The finished video could not be loaded — the link may have expired." url={videoUrl} onRetry={() => setFinalAttempt((value) => value + 1)} />
              </div>
            ) : (
              <video ref={finalVideoRef} key={finalAttempt} controls playsInline preload="metadata" src={videoUrl} onError={() => setFinalError(true)} style={{ aspectRatio: portrait ? '9 / 16' : '16 / 9', background: '#000', borderRadius: RADIUS.sm, maxHeight: portrait ? 640 : 620, maxWidth: '100%', width: portrait ? 'auto' : '100%' }} data-testid="video-final" />
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" onClick={() => void download()} style={{ alignItems: 'center', background: GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 14, fontWeight: 700, gap: 8, minHeight: 46, padding: '0 18px' }} data-testid="button-download-final">
              <Download size={16} /> Download MP4
            </button>
            <button type="button" onClick={() => void copyLink()} style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 600, gap: 8, minHeight: 46, padding: '0 16px' }} data-testid="button-copy-link">
              <Link2 size={15} /> {copied ? 'Link copied' : 'Copy link'}
            </button>
            <span style={{ alignSelf: 'center', color: COLORS.muted, fontSize: 12 }}>Saved to your video history.</span>
          </div>
          {renderFallback ? (
            <div style={{ background: COLORS.warningBg, border: 'none', borderRadius: RADIUS.card, color: COLORS.text, display: 'grid', fontSize: 12.5, gap: 8, lineHeight: '18px', padding: '10px 12px' }} data-testid="sceneforge-render-fallback">
              <strong style={{ color: COLORS.warning }}>Simplified version — the avatar video without motion graphics or captions</strong>
              <span>The full render failed{safeNote(render?.fallback?.reason, '', 240) ? `: ${safeNote(render?.fallback?.reason, '', 240)}` : '.'}</span>
              {retryRenderButton}
            </div>
          ) : null}
          {qa && !qa.opt_in ? (
            <div style={{ background: qa.status === 'warning' ? COLORS.warningBg : SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.card, color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 6, lineHeight: '18px', padding: '10px 12px' }} data-testid="sceneforge-auto-qa">
              <strong style={{ color: qa.status === 'warning' ? COLORS.warning : COLORS.success }}>{qa.status === 'passed' ? `Auto QA passed (${qa.total} frames checked)` : qa.status === 'warning' ? 'Auto QA notes' : qa.status === 'skipped' ? 'Visual QA was unavailable for this render' : 'Auto QA'}</strong>
              {qa.fixes?.length ? <span>Fixed automatically before delivery: {qa.fixes.map((fix) => `${fix.t.toFixed(1)}s — ${safeNote(fix.fix, 'layout adjusted', 160)}`).join('; ')}.</span> : null}
              {qa.status === 'warning' && qa.issues?.length ? <span>Remaining: {qa.issues.map((issue) => safeNote(issue, 'a frame needs a closer look', 200)).join('; ')}</span> : null}
            </div>
          ) : null}
          <div style={{ ...SOFT_INSET, padding: 14 }}>
            <SafeBoundary label="QA audit" message="Something went wrong showing the QA audit.">
              <QaAuditPanel project={project} busy={qaBusy} onRun={runQa} onFixes={qaFixes} onSeek={seekFinal} />
            </SafeBoundary>
          </div>
        </section>
      ) : null}

      {canReedit ? (
        <section style={{ ...panel, display: 'grid', gap: 10 }} data-testid="sceneforge-reedit">
          <label htmlFor="sceneforge-reedit-input" style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 600 }}>Re-edit with instructions <span style={{ color: COLORS.muted, fontSize: 12, fontWeight: 400 }}>(optional)</span></label>
          <textarea id="sceneforge-reedit-input" value={instruction} onChange={(event) => setInstruction(event.target.value.slice(0, 600))} rows={3} placeholder="Example: more b-roll in the middle, a calmer look, and a bigger CTA at the end." style={{ background: COLORS.input, border: 'none', borderRadius: RADIUS.card, boxSizing: 'border-box', color: COLORS.text, fontFamily: FONT.body, fontSize: 14, lineHeight: '21px', padding: 12, resize: 'vertical', width: '100%' }} data-testid="input-reedit" />
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" disabled={!instruction.trim() || Boolean(pending.reedit)} onClick={() => void run('reedit', async () => { await onReedit(instruction.trim()); setInstruction(''); })} style={{ alignItems: 'center', background: instruction.trim() ? GOLD_BUTTON_BG : COLORS.raised, border: 'none', borderRadius: RADIUS.sm, color: instruction.trim() ? COLORS.onAccent : COLORS.muted, cursor: instruction.trim() ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, minHeight: 44, padding: '0 16px' }} data-testid="button-reedit">
              {pending.reedit ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Re-edit
            </button>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>The avatar, voice and generated assets are reused. Re-edits are included — no new charge.</span>
          </div>
        </section>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {running ? <button type="button" onClick={() => void run('cancel', onCancel)} disabled={Boolean(pending.cancel)} style={{ background: SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', fontFamily: FONT.heading, fontSize: 13, minHeight: 40, padding: '0 14px' }} data-testid="button-cancel">{auditing ? 'Stop QA audit' : 'Cancel'}</button> : null}
        <button type="button" onClick={() => void run('delete', onDelete)} disabled={Boolean(pending.delete)} style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.muted, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, gap: 6, minHeight: 40, padding: '0 14px' }} data-testid="button-delete-project"><Trash2 size={14} /> Delete project</button>
      </div>
    </div>
  );
}
