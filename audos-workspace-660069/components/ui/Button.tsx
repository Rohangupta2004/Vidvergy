import React from 'react';
import { COLORS, RADIUS } from '../theme';

/**
 * Vidverge button. Four variants, three sizes, optional inline spinner.
 * Renders a real <button> so forms and keyboard access keep working.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to the full width of the parent. */
  block?: boolean;
  /** Leading glyph (inline SVG or unicode mark). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const SIZES: Record<ButtonSize, { padding: string; font: number; height: number; radius: number }> = {
  sm: { padding: '0 12px', font: 14, height: 44, radius: RADIUS.sm },
  md: { padding: '0 18px', font: 14, height: 44, radius: RADIUS.md },
  lg: { padding: '0 24px', font: 16, height: 52, radius: RADIUS.md },
};

export const Spinner: React.FC<{ size?: number; color?: string }> = function Spinner({
  size = 14,
  color = 'currentColor',
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.25)',
        borderTopColor: color,
        animation: 'spin 700ms linear infinite',
        flex: '0 0 auto',
      }}
    />
  );
};

const Button: React.FC<ButtonProps> = function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  children,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const dims = SIZES[size];
  const off = Boolean(disabled) || loading;

  let visual: React.CSSProperties;
  if (variant === 'primary') {
    visual = {
      background: off ? COLORS.btn : pressed ? COLORS.btnPressed : hover ? COLORS.btnHover : COLORS.btn,
      color: COLORS.onBtn,
      border: '1px solid transparent',
      boxShadow: hover && !off ? '0 10px 30px rgba(0,0,0,0.20)' : '0 8px 24px rgba(0,0,0,0.16)',
      fontWeight: 600,
    };
  } else if (variant === 'secondary') {
    visual = {
      background: hover && !off ? COLORS.goldTint : 'transparent',
      color: hover && !off ? COLORS.accentHover : COLORS.accent,
      border: '1px solid ' + (hover && !off ? COLORS.accentHover : COLORS.accent),
      boxShadow: 'none',
      fontWeight: 600,
    };
  } else if (variant === 'danger') {
    visual = {
      background: COLORS.dangerBg,
      color: COLORS.danger,
      border: '1px solid ' + COLORS.danger,
      boxShadow: 'none',
      fontWeight: 600,
    };
  } else {
    visual = {
      background: 'transparent',
      color: hover && !off ? COLORS.accent : COLORS.text,
      border: '1px solid transparent',
      boxShadow: 'none',
      fontWeight: 500,
    };
  }

  return (
    <button
      type={rest.type || 'button'}
      disabled={off}
      onMouseEnter={function onEnter(e) {
        setHover(true);
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={function onLeave(e) {
        setHover(false);
        setPressed(false);
        if (onMouseLeave) onMouseLeave(e);
      }}
      onMouseDown={function onDown(e) {
        setPressed(true);
        if (onMouseDown) onMouseDown(e);
      }}
      onMouseUp={function onUp(e) {
        setPressed(false);
        if (onMouseUp) onMouseUp(e);
      }}
      {...rest}
      style={{
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: dims.height,
        padding: dims.padding,
        fontSize: dims.font,
        fontFamily: "'Manrope', 'Segoe UI', sans-serif",
        letterSpacing: 0,
        borderRadius: dims.radius,
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.55 : 1,
        transition: 'background 180ms cubic-bezier(.2,0,0,1), border-color 180ms cubic-bezier(.2,0,0,1), color 180ms cubic-bezier(.2,0,0,1), box-shadow 180ms cubic-bezier(.2,0,0,1), transform 180ms cubic-bezier(.2,0,0,1)',
        transform: 'none',
        whiteSpace: 'nowrap',
        ...visual,
        ...style,
      }}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      {children}
    </button>
  );
};

export default Button;
