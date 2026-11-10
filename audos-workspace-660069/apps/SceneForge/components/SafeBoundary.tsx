/**
 * SceneForge — error boundary for previews and panels. A crash inside the
 * wrapped panel never shows a stack trace, file name or generated code: the
 * technical detail goes to the console and the panel shows a short message
 * with a Retry button that remounts it.
 */
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { GOLD_BUTTON_BG } from './StagePreviews';
import { SCENE_RENDER_FALLBACK, logErrorDetails } from '../lib/safeError';

interface SafeBoundaryProps {
  children: ReactNode;
  /** Console label for the wrapped panel. */
  label?: string;
  /** Customer-facing copy; defaults to the scene-render message. */
  message?: string;
  onRetry?: () => void;
}

interface SafeBoundaryState {
  failed: boolean;
  attempt: number;
}

export default class SafeBoundary extends Component<SafeBoundaryProps, SafeBoundaryState> {
  constructor(props: SafeBoundaryProps) {
    super(props);
    this.state = { failed: false, attempt: 0 };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(): Partial<SafeBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const label = this.props.label || 'panel';
    logErrorDetails(`${label} crashed`, error);
    if (info && info.componentStack) logErrorDetails(`${label} component stack`, info.componentStack);
  }

  retry() {
    this.setState((state) => ({ failed: false, attempt: state.attempt + 1 }));
    try {
      this.props.onRetry?.();
    } catch (error) {
      logErrorDetails('retry failed', error);
    }
  }

  render() {
    if (!this.state.failed) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    return (
      <div role="alert" style={{ alignItems: 'center', background: COLORS.warningBg, border: 'none', borderRadius: RADIUS.card, color: COLORS.text, display: 'flex', flexWrap: 'wrap', fontSize: 13, gap: 10, lineHeight: '19px', padding: '12px 14px' }} data-testid="sceneforge-safe-boundary">
        <AlertTriangle size={16} color={COLORS.warning} style={{ flex: '0 0 auto' }} />
        <span style={{ flex: 1, minWidth: 200 }}>{this.props.message || SCENE_RENDER_FALLBACK}</span>
        <button type="button" onClick={this.retry} style={{ alignItems: 'center', background: GOLD_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 6, minHeight: 40, padding: '0 14px' }} data-testid="button-safe-boundary-retry">
          <RotateCcw size={14} /> Retry
        </button>
      </div>
    );
  }
}
