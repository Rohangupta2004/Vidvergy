/**
 * Final screen — FINISH = ASSEMBLY ONLY.
 *
 * The verified scene clips are joined in order with the chosen audio mix and,
 * when ticked, burned captions. Nothing on this screen generates or regenerates
 * video: a missing clip is reported with its scene and a way back to the scene
 * board. Narration (only when the creator chose it), music and SFX that already
 * exist are reused, so Retry assembly never pays for them twice.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Captions, Check, Circle, Download, Layers,
  Plus, RefreshCw, Square, Trash2, Type,
} from 'lucide-react';
import { db, Film, FilmScene, OnScreenTextItem, T, VoiceSourceId } from './api';
import { VoiceOption, listVoices } from './pipeline/finish';
import { isSpokenSource } from './pipeline/audio';
import { openAiVoiceLabel } from './pipeline/voiceSource';
import { AssemblyProgress, sceneTargetDuration } from './pipeline/orchestrator';
import type { FinishOptions } from './pipeline/orchestrator';
import AudioCards from './AudioCards';
import { AudioUiStyles } from './audioUi';
import VergeLoader from '../../components/VergeLoader';
import ProbedVideo from './ClipAudioStatus';
import { friendlyErrorMessage } from './friendlyErrors';
import { CAPTION_NOTES, PICKER_HELP, TRANSITION_NOTES } from './optionPreviews';

type CaptionStyleId = 'bold-pop' | 'clean' | 'karaoke';
const CAPTION_STYLES: [CaptionStyleId, string][] = [['bold-pop', 'Bold pop'], ['clean', 'Clean'], ['karaoke', 'Karaoke']];
/** Music slider 100% = this gain (the mixer's ceiling). */
const MUSIC_GAIN_MAX = 0.6;
/** No progress for this long while assembling = offer Stop and retry. */
const ASSEMBLY_QUIET_MS = 4 * 60_000;
/** A server-run assembly untouched for this long is treated as stuck. */
const SERVER_ASSEMBLY_STALE_MS = 10 * 60_000;

const FINISH_CSS = `
.s2v-fin { flex: 1; overflow-y: auto; padding: 22px 24px 36px; }
.s2v-fin-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 16px; }
.s2v-fin-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 750; cursor: pointer; text-decoration: none; background: ${T.raised}; color: ${T.bone}; border: 1px solid ${T.dim}; }
.s2v-fin-btn.is-primary { background: var(--vg-gradient-action, var(--vg-btn)); color: var(--vg-on-btn); border: none; }
.s2v-fin-btn:disabled { opacity: .55; cursor: not-allowed; }
.s2v-fin-btn:not(:disabled):hover { filter: brightness(1.08); }
.s2v-fin-btn:focus-visible, .s2v-fin-chip:focus-visible, .s2v-fin input:focus-visible { outline: 2px solid var(--vg-focus, ${T.live}); outline-offset: 2px; }
.s2v-fin-chip { min-height: 40px; border-radius: 999px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer; border: 1px solid ${T.dim}; background: ${T.canvas}; color: ${T.bone}; }
.s2v-fin-chip[aria-checked="true"] { background: ${T.live}; border-color: ${T.live}; color: var(--vg-on-btn); }
.s2v-fin-chip:disabled { opacity: .5; cursor: not-allowed; }
.s2v-fin-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
@media (max-width: 640px) {
  .s2v-fin { padding: 14px 12px 28px; }
  .s2v-fin-actions > .s2v-fin-btn { flex: 1 1 100%; }
}
`;

function StateDot({ state }: { state: 'done' | 'active' | 'failed' | 'todo' }) {
  const color = state === 'done' ? T.done : state === 'active' ? T.live : state === 'failed' ? T.fault : T.dim;
  return (
    <span style={{ color, display: 'inline-flex', flexShrink: 0, width: 16, justifyContent: 'center' }}>
      {state === 'done' ? <Check size={13} /> : state === 'active' ? <VergeLoader size={22} label="In progress" /> : state === 'failed' ? <AlertTriangle size={13} /> : <Circle size={11} />}
    </span>
  );
}

function Section(props: { icon: any; title: string; hint?: string; children: any }) {
  return (
    <section style={{ marginTop: 14, background: T.raised, border: `1px solid ${T.dim}`, borderRadius: 14, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: T.live, display: 'flex' }}>{props.icon}</span>
        <div style={{ color: T.bone, fontSize: 13.5, fontWeight: 700 }}>{props.title}</div>
        {props.hint ? <div style={{ color: T.dim, fontSize: 12 }}>{props.hint}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Staged assembly progress — every row is a real step reported by the engine
// ---------------------------------------------------------------------------

function AssemblyProgressCard(props: { progress: AssemblyProgress; quiet: boolean; elapsedS: number; onStop?: () => void }) {
  const { progress } = props;
  const failed = progress.steps.some((step) => step.status === 'failed');
  return (
    <section role="status" aria-live="polite" style={{ marginTop: 14, background: T.raised, border: `1px solid ${failed ? T.fault : T.dim}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: failed ? T.fault : T.bone, fontSize: 13.5, fontWeight: 750 }}>
          {failed ? 'Assembly stopped' : progress.running ? 'Assembling your film' : 'Assembly finished'}
        </div>
        {progress.running ? <div style={{ color: T.muted, fontSize: 12, fontFamily: T.mono }}>{progress.percent}% · {formatDuration(props.elapsedS)}</div> : null}
        {progress.running && props.onStop ? (
          <button type="button" className="s2v-fin-btn" style={{ marginLeft: 'auto', minHeight: 36, padding: '6px 12px', fontSize: 12 }} onClick={props.onStop} title="Stops after the active step. Saved clips and audio are reused on Retry.">
            <Square size={11} fill="currentColor" /> Stop
          </button>
        ) : null}
      </div>
      {progress.running ? (
        <div aria-hidden style={{ marginTop: 10, height: 4, borderRadius: 4, background: 'var(--space-surface-bg)', overflow: 'hidden' }}>
          <div style={{ width: `${progress.percent}%`, height: '100%', background: T.live }} />
        </div>
      ) : null}
      <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
        {progress.steps.map((step) => (
          <li key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
            <StateDot state={step.status === 'done' ? 'done' : step.status === 'active' ? 'active' : step.status === 'failed' ? 'failed' : 'todo'} />
            <span style={{ color: step.status === 'pending' ? T.dim : T.bone, fontSize: 12.5, fontWeight: step.status === 'active' ? 750 : 600 }}>{step.label}</span>
            {step.detail ? <span style={{ color: step.status === 'failed' ? T.fault : T.muted, fontSize: 12, minWidth: 0 }}>— {step.detail}</span> : null}
          </li>
        ))}
      </ol>
      {props.quiet ? (
        <div style={{ marginTop: 10, color: T.live, fontSize: 12, lineHeight: 1.5 }}>
          This step has shown no progress for a few minutes. Press Stop, then Retry assembly — your clips and audio are already saved.
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// On-screen text (burned in post-production)
// ---------------------------------------------------------------------------

function OnScreenTextPanel(props: { film: Film; scenes: FilmScene[]; busy: boolean; onChanged: () => void }) {
  const total = props.scenes.reduce((sum, scene) => sum + Math.max(0.25, Number(scene.duration_s) || 0), 0);
  const [items, setItems] = useState<OnScreenTextItem[]>(() => [...(props.film.plan?.on_screen_text || [])]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  useEffect(() => { setItems([...(props.film.plan?.on_screen_text || [])]); setState('idle'); setMessage(''); }, [props.film.id]);
  const patch = (index: number, next: Partial<OnScreenTextItem>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item));
    setState('idle'); setMessage('');
  };
  const save = async () => {
    if (!props.film.plan || props.busy || state === 'saving') return;
    const normalized = items.map((item) => ({
      ...item,
      text: item.text.trim(),
      start_s: Math.max(0, Math.min(total, Number(item.start_s) || 0)),
      end_s: Math.max(0, Math.min(total, Number(item.end_s) || 0)),
    })).filter((item) => item.text && item.end_s > item.start_s);
    setState('saving'); setMessage('');
    try {
      const plan = { ...props.film.plan, on_screen_text: normalized, editor_composition_version: Number(props.film.plan.editor_composition_version || 0) + 1 };
      const stageNote = normalized.length ? 'On-screen text saved. Final Assembly will burn and verify it.' : 'On-screen text removed. Final Assembly will rebuild the clean cut.';
      await db.updateFilm(props.film.id, { plan, final_video_url: null, final_thumb_url: null, status: 'producing', machine_state: 'AUDIO_READY', stage_note: stageNote, error: null });
      Object.assign(props.film, { plan, final_video_url: null, final_thumb_url: null, status: 'producing', machine_state: 'AUDIO_READY', stage_note: stageNote, error: null });
      setItems(normalized); setState('saved'); setMessage('Saved — the film is re-assembled with the new text layer.'); props.onChanged();
    } catch (error: any) {
      setState('error'); setMessage(String(error?.message || 'The text layer could not be saved.'));
    }
  };
  const field = { width: '100%', marginTop: 4, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: 7, minHeight: 36 } as const;
  return (
    <Section icon={<Type size={15} />} title="On-screen text" hint="burned into the final cut">
      {items.length ? <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item, index) => (
          <div key={item.id} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, background: T.card, border: `1px solid ${T.line}` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input aria-label={`On-screen text ${index + 1}`} value={item.text} onChange={(event) => patch(index, { text: event.target.value })} style={{ flex: 1, minWidth: 0, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, minHeight: 36 }} />
              <button type="button" className="s2v-fin-btn" aria-label={`Remove on-screen text ${index + 1}`} onClick={() => { setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); setState('idle'); }} style={{ minHeight: 36, padding: 8 }}><Trash2 size={12} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <label style={{ color: T.dim, fontSize: 12 }}>Start (s)<input type="number" min={0} max={total} step="0.1" value={item.start_s} onChange={(event) => patch(index, { start_s: Number(event.target.value) })} style={field} /></label>
              <label style={{ color: T.dim, fontSize: 12 }}>End (s)<input type="number" min={0} max={total} step="0.1" value={item.end_s} onChange={(event) => patch(index, { end_s: Number(event.target.value) })} style={field} /></label>
              <label style={{ color: T.dim, fontSize: 12 }}>Position<select value={item.position} onChange={(event) => patch(index, { position: event.target.value as OnScreenTextItem['position'] })} style={field}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
              <label style={{ color: T.dim, fontSize: 12 }}>Style<select value={item.style} onChange={(event) => patch(index, { style: event.target.value as OnScreenTextItem['style'] })} style={field}><option value="clean">Clean</option><option value="boxed">Boxed</option><option value="accent">Accent</option></select></label>
            </div>
          </div>
        ))}
      </div> : <div style={{ color: T.dim, fontSize: 12, lineHeight: 1.5 }}>No on-screen text. The final cut contains no added text unless you add an item.</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="s2v-fin-btn" disabled={props.busy} onClick={() => { const firstDuration = Math.max(0.25, Number(props.scenes[0]?.duration_s) || total); setItems((current) => [...current, { id: `text_user_${Date.now()}`, text: '', start_s: 0, end_s: Math.min(total, firstDuration), position: 'bottom', style: 'clean', source: 'user' }]); setState('idle'); }}><Plus size={12} /> Add text</button>
        <button type="button" className="s2v-fin-btn is-primary" disabled={props.busy || state === 'saving'} onClick={() => void save()}>{state === 'saving' ? <VergeLoader size={22} tone="ink" label="Saving text" /> : <Check size={12} />} Save text layer</button>
      </div>
      {message ? <div role="status" style={{ marginTop: 8, color: state === 'error' ? T.fault : T.done, fontSize: 12 }}>{message}</div> : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Quality validation — deterministic media checks plus explicit human gates
// ---------------------------------------------------------------------------

type FinalQaStatus = 'pass' | 'review' | 'fail' | 'not-applicable';
interface FinalQaCheck { id: string; label: string; status: FinalQaStatus; evidence: string; human: boolean; action?: 'retry' | 'board' | 'approve'; actionLabel?: string; }
interface MediaMetadata { duration: number; width: number; height: number; }

function finalQualityChecks(film: Film, scenes: FilmScene[], media: MediaMetadata | null, approvals: Record<string, boolean>): FinalQaCheck[] {
  const completed = scenes.filter((scene) => scene.status === 'completed');
  const entries = new Map((film.audio?.narration || []).map((entry) => [entry.scene_key, entry]));
  const finish = (film.finish || {}) as any;
  // The assembled timeline (measured clips + narration holds) when the engine
  // recorded it; otherwise the clips' own lengths plus narration holds.
  const timeline = Number(finish.timeline_s) || completed.reduce((sum, scene) => sum + sceneTargetDuration(scene, entries.get(scene.scene_key) || null), 0);
  const durationTolerance = (completed.length / 30) + 0.25;
  const aspect = media && media.height > 0 ? media.width / media.height : 0;
  const aspectLabel = String(finish.output_aspect || film.aspect_ratio || '16:9');
  const expectedAspect = aspectLabel === '9:16' ? 9 / 16 : aspectLabel === '1:1' ? 1 : 16 / 9;
  const damaged = completed.filter((scene) => !scene.asset_url || scene.validation?.pass === false);
  const narrationOverruns = (film.audio?.narration || []).filter((entry) => {
    if (!entry.duration_s || !['elevenlabs', 'openai'].includes(entry.voice_source)) return false;
    const scene = completed.find((item) => item.scene_key === entry.scene_key);
    return scene ? entry.duration_s > sceneTargetDuration(scene, entry) + .35 : false;
  });
  const policyText = `${film.script || ''} ${film.plan?.story_summary || ''}`;
  const needsClaimsReview = /\b(?:competitor|versus|vs\.?|guarantee(?:d)?|best|leading|millionaire|revenue|profit|roi|percent|customer(?:s)? say)\b|[$€£]\s?\d|\d+\s?%/i.test(policyText);
  return [
    { id: 'output', label: 'Output file', human: false, status: film.final_video_url ? 'pass' : 'fail', evidence: film.final_video_url ? 'The final MP4 is saved.' : 'No final MP4 yet.', action: 'retry', actionLabel: 'Retry assembly' },
    { id: 'duration', label: 'Output duration', human: false, status: !media ? 'review' : Math.abs(media.duration - timeline) <= durationTolerance ? 'pass' : 'fail', evidence: media ? `${media.duration.toFixed(2)}s output; timeline ${timeline.toFixed(2)}s.` : 'Waiting for the final MP4 to load.', action: 'retry', actionLabel: 'Retry assembly' },
    { id: 'aspect', label: 'Aspect ratio', human: false, status: !media ? 'review' : Math.abs(aspect - expectedAspect) <= .025 ? 'pass' : 'fail', evidence: media ? `${media.width}×${media.height}; expected ${aspectLabel}.` : 'Waiting for the encoded size.', action: 'retry', actionLabel: 'Retry assembly' },
    { id: 'sync-auto', label: 'Narration timing', human: false, status: narrationOverruns.length ? 'fail' : 'pass', evidence: narrationOverruns.length ? `${narrationOverruns.length} narration line${narrationOverruns.length === 1 ? '' : 's'} run longer than their scene can hold.` : 'Narration fits its scenes.', action: 'board', actionLabel: 'Open scene board' },
    (film.plan?.on_screen_text || []).length
      ? { id: 'text-overlays', label: 'On-screen text', human: false, status: film.finish?.text_overlay_check?.pass ? 'pass' : film.final_video_url ? 'fail' : 'review', evidence: film.finish?.text_overlay_check?.pass ? `${film.finish.text_overlay_check.items.length} text overlay${film.finish.text_overlay_check.items.length === 1 ? '' : 's'} verified on the assembled frames.` : 'Final Assembly burns and verifies every text item.', action: 'retry', actionLabel: 'Retry assembly' }
      : { id: 'text-overlays', label: 'On-screen text', human: false, status: 'not-applicable', evidence: 'No on-screen text.' },
    { id: 'frames-auto', label: 'Scene clips', human: false, status: damaged.length ? 'fail' : completed.length ? 'pass' : 'review', evidence: damaged.length ? `${damaged.length} scene${damaged.length === 1 ? '' : 's'} need attention on the scene board.` : `${completed.length} finished clip${completed.length === 1 ? '' : 's'}.`, action: 'board', actionLabel: 'Open scene board' },
    needsClaimsReview
      ? { id: 'claims', label: 'Claims need approval', human: true, status: approvals.claims ? 'pass' : 'review', evidence: 'The script contains a comparative, financial, superlative, or customer claim that requires a person.', action: 'approve', actionLabel: 'Approve' }
      : { id: 'claims', label: 'Claims approval', human: false, status: 'not-applicable', evidence: 'No claim pattern requiring a person was found.' },
  ];
}

function FinalQualityPanel(props: { checks: FinalQaCheck[]; error: string; onApproval: (id: string, value: boolean) => void; onAction: (action: 'retry' | 'board') => void }) {
  const [showAll, setShowAll] = useState(false);
  const checks = props.checks.filter((check) => check.status !== 'not-applicable');
  const attention = checks.filter((check) => check.status === 'review' || check.status === 'fail');
  const shown = showAll ? checks : attention;
  const ready = attention.length === 0;
  return (
    <Section icon={<Check size={15} />} title="Checks">
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: ready ? T.done : attention.some((check) => check.status === 'fail') ? T.fault : T.live, fontSize: 13, fontWeight: 800 }}>
        {ready ? <Check size={14} /> : <AlertTriangle size={14} />}
        {ready ? 'Ready to download' : `${attention.length} thing${attention.length === 1 ? '' : 's'} need attention`}
        <button type="button" onClick={() => setShowAll((value) => !value)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.muted, padding: 0, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>{showAll ? 'Hide passing checks' : 'View all checks'}</button>
      </div>
      {shown.length ? <div style={{ display: 'grid', gap: 5, marginTop: 9 }}>
        {shown.map((check) => (
          <div key={check.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minHeight: 36, padding: '6px 8px', borderRadius: 8, background: 'var(--space-surface-bg)', border: `1px solid ${check.status === 'fail' ? T.fault : check.status === 'review' ? T.live : T.dim}` }}>
            <StateDot state={check.status === 'pass' ? 'done' : check.status === 'fail' ? 'failed' : 'todo'} />
            <span style={{ minWidth: 0, flex: 1, color: T.muted, fontSize: 12 }}><b style={{ color: T.bone }}>{check.label}</b> — {check.evidence}</span>
            {check.action === 'approve' ? <button type="button" className="s2v-fin-btn is-primary" style={{ minHeight: 34, padding: '6px 12px', fontSize: 12 }} onClick={() => props.onApproval(check.id, true)}>Approve</button>
              : check.action && check.status === 'fail' ? <button type="button" className="s2v-fin-btn" style={{ minHeight: 34, padding: '6px 12px', fontSize: 12 }} onClick={() => props.onAction(check.action as 'retry' | 'board')}>{check.actionLabel || 'Retry assembly'}</button> : null}
          </div>
        ))}
      </div> : null}
      {props.error ? <div style={{ color: T.fault, fontSize: 12, marginTop: 8 }}>{friendlyErrorMessage(props.error)}</div> : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The Final screen
// ---------------------------------------------------------------------------

export function FinalScreen(props: {
  film: Film;
  scenes: FilmScene[];
  busy: boolean;
  assembly: AssemblyProgress | null;
  captions: boolean;
  onCaptions: (v: boolean) => void;
  onBackToBoard: () => void;
  onPrepareAudio: () => void;
  onFinalAssembly: (o: FinishOptions) => void;
  onRunLayer: (layer: 'narration' | 'music' | 'sfx') => void;
  onRegenNarration: () => void;
  onRegenSfx: () => void;
  onRetryLayer: (layer: 'narration' | 'music' | 'sfx') => void;
  onSkipLayer: (layer: 'narration' | 'music' | 'sfx') => void;
  onChangeVoice: (voiceId: string, voiceName?: string) => void;
  onChangeMusic: (preset: string) => void;
  onAcceptMusic: () => void;
  onNativeCut?: () => void;
  /** Which engine speaks the narration — 'none' keeps the clips' own sound. */
  voiceSource: VoiceSourceId;
  openaiVoice: string;
  elevenLabsOffered: boolean;
  onChangeVoiceSource: (source: VoiceSourceId, openaiVoice?: string) => void;
  /** Mix choices applied by every assembly run. */
  finishPrefs?: FinishOptions;
  onFinishPrefs?: (prefs: FinishOptions) => void;
  onStopAssembly?: () => void;
}) {
  const { film, busy, assembly, captions } = props;
  const scenes = Array.isArray(props.scenes) ? props.scenes : [];
  const required = scenes.filter((scene) => scene.status !== 'skipped');
  const finished = required.filter((scene) => scene.status === 'completed' && scene.asset_url);
  const missing = required.filter((scene) => !(scene.status === 'completed' && scene.asset_url));
  const videoUrl = film.final_video_url ? String(film.final_video_url) : '';
  const audio = film.audio || null;
  const audioGenerating = film.machine_state === 'AUDIO_PLANNING' || film.machine_state === 'AUDIO_GENERATING';
  const prefs = props.finishPrefs || {};
  const setPrefs = (patch: Partial<FinishOptions>) => props.onFinishPrefs?.({ ...prefs, ...patch });
  const captionStyle = (prefs.captionStyle || 'clean') as CaptionStyleId;
  const narrationOn = audio
    ? audio.narration.some((entry) => isSpokenSource(entry.voice_source))
    : isSpokenSource(props.voiceSource);
  // Before the soundtrack is planned, music follows the film's sound setting.
  const musicAvailable = audio
    ? !!audio.music && audio.music.required !== false && audio.music.status !== 'skipped'
    : film.plan?.audio_enabled !== false && film.plan?.audio_policy !== 'fully-silent';
  const musicGain = typeof prefs.musicLevel === 'number' ? prefs.musicLevel : Number(audio?.music?.volume ?? 0.22);
  const musicPct = Math.round(Math.min(1, Math.max(0, musicGain / MUSIC_GAIN_MAX)) * 100);
  const voicePct = Math.round((typeof prefs.voiceLevel === 'number' ? prefs.voiceLevel : 1) * 100);

  const running = !!assembly?.running;
  const serverRun = !!film.plan?.background?.enabled;
  const touchedAt = Date.parse(String(film.updated_at || ''));
  const serverAssembling = serverRun && film.status === 'assembling' && !running
    && Number.isFinite(touchedAt) && Date.now() - touchedAt < SERVER_ASSEMBLY_STALE_MS;
  // 'assembling' with nothing running in this tab and no live server run means
  // the last assembly was interrupted — never leave that spinning.
  const interrupted = film.status === 'assembling' && !running && !busy && !serverAssembling;
  const canAssemble = finished.length > 0 && !missing.length && !busy && !running && !serverAssembling;

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const storedReview = ((film.plan?.background as any)?.quality_review || {}) as { approvals?: Record<string, boolean> };
  const [qaApprovals, setQaApprovals] = useState<Record<string, boolean>>(storedReview.approvals || {});
  const [qaError, setQaError] = useState('');
  const [mediaMetadata, setMediaMetadata] = useState<MediaMetadata | null>(null);
  const [fileBytes, setFileBytes] = useState<number>(Number((film.finish as any)?.size_bytes) || 0);
  const [lastProgressAt, setLastProgressAt] = useState(Date.now());
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const saved = ((film.plan?.background as any)?.quality_review || {}) as { approvals?: Record<string, boolean> };
    setQaApprovals(saved.approvals || {}); setQaError(''); setMediaMetadata(null);
  }, [film.id, film.final_video_url]);

  useEffect(() => {
    let live = true;
    listVoices().then((list) => { if (live) setVoices(list); }).catch(() => { if (live) setVoices([]); });
    return () => { live = false; };
  }, []);

  // File size: recorded by the engine for new exports; older finals are read
  // from the file's own headers.
  useEffect(() => {
    const recorded = Number((film.finish as any)?.size_bytes) || 0;
    setFileBytes(recorded);
    if (recorded || !videoUrl) return;
    let live = true;
    fetch(videoUrl, { method: 'HEAD' })
      .then((res) => { const n = Number(res.headers.get('content-length')) || 0; if (live && n) setFileBytes(n); })
      .catch(() => { /* size is informational */ });
    return () => { live = false; };
  }, [videoUrl]);

  useEffect(() => { if (running) setStartedAt(Date.now()); }, [running]);
  useEffect(() => { setLastProgressAt(Date.now()); }, [assembly?.percent, assembly?.detail, running]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const runAssembly = () => { if (canAssemble || interrupted) props.onFinalAssembly({ captions }); };
  const showProgress = !!assembly && (assembly.running || assembly.steps.some((step) => step.status === 'failed'));
  const quiet = running && now - lastProgressAt > ASSEMBLY_QUIET_MS;
  const qaChecks = finalQualityChecks(film, scenes, mediaMetadata, qaApprovals);
  const setQaApproval = (id: string, value: boolean) => {
    const next = { ...qaApprovals, [id]: value };
    setQaApprovals(next); setQaError('');
    if (!film.plan) { setQaError('This older film has no saved plan for quality approvals.'); return; }
    const quality_review = { version: 1, approvals: next, updated_at: new Date().toISOString(), media: mediaMetadata };
    void db.updateFilm(film.id, { plan: { ...film.plan, background: { ...(film.plan.background || {}), quality_review } } }).catch((caught: any) => setQaError(String(caught?.message || 'The quality review could not be saved.')));
  };

  const lastExport = [...(film.plan?.export_records || [])].reverse().find((record: any) => record?.status === 'complete' && record.url === videoUrl) as any;
  const last = lastExport?.settings || null;
  const settingsChanged = !!videoUrl && !!last && 'caption_style' in last && (
    Boolean(last.captions) !== Boolean(captions)
    || ('narration' in last && Boolean(last.narration) !== narrationOn)
    || (captions && last.caption_style !== captionStyle)
    || (last.transition || 'cut') !== (prefs.transition || 'cut')
    || (narrationOn && Math.abs(Number(last.voice_level ?? 1) - (prefs.voiceLevel ?? 1)) > 0.01)
    || (musicAvailable && typeof prefs.musicLevel === 'number' && Math.abs(Number(last.music_level ?? -1) - prefs.musicLevel) > 0.005)
  );

  const durationS = mediaMetadata?.duration || Number(film.duration_s) || 0;
  const meta = [
    durationS ? formatDuration(durationS) : '',
    String((film.finish as any)?.output_aspect || film.aspect_ratio || '16:9'),
    mediaMetadata?.width ? `${mediaMetadata.width}×${mediaMetadata.height}` : '',
    fileBytes ? formatBytes(fileBytes) : '',
    `${finished.length} clip${finished.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');
  const portrait = film.aspect_ratio === '9:16';
  const errorText = film.error ? friendlyErrorMessage(film.error) : '';
  const errorDetails = film.error ? String(film.error).split(' Technical details:')[1]?.trim() || '' : '';

  return (
    <div className="s2v-fin">
      <style>{FINISH_CSS}</style>
      <AudioUiStyles />
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: T.bone, fontSize: 21, fontWeight: 700, letterSpacing: -0.3, minWidth: 0 }}>{film.title || 'Your film'}</div>
          <button type="button" className="s2v-fin-btn" onClick={props.onBackToBoard} style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
            <ArrowLeft size={13} /> Back to scene board
          </button>
        </div>

        {/* The frame takes the film's own shape, so a 9:16 cut is reviewed portrait. */}
        <div style={videoUrl || running || serverAssembling
          ? { margin: '16px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--space-surface-bg)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--vg-border)', width: '100%', maxWidth: portrait ? 340 : film.aspect_ratio === '1:1' ? 640 : 920, aspectRatio: portrait ? '9 / 16' : film.aspect_ratio === '1:1' ? '1 / 1' : '16 / 9' }
          : { margin: '16px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px dashed var(--vg-border)', width: '100%', maxWidth: 920 }}>
          {videoUrl ? (
            <ProbedVideo
              key={videoUrl}
              src={videoUrl}
              scope="final"
              modelId={film.video_model}
              audioEnabled={film.plan?.audio_enabled !== false}
              containerStyle={{ width: '100%', height: '100%' }}
              videoProps={{ controls: true, playsInline: true, poster: film.final_thumb_url || undefined, style: { width: '100%', height: '100%', objectFit: 'contain', background: 'var(--space-surface-bg)' } } as any}
              onMetadata={(video) => setMediaMetadata({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })}
              onRetrySilent={runAssembly}
              dialogueBusy={busy || running || !canAssemble}
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
              {running ? (assembly?.detail || 'Assembling your film…')
                : serverAssembling ? 'This film is being assembled on the server. It plays here when it lands.'
                  : missing.length ? 'Some scenes are not finished yet — see below.'
                    : 'Run Final Assembly — the finished film plays here.'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ color: T.muted, fontSize: 12, fontFamily: T.mono }}>{meta}</span>
          {videoUrl && !running ? <span style={{ color: T.done, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={12} /> Saved to your video library</span> : null}
        </div>
        {film.stage_note && !film.error && !running ? <div style={{ color: T.muted, fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{film.stage_note}</div> : null}

        {missing.length ? (
          <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.fault}`, background: `color-mix(in srgb, ${T.fault} 8%, transparent)`, color: T.bone, fontSize: 12.5, lineHeight: 1.55 }}>
            <b>{missing.length === 1 ? `Scene ${missing[0].idx + 1} has` : `Scenes ${missing.map((s) => s.idx + 1).join(', ')} have`} no finished clip{missing.some((s) => s.status === 'failed') ? ' (generation failed)' : ''}.</b>{' '}
            Finish only assembles finished clips — it never regenerates them. Finish or skip {missing.length === 1 ? 'that scene' : 'those scenes'} on the scene board, then come back.
            <div style={{ marginTop: 8 }}><button type="button" className="s2v-fin-btn is-primary" onClick={props.onBackToBoard}><ArrowLeft size={13} /> Open the scene board</button></div>
          </div>
        ) : null}

        {errorText && !running ? (
          <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.fault}`, background: `color-mix(in srgb, ${T.fault} 8%, transparent)`, color: T.bone, fontSize: 12.5, lineHeight: 1.55 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={14} color={T.fault} style={{ flexShrink: 0, marginTop: 2 }} /><span>{errorText}</span></div>
            {errorDetails ? <div style={{ marginTop: 6, color: T.muted, fontSize: 11.5, fontFamily: T.mono, lineHeight: 1.45, wordBreak: 'break-word' }}>Details: {errorDetails}</div> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="s2v-fin-btn is-primary" disabled={!canAssemble && !interrupted} onClick={runAssembly}><RefreshCw size={13} /> Retry assembly</button>
              {/\bscenes?\b/i.test(errorText) ? <button type="button" className="s2v-fin-btn" onClick={props.onBackToBoard}><ArrowLeft size={13} /> Open the scene board</button> : null}
            </div>
          </div>
        ) : null}

        {interrupted && !errorText ? (
          <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${T.live}`, color: T.bone, fontSize: 12.5, lineHeight: 1.55 }}>
            The last assembly was interrupted before it finished. Your clips and audio are saved — nothing will be regenerated.
            <div style={{ marginTop: 8 }}><button type="button" className="s2v-fin-btn is-primary" onClick={runAssembly}><RefreshCw size={13} /> Retry assembly</button></div>
          </div>
        ) : null}

        {showProgress ? <AssemblyProgressCard progress={assembly!} quiet={quiet} elapsedS={Math.max(0, (now - startedAt) / 1000)} onStop={props.onStopAssembly} /> : null}

        <div className="s2v-fin-actions">
          {running ? (
            <button type="button" className="s2v-fin-btn is-primary" disabled><VergeLoader size={22} tone="ink" label="Assembling" /> Assembling… {assembly?.percent ?? 0}%</button>
          ) : (
            <button type="button" className={`s2v-fin-btn${videoUrl && !settingsChanged ? '' : ' is-primary'}`} disabled={!canAssemble} onClick={runAssembly} title="Joins the finished clips with your audio and caption choices. No scene is regenerated.">
              {videoUrl || errorText ? <RefreshCw size={14} /> : <Layers size={14} />} {errorText ? 'Retry assembly' : videoUrl ? 'Re-run assembly' : 'Run Final Assembly'}
            </button>
          )}
          {videoUrl ? (
            <a className="s2v-fin-btn" href={videoUrl} download target="_blank" rel="noreferrer"><Download size={14} /> Download MP4</a>
          ) : null}
        </div>
        {settingsChanged && !running ? <div style={{ color: T.live, fontSize: 12, marginTop: 8 }}>Your finish settings changed — Re-run assembly to apply them. Clips and audio are reused.</div> : null}

        <Section icon={<Captions size={15} />} title="Finish" hint="applied the next time the film is assembled">
          <div className="s2v-fin-controls">
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 32 }}>
                <input type="checkbox" checked={captions} disabled={running} onChange={(e) => props.onCaptions(e.target.checked)} style={{ accentColor: T.live, width: 16, height: 16 }} />
                <span style={{ color: captions ? T.bone : T.muted, fontSize: 12.5, fontWeight: 700 }}>Burn in captions</span>
              </label>
              <div style={{ color: T.dim, fontSize: 11.5, lineHeight: 1.5 }}>{PICKER_HELP.captions}</div>
              <div role="radiogroup" aria-label="Caption style" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                {CAPTION_STYLES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" className="s2v-fin-chip" aria-checked={captions && captionStyle === id} disabled={running} onClick={() => { setPrefs({ captionStyle: id }); props.onCaptions(true); }}>{label}</button>
                ))}
              </div>
              {captions && CAPTION_NOTES[captionStyle] ? <div style={{ color: T.muted, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>{CAPTION_NOTES[captionStyle]}</div> : null}
              <div style={{ color: T.dim, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                {captions ? `Timed to the ${narrationOn ? 'narration' : 'on-camera dialogue'}${captionStyle === 'karaoke' ? ', each word highlighted as it is spoken' : ''}.` : 'Off — nothing is burned in.'}
              </div>
            </div>

            <div>
              <div style={{ color: T.bone, fontSize: 12.5, fontWeight: 700, minHeight: 32, display: 'flex', alignItems: 'center' }}>Between clips</div>
              <div style={{ color: T.dim, fontSize: 11.5, lineHeight: 1.5 }}>{PICKER_HELP.transition}</div>
              <div role="radiogroup" aria-label="Transition between clips" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" role="radio" className="s2v-fin-chip" aria-checked={(prefs.transition || 'cut') === 'cut'} disabled={running} onClick={() => setPrefs({ transition: 'cut' })}>Clean cut</button>
                <button type="button" role="radio" className="s2v-fin-chip" aria-checked={prefs.transition === 'soft'} disabled={running} onClick={() => setPrefs({ transition: 'soft' })}>Soft fade</button>
              </div>
              <div style={{ color: T.muted, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>{TRANSITION_NOTES[prefs.transition || 'cut']}</div>
              <div style={{ color: T.dim, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>Every cut gets a tiny audio fade so there are no pops.</div>
            </div>

            {musicAvailable ? (
              <label style={{ color: T.muted, fontSize: 12.5 }}>
                <span style={{ color: T.bone, fontWeight: 700 }}>Music level</span> · {musicPct ? `${musicPct}%` : 'off for this cut'}
                <input type="range" min={0} max={100} value={musicPct} disabled={running} onChange={(e) => setPrefs({ musicLevel: (Number(e.target.value) / 100) * MUSIC_GAIN_MAX })} style={{ width: '100%', accentColor: T.live, minHeight: 28 }} aria-label="Music level" />
                <span style={{ color: T.dim, fontSize: 11.5 }}>{narrationOn ? 'Ducks automatically under the narration.' : 'Ducks gently under the clips’ own sound.'}</span>
              </label>
            ) : null}

            {narrationOn ? (
              <label style={{ color: T.muted, fontSize: 12.5 }}>
                <span style={{ color: T.bone, fontWeight: 700 }}>Voice level</span> · {voicePct}%
                <input type="range" min={50} max={150} value={voicePct} disabled={running} onChange={(e) => setPrefs({ voiceLevel: Number(e.target.value) / 100 })} style={{ width: '100%', accentColor: T.live, minHeight: 28 }} aria-label="Voice level" />
                <span style={{ color: T.dim, fontSize: 11.5 }}>The clips’ own sound drops under the voice automatically.</span>
              </label>
            ) : null}
          </div>
          <div style={{ color: T.dim, fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            {narrationOn ? 'Narration is on: the voice leads, clip audio is ducked.' : 'Narration is off: each clip keeps its own sound.'} The final mix is levelled to one consistent loudness and limited so nothing clips.
          </div>
        </Section>

        {audio?.voice_used === 'openai' && audio.voice_fallback_reason ? (
          <div role="status" style={{ color: T.muted, fontSize: 12, marginTop: 12 }}>Built-in {openAiVoiceLabel(audio.openai_voice || 'alloy')} voice used because ElevenLabs was unavailable after one retry.</div>
        ) : null}

        <AudioCards
          film={film}
          scenes={scenes}
          voices={voices}
          busy={busy || running}
          generating={audioGenerating}
          voiceSource={props.voiceSource}
          openaiVoice={props.openaiVoice}
          elevenLabsOffered={props.elevenLabsOffered}
          onChangeVoiceSource={props.onChangeVoiceSource}
          onRunLayer={props.onRunLayer}
          onRegenNarration={props.onRegenNarration}
          onRegenSfx={props.onRegenSfx}
          onChangeVoice={props.onChangeVoice}
          onChangeMusic={props.onChangeMusic}
          onAcceptMusic={props.onAcceptMusic}
          onRetryLayer={props.onRetryLayer}
          onSkipLayer={props.onSkipLayer}
        />

        <OnScreenTextPanel film={film} scenes={scenes} busy={busy || running} onChanged={() => props.onFinalAssembly({ captions })} />

        <FinalQualityPanel
          checks={qaChecks}
          error={qaError}
          onApproval={setQaApproval}
          onAction={(action) => action === 'board' ? props.onBackToBoard() : runAssembly()}
        />
      </div>
    </div>
  );
}
