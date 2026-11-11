/**
 * The only 3D Scene Builder file the Lab imports up front. It holds nothing
 * but a lazy() boundary: the builder UI, the scene model and the three.js
 * engine load when this tab first opens, and a failure anywhere inside them
 * is contained here instead of taking the Lab's other modes down with it.
 */
import { Component, Suspense, lazy, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SceneHandoff } from './sceneModel';
import { COLORS, FONT } from '../../../components/theme';

export type { SceneHandoff };

export interface Scene3DModeProps {
  onSendToLab: (handoff: SceneHandoff) => void;
  activeModelName: string;
}

interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

class SceneBoundary extends Component<BoundaryProps, { error: Error | null }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[video-provider-lab] 3D Scene Builder crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ margin: 'auto', maxWidth: 440, padding: 24, textAlign: 'center', color: COLORS.text, fontFamily: FONT.body }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>The 3D Scene Builder stopped</div>
        <p style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.6, margin: '8px 0 14px' }}>
          {`${this.state.error.message || 'Something went wrong.'} Your scene is kept on this device. The Generate tab is unaffected.`}
        </p>
        <button
          type="button"
          onClick={this.props.onRetry}
          style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: COLORS.accent, color: COLORS.onAccent, fontWeight: 700, cursor: 'pointer' }}
        >
          Reload the 3D builder
        </button>
      </div>
    );
  }
}

function Loading() {
  return (
    <div style={{ margin: 'auto', textAlign: 'center', color: COLORS.textMuted, fontFamily: FONT.body, fontSize: 12.5 }}>
      Opening the 3D Scene Builder…
    </div>
  );
}

export default function Scene3DMode(props: Scene3DModeProps) {
  const [attempt, setAttempt] = useState(0);
  // A rejected lazy() import is cached for good, so a retry needs a fresh one.
  const Builder = useMemo(() => lazy(() => import('./SceneBuilder3D')), [attempt]);
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', background: COLORS.bg }}>
      <SceneBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)}>
        <Suspense fallback={<Loading />}>
          <Builder {...props} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
