/**
 * Fix it here — the finished-film repair panel shown on the film view.
 *
 * Every scene of the finished film is previewable. A scene on Gemini Omni
 * Flash is never re-rendered from scratch: the customer describes what is
 * wrong and the existing clip is sent to Omni as input so only that part
 * changes (its first and last frames — the joins to the neighbouring scenes —
 * are kept). Other models regenerate just that one scene. Both are charged for
 * that one block only and the film re-assembles once the fix is accepted.
 * The panel also offers a new take from the storyboard, an assembly re-run,
 * "Make another like this" and weekly autopilot, and shows the automatic
 * quality check with its refund outcome.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Clapperboard, Copy, Loader2, RefreshCw, ShieldCheck, Undo2, Wand2, X } from 'lucide-react';
import { T } from './api';
import type { Film, FilmScene } from './api';
import { VideoModelService, resolveVideoModel } from './pipeline/videoModelService';
import { quoteCredits } from '../../lib/credits';
import type { AutoQaRecord } from './autoQa';

const QUOTE_ENGINE: Record<string, string> = {
  'omni-1.1-flash': 'gemini-omni-1.1-flash',
  'seedance-2.5': 'openrouter/bytedance/seedance-2.5',
  'seedance-2.0': 'openrouter/bytedance/seedance-2.0-fast',
  'kling-3.0': 'kling-3.0',
  'kling-3.0-omni': 'kling-3.0-omni',
};

const FIX_CSS = `
.s2v-fix { margin-top: 16px; border-radius: 16px; border: 1px solid color-mix(in srgb, ${T.live} 45%, transparent); background: linear-gradient(160deg, color-mix(in srgb, ${T.live} 7%, ${T.raised}), ${T.raised}); padding: 16px; }
.s2v-fix-head { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.s2v-fix-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.s2v-fix-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 8px 14px; border-radius: 10px; border: 1px solid ${T.dim}; background: ${T.canvas}; color: ${T.bone}; font-size: 12.5px; font-weight: 750; cursor: pointer; }
.s2v-fix-btn.is-primary { background: var(--vg-gradient-action, ${T.live}); color: var(--vg-on-btn); border-color: transparent; }
.s2v-fix-btn:disabled { opacity: .55; cursor: not-allowed; }
.s2v-fix-btn:focus-visible, .s2v-fix textarea:focus-visible { outline: 2px solid var(--vg-focus, ${T.live}); outline-offset: 2px; }
.s2v-fix-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 14px; }
.s2v-fix-card { border-radius: 12px; border: 1px solid ${T.line}; background: ${T.card}; padding: 10px; display: grid; gap: 8px; align-content: start; }
.s2v-fix-card video { width: 100%; border-radius: 8px; background: var(--space-surface-bg); display: block; }
.s2v-fix-card textarea { width: 100%; box-sizing: border-box; min-height: 72px; resize: vertical; border-radius: 8px; border: 1px solid ${T.dim}; background: ${T.canvas}; color: ${T.bone}; padding: 8px 10px; font: inherit; font-size: 12.5px; line-height: 1.5; }
.s2v-fix-qa { display: flex; gap: 10px; align-items: flex-start; border-radius: 12px; padding: 10px 12px; margin-top: 12px; font-size: 12.5px; line-height: 1.5; }
@media (prefers-reduced-motion: reduce) { .s2v-fix .s2v-spin { animation: none !important; } }
.s2v-fix .s2v-spin { animation: s2v-fix-rot 1s linear infinite; }
@keyframes s2v-fix-rot { to { transform: rotate(360deg); } }
`;

export interface FilmFixPanelProps {
  film: Film;
  scenes: FilmScene[];
  busy: boolean;
  editingId: number | null;
  redoingId: number | null;
  qa: AutoQaRecord | null;
  qaRunning: boolean;
  onRecheckQa: () => void;
  onOmniEdit: (scene: FilmScene, instruction: string) => Promise<void> | void;
  onAcceptRevision: (scene: FilmScene, revisionId: string) => Promise<void> | void;
  onDiscardRevision: (scene: FilmScene, revisionId: string) => Promise<void> | void;
  onUndoRevision: (scene: FilmScene, revisionId: string) => Promise<void> | void;
  onRegenerateScene: (scene: FilmScene) => void;
  onRegenerateFromStoryboard: () => void;
  onRerunAssembly: () => void;
  onMakeAnother: () => void;
  onMakeWeekly: () => void;
  /** Open with every scene's fix box ready (e.g. arriving from the Library). */
  focusFix?: boolean;
}

function sceneModelId(scene: FilmScene, film: Film): string {
  return resolveVideoModel((scene.spec as any)?.engine_id || film.video_model).id;
}

function isOmni(scene: FilmScene, film: Film): boolean {
  return sceneModelId(scene, film) === VideoModelService.config.id;
}

function QaBanner({ qa, running, onRecheck }: { qa: AutoQaRecord | null; running: boolean; onRecheck: () => void }) {
  if (running) {
    return (
      <div className="s2v-fix-qa" role="status" style={{ border: `1px solid ${T.dim}`, color: T.muted }}>
        <Loader2 size={15} className="s2v-spin" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Running the automatic quality check: black frames, sound and a full-length ending. If it finds a problem, the credits for this film are refunded automatically.</span>
      </div>
    );
  }
  if (!qa) return null;
  const failed = qa.status === 'failed';
  const refunded = Number(qa.refund?.credits) > 0;
  const color = failed ? T.fault : qa.status === 'passed' ? T.done : T.live;
  return (
    <div className="s2v-fix-qa" role={failed ? 'alert' : 'status'} style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, transparent)`, color: T.bone }}>
      {failed ? <AlertTriangle size={15} color={color} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} /> : <ShieldCheck size={15} color={color} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{failed ? (refunded ? 'Quality check failed — credits refunded' : 'Quality check found a problem') : qa.status === 'passed' ? 'Quality check passed' : 'Quality check incomplete'}</b>
        <div style={{ color: T.muted, marginTop: 2 }}>{qa.summary}</div>
        {failed ? (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: T.muted }}>
            {qa.findings.filter((f) => f.status === 'fail').map((f) => <li key={f.id}>{f.detail}</li>)}
          </ul>
        ) : null}
        {failed ? <div style={{ color: T.muted, marginTop: 6 }}>Fix the affected scene below or re-run the assembly — your clips are saved.</div> : null}
      </div>
      {qa.status !== 'passed' ? <button type="button" className="s2v-fix-btn" onClick={onRecheck} style={{ minHeight: 34 }}><RefreshCw size={13} aria-hidden="true" /> Check again</button> : null}
    </div>
  );
}

function SceneFixCard({ scene, film, busy, editing, redoing, quote, open, onOpen, props }: {
  scene: FilmScene; film: Film; busy: boolean; editing: boolean; redoing: boolean; quote: number | null; open: boolean; onOpen: (open: boolean) => void; props: FilmFixPanelProps;
}) {
  const [instruction, setInstruction] = useState('');
  const omni = isOmni(scene, film);
  const validation = scene.validation || {};
  const revisions = Array.isArray(validation.revisions) ? validation.revisions : [];
  const preview = revisions.find((r) => r.status === 'preview' && r.id === validation.active_revision_id) || null;
  const accepted = [...revisions].reverse().find((r) => r.status === 'accepted') || null;
  const seconds = Math.round(Number(scene.duration_s) || 0);
  const working = editing || redoing;
  const poster = scene.keyframe_url || scene.first_frame_url || undefined;
  const title = String((scene.spec as any)?.studio_title || (scene.spec as any)?.summary || scene.script_segment || '').slice(0, 90);
  const credits = quote != null ? `about ${quote} credit${quote === 1 ? '' : 's'}` : `credits for ${seconds}s`;
  return (
    <article className="s2v-fix-card" aria-label={`Scene ${scene.idx + 1}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <b style={{ color: T.bone, fontSize: 13 }}>Scene {scene.idx + 1}</b>
        <span style={{ color: T.dim, fontSize: 11.5, fontFamily: T.mono }}>{seconds}s · {resolveVideoModel(sceneModelId(scene, film)).label}</span>
      </div>
      {scene.asset_url ? (
        <video key={preview ? preview.after_url : scene.asset_url} src={preview ? preview.after_url : scene.asset_url} poster={poster} controls playsInline preload="metadata" style={{ aspectRatio: film.aspect_ratio === '9:16' ? '9 / 16' : film.aspect_ratio === '1:1' ? '1 / 1' : '16 / 9', objectFit: 'contain' }} />
      ) : (
        <div style={{ color: T.dim, fontSize: 12, padding: 12, textAlign: 'center', border: `1px dashed ${T.dim}`, borderRadius: 8 }}>No clip yet</div>
      )}
      {title ? <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.45 }}>{title}</div> : null}
      {preview ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: T.live, fontSize: 12, fontWeight: 700 }}>Edited version — “{preview.instruction.slice(0, 80)}”</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="s2v-fix-btn is-primary" disabled={busy} onClick={() => void props.onAcceptRevision(scene, preview.id)}><Check size={13} aria-hidden="true" /> Use this fix</button>
            <button type="button" className="s2v-fix-btn" disabled={busy} onClick={() => void props.onDiscardRevision(scene, preview.id)}><X size={13} aria-hidden="true" /> Discard</button>
          </div>
          <div style={{ color: T.dim, fontSize: 11.5 }}>Using the fix re-assembles the film automatically with your saved audio.</div>
        </div>
      ) : working ? (
        <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.live, fontSize: 12 }}>
          <Loader2 size={14} className="s2v-spin" aria-hidden="true" /> {editing ? 'Editing this part of the clip with Omni Flash…' : 'Regenerating this scene…'}
        </div>
      ) : open ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ color: T.dim, fontSize: 11.5, fontWeight: 700 }} htmlFor={`s2v-fix-${scene.id}`}>{omni ? 'What is wrong in this scene?' : 'What should change? (optional)'}</label>
          <textarea id={`s2v-fix-${scene.id}`} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={omni ? 'e.g. Her mug should be white, not red. Keep everything else.' : 'e.g. Slower camera move, warmer light.'} />
          <div style={{ color: T.dim, fontSize: 11.5, lineHeight: 1.45 }}>
            {omni
              ? `The existing clip goes to Omni Flash as input and only the part you describe changes, so its joins with the scenes before and after stay seamless. Charged for this scene only (${credits}).`
              : `Only scene ${scene.idx + 1} is re-rendered; every other scene stays. Charged for this scene only (${credits}), refunded automatically if the render fails.`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {omni ? (
              <button type="button" className="s2v-fix-btn is-primary" disabled={busy || instruction.trim().length < 4 || !scene.asset_url} onClick={() => { void props.onOmniEdit(scene, instruction.trim()); onOpen(false); setInstruction(''); }}><Wand2 size={13} aria-hidden="true" /> Fix this part</button>
            ) : (
              <button type="button" className="s2v-fix-btn is-primary" disabled={busy} onClick={() => { props.onRegenerateScene(scene); onOpen(false); }}><RefreshCw size={13} aria-hidden="true" /> Regenerate scene {scene.idx + 1}</button>
            )}
            <button type="button" className="s2v-fix-btn" onClick={() => onOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="s2v-fix-btn" disabled={busy || !scene.asset_url} onClick={() => onOpen(true)}><Wand2 size={13} aria-hidden="true" /> Fix this scene</button>
          {accepted ? <button type="button" className="s2v-fix-btn" disabled={busy} onClick={() => void props.onUndoRevision(scene, accepted.id)} title="Restore the clip from before the last fix"><Undo2 size={13} aria-hidden="true" /> Undo fix</button> : null}
        </div>
      )}
    </article>
  );
}

export default function FilmFixPanel(props: FilmFixPanelProps) {
  const { film, busy } = props;
  const scenes = useMemo(() => [...(Array.isArray(props.scenes) ? props.scenes : [])].filter((s) => s.status !== 'skipped').sort((a, b) => a.idx - b.idx), [props.scenes]);
  const allMade = scenes.length > 0 && scenes.every((s) => s.status === 'completed' && s.asset_url);
  const [openId, setOpenId] = useState<number | null>(null);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const requestedQuotes = useRef(new Set<string>());
  const hasStoryboard = Boolean(film.plan?.scenes?.length);
  const omniFilm = scenes.some((s) => isOmni(s, film));

  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (props.focusFix && allMade) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [props.focusFix, allMade]);

  // Quote each distinct (model, length) once so every fix shows its real price before it is pressed.
  useEffect(() => {
    let live = true;
    const wanted = Array.from(new Set(scenes.map((s) => `${sceneModelId(s, film)}|${Math.round(Number(s.duration_s) || 0)}`))).filter((key) => !requestedQuotes.current.has(key));
    wanted.forEach((key) => {
      const [modelId, seconds] = key.split('|');
      const engine = QUOTE_ENGINE[modelId];
      if (!engine || !Number(seconds)) return;
      requestedQuotes.current.add(key);
      void quoteCredits(Number(seconds), engine, { seconds: Number(seconds), resolution: '720p', aspectRatio: film.aspect_ratio || '16:9', mode: 'std' } as any)
        .then((result) => { if (live && result) setQuotes((current) => ({ ...current, [key]: result.cost })); })
        .catch(() => undefined);
    });
    return () => { live = false; };
  }, [scenes, film.id]);

  if (!allMade) return null;
  return (
    <section ref={panelRef} className="s2v-fix" aria-label="Fix this film">
      <style>{FIX_CSS}</style>
      <div className="s2v-fix-head">
        <div>
          <div style={{ color: T.bone, fontSize: 15, fontWeight: 800 }}>Not quite right? Fix it here</div>
          <div style={{ color: T.muted, fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
            {omniFilm ? 'Describe what is wrong in any scene and Omni Flash edits just that part of the existing clip. ' : 'Regenerate any single scene. '}You only pay for the scene you fix, and the film re-assembles itself.
          </div>
        </div>
        <div className="s2v-fix-actions">
          <button type="button" className="s2v-fix-btn is-primary" disabled={busy} onClick={props.onMakeAnother}><Copy size={13} aria-hidden="true" /> Make another like this</button>
          <button type="button" className="s2v-fix-btn" disabled={busy || !hasStoryboard} onClick={props.onRegenerateFromStoryboard} title="A new take from the same storyboard and scene plan. This film stays as it is."><Clapperboard size={13} aria-hidden="true" /> Regenerate from storyboard</button>
          <button type="button" className="s2v-fix-btn" disabled={busy} onClick={props.onRerunAssembly} title="Joins the saved clips again with your finish settings. No scene is regenerated and nothing is charged."><RefreshCw size={13} aria-hidden="true" /> Re-run assembly</button>
          <button type="button" className="s2v-fix-btn" disabled={busy} onClick={props.onMakeWeekly}><CalendarClock size={13} aria-hidden="true" /> Make this weekly</button>
        </div>
      </div>
      <QaBanner qa={props.qa} running={props.qaRunning} onRecheck={props.onRecheckQa} />
      <div className="s2v-fix-grid">
        {scenes.map((scene) => (
          <SceneFixCard
            key={scene.id}
            scene={scene}
            film={film}
            busy={busy}
            editing={props.editingId === scene.id}
            redoing={props.redoingId === scene.id}
            quote={quotes[`${sceneModelId(scene, film)}|${Math.round(Number(scene.duration_s) || 0)}`] ?? null}
            open={openId === scene.id}
            onOpen={(open) => setOpenId(open ? scene.id : null)}
            props={props}
          />
        ))}
      </div>
    </section>
  );
}
