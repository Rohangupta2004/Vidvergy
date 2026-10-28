import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import type { Aspect } from './index';
import { BRAND, SAFE, STAGE } from './index';

export interface TimedWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface BrandTheme {
  primary?: string;
  accent?: string;
  background?: string;
  text?: string;
  muted?: string;
  fontFamily?: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** Readable content boundary shared by title, caption, CTA and diagram layouts. */
export const SafeArea: React.FC<{ aspect?: Aspect; insetX?: number; insetY?: number; style?: CSSProperties; children?: ReactNode }> = ({
  aspect = '16:9', insetX = SAFE.x, insetY = SAFE.y, style, children,
}) => {
  const stage = STAGE[aspect];
  return <div style={{ position: 'absolute', left: stage.width * insetX, right: stage.width * insetX, top: stage.height * insetY, bottom: stage.height * insetY, ...style }}>{children}</div>;
};

/** Karaoke caption driven by genuine word start/end seconds. */
export const KaraokeCaption: React.FC<{
  words: TimedWord[];
  fromSec?: number;
  toSec?: number;
  theme?: BrandTheme;
  maxWords?: number;
  style?: CSSProperties;
}> = ({ words, fromSec = 0, toSec = Number.POSITIVE_INFINITY, theme, maxWords = 8, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  if (time < fromSec || time > toSec) return null;
  const currentIndex = Math.max(0, words.findIndex((word) => time >= word.start && time < word.end));
  const centre = currentIndex < 0 ? 0 : currentIndex;
  const start = Math.max(0, centre - Math.floor(maxWords / 2));
  const visible = words.slice(start, start + maxWords);
  const palette = { text: theme?.text || BRAND.text, active: theme?.accent || theme?.primary || BRAND.gold, background: theme?.background || BRAND.ink };
  return (
    <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '9%', textAlign: 'center', fontFamily: theme?.fontFamily || BRAND.display, ...style }}>
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 .28em', borderRadius: 14, padding: '16px 22px', background: `${palette.background}d9`, fontSize: 46, fontWeight: 800, lineHeight: 1.18, textShadow: '0 3px 20px rgba(0,0,0,.65)' }}>
        {visible.map((entry, index) => {
          const absoluteIndex = start + index;
          const active = absoluteIndex === centre && time >= entry.start && time < entry.end;
          const p = active ? clamp((time - entry.start) / Math.max(.05, entry.end - entry.start)) : absoluteIndex < centre ? 1 : 0;
          return <span key={`${entry.start}-${index}`} style={{ color: active ? palette.active : palette.text, opacity: absoluteIndex > centre ? .6 : 1, transform: `translateY(${active ? -3 * Math.sin(p * Math.PI) : 0}px)` }}>{entry.word}</span>;
        })}
      </span>
    </div>
  );
};

/** Subject-safe annotation with a leader line and optional tracked position keyframes. */
export const MotionTrackedCallout: React.FC<{
  label: string;
  points: Array<{ frame: number; x: number; y: number }>;
  anchor?: { x: number; y: number };
  theme?: BrandTheme;
  delay?: number;
}> = ({ label, points, anchor = { x: .5, y: .5 }, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!points.length || frame < delay) return null;
  let before = points[0];
  let after = points[points.length - 1];
  for (let index = 1; index < points.length; index += 1) {
    if (frame <= points[index].frame) { before = points[index - 1]; after = points[index]; break; }
  }
  const progress = clamp((frame - before.frame) / Math.max(1, after.frame - before.frame));
  const x = mix(before.x, after.x, progress) * width;
  const y = mix(before.y, after.y, progress) * height;
  const ax = anchor.x * width;
  const ay = anchor.y * height;
  const enter = spring({ frame: frame - delay, fps, config: { damping: 180, stiffness: 120 } });
  const color = theme?.accent || theme?.primary || BRAND.gold;
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', opacity: enter }}>
      <line x1={x} y1={y} x2={ax} y2={ay} stroke={color} strokeWidth={3} strokeDasharray="8 8" />
      <circle cx={x} cy={y} r={8} fill={color} />
      <foreignObject x={Math.min(width - 340, Math.max(20, ax - 160))} y={Math.min(height - 90, Math.max(20, ay - 40))} width={320} height={80}>
        <div style={{ boxSizing: 'border-box', borderRadius: 12, border: `1px solid ${color}`, background: `${theme?.background || BRAND.ink}e6`, color: theme?.text || BRAND.text, fontFamily: theme?.fontFamily || BRAND.display, fontSize: 24, fontWeight: 700, padding: '14px 18px', transform: `scale(${.92 + .08 * enter})` }}>{label}</div>
      </foreignObject>
    </svg>
  );
};

/** Deterministic SVG path draw using pathLength=1. */
export const SvgPathDraw: React.FC<{
  path: string;
  viewBox?: string;
  color?: string;
  width?: number | string;
  height?: number | string;
  delay?: number;
  duration?: number;
  strokeWidth?: number;
  fill?: string;
}> = ({ path, viewBox = '0 0 100 100', color = BRAND.gold, width = '100%', height = '100%', delay = 0, duration = 30, strokeWidth = 2, fill = 'none' }) => {
  const frame = useCurrentFrame();
  const progress = clamp(interpolate(frame - delay, [0, Math.max(1, duration)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return <svg viewBox={viewBox} width={width} height={height}><path d={path} pathLength={1} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeDasharray={1} strokeDashoffset={1 - progress} strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  tone?: 'primary' | 'accent' | 'muted';
}
export interface DiagramEdge { from: string; to: string; label?: string }

/** Aspect-aware flow diagram with node and edge choreography. */
export const FlowDiagram: React.FC<{
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  theme?: BrandTheme;
  delay?: number;
  stagger?: number;
}> = ({ nodes, edges, theme, delay = 0, stagger = 7 }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const map = new Map(nodes.map((node) => [node.id, node]));
  const primary = theme?.primary || BRAND.gold;
  const accent = theme?.accent || BRAND.goldSoft;
  return (
    <AbsoluteFill style={{ fontFamily: theme?.fontFamily || BRAND.display }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {edges.map((edge, index) => {
          const from = map.get(edge.from); const to = map.get(edge.to);
          if (!from || !to) return null;
          const p = clamp(interpolate(frame - delay - index * stagger, [8, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
          return <g key={`${edge.from}-${edge.to}-${index}`} opacity={p}><line x1={from.x * width} y1={from.y * height} x2={mix(from.x, to.x, p) * width} y2={mix(from.y, to.y, p) * height} stroke={primary} strokeWidth={3} /><circle cx={to.x * width} cy={to.y * height} r={5} fill={accent} /></g>;
        })}
      </svg>
      {nodes.map((node, index) => {
        const p = spring({ frame: frame - delay - index * stagger, fps, config: { damping: 180, stiffness: 110 } });
        const color = node.tone === 'accent' ? accent : node.tone === 'muted' ? theme?.muted || BRAND.textMuted : primary;
        return <div key={node.id} style={{ position: 'absolute', left: `${node.x * 100}%`, top: `${node.y * 100}%`, minWidth: 160, maxWidth: 300, padding: '16px 20px', borderRadius: 14, border: `2px solid ${color}`, background: `${theme?.background || BRAND.inkSoft}ed`, color: theme?.text || BRAND.text, fontSize: 24, fontWeight: 700, textAlign: 'center', opacity: p, transform: `translate(-50%,-50%) scale(${.82 + .18 * p})` }}>{node.label}</div>;
      })}
    </AbsoluteFill>
  );
};

/** Camera pan/zoom/roll wrapper with optional perspective. */
export const CameraRig: React.FC<{
  from?: { x?: number; y?: number; scale?: number; rotate?: number };
  to?: { x?: number; y?: number; scale?: number; rotate?: number };
  startFrame?: number;
  endFrame?: number;
  perspective?: number;
  children?: ReactNode;
}> = ({ from = {}, to = {}, startFrame = 0, endFrame = 90, perspective = 1400, children }) => {
  const frame = useCurrentFrame();
  const p = clamp(interpolate(frame, [startFrame, Math.max(startFrame + 1, endFrame)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const eased = p * p * (3 - 2 * p);
  const x = mix(from.x || 0, to.x || 0, eased);
  const y = mix(from.y || 0, to.y || 0, eased);
  const scale = mix(from.scale || 1, to.scale || 1, eased);
  const rotate = mix(from.rotate || 0, to.rotate || 0, eased);
  return <AbsoluteFill style={{ perspective, transformStyle: 'preserve-3d' }}><div style={{ height: '100%', width: '100%', transform: `translate3d(${x}px,${y}px,0) scale(${scale}) rotate(${rotate}deg)`, transformOrigin: 'center center' }}>{children}</div></AbsoluteFill>;
};

/** Directional clip-path reveal for masks, screenshots and scene wipes. */
export const MaskReveal: React.FC<{ direction?: 'left' | 'right' | 'top' | 'bottom' | 'circle'; delay?: number; duration?: number; children?: ReactNode }> = ({ direction = 'left', delay = 0, duration = 24, children }) => {
  const frame = useCurrentFrame();
  const p = clamp(interpolate(frame - delay, [0, Math.max(1, duration)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const clipPath = direction === 'circle' ? `circle(${p * 72}% at 50% 50%)`
    : direction === 'right' ? `inset(0 ${100 - p * 100}% 0 0)`
      : direction === 'top' ? `inset(0 0 ${100 - p * 100}% 0)`
        : direction === 'bottom' ? `inset(${100 - p * 100}% 0 0 0)`
          : `inset(0 0 0 ${100 - p * 100}%)`;
  return <div style={{ height: '100%', width: '100%', clipPath }}>{children}</div>;
};

/** 2.5D depth layer with deterministic parallax and tilt. */
export const DepthLayer: React.FC<{ depth?: number; driftX?: number; driftY?: number; rotateX?: number; rotateY?: number; style?: CSSProperties; children?: ReactNode }> = ({ depth = 0, driftX = 0, driftY = 0, rotateX = 0, rotateY = 0, style, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = clamp(frame / Math.max(1, durationInFrames - 1));
  return <div style={{ position: 'absolute', inset: 0, transform: `translate3d(${driftX * p}px,${driftY * p}px,${depth}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`, transformStyle: 'preserve-3d', ...style }}>{children}</div>;
};

/** Image/video overlay with native timing, fit and picture-in-picture geometry. */
export const MediaOverlay: React.FC<{
  src: string;
  kind?: 'image' | 'video';
  fromFrame?: number;
  durationInFrames?: number;
  muted?: boolean;
  fit?: 'cover' | 'contain';
  rect?: { x: number; y: number; width: number; height: number; radius?: number };
  style?: CSSProperties;
}> = ({ src, kind = 'image', fromFrame = 0, durationInFrames = 300, muted = true, fit = 'cover', rect = { x: 0, y: 0, width: 100, height: 100 }, style }) => (
  <Sequence from={Math.max(0, Math.round(fromFrame))} durationInFrames={Math.max(1, Math.round(durationInFrames))}>
    <div style={{ position: 'absolute', left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, borderRadius: rect.radius || 0, overflow: 'hidden', ...style }}>
      {kind === 'video' ? <OffthreadVideo src={src} muted={muted} style={{ height: '100%', objectFit: fit, width: '100%' }} /> : <Img src={src} style={{ height: '100%', objectFit: fit, width: '100%' }} />}
    </div>
  </Sequence>
);

/** Timed music/SFX cue with frame-accurate gain and optional fade. */
export const AudioCue: React.FC<{ src: string; atFrame?: number; durationInFrames?: number; volume?: number; fadeFrames?: number; loop?: boolean }> = ({ src, atFrame = 0, durationInFrames = 90, volume = .5, fadeFrames = 6, loop = false }) => (
  <Sequence from={Math.max(0, Math.round(atFrame))} durationInFrames={Math.max(1, Math.round(durationInFrames))}>
    <Audio src={src} loop={loop} volume={(frame) => {
      const fadeIn = clamp(frame / Math.max(1, fadeFrames));
      const fadeOut = clamp((durationInFrames - frame) / Math.max(1, fadeFrames));
      return Math.max(0, Math.min(1, volume)) * Math.min(fadeIn, fadeOut);
    }} />
  </Sequence>
);

/** Brand-owned lower-third/CTA plate without fixed Vidverge colors. */
export const BrandPlate: React.FC<{ title: string; detail?: string; theme?: BrandTheme; delay?: number; align?: 'left' | 'center' }> = ({ title, detail, theme, delay = 0, align = 'left' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 180, stiffness: 120 } });
  const primary = theme?.primary || BRAND.gold;
  return <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '10%', textAlign: align, fontFamily: theme?.fontFamily || BRAND.display, opacity: p, transform: `translateY(${(1 - p) * 32}px)` }}><div style={{ display: 'inline-block', maxWidth: '78%', borderLeft: `6px solid ${primary}`, borderRadius: 12, padding: '18px 24px', background: `${theme?.background || BRAND.ink}e8`, color: theme?.text || BRAND.text }}><div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>{detail ? <div style={{ color: theme?.muted || BRAND.textMuted, fontSize: 26, lineHeight: 1.35, marginTop: 8 }}>{detail}</div> : null}</div></div>;
};
