/**
 * Script-to-Video studio — three steps: Choose → Review → Generate.
 *
 * Choose: "I have an idea" or "I have my script", the video model (pre-selected,
 * changeable), frame and length; advanced settings stay collapsed.
 * Review: the Opus 5.5 agent's script versions (original and improved are
 * saved once and never rewritten), the scene plan fitted to the selected
 * model, per-scene detailed prompts, @characters, references and an optional
 * storyboard. Switching model re-plans automatically from the active version.
 * Generate: the plan is saved as a normal project and handed to the existing
 * production board, which owns credits, durable rendering and recovery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, ChevronDown, Clapperboard, Film as FilmIcon, ImagePlus,
  Lightbulb, Loader2, RefreshCw, RotateCcw, ScrollText, Sparkles, Trash2, UserRound, Wand2, X,
} from 'lucide-react';
import { T, db, generateOpenAiImage, referenceSlug, uploadDataUrl } from './api';
import type { Film, StoredReference } from './api';
import { friendlyErrorMessage } from './friendlyErrors';
import MentionTextarea from './MentionTextarea';
import type { MentionOption } from './MentionTextarea';
import StudioErrorBoundary from './StudioErrorBoundary';
import {
  StudioAgentError, characterSheetPrompt, composePrompt, ideaToScript, improveScript, planForModel, rewriteScenePrompt,
  writeStoryboardPrompts,
} from './studioAgent';
import type { StudioCharacter, StudioPlan, StudioReference, StudioScene } from './studioAgent';
import { legalSeconds, rememberModelId, rememberedModelId, studioModelById, studioModels } from './studioModels';
import type { StudioModel } from './studioModels';
import { createStudioFilm } from './studioFilm';
import type { ScriptVersion } from './studioFilm';
import { clearSeriesPreset, loadStudioProfile, lockedStyleFor, peekSeriesPreset } from './studioProfile';
import type { SeriesInfo, StudioProfile } from './studioProfile';

type Step = 'choose' | 'review' | 'generate';
type Mode = 'idea' | 'script';
type Aspect = '16:9' | '9:16' | '1:1';

interface Draft {
  step: Step;
  mode: Mode | null;
  idea: string;
  script: string;
  modelId: string;
  aspect: Aspect;
  targetSeconds: number;
  tone: string;
  audience: string;
  narration: boolean;
  attachStoryboard: boolean;
  projectRefs: StudioReference[];
  versions: ScriptVersion[];
  activeVersionId: string | null;
  plan: StudioPlan | null;
  /** Series this video continues ("Make another like this"). */
  series: SeriesInfo | null;
  /** Cast reused from the saved profile or series; their sheets are never redrawn. */
  lockedCast: StudioCharacter[];
  /** Look reused from the saved profile or series. */
  lockedStyle: string;
  /** Answer to "Use the same cast?" for this draft. */
  profileChoice: 'none' | 'used' | 'declined';
}

const DRAFT_KEY = 's2v:studio:draft:v1';

function freshDraft(): Draft {
  return {
    step: 'choose', mode: null, idea: '', script: '', modelId: rememberedModelId(), aspect: '16:9', targetSeconds: 30,
    tone: '', audience: '', narration: true, attachStoryboard: false, projectRefs: [], versions: [], activeVersionId: null, plan: null,
    series: null, lockedCast: [], lockedStyle: '', profileChoice: 'none',
  };
}

function draftFromProfile(base: Draft, profile: StudioProfile, series: SeriesInfo | null): Draft {
  const aspect = (['16:9', '9:16', '1:1'] as Aspect[]).includes(profile.aspect as Aspect) ? profile.aspect as Aspect : base.aspect;
  return {
    ...base,
    mode: series ? 'idea' : base.mode,
    modelId: profile.model_id ? studioModelById(profile.model_id).id : base.modelId,
    aspect,
    targetSeconds: Math.max(8, Math.min(180, Math.round(Number(profile.target_seconds) || base.targetSeconds))),
    tone: profile.tone || base.tone,
    audience: profile.audience || base.audience,
    narration: profile.narration !== false,
    projectRefs: Array.isArray(profile.project_refs) && profile.project_refs.length ? profile.project_refs : base.projectRefs,
    lockedCast: (profile.cast || []).filter((c) => c && c.imageUrl),
    lockedStyle: lockedStyleFor(profile),
    series,
    profileChoice: 'used',
  };
}

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return freshDraft();
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const draft = { ...freshDraft(), ...parsed };
    if (draft.step === 'generate') draft.step = draft.plan ? 'review' : 'choose';
    if (draft.plan) draft.plan = { ...draft.plan, scenes: draft.plan.scenes.map((s) => ({ ...s, storyboard_status: s.storyboard_url ? 'ready' : 'idle' })) };
    return draft;
  } catch {
    return freshDraft();
  }
}

function saveDraft(draft: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage full or private mode */ }
}

export function clearStudioDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

function friendly(error: unknown): string {
  if (error instanceof StudioAgentError) return error.friendly;
  try { return friendlyErrorMessage(error); } catch { return 'Something went wrong. Please try again.'; }
}

function versionId() { return `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

async function uploadPickedImage(): Promise<{ url: string; name: string } | null> {
  const file = await pickImageFile();
  if (!file) return null;
  if (file.size > 12 * 1024 * 1024) throw new StudioAgentError('That image is larger than 12 MB. Please choose a smaller one.');
  const dataUrl = await readFileAsDataUrl(file);
  const url = await uploadDataUrl(dataUrl, `s2v-ref-${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`);
  return { url, name: file.name.replace(/\.[a-z0-9]+$/i, '') };
}

const STUDIO_CSS = `
  .stv3 { --stv3-radius: 18px; color: ${T.bone}; font-family: ${T.sans}; display: grid; gap: 22px; padding: 8px 0 120px; }
  .stv3 h2 { margin: 0; font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -0.02em; line-height: 1.15; }
  .stv3 h3 { margin: 0; font-size: 16px; letter-spacing: -0.01em; }
  .stv3-sub { color: ${T.muted}; font-size: 14px; line-height: 1.55; margin: 6px 0 0; }
  .stv3-card { background: ${T.card}; border: 1px solid ${T.line}; border-radius: var(--stv3-radius); padding: 20px; }
  .stv3-steps { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .stv3-step { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; border: 1px solid ${T.line}; color: ${T.muted}; font-size: 13px; font-weight: 600; background: transparent; }
  .stv3-step.is-active { color: ${T.bone}; border-color: color-mix(in srgb, ${T.live} 60%, transparent); background: color-mix(in srgb, ${T.live} 12%, transparent); }
  .stv3-step.is-done { color: ${T.bone}; }
  .stv3-step-num { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; background: color-mix(in srgb, ${T.live} 18%, transparent); color: ${T.bone}; }
  .stv3-choice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .stv3-choice { text-align: left; cursor: pointer; display: grid; gap: 10px; padding: 24px; border-radius: 22px; border: 1px solid ${T.line}; background: linear-gradient(160deg, color-mix(in srgb, ${T.live} 6%, ${T.card}), ${T.card}); color: ${T.bone}; min-height: 150px; transition: border-color .18s ease, transform .18s ease, box-shadow .18s ease; }
  .stv3-choice:hover { transform: translateY(-2px); border-color: color-mix(in srgb, ${T.live} 45%, transparent); }
  .stv3-choice.is-active { border-color: ${T.live}; box-shadow: 0 0 0 3px color-mix(in srgb, ${T.live} 22%, transparent); }
  .stv3-choice-icon { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, ${T.live} 16%, transparent); color: ${T.live}; }
  .stv3-input { box-sizing: border-box; background: ${T.input}; color: ${T.bone}; border: 1px solid ${T.line}; border-radius: 14px; padding: 14px 16px; font: inherit; font-size: 15px; line-height: 1.55; }
  .stv3-input:focus { outline: none; border-color: color-mix(in srgb, ${T.live} 70%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, ${T.live} 18%, transparent); }
  .stv3-input[readonly] { opacity: .92; }
  .stv3-label { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${T.dim}; margin-bottom: 8px; display: block; }
  .stv3-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .stv3-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .stv3-models { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .stv3-model { text-align: left; cursor: pointer; padding: 14px; border-radius: 14px; border: 1px solid ${T.line}; background: ${T.raised}; color: ${T.bone}; display: grid; gap: 6px; }
  .stv3-model.is-active { border-color: ${T.live}; background: color-mix(in srgb, ${T.live} 10%, ${T.raised}); }
  .stv3-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid ${T.line}; color: ${T.muted}; background: transparent; }
  .stv3-chip.is-live { color: ${T.bone}; border-color: color-mix(in srgb, ${T.live} 50%, transparent); background: color-mix(in srgb, ${T.live} 12%, transparent); }
  .stv3-seg { display: inline-flex; padding: 4px; border-radius: 12px; border: 1px solid ${T.line}; background: ${T.raised}; gap: 4px; }
  .stv3-seg button { border: none; background: transparent; color: ${T.muted}; padding: 8px 14px; border-radius: 9px; font-weight: 600; cursor: pointer; min-height: 36px !important; }
  .stv3-seg button.is-active { background: color-mix(in srgb, ${T.live} 18%, transparent); color: ${T.bone}; }
  .stv3-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 18px; border-radius: 12px; border: 1px solid ${T.line}; background: ${T.raised}; color: ${T.bone}; font-weight: 650; cursor: pointer; font-size: 14px; }
  .stv3-btn:hover:not(:disabled) { border-color: color-mix(in srgb, ${T.live} 50%, transparent); }
  .stv3-btn:disabled { opacity: .5; cursor: not-allowed; }
  .stv3-btn.is-primary { background: ${T.live}; border-color: ${T.live}; color: var(--vg-on-accent, #111); }
  .stv3-btn.is-primary:hover:not(:disabled) { filter: brightness(1.06); }
  .stv3-btn.is-ghost { background: transparent; border-color: transparent; color: ${T.muted}; }
  .stv3-btn.is-small { padding: 7px 12px; font-size: 13px; min-height: 36px !important; }
  .stv3-footer { position: sticky; bottom: 12px; z-index: 6; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; border: 1px solid ${T.line}; background: color-mix(in srgb, ${T.canvas} 88%, transparent); backdrop-filter: blur(10px); }
  .stv3-banner { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 14px; font-size: 14px; line-height: 1.5; }
  .stv3-banner.is-error { border: 1px solid color-mix(in srgb, ${T.fault} 45%, transparent); background: color-mix(in srgb, ${T.fault} 9%, transparent); }
  .stv3-banner.is-info { border: 1px solid color-mix(in srgb, ${T.live} 35%, transparent); background: color-mix(in srgb, ${T.live} 7%, transparent); }
  .stv3-progress { display: grid; gap: 14px; place-items: center; text-align: center; padding: 48px 20px; }
  .stv3-bar { width: min(420px, 100%); height: 6px; border-radius: 999px; background: ${T.line}; overflow: hidden; }
  .stv3-bar > span { display: block; height: 100%; width: 40%; background: ${T.live}; border-radius: 999px; animation: stv3-slide 1.4s ease-in-out infinite; }
  @keyframes stv3-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
  .stv3-spin { animation: stv3-rot 1s linear infinite; }
  @keyframes stv3-rot { to { transform: rotate(360deg); } }
  .stv3-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .stv3-tab { padding: 8px 12px; border-radius: 10px; border: 1px solid ${T.line}; background: transparent; color: ${T.muted}; cursor: pointer; font-weight: 600; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; min-height: 36px !important; }
  .stv3-tab.is-active { color: ${T.bone}; border-color: color-mix(in srgb, ${T.live} 55%, transparent); background: color-mix(in srgb, ${T.live} 10%, transparent); }
  .stv3-scene { display: grid; gap: 12px; padding: 18px; border-radius: 18px; border: 1px solid ${T.line}; background: ${T.card}; }
  .stv3-scene-head { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .stv3-thumbs { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .stv3-thumb { position: relative; width: 64px; height: 64px; border-radius: 12px; overflow: hidden; border: 1px solid ${T.line}; background: ${T.raised}; }
  .stv3-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .stv3-thumb button { position: absolute; top: 3px; right: 3px; width: 22px; height: 22px; min-height: 22px !important; border-radius: 50%; border: none; display: grid; place-items: center; background: rgba(0,0,0,.65); color: #fff; cursor: pointer; padding: 0; }
  .stv3-add { width: 64px; height: 64px; border-radius: 12px; border: 1px dashed ${T.line}; background: transparent; color: ${T.muted}; display: grid; place-items: center; cursor: pointer; }
  .stv3-board { width: 100%; max-width: 280px; border-radius: 12px; overflow: hidden; border: 1px solid ${T.line}; background: ${T.raised}; display: grid; place-items: center; color: ${T.dim}; font-size: 12px; }
  .stv3-board img { width: 100%; display: block; }
  .stv3-popover { position: absolute; z-index: 30; left: 12px; right: 12px; top: calc(100% - 6px); max-height: 300px; overflow: auto; border-radius: 14px; border: 1px solid ${T.line}; background: ${T.raised}; box-shadow: 0 18px 40px rgba(0,0,0,.35); padding-bottom: 6px; }
  .stv3-option { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: none; background: transparent; color: ${T.bone}; cursor: pointer; min-height: 44px; }
  .stv3-option.is-active, .stv3-option:hover { background: color-mix(in srgb, ${T.live} 12%, transparent); }
  .stv3-avatar { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: color-mix(in srgb, ${T.live} 14%, transparent); color: ${T.live}; }
  .stv3-details > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; font-weight: 650; color: ${T.muted}; }
  .stv3-details > summary::-webkit-details-marker { display: none; }
  .stv3-details[open] > summary svg { transform: rotate(180deg); }
  .stv3-toggle { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; font-size: 14px; }
  .stv3-toggle input { width: 18px; height: 18px; }
  @media (max-width: 640px) { .stv3-card, .stv3-scene { padding: 14px; } .stv3-choice { padding: 18px; min-height: 120px; } }
`;

function Banner({ tone, children, onRetry, onClose }: { tone: 'error' | 'info'; children: ReactNode; onRetry?: () => void; onClose?: () => void }) {
  return (
    <div className={`stv3-banner is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' ? <AlertCircle size={18} color={T.fault} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} /> : <Sparkles size={18} color={T.live} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />}
      <div style={{ flex: 1 }}>{children}</div>
      {onRetry && <button type="button" className="stv3-btn is-small" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Retry</button>}
      {onClose && <button type="button" className="stv3-btn is-ghost is-small" aria-label="Dismiss" onClick={onClose}><X size={14} aria-hidden="true" /></button>}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ['choose', 'review', 'generate'];
  const labels: Record<Step, string> = { choose: 'Choose', review: 'Review', generate: 'Generate' };
  const at = order.indexOf(step);
  return (
    <nav className="stv3-steps" aria-label="Progress">
      {order.map((item, i) => (
        <span key={item} className={`stv3-step${i === at ? ' is-active' : ''}${i < at ? ' is-done' : ''}`} aria-current={i === at ? 'step' : undefined}>
          <span className="stv3-step-num">{i < at ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
          {labels[item]}
        </span>
      ))}
    </nav>
  );
}

function BusyPanel({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="stv3-card stv3-progress" role="status" aria-live="polite">
      <Loader2 size={28} className="stv3-spin" color={T.live} aria-hidden="true" />
      <div style={{ fontWeight: 700, fontSize: 17 }}>{label}</div>
      {detail && <div className="stv3-sub" style={{ margin: 0 }}>{detail}</div>}
      <div className="stv3-bar"><span /></div>
    </div>
  );
}

interface Props {
  /** Opens a saved project on the existing production board. */
  onOpenFilm: (film: Film) => void;
  /** Opens the classic (pre-rebuild) create screen. */
  onClassic?: () => void;
  initialScript?: string;
}

export default function StudioV3Flow(props: Props) {
  return (
    <StudioErrorBoundary area="the studio" onReset={() => undefined}>
      <StudioInner {...props} />
    </StudioErrorBoundary>
  );
}

function StudioInner({ onOpenFilm, onClassic, initialScript }: Props) {
  const [draft, setDraft] = useState<Draft>(() => {
    const preset = peekSeriesPreset();
    if (preset) return draftFromProfile(freshDraft(), preset.profile, preset.series);
    const loaded = loadDraft();
    if (initialScript && initialScript.trim()) return { ...freshDraft(), mode: 'script', script: initialScript.trim() };
    return loaded;
  });
  const [profile, setProfile] = useState<StudioProfile | null>(() => peekSeriesPreset()?.profile || null);
  const [busy, setBusy] = useState<{ label: string; detail?: string } | null>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [savedRefs, setSavedRefs] = useState<StoredReference[]>([]);
  const [storyboardBusy, setStoryboardBusy] = useState(false);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [sheetStatus, setSheetStatus] = useState<Record<string, 'loading' | 'error'>>({});
  const sheetJobs = useRef(new Map<string, Promise<string | null>>());
  const ensureSheetsRef = useRef<(plan: StudioPlan) => Promise<Record<string, string>>>(async () => ({}));
  const planRun = useRef(0);

  const models = useMemo(() => studioModels(), []);
  const model: StudioModel = useMemo(() => studioModelById(draft.modelId), [draft.modelId]);
  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setDraft((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  }, []);

  useEffect(() => { saveDraft(draft); }, [draft]);
  useEffect(() => { clearSeriesPreset(); }, []);
  useEffect(() => {
    let live = true;
    loadStudioProfile().then((saved) => { if (live && saved) setProfile((current) => current || saved); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    db.listReferences().then(setSavedRefs).catch(() => setSavedRefs([]));
  }, []);

  const activeVersion = draft.versions.find((v) => v.id === draft.activeVersionId) || draft.versions[draft.versions.length - 1] || null;

  const savedCharacters: StudioCharacter[] = useMemo(() => {
    const fromStore = savedRefs
      .filter((r) => r.type === 'character' || !r.type)
      .map((r) => ({ id: r.name, name: r.display_name || r.name, appearance: r.description || '', wardrobe: '', mention: r.name, imageUrl: r.url }));
    const locked = draft.lockedCast.filter((c) => c.mention && !fromStore.some((s) => s.mention === c.mention));
    return [...locked, ...fromStore];
  }, [savedRefs, draft.lockedCast]);

  const mentionOptions: MentionOption[] = useMemo(() => {
    const fromSaved = savedRefs.map((r) => ({ slug: r.name, label: r.display_name || r.name, imageUrl: r.url, note: r.type === 'character' ? 'saved character' : r.type }));
    const fromProject = draft.projectRefs
      .map((r) => ({ slug: referenceSlug(r.label), label: r.label, imageUrl: r.url, note: 'project image' }))
      .filter((o) => o.slug && !fromSaved.some((s) => s.slug === o.slug));
    return [...fromSaved, ...fromProject];
  }, [savedRefs, draft.projectRefs]);

  const addCharacter = useCallback(async (): Promise<MentionOption | null> => {
    try {
      const picked = await uploadPickedImage();
      if (!picked) return null;
      const label = (window.prompt('Name this character (used as @name):', picked.name) || picked.name).trim() || 'character';
      let slug = referenceSlug(label) || `character-${Date.now().toString(36)}`;
      if (savedRefs.some((r) => r.name === slug)) slug = `${slug}-${Date.now().toString(36).slice(-3)}`;
      const created = await db.addReference({ name: slug, display_name: label, url: picked.url, type: 'character' });
      setSavedRefs((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      return { slug: created.name, label: created.display_name || label, imageUrl: created.url, note: 'saved character' };
    } catch (e) {
      setError({ message: friendly(e) });
      return null;
    }
  }, [savedRefs]);

  const brief = useCallback((m: StudioModel) => ({
    aspect: draft.aspect,
    targetSeconds: draft.targetSeconds,
    tone: draft.tone,
    audience: draft.audience,
    model: m,
    characterNotes: savedCharacters.map((c) => `@${c.mention} (${c.name})`).join(', '),
    castNotes: draft.lockedCast.map((c) => `@${c.mention || c.id} (${c.name}${c.appearance ? ` — ${c.appearance}` : ''})`).join('; '),
    lockedStyle: draft.lockedStyle,
    seriesNotes: draft.series ? `Episode ${draft.series.episode} of "${draft.series.title}". Keep the series voice, format and recurring cast, and give this episode its own fresh angle.` : '',
  }), [draft.aspect, draft.targetSeconds, draft.tone, draft.audience, savedCharacters, draft.lockedCast, draft.lockedStyle, draft.series]);

  const runPlan = useCallback(async (scriptText: string, m: StudioModel, scriptVersionId?: string) => {
    const run = ++planRun.current;
    setError(null);
    setBusy({ label: `Planning scenes for ${m.label}…`, detail: 'Your script versions are saved and will not change.' });
    try {
      const plan = await planForModel(scriptText, {
        aspect: draft.aspect,
        targetSeconds: draft.targetSeconds,
        model: m,
        savedCharacters,
        lockedStyle: draft.lockedStyle || undefined,
        lockedCast: draft.lockedCast,
        onProgress: (label) => { if (run === planRun.current) setBusy({ label, detail: 'Your script versions are saved and will not change.' }); },
      });
      if (run !== planRun.current) return;
      setDraft((current) => {
        const previous = current.plan;
        const scenes = plan.scenes.map((scene, i) => {
          const before = previous?.scenes.find((s) => s.title === scene.title) || previous?.scenes[i];
          return before && before.references.length ? { ...scene, references: before.references } : scene;
        });
        return { ...current, plan: { ...plan, scenes, script_version_id: scriptVersionId || current.activeVersionId || undefined }, step: 'review' };
      });
      void ensureSheetsRef.current(plan);
    } catch (e) {
      if (run !== planRun.current) return;
      setError({ message: friendly(e), retry: () => { void runPlan(scriptText, m, scriptVersionId); } });
    } finally {
      if (run === planRun.current) setBusy(null);
    }
  }, [draft.aspect, draft.targetSeconds, savedCharacters, draft.lockedStyle, draft.lockedCast]);

  const startFromChoice = useCallback(async () => {
    setError(null);
    const m = model;
    if (draft.plan && draft.plan.model_id === m.id && draft.versions.length) { update({ step: 'review' }); return; }
    try {
      let versions = draft.versions;
      let original = versions.find((v) => v.kind === 'original');
      if (!original) {
        let originalText = draft.script.trim();
        if (draft.mode === 'idea') {
          setBusy({ label: 'Writing your script from the idea…', detail: 'Claude Opus 5.5 is drafting a detailed, scene-by-scene script.' });
          originalText = await ideaToScript(draft.idea, brief(m));
        }
        original = { id: versionId(), kind: 'original', label: draft.mode === 'idea' ? 'Written from your idea' : 'Your script', text: originalText, created_at: new Date().toISOString() };
        versions = [original];
        update({ versions, activeVersionId: original.id });
      }
      let improved = versions.find((v) => v.kind === 'improved');
      if (!improved) {
        setBusy({ label: 'Improving your script…', detail: 'Keeping your story and intent exactly the same — sharpening visuals and pacing.' });
        try {
          const text = await improveScript(original.text, brief(m));
          improved = { id: versionId(), kind: 'improved', label: 'Improved by the agent', text, created_at: new Date().toISOString() };
          versions = [...versions, improved];
          update({ versions, activeVersionId: improved.id });
        } catch (e) {
          setError({ message: `${friendly(e)} Your original script is kept, and planning continues from it.` });
        }
      }
      const active = improved || original;
      await runPlan(active.text, m, active.id);
    } catch (e) {
      setBusy(null);
      setError({ message: friendly(e), retry: () => { void startFromChoice(); } });
    }
  }, [draft.plan, draft.versions, draft.mode, draft.script, draft.idea, model, brief, update, runPlan]);

  const changeModel = useCallback((id: string) => {
    rememberModelId(id);
    update({ modelId: id });
    const next = studioModelById(id);
    if (draft.step === 'review' && activeVersion && draft.plan && draft.plan.model_id !== id) {
      void runPlan(activeVersion.text, next, activeVersion.id);
    }
  }, [draft.step, draft.plan, activeVersion, runPlan, update]);

  const editActiveText = useCallback((text: string) => {
    setDraft((current) => {
      const active = current.versions.find((v) => v.id === current.activeVersionId);
      if (active && active.kind === 'edited') {
        return { ...current, versions: current.versions.map((v) => v.id === active.id ? { ...v, text } : v) };
      }
      const edited: ScriptVersion = { id: versionId(), kind: 'edited', label: 'Your edits', text, created_at: new Date().toISOString() };
      return { ...current, versions: [...current.versions.filter((v) => v.kind !== 'edited'), edited], activeVersionId: edited.id };
    });
  }, []);

  const updateScene = useCallback((key: string, patch: Partial<StudioScene>) => {
    setDraft((current) => current.plan ? { ...current, plan: { ...current.plan, scenes: current.plan.scenes.map((s) => s.key === key ? { ...s, ...patch } : s) } } : current);
  }, []);

  /** One locked reference sheet per character; concurrent requests for the same character share one job. */
  const drawSheet = useCallback((character: StudioCharacter, plan: StudioPlan, force = false): Promise<string | null> => {
    const running = sheetJobs.current.get(character.id);
    if (running && !force) return running;
    setSheetStatus((status) => ({ ...status, [character.id]: 'loading' }));
    const job = (async () => {
      try {
        const url = await generateOpenAiImage(characterSheetPrompt(character, plan), '1:1', 'premium');
        setDraft((current) => current.plan ? { ...current, plan: { ...current.plan, characters: current.plan.characters.map((c) => c.id === character.id ? { ...c, imageUrl: url } : c) } } : current);
        setSheetStatus((status) => { const next = { ...status }; delete next[character.id]; return next; });
        return url;
      } catch {
        setSheetStatus((status) => ({ ...status, [character.id]: 'error' }));
        return null;
      } finally {
        sheetJobs.current.delete(character.id);
      }
    })();
    sheetJobs.current.set(character.id, job);
    return job;
  }, []);

  const ensureSheets = useCallback(async (plan: StudioPlan): Promise<Record<string, string>> => {
    const missing = plan.characters.filter((c) => !c.imageUrl);
    const drawn: Record<string, string> = {};
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const character = missing[cursor];
        cursor += 1;
        const url = await drawSheet(character, plan);
        if (url) drawn[character.id] = url;
      }
    };
    await Promise.all([worker(), worker()]);
    return drawn;
  }, [drawSheet]);
  ensureSheetsRef.current = ensureSheets;

  const regenerateSheet = useCallback((id: string) => {
    const character = draft.plan?.characters.find((c) => c.id === id);
    if (draft.plan && character) void drawSheet(character, draft.plan, true);
  }, [draft.plan, drawSheet]);

  const addCastCharacter = useCallback(async () => {
    const option = await addCharacter();
    if (!option) return;
    const id = option.slug.replace(/-/g, '_');
    setDraft((current) => {
      if (!current.plan || current.plan.characters.some((c) => c.id === id)) return current;
      const character: StudioCharacter = { id, name: option.label, appearance: '', wardrobe: '', mention: option.slug, imageUrl: option.imageUrl };
      return { ...current, plan: { ...current.plan, characters: [...current.plan.characters, character], scenes: current.plan.scenes.map((scene) => ({ ...scene, characters: scene.characters.includes(id) ? scene.characters : [...scene.characters, id] })) } };
    });
  }, [addCharacter]);

  const removeScene = useCallback((key: string) => {
    setDraft((current) => current.plan && current.plan.scenes.length > 1 ? { ...current, plan: { ...current.plan, scenes: current.plan.scenes.filter((s) => s.key !== key) } } : current);
  }, []);

  const rewritePrompt = useCallback(async (index: number) => {
    if (!draft.plan) return;
    const scene = draft.plan.scenes[index];
    setRewriting(scene.key);
    try {
      const next = await rewriteScenePrompt(draft.plan, index, model, draft.aspect);
      updateScene(scene.key, { prompt_fields: next.prompt_fields, prompt: next.prompt });
    } catch (e) {
      setError({ message: friendly(e), retry: () => { void rewritePrompt(index); } });
    } finally {
      setRewriting(null);
    }
  }, [draft.plan, draft.aspect, model, updateScene]);

  const storyboardFrame = useCallback(async (scene: StudioScene, prompt: string) => {
    updateScene(scene.key, { storyboard_status: 'loading' });
    try {
      const url = await generateOpenAiImage(prompt, draft.aspect, 'draft');
      updateScene(scene.key, { storyboard_url: url, storyboard_status: 'ready' });
    } catch {
      updateScene(scene.key, { storyboard_status: 'error' });
    }
  }, [draft.aspect, updateScene]);

  const generateStoryboard = useCallback(async () => {
    if (!draft.plan) return;
    setStoryboardBusy(true);
    setError(null);
    try {
      const prompts = await writeStoryboardPrompts(draft.plan, draft.aspect);
      const scenes = draft.plan.scenes;
      let cursor = 0;
      const worker = async () => {
        while (cursor < scenes.length) {
          const i = cursor; cursor += 1;
          await storyboardFrame(scenes[i], prompts[i]);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    } catch (e) {
      setError({ message: friendly(e), retry: () => { void generateStoryboard(); } });
    } finally {
      setStoryboardBusy(false);
    }
  }, [draft.plan, draft.aspect, storyboardFrame]);

  const regenerateFrame = useCallback(async (index: number) => {
    if (!draft.plan) return;
    const scene = draft.plan.scenes[index];
    const prompts = await writeStoryboardPrompts({ ...draft.plan, scenes: [scene] }, draft.aspect).catch(() => [] as string[]);
    await storyboardFrame(scene, prompts[0] || `${scene.prompt_fields?.subject || scene.summary}. ${draft.plan.visual_style}. No text.`);
  }, [draft.plan, draft.aspect, storyboardFrame]);

  const addReference = useCallback(async (target: 'project' | string) => {
    try {
      const picked = await uploadPickedImage();
      if (!picked) return;
      const ref = { url: picked.url, label: picked.name };
      if (target === 'project') update((d) => ({ projectRefs: [...d.projectRefs, ref] }));
      else setDraft((current) => current.plan ? { ...current, plan: { ...current.plan, scenes: current.plan.scenes.map((s) => s.key === target ? { ...s, references: [...s.references, ref] } : s) } } : current);
    } catch (e) {
      setError({ message: friendly(e) });
    }
  }, [update]);

  const attachCharacterImage = useCallback(async (characterId: string) => {
    try {
      const picked = await uploadPickedImage();
      if (!picked) return;
      setDraft((current) => current.plan ? { ...current, plan: { ...current.plan, characters: current.plan.characters.map((c) => c.id === characterId ? { ...c, imageUrl: picked.url } : c) } } : current);
    } catch (e) {
      setError({ message: friendly(e) });
    }
  }, []);

  const generate = useCallback(async () => {
    if (!draft.plan || !activeVersion) return;
    update({ step: 'generate' });
    setError(null);
    let plan = draft.plan;
    if (plan.characters.some((c) => !c.imageUrl)) {
      setBusy({ label: 'Drawing character sheets…', detail: 'Each person gets one locked reference image so they look the same in every clip.' });
      const drawn = await ensureSheets(plan);
      plan = { ...plan, characters: plan.characters.map((c) => (drawn[c.id] ? { ...c, imageUrl: drawn[c.id] } : c)) };
      const stillMissing = plan.characters.filter((c) => !c.imageUrl);
      if (stillMissing.length) {
        setBusy(null);
        update({ step: 'review' });
        setError({ message: `We couldn't draw a character sheet for ${stillMissing.map((c) => c.name).join(', ')}. Try again, or upload a picture for them under Cast & references — every person needs one so they stay consistent.`, retry: () => { void generate(); } });
        return;
      }
    }
    setBusy({ label: 'Saving your project…', detail: 'Your plan, scripts and references are being stored so nothing is lost.' });
    try {
      const film = await createStudioFilm({
        plan,
        model,
        aspect: draft.aspect,
        targetSeconds: draft.targetSeconds,
        versions: draft.versions,
        activeVersionId: activeVersion.id,
        idea: draft.mode === 'idea' ? draft.idea : '',
        projectRefs: draft.projectRefs,
        attachStoryboard: draft.attachStoryboard && model.maxReferences > 0,
        narration: draft.narration,
        savedRefs,
        extraStudio: {
          tone: draft.tone,
          audience: draft.audience,
          ...(draft.series ? { series: draft.series } : {}),
          ...(draft.profileChoice === 'used' && profile ? { profile_applied: true, profile_source_film_id: profile.source_film_id } : {}),
        },
        brand: draft.profileChoice === 'used' && profile && (profile.brand.logo_url || profile.brand.colors.length) ? { name: profile.brand.name, logoUrl: profile.brand.logo_url, colors: profile.brand.colors } : null,
      });
      setBusy({ label: 'Opening production…', detail: 'Clips render one by one. You can close this tab for models that render in the background.' });
      clearStudioDraft();
      onOpenFilm(film);
    } catch (e) {
      setBusy(null);
      setError({ message: friendly(e), retry: () => { void generate(); } });
    }
  }, [draft, activeVersion, model, savedRefs, onOpenFilm, update, ensureSheets, profile]);

  const startOver = () => {
    if (!window.confirm('Start a new video? Your current draft will be cleared (saved projects are not affected).')) return;
    planRun.current += 1;
    clearStudioDraft();
    setBusy(null);
    setError(null);
    setDraft(freshDraft());
  };

  const canContinue = draft.mode === 'idea' ? draft.idea.trim().length >= (draft.series ? 4 : 12) : draft.mode === 'script' ? draft.script.trim().length >= 40 : false;
  const showSameCast = Boolean(profile && !draft.series && draft.profileChoice !== 'declined' && draft.step === 'choose' && (draft.profileChoice === 'used' || !draft.versions.length) && (profile.cast.length || profile.visual_style));

  return (
    <div className="stv3">
      <style>{STUDIO_CSS}</style>
      <div className="stv3-row" style={{ justifyContent: 'space-between' }}>
        <Stepper step={draft.step} />
        <div className="stv3-row">
          {onClassic && <button type="button" className="stv3-btn is-ghost is-small" onClick={onClassic}>Classic editor</button>}
          {(draft.versions.length > 0 || draft.idea || draft.script) && <button type="button" className="stv3-btn is-ghost is-small" onClick={startOver}><RefreshCw size={14} aria-hidden="true" /> New video</button>}
        </div>
      </div>

      {error && <Banner tone="error" onRetry={error.retry ? () => { const retry = error.retry; setError(null); retry?.(); } : undefined} onClose={() => setError(null)}>{error.message}</Banner>}

      {busy ? <BusyPanel label={busy.label} detail={busy.detail} /> : draft.step === 'choose' ? (
        <>
          {showSameCast && profile ? (
            <SameCastCard
              profile={profile}
              applied={draft.profileChoice === 'used'}
              onUse={() => setDraft((d) => draftFromProfile(d, profile, null))}
              onDecline={() => setDraft((d) => ({ ...d, lockedCast: [], lockedStyle: '', profileChoice: 'declined' }))}
            />
          ) : null}
          <ChooseStep draft={draft} update={update} models={models} model={model} mentionOptions={mentionOptions} onAddCharacter={addCharacter} onAddProjectRef={() => addReference('project')} canContinue={canContinue} onContinue={() => { void startFromChoice(); }} />
        </>
      ) : draft.step === 'review' && draft.plan ? (
        <StudioErrorBoundary area="the review step" resetKey={draft.plan.planned_at}>
          <ReviewStep
            draft={draft}
            model={model}
            models={models}
            activeVersion={activeVersion}
            mentionOptions={mentionOptions}
            storyboardBusy={storyboardBusy}
            rewriting={rewriting}
            onAddCharacter={addCharacter}
            onBack={() => update({ step: 'choose' })}
            onModel={changeModel}
            onSelectVersion={(id) => update({ activeVersionId: id })}
            onEditVersion={editActiveText}
            onReplan={() => { if (activeVersion) void runPlan(activeVersion.text, model, activeVersion.id); }}
            onUpdateScene={updateScene}
            onRemoveScene={removeScene}
            onRewrite={rewritePrompt}
            onStoryboard={generateStoryboard}
            onRegenerateFrame={regenerateFrame}
            onAttachStoryboard={(on) => update({ attachStoryboard: on })}
            onAddReference={addReference}
            onRemoveProjectRef={(url) => update((d) => ({ projectRefs: d.projectRefs.filter((r) => r.url !== url) }))}
            onAttachCharacterImage={attachCharacterImage}
            sheetStatus={sheetStatus}
            onRegenerateSheet={regenerateSheet}
            onAddCastCharacter={() => { void addCastCharacter(); }}
            onGenerate={generate}
          />
        </StudioErrorBoundary>
      ) : draft.step === 'generate' ? (
        <div className="stv3-card stv3-progress">
          <FilmIcon size={28} color={T.live} aria-hidden="true" />
          <div style={{ fontWeight: 700 }}>Your project was not opened yet.</div>
          <div className="stv3-row">
            <button type="button" className="stv3-btn" onClick={() => update({ step: 'review' })}><ArrowLeft size={16} aria-hidden="true" /> Back to review</button>
            <button type="button" className="stv3-btn is-primary" onClick={() => { void generate(); }}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
          </div>
        </div>
      ) : (
        <ChooseStep draft={draft} update={update} models={models} model={model} mentionOptions={mentionOptions} onAddCharacter={addCharacter} onAddProjectRef={() => addReference('project')} canContinue={canContinue} onContinue={() => { void startFromChoice(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Choose
// ---------------------------------------------------------------------------

function SameCastCard({ profile, applied, onUse, onDecline }: { profile: StudioProfile; applied: boolean; onUse: () => void; onDecline: () => void }) {
  const cast = profile.cast.filter((c) => c.imageUrl).slice(0, 6);
  const settings = [
    studioModelById(profile.model_id).label,
    profile.aspect,
    `~${profile.target_seconds}s`,
    profile.captions ? `${String(profile.caption_style || 'clean').replace('-', ' ')} captions` : '',
    profile.voice?.source && profile.voice.source !== 'none' ? 'same voice-over' : '',
  ].filter(Boolean).join(' · ');
  return (
    <section className="stv3-card" aria-label="Saved cast and brand" style={{ display: 'grid', gap: 12, borderColor: `color-mix(in srgb, ${T.live} 45%, transparent)` }}>
      <div className="stv3-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3>{applied ? 'Using your saved cast & brand' : 'Use the same cast?'}</h3>
          <p className="stv3-sub" style={{ margin: '4px 0 0', fontSize: 13 }}>
            From “{profile.source_title}”: {settings}. {applied ? 'Already filled in below — the cast keeps its saved look, so no new character sheets are drawn.' : 'One tap fills in the cast, look, model, frame, length and finish settings you used last time.'}
          </p>
        </div>
        <div className="stv3-row">
          {applied ? (
            <button type="button" className="stv3-btn is-ghost is-small" onClick={onDecline}><X size={14} aria-hidden="true" /> Start fresh instead</button>
          ) : (
            <>
              <button type="button" className="stv3-btn is-primary is-small" onClick={onUse}><Check size={14} aria-hidden="true" /> Yes, same cast</button>
              <button type="button" className="stv3-btn is-ghost is-small" onClick={onDecline}>No, start fresh</button>
            </>
          )}
        </div>
      </div>
      {cast.length || profile.brand.logo_url || profile.brand.colors.length ? (
        <div className="stv3-row" style={{ gap: 14 }}>
          {cast.map((c) => (
            <div key={c.id} className="stv3-row" style={{ gap: 8 }}>
              <div className="stv3-thumb" style={{ width: 44, height: 44 }}><img src={c.imageUrl} alt={c.name} /></div>
              <span style={{ fontSize: 13 }}><strong>{c.name}</strong>{c.mention ? <span style={{ color: T.muted }}> · @{c.mention}</span> : null}</span>
            </div>
          ))}
          {profile.brand.logo_url ? <div className="stv3-thumb" style={{ width: 44, height: 44, background: T.bone }} title={profile.brand.name || 'Logo'}><img src={profile.brand.logo_url} alt={`${profile.brand.name || 'Brand'} logo`} style={{ objectFit: 'contain' }} /></div> : null}
          {profile.brand.colors.map((color) => <span key={color} title={color} aria-label={`Brand colour ${color}`} style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${T.line}`, background: color }} />)}
        </div>
      ) : null}
    </section>
  );
}

function SeriesSettings({ series, summary, children }: { series: SeriesInfo | null; summary: string; children: ReactNode }) {
  if (!series) return <>{children}</>;
  return (
    <details className="stv3-details">
      <summary><ChevronDown size={16} aria-hidden="true" /> Same settings as the last episode: {summary}</summary>
      <div style={{ display: 'grid', gap: 18, marginTop: 14 }}>{children}</div>
    </details>
  );
}

function ModelCards({ models, value, onChange }: { models: StudioModel[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="stv3-models" role="radiogroup" aria-label="Video model">
      {models.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={m.id === value} className={`stv3-model${m.id === value ? ' is-active' : ''}`} onClick={() => onChange(m.id)}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>{m.label}</strong>
            {m.id === value && <Check size={16} color={T.live} aria-hidden="true" />}
          </span>
          <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{m.blurb}</span>
          <span className="stv3-row" style={{ gap: 6 }}>
            <span className="stv3-chip">{m.durations ? m.durations.join(' or ') : `${m.minSeconds}–${m.maxSeconds}`}s clips</span>
            <span className="stv3-chip">{m.audio ? 'Sound' : 'Silent'}</span>
            <span className="stv3-chip">{m.maxReferences ? `${m.maxReferences} ref${m.maxReferences === 1 ? '' : 's'}` : 'Text only'}</span>
            {!m.durable && <span className="stv3-chip">Keep tab open</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function ChooseStep({ draft, update, models, model, mentionOptions, onAddCharacter, onAddProjectRef, canContinue, onContinue }: {
  draft: Draft; update: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void; models: StudioModel[]; model: StudioModel;
  mentionOptions: MentionOption[]; onAddCharacter: () => Promise<MentionOption | null>; onAddProjectRef: () => void; canContinue: boolean; onContinue: () => void;
}) {
  const locked = draft.versions.length > 0;
  const series = draft.series;
  return (
    <>
      {series ? (
        <div className="stv3-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2>Episode {series.episode} of “{series.title}”</h2>
            <p className="stv3-sub">Same look, cast and settings as your last episode{draft.lockedCast.length ? ` (${draft.lockedCast.map((c) => c.name).join(', ')})` : ''}. Just say what this one is about — the agent writes it, plans every scene and keeps everyone looking the same.</p>
          </div>
          {!locked ? <button type="button" className="stv3-btn is-ghost is-small" onClick={() => update({ series: null })}>Not an episode? Start fresh</button> : null}
        </div>
      ) : (
      <>
      <div>
        <h2>What are you starting with?</h2>
        <p className="stv3-sub">Pick one. Our script agent (Claude Opus 5.5) writes or polishes the script, then plans every scene for the video model you choose.</p>
      </div>
      <div className="stv3-choice-grid">
        <button type="button" className={`stv3-choice${draft.mode === 'idea' ? ' is-active' : ''}`} onClick={() => update({ mode: 'idea' })} disabled={locked && draft.mode !== 'idea'} aria-pressed={draft.mode === 'idea'}>
          <span className="stv3-choice-icon"><Lightbulb size={22} aria-hidden="true" /></span>
          <strong style={{ fontSize: 18 }}>I have an idea</strong>
          <span style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>Describe it in a sentence or two. The agent writes a full, ultra-detailed script for you.</span>
        </button>
        <button type="button" className={`stv3-choice${draft.mode === 'script' ? ' is-active' : ''}`} onClick={() => update({ mode: 'script' })} disabled={locked && draft.mode !== 'script'} aria-pressed={draft.mode === 'script'}>
          <span className="stv3-choice-icon"><ScrollText size={22} aria-hidden="true" /></span>
          <strong style={{ fontSize: 18 }}>I have my script</strong>
          <span style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>Paste it. The agent improves it while keeping your story the same, and your original is always kept.</span>
        </button>
      </div>
      </>
      )}

      {draft.mode && (
        <div className="stv3-card" style={{ display: 'grid', gap: 18 }}>
          <div>
            <label className="stv3-label" htmlFor="stv3-main-input">{series ? `What is episode ${series.episode} about?` : draft.mode === 'idea' ? 'Your idea' : 'Your script'}</label>
            <MentionTextarea
              ariaLabel={draft.mode === 'idea' ? 'Your idea' : 'Your script'}
              value={draft.mode === 'idea' ? draft.idea : draft.script}
              onChange={(value) => update(draft.mode === 'idea' ? { idea: value } : { script: value })}
              options={mentionOptions}
              onAddCharacter={onAddCharacter}
              rows={series ? 3 : draft.mode === 'idea' ? 5 : 12}
              disabled={locked}
              placeholder={series ? 'One line is enough, e.g. "Why most beginners grip the club too tight"' : draft.mode === 'idea' ? 'e.g. A 30-second ad where @maya, a barista, discovers our oat-milk latte on a rainy Monday morning…' : 'Paste your script here. Type @ to pull in a saved character.'}
            />
            <div className="stv3-sub" style={{ fontSize: 12 }}>
              Tip: type <strong>@</strong> to add a saved character or upload one; they stay consistent in every scene that mentions them.
              {locked && ' Your text is locked because script versions were already created — use New video to start over.'}
            </div>
          </div>

          <SeriesSettings series={series} summary={`${model.label} · ${draft.aspect} · ~${draft.targetSeconds}s`}>
          <div>
            <span className="stv3-label">Video model</span>
            <ModelCards models={models} value={draft.modelId} onChange={(id) => update({ modelId: id })} />
          </div>

          <div className="stv3-grid2">
            <div>
              <span className="stv3-label">Frame</span>
              <div className="stv3-seg" role="radiogroup" aria-label="Frame">
                {(['16:9', '9:16', '1:1'] as Aspect[]).filter((a) => model.aspects.includes(a)).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={draft.aspect === a} className={draft.aspect === a ? 'is-active' : ''} onClick={() => update({ aspect: a })}>{a}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="stv3-label" htmlFor="stv3-length">Length: about {draft.targetSeconds}s</label>
              <input id="stv3-length" type="range" min={8} max={180} step={1} value={draft.targetSeconds} onChange={(e) => update({ targetSeconds: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
          </div>
          </SeriesSettings>

          <details className="stv3-details">
            <summary><ChevronDown size={16} aria-hidden="true" /> Advanced settings</summary>
            <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
              <div className="stv3-grid2">
                <div>
                  <label className="stv3-label" htmlFor="stv3-tone">Tone</label>
                  <input id="stv3-tone" className="stv3-input" style={{ width: '100%' }} value={draft.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="e.g. warm, cinematic, playful" />
                </div>
                <div>
                  <label className="stv3-label" htmlFor="stv3-audience">Audience</label>
                  <input id="stv3-audience" className="stv3-input" style={{ width: '100%' }} value={draft.audience} onChange={(e) => update({ audience: e.target.value })} placeholder="e.g. busy parents, golf coaches" />
                </div>
              </div>
              <label className="stv3-toggle">
                <input type="checkbox" checked={draft.narration} onChange={(e) => update({ narration: e.target.checked })} />
                Voice-over narration for lines the video model cannot speak
              </label>
              <div>
                <span className="stv3-label">Project reference images</span>
                <div className="stv3-thumbs">
                  {draft.projectRefs.map((r) => (
                    <div key={r.url} className="stv3-thumb" title={r.label}>
                      <img src={r.url} alt={r.label} />
                      <button type="button" aria-label={`Remove ${r.label}`} onClick={() => update((d) => ({ projectRefs: d.projectRefs.filter((x) => x.url !== r.url) }))}><X size={12} aria-hidden="true" /></button>
                    </div>
                  ))}
                  <button type="button" className="stv3-add" aria-label="Add a project reference image" onClick={onAddProjectRef}><ImagePlus size={18} aria-hidden="true" /></button>
                </div>
                <div className="stv3-sub" style={{ fontSize: 12 }}>Products, locations or a style frame. They are sent with every scene, up to the model's image limit.</div>
              </div>
            </div>
          </details>
        </div>
      )}

      <div className="stv3-footer">
        <span style={{ fontSize: 13, color: T.muted }}>{draft.mode ? `${model.label} · ${draft.aspect} · ~${draft.targetSeconds}s` : 'Choose idea or script to continue'}</span>
        <button type="button" className="stv3-btn is-primary" disabled={!canContinue && !locked} onClick={onContinue}>
          {locked ? 'Continue to review' : series ? `Make episode ${series.episode}` : draft.mode === 'idea' ? 'Write my script' : 'Improve & plan'} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Review
// ---------------------------------------------------------------------------

interface ReviewProps {
  draft: Draft;
  model: StudioModel;
  models: StudioModel[];
  activeVersion: ScriptVersion | null;
  mentionOptions: MentionOption[];
  storyboardBusy: boolean;
  rewriting: string | null;
  onAddCharacter: () => Promise<MentionOption | null>;
  onBack: () => void;
  onModel: (id: string) => void;
  onSelectVersion: (id: string) => void;
  onEditVersion: (text: string) => void;
  onReplan: () => void;
  onUpdateScene: (key: string, patch: Partial<StudioScene>) => void;
  onRemoveScene: (key: string) => void;
  onRewrite: (index: number) => void;
  onStoryboard: () => void;
  onRegenerateFrame: (index: number) => void;
  onAttachStoryboard: (on: boolean) => void;
  onAddReference: (target: 'project' | string) => void;
  onRemoveProjectRef: (url: string) => void;
  onAttachCharacterImage: (id: string) => void;
  sheetStatus: Record<string, 'loading' | 'error'>;
  onRegenerateSheet: (id: string) => void;
  onAddCastCharacter: () => void;
  onGenerate: () => void;
}

function sceneReferenceCount(scene: StudioScene, plan: StudioPlan, draft: Draft): number {
  const castImages = scene.characters.filter((id) => plan.characters.some((c) => c.id === id && c.imageUrl)).length;
  return castImages + draft.projectRefs.length + scene.references.length + (draft.attachStoryboard && scene.storyboard_url ? 1 : 0);
}

function ReviewStep(p: ReviewProps) {
  const { draft, model } = p;
  const plan = draft.plan as StudioPlan;
  const [showScript, setShowScript] = useState(true);
  const total = plan.scenes.reduce((n, s) => n + s.duration_s, 0);
  const hasStoryboard = plan.scenes.some((s) => s.storyboard_url);
  const versionOrder: Array<ScriptVersion['kind']> = ['original', 'improved', 'edited'];
  const versions = [...draft.versions].sort((a, b) => versionOrder.indexOf(a.kind) - versionOrder.indexOf(b.kind));
  const readOnly = p.activeVersion ? p.activeVersion.kind !== 'edited' : true;
  const outOfDate = Boolean(p.activeVersion && plan.script_version_id && plan.script_version_id !== p.activeVersion.id);

  return (
    <>
      <div className="stv3-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2>{plan.title}</h2>
          <p className="stv3-sub">{plan.scenes.length} clips · about {total}s on {model.label}. Review the script and scenes, then generate.</p>
        </div>
        <div style={{ minWidth: 220 }}>
          <label className="stv3-label" htmlFor="stv3-model-switch">Video model</label>
          <select id="stv3-model-switch" className="stv3-input" style={{ width: '100%', padding: '10px 12px' }} value={draft.modelId} onChange={(e) => p.onModel(e.target.value)}>
            {p.models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.durations ? m.durations.join('/') : `${m.minSeconds}–${m.maxSeconds}`}s{m.audio ? ', sound' : ', silent'}</option>)}
          </select>
        </div>
      </div>

      {plan.notes.length > 0 && (
        <Banner tone="info">
          <strong>Plan adjusted for {model.label}.</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{plan.notes.slice(0, 6).map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Banner>
      )}
      {model.maxReferences === 0 && <Banner tone="info">{model.label} makes video from text only, so reference images and storyboard frames are not sent to it.</Banner>}

      <section className="stv3-card" style={{ display: 'grid', gap: 14 }}>
        <div className="stv3-row" style={{ justifyContent: 'space-between' }}>
          <h3>Script</h3>
          <button type="button" className="stv3-btn is-ghost is-small" onClick={() => setShowScript((v) => !v)} aria-expanded={showScript}>{showScript ? 'Hide' : 'Show'} <ChevronDown size={14} aria-hidden="true" style={{ transform: showScript ? 'rotate(180deg)' : undefined }} /></button>
        </div>
        {showScript && (
          <>
            <div className="stv3-tabs" role="tablist" aria-label="Script versions">
              {versions.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={p.activeVersion?.id === v.id} className={`stv3-tab${p.activeVersion?.id === v.id ? ' is-active' : ''}`} onClick={() => p.onSelectVersion(v.id)}>
                  {v.kind === 'original' ? <ScrollText size={14} aria-hidden="true" /> : v.kind === 'improved' ? <Wand2 size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}
                  {v.label}
                </button>
              ))}
            </div>
            <MentionTextarea
              ariaLabel="Script text"
              value={p.activeVersion?.text || ''}
              onChange={p.onEditVersion}
              options={p.mentionOptions}
              onAddCharacter={p.onAddCharacter}
              rows={10}
            />
            <div className="stv3-row" style={{ justifyContent: 'space-between' }}>
              <span className="stv3-sub" style={{ margin: 0, fontSize: 12 }}>
                {readOnly ? 'Original and improved versions are saved permanently. Typing here creates your own edited version.' : 'This is your edited version. The original and improved versions stay untouched.'}
                {outOfDate ? ' The scenes below were planned from a different version.' : ''}
              </span>
              <button type="button" className="stv3-btn is-small" onClick={p.onReplan}><RefreshCw size={14} aria-hidden="true" /> Re-plan scenes from this version</button>
            </div>
          </>
        )}
      </section>

      <section className="stv3-card" style={{ display: 'grid', gap: 14 }}>
        <div className="stv3-row" style={{ justifyContent: 'space-between' }}>
          <h3>Cast & references</h3>
          <button type="button" className="stv3-btn is-small" onClick={p.onAddCastCharacter}><UserRound size={14} aria-hidden="true" /> Add character</button>
        </div>
        <div className="stv3-sub" style={{ margin: 0, fontSize: 13 }}>Every person gets one locked reference image. It is sent with every clip they appear in, so their face, hair and wardrobe stay the same from the first clip to the last.</div>
        {plan.characters.length === 0 && (plan.film_kind === 'motion_design'
          ? <div className="stv3-sub" style={{ margin: 0 }}>This is a motion-design film, so no on-screen cast is needed.</div>
          : <Banner tone="info">No on-screen people were found in this script. Every video except pure motion design should have a cast — add a character (for example your presenter) so they look the same in every clip.</Banner>)}
        <div className="stv3-grid2">
          {plan.characters.map((c) => {
            const status = p.sheetStatus[c.id];
            const clips = plan.scenes.filter((scene) => scene.characters.includes(c.id)).length;
            return (
              <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {status === 'loading'
                  ? <div className="stv3-thumb" style={{ display: 'grid', placeItems: 'center' }}><Loader2 size={18} className="stv3-spin" aria-label={`Drawing ${c.name}`} /></div>
                  : c.imageUrl
                    ? <div className="stv3-thumb"><img src={c.imageUrl} alt={c.name} /></div>
                    : <button type="button" className="stv3-add" aria-label={`Add a reference image for ${c.name}`} onClick={() => p.onAttachCharacterImage(c.id)}><ImagePlus size={18} aria-hidden="true" /></button>}
                <div style={{ display: 'grid', gap: 4 }}>
                  <strong>{c.name}{c.mention ? <span style={{ color: T.muted, fontWeight: 500 }}> · @{c.mention}</span> : null}</strong>
                  <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{c.appearance || 'Appearance comes from the script.'}</span>
                  <span style={{ fontSize: 12, color: status === 'error' ? T.fault : T.dim }}>
                    {status === 'loading' ? 'Drawing character sheet…'
                      : status === 'error' ? 'The character sheet could not be drawn.'
                        : c.imageUrl ? `Locked reference · in ${clips} clip${clips === 1 ? '' : 's'}` : 'Needs a reference image'}
                  </span>
                  <div className="stv3-row" style={{ gap: 4 }}>
                    {status !== 'loading' && <button type="button" className="stv3-btn is-ghost is-small" style={{ padding: '4px 0' }} onClick={() => p.onRegenerateSheet(c.id)}>{status === 'error' ? 'Retry' : c.imageUrl ? 'Redraw' : 'Draw sheet'}</button>}
                    <button type="button" className="stv3-btn is-ghost is-small" style={{ padding: '4px 0' }} onClick={() => p.onAttachCharacterImage(c.id)}>Upload instead</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <span className="stv3-label">Project references (sent with every scene)</span>
          <div className="stv3-thumbs">
            {draft.projectRefs.map((r) => (
              <div key={r.url} className="stv3-thumb" title={r.label}>
                <img src={r.url} alt={r.label} />
                <button type="button" aria-label={`Remove ${r.label}`} onClick={() => p.onRemoveProjectRef(r.url)}><X size={12} aria-hidden="true" /></button>
              </div>
            ))}
            <button type="button" className="stv3-add" aria-label="Add a project reference image" onClick={() => p.onAddReference('project')}><ImagePlus size={18} aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      <section className="stv3-card" style={{ display: 'grid', gap: 12 }}>
        <div className="stv3-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3>Storyboard <span className="stv3-chip" style={{ marginLeft: 6 }}>Optional</span></h3>
            <div className="stv3-sub" style={{ margin: '4px 0 0', fontSize: 13 }}>One still image per scene to preview the look. Regenerate any frame you don't like.</div>
          </div>
          <div className="stv3-row">
            <label className="stv3-toggle" title={model.maxReferences === 0 ? `${model.label} does not accept images` : ''}>
              <input type="checkbox" checked={draft.attachStoryboard && model.maxReferences > 0} disabled={model.maxReferences === 0 || !hasStoryboard} onChange={(e) => p.onAttachStoryboard(e.target.checked)} />
              Attach storyboard to video
            </label>
            <button type="button" className="stv3-btn is-small" disabled={p.storyboardBusy} onClick={p.onStoryboard}>
              {p.storyboardBusy ? <Loader2 size={14} className="stv3-spin" aria-hidden="true" /> : <Clapperboard size={14} aria-hidden="true" />}
              {hasStoryboard ? 'Regenerate storyboard' : 'Generate storyboard'}
            </button>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 14 }}>
        {plan.scenes.map((scene, index) => (
          <SceneCard key={scene.key} scene={scene} index={index} plan={plan} draft={draft} model={model} p={p} />
        ))}
      </div>

      <div className="stv3-footer">
        <button type="button" className="stv3-btn" onClick={p.onBack}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
        <span style={{ fontSize: 13, color: T.muted }}>{plan.scenes.length} clips · ~{total}s · {model.label}</span>
        <button type="button" className="stv3-btn is-primary" onClick={p.onGenerate}><Sparkles size={16} aria-hidden="true" /> Generate video</button>
      </div>
    </>
  );
}

function SceneCard({ scene, index, plan, draft, model, p }: { scene: StudioScene; index: number; plan: StudioPlan; draft: Draft; model: StudioModel; p: ReviewProps }) {
  const refCount = sceneReferenceCount(scene, plan, draft);
  const durations = model.durations || Array.from({ length: model.maxSeconds - model.minSeconds + 1 }, (_, i) => model.minSeconds + i);
  const cast = scene.characters.map((id) => plan.characters.find((c) => c.id === id)).filter(Boolean) as StudioCharacter[];
  return (
    <article className="stv3-scene" aria-label={`Scene ${index + 1}`}>
      <div className="stv3-scene-head">
        <div className="stv3-row" style={{ gap: 10 }}>
          <span className="stv3-chip is-live">{index + 1}</span>
          <input className="stv3-input" style={{ padding: '8px 12px', fontWeight: 700, minWidth: 200 }} value={scene.title} aria-label="Scene title" onChange={(e) => p.onUpdateScene(scene.key, { title: e.target.value })} />
          {scene.part && <span className="stv3-chip">part {scene.part.index}/{scene.part.of}</span>}
        </div>
        <div className="stv3-row">
          <label className="stv3-row" style={{ gap: 6, fontSize: 13, color: T.muted }}>
            Length
            <select className="stv3-input" style={{ padding: '6px 10px' }} value={scene.duration_s} onChange={(e) => p.onUpdateScene(scene.key, { duration_s: legalSeconds(model, Number(e.target.value)) })}>
              {durations.map((d) => <option key={d} value={d}>{d}s</option>)}
            </select>
          </label>
          <button type="button" className="stv3-btn is-ghost is-small" aria-label={`Remove scene ${index + 1}`} disabled={plan.scenes.length <= 1} onClick={() => p.onRemoveScene(scene.key)}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16 }} className="stv3-scene-body">
        <div style={{ display: 'grid', gap: 10 }}>
          {scene.summary && <div style={{ color: T.muted, fontSize: 14, lineHeight: 1.5 }}>{scene.summary}</div>}
          {scene.dialogue.length > 0 && (
            <div style={{ fontSize: 13, lineHeight: 1.55, padding: '8px 12px', borderRadius: 10, background: T.raised }}>
              {scene.dialogue.map((d, i) => <div key={i}><strong>{d.speaker}:</strong> “{d.line}”</div>)}
              {!model.audio && <div style={{ color: T.dim, marginTop: 4 }}>{model.label} is silent — these lines become voice-over{draft.narration ? '' : ' if narration is turned on'}.</div>}
            </div>
          )}
          <div>
            <span className="stv3-label">Video prompt</span>
            <MentionTextarea ariaLabel={`Video prompt for scene ${index + 1}`} value={scene.prompt} onChange={(value) => p.onUpdateScene(scene.key, { prompt: value })} options={p.mentionOptions} onAddCharacter={p.onAddCharacter} rows={7} style={{ fontSize: 13, fontFamily: T.mono }} />
            <div className="stv3-row" style={{ marginTop: 6 }}>
              <button type="button" className="stv3-btn is-small" disabled={p.rewriting === scene.key} onClick={() => p.onRewrite(index)}>
                {p.rewriting === scene.key ? <Loader2 size={14} className="stv3-spin" aria-hidden="true" /> : <Wand2 size={14} aria-hidden="true" />} Rewrite prompt
              </button>
              {scene.prompt_fields === null && <button type="button" className="stv3-btn is-ghost is-small" onClick={() => p.onUpdateScene(scene.key, { prompt: composePrompt(null, scene, plan, model) })}>Reset from notes</button>}
            </div>
          </div>
          <div>
            <span className="stv3-label">References · {Math.min(refCount, model.maxReferences)}/{model.maxReferences} sent</span>
            <div className="stv3-thumbs">
              {cast.filter((c) => c.imageUrl).map((c) => (
                <div key={c.id} className="stv3-thumb" title={`@${c.mention || c.id}`}><img src={c.imageUrl} alt={c.name} /></div>
              ))}
              {scene.references.map((r) => (
                <div key={r.url} className="stv3-thumb" title={r.label}>
                  <img src={r.url} alt={r.label} />
                  <button type="button" aria-label={`Remove ${r.label}`} onClick={() => p.onUpdateScene(scene.key, { references: scene.references.filter((x) => x.url !== r.url) })}><X size={12} aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="stv3-add" aria-label={`Add a reference image to scene ${index + 1}`} onClick={() => p.onAddReference(scene.key)}><ImagePlus size={18} aria-hidden="true" /></button>
            </div>
            {refCount > model.maxReferences && model.maxReferences > 0 && <div className="stv3-sub" style={{ fontSize: 12 }}>{model.label} takes up to {model.maxReferences} image{model.maxReferences === 1 ? '' : 's'}; characters are sent first, then scene and project images.</div>}
            {model.maxReferences === 0 && refCount > 0 && <div className="stv3-sub" style={{ fontSize: 12 }}>These images are skipped for {model.label} (text-only model).</div>}
          </div>
        </div>
        <div style={{ width: 'min(280px, 32vw)', display: 'grid', gap: 8, alignContent: 'start' }}>
          <div className="stv3-board" style={{ aspectRatio: draft.aspect.replace(':', ' / ') }}>
            {scene.storyboard_status === 'loading' ? <Loader2 size={20} className="stv3-spin" aria-label="Drawing frame" />
              : scene.storyboard_url ? <img src={scene.storyboard_url} alt={`Storyboard frame for scene ${index + 1}`} />
                : scene.storyboard_status === 'error' ? <span style={{ padding: 10, textAlign: 'center' }}>Frame failed — try again</span>
                  : <span>No storyboard frame</span>}
          </div>
          {(scene.storyboard_url || scene.storyboard_status === 'error') && (
            <button type="button" className="stv3-btn is-small" disabled={scene.storyboard_status === 'loading'} onClick={() => p.onRegenerateFrame(index)}><RefreshCw size={14} aria-hidden="true" /> Regenerate frame</button>
          )}
        </div>
      </div>
    </article>
  );
}
