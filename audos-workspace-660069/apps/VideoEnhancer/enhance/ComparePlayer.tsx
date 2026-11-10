import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Maximize, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import { timecode, type EffectLayer } from './enhanceModel';

export type CompareMode = 'split' | 'side' | 'before' | 'after';

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'split', label: 'Slider' },
  { id: 'side', label: 'Side by side' },
  { id: 'before', label: 'Original' },
  { id: 'after', label: 'Enhanced' },
];
const RATES = [0.25, 0.5, 1, 1.5, 2];

interface ComparePlayerProps {
  beforeSrc: string;
  /** The rendered master. Null shows a live preview of the source with `afterFilter`. */
  afterSrc: string | null;
  afterFilter: string;
  afterLayers: EffectLayer[];
  /** Source width / height. */
  aspect: number;
  fps: number;
  afterLabel: string;
  onFpsDetected?: (fps: number) => void;
}

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export default function ComparePlayer({ beforeSrc, afterSrc, afterFilter, afterLayers, aspect, fps, afterLabel, onFpsDetected }: ComparePlayerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<CompareMode>('split');
  const [split, setSplit] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [readyA, setReadyA] = useState(false);
  const [readyB, setReadyB] = useState(false);
  const [error, setError] = useState('');
  const live = !afterSrc;
  const fpsCallback = useRef(onFpsDetected);
  fpsCallback.current = onFpsDetected;
  const detectFps = Boolean(onFpsDetected);
  const frame = 1 / Math.max(1, fps || 30);

  useEffect(() => {
    const a = aRef.current;
    a?.pause();
    setPlaying(false);
    setTime(0);
    setError('');
    setReadyA(Boolean(a && a.readyState >= 2));
    setDuration(a && a.readyState >= 1 && Number.isFinite(a.duration) ? a.duration : 0);
  }, [beforeSrc]);

  useEffect(() => {
    const b = bRef.current;
    b?.pause();
    aRef.current?.pause();
    setPlaying(false);
    setError('');
    setReadyB(Boolean(b && b.readyState >= 2));
  }, [afterSrc, beforeSrc]);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const audioFromAfter = mode === 'after' && !live;
    a.muted = muted || audioFromAfter;
    b.muted = muted || !audioFromAfter;
  }, [muted, mode, live, readyA, readyB]);

  useEffect(() => {
    for (const video of [aRef.current, bRef.current]) if (video) { video.playbackRate = rate; video.loop = loop; }
  }, [rate, loop, readyA, readyB]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    const tick = () => {
      const a = aRef.current;
      const b = bRef.current;
      if (a && b && !b.paused && Number.isFinite(b.duration)) {
        const target = Math.min(a.currentTime, Math.max(0, b.duration - frame));
        const drift = b.currentTime - target;
        if (Math.abs(drift) > frame * 6) b.currentTime = target;
        else if (Math.abs(drift) > frame * 1.2) b.playbackRate = rate * (drift > 0 ? 0.94 : 1.06);
        else if (b.playbackRate !== rate) b.playbackRate = rate;
      }
      if (a) setTime(a.currentTime);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, rate, frame]);

  useEffect(() => {
    const a = aRef.current as FrameCallbackVideo | null;
    if (!a || !detectFps || !playing || rate !== 1 || !a.requestVideoFrameCallback) return undefined;
    const deltas: number[] = [];
    let last: { mediaTime: number; frames: number } | null = null;
    let handle = 0;
    let done = false;
    const onFrame = (_now: number, meta: { mediaTime: number; presentedFrames: number }) => {
      if (done) return;
      if (last && meta.presentedFrames === last.frames + 1 && meta.mediaTime > last.mediaTime) deltas.push(meta.mediaTime - last.mediaTime);
      last = { mediaTime: meta.mediaTime, frames: meta.presentedFrames };
      if (deltas.length >= 24) {
        const sorted = [...deltas].sort((x, y) => x - y);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (median > 0) { done = true; fpsCallback.current?.(Math.round((1 / median) * 1000) / 1000); return; }
      }
      handle = a.requestVideoFrameCallback!(onFrame);
    };
    handle = a.requestVideoFrameCallback(onFrame);
    return () => { done = true; a.cancelVideoFrameCallback?.(handle); };
  }, [playing, rate, beforeSrc, detectFps]);

  const seek = useCallback((next: number) => {
    const a = aRef.current;
    const b = bRef.current;
    const end = duration || a?.duration || 0;
    const t = Math.max(0, Math.min(end || 0, next));
    if (a) a.currentTime = t;
    if (b && Number.isFinite(b.duration)) b.currentTime = Math.min(t, Math.max(0, b.duration - frame / 2));
    setTime(t);
  }, [duration, frame]);

  const pause = useCallback(() => {
    aRef.current?.pause();
    bRef.current?.pause();
    setPlaying(false);
    const a = aRef.current;
    const b = bRef.current;
    if (a) setTime(a.currentTime);
    if (a && b && Number.isFinite(b.duration)) b.currentTime = Math.min(a.currentTime, b.duration);
  }, []);

  const play = useCallback(async () => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    if (!loop && duration && a.currentTime >= duration - frame) seek(0);
    b.currentTime = a.currentTime;
    try {
      await Promise.all([a.play(), b.play()]);
      setPlaying(true);
    } catch {
      a.pause();
      b.pause();
      setPlaying(false);
      setError('Playback was blocked by the browser. Press play again.');
    }
  }, [loop, duration, frame, seek]);

  const toggle = useCallback(() => { if (playing) pause(); else void play(); }, [playing, pause, play]);

  const step = useCallback((direction: number) => {
    const a = aRef.current;
    if (!a) return;
    pause();
    const current = Math.floor(a.currentTime / frame + 1e-6);
    seek((current + direction) * frame + frame * 0.01);
  }, [frame, pause, seek]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' && (event.target as HTMLInputElement).type !== 'range') return;
    if (tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') { event.preventDefault(); toggle(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); if (event.shiftKey) seek(time - 1); else step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); if (event.shiftKey) seek(time + 1); else step(1); }
    else if (event.key === 'Home') { event.preventDefault(); seek(0); }
    else if (event.key === 'End') { event.preventDefault(); seek(duration); }
  };

  const dragSplit = (event: ReactPointerEvent) => {
    if (mode !== 'split' || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const update = (clientX: number) => setSplit(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)));
    update(event.clientX);
    const move = (next: PointerEvent) => update(next.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onEnded = () => { if (!loop) { pause(); setTime(duration); } };
  const videoError = (which: string) => () => {
    pause();
    setError(`The ${which} could not be played in this browser. Try downloading it instead.`);
  };

  const stageRatio = mode === 'side' ? aspect * 2 : aspect;
  const afterStyle: CSSProperties = live ? { filter: afterFilter === 'none' ? undefined : afterFilter } : {};
  if (mode === 'split') afterStyle.clipPath = `inset(0 0 0 ${split * 100}%)`;
  const loading = !readyA || !readyB;

  return (
    <div ref={rootRef} className="ve-player" tabIndex={0} onKeyDown={onKeyDown} aria-label="Before and after preview. Space plays, arrow keys step one frame.">
      <div className="ve-player-frame">
        <div ref={stageRef} className="ve-stage" data-mode={mode} style={{ aspectRatio: String(stageRatio), '--ratio': String(stageRatio) } as CSSProperties} onPointerDown={dragSplit}>
          <div className={`ve-pane before${mode === 'after' ? ' hidden' : ''}`}>
            <video
              ref={aRef}
              src={beforeSrc}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
              onLoadedData={() => setReadyA(true)}
              onEnded={onEnded}
              onError={videoError('original')}
            />
            {mode !== 'after' ? <span className="ve-pane-label left">Original</span> : null}
          </div>
          <div className={`ve-pane after${mode === 'before' ? ' hidden' : ''}`} style={mode === 'split' ? { clipPath: afterStyle.clipPath } : undefined}>
            <video
              ref={bRef}
              src={afterSrc || beforeSrc}
              playsInline
              preload="auto"
              style={{ filter: afterStyle.filter }}
              onLoadedData={() => setReadyB(true)}
              onError={videoError(live ? 'preview' : 'enhanced master')}
            />
            {live ? afterLayers.map((layer) => <i key={layer.key} className="ve-fx" style={{ background: layer.background, opacity: layer.opacity, mixBlendMode: layer.blend as CSSProperties['mixBlendMode'] }} />) : null}
            {mode !== 'before' ? <span className="ve-pane-label right">{afterLabel}</span> : null}
          </div>
          {mode === 'split' ? (
            <div
              className="ve-divider"
              style={{ left: `${split * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Compare position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split * 100)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  event.stopPropagation();
                  setSplit((value) => Math.max(0, Math.min(1, value + (event.key === 'ArrowLeft' ? -0.02 : 0.02))));
                }
              }}
            ><span /></div>
          ) : null}
          {loading && !error ? <div className="ve-stage-overlay"><Loader2 size={20} className="ve-spin" /><span>Loading preview…</span></div> : null}
          {error ? <div className="ve-stage-overlay bad" role="alert"><AlertCircle size={20} /><span>{error}</span><button type="button" className="ve-btn" onClick={() => setError('')}>Dismiss</button></div> : null}
        </div>
      </div>
      <div className="ve-transport">
        <button type="button" className="ve-icon-btn primary" onClick={toggle} disabled={loading} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" className="ve-icon-btn" onClick={() => step(-1)} disabled={loading} aria-label="Previous frame" title="Previous frame (←)"><ChevronLeft size={16} /></button>
        <button type="button" className="ve-icon-btn" onClick={() => step(1)} disabled={loading} aria-label="Next frame" title="Next frame (→)"><ChevronRight size={16} /></button>
        <span className="ve-timecode" aria-live="off">{timecode(time, fps)}<em> / {timecode(duration, fps)}</em></span>
        <input
          className="ve-scrub"
          type="range"
          min={0}
          max={Math.max(frame, duration)}
          step={frame}
          value={Math.min(time, duration || 0)}
          disabled={loading}
          aria-label="Scrub"
          onChange={(event) => seek(Number(event.target.value))}
        />
        <button type="button" className={`ve-icon-btn${loop ? ' on' : ''}`} onClick={() => setLoop((value) => !value)} aria-pressed={loop} aria-label="Loop" title={loop ? 'Loop on' : 'Loop off'}><Repeat size={15} /></button>
        <select className="ve-rate" value={rate} aria-label="Playback speed" onChange={(event) => setRate(Number(event.target.value))}>
          {RATES.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
        <button type="button" className={`ve-icon-btn${muted ? ' on' : ''}`} onClick={() => setMuted((value) => !value)} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <div className="ve-seg ve-compare-modes" role="group" aria-label="Compare view">
          {MODES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={mode === entry.id} className={mode === entry.id ? 'on' : ''} onClick={() => setMode(entry.id)}>{entry.label}</button>
          ))}
        </div>
        <button type="button" className="ve-icon-btn hide-sm" onClick={() => { void rootRef.current?.requestFullscreen?.().catch(() => undefined); }} aria-label="Full screen" title="Full screen"><Maximize size={15} /></button>
      </div>
    </div>
  );
}
