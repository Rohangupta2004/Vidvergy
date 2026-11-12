/**
 * The first screen of Script-to-Video, in three steps:
 *   1. Choose — "I have an idea" (the app writes the script) or "I have my script"
 *      (pasted text is kept word for word).
 *   2. Review — the script, plus an optional storyboard (one picture per scene).
 *   3. Generate — cost, one gold action, and progress only while it runs.
 * Everything else (shape, length, look, sound, model) sits in one collapsed
 * Advanced section with good defaults.
 *
 * Presentational only — CreateFlow owns every value and builds the submit
 * payload, so this panel cannot drift from the full setup flow.
 */
import type { ReactNode } from 'react';
import { Check, Circle, Clapperboard, Image as ImageIcon, Lightbulb, Loader2, RefreshCw, ScrollText, Settings2, Wand2, X } from 'lucide-react';
import { SecondCutStyles } from '../../components/secondcut/styles';

type Aspect = '16:9' | '9:16' | '1:1';
export type StartPath = 'idea' | 'script';

export interface StoryboardFrameView {
  index: number;
  label: string;
  text: string;
  url: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
}

export interface QuickStartPanelProps {
  path: StartPath;
  onPath: (path: StartPath) => void;
  idea: string;
  onIdea: (value: string) => void;
  onWriteScript: () => void;
  writing: boolean;
  writeError: string;
  scriptFromIdea: boolean;
  text: string;
  onText: (value: string) => void;
  wordCount: number;
  detectedScenes: number;
  seconds: number;
  storyboard: {
    frames: StoryboardFrameView[];
    busy: boolean;
    error: string;
    stale: boolean;
    attach: boolean;
    attachSupported: boolean;
    attachNote: string;
  };
  onGenerateStoryboard: () => void;
  onRegenerateFrame: (index: number) => void;
  onAttachStoryboard: (on: boolean) => void;
  onClearStoryboard: () => void;
  modelLabel: string;
  modelRecommended: boolean;
  modelReason: string;
  styleLabel: string;
  aspect: Aspect;
  onAspect: (aspect: Aspect) => void;
  lengthControl?: ReactNode;
  styleOptions: Array<{ id: string; label: string }>;
  styleId: string;
  onStyle: (id: string) => void;
  customStyle: string;
  onCustomStyle: (value: string) => void;
  audioOptions: Array<{ id: string; label: string; description: string }>;
  audioPolicy: string;
  onAudioPolicy: (id: string) => void;
  modelPicker: ReactNode;
  estimateCredits: number;
  balanceText: string;
  costConfirm?: { message: string; checked: boolean; onChange: (checked: boolean) => void } | null;
  canStart: boolean;
  disabledReason: string;
  busy: boolean;
  error: string;
  resumeNotice: boolean;
  onStart: () => void;
  onOpenFullSetup: () => void;
}

const formatSeconds = (total: number) => `${Math.floor(total / 60)}:${String(Math.max(0, Math.round(total % 60))).padStart(2, '0')}`;

const WS_CSS = `
.s2v-ws2{--hue:var(--vg-accent,var(--space-brand-primary-500));padding:14px 16px 32px;display:flex;flex-direction:column;gap:12px;min-width:0;max-width:880px;margin:0 auto;width:100%}
.s2v-qs-steps{list-style:none;margin:0;padding:0;display:flex;gap:6px;flex-wrap:wrap}
.s2v-qs-steps li{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.s2v-qs-steps li .n{width:20px;height:20px;border-radius:999px;display:grid;place-items:center;font-size:11.5px;font-weight:800;background:var(--sunken);color:var(--ink2)}
.s2v-qs-steps li.is-on{color:var(--ink);border-color:var(--hue)}
.s2v-qs-steps li.is-on .n{background:var(--hue);color:var(--vg-on-accent,var(--space-text-on-primary))}
.s2v-qs-steps li.is-done .n{background:color-mix(in srgb,var(--hue) 22%,transparent);color:var(--ink)}
.s2v-qs-card{padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.s2v-qs-card h2{font-size:18px;letter-spacing:-.02em;margin:0}
.s2v-qs-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.s2v-qs-head .eyebrow{flex:none}
.s2v-qs-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.s2v-qs-choice button{min-height:92px;text-align:left;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:var(--sunken);color:var(--ink);cursor:pointer}
.s2v-qs-choice button b{display:flex;align-items:center;gap:8px;font-size:16px}
.s2v-qs-choice button span{font-size:13px;color:var(--muted);line-height:1.45}
.s2v-qs-choice button[aria-checked="true"]{border-color:var(--hue);background:color-mix(in srgb,var(--hue) 12%,transparent)}
.s2v-ws2 .textarea{min-height:120px;font-size:14.5px;width:100%}
.s2v-qs-script{min-height:240px!important}
.s2v-qs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.s2v-qs-alert{padding:10px 12px;border-radius:12px;background:var(--bad-soft);color:var(--bad);font-size:13px;line-height:1.5}
.s2v-qs-note{padding:10px 12px;border-radius:12px;background:var(--gold-soft);color:var(--ink);font-size:13px;line-height:1.5}
.s2v-qs-board{border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:10px}
.s2v-qs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.s2v-qs-frame{display:flex;flex-direction:column;gap:6px;min-width:0}
.s2v-qs-shot{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:var(--sunken);display:grid;place-items:center;color:var(--muted)}
.s2v-qs-shot img{width:100%;height:100%;object-fit:cover;display:block}
.s2v-qs-shot .err{padding:8px;font-size:11.5px;line-height:1.35;color:var(--bad);text-align:center}
.s2v-qs-frame small{font-size:12px;color:var(--muted);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.s2v-qs-frame .lbl{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px;font-weight:700;color:var(--ink2)}
.s2v-qs-frame .lbl button{min-height:30px!important;padding:0 8px;font-size:11.5px}
.s2v-qs-attach{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.45}
.s2v-qs-attach input{width:20px;height:20px;margin-top:1px;flex:none}
.s2v-qs-attach[aria-disabled="true"]{opacity:.6}
.s2v-qs-cost{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.s2v-qs-cost b{font-family:var(--display);font-size:30px;letter-spacing:-.03em;line-height:1}
.s2v-qs-sum{display:flex;flex-wrap:wrap;gap:6px}
.s2v-qs-start{width:100%}
.s2v-qs-run{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.s2v-qs-run li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border-radius:12px;background:var(--sunken);border:1px solid var(--line);font-size:13px}
.s2v-qs-run li small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.s2v-qs-run li.is-running{border-color:var(--hue)}
.s2v-qs-run li .st{font-size:11.5px;color:var(--muted)}
.s2v-qs-adv>summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;color:var(--ink2);font-size:14px;font-weight:700;list-style:none;padding:4px 16px}
.s2v-qs-adv>summary::-webkit-details-marker{display:none}
.s2v-qs-adv>summary small{font-weight:500;color:var(--muted);font-size:12.5px}
.s2v-qs-adv-body{display:flex;flex-direction:column;gap:14px;padding:4px 16px 16px}
.s2v-qs-model button{padding:10px 12px}
.s2v-ws2 .s2v-run-spin{animation:vxSpin 1.1s linear infinite}
@media(max-width:640px){.s2v-ws2{padding:10px 12px 28px}.s2v-qs-choice{grid-template-columns:minmax(0,1fr)}.s2v-qs-choice button{min-height:72px}.s2v-ws2 .textarea{font-size:16px}.s2v-qs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export default function QuickStartPanel(props: QuickStartPanelProps) {
  const hasScript = props.wordCount >= 3;
  const showReview = props.path === 'script' ? hasScript : props.scriptFromIdea && hasScript;
  const current = !showReview ? 1 : props.busy ? 3 : 2;
  const steps: Array<[number, string]> = [[1, 'Choose'], [2, 'Review'], [3, 'Generate']];
  return (
    <div className="vx s2v-ws2" data-vv-studio="script-to-video">
      <SecondCutStyles />
      <style>{WS_CSS}</style>
      <ol className="s2v-qs-steps" aria-label="Steps">
        {steps.map(([n, label]) => (
          <li key={n} className={n === current ? 'is-on' : n < current ? 'is-done' : ''} aria-current={n === current ? 'step' : undefined}>
            <span className="n">{n < current ? <Check size={12} aria-hidden /> : n}</span>{label}
          </li>
        ))}
      </ol>

      <ChooseStep {...props} />
      {showReview ? <ReviewStep {...props} /> : null}
      <AdvancedSection {...props} />
      {showReview ? <GenerateStep {...props} /> : null}
    </div>
  );
}

function ChooseStep(props: QuickStartPanelProps) {
  const options: Array<[StartPath, string, string, ReactNode]> = [
    ['idea', 'I have an idea', 'Type a product, topic or idea. We write the script and scenes.', <Lightbulb key="i" size={17} aria-hidden />],
    ['script', 'I have my script', 'Paste it. Your words are kept exactly as written.', <ScrollText key="s" size={17} aria-hidden />],
  ];
  return (
    <section className="panel s2v-qs-card" aria-labelledby="s2v-qs-choose">
      <div className="s2v-qs-head"><span className="eyebrow">Step 1</span><h2 id="s2v-qs-choose">How do you want to start?</h2></div>
      <div className="s2v-qs-choice" role="radiogroup" aria-label="How to start">
        {options.map(([id, label, hint, icon]) => (
          <button key={id} type="button" role="radio" aria-checked={props.path === id} disabled={props.busy} onClick={() => props.onPath(id)}>
            <b>{props.path === id ? <Check size={17} aria-hidden /> : icon}{label}</b>
            <span>{hint}</span>
          </button>
        ))}
      </div>

      {props.resumeNotice ? <div className="s2v-qs-note" role="status">Your script is saved. The last start did not finish before the page closed. Press Generate video to pick up from here.</div> : null}

      {props.path === 'idea' ? (
        <>
          <label className="field">
            <span className="label">Your idea</span>
            <textarea
              className="textarea"
              rows={4}
              value={props.idea}
              onChange={(event) => props.onIdea(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && props.idea.trim()) { event.preventDefault(); props.onWriteScript(); } }}
              placeholder="Example: a 30-second launch video for a budgeting app that makes money feel simple. Add a website link to use its brand."
              aria-label="Your idea"
              disabled={props.busy || props.writing}
            />
          </label>
          <div className="s2v-qs-row">
            <button type="button" className={props.scriptFromIdea ? 'btn' : 'btn btn-gold'} disabled={!props.idea.trim() || props.writing || props.busy} onClick={props.onWriteScript}>
              {props.writing ? <Loader2 size={16} className="s2v-run-spin" aria-hidden /> : <Wand2 size={16} aria-hidden />}
              {props.writing ? 'Writing your script…' : props.scriptFromIdea ? 'Write it again' : 'Write my script'}
            </button>
            <span className="hint">{props.writing ? 'This takes about a minute.' : 'Free. Nothing is generated until you press Generate video.'}</span>
          </div>
          {props.writeError ? <div className="s2v-qs-alert" role="alert">{props.writeError}</div> : null}
        </>
      ) : (
        <>
          <label className="field">
            <span className="label">Your script</span>
            <textarea
              className="textarea s2v-qs-script"
              value={props.text}
              onChange={(event) => props.onText(event.target.value)}
              rows={12}
              aria-label="Paste your script"
              placeholder={'Paste your whole script here…\n\nTip: lines like “Scene 1 — Title | 10 sec” become scenes exactly as written. Plain text is split into scenes for you, word for word.'}
              disabled={props.busy}
            />
          </label>
          <ScriptChips {...props} />
        </>
      )}
    </section>
  );
}

function ScriptChips(props: QuickStartPanelProps) {
  const words = props.wordCount;
  return (
    <div className="s2v-qs-row" aria-live="polite">
      <span className="chip">{words} word{words === 1 ? '' : 's'}</span>
      <span className="chip">{props.detectedScenes ? `${props.detectedScenes} scene${props.detectedScenes === 1 ? '' : 's'}` : 'Scenes split for you'}</span>
      <span className="chip">About {formatSeconds(props.seconds)}</span>
    </div>
  );
}

function ReviewStep(props: QuickStartPanelProps) {
  return (
    <section className="panel s2v-qs-card" aria-labelledby="s2v-qs-review">
      <div className="s2v-qs-head"><span className="eyebrow">Step 2</span><h2 id="s2v-qs-review">{props.path === 'idea' ? 'Review your script' : 'Review'}</h2></div>
      {props.path === 'idea' ? (
        <>
          <p className="hint">Edit anything you like. This exact script is what gets filmed.</p>
          <textarea
            className="textarea s2v-qs-script"
            value={props.text}
            onChange={(event) => props.onText(event.target.value)}
            rows={14}
            aria-label="Your script"
            disabled={props.busy || props.writing}
          />
          <ScriptChips {...props} />
        </>
      ) : null}
      <StoryboardBlock {...props} />
    </section>
  );
}

function StoryboardBlock(props: QuickStartPanelProps) {
  const board = props.storyboard;
  const ready = board.frames.filter((frame) => frame.status === 'ready').length;
  const ratio = props.aspect.replace(':', ' / ');
  return (
    <div className="s2v-qs-board">
      <div className="s2v-qs-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <b style={{ fontSize: 14.5 }}>Storyboard</b> <span className="hint">optional</span>
          <p className="hint" style={{ marginTop: 2 }}>One picture per scene, so you can check the look before any video is made.</p>
        </div>
        <div className="s2v-qs-row">
          {board.frames.length && !board.busy ? (
            <button type="button" className="btn btn-sm" onClick={props.onClearStoryboard} disabled={props.busy}><X size={14} aria-hidden />Remove</button>
          ) : null}
          <button type="button" className="btn btn-sm" onClick={props.onGenerateStoryboard} disabled={board.busy || props.busy || props.writing}>
            {board.busy ? <Loader2 size={14} className="s2v-run-spin" aria-hidden /> : board.frames.length ? <RefreshCw size={14} aria-hidden /> : <ImageIcon size={14} aria-hidden />}
            {board.busy ? `Drawing ${ready} of ${board.frames.length}…` : board.frames.length ? 'Redo storyboard' : 'Generate storyboard'}
          </button>
        </div>
      </div>
      {board.error ? <div className="s2v-qs-alert" role="alert">{board.error}</div> : null}
      {board.stale && board.frames.length ? <div className="s2v-qs-note" role="status">The script changed after this storyboard was made. Redo it to match, or keep it as is.</div> : null}
      {board.frames.length ? (
        <div className="s2v-qs-grid" aria-live="polite">
          {board.frames.map((frame) => (
            <figure key={frame.index} className="s2v-qs-frame" style={{ margin: 0 }}>
              <div className="s2v-qs-shot" style={{ aspectRatio: ratio }}>
                {frame.status === 'ready' && frame.url ? <img src={frame.url} alt={`${frame.label} storyboard`} loading="lazy" />
                  : frame.status === 'loading' ? <Loader2 size={20} className="s2v-run-spin" aria-label="Drawing" />
                    : frame.status === 'error' ? <span className="err">{frame.error || 'This picture failed.'}</span>
                      : <ImageIcon size={18} aria-hidden />}
              </div>
              <span className="lbl">
                <span>{frame.label}</span>
                <button type="button" className="btn btn-sm" onClick={() => props.onRegenerateFrame(frame.index)} disabled={frame.status === 'loading' || board.busy || props.busy} aria-label={`Redo ${frame.label}`}>
                  {frame.status === 'error' ? 'Retry' : 'Redo'}
                </button>
              </span>
              <small>{frame.text}</small>
            </figure>
          ))}
        </div>
      ) : null}
      {ready ? (
        <label className="s2v-qs-attach" aria-disabled={!board.attachSupported}>
          <input type="checkbox" checked={board.attach && board.attachSupported} disabled={!board.attachSupported || props.busy} onChange={(event) => props.onAttachStoryboard(event.target.checked)} />
          <span><b>Attach storyboard to the video</b><br /><span className="hint">{board.attachNote}</span></span>
        </label>
      ) : null}
    </div>
  );
}

function AdvancedSection(props: QuickStartPanelProps) {
  return (
    <details className="panel s2v-qs-adv">
      <summary><Settings2 size={16} aria-hidden /> Advanced <small>{props.aspect} · {props.styleLabel} · {props.modelLabel}</small></summary>
      <div className="s2v-qs-adv-body">
        <div className="field">
          <span className="label" id="s2v-qs-shape">Shape</span>
          <div className="seg" role="radiogroup" aria-labelledby="s2v-qs-shape">
            {(['16:9', '9:16', '1:1'] as Aspect[]).map((shape) => (
              <button key={shape} type="button" role="radio" aria-checked={props.aspect === shape} className={props.aspect === shape ? 'on' : ''} onClick={() => props.onAspect(shape)} disabled={props.busy}>{shape}</button>
            ))}
          </div>
        </div>
        {props.path === 'idea' && props.lengthControl ? (
          <div className="field"><span className="label">Length</span>{props.lengthControl}</div>
        ) : null}
        <label className="field">
          <span className="label">Look</span>
          <select className="select" value={props.styleId} onChange={(event) => props.onStyle(event.target.value)} aria-label="Visual look" disabled={props.busy}>
            {props.styleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {props.styleId === 'custom' ? (
          <label className="field">
            <span className="label">Describe your look</span>
            <textarea className="textarea" style={{ minHeight: 90 }} rows={3} value={props.customStyle} onChange={(event) => props.onCustomStyle(event.target.value)} placeholder="Materials, camera, colour and mood…" />
          </label>
        ) : null}
        <label className="field">
          <span className="label">Sound</span>
          <select className="select" value={props.audioPolicy} onChange={(event) => props.onAudioPolicy(event.target.value)} aria-label="Sound" disabled={props.busy}>
            {props.audioOptions.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="label">Video model</span>
          <div className="s2v-qs-model">{props.modelPicker}</div>
        </div>
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={props.onOpenFullSetup} disabled={props.busy}>
          Open the full step-by-step setup
        </button>
      </div>
    </details>
  );
}

function GenerateStep(props: QuickStartPanelProps) {
  return (
    <section className="panel s2v-qs-card" aria-labelledby="s2v-qs-go">
      <div className="s2v-qs-head"><span className="eyebrow">Step 3</span><h2 id="s2v-qs-go">Generate</h2></div>
      <div className="s2v-qs-sum">
        <span className="chip">About {formatSeconds(props.seconds)}</span>
        <span className="chip">{props.detectedScenes ? `${props.detectedScenes} scene${props.detectedScenes === 1 ? '' : 's'}` : 'Scenes split for you'}</span>
        <span className="chip">{props.styleLabel}</span>
        <span className="chip">{props.aspect}</span>
        <span className="chip" title={props.modelReason}>{props.modelLabel}{props.modelRecommended ? ' · best value' : ''}</span>
        {props.storyboard.attach && props.storyboard.attachSupported && props.storyboard.frames.some((frame) => frame.status === 'ready') ? <span className="chip">Storyboard attached</span> : null}
      </div>
      <div className="s2v-qs-cost">
        <b>{props.estimateCredits}</b><span className="ink2">credits</span>
        <span className="hint">{props.balanceText} Real engine cost plus 30%. Failed renders are refunded.</span>
      </div>
      {props.costConfirm ? (
        <label className="s2v-qs-note s2v-qs-attach">
          <input type="checkbox" checked={props.costConfirm.checked} onChange={(event) => props.costConfirm?.onChange(event.target.checked)} disabled={props.busy} />
          <span>{props.costConfirm.message}</span>
        </label>
      ) : null}
      {props.error ? <div className="s2v-qs-alert" role="alert">{props.error}</div> : null}
      {!props.canStart && props.disabledReason && !props.busy ? <p className="hint" style={{ color: 'var(--bad)' }}>{props.disabledReason}</p> : null}
      <button type="button" className="btn btn-gold btn-lg s2v-qs-start" disabled={!props.canStart || props.busy} onClick={props.onStart}>
        {props.busy ? <Loader2 size={18} className="s2v-run-spin" aria-hidden /> : <Clapperboard size={18} aria-hidden />}
        {props.busy ? 'Starting…' : 'Generate video'}
      </button>
      {props.busy ? (
        <ol className="s2v-qs-run" aria-live="polite" aria-label="Progress">
          <li><Check size={15} aria-hidden /><span>Script saved<small>Kept exactly as shown above.</small></span><span className="st">Done</span></li>
          <li className="is-running"><Loader2 size={15} className="s2v-run-spin" aria-hidden /><span>Splitting into scenes, cast pictures and storyboard<small>A long script takes a few minutes.</small></span><span className="st">Running</span></li>
          <li><Circle size={12} aria-hidden /><span>Make the clips and join them<small>Starts automatically next.</small></span><span className="st">Waiting</span></li>
        </ol>
      ) : null}
    </section>
  );
}
