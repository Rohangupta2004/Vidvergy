import { Check, Circle, Clock3, Film, Loader2, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Film as FilmRecord, FilmScene } from './api';

type StudioScreen = 'library' | 'create' | 'board' | 'final' | 'legacy';

const STEPS = [
  { label: 'Script', short: 'Script' },
  { label: 'Cast & plan', short: 'Plan' },
  { label: 'Make', short: 'Make' },
  { label: 'Finish', short: 'Finish' },
] as const;

function activeStep(screen: StudioScreen, film?: FilmRecord | null, scenes: FilmScene[] = []): number {
  if (screen === 'create') return 0;
  if (screen === 'final') return 3;
  if (screen !== 'board') return -1;
  const hasStarted = scenes.some((scene) => !['waiting', 'ready'].includes(String(scene.status)));
  if (hasStarted || film?.plan?.background?.enabled) return 2;
  return 1;
}

export function StudioStepper({ screen, film, scenes = [] }: { screen: StudioScreen; film?: FilmRecord | null; scenes?: FilmScene[] }) {
  const current = activeStep(screen, film, scenes);
  if (current < 0) return null;
  return (
    <nav className="s2v-stepper-wrap" aria-label="Film creation progress">
      <ol className="s2v-stepper">
        {STEPS.map((step, index) => {
          const complete = index < current;
          const active = index === current;
          return (
            <li key={step.label} className={`s2v-step${complete ? ' is-complete' : ''}${active ? ' is-active' : ''}`} aria-current={active ? 'step' : undefined}>
              <span className="s2v-step-dot" aria-hidden="true">{complete ? <Check size={12} strokeWidth={3} /> : <span>{index + 1}</span>}</span>
              <span className="s2v-step-label"><span className="s2v-step-full">{step.label}</span><span className="s2v-step-short">{step.short}</span></span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function sceneStatus(scene: FilmScene): 'done' | 'failed' | 'active' | 'waiting' {
  if (['completed', 'succeeded', 'skipped'].includes(String(scene.status))) return 'done';
  if (['failed', 'error', 'needs_action'].includes(String(scene.status))) return 'failed';
  if (['queued', 'submitted', 'processing', 'generating', 'retrying'].includes(String(scene.status))) return 'active';
  return 'waiting';
}

export function ProductionOverview({ film, scenes }: { film: FilmRecord; scenes: FilmScene[] }) {
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const done = ordered.filter((scene) => sceneStatus(scene) === 'done').length;
  const failed = ordered.filter((scene) => sceneStatus(scene) === 'failed').length;
  const active = ordered.find((scene) => sceneStatus(scene) === 'active');
  const percent = ordered.length ? Math.round((done / ordered.length) * 100) : 0;
  const remaining = Math.max(0, ordered.length - done);
  const durable = film.plan?.background?.enabled === true;
  const paused = film.plan?.orchestration?.paused === true;
  const headline = failed
    ? `${failed} scene${failed === 1 ? '' : 's'} need attention`
    : paused ? 'Production is paused safely'
      : active ? `Rendering scene ${active.idx + 1} of ${ordered.length}`
        : done === ordered.length && ordered.length ? 'Every scene is ready' : 'Production plan is ready';
  const estimate = remaining === 0
    ? 'Final assembly is next'
    : active ? `${remaining} scene${remaining === 1 ? '' : 's'} remaining · usually several minutes each`
      : 'Timing appears once the first provider job starts';

  return (
    <section className="s2v-production-overview" aria-labelledby="s2v-production-title">
      <div className="s2v-production-copy">
        <div className="s2v-eyebrow"><Sparkles size={13} /> Live production</div>
        <h2 id="s2v-production-title">{headline}</h2>
        <p>{film.stage_note || 'Your scene plan, prompts, references, and completed clips are saved as production moves forward.'}</p>
        <div className="s2v-production-meta" role="list" aria-label="Production details">
          <span role="listitem"><Clock3 size={13} /> {estimate}</span>
          <span role="listitem"><Save size={13} /> Progress saved after every checkpoint</span>
          <span role="listitem"><ShieldCheck size={13} /> {durable ? 'You can leave and come back — production continues' : 'Keep this tab open for the active signed-in render; saved work is safe'}</span>
        </div>
      </div>
      <div className="s2v-production-score" aria-label={`${percent}% of scenes complete`}>
        <span className="s2v-production-number">{percent}%</span>
        <span>{done}/{ordered.length} scenes</span>
      </div>
      <div className="s2v-production-bar" role="progressbar" aria-label="Overall production progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="s2v-scene-pills" aria-label="Per-scene status">
        {ordered.map((scene) => {
          const state = sceneStatus(scene);
          return <span key={scene.id} className={`s2v-scene-pill is-${state}`} title={`Scene ${scene.idx + 1}: ${String(scene.status).replace(/_/g, ' ')}`}>
            {state === 'done' ? <Check size={11} /> : state === 'active' ? <Loader2 size={11} className="animate-spin" /> : state === 'failed' ? <X size={11} /> : <Circle size={10} />}
            {scene.idx + 1}
          </span>;
        })}
      </div>
    </section>
  );
}

export function StudioToast({ message, tone = 'success', onDismiss }: { message: string; tone?: 'success' | 'danger' | 'info'; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className={`s2v-toast is-${tone}`} role={tone === 'danger' ? 'alert' : 'status'} aria-live={tone === 'danger' ? 'assertive' : 'polite'}>
      <span className="s2v-toast-icon">{tone === 'danger' ? <X size={14} /> : tone === 'info' ? <Film size={14} /> : <Check size={14} />}</span>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  );
}

export const STUDIO_CHROME_CSS = `
.s2v-app{--s2v-panel:color-mix(in srgb,var(--vg-surface) 92%,transparent);--s2v-hairline:color-mix(in srgb,var(--vg-control-border) 42%,transparent);color:var(--vg-text)}
.s2v-app::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(900px 420px at 76% -12%,color-mix(in srgb,var(--vg-accent) 11%,transparent),transparent 68%),radial-gradient(650px 360px at -8% 70%,color-mix(in srgb,var(--vg-bronze) 8%,transparent),transparent 72%);z-index:0}
.s2v-app>*{position:relative;z-index:1}
.s2v-topbar{background:color-mix(in srgb,var(--vg-bg) 86%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--s2v-hairline)!important}
.s2v-stepper-wrap{flex:0 0 auto;padding:10px 20px 11px;background:color-mix(in srgb,var(--vg-bg) 78%,transparent);border-bottom:1px solid var(--vg-border)}
.s2v-stepper{max-width:980px;margin:0 auto;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none}
.s2v-step{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;color:var(--vg-muted);font-size:12px;font-weight:650}
.s2v-step:not(:last-child)::after{content:"";position:absolute;left:calc(50% + 34px);right:calc(-50% + 34px);top:14px;height:1px;background:var(--vg-border)}
.s2v-step.is-complete:not(:last-child)::after{background:color-mix(in srgb,var(--vg-success) 60%,var(--vg-border))}
.s2v-step-dot{position:relative;z-index:1;width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--vg-border);border-radius:999px;background:var(--vg-bg);font:700 11px/1 var(--space-font-body)}
.s2v-step.is-active{color:var(--vg-text)}.s2v-step.is-active .s2v-step-dot{background:var(--vg-gradient-action);border-color:transparent;color:var(--vg-on-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--vg-accent) 13%,transparent)}
.s2v-step.is-complete{color:var(--vg-secondary)}.s2v-step.is-complete .s2v-step-dot{border-color:var(--vg-success);color:var(--vg-success);background:var(--vg-success-bg)}
.s2v-step-short{display:none}
.s2v-production-overview{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;margin:0 0 18px;padding:22px;border:1px solid color-mix(in srgb,var(--vg-accent) 34%,var(--vg-border));border-radius:16px;background:linear-gradient(145deg,color-mix(in srgb,var(--vg-raised) 96%,transparent),color-mix(in srgb,var(--vg-surface) 92%,transparent));overflow:hidden}
.s2v-production-overview::after{content:"";position:absolute;right:-100px;top:-120px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--vg-accent) 12%,transparent),transparent 68%);pointer-events:none}
.s2v-production-copy{min-width:0;position:relative;z-index:1}.s2v-eyebrow{display:flex;align-items:center;gap:6px;color:var(--vg-accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.s2v-production-copy h2{margin:7px 0 0;font:600 24px/31px var(--space-font-heading);letter-spacing:-.03em;color:var(--vg-text)}.s2v-production-copy p{max-width:720px;margin:7px 0 0;color:var(--vg-secondary);font-size:13px;line-height:1.55}
.s2v-production-meta{display:flex;gap:8px 14px;flex-wrap:wrap;margin-top:14px}.s2v-production-meta span{display:inline-flex;align-items:center;gap:6px;color:var(--vg-muted);font-size:12px;line-height:1.4}
.s2v-production-score{position:relative;z-index:1;min-width:96px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;color:var(--vg-muted);font-size:12px}.s2v-production-number{color:var(--vg-text);font:600 30px/34px var(--space-font-heading);letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.s2v-production-bar{grid-column:1/-1;height:6px;border-radius:999px;background:var(--vg-bg);overflow:hidden}.s2v-production-bar>span{display:block;height:100%;border-radius:inherit;background:var(--vg-gradient-action);transition:width 480ms cubic-bezier(.2,0,0,1)}
.s2v-scene-pills{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}.s2v-scene-pill{min-width:30px;height:26px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--vg-border);border-radius:7px;background:var(--vg-bg);color:var(--vg-muted);font-size:12px;font-weight:750;font-variant-numeric:tabular-nums}.s2v-scene-pill.is-done{border-color:color-mix(in srgb,var(--vg-success) 45%,var(--vg-border));color:var(--vg-success)}.s2v-scene-pill.is-active{border-color:var(--vg-accent);color:var(--vg-accent);background:var(--vg-accent-soft)}.s2v-scene-pill.is-failed{border-color:var(--vg-danger);color:var(--vg-danger);background:var(--vg-danger-bg)}
.s2v-toast{position:fixed;z-index:120;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));width:min(420px,calc(100vw - 32px));display:flex;align-items:flex-start;gap:10px;padding:13px 12px 13px 14px;border:1px solid var(--vg-border);border-radius:12px;background:color-mix(in srgb,var(--vg-raised) 96%,transparent);box-shadow:0 18px 50px color-mix(in srgb,var(--vg-text) 24%,transparent);color:var(--vg-text);font-size:13px;line-height:1.45;animation:s2v-toast-in 180ms cubic-bezier(.2,0,0,1)}
.s2v-toast.is-success{border-color:color-mix(in srgb,var(--vg-success) 55%,var(--vg-border))}.s2v-toast.is-danger{border-color:color-mix(in srgb,var(--vg-danger) 70%,var(--vg-border))}.s2v-toast.is-info{border-color:color-mix(in srgb,var(--vg-accent) 55%,var(--vg-border))}.s2v-toast-icon{width:24px;height:24px;display:grid;place-items:center;flex:0 0 auto;border-radius:7px;background:var(--vg-accent-soft);color:var(--vg-accent)}.s2v-toast.is-danger .s2v-toast-icon{background:var(--vg-danger-bg);color:var(--vg-danger)}.s2v-toast>span:nth-child(2){flex:1;padding-top:2px}.s2v-toast button{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--vg-muted)}.s2v-toast button:hover{background:var(--vg-hover);color:var(--vg-text)}
.s2v-error-banner{display:flex;align-items:center;gap:10px;padding:11px 20px;border-bottom:1px solid color-mix(in srgb,var(--vg-danger) 52%,var(--vg-border));background:var(--vg-danger-bg);color:var(--vg-text);font-size:12.5px;line-height:1.5}.s2v-error-banner>span{flex:1}.s2v-error-banner button{min-height:38px!important;padding:0 12px;border:1px solid var(--vg-danger);border-radius:9px;background:transparent;color:var(--vg-text);font-weight:700}
.s2v-result-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.s2v-result-primary{background:var(--vg-gradient-action)!important;color:var(--vg-on-accent)!important;border-color:transparent!important;box-shadow:0 8px 28px color-mix(in srgb,var(--vg-accent) 18%,transparent)}
.s2v-library-shell .s2v-row{margin-bottom:8px!important;border:1px solid var(--vg-border)!important;border-radius:12px!important;background:color-mix(in srgb,var(--vg-surface) 86%,transparent)!important;padding:12px!important}.s2v-library-shell .s2v-row:hover{border-color:color-mix(in srgb,var(--vg-accent) 38%,var(--vg-border))!important;background:var(--vg-raised)!important}.s2v-library-shell .s2v-row:focus-visible{outline:2px solid var(--vg-focus);outline-offset:3px}
.s2v-create-inner>details{transition:border-color 180ms cubic-bezier(.2,0,0,1),background 180ms cubic-bezier(.2,0,0,1)}.s2v-create-inner>details:hover{border-color:color-mix(in srgb,var(--vg-accent) 38%,var(--vg-border))!important}.s2v-scene-rail{background:color-mix(in srgb,var(--vg-bg) 74%,transparent);backdrop-filter:blur(12px)}.s2v-board-panel{background:linear-gradient(180deg,color-mix(in srgb,var(--vg-accent) 2%,transparent),transparent 280px)}
@keyframes s2v-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(max-width:767px){.s2v-stepper-wrap{padding:9px 12px 10px}.s2v-step{gap:5px;font-size:12px}.s2v-step-dot{width:26px;height:26px}.s2v-step:not(:last-child)::after{left:calc(50% + 27px);right:calc(-50% + 27px);top:13px}.s2v-step-full{display:none}.s2v-step-short{display:inline}.s2v-production-overview{grid-template-columns:minmax(0,1fr);padding:17px}.s2v-production-score{position:absolute;right:17px;top:16px;align-items:flex-end}.s2v-production-number{font-size:23px;line-height:26px}.s2v-production-copy h2{padding-right:76px;font-size:20px;line-height:27px}.s2v-production-meta{display:grid;gap:7px}.s2v-toast{right:16px;bottom:calc(88px + env(safe-area-inset-bottom))}.s2v-error-banner{align-items:flex-start;padding:10px 14px;flex-wrap:wrap}.s2v-error-banner button{margin-left:24px}}
@media(max-width:430px){.s2v-step-label{display:none}.s2v-step:not(:last-child)::after{left:calc(50% + 20px);right:calc(-50% + 20px)}}
@media(prefers-reduced-motion:reduce){.s2v-toast,.s2v-production-bar>span{animation:none!important;transition:none!important}}
`;

export default StudioStepper;
