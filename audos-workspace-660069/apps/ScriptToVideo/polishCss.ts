/**
 * Script-to-Video polish layer — appended after APP_CSS. Refines existing
 * surfaces with the Vidverge dark/gold tokens without changing layout, and
 * styles the one-press Start panel and the live step checklist.
 *
 * Most studio markup is inline-styled, so the few overrides on existing
 * elements use !important on paint properties only (background-image,
 * box-shadow) — never on size or position.
 */
export const S2V_POLISH_CSS = `
  .s2v-app { --s2v-radius: 12px; --s2v-glow: 0 0 0 1px color-mix(in srgb, var(--vg-accent) 45%, transparent), 0 10px 34px color-mix(in srgb, var(--vg-accent) 16%, transparent); }
  .s2v-app .s2v-create-scroll { overflow-x: hidden; }
  .s2v-app img, .s2v-app video { max-width: 100%; }

  /* Primary CTAs (inline-styled with the on-accent label colour) get the
     action gradient and a soft lift. */
  .s2v-app button.s2v-lift[style*="vg-on-btn"]:not(:disabled) {
    background-image: var(--vg-gradient-action) !important;
    border-color: transparent !important;
    box-shadow: 0 8px 26px color-mix(in srgb, var(--vg-accent) 22%, transparent), inset 0 1px 0 color-mix(in srgb, var(--vg-text) 22%, transparent);
  }
  .s2v-app button.s2v-lift[style*="vg-on-btn"]:not(:disabled):hover { background-image: var(--vg-gradient-hover, var(--vg-gradient-action)) !important; }

  /* Setup cards on the create screen: subtle surface gradient. */
  .s2v-app .s2v-v4-script > section, .s2v-app .s2v-v4-script details { background-image: var(--vg-gradient-surface) !important; }

  /* Progress bars: gradient fill already set — add a soft glow. */
  .s2v-app .s2v-production-bar > span { box-shadow: 0 0 14px color-mix(in srgb, var(--vg-accent) 45%, transparent); }
  .s2v-app .s2v-scene-pill.is-active { box-shadow: var(--s2v-glow); }

  /* Render room: filled primary actions without the lift class, cards and
     progress fills get the same gold gradient language. */
  .s2v-app .s2v-board button[style*="vg-on-btn"]:not(:disabled) { background-image: var(--vg-gradient-action) !important; border-color: transparent !important; }
  .s2v-app .s2v-board-panel article { background-image: var(--vg-gradient-surface) !important; }
  .s2v-app .s2v-board [role="progressbar"] > * { background-image: var(--vg-gradient-action) !important; }

  .s2v-app details > summary { min-height: 44px; }
  .s2v-app select { min-height: 44px; }
  .s2v-app :focus-visible { outline: 2px solid var(--vg-focus, var(--space-focus-ring)); outline-offset: 3px; }

  /* ---- One-press Start panel ---- */
  .s2v-qs { display: grid; gap: 14px; margin: 0 0 16px; }
  .s2v-qs-tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px; border: 1px solid var(--vg-border); background: var(--vg-surface); max-width: 100%; }
  .s2v-qs-tab { min-height: 44px; padding: 9px 16px; border-radius: 9px; border: 0; background: transparent; color: var(--vg-secondary); font-weight: 800; font-size: 14px; cursor: pointer; }
  .s2v-qs-tab[aria-selected="true"] { background-image: linear-gradient(100deg, var(--vg-accent-soft), color-mix(in srgb, var(--vg-accent-soft) 40%, var(--vg-surface))); color: var(--vg-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--vg-accent) 45%, transparent); }
  .s2v-qs-card { position: relative; border-radius: 16px; padding: 20px; border: 1px solid color-mix(in srgb, var(--vg-accent) 28%, var(--vg-border)); background-image: var(--vg-gradient-surface); background-color: var(--vg-surface); overflow: hidden; }
  .s2v-qs-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 2px; background: var(--vg-gradient-action); opacity: .75; }
  .s2v-qs-card h2 { margin: 0; color: var(--vg-text); font-size: 20px; line-height: 1.3; font-family: var(--space-font-heading, inherit); }
  .s2v-qs-hint { margin: 6px 0 12px; color: var(--vg-muted); font-size: 14px; line-height: 1.5; }
  .s2v-qs-text { width: 100%; box-sizing: border-box; min-height: 260px; resize: vertical; border-radius: 12px; padding: 16px; font-size: 16px; line-height: 1.6; color: var(--vg-text); background: var(--vg-bg); border: 1px solid var(--vg-border); }
  .s2v-qs-text:focus { border-color: var(--vg-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-accent) 18%, transparent); outline: none; }
  .s2v-qs-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .s2v-qs-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--vg-border); background: var(--vg-raised); color: var(--vg-secondary); font-size: 12.5px; font-weight: 700; max-width: 100%; }
  .s2v-qs-chip.is-accent { border-color: color-mix(in srgb, var(--vg-accent) 55%, var(--vg-border)); color: var(--vg-text); background-image: linear-gradient(100deg, var(--vg-accent-soft), transparent); }
  .s2v-qs-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; background: var(--vg-gradient-action); color: var(--vg-on-accent); font-size: 11.5px; font-weight: 850; white-space: nowrap; }
  .s2v-qs-adv { margin-top: 14px; border: 1px solid var(--vg-border); border-radius: 12px; background: var(--vg-bg); }
  .s2v-qs-adv > summary { display: flex; align-items: center; gap: 8px; padding: 0 14px; cursor: pointer; color: var(--vg-text); font-weight: 800; font-size: 15px; list-style: none; }
  .s2v-qs-adv > summary::-webkit-details-marker { display: none; }
  .s2v-qs-adv[open] > summary { border-bottom: 1px solid var(--vg-border); }
  .s2v-qs-adv-body { display: grid; gap: 16px; padding: 14px; }
  .s2v-qs-field > span { display: block; color: var(--vg-secondary); font-size: 13px; font-weight: 800; margin-bottom: 6px; }
  .s2v-qs-field select, .s2v-qs-field textarea { width: 100%; box-sizing: border-box; border-radius: 10px; border: 1px solid var(--vg-border); background: var(--vg-surface); color: var(--vg-text); padding: 10px 12px; font-size: 15px; }
  .s2v-qs-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .s2v-qs-seg button { min-height: 44px; border-radius: 10px; border: 1px solid var(--vg-border); background: var(--vg-surface); color: var(--vg-text); font-weight: 800; cursor: pointer; }
  .s2v-qs-seg button[aria-checked="true"] { border-color: var(--vg-accent); background-image: linear-gradient(100deg, var(--vg-accent-soft), transparent); }
  .s2v-qs-bar { position: sticky; bottom: 0; z-index: 12; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--vg-accent) 35%, var(--vg-border)); background: color-mix(in srgb, var(--vg-surface) 94%, transparent); backdrop-filter: blur(16px); box-shadow: 0 -12px 36px color-mix(in srgb, var(--vg-bg) 60%, transparent); }
  .s2v-qs-bar-info { flex: 1; min-width: 0; }
  .s2v-qs-bar-info strong { display: block; color: var(--vg-text); font-size: 14px; }
  .s2v-qs-bar-info small { display: block; color: var(--vg-muted); font-size: 12px; margin-top: 3px; }
  .s2v-qs-start { min-height: 52px; min-width: 190px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 22px; border-radius: 10px; border: 0; background-image: var(--vg-gradient-action); color: var(--vg-on-accent); font-size: 16px; font-weight: 850; cursor: pointer; box-shadow: 0 10px 30px color-mix(in srgb, var(--vg-accent) 26%, transparent); transition: transform 180ms cubic-bezier(.2,0,0,1), box-shadow 180ms cubic-bezier(.2,0,0,1); }
  .s2v-qs-start:hover:not(:disabled) { transform: translateY(-1px); background-image: var(--vg-gradient-hover, var(--vg-gradient-action)); }
  .s2v-qs-start:disabled { background-image: none; background: var(--vg-raised); color: var(--vg-muted); box-shadow: none; cursor: not-allowed; }
  .s2v-qs-alert { border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.45; border: 1px solid var(--vg-danger); background: var(--vg-danger-bg); color: var(--vg-danger); }
  .s2v-qs-note { border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.45; border: 1px solid color-mix(in srgb, var(--vg-accent) 45%, var(--vg-border)); background: var(--vg-accent-soft); color: var(--vg-text); }

  /* ---- Live step checklist ---- */
  .s2v-run { flex-shrink: 0; margin: 12px 20px 0; padding: 16px; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--vg-accent) 30%, var(--vg-border)); background-image: var(--vg-gradient-surface); background-color: var(--vg-surface); }
  .s2v-run-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .s2v-run-head h2 { margin: 0; font-size: 16px; color: var(--vg-text); font-family: var(--space-font-heading, inherit); }
  .s2v-run-head p { margin: 2px 0 0; font-size: 13px; color: var(--vg-muted); }
  .s2v-run-progress { height: 6px; margin: 12px 0; border-radius: 999px; background: var(--vg-bg); overflow: hidden; }
  .s2v-run-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--vg-gradient-action); box-shadow: 0 0 14px color-mix(in srgb, var(--vg-accent) 45%, transparent); transition: width 480ms cubic-bezier(.2,0,0,1); }
  .s2v-run-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .s2v-run-step { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 44px; padding: 8px 10px; border-radius: 10px; border: 1px solid transparent; }
  .s2v-run-step.is-running { border-color: color-mix(in srgb, var(--vg-accent) 55%, var(--vg-border)); background: var(--vg-accent-soft); box-shadow: var(--s2v-glow); }
  .s2v-run-step.is-failed { border-color: var(--vg-danger); background: var(--vg-danger-bg); }
  .s2v-run-icon { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 999px; border: 1px solid var(--vg-border); color: var(--vg-muted); }
  .s2v-run-step.is-done .s2v-run-icon { border-color: color-mix(in srgb, var(--vg-success) 55%, var(--vg-border)); color: var(--vg-success); background: var(--vg-success-bg); }
  .s2v-run-step.is-running .s2v-run-icon { border-color: var(--vg-accent); color: var(--vg-accent); }
  .s2v-run-step.is-failed .s2v-run-icon { border-color: var(--vg-danger); color: var(--vg-danger); }
  .s2v-run-label { color: var(--vg-text); font-size: 14px; font-weight: 750; }
  .s2v-run-detail { display: block; color: var(--vg-muted); font-size: 12.5px; font-weight: 500; margin-top: 2px; line-height: 1.4; }
  .s2v-run-step.is-failed .s2v-run-detail { color: var(--vg-danger); }
  .s2v-run-status { font-size: 12px; font-weight: 800; color: var(--vg-muted); white-space: nowrap; }
  .s2v-run-retry { min-height: 44px; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--vg-danger); background: var(--vg-surface); color: var(--vg-text); font-weight: 800; cursor: pointer; }
  .s2v-run-retry:disabled { opacity: .6; cursor: wait; }
  .s2v-run-toggle { min-height: 44px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--vg-border); background: transparent; color: var(--vg-secondary); font-weight: 700; cursor: pointer; }
  @keyframes s2v-run-spin { to { transform: rotate(360deg); } }
  .s2v-run-spin { animation: s2v-run-spin 1s linear infinite; }

  @media (max-width: 640px) {
    /* The 268px scene rail stacks above the panel instead of squeezing it. */
    .s2v-app .s2v-board { flex-direction: column !important; }
    .s2v-app .s2v-scene-rail { width: 100% !important; max-height: 240px; overflow-y: auto; }
    .s2v-app .s2v-board-panel { min-width: 0; padding: 16px 14px 28px !important; }
    .s2v-app .s2v-cast-grid, .s2v-app .s2v-cast-grid [style*="minmax(150px, 1fr) 140px"], .s2v-app .s2v-board-panel [style*="minmax(210px"] { grid-template-columns: minmax(0, 1fr) !important; }
  }
  @media (max-width: 480px) {
    .s2v-app .s2v-create-scroll { padding: 16px 16px 140px !important; }
    .s2v-qs-card { padding: 16px; }
    .s2v-qs-tabs { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
    .s2v-qs-bar { position: sticky; bottom: 0; margin: 0 -4px; border-radius: 14px 14px 0 0; }
    .s2v-qs-start { width: 100%; }
    .s2v-run { margin: 10px 12px 0; padding: 12px; }
    .s2v-run-step { grid-template-columns: 26px minmax(0, 1fr); }
    .s2v-run-step > :last-child { grid-column: 2; justify-self: start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .s2v-run-spin { animation: none !important; }
    .s2v-qs-start, .s2v-run-progress > span { transition: none !important; }
    .s2v-qs-start:hover:not(:disabled) { transform: none; }
  }
`;
