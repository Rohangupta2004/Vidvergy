/**
 * The first screen of Script-to-Video: pick how to start (your own script or an
 * idea), then press Start video. Laid out as the second design's studio
 * workspace: inputs on the left, the stage in the centre, the inspector with the
 * cost and the one gold action on the right.
 *
 * Presentational only — CreateFlow owns every value and builds the submit
 * payload, so this panel cannot drift from the full setup flow it sits above.
 * The pasted text is handed back exactly as typed (no trim, no rewrite).
 */
import type { ReactNode } from 'react';
import { Check, Circle, Clapperboard, Lightbulb, Loader2, ScrollText, Settings2 } from 'lucide-react';
import { SecondCutStyles } from '../../components/secondcut/styles';

type Aspect = '16:9' | '9:16' | '1:1';
export type StartTab = 'script' | 'idea';

export interface QuickStartPanelProps {
  tab: StartTab;
  onTab: (tab: StartTab) => void;
  text: string;
  onText: (value: string) => void;
  wordCount: number;
  detectedScenes: number;
  seconds: number;
  modelLabel: string;
  modelRecommended: boolean;
  modelReason: string;
  styleLabel: string;
  aspect: Aspect;
  onAspect: (aspect: Aspect) => void;
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
.s2v-ws2{--hue:#f4c33c;padding:14px 16px 24px;display:flex;flex-direction:column;gap:12px;min-width:0}
.s2v-ws2-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.s2v-ws2-top .seg button{min-height:34px;padding:0 14px;font-size:13px}
.s2v-ws2-body{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr) minmax(260px,300px);gap:12px;align-items:start}
.s2v-ws2-col{padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
.s2v-ws2-col h2{font-size:18px;letter-spacing:-.02em}
.s2v-ws2 .textarea{min-height:260px;font-size:14.5px}
.s2v-ws2 details{border-top:1px solid var(--line);padding-top:10px}
.s2v-ws2 details>summary{display:flex;align-items:center;gap:8px;min-height:40px;cursor:pointer;color:var(--ink2);font-size:13.5px;font-weight:600;list-style:none}
.s2v-ws2 details>summary::-webkit-details-marker{display:none}
.s2v-ws2-adv{display:flex;flex-direction:column;gap:12px;margin-top:8px}
.s2v-ws2-stage{position:relative;min-height:440px;border-radius:var(--r-lg);border:1px solid var(--line);background:#000;display:grid;place-items:center;padding:22px;overflow:hidden;color:#fbf4e2}
.s2v-ws2-stage::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 100% 0%,color-mix(in srgb,var(--hue) 14%,transparent),transparent 70%);pointer-events:none}
.s2v-ws2-frame{position:relative;width:min(100%,560px);border-radius:12px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(160deg,#17130c,#050402);box-shadow:0 30px 80px rgba(0,0,0,.7);display:grid;place-items:center;text-align:center;padding:26px}
.s2v-ws2-frame.is-portrait{width:auto;height:min(380px,60vh);aspect-ratio:9/16}
.s2v-ws2-frame.is-wide{aspect-ratio:16/9}
.s2v-ws2-frame.is-square{width:min(100%,380px);aspect-ratio:1/1}
.s2v-ws2-shape{position:absolute;left:12px;top:10px;font-family:var(--mono);font-size:11.5px;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:6px;color:#fbf4e2}
.s2v-ws2-empty{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:340px}
.s2v-ws2-empty h3{font-size:24px;color:#fbf4e2}
.s2v-ws2-empty p{font-size:13.5px;color:rgba(251,244,226,.72);line-height:1.5}
.s2v-ws2-icon{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;color:var(--hue);background:color-mix(in srgb,var(--hue) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--hue) 40%,transparent)}
.s2v-ws2-run{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;text-align:left;width:100%}
.s2v-ws2-run li{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border-radius:12px;background:rgba(255,232,180,.06);border:1px solid rgba(255,225,160,.12);font-size:13px;color:#fbf4e2}
.s2v-ws2-run li small{display:block;color:rgba(251,244,226,.6);font-size:12px;margin-top:2px}
.s2v-ws2-run li.is-running{border-color:var(--hue)}
.s2v-ws2-run li .st{font-size:11.5px;color:rgba(251,244,226,.6)}
.s2v-ws2-cost b{font-family:var(--display);font-size:38px;letter-spacing:-.03em;line-height:1}
.s2v-ws2-kv{display:flex;flex-direction:column}
.s2v-ws2-kv div{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)}
.s2v-ws2-kv div:last-child{border-bottom:0}
.s2v-ws2-kv span{color:var(--muted)}
.s2v-ws2-kv b{font-weight:600;text-align:right;min-width:0;overflow-wrap:anywhere}
.s2v-ws2-alert{padding:10px 12px;border-radius:12px;background:var(--bad-soft);color:var(--bad);font-size:13px;line-height:1.5}
.s2v-ws2-note{padding:10px 12px;border-radius:12px;background:var(--gold-soft);color:var(--ink);font-size:13px;line-height:1.5}
.s2v-ws2-check{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5}
.s2v-ws2-check input{width:20px;height:20px;margin-top:1px;flex:none}
.s2v-ws2-start{width:100%}
.s2v-ws2-model button{padding:10px 12px}
.s2v-ws2-model select{width:100%;min-height:42px;border-radius:12px;padding:0 12px;background:var(--sunken);border:1px solid var(--line);color:var(--ink)}
.s2v-ws2 .s2v-run-spin{animation:vxSpin 1.1s linear infinite}
@media(max-width:1180px){.s2v-ws2-body{grid-template-columns:minmax(300px,380px) minmax(0,1fr)}.s2v-ws2-right{grid-column:1/-1}}
@media(max-width:820px){.s2v-ws2{padding:10px 12px 24px}.s2v-ws2-body{grid-template-columns:minmax(0,1fr)}.s2v-ws2-stage{order:-1;min-height:280px}.s2v-ws2 .textarea{min-height:200px;font-size:16px}}
`;

export default function QuickStartPanel(props: QuickStartPanelProps) {
  const { tab, onTab } = props;
  return (
    <div className="vx s2v-ws2" data-vv-studio="script-to-video">
      <SecondCutStyles />
      <style>{WS_CSS}</style>
      <div className="s2v-ws2-top">
        <div className="seg" role="tablist" aria-label="How to start">
          <button type="button" role="tab" id="s2v-qs-tab-script" aria-selected={tab === 'script'} aria-controls="s2v-qs-panel-script" className={tab === 'script' ? 'on' : ''} onClick={() => onTab('script')}>
            <ScrollText size={15} aria-hidden /> My own script
          </button>
          <button type="button" role="tab" id="s2v-qs-tab-idea" aria-selected={tab === 'idea'} className={tab === 'idea' ? 'on' : ''} onClick={() => onTab('idea')}>
            <Lightbulb size={15} aria-hidden /> An idea
          </button>
        </div>
        <span className="hint">{tab === 'script' ? 'Paste your script. Your words are kept exactly as written.' : 'Describe the film in a sentence or two. Verger writes the script for you to approve.'}</span>
      </div>
      {tab === 'script' ? <ScriptWorkspace {...props} /> : null}
    </div>
  );
}

function StageFrame({ aspect, children }: { aspect: Aspect; children: ReactNode }) {
  const shape = aspect === '9:16' ? 'is-portrait' : aspect === '1:1' ? 'is-square' : 'is-wide';
  return (
    <div className={`s2v-ws2-frame ${shape}`}>
      <span className="guides" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="s2v-ws2-shape">{aspect}</span>
      {children}
    </div>
  );
}

function ScriptWorkspace(props: QuickStartPanelProps) {
  const words = props.wordCount;
  const hasText = props.text.trim().length > 0;
  return (
    <div id="s2v-qs-panel-script" role="tabpanel" aria-labelledby="s2v-qs-tab-script" className="s2v-ws2-body">
      <aside className="panel s2v-ws2-col" aria-label="Your script">
        <div>
          <h2>Your script</h2>
          <p className="hint" style={{ marginTop: 6 }}>Press Start video and the studio does the rest: scenes, character sheets, frames, clips and the final cut.</p>
        </div>
        {props.resumeNotice ? <div className="s2v-ws2-note" role="status">Your script is saved. The last Start did not finish before the page closed. Press Start video to pick up from here.</div> : null}
        <textarea
          className="textarea"
          value={props.text}
          onChange={(event) => props.onText(event.target.value)}
          rows={14}
          aria-label="Paste your script for one-press video"
          placeholder={'Paste your whole script here…\n\nTip: lines like “Scene 1 — Title | 10 sec” become scenes exactly as written. Plain prose is split into scenes for you, word for word.'}
          disabled={props.busy}
        />
        <div className="row wrap" style={{ gap: 6 }} aria-live="polite">
          <span className="chip">{words} word{words === 1 ? '' : 's'}</span>
          <span className="chip">{props.detectedScenes ? `${props.detectedScenes} scene${props.detectedScenes === 1 ? '' : 's'} from your headings` : 'Scenes split for you'}</span>
          <span className="chip">About {formatSeconds(props.seconds)}</span>
        </div>

        <details>
          <summary><Settings2 size={16} aria-hidden /> Look, shape and sound</summary>
          <div className="s2v-ws2-adv">
            <div className="field">
              <span className="label" id="s2v-qs-shape">Shape</span>
              <div className="seg" role="radiogroup" aria-labelledby="s2v-qs-shape">
                {(['16:9', '9:16', '1:1'] as Aspect[]).map((shape) => (
                  <button key={shape} type="button" role="radio" aria-checked={props.aspect === shape} className={props.aspect === shape ? 'on' : ''} onClick={() => props.onAspect(shape)}>{shape}</button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="label">Look — every image and clip is made in this style</span>
              <select className="select" value={props.styleId} onChange={(event) => props.onStyle(event.target.value)} aria-label="Visual look for one-press video">
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
              <select className="select" value={props.audioPolicy} onChange={(event) => props.onAudioPolicy(event.target.value)} aria-label="Sound for one-press video">
                {props.audioOptions.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={props.onOpenFullSetup}>
              Open the full step-by-step setup
            </button>
          </div>
        </details>
      </aside>

      <section className="s2v-ws2-stage" aria-label={props.busy ? 'Video progress' : 'Film preview'} aria-live="polite">
        <StageFrame aspect={props.aspect}>
          {props.busy ? (
            <ol className="s2v-ws2-run">
              <li className="is-done"><Check size={15} aria-hidden /><span>Script saved<small>Kept exactly as you wrote it.</small></span><span className="st">Done</span></li>
              <li className="is-running"><Loader2 size={15} className="s2v-run-spin" aria-hidden /><span>Split into scenes, character sheets and storyboard frames<small>This takes a few minutes for a long script.</small></span><span className="st">Running</span></li>
              <li><Circle size={12} aria-hidden /><span>Prepare scenes, generate clips and join<small>Starts automatically next.</small></span><span className="st">Waiting</span></li>
            </ol>
          ) : (
            <div className="s2v-ws2-empty">
              <span className="s2v-ws2-icon"><Clapperboard size={26} aria-hidden /></span>
              <h3>{hasText ? 'Ready when you are' : 'Your film appears here'}</h3>
              <p>{hasText
                ? `${props.detectedScenes ? `${props.detectedScenes} scene${props.detectedScenes === 1 ? '' : 's'}` : 'Scenes split for you'}, about ${formatSeconds(props.seconds)}, ${props.styleLabel} at ${props.aspect}. You see the cost before any clip is made.`
                : 'Paste a script on the left. Planning is free, and you see the cost before any clip is made.'}</p>
            </div>
          )}
        </StageFrame>
      </section>

      <aside className="panel s2v-ws2-col s2v-ws2-right" aria-label="Cost and start">
        <div className="col" style={{ gap: 6 }}>
          <span className="eyebrow">Cost before you start</span>
          <div className="s2v-ws2-cost"><b>{props.estimateCredits}</b> <span className="ink2">credits</span></div>
          <p className="hint">{props.balanceText}</p>
          <p className="hint">Real engine cost plus 30%. Failed renders are refunded.</p>
        </div>
        <div className="s2v-ws2-kv">
          <div><span>Length</span><b>About {formatSeconds(props.seconds)}</b></div>
          <div><span>Scenes</span><b>{props.detectedScenes || 'Split for you'}</b></div>
          <div><span>Look</span><b>{props.styleLabel}</b></div>
          <div><span>Shape</span><b>{props.aspect}</b></div>
          <div title={props.modelReason}><span>Model</span><b>{props.modelLabel}{props.modelRecommended ? <span className="pill gold" style={{ marginLeft: 6 }}>Best value</span> : null}</b></div>
        </div>
        <div className="field">
          <span className="label">Video model</span>
          <div className="s2v-ws2-model">{props.modelPicker}</div>
        </div>
        {props.costConfirm ? (
          <label className="s2v-ws2-note s2v-ws2-check">
            <input type="checkbox" checked={props.costConfirm.checked} onChange={(event) => props.costConfirm?.onChange(event.target.checked)} />
            <span>{props.costConfirm.message}</span>
          </label>
        ) : null}
        {props.error ? <div className="s2v-ws2-alert" role="alert">{props.error}</div> : null}
        {!props.canStart && props.disabledReason ? <p className="hint" style={{ color: 'var(--bad)' }}>{props.disabledReason}</p> : null}
        <button type="button" className="btn btn-gold btn-lg s2v-ws2-start" disabled={!props.canStart || props.busy} onClick={props.onStart}>
          {props.busy ? <Loader2 size={18} className="s2v-run-spin" aria-hidden /> : <Clapperboard size={18} aria-hidden />}
          {props.busy ? 'Starting…' : 'Start video'}
        </button>
      </aside>
    </div>
  );
}
