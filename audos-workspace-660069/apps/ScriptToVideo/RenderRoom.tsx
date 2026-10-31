/**
 * Sequential production board — the live view of a film generating clip by
 * clip. Left rail: every scene with its live status. Right panel: THE ACTIVE
 * SCENE only — its duration, continuity decision, reference assets and full
 * prepared prompt, with the explicit [Generate Video] trigger. Future scenes'
 * prompts are never shown (they do not exist yet — the director prepares one
 * clip at a time). Failed scenes offer per-scene recovery that never touches
 * completed clips.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Check, Circle, CircleDot, FileUp, Layers, Lock, Pause,
  Play, Plus, RefreshCw, SkipForward, Sparkles, Trash2, UserRound, Wand2, Zap,
} from 'lucide-react';
import { Film, FilmCharacter, FilmScene, StoredReference, T, VideoClipSpec, db, isDeferredTextIssue, referenceSlug } from './api';
import { audioReady, isSpokenSource, musicReady, narrationReady, sfxReady } from './pipeline/audio';
import { openPricing } from '../../lib/plans';
import { videoEngine } from '../../lib/videoEngines';
import { resolveVideoModel } from './pipeline/videoModelService';
import { pickerModels } from './modelPicker';
import { capabilityFor, S2V_VIDEO_CAPABILITIES } from './v2Contracts';
import VergeLoader from '../../components/VergeLoader';
import VideoErrorCard from '../../components/video/VideoErrorCard';
import VideoGeneratingState from '../../components/video/VideoGeneratingState';
import ProbedVideo from './ClipAudioStatus';
import type { ClipAudioProbe } from './pipeline/capture';
import { recoveryDecision } from './pipeline/errorRecovery';
import { ProductionOverview } from './StudioChrome';
import { OMNI_LABEL, OMNI_MODEL_ID, classifyError, friendlyErrorMessage } from './friendlyErrors';

const DONE = new Set(['completed', 'skipped']);

/** A genuine out-of-credits failure — the only error the "Top up credits"
 * action belongs next to. Session rejections are matched separately and must
 * never land here. */
function isCreditsError(value: unknown): boolean {
  const raw = String(value || '');
  if (/billing_http_(?:401|403)|session required|workspace session|workspace wallet|wallet balance is too low|no_credentials|\b401\b|\b403\b/i.test(raw)) return false;
  return /\binsufficient_credits\b/i.test(raw);
}

function customerError(value: unknown): string {
  return friendlyErrorMessage(value);
}

function statusMeta(s: FilmScene): { word: string; color: string; icon: any } {
  switch (String(s.status)) {
    case 'completed': case 'succeeded': return { word: 'Completed', color: T.done, icon: <Check size={13} /> };
    case 'ready': return { word: 'Ready to generate', color: T.live, icon: <CircleDot size={13} /> };
    case 'queued': case 'submitted': case 'processing': case 'generating': return { word: s.status === 'queued' ? 'Queued' : s.status === 'submitted' ? 'Submitted' : 'Generating', color: T.live, icon: <VergeLoader size={30} label="Generating" /> };
    case 'retrying': return { word: 'Retrying', color: T.live, icon: <RefreshCw size={13} /> };
    case 'needs_action': return { word: 'Needs action', color: T.live, icon: <AlertTriangle size={13} /> };
    case 'cancelled': return { word: 'Cancelled', color: T.dim, icon: <Circle size={12} /> };
    case 'failed': return { word: 'Failed', color: T.fault, icon: <AlertTriangle size={13} /> };
    case 'skipped': return { word: 'Skipped', color: T.dim, icon: <SkipForward size={13} /> };
    default: return { word: 'Waiting', color: T.dim, icon: <Circle size={12} /> };
  }
}

/** The length this clip is requested at: the plan's own figure when the film
 * has one (that is what segmentation decided), the scene row otherwise. */
function sceneSeconds(film: Film, scene: FilmScene): number {
  const planned = (Array.isArray(film.plan?.scenes) ? film.plan!.scenes! : []).find((p) => p.scene_key === scene.scene_key);
  return Math.round(Number(planned?.duration_s || scene.duration_s) || 6);
}

function referenceLabel(s: FilmScene): string {
  const evidence = ((s.spec || {}) as VideoClipSpec).request_evidence;
  if (!evidence) return 'Not submitted yet — no provider request proof exists';
  if (evidence.frame_chain.status === 'sent') return `Scene ${Number(evidence.frame_chain.source_scene_index || 0) + 1} validated last frame first`;
  if (evidence.frame_chain.status === 'continued_without') return 'Creator explicitly continued without continuity';
  return 'First scene — no continuity frame';
}

function proofRole(asset: any): string {
  if (asset.type === 'continuity-frame') return 'continuity frame · first-frame slot';
  if (asset.type === 'character') return `character${asset.label ? ` · ${asset.label}` : ''}${asset.role === 'first_frame' ? ' · first-frame slot' : ''}`;
  return String(asset.type || asset.role || 'reference').replace(/-/g, ' ');
}

function CastReview(props: {
  film: Film;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<FilmCharacter>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRegenerate: (id: string, quality?: 'draft' | 'premium') => void;
  onUpload: (id: string, file: File) => void;
  onReuse: (id: string, reference: StoredReference) => void;
  onConfirmEmpty: () => void;
}) {
  const cast = Array.isArray(props.film.character_refs) ? props.film.character_refs : [];
  const [library, setLibrary] = useState<StoredReference[]>([]);
  useEffect(() => { void db.listReferences().then((rows) => setLibrary(rows.filter((row) => row.type === 'character'))).catch(() => setLibrary([])); }, [props.film.id]);
  const reviewed = props.film.plan?.cast_reviewed === true;
  const ready = reviewed && cast.every((character) => character.sheet_required === false || (character.approved && character.url));
  const visualCast = cast.filter((character) => character.sheet_required !== false);
  const canApproveAll = visualCast.length > 0 && visualCast.every((character) => character.url && !character.image_error && !character.image_review_by_eye);
  const inputStyle = { width: '100%', background: T.canvas, border: `1px solid ${T.dim}`, borderRadius: 8, color: T.bone, padding: '8px 10px', fontSize: 12 } as const;
  const sheetAction = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: 7, padding: '7px 8px', fontSize: 12, fontWeight: 750, lineHeight: 1.25, textAlign: 'center', cursor: 'pointer' } as const;
  return (
    <section style={{ marginBottom: 14, background: T.card, border: `1px solid ${ready ? T.done : T.live}`, borderRadius: 13, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: T.bone, fontSize: 14, fontWeight: 800 }}>Cast approval · {cast.length || 'no clear characters'}</div>
          <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
            Generated from the full script. Review every quoted line and any field marked inferred. Approved sheets become reusable <span style={{ fontFamily: T.mono }}>@name</span> references and stay locked across all blocks.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canApproveAll && !ready ? <button type="button" disabled={props.disabled} onClick={() => visualCast.forEach((character) => props.onUpdate(character.id, { approved: true }))} style={{ minHeight: 44, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 12, fontWeight: 800 }}>Approve all</button> : null}
          <span style={{ color: ready ? T.done : T.live, border: `1px solid ${ready ? T.done : T.live}`, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 800 }}>{ready ? 'CAST APPROVED' : 'APPROVAL REQUIRED'}</span>
        </div>
      </div>
      {!cast.length ? (
        <div style={{ marginTop: 12, background: T.raised, border: `1px solid ${T.line}`, borderRadius: 10, padding: 12 }}>
          <div style={{ color: T.bone, fontSize: 14, fontWeight: 700 }}>This script needs no characters — Continue.</div>
          <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>Add a cast member if identity must persist, or confirm that this is intentionally character-free.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button disabled={props.disabled} onClick={props.onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.raised, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}><Plus size={12} /> Add character</button>
            <button disabled={props.disabled || reviewed} onClick={props.onConfirmEmpty} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: reviewed ? T.raised : T.live, color: reviewed ? T.done : 'var(--space-text-on-primary)', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 750, cursor: 'pointer' }}><Check size={12} /> {reviewed ? 'No-cast plan confirmed' : 'Confirm no cast needed'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 13 }}>
          {cast.map((character) => {
            const inferred = new Set(character.inferred_fields || []);
            const coverage = Array.isArray(character.coverage) ? character.coverage : [];
            const field = (label: string, key: keyof FilmCharacter, value: string, multiline = false) => (
              <label style={{ display: 'block' }}><span style={{ display: 'block', color: T.dim, fontSize: 12, fontWeight: 750, marginBottom: 4 }}>{label}{inferred.has(String(key)) ? ' · inferred' : ''}</span>{multiline
                ? <textarea key={`${character.id}-${String(key)}-${value}`} defaultValue={value} rows={2} disabled={props.disabled} onBlur={(event) => { if (event.target.value !== value) props.onUpdate(character.id, { [key]: event.target.value, approved: false } as Partial<FilmCharacter>); }} style={{ ...inputStyle, resize: 'vertical' }} />
                : <input key={`${character.id}-${String(key)}-${value}`} defaultValue={value} disabled={props.disabled} onBlur={(event) => { if (event.target.value !== value) props.onUpdate(character.id, { [key]: event.target.value, approved: false } as Partial<FilmCharacter>); }} style={inputStyle} />}</label>
            );
            return (
              <article key={character.id} style={{ background: T.raised, border: `1px solid ${character.approved ? T.done : T.line}`, borderRadius: 11, padding: 12 }}>
                <div className="s2v-cast-grid" style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 12 }}>
                  <div>
                    {character.url ? <img src={character.url} alt={`${character.name} sheet`} style={{ width: 120, height: 150, objectFit: 'cover', borderRadius: 9, border: `1px solid ${T.dim}` }} /> : <div style={{ width: 120, height: 150, display: 'grid', placeItems: 'center', borderRadius: 9, border: `1px dashed ${T.fault}`, color: T.dim }}><UserRound size={25} /></div>}
                    <div style={{ color: T.bone, fontSize: 12, fontWeight: 800, marginTop: 7 }}>{character.name}</div>
                    <div style={{ color: T.live, fontFamily: T.mono, fontSize: 12, marginTop: 2 }}>@{referenceSlug(character.name || character.id)}</div>
                    {character.image_error ? <div style={{ color: character.image_review_by_eye ? 'var(--vg-warning)' : T.fault, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}><b>{character.image_review_by_eye ? 'Review by eye: ' : ''}</b>{character.image_review_by_eye ? character.image_error : friendlyErrorMessage(character.image_error)}</div> : null}
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      <button disabled={props.disabled} onClick={() => props.onRegenerate(character.id, character.url ? 'premium' : 'draft')} style={{ ...sheetAction, background: character.url ? 'transparent' : T.live, color: character.url ? T.bone : 'var(--space-text-on-primary)', border: `1px solid ${character.url ? T.dim : T.live}` }}><RefreshCw size={12} />{character.url ? 'Regenerate' : 'Generate sheet'}</button>
                      <button disabled={props.disabled || !character.url} onClick={() => props.onUpdate(character.id, { approved: !character.approved })} style={{ ...sheetAction, background: character.approved ? T.done : character.url ? T.live : T.canvas, color: character.approved || character.url ? 'var(--space-text-on-primary)' : T.dim, border: 'none', fontWeight: 800, cursor: character.url ? 'pointer' : 'default' }}><Check size={10} />{character.approved ? 'Approved' : 'Approve sheet'}</button>
                      <label style={{ ...sheetAction, background: 'transparent', color: T.bone, border: `1px solid ${T.dim}`, fontWeight: 500 }}><FileUp size={10} />Upload own<input type="file" accept="image/png,image/jpeg,image/webp" disabled={props.disabled} style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onUpload(character.id, file); event.target.value = ''; }} /></label>
                      {library.length ? <select aria-label={`Reuse an existing sheet for ${character.name}`} disabled={props.disabled} defaultValue="" onChange={(event) => { const ref = library.find((item) => String(item.id) === event.target.value); if (ref) props.onReuse(character.id, ref); event.target.value = ''; }} style={{ ...inputStyle, fontSize: 12, padding: '6px 7px', minHeight: 44 }}><option value="">Reuse existing…</option>{library.map((ref) => <option key={ref.id} value={ref.id}>@{ref.name}</option>)}</select> : null}
                    </div>
                  </div>
                  <details style={{ minWidth: 0 }}>
                    <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', color: T.bone, fontSize: 12.5, fontWeight: 800 }}>Edit identity, voice & script coverage</summary>
                    <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 140px', gap: 8 }}>
                      {field('Name', 'name', character.name)}
                      <label><span style={{ display: 'block', color: T.dim, fontSize: 12, fontWeight: 750, marginBottom: 4 }}>Type</span><select value={character.kind || 'main'} disabled={props.disabled} onChange={(event) => props.onUpdate(character.id, { kind: event.target.value as FilmCharacter['kind'], approved: false })} style={inputStyle}><option value="main">Main</option><option value="narrator">Narrator / VO</option><option value="side">Recurring side</option></select></label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 8 }}>
                      {field('Role', 'role', character.role || '')}{field('Age / appearance cues', 'age_appearance', character.age_appearance || '')}{field('Wardrobe', 'wardrobe', character.wardrobe || '')}{field('Personality / voice', 'personality_voice', character.personality_voice || '')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
                      {(['tone', 'accent', 'pace'] as const).map((key) => <label key={key}><span style={{ display: 'block', color: T.dim, fontSize: 12, fontWeight: 750, marginBottom: 4 }}>Voice {key}{inferred.has('voice') ? ' · inferred' : ''}</span><input defaultValue={character.voice?.[key] || (key === 'accent' ? 'neutral' : key === 'pace' ? 'conversational' : 'natural')} disabled={props.disabled} onBlur={(event) => props.onUpdate(character.id, { voice: { ...(character.voice || { tone: '', accent: '', pace: '' }), [key]: event.target.value }, approved: false })} style={inputStyle} /></label>)}
                      <label><span style={{ display: 'block', color: T.dim, fontSize: 12, fontWeight: 750, marginBottom: 4 }}>Voice ID <span style={{ fontWeight: 500 }}>(optional)</span></span><input defaultValue={character.voice?.voice_id || ''} placeholder="Existing voice id" disabled={props.disabled} onBlur={(event) => props.onUpdate(character.id, { voice: { ...(character.voice || { tone: 'natural', accent: 'neutral', pace: 'conversational' }), voice_id: event.target.value || undefined }, approved: false })} style={inputStyle} /></label>
                    </div>
                    <div style={{ marginTop: 8 }}>{field('Locked appearance used in every block', 'appearance', character.appearance || '', true)}</div>
                    <details style={{ marginTop: 9 }}><summary style={{ color: T.muted, fontSize: 12, cursor: 'pointer' }}>Script coverage · {coverage.reduce((sum, item) => sum + item.lines.length, 0)} mapped line(s)</summary><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{coverage.length ? coverage.map((item, index) => <div key={index} style={{ color: T.muted, fontSize: 12, lineHeight: 1.45 }}><span style={{ color: T.live, fontFamily: T.mono }}>Scene {item.scene}</span>{item.lines.map((line, lineIndex) => <div key={lineIndex} style={{ marginTop: 2 }}>“{line}”</div>)}</div>) : <div style={{ color: T.fault, fontSize: 12 }}>No exact script lines were mapped. Add coverage before approving if this person appears in the script.</div>}</div></details>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button disabled={props.disabled || !character.url} onClick={() => props.onUpdate(character.id, { approved: !character.approved })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: character.approved ? T.done : character.url ? T.live : T.canvas, color: character.approved || character.url ? 'var(--space-text-on-primary)' : T.dim, border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}><Check size={12} /> {character.approved ? 'Approved' : 'Approve sheet'}</button>
                      <button disabled={props.disabled} onClick={() => props.onRemove(character.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color: T.fault, border: 'none', padding: '7px 8px', fontSize: 12, cursor: 'pointer' }}><Trash2 size={11} /> Remove</button>
                    </div>
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
          <button disabled={props.disabled} onClick={props.onAdd} style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}><Plus size={12} /> Add character</button>
        </div>
      )}
    </section>
  );
}

const SCENE_MODEL_LABELS: Record<string, string> = {
  'kling-3.0-omni': 'Kling Omni 3.0 · 5/10s only · silent · 2–4 refs',
  'kling-3.0': 'Kling 3.0 · 5/10s only · silent · first/last',
  'seedance-2.5': 'Seedance 2.5 · 4–30s · sound · 3 refs OR frames',
  'seedance-2.0': 'Seedance 2.0 Fast · 4–8s · silent · 1 start frame',
  'omni-1.1-flash': 'Gemini Omni 1.1 · 2–8s · sound · up to 10 images',
};

export default function RenderRoom(props: {
  film: Film;
  scenes: FilmScene[];
  note: string;
  busy: boolean;
  auto: boolean;
  autoPost: boolean;
  onToggleAuto: (on: boolean) => void;
  onToggleAutoPost: (on: boolean) => void;
  /** Approve the saved plan and hand every mandatory stage to the durable
   * server runner. The browser becomes a read-only progress viewer. */
  onStartBackground: () => void;
  onFixAudioModels: () => void;
  onPauseBackground: (paused: boolean) => void;
  onStopFutureJobs: () => void;
  onGenerate: (scene: FilmScene) => void;
  onPrepare: (scene: FilmScene) => void;
  onRetry: (scene: FilmScene) => void;
  onRetryFrame: (scene: FilmScene) => void;
  onContinueWithoutFrame: (scene: FilmScene) => void;
  onRegenPrompt: (scene: FilmScene) => void;
  onRedo: (scene: FilmScene) => void;
  redoingId: number | null;
  editingId: number | null;
  onOmniEdit: (scene: FilmScene, instruction: string) => void;
  onAcceptRevision: (scene: FilmScene, revisionId: string) => void;
  onUndoRevision: (scene: FilmScene, revisionId: string) => void;
  onSkip: (scene: FilmScene) => void;
  onGenerateCharacterDialogue: (scene: FilmScene) => void;
  dialogueAudioSceneId: number | null;
  /** Fire every prepared scene at once (multi-generate). */
  onGenerateAll: () => void;
  /** Style Lock, toggled mid-production. */
  onToggleStyleLock: (on: boolean) => void;
  onUpdateCharacter: (id: string, patch: Partial<FilmCharacter>) => void;
  onAddCharacter: () => void;
  onRemoveCharacter: (id: string) => void;
  onRegenerateCharacter: (id: string, quality?: 'draft' | 'premium') => void;
  onGenerateMissingCast: () => void;
  onUploadCharacter: (id: string, file: File) => void;
  onReuseCharacter: (id: string, reference: StoredReference) => void;
  onConfirmEmptyCast: () => void;
  onUpdatePlanScene: (scene: FilmScene, patch: Record<string, unknown>) => void;
  onGenerateStoryboard: (scene: FilmScene) => void;
  onApproveStoryboard: (scene: FilmScene) => void;
  onMovePlanScene: (scene: FilmScene, direction: -1 | 1) => void;
  onAddPlanScene: (after: FilmScene) => void;
  onDeletePlanScene: (scene: FilmScene) => void;
  onAudioProbe: (scene: FilmScene, probe: ClipAudioProbe) => void;
  manualMode: boolean;
}) {
  const { film, note, busy, auto } = props;
  const scenes = [...(Array.isArray(props.scenes) ? props.scenes : [])].sort((a, b) => a.idx - b.idx);
  const completed = scenes.filter((s) => s.status === 'completed');
  const failedScenes = scenes.filter((s) => s.status === 'failed');
  const generating = scenes.find((s) => s.status === 'generating') || null;
  const active = scenes.find((s) => !DONE.has(String(s.status))) || null;
  const allDone = scenes.length > 0 && scenes.every((s) => DONE.has(String(s.status)));
  const assembling = film.status === 'assembling';
  // Multi-generate: every scene whose prompt is prepared and waiting.
  const readyToFire = scenes.filter((s) => s.status === 'ready' && String(s.prompt || '').trim());
  const batchRunning = busy || !!generating;
  const styleLocked = film.style_lock === true;
  const totalSeconds = scenes.reduce((n, s) => n + sceneSeconds(film, s), 0);
  const background = film.plan?.background || null;
  const backgroundActive = background?.enabled === true && film.status !== 'ready';
  const makeStarted = backgroundActive || scenes.some((scene) => !['waiting', 'ready'].includes(String(scene.status)));
  const characterSheets = Array.isArray(film.character_refs) ? film.character_refs : [];
  const missingSheets = characterSheets.filter((character) => character.sheet_required !== false && !character.url);
  const unapprovedSheets = characterSheets.filter((character) => character.sheet_required !== false && character.url && !character.approved);
  const castReady = film.plan?.cast_reviewed === true && missingSheets.length === 0 && unapprovedSheets.length === 0;
  const incompatibleSpeakingScenes = film.plan?.characters_speak
    ? scenes.filter((scene) => scene.dialogue?.kind === 'character' && Boolean(String(scene.dialogue?.line || '').trim()) && !resolveVideoModel((scene.spec as VideoClipSpec)?.engine_id || film.video_model).audioSupported)
    : [];
  const durableModelIds = new Set(['seedance-2.5', 'seedance-2.0', 'kling-3.0-omni', 'kling-3.0', 'omni-1.1-flash']);
  const unsupportedBackgroundScenes = scenes.filter((scene) => !durableModelIds.has(resolveVideoModel((scene.spec as VideoClipSpec)?.engine_id || film.video_model).id));
  const modelBlockers = Array.from(new Set([...incompatibleSpeakingScenes, ...unsupportedBackgroundScenes]));
  const signedInTabRequired = scenes.some((scene) => !durableModelIds.has(resolveVideoModel((scene.spec as VideoClipSpec)?.engine_id || film.video_model).id));
  const startReady = castReady && modelBlockers.length === 0 && !busy && !generating;
  const startDisabledReason = missingSheets.length
    ? `Add ${missingSheets[0]?.name || 'the missing character'}’s sheet.`
    : unapprovedSheets.length
      ? `Approve ${unapprovedSheets[0]?.name || 'the remaining character'}’s sheet.`
      : modelBlockers.length
        ? 'Choose models that fit the spoken lines.'
        : busy || generating
          ? 'Wait for the current action to finish.'
          : '';
  const storyboardRequested = film.plan?.storyboard_requested === true || (Array.isArray(film.plan?.assumptions) ? film.plan!.assumptions! : [])
    .some((item) => /Storyboard:\s*requested/i.test(String(item)));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => { setSelectedId(active ? active.id : (scenes[scenes.length - 1]?.id ?? null)); }, [active?.id, scenes.length]);
  const selected = scenes.find((s) => s.id === selectedId) || active || scenes[0] || null;
  const selectedIsActive = !!selected && !!active && selected.id === active.id;

  return (
    <div className="s2v-board" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* —— Scene rail —— */}
      <div className="s2v-scene-rail" style={{ width: 268, flexShrink: 0, borderRight: `1px solid ${T.raised}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ color: T.bone, fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{film.title || 'Your film'}</div>
          <div style={{ color: T.muted, fontSize: 12, marginTop: 4 }}>{completed.length} of {scenes.length} clips completed</div>
          {generating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.live, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
              <VergeLoader size={28} label="Generating" /> Generating scene {generating.idx + 1}/{scenes.length}
            </div>
          ) : null}
          <div role="progressbar" aria-label="Completed video clips" aria-valuemin={0} aria-valuemax={scenes.length} aria-valuenow={completed.length} aria-valuetext={`${completed.length} of ${scenes.length} clips completed`} style={{ marginTop: 8, height: 4, background: T.raised, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${scenes.length ? Math.round((completed.length / scenes.length) * 100) : 2}%`, background: T.live, transition: 'width 0.6s ease' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 8px 12px' }}>
          {scenes.map((s) => {
            const meta = statusMeta(s);
            const isSel = selected?.id === s.id;
            return (
              <button
                key={s.id}
                className="s2v-row"
                onClick={() => setSelectedId(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', background: isSel ? 'color-mix(in srgb, var(--vg-accent) 11%, transparent)' : 'transparent', border: `1px solid ${isSel ? T.dim : 'transparent'}`, borderRadius: 10, padding: '9px 10px', cursor: 'pointer', marginBottom: 2 }}
              >
                <span style={{ color: meta.color, display: 'flex', flexShrink: 0 }}>{meta.icon}</span>
                <span style={{ color: isSel ? T.bone : T.muted, fontFamily: T.mono, fontSize: 12, flexShrink: 0 }}>
                  Scene {String(s.idx + 1).padStart(2, '0')} <span style={{ color: T.live, fontWeight: 700 }}>· {sceneSeconds(film, s)}s</span>
                </span>
                <span style={{ color: meta.color, fontSize: 12, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{meta.word}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${T.raised}`, color: auto && !backgroundActive ? T.live : T.dim, fontSize: 12, lineHeight: 1.45 }}>
          {backgroundActive ? 'Production continues safely when this tab is closed.' : auto ? 'Signed-in production is active. Keep this tab open while Kling or Seedance renders and polls.' : 'Production begins only after the readiness checks pass and you press Start.'}
        </div>
      </div>

      {/* —— Active scene panel —— */}
      <div className="s2v-board-panel" style={{ flex: 1, overflowY: 'auto', minWidth: 0, padding: '24px 24px 32px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <ProductionOverview film={film} scenes={scenes} />
          {/* Film-level facts and controls: how long the cut runs, whether the
              look is locked, and — when several prompts are waiting — the one
              button that renders them all at once. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ color: T.bone, fontSize: 13, fontWeight: 700, fontFamily: T.mono }}> 
              Total: ~{totalSeconds}s <span style={{ color: T.muted, fontWeight: 500, fontFamily: T.sans }}>across {scenes.length} scene{scenes.length === 1 ? '' : 's'}</span>
            </span>
            {film.plan?.writer_model ? <span style={{ color: T.live, border: `1px solid ${T.live}`, borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 800 }}>Written by {film.plan.writer_model}</span> : null}
            <span style={{ color: film.plan?.audio_enabled === false ? T.dim : T.done, border: `1px solid ${film.plan?.audio_enabled === false ? T.dim : T.done}`, borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 800 }}>
              Audio {film.plan?.audio_enabled === false ? 'OFF' : 'ON'} · Narration {film.plan?.narration_enabled ? 'ON' : 'OFF'} · Characters speak {film.plan?.characters_speak ? 'YES' : 'NO'}
            </span>
            {props.manualMode ? <button
              type="button"
              role="switch"
              aria-checked={styleLocked}
              disabled={busy}
              title="Locks the visual style after the first scene so every clip matches the same look, palette and lighting. Prompts already written keep their text — regenerate a scene's prompt to apply the lock to it."
              onClick={() => props.onToggleStyleLock(!styleLocked)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: styleLocked ? 'color-mix(in srgb, var(--space-brand-primary-500) 14%, transparent)' : 'transparent', border: `1px solid ${styleLocked ? T.live : T.dim}`, color: styleLocked ? T.live : T.muted, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}
            >
              <Lock size={11} /> Style Lock {styleLocked ? 'on' : 'off'}
            </button> : null}
            {readyToFire.length >= 2 ? (
              <button
                className="s2v-lift"
                disabled={batchRunning}
                title="Render every prepared scene in order. Each later scene waits for the newly validated prior frame; a failure stops later submissions."
                onClick={props.onGenerateAll}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, background: batchRunning ? T.raised : T.live, color: batchRunning ? T.dim : 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, cursor: batchRunning ? 'default' : 'pointer' }}
              >
                <Layers size={13} /> {batchRunning ? 'Generating…' : `Generate All Ready (${readyToFire.length})`}
              </button>
            ) : null}
          </div>

          {!background?.enabled && !allDone && !auto ? (
            <section style={{ marginBottom: 14, background: T.card, border: `1px solid ${startReady ? T.done : T.live}`, borderRadius: 13, padding: '15px 16px', boxShadow: '0 8px 28px color-mix(in srgb, var(--space-text-primary) 14%, transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ color: T.bone, fontSize: 15, fontWeight: 850 }}>{startReady ? 'Ready to start production' : 'Finish these checks, then Start'}</div>
                  <div role="list" aria-label="Production readiness checks" style={{ display: 'grid', gap: 5, marginTop: 8 }}>
                    {[
                      { label: 'Cast references approved', pass: !missingSheets.length && !unapprovedSheets.length, detail: missingSheets.length ? `${missingSheets.length} image${missingSheets.length === 1 ? '' : 's'} missing` : unapprovedSheets.length ? `${unapprovedSheets.length} sheet${unapprovedSheets.length === 1 ? '' : 's'} need review` : 'ready' },
                      { label: 'Model and dialogue compatible', pass: !modelBlockers.length, detail: modelBlockers.length ? `${modelBlockers.length} conflict${modelBlockers.length === 1 ? '' : 's'}` : 'ready' },
                      { label: 'Exact scene timing saved', pass: scenes.length > 0 && scenes.every((scene) => sceneSeconds(film, scene) > 0), detail: `${scenes.length} big scene${scenes.length === 1 ? '' : 's'}` },
                    ].map((check) => <div key={check.label} role="listitem" style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 7, color: check.pass ? T.done : T.fault, fontSize: 12 }}><span aria-hidden>{check.pass ? '✓' : '!'}</span><span style={{ color: T.bone }}>{check.label}</span><span style={{ color: T.dim }}>· {check.detail}</span></div>)}
                  </div>
                  <div role="list" aria-label="Plan totals" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}><span role="listitem" style={{ color: T.bone, background: T.raised, border: `1px solid ${T.line}`, borderRadius: 9, padding: '7px 9px', fontSize: 12 }}>Total · {totalSeconds}s</span><span role="listitem" style={{ color: T.bone, background: T.raised, border: `1px solid ${T.line}`, borderRadius: 9, padding: '7px 9px', fontSize: 12 }}>Estimate · {totalSeconds} credits</span><span role="listitem" style={{ color: T.bone, background: T.raised, border: `1px solid ${T.line}`, borderRadius: 9, padding: '7px 9px', fontSize: 12 }}>ETA · several minutes per block</span></div><div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>{signedInTabRequired ? 'Keep this tab open while the selected model works.' : 'You can close this tab after Start.'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {missingSheets.length ? <button type="button" disabled={busy} onClick={props.onGenerateMissingCast} style={{ minHeight: 44, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Generate missing images</button> : null}
                  {modelBlockers.length ? <button type="button" disabled={busy} onClick={props.onFixAudioModels} style={{ minHeight: 44, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Fix model compatibility</button> : null}
                  <div style={{ display: 'grid', gap: 5, justifyItems: 'end' }}><button className="s2v-lift" disabled={!startReady} onClick={props.onStartBackground} style={{ minHeight: 46, display: 'inline-flex', alignItems: 'center', gap: 8, background: startReady ? 'var(--vg-gradient-action)' : T.raised, color: startReady ? 'var(--space-text-on-primary)' : T.dim, border: `1px solid ${startReady ? T.live : T.line}`, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 850, cursor: startReady ? 'pointer' : 'default' }}><Play size={14} /> Start</button>{startDisabledReason ? <span style={{ color: T.fault, fontSize: 12 }}>{startDisabledReason}</span> : <span style={{ color: T.done, fontSize: 12 }}>Ready to make {scenes.length} block{scenes.length === 1 ? '' : 's'}.</span>}</div>
                </div>
              </div>
              <details style={{ marginTop: 10 }}><summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', color: T.muted, fontSize: 12, fontWeight: 750 }}>Model limits</summary><div style={{ display: 'grid', gap: 5, color: T.muted, fontSize: 12, lineHeight: 1.45 }}>{S2V_VIDEO_CAPABILITIES.filter((item) => item.operation === 'generate' && item.available && item.modelId !== 'openrouter/bytedance/seedance-2.0-fast').map((item) => <div key={item.key}><b style={{ color: T.bone }}>{item.label}:</b> {item.supportedDurations?.length ? item.supportedDurations.map((value) => `${value}s`).join('/') : `${item.minDurationSec}–${item.maxDurationSec}s`}, {item.nativeAudio ? 'native sound' : 'silent adapter'}, {item.maxReferences} reference input{item.maxReferences === 1 ? '' : 's'}, continuity by {item.continuityMode.replace('-', ' ')}.</div>)}</div></details>
            </section>
          ) : null}


          {!makeStarted ? <CastReview
            film={film}
            disabled={busy || backgroundActive}
            onUpdate={props.onUpdateCharacter}
            onAdd={props.onAddCharacter}
            onRemove={props.onRemoveCharacter}
            onRegenerate={props.onRegenerateCharacter}
            onUpload={props.onUploadCharacter}
            onReuse={props.onReuseCharacter}
            onConfirmEmpty={props.onConfirmEmptyCast}
          /> : null}

          <section aria-labelledby="plan-timeline-title" style={{ display: makeStarted ? 'none' : 'block', marginBottom: 14, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}><div><h2 id="plan-timeline-title" style={{ color: T.bone, fontSize: 20, margin: 0 }}>Plan</h2><p style={{ color: T.muted, fontSize: 14, lineHeight: 1.5, margin: '4px 0 0' }}>Review each block from top to bottom. Edit anything before Start.</p></div><span style={{ color: T.muted, fontSize: 12 }}>{totalSeconds}s · {scenes.length} blocks</span></div>
            <div style={{ display: 'grid', gap: 0, marginTop: 14 }}>
              {scenes.map((scene, index) => {
                const planned = (film.plan?.scenes || []).find((item) => item.scene_key === scene.scene_key);
                const sceneSpec = (planned?.spec || scene.spec || {}) as VideoClipSpec;
                const start = scenes.slice(0,index).reduce((sum,item) => sum + sceneSeconds(film,item),0);
                const end = start + sceneSeconds(film,scene);
                const castThumbs = (film.character_refs || []).filter((character) => (sceneSpec.characters || []).includes(character.id) && character.url);
                return <div key={scene.id} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 12 }}><div aria-hidden style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 999, background: selected?.id === scene.id ? T.live : T.raised, color: selected?.id === scene.id ? 'var(--space-text-on-primary)' : T.bone, border: `1px solid ${selected?.id === scene.id ? T.live : T.dim}`, fontSize: 12, fontWeight: 850 }}>{index + 1}</span>{index < scenes.length - 1 ? <span style={{ width: 1, flex: 1, minHeight: 22, background: T.line }} /> : null}</div><article style={{ marginBottom: 12, background: selected?.id === scene.id ? 'color-mix(in srgb, var(--space-brand-primary-500) 8%, var(--space-surface-card))' : T.raised, border: `1px solid ${selected?.id === scene.id ? T.live : T.line}`, borderRadius: 12, padding: 12 }}><button type="button" onClick={() => setSelectedId(scene.id)} style={{ width: '100%', minHeight: 44, textAlign: 'left', background: 'transparent', color: T.bone, border: 0, padding: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><strong style={{ fontSize: 14 }}>Block {index + 1}</strong><span style={{ color: T.live, fontFamily: T.mono, fontSize: 12 }}>{start}–{end}s</span><span style={{ color: T.muted, border: `1px solid ${T.dim}`, borderRadius: 999, padding: '3px 8px', fontSize: 12 }}>{sceneSpec.cut_type === 'continuous' ? 'Continues' : 'New shot'}</span></span></button><div style={{ display: 'grid', gridTemplateColumns: (sceneSpec as any).storyboard_url ? '120px minmax(0,1fr)' : 'minmax(0,1fr)', gap: 12, marginTop: 8 }}>{(sceneSpec as any).storyboard_url ? <img src={String((sceneSpec as any).storyboard_url)} alt={`Storyboard frame for block ${index + 1}`} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.line}` }} /> : null}<div><p style={{ color: T.muted, fontSize: 14, lineHeight: 1.5, margin: 0 }}>{String(scene.script_segment || sceneSpec.visual_goal || 'Visual beat')}</p>{scene.dialogue?.line ? <p style={{ color: T.bone, fontSize: 14, lineHeight: 1.5, margin: '7px 0 0' }}>“{scene.dialogue.line}”</p> : null}<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{castThumbs.map((character) => <img key={character.id} src={character.url!} alt={character.name} title={character.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.dim}` }} />)}{(scene.reference_assets || []).slice(0,4).map((asset,assetIndex) => <img key={`${asset.url}-${assetIndex}`} src={asset.url} alt={asset.label || 'Reference'} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.dim}` }} />)}</div></div></div>{sceneSpec.speech_warning ? <div role="status" style={{ marginTop: 9, color: 'var(--vg-warning)', background: 'var(--vg-warning-bg)', border: '1px solid var(--vg-warning)', borderRadius: 9, padding: '8px 10px', fontSize: 12 }}>{sceneSpec.speech_warning}</div> : null}<details style={{ marginTop: 9 }}><summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', color: T.bone, fontSize: 14, fontWeight: 750 }}>Edit block</summary><div style={{ display: 'grid', gap: 8, marginTop: 8 }}><label style={{ color: T.muted, fontSize: 12 }}>Script<textarea defaultValue={scene.script_segment || ''} rows={3} disabled={backgroundActive} onBlur={(event) => { if (event.target.value !== scene.script_segment) props.onUpdatePlanScene(scene,{script_segment:event.target.value}); }} style={{ width: '100%', marginTop: 4, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 10, fontSize: 14 }} /></label><label style={{ color: T.muted, fontSize: 12 }}>Spoken lines<textarea defaultValue={scene.dialogue?.line || ''} rows={2} disabled={backgroundActive} onBlur={(event) => props.onUpdatePlanScene(scene,{dialogue_line:event.target.value})} style={{ width: '100%', marginTop: 4, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 10, fontSize: 14 }} /></label><label style={{ color: T.muted, fontSize: 12 }}>Length (seconds)<input type="number" defaultValue={scene.duration_s} disabled={backgroundActive} onBlur={(event) => props.onUpdatePlanScene(scene,{duration_s:Number(event.target.value)})} style={{ width: 100, minHeight: 44, marginLeft: 8, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 8 }} /></label><label style={{ color: T.muted, fontSize: 12 }}>Prompt<textarea defaultValue={scene.prompt || String(sceneSpec.visual_goal || '')} rows={4} disabled={backgroundActive} onBlur={(event) => props.onUpdatePlanScene(scene,{prompt:event.target.value})} style={{ width: '100%', marginTop: 4, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 10, fontSize: 14 }} /></label></div></details></article></div>;
              })}
            </div>
          </section>

          {false && props.manualMode ? <section style={{ marginBottom: 12, background: T.card, border: `1px solid ${storyboardRequested ? T.live : T.line}`, borderRadius: 12, padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}><div style={{ color: T.bone, fontSize: 13, fontWeight: 800 }}>Storyboard</div><div style={{ color: T.muted, fontSize: 12 }}>{storyboardRequested ? 'One keyframe per block. Opening and New shot blocks start from these frames.' : 'Not selected in the brief.'}</div>{!storyboardRequested && !background?.enabled && selected ? <button type="button" disabled={busy} onClick={() => props.onGenerateStoryboard(selected)} style={{ marginLeft: 'auto', minHeight: 44, background: 'transparent', color: T.live, border: `1px solid ${T.live}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 750 }}>Add storyboard for scene {selected.idx + 1}</button> : null}</div>
            {storyboardRequested ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 9, marginTop: 10 }}>{scenes.map((scene) => { const sceneSpec = (scene.spec || {}) as VideoClipSpec; const state = sceneSpec.storyboard_status || (sceneSpec.storyboard_url ? 'ready' : 'loading'); return <article key={scene.id} style={{ background: T.raised, border: `1px solid ${sceneSpec.storyboard_approved ? T.done : state === 'error' ? T.fault : T.line}`, borderRadius: 10, padding: 9 }}>{sceneSpec.storyboard_url ? <img src={sceneSpec.storyboard_url} alt={`Storyboard scene ${scene.idx + 1}`} style={{ width: '100%', height: 92, objectFit: 'cover', borderRadius: 7 }} /> : state === 'error' ? <div style={{ minHeight: 92, display: 'grid', placeItems: 'center', color: T.fault, fontSize: 12, textAlign: 'center' }}>{sceneSpec.storyboard_error || 'Storyboard generation failed.'}</div> : <div style={{ minHeight: 92, display: 'grid', placeItems: 'center' }}><VergeLoader size={36} label={`Generating storyboard scene ${scene.idx + 1}`} /></div>}<div style={{ color: T.live, fontFamily: T.mono, fontSize: 12, marginTop: 7 }}>SCENE {scene.idx + 1}</div><div style={{ color: T.muted, fontSize: 12, lineHeight: 1.4, marginTop: 3 }}>{String(sceneSpec.storyboard_caption || sceneSpec.summary || sceneSpec.visual_goal || scene.script_segment).slice(0, 120)}</div><div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{sceneSpec.storyboard_url && !sceneSpec.storyboard_approved ? <button type="button" disabled={busy || background?.enabled} onClick={() => props.onApproveStoryboard(scene)} style={{ minHeight: 36, flex: 1, background: T.done, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 800 }}>Approve</button> : null}<button type="button" disabled={busy || background?.enabled} onClick={() => props.onGenerateStoryboard(scene)} style={{ minHeight: 36, flex: 1, background: 'transparent', color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 7, fontSize: 12 }}>{sceneSpec.storyboard_url ? 'Regenerate' : state === 'error' ? 'Retry' : 'Generate'}</button></div>{sceneSpec.storyboard_approved ? <div style={{ color: T.done, fontSize: 12, marginTop: 6 }}>Approved keyframe</div> : null}</article>; })}</div> : null}
          </section> : null}

          {false && !props.manualMode ? <section aria-label="Text shot plan" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>{scenes.map((scene) => { const planned = (film.plan?.scenes || []).find((item) => item.scene_key === scene.scene_key); const sceneSpec = (planned?.spec || scene.spec || {}) as VideoClipSpec; return <button key={scene.id} type="button" onClick={() => setSelectedId(scene.id)} style={{ width: '100%', minHeight: 120, textAlign: 'left', background: selected?.id === scene.id ? 'color-mix(in srgb, var(--vg-accent) 10%, transparent)' : T.card, color: T.bone, border: `1px solid ${selected?.id === scene.id ? T.live : T.line}`, borderRadius: 12, padding: 14 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><b style={{ color: T.live, fontFamily: T.mono }}>{scene.idx === 0 ? 0 : scenes.slice(0, scene.idx).reduce((sum, item) => sum + sceneSeconds(film, item), 0)}–{scenes.slice(0, scene.idx + 1).reduce((sum, item) => sum + sceneSeconds(film, item), 0)}s</b><span style={{ color: T.muted, fontSize: 12 }}>{sceneSpec.cut_type === 'continuous' ? 'Continues' : 'New shot'}</span>{(film.character_refs || []).filter((character) => (sceneSpec.characters || []).includes(character.id)).map((character) => character.url ? <img key={character.id} src={character.url} alt={character.name} title={character.name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 999, border: `1px solid ${T.dim}` }} /> : null)}</span>{sceneSpec.timed_beats?.length ? <span style={{ display: 'grid', gap: 5, marginTop: 9 }}>{sceneSpec.timed_beats.map((beat, index) => <span key={index} style={{ color: T.muted, fontSize: 12, lineHeight: 1.45 }}><b style={{ color: T.bone }}>{beat.start_s}–{beat.end_s}s</b> {beat.action}</span>)}</span> : <span style={{ display: 'block', color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{String(sceneSpec.visual_goal || planned?.visual_goal || scene.script_segment)}</span>}<span style={{ display: 'block', marginTop: 8, color: T.bone, fontSize: 12.5 }}>“{String(scene.dialogue?.line || scene.script_segment || 'Visual beat')}”</span>{sceneSpec.speech_warning ? <span style={{ display: 'block', color: 'var(--vg-warning)', fontSize: 12, marginTop: 6 }}>{sceneSpec.speech_warning}</span> : null}</button>; })}</section> : null}

          {false && props.manualMode && (storyboardRequested || !background?.enabled) ? (
            <details style={{ marginBottom: 12, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: '13px 14px' }}>
              <summary style={{ cursor: 'pointer', color: T.bone, fontSize: 13, fontWeight: 750 }}>Editable production plan · {scenes.length} planned block{scenes.length === 1 ? '' : 's'}</summary>
              {!background?.enabled ? <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>Select a card, then edit its objective, dialogue/VO, visual, camera, environment, sound, continuity, references, duration and model below. Reorder, add or delete before approval; paid production locks the plan.</div> : null}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 9, marginTop: 10 }}>
                {scenes.map((scene) => {
                  const planned = (film.plan?.scenes || []).find((item) => item.scene_key === scene.scene_key);
                  const sceneSpec = (planned?.spec || scene.spec || {}) as VideoClipSpec;
                  return <button key={scene.id} type="button" onClick={() => setSelectedId(scene.id)} style={{ minHeight: 112, textAlign: 'left', background: selected?.id === scene.id ? 'color-mix(in srgb, var(--vg-accent) 10%, transparent)' : T.raised, color: T.bone, border: `1px solid ${selected?.id === scene.id ? T.live : T.line}`, borderRadius: 10, padding: 11, cursor: 'pointer', overflow: 'hidden' }}>{(sceneSpec as any).storyboard_url ? <img src={String((sceneSpec as any).storyboard_url)} alt={`Human-review storyboard for block ${scene.idx + 1}`} style={{ display: 'block', width: '100%', height: 82, objectFit: 'cover', borderRadius: 7, marginBottom: 8, border: `1px solid ${T.line}` }} /> : null}<span style={{ display: 'block', color: T.live, fontFamily: T.mono, fontSize: 12 }}>BLOCK {String(scene.idx + 1).padStart(2, '0')} · {sceneSeconds(film, scene)}s</span><span style={{ display: 'block', fontSize: 12, fontWeight: 700, marginTop: 6 }}>{String(sceneSpec.summary || planned?.summary || 'Planned beat')}</span><span style={{ display: 'block', color: T.muted, fontSize: 12, lineHeight: 1.4, marginTop: 5 }}>{String(sceneSpec.visual_goal || planned?.visual_goal || scene.script_segment).slice(0, 150)}</span>{(sceneSpec as any).storyboard_url ? <span style={{ display: 'block', color: T.dim, fontSize: 12, marginTop: 6 }}>SHOT KEYFRAME</span> : null}</button>;
                })}
              </div>
            </details>
          ) : null}

          {background?.review_gate_pending ? (
            <div role="status" aria-live="polite" style={{ marginBottom: 12, padding: 16, borderRadius: 12, background: 'var(--space-surface-card)', border: `1px solid ${T.live}` }}>
              <div style={{ color: T.bone, fontSize: 18, fontWeight: 800 }}>Block 1 is ready — does the look work?</div>
              {scenes[0]?.asset_url ? <video src={scenes[0].asset_url} controls playsInline style={{ width: '100%', maxHeight: 300, borderRadius: 10, marginTop: 12, background: 'var(--space-surface-bg)' }} /> : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" onClick={() => props.onPauseBackground(false)} style={{ minHeight: 44, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 800 }}>Continue</button>
                <button type="button" onClick={() => { if (scenes[0]) props.onRegenPrompt(scenes[0]); }} style={{ minHeight: 44, background: T.raised, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 750 }}>Change look</button>
              </div>
            </div>
          ) : null}

          {makeStarted ? <section aria-labelledby="make-progress-title" style={{ marginBottom: 14, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}><div><h2 id="make-progress-title" style={{ color: T.bone, fontSize: 20, margin: 0 }}>Make</h2><p style={{ color: T.muted, fontSize: 14, margin: '4px 0 0' }}>{signedInTabRequired ? 'Keep this tab open while this model works.' : 'You can close this tab. Your progress is saved.'}</p></div><span style={{ color: T.muted, fontSize: 12 }}>{completed.length} of {scenes.length} ready</span></div><div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{scenes.map((scene) => { const state = String(scene.status); const label = DONE.has(state) ? 'done' : state === 'failed' ? 'failed' : ['queued','submitted','processing','generating','retrying'].includes(state) ? 'rendering' : state === 'ready' && scene.prompt ? 'writing' : 'waiting'; const tone = label === 'done' ? T.done : label === 'failed' ? T.fault : label === 'rendering' ? T.live : T.muted; return <div key={scene.id} style={{ display: 'grid', gridTemplateColumns: scene.asset_url ? '72px minmax(0,1fr) auto' : 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', minHeight: 64, background: T.raised, border: `1px solid ${label === 'failed' ? T.fault : T.line}`, borderRadius: 10, padding: 10 }}>{scene.asset_url ? <video src={scene.asset_url} muted playsInline preload="metadata" style={{ width: 72, height: 46, objectFit: 'cover', borderRadius: 7, background: T.canvas }} /> : null}<div style={{ minWidth: 0 }}><div style={{ color: T.bone, fontSize: 14, fontWeight: 800 }}>Block {scene.idx + 1} · {sceneSeconds(film,scene)}s</div><div style={{ color: tone, fontSize: 12, marginTop: 4 }}>waiting → writing → rendering → {label === 'failed' ? 'failed' : 'done'} · <b>{label}</b></div>{label === 'failed' ? <div style={{ color: T.fault, fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>{customerError(scene.error)}</div> : null}</div><div>{label === 'rendering' ? <VergeLoader size={32} label={`Rendering block ${scene.idx + 1}`} /> : label === 'done' ? <Check size={18} color={T.done} /> : label === 'failed' ? <button type="button" disabled={busy} onClick={() => props.onRetry(scene)} style={{ minHeight: 44, background: T.live, color: 'var(--space-text-on-primary)', border: 0, borderRadius: 9, padding: '8px 13px', fontSize: 12, fontWeight: 800 }}>Retry</button> : <Circle size={16} color={T.dim} />}</div></div>; })}</div></section> : null}

          {backgroundActive ? (
            <>
            <div style={{ marginBottom: 10, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: T.bone, fontSize: 13, fontWeight: 800 }}><span>Shot {Math.min(scenes.length, completed.length + 1)} of {scenes.length}</span><span>{scenes.length ? Math.round((completed.length / scenes.length) * 100) : 0}%</span></div><div role="progressbar" aria-valuemin={0} aria-valuemax={scenes.length} aria-valuenow={completed.length} style={{ height: 7, borderRadius: 999, background: T.raised, marginTop: 9, overflow: 'hidden' }}><div style={{ width: `${scenes.length ? (completed.length / scenes.length) * 100 : 0}%`, height: '100%', background: T.live }} /></div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{['Prompts written', 'Voice ready', 'Music ready', background?.review_gate_pending ? 'Look waiting' : 'Look approved'].map((label) => <span key={label} style={{ border: `1px solid ${T.line}`, borderRadius: 999, padding: '5px 8px', color: T.muted, fontSize: 12 }}>{label}</span>)}</div><div style={{ marginTop: 10, color: T.muted, fontSize: 12 }}>Credits · used {Number(film.plan?.orchestration?.billed_so_far || 0).toFixed(0)} · held {Math.max(0, Number(film.plan?.max_authorized_credits || 0) - Number(film.plan?.orchestration?.billed_so_far || 0)).toFixed(0)} · returned {Number((film.plan?.background as any)?.credits_returned || 0).toFixed(0)}</div></div>
            <div role="status" aria-live="polite" style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 11, background: 'color-mix(in srgb, var(--space-brand-primary-500) 8%, transparent)', border: `1px solid ${T.live}`, display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {film.plan?.orchestration?.paused ? <Pause size={18} color={T.live} /> : <VergeLoader size={32} label="Background production running" />}
              <div style={{ flex: '1 1 260px' }}><div style={{ color: T.bone, fontSize: 12.5, fontWeight: 750 }}>{film.plan?.orchestration?.paused ? 'Paused after the current provider job' : 'Running in the background — safe to close this tab'}</div><div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>{film.stage_note || 'The next saved step will appear here.'}</div><div style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>Billed so far: {Number(film.plan?.orchestration?.billed_so_far || 0).toFixed(0)} credits · ceiling {Number(film.plan?.max_authorized_credits || 0).toFixed(0)} credits</div></div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><button type="button" onClick={() => props.onPauseBackground(!film.plan?.orchestration?.paused)} style={{ minHeight: 44, background: T.raised, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>{film.plan?.orchestration?.paused ? 'Resume' : 'Pause after this shot'}</button><button type="button" onClick={props.onStopFutureJobs} style={{ minHeight: 44, background: 'transparent', color: T.fault, border: `1px solid ${T.fault}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, cursor: 'pointer' }}>Stop future jobs</button></div>
            </div>
            {completed.length ? <WatchSoFar scenes={completed} /> : null}
            </>
          ) : null}

          {/* Persisted pipeline stage, collapsed so the active scene remains the focus. */}
          <details style={{ marginBottom: 10, background: 'color-mix(in srgb, var(--space-text-primary) 4%, transparent)', border: `1px solid ${T.raised}`, borderRadius: 10, padding: '9px 12px' }}>
            <summary style={{ cursor: 'pointer', color: generating || assembling ? T.live : T.muted, fontSize: 12.5, fontWeight: 700, listStylePosition: 'inside' }}>
              Production status — {note || film.stage_note || (active ? 'Waiting for the next scene' : 'Waiting for you')}
            </summary>
            <div style={{ marginTop: 9 }}><GenerationStates film={film} scenes={scenes} /></div>
          </details>
          {film.error ? (
            <VideoErrorCard
              error={friendlyErrorMessage(film.error)}
              engineId={(film as any).video_model || (film as any).engine_id}
              subject="this film"
              onRetry={active ? () => props.onRetry(active) : undefined}
              compact
              style={{ margin: '6px 0 10px' }}
            />
          ) : null}

          {/* Partial failures are never swallowed: the scenes that refused are
              listed here with their real reason and a retry that touches only
              them, while every other clip keeps its progress. */}
          {false && failedScenes.length ? (
            <div style={{ marginTop: 6, marginBottom: 10, background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger)', borderRadius: 12, padding: '13px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AlertTriangle size={14} color={T.fault} style={{ flexShrink: 0 }} />
                <span style={{ color: T.fault, fontSize: 13, fontWeight: 700 }}>
                  {completed.length} of {scenes.length} scenes succeeded, {failedScenes.length} failed
                </span>
                <button
                  className="s2v-lift"
                  disabled={busy || !!generating}
                  onClick={() => { const first = failedScenes[0]; if (first) props.onRetry(first); }}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: busy || generating ? T.raised : T.live, color: busy || generating ? T.dim : 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy || generating ? 'default' : 'pointer' }}
                >
                  <RefreshCw size={12} /> Retry failed only
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {failedScenes.map((s) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: T.muted, fontFamily: T.mono, fontSize: 12, flexShrink: 0, paddingTop: 1 }}>Scene {String(s.idx + 1).padStart(2, '0')}</span>
                    <span style={{ color: T.fault, fontSize: 12, lineHeight: 1.5, minWidth: 0, flex: 1 }}>{customerError(s.error)}</span>
                    {isCreditsError(s.error) ? (
                      <button className="s2v-ghost" onClick={() => openPricing('credits')} style={{ flexShrink: 0, background: T.live, border: 'none', color: 'var(--space-text-on-primary)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Top up credits</button>
                    ) : null}
                    {classifyError(s.error).canSwitchToOmni && !film.plan?.background?.enabled && resolveVideoModel(((s.spec as VideoClipSpec)?.engine_id) || film.video_model).id !== OMNI_MODEL_ID && Number(s.duration_s) <= 8 ? (
                      <button className="s2v-ghost" disabled={busy || !!generating} onClick={() => props.onUpdatePlanScene(s, { engine_id: OMNI_MODEL_ID, engine_reason: `Creator switched to ${OMNI_LABEL} so this scene can generate in the background.` })} style={{ flexShrink: 0, background: T.live, border: 'none', color: 'var(--space-text-on-primary)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: busy || generating ? 'default' : 'pointer' }}>Switch to Omni</button>
                    ) : null}
                    <button className="s2v-ghost" disabled={busy || !!generating} onClick={() => props.onRetry(s)} style={{ flexShrink: 0, background: 'transparent', border: `1px solid ${T.dim}`, color: T.muted, borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: busy || generating ? 'default' : 'pointer' }}>Retry</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {allDone && !selected ? (
            <div style={{ color: T.done, fontSize: 14, marginTop: 30, textAlign: 'center' }}>All scenes are complete — assemble the final film.</div>
          ) : null}

          {selected && !makeStarted ? <ScenePanel key={selected.id} {...props} scene={selected} scenes={scenes} film={film} isActive={selectedIsActive} busy={busy} auto={auto} manualMode={props.manualMode} /> : null}
        </div>
      </div>
    </div>
  );
}

/** The pipeline's post-scene steps — REAL backend states, never faked: a ✓
 * appears only when that layer's asset actually exists, a failure shows as a
 * failure, and “queued” vs “generating” reflect the machine state. */
function formatStepElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function GenerationStates({ film, scenes }: { film: Film; scenes: FilmScene[] }) {
  const completed = scenes.filter((s) => s.status === 'completed').length;
  const allDone = scenes.length > 0 && scenes.every((s) => DONE.has(String(s.status)));
  const sceneFailed = scenes.some((s) => s.status === 'failed');
  const audio = film.audio || null;
  const assembling = film.status === 'assembling';
  const finalReady = !!film.final_video_url && film.machine_state === 'FINAL_VIDEO';
  const continuity = scenes.some((s) => s.keyframe_url);
  const audioRunning = film.machine_state === 'AUDIO_PLANNING' || film.machine_state === 'AUDIO_GENERATING';
  const nReady = !!audio && narrationReady(audio);
  const nFailed = !!audio && audio.narration.some((n) => isSpokenSource(n.voice_source) && n.status === 'failed');
  const silentVoice = audio?.voice_source === 'none';
  const mReady = !!audio && musicReady(audio);
  const mFailed = audio?.music?.status === 'failed';
  const sReady = !!audio && sfxReady(audio);
  const sFailed = audio?.sfx_status === 'failed';

  type RowState = 'done' | 'active' | 'failed' | 'todo';
  type Row = { key: string; label: string; state: RowState };
  const layer = (key: string, ready: boolean, failed: boolean, active: boolean, labels: { done: string; failed: string; active: string; todo: string }): Row =>
    ready ? { key, label: labels.done, state: 'done' }
      : failed ? { key, label: labels.failed, state: 'failed' }
        : active ? { key, label: labels.active, state: 'active' }
          : { key, label: labels.todo, state: 'todo' };

  const rows: Row[] = [
    { key: 'script', label: 'Script analyzed', state: film.plan ? 'done' : 'active' },
    { key: 'scenes', label: `Video scenes (${completed}/${scenes.length})`, state: allDone ? 'done' : sceneFailed ? 'failed' : 'active' },
    { key: 'continuity', label: 'Character continuity', state: continuity ? 'done' : 'todo' },
    layer('narration', nReady, nFailed, audioRunning && !nReady, { done: silentVoice ? 'No voiceover' : 'Voiceover ready', failed: 'Voiceover failed', active: 'Recording the voiceover…', todo: audio ? 'Voiceover queued' : 'Voiceover (optional)' }),
    layer('music', mReady, !!mFailed, audioRunning && nReady && !mReady, { done: audio?.music?.status === 'skipped' ? 'Music skipped' : 'Music selected', failed: 'Music failed', active: 'Selecting music…', todo: audio ? 'Music queued' : 'Music' }),
    layer('sfx', sReady, !!sFailed, audioRunning && nReady && mReady && !sReady, { done: audio?.sfx_status === 'skipped' ? 'SFX skipped' : audio?.sfx_status === 'none' ? 'No SFX needed' : 'SFX prepared', failed: 'SFX failed', active: 'Preparing SFX…', todo: audio ? 'SFX queued' : 'SFX' }),
    finalReady
      ? { key: 'assembly', label: 'Final video ready', state: 'done' as const }
      : assembling
        ? { key: 'assembly', label: 'Assembling final video…', state: 'active' as const }
        : { key: 'assembly', label: allDone && !!audio && audioReady(audio) ? 'Ready for Final Assembly' : 'Final assembly', state: 'todo' as const },
  ];

  const timings = useRef<Record<string, { state: RowState; startedAt?: number; elapsedMs?: number }>>({});
  const [nowMs, setNowMs] = useState(Date.now());
  const signature = rows.map((row) => `${row.key}:${row.state}`).join('|');
  useEffect(() => {
    const now = Date.now();
    const reopenedAt = Date.parse(String(film.updated_at || ''));
    const next = { ...timings.current };
    rows.forEach((row) => {
      const previous = next[row.key];
      if (row.state === 'active' && previous?.state !== 'active') {
        next[row.key] = { state: row.state, startedAt: previous ? now : (Number.isFinite(reopenedAt) ? reopenedAt : now) };
      } else if (row.state !== 'active' && previous?.state === 'active' && previous.startedAt) {
        next[row.key] = { state: row.state, elapsedMs: Math.max(0, now - previous.startedAt) };
      } else {
        next[row.key] = { ...previous, state: row.state };
      }
    });
    timings.current = next;
    setNowMs(now);
  }, [film.id, film.updated_at, signature]);
  const hasRunning = rows.some((row) => row.state === 'active');
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning, signature]);

  const statusWord = (state: RowState) => state === 'active' ? 'running' : state === 'todo' ? 'pending' : state;
  const elapsedFor = (row: Row) => {
    const timing = timings.current[row.key];
    if (row.state === 'active' && timing?.startedAt) return formatStepElapsed(nowMs - timing.startedAt);
    if ((row.state === 'done' || row.state === 'failed') && timing?.elapsedMs !== undefined) return formatStepElapsed(timing.elapsedMs);
    return '—';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r) => (
        <div key={r.key} className="s2v-row" style={{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 7, padding: '3px 5px' }}>
          <span style={{ color: r.state === 'done' ? T.done : r.state === 'active' ? T.live : r.state === 'failed' ? T.fault : T.dim, display: 'flex', flexShrink: 0 }}>
            {r.state === 'done' ? <Check size={11} /> : r.state === 'active' ? <VergeLoader size={26} label={r.label} /> : r.state === 'failed' ? <AlertTriangle size={11} /> : <Circle size={10} />}
          </span>
          <span style={{ color: r.state === 'todo' ? T.dim : r.state === 'failed' ? T.fault : T.muted, fontSize: 12, minWidth: 0, flex: 1 }}>{r.label}</span>
          <span style={{ color: r.state === 'failed' ? T.fault : r.state === 'active' ? T.live : T.dim, fontSize: 12, fontFamily: T.mono, textTransform: 'uppercase' }}>{statusWord(r.state)}</span>
          <span style={{ width: 46, textAlign: 'right', color: T.dim, fontSize: 12, fontFamily: T.mono, fontVariantNumeric: 'tabular-nums' }}>{elapsedFor(r)}</span>
        </div>
      ))}
    </div>
  );
}

function WatchSoFar({ scenes }: { scenes: FilmScene[] }) {
  const playable = scenes.filter((scene) => scene.asset_url);
  const [index, setIndex] = useState(0);
  if (!playable.length) return null;
  const active = playable[Math.min(index, playable.length - 1)];
  return <details style={{ marginBottom: 12, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12 }}><summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', color: T.bone, cursor: 'pointer', fontWeight: 800, fontSize: 12.5 }}>Watch so far · {playable.length} shot{playable.length === 1 ? '' : 's'}</summary><ProbedVideo key={active.asset_url} src={active.asset_url!} videoProps={{ controls: true, autoPlay: true, muted: true, playsInline: true, onEnded: () => setIndex((current) => (current + 1) % playable.length), style: { width: '100%', maxHeight: 360, borderRadius: 10, background: 'var(--space-surface-bg)' } }} /><div style={{ color: T.muted, fontSize: 12, marginTop: 7 }}>Playing shot {index + 1} of {playable.length} in order.</div></details>;
}

function MetaRow({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span style={{ color: T.dim, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', width: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.bone, fontSize: 12.5, lineHeight: 1.5, minWidth: 0 }}>{children}</span>
    </div>
  );
}

function ScenePanel(props: {
  scene: FilmScene;
  scenes: FilmScene[];
  film: Film;
  isActive: boolean;
  busy: boolean;
  auto: boolean;
  onGenerate: (scene: FilmScene) => void;
  onPrepare: (scene: FilmScene) => void;
  onRetry: (scene: FilmScene) => void;
  onRetryFrame: (scene: FilmScene) => void;
  onContinueWithoutFrame: (scene: FilmScene) => void;
  onRegenPrompt: (scene: FilmScene) => void;
  onRedo: (scene: FilmScene) => void;
  redoingId: number | null;
  editingId: number | null;
  onOmniEdit: (scene: FilmScene, instruction: string) => void;
  onAcceptRevision: (scene: FilmScene, revisionId: string) => void;
  onUndoRevision: (scene: FilmScene, revisionId: string) => void;
  onSkip: (scene: FilmScene) => void;
  onGenerateCharacterDialogue: (scene: FilmScene) => void;
  dialogueAudioSceneId: number | null;
  onUpdatePlanScene: (scene: FilmScene, patch: Record<string, unknown>) => void;
  onGenerateStoryboard: (scene: FilmScene) => void;
  onApproveStoryboard: (scene: FilmScene) => void;
  onMovePlanScene: (scene: FilmScene, direction: -1 | 1) => void;
  onAddPlanScene: (after: FilmScene) => void;
  onDeletePlanScene: (scene: FilmScene) => void;
  onAudioProbe: (scene: FilmScene, probe: ClipAudioProbe) => void;
  manualMode: boolean;
}) {
  const { scene: s, scenes, film, isActive, busy } = props;
  const meta = statusMeta(s);
  const spec = (s.spec || {}) as VideoClipSpec;
  const requestEvidence = spec.request_evidence || null;
  const sentRefs = requestEvidence?.references_used || [];
  const droppedRefs = requestEvidence?.dropped || [];
  const frameProof = requestEvidence?.frame_chain || null;
  const selectedModel = resolveVideoModel(spec.engine_id || film.video_model);
  const needsNativeSpeech = s.dialogue?.kind === 'character' && Boolean(String(s.dialogue?.line || '').trim());
  const modelAudioMismatch = needsNativeSpeech && !selectedModel.audioSupported;
  const routedEngine = selectedModel.label;
  const selectedCapability = capabilityFor(selectedModel.apiModel);
  const modelReason = String(spec.engine_reason || (selectedCapability
    ? `${selectedCapability.label} · ${selectedCapability.supportedDurations?.length ? selectedCapability.supportedDurations.map((value) => `${value}s`).join('/') : `${selectedCapability.minDurationSec}–${selectedCapability.maxDurationSec}s`} big scenes · ${selectedCapability.maxReferences} reference input${selectedCapability.maxReferences === 1 ? '' : 's'} · ${selectedCapability.continuityMode.replace('-', ' ')} continuity.`
    : `Stable primary model: ${selectedModel.label}.`));
  const durationNotes = Number(s.duration_s || 0) >= Number(selectedModel.minDuration || 1)
    && Number(s.duration_s || 0) <= Number(selectedModel.safeMaxDuration || 1)
    ? []
    : (spec.duration_notes || []);
  const castReady = film.plan?.cast_reviewed === true && (film.character_refs || []).every((character) => character.approved && character.url);
  const working = busy || s.status === 'generating';
  // LightBeam: the ACTIVE scene card carries the amber focus glow.
  const activeGlow = isActive && !DONE.has(String(s.status));
  const [editInstruction, setEditInstruction] = useState('');
  const [editAuthorized, setEditAuthorized] = useState(false);
  const revisions = Array.isArray(s.validation?.revisions) ? s.validation!.revisions! : [];
  const previewRevision = [...revisions].reverse().find((revision) => revision.status === 'preview') || null;
  const acceptedRevision = [...revisions].reverse().find((revision) => revision.status === 'accepted') || null;
  const omniEditSupported = Number(s.duration_s || 0) >= 2;
  const planEditable = !film.plan?.background?.enabled && scenes.every((scene) => scene.status === 'waiting' || scene.status === 'ready');
  const planField = { width: '100%', background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 9px', fontSize: 12, lineHeight: 1.45 } as const;

  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: '20px 20px', marginTop: 8, boxShadow: activeGlow ? '0 0 0 2px var(--vg-accent), 0 0 22px color-mix(in srgb, var(--vg-accent) 18%, transparent)' : 'none', transition: 'box-shadow 0.18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: T.bone, fontSize: 17, fontWeight: 800, letterSpacing: 0.5, fontFamily: T.mono }}>
          SCENE {String(s.idx + 1).padStart(2, '0')} <span style={{ color: T.live }}>· {sceneSeconds(film, s)}s</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: meta.color, fontSize: 12, fontWeight: 700, border: `1px solid ${meta.color}`, borderRadius: 999, padding: '2px 10px' }}>{meta.icon} {meta.word}</span>
      </div>

      {/* An empty segment used to render as a pair of bare quote marks. */}
      <div style={{ color: T.muted, fontSize: 12.5, lineHeight: 1.55, fontStyle: 'italic', marginTop: 12 }}>
        {String(s.script_segment || '').trim()
          ? `“${String(s.script_segment).slice(0, 320)}${String(s.script_segment).length > 320 ? '…' : ''}”`
          : 'This clip carries no spoken line — it is a visual beat the director wrote from the surrounding story.'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <MetaRow label="Duration">{Math.round(Number(s.duration_s) || 6)}s</MetaRow>
        {spec.shot_intent ? <MetaRow label="Intent">{spec.shot_intent.replace(/_/g, ' ')}</MetaRow> : null}
        {routedEngine ? <MetaRow label="Engine">{routedEngine}</MetaRow> : null}
        {s.validation?.actual_model ? <MetaRow label="Actual model"><span style={{ fontFamily: T.mono }}>{String(s.validation.actual_model)}</span></MetaRow> : null}
        <MetaRow label="Routing">{modelReason}</MetaRow>
        <MetaRow label="Frame chain">
          {!frameProof ? <span style={{ color: T.dim }}>Not submitted yet — no request proof</span>
            : frameProof.status === 'first_scene' ? <span>First scene — none</span>
              : frameProof.status === 'continued_without' ? <span style={{ color: T.fault }}>Creator chose Continue without continuity frame</span>
                : <span style={{ color: T.done, display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><Check size={12} />Scene {Number(frameProof.source_scene_index || 0) + 1} · {frameProof.method || 'validated extractor'} · {typeof frameProof.at_second === 'number' ? `${frameProof.at_second.toFixed(2)}s` : 'saved offset'}{frameProof.url ? <img src={frameProof.url} alt={`Scene ${Number(frameProof.source_scene_index || 0) + 1} continuity frame`} style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 5, border: `1px solid ${T.dim}` }} /> : null}</span>}
        </MetaRow>
        <MetaRow label="References used">{referenceLabel(s)} · {sentRefs.length} image{sentRefs.length === 1 ? '' : 's'} actually sent</MetaRow>
        {spec.reasoning ? <MetaRow label="Why prompt">{String(spec.reasoning)}</MetaRow> : null}
        {spec.timed_beats?.length ? <details open style={{ background: T.raised, border: `1px solid ${T.line}`, borderRadius: 9, padding: '8px 10px' }}><summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', color: T.bone, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Timecoded beats · one generation</summary><div style={{ display: 'grid', gap: 8 }}>{spec.timed_beats.map((beat, index) => <label key={index} style={{ display: 'grid', gridTemplateColumns: '68px minmax(0,1fr)', gap: 8, alignItems: 'start', color: T.live, fontFamily: T.mono, fontSize: 12 }}><span style={{ paddingTop: 9 }}>{beat.start_s}–{beat.end_s}s</span><textarea defaultValue={[beat.action, beat.camera ? `Camera: ${beat.camera}` : '', beat.dialogue ? `Dialogue: ${beat.dialogue}` : ''].filter(Boolean).join('\n')} rows={3} disabled={!planEditable} onBlur={(event) => { if (!planEditable) return; const next = spec.timed_beats!.map((item, beatIndex) => beatIndex === index ? { ...item, action: event.target.value } : item); props.onUpdatePlanScene(s, { timed_beats: next }); }} style={{ width: '100%', minWidth: 0, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 9px', fontFamily: T.sans, fontSize: 12, lineHeight: 1.45, resize: 'vertical' }} /></label>)}</div></details> : null}
      </div>
      {modelAudioMismatch ? <div style={{ color: T.fault, fontSize: 12, lineHeight: 1.55, marginTop: 10, background: 'var(--vg-danger-bg)', border: `1px solid ${T.fault}`, borderRadius: 8, padding: '8px 10px' }}><AlertTriangle size={11} style={{ display: 'inline', marginRight: 5 }} />{selectedModel.label} is silent on this adapter, but this scene requires visible character speech. Choose Seedance 2.5, or Gemini Omni for ≤8s.</div> : null}
      {durationNotes.length ? (
        <div style={{ color: T.fault, fontSize: 12, lineHeight: 1.55, marginTop: 10 }}> 
          {durationNotes.map((durationNote, index) => <div key={index}><AlertTriangle size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: '-1px' }} />{durationNote}</div>)}
        </div>
      ) : null}

      {planEditable && props.manualMode ? (
        <details style={{ marginTop: 14, background: T.raised, border: `1px solid ${T.live}`, borderRadius: 11, padding: '12px 13px' }}>
          <summary style={{ cursor: 'pointer', color: T.bone, fontSize: 12.5, fontWeight: 800 }}>Edit block before approval</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 9, marginTop: 11 }}>
            <label style={{ color: T.dim, fontSize: 12 }}>Scene objective / source coverage<textarea key={`${s.id}-script-${s.script_segment}`} defaultValue={s.script_segment || ''} rows={3} onBlur={(event) => { if (event.target.value !== s.script_segment) props.onUpdatePlanScene(s, { script_segment: event.target.value }); }} style={{ ...planField, display: 'block', marginTop: 4, resize: 'vertical' }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Exact dialogue / VO<textarea key={`${s.id}-dialogue-${s.dialogue?.line || ''}`} defaultValue={s.dialogue?.line || ''} rows={3} onBlur={(event) => { if (event.target.value !== (s.dialogue?.line || '')) props.onUpdatePlanScene(s, { dialogue_line: event.target.value }); }} style={{ ...planField, display: 'block', marginTop: 4, resize: 'vertical' }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Visual objective<textarea key={`${s.id}-visual-${String(spec.visual_goal || '')}`} defaultValue={String(spec.visual_goal || '')} rows={3} onBlur={(event) => props.onUpdatePlanScene(s, { visual_goal: event.target.value })} style={{ ...planField, display: 'block', marginTop: 4, resize: 'vertical' }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Camera<input defaultValue={String((spec as any).camera || '')} onBlur={(event) => props.onUpdatePlanScene(s, { camera: event.target.value })} style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Characters<input defaultValue={(spec.characters || []).join(', ')} onBlur={(event) => props.onUpdatePlanScene(s, { summary: spec.summary || '', characters: event.target.value })} placeholder="Approved cast ids" style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Environment<input defaultValue={String((spec as any).environment || '')} onBlur={(event) => props.onUpdatePlanScene(s, { environment: event.target.value })} style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Sound<input defaultValue={String((spec as any).sound || '')} onBlur={(event) => props.onUpdatePlanScene(s, { sound: event.target.value })} style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Continuity notes<input defaultValue={String((spec as any).continuity_notes || '')} onBlur={(event) => props.onUpdatePlanScene(s, { continuity_notes: event.target.value })} style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Product / brand reference URL<input defaultValue={String((spec as any).product_reference_url || '')} onBlur={(event) => props.onUpdatePlanScene(s, { reference_url: event.target.value })} placeholder="https://…" style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Duration (seconds)<input type="number" min={Math.max(4, Number(selectedModel.minDuration || 4))} max={30} defaultValue={Math.round(Number(s.duration_s) || 8)} onBlur={(event) => props.onUpdatePlanScene(s, { duration_s: Number(event.target.value) })} style={{ ...planField, display: 'block', marginTop: 4 }} /></label>
            <label style={{ color: T.dim, fontSize: 12 }}>Scene model<select value={modelAudioMismatch ? '' : selectedModel.id} onChange={(event) => props.onUpdatePlanScene(s, { engine_id: event.target.value, engine_reason: `Creator-approved assignment: ${event.target.options[event.target.selectedIndex]?.text || event.target.value}.` })} style={{ ...planField, display: 'block', marginTop: 4 }}>{modelAudioMismatch ? <option value="" disabled>Choose a model with native audio</option> : null}{pickerModels(needsNativeSpeech).map((m) => <option key={m.id} value={m.id} disabled={m.id === 'omni-1.1-flash' && Number(s.duration_s || 0) > 8}>{SCENE_MODEL_LABELS[m.id] || m.label}</option>)}</select></label>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
            <button disabled={s.idx === 0} onClick={() => props.onMovePlanScene(s, -1)} style={{ background: 'transparent', color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>↑ Move earlier</button>
            <button disabled={s.idx === scenes.length - 1} onClick={() => props.onMovePlanScene(s, 1)} style={{ background: 'transparent', color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}>↓ Move later</button>
            <button onClick={() => props.onAddPlanScene(s)} style={{ background: 'transparent', color: T.live, border: `1px solid ${T.live}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}><Plus size={11} style={{ display: 'inline', marginRight: 4 }} />Add after</button>
            <button onClick={() => { if (window.confirm(`Delete scene ${s.idx + 1} from the unapproved plan? No paid generation has started.`)) props.onDeletePlanScene(s); }} style={{ background: 'transparent', color: T.fault, border: `1px solid ${T.fault}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}><Trash2 size={11} style={{ display: 'inline', marginRight: 4 }} />Delete</button>
            <button onClick={() => props.onRegenPrompt(s)} style={{ background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}><Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />Regenerate plan prompt</button>
            <button onClick={() => props.onGenerateStoryboard(s)} style={{ background: 'transparent', color: T.live, border: `1px solid ${T.live}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer' }}><Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />{(spec as any).storyboard_url ? 'Regenerate storyboard' : 'Generate storyboard preview'}</button>
          </div>
        </details>
      ) : null}

      <div style={{ marginTop: 10, color: T.muted, fontSize: 12 }}><b style={{ color: T.bone }}>Block type:</b> {spec.cut_type === 'continuous' ? 'Continues — previous final frame is sent' : 'New shot — starts from its storyboard and cast sheets'}</div>
      {spec.prompt_source === 'plan' ? <div role="status" style={{ marginTop: 6, color: 'var(--vg-warning)', fontSize: 12 }}>Prompt built from the approved plan after the writer could not answer. Review it before Start.</div> : null}
      {spec.speech_warning ? <div role="status" style={{ marginTop: 8, color: 'var(--vg-warning)', background: 'var(--vg-warning-bg)', border: '1px solid var(--vg-warning)', borderRadius: 10, padding: '9px 11px', fontSize: 12, lineHeight: 1.5 }}><b>Speech timing:</b> {spec.speech_warning}</div> : null}
      {props.manualMode && sentRefs.length ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }} aria-label="References actually sent in provider order">
          {sentRefs.map((r, i) => (
            <div key={`${r.url}-${i}`} style={{ textAlign: 'center', width: 96 }}>
              <div style={{ color: T.live, fontFamily: T.mono, fontSize: 12, marginBottom: 3 }}>#{i + 1}</div>
              <img src={r.url} alt={proofRole(r)} style={{ width: 84, height: 56, objectFit: 'cover', borderRadius: 7, border: `1px solid ${T.dim}` }} />
              <div style={{ color: T.dim, fontSize: 12, marginTop: 3, lineHeight: 1.35 }}>{proofRole(r)}</div>
            </div>
          ))}
        </div>
      ) : null}
      {droppedRefs.length ? <div style={{ marginTop: 8, color: T.muted, fontSize: 12, lineHeight: 1.45 }}><b style={{ color: T.bone }}>Dropped by {selectedModel.label} cap:</b> {droppedRefs.map((item) => `${proofRole(item)} — ${item.dropReason}`).join('; ')}</div> : null}

      {s.prompt && props.manualMode ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: T.dim, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Shot prompt as sent · Edit prompt before re-render</div>
          <textarea defaultValue={s.prompt} disabled={!planEditable} onBlur={(event) => { if (planEditable && event.target.value !== s.prompt) props.onUpdatePlanScene(s, { prompt: event.target.value }); }} rows={9} style={{ width: '100%', minWidth: 0, background: 'var(--space-surface-bg)', border: `1px solid ${T.dim}`, borderRadius: 9, padding: '12px 14px', color: T.bone, fontSize: 12, lineHeight: 1.65, fontFamily: T.mono, resize: 'vertical' }} />
        </div>
      ) : s.status === 'waiting' ? <div style={{ color: T.dim, fontSize: 12.5, marginTop: 14 }}>The block prompt is prepared in your signed-in browser before Start.</div> : null}
      {props.manualMode && requestEvidence?.request_body ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ color: T.live, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Provider evidence · token removed</summary>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: T.canvas, color: T.muted, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 1.5 }}>{JSON.stringify({ outputVideoUrl: s.asset_url || null, prompt: requestEvidence.prompt || s.prompt, requestBody: requestEvidence.request_body, referencesSent: sentRefs.map((item) => ({ label: item.label || proofRole(item), type: item.type, url: item.url })) }, null, 2)}</pre>
        </details>
      ) : null}

      {/* Skeleton shimmer while the clip renders (pure CSS keyframes). */}
      {s.status === 'generating' ? (
        <VideoGeneratingState
          label={`Rendering scene ${s.idx + 1} of ${scenes.length}`}
          detail={film.machine_state === 'EXTRACTING_FINAL_FRAME' ? (film.stage_note || 'Extracting and validating the final continuity frame…') : `${sceneSeconds(film, s)}s clip · ${routedEngine || 'selected engine'} · ${referenceLabel(s)}`}
          style={{ marginTop: 14, maxWidth: 520 }}
        />
      ) : null}

      {s.status === 'needs_action' && spec.background?.frame_extraction?.status === 'failed' ? (
        <div role="alert" style={{ marginTop: 14, background: 'var(--vg-danger-bg)', border: `1px solid ${T.fault}`, borderRadius: 10, padding: '12px 13px' }}>
          <div style={{ color: T.fault, fontSize: 12.5, fontWeight: 800 }}>Continuity frame unavailable</div>
          <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{friendlyErrorMessage(s.error || spec.background.frame_extraction.error)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="s2v-lift" disabled={working} onClick={() => props.onRetryFrame(s)} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 800 }}><RefreshCw size={12} /> Retry frame</button>
            <button className="s2v-ghost" disabled={working} onClick={() => { if (window.confirm('Continue without a continuity frame? The next scene will not inherit this scene’s final visual state, and this choice will be recorded.')) props.onContinueWithoutFrame(s); }} style={{ minHeight: 44, background: 'transparent', color: T.fault, border: `1px solid ${T.fault}`, borderRadius: 9, padding: '9px 14px', fontSize: 12 }}>Continue without continuity frame</button>
          </div>
        </div>
      ) : null}

      {s.status === 'failed' && s.error ? (() => {
        const recovery = recoveryDecision(s.error, Number(spec.background?.retries || 0) + 1, false);
        const canSwitchModel = recovery.category === 'provider-outage' || recovery.category === 'rate-limit';
        const canSwitchOmni = classifyError(s.error).canSwitchToOmni && selectedModel.id !== OMNI_MODEL_ID && Number(s.duration_s) <= 8;
        const switchTarget = selectedModel.id === 'seedance-2.5' ? 'kling-3.0-omni' : 'seedance-2.5';
        const switchLabel = switchTarget === 'seedance-2.5' ? 'Seedance 2.5' : 'Kling 3.0 Omni';
        return <div role="alert" style={{ marginTop: 14, background: 'var(--vg-danger-bg)', border: `1px solid ${T.fault}`, borderRadius: 10, padding: '12px 13px' }}>
          <div style={{ color: T.bone, fontSize: 13, fontWeight: 850 }}>Scene {s.idx + 1} needs a retry</div>
          <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{customerError(s.error).replace(/[.\s]+$/, '')}. Credits returned.</div>
          <div style={{ color: T.live, fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>Recommended next step: {recovery.customerMessage}</div>
          {canSwitchOmni ? <button type="button" disabled={Boolean(film.plan?.background?.enabled)} onClick={() => props.onUpdatePlanScene(s, { engine_id: OMNI_MODEL_ID, engine_reason: `Creator switched to ${OMNI_LABEL} so this scene can generate in the background.` })} style={{ minHeight: 44, marginTop: 9, marginRight: 8, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 800 }}>Switch to Omni</button> : null}
          {canSwitchModel ? <button type="button" disabled={Boolean(film.plan?.background?.enabled)} onClick={() => props.onUpdatePlanScene(s, { engine_id: switchTarget, engine_reason: `Creator selected ${switchLabel} for the next retry after ${selectedModel.label} failed with ${recovery.category}.` })} style={{ minHeight: 44, marginTop: 9, background: 'transparent', color: T.live, border: `1px solid ${T.live}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 750 }}>Switch to {switchLabel} for retry</button> : null}
          <details style={{ marginTop: 8 }}><summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', color: T.dim, fontSize: 12 }}>Technical details</summary><div style={{ color: T.muted, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}>Category: {recovery.category}<br />Model: {selectedModel.apiModel}</div></details>
        </div>;
      })() : null}

      {/* Completed clip playback + final frame */}
      {s.status === 'completed' && s.asset_url ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <ProbedVideo
            key={s.asset_url}
            src={s.asset_url}
            modelId={String(s.validation?.actual_model || spec.background?.actual_model || spec.engine_id || film.video_model || '')}
            audioEnabled={film.plan?.audio_enabled !== false}
            videoProps={{ controls: true, preload: 'metadata', style: { width: '100%', maxWidth: film.aspect_ratio === '9:16' ? 200 : 380, maxHeight: 300, borderRadius: 10, background: 'var(--space-surface-bg)', border: '1px solid var(--vg-border)' } }}
            onProbe={(probe) => props.onAudioProbe(s, probe)}
            onRetrySilent={() => props.onRetry(s)}
            onGenerateCharacterDialogue={modelAudioMismatch && !s.narration?.audioUrl ? () => props.onGenerateCharacterDialogue(s) : undefined}
            dialogueBusy={props.dialogueAudioSceneId === s.id || working}
          />
          {s.keyframe_url ? (
            <div>
              <img src={s.keyframe_url} alt="" style={{ width: film.aspect_ratio === '9:16' ? 110 : 190, borderRadius: 8, border: `1px solid ${T.dim}`, display: 'block' }} />
              <div style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>Extracted final frame (continuity)</div>
            </div>
          ) : null}
        </div>
      ) : null}
      {s.status === 'completed' && s.narration?.audioUrl && s.dialogue?.kind === 'character' ? (
        <div style={{ color: T.done, fontSize: 12, marginTop: 8 }}><Check size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 5 }} />Character voice fallback ready — Final Assembly will mix this line into this scene only.</div>
      ) : null}
      {s.status === 'completed' && s.validation && s.validation.pass === false && !isDeferredTextIssue(s.validation.issues) ? (
        <div style={{ color: T.fault, fontSize: 12, marginTop: 10 }}><AlertTriangle size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: '-1px' }} />Director flag: {s.validation.issues || 'does not match the segment'} — use “New prompt” below to redo it.</div>
      ) : null}

      {s.status === 'completed' && s.asset_url && !film.plan?.background?.enabled ? (
        <div style={{ marginTop: 16, background: T.canvas, border: `1px solid ${T.dim}`, borderRadius: 11, padding: '13px 14px' }}>
          <div style={{ color: T.bone, fontSize: 12.5, fontWeight: 750 }}>Targeted Edit · Google Omni 1.1 Flash</div>
          <div style={{ color: T.dim, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
            Billable AI Edit uses the separate Gemini Omni 1.1 Flash existing-video operation. Its verified window is up to 8s. For this {Math.round(Number(s.duration_s || 0))}s source, the app edits <b style={{ color: T.bone }}>00:00–00:{String(Math.min(8, Math.round(Number(s.duration_s || 0)))).padStart(2, '0')}</b>, preserves the untouched remainder, then splices both parts into a new non-destructive version. Scene {s.idx + 1}'s immutable original and every other scene stay unchanged. Generate a revision, compare it, then Accept or Undo.
          </div>
          {omniEditSupported ? (
            <div style={{ marginTop: 10 }}>
              <textarea value={editInstruction} onChange={(e) => { setEditInstruction(e.target.value); setEditAuthorized(false); }} rows={2} placeholder="Describe the desired result for this selected shot. Keep the request short and state what must remain unchanged." style={{ width: '100%', minWidth: 0, background: T.raised, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '9px 10px', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 9, color: T.muted, fontSize: 12, lineHeight: 1.45 }}>
                <input type="checkbox" checked={editAuthorized} onChange={(event) => setEditAuthorized(event.target.checked)} />
                <span><b style={{ color: T.bone }}>Paid edit authorization:</b> planning reserve up to $0.40 for Scene {s.idx + 1} only; the provider quote/receipt is authoritative. No other scene is regenerated.</span>
              </label>
              <button className="s2v-lift" disabled={props.editingId != null || !editInstruction.trim() || !editAuthorized} onClick={() => { props.onOmniEdit(s, editInstruction.trim()); setEditAuthorized(false); }} style={{ minHeight: 42, marginTop: 9, background: props.editingId === s.id ? T.raised : T.live, color: props.editingId === s.id ? T.dim : 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 750, cursor: props.editingId != null || !editInstruction.trim() || !editAuthorized ? 'default' : 'pointer' }}>
                {props.editingId === s.id ? 'Editing source video…' : 'Approve cost & create edit revision'}
              </button>
            </div>
          ) : null}
          {previewRevision ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: T.muted, fontSize: 12, marginBottom: 7 }}>Compare revision · {previewRevision.instruction}</div>
              <div style={{ color: T.dim, fontSize: 12, lineHeight: 1.45, marginBottom: 7 }}>{(previewRevision as any).edited_window_s ? `Edited first ${(previewRevision as any).edited_window_s}s · preserved ${(previewRevision as any).preserved_remainder_s || 0}s untouched. ${(previewRevision as any).boundary_evidence || ''}` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 9 }}>
                <div><div style={{ color: T.dim, fontSize: 12, marginBottom: 4 }}>BEFORE · immutable original</div><ProbedVideo src={previewRevision.before_url} modelId={String(spec.engine_id || film.video_model || '')} audioEnabled={film.plan?.audio_enabled !== false} videoProps={{ controls: true, preload: 'metadata', style: { width: '100%', borderRadius: 8, background: 'var(--space-surface-bg)' } }} /></div>
                <div><div style={{ color: T.live, fontSize: 12, marginBottom: 4 }}>AFTER · {previewRevision.model}</div><ProbedVideo src={previewRevision.after_url} modelId={previewRevision.model} audioEnabled={film.plan?.audio_enabled !== false} videoProps={{ controls: true, preload: 'metadata', style: { width: '100%', borderRadius: 8, background: 'var(--space-surface-bg)' } }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                <button className="s2v-lift" disabled={working} onClick={() => props.onAcceptRevision(s, previewRevision.id)} style={{ background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 750, cursor: 'pointer' }}><Check size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Accept revision</button>
                <button className="s2v-ghost" disabled={working} onClick={() => props.onUndoRevision(s, previewRevision.id)} style={{ background: 'transparent', color: T.muted, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 13px', fontSize: 12, cursor: 'pointer' }}>Keep original</button>
              </div>
            </div>
          ) : acceptedRevision ? (
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ color: T.done, fontSize: 12 }}><Check size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Accepted Omni revision · outgoing continuity frame needs review</span>
              <button className="s2v-ghost" disabled={working} onClick={() => props.onUndoRevision(s, acceptedRevision.id)} style={{ background: 'transparent', color: T.muted, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>Undo to original</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* —— Actions —— */}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {s.status === 'ready' && s.prompt ? (
          <button
            className="s2v-lift"
            disabled={working || !castReady}
            title={castReady ? 'Generate this approved block.' : 'Approve the cast before generating any block.'}
            onClick={() => props.onGenerate(s)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: working ? T.raised : T.live, color: working ? T.dim : 'var(--space-text-on-primary)', border: 'none', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 700, cursor: working ? 'default' : 'pointer', boxShadow: working ? 'none' : '0 2px 12px color-mix(in srgb, var(--space-brand-primary-500) 25%, transparent)' }}
          >
            <Play size={15} /> Generate Video
          </button>
        ) : null}
        {s.status === 'waiting' && isActive ? (
          <button className="s2v-ghost" disabled={working || !castReady} title={castReady ? 'Prepare this block.' : 'Approve the cast before preparing block prompts.'} onClick={() => props.onPrepare(s)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: T.canvas, border: `1px solid ${T.dim}`, color: T.bone, borderRadius: 9, padding: '10px 18px', fontSize: 13, cursor: 'pointer' }}>
            <Wand2 size={13} /> Prepare this scene
          </button>
        ) : null}
        {s.status === 'failed' && !isDeferredTextIssue(s.validation?.issues) ? (
          <>
            <button className="s2v-lift" disabled={working} onClick={() => props.onRetry(s)} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 7, background: T.live, color: 'var(--space-text-on-primary)', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <RefreshCw size={13} /> Rewrite and retry
            </button>
            <button className="s2v-ghost" disabled={working} onClick={() => props.onRegenPrompt(s)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: `1px solid ${T.dim}`, color: T.bone, borderRadius: 9, padding: '10px 16px', fontSize: 12.5, cursor: 'pointer' }}>
              <Sparkles size={13} /> Edit prompt
            </button>
            <button className="s2v-ghost" disabled={working} onClick={() => { if (window.confirm(`Skip scene ${s.idx + 1}? The following scene will continue without a frame from this skipped scene, and that choice will be recorded.`)) props.onSkip(s); }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', color: T.muted, borderRadius: 9, padding: '10px 12px', fontSize: 12.5, cursor: 'pointer' }}>
              <SkipForward size={13} /> Skip scene
            </button>
          </>
        ) : null}
        {s.status === 'ready' && s.prompt && !working ? (
          <button className="s2v-ghost" onClick={() => props.onRegenPrompt(s)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: `1px solid ${T.dim}`, color: T.muted, borderRadius: 9, padding: '10px 16px', fontSize: 12.5, cursor: 'pointer' }}>
            <Sparkles size={13} /> New prompt
          </button>
        ) : null}
        {s.status === 'completed' && props.redoingId === s.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: T.live, fontSize: 12.5, fontWeight: 600, padding: '10px 4px' }}>
            <VergeLoader size={34} label="Redoing this scene" /> Redoing — the director is writing a fresh prompt, then the clip re-renders. Other scenes are untouched.
          </div>
        ) : s.status === 'completed' && !working && !isDeferredTextIssue(s.validation?.issues) ? (
          <button className="s2v-ghost" disabled={props.redoingId != null} onClick={() => props.onRedo(s)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: `1px solid ${T.dim}`, color: T.muted, borderRadius: 9, padding: '9px 15px', fontSize: 12, cursor: props.redoingId != null ? 'default' : 'pointer', opacity: props.redoingId != null ? 0.5 : 1 }} title="The creative planner writes a fresh prompt and the clip re-renders in place. Other scenes are untouched.">
            <RefreshCw size={12} /> Redo this scene
          </button>
        ) : null}
      </div>

      {s.status === 'ready' && s.prompt ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: props.auto ? T.live : T.dim, fontSize: 12, marginTop: 12 }}>
          {props.auto ? <Zap size={11} /> : <ArrowRight size={11} />}
          {props.auto
            ? 'Auto-generate is on — this clip starts rendering by itself, then the next prompt is prepared.'
            : 'Generation starts only when you click — prompt preparation and rendering are separate steps.'}
        </div>
      ) : null}
    </div>
  );
}
