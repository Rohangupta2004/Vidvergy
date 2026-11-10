/**
 * SceneForge — the production board.
 * Shows durable pipeline progress (resume-safe), the 4-draft style pick, the
 * finished 16:9 + native 9:16 players with download/share, and the shared-plan
 * edit panel (text / music / colour / timing — one edit re-renders BOTH formats).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clapperboard,
  Download,
  Loader2,
  Monitor,
  Pencil,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { authorizeCredits, newChargeKey, refundCredits } from '../../../lib/credits';
import { openPricing } from '../../../lib/plans';
import { callHook } from '../../../lib/workspace';
import { generateHookVariants } from '../lib/forgeClient';
import { DRAFT_EDIT_RECIPES } from '../lib/forgeTypes';
import type { ForgeProject, ForgeStatus, KineticBeatSheet, ProjectBrand } from '../lib/forgeTypes';
import { forgeOpusLabel } from '../lib/forgeModels';
import { friendlyFailure, looksTechnical, safeErrorText } from '../lib/safeError';
import SafeBoundary from './SafeBoundary';
import MotionEditor from './MotionEditor';
import KineticBeatSheetEditor from './KineticBeatSheetEditor';
import ForgeBrandStep, { defaultProjectBrand } from './ForgeBrandStep';
import { AudioResultPlayer, VideoResultPreview, fileSlug } from './StagePreviews';

const PHASES: Array<{ id: ForgeStatus[]; label: string }> = [
  { id: ['voicing'], label: 'ElevenLabs voice track (emotion by the script agent)' },
  { id: ['avatar'], label: 'Complete HeyGen avatar master (full script, audio and duration verified)' },
  { id: ['transcribe'], label: 'Server-side word timing map' },
  { id: ['direct'], label: 'Boss agent plans the edit for your niche' },
  { id: ['assets'], label: 'Assets — images, Veo 3.1 Fast B-roll, music + SFX' },
  { id: ['code'], label: 'Recipe engine builds four distinct edit systems in one batch' },
  { id: ['drafts', 'draft_pick'], label: '4 × 5s draft styles — you pick one' },
  { id: ['final_render', 'portrait_finish'], label: 'Full renders — 16:9 and native 9:16' },
];

function phaseIndex(status: ForgeStatus): number {
  const i = PHASES.findIndex((p) => p.id.indexOf(status) >= 0);
  if (i >= 0) return i;
  return status === 'done' ? PHASES.length : -1;
}

function displayTime(seconds: number): string {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

function reviewPhaseIndex(step: string | null | undefined): number {
  if (step === 'script' || step === 'voice') return 0;
  if (step === 'avatar') return 1;
  if (step === 'scenes' || step === 'music') return 4;
  if (step === 'beat_sheet') return 3;
  if (step === 'captions') return 5;
  if (step === 'landscape' || step === 'portrait' || step === 'final') return 7;
  return -1;
}

function shareVideo(url: string, title: string) {
  if (typeof navigator !== 'undefined' && (navigator as any).share) {
    (navigator as any).share({ title, url }).catch(() => undefined);
    return;
  }
  void navigator.clipboard?.writeText(url);
}

export default function ForgeProductionBoard({
  project,
  insufficient,
  onChooseDraft,
  onBrandUpdate,
  onEdit,
  onRetry,
  onStepAction,
  onAgenticRerun,
  onCancel,
  onDelete,
}: {
  project: ForgeProject;
  insufficient: { required: number; shortfall: number | null } | null;
  onChooseDraft: (variation: number) => Promise<void>;
  onBrandUpdate: (brand: ProjectBrand) => Promise<void>;
  onEdit: (changes: { accent?: string; music_mood?: string; timing_shift?: number; event_text?: Record<number, string>; scene_gestures?: Record<number, string>; scene_emotions?: Record<number, string> }) => Promise<void>;
  onRetry: () => Promise<void>;
  onStepAction: (step: string, action: 'approve' | 'regenerate' | 'edit', value?: string) => Promise<void>;
  onAgenticRerun: (instruction: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const idx = project.review_step ? reviewPhaseIndex(project.review_step) : phaseIndex(project.status);
  const failure = project.status === 'failed' ? friendlyFailure(project) : null;
  const safeNote = (raw: unknown, fallback: string, maxLength = 320) => safeErrorText(raw, fallback, { script: project.script, maxLength, context: 'hidden SceneForge status details' });
  const [editOpen, setEditOpen] = useState(false);
  const [accent, setAccent] = useState('');
  const [mood, setMood] = useState('');
  const [textEdits, setTextEdits] = useState<Record<number, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState('');
  const [gestureEdits, setGestureEdits] = useState<Record<number, string>>({});
  const [emotionEdits, setEmotionEdits] = useState<Record<number, string>>({});
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandDraft, setBrandDraft] = useState<ProjectBrand>(project.studio_config.brand || defaultProjectBrand(project.style));
  const [agentInstruction, setAgentInstruction] = useState('');
  const [hookVariants, setHookVariants] = useState<string[]>([]);
  const [hookBusy, setHookBusy] = useState(false);
  const [lastEdit, setLastEdit] = useState<any | null>(null);
  const [translationLanguage, setTranslationLanguage] = useState('Spanish');
  const [translationMode, setTranslationMode] = useState<'speed' | 'precision'>('speed');
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationResult, setTranslationResult] = useState('');
  const isAgentic = project.style === 'agentic-director' || project.studio_config.style === 'agentic-director';
  const isKineticReel = project.locked_style_brief?.style?.id === 'kinetic-reel' || project.style === 'kinetic-reel' || project.studio_config.style === 'kinetic-reel' || project.beat_sheet != null;
  const creativePlan = project.beat_sheet?.creativePlan;
  const plannedClipSeconds = creativePlan?.clips.reduce((total, clip) => total + Math.max(0, Number(clip.durationSec) || 0) * Math.max(1, clip.formats.length), 0) || 0;
  const agentProgress = [
    { id: 'planning', label: 'Planning', done: ['assets', 'code', 'drafts', 'draft_pick', 'final_render', 'portrait_finish', 'done'].includes(project.status) },
    { id: 'writing', label: 'Writing', done: ['drafts', 'draft_pick', 'final_render', 'portrait_finish', 'done'].includes(project.status) },
    { id: 'validating', label: 'Validating', done: ['final_render', 'portrait_finish', 'done'].includes(project.status) },
    { id: 'rendering', label: 'Rendering', done: project.status === 'done' },
  ];
  const activeAgentStep = project.status === 'direct' || project.status === 'assets' ? 'planning' : project.status === 'code' ? 'writing' : project.status === 'drafts' || project.status === 'draft_pick' ? 'validating' : 'rendering';

  useEffect(() => { setBrandDraft(project.studio_config.brand || defaultProjectBrand(project.style)); }, [project.id, project.style, project.studio_config.brand]);

  const events: any[] = useMemo(() => (Array.isArray(project.director_plan?.events) ? project.director_plan.events : []), [project.director_plan]);
  const sceneDirections = useMemo(() => (Array.isArray(project.director_plan?.scene_layouts) ? project.director_plan.scene_layouts : []), [project.director_plan]);

  const brollPreviews: any[] = Array.isArray(project.director_plan?.broll_previews) ? project.director_plan.broll_previews : [];
  const assetRegens = project.asset_regens || {};
  const musicCandidate = project.music_regen || null;
  const firstAvatar = project.heygen_video_url || project.heygen_chunks.find((chunk) => chunk.video_url)?.video_url || '';
  const avatarScenes = Array.isArray(project.studio_config.avatar_script) ? project.studio_config.avatar_script : [];
  const gestureOptions = Array.isArray(project.studio_config.avatarGestures) ? project.studio_config.avatarGestures : [];
  const emotionOptions = Array.isArray(project.studio_config.avatarEmotions) ? project.studio_config.avatarEmotions : [];
  const draftCards = project.style_briefs?.length
    ? project.style_briefs.map((brief) => {
        const recipe = brief.editingRecipe || DRAFT_EDIT_RECIPES[brief.draftSlot - 1];
        return ({
        variation: brief.draftSlot - 1,
        label: recipe.label,
        description: recipe.description,
        style_name: brief.style.name,
        recommended: brief.source === 'opus-recommended',
        palette: Object.values(brief.resolvedColors),
        styleBrief: brief,
        status: project.drafts?.find((draft) => draft.variation === brief.draftSlot - 1)?.status || (project.status === 'code' ? 'coding' : 'pending'),
        video_url: project.drafts?.find((draft) => draft.variation === brief.draftSlot - 1)?.video_url || null,
        error: project.drafts?.find((draft) => draft.variation === brief.draftSlot - 1)?.error || null,
      });
      })
    : (project.drafts || []).map((draft) => ({ ...draft, description: draft.description || DRAFT_EDIT_RECIPES[draft.variation]?.description }));

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (pending[key]) return;
    setPending((current) => ({ ...current, [key]: true }));
    setActionError('');
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        action(),
        new Promise<void>((_, reject) => { timeout = setTimeout(() => reject(new Error('This action took too long. You can try it again safely.')), 45000); }),
      ]);
    } catch (error: any) {
      setActionError(String(error?.message || error || 'The action could not be completed.'));
    } finally {
      if (timeout) clearTimeout(timeout);
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };
  const firstImage = (Array.isArray(project.director_plan?.images) ? project.director_plan.images : []).find((image: any) => image?.url)?.url || '';

  const submitEdit = async () => {
    setEditBusy(true);
    setEditError('');
    try {
      const changes: any = {};
      if (accent) changes.accent = accent;
      if (mood) changes.music_mood = mood;
      if (Object.keys(textEdits).length) changes.event_text = textEdits;
      if (!Object.keys(changes).length) { setEditOpen(false); return; }
      const previousText = Object.fromEntries(Object.keys(textEdits).map((key) => [Number(key), String(events[Number(key)]?.text || '')]));
      setLastEdit({
        ...(accent ? { accent: project.studio_config.brand?.colors?.accent || '#D9A441' } : {}),
        ...(mood ? { music_mood: project.studio_config.musicMood || 'confident' } : {}),
        ...(Object.keys(previousText).length ? { event_text: previousText } : {}),
      });
      await onEdit(changes);
      setEditOpen(false);
      setTextEdits({});
    } catch (e: any) {
      setEditError(String(e?.message || e));
    } finally {
      setEditBusy(false);
    }
  };

  const makeHooks = async () => {
    if (hookBusy || !project.script) return;
    setHookBusy(true);
    setActionError('');
    try { setHookVariants(await generateHookVariants(project.script, project.niche || '')); }
    catch (error: any) { setActionError(String(error?.message || error || 'Hook variants could not be generated.')); }
    finally { setHookBusy(false); }
  };

  const translateDub = async () => {
    const sourceUrl = project.final_video_url || project.portrait_video_url;
    if (!sourceUrl || translationBusy) return;
    const seconds = Math.max(1, Math.ceil(project.avatar_duration_sec || project.estimated_duration_sec || project.target_length_sec || 1));
    setTranslationBusy(true);
    setTranslationResult('');
    setActionError('');
    const creditKey = newChargeKey('sceneforge-translate');
    try {
      await authorizeCredits({
        engine: 'heygen/translate',
        options: { seconds, mode: translationMode },
        entryKey: creditKey,
        source: 'sceneforge-translate',
        label: `Translate and dub ${seconds}s to ${translationLanguage} (${translationMode})`,
        note: String(project.topic || '').slice(0, 120),
      });
      let data: any;
      try {
        data = await callHook('avatar-app-api', {
          op: 'request', endpoint: 'translations.create',
          body: { video_url: sourceUrl, output_languages: [translationLanguage], mode: translationMode },
          idempotencyKey: `sceneforge-translate-${project.id}-${translationLanguage.toLowerCase()}-${translationMode}`,
        });
      } catch (error) {
        await refundCredits(creditKey, 'HeyGen translation could not start');
        throw error;
      }
      if (!data?.success) {
        await refundCredits(creditKey, 'HeyGen translation could not start');
        throw new Error(data?.error || 'HeyGen translation could not start.');
      }
      const result = data.data?.data || data.data || {};
      const ids = Array.isArray(result) ? result.map((item: any) => item.video_translation_id || item.id).filter(Boolean) : [result.video_translation_id || result.id].filter(Boolean);
      setTranslationResult(ids.length ? `Translation started: ${ids.join(', ')}` : 'Translation accepted. Check Avatar App → API Console to poll it.');
    } catch (error: any) { setActionError(String(error?.message || error)); }
    finally { setTranslationBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1100 }}>
      {/* status line */}
      <div style={{ alignItems: 'center', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'flex', gap: 12, padding: '12px 16px' }}>
        {project.status === 'failed' ? <XCircle size={18} color={COLORS.danger} /> : project.status === 'done' ? <Check size={18} color={COLORS.success} /> : project.review_step ? <Clapperboard size={18} color={COLORS.accent} /> : <Loader2 size={18} color={COLORS.accent} className="animate-spin" />}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 600 }}>{project.topic}</div>
          <div style={{ color: project.status === 'failed' ? COLORS.danger : COLORS.secondary, fontSize: 13 }}>{failure ? failure.title : safeNote(project.stage_note, String(project.status || ''))}</div>
        </div>
        {isKineticReel && (project.coder_model || project.beat_sheet?.planner) ? (
          <details style={{ color: COLORS.muted, fontSize: 11.5, marginLeft: 'auto' }}><summary style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>Technical details</summary><div style={{ marginTop: 5, textAlign: 'right' }}>{project.beat_sheet?.planner ? `Director: ${project.beat_sheet.planner}` : null}{project.beat_sheet?.planner && project.coder_model ? ' · ' : null}{project.coder_model ? `Renderer: ${project.coder_model}` : null}</div></details>
        ) : project.coder_model ? <span title="The model that wrote your Remotion graphics" style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: 999, color: COLORS.muted, fontSize: 11.5, marginLeft: 'auto', padding: '4px 10px', whiteSpace: 'nowrap' }}>coder: {project.coder_model}</span> : null}
      </div>

      {actionError ? <div role="alert" style={{ background: COLORS.dangerBg, border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.danger, fontSize: 13, padding: '10px 12px' }}>{safeNote(actionError, 'That didn’t work — please try again in a moment.', 240)}</div> : null}

      {isAgentic ? (
        <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.card, display: 'grid', gap: 12, padding: 14 }} data-testid="agentic-director-progress">
          <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}><Sparkles size={16} color={COLORS.accent} /><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5 }}>Agentic Director</strong><span style={{ color: COLORS.muted, fontSize: 11.5 }}>{forgeOpusLabel(project.coder_model)}</span></div>
          <div aria-label="Agent progress" style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {agentProgress.map((item) => {
              const active = item.id === activeAgentStep && !item.done;
              return <div key={item.id} style={{ alignItems: 'center', color: item.done ? COLORS.success : active ? COLORS.accent : COLORS.muted, display: 'flex', fontSize: 12, gap: 6, minWidth: 0 }}>{item.done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span style={{ border: `1px solid ${COLORS.border}`, borderRadius: 999, height: 10, width: 10 }} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span></div>;
            })}
          </div>
          <div style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px' }}>{failure ? failure.title : safeNote(project.stage_note, 'Opus is directing the edit.')}</div>
          {(project.status === 'done' || project.status === 'failed') ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} maxLength={240} placeholder="make it punchier" aria-label="Agentic Director rerun instruction" style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, flex: 1, fontSize: 13, minHeight: 42, minWidth: 220, padding: '0 11px' }} />
            <button type="button" disabled={!agentInstruction.trim() || Boolean(pending['agentic-rerun'])} onClick={() => void runAction('agentic-rerun', async () => { await onAgenticRerun(agentInstruction.trim()); setAgentInstruction(''); })} style={{ alignItems: 'center', background: agentInstruction.trim() ? COLORS.accent : COLORS.raised, border: 'none', borderRadius: RADIUS.sm, color: agentInstruction.trim() ? COLORS.onAccent : COLORS.muted, cursor: agentInstruction.trim() ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 7, minHeight: 42, padding: '0 14px' }} data-testid="button-agentic-rerun">{pending['agentic-rerun'] ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Re-run direction</button>
          </div> : null}
          <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Planning is included. Only the render uses the existing SceneForge render charge. The avatar source and timeline editor stay intact.</span>
        </section>
      ) : null}

      {isKineticReel && creativePlan && project.review_step !== 'beat_sheet' ? (
        <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 14 }} data-testid="kinetic-director-summary">
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}><Sparkles size={16} color={COLORS.accent} /><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14.5 }}>Kinetic Reel Creative Plan</strong><span style={{ color: COLORS.muted, fontSize: 11.5 }}>{project.studio_config.autopilot ? 'Autopilot · continuing automatically' : 'Copilot · approved plan'}</span></div>
          <div style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px' }}><strong style={{ color: COLORS.accent }}>{creativePlan.summary.chosenOpening}</strong> — {creativePlan.summary.why}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{creativePlan.visualTrack.map((segment) => <span key={segment.id} title={segment.reason} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: 999, color: COLORS.secondary, fontSize: 11, padding: '5px 8px' }}>{segment.mode} · {displayTime(project.kinetic_words?.[segment.startWord]?.s || 0)}</span>)}</div>
          <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{creativePlan.clips.length} planned clip{creativePlan.clips.length === 1 ? '' : 's'} · {Math.round(plannedClipSeconds)} format-specific clip-seconds · music {creativePlan.audio.music.enabled ? 'planned' : 'off'} · {creativePlan.audio.sfx.length} SFX cue{creativePlan.audio.sfx.length === 1 ? '' : 's'}. Actual provider usage is logged and debited; failed jobs are not charged.</span>
        </section>
      ) : null}

      {project.status === 'failed' ? (
        <div role="alert" style={{ background: COLORS.dangerBg, border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 16 }} data-testid="sceneforge-failed-panel">
          <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>This step stopped</strong>
          <span style={{ color: COLORS.danger, fontSize: 13.5, lineHeight: '19px' }} data-testid="sceneforge-failure-message">{failure?.title || 'Something went wrong while making this video.'}</span>
          {failure?.reason ? <span style={{ color: COLORS.muted, fontSize: 12 }}>Reason: {failure.reason}</span> : null}
          <button type="button" onClick={() => void runAction('retry', onRetry)} disabled={Boolean(pending.retry)} style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: pending.retry ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44, width: 230 }} data-testid="button-retry-failed-step">
            {pending.retry ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Retry from this step
          </button>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>Earlier approved outputs are reused; SceneForge does not restart or charge the project again.</span>
        </div>
      ) : null}

      {insufficient ? (
        <div style={{ alignItems: 'center', background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.card, display: 'flex', flexWrap: 'wrap', gap: 10, padding: '12px 16px' }}>
          <AlertTriangle size={16} color={COLORS.warning} />
          <span style={{ color: COLORS.text, fontSize: 13.5 }}>
            This video needs {insufficient.required} credits{insufficient.shortfall ? ` (${insufficient.shortfall} short)` : ''} — both formats are covered by the one charge.
          </span>
          <button type="button" onClick={() => openPricing('credits')} style={{ background: 'var(--vg-gradient-action)', border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, minHeight: 40, padding: '0 14px' }} data-testid="button-topup">
            Top up credits
          </button>
          <button type="button" disabled={Boolean(pending['resume-credits'])} onClick={() => void runAction('resume-credits', onRetry)} style={{ background: COLORS.raised, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.text, cursor: pending['resume-credits'] ? 'wait' : 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, minHeight: 40, padding: '0 14px' }} data-testid="button-resume-credits">{pending['resume-credits'] ? 'Resuming…' : 'Resume saved job'}</button>
        </div>
      ) : null}

      {/* phases */}
      {project.status !== 'done' && project.status !== 'failed' ? (
        <ol style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {PHASES.map((phase, i) => {
            const state = i < idx ? 'done' : i === idx ? (project.review_step ? 'review' : 'now') : 'next';
            return (
              <li key={phase.label} style={{ alignItems: 'center', color: state === 'done' ? COLORS.success : state === 'now' || state === 'review' ? COLORS.text : COLORS.muted, display: 'flex', fontSize: 13.5, gap: 10, minHeight: 32 }}>
                {state === 'done' ? <Check size={15} /> : state === 'now' ? <Loader2 size={15} color={COLORS.accent} className="animate-spin" /> : state === 'review' ? <Clapperboard size={15} color={COLORS.accent} /> : <span style={{ border: `1.5px solid ${COLORS.border}`, borderRadius: 999, display: 'inline-block', height: 13, width: 13 }} />}
                {isKineticReel
                  ? (phase.id.includes('voicing') ? 'Preparing the narration master' : phase.id.includes('avatar') ? 'Preparing the avatar source' : phase.id.includes('transcribe') ? 'Finding the strongest hook' : phase.id.includes('direct') ? 'Planning the opening' : phase.id.includes('assets') ? 'Generating planned scenes' : phase.id.includes('code') ? 'Assembling the edit' : phase.id.includes('drafts') ? 'Checking clip quality' : 'Reviewing both formats')
                  : isAgentic
                    ? (phase.id.includes('direct') ? 'Opus plans the complete edit' : phase.id.includes('assets') ? 'Prepare Opus-selected assets' : phase.id.includes('code') ? 'Opus writes and schema-checks Remotion' : phase.id.includes('drafts') ? 'Compile preview + visual self-review' : phase.id.includes('final_render') ? 'Render the directed edit in both formats' : phase.label)
                    : phase.label}{state === 'review' ? ' — awaiting your approval' : ''}
              </li>
            );
          })}
        </ol>
      ) : null}

      {project.review_step === 'beat_sheet' && project.beat_sheet && project.kinetic_words?.length ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {project.drafts?.find((draft) => draft.label === 'Directed cold open' && draft.video_url)?.video_url ? <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 8, padding: 12 }} data-testid="kinetic-cold-open-draft"><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 13.5 }}>Planned cold open · first 5 seconds</strong><video controls muted loop playsInline src={project.drafts.find((draft) => draft.label === 'Directed cold open' && draft.video_url)!.video_url || ''} style={{ aspectRatio: '9 / 16', background: '#000', borderRadius: RADIUS.sm, display: 'block', maxHeight: 380, width: 'auto' }} /><span style={{ color: COLORS.muted, fontSize: 11.5 }}>Only clips needed for this preview were generated. Approving reuses them in the final render.</span></section> : null}
          <SafeBoundary label="beat sheet editor" message="Something went wrong showing the beat sheet.">
          <KineticBeatSheetEditor
            words={project.kinetic_words}
            value={project.beat_sheet}
            busy={Boolean(pending['beat-sheet:approve'] || pending['beat-sheet:save'])}
            onSave={(next: KineticBeatSheet) => runAction('beat-sheet:save', () => onStepAction('beat_sheet', 'edit', JSON.stringify(next)))}
            onApprove={(next: KineticBeatSheet) => runAction('beat-sheet:approve', () => onStepAction('beat_sheet', 'approve', JSON.stringify(next)))}
          />
          </SafeBoundary>
        </div>
      ) : null}

      {/* Persisted real-output previews. Plain media elements only; all encoding stays server-side. */}
      <section>
        <div style={{ alignItems: 'end', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: 0 }}>Pipeline previews</h3>
            <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '4px 0 0' }}>Open any completed step after reload. Approving the highlighted step lets the next stage run.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {[
            { step: 'script', label: 'Script', ready: Boolean(project.script), body: project.script ? <div style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '19px', maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{project.script}</div> : null },
            { step: 'voice', label: 'Complete voice', ready: project.heygen_chunks.length > 0 && project.heygen_chunks.every((chunk) => chunk.audio_url), body: project.heygen_chunks.some((chunk) => chunk.audio_url) ? <div style={{ display: 'grid', gap: 6, maxHeight: 230, overflowY: 'auto', padding: 8 }}>{project.heygen_chunks.filter((chunk) => chunk.audio_url).map((chunk) => <AudioResultPlayer key={chunk.i} url={chunk.audio_url} label={`Voiceover · scene ${chunk.i + 1}`} filename={`${fileSlug(project.topic)}-voiceover-${chunk.i + 1}.mp3`} fallbackDurationSec={chunk.duration_sec} />)}</div> : null },
            { step: 'avatar', label: 'Avatar', ready: Boolean(firstAvatar), body: firstAvatar ? <div style={{ padding: 8 }}><VideoResultPreview url={firstAvatar} filename={`${fileSlug(project.topic)}-avatar.mp4`} maxHeight={260} /></div> : null },
            { step: 'scenes', label: 'B-roll / scenes', ready: brollPreviews.length > 0 || project.studio_config.brollAmount === 'none', body: brollPreviews.length ? <video controls muted playsInline preload="metadata" src={brollPreviews[0]?.url} style={{ aspectRatio: '16 / 9', background: '#000', width: '100%' }} /> : project.studio_config.brollAmount === 'none' ? <div style={{ color: COLORS.secondary, fontSize: 12.5 }}>No B-roll was selected for this project.</div> : null },
            { step: 'music', label: 'Music', ready: Boolean(project.music_url), body: project.music_url ? <div style={{ padding: 8 }}><AudioResultPlayer url={project.music_url} label="Background music" filename={`${fileSlug(project.topic)}-music.mp3`} /></div> : null },
            { step: 'captions', label: 'Captions / overlays', ready: events.length > 0 && Boolean(firstAvatar || firstImage), body: events.length && (firstAvatar || firstImage) ? <div style={{ alignItems: 'end', aspectRatio: '16 / 9', background: `linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.7)), url(${firstImage || ''}) center/cover, #111`, display: 'flex', overflow: 'hidden', padding: 12, position: 'relative' }}>{firstAvatar && !firstImage ? <video muted playsInline preload="metadata" src={firstAvatar} style={{ height: '100%', inset: 0, objectFit: 'cover', position: 'absolute', width: '100%' }} /> : null}<span style={{ background: 'rgba(13,14,16,.82)', borderLeft: `4px solid ${COLORS.accent}`, color: '#fff', fontFamily: FONT.heading, fontSize: 14, fontWeight: 700, padding: '8px 10px', position: 'relative' }}>{looksTechnical(events[0]?.text) ? '' : String(events[0]?.text || '')}</span></div> : null },
            { step: 'landscape', label: 'Landscape layout', ready: Boolean(project.final_video_url), body: project.final_video_url ? <video controls playsInline preload="metadata" src={project.final_video_url} style={{ aspectRatio: '16 / 9', background: '#000', width: '100%' }} /> : null },
            { step: 'portrait', label: 'Portrait layout', ready: Boolean(project.portrait_preview_url || project.portrait_video_url), body: project.portrait_preview_url || project.portrait_video_url ? <video controls playsInline preload="metadata" src={project.portrait_preview_url || project.portrait_video_url || ''} style={{ aspectRatio: '9 / 16', background: '#000', display: 'block', maxHeight: 260, margin: '0 auto', objectFit: 'cover', width: 'auto' }} /> : null },
            { step: 'final', label: 'Final delivery', ready: Boolean(project.final_video_url && project.portrait_video_url), body: project.final_video_url && project.portrait_video_url ? <div style={{ color: COLORS.success, fontSize: 13 }}>Both server-rendered MP4 files are ready below.</div> : null },
          ].map((preview) => {
            const awaiting = project.review_step === preview.step;
            return (
              <article key={preview.step} style={{ background: COLORS.surface, border: `1px solid ${awaiting ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
                <div style={{ minHeight: 130, padding: preview.body ? 0 : 14 }}>{preview.body || <div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 12.5, height: 100, justifyContent: 'center' }}>Output not ready yet</div>}</div>
                <div style={{ display: 'grid', gap: 8, padding: 10 }}>
                  <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 13.5 }}>{preview.label}</strong>{awaiting ? <span style={{ color: COLORS.accent, fontSize: 11.5 }}>Awaiting approval</span> : preview.ready ? <Check size={14} color={COLORS.success} /> : null}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" disabled={!preview.ready || !awaiting || Boolean(pending[`${preview.step}:approve`])} onClick={() => void runAction(`${preview.step}:approve`, () => onStepAction(preview.step, 'approve'))} data-testid={`button-approve-${preview.step}`} style={{ background: awaiting ? COLORS.accent : COLORS.raised, border: `1px solid ${awaiting ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.badge, color: awaiting ? COLORS.onAccent : COLORS.muted, cursor: awaiting ? 'pointer' : 'not-allowed', fontSize: 11.5, minHeight: 34, padding: '0 9px' }}>Approve</button>
                    <button type="button" disabled={!preview.ready || !awaiting || Boolean(pending[`${preview.step}:regenerate`])} onClick={() => void runAction(`${preview.step}:regenerate`, () => onStepAction(preview.step, 'regenerate'))} data-testid={`button-regenerate-${preview.step}`} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.badge, color: awaiting ? COLORS.secondary : COLORS.muted, cursor: awaiting ? 'pointer' : 'not-allowed', fontSize: 11.5, minHeight: 34, padding: '0 9px' }}>Regenerate</button>
                    <button type="button" disabled={!preview.ready || !awaiting || Boolean(pending[`${preview.step}:edit`])} onClick={() => { const value = window.prompt(`Describe the change for ${preview.label}:`, preview.step === 'script' ? project.script || '' : ''); if (value != null) void runAction(`${preview.step}:edit`, () => onStepAction(preview.step, 'edit', value)); }} data-testid={`button-edit-${preview.step}`} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.badge, color: awaiting ? COLORS.secondary : COLORS.muted, cursor: awaiting ? 'pointer' : 'not-allowed', fontSize: 11.5, minHeight: 34, padding: '0 9px' }}>Edit</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {project.script ? (
        <section style={{ ...({ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 14 } as any), display: 'grid', gap: 10 }} data-testid="sceneforge-hook-variants">
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            <div style={{ flex: 1, minWidth: 220 }}><h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, margin: 0 }}>Three hook variants</h3><p style={{ color: COLORS.muted, fontSize: 12, margin: '3px 0 0' }}>Free script planning only. Each opening preserves the saved script’s language and facts.</p></div>
            <button type="button" onClick={() => void makeHooks()} disabled={hookBusy} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: hookBusy ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 7, minHeight: 40, padding: '0 12px' }}>{hookBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} color={COLORS.accent} />}{hookVariants.length ? 'Regenerate hooks' : 'Generate 3 hooks'}</button>
          </div>
          {hookVariants.length ? <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>{hookVariants.map((hook, index) => <button key={hook} type="button" onClick={() => void navigator.clipboard?.writeText(hook)} title="Copy hook" style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.text, cursor: 'copy', fontSize: 12.5, lineHeight: '18px', minHeight: 72, padding: 10, textAlign: 'left' }}><strong style={{ color: COLORS.accent, display: 'block', fontFamily: FONT.heading, fontSize: 11, marginBottom: 4 }}>HOOK {index + 1}</strong>{hook}</button>)}</div> : null}
        </section>
      ) : null}

      {(brollPreviews.length || project.music_url) ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: 0 }}>Review B-roll and music</h3>
            <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '4px 0 0' }}>Regenerate one item at a time. The accepted version stays in both finished videos until you approve its replacement.</p>
          </div>
          {brollPreviews.length ? <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>{brollPreviews.map((clip, index) => {
            const key = `broll:${String(clip.id || '')}`;
            const candidate = assetRegens[key];
            const seconds = Math.max(1, Math.ceil(Number(clip.end || 0) - Number(clip.start || 0)));
            return <article key={key || index} style={{ background: COLORS.surface, border: `1px solid ${candidate?.status === 'ready' ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: candidate?.candidate_url ? '1fr 1fr' : '1fr', padding: 10 }}>
                <div><span style={{ color: COLORS.muted, display: 'block', fontSize: 10.5, marginBottom: 4 }}>Accepted</span><video controls muted playsInline preload="metadata" src={clip.url} style={{ aspectRatio: '16 / 9', background: '#000', width: '100%' }} /></div>
                {candidate?.candidate_url ? <div><span style={{ color: COLORS.accent, display: 'block', fontSize: 10.5, marginBottom: 4 }}>Replacement</span><video controls muted playsInline preload="metadata" src={candidate.candidate_url} style={{ aspectRatio: '16 / 9', background: '#000', width: '100%' }} /></div> : null}
              </div>
              <div style={{ display: 'grid', gap: 7, padding: '0 10px 10px' }}>
                <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 12.5 }}>B-roll {index + 1} · {seconds}s</strong>
                {candidate?.status === 'generating' ? <span style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 11.5, gap: 6 }}><Loader2 size={13} className="animate-spin" />Generating only this replacement…</span> : null}
                {candidate?.status === 'failed' ? <span style={{ color: COLORS.danger, fontSize: 11.5 }}>{safeNote(candidate.error, 'This replacement failed. The accepted clip is unchanged.', 200)}</span> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidate?.status === 'ready' ? <button type="button" disabled={Boolean(pending[`${key}:approve`])} onClick={() => void runAction(`${key}:approve`, () => onStepAction(key, 'approve'))} style={{ background: COLORS.accent, border: 'none', borderRadius: RADIUS.badge, color: COLORS.onAccent, cursor: 'pointer', fontSize: 11.5, minHeight: 36, padding: '0 10px' }}>Approve replacement</button> : null}
                  <button type="button" disabled={!clip.id || candidate?.status === 'generating' || Boolean(pending[`${key}:regenerate`])} onClick={() => { if (window.confirm(`Regenerate only B-roll ${index + 1}? This authorizes ${seconds} credits with a stable retry key; every other item stays unchanged.`)) void runAction(`${key}:regenerate`, () => onStepAction(key, 'regenerate')); }} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.badge, color: COLORS.secondary, cursor: candidate?.status === 'generating' ? 'wait' : 'pointer', fontSize: 11.5, minHeight: 36, padding: '0 10px' }}>{candidate?.status === 'failed' ? 'Retry replacement' : 'Regenerate this B-roll'}</button>
                </div>
              </div>
            </article>;
          })}</div> : null}
          {project.music_url ? <article style={{ background: COLORS.surface, border: `1px solid ${musicCandidate?.status === 'ready' ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 12 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: musicCandidate?.candidate_url ? '1fr 1fr' : '1fr' }}>
              <div><span style={{ color: COLORS.muted, display: 'block', fontSize: 10.5, marginBottom: 4 }}>Accepted music</span><audio controls preload="metadata" src={project.music_url} style={{ width: '100%' }} /></div>
              {musicCandidate?.candidate_url ? <div><span style={{ color: COLORS.accent, display: 'block', fontSize: 10.5, marginBottom: 4 }}>Replacement music</span><audio controls preload="metadata" src={musicCandidate.candidate_url} style={{ width: '100%' }} /></div> : null}
            </div>
            {musicCandidate?.error ? <span style={{ color: COLORS.danger, fontSize: 11.5 }}>{safeNote(musicCandidate.error, 'The replacement music failed. The accepted track is unchanged.', 200)}</span> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {musicCandidate?.status === 'ready' ? <button type="button" disabled={Boolean(pending['music:approve'])} onClick={() => void runAction('music:approve', () => onStepAction('music', 'approve'))} style={{ background: COLORS.accent, border: 'none', borderRadius: RADIUS.badge, color: COLORS.onAccent, cursor: 'pointer', fontSize: 11.5, minHeight: 36, padding: '0 10px' }}>Approve replacement music</button> : null}
              <button type="button" disabled={Boolean(pending['music:regenerate'])} onClick={() => void runAction('music:regenerate', () => onStepAction('music', 'regenerate'))} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.badge, color: COLORS.secondary, cursor: pending['music:regenerate'] ? 'wait' : 'pointer', fontSize: 11.5, minHeight: 36, padding: '0 10px' }}>{pending['music:regenerate'] ? 'Generating…' : 'Regenerate music only'}</button>
            </div>
            <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Music regeneration uses the existing audio workflow and does not re-run or recharge video scenes.</span>
          </article> : null}
        </section>
      ) : null}

      {sceneDirections.length ? (
        <section style={{ display: 'grid', gap: 12 }} data-testid="sceneforge-layout-preview">
          <div>
            <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: 0 }}>Director layout preview</h3>
            <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '4px 0 0' }}>These are the safe-zone layouts and coded diagrams SceneForge will render before the final pass. Each item reveals from its spoken keyword timestamp.</p>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            {sceneDirections.map((scene) => {
              const split = scene.layout === 'split-left' || scene.layout === 'split-right';
              const avatarLeft = scene.layout === 'split-left';
              const fullGraphic = scene.layout === 'full-graphic';
              const elements = Array.isArray(scene.diagram?.elements) ? scene.diagram.elements.slice(0, 4) : [];
              const panel = <div style={{ alignContent: 'center', background: `linear-gradient(145deg, ${COLORS.raised}, ${COLORS.surface})`, border: `1px solid ${COLORS.border}`, borderRadius: 8, display: 'grid', gap: 5, minHeight: 76, padding: 8 }}><strong style={{ color: COLORS.accent, fontFamily: FONT.heading, fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>{String(scene.diagram?.type || 'callouts').replace('-', ' ')}</strong>{elements.map((item, itemIndex) => <span key={item.id || itemIndex} style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 10.5, gap: 5 }}><i style={{ background: item.emphasis ? COLORS.accent : COLORS.controlBorder, borderRadius: 999, display: 'inline-block', height: 6, width: 6 }} />{item.label}<small style={{ color: COLORS.muted, marginLeft: 'auto' }}>{Number(item.at || 0).toFixed(1)}s</small></span>)}</div>;
              const avatar = <div style={{ alignItems: 'end', background: `radial-gradient(circle at 50% 28%, ${COLORS.accentSoft}, ${COLORS.input})`, borderRadius: 8, display: 'flex', justifyContent: 'center', minHeight: 76, overflow: 'hidden' }}><span style={{ background: COLORS.secondary, borderRadius: '50% 50% 42% 42%', display: 'block', height: 66, opacity: .72, width: 42 }} /></div>;
              return (
                <article key={`${scene.sceneIndex}-${scene.start}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 9, padding: 10 }}>
                  <div style={{ aspectRatio: '16 / 9', background: COLORS.bg, borderRadius: 10, display: 'grid', gap: 7, gridTemplateColumns: split ? '1fr 1fr' : '1fr', overflow: 'hidden', padding: 8, position: 'relative' }}>
                    {fullGraphic ? panel : split ? (avatarLeft ? <>{avatar}{panel}</> : <>{panel}{avatar}</>) : <>{avatar}<div style={{ maxWidth: '52%', position: 'absolute', right: scene.safeZone === 'left' ? 'auto' : 12, left: scene.safeZone === 'left' ? 12 : 'auto', top: scene.safeZone === 'top' ? 10 : '24%', width: '46%' }}>{panel}</div></>}
                    <span style={{ background: 'rgba(0,0,0,.72)', borderRadius: 999, bottom: 7, color: '#fff', fontSize: 8.5, left: '18%', padding: '3px 7px', position: 'absolute', right: '18%', textAlign: 'center' }}>captions · active word highlighted</span>
                  </div>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 7 }}><strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 12.5 }}>Scene {Number(scene.sceneIndex) + 1}</strong><span style={{ background: COLORS.accentSoft, borderRadius: 999, color: COLORS.accent, fontSize: 10.5, padding: '3px 7px' }}>{scene.layout}</span><span style={{ color: COLORS.muted, fontSize: 10.5, marginLeft: 'auto' }}>{Number(scene.start || 0).toFixed(1)}–{Number(scene.end || 0).toFixed(1)}s</span></div>
                  <span style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: '16px' }}>{safeNote(scene.reason, `Uses the ${scene.safeZone || 'right'} safe zone and keeps the presenter clear.`, 200)}</span>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <SafeBoundary label="motion editor" message="Something went wrong showing the motion editor.">
        <MotionEditor project={project} />
      </SafeBoundary>

      {avatarScenes.length ? (
        <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 14 }}>
          <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Avatar direction by scene</h3>
          <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '0 0 4px' }}>SceneForge’s director varies subtle body language to match each line while keeping one consistent presenter. The same timed cues guide framing and motion treatment in both formats.</p>
          <p style={{ color: COLORS.muted, fontSize: 11.5, margin: '0 0 12px' }}>Avatar model: {project.avatar_model === 'avatar_iv' ? 'HeyGen Avatar IV' : project.avatar_model === 'legacy_v2' ? 'HeyGen legacy v2 fallback' : 'checking compatibility'}{project.avatar_fallback_reason ? ` · fallback: ${safeNote(project.avatar_fallback_reason, 'a compatible avatar render mode was used', 160)}` : ''}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {avatarScenes.map((scene, index) => (
              <div key={index} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(180px, 1fr) repeat(2, minmax(130px, 180px))', padding: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 12.5 }}>Scene {index + 1}{scene.startSec != null && scene.endSec != null ? ` · ${Math.round(scene.startSec)}s–${Math.round(scene.endSec)}s` : ''}</strong>
                  <span style={{ color: COLORS.muted, display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scene.text}</span>
                </div>
                {gestureOptions.length ? <select aria-label={`Gesture for scene ${index + 1}`} value={gestureEdits[index] ?? scene.gesture ?? ''} onChange={(event) => setGestureEdits((current) => ({ ...current, [index]: event.target.value }))} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.badge, color: COLORS.secondary, minHeight: 38, padding: '0 8px' }}><option value="">Automatic gesture</option>{gestureOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <span style={{ color: COLORS.secondary, fontSize: 11.5, lineHeight: '16px' }}>{scene.gesture || 'Natural eye contact and restrained movement'}</span>}
                {emotionOptions.length ? <select aria-label={`Expression for scene ${index + 1}`} value={emotionEdits[index] ?? scene.emotion ?? ''} onChange={(event) => setEmotionEdits((current) => ({ ...current, [index]: event.target.value }))} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.badge, color: COLORS.secondary, minHeight: 38, padding: '0 8px' }}><option value="">Natural expression</option>{emotionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{scene.emotion || 'Natural expression'}</span>}
              </div>
            ))}
          </div>
          {gestureOptions.length || emotionOptions.length ? <button type="button" disabled={project.status !== 'done' || Boolean(pending.gestures) || (!Object.keys(gestureEdits).length && !Object.keys(emotionEdits).length)} onClick={() => void runAction('gestures', async () => { await onEdit({ scene_gestures: gestureEdits, scene_emotions: emotionEdits }); setGestureEdits({}); setEmotionEdits({}); })} style={{ background: 'var(--vg-gradient-action)', border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: pending.gestures ? 'wait' : 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, marginTop: 12, minHeight: 40, padding: '0 14px' }} data-testid="button-apply-scene-gestures">Apply scene direction</button> : <p style={{ color: COLORS.muted, fontSize: 11.5, margin: '10px 0 0' }}>HeyGen’s avatar endpoint does not expose a documented manual gesture field for this look, so SceneForge keeps the director cues visible and uses them in the shared post-production motion treatment without sending an unsupported provider option.</p>}
        </section>
      ) : null}

      {/* locked style briefs + 4 x 5s draft pick */}
      {(['code', 'drafts', 'draft_pick'] as string[]).includes(project.status) && draftCards.length ? (
        <section>
          <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{isAgentic ? 'Opus preview validation' : project.status === 'draft_pick' ? 'Pick your edit style' : 'Building your style drafts'}</h3>
          <p style={{ color: COLORS.muted, fontSize: 13, margin: '0 0 12px' }}>{isAgentic ? 'SceneForge compiles one 5-second sample, extracts review frames, and lets Opus revise once if the avatar, captions or overlays need correction.' : 'Four genuinely different 5-second edits of the same voice moment. Layout, captions, cut rhythm, camera and motion graphics change; every option stays inside the Brand Kit palette.'}</p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {draftCards.map((d) => (
              <div key={d.variation} style={{ background: COLORS.surface, border: `1px solid ${d.recommended ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
                {d.video_url ? (
                  <video src={d.video_url} controls muted playsInline loop style={{ aspectRatio: d.styleBrief?.style?.id === 'kinetic-reel' ? '9 / 16' : '16 / 9', background: '#000', display: 'block', maxHeight: d.styleBrief?.style?.id === 'kinetic-reel' ? 360 : undefined, margin: d.styleBrief?.style?.id === 'kinetic-reel' ? '0 auto' : undefined, width: d.styleBrief?.style?.id === 'kinetic-reel' ? 'auto' : '100%' }} />
                ) : (
                  <div style={{ alignItems: 'center', aspectRatio: '16 / 9', color: d.status === 'failed' ? COLORS.danger : COLORS.muted, display: 'flex', flexDirection: 'column', fontSize: 12.5, gap: 8, justifyContent: 'center', padding: 14, textAlign: 'center' }}>
                    {d.status !== 'failed' ? <Loader2 size={17} color={COLORS.accent} className="animate-spin" /> : null}
                    {d.status === 'failed' ? 'This draft failed to render' : `Building ${d.label}${project.studio_config.brand?.useBrandColors ? ' with your brand colours' : ''}`}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 9, padding: '10px 12px' }}>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 7, justifyContent: 'space-between' }}>
                    <span style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700 }}>{d.label}</span>
                    {d.recommended ? <span style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}`, borderRadius: 999, color: COLORS.accent, fontSize: 10.5, fontWeight: 700, padding: '3px 7px' }}>Recommended</span> : null}
                  </div>
                  {d.description ? <span style={{ color: COLORS.secondary, fontSize: 11.5, lineHeight: '17px' }}>{d.description}</span> : null}
                  {d.style_name ? <span style={{ color: COLORS.muted, fontSize: 10.5 }}>Visual language · {d.style_name}</span> : null}
                  {d.palette?.length ? <div aria-label={`${d.label} brand palette`} style={{ display: 'flex', gap: 4 }}>{d.palette.slice(0, 7).map((color, index) => <span key={`${color}-${index}`} title={color} style={{ background: color, border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, height: 14, width: 14 }} />)}</div> : null}
                  {project.status === 'draft_pick' ? <button
                    type="button"
                    disabled={!d.video_url || Boolean(pending[`draft:${d.variation}`])}
                    onClick={() => void runAction(`draft:${d.variation}`, () => onChooseDraft(d.variation))}
                    style={{ alignItems: 'center', background: d.video_url ? 'var(--vg-gradient-action)' : COLORS.raised, border: 'none', borderRadius: RADIUS.sm, color: d.video_url ? COLORS.onAccent : COLORS.muted, cursor: d.video_url ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 6, justifyContent: 'center', minHeight: 40, padding: '0 14px' }}
                    data-testid={`button-pick-draft-${d.variation}`}
                  >
                    <Star size={14} /> Use this
                  </button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {project.status !== 'code' && project.status !== 'drafts' ? (
        <section style={{ display: 'grid', gap: 10 }}>
          <button type="button" onClick={() => setBrandOpen((open) => !open)} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, minHeight: 42, padding: '0 14px', width: 'fit-content' }}>{brandOpen ? 'Close brand settings' : 'Edit project brand'}</button>
          {brandOpen ? <ForgeBrandStep projectId={project.id} styleId={project.style} value={brandDraft} onChange={setBrandDraft} onCommit={async (brand) => { await onBrandUpdate(brand); setBrandDraft(brand); }} compact /> : null}
        </section>
      ) : null}

      {/* finals */}
      {project.status === 'done' ? (
        <section style={{ display: 'grid', gap: 14 }}>
          {isKineticReel && project.kinetic_qa ? <div style={{ alignItems: 'flex-start', background: project.kinetic_qa.status === 'passed' ? COLORS.successBg : COLORS.warningBg, border: `1px solid ${project.kinetic_qa.status === 'passed' ? COLORS.success : COLORS.warning}`, borderRadius: RADIUS.card, display: 'flex', gap: 9, padding: 12 }} data-testid="kinetic-reel-qa"><Check size={16} color={project.kinetic_qa.status === 'passed' ? COLORS.success : COLORS.warning} /><div><strong style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 13 }}>Kinetic Reel auto QA · {project.kinetic_qa.status}</strong><span style={{ color: COLORS.secondary, display: 'block', fontSize: 11.5, lineHeight: '17px', marginTop: 3 }}>{project.kinetic_qa.issues?.length ? project.kinetic_qa.issues.map((issue) => safeNote(issue, 'a check needs a closer look', 200)).join(' · ') : 'Both formats, frame rate, duration, audio presence, visual safe areas and sampled word sync were checked.'}</span></div></div> : null}
          {project.portrait_unavailable_reason && !project.portrait_video_url ? (
            <div role="status" style={{ alignItems: 'flex-start', background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.card, display: 'flex', flexWrap: 'wrap', gap: 10, padding: 14 }}>
              <AlertTriangle size={17} color={COLORS.warning} style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 13.5 }}>9:16 version unavailable</strong>
                <span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, lineHeight: '18px', marginTop: 3 }}>{safeNote(project.portrait_unavailable_reason, 'The vertical render could not be completed this time.', 240)}</span>
                <span style={{ color: COLORS.muted, display: 'block', fontSize: 11.5, marginTop: 4 }}>The finished 16:9 master below is saved in project history. No missing portrait file is marked complete.</span>
              </div>
              <button type="button" disabled={Boolean(pending['portrait:regenerate'])} onClick={() => void runAction('portrait:regenerate', () => onStepAction('portrait', 'regenerate'))} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.text, cursor: pending['portrait:regenerate'] ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 7, minHeight: 42, padding: '0 13px' }} data-testid="button-retry-portrait-only">
                {pending['portrait:regenerate'] ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Try 9:16 again
              </button>
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {[
              { url: project.final_video_url, label: '16:9 · Landscape', icon: <Monitor size={15} />, aspect: '16 / 9' },
              { url: project.portrait_video_url, label: isKineticReel ? '9:16 · Face-centred vertical composition' : '9:16 · Portrait (native layout)', icon: <Smartphone size={15} />, aspect: '9 / 16' },
            ].map((f) =>
              f.url ? (
                <div key={f.label} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 12 }}>
                  <div style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 600, gap: 7, marginBottom: 10 }}>
                    {f.icon} {f.label}
                  </div>
                  <video src={f.url} controls playsInline style={{ aspectRatio: f.aspect, background: '#000', borderRadius: RADIUS.sm, display: 'block', maxHeight: 420, margin: '0 auto', width: f.aspect === '9 / 16' ? 'auto' : '100%' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <a href={f.url} download target="_blank" rel="noreferrer" style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', borderRadius: RADIUS.sm, color: COLORS.onAccent, display: 'flex', flex: 1, fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44, textDecoration: 'none' }} data-testid={`link-download-${f.aspect === '9 / 16' ? 'portrait' : 'landscape'}`}>
                      <Download size={15} /> Download
                    </a>
                    <button type="button" onClick={() => shareVideo(f.url!, project.topic)} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 600, gap: 7, justifyContent: 'center', minHeight: 44, padding: '0 14px' }} data-testid={`button-share-${f.aspect === '9 / 16' ? 'portrait' : 'landscape'}`}>
                      <Share2 size={15} /> Share
                    </button>
                  </div>
                </div>
              ) : null,
            )}
          </div>

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 14 }} data-testid="sceneforge-translate-dub">
            <div><strong style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 14.5 }}>Translate and dub</strong><span style={{ color: COLORS.muted, display: 'block', fontSize: 12, marginTop: 3 }}>Starts HeyGen voice-cloned translation from the finished SceneForge master. The current Remotion exports stay unchanged.</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input value={translationLanguage} onChange={(event) => setTranslationLanguage(event.target.value)} aria-label="Translation language" style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 42, padding: '0 10px' }} />
              <select value={translationMode} onChange={(event) => setTranslationMode(event.target.value as 'speed' | 'precision')} aria-label="Translation mode" style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 42, padding: '0 10px' }}><option value="speed">Speed</option><option value="precision">Precision</option></select>
              <button type="button" disabled={!translationLanguage.trim() || translationBusy} onClick={() => void translateDub()} style={{ alignItems: 'center', background: COLORS.accent, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: translationBusy ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 7, minHeight: 42, padding: '0 13px' }}>{translationBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}Translate & dub</button>
            </div>
            {translationResult ? <span style={{ color: COLORS.success, fontSize: 12 }}>{translationResult}</span> : null}
          </div>

          {/* edit panel — shared elements apply to BOTH formats */}
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 14 }}>
            <button type="button" onClick={() => setEditOpen((v) => !v)} style={{ alignItems: 'center', background: 'transparent', border: 'none', color: COLORS.text, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 600, gap: 8, minHeight: 40, padding: 0 }} data-testid="button-edit-toggle">
              <Pencil size={15} color={COLORS.accent} /> Edit both formats (text · music · colour)
            </button>
            {editOpen ? (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <p style={{ color: COLORS.muted, fontSize: 12.5, margin: 0 }}>Edits change the ONE shared edit plan, then both the 16:9 and 9:16 versions re-render in sync.</p>
                {events.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {events.slice(0, 8).map((ev, i) => (
                      <div key={i} style={{ display: 'grid', gap: 4 }}>
                        <label style={{ color: COLORS.muted, fontSize: 12 }}>On-screen text #{i + 1} ({Math.round(ev.start)}s–{Math.round(ev.end)}s)</label>
                        <input
                          defaultValue={String(ev.text || '')}
                          onChange={(e) => setTextEdits((prev) => ({ ...prev, [i]: e.target.value }))}
                          style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, fontFamily: FONT.body, fontSize: 13.5, minHeight: 40, padding: '0 10px' }}
                          data-testid={`input-event-text-${i}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <label style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 13, gap: 8 }}>
                    Accent colour
                    <input type="color" value={accent || '#D9A441'} onChange={(e) => setAccent(e.target.value)} style={{ background: 'transparent', border: 'none', height: 36, width: 48 }} data-testid="input-accent" />
                  </label>
                  <label style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 13, gap: 8 }}>
                    Music mood
                    <input value={mood} onChange={(e) => setMood(e.target.value)} placeholder="e.g. dramatic" style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, fontSize: 13.5, minHeight: 40, padding: '0 10px', width: 150 }} data-testid="input-music-mood" />
                  </label>
                </div>
                {editError ? <div style={{ color: COLORS.danger, fontSize: 13 }}>{safeNote(editError, 'The edit could not be applied — please try again.', 240)}</div> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={submitEdit} disabled={editBusy} style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: editBusy ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 14, fontWeight: 700, gap: 8, justifyContent: 'center', minHeight: 44, width: 260 }} data-testid="button-edit-apply">
                    {editBusy ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />}
                    Re-render both formats
                  </button>
                  {lastEdit ? <button type="button" disabled={editBusy} onClick={() => void runAction('undo-edit', async () => { await onEdit(lastEdit); setLastEdit(null); setEditOpen(false); })} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 7, minHeight: 44, padding: '0 13px' }} data-testid="button-undo-last-edit"><RotateCcw size={14} />Undo last agent edit</button> : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* cancel (active runs only) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {project.status !== 'done' && project.status !== 'failed' && project.status !== 'draft_pick' ? (
          <button type="button" disabled={Boolean(pending.cancel)} onClick={() => void runAction('cancel', onCancel)} style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.muted, cursor: pending.cancel ? 'wait' : 'pointer', fontFamily: FONT.body, fontSize: 13, minHeight: 40, padding: '0 14px' }} data-testid="button-cancel-run">
            Cancel this run (unused credits are refunded)
          </button>
        ) : null}
        <button type="button" disabled={Boolean(pending.delete)} onClick={() => void runAction('delete', onDelete)} style={{ alignItems: 'center', background: 'transparent', border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.danger, cursor: pending.delete ? 'wait' : 'pointer', display: 'inline-flex', fontFamily: FONT.body, fontSize: 13, gap: 6, minHeight: 40, padding: '0 14px' }} data-testid="button-delete-project">
          {pending.delete ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete project
        </button>
      </div>
    </div>
  );
}
