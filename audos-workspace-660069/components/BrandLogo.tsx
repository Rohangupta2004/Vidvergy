import type { CSSProperties } from 'react';

/** Canonical Vidverge logo image from the workspace brand assets. */
export const VIDVERGE_LOGO_IMAGE_URL =
  'https://storage.googleapis.com/audos-images/chat-attachments/8a9adad1-ad34-40e6-823c-8195cdcf7d6c.png';

export interface BrandLogoProps {
  /** Width of the mark in px. */
  size?: number;
  /** 'mark' is the image alone; 'lockup' adds the Vidverge wordmark beside it. */
  variant?: 'mark' | 'lockup';
  /** Tagline under the wordmark. Lockup only. */
  tagline?: string;
  /** Kept for call-site compatibility; the real image supplies its own finish. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function BrandLogo({
  size = 120,
  variant = 'mark',
  tagline,
  className,
  style,
}: BrandLogoProps) {
  const mark = (
    <img
      src={VIDVERGE_LOGO_IMAGE_URL}
      alt={variant === 'mark' ? 'Vidverge' : ''}
      width={size}
      height={Math.round(size * 0.6)}
      draggable={false}
      style={{
        display: 'block',
        width: size,
        height: Math.round(size * 0.6),
        objectFit: 'contain',
        flex: '0 0 auto',
      }}
    />
  );

  if (variant === 'mark') {
    return (
      <span className={className} style={{ display: 'inline-flex', ...style }}>
        {mark}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.1),
        ...style,
      }}
    >
      {mark}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: Math.round(size * 0.26),
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: 'var(--space-text-primary, #FFFFFF)',
            whiteSpace: 'nowrap',
          }}
        >
          Vidverge
        </span>
        {tagline ? (
          <span
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: Math.max(10, Math.round(size * 0.1)),
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--space-text-muted, #8A8A8A)',
              whiteSpace: 'nowrap',
            }}
          >
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
