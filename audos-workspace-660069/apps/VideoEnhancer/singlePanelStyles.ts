/**
 * One-panel editor layout, layered after MODERN_EDITOR_CSS.
 *
 *   [ panel: Assets · Tools · Properties ] [ stagebar / preview / transport ]
 *   [ timeline — pinned, fixed height, full width                         ]
 *
 * The editor shell never scrolls: the preview takes whatever height is left
 * once the fixed timeline is placed, so panel content can never stretch it.
 * Only the panel body and the timeline lanes scroll internally. Selectors are
 * prefixed with `.vex` (and use !important where the legacy sheet does) so
 * they win over the older three-column and overlay rules regardless of order.
 */
export const SINGLE_PANEL_CSS = `
.vex{position:relative;--vx-tl-h:208px;--vx-panel-w:clamp(288px,26vw,340px)}
.vex .vx-work{flex:1 1 0!important;min-height:0!important;display:grid!important;grid-template-columns:var(--vx-panel-w) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important;overflow:hidden!important}
.vex .vx-work>.vx-center{grid-column:2!important;grid-row:1!important;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.vex .vx-center>.vx-stagebar,.vex .vx-center>.vx-transport{flex:none}
.vex .vx-center>.vx-stage{flex:1 1 0!important;min-height:0!important;height:auto!important;overflow:hidden!important;container-type:size}
.vex .vx-stage>.vx-canvas{width:min(100cqw,calc(100cqh * var(--ar,1.7778)))!important;max-width:100cqw!important;max-height:100cqh!important;height:auto!important}

.vex .vx-work>.vx-panel-one{grid-column:1;grid-row:1;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border-right:1px solid var(--line-soft)}
.vx-panel-switch{flex:none;display:flex;align-items:center;gap:4px;padding:8px 10px;border-bottom:1px solid var(--line-soft)}
.vx-panel-switch [role='tab']{position:relative;flex:1;min-width:0;height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--muted);font-size:12.5px;font-weight:800;white-space:nowrap;transition:background .18s,color .18s,border-color .18s}
.vx-panel-switch [role='tab']:hover{color:var(--text);background:var(--raised)}
.vx-panel-switch [role='tab'][aria-selected='true']{color:var(--vg-on-selected);background:var(--vg-selected-soft);border-color:color-mix(in srgb,var(--vg-selected) 45%,transparent)}
.vx-panel-switch .dot{width:6px;height:6px;flex:none;border-radius:99px;background:var(--gold)}
.vx-panel-switch .vx-sheet-close{display:none}
.vex .vx-panel-one>.vx-left,.vex .vx-panel-one>.vx-right{position:static!important;inset:auto!important;transform:none!important;width:auto!important;height:auto!important;flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:0!important;border-radius:0!important;box-shadow:none!important;padding:0!important;background:transparent!important;z-index:auto}
.vex .vx-panel-one>[hidden]{display:none!important}
.vex .vx-panel-one .vx-scroll{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.vex .vx-panel-one>.vx-right>.vx-inspector-head{position:static;flex:none;padding:10px 12px 8px;border-bottom:1px solid var(--line-soft)}

.vex>.vx-timeline{flex:0 0 var(--vx-tl-h)!important;height:var(--vx-tl-h)!important;min-height:0!important;max-height:var(--vx-tl-h)!important;margin:0!important;overflow:hidden}
.vex>.vx-timeline.tall{--vx-tl-h:288px}
.vex>.vx-timeline .vx-tlbar{flex:none}
.vex>.vx-timeline .vx-tlbody{flex:1 1 0!important;min-height:0!important;overflow:hidden}
.vex>.vx-timeline .vx-lanes{overflow:auto;overscroll-behavior:contain}
.vex>.vx-motion-dock{flex:none;max-height:min(34%,300px);overflow:auto;overscroll-behavior:contain;border-top:1px solid var(--border);padding:12px}
.vex>.vx-toast{bottom:calc(var(--vx-tl-h) + 12px)}

@container (max-width:980px){.vex .vx-work{grid-template-columns:clamp(256px,32cqw,300px) minmax(0,1fr)!important}}
@media(max-height:820px) and (min-width:761px){.vex{--vx-tl-h:176px}.vex>.vx-timeline.tall{--vx-tl-h:236px}}
@media(max-height:640px) and (min-width:761px){.vex{--vx-tl-h:150px}.vex>.vx-timeline.tall{--vx-tl-h:190px}}

@media(max-width:760px){
.vex{--vx-tl-h:184px}
.vex>.vx-timeline.tall{--vx-tl-h:230px}
.vex .vx-work{grid-template-columns:minmax(0,1fr)!important}
.vex .vx-work>.vx-center{grid-column:1!important}
.vex .vx-work>.vx-panel-one{position:fixed;left:0;right:0;bottom:58px;height:min(58dvh,520px);z-index:90;border:1px solid var(--border);border-bottom:0;border-radius:18px 18px 0 0;box-shadow:0 -30px 80px -20px #000;transform:translateY(calc(100% + 30px));transition:transform .24s cubic-bezier(.2,0,0,1)}
.vex .vx-work>.vx-panel-one.open{transform:none}
.vx-panel-switch .vx-sheet-close{display:grid;position:static;flex:none}
.vex .vx-panel-one .vx-left-head{padding-right:12px}
.vex>.vx-toast{bottom:calc(var(--vx-tl-h) + 70px)}
}
@media(max-width:760px) and (max-height:640px){.vex{--vx-tl-h:150px}}
@media(prefers-reduced-motion:reduce){.vex .vx-work>.vx-panel-one{transition:none}}
`;
