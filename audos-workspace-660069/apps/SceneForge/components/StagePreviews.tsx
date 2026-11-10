/**
 * SceneForge — inline previews for finished pipeline stages.
 * Plays the persisted result URLs only (avatar MP4, voice chunks, music); it
 * never regenerates anything. Every player has a fixed-size frame so loading
 * never shifts the layout, and a friendly fallback when a URL is missing,
 * expired or fails to load.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, Mic, Music2, Pause, Play, RotateCcw, UserRound } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import type { ForgeProject } from '../lib/forgeTypes';

export const GOLD_BUTTON_BG = 'linear-gradient(180deg, #E6C45A 0%, #D4AF37 55%, #B8952A 100%)';
export const SOFT_BUTTON_BG = 'linear-gradient(180deg, var(--vg-hover), var(--vg-raised))';

export const SOFT_PANEL: CSSProperties = {
  background: 'linear-gradient(180deg, color-mix(in srgb, var(--vg-gold) 6%, var(--vg-surface)) 0%, var(--vg-surface) 70%)',
  border: 'none',
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(0,0,0,.16)',
};

export const SOFT_INSET: CSSProperties = {
  background: 'linear-gradient(180deg, var(--vg-raised), color-mix(in srgb, var(--vg-raised) 55%, var(--vg-surface)))',
  border: 'none',
  borderRadius: RADIUS.card,
};

export function fileSlug(value: string | null | undefined): string {
  return (value || 'sceneforge').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sceneforge';
}

function extensionFrom(url: string, fallback: string): string {
  try {
    const match = new URL(url, window.location.href).pathname.match(/\.([a-z0-9]{2,4})$/i);
    return match ? match[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

export async function downloadMedia(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('download failed');
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function withPosterFrame(url: string): string {
  return url.indexOf('#') >= 0 ? url : `${url}#t=0.1`;
}

export function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const sec = Math.floor(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const smallButton = (primary: boolean): CSSProperties => ({
  alignItems: 'center',
  background: primary ? GOLD_BUTTON_BG : SOFT_BUTTON_BG,
  border: 'none',
  borderRadius: RADIUS.sm,
  color: primary ? COLORS.onAccent : COLORS.secondary,
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: FONT.heading,
  fontSize: 12.5,
  fontWeight: 700,
  gap: 6,
  minHeight: 38,
  padding: '0 13px',
  textDecoration: 'none',
});

export function MediaFallback({ message, url, onRetry, fill }: { message: string; url?: string | null; onRetry?: () => void; fill?: boolean }) {
  return (
    <div role="status" style={{ alignItems: 'center', background: 'linear-gradient(180deg, var(--vg-warning-bg), transparent)', borderRadius: RADIUS.card, color: COLORS.secondary, display: 'flex', flexDirection: 'column', fontSize: 12.5, gap: 10, height: fill ? '100%' : undefined, justifyContent: 'center', lineHeight: '18px', padding: 16, textAlign: 'center' }} data-testid="sceneforge-media-fallback">
      <AlertTriangle size={18} color={COLORS.warning} />
      <span>{message}</span>
      {onRetry || url ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {onRetry ? <button type="button" onClick={onRetry} style={smallButton(false)}><RotateCcw size={13} /> Try again</button> : null}
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={smallButton(false)}><ExternalLink size={13} /> Open link</a> : null}
        </div>
      ) : null}
    </div>
  );
}

export function PreviewSkeleton({ aspect = '16:9', label }: { aspect?: '16:9' | '9:16'; label?: string }) {
  const portrait = aspect === '9:16';
  return (
    <div style={{ alignItems: 'center', aspectRatio: portrait ? '9 / 16' : '16 / 9', background: 'linear-gradient(120deg, var(--vg-raised), color-mix(in srgb, var(--vg-gold) 8%, var(--vg-raised)), var(--vg-raised))', borderRadius: RADIUS.card, color: COLORS.muted, display: 'flex', flexDirection: 'column', fontSize: 12.5, gap: 8, justifyContent: 'center', margin: portrait ? '0 auto' : undefined, maxHeight: 420, width: portrait ? 'min(100%, 300px)' : '100%' }} className="animate-pulse">
      <Loader2 size={18} color={COLORS.accent} className="animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function VideoResultPreview({ url, filename, aspect = '16:9', poster, maxHeight = 420, testId }: { url: string | null | undefined; filename: string; aspect?: '16:9' | '9:16'; poster?: string | null; maxHeight?: number; testId?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => { setState('loading'); }, [url, attempt]);
  const portrait = aspect === '9:16';
  const frame: CSSProperties = { aspectRatio: portrait ? '9 / 16' : '16 / 9', background: '#000', borderRadius: RADIUS.card, margin: portrait ? '0 auto' : undefined, maxHeight, overflow: 'hidden', position: 'relative', width: portrait ? 'min(100%, 300px)' : '100%' };

  if (!url) return <MediaFallback message="This video is not available yet." />;

  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid={testId}>
      <div style={frame}>
        {state === 'error' ? (
          <MediaFallback fill message="This video could not be loaded — the link may have expired." url={url} onRetry={() => setAttempt((value) => value + 1)} />
        ) : (
          <video
            key={attempt}
            controls
            playsInline
            preload="metadata"
            src={poster ? url : withPosterFrame(url)}
            poster={poster || undefined}
            onLoadedMetadata={() => setState('ready')}
            onError={() => setState('error')}
            style={{ display: 'block', height: '100%', objectFit: 'contain', width: '100%' }}
          />
        )}
        {state === 'loading' ? (
          <div className="animate-pulse" style={{ alignItems: 'center', background: 'linear-gradient(120deg, #0b0d12, #1a1d26, #0b0d12)', display: 'flex', inset: 0, justifyContent: 'center', pointerEvents: 'none', position: 'absolute' }}>
            <Loader2 size={20} color={COLORS.accent} className="animate-spin" />
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={downloading} onClick={() => { setDownloading(true); void downloadMedia(url, filename).finally(() => setDownloading(false)); }} style={smallButton(true)}>
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" style={smallButton(false)}><ExternalLink size={13} /> Open</a>
      </div>
    </div>
  );
}

export function AudioResultPlayer({ url, label, filename, icon, fallbackDurationSec, testId }: { url: string | null | undefined; label: string; filename: string; icon?: ReactNode; fallbackDurationSec?: number | null; testId?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => { setState('loading'); setPlaying(false); setCurrent(0); setDuration(0); }, [url, attempt]);

  const known = Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, Number(fallbackDurationSec) || 0);
  const header = (
    <div style={{ alignItems: 'center', color: COLORS.text, display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 600, gap: 7, minWidth: 0 }}>
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );

  if (!url) {
    return <div style={{ ...SOFT_INSET, display: 'grid', gap: 8, padding: 12 }} data-testid={testId}>{header}<MediaFallback message="This audio is not available yet." /></div>;
  }

  const toggle = () => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) {
      element.play().catch(() => { if (element.error) setState('error'); });
    } else {
      element.pause();
    }
  };

  return (
    <div style={{ ...SOFT_INSET, display: 'grid', gap: 8, padding: 12 }} data-testid={testId}>
      {header}
      <audio
        key={attempt}
        ref={audioRef}
        preload="metadata"
        src={url}
        onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setState('ready'); }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setState('error'); setPlaying(false); }}
        style={{ display: 'none' }}
      />
      {state === 'error' ? (
        <MediaFallback message="This audio could not be loaded — the link may have expired." url={url} onRetry={() => setAttempt((value) => value + 1)} />
      ) : (
        <div style={{ alignItems: 'center', display: 'flex', gap: 10, minHeight: 44 }}>
          <button type="button" onClick={toggle} disabled={state === 'loading'} aria-label={playing ? `Pause ${label}` : `Play ${label}`} style={{ alignItems: 'center', background: GOLD_BUTTON_BG, border: 'none', borderRadius: 999, color: COLORS.onAccent, cursor: state === 'loading' ? 'wait' : 'pointer', display: 'flex', flex: '0 0 auto', height: 40, justifyContent: 'center', opacity: state === 'loading' ? 0.6 : 1, width: 40 }}>
            {state === 'loading' ? <Loader2 size={16} className="animate-spin" /> : playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
          </button>
          <div style={{ display: 'grid', flex: 1, gap: 2, minWidth: 0 }}>
            <input
              type="range"
              min={0}
              max={known || 0}
              step={0.1}
              value={Math.min(current, known || 0)}
              disabled={state !== 'ready' || !known}
              aria-label={`${label} progress`}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = next;
                setCurrent(next);
              }}
              style={{ accentColor: '#D4AF37', cursor: 'pointer', margin: 0, width: '100%' }}
            />
            <div style={{ color: COLORS.muted, display: 'flex', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', justifyContent: 'space-between' }}>
              <span>{formatClock(current)}</span>
              <span>{known ? formatClock(known) : '--:--'}</span>
            </div>
          </div>
          <button type="button" disabled={downloading} onClick={() => { setDownloading(true); void downloadMedia(url, filename).finally(() => setDownloading(false)); }} aria-label={`Download ${label}`} style={{ alignItems: 'center', background: SOFT_BUTTON_BG, border: 'none', borderRadius: 999, color: COLORS.secondary, cursor: 'pointer', display: 'flex', flex: '0 0 auto', height: 38, justifyContent: 'center', width: 38 }}>
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          </button>
        </div>
      )}
    </div>
  );
}

const MUSIC_PENDING = ['pending', 'queued', 'generating', 'running'];

/** Avatar, voiceover and music results for the current (or reopened) project. */
export default function StageResultPreviews({ project, extra }: { project: ForgeProject; extra?: ReactNode }) {
  const slug = fileSlug(project.topic);
  const avatarUrl = project.heygen_video_url || '';
  const voiceChunks = (Array.isArray(project.heygen_chunks) ? project.heygen_chunks : []).filter((chunk) => chunk && chunk.audio_url);
  const musicAsset = (project.auto?.assets || []).find((asset) => asset && asset.kind === 'music' && asset.url);
  const musicUrl = project.music_url || musicAsset?.url || '';
  const musicPending = !musicUrl && MUSIC_PENDING.indexOf(String(project.auto?.music?.status || '')) >= 0;
  const avatarPending = !avatarUrl && project.status === 'avatar';
  const dimension = project.browser_task?.payload?.dimension || project.browser_task?.payload?.fallback_v2?.dimension;
  const format = project.auto?.format || project.studio_config?.outputFormat || '16:9';
  const avatarAspect: '16:9' | '9:16' = dimension ? (dimension.height > dimension.width ? '9:16' : '16:9') : format === '9:16' ? '9:16' : '16:9';

  if (!avatarUrl && !avatarPending && !voiceChunks.length && !musicUrl && !musicPending && !extra) return null;

  const cardTitle = (icon: ReactNode, title: string, note?: string) => (
    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {icon}
      <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>{title}</strong>
      {note ? <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{note}</span> : null}
    </div>
  );

  return (
    <section style={{ ...SOFT_PANEL, display: 'grid', gap: 14, padding: 16 }} data-testid="sceneforge-stage-previews">
      <div>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, margin: 0 }}>Stage results</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '3px 0 0' }}>Finished outputs from each stage — play or download them anytime.</p>
      </div>
      <div style={{ alignItems: 'start', display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        {avatarUrl || avatarPending ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {cardTitle(<UserRound size={15} color={COLORS.accent} />, 'Avatar video', avatarUrl ? (project.avatar_duration_sec ? formatClock(project.avatar_duration_sec) : 'Ready') : 'Rendering…')}
            {avatarUrl ? (
              <VideoResultPreview url={avatarUrl} filename={`${slug}-avatar.${extensionFrom(avatarUrl, 'mp4')}`} aspect={avatarAspect} testId="sceneforge-avatar-preview" />
            ) : (
              <PreviewSkeleton aspect={avatarAspect} label="HeyGen is rendering the avatar…" />
            )}
          </div>
        ) : null}
        {voiceChunks.length || musicUrl || musicPending ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {cardTitle(<Mic size={15} color={COLORS.accent} />, 'Audio', voiceChunks.length > 1 ? `${voiceChunks.length} voice parts` : undefined)}
            <div style={{ display: 'grid', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
              {voiceChunks.map((chunk, index) => (
                <AudioResultPlayer
                  key={`voice-${chunk.i}-${chunk.audio_url}`}
                  url={chunk.audio_url}
                  label={voiceChunks.length > 1 ? `Voiceover · part ${index + 1}` : 'Voiceover'}
                  filename={`${slug}-voiceover${voiceChunks.length > 1 ? `-${index + 1}` : ''}.${extensionFrom(String(chunk.audio_url), 'mp3')}`}
                  icon={<Mic size={14} color={COLORS.accent} />}
                  fallbackDurationSec={chunk.duration_sec}
                  testId={`sceneforge-voice-preview-${index}`}
                />
              ))}
              {musicUrl ? (
                <AudioResultPlayer url={musicUrl} label="Background music" filename={`${slug}-music.${extensionFrom(musicUrl, 'mp3')}`} icon={<Music2 size={14} color={COLORS.accent} />} testId="sceneforge-music-preview" />
              ) : musicPending ? (
                <div className="animate-pulse" style={{ ...SOFT_INSET, alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 12.5, gap: 8, minHeight: 88, padding: 12 }}>
                  <Music2 size={14} color={COLORS.accent} /> Background music is being generated…
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {extra ? <div style={{ display: 'grid', gap: 10 }}>{extra}</div> : null}
      </div>
    </section>
  );
}
