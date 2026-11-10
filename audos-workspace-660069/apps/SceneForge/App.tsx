/**
 * SceneForge — long HeyGen avatar videos with ElevenLabs sound, then a fully
 * automatic post-production chain with no approval gates:
 * Deepgram word timings → the Remotion agent (Claude Opus 5.5, GPT 6.1 Sol
 * fallback) plans the whole edit and decides the look → the Director generates
 * only the assets it requested (images, b-roll, music, SFX) → compose → render
 * → one finished MP4 in history. Frame QA is an opt-in audit the user starts;
 * it only proposes fixes and applies the ones the user approves.
 *
 * One-time choices (script, voice, avatar, format, optional instructions,
 * brand) happen BEFORE generation. The pipeline is a durable server job on
 * `sceneforge-pipeline`; this app drives the browser-only HeyGen step and
 * otherwise just refreshes persisted state. Projects made with the older
 * style/draft flow still open in ForgeProductionBoard.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Clapperboard, Film, Loader2, Pencil, Plus, Rocket, UserRoundPlus, XCircle } from 'lucide-react';
import { COLORS, FONT, GRADIENT, RADIUS } from '../../components/theme';
import CreditBalance from '../../components/CreditBalance';
import { saveVideoToHistory } from '../../lib/videoHistory';
import { requireVerifiedCreditSession } from '../../lib/credits';
import { callHook } from '../../lib/workspace';
import {
  cancelProject,
  chooseDraft,
  createProject,
  deleteProject,
  applyEdit,
  autoBrandAnswers,
  autoReedit,
  getProject,
  listProjects,
  pollAvatarRender,
  reportAvatarStep,
  reviewQaFixes,
  reviewStep,
  retryFromStep,
  retryRender,
  runQaAudit,
  saveProjectDraft,
  startProject,
  submitAvatarRender,
  tickProject,
  transcribeAvatarAudio,
  transcribeVoiceChunks,
  updateProjectBrand,
  type AvatarRenderStatus,
} from './lib/forgeClient';
import type { ForgeChoices, ForgeProject, ProjectBrand } from './lib/forgeTypes';
import ForgeScriptStep, { type ScriptStepValue } from './components/ForgeScriptStep';
import ForgeAvatarStep from './components/ForgeAvatarStep';
import ForgeChoicesStep from './components/ForgeChoicesStep';
import ForgeProductionBoard from './components/ForgeProductionBoard';
import AutoEditBoard from './components/AutoEditBoard';
import { AutoBudgetHint } from './components/ForgeChoicesStep';
import AvatarCreator from './components/AvatarCreator';
import { GOLD_BUTTON_BG, PreviewSkeleton, SOFT_BUTTON_BG, SOFT_PANEL } from './components/StagePreviews';
import ForgeBrandStep, { defaultProjectBrand } from './components/ForgeBrandStep';
import ForgeBrandBrief, { brandBriefMissing } from './components/ForgeBrandBrief';
import { getDefaultBrand, readActiveBrandKit } from '../../components/brandKitStore';
import { AUTO_EDITOR_STYLE_ID, type ForgeBrandBrief, type ForgeBrandContext } from './lib/forgeTypes';
import { parseStructuredScript, spokenScriptFromStructured, structuredOutline, type StructuredScript } from './lib/scriptFormat';
import { friendlyFailure, safeErrorText } from './lib/safeError';
import SafeBoundary from './components/SafeBoundary';

const TICK_MS = 6000;
// A server step that has not saved anything for this long lost its background
// chain (tab closed, hop cap, render-service restart); the open tab drives it.
const STALE_DRIVE_MS = 150 * 1000;
const HEYGEN_MAX_WAIT_MS = 45 * 60 * 1000;
const ACTIVE = ['voicing', 'avatar', 'transcribe', 'direct', 'assets', 'code', 'drafts', 'final_render', 'portrait_finish', 'qa'];
const DEFAULT_CHOICES: ForgeChoices = { captionLanguage: 'hinglish', style: AUTO_EDITOR_STYLE_ID, outputFormat: '16:9', cutaways: 'auto' };

function isAutoProject(p: ForgeProject | null | undefined): boolean {
  return Boolean(p && (p.style === AUTO_EDITOR_STYLE_ID || p.studio_config?.style === AUTO_EDITOR_STYLE_ID));
}

function brandKitContext(): ForgeBrandContext | undefined {
  const brand = getDefaultBrand(readActiveBrandKit());
  if (!brand) return undefined;
  return {
    name: brand.identity.businessName || undefined,
    tagline: brand.identity.tagline || undefined,
    website: brand.websiteUrl || undefined,
    offer: brand.offer.summary || undefined,
    audience: brand.audienceTone.audience || undefined,
    tone: brand.audienceTone.tone || undefined,
    ctas: (brand.offer.offersCtas || []).filter(Boolean).slice(0, 4),
    fonts: (brand.visuals.fonts || []).filter(Boolean).slice(0, 4),
    images: (brand.visuals.images || []).filter((image) => image?.url).slice(0, 12).map((image) => ({ url: image.url, alt: image.alt || '' })),
  };
}

/** Brand fonts from the Brand step answer: typed fonts, none when "neutral", saved Brand Kit fonts only when the field was never touched. */
function briefFonts(b: ForgeBrandBrief, kitFonts: string[] | undefined): string[] {
  try {
    if (b.fontsChoice === 'neutral') return [];
    if (typeof b.fonts === 'string') return b.fonts.split(/[,;\n]/).map((font) => font.trim().slice(0, 40)).filter(Boolean).slice(0, 4);
  } catch {
    // Fall back to the previous behaviour below.
  }
  return kitFonts || [];
}

/**
 * The Remotion agent's brand context: only what the user answered in the brief.
 * Saved Brand Kit extras (tagline, audience, fonts, images) are included only
 * when the user explicitly chose "Use my saved Brand Kit".
 */
function briefBrandContext(brief: ForgeBrandBrief | undefined): ForgeBrandContext {
  const b = brief || {};
  const kit = b.usedBrandKit ? brandKitContext() : undefined;
  const text = (value?: string) => String(value || '').trim() || undefined;
  const cta = text(b.cta);
  return {
    name: text(b.name),
    tagline: kit?.tagline,
    website: text(b.website),
    offer: text(b.keyMessage),
    audience: kit?.audience,
    tone: text(b.tone),
    ctas: cta ? [cta] : [],
    fonts: briefFonts(b, kit?.fonts),
    fontsNeutral: b.fontsChoice === 'neutral' ? true : undefined,
    images: kit?.images || [],
    confirmedByUser: true,
    colorsConfirmed: b.colorsChoice === 'confirmed',
    logoSource: b.logoChoice === 'none' ? 'none' : text(b.logoSource),
  };
}

/**
 * The text that is voiced. A structured Act / Scene script voices only its quoted
 * dialogue lines (unless the user switched that off); any other script, or one
 * the parser cannot read, is sent exactly as typed.
 */
function voicedScript(value: ScriptStepValue): { script: string; structured: StructuredScript | null } {
  const structured = value.speakDialogueOnly === false ? null : parseStructuredScript(value.script);
  const spoken = spokenScriptFromStructured(structured);
  return spoken ? { script: spoken, structured } : { script: value.script, structured: null };
}

type View = { kind: 'home' } | { kind: 'avatarCreator' } | { kind: 'wizard'; step: 0 | 1 | 2 | 3 } | { kind: 'production'; projectId: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // Wizard state — everything chosen ONCE before generation.
  const [scriptValue, setScriptValue] = useState<ScriptStepValue>({ topic: '', script: '', niche: '', voiceId: '', voiceName: '' });
  const [choices, setChoices] = useState<ForgeChoices>(DEFAULT_CHOICES);
  const [targetSeconds, setTargetSeconds] = useState(120);
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');

  // Production state.
  const [project, setProject] = useState<ForgeProject | null>(null);
  const [insufficient, setInsufficient] = useState<{ required: number; shortfall: number | null } | null>(null);
  const savedToHistory = useRef(false);
  const [refreshFailures, setRefreshFailures] = useState(0);

  const refreshProjects = useCallback(() => {
    listProjects()
      .then((rows) => { setProjects(rows); setProjectsLoaded(true); })
      .catch(() => setProjectsLoaded(true));
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // --- read-only persisted status refresh; the server owns every pipeline step ----
  useEffect(() => {
    if (view.kind !== 'production') return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Consecutive failed refreshes: retried with a gentle backoff and only
    // surfaced after several in a row.
    let failures = 0;
    setRefreshFailures(0);

    const loop = async () => {
      if (cancelled) return;
      try {
        const known = projectRef.current;
        const lastSaved = known ? Date.parse(known.updated_at || '') : NaN;
        const stalled = Boolean(known && known.id === view.projectId && ACTIVE.includes(known.status) && known.status !== 'avatar' && Number.isFinite(lastSaved) && Date.now() - lastSaved > STALE_DRIVE_MS);
        let fetched: ForgeProject | null;
        let tickInsufficient: { required: number; shortfall: number | null } | null = null;
        if (stalled) {
          const result = await tickProject(view.projectId);
          fetched = result.project;
          tickInsufficient = result.insufficient || null;
          if (!fetched) fetched = await getProject(view.projectId);
        } else {
          fetched = await getProject(view.projectId);
        }
        const current = fetched;
        if (!cancelled && current) {
          setInsufficient(tickInsufficient || current.insufficient || null);
          setProject((previous) => {
            if (!previous || previous.id !== current.id || previous.chosen_draft == null) return current;
            if (current.chosen_draft == null) return previous;
            const previousIsPostSelection = ['final_render', 'portrait_finish', 'done'].includes(previous.status);
            const refreshRegressedToDrafts = ['code', 'drafts', 'draft_pick'].includes(current.status);
            return previousIsPostSelection && refreshRegressedToDrafts ? previous : current;
          });
        }
        failures = 0;
        if (!cancelled) setRefreshFailures(0);
      } catch (e) {
        failures += 1;
        if (!cancelled) setRefreshFailures(failures);
        console.warn('[SceneForge] project refresh failed:', e);
      }
      if (cancelled) return;
      timer = setTimeout(loop, failures ? Math.min(30000, TICK_MS * (failures + 1)) : TICK_MS);
    };

    void loop();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [view]);

  // --- browser-owned avatar step --------------------------------------------
  // The platform's HeyGen credential proxy only accepts same-origin browser
  // calls with X-Workspace-DB-Token (a server function gets 401 "Same-origin
  // request required"), so the durable pipeline pauses at "avatar" and
  // publishes project.browser_task. This signed-in tab submits + polls the
  // render, then hands the result back (op complete_avatar_step) and the
  // server resumes from the next step with every earlier output intact.
  const projectRef = useRef<ForgeProject | null>(null);
  useEffect(() => { projectRef.current = project; }, [project]);
  const avatarTaskKey = view.kind === 'production' && project?.status === 'avatar' && project.browser_task?.step === 'avatar'
    ? `${project.id}|${project.browser_task.requested_at || 'task'}`
    : '';

  useEffect(() => {
    if (!avatarTaskKey) return undefined;
    const current = projectRef.current;
    const task = current?.browser_task;
    if (!current || !task) return undefined;
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const run = async () => {
      const requestedAt = Date.parse(String(task.requested_at || ''));
      const waitStartedAt = Number.isFinite(requestedAt) ? requestedAt : Date.now();
      let videoId = String(task.video_id || '');
      let renderApi: 'v2' | 'v3' = task.render_api === 'v3' ? 'v3' : 'v2';
      let avatarModel: 'avatar_iv' | 'legacy_v2' = task.avatar_model === 'avatar_iv' ? 'avatar_iv' : 'legacy_v2';
      let fallbackReason = task.fallback_reason || null;
      try {
        if (!videoId) {
          // Re-read the persisted row first so a second tab (or a reload racing
          // the 6s refresh) never submits a duplicate paid HeyGen render.
          const fresh = await getProject(current.id);
          if (cancelled) return;
          if (fresh?.browser_task?.video_id) {
            videoId = String(fresh.browser_task.video_id);
            renderApi = fresh.browser_task.render_api === 'v3' ? 'v3' : 'v2';
            avatarModel = fresh.browser_task.avatar_model === 'avatar_iv' ? 'avatar_iv' : 'legacy_v2';
            fallbackReason = fresh.browser_task.fallback_reason || null;
          } else if (fresh && fresh.status !== 'avatar') return;
        }
        if (!videoId) {
          if (!task.payload) throw new Error('The avatar render request is missing from the project — use “Retry from this step”.');
          try {
            const submission = await submitAvatarRender(task.payload);
            videoId = submission.videoId;
            renderApi = submission.renderApi;
            avatarModel = submission.avatarModel;
            fallbackReason = submission.fallbackReason;
            const saved = await reportAvatarStep(current.id, { state: 'submitted', video_id: videoId, render_api: renderApi, avatar_model: avatarModel, fallback_reason: fallbackReason });
            if (!cancelled && saved) setProject(saved);
          } catch (submitError) {
            if (!task.transparent_requested || videoId) throw submitError;
            // Not every avatar supports a transparent background — retry the
            // existing v2 audio path once with the selected solid colour.
            const legacy: any = task.payload.fallback_v2 || task.payload;
            const opaqueLegacy = {
              ...legacy,
              video_inputs: (legacy.video_inputs || []).map((input: any) => ({ ...input, background: { type: 'color', value: task.bg_color || '#101214' } })),
            };
            const opaque: any = task.payload.fallback_v2
              ? { ...task.payload, preferred_v3: null, fallback_v2: opaqueLegacy }
              : opaqueLegacy;
            const submission = await submitAvatarRender(opaque, { forceLegacy: true, fallbackReason: 'The selected avatar does not support transparent rendering.' });
            videoId = submission.videoId;
            renderApi = submission.renderApi;
            avatarModel = submission.avatarModel;
            fallbackReason = submission.fallbackReason;
            const saved = await reportAvatarStep(current.id, { state: 'submitted', video_id: videoId, transparent_fallback: true, render_api: renderApi, avatar_model: avatarModel, fallback_reason: fallbackReason });
            if (!cancelled && saved) setProject(saved);
          }
        }
        let pollMisses = 0;
        while (!cancelled) {
          if (Date.now() - waitStartedAt > HEYGEN_MAX_WAIT_MS) {
            throw new Error('HeyGen did not finish this avatar render within 45 minutes. Retry from this step to submit a fresh render; earlier voice and project work is preserved.');
          }
          let status: AvatarRenderStatus;
          try {
            status = await pollAvatarRender(videoId, renderApi);
            pollMisses = 0;
          } catch (pollError: any) {
            // Tolerate transient poll failures (network blips, token rotation).
            // If the v3 operation remains unreachable, fall back to the exact
            // prior v2 audio payload instead of failing the whole project.
            pollMisses += 1;
            if (pollMisses >= 6 && renderApi === 'v3' && task.payload) {
              const reason = `Avatar IV status failed: ${String(pollError?.message || pollError || 'unknown error')}`;
              const submission = await submitAvatarRender(task.payload, { forceLegacy: true, fallbackReason: reason });
              videoId = submission.videoId;
              renderApi = submission.renderApi;
              avatarModel = submission.avatarModel;
              fallbackReason = submission.fallbackReason;
              pollMisses = 0;
              const saved = await reportAvatarStep(current.id, { state: 'submitted', video_id: videoId, render_api: renderApi, avatar_model: avatarModel, fallback_reason: fallbackReason });
              if (!cancelled && saved) setProject(saved);
              continue;
            }
            if (pollMisses >= 6) throw pollError;
            await wait(8000);
            continue;
          }
          if (status.status === 'failed' && renderApi === 'v3' && task.payload) {
            const reason = `Avatar IV render failed: ${status.error || 'HeyGen reported a v3 failure.'}`;
            const submission = await submitAvatarRender(task.payload, { forceLegacy: true, fallbackReason: reason });
            videoId = submission.videoId;
            renderApi = submission.renderApi;
            avatarModel = submission.avatarModel;
            fallbackReason = submission.fallbackReason;
            const saved = await reportAvatarStep(current.id, { state: 'submitted', video_id: videoId, render_api: renderApi, avatar_model: avatarModel, fallback_reason: fallbackReason });
            if (!cancelled && saved) setProject(saved);
            continue;
          }
          if (status.status === 'failed') throw new Error(status.error || 'HeyGen reported that the avatar render failed.');
          if (status.status === 'completed' && status.url) {
            let wordTimestamps;
            try {
              try {
                wordTimestamps = await transcribeAvatarAudio(status.url, current.studio_config.captionLanguage || 'hinglish');
              } catch (masterTimingError) {
                console.warn('[SceneForge] HeyGen master timing unavailable; using the exact source voice chunks:', masterTimingError);
                wordTimestamps = await transcribeVoiceChunks(current.heygen_chunks, current.studio_config.captionLanguage || 'hinglish');
              }
            } catch (timingError) {
              // The server retains its deterministic estimate as a degraded
              // fallback, but normal runs send Deepgram's actual voice timing.
              console.warn('[SceneForge] exact voice timing unavailable; using fallback:', timingError);
            }
            const done = await reportAvatarStep(current.id, {
              state: 'completed',
              video_id: videoId,
              video_url: status.url,
              duration_sec: status.durationSec,
              word_timestamps: wordTimestamps,
            });
            if (!cancelled && done) setProject(done);
            return;
          }
          await wait(8000);
        }
      } catch (error: any) {
        if (cancelled) return;
        const message = String(error?.message || error || 'HeyGen avatar generation failed.');
        try {
          const failed = await reportAvatarStep(current.id, { state: 'failed', video_id: videoId || undefined, error: message });
          if (!cancelled && failed) setProject(failed);
        } catch (reportError) {
          console.warn('[SceneForge] the avatar failure could not be saved:', reportError);
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [avatarTaskKey]);

  // --- save finished videos to the shared cross-app history ----------------
  useEffect(() => {
    if (!project || project.status !== 'done' || savedToHistory.current) return;
    savedToHistory.current = true;
    // Auto Editor deliveries are written to the shared history by the pipeline itself.
    if (isAutoProject(project)) return;
    if (project.final_video_url) {
      void saveVideoToHistory({ appId: 'sceneforge', title: `${project.topic} (16:9)`, videoUrl: project.final_video_url, durationSec: project.avatar_duration_sec });
    }
    if (project.portrait_video_url) {
      void saveVideoToHistory({ appId: 'sceneforge', title: `${project.topic} (9:16)`, videoUrl: project.portrait_video_url, durationSec: project.avatar_duration_sec });
    }
  }, [project]);

  const voiced = useMemo(() => voicedScript(scriptValue), [scriptValue]);
  const estimatedSeconds = voiced.script.trim()
    ? Math.max(10, Math.round(voiced.script.trim().split(/\s+/).length / 2.4))
    : targetSeconds;

  const fullChoices = useCallback((brandOverride?: ProjectBrand): ForgeChoices => ({
    ...choices,
    style: AUTO_EDITOR_STYLE_ID,
    brand: brandOverride || choices.brand,
    voiceId: scriptValue.voiceId,
    voiceName: scriptValue.voiceName,
    niche: scriptValue.niche,
  }), [choices, scriptValue]);

  const ensureDraftProject = async (brandOverride?: ProjectBrand): Promise<string> => {
    const prepared = fullChoices(brandOverride);
    const input = {
      topic: scriptValue.topic || scriptValue.script.slice(0, 60) || 'Untitled video',
      script: scriptValue.script,
      niche: scriptValue.niche,
      style: AUTO_EDITOR_STYLE_ID,
      target_length_sec: targetSeconds,
      choices: prepared,
    };
    if (draftProjectId) {
      await saveProjectDraft(draftProjectId, input);
      return draftProjectId;
    }
    const created = await createProject(input);
    setDraftProjectId(created.id);
    refreshProjects();
    return created.id;
  };

  const openBrandStep = async () => {
    if (startBusy) return;
    setStartBusy(true); setStartError('');
    try {
      const brand = choices.brand || defaultProjectBrand(AUTO_EDITOR_STYLE_ID);
      if (!choices.brand) setChoices((current) => ({ ...current, brand }));
      await ensureDraftProject(brand);
      setView({ kind: 'wizard', step: 3 });
    } catch (error: any) {
      setStartError(String(error?.message || error || 'The project draft could not be saved.'));
    } finally { setStartBusy(false); }
  };

  useEffect(() => {
    if (view.kind !== 'wizard' || view.step !== 3 || !draftProjectId || !choices.brand) return undefined;
    const timer = setTimeout(() => {
      void saveProjectDraft(draftProjectId, {
        script: scriptValue.script,
        topic: scriptValue.topic || scriptValue.script.slice(0, 60) || 'Untitled video',
        niche: scriptValue.niche,
        style: AUTO_EDITOR_STYLE_ID,
        target_length_sec: targetSeconds,
        choices: fullChoices(),
      }).catch((error) => setStartError(String(error?.message || error || 'Brand changes could not be saved.')));
    }, 500);
    return () => clearTimeout(timer);
  }, [choices.brand, draftProjectId, fullChoices, scriptValue, targetSeconds, view]);

  const begin = async () => {
    if (startBusy) return;
    setStartBusy(true);
    setStartError('');
    try {
      // Validate the email-backed wallet before starting paid generation. The
      // draft project already owns any logo uploaded from the Brand step.
      const missingBrief = brandBriefMissing(choices.brandBrief, choices.brand);
      if (missingBrief.length) throw new Error(`Before starting, please confirm ${missingBrief.join(' and ')} in the quick questions above.`);
      await requireVerifiedCreditSession();
      const spoken = voicedScript(scriptValue);
      const prepared = {
        ...fullChoices(),
        brandContext: briefBrandContext(choices.brandBrief),
        ...(spoken.structured ? { structuredScript: scriptValue.script.slice(0, 30000), scriptOutline: structuredOutline(spoken.structured) } : {}),
      };
      const projectId = await ensureDraftProject();
      const started = await startProject(projectId, spoken.script, prepared);
      savedToHistory.current = false;
      setProject(started);
      setInsufficient(null);
      setView({ kind: 'production', projectId: started.id });
      refreshProjects();
    } catch (e: any) {
      setStartError(String(e?.message || e));
    } finally {
      setStartBusy(false);
    }
  };

  const openProject = (p: ForgeProject) => {
    if (p.status === 'draft') {
      setDraftProjectId(p.id);
      setChoices({ ...DEFAULT_CHOICES, ...(p.studio_config || {}), style: AUTO_EDITOR_STYLE_ID });
      setScriptValue({ topic: p.topic || '', script: p.script || '', niche: p.niche || '', voiceId: p.studio_config?.voiceId || '', voiceName: p.studio_config?.voiceName || '' });
      setTargetSeconds(p.target_length_sec || 120);
      setView({ kind: 'wizard', step: 3 });
      return;
    }
    savedToHistory.current = p.status === 'done';
    setProject(p);
    setInsufficient(p.insufficient || null);
    setView({ kind: 'production', projectId: p.id });
  };

  const stepReady = (step: number): boolean => {
    if (step === 0) return Boolean(scriptValue.script.trim() && scriptValue.voiceId);
    if (step === 1) return Boolean(choices.avatarId);
    return true;
  };

  const shellStyle: CSSProperties = {
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: FONT.body,
    minHeight: '100%',
    padding: '20px clamp(14px, 4vw, 32px) 48px',
  };

  const header = (
    <header style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
        <span style={{ alignItems: 'center', background: GRADIENT.action, borderRadius: 10, color: COLORS.onAccent, display: 'flex', height: 36, justifyContent: 'center', width: 36 }}>
          <Film size={18} />
        </span>
        <div>
          <h1 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>SceneForge</h1>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>Avatar video → fully automatic Remotion edit · one finished MP4</p>
        </div>
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }}>
        <nav aria-label="SceneForge sections" style={{ background: SOFT_BUTTON_BG, border: 'none', borderRadius: 12, display: 'flex', flexWrap: 'wrap', padding: 3 }}>
          <button type="button" onClick={() => setView({ kind: 'home' })} style={{ alignItems: 'center', background: view.kind === 'avatarCreator' ? 'transparent' : COLORS.accentSoft, border: 'none', borderRadius: 8, color: view.kind === 'avatarCreator' ? COLORS.muted : COLORS.accent, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 6, minHeight: 36, padding: '0 11px' }} data-testid="nav-sceneforge-videos">
            <Film size={14} /> Videos
          </button>
          {project && view.kind === 'production' ? <button type="button" onClick={() => setView({ kind: 'production', projectId: project.id })} style={{ alignItems: 'center', background: COLORS.accentSoft, border: 'none', borderRadius: 8, color: COLORS.accent, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 6, minHeight: 36, maxWidth: 220, padding: '0 11px' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.topic || 'In production'}</span></button> : null}
          <button type="button" onClick={() => { setDraftProjectId(''); setChoices((current) => ({ ...current, brand: undefined, brandBrief: undefined })); setView({ kind: 'avatarCreator' }); }} style={{ alignItems: 'center', background: view.kind === 'avatarCreator' ? COLORS.accentSoft : 'transparent', border: 'none', borderRadius: 8, color: view.kind === 'avatarCreator' ? COLORS.accent : COLORS.muted, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, gap: 6, minHeight: 36, padding: '0 11px' }} data-testid="nav-sceneforge-avatar-creator">
            <UserRoundPlus size={14} /> Saved Avatars
          </button>
        </nav>
        <CreditBalance variant="chrome" />
      </div>
    </header>
  );

  // --------------------------- AVATAR CREATOR -------------------------------
  if (view.kind === 'avatarCreator') {
    return (
      <div style={shellStyle}>
        {header}
        <AvatarCreator
          onUse={(avatar) => {
            setDraftProjectId('');
            setChoices((current) => ({
              ...current,
              brand: undefined, brandBrief: undefined,
              avatarId: String(avatar.provider_avatar_id || ''),
              avatarName: avatar.name,
              avatarGestures: [],
              avatarEmotions: [],
            }));
            setView({ kind: 'wizard', step: 0 });
          }}
        />
      </div>
    );
  }

  // ------------------------------- HOME -------------------------------------
  if (view.kind === 'home') {
    const active = projects.filter((p) => p.status === 'draft' || ACTIVE.indexOf(p.status) >= 0 || p.status === 'draft_pick' || p.status === 'failed');
    const finished = projects.filter((p) => p.status === 'done');
    return (
      <div style={shellStyle}>
        {header}
        <div style={{ display: 'grid', gap: 24, maxWidth: 1100 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => { setDraftProjectId(''); setChoices((current) => ({ ...current, brand: undefined, brandBrief: undefined })); setView({ kind: 'wizard', step: 0 }); }}
              style={{ alignItems: 'center', background: GOLD_BUTTON_BG, border: 'none', borderRadius: 14, boxShadow: '0 10px 28px rgba(212,175,55,.18)', color: COLORS.onAccent, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 16, fontWeight: 700, gap: 10, justifyContent: 'center', minHeight: 56, padding: '0 22px' }}
              data-testid="button-new-video"
            >
              <Plus size={18} /> New avatar video
            </button>
            <button
              type="button"
              onClick={() => setView({ kind: 'avatarCreator' })}
              style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: 14, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, gap: 9, justifyContent: 'center', minHeight: 56, padding: '0 20px' }}
              data-testid="button-open-avatar-creator"
            >
              <UserRoundPlus size={18} color={COLORS.accent} /> Saved avatar library
            </button>
          </div>

          {!projectsLoaded ? (
            <div aria-label="Loading your projects" role="status" style={{ display: 'grid', gap: 8 }}>
              {[0, 1, 2].map((row) => <div key={row} className="animate-pulse" style={{ ...SOFT_PANEL, height: 64 }} />)}
            </div>
          ) : null}

          {active.length ? (
            <section>
              <h2 style={{ color: COLORS.muted, fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', margin: '0 0 10px', textTransform: 'uppercase' }}>In production</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {active.map((p) => (
                  <button key={p.id} type="button" onClick={() => openProject(p)} style={{ ...SOFT_PANEL, alignItems: 'center', color: COLORS.text, cursor: 'pointer', display: 'flex', gap: 12, minHeight: 60, padding: '10px 14px', textAlign: 'left', width: '100%' }} data-testid={`button-open-${p.id}`}>
                    {p.status === 'failed' ? <XCircle size={16} color={COLORS.danger} /> : p.status === 'draft' ? <Pencil size={16} color={COLORS.accent} /> : <Loader2 size={16} color={COLORS.accent} className="animate-spin" />}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.topic}</span>
                      <span style={{ color: COLORS.muted, display: 'block', fontSize: 12.5 }}>{p.status === 'draft' ? 'Setup saved — continue to start the automatic edit' : p.status === 'draft_pick' ? 'Waiting for you — pick an edit style' : p.status === 'failed' ? friendlyFailure(p).title : safeErrorText(p.stage_note, 'In production…', { script: p.script, maxLength: 160, context: 'project list status' })}</span>
                    </span>
                    <ArrowRight size={15} color={COLORS.muted} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {finished.length ? (
            <section>
              <h2 style={{ color: COLORS.muted, fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, letterSpacing: '0.07em', margin: '0 0 10px', textTransform: 'uppercase' }}>Finished</h2>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {finished.map((p) => (
                  <button key={p.id} type="button" onClick={() => openProject(p)} style={{ ...SOFT_PANEL, cursor: 'pointer', overflow: 'hidden', padding: 0, textAlign: 'left' }} data-testid={`button-open-done-${p.id}`}>
                    {p.final_video_url ? <video src={p.final_video_url.indexOf('#') >= 0 ? p.final_video_url : `${p.final_video_url}#t=0.1`} muted playsInline preload="metadata" style={{ aspectRatio: '16 / 9', background: '#000', display: 'block', objectFit: 'contain', width: '100%' }} /> : <span style={{ alignItems: 'center', aspectRatio: '16 / 9', background: 'linear-gradient(120deg, #0b0d12, #1a1d26)', display: 'flex', justifyContent: 'center' }}><Film size={20} color={COLORS.accent} /></span>}
                    <span style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', padding: '10px 12px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.topic}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {projectsLoaded && !projects.length ? (
            <div style={{ ...SOFT_PANEL, color: COLORS.secondary, fontSize: 14, lineHeight: '22px', maxWidth: 640, padding: 20 }}>
              <Clapperboard size={18} color={COLORS.accent} style={{ marginBottom: 8 }} />
              <div style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Your first SceneForge video</div>
              Write (or generate) a script, pick a voice and an avatar, then press start once — SceneForge voices it with ElevenLabs, renders the HeyGen avatar,
              and the Remotion agent edits it automatically with motion graphics, b-roll, music and captions in your brand. You get one finished, downloadable video.
            </div>
          ) : null}

        </div>
      </div>
    );
  }

  // ------------------------------ WIZARD ------------------------------------
  if (view.kind === 'wizard') {
    const step = view.step;
    const titles = ['Script & voice', 'Select avatar', 'Edit settings', 'Brand & start'];
    return (
      <div style={shellStyle}>
        {header}
        <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 18 }}>
          <button type="button" onClick={() => (step === 0 ? setView({ kind: 'home' }) : setView({ kind: 'wizard', step: (step - 1) as 0 | 1 | 2 | 3 }))} aria-label="Back" style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: 999, flex: '0 0 auto', color: COLORS.secondary, cursor: 'pointer', display: 'flex', height: 40, justifyContent: 'center', width: 40 }} data-testid="button-wizard-back">
            <ArrowLeft size={16} />
          </button>
          {titles.map((t, i) => (
            <span key={t} style={{ alignItems: 'center', color: i === step ? COLORS.accent : i < step ? COLORS.secondary : COLORS.muted, display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 6 }}>
              <span style={{ alignItems: 'center', background: i === step ? GOLD_BUTTON_BG : i < step ? COLORS.accentSoft : 'var(--vg-info-bg)', border: 'none', borderRadius: 999, color: i === step ? COLORS.onAccent : undefined, display: 'flex', fontSize: 11.5, height: 22, justifyContent: 'center', width: 22 }}>{i + 1}</span>
              <span style={{ display: window.innerWidth < 520 && i !== step ? 'none' : 'inline' }}>{t}</span>
            </span>
          ))}
        </div>

        {step === 0 ? <ForgeScriptStep value={scriptValue} targetSeconds={targetSeconds} onChange={setScriptValue} /> : null}
        {step === 1 ? (
          <ForgeAvatarStep avatarId={String(choices.avatarId || '')} onPick={(a) => setChoices({ ...choices, avatarId: a.id, avatarName: a.name, avatarGestures: a.gestures, avatarEmotions: a.emotions })} />
        ) : null}
        {step === 2 ? (
          <ForgeChoicesStep choices={choices} targetSeconds={targetSeconds} estimatedSeconds={estimatedSeconds} script={scriptValue.script} onChange={setChoices} onTargetChange={setTargetSeconds} />
        ) : null}
        {step === 3 && draftProjectId && choices.brand ? (
          <div style={{ marginBottom: 18 }}>
            <ForgeBrandBrief
              projectId={draftProjectId}
              styleId={AUTO_EDITOR_STYLE_ID}
              brief={choices.brandBrief}
              onBriefChange={(brandBrief) => setChoices((current) => ({ ...current, brandBrief }))}
              brand={choices.brand}
              onBrandChange={(brand) => setChoices((current) => ({ ...current, brand }))}
              formatLabel={(choices.outputFormat || '16:9') === '9:16' ? '9:16 vertical' : '16:9 landscape'}
              lengthLabel={`about ${Math.floor(estimatedSeconds / 60)}:${String(estimatedSeconds % 60).padStart(2, '0')} min (follows your script)`}
              onEditSettings={() => setView({ kind: 'wizard', step: 2 })}
            />
          </div>
        ) : null}
        {step === 3 && draftProjectId ? (
          <ForgeBrandStep projectId={draftProjectId} styleId={AUTO_EDITOR_STYLE_ID} value={choices.brand} onChange={(brand) => setChoices((current) => ({ ...current, brand }))} />
        ) : null}
        {step === 3 ? <div style={{ marginTop: 16, maxWidth: 960 }}><AutoBudgetHint script={voiced.script} seconds={estimatedSeconds} /></div> : null}

        {startError ? <div style={{ color: COLORS.danger, fontSize: 13.5, marginTop: 14 }}>{safeErrorText(startError, 'SceneForge couldn’t start this video — please try again in a moment.', { script: scriptValue.script, maxLength: 260, context: 'start error' })}</div> : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step < 3 ? (
            <button
              type="button"
              disabled={startBusy || !stepReady(step)}
              onClick={() => step === 2 ? void openBrandStep() : setView({ kind: 'wizard', step: (step + 1) as 0 | 1 | 2 | 3 })}
              style={{ alignItems: 'center', background: stepReady(step) ? GOLD_BUTTON_BG : COLORS.raised, border: 'none', borderRadius: RADIUS.sm, color: stepReady(step) ? COLORS.onAccent : COLORS.muted, cursor: stepReady(step) ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, gap: 8, minHeight: 48, padding: '0 22px' }}
              data-testid="button-wizard-next"
            >
              {startBusy && step === 2 ? <Loader2 size={16} className="animate-spin" /> : null}{step === 2 ? 'Continue to Brand' : 'Continue'} <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={startBusy || !stepReady(0) || !stepReady(1) || !stepReady(2) || brandBriefMissing(choices.brandBrief, choices.brand).length > 0}
              onClick={begin}
              style={{ alignItems: 'center', background: startBusy ? COLORS.raised : GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: startBusy ? COLORS.muted : COLORS.onAccent, cursor: startBusy ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, gap: 8, minHeight: 48, padding: '0 22px' }}
              data-testid="button-generate"
            >
              {startBusy ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
              {startBusy ? 'Starting…' : 'Create my finished video'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------- PRODUCTION ----------------------------------
  return (
    <div style={shellStyle}>
      {header}
      <button type="button" onClick={() => { setView({ kind: 'home' }); refreshProjects(); }} style={{ alignItems: 'center', background: 'transparent', border: 'none', color: COLORS.muted, cursor: 'pointer', display: 'flex', fontFamily: FONT.body, fontSize: 13.5, gap: 6, marginBottom: 14, minHeight: 40, padding: 0 }} data-testid="button-back-home">
        <ArrowLeft size={14} /> All projects
      </button>
      {refreshFailures >= 5 ? (
        <div role="status" style={{ ...SOFT_PANEL, color: COLORS.secondary, fontSize: 13, lineHeight: '19px', marginBottom: 14, maxWidth: 1100, padding: '10px 14px' }} data-testid="sceneforge-refresh-trouble">
          SceneForge can’t reach the server to refresh this project right now — it keeps retrying automatically. Your video keeps processing on the server.
        </div>
      ) : null}
      {project && isAutoProject(project) ? (
        <SafeBoundary key={`auto-${project.id}`} label="Auto Editor board" message="Something went wrong showing this project. Your video keeps processing on the server.">
        <AutoEditBoard
          project={project}
          insufficient={insufficient}
          onRetry={async () => {
            const p = await retryFromStep(project.id);
            if (p) setProject(p);
          }}
          onRunQa={async () => {
            const p = await runQaAudit(project.id);
            if (p) setProject(p);
          }}
          onQaFixes={async (approve, ignore) => {
            const p = await reviewQaFixes(project.id, approve, ignore);
            if (p) setProject(p);
          }}
          onRetryRender={async () => {
            const p = await retryRender(project.id);
            savedToHistory.current = false;
            if (p) setProject(p);
          }}
          onReedit={async (instruction) => {
            const p = await autoReedit(project.id, instruction);
            savedToHistory.current = false;
            if (p) setProject(p);
          }}
          onBrandAnswers={async (answers) => {
            const p = await autoBrandAnswers(project.id, answers);
            savedToHistory.current = false;
            if (p) setProject(p);
          }}
          onCancel={async () => {
            const p = await cancelProject(project.id);
            if (p) setProject(p);
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete “${project.topic}”? This removes the project and its saved SceneForge checkpoints.`)) return;
            await deleteProject(project.id);
            setProjects((current) => current.filter((item) => item.id !== project.id));
            setProject(null);
            setView({ kind: 'home' });
            refreshProjects();
          }}
        />
        </SafeBoundary>
      ) : project ? (
        <SafeBoundary key={`board-${project.id}`} label="production board" message="Something went wrong showing this project. Your video keeps processing on the server.">
        <ForgeProductionBoard
          project={project}
          insufficient={insufficient}
          onChooseDraft={async (v) => {
            const p = await chooseDraft(project.id, v);
            if (p) setProject(p);
          }}
          onBrandUpdate={async (brand) => {
            const p = await updateProjectBrand(project.id, brand);
            if (p) setProject(p);
          }}
          onEdit={async (changes) => {
            const p = await applyEdit(project.id, changes);
            savedToHistory.current = false;
            if (p) setProject(p);
          }}
          onRetry={async () => {
            const p = await retryFromStep(project.id);
            if (p) setProject(p);
          }}
          onStepAction={async (step, action, value) => {
            const p = await reviewStep(project.id, step, action, value);
            if (p) setProject(p);
          }}
          onAgenticRerun={async (instruction) => {
            const data = await callHook('sceneforge-pipeline', { op: 'agentic_rerun', project_id: project.id, instruction });
            if (!data?.ok || !data?.project) throw new Error(data?.error || 'Agentic Director could not start the revision.');
            savedToHistory.current = false;
            setProject(data.project);
          }}
          onCancel={async () => {
            const p = await cancelProject(project.id);
            if (p) setProject(p);
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete “${project.topic}”? This removes the project and its saved SceneForge checkpoints.`)) return;
            await deleteProject(project.id);
            setProjects((current) => current.filter((item) => item.id !== project.id));
            setProject(null);
            setView({ kind: 'home' });
            refreshProjects();
          }}
        />
        </SafeBoundary>
      ) : (
        <div role="status" aria-label="Loading the project" style={{ display: 'grid', gap: 14, maxWidth: 1100 }}>
          <div className="animate-pulse" style={{ ...SOFT_PANEL, height: 64 }} />
          <PreviewSkeleton label="Loading the project…" />
        </div>
      )}
    </div>
  );
}
