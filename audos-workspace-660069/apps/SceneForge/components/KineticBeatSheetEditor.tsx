import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Film, Loader2, RefreshCw, Save, Trash2, Zap } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import type { KineticBeat, KineticBeatSheet, KineticBeatType, KineticVisualMode, KineticVisualSegment, KineticWord } from '../lib/forgeTypes';
import { FORGE_OPUS_MODEL } from '../lib/forgeModels';
import { safeErrorText } from '../lib/safeError';

const TYPES: KineticBeatType[] = ['nameTag', 'checklist', 'equation', 'pillsIcons', 'bigWord', 'flowCard', 'meter', 'compareRows', 'thought', 'gauge', 'notePoint', 'stepCard', 'strike', 'brandCard', 'counter', 'ctaCard'];
const VISUAL_MODES: KineticVisualMode[] = ['broll', 'split', 'graphicFull', 'avatar', 'avatarPiP'];

function displayTime(seconds: number): string {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

function beatText(beat: KineticBeat): string {
  const p = beat.props || {};
  if (typeof p.title === 'string') return p.title;
  if (typeof p.label === 'string') return p.label;
  if (typeof p.headline?.text === 'string') return p.headline.text;
  if (typeof p.note?.text === 'string') return p.note.text;
  if (typeof p.line?.text === 'string') return p.line.text;
  if (Array.isArray(p.lines)) return p.lines.map((line: any) => line?.text || '').filter(Boolean).join(' / ');
  if (Array.isArray(p.steps)) return p.steps.map((step: any) => step?.text || '').filter(Boolean).join(' / ');
  return '';
}

function withText(beat: KineticBeat, value: string): KineticBeat {
  const props = { ...(beat.props || {}) };
  if (typeof props.title === 'string') props.title = value;
  else if (typeof props.label === 'string') props.label = value;
  else if (props.headline && typeof props.headline === 'object') props.headline = { ...props.headline, text: value };
  else if (props.note && typeof props.note === 'object') props.note = { ...props.note, text: value };
  else if (Array.isArray(props.lines) && props.lines.length) props.lines = [{ ...props.lines[0], text: value }, ...props.lines.slice(1)];
  else props.title = value;
  return { ...beat, props };
}

function propsFor(type: KineticBeatType, text: string, anchor: number): Record<string, any> {
  const short = text.trim().slice(0, 48) || 'Key point';
  if (type === 'bigWord') return { lines: [{ text: short.slice(0, 12), size: 1 }], tone: 'key' };
  if (type === 'checklist') return { title: short, items: [{ label: short.slice(0, 16), value: '', anchorWord: anchor }] };
  if (type === 'flowCard') return { steps: [{ icon: 'arrow-right', text: short, anchorWord: anchor }] };
  if (type === 'ctaCard') return { headline: { text: short, anchorWord: anchor }, sub: { text: '', anchorWord: anchor }, badge: { text: 'LEARN MORE', anchorWord: anchor }, url: '' };
  if (type === 'stepCard') return { n: 1, title: short };
  if (type === 'notePoint') return { note: { text: short, anchorWord: anchor }, label: 'KEY POINT', lines: [] };
  return { title: short };
}

export default function KineticBeatSheetEditor({ words, value, busy, onSave, onApprove }: {
  words: KineticWord[];
  value: KineticBeatSheet;
  busy: boolean;
  onSave: (next: KineticBeatSheet) => Promise<void>;
  onApprove: (next: KineticBeatSheet) => Promise<void>;
}) {
  const [sheet, setSheet] = useState(value);
  const [selected, setSelected] = useState(value.beats[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSheet(value); setSelected((current) => value.beats.some((beat) => beat.id === current) ? current : value.beats[0]?.id || ''); }, [value]);
  const selectedBeat = sheet.beats.find((beat) => beat.id === selected) || null;
  const selectedRange = useMemo(() => selectedBeat ? new Set(Array.from({ length: Math.max(1, selectedBeat.endWord - selectedBeat.startWord + 1) }, (_, index) => selectedBeat.startWord + index)) : new Set<number>(), [selectedBeat]);

  const commit = async (approve: boolean) => {
    setSaving(true); setError('');
    try { await (approve ? onApprove(sheet) : onSave(sheet)); }
    catch (reason: any) { setError(String(reason?.message || reason || 'The beat sheet could not be saved.')); }
    finally { setSaving(false); }
  };

  const patchBeat = (id: string, patch: Partial<KineticBeat>) => setSheet((current) => ({ ...current, beats: current.beats.map((beat) => beat.id === id ? { ...beat, ...patch } : beat) }));
  const plan = sheet.creativePlan;
  const patchSegment = (id: string, patch: Partial<KineticVisualSegment>) => setSheet((current) => current.creativePlan ? ({ ...current, creativePlan: { ...current.creativePlan, visualTrack: current.creativePlan.visualTrack.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) } }) : current);
  const removeSegment = (id: string) => setSheet((current) => {
    if (!current.creativePlan) return current;
    const index = current.creativePlan.visualTrack.findIndex((segment) => segment.id === id);
    if (index < 0 || current.creativePlan.visualTrack.length === 1) return current;
    const removed = current.creativePlan.visualTrack[index];
    const visualTrack = current.creativePlan.visualTrack.filter((segment) => segment.id !== id).map((segment, nextIndex) => nextIndex === Math.max(0, index - 1) ? (index > 0 ? { ...segment, endWord: removed.endWord } : { ...segment, startWord: removed.startWord }) : segment);
    return { ...current, creativePlan: { ...current.creativePlan, visualTrack } };
  });
  const requestClipRegeneration = (clipId: string) => setSheet((current) => current.creativePlan ? ({ ...current, creativePlan: { ...current.creativePlan, clips: current.creativePlan.clips.map((clip) => clip.id === clipId ? { ...clip, status: 'queued', urls: {}, regenRequestedAt: new Date().toISOString() } : clip) } }) : current);
  const replaceClipPrompt = (clipId: string) => {
    const clip = plan?.clips.find((item) => item.id === clipId);
    if (!clip) return;
    const prompt = window.prompt('Describe the replacement scene. Do not request text, numbers, logos, QR codes, readable UI, a real person or a real brand.', clip.prompt);
    if (prompt == null || !prompt.trim()) return;
    setSheet((current) => current.creativePlan ? ({ ...current, creativePlan: { ...current.creativePlan, clips: current.creativePlan.clips.map((item) => item.id === clipId ? { ...item, prompt: prompt.trim(), status: 'queued', urls: {}, regenRequestedAt: new Date().toISOString() } : item) } }) : current);
  };
  const removeClip = (clipId: string) => setSheet((current) => current.creativePlan ? ({ ...current, creativePlan: { ...current.creativePlan, clips: current.creativePlan.clips.filter((clip) => clip.id !== clipId), visualTrack: current.creativePlan.visualTrack.map((segment) => ({ ...segment, clipIds: segment.clipIds.filter((id) => id !== clipId), mode: segment.clipIds.includes(clipId) && segment.clipIds.length === 1 && (segment.mode === 'broll' || segment.mode === 'split') ? 'graphicFull' : segment.mode })) } }) : current);

  return (
    <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.card, display: 'grid', gap: 14, padding: 16 }} data-testid="kinetic-beat-sheet">
      <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ alignItems: 'center', color: COLORS.text, display: 'flex', fontFamily: FONT.heading, fontSize: 17, gap: 8, margin: 0 }}><Zap size={17} color={COLORS.accent} /> Review the Kinetic Reel Creative Plan</h3>
          <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '5px 0 0' }}>The spoken script stays locked. Review the cold open, avatar timing, visual track, generated clips and the existing word-anchored cards before full generation.</p>
        </div>
        <details style={{ color: COLORS.muted, fontSize: 11.5 }}><summary style={{ cursor: 'pointer' }}>Director details</summary><span style={{ display: 'block', marginTop: 5 }}>Planner: {sheet.planner || FORGE_OPUS_MODEL}</span></details>
      </div>

      {plan ? <div style={{ display: 'grid', gap: 10 }} data-testid="kinetic-creative-plan-v2">
        <div style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, display: 'grid', gap: 6, padding: 12 }}>
          <span style={{ color: COLORS.accent, fontFamily: FONT.heading, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Chosen opening · {plan.summary.chosenOpening}</span>
          <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>{plan.summary.why}</strong>
          <span style={{ color: COLORS.secondary, fontSize: 12 }}>Avatar reveal: word {plan.summary.avatarRevealWord} · {displayTime(words[plan.summary.avatarRevealWord]?.s || 0)}</span>
          {plan.summary.openingOptions?.length ? <div style={{ display: 'grid', gap: 5, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 4 }}>{plan.summary.openingOptions.slice(0, 3).map((option) => <div key={`${option.type}-${option.summary}`} style={{ background: COLORS.input, border: `1px solid ${option.type === plan.summary.chosenOpening ? COLORS.accent : COLORS.border}`, borderRadius: 8, color: COLORS.secondary, fontSize: 11.5, lineHeight: '16px', padding: 8 }}><strong style={{ color: option.type === plan.summary.chosenOpening ? COLORS.accent : COLORS.text, display: 'block', marginBottom: 3 }}>{option.type}</strong>{option.summary}</div>)}</div> : null}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {plan.visualTrack.map((segment) => {
            const start = words[segment.startWord];
            const end = words[segment.endWord];
            const line = words.slice(segment.startWord, segment.endWord + 1).map((word) => word.d || word.w).join(' ');
            return <article key={segment.id} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, display: 'grid', gap: 8, padding: 10 }}>
              <div style={{ alignItems: 'center', display: 'grid', gap: 8, gridTemplateColumns: '80px minmax(125px,170px) minmax(180px,1fr) 38px' }}>
                <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{displayTime(start?.s || 0)}–{displayTime(end?.e || 0)}</span>
                <select value={segment.mode} aria-label={`Visual mode for ${segment.id}`} onChange={(event) => patchSegment(segment.id, { mode: event.target.value as KineticVisualMode })} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: 8, color: COLORS.text, minHeight: 36, padding: '0 8px' }}>{VISUAL_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>
                <input value={segment.reason} aria-label={`Reason for ${segment.id}`} onChange={(event) => patchSegment(segment.id, { reason: event.target.value })} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: 8, color: COLORS.text, minHeight: 36, minWidth: 0, padding: '0 9px' }} />
                <button type="button" aria-label={`Delete visual segment ${segment.id}`} onClick={() => removeSegment(segment.id)} style={{ alignItems: 'center', background: 'transparent', border: `1px solid ${COLORS.danger}`, borderRadius: 8, color: COLORS.danger, cursor: 'pointer', display: 'flex', height: 36, justifyContent: 'center' }}><Trash2 size={14} /></button>
              </div>
              <span style={{ color: COLORS.secondary, fontSize: 12, lineHeight: '17px' }}>“{line}”</span>
              {segment.clipIds.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{segment.clipIds.map((clipId) => { const clip = plan.clips.find((item) => item.id === clipId); return clip ? <span key={clipId} style={{ alignItems: 'center', background: COLORS.input, border: `1px solid ${COLORS.border}`, borderRadius: 999, color: COLORS.secondary, display: 'inline-flex', fontSize: 11, gap: 6, minHeight: 32, padding: '0 6px 0 9px' }} title={`${clip.purpose} · ${clip.preferredModel}`}><Film size={12} />{clip.id} · {clip.status}<button type="button" aria-label={`Regenerate ${clip.id}`} title="Regenerate this clip" onClick={() => requestClipRegeneration(clip.id)} style={{ background: 'transparent', border: 0, color: COLORS.accent, cursor: 'pointer', display: 'flex', padding: 3 }}><RefreshCw size={12} /></button><button type="button" aria-label={`Replace ${clip.id}`} title="Replace the prompt" onClick={() => replaceClipPrompt(clip.id)} style={{ background: 'transparent', border: 0, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontSize: 10, padding: 3 }}>Edit</button><button type="button" aria-label={`Delete ${clip.id}`} title="Delete clip and use graphics" onClick={() => removeClip(clip.id)} style={{ background: 'transparent', border: 0, color: COLORS.danger, cursor: 'pointer', display: 'flex', padding: 3 }}><Trash2 size={12} /></button></span> : null; })}</div> : <span style={{ color: COLORS.muted, fontSize: 11 }}>No generated clip · coded graphics/avatar only</span>}
            </article>;
          })}
        </div>
        {plan.clips.some((clip) => clip.status === 'failed') ? <div style={{ color: COLORS.warning, fontSize: 12 }}>Failed clips automatically fall back to a coded graphic or avatar and never block delivery.</div> : null}
      </div> : <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.warning, fontSize: 12.5, padding: 10 }}>This saved project uses the earlier beat-sheet format. Regenerate the plan to create a Director Creative Plan.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 13 }}>Caption, card and punch beats</strong>
        {sheet.beats.map((beat) => {
          const active = beat.id === selected;
          const start = words[beat.startWord]?.s || 0;
          return <article key={beat.id} onClick={() => setSelected(beat.id)} style={{ background: active ? COLORS.accentSoft : COLORS.raised, border: `1px solid ${active ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.sm, cursor: 'pointer', display: 'grid', gap: 8, gridTemplateColumns: '70px minmax(130px, 170px) minmax(180px, 1fr) 38px', padding: 9 }}>
            <span style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 11.5, gap: 5 }}><Clock3 size={12} /> {displayTime(start)}</span>
            <select aria-label={`Type for ${beat.id}`} value={beat.type} onClick={(event) => event.stopPropagation()} onChange={(event) => patchBeat(beat.id, { type: event.target.value as KineticBeatType, props: propsFor(event.target.value as KineticBeatType, beatText(beat), beat.startWord) })} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: 8, color: COLORS.text, minHeight: 36, padding: '0 8px' }}>{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
            <input aria-label={`Text for ${beat.id}`} value={beatText(beat)} maxLength={64} onClick={(event) => event.stopPropagation()} onChange={(event) => patchBeat(beat.id, withText(beat, event.target.value))} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: 8, color: COLORS.text, minHeight: 36, minWidth: 0, padding: '0 9px' }} />
            <button type="button" aria-label={`Delete ${beat.id}`} disabled={beat.type === 'ctaCard'} onClick={(event) => { event.stopPropagation(); setSheet((current) => ({ ...current, beats: current.beats.filter((item) => item.id !== beat.id) })); }} style={{ alignItems: 'center', background: 'transparent', border: `1px solid ${beat.type === 'ctaCard' ? COLORS.border : COLORS.danger}`, borderRadius: 8, color: beat.type === 'ctaCard' ? COLORS.muted : COLORS.danger, cursor: beat.type === 'ctaCard' ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center' }}><Trash2 size={14} /></button>
          </article>;
        })}
      </div>

      <div>
        <strong style={{ color: COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 13, marginBottom: 7 }}>Transcript anchor</strong>
        <div style={{ background: COLORS.input, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 190, overflowY: 'auto', padding: 10 }}>
          {words.map((word) => <button key={word.i} type="button" disabled={!selectedBeat} title={`${displayTime(word.s)} · word ${word.i}`} onClick={() => { if (!selectedBeat) return; const span = Math.max(0, selectedBeat.endWord - selectedBeat.startWord); patchBeat(selectedBeat.id, { startWord: word.i, endWord: Math.min(words.length - 1, word.i + span) }); }} style={{ background: selectedRange.has(word.i) ? COLORS.accent : COLORS.raised, border: `1px solid ${selectedRange.has(word.i) ? COLORS.accent : COLORS.border}`, borderRadius: 7, color: selectedRange.has(word.i) ? COLORS.onAccent : COLORS.secondary, cursor: selectedBeat ? 'pointer' : 'default', fontSize: 12, minHeight: 30, padding: '0 7px' }}>{word.d || word.w}</button>)}
        </div>
      </div>

      {[...(sheet.validationWarnings || []), ...(plan?.validationWarnings || [])].length ? <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.warning, fontSize: 12, lineHeight: '18px', padding: 10 }}>{Array.from(new Set([...(sheet.validationWarnings || []), ...(plan?.validationWarnings || [])].map((warning) => safeErrorText(warning, 'Some planned beats were adjusted automatically.', { maxLength: 200, context: 'beat sheet warning' })))).join(' · ')}</div> : null}
      {error ? <div role="alert" style={{ color: COLORS.danger, fontSize: 12.5 }}>{safeErrorText(error, 'The beat sheet could not be saved — please try again.', { maxLength: 220, context: 'beat sheet save error' })}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={busy || saving} onClick={() => void commit(false)} style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: saving ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 7, minHeight: 42, padding: '0 13px' }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save edits</button>
        <button type="button" disabled={busy || saving || !sheet.beats.length} onClick={() => void commit(true)} style={{ alignItems: 'center', background: COLORS.accent, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: saving ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 800, gap: 7, minHeight: 42, padding: '0 15px' }} data-testid="button-approve-beat-sheet"><Check size={14} /> Approve &amp; render both</button>
      </div>
    </section>
  );
}
