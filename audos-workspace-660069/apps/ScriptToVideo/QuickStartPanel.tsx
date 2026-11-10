/**
 * The first screen of Script-to-Video: paste a script, press Start video.
 *
 * Presentational only — CreateFlow owns every value and builds the submit
 * payload, so this panel cannot drift from the full setup flow it sits above.
 * The pasted text is handed back exactly as typed (no trim, no rewrite).
 */
import type { ReactNode } from 'react';
import { Check, Circle, Clapperboard, Lightbulb, Loader2, ScrollText, Settings2 } from 'lucide-react';

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

export default function QuickStartPanel(props: QuickStartPanelProps) {
  const { tab, onTab } = props;
  return (
    <div className="s2v-qs">
      <div className="s2v-qs-tabs" role="tablist" aria-label="How to start">
        <button type="button" role="tab" id="s2v-qs-tab-script" aria-selected={tab === 'script'} aria-controls="s2v-qs-panel-script" className="s2v-qs-tab" onClick={() => onTab('script')}>
          <ScrollText size={15} aria-hidden /> Paste script
        </button>
        <button type="button" role="tab" id="s2v-qs-tab-idea" aria-selected={tab === 'idea'} className="s2v-qs-tab" onClick={() => onTab('idea')}>
          <Lightbulb size={15} aria-hidden /> Start from an idea
        </button>
      </div>
      {tab === 'script' ? <ScriptTab {...props} /> : null}
    </div>
  );
}

function ScriptTab(props: QuickStartPanelProps) {
  const words = props.wordCount;
  return (
    <div id="s2v-qs-panel-script" role="tabpanel" aria-labelledby="s2v-qs-tab-script" style={{ display: 'grid', gap: 14 }}>
      <section className="s2v-qs-card">
        <h2>Paste your script</h2>
        <p className="s2v-qs-hint">Your words are kept exactly as written. Press Start video and the studio does the rest: scenes, character sheets, frames, clips and the final cut.</p>
        {props.resumeNotice ? <div className="s2v-qs-note" role="status" style={{ marginBottom: 12 }}>Your script is saved. The last Start did not finish before the page closed — press Start video to pick up from here.</div> : null}
        <textarea
          className="s2v-qs-text"
          value={props.text}
          onChange={(event) => props.onText(event.target.value)}
          rows={14}
          aria-label="Paste your script for one-press video"
          placeholder={'Paste your whole script here…\n\nTip: lines like “Scene 1 — Title | 10 sec” become scenes exactly as written. Plain prose is split into scenes for you, word for word.'}
          disabled={props.busy}
        />
        <div className="s2v-qs-meta" aria-live="polite">
          <span className="s2v-qs-chip">{words} word{words === 1 ? '' : 's'}</span>
          <span className="s2v-qs-chip">{props.detectedScenes ? `${props.detectedScenes} scene${props.detectedScenes === 1 ? '' : 's'} from your headings` : 'Scenes split for you'}</span>
          <span className="s2v-qs-chip">About {formatSeconds(props.seconds)}</span>
          <span className="s2v-qs-chip">{props.styleLabel} · {props.aspect}</span>
          <span className={`s2v-qs-chip${props.modelRecommended ? ' is-accent' : ''}`} title={props.modelReason}>
            {props.modelLabel}{props.modelRecommended ? <span className="s2v-qs-badge">Recommended - best value</span> : null}
          </span>
        </div>

        <details className="s2v-qs-adv">
          <summary><Settings2 size={16} aria-hidden /> Advanced — look, shape, sound and model</summary>
          <div className="s2v-qs-adv-body">
            <div className="s2v-qs-field">
              <span id="s2v-qs-shape">Shape</span>
              <div className="s2v-qs-seg" role="radiogroup" aria-labelledby="s2v-qs-shape">
                {(['16:9', '9:16', '1:1'] as Aspect[]).map((shape) => (
                  <button key={shape} type="button" role="radio" aria-checked={props.aspect === shape} onClick={() => props.onAspect(shape)}>{shape}</button>
                ))}
              </div>
            </div>
            <label className="s2v-qs-field">
              <span>Look — every image and clip is made in this style</span>
              <select value={props.styleId} onChange={(event) => props.onStyle(event.target.value)} aria-label="Visual look for one-press video">
                {props.styleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            {props.styleId === 'custom' ? (
              <label className="s2v-qs-field">
                <span>Describe your look</span>
                <textarea rows={3} value={props.customStyle} onChange={(event) => props.onCustomStyle(event.target.value)} placeholder="Materials, camera, colour and mood…" />
              </label>
            ) : null}
            <label className="s2v-qs-field">
              <span>Sound</span>
              <select value={props.audioPolicy} onChange={(event) => props.onAudioPolicy(event.target.value)} aria-label="Sound for one-press video">
                {props.audioOptions.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.description}</option>)}
              </select>
            </label>
            <div className="s2v-qs-field">
              <span>Model</span>
              {props.modelPicker}
            </div>
            <button type="button" className="s2v-qs-tab" style={{ justifySelf: 'start', border: '1px solid var(--vg-border)' }} onClick={props.onOpenFullSetup}>
              Open the full step-by-step setup
            </button>
          </div>
        </details>
      </section>

      {props.busy ? (
        <section className="s2v-qs-card" aria-label="Video progress" aria-live="polite">
          <ol className="s2v-run-list">
            <li className="s2v-run-step is-done"><span className="s2v-run-icon" aria-hidden><Check size={15} /></span><span className="s2v-run-label">Script saved<span className="s2v-run-detail">Kept exactly as you wrote it.</span></span><span className="s2v-run-status">Done</span></li>
            <li className="s2v-run-step is-running"><span className="s2v-run-icon" aria-hidden><Loader2 size={15} className="s2v-run-spin" /></span><span className="s2v-run-label">Split into scenes, character sheets and storyboard frames<span className="s2v-run-detail">This takes a few minutes for a long script.</span></span><span className="s2v-run-status">Running</span></li>
            <li className="s2v-run-step is-pending"><span className="s2v-run-icon" aria-hidden><Circle size={12} /></span><span className="s2v-run-label">Prepare scenes, generate clips and join<span className="s2v-run-detail">Starts automatically next.</span></span><span className="s2v-run-status">Waiting</span></li>
          </ol>
        </section>
      ) : null}

      {props.costConfirm ? (
        <label className="s2v-qs-note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
          <input type="checkbox" checked={props.costConfirm.checked} onChange={(event) => props.costConfirm?.onChange(event.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
          <span>{props.costConfirm.message}</span>
        </label>
      ) : null}
      {props.error ? <div className="s2v-qs-alert" role="alert">{props.error}</div> : null}

      <div className="s2v-qs-bar">
        <div className="s2v-qs-bar-info">
          <strong>Estimate: {props.estimateCredits} credits</strong>
          <small>{props.balanceText}</small>
          {!props.canStart && props.disabledReason ? <small style={{ color: 'var(--vg-danger)' }}>{props.disabledReason}</small> : null}
        </div>
        <button type="button" className="s2v-qs-start" disabled={!props.canStart || props.busy} onClick={props.onStart}>
          {props.busy ? <Loader2 size={18} className="s2v-run-spin" aria-hidden /> : <Clapperboard size={18} aria-hidden />}
          {props.busy ? 'Starting…' : 'Start video'}
        </button>
      </div>
    </div>
  );
}
