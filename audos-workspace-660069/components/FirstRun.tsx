import { useState } from 'react';
import { Clapperboard, Film, MonitorPlay, Rocket, Sparkles, UserRound } from 'lucide-react';
import { saveVidvergeHandoff } from '../lib/vidvergeHandoff';

const KEY = 'vidverge:first-run:v1';
const choices = [
  { id: 'script-to-video', title: 'Ad from a script', sample: 'Make a 30-second vertical product ad from this sample script.', Icon: Clapperboard },
  { id: 'ugc-studio', title: 'UGC ad with an actor', sample: 'Make a 15-second creator-style product demo with a friendly regional actor.', Icon: UserRound },
  { id: 'video-enhancer', title: 'Edit my video', sample: 'Turn my footage into a sharp vertical short with captions and clean pacing.', Icon: MonitorPlay },
  { id: 'motion-launch', title: 'Launch video for my product', sample: 'Make a 30-second launch film from my product screenshots and key message.', Icon: Rocket },
  { id: 'faceless', title: 'Faceless video', sample: 'Make a 45-second faceless explainer with narration and cinematic B-roll.', Icon: Film },
] as const;

export default function FirstRun({ sessionId }: { sessionId?: string }) {
  const [step, setStep] = useState(1); const [choice, setChoice] = useState<(typeof choices)[number] | null>(null); const [done, setDone] = useState(() => { try { return localStorage.getItem(KEY) === 'done'; } catch { return false; } });
  if (!sessionId || done) return null;
  const finish = () => {
    if (!choice) return;
    try { localStorage.setItem(KEY, 'done'); } catch {}
    saveVidvergeHandoff({ appId: choice.id, prompt: choice.sample, attachment: null });
    window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: 'vidverge-agent' } }));
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('verger:bridge-open', { detail: { appId: choice.id, view: 'popup', nonce: `first-run-${Date.now()}` } })), 500);
    setDone(true);
  };
  return <div className="fixed inset-0 z-[160] grid place-items-center bg-[color-mix(in_srgb,var(--vg-bg)_90%,transparent)] p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Welcome to Vidverge"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--vg-control-border)] bg-[var(--vg-surface)] p-5 shadow-2xl sm:p-8">
    <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--vg-accent-soft)] text-[var(--vg-accent)]"><Sparkles size={20}/></div><div><p className="text-xs font-semibold text-[var(--vg-accent)]">Welcome to Vidverge</p><p className="text-sm text-[var(--vg-secondary)]">Pay per use — real engine cost + 30%, exact credits shown first</p></div></div>
    {step===1?<><h1 className="mt-7 text-[32px] font-extrabold leading-[38px] tracking-[-.03em]">What do you want to make first?</h1><div className="mt-5 grid gap-3 sm:grid-cols-2">{choices.map((item)=><button key={item.id} type="button" onClick={()=>setChoice(item)} className={`flex min-h-24 items-center gap-4 rounded-xl border p-4 text-left ${choice?.id===item.id?'border-[var(--vg-selected)] bg-[var(--vg-selected-soft)]':'border-[var(--vg-border)] bg-[var(--vg-raised)] hover:bg-[var(--vg-hover)]'}`}><item.Icon size={22} className={choice?.id===item.id?'text-[var(--vg-selected)]':'text-[var(--vg-secondary)]'}/><span className="font-bold">{item.title}</span></button>)}</div><button type="button" disabled={!choice} onClick={()=>setStep(2)} className="vg-primary-action mt-6 w-full px-5 disabled:opacity-40">Continue</button></>:<><h1 className="mt-7 text-[32px] font-extrabold leading-[38px] tracking-[-.03em]">Set up your brand in 1 minute</h1><p className="mt-3 text-sm leading-6 text-[var(--vg-secondary)]">Your Brand doc keeps your name, voice, palette, products and real logo consistent across every studio. Say “for my brand” anywhere and it is filled in for you. Finish it now or skip and return from Verge later.</p><div className="mt-5 rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-5"><p className="text-xs text-[var(--vg-muted)]">Preview</p><h2 className="mt-2 text-xl font-bold">Your brand, reused automatically</h2><p className="mt-2 text-sm text-[var(--vg-secondary)]">Verger applies it to scripts, generated shots, captions and end cards without redrawing your product UI or logo.</p></div><div className="mt-6 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={()=>{ try { localStorage.setItem(KEY, 'done'); } catch {} setDone(true); window.dispatchEvent(new CustomEvent('openApp',{detail:{appId:'brand-context'}})); }} className="min-h-11 flex-1 rounded-lg border border-[var(--vg-control-border)] px-4 font-semibold">Open Brand doc</button><button type="button" onClick={finish} className="vg-primary-action min-h-11 flex-1 px-4">Try the sample</button></div><button type="button" onClick={finish} className="mt-3 min-h-11 w-full text-sm text-[var(--vg-muted)]">Skip brand setup for now</button></>}
  </div></div>;
}
