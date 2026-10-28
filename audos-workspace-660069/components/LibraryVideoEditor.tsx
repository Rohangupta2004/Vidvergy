import { useMemo, useState } from 'react';
import { Bot, Check, Clock3, History, Loader2, Music2, Palette, RotateCcw, Scissors, Type } from 'lucide-react';
import { callHook } from '../lib/workspace';
import type { VideoHistoryRow } from '../lib/videoHistory';

type EditKind = 'text' | 'timing' | 'music' | 'colour' | 'scenes';
interface EditLog { id: string; source: 'manual' | 'verger'; instruction: string; summary: string; at: string }

const kinds: Array<{ id: EditKind; label: string; icon: typeof Type }> = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'timing', label: 'Timing', icon: Clock3 },
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'colour', label: 'Colour', icon: Palette },
  { id: 'scenes', label: 'Scenes', icon: Scissors },
];

export default function LibraryVideoEditor({ row, onUpdated }: { row: VideoHistoryRow; onUpdated: (next: VideoHistoryRow) => void }) {
  const [kind, setKind] = useState<EditKind>('text');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('0');
  const [to, setTo] = useState('1');
  const [agentInstruction, setAgentInstruction] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [userEditing, setUserEditing] = useState(false);
  const [history, setHistory] = useState<EditLog[]>([]);

  const manualInstruction = useMemo(() => {
    if (kind === 'text') return value.trim() ? `Add caption "${value.trim()}"` : '';
    if (kind === 'timing') return `Trim off the first ${Math.max(0, Number(value) || 0)} seconds`;
    if (kind === 'music') return /^https:\/\//i.test(value.trim()) ? `Add music ${value.trim()}` : '';
    if (kind === 'colour') return value || 'warm retro colour grade';
    return `Remove from ${Math.max(0, Number(from) || 0)}s to ${Math.max(0, Number(to) || 0)}s`;
  }, [from, kind, to, value]);

  const apply = async (instruction: string, source: 'manual' | 'verger') => {
    if (!instruction.trim() || busy) return;
    if (source === 'verger' && userEditing) {
      setError('Your manual edit is active. Verger will not overwrite it; finish or blur the manual field, then apply the agent edit.');
      return;
    }
    setBusy(source); setError(''); setNotice('');
    try {
      const result = await callHook<any>('verger-edit-video', {
        action: 'edit',
        historyId: row.id,
        durationSec: row.duration_sec,
        instruction: instruction.trim(),
        expectedVideoUrl: row.video_url,
        source,
      });
      if (!result?.success || !result?.videoUrl) throw new Error(String(result?.question || result?.unsupported || result?.error || 'The edit returned no saved video.'));
      const next = { ...row, video_url: String(result.videoUrl), duration_sec: Number(result.durationSec) || row.duration_sec };
      onUpdated(next);
      setHistory((previous) => [{ id: String(result.previousVersion?.id || Date.now()), source, instruction, summary: String(result.summary || 'Edit autosaved.'), at: new Date().toISOString() }, ...previous]);
      setNotice(`${String(result.summary || 'Edit applied.')} Autosaved to this Library video.`);
      if (source === 'manual') setValue(''); else setAgentInstruction('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The edit failed.'); }
    finally { setBusy(''); }
  };

  const undo = async () => {
    if (busy) return;
    setBusy('undo'); setError(''); setNotice('');
    try {
      const result = await callHook<any>('verger-edit-video', { action: 'restore', historyId: row.id, expectedVideoUrl: row.video_url });
      if (!result?.success || !result?.videoUrl) throw new Error(String(result?.error || 'No recoverable version was found.'));
      onUpdated({ ...row, video_url: String(result.videoUrl) });
      setHistory((previous) => previous.slice(1));
      setNotice('Previous version restored. The restore itself is also recoverable.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Undo failed.'); }
    finally { setBusy(''); }
  };

  const fieldProps = { onFocus: () => setUserEditing(true), onBlur: () => setUserEditing(false) };

  return (
    <section className="border-t border-[var(--vg-border)] bg-[var(--vg-bg)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div><h3 className="text-sm font-semibold text-[var(--vg-text)]">Library editor</h3><p className="text-[10px] text-[var(--vg-muted)]">Manual and Verger edits use the same versioned server path.</p></div>
        <button type="button" onClick={() => void undo()} disabled={Boolean(busy)} className="ml-auto flex min-h-10 items-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] px-3 text-xs font-semibold text-[var(--vg-secondary)] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Undo</button>
      </div>

      <video key={row.video_url} src={row.video_url} controls playsInline className="mb-4 max-h-[42vh] w-full rounded-xl bg-black object-contain" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--vg-muted)]">Manual edit</p>
          <div className="mb-3 flex gap-1 overflow-x-auto pb-1">{kinds.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => { setKind(item.id); setValue(''); }} className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold ${kind === item.id ? 'bg-[var(--vg-accent-soft)] text-[var(--vg-accent)]' : 'text-[var(--vg-muted)]'}`}><Icon className="h-3.5 w-3.5" />{item.label}</button>; })}</div>
          {kind === 'text' ? <input {...fieldProps} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Caption text" className="min-h-11 w-full rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]" /> : null}
          {kind === 'timing' ? <input {...fieldProps} type="number" min="0" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Seconds to remove from the start" className="min-h-11 w-full rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]" /> : null}
          {kind === 'music' ? <input {...fieldProps} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Public MP3 or WAV URL" className="min-h-11 w-full rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]" /> : null}
          {kind === 'colour' ? <select {...fieldProps} value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 w-full rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]"><option value="warm retro colour grade">Warm</option><option value="faded colour grade">Faded</option><option value="black and white">Black & white</option><option value="vignette">Vignette</option></select> : null}
          {kind === 'scenes' ? <div className="grid grid-cols-2 gap-2"><input {...fieldProps} type="number" min="0" step="0.1" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Scene cut start" className="min-h-11 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]" /><input {...fieldProps} type="number" min="0" step="0.1" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Scene cut end" className="min-h-11 rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] px-3 text-sm text-[var(--vg-text)]" /></div> : null}
          <button type="button" onClick={() => void apply(manualInstruction, 'manual')} disabled={!manualInstruction || Boolean(busy)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[image:var(--vg-gradient-action)] text-sm font-semibold text-[var(--vg-on-accent)] disabled:opacity-40">{busy === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply & autosave</button>
        </div>

        <div className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] p-3">
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--vg-muted)]"><Bot className="h-3.5 w-3.5 text-[var(--vg-accent)]" /> Tell Verger what to change</p>
          <textarea value={agentInstruction} onChange={(event) => setAgentInstruction(event.target.value)} placeholder="Make the opening tighter, warm the colour and keep the caption exactly as it is." rows={5} className="w-full resize-y rounded-[10px] border border-[var(--vg-control-border)] bg-[var(--vg-bg)] p-3 text-sm text-[var(--vg-text)]" />
          <button type="button" onClick={() => void apply(agentInstruction, 'verger')} disabled={!agentInstruction.trim() || Boolean(busy) || userEditing} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--vg-control-border)] text-sm font-semibold text-[var(--vg-text)] disabled:opacity-40">{busy === 'verger' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4 text-[var(--vg-accent)]" />} Apply through Verger</button>
          {userEditing ? <p className="mt-2 text-[10px] text-[var(--vg-warning)]">Manual edit lock is active. Verger cannot overwrite it.</p> : null}
        </div>
      </div>

      {error ? <div role="alert" className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] bg-[var(--vg-danger-bg)] px-3 py-2 text-xs text-[var(--vg-danger)]">{error}</div> : null}
      {notice ? <div role="status" className="mt-3 rounded-[10px] border border-[color-mix(in_srgb,var(--vg-success)_35%,transparent)] bg-[color-mix(in_srgb,var(--vg-success)_10%,transparent)] px-3 py-2 text-xs text-[var(--vg-success)]">{notice}</div> : null}
      {history.length ? <div className="mt-3 rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] p-3"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[var(--vg-muted)]"><History className="h-3.5 w-3.5" /> Revert history</p>{history.map((entry) => <div key={entry.id} className="border-t border-[var(--vg-border)] py-2 text-[11px] text-[var(--vg-secondary)] first:border-0"><strong className="text-[var(--vg-text)]">{entry.source === 'manual' ? 'Manual' : 'Verger'}:</strong> {entry.summary}<span className="ml-2 text-[var(--vg-muted)]">{new Date(entry.at).toLocaleTimeString()}</span></div>)}</div> : null}
    </section>
  );
}
