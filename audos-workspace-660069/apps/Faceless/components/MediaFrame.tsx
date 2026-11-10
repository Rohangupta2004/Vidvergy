import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Width ÷ height for a project format; anything unknown is landscape. */
export function ratioOfAspect(aspect: string | undefined): number {
  return aspect === '9:16' ? 9 / 16 : 16 / 9;
}

/** Pixel size of a video's first decoded frame, or null when it cannot be read in time. */
export function probeVideoSize(url: string, timeoutMs = 10000): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !url) { resolve(null); return; }
    const video = document.createElement('video');
    let settled = false;
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(video.videoWidth > 0 && video.videoHeight > 0 ? { width: video.videoWidth, height: video.videoHeight } : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

interface MediaFrameProps {
  kind: 'video' | 'image';
  src?: string;
  poster?: string;
  /**
   * The project's chosen format. When set, the frame keeps that shape so the
   * preview matches the Remotion export; when omitted, the frame follows the
   * media's own videoWidth/videoHeight (or naturalWidth/naturalHeight).
   */
  aspect?: string;
  /** CSS length capping a portrait frame's height; the frame is then centred. */
  maxHeight?: number | string;
  fit?: 'cover' | 'contain';
  controls?: boolean;
  muted?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  className?: string;
  /** Classes for the media box itself (rounding, margins). */
  frameClassName?: string;
  placeholder?: ReactNode;
  onMeasure?: (width: number, height: number) => void;
  children?: ReactNode;
}

export default function MediaFrame(props: MediaFrameProps) {
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => { setMeasured(null); }, [props.src]);

  const ratio = props.aspect ? ratioOfAspect(props.aspect) : measured || 16 / 9;
  const portrait = ratio < 1;
  const cap = props.maxHeight == null ? '' : typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight;
  const frameStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: String(ratio),
    maxWidth: portrait && cap ? `calc(${cap} * ${ratio})` : undefined,
    margin: '0 auto',
    overflow: 'hidden',
    background: '#000',
  };
  const mediaStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: props.fit || 'contain' };
  const report = (width: number, height: number) => {
    if (!(width > 0 && height > 0)) return;
    setMeasured(width / height);
    props.onMeasure?.(width, height);
  };

  return (
    <div className={`relative w-full ${props.className || ''}`}>
      <div className={props.frameClassName} style={frameStyle}>
        {props.src && props.kind === 'video' ? (
          <video
            src={props.src}
            poster={props.poster}
            controls={props.controls}
            muted={props.muted}
            playsInline
            preload={props.preload || 'metadata'}
            style={mediaStyle}
            onLoadedMetadata={(event) => report(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
          />
        ) : props.src ? (
          <img
            src={props.src}
            alt=""
            style={mediaStyle}
            onLoad={(event) => report(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">{props.placeholder}</div>
        )}
        {props.children}
      </div>
    </div>
  );
}
