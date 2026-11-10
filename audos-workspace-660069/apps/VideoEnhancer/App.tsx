import { Component, Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Bot, Film, RefreshCw, Wand2 } from 'lucide-react';
import AppShell from '../../components/ui/AppShell';
import BrandContextLayer from '../../components/BrandContextLayer';
import EditorApp from './EditorApp';
import EnhanceStudio from './enhance/EnhanceStudio';
import AgentStudio from './agent/AgentStudio';

type View = 'agent' | 'enhance' | 'editor';
const VIEW_KEY = 'video-enhancer:view:v2';

const TABS_CSS = `
.veh-root{position:absolute;inset:0;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--vg-bg);color:var(--vg-text)}
.veh-tabs{flex:none;display:flex;align-items:center;gap:4px;padding:6px 12px;border-bottom:1px solid var(--vg-border);background:var(--vg-surface)}
.veh-tabs button{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 14px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--vg-secondary);font:600 13px/1 var(--body,inherit);cursor:pointer}
.veh-tabs button:hover{color:var(--vg-text);background:var(--vg-raised)}
.veh-tabs button[aria-selected='true']{color:var(--vg-on-selected);background:var(--vg-selected-soft);border-color:color-mix(in srgb,var(--vg-selected) 45%,transparent)}
.veh-tabs button:focus-visible{outline:2px solid var(--vg-focus);outline-offset:2px}
.veh-tabs small{margin-left:auto;color:var(--vg-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.veh-view{flex:1;min-height:0;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
.veh-view>*{flex:1;min-height:0}
#veh-panel-editor,#veh-panel-agent{overflow:hidden}
.veh-view[hidden]{display:none}
@media (max-width:560px){.veh-tabs small{display:none}.veh-tabs button{flex:1;justify-content:center;padding:0 8px}}
`;

const TAB_HINTS: Record<View, string> = {
  agent: 'Describe the edit — the agent plans it, runs it and lets you undo any step',
  enhance: 'Colour correction, restoration and 1080p remastering',
  editor: 'Timeline editing, captions, B-roll and export',
};

class AppBoundary extends Component<{ label: string; children?: ReactNode }, { error: Error | null; nonce: number }> {
  state = { error: null as Error | null, nonce: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[VideoEnhancer] ${this.props.label} crash:`, error, info);
  }

  reset = () => this.setState((state) => ({ error: null, nonce: state.nonce + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: 520, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--vg-bg)', color: 'var(--vg-text)', fontFamily: 'var(--body)' }}>
          <div style={{ width: 'min(440px,100%)', padding: 24, border: '1px solid var(--vg-control-border)', borderRadius: 'var(--vg-radius-dialog)', background: 'var(--vg-surface)', textAlign: 'center' }}>
            <AlertCircle size={30} color="var(--vg-danger)" />
            <h2>The {this.props.label} needs to restart</h2>
            <p style={{ color: 'var(--vg-secondary)', lineHeight: 1.6 }}>Your autosaved work and server-side jobs are safe.</p>
            <button type="button" onClick={this.reset} style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 'var(--vg-radius-control)', background: 'var(--vg-btn)', color: 'var(--vg-on-btn)', fontWeight: 800, cursor: 'pointer' }}>
              <RefreshCw size={15} style={{ marginRight: 7, verticalAlign: 'middle' }} /> Reopen {this.props.label}
            </button>
          </div>
        </div>
      );
    }
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}

function readView(): View {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return stored === 'editor' || stored === 'enhance' ? stored : 'agent';
  } catch {
    return 'agent';
  }
}

function App() {
  const [view, setView] = useState<View>(readView);
  const [editorMounted, setEditorMounted] = useState(view === 'editor');
  const [agentMounted, setAgentMounted] = useState(view === 'agent');

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
    if (view === 'editor') setEditorMounted(true);
    if (view === 'agent') setAgentMounted(true);
  }, [view]);

  return (
    <AppShell title="Video Enhancer" header={false} watermark={false} scroll={false} maxWidth="full" padding={0}>
      <div className="veh-root">
        <style>{TABS_CSS}</style>
        <nav className="veh-tabs" role="tablist" aria-label="Video Enhancer">
          <button type="button" role="tab" id="veh-tab-agent" aria-controls="veh-panel-agent" aria-selected={view === 'agent'} onClick={() => setView('agent')}><Bot size={15} />Agent</button>
          <button type="button" role="tab" id="veh-tab-enhance" aria-controls="veh-panel-enhance" aria-selected={view === 'enhance'} onClick={() => setView('enhance')}><Wand2 size={15} />Enhance</button>
          <button type="button" role="tab" id="veh-tab-editor" aria-controls="veh-panel-editor" aria-selected={view === 'editor'} onClick={() => setView('editor')}><Film size={15} />Editor</button>
          <small>{TAB_HINTS[view]}</small>
        </nav>
        {agentMounted ? (
          <div className="veh-view" id="veh-panel-agent" role="tabpanel" aria-labelledby="veh-tab-agent" hidden={view !== 'agent'}>
            <AppBoundary label="agent"><AgentStudio /></AppBoundary>
          </div>
        ) : null}
        <div className="veh-view" id="veh-panel-enhance" role="tabpanel" aria-labelledby="veh-tab-enhance" hidden={view !== 'enhance'}>
          <AppBoundary label="enhancer"><EnhanceStudio /></AppBoundary>
        </div>
        {editorMounted ? (
          <div className="veh-view" id="veh-panel-editor" role="tabpanel" aria-labelledby="veh-tab-editor" hidden={view !== 'editor'}>
            <AppBoundary label="editor"><EditorApp active={view === 'editor'} /></AppBoundary>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

// The app window's wrappers have no definite height, so a `height:100%` root
// would size to its content and the whole editor would page-scroll. Anchoring
// to the window's positioned content area keeps the editor exactly viewport
// sized; only its panel and timeline scroll inside it.
function VideoEnhancerApp() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <App />
      <BrandContextLayer />
    </div>
  );
}

export default VideoEnhancerApp;
