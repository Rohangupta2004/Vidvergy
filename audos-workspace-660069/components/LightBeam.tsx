/**
 * LIGHTBEAM — VidVerge's shared premium obsidian editor design system.
 *
 * One constant, imported by the studio apps (Script-to-Video, Video Enhancer,
 * Product Studio) so every studio surface shares the same canvas, cards and
 * accent. Values mirror components/theme.ts (Rich Black #0B0D12, gold
 * #D4AF37), so the shell, the shared UI layer and the apps read as one
 * product. Literal hex on purpose: consumers may append alpha suffixes or
 * paint these on <canvas>, where CSS variables do not resolve.
 *
 * The four surface values are deliberately four distinct steps — ground,
 * card, card-hover, elevated — because the editors stack panels three deep
 * and a dark theme with only two surface tones loses all of its depth.
 */

export const LB = {
  bg: '#0B0D12',
  bgCard: '#12141B',
  bgCardHover: '#1A1D26',
  bgDeep: '#222631',
  border: '1px solid rgba(255,255,255,0.07)',
  borderAccent: '1px solid rgba(212,175,55,0.42)',
  accent: '#D4AF37',
  accentDark: '#A8861F',
  accentGlow: 'rgba(212,175,55,0.26)',
  accentGradient: 'linear-gradient(135deg, #D4AF37 0%, #D4AF37 100%)',
  highlight: '#E6C45A',
  highlightBright: '#E6C45A',
  textPrimary: '#F5F6F8',
  textSecondary: '#C3C7D1',
  textMuted: '#9AA0AE',
  /** Input well — darker than a card so a field reads as recessed. */
  bgInput: '#0E1014',
  borderInput: '1px solid rgba(255,255,255,0.1)',
  /** Neutral button fill, for anything that is not the gold CTA. */
  bgButton: '#222631',
  radius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  shadow: '0 4px 24px rgba(0,0,0,0.4)',
  glowFocus: '0 0 0 2px #D4AF37, 0 0 22px rgba(212,175,55,0.26)',
} as const;

/** Timeline track colors (Video Enhancer NLE + anywhere clips are drawn).
 *  These stay three clearly different tones on purpose (gold, grey, soft
 *  white) — a timeline whose tracks are all brand gold cannot be read at a
 *  glance. */
export const LB_TRACKS = {
  video: '#D4AF37',
  audio: '#9AA0AE',
  captions: '#F5F6F8',
} as const;

/**
 * Skeleton shimmer (pure CSS keyframes — no animation libraries). Drop this
 * string into a <style> tag once per app, then put className="lb-shimmer" on
 * any placeholder block.
 */
export const LB_SHIMMER_CSS = `
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.lb-shimmer {
  background: linear-gradient(90deg, rgba(212,175,55,0.06) 25%, rgba(230,196,90,0.18) 50%, rgba(212,175,55,0.06) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s linear infinite;
  border-radius: 8px;
}
@media (prefers-reduced-motion: reduce) { .lb-shimmer { animation: none; } }
`;

/** Standard LightBeam card style (system-sans, 600-weight headers pair with it). */
export const lbCard = {
  background: LB.bgCard,
  border: LB.border,
  borderRadius: 12,
} as const;

export default LB;
