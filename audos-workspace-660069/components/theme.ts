/**
 * Vidverge Design System v7.0 — single-accent gold token source.
 *
 * All TypeScript UI tokens originate here. config.json mirrors the same values
 * as --space-* variables for the OS shell. Compatibility aliases remain so
 * older studios adopt v3 without breaking their existing imports.
 */

export const COLORS = {
  bg: 'var(--vg-bg)',
  surface: 'var(--vg-surface)',
  raised: 'var(--vg-raised)',
  hover: 'var(--vg-hover)',
  border: 'var(--vg-border)',
  controlBorder: 'var(--vg-control-border)',
  text: 'var(--vg-text)',
  secondary: 'var(--vg-secondary)',
  muted: 'var(--vg-muted)',
  accent: 'var(--vg-accent)',
  onAccent: 'var(--vg-on-accent)',
  accentHover: 'var(--vg-accent-hover)',
  accentPressed: 'var(--vg-accent-pressed)',
  accentSoft: 'var(--vg-accent-soft)',
  selected: 'var(--vg-selected)',
  selectedSoft: 'var(--vg-selected-soft)',
  onSelected: 'var(--vg-on-selected)',
  bronze: 'var(--vg-bronze)',
  gold: 'var(--vg-gold)',
  btn: 'var(--vg-btn)',
  onBtn: 'var(--vg-on-btn)',
  btnHover: 'var(--vg-btn-hover)',
  btnPressed: 'var(--vg-btn-pressed)',
  credit: 'var(--vg-credit)',
  creditSoft: 'var(--vg-credit-soft)',
  creditInk: 'var(--vg-credit-ink)',
  focus: 'var(--vg-focus)',
  success: 'var(--vg-success)',
  successBg: 'var(--vg-success-bg)',
  warning: 'var(--vg-warning)',
  warningBg: 'var(--vg-warning-bg)',
  danger: 'var(--vg-danger)',
  dangerBg: 'var(--vg-danger-bg)',
  info: 'var(--vg-info)',
  infoBg: 'var(--vg-info-bg)',
  goldBright: 'var(--vg-gold-bright)',
  goldDeep: 'var(--vg-gold-deep)',
  goldTint: 'var(--vg-gold-tint)',
  amber: 'var(--vg-amber)',
  // Timeline tracks stay hex because canvas/SVG painters cannot resolve CSS variables.
  trackVideo: '#D4AF37',
  trackBroll: '#A8861F',
  trackCaptions: '#E6C45A',
  trackText: '#F5F6F8',
  trackMusic: '#8C7426',
  trackVoice: '#9AA0AE',

  // Compatibility names used by existing studios.
  surfaceAlt: 'var(--vg-raised)',
  input: 'var(--vg-bg)',
  buttonSecondary: 'var(--vg-raised)',
  borderHover: 'var(--line-gold)',
  borderInput: 'var(--vg-control-border)',
  primary: 'var(--vg-accent)',
  primaryGlow: 'var(--vg-accent-hover)',
  accentGlow: 'var(--vg-accent-hover)',
  textMuted: 'var(--vg-secondary)',
  textFaint: 'var(--vg-muted)',
  error: 'var(--vg-danger)',
} as const;

export const FONT = {
  heading: 'var(--display)',
  body: 'var(--body)',
  mono: "'Geist Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace",
} as const;

export const TYPE = {
  brand: { fontSize: 64, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.045em' },
  appTitle: { fontSize: 32, lineHeight: '38px', fontWeight: 800, letterSpacing: '-0.03em' },
  sectionTitle: { fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.015em' },
  cardTitle: { fontSize: 16, lineHeight: '22px', fontWeight: 700, letterSpacing: '-0.01em' },
  body: { fontSize: 14, lineHeight: '22px', fontWeight: 400 },
  compact: { fontSize: 14, lineHeight: '20px', fontWeight: 400 },
  control: { fontSize: 14, lineHeight: '20px', fontWeight: 600 },
  metadata: { fontSize: 12, lineHeight: '16px', fontWeight: 500 },
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
  glow: '0 0 0 1px color-mix(in srgb, var(--vg-selected) 26%, transparent)',
  glowCyan: '0 0 0 1px color-mix(in srgb, var(--vg-selected) 26%, transparent)',
  card: '0 18px 48px rgba(0,0,0,0.18)',
  overlay: '0 24px 72px rgba(0,0,0,0.32)',
} as const;
export const MOBILE_BREAKPOINT = 768;
export const CONTENT_MAX_WIDTH = 1280;

// Single-accent gold theme: the primary action is a solid gold fill (kept as an
// image value so `background:` and `background-image:` consumers both work).
export const GRADIENT = {
  brand: 'var(--molten)',
  action: 'linear-gradient(0deg,#D4AF37,#D4AF37)',
  actionHover: 'linear-gradient(0deg,#E6C45A,#E6C45A)',
  display: 'var(--molten)',
  surface: 'var(--card-grad)',
  selected: 'linear-gradient(0deg,var(--vg-selected-soft),var(--vg-selected-soft))',
  ambient: 'var(--haze, none)',
  brandSoft: 'var(--molten-soft)',
  beam: 'linear-gradient(0deg,var(--vg-selected),var(--vg-selected))',
  header: 'none',
} as const;

export function alpha(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `color-mix(in srgb, ${hex} ${Math.round(Math.max(0, Math.min(1, amount)) * 100)}%, transparent)`;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, amount))})`;
}

export const CSS_VARS: Record<string, string> = {
  // DARK (Rich Black + single gold accent) defaults. Light overrides live in ui/GlobalStyles.tsx.
  '--vg-bg': '#0b0d12',
  '--vg-surface': '#12141b',
  '--vg-raised': '#1a1d26',
  '--vg-hover': '#222631',
  '--vg-border': '#2a2e3a',
  '--vg-control-border': '#3a3f4d',
  '--vg-text': '#f5f6f8',
  '--vg-secondary': '#c3c7d1',
  '--vg-muted': '#9aa0ae',
  '--vg-accent': '#d4af37',
  '--vg-on-accent': '#0b0d12',
  '--vg-accent-hover': '#e6c45a',
  '--vg-accent-pressed': '#a8861f',
  '--vg-accent-soft': 'rgba(212,175,55,.15)',
  '--vg-selected': '#d4af37',
  '--vg-selected-soft': 'rgba(212,175,55,.15)',
  '--vg-on-selected': '#e6c45a',
  '--vg-bronze': '#a8861f',
  '--vg-gold': '#d4af37',
  '--vg-gold-bright': '#e6c45a',
  '--vg-gold-deep': '#a8861f',
  '--vg-gold-tint': 'rgba(212,175,55,.15)',
  '--vg-amber': '#ffb020',
  '--vg-error': '#e5484d',
  '--vg-focus': '#d4af37',
  '--vg-btn': '#d4af37',
  '--vg-on-btn': '#0b0d12',
  '--vg-btn-hover': '#e6c45a',
  '--vg-btn-pressed': '#a8861f',
  '--vg-credit': '#ffb020',
  '--vg-credit-soft': 'rgba(255,176,32,.12)',
  '--vg-credit-ink': '#ffc65c',
  '--vg-success': '#3fb950',
  '--vg-success-bg': 'rgba(63,185,80,.12)',
  '--vg-warning': '#ffb020',
  '--vg-warning-bg': 'rgba(255,176,32,.12)',
  '--vg-danger': '#e5484d',
  '--vg-danger-bg': 'rgba(229,72,77,.12)',
  '--vg-info': '#c3c7d1',
  '--vg-info-bg': 'rgba(245,246,248,.06)',
  '--vg-gradient-brand': GRADIENT.display,
  '--vg-gradient-action': GRADIENT.action,
  '--vg-gradient-action-hover': GRADIENT.actionHover,
  '--vg-gradient-surface': GRADIENT.surface,
  '--vg-gradient-selected': GRADIENT.selected,
  '--vg-gradient-ambient': GRADIENT.ambient,
  '--vg-glow': SHADOW.glow,
  '--vg-space-1': `${SPACING.xxs}px`,
  '--vg-space-2': `${SPACING.xs}px`,
  '--vg-space-3': `${SPACING.sm}px`,
  '--vg-space-4': `${SPACING.md}px`,
  '--vg-space-6': `${SPACING.lg}px`,
  '--vg-space-8': `${SPACING.xl}px`,
  '--vg-space-12': `${SPACING['2xl']}px`,
  '--vg-space-16': `${SPACING['3xl']}px`,
  '--vg-radius-control': `${RADIUS.sm}px`,
  '--vg-radius-card': `${RADIUS.card}px`,
  '--vg-radius-dialog': `${RADIUS.dialog}px`,
  '--vg-elevation-card': SHADOW.card,
  '--vg-elevation-overlay': SHADOW.overlay,
};

export type ThemeColor = keyof typeof COLORS;
export default { COLORS, FONT, TYPE, RADIUS, SPACING, MOTION, SHADOW, GRADIENT, CSS_VARS, alpha };
