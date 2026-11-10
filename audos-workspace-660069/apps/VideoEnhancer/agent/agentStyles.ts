/** Enhancer Agent layout. Builds on ENHANCE_CSS: same tokens, controls and banners. */
export const AGENT_CSS = `
.vea .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.vea-head .ves-title h2{display:flex;align-items:center;gap:8px}
.vea-head .ves-title h2 svg{color:var(--e-sel)}
.vea-picker select{height:36px;max-width:220px;padding:0 10px;border:1px solid var(--e-control);border-radius:10px;background:var(--e-raised);font-size:13px}

.vea-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(290px,350px) minmax(0,1fr) minmax(270px,320px);overflow:hidden}
.vea-main{min-width:0;min-height:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.vea-preview{display:flex;flex-direction:column;gap:10px;max-width:1100px;width:100%;margin:0 auto}

.vea-chat{min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--e-line);background:var(--e-panel)}
.vea-messages{flex:1;min-height:0;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px}
.vea-greeting{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid color-mix(in srgb,var(--e-sel) 35%,transparent);border-radius:12px;background:linear-gradient(145deg,var(--e-raised),var(--e-panel))}
.vea-greeting>svg{color:var(--e-sel)}
.vea-greeting b{font:700 15px/1.3 var(--display,inherit)}
.vea-greeting p{margin:0;color:var(--e-sub);font-size:12.5px;line-height:1.55}
.vea-suggest{display:flex;flex-direction:column;gap:6px;margin-top:4px}
.vea-suggest .ve-pill{text-align:left;border-radius:10px;padding:7px 10px;min-height:0;line-height:1.35;white-space:normal}
.vea-suggest .ve-pill:hover{border-color:var(--e-sel);color:var(--e-text)}
.vea-msg{max-width:94%;padding:9px 11px;border-radius:12px;border:1px solid var(--e-line);background:var(--e-raised);font-size:13px;line-height:1.5}
.vea-msg p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.vea-msg.user{align-self:flex-end;background:var(--e-sel-soft);border-color:color-mix(in srgb,var(--e-sel) 45%,transparent)}
.vea-msg.agent,.vea-msg.system{align-self:flex-start}
.vea-msg.system{background:transparent;border-style:dashed;color:var(--e-sub)}
.vea-msg.good{border-color:color-mix(in srgb,var(--e-good) 40%,transparent)}
.vea-msg.bad{border-color:color-mix(in srgb,var(--e-bad) 50%,transparent)}
.vea-msg.thinking{display:inline-flex;align-items:center;gap:8px;color:var(--e-sub)}
.vea-model{display:inline-block;margin-bottom:4px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--e-sel)}
.vea-plan{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.vea-plan li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--e-sub)}
.vea-plan li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vea-plan li em,.vea-credits{font-style:normal;font-size:11px;font-weight:700;color:var(--e-credit-ink)}
.vea-plan li.off span{text-decoration:line-through;opacity:.6}
.vea-cost{display:block;margin-top:6px;color:var(--e-muted);font-size:11.5px}
.vea-approve{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.vea-composer{flex:none;position:relative;padding:10px 12px 4px;border-top:1px solid var(--e-line)}
.vea-composer textarea{width:100%;min-height:56px;max-height:160px;resize:vertical;padding:10px 46px 10px 12px;border:1px solid var(--e-control);border-radius:12px;background:var(--e-raised);color:var(--e-text);font:inherit;font-size:13.5px;line-height:1.45}
.vea-composer textarea:focus{outline:2px solid var(--e-focus);outline-offset:1px}
.vea-send{position:absolute;right:20px;bottom:14px}
.vea-cap{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 12px 12px;font-size:11.5px;color:var(--e-muted)}
.vea-cap label{display:inline-flex;align-items:center;gap:6px}
.vea-cap select{height:28px;border:1px solid var(--e-control);border-radius:8px;background:var(--e-raised);padding:0 6px;font-size:11.5px}
.vea-cap small{color:var(--e-credit-ink);font-weight:600;text-align:right}

.vea-timeline{display:flex;flex-direction:column;gap:6px;max-width:1100px;width:100%;margin:0 auto;padding:12px 14px;border:1px solid var(--e-line);border-radius:12px;background:var(--e-panel)}
.vea-timeline header{display:flex;align-items:center;justify-content:space-between}
.vea-timeline h3{margin:0;font-size:12px;font-weight:700;color:var(--e-muted);text-transform:uppercase;letter-spacing:.06em}
.vea-timeline header small{color:var(--e-muted);font-size:11.5px}
.vea-ruler{position:relative;height:16px;margin-left:78px;font:600 10px/16px 'Geist Mono',ui-monospace,monospace;color:var(--e-muted)}
.vea-ruler span{position:absolute;transform:translateX(-50%)}
.vea-ruler span:first-child{transform:none}
.vea-ruler span:last-child{transform:translateX(-100%)}
.vea-lane{display:grid;grid-template-columns:70px minmax(0,1fr);align-items:center;gap:8px}
.vea-lane>b{font-size:11px;font-weight:600;color:var(--e-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vea-track{position:relative;height:22px;border-radius:6px;background:var(--e-raised);overflow:hidden}
.vea-track.cut{background:repeating-linear-gradient(135deg,var(--e-raised) 0 6px,color-mix(in srgb,var(--e-bad) 18%,var(--e-raised)) 6px 9px)}
.vea-track>*{position:absolute;top:2px;bottom:2px}
.vea-track .keep{border-radius:4px;background:linear-gradient(115deg,var(--e-btn-pressed),var(--e-btn))}
.vea-track .keep.speed{background:repeating-linear-gradient(90deg,var(--e-btn) 0 8px,var(--e-btn-pressed) 8px 12px)}
.vea-track .word{width:1px;top:6px;bottom:6px;background:var(--e-sub);opacity:.6}
.vea-track .overlay{display:flex;align-items:center;padding:0 5px;border-radius:4px;font-size:10px;font-weight:700;overflow:hidden;white-space:nowrap;color:var(--e-on-btn)}
.vea-track .overlay.text{background:var(--e-btn-hover)}
.vea-track .overlay.broll{background:color-mix(in srgb,var(--e-info) 60%,var(--e-raised));color:var(--e-text)}
.vea-track .overlay.bad{background:var(--e-bad-bg);color:var(--e-bad)}
.chunk{display:inline-grid;place-items:center;min-width:16px;border-radius:4px;border:1px solid var(--e-line);background:var(--e-hover);color:var(--e-sub);font-size:9.5px;font-weight:700;overflow:hidden}
.chunk.done{background:linear-gradient(115deg,var(--e-btn-pressed),var(--e-btn));border-color:transparent;color:var(--e-on-btn)}
.chunk.trimming,.chunk.submitting,.chunk.generating{background:var(--e-sel-soft);border-color:color-mix(in srgb,var(--e-sel) 55%,transparent);color:var(--e-on-sel)}
.chunk.error{background:var(--e-bad-bg);border-color:color-mix(in srgb,var(--e-bad) 60%,transparent);color:var(--e-bad);cursor:pointer;padding:0}
.vea-track .chunk{top:2px;bottom:2px;margin-right:1px}

.vea-side{min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--e-line);background:var(--e-panel)}
.vea-side-tabs{flex:none;margin:10px 12px 0;width:auto}
.vea-side-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:6px}
.vea-stack{flex:1;min-height:0;overflow-y:auto;padding:0 12px 12px}
.vea-pad{padding:14px 2px}
.vea-side-foot{flex:none;padding:6px 12px 10px;border-top:1px solid var(--e-line);text-align:left}
.vea-side-foot .ve-link{display:inline-flex;align-items:center;gap:5px;color:var(--e-muted)}
.vea-side-foot .ve-link:hover:not(:disabled){color:var(--e-bad)}
.vea-preset-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.vea-preset-grid .ves-preset small{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.vea-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vea-step{display:flex;flex-direction:column;gap:6px;padding:9px 10px;border:1px solid var(--e-line);border-radius:10px;background:var(--e-raised)}
.vea-step.off{opacity:.62}
.vea-step.off b{text-decoration:line-through}
.vea-step-head{display:flex;align-items:center;gap:7px;min-width:0}
.vea-step-head b{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vea-step p{margin:0;font-size:11.5px;line-height:1.45;color:var(--e-muted);overflow-wrap:anywhere}
.vea-step p.bad{color:var(--e-bad)}
.vea-step .ve-bar{margin:0}
.vea-step-actions{display:flex;gap:6px;flex-wrap:wrap}
.vea-chunks{display:flex;flex-wrap:wrap;align-items:center;gap:3px}
.vea-chunks .chunk{width:20px;height:18px}
.vea-chunks small{margin-left:4px;font-size:11px;color:var(--e-muted);font-variant-numeric:tabular-nums}
.vea-exports{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.vea-exports li{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border:1px solid var(--e-line);border-radius:10px;background:var(--e-raised)}
.vea-exports li.on{border-color:color-mix(in srgb,var(--e-sel) 55%,transparent)}
.vea-exports li>div:first-child{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.vea-exports b{font-size:12.5px}
.vea-exports small{font-size:11px;color:var(--e-muted)}
.vea-export-steps{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vea-export-actions{display:flex;gap:4px}

.vea-empty-prompt{width:min(520px,100%);margin-top:6px;padding:10px 12px;border:1px solid var(--e-control);border-radius:12px;background:var(--e-raised);color:var(--e-text);font:inherit;font-size:13px;resize:vertical}
.vea-looks{grid-template-columns:repeat(4,1fr);width:min(860px,100%)}

@container (max-width:1180px){
  .vea-body{grid-template-columns:minmax(280px,330px) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}
  .vea-side{grid-column:1 / -1;border-left:0;border-top:1px solid var(--e-line);max-height:46vh}
  .vea-looks{grid-template-columns:repeat(2,1fr)}
}
@container (max-width:760px){
  .vea-body{display:flex;flex-direction:column;overflow:auto}
  .vea-main,.vea-chat,.vea-side,.vea-messages,.vea-stack{flex:none;min-height:auto;max-height:none;overflow:visible}
  .vea-main{order:1;padding:12px}
  .vea-chat{order:2;border-right:0;border-top:1px solid var(--e-line)}
  .vea-messages{max-height:60vh;overflow-y:auto}
  .vea-side{order:3}
  .vea-picker select{max-width:140px}
  .vea-lane{grid-template-columns:54px minmax(0,1fr)}
  .vea-ruler{margin-left:62px}
  .vea-looks{grid-template-columns:1fr}
  .vea-preset-grid{grid-template-columns:1fr}
}
`;
