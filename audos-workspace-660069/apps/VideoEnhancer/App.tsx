import { Component, Fragment } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import AppShell from '../../components/ui/AppShell';
import { withBrandContext } from '../../components/BrandContextLayer';
import EditorApp from './EditorApp';

class EditorBoundary extends Component<{ children?: ReactNode }, { error: Error | null; nonce: number }> {
  state = { error: null as Error | null, nonce: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[VideoEnhancer] editor crash:', error, info);
  }

  reset = () => this.setState((state) => ({ error: null, nonce: state.nonce + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: 520, display: 'grid', placeItems: 'center', padding: 24, background: '#0e0f11', color: '#f2f3f5', fontFamily: "Manrope, 'Segoe UI', system-ui, sans-serif" }}> 
          <div style={{ width: 'min(440px,100%)', padding: 24, border: '1px solid #2a2e34', borderRadius: 16, background: '#15171a', textAlign: 'center' }}> 
            <AlertCircle size={30} color="#FF9A9A" />
            <h2>The editor needs to restart</h2>
            <p style={{ color: '#B7BBC4', lineHeight: 1.6 }}>Your autosaved project and server jobs are safe.</p>
            <button type="button" onClick={this.reset} style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 10, background: '#f2b544', color: '#21180a', fontWeight: 800, cursor: 'pointer' }}>
              <RefreshCw size={15} style={{ marginRight: 7, verticalAlign: 'middle' }} /> Reopen editor
            </button>
          </div>
        </div>
      );
    }
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}

function App() {
  return (
    <AppShell title="Video Enhancer" header={false} watermark={false} scroll={false} maxWidth="full" padding={0}>
      <EditorBoundary><EditorApp /></EditorBoundary>
    </AppShell>
  );
}

export default withBrandContext(App, 'Video Enhancer');
