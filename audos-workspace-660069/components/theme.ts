/**
 * Vidverge Design System v4.0 — canonical premium token source.
 *
 * All TypeScript UI tokens originate here. config.json mirrors the same values
 * as --space-* variables for the OS shell. Compatibility aliases remain so
 * older studios adopt v3 without breaking their existing imports.
 */

export const COLORS = {
  bg: '#0A0A0B',
  surface: '#111114',
  raised: '#17171B',
  hover: '#1E1E23',
  border: 'rgba(255,255,255,0.08)',
  controlBorder: 'rgba(255,255,255,0.16)',
  text: '#F4F1EA',
  secondary: '#A8A39A',
  muted: '#7C776F',
  accent: '#D4A64A',
  onAccent: '#0A0A0B',
  accentHover: '#F6D98B',
  accentPressed: '#B07D2A',
  accentSoft: 'rgba(212,166,74,0.12)',
  bronze: '#B07D2A',
  focus: '#F6D98B',
  success: '#7FC59B',
  successBg: 'rgba(127,197,155,0.12)',
  warning: '#D7B66B',
  warningBg: 'rgba(215,182,107,0.12)',
  danger: '#E98585',
  dangerBg: 'rgba(233,133,133,0.12)',
  info: '#94ACC8',
  infoBg: 'rgba(148,172,200,0.12)',

  // Compatibility names used by existing studios.
  surfaceAlt: '#17171B',
  input: '#0A0A0B',
  buttonSecondary: '#17171B',
  borderHover: 'rgba(246,217,139,0.34)',
  borderInput: 'rgba(255,255,255,0.16)',
  primary: '#D4A64A',
  primaryGlow: '#F6D98B',
  accentGlow: '#F6D98B',
  textMuted: '#A8A39A',
  textFaint: '#7C776F',
  error: '#E98585',
} as const;

export const FONT = {
  heading: "'Space Grotesk', 'Segoe UI', sans-serif",
  body: "'Manrope', 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
} as const;

export const TYPE = {
  brand: { fontSize: 64, lineHeight: '68px', fontWeight: 500, letterSpacing: '-0.04em' },
  appTitle: { fontSize: 28, lineHeight: '36px', fontWeight: 600, letterSpacing: '-0.025em' },
  sectionTitle: { fontSize: 20, lineHeight: '28px', fontWeight: 500, letterSpacing: '-0.02em' },
  cardTitle: { fontSize: 16, lineHeight: '24px', fontWeight: 600 },
  body: { fontSize: 16, lineHeight: '24px', fontWeight: 400 },
  compact: { fontSize: 14, lineHeight: '20px', fontWeight: 400 },
  control: { fontSize: 14, lineHeight: '20px', fontWeight: 600 },
  metadata: { fontSize: 12, lineHeight: '18px', fontWeight: 500 },
} as const;

export const RADIUS = { badge: 6, sm: 10, md: 10, card: 12, lg: 12, dialog: 16, xl: 16, brand: 24 } as const;
export const SPACING = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 } as const;
export const MOTION = {
  fast: '160ms cubic-bezier(.2,0,0,1)',
  standard: '180ms cubic-bezier(.2,0,0,1)',
  overlay: '200ms cubic-bezier(.2,0,0,1)',
} as const;

export const HEADING_TRACKING = '-0.025em';
export const SHADOW = {
  glow: '0 0 0 1px rgba(246,217,139,0.14), 0 0 28px rgba(212,166,74,0.25)',
  glowCyan: '0 0 0 1px rgba(246,217,139,0.14), 0 0 28px rgba(212,166,74,0.25)',
  card: '0 18px 48px rgba(0,0,0,0.34)',
  overlay: '0 24px 72px rgba(0,0,0,0.58)',
} as const;
export const MOBILE_BREAKPOINT = 768;
export const CONTENT_MAX_WIDTH = 1280;

export const GRADIENT = {
  brand: 'linear-gradient(115deg, #F6D98B 0%, #D4A64A 52%, #B07D2A 100%)',
  action: 'linear-gradient(115deg, #F6D98B 0%, #D4A64A 52%, #B07D2A 100%)',
  actionHover: 'linear-gradient(115deg, #FBE7AE 0%, #E0B85F 52%, #C28D35 100%)',
  display: 'linear-gradient(110deg, #B07D2A 0%, #D4A64A 46%, #F6D98B 100%)',
  surface: 'linear-gradient(145deg, #1A1A1F 0%, #141417 54%, #101012 100%)',
  selected: 'linear-gradient(100deg, rgba(212,166,74,0.16) 0%, rgba(212,166,74,0.04) 100%)',
  ambient: 'radial-gradient(ellipse at 85% 0%, rgba(212,166,74,0.13) 0%, transparent 56%)',
  brandSoft: 'linear-gradient(100deg, rgba(212,166,74,0.16) 0%, rgba(212,166,74,0.04) 100%)',
  beam: 'linear-gradient(to top, transparent 0%, #B07D2A 58%, #F6D98B 100%)',
  header: 'radial-gradient(ellipse at 85% 0%, rgba(212,166,74,0.13) 0%, transparent 56%)',
} as const;

export function alpha(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, amount))})`;
}

export const CSS_VARS: Record<string, string> = {
  '--vg-bg': COLORS.bg,
  '--vg-surface': COLORS.surface,
  '--vg-raised': COLORS.raised,
  '--vg-hover': COLORS.hover,
  '--vg-border': COLORS.border,
  '--vg-control-border': COLORS.controlBorder,
  '--vg-text': COLORS.text,
  '--vg-secondary': COLORS.secondary,
  '--vg-muted': COLORS.muted,
  '--vg-accent': COLORS.accent,
  '--vg-on-accent': COLORS.onAccent,
  '--vg-accent-hover': COLORS.accentHover,
  '--vg-accent-pressed': COLORS.accentPressed,
  '--vg-accent-soft': COLORS.accentSoft,
  '--vg-bronze': COLORS.bronze,
  '--vg-focus': COLORS.focus,
  '--vg-success': COLORS.success,
  '--vg-success-bg': COLORS.successBg,
  '--vg-warning': COLORS.warning,
  '--vg-warning-bg': COLORS.warningBg,
  '--vg-danger': COLORS.danger,
  '--vg-danger-bg': COLORS.dangerBg,
  '--vg-info': COLORS.info,
  '--vg-info-bg': COLORS.infoBg,
  '--vg-gradient-brand': GRADIENT.display,
  '--vg-gradient-action': GRADIENT.action,
  '--vg-gradient-action-hover': GRADIENT.actionHover,
  '--vg-gradient-surface': GRADIENT.surface,
  '--vg-gradient-selected': GRADIENT.selected,
  '--vg-gradient-ambient': GRADIENT.ambient,
  '--vg-glow': SHADOW.glow,
};

export type ThemeColor = keyof typeof COLORS;
export default { COLORS, FONT, TYPE, RADIUS, SPACING, MOTION, SHADOW, GRADIENT, CSS_VARS, alpha };
