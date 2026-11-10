import { useCallback, useEffect, useState } from 'react';
import { AMBIENT_TRACKS, DEFAULT_AMBIENT_TRACK_ID, DEFAULT_AMBIENT_VOLUME, ambientTrack, type AmbientTrackId } from '../lib/ambientMusic';

const TRACK_KEY = 'vidverge:ambient-track:v1';
const VOLUME_KEY = 'vidverge:ambient-volume:v1';
const ENABLED_KEY = 'vidverge:ambient-enabled:v1';
const EVENT = 'vidverge:ambient-change';

type Snapshot = { trackId: AmbientTrackId; volume: number; enabled: boolean; playing: boolean; ducked: boolean; error: string };

function storedTrack(): AmbientTrackId {
  try {
    const value = localStorage.getItem(TRACK_KEY) as AmbientTrackId | null;
    return AMBIENT_TRACKS.some((track) => track.id === value) ? value! : DEFAULT_AMBIENT_TRACK_ID;
  } catch { return DEFAULT_AMBIENT_TRACK_ID; }
}
function storedVolume(): number {
  try { const value = Number(localStorage.getItem(VOLUME_KEY)); return Number.isFinite(value) ? Math.max(0.03, Math.min(0.35, value)) : DEFAULT_AMBIENT_VOLUME; }
  catch { return DEFAULT_AMBIENT_VOLUME; }
}
function storedEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

let snapshot: Snapshot = { trackId: storedTrack(), volume: storedVolume(), enabled: storedEnabled(), playing: false, ducked: false, error: '' };
let audio: HTMLAudioElement | null = null;
let initialized = false;
let fadeTimer = 0;
let manualDuck = false;
const soundingMedia = new Set<HTMLMediaElement>();

function publish(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: snapshot }));
}
function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    audio = new Audio(ambientTrack(snapshot.trackId).url);
    audio.loop = true;
    audio.preload = 'metadata';
    audio.dataset.vidvergeAmbient = 'true';
    audio.volume = 0;
    audio.addEventListener('play', () => publish({ playing: true, error: '' }));
    audio.addEventListener('pause', () => publish({ playing: false }));
    audio.addEventListener('error', () => publish({ playing: false, error: 'Ambient audio is unavailable. Try another track.' }));
  }
  return audio;
}
function fadeTo(target: number, duration = 350, after?: () => void) {
  const player = audio;
  if (!player) { after?.(); return; }
  window.clearInterval(fadeTimer);
  const start = player.volume;
  const began = performance.now();
  fadeTimer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - began) / duration);
    player.volume = Math.max(0, Math.min(1, start + (target - start) * progress));
    if (progress >= 1) {
      window.clearInterval(fadeTimer);
      after?.();
    }
  }, 30);
}
function shouldDuck(): boolean {
  return manualDuck || soundingMedia.size > 0;
}
function syncDucking() {
  const ducked = shouldDuck();
  publish({ ducked });
  if (!audio || !snapshot.enabled || audio.paused) return;
  fadeTo(ducked ? 0 : snapshot.volume, ducked ? 180 : 700);
}
function updateMedia(target: EventTarget | null, active: boolean) {
  if (!(target instanceof HTMLMediaElement) || target.dataset.vidvergeAmbient === 'true') return;
  const sounding = active && !target.paused && !target.ended && !target.muted && target.volume > 0;
  if (sounding) soundingMedia.add(target); else soundingMedia.delete(target);
  syncDucking();
}
function installGlobalListeners() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  // Deliberately no document-level gesture listener: the music chip itself is
  // the only gesture that may start ambient playback.
  document.addEventListener('play', (event) => updateMedia(event.target, true), true);
  document.addEventListener('pause', (event) => { updateMedia(event.target, false); window.setTimeout(syncDucking, 500); }, true);
  document.addEventListener('ended', (event) => { updateMedia(event.target, false); window.setTimeout(syncDucking, 500); }, true);
  document.addEventListener('volumechange', (event) => updateMedia(event.target, true), true);
  window.addEventListener('vidverge:duck-music', () => { manualDuck = true; syncDucking(); });
  window.addEventListener('vidverge:restore-music', () => { manualDuck = false; window.setTimeout(syncDucking, 500); });
}

async function startFromGesture(): Promise<void> {
  const player = ensureAudio();
  if (!player) return;
  try {
    player.volume = 0;
    await player.play();
    publish({ enabled: true, error: '' });
    try { localStorage.setItem(ENABLED_KEY, '1'); } catch {}
    fadeTo(shouldDuck() ? 0 : snapshot.volume, 420);
  } catch {
    publish({ enabled: false, playing: false, error: 'Playback was blocked. Tap the music chip again.' });
    try { localStorage.setItem(ENABLED_KEY, '0'); } catch {}
  }
}
function stopWithFade(): void {
  publish({ enabled: false });
  try { localStorage.setItem(ENABLED_KEY, '0'); } catch {}
  if (!audio || audio.paused) return;
  fadeTo(0, 260, () => audio?.pause());
}

export function useAmbientMusic() {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    installGlobalListeners();
    const update = (event: Event) => setState((event as CustomEvent<Snapshot>).detail || snapshot);
    window.addEventListener(EVENT, update);
    setState(snapshot);
    return () => window.removeEventListener(EVENT, update);
  }, []);

  const selectTrack = useCallback((trackId: AmbientTrackId) => {
    try { localStorage.setItem(TRACK_KEY, trackId); } catch {}
    const player = ensureAudio();
    if (!player) return;
    const shouldResume = snapshot.enabled;
    player.pause();
    player.src = ambientTrack(trackId).url;
    player.load();
    publish({ trackId, playing: false, error: '' });
    if (shouldResume) void startFromGesture();
  }, []);

  const setVolume = useCallback((volume: number) => {
    const next = Math.max(0.03, Math.min(0.35, volume));
    try { localStorage.setItem(VOLUME_KEY, String(next)); } catch {}
    publish({ volume: next });
    if (!snapshot.ducked && snapshot.enabled) fadeTo(next, 120);
  }, []);

  const play = useCallback(() => { void startFromGesture(); }, []);
  const pause = useCallback(() => stopWithFade(), []);
  const toggle = useCallback(() => { if (snapshot.enabled && snapshot.playing) stopWithFade(); else void startFromGesture(); }, []);

  return { ...state, tracks: AMBIENT_TRACKS, selectTrack, setVolume, play, pause, toggle };
}

export default useAmbientMusic;
