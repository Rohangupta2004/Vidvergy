/**
 * CreditQuote — the line every generate screen shows before the customer
 * presses Generate: what this generation costs in credits and their current
 * balance. Uses the same rate card the wallet charges (lib/pricing.ts).
 */
import { Coins } from 'lucide-react';
import { formatCreditBalance, formatCredits, useCredits } from '../lib/credits';
import { quote, quoteJob } from '../lib/pricing';
import type { QuoteOptions } from '../lib/pricing';

interface CreditQuoteProps {
  engine?: string;
  options?: QuoteOptions;
  /** A multi-engine job priced once (e.g. avatar + B-roll + render). */
  items?: Array<{ engine: string; options?: QuoteOptions }>;
  label?: string;
  className?: string;
}

export default function CreditQuote({ engine, options = {}, items, label, className = '' }: CreditQuoteProps) {
  const { credits } = useCredits();
  const q = items && items.length ? quoteJob(items, label) : quote(engine, options);
  const short = credits && !credits.unlimited && q.credits > credits.balance;
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${className}`}
      style={{
        borderColor: short ? 'color-mix(in srgb, var(--space-semantic-danger-500) 45%, transparent)' : 'var(--space-border-default)',
        background: 'var(--space-surface-panel)',
        color: 'var(--space-text-secondary)',
      }}
      data-testid="credit-quote"
      data-credits={q.credits}
    >
      <Coins className="h-3.5 w-3.5 shrink-0 text-[var(--space-text-brand)]" aria-hidden="true" />
      <span>
        <strong className="text-[var(--space-text-primary)]">
          {q.free ? 'Free' : q.credits ? `${formatCredits(q.credits)} credit${q.credits === 1 ? '' : 's'}` : 'Not charged'}
        </strong>
        {' '}· {label || q.label}
        {q.seconds ? ` · ${Math.round(q.seconds)}s` : ''}
      </span>
      {credits ? (
        <span style={{ color: short ? 'var(--space-semantic-danger-500)' : undefined }}>
          · balance {formatCreditBalance(credits)}
          {short ? ` — ${formatCredits(q.credits - credits.balance)} short` : ''}
        </span>
      ) : null}
    </div>
  );
}
