import { studioHueCss } from '../studioHues';

/* Second-design skin for the inside of every studio. Desktop.tsx tags the studio's
   scroll container with `vv-studio-skin` and `data-vv-studio="<app id>"`, so these
   rules reach only the open studio. They restyle; they never hide, move or disable
   anything, and inline styles a studio sets still win. */
export const STUDIO_SKIN_CSS = [
  studioHueCss(),
  '.vv-studio-skin{--hue-ink:var(--hue,#f2c14a);--sk-panel:#0f0c08;--sk-panel2:#17130c;--sk-line:rgba(255,225,160,.12);--sk-line2:rgba(255,225,160,.26);--sk-sunken:rgba(255,232,180,.06);--sk-gold-soft:rgba(242,193,74,.13);--sk-glow:0 0 0 1px rgba(255,222,140,.4),0 10px 38px rgba(242,193,74,.3);--sk-grad:linear-gradient(135deg,#ffefb8 0%,#f2c14a 42%,#c48a12 100%)}',
  '[data-theme="light"] .vv-studio-skin{--hue-ink:color-mix(in srgb,var(--hue,#c2921b) 55%,#1c1200);--sk-panel:#fffdf8;--sk-panel2:#fbf6ea;--sk-line:rgba(90,66,10,.15);--sk-line2:rgba(90,66,10,.3);--sk-sunken:rgba(90,66,10,.06);--sk-gold-soft:rgba(194,146,27,.14);--sk-glow:0 0 0 1px rgba(138,100,16,.35),0 8px 26px rgba(160,120,20,.28);--sk-grad:linear-gradient(135deg,#ecd07a 0%,#d0a02c 45%,#9a7012 100%)}',

  // Panels: warm hairlines and the mockup's two-tone panel fill on the studio's own cards.
  '.vv-studio-skin :is(section,article,div,aside,form)[class*="rounded-xl"][class*="border"],.vv-studio-skin :is(section,article,div,aside,form)[class*="rounded-2xl"][class*="border"],.vv-studio-skin :is(section,article,div,aside,form)[class*="rounded-3xl"][class*="border"]{border-color:var(--sk-line)}',
  '.vv-studio-skin :is(section,article,div,aside,form)[class*="border"][class*="bg-[var(--space-surface-card"],.vv-studio-skin :is(section,article,div,aside,form)[class*="border"][class*="bg-[var(--space-surface-panel"],.vv-studio-skin :is(section,article,div,aside,form)[class*="border"][class*="bg-[var(--vg-surface"],.vv-studio-skin :is(section,article,div,aside,form)[class*="border"][class*="bg-[var(--vg-raised"]{background-image:linear-gradient(180deg,var(--sk-panel2),var(--sk-panel))}',
  '.vv-studio-skin .vg-panel,.vv-studio-skin .vg-featured-panel,.vv-studio-skin .vg-app-intro{border-color:var(--sk-line);border-radius:22px;background:linear-gradient(180deg,var(--sk-panel2),var(--sk-panel))}',
  '.vv-studio-skin .vg-app-intro::after{background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--hue,#f2c14a) 18%,transparent),transparent)}',

  // Steps and tabs: the studio's colour marks where you are.
  '.vv-studio-skin [role="tablist"]{gap:4px}',
  '.vv-studio-skin [role="tab"]{border-radius:999px}',
  '.vv-studio-skin [role="tab"][aria-selected="true"]{background-color:color-mix(in srgb,var(--hue,#f2c14a) 14%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--hue,#f2c14a) 40%,transparent)}',
  '.vv-studio-skin [aria-current="step"]{color:var(--hue-ink);border-color:var(--hue,#f2c14a)}',
  '.vv-studio-skin .vg-segmented{border-radius:999px;background:var(--sk-sunken);border-color:var(--sk-line)}',
  '.vv-studio-skin .vg-segmented>*{border-radius:999px}',

  // The stage: finished video sits on black, rounded, lifted off the page.
  '.vv-studio-skin video{border-radius:14px;background:#000;box-shadow:0 0 0 1px var(--sk-line),0 30px 80px rgba(0,0,0,.55)}',

  // Inputs: sunken warm field, gold focus ring.
  '.vv-studio-skin input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),.vv-studio-skin textarea,.vv-studio-skin select{background-color:var(--sk-sunken);border-color:var(--sk-line);border-radius:12px}',
  '.vv-studio-skin input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):focus,.vv-studio-skin textarea:focus,.vv-studio-skin select:focus{border-color:var(--vg-accent);box-shadow:0 0 0 4px var(--sk-gold-soft);outline:none}',

  // The one main action: gold gradient pill with the projector glow.
  '.vv-studio-skin .vg-primary-action,.vv-studio-skin :is(button,a)[class*="vg-gradient-action"],.vv-studio-skin :is(button,a)[class*="bg-[var(--vg-btn)]"]{border-radius:999px;background-image:var(--sk-grad);box-shadow:var(--sk-glow),inset 0 1px 0 rgba(255,255,255,.55)}',
  '.vv-studio-skin .vg-primary-action:disabled,.vv-studio-skin :is(button,a)[class*="vg-gradient-action"]:disabled,.vv-studio-skin :is(button,a)[class*="bg-[var(--vg-btn)]"]:disabled{box-shadow:none;opacity:.45}',
  '.vv-studio-skin .vg-secondary-action{border-color:var(--sk-line2);background:var(--sk-sunken);color:var(--vg-text)}',
  '.vv-studio-skin .vg-secondary-action:hover:not(:disabled){border-color:var(--vg-accent);background:var(--sk-sunken);color:var(--vg-text)}',

  // Chosen options read like the mockup's selected tiles.
  '.vv-studio-skin :is(button,label,div)[aria-pressed="true"][class*="border"]:not([role="tab"]),.vv-studio-skin :is(button,label,div)[aria-checked="true"][class*="border"]{border-color:var(--vg-accent);background-color:var(--sk-gold-soft)}',
  '.vv-studio-skin .vg-chip-selected{background:var(--sk-gold-soft);border-color:var(--vg-accent);color:var(--vg-on-selected)}',

  // Progress fills use the gold gradient.
  '.vv-studio-skin progress{accent-color:var(--vg-accent)}',
  '.vv-studio-skin progress::-webkit-progress-value{background:var(--sk-grad)}',
  '.vv-studio-skin progress::-moz-progress-bar{background:var(--sk-grad)}',

  // Type: display face and tight tracking on studio headings, tabular numbers on mono.
  '.vv-studio-skin h1,.vv-studio-skin h2,.vv-studio-skin h3{font-family:var(--display);letter-spacing:-.03em}',
  '.vv-studio-skin .font-mono,.vv-studio-skin code,.vv-studio-skin time{font-family:"Geist Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}',
  '.vv-studio-skin ::selection{background:color-mix(in srgb,var(--hue,#f2c14a) 30%,transparent)}',
].join('\n');
