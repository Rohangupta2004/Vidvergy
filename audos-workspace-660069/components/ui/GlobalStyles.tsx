import React from 'react';
import { COLORS, CSS_VARS, FONT, GRADIENT, MOTION } from '../theme';
import { installVidvergeTheme } from './Molten';

// Module evaluation happens before React paints the shell, preventing a light-theme flash.
installVidvergeTheme();

/** Injects the canonical Vidverge v3 token layer once for the shell and apps. */
export const GLOBAL_STYLE_ID = 'vidverge-global-styles-v4';

function vars(values: Record<string, string>, important = false): string {
  return Object.entries(values).map(([key, value]) => `${key}:${value}${important ? ' !important' : ''};`).join('');
}

const SPACE_COMPAT: Record<string, string> = {
  '--space-surface-bg': COLORS.bg,
  '--space-surface-page': COLORS.bg,
  '--space-surface-page-alt': COLORS.surface,
  '--space-surface-gradient-from': COLORS.bg,
  '--space-surface-gradient-via': COLORS.bg,
  '--space-surface-gradient-to': COLORS.bg,
  '--space-surface-card': COLORS.surface,
  '--space-surface-card-hover': COLORS.hover,
  '--space-surface-panel': COLORS.surface,
  '--space-surface-panel-strong': COLORS.raised,
  '--space-surface-muted': COLORS.raised,
  '--space-surface-accent-soft': COLORS.accentSoft,
  '--space-border-default': COLORS.border,
  '--space-border-subtle': COLORS.border,
  '--space-border-strong': COLORS.controlBorder,
  '--space-text-primary': COLORS.text,
  '--space-text': COLORS.text,
  '--space-text-secondary': COLORS.secondary,
  '--space-text-muted': COLORS.muted,
  '--space-text-brand': COLORS.accent,
  '--space-text-accent': COLORS.accent,
  '--space-text-on-primary': COLORS.onAccent,
  '--space-text-on-highlight': COLORS.onAccent,
  '--space-brand-primary': COLORS.accent,
  '--space-brand-primary-500': COLORS.accent,
  '--space-brand-primary-600': COLORS.accent,
  '--space-brand-primary-700': COLORS.accentPressed,
  '--space-brand-highlight': COLORS.accentHover,
  '--space-brand-highlight-500': COLORS.accentHover,
  '--space-brand-highlight-600': COLORS.accentHover,
  '--space-brand-primary-50': COLORS.goldTint,
  '--space-brand-primary-100': COLORS.goldTint,
  '--space-brand-primary-200': COLORS.accentPressed,
  '--space-brand-primary-900': COLORS.accentPressed,
  '--space-brand-highlight-50': COLORS.goldTint,
  '--space-brand-highlight-100': COLORS.goldTint,
  '--space-brand-highlight-200': COLORS.accentPressed,
  '--space-brand-highlight-700': COLORS.accent,
  '--space-brand-highlight-900': COLORS.accentPressed,
  '--space-brand-secondary': COLORS.goldDeep,
  '--space-brand-accent': COLORS.accent,
  '--space-brand-contrast': COLORS.bg,
  '--space-text-on-contrast': COLORS.accent,
  '--space-shell-icon': COLORS.accent,
  '--space-shell-button-text': COLORS.onBtn,
  '--space-shell-accent-button-text': COLORS.onBtn,
  '--space-semantic-success': COLORS.success,
  '--space-semantic-success-50': COLORS.successBg,
  '--space-semantic-success-100': COLORS.successBg,
  '--space-semantic-success-500': COLORS.success,
  '--space-semantic-success-600': COLORS.success,
  '--space-semantic-success-700': COLORS.success,
  '--space-semantic-warning': COLORS.warning,
  '--space-semantic-warning-50': COLORS.warningBg,
  '--space-semantic-warning-100': COLORS.warningBg,
  '--space-semantic-warning-500': COLORS.warning,
  '--space-semantic-warning-600': COLORS.warning,
  '--space-semantic-warning-700': COLORS.warning,
  '--space-semantic-danger': COLORS.danger,
  '--space-semantic-danger-50': COLORS.dangerBg,
  '--space-semantic-danger-100': COLORS.dangerBg,
  '--space-semantic-danger-500': COLORS.danger,
  '--space-semantic-danger-600': COLORS.danger,
  '--space-semantic-danger-700': COLORS.danger,
  '--space-semantic-info': COLORS.info,
  '--space-semantic-info-bg': COLORS.infoBg,
  '--space-font-heading': FONT.heading,
  '--space-font-body': FONT.body,
};

// DARK (Rich Black + single gold accent): gold = actions, selected states,
// focus and links; amber = credits/warnings only; red/green = status only.
const MOLTEN_DARK: Record<string, string> = {
  '--void': '#0b0d12', '--ash': '#12141b', '--ash-2': '#1a1d26', '--ash-3': '#222631',
  '--line': '#2a2e3a', '--line-2': '#3a3f4d', '--line-gold': 'rgba(212,175,55,.42)',
  '--gold': '#d4af37', '--gold-hi': '#e6c45a', '--gold-lo': '#a8861f', '--bronze': '#a8861f',
  '--molten': 'linear-gradient(135deg,#a8861f,#d4af37 55%,#e6c45a)',
  '--molten-soft': 'linear-gradient(0deg,rgba(212,175,55,.15),rgba(212,175,55,.15))',
  '--ivory': '#f5f6f8', '--muted': '#9aa0ae', '--faint': '#9aa0ae', '--on-gold': '#0b0d12',
  '--ok': '#3fb950', '--warn': '#ffb020', '--bad': '#e5484d',
  '--display': '"Bricolage Grotesque","Arial Black",system-ui,sans-serif',
  '--body': '"Geist","Inter",system-ui,-apple-system,"Segoe UI",sans-serif',
  '--r-panel': '22px', '--r-media': '14px', '--r-control': '11px', '--r-pill': '999px',
  '--side-bg': '#0e1016',
  '--panel-grad': 'linear-gradient(165deg,#161922 0%,#12141b 60%)', '--card-grad': 'linear-gradient(165deg,#161922 0%,#12141b 60%)',
  '--glass': 'rgba(11,13,18,.84)', '--menu-bg': '#1a1d26', '--sheet-bg': '#12141b',
  '--icon-tile': 'linear-gradient(135deg,#1a1d26,#12141b)', '--nav-ink': '#c3c7d1', '--chip-ink': '#d5d8df',
  '--haze': 'none',
};

// LIGHT (Soft White): white cards on a soft-white page, solid gold buttons with
// black labels, deep gold for text-weight accents so links keep AA contrast.
const MOLTEN_LIGHT: Record<string, string> = {
  '--void': '#f5f6f8', '--ash': '#ffffff', '--ash-2': '#ecedf0', '--ash-3': '#e3e5ea',
  '--line': 'rgba(11,13,18,.10)', '--line-2': 'rgba(11,13,18,.18)', '--line-gold': 'rgba(168,134,31,.5)',
  '--gold': '#a8861f', '--gold-hi': '#8a6a12', '--gold-lo': '#d4af37', '--bronze': '#8a6a12',
  '--molten': 'linear-gradient(135deg,#8a6a12,#a8861f 55%,#d4af37)',
  '--molten-soft': 'linear-gradient(0deg,rgba(212,175,55,.16),rgba(212,175,55,.16))',
  '--ivory': '#0b0d12', '--muted': '#4a4f5c', '--faint': '#5e6472', '--on-gold': '#0b0d12',
  '--ok': '#1a7f37', '--warn': '#8a5a00', '--bad': '#c62a2f',
  '--vg-bg': '#f5f6f8', '--vg-surface': '#ffffff', '--vg-raised': '#ecedf0', '--vg-hover': '#e3e5ea',
  '--vg-border': 'rgba(11,13,18,.10)', '--vg-control-border': 'rgba(11,13,18,.18)', '--vg-text': '#0b0d12',
  '--vg-secondary': '#4a4f5c', '--vg-muted': '#5e6472', '--vg-accent': '#8a6a12', '--vg-accent-hover': '#6f550e',
  '--vg-accent-pressed': '#5c460b', '--vg-accent-soft': 'rgba(212,175,55,.16)', '--vg-on-accent': '#ffffff',
  '--vg-selected': '#a8861f', '--vg-selected-soft': 'rgba(212,175,55,.18)', '--vg-on-selected': '#5c460b',
  '--vg-bronze': '#8a6a12', '--vg-gold': '#a8861f', '--vg-focus': '#a8861f',
  '--vg-gold-bright': '#d4af37', '--vg-gold-deep': '#8a6a12', '--vg-gold-tint': 'rgba(212,175,55,.16)',
  '--vg-amber': '#ffb020', '--vg-error': '#c62a2f',
  '--vg-btn': '#d4af37', '--vg-on-btn': '#0b0d12', '--vg-btn-hover': '#e6c45a', '--vg-btn-pressed': '#a8861f',
  '--vg-credit': '#ffb020', '--vg-credit-soft': '#fff2d9', '--vg-credit-ink': '#7a4d00',
  '--vg-success': '#1a7f37', '--vg-success-bg': 'rgba(63,185,80,.12)',
  '--vg-warning': '#8a5a00', '--vg-warning-bg': 'rgba(255,176,32,.16)',
  '--vg-danger': '#c62a2f', '--vg-danger-bg': 'rgba(229,72,77,.10)',
  '--vg-info': '#4a4f5c', '--vg-info-bg': 'rgba(11,13,18,.05)',
  '--vg-gradient-surface': 'linear-gradient(0deg,#ffffff,#ffffff)',
  '--vg-gradient-selected': 'linear-gradient(0deg,rgba(212,175,55,.18),rgba(212,175,55,.18))',
  '--space-surface-bg': '#f5f6f8', '--space-surface-page': '#f5f6f8', '--space-surface-page-alt': '#ffffff',
  '--space-surface-card': '#ffffff', '--space-surface-card-hover': '#ecedf0', '--space-surface-panel': '#ffffff',
  '--space-surface-panel-strong': '#ecedf0', '--space-surface-muted': '#ecedf0', '--space-surface-accent-soft': 'rgba(212,175,55,.16)',
  '--space-border-default': 'rgba(11,13,18,.10)', '--space-border-subtle': 'rgba(11,13,18,.10)', '--space-border-strong': 'rgba(11,13,18,.18)',
  '--space-text-primary': '#0b0d12', '--space-text': '#0b0d12', '--space-text-secondary': '#4a4f5c', '--space-text-muted': '#5e6472',
  '--space-text-brand': '#8a6a12', '--space-text-accent': '#8a6a12', '--space-text-on-primary': '#0b0d12', '--space-text-on-highlight': '#0b0d12',
  '--space-brand-primary': '#d4af37', '--space-brand-primary-500': '#d4af37', '--space-brand-primary-600': '#a8861f',
  '--space-brand-primary-700': '#8a6a12', '--space-brand-highlight': '#e6c45a', '--space-brand-highlight-500': '#e6c45a',
  '--space-semantic-success': '#1a7f37', '--space-semantic-success-500': '#1a7f37', '--space-semantic-success-100': 'rgba(63,185,80,.12)',
  '--space-semantic-warning': '#8a5a00', '--space-semantic-warning-500': '#8a5a00', '--space-semantic-warning-100': 'rgba(255,176,32,.16)',
  '--space-semantic-danger': '#c62a2f', '--space-semantic-danger-500': '#c62a2f', '--space-semantic-danger-100': 'rgba(229,72,77,.10)',
  '--space-shell-icon': '#8a6a12', '--space-shell-button-text': '#0b0d12', '--space-shell-accent-button-text': '#0b0d12', '--space-shell-dock-text': '#0b0d12',
  '--space-surface-gradient-from': '#f5f6f8', '--space-surface-gradient-via': '#f5f6f8', '--space-surface-gradient-to': '#f1efe8',
  '--side-bg': '#eef0f3', '--panel-grad': 'linear-gradient(0deg,#ffffff,#ffffff)', '--card-grad': 'linear-gradient(0deg,#ffffff,#ffffff)',
  '--glass': 'rgba(245,246,248,.88)', '--menu-bg': '#ffffff', '--sheet-bg': '#ffffff',
  '--icon-tile': 'linear-gradient(0deg,#ecedf0,#ecedf0)', '--nav-ink': '#2f3340', '--chip-ink': '#2f3340',
  '--haze': 'none',
};

const LIGHT_SURFACES = [
  'bg-white', 'bg-gray-50', 'bg-slate-50', 'bg-neutral-50', 'bg-zinc-50', 'bg-stone-50',
  'bg-gray-100', 'bg-slate-100', 'bg-neutral-100', 'bg-zinc-100', 'bg-stone-100',
];
const DARK_TEXT = [
  'text-black', 'text-gray-900', 'text-gray-800', 'text-slate-900', 'text-slate-800',
  'text-neutral-900', 'text-zinc-900',
];
const LIGHT_BORDERS = [
  'border-gray-100', 'border-gray-200', 'border-gray-300', 'border-slate-100',
  'border-slate-200', 'border-slate-300', 'border-neutral-200', 'border-zinc-200',
];
const FLAT_BRAND_BUTTONS = ['bg-yellow-400', 'bg-yellow-500', 'bg-amber-400', 'bg-amber-500', 'bg-orange-400', 'bg-orange-500'];
const CLASHING_BUTTONS = ['bg-blue-500', 'bg-blue-600', 'bg-blue-700', 'bg-indigo-500', 'bg-indigo-600', 'bg-purple-500', 'bg-purple-600', 'bg-violet-500', 'bg-violet-600', 'bg-fuchsia-500', 'bg-pink-500', 'bg-pink-600', 'bg-cyan-500', 'bg-cyan-600', 'bg-sky-500', 'bg-sky-600', 'bg-teal-500', 'bg-teal-600', 'bg-emerald-500', 'bg-emerald-600'];
// Off-palette hue families: every Tailwind utility in these is remapped to the gold accent.
const OFF_PALETTE = ['blue', 'indigo', 'cyan', 'sky', 'teal', 'purple', 'violet', 'fuchsia', 'pink'];
function hueRule(prefix: string, declaration: string): string {
  return OFF_PALETTE.map((hue) => `.vv-dark [class*="${prefix}-${hue}-"]`).join(',') + `{${declaration}}`;
}
function classRule(classes: string[], declaration: string): string {
  return classes.map((name) => `.vv-dark .${name}`).join(',') + `{${declaration}}`;
}

export const GLOBAL_CSS = [
  "@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Geist:wght@400..700&family=Geist+Mono:wght@500&display=swap');",
  '@property --rim-a{syntax:"<angle>";inherits:false;initial-value:0deg}',
  `:root{${vars({ ...CSS_VARS, ...SPACE_COMPAT, ...MOLTEN_DARK })}}`,
  `[data-theme="light"],[data-theme="light"] .vv-dark,[data-theme="light"] .vv-app-shell{${vars(MOLTEN_LIGHT, true)}color-scheme:light!important;}`,
  'html,body{background:var(--void);color:var(--ivory);}',
  '.vv-dark,.vv-app-shell{background:var(--void);color:var(--ivory);font-family:var(--body);font-optical-sizing:auto;font-feature-settings:"ss01","cv11";font-synthesis:none;color-scheme:dark;}',
  '.vv-app-shell,.vv-app-shell *{box-sizing:border-box;}',
  '.vv-app-shell h1,.vv-app-shell h2,.vv-app-shell h3,.vv-app-shell h4,.vv-dark h1,.vv-dark h2,.vv-dark h3,.vv-dark h4{font-family:var(--display);font-optical-sizing:auto;font-synthesis:none;font-weight:750;letter-spacing:-.03em;}',
  '.vv-dark code,.vv-dark time,.vv-dark .font-mono,.vv-app-shell code,.vv-app-shell time,.vv-app-shell .font-mono{font-family:\'Geist Mono\',ui-monospace,monospace;font-weight:500;font-variant-numeric:tabular-nums;}',
  '.vv-dark,.vv-dark *{scrollbar-color:var(--vg-border) transparent;scrollbar-width:thin;}',
  '.vv-dark ::-webkit-scrollbar{width:8px;height:8px;}',
  '.vv-dark ::-webkit-scrollbar-track{background:transparent;}',
  '.vv-dark ::-webkit-scrollbar-thumb{background:var(--vg-border);border-radius:6px;}',
  '.vv-dark ::selection{background:var(--vg-accent-soft);color:var(--vg-text);}',
  '.vv-dark :where(img,video,canvas,svg){max-width:100%;}',
  '.vv-dark :where(h1,h2,h3,p){overflow-wrap:anywhere;}',
  '.vv-dark :where(section,article,form){min-width:0;}',
  classRule(LIGHT_SURFACES, `background-color:${COLORS.surface};`),
  classRule(DARK_TEXT, `color:${COLORS.text};`),
  classRule(LIGHT_BORDERS, `border-color:${COLORS.border};`),
  classRule(FLAT_BRAND_BUTTONS, 'background-image:var(--vg-gradient-action)!important;background-color:transparent!important;color:var(--vg-on-btn)!important;'),
  classRule(CLASHING_BUTTONS, 'background-image:var(--vg-gradient-action)!important;background-color:transparent!important;color:var(--vg-on-btn)!important;'),
  '.vv-dark [class*="bg-gray-9"],.vv-dark [class*="bg-slate-9"],.vv-dark [class*="bg-zinc-9"],.vv-dark [class*="bg-neutral-9"],.vv-dark [class*="bg-stone-9"],.vv-dark [class*="bg-black"]{background-color:var(--vg-bg)!important;}',
  '.vv-dark [class*="bg-gray-8"],.vv-dark [class*="bg-slate-8"],.vv-dark [class*="bg-zinc-8"],.vv-dark [class*="bg-neutral-8"],.vv-dark [class*="bg-stone-8"]{background-color:var(--vg-surface)!important;}',
  '.vv-dark [class*="text-gray-4"],.vv-dark [class*="text-slate-4"],.vv-dark [class*="text-zinc-4"],.vv-dark [class*="text-neutral-4"],.vv-dark [class*="text-stone-4"]{color:var(--vg-secondary)!important;}',
  '.vv-dark [class*="text-gray-5"],.vv-dark [class*="text-slate-5"],.vv-dark [class*="text-zinc-5"],.vv-dark [class*="text-neutral-5"],.vv-dark [class*="text-stone-5"]{color:var(--vg-muted)!important;}',
  hueRule('text', 'color:var(--vg-accent)!important;'),
  hueRule('bg', 'background-color:var(--vg-accent-soft)!important;'),
  hueRule('border', 'border-color:color-mix(in srgb,var(--vg-accent) 40%,transparent)!important;'),
  hueRule('ring', '--tw-ring-color:color-mix(in srgb,var(--vg-accent) 55%,transparent)!important;'),
  hueRule('outline', 'outline-color:var(--vg-focus)!important;'),
  hueRule('accent', 'accent-color:var(--vg-accent)!important;'),
  hueRule('fill', 'fill:var(--vg-accent)!important;'),
  hueRule('stroke', 'stroke:var(--vg-accent)!important;'),
  hueRule('shadow', '--tw-shadow-color:rgba(0,0,0,.35)!important;'),
  hueRule('from', '--tw-gradient-from:var(--vg-accent-soft)!important;--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to,transparent)!important;'),
  hueRule('via', '--tw-gradient-stops:var(--tw-gradient-from),var(--vg-accent-soft),var(--tw-gradient-to,transparent)!important;'),
  hueRule('to', '--tw-gradient-to:transparent!important;'),
  '.vv-dark input[type="range"],.vv-dark input[type="checkbox"],.vv-dark input[type="radio"],.vv-dark progress{accent-color:var(--vg-accent);}',
  '.vv-dark a:not([class]){color:var(--vg-accent);text-decoration-color:color-mix(in srgb,var(--vg-accent) 45%,transparent);}',
  '.vv-dark a:not([class]):hover{color:var(--vg-accent-hover);}',
  classRule(CLASHING_BUTTONS, 'color:var(--vg-on-btn)!important;'),
  '.vv-dark [class*="text-amber-"],.vv-dark [class*="text-yellow-"],.vv-dark [class*="text-orange-"]{color:var(--vg-warning)!important;}',
  '.vv-dark [class*="from-amber-"],.vv-dark [class*="from-yellow-"],.vv-dark [class*="from-orange-"]{--tw-gradient-from:var(--vg-warning-bg)!important;--tw-gradient-to:transparent!important;}',
  '.vv-dark [class*="border-amber-"],.vv-dark [class*="border-yellow-"],.vv-dark [class*="border-orange-"]{border-color:color-mix(in srgb,var(--vg-warning) 34%,transparent)!important;}',
  '.vv-dark [class*="text-green-"],.vv-dark [class*="text-emerald-"]{color:var(--vg-success)!important;}',
  '.vv-dark [class*="bg-green-"],.vv-dark [class*="bg-emerald-"]{background-color:var(--vg-success-bg)!important;}',
  '.vv-dark [class*="from-green-"],.vv-dark [class*="from-emerald-"]{--tw-gradient-from:var(--vg-success-bg)!important;--tw-gradient-to:transparent!important;}',
  '.vv-dark [class*="border-green-"],.vv-dark [class*="border-emerald-"]{border-color:color-mix(in srgb,var(--vg-success) 34%,transparent)!important;}',
  '.vv-dark [class*="text-red-"],.vv-dark [class*="text-rose-"]{color:var(--vg-danger)!important;}',
  '.vv-dark [class*="bg-red-"],.vv-dark [class*="bg-rose-"]{background-color:var(--vg-danger-bg)!important;}',
  '.vv-dark [class*="from-red-"],.vv-dark [class*="from-rose-"]{--tw-gradient-from:var(--vg-danger-bg)!important;--tw-gradient-to:transparent!important;}',
  '.vv-dark input,.vv-dark textarea,.vv-dark select{background-color:var(--vg-bg);color:var(--vg-text);border-color:var(--vg-control-border);font-family:var(--space-font-body);}',
  '.vv-dark input,.vv-dark select{min-height:44px;border-radius:10px;}',
  '.vv-app-shell textarea{min-height:120px;border-radius:10px;}',
  '.vv-dark input::placeholder,.vv-dark textarea::placeholder{color:var(--vg-muted);}',
  '.vv-dark option{background:var(--vg-raised);color:var(--vg-text);}',
  '.vv-dark :where(button,a,input,textarea,select,[tabindex]):focus-visible{outline:2px solid var(--vg-focus)!important;outline-offset:3px!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--vg-focus) 18%,transparent)!important;}',
  `.vv-dark button,.vv-dark a[role="button"]{font-family:var(--space-font-body);font-synthesis:none;transition:background-color ${MOTION.standard},background-image ${MOTION.standard},border-color ${MOTION.standard},color ${MOTION.standard},box-shadow ${MOTION.standard},transform ${MOTION.standard},opacity ${MOTION.standard};}`,
  '.vv-dark button:hover:not(:disabled),.vv-dark a[role="button"]:hover{filter:brightness(1.05);}',
  '.vv-dark button:active:not(:disabled),.vv-dark a[role="button"]:active{transform:translateY(1px) scale(.99);}',
  '.vv-dark :where(button,[role="button"]):disabled{cursor:not-allowed;}',
  '.vv-dark :where(section,article,div)[class*="rounded-xl"][class*="border"],.vv-dark :where(section,article,div)[class*="rounded-2xl"][class*="border"]{box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 14px 38px rgba(0,0,0,.18);transition:border-color 180ms cubic-bezier(.2,0,0,1),box-shadow 180ms cubic-bezier(.2,0,0,1),transform 180ms cubic-bezier(.2,0,0,1);}',
  '.vv-dark :where(section,article)[class*="rounded-xl"][class*="border"]:hover,.vv-dark :where(section,article)[class*="rounded-2xl"][class*="border"]:hover{border-color:color-mix(in srgb,var(--vg-accent) 22%,var(--vg-border));box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 18px 48px rgba(0,0,0,.24);}',
  `.vg-primary-action{position:relative;isolation:isolate;overflow:hidden;min-height:44px;border:0;border-radius:10px;background:${GRADIENT.action};color:var(--vg-on-btn);font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,0.16);transition:background ${MOTION.standard},transform ${MOTION.standard},box-shadow ${MOTION.standard};}`,
  '.vv-dark [class*="vg-gradient-action"]{position:relative;isolation:isolate;overflow:hidden;}',
  '.vg-primary-action::after,.vv-dark [class*="vg-gradient-action"]::after{content:"";position:absolute;z-index:-1;inset:-35% auto -35% -45%;width:34%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.48),transparent);opacity:0;transform:skewX(-18deg) translateX(-180%);}',
  `.vg-primary-action:hover:not(:disabled){background:${GRADIENT.actionHover};box-shadow:0 10px 30px rgba(0,0,0,0.20);}`,
  '.vg-primary-action:hover:not(:disabled)::after,.vv-dark [class*="vg-gradient-action"]:hover:not(:disabled)::after{opacity:.72;animation:vgShimmer 680ms cubic-bezier(.2,0,0,1) 1;}',
  '.vg-primary-action:active:not(:disabled){background:var(--vg-btn-pressed);box-shadow:0 4px 14px rgba(0,0,0,0.14);transform:translateY(1px) scale(.99);}',
  '.vg-primary-action:disabled{background:var(--vg-raised);color:var(--vg-muted);cursor:not-allowed;}',
  '.vg-secondary-action{min-height:44px;border-radius:10px;border:1px solid var(--vg-accent);background:transparent;color:var(--vg-accent);font-weight:600;}',
  '.vg-secondary-action:hover:not(:disabled){background:var(--vg-gold-tint);border-color:var(--vg-accent-hover);color:var(--vg-accent-hover);}',
  '.vg-ghost-action{min-height:44px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--vg-text);font-weight:600;}',
  '.vg-ghost-action:hover:not(:disabled){color:var(--vg-accent);}',
  '.vv-dark progress::-webkit-progress-value{background:var(--vg-accent);}',
  '.vv-dark progress::-moz-progress-bar{background:var(--vg-accent);}',
  '.vg-panel{background:var(--vg-surface);border:1px solid var(--vg-border);border-radius:12px;padding:24px;}',
  '.vg-featured-panel{position:relative;background:var(--vg-gradient-surface);border:1px solid var(--vg-border);border-radius:12px;padding:24px;box-shadow:var(--vg-elevation-card);overflow:hidden;}',
  '.vg-featured-panel::before{content:"";position:absolute;inset:0 0 auto;height:1px;background:linear-gradient(90deg,transparent,var(--vg-accent),var(--vg-bronze),transparent);opacity:.64;pointer-events:none;}',
  '.vg-status{display:inline-flex;align-items:center;gap:8px;border-radius:6px;padding:3px 8px;font-size:12px;font-weight:600;}',
  '.vg-app-intro{position:relative;overflow:hidden;border:1px solid var(--vg-border);border-radius:var(--vg-radius-card);padding:clamp(20px,4vw,32px);background:linear-gradient(125deg,color-mix(in srgb,var(--vg-accent) 10%,var(--vg-surface)),var(--vg-surface) 62%,color-mix(in srgb,var(--vg-selected) 6%,var(--vg-surface)));box-shadow:var(--vg-elevation-card);}',
  '.vg-app-intro::after{content:"";position:absolute;right:-8%;top:-55%;width:42%;height:170%;pointer-events:none;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--vg-accent) 18%,transparent),transparent);opacity:.6;transform:rotate(16deg);}',
  '.vg-segmented{display:flex;gap:4px;max-width:100%;overflow-x:auto;padding:4px;border:1px solid var(--vg-border);border-radius:var(--vg-radius-card);background:color-mix(in srgb,var(--vg-raised) 88%,transparent);}',
  '.vg-segmented>[aria-selected="true"],.vg-segmented>[aria-pressed="true"]{background:var(--vg-gradient-selected);border-color:color-mix(in srgb,var(--vg-selected) 45%,transparent);color:var(--vg-text);}',
  '.vv-dark [role="tablist"]{scrollbar-width:none;}',
  '.vv-dark [role="tab"]{min-height:44px;white-space:nowrap;}',
  '.vv-dark details>summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--vg-secondary);transition:color 180ms cubic-bezier(.2,0,0,1);}',
  '.vv-dark details>summary:hover,.vv-dark details[open]>summary{color:var(--vg-text);}',
  '.vv-dark details[open]{border-color:color-mix(in srgb,var(--vg-accent) 26%,var(--vg-border));}',
  '.vg-empty-state{display:grid;place-items:center;gap:12px;min-height:180px;padding:32px;text-align:center;border:1px dashed var(--vg-control-border);border-radius:var(--vg-radius-card);background:linear-gradient(145deg,color-mix(in srgb,var(--vg-accent) 5%,var(--vg-surface)),var(--vg-surface));}',
  '.vg-skeleton{border-radius:8px;background:linear-gradient(90deg,var(--vg-surface) 22%,var(--vg-hover) 48%,var(--vg-surface) 74%);background-size:220% 100%;animation:vgSkeleton 1.35s linear infinite;}',
  '.vg-tabular{font-variant-numeric:tabular-nums;}',
  '.vg-thumbnail-label{background:var(--vg-bg);color:var(--vg-text);padding:4px 8px;border-radius:6px;}',
  '.rim{position:relative;isolation:isolate;border:1px solid transparent;border-radius:var(--r-panel);background:linear-gradient(var(--ash),var(--ash)) padding-box,conic-gradient(from var(--rim-a),transparent 0 12%,var(--gold-lo) 18%,var(--gold-hi) 23%,var(--gold) 28%,transparent 36% 100%) border-box;box-shadow:0 0 0 1px color-mix(in srgb,var(--gold) 8%,transparent),0 16px 54px color-mix(in srgb,var(--gold) 9%,transparent);}',
  '.rim::after{content:"";position:absolute;z-index:-1;inset:-8px;border-radius:inherit;background:conic-gradient(from var(--rim-a),transparent 0 14%,color-mix(in srgb,var(--gold) 32%,transparent) 22%,transparent 32% 100%);filter:blur(16px);opacity:.34;pointer-events:none;}',
  '.rim.is-working,.working .rim{animation:vvRim 2.4s linear infinite;box-shadow:0 0 0 1px color-mix(in srgb,var(--gold) 22%,transparent),0 0 42px color-mix(in srgb,var(--gold) 28%,transparent);}',
  '.rim.is-working::after,.working .rim::after{opacity:.82;animation:vvRim 2.4s linear infinite;}',
  '@keyframes vvRim{to{--rim-a:360deg}}',
  '[data-theme="light"] .vv-dark [class*="bg-black"],[data-theme="light"] .vv-app-shell [class*="bg-black"]{background-color:var(--ash-2)!important;}',
  '[data-theme="light"] .vv-dark [class*="text-white"],[data-theme="light"] .vv-app-shell [class*="text-white"]{color:var(--ivory)!important;}',
  '[data-theme="light"] .vv-dark :where(input,textarea,select),[data-theme="light"] .vv-app-shell :where(input,textarea,select){background:var(--ash)!important;color:var(--ivory)!important;border-color:var(--line-2)!important;}',
  '@keyframes spin{to{transform:rotate(360deg);}}',
  '@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
  '@keyframes vgEnter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
  '@keyframes vgShimmer{from{transform:skewX(-18deg) translateX(-180%)}to{transform:skewX(-18deg) translateX(620%)}}',
  '@keyframes vgSkeleton{from{background-position:200% 0}to{background-position:-200% 0}}',
  '.vv-app-shell main>section,.vv-app-shell main>article,.vv-app-shell .vg-panel,.vv-app-shell .vg-featured-panel{animation:vgEnter 220ms cubic-bezier(.2,0,0,1) both;}',
  '@keyframes pulse{0%,100%{opacity:.72}50%{opacity:1}}',
  '@keyframes vvWave{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}',
  '@keyframes vvCompletionSweep{from{transform:translateX(-120%)}to{transform:translateX(220%)}}',
  '.vv-dark [role="toolbar"],.vv-dark .toolbar,.vv-dark [class*="toolbar"]{flex-wrap:wrap;}',
  '@media(max-width:1199px){.vv-app-shell>[style*="padding"]{max-width:100%;}}',
  '@media(max-width:767px){.vv-dark button,.vv-dark a[role="button"],.vv-app-shell button,.vv-app-shell a[role="button"]{min-height:44px;min-width:44px}.vv-app-shell{overflow-x:hidden}.vv-dark :where(input,textarea,select){font-size:16px}.vg-app-intro{padding:20px}.vg-segmented{width:100%}.vg-segmented>*{flex:0 0 auto}.ads-surface-actions{position:sticky!important;top:0!important;right:auto!important;width:100%;justify-content:flex-start!important;flex-wrap:nowrap!important;overflow-x:auto;padding:8px 12px;background:color-mix(in srgb,var(--vg-bg) 92%,transparent);border-bottom:1px solid var(--vg-border);backdrop-filter:blur(16px)}.ads-surface-actions>button{flex:0 0 auto;min-height:44px!important}}',
  '@media(max-width:480px){.vv-app-shell{font-size:16px}.vg-panel,.vg-featured-panel{padding:16px}.vg-empty-state{min-height:150px;padding:24px 16px}}',
  '@media(prefers-reduced-motion:reduce){.vv-dark *,.vv-dark *::before,.vv-dark *::after,.vv-app-shell *,.vv-app-shell *::before,.vv-app-shell *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important;}}',
].join('\n');

const GlobalStyles: React.FC = function GlobalStyles() {
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const stale = document.getElementById('vidverge-global-styles');
    if (stale) stale.remove();
    let element = document.getElementById(GLOBAL_STYLE_ID) as HTMLStyleElement | null;
    if (!element) {
      element = document.createElement('style');
      element.id = GLOBAL_STYLE_ID;
      document.head.appendChild(element);
    }
    if (element.textContent !== GLOBAL_CSS) element.textContent = GLOBAL_CSS;
  }, []);
  return null;
};

export default GlobalStyles;
