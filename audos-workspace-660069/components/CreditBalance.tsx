/**
 * CreditBalance — the customer's credit balance, always in view.
 *
 * Credits are the only meter in VidVerge (pay per use: real engine cost + 30%,
 * $0.15 per credit), so the number belongs in the shell chrome rather than
 * buried in Settings. Tapping it opens the pricing screen, which is also where
 * credit packs are bought and the usage history lives.
 *
 * It renders nothing at all until a balance is actually known: a visitor who
 * has not signed in yet has no wallet, and "0 credits" would be a lie.
 */
import { Coins } from 'lucide-react';
import { openPricing } from '../lib/plans';
import { creditsForSeconds, formatCreditBalance, formatCredits, useCredits } from '../lib/credits';

/** Below this the pill turns amber — not enough left for one 8-second clip on the default engine. */
const LOW_BALANCE = creditsForSeconds(8);

interface CreditBalanceProps {
  /**
   * 'chrome' = the desktop top bar pill, 'dock' = the compact mobile dock
   * button, 'text' = the quiet factual figure used in the shell header, where
   * a second loud pill next to Jobs would read as a badge cluster.
   */
  variant?: 'chrome' | 'dock' | 'text';
  className?: string;
}

export default function CreditBalance({ variant = 'chrome', className = '' }: CreditBalanceProps) {
  const { credits } = useCredits();
  if (!credits) return null;

  const low = !credits.unlimited && credits.balance < LOW_BALANCE;
  const balanceLabel = formatCreditBalance(credits);
  const title = credits.unlimited
    ? 'Unlimited owner access — video generation does not deduct credits.'
    : low
      ? `${formatCredits(credits.balance)} credits left — not enough for an 8-second clip. Tap to buy a credit pack.`
      : `${formatCredits(credits.balance)} credits ($0.15 each) — tap for prices and your usage history`;

  if (variant === 'text') {
    return (
      <button
        onClick={() => openPricing('nav')}
        title={title}
        className={`flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13px] transition-colors hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] ${className}`}
        data-testid="button-credit-balance-text"
        data-credit-balance={credits.balance}
      >
        <Coins
          className="h-4 w-4 shrink-0"
          style={{ color: low ? 'var(--space-semantic-danger-500)' : 'var(--vg-credit)' }}
          aria-hidden="true"
        />
        <span
          className="font-semibold"
          style={{ color: low ? 'var(--space-semantic-danger-500)' : 'var(--vg-credit-ink)' }}
        >
          {balanceLabel}
        </span>
        {!credits.unlimited ? (
          <span className="hidden font-medium text-[var(--space-text-muted)] sm:inline">
            {low ? 'credits left' : 'credits'}
          </span>
        ) : null}
      </button>
    );
  }

  if (variant === 'dock') {
    return (
      <button
        onClick={() => openPricing('nav')}
        aria-label={title}
        title={title}
        className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-bold transition-all ${className}`}
        style={{
          color: low ? 'var(--space-semantic-danger-500)' : 'var(--vg-credit-ink)',
          background: 'var(--vg-credit-soft)',
          border: low ? '1px solid color-mix(in srgb, var(--space-semantic-danger-500) 45%, transparent)' : '1px solid color-mix(in srgb, var(--vg-credit) 38%, transparent)',
        }}
        data-testid="button-credit-balance-mobile"
        data-credit-balance={credits.balance}
      >
        <Coins className="w-4 h-4" />
        {balanceLabel}
      </button>
    );
  }

  return (
    <button
      onClick={() => openPricing('nav')}
      title={title}
      className={`flex min-h-11 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition-all hover:scale-105 ${className}`}
      style={{
        color: low ? 'var(--space-semantic-danger-500)' : 'var(--vg-credit-ink)',
        background: 'var(--vg-credit-soft)',
        border: low ? '1px solid color-mix(in srgb, var(--space-semantic-danger-500) 45%, transparent)' : '1px solid color-mix(in srgb, var(--vg-credit) 38%, transparent)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.16)',
      }}
      data-testid="button-credit-balance"
      data-credit-balance={credits.balance}
    >
      <Coins className="w-4 h-4" />
      {balanceLabel}
      {!credits.unlimited ? (
        <span style={{ color: low ? 'var(--space-semantic-danger-500)' : 'var(--vg-credit-ink)', fontWeight: 500 }}>
          {low ? 'left — top up' : 'credits'}
        </span>
      ) : null}
    </button>
  );
}
