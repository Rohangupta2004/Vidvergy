import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, Pencil, Square, Trash2, Upload } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { createClonedVoice, deleteClonedVoice, listClonedVoices, renameClonedVoice } from '../lib/forgeClient';
import type { ForgeClonedVoice } from '../lib/forgeTypes';

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/x-flac'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MIN_SECONDS = 30;
const MAX_SECONDS = 180;

function message(error: any): string {
  return String(error?.message || error || 'Voice cloning failed.');
}

async function durationOf(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration);
      URL.revokeObjectURL(url);
      Number.isFinite(duration) ? resolve(duration) : reject(new Error(`Could not read the duration of ${file.name}.`));
    };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name} as audio.`)); };
    audio.src = url;
  });
}

export default function VoiceClonePanel({ onChanged }: { onChanged?: (voice?: ForgeClonedVoice) => void }) {
  const [voices, setVoices] = useState<ForgeClonedVoice[]>([]);
  const [name, setName] = useState('');
  const [samples, setSamples] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try { setVoices(await listClonedVoices()); }
    catch (e) { setError(message(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addFiles = (incoming: File[]) => {
    setError('');
    const next = [...samples, ...incoming].slice(0, 5);
    const invalid = next.find((file) => AUDIO_TYPES.indexOf(file.type.split(';')[0].toLowerCase()) < 0);
    if (invalid) { setError(`${invalid.name}: use MP3, WAV, WebM, OGG, M4A, AAC, or FLAC.`); return; }
    if (next.some((file) => file.size > MAX_FILE_BYTES)) { setError('Each sample must be 10 MB or smaller.'); return; }
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) { setError('All samples together must be 25 MB or smaller.'); return; }
    setSamples(next);
  };

  const stopRecording = () => recorderRef.current?.stop();
  const startRecording = async () => {
    setError('');
    setSuccess('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      streamRef.current = stream;
      recorderRef.current = recorder;
      setRecordedSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size) addFiles([new File([blob], `recording-${Date.now()}.webm`, { type: blob.type })]);
      };
      recorder.start(1000);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordedSeconds((seconds) => {
          if (seconds + 1 >= MAX_SECONDS) recorder.stop();
          return Math.min(MAX_SECONDS, seconds + 1);
        });
      }, 1000);
    } catch (e) { setError(`Microphone access failed: ${message(e)}`); }
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (!name.trim()) throw new Error('Name the cloned voice.');
      if (!consent) throw new Error('Confirm that you own this voice or have permission to clone it.');
      if (!samples.length) throw new Error('Upload or record at least one audio sample.');
      setProgress('Checking sample length…');
      const durations = await Promise.all(samples.map(durationOf));
      const total = durations.reduce((sum, seconds) => sum + seconds, 0);
      if (total < MIN_SECONDS || total > MAX_SECONDS) throw new Error(`Samples must total 30 seconds–3 minutes; these total ${Math.round(total)} seconds.`);
      setProgress('Uploading samples to workspace storage, then creating the clone…');
      const voice = await createClonedVoice(name.trim(), samples);
      setVoices((current) => [voice, ...current.filter((item) => item.id !== voice.id)]);
      setSamples([]);
      setName('');
      setConsent(false);
      setSuccess(`${voice.name} is ready and selected in the voice catalog.`);
      onChanged?.(voice);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); setProgress(''); }
  };

  const rename = async (voice: ForgeClonedVoice) => {
    const next = window.prompt('Voice name', voice.name)?.trim();
    if (!next || next === voice.name) return;
    try {
      const updated = await renameClonedVoice(voice.id, next);
      setVoices((current) => current.map((item) => item.id === updated.id ? updated : item));
      onChanged?.(updated);
    } catch (e) { setError(message(e)); }
  };

  const remove = async (voice: ForgeClonedVoice) => {
    if (!window.confirm(`Delete “${voice.name}”? Existing videos stay intact, but this voice can no longer generate speech.`)) return;
    try {
      await deleteClonedVoice(voice);
      setVoices((current) => current.filter((item) => item.id !== voice.id));
      setSuccess(`${voice.name} was deleted.`);
      onChanged?.();
    } catch (e) { setError(message(e)); }
  };

  return (
    <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 14, padding: 16 }} data-testid="voice-clone-panel">
      <div>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, margin: 0 }}>Clone a voice</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '19px', margin: '5px 0 0' }}>Add 1–5 clean samples totaling 30 seconds–3 minutes. Creating a clone costs $1 from the workspace wallet; speech uses the normal TTS rate.</p>
      </div>
      <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Voice name" style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 44, padding: '0 12px' }} data-testid="clone-voice-name" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ alignItems: 'center', background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', display: 'inline-flex', fontSize: 13, gap: 7, minHeight: 44, padding: '0 14px' }}>
          <Upload size={15} /> Upload samples
          <input type="file" multiple accept="audio/mpeg,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/aac,audio/flac" onChange={(event) => addFiles(Array.from(event.target.files || []))} style={{ display: 'none' }} data-testid="clone-voice-files" />
        </label>
        <button type="button" onClick={recording ? stopRecording : startRecording} style={{ alignItems: 'center', background: recording ? COLORS.dangerBg : COLORS.raised, border: `1px solid ${recording ? COLORS.danger : COLORS.border}`, borderRadius: RADIUS.sm, color: recording ? COLORS.danger : COLORS.secondary, cursor: 'pointer', display: 'inline-flex', fontFamily: FONT.body, fontSize: 13, gap: 7, minHeight: 44, padding: '0 14px' }} data-testid="clone-voice-record">
          {recording ? <Square size={14} /> : <Mic size={15} />} {recording ? `Stop · ${recordedSeconds}s` : 'Record sample'}
        </button>
      </div>
      {samples.length ? <div style={{ color: COLORS.secondary, fontSize: 12.5 }}>{samples.map((file) => file.name).join(' · ')}</div> : null}
      <label style={{ alignItems: 'flex-start', color: COLORS.secondary, display: 'flex', fontSize: 12.5, gap: 8, lineHeight: '18px' }}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ marginTop: 2 }} data-testid="clone-voice-consent" />
        I own this voice or have permission to clone it.
      </label>
      {error ? <div role="alert" style={{ background: COLORS.dangerBg, border: `1px solid ${COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.text, fontSize: 12.5, lineHeight: '19px', padding: 10 }}>{error}</div> : null}
      {success ? <div style={{ background: COLORS.successBg, border: `1px solid ${COLORS.success}`, borderRadius: RADIUS.sm, color: COLORS.success, fontSize: 12.5, padding: 10 }}><Check size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />{success}</div> : null}
      <button type="button" disabled={busy || recording} onClick={create} style={{ alignItems: 'center', background: busy ? COLORS.raised : COLORS.accent, border: 'none', borderRadius: RADIUS.sm, color: busy ? COLORS.muted : COLORS.onAccent, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44 }} data-testid="clone-voice-create">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />} {busy ? progress || 'Creating…' : 'Create voice clone · $1'}
      </button>
      {voices.length ? <div style={{ borderTop: `1px solid ${COLORS.border}`, display: 'grid', gap: 7, paddingTop: 12 }}>
        {voices.map((voice) => <div key={voice.id} style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <span style={{ color: COLORS.text, flex: 1, fontSize: 13.5 }}>{voice.name} <span style={{ background: COLORS.accentSoft, borderRadius: 6, color: COLORS.accent, fontSize: 10.5, fontWeight: 700, padding: '3px 6px' }}>Cloned</span></span>
          <button type="button" onClick={() => rename(voice)} aria-label={`Rename ${voice.name}`} style={{ background: 'transparent', border: 'none', color: COLORS.secondary, cursor: 'pointer', padding: 8 }}><Pencil size={14} /></button>
          <button type="button" onClick={() => remove(voice)} aria-label={`Delete ${voice.name}`} style={{ background: 'transparent', border: 'none', color: COLORS.danger, cursor: 'pointer', padding: 8 }}><Trash2 size={14} /></button>
        </div>)}
      </div> : null}
    </section>
  );
}
