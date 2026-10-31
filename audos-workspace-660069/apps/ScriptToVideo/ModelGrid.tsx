/**
 * MODEL GRID — the card grid the Script-to-Video Create and Plan surfaces use
 * to pick a video model. One component keeps the model name, accepted inputs,
 * capability facts and unavailable reason consistent across the main flow.
 *
 * An unavailable model is kept VISIBLE and greyed out rather than hidden: the
 * roster is part of how the product explains itself, and a model that silently
 * disappears reads as a missing feature. It carries an "Unavailable" badge and
 * its real reason, so nobody has to guess whether it is broken or just not
 * connected yet.
 */
import { Check, Lock, Zap } from 'lucide-react';
import { T } from './api';

export interface ModelGridOption {
  id: string;
  label: string;
  /** Provider/family word shown above the name ("Runway", "Seedance", …). */
  family?: string;
  /** One line of what the model is good for. */
  blurb?: string;
  /** Small line under the name — accepted inputs, price, clip length. */
  meta?: string;
  /** Corner badge: 'Fast' | 'Cinematic' | 'Default' … */
  badge?: string;
  available: boolean;
  /** Shown in the tooltip and under the name when the model is disabled. */
  unavailableReason?: string;
}

export default function ModelGrid(props: {
  options: ModelGridOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Tighter cards for the composer strip. */
  compact?: boolean;
}) {
  const { options, value, onChange, disabled, compact } = props;
  const minWidth = compact ? 158 : 196;

  return (
    <div
      role="radiogroup"
      aria-label="Video model"
      style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 9 }}
    >
      {options.map((option) => {
        const active = option.id === value;
        const locked = !option.available;
        const clickable = !locked && !disabled;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={locked || disabled || undefined}
            disabled={locked || disabled}
            title={locked ? (option.unavailableReason || `${option.label} is not available right now.`) : (option.blurb || option.label)}
            onClick={() => { if (clickable) onChange(option.id); }}
            className={clickable ? 's2v-lift' : undefined}
            style={{
              position: 'relative',
              minHeight: compact ? 92 : 112,
              minWidth: 0,
              overflowWrap: 'anywhere',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 3,
              textAlign: 'left',
              background: active
                ? 'linear-gradient(160deg, color-mix(in srgb, var(--space-brand-primary-500) 20%, var(--space-surface-card)), color-mix(in srgb, var(--space-brand-primary-500) 6%, var(--space-surface-card)))'
                : T.card,
              border: `1px solid ${active ? T.live : T.line}`,
              boxShadow: active ? '0 0 0 1px color-mix(in srgb, var(--space-brand-primary-500) 45%, transparent), 0 4px 24px color-mix(in srgb, var(--space-text-primary) 18%, transparent)' : 'none',
              borderRadius: 12,
              padding: compact ? '10px 12px' : '12px 14px',
              cursor: clickable ? 'pointer' : 'not-allowed',
              // Greyed out, but not so far down that the name stops being readable.
              opacity: locked ? 0.5 : 1,
              filter: locked ? 'grayscale(0.85)' : 'none',
              transition: 'border-color .16s ease, box-shadow .16s ease, opacity .16s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span style={{ color: active ? T.live : T.dim, fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}> 
                {option.family || 'Model'}
              </span>
              {option.badge && !locked ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.4, border: `1px solid ${T.line}`, borderRadius: 999, padding: '2px 7px' }}> 
                  {option.badge === 'Fast' ? <Zap size={8} /> : null}{option.badge}
                </span>
              ) : null}
              {locked ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', color: T.fault, fontSize: 12, fontWeight: 800, letterSpacing: 0.4, border: `1px solid ${T.fault}`, borderRadius: 999, padding: '2px 7px' }}> 
                  Unavailable
                </span>
              ) : null}
              <span style={{ marginLeft: 'auto', color: active ? T.live : 'transparent', display: 'flex' }}>
                {locked ? <Lock size={12} color={T.dim} /> : <Check size={13} />}
              </span>
            </div>
            <div style={{ color: active ? T.bone : T.muted, fontSize: compact ? 13 : 13.5, fontWeight: 700, letterSpacing: -0.1 }}>
              {option.label}
            </div>
            {option.meta ? (
              <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.45 }}>{option.meta}</div>
            ) : null}
            {!compact && option.blurb && !locked ? (
              <div style={{ color: T.dim, fontSize: 12, lineHeight: 1.5 }}>{option.blurb}</div>
            ) : null}
            {/* The real reason, not a generic stand-in: "not connected yet" and
                "refused upstream" lead to different next steps. */}
            {locked && option.unavailableReason ? (
              <div style={{ color: T.fault, fontSize: 12, lineHeight: 1.45 }}>{option.unavailableReason}</div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
