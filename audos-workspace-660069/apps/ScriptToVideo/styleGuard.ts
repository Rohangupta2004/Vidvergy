/**
 * STYLE GUARD — the one place a film's chosen look becomes prompt text.
 *
 * Every still (character sheets, storyboard keyframes) and every video prompt
 * reads the look through here, so the creator's pick in the Look step reaches
 * each generation as an explicit LEADING clause plus a clause that bans the
 * conflicting looks. The preset id is resolved to its full direction text: a
 * bare id such as "anime" or the planner's own paraphrase is never the only
 * thing a model sees.
 */
import { VIDEO_STYLE_PRESETS } from './v2Contracts';

/** Any record carrying the film's style fields (a FilmPlan, or create params). */
export interface StyleSource {
  video_style?: string | null;
  custom_visual_direction?: string | null;
  visual_style?: string | null;
  style_direction?: string | null;
  global_style?: string | null;
}

type StyleFamily = 'live-action' | '3d' | '2d' | 'anime' | 'sketch' | 'motion-graphics' | 'comic' | 'watercolor' | 'custom';

const FAMILY_OF: Record<string, StyleFamily> = {
  'cinematic-live-action': 'live-action',
  'photoreal-commercial': 'live-action',
  'documentary-natural': 'live-action',
  '3d-animation': '3d',
  '2d-animation': '2d',
  anime: 'anime',
  'hand-drawn-sketch': 'sketch',
  'motion-graphics': 'motion-graphics',
  'comic-graphic-novel': 'comic',
  'watercolor-painterly': 'watercolor',
};

/** How each family reads when it is the WRONG look. Worded so the provider
 * safety scrub (which strips "realistic", "photorealistic", "physics"…) leaves
 * every phrase intact. */
const FAMILY_LOOK: Record<Exclude<StyleFamily, 'custom'>, string> = {
  'live-action': 'photographic live-action footage',
  '3d': '3D CGI animation render',
  '2d': 'flat 2D cartoon animation',
  anime: 'anime or manga drawing',
  sketch: 'pencil or ink sketch',
  'motion-graphics': 'abstract motion-graphics design',
  comic: 'comic-book or graphic-novel inks',
  watercolor: 'watercolor or painterly illustration',
};

export interface ResolvedStyle {
  id: string;
  label: string;
  direction: string;
  /** The planner's or script's own look notes, when they add something. */
  detail: string;
  family: StyleFamily;
}

function clip(text: string, max: number): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

export function resolveFilmStyle(source?: StyleSource | null): ResolvedStyle {
  const id = String(source?.video_style || '').trim();
  const custom = String(source?.custom_visual_direction || '').trim();
  const extra = String(source?.visual_style || source?.style_direction || source?.global_style || '').trim();
  const preset = VIDEO_STYLE_PRESETS.find((item) => item[0] === id);
  if (preset) {
    const direction: string = preset[2];
    const detail = custom && custom !== direction ? custom : extra && !extra.includes(direction) ? extra : '';
    return { id, label: preset[1], direction, detail: clip(detail, 320), family: FAMILY_OF[id] || 'custom' };
  }
  if (custom) {
    return { id: 'custom', label: 'Custom look', direction: clip(custom, 600), detail: extra && extra !== custom && !custom.includes(extra) ? clip(extra, 320) : '', family: 'custom' };
  }
  if (extra) return { id: 'custom', label: 'Film look', direction: clip(extra, 600), detail: '', family: 'custom' };
  const fallback = VIDEO_STYLE_PRESETS[0];
  return { id: fallback[0], label: fallback[1], direction: fallback[2], detail: '', family: 'live-action' };
}

/** "Anime: cinematic anime, expressive … Film look details: …" */
export function filmStyleText(source?: StyleSource | null): string {
  const style = resolveFilmStyle(source);
  return `${style.label}: ${style.direction}${style.detail ? `. Film look details: ${style.detail}` : ''}`;
}

/** The looks that conflict with the chosen one, as "no …" items. */
export function styleConflictBans(source?: StyleSource | null): string[] {
  const style = resolveFilmStyle(source);
  if (style.family === 'custom') return ['no mixing of different art styles inside one frame', 'no drifting away from the chosen look between shots'];
  const others = (Object.keys(FAMILY_LOOK) as Array<keyof typeof FAMILY_LOOK>)
    .filter((family) => family !== style.family)
    .map((family) => FAMILY_LOOK[family]);
  return [`no other art style (not ${others.join(', not ')})`, 'no mixing of styles inside one frame'];
}

/** MUST NOT items for a video prompt: the short ban first (it survives a
 * compact model's character limit), then the full list of conflicting looks. */
export function videoStyleBans(source?: StyleSource | null): string[] {
  const style = resolveFilmStyle(source);
  return [`no art style other than ${style.label}`, ...styleConflictBans(source)];
}

/** The explicit leading clause every image prompt starts with. */
export function imageStyleLead(source?: StyleSource | null): string {
  return `MANDATORY VISUAL STYLE — ${filmStyleText(source)}. Render every person, prop and background in this one style.`;
}

/** The clause every image prompt ends with: the conflicting looks, banned. */
export function imageStyleNegative(source?: StyleSource | null): string {
  return `STYLE GUARD: ${styleConflictBans(source).join('; ')}.`;
}

/** Wrap an image prompt with the style lead and the conflicting-style ban.
 * Idempotent, so a prompt that already carries the lead is not doubled. */
export function withImageStyle(prompt: string, source?: StyleSource | null): string {
  const body = String(prompt || '').trim();
  const lead = imageStyleLead(source);
  if (body.startsWith(lead)) return body;
  return `${lead}\n${body}\n${imageStyleNegative(source)}`;
}

/** The style text a character sheet is drawn in: the look plus its ban. */
export function characterSheetStyle(source?: StyleSource | null): string {
  return `${filmStyleText(source)}. ${imageStyleNegative(source)}`;
}
