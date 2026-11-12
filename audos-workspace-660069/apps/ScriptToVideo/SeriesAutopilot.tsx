/**
 * Weekly autopilot — "One video every Monday on this topic".
 *
 * The dialog turns a finished film into a weekly series (same model, frame,
 * length, look and cast), shows the real per-episode credit quote first, and
 * saves it through the s2v-series server function. The Library panel lists
 * the customer's series with Pause / Resume / Cancel and the last outcome.
 * Episodes are made server-side by s2v-series-weekly, credit-checked before
 * every run; a short wallet skips that week and nothing is charged.
 */
import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Pause, Play, X } from 'lucide-react';
import { T } from './api';
import type { Film } from './api';
import { callS2vHook } from './friendlyErrors';

export interface WeeklySeries {
  id: number;
  title: string;
  topic: string;
  status: 'active' | 'paused' | 'cancelled';
  weekday: number;
  hour_local: number;
  timezone: string;
  credit_cap: number;
  episodes: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_film_id: number | null;
  template: { source_title?: string; model_id?: string; model_note?: string; aspect?: string; target_seconds?: number; cast?: Array<{ id: string; name: string; url: string }> };
}

interface Quote { credits: number | null; balance: number | null; exempt: boolean; blocks: number; seconds: number }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`;
}

function statusLine(series: WeeklySeries): string {
  const when = `${DAYS[Math.max(0, Math.min(6, series.weekday - 1))]}s at ${hourLabel(series.hour_local)}`;
  if (series.status === 'paused') return `Paused · normally ${when}`;
  const last = series.last_status === 'started' ? 'last episode started'
    : series.last_status === 'skipped_credits' ? 'last week skipped — not enough credits'
      : series.last_status === 'over_cap' ? 'last week skipped — above your credit cap'
        : series.last_status === 'failed' ? 'last week could not be made'
          : series.last_status === 'planning' ? 'making this week’s episode now' : 'first episode on the next slot';
  return `${when} · ${series.episodes} episode${series.episodes === 1 ? '' : 's'} · ${last}`;
}

const field = { width: '100%', boxSizing: 'border-box' as const, background: T.canvas, color: T.bone, border: `1px solid ${T.dim}`, borderRadius: 10, padding: '10px 12px', font: 'inherit', fontSize: 13.5 };
const button = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, padding: '8px 14px', borderRadius: 10, border: `1px solid ${T.dim}`, background: T.canvas, color: T.bone, fontSize: 12.5, fontWeight: 750, cursor: 'pointer' } as const;
const primary = { ...button, background: 'var(--vg-gradient-action, var(--vg-accent))', color: 'var(--vg-on-btn)', border: 'none' } as const;

export function WeeklyAutopilotDialog({ film, onClose, onCreated }: { film: Film; onClose: () => void; onCreated?: (series: WeeklySeries) => void }) {
  const [topic, setTopic] = useState(() => String(film.plan?.story_summary || film.title || '').slice(0, 400));
  const [title, setTitle] = useState(() => String(film.title || 'My weekly video').replace(/\s+—\s+(?:Episode \d+|new take)$/i, '').slice(0, 120));
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(9);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [cap, setCap] = useState<number>(0);
  const [modelNote, setModelNote] = useState('');
  const [state, setState] = useState<'quoting' | 'ready' | 'saving' | 'done' | 'error'>('quoting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    void callS2vHook<{ ok?: boolean; quote?: Quote; template?: WeeklySeries['template']; error?: string }>('s2v-series', { op: 'quote', filmId: film.id })
      .then((result) => {
        if (!live) return;
        if (!result?.ok) { setState('error'); setMessage(result?.error || 'The weekly price could not be checked.'); return; }
        setQuote(result.quote || null);
        setCap(Math.max(0, Math.ceil(Number(result.quote?.credits) || 0)));
        setModelNote(String(result.template?.model_note || ''));
        setState('ready');
      })
      .catch((error: any) => { if (live) { setState('error'); setMessage(String(error?.message || 'The weekly price could not be checked.')); } });
    return () => { live = false; };
  }, [film.id]);

  const save = async () => {
    setState('saving'); setMessage('');
    try {
      const result = await callS2vHook<{ ok?: boolean; series?: WeeklySeries; error?: string }>('s2v-series', {
        op: 'create', filmId: film.id, topic: topic.trim(), title: title.trim(), weekday, hourLocal: hour,
        utcOffsetMin: -new Date().getTimezoneOffset(),
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })(),
        creditCap: cap,
      });
      if (!result?.ok || !result.series) throw new Error(result?.error || 'The weekly series could not be saved.');
      setState('done');
      setMessage(`Saved. A new episode of “${result.series.title}” starts every ${DAYS[weekday - 1]} at ${hourLabel(hour)}.`);
      onCreated?.(result.series);
    } catch (error: any) {
      setState('error'); setMessage(String(error?.message || 'The weekly series could not be saved.'));
    }
  };

  const credits = quote?.credits;
  const short = quote && !quote.exempt && quote.balance != null && credits != null && quote.balance < credits;
  return (
    <div role="dialog" aria-modal="true" aria-label="Make this weekly" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'color-mix(in srgb, var(--vg-bg) 72%, transparent)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: T.canvas, border: `1px solid ${T.dim}`, borderRadius: 16, padding: 22, boxShadow: '0 30px 70px rgba(0,0,0,0.45)', color: T.bone, fontFamily: T.sans }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <CalendarClock size={20} color={T.live} aria-hidden="true" />
          <div style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Make this weekly</div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ ...button, minHeight: 34, padding: 6 }}><X size={14} /></button>
        </div>
        <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>One new video every week on your topic, with the same look, cast, frame and length as “{film.title || 'this film'}”. Each episode is credit-checked before it starts, and skipped (nothing charged) if your wallet is short.</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>Series name<input style={{ ...field, marginTop: 6 }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>Every episode is about<textarea rows={3} style={{ ...field, marginTop: 6, resize: 'vertical' }} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. One quick golf swing tip for weekend players" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>Day<select style={{ ...field, marginTop: 6 }} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>Time (your time)<select style={{ ...field, marginTop: 6 }} value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></label>
          </div>
          <div style={{ borderRadius: 12, border: `1px solid ${T.line}`, padding: '10px 12px', background: T.raised, fontSize: 12.5, lineHeight: 1.55 }}>
            {state === 'quoting' ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: T.muted }}><Loader2 size={14} aria-hidden="true" /> Checking the weekly price…</span> : quote ? (
              <>
                <div><b>{credits == null ? 'Price unavailable' : quote.exempt ? 'No credits charged on this account' : `About ${credits} credits per episode`}</b> · {quote.blocks} clip{quote.blocks === 1 ? '' : 's'}, {quote.seconds}s</div>
                {quote.balance != null && !quote.exempt ? <div style={{ color: short ? T.fault : T.muted }}>Your balance: {quote.balance} credits{short ? ' — add credits before the first episode or it will be skipped.' : ''}</div> : null}
                {modelNote ? <div style={{ color: T.muted }}>{modelNote}</div> : null}
                <div style={{ color: T.dim }}>Weekly episodes keep each clip’s own sound (no music bed or voice-over mix), so they finish on our servers with your browser closed.</div>
              </>
            ) : null}
          </div>
          {!quote?.exempt ? <label style={{ fontSize: 12, fontWeight: 700, color: T.dim }}>Never spend more than (credits per episode)<input type="number" min={1} style={{ ...field, marginTop: 6 }} value={cap || ''} onChange={(e) => setCap(Math.max(0, Math.round(Number(e.target.value) || 0)))} /></label> : null}
          {message ? <div role={state === 'error' ? 'alert' : 'status'} style={{ color: state === 'error' ? T.fault : T.done, fontSize: 12.5 }}>{message}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" style={button} onClick={onClose}>{state === 'done' ? 'Close' : 'Cancel'}</button>
            {state !== 'done' ? <button type="button" style={primary} disabled={state === 'saving' || state === 'quoting' || topic.trim().length < 4} onClick={() => void save()}>{state === 'saving' ? <Loader2 size={14} aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />} Start weekly autopilot</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeeklyAutopilotList({ refreshKey, onOpenFilm }: { refreshKey?: number; onOpenFilm?: (filmId: number) => void }) {
  const [series, setSeries] = useState<WeeklySeries[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void callS2vHook<{ ok?: boolean; series?: WeeklySeries[] }>('s2v-series', { op: 'list' })
      .then((result) => { if (live && result?.ok) setSeries(Array.isArray(result.series) ? result.series : []); })
      .catch(() => { if (live) setSeries([]); });
    return () => { live = false; };
  }, [refreshKey]);

  const update = async (item: WeeklySeries, status: WeeklySeries['status']) => {
    if (status === 'cancelled' && !window.confirm(`Cancel “${item.title}”? No more weekly episodes will be made. Episodes already made stay in your library.`)) return;
    setBusyId(item.id); setError('');
    try {
      const result = await callS2vHook<{ ok?: boolean; series?: WeeklySeries; error?: string }>('s2v-series', { op: 'update', seriesId: item.id, status });
      if (!result?.ok) throw new Error(result?.error || 'The series could not be updated.');
      setSeries((list) => status === 'cancelled' ? list.filter((s) => s.id !== item.id) : list.map((s) => (s.id === item.id ? { ...s, ...(result.series || {}), status } : s)));
    } catch (caught: any) {
      setError(String(caught?.message || 'The series could not be updated.'));
    } finally { setBusyId(null); }
  };

  if (!series.length) return null;
  return (
    <section aria-label="Weekly autopilot" style={{ marginBottom: 20, border: `1px solid color-mix(in srgb, ${T.live} 35%, transparent)`, borderRadius: 14, padding: '12px 14px', background: `color-mix(in srgb, ${T.live} 5%, ${T.raised})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.bone, fontSize: 13.5, fontWeight: 800 }}><CalendarClock size={15} color={T.live} aria-hidden="true" /> Weekly autopilot</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {series.map((item) => (
          <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 10, background: T.canvas, border: `1px solid ${T.line}` }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ color: T.bone, fontSize: 13, fontWeight: 700 }}>{item.title}</div>
              <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>{item.topic.slice(0, 120)}</div>
              <div style={{ color: item.last_status === 'failed' || item.last_status === 'skipped_credits' || item.last_status === 'over_cap' ? T.fault : T.dim, fontSize: 11.5, marginTop: 3 }}>{statusLine(item)}{item.credit_cap ? ` · cap ${item.credit_cap} credits` : ''}</div>
            </div>
            {item.last_film_id && onOpenFilm ? <button type="button" style={button} onClick={() => onOpenFilm(item.last_film_id!)}>Latest episode</button> : null}
            {item.status === 'active'
              ? <button type="button" style={button} disabled={busyId === item.id} onClick={() => void update(item, 'paused')}><Pause size={13} aria-hidden="true" /> Pause</button>
              : <button type="button" style={button} disabled={busyId === item.id} onClick={() => void update(item, 'active')}><Play size={13} aria-hidden="true" /> Resume</button>}
            <button type="button" style={{ ...button, color: T.fault }} disabled={busyId === item.id} onClick={() => void update(item, 'cancelled')}><X size={13} aria-hidden="true" /> Cancel</button>
          </div>
        ))}
      </div>
      {error ? <div role="alert" style={{ color: T.fault, fontSize: 12, marginTop: 8 }}>{error}</div> : null}
    </section>
  );
}
