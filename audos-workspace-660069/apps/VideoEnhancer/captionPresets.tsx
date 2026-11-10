import type { CSSProperties } from 'react';
import type { CaptionCategory, CaptionStyle, CaptionStyleId, RoleStyle } from './modernEditorModel';

export const CAPTION_FONT_STACK = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const CAPTION_FONT_STACKS: Record<RoleStyle['font'], string> = {
  inter: CAPTION_FONT_STACK,
  anton: "Anton, Impact, sans-serif",
  serif: "'Instrument Serif', Georgia, serif",
  caveat: "Caveat, cursive",
  mono: "'Geist Mono', ui-monospace, monospace",
};

export interface CaptionPreset extends CaptionStyle {
  label: string;
  hint: string;
  styleId: CaptionStyleId;
  fontId: string;
  color: string;
  activeColor: string;
  stroke: number;
  uppercase: boolean;
  weight: number;
  radius: number;
  shadow: string;
  letterSpacing: number;
}

const role = (font: RoleStyle['font'], weight: number, color: string, more: Partial<RoleStyle> = {}): RoleStyle => ({ font, weight, color, case: 'none', scale: 1, ...more });
const make = (style: CaptionStyle & { hint: string }): CaptionPreset => ({
  ...style,
  label: style.name,
  styleId: style.id,
  fontId: style.roles.normal.font,
  color: style.roles.normal.color,
  activeColor: style.roles.key.color,
  stroke: style.roles.normal.stroke?.width || 0,
  uppercase: style.roles.normal.case === 'upper',
  weight: style.roles.normal.weight,
  radius: style.roles.normal.box?.radius || 0,
  shadow: style.roles.normal.glow || '0 3px 12px rgba(0,0,0,.72)',
  letterSpacing: style.id === 'ed' ? .24 : style.roles.normal.case === 'upper' ? .01 : 0,
});

export const CAPTION_PRESETS: CaptionPreset[] = [
  make({ id: 'pop', name: 'Bold Pop', cat: 'bold', hint: 'Punchy word-by-word pops', animation: 'pop', roles: {
    normal: role('inter', 800, '#FFFFFF', { case: 'upper', stroke: { color: '#000000', width: 3 } }),
    key: role('inter', 900, '#FFC23D', { case: 'upper', scale: 1.12, stroke: { color: '#000000', width: 3 } }),
    emph: role('inter', 900, '#FFFFFF', { case: 'upper', scale: 1.18, stroke: { color: '#000000', width: 3 } }),
  } }),
  make({ id: 'hz', name: 'Heavy Caps', cat: 'bold', hint: 'Anton caps · one key per line', animation: 'pop', roles: {
    normal: role('anton', 400, '#FFFFFF', { case: 'upper' }),
    key: role('anton', 400, '#3DDC84', { case: 'upper', scale: 1.08 }),
    emph: role('anton', 400, '#FFC23D', { case: 'upper', scale: 1.12 }),
  } }),
  make({ id: 'bk', name: 'Big Key Word', cat: 'bold', hint: 'Small setup over a huge key', animation: 'pop', layout: 'bigKey', roles: {
    normal: role('inter', 700, '#FFFFFF', { case: 'lower', scale: .5 }),
    key: role('inter', 900, '#FFC23D', { scale: 1.6 }),
    emph: role('inter', 900, '#FFFFFF', { scale: 1.35 }),
  } }),
  make({ id: 'ol', name: 'Outline', cat: 'bold', hint: 'Hollow white with a gold key', animation: 'pop', roles: {
    normal: role('inter', 900, 'transparent', { case: 'upper', stroke: { color: '#FFFFFF', width: 2 } }),
    key: role('inter', 900, '#FFC23D', { case: 'upper' }),
    emph: role('inter', 900, '#FFFFFF', { case: 'upper' }),
  } }),
  make({ id: 'mn', name: 'Minimal', cat: 'clean', hint: 'Sentence case · quiet soft shadow', animation: 'fade', roles: {
    normal: role('inter', 600, '#FFFFFF', { glow: '0 2px 10px rgba(0,0,0,.72)' }),
    key: role('inter', 600, '#FFFFFF', { glow: '0 2px 10px rgba(0,0,0,.72)' }),
    emph: role('inter', 700, '#FFFFFF', { scale: 1.05 }),
  } }),
  make({ id: 'k', name: 'Karaoke', cat: 'clean', hint: 'Gold follows exact word timing', animation: 'karaoke', roles: {
    normal: role('inter', 800, '#FFFFFF'),
    key: role('inter', 800, '#140E00', { box: { color: '#FFC23D', radius: 6, padX: 5 } }),
    emph: role('inter', 900, '#FFFFFF', { scale: 1.08 }),
  } }),
  make({ id: 'gl', name: 'Glass', cat: 'clean', hint: 'Frosted plate · aqua key', animation: 'fade', plate: { kind: 'glass', color: 'rgba(255,255,255,.14)' }, roles: {
    normal: role('inter', 700, '#FFFFFF'), key: role('inter', 800, '#2DE1C2'), emph: role('inter', 800, '#FFFFFF', { scale: 1.08 }),
  } }),
  make({ id: 'nb', name: 'News Bar', cat: 'clean', hint: 'White bar with a gold edge', animation: 'fade', plate: { kind: 'bar', color: '#FFFFFF' }, roles: {
    normal: role('inter', 800, '#140E00'), key: role('inter', 900, '#140E00'), emph: role('inter', 900, '#140E00'),
  } }),
  make({ id: 'mx', name: 'Sans + Serif', cat: 'mixed', hint: 'Signature serif key word', animation: 'fade', roles: {
    normal: role('inter', 800, '#FFFFFF'),
    key: role('serif', 400, '#FFC23D', { italic: true, scale: 1.32 }),
    emph: role('inter', 900, '#2DE1C2', { scale: 1.12 }),
  } }),
  make({ id: 'st', name: 'Two-Tone Stack', cat: 'mixed', hint: 'Heavy caps over gold serif', animation: 'pop', layout: 'stack', roles: {
    normal: role('inter', 900, '#FFFFFF', { case: 'upper' }), key: role('serif', 400, '#FFC23D', { italic: true, scale: 1.18 }), emph: role('inter', 900, '#2DE1C2'),
  } }),
  make({ id: 'hw', name: 'Handwritten', cat: 'mixed', hint: 'Caveat key with a human tilt', animation: 'bounce', roles: {
    normal: role('inter', 900, '#FFFFFF', { case: 'upper' }), key: role('caveat', 700, '#2DE1C2', { scale: 1.5, rotate: -5 }), emph: role('inter', 900, '#FFC23D', { scale: 1.12 }),
  } }),
  make({ id: 'ed', name: 'Editorial', cat: 'mixed', hint: 'Serif line with a compact label', animation: 'fade', layout: 'editorial', roles: {
    normal: role('serif', 400, '#FFFFFF'), key: role('inter', 800, '#FFC23D', { case: 'upper', scale: .72 }), emph: role('serif', 400, '#FFFFFF', { italic: true, scale: 1.08 }),
  } }),
  make({ id: 'bh', name: 'Word Behind', cat: 'behind', hint: 'Huge word behind the speaker', animation: 'fade', behind: 'word', roles: {
    normal: role('anton', 400, 'transparent'), key: role('anton', 400, '#FFFFFF', { case: 'upper', scale: 2.4 }), emph: role('anton', 400, '#FFC23D', { case: 'upper', scale: 2.4 }),
  } }),
  make({ id: 'bhc', name: 'Behind + Caption', cat: 'behind', hint: 'Behind word plus front caption', animation: 'pop', behind: 'wordAndCaption', roles: {
    normal: role('inter', 800, '#FFFFFF'), key: role('anton', 400, '#FFC23D', { case: 'upper', scale: 2.3 }), emph: role('inter', 900, '#2DE1C2', { scale: 1.1 }),
  } }),
  make({ id: 'ne', name: 'Neon', cat: 'fun', hint: 'Cyan and aqua glow', animation: 'pop', roles: {
    normal: role('inter', 800, '#C8FFF7', { glow: '0 0 10px #2DE1C2,0 0 24px rgba(45,225,194,.62)' }), key: role('inter', 900, '#FFFFFF', { glow: '0 0 12px #2DE1C2' }), emph: role('inter', 900, '#C8FFF7', { scale: 1.12 }),
  } }),
  make({ id: 'tw', name: 'Typewriter', cat: 'fun', hint: 'Geist Mono with a cursor', animation: 'type', roles: {
    normal: role('mono', 600, '#FFFFFF'), key: role('mono', 700, '#FFC23D'), emph: role('mono', 700, '#2DE1C2'),
  } }),
  make({ id: 'stk', name: 'Sticker', cat: 'fun', hint: 'Orange label · bounce in', animation: 'bounce', plate: { kind: 'sticker', color: '#FF8A4C' }, roles: {
    normal: role('inter', 900, '#FFFFFF', { case: 'upper', rotate: -4, stroke: { color: '#FFFFFF', width: 1 } }), key: role('inter', 900, '#FFFFFF', { case: 'upper', scale: 1.08, rotate: -4 }), emph: role('inter', 900, '#140E00', { case: 'upper', scale: 1.1, rotate: -4 }),
  } }),
];

export const CAPTION_CATEGORIES: { id: 'all' | CaptionCategory; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'bold', label: 'Bold' }, { id: 'clean', label: 'Clean' }, { id: 'mixed', label: 'Mixed' }, { id: 'behind', label: 'Behind' }, { id: 'fun', label: 'Fun' },
];

export function CaptionThumb({ preset }: { preset: CaptionPreset }) {
  const normal = preset.roles.normal;
  const key = preset.roles.key;
  const plate = preset.plate;
  const line: CSSProperties = {
    fontFamily: CAPTION_FONT_STACKS[normal.font], fontWeight: normal.weight, color: normal.color,
    textTransform: normal.case === 'upper' ? 'uppercase' : normal.case === 'lower' ? 'lowercase' : 'none',
    background: plate?.color || normal.box?.color || 'transparent', borderRadius: normal.box?.radius || (plate ? 7 : 0),
    padding: plate ? '4px 8px' : 0, textShadow: normal.glow || preset.shadow,
    WebkitTextStroke: normal.stroke ? `${Math.max(.5, normal.stroke.width * .45)}px ${normal.stroke.color}` : undefined,
    paintOrder: 'stroke fill', transform: normal.rotate ? `rotate(${normal.rotate}deg)` : undefined,
  };
  const keyStyle: CSSProperties = {
    fontFamily: CAPTION_FONT_STACKS[key.font], fontWeight: key.weight, fontStyle: key.italic ? 'italic' : undefined,
    color: key.color, transform: `scale(${Math.min(1.35, key.scale || 1)}) rotate(${key.rotate || 0}deg)`,
    textShadow: key.glow, WebkitTextStroke: key.stroke ? `${Math.max(.5, key.stroke.width * .45)}px ${key.stroke.color}` : undefined,
  };
  return <span className="vx-capthumb" aria-hidden="true"><span className="vx-capthumb-line" style={line}><span>Edit</span>{' '}<span style={keyStyle}>faster</span></span></span>;
}
