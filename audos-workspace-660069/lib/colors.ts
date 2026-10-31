/**
 * Genesis Space Design System
 * 
 * A cohesive color, typography, and component style system for the genesis space template.
 * All components should reference these constants for visual consistency.
 * 
 * IMPORTANT FOR APP BUILDERS:
 * When building apps, you MUST update the brand colors below to match the workspace branding.
 * Replace WORKSPACE_PRIMARY_COLOR and WORKSPACE_HIGHLIGHT_COLOR with actual brand hex values.
 * 
 * Color Philosophy:
 * - Brand: The main brand color used for primary actions (from workspace branding)
 * - Accent: Secondary brand color for highlights and agent elements (from workspace branding)
 * - Semantic: Green (success), Red (danger), Yellow (warning)
 * - Neutrals: Grays for backgrounds, text, and borders
 */

// =============================================================================
// CORE THEME CONFIGURATION - UPDATE THESE WITH WORKSPACE BRAND COLORS!
// =============================================================================

/**
 * Brand colors - These define the visual identity
 * IMPORTANT: Replace these hex values with the workspace brand colors:
 * - primary.600 should be WORKSPACE_PRIMARY_COLOR
 * - accent.600 should be WORKSPACE_HIGHLIGHT_COLOR (or primary if no distinct highlight)
 */
export const brand = {
  // Primary brand color - used for main actions, buttons, links
  primary: {
    50: 'var(--space-brand-primary-50)',
    100: 'var(--space-brand-primary-100)',
    200: 'var(--space-brand-primary-200)',
    500: 'var(--space-brand-primary-500)',
    600: 'var(--space-brand-primary-600)',
    700: 'var(--space-brand-primary-700)',
    900: 'var(--space-brand-primary-900)',
  },
  accent: {
    50: 'var(--space-brand-highlight-50)',
    100: 'var(--space-brand-highlight-100)',
    200: 'var(--space-brand-highlight-200)',
    500: 'var(--space-brand-highlight-500)',
    600: 'var(--space-brand-highlight-600)',
    700: 'var(--space-brand-highlight-700)',
    900: 'var(--space-brand-highlight-900)',
  },
} as const;

/**
 * Semantic colors - Use for status and feedback
 */
export const semantic = {
  success: { 50: 'var(--vg-success-bg)', 100: 'var(--vg-success-bg)', 500: 'var(--vg-success)', 600: 'var(--vg-success)', 700: 'var(--vg-success)' },
  warning: { 50: 'var(--vg-warning-bg)', 100: 'var(--vg-warning-bg)', 500: 'var(--vg-warning)', 600: 'var(--vg-warning)', 700: 'var(--vg-warning)' },
  danger: { 50: 'var(--vg-danger-bg)', 100: 'var(--vg-danger-bg)', 500: 'var(--vg-danger)', 600: 'var(--vg-danger)', 700: 'var(--vg-danger)' },
} as const;

/**
 * Neutral colors - Backgrounds, text, borders
 */
export const neutral = {
  0: 'var(--vg-text)',
  50: 'var(--vg-text)',
  100: 'var(--vg-secondary)',
  200: 'var(--vg-muted)',
  300: 'var(--vg-control-border)',
  400: 'var(--vg-muted)',
  500: 'var(--vg-muted)',
  600: 'var(--vg-border)',
  700: 'var(--vg-hover)',
  800: 'var(--vg-raised)',
  900: 'var(--vg-surface)',
  950: 'var(--vg-bg)',
} as const;

// =============================================================================
// TYPOGRAPHY SYSTEM
// =============================================================================

/**
 * Typography configuration
 * Font family is injected via Google Fonts in Desktop.tsx
 * IMPORTANT: Update the fontFamily to match workspace brand fonts from config.json!
 */
export const typography = {
  // Font family - loaded via Google Fonts link in Desktop.tsx
  // UPDATE: Replace "Inter" with the workspace headingFont from config.desktop.branding
  fontFamily: 'var(--space-font-family, "Manrope", "Segoe UI", sans-serif)',
  
  // Font sizes with line heights
  size: {
    xs: 'text-xs',      // 12px
    sm: 'text-sm',      // 14px
    base: 'text-base',  // 16px
    lg: 'text-lg',      // 18px
    xl: 'text-xl',      // 20px
    '2xl': 'text-2xl',  // 24px
    '3xl': 'text-3xl',  // 30px
    '4xl': 'text-4xl',  // 36px
  },
  
  // Font weights
  weight: {
    light: 'font-light',      // 300
    normal: 'font-normal',    // 400
    medium: 'font-medium',    // 500
    semibold: 'font-semibold', // 600
    bold: 'font-bold',        // 700
  },
  
  // Text colors — token-driven so the premium obsidian theme flows everywhere
  color: {
    primary: 'text-[var(--space-text-primary)]',      // Headings, important text
    secondary: 'text-[var(--space-text-secondary)]',  // Body text, descriptions
    tertiary: 'text-[var(--space-text-secondary)]',   // Subtle text, captions
    muted: 'text-[var(--space-text-muted)]',           // Placeholder, disabled
    inverse: 'text-[var(--vg-on-accent)]',                             // On dark backgrounds
    brand: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    danger: 'text-[var(--space-semantic-danger)]',     // Error text
    success: 'text-[var(--space-semantic-success)]',   // Success text
  },
} as const;

// =============================================================================
// LEGACY COLORS OBJECT (for backwards compatibility)
// =============================================================================

export const colors = {
  primary: brand.primary,
  accent: brand.accent,
  success: semantic.success,
  warning: semantic.warning,
  danger: semantic.danger,
  neutral,
  
  // Gradient backgrounds (for Desktop background)
  gradients: {
    default: 'from-[var(--vg-bg)] via-[var(--vg-bg)] to-[var(--vg-surface)]',
    warm: 'from-[var(--vg-bg)] via-[var(--vg-surface)] to-[var(--vg-raised)]',
    cool: 'from-[var(--vg-bg)] via-[var(--vg-surface)] to-[var(--vg-raised)]',
    nature: 'from-[var(--vg-bg)] via-[var(--vg-surface)] to-[var(--vg-raised)]',
    brand: 'from-[var(--vg-bg)] via-[var(--vg-surface)] to-[var(--vg-raised)]',
  },
  
  // Glass/frosted effect
  glass: {
    background: 'bg-[color-mix(in_srgb,var(--vg-surface)_92%,transparent)] backdrop-blur-lg',
    border: 'border-[var(--vg-border)]',
  }
} as const;

// =============================================================================
// TAILWIND CLASS HELPERS
// =============================================================================

/**
 * Tailwind class helpers for common UI patterns
 * Use these in your components for consistency
 */
export const tw = {
  // ---------------------------------------------------------------------------
  // BUTTONS
  // ---------------------------------------------------------------------------
  button: {
    // Primary action button (main CTA)
    primary: 'bg-[image:var(--vg-gradient-action)] hover:bg-[image:var(--vg-gradient-action-hover)] text-[var(--vg-on-accent)] font-semibold transition-colors',
    brand: 'bg-[image:var(--vg-gradient-action)] hover:bg-[image:var(--vg-gradient-action-hover)] text-[var(--vg-on-accent)] font-semibold transition-colors',
    accent: 'bg-[image:var(--vg-gradient-action)] hover:bg-[image:var(--vg-gradient-action-hover)] text-[var(--vg-on-accent)] font-semibold transition-colors',
    // Secondary button
    secondary: 'bg-[var(--vg-surface)] hover:bg-[var(--vg-hover)] border border-[var(--vg-control-border)] text-[var(--vg-text)] font-semibold transition-colors',
    // Danger button
    danger: 'bg-[var(--vg-danger-bg)] border border-[var(--vg-danger)] text-[var(--vg-danger)] font-semibold transition-colors',
    // Ghost button (transparent)
    ghost: 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] transition-all',
    // Disabled state modifier
    disabled: 'opacity-50 cursor-not-allowed',
  },
  
  // ---------------------------------------------------------------------------
  // FORM INPUTS
  // ---------------------------------------------------------------------------
  input: {
    // Base input styles
    base: 'w-full min-h-11 px-3 border rounded-[10px] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--vg-bg)] transition-colors',
    // Default state
    default: 'border-[var(--vg-control-border)] bg-[var(--vg-bg)] text-[var(--vg-text)] focus:ring-[var(--vg-focus)]',
    // Error state
    error: 'border-[var(--space-semantic-danger-500)] focus:ring-[var(--space-semantic-danger-500)]',
    // Disabled state
    disabled: 'bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] cursor-not-allowed',
  },
  
  // ---------------------------------------------------------------------------
  // DOCK (left navigation)
  // ---------------------------------------------------------------------------
  dock: {
    active: 'bg-[var(--space-brand-primary)] text-[var(--space-shell-dock-text)] shadow-lg',
    inactive: 'bg-[var(--space-surface-card)] hover:brightness-95 text-[var(--space-text-primary)]',
    glass: 'bg-[var(--space-surface-panel)] backdrop-blur-lg rounded-2xl shadow-xl',
  },
  
  // ---------------------------------------------------------------------------
  // MESSAGE BUBBLES (chat)
  // ---------------------------------------------------------------------------
  message: {
    user: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-primary)]',
    assistant: 'bg-[var(--space-surface-panel)] text-[var(--space-text-primary)]',
  },
  
  // ---------------------------------------------------------------------------
  // ICONS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  icon: {
    primary: 'text-[var(--space-text-brand)]',
    accent: 'text-[var(--space-text-accent)]',
    neutral: 'text-[var(--space-text-secondary)]',
    muted: 'text-[var(--space-text-muted)]',
    danger: 'text-[var(--space-semantic-danger)]',
    success: 'text-[var(--space-semantic-success)]',
  },
  
  // ---------------------------------------------------------------------------
  // CARDS
  // ---------------------------------------------------------------------------
  card: {
    default: 'bg-[var(--vg-surface)] border border-[var(--vg-border)] rounded-xl transition-colors',
    elevated: 'bg-[var(--vg-raised)] border border-[var(--vg-border)] rounded-2xl',
    glass: 'bg-[var(--vg-surface)] border border-[var(--vg-border)] rounded-xl',
    flat: 'bg-[var(--vg-raised)] rounded-xl border border-[var(--vg-border)]',
  },
  
  // ---------------------------------------------------------------------------
  // BADGES / PILLS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  badge: {
    default: 'px-2 py-0.5 text-xs font-medium rounded-md',
    primary: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]',
    accent: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    success: 'bg-[var(--space-semantic-success-50)] text-[var(--space-semantic-success)]',
    warning: 'bg-[var(--vg-warning-bg)] text-[var(--vg-warning)]',
    danger: 'bg-[color-mix(in_srgb,#f87171_12%,transparent)] text-[var(--space-semantic-danger)]',
    neutral: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },
  
  // ---------------------------------------------------------------------------
  // LAYOUTS
  // ---------------------------------------------------------------------------
  layout: {
    // Full-screen centered layout (for gates, modals)
    centerScreen: 'min-h-screen flex items-center justify-center',
    // Container with padding
    container: 'max-w-md w-full mx-auto p-8',
  },
  
  // ---------------------------------------------------------------------------
  // BACKGROUNDS & GRADIENTS - UPDATE accent with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  bg: {
    page: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    gate: 'bg-[linear-gradient(135deg,var(--space-surface-gradient-from),var(--space-surface-gradient-via),var(--space-surface-gradient-to))]',
    card: 'bg-[var(--space-surface-card)]',
    muted: 'bg-[var(--space-surface-muted)]',
    accent: 'bg-[var(--space-surface-accent-soft)]',
  },
  
  // ---------------------------------------------------------------------------
  // AGENT (AI Assistant styling) - UPDATE ALL with brand color (NOT purple!)
  // ---------------------------------------------------------------------------
  agent: {
    icon: 'text-[var(--space-shell-icon)]',
    fab: 'bg-[var(--space-brand-highlight)] hover:brightness-95 text-[var(--space-text-on-highlight)]',
    headerIcon: 'text-[var(--space-shell-icon)]',
    dockActive: 'bg-[var(--space-brand-highlight)] text-[var(--space-text-on-highlight)]',
    dockInactive: 'bg-[var(--space-surface-muted)] text-[var(--space-text-primary)]',
  },
  
  // ---------------------------------------------------------------------------
  // APP ICONS (mini app icon colors) - UPDATE active with brand color (NOT purple)
  // ---------------------------------------------------------------------------
  appIcon: {
    // Default app icon color
    default: 'text-[var(--space-text-brand)]',
    // Files/Memory icon
    files: 'text-[var(--space-text-brand)]',
    // Settings icon  
    settings: 'text-[var(--space-text-secondary)]',
    active: 'text-[var(--space-text-accent)]',
  },
  
  // ---------------------------------------------------------------------------
  // LEGACY (for backwards compatibility)
  // ---------------------------------------------------------------------------
  priority: {
    high: 'bg-[var(--vg-danger-bg)] text-[var(--space-semantic-danger)]',
    medium: 'bg-[var(--vg-warning-bg)] text-[var(--vg-warning)]',
    low: 'bg-[var(--space-semantic-success-50)] text-[var(--space-semantic-success)]',
  },
  
  category: {
    work: 'bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]',
    ideas: 'bg-[var(--space-brand-highlight-100)] text-[var(--space-text-accent)]',
    personal: 'bg-[var(--space-semantic-success-50)] text-[var(--space-semantic-success)]',
    other: 'bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)]',
  },

  typography,
} as const;

// =============================================================================
// COMPONENT-SPECIFIC STYLES
// =============================================================================

/**
 * EmailGate and authentication screen styles
 * Mobile-first responsive design with safe area support
 */
export const authStyles = {
  // Container - full screen centered with gradient, mobile-friendly padding
  container: `${tw.layout.centerScreen} ${tw.bg.gate} p-4 sm:p-8 safe-top safe-bottom`,
  // Card - elevated white card with responsive padding
  card: `${tw.card.elevated} p-6 sm:p-8 max-w-md w-full mx-4 sm:mx-auto`,
  // Title - responsive font size
  title: `text-xl sm:text-2xl ${typography.weight.semibold} ${typography.color.primary} text-center mb-2`,
  // Subtitle
  subtitle: `${typography.size.sm} ${typography.color.secondary} text-center`,
  // Input wrapper
  inputWrapper: 'space-y-4',
  // Input field - larger touch targets on mobile
  input: (hasError: boolean) => 
    `${tw.input.base} ${hasError ? tw.input.error : tw.input.default} text-base`,
  // Error message
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  // Submit button - larger touch target on mobile
  submitButton: (disabled: boolean) =>
    `w-full px-4 py-3.5 sm:py-3 rounded-lg ${tw.button.primary} ${disabled ? tw.button.disabled : ''} text-base`,
  // Footer text
  footerText: `${typography.size.xs} ${typography.color.tertiary} text-center mt-4`,
} as const;

/**
 * Settings screen styles
 */
export const settingsStyles = {
  container: 'h-full overflow-y-auto',
  innerContainer: 'w-full p-4 md:p-6 xl:p-8',
  section: 'space-y-6',
  label: `block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} mb-2`,
  input: (hasError: boolean) => 
    `${tw.input.base} ${hasError ? tw.input.error : tw.input.default}`,
  errorText: `mt-1.5 ${typography.size.xs} ${typography.color.danger}`,
  saveButton: (disabled: boolean) =>
    `w-full px-4 py-2.5 rounded-lg ${tw.button.primary} flex items-center justify-center gap-2 ${disabled ? tw.button.disabled : ''}`,
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get gradient class from config or return default
 */
export function getGradientClass(gradient?: string): string {
  return gradient || tw.bg.page;
}

/**
 * Get font family style object for inline styles
 */
export function getFontFamily(): React.CSSProperties {
  return { fontFamily: "var(--space-font-family, Manrope, 'Segoe UI', sans-serif)" };
}

/**
 * Combine class names (simple utility)
 */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
