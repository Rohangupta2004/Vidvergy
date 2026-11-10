export const ENHANCE_CSS = `
.ves{
  --e-bg:var(--vg-bg,#0B0D12);--e-panel:var(--vg-surface,#12141B);--e-raised:var(--vg-raised,#1A1D26);--e-hover:var(--vg-hover,#222631);
  --e-line:var(--vg-border,#2A2E3A);--e-control:var(--vg-control-border,#3A3F4D);
  --e-text:var(--vg-text,#F5F6F8);--e-sub:var(--vg-secondary,#C3C7D1);--e-muted:var(--vg-muted,#9AA0AE);
  --e-sel:var(--vg-selected,#D4AF37);--e-sel-soft:var(--vg-selected-soft,rgba(212,175,55,.15));--e-on-sel:var(--vg-on-selected,#F5F6F8);
  --e-btn:var(--vg-btn,#D4AF37);--e-btn-hover:var(--vg-btn-hover,#E6C45A);--e-btn-pressed:var(--vg-btn-pressed,#A8861F);--e-on-btn:var(--vg-on-btn,#0B0D12);
  --e-credit:var(--vg-credit,#ffb020);--e-credit-soft:var(--vg-credit-soft,#3a2a06);--e-credit-ink:var(--vg-credit-ink,#ffc65c);
  --e-good:var(--vg-success,#3FB950);--e-good-bg:var(--vg-success-bg,rgba(63,185,80,.12));
  --e-bad:var(--vg-danger,#E5484D);--e-bad-bg:var(--vg-danger-bg,rgba(229,72,77,.12));
  --e-info:var(--vg-accent,#D4AF37);--e-info-bg:var(--vg-gold-tint,rgba(212,175,55,.15));
  --e-focus:var(--vg-focus,#D4AF37);
  position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--e-bg);color:var(--e-text);
  font:14px/1.45 var(--body,'Geist','Inter',system-ui,sans-serif);overflow:hidden;container-type:inline-size
}
.ves *{box-sizing:border-box}
.ves button,.ves input,.ves select{font:inherit;color:inherit}
.ves button{cursor:pointer}
.ves button:disabled{cursor:not-allowed;opacity:.45}
.ves :where(button,a,input,select,summary,[tabindex]):focus-visible{outline:2px solid var(--e-focus);outline-offset:2px}
.ve-spin{animation:vespin 1s linear infinite}
@keyframes vespin{to{transform:rotate(360deg)}}
@keyframes vebar{from{transform:translateX(-100%)}to{transform:translateX(250%)}}

.ve-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:0 13px;border:1px solid var(--e-control);border-radius:10px;background:var(--e-raised);color:var(--e-text);font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;transition:background .16s,border-color .16s}
.ve-btn:hover:not(:disabled){background:var(--e-hover)}
.ve-btn.primary{background:var(--e-btn);border-color:var(--e-btn);color:var(--e-on-btn)}
.ve-btn.primary:hover:not(:disabled){background:var(--e-btn-hover);border-color:var(--e-btn-hover)}
.ve-btn.primary:active:not(:disabled){background:var(--e-btn-pressed);border-color:var(--e-btn-pressed)}
.ve-btn.small{min-height:30px;padding:0 10px;font-size:12px;border-radius:8px}
.ve-btn.wide{width:100%;min-height:44px;font-size:14px}
.ve-btn.danger{border-color:var(--e-bad);color:var(--e-bad)}
.ve-icon-btn{display:inline-grid;place-items:center;width:34px;height:34px;flex:none;border:1px solid var(--e-control);border-radius:9px;background:var(--e-raised);color:var(--e-sub)}
.ve-icon-btn:hover:not(:disabled){background:var(--e-hover);color:var(--e-text)}
.ve-icon-btn.small{width:28px;height:28px;border-radius:7px}
.ve-icon-btn.primary{background:var(--e-btn);border-color:var(--e-btn);color:var(--e-on-btn)}
.ve-icon-btn.on{background:var(--e-sel-soft);border-color:var(--e-sel);color:var(--e-on-sel)}
.ve-icon-btn.danger{border-color:var(--e-bad);color:var(--e-bad)}
.ve-link{border:0;background:none;color:var(--e-sel);font-size:12.5px;font-weight:600;padding:4px 0;text-align:center}
.ve-help{margin:6px 0 0;color:var(--e-muted);font-size:12px;line-height:1.5}
.ve-pill{min-height:30px;padding:0 11px;border:1px solid var(--e-control);border-radius:999px;background:var(--e-raised);color:var(--e-sub);font-size:12.5px;font-weight:600}
.ve-pill.on{background:var(--e-sel-soft);border-color:var(--e-sel);color:var(--e-on-sel)}
.ve-seg{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--e-line);border-radius:10px;background:var(--e-raised)}
.ve-seg.full{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);width:100%}
.ve-seg.full button{white-space:normal;line-height:1.2;padding:4px 6px;min-height:32px;font-size:12px}
.ve-seg button{min-height:30px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--e-sub);font-size:12.5px;font-weight:600;white-space:nowrap}
.ve-seg button.on{background:var(--e-sel-soft);color:var(--e-on-sel);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--e-sel) 55%,transparent)}
.ve-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:6px;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.01em;background:var(--e-raised);color:var(--e-sub)}
.ve-chip.info{background:var(--e-info-bg);color:var(--e-info)}
.ve-chip.active{background:var(--e-sel-soft);color:var(--e-on-sel)}
.ve-chip.good{background:var(--e-good-bg);color:var(--e-good)}
.ve-chip.bad{background:var(--e-bad-bg);color:var(--e-bad)}
.ve-credit-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;background:var(--e-credit-soft);color:var(--e-credit-ink);border:1px solid color-mix(in srgb,var(--e-credit) 35%,transparent);font-size:12px;font-weight:700;white-space:nowrap}
.ve-credit-chip.strong{font-size:13px;padding:5px 12px}
.ve-bar{position:relative;height:3px;margin:0 10px 8px;border-radius:3px;background:var(--e-line);overflow:hidden}
.ve-bar span{position:absolute;inset:0 auto 0 0;background:var(--e-sel);border-radius:3px;transition:width .2s}
.ve-bar.indeterminate span{width:40%;animation:vebar 1.4s cubic-bezier(.4,0,.2,1) infinite}

.ves-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--e-line);background:var(--e-panel)}
.ves-title{flex:1;min-width:0}
.ves-title h2{margin:0;font:700 17px/1.2 var(--display,inherit);letter-spacing:-.01em}
.ves-title p{margin:2px 0 0;color:var(--e-muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ves-loading{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--e-sub)}

.ves-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(230px,280px) minmax(0,1fr) minmax(290px,340px);overflow:hidden}
.ves-queue{min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--e-line);background:var(--e-panel)}
.ves-queue-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 12px 8px}
.ves-queue-head h3{margin:0;font-size:12px;font-weight:700;color:var(--e-muted);text-transform:uppercase;letter-spacing:.06em}
.ves-queue-list{flex:1;min-height:0;overflow:auto;list-style:none;margin:0;padding:0 8px 8px;display:flex;flex-direction:column;gap:4px}
.ves-queue-list>li{position:relative;border:1px solid transparent;border-radius:10px}
.ves-queue-list>li:hover{background:var(--e-raised)}
.ves-queue-list>li.on{background:var(--e-sel-soft);border-color:color-mix(in srgb,var(--e-sel) 45%,transparent)}
.ves-job{display:flex;gap:10px;width:100%;padding:8px 10px;border:0;background:none;text-align:left;align-items:flex-start}
.ves-thumb{flex:none;width:56px;height:36px;border-radius:6px;background:var(--e-raised);display:grid;place-items:center;overflow:hidden;color:var(--e-muted)}
.ves-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ves-job-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ves-job-text b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ves-job-text small{font-size:11.5px;color:var(--e-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ves-job-status{display:flex;align-items:center;gap:8px;margin-top:3px}
.ves-job-status em{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:11px;color:var(--e-muted);font-variant-numeric:tabular-nums}
.ves-job-actions{position:absolute;top:7px;right:7px;display:flex;gap:4px;opacity:0;transition:opacity .15s}
.ves-queue-list>li:hover .ves-job-actions,.ves-queue-list>li.on .ves-job-actions,.ves-job-actions:focus-within{opacity:1}
.ves-add-more{margin:8px;min-height:38px;border:1px dashed var(--e-control);border-radius:10px;background:none;color:var(--e-sub);font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:7px}
.ves-add-more:hover{border-color:var(--e-sel);color:var(--e-text)}

.ves-main{min-width:0;min-height:0;overflow:auto;padding:16px}
.ves-view{display:flex;flex-direction:column;gap:12px;max-width:1100px;margin:0 auto}
.ves-noplayer{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;border:1px dashed var(--e-control);border-radius:12px;text-align:center;color:var(--e-sub)}
.ves-noplayer b{color:var(--e-text)}

.ve-player{display:flex;flex-direction:column;border:1px solid var(--e-line);border-radius:12px;background:var(--e-panel);overflow:hidden;outline:none}
.ve-player:focus-visible{box-shadow:0 0 0 2px var(--e-focus)}
.ve-player:fullscreen{border-radius:0;justify-content:center;background:#000}
.ve-player-frame{display:flex;justify-content:center;background:#000;padding:0}
.ve-stage{position:relative;width:min(100%,calc(min(62vh,640px) * var(--ratio,1.7778)));margin:0 auto;overflow:hidden;background:#000;touch-action:none;user-select:none}
.ve-player:fullscreen .ve-stage{width:min(100%,calc((100vh - 64px) * var(--ratio,1.7778)))}
.ve-stage[data-mode='split']{cursor:ew-resize}
.ve-pane{position:absolute;inset:0}
.ve-pane.hidden{visibility:hidden}
.ve-pane video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.ve-stage[data-mode='side']{display:grid;grid-template-columns:1fr 1fr;gap:2px}
.ve-stage[data-mode='side'] .ve-pane{position:relative;inset:auto}
.ve-fx{position:absolute;inset:0;pointer-events:none}
.ve-pane-label{position:absolute;top:10px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em;pointer-events:none}
.ve-pane-label.left{left:10px}
.ve-pane-label.right{right:10px}
.ve-divider{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--e-sel);box-shadow:0 0 0 1px rgba(0,0,0,.35);cursor:ew-resize}
.ve-divider span{position:absolute;top:50%;left:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:var(--e-sel);box-shadow:0 2px 10px rgba(0,0,0,.4)}
.ve-divider span:before,.ve-divider span:after{content:'';position:absolute;top:9px;border:5px solid transparent}
.ve-divider span:before{left:3px;border-right-color:var(--e-on-btn)}
.ve-divider span:after{right:3px;border-left-color:var(--e-on-btn)}
.ve-stage-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,.55);color:#fff;font-size:13px;text-align:center;padding:20px}
.ve-stage-overlay.bad{background:rgba(0,0,0,.78)}
.ve-transport{display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:1px solid var(--e-line);flex-wrap:wrap}
.ve-timecode{font:600 12px/1 'Geist Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--e-text);white-space:nowrap;padding:0 4px}
.ve-timecode em{font-style:normal;color:var(--e-muted)}
.ve-scrub{flex:1;min-width:120px;accent-color:var(--e-sel)}
.ve-rate{height:34px;border:1px solid var(--e-control);border-radius:9px;background:var(--e-raised);padding:0 6px;font-size:12px}
.ve-compare-modes{margin-left:auto}

.ves-banner{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid var(--e-line);border-radius:12px;background:var(--e-panel)}
.ves-banner>svg{flex:none;margin-top:2px}
.ves-banner>div:first-of-type{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ves-banner b{font-size:13.5px}
.ves-banner span{color:var(--e-sub);font-size:12.5px;line-height:1.5}
.ves-banner.info>svg{color:var(--e-sel)}
.ves-banner.active{border-color:color-mix(in srgb,var(--e-sel) 40%,transparent);background:var(--e-sel-soft)}
.ves-banner.active>svg{color:var(--e-on-sel)}
.ves-banner.good{border-color:color-mix(in srgb,var(--e-good) 40%,transparent);background:var(--e-good-bg)}
.ves-banner.good>svg{color:var(--e-good)}
.ves-banner.bad{border-color:color-mix(in srgb,var(--e-bad) 45%,transparent);background:var(--e-bad-bg)}
.ves-banner.bad>svg{color:var(--e-bad)}
.ves-banner-actions{display:flex;gap:8px;flex-wrap:wrap;align-self:center}

.ves-specs{display:grid;border:1px solid var(--e-line);border-radius:12px;overflow:hidden;background:var(--e-panel)}
.ves-specs>div{display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;padding:8px 14px;border-top:1px solid var(--e-line);font-size:12.5px}
.ves-specs>div:first-child{border-top:0}
.ves-specs>div.head{font-size:11px;font-weight:700;color:var(--e-muted);text-transform:uppercase;letter-spacing:.06em;background:var(--e-raised)}
.ves-specs [role=rowheader]{color:var(--e-muted)}
.ves-specs>div>span:not([role=rowheader]){font-variant-numeric:tabular-nums}
.ves-notes{margin:0;padding:0 0 0 18px;color:var(--e-muted);font-size:12px;line-height:1.7}

.ves-settings{min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--e-line);background:var(--e-panel)}
.ves-settings-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 14px 14px}
.ves-section{padding:12px 0;border-top:1px solid var(--e-line)}
.ves-section:first-of-type{border-top:0}
.ves-section header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.ves-section h3,.ves-advanced summary,.ves-advanced h4{margin:0;font-size:12px;font-weight:700;color:var(--e-muted);text-transform:uppercase;letter-spacing:.06em}
.ves-locked{display:flex;flex-direction:column;gap:8px;margin:10px 0 4px;padding:10px 12px;border-radius:10px;background:var(--e-raised);font-size:12.5px}
.ves-locked button{align-self:flex-start}
.ves-presets{display:grid;gap:6px}
.ves-preset{display:flex;flex-direction:column;gap:2px;padding:9px 11px;border:1px solid var(--e-control);border-radius:10px;background:var(--e-raised);text-align:left}
.ves-preset b{font-size:13px}
.ves-preset small{font-size:11.5px;color:var(--e-muted);line-height:1.4}
.ves-preset:hover:not(:disabled){background:var(--e-hover)}
.ves-preset.on{border-color:var(--e-sel);background:var(--e-sel-soft)}
.ves-preset.on b{color:var(--e-on-sel)}
.ves-chips{display:flex;flex-wrap:wrap;gap:6px}
.ve-slider{display:grid;grid-template-columns:92px minmax(0,1fr) 46px;align-items:center;gap:10px;margin-top:8px;font-size:12.5px;color:var(--e-sub)}
.ve-slider input{width:100%;accent-color:var(--e-sel)}
.ve-slider b{justify-self:end;font-variant-numeric:tabular-nums;color:var(--e-text);font-weight:600}
.ve-slider.is-disabled{opacity:.55}
.ves-advanced{padding:12px 0;border-top:1px solid var(--e-line)}
.ves-advanced summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:24px}
.ves-advanced summary::-webkit-details-marker{display:none}
.ves-advanced summary:after{content:'+';font-size:15px;color:var(--e-muted)}
.ves-advanced[open] summary:after{content:'−'}
.ves-advanced-body{display:flex;flex-direction:column}
.ves-advanced h4{margin-top:16px}
.ves-advanced-body>.ve-btn{align-self:flex-start;margin-top:12px}
.ves-output{margin:0;font-size:13px}
.ves-cta{flex:none;display:flex;flex-direction:column;gap:8px;padding:12px 14px 14px;border-top:1px solid var(--e-line);background:var(--e-panel)}
.ves-cost{display:flex;align-items:center;gap:10px}
.ves-cost small{color:var(--e-muted);font-size:11.5px;line-height:1.4}
.ves-short{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:9px;background:var(--e-credit-soft);color:var(--e-credit-ink);font-size:12px}

.ves-empty{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px}
.ves-empty-drop{width:min(640px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 24px;border:1.5px dashed var(--e-control);border-radius:16px;background:var(--e-panel);text-align:center}
.ves-empty-drop>svg{color:var(--e-sel)}
.ves-empty-drop h3{margin:4px 0 0;font:700 18px/1.25 var(--display,inherit)}
.ves-empty-drop p{margin:0;max-width:440px;color:var(--e-sub);font-size:13px}
.ves-empty-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.ves-steps{width:min(640px,100%);margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ves-steps li{display:flex;flex-direction:column;gap:4px;padding:12px;border:1px solid var(--e-line);border-radius:12px;background:var(--e-panel)}
.ves-steps b{font-size:12.5px}
.ves-steps span{font-size:12px;color:var(--e-muted);line-height:1.45}

.ves-drop-overlay{position:absolute;inset:8px;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed var(--e-sel);border-radius:16px;background:color-mix(in srgb,var(--e-bg) 86%,transparent);color:var(--e-text);pointer-events:none}
.ves-drop-overlay>svg{color:var(--e-sel)}
.ves-drop-overlay span{color:var(--e-sub);font-size:12.5px}
.ves-modal{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.5)}
.ves-modal-card{width:min(560px,100%);max-height:min(640px,90%);display:flex;flex-direction:column;border:1px solid var(--e-line);border-radius:16px;background:var(--e-panel);box-shadow:0 24px 72px rgba(0,0,0,.35);overflow:hidden}
.ves-modal-card>header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--e-line)}
.ves-modal-card h3{margin:0;font-size:15px}
.ves-modal-state{display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 20px;color:var(--e-sub);text-align:center;font-size:13px}
.ves-modal-state.bad{color:var(--e-bad)}
.ves-library{list-style:none;margin:0;padding:8px;overflow:auto;display:flex;flex-direction:column;gap:4px}
.ves-library button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:1px solid transparent;border-radius:10px;background:none;text-align:left}
.ves-library button:hover{background:var(--e-raised);border-color:var(--e-line)}
.ves-toasts{position:absolute;right:16px;bottom:16px;z-index:40;display:flex;flex-direction:column;gap:8px;max-width:min(420px,calc(100% - 32px))}
.ves-toast{display:flex;align-items:flex-start;gap:10px;padding:10px 10px 10px 14px;border:1px solid var(--e-line);border-radius:10px;background:var(--e-raised);box-shadow:0 12px 32px rgba(0,0,0,.25);font-size:12.5px;line-height:1.45}
.ves-toast span{flex:1}
.ves-toast.good{border-color:color-mix(in srgb,var(--e-good) 45%,transparent)}
.ves-toast.bad{border-color:color-mix(in srgb,var(--e-bad) 55%,transparent);color:var(--e-text)}

@container (max-width:1180px){
  .ves-body{grid-template-columns:minmax(220px,260px) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}
  .ves-settings{grid-column:1 / -1;border-left:0;border-top:1px solid var(--e-line);max-height:46vh}
}
@container (max-width:760px){
  .ves-head{flex-wrap:wrap;padding:10px 12px}
  .ves-title{flex-basis:100%}
  .ves-head .ve-btn{flex:1}
  .ves-body{display:flex;flex-direction:column;overflow:auto}
  .ves-main,.ves-settings,.ves-queue,.ves-settings-scroll{flex:none;min-height:auto}
  .ves-main{order:1;overflow:visible;padding:12px}
  .ves-settings{order:2;max-height:none;border-top:1px solid var(--e-line)}
  .ves-settings-scroll{overflow:visible}
  .ves-queue{order:3;border-right:0;border-top:1px solid var(--e-line)}
  .ves-queue-list{overflow:visible}
  .ves-job-actions{opacity:1;position:static;padding:0 10px 8px 76px}
  .ves-specs>div{grid-template-columns:92px 1fr 1fr;gap:8px;padding:8px 10px}
  .ves-steps{grid-template-columns:1fr}
  .ve-compare-modes{margin-left:0;width:100%;display:grid;grid-auto-flow:column;grid-auto-columns:1fr}
  .ve-scrub{order:10;flex-basis:100%}
  .hide-sm{display:none}
  .ves-banner{flex-wrap:wrap}
  .ves-toasts{left:12px;right:12px;bottom:12px;max-width:none}
}
@media (prefers-reduced-motion:reduce){.ves *{animation-duration:.001ms!important;transition-duration:.001ms!important}}
`;
