/**
 * CreditConfirmDialog — mounted once by the shell. Before any browser-side paid
 * generation spends credits, `authorizeCredits` (lib/credits.ts) asks this
 * dialog to show what it will cost and the current balance, and waits for the
 * customer. Text and image generation never reach it: they are free.
 */
import { useEffect, useState } from 'react';
import { Coins, X } from 'lucide-react';
import { CREDIT_CONFIRM_EVENT, formatCredits, packCreditsFor, registerCreditConfirmHost } from '../lib/credits';
import type { CreditConfirmRequest } from '../lib/credits';
import { openPricing } from '../lib/plans';
import { formatUsd } from '../lib/pricing';

export default function CreditConfirmDialog() {
  const [queue, setQueue] = useState<CreditConfirmRequest[]>([]);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const unregister = registerCreditConfirmHost();
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<CreditConfirmRequest>).detail;
      if (detail && typeof detail.respond === 'function') setQueue((prev) => [...prev, detail]);
    };
    window.addEventListener(CREDIT_CONFIRM_EVENT, onRequest);
    return () => {
      unregister();
      window.removeEventListener(CREDIT_CONFIRM_EVENT, onRequest);
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const { quote, label, balance } = current;
  const after = balance == null ? null : balance - quote.credits;
  const short = after != null && after < 0;
  const lines = quote.lines.filter((line) => line.priced && line.usd > 0);

  const settle = (approved: boolean) => {
    const rememberSource = approved && remember;
    current.respond(approved, rememberSource);
    setRemember(false);
    setQueue((prev) => {
      const rest = prev.slice(1);
      if (!rememberSource) return rest;
      rest.filter((item) => item.source === current.source).forEach((item) => item.respond(true, true));
      return rest.filter((item) => item.source !== current.source);
    });
  };

  const buy = () => {
    settle(false);
    openPricing('credits', { required: quote.credits, balance: balance ?? 0, seconds: quote.seconds, label });
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" role="presentation" data-testid="credit-confirm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-confirm-title"
        className="w-full max-w-[420px] rounded-2xl border p-5 shadow-2xl"
        style={{ background: 'var(--space-surface-panel-strong)', borderColor: 'var(--space-border-default)', color: 'var(--space-text-primary)' }}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--space-surface-accent-soft)]">
            <Coins className="h-4 w-4 text-[var(--space-text-brand)]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="credit-confirm-title" className="m-0 text-base font-semibold">
              Use {formatCredits(quote.credits)} credit{quote.credits === 1 ? '' : 's'}?
            </h2>
            <p className="m-0 mt-1 text-sm text-[var(--space-text-secondary)]">{label}</p>
          </div>
          <button
            type="button"
            onClick={() => settle(false)}
            className="rounded p-1 text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)]"
            aria-label="Cancel"
            data-testid="button-credit-confirm-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="m-0 mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3 text-sm">
          <dt className="text-[var(--space-text-secondary)]">This generation</dt>
          <dd className="m-0 text-right font-semibold" data-testid="text-credit-confirm-cost">{formatCredits(quote.credits)} credits</dd>
          <dt className="text-[var(--space-text-secondary)]">Your balance</dt>
          <dd className="m-0 text-right" data-testid="text-credit-confirm-balance">{balance == null ? '—' : `${formatCredits(balance)} credits`}</dd>
          <dt className="text-[var(--space-text-secondary)]">Balance after</dt>
          <dd
            className="m-0 text-right font-semibold"
            style={{ color: short ? 'var(--space-semantic-danger-500)' : 'var(--space-text-primary)' }}
            data-testid="text-credit-confirm-after"
          >
            {after == null ? '—' : short ? `${formatCredits(-after)} short` : `${formatCredits(after)} credits`}
          </dd>
        </dl>

        {lines.length > 1 ? (
          <ul className="m-0 mt-3 list-none space-y-1 p-0 text-xs text-[var(--space-text-muted)]">
            {lines.map((line, index) => (
              <li key={`${line.label}-${index}`} className="flex justify-between gap-3">
                <span>{line.label}</span>
                <span>{formatUsd(line.usd)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="m-0 mt-3 text-xs text-[var(--space-text-muted)]">
          Real engine cost {formatUsd(quote.costUsd)} + 30%, in $0.15 credits. Credits are refunded automatically if the generation fails.
        </p>

        {short ? null : (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--space-text-secondary)]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 accent-[var(--space-brand-primary-500)]"
              data-testid="checkbox-credit-confirm-remember"
            />
            Don't ask again in this studio for 15 minutes
          </label>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => settle(false)}
            className="min-h-11 rounded-[10px] border border-[var(--space-border-default)] px-4 text-sm text-[var(--space-text-primary)] hover:bg-[var(--space-surface-card-hover)]"
            data-testid="button-credit-confirm-cancel"
          >
            Cancel
          </button>
          {short ? (
            <button
              type="button"
              onClick={buy}
              className="min-h-11 rounded-[10px] bg-[var(--space-brand-primary-500)] px-4 text-sm font-semibold text-[var(--space-text-on-primary)] hover:bg-[var(--space-brand-primary-600)]"
              data-testid="button-credit-confirm-buy"
            >
              Buy {formatCredits(packCreditsFor(-(after ?? 0)))} credits
            </button>
          ) : (
            <button
              type="button"
              onClick={() => settle(true)}
              className="min-h-11 rounded-[10px] bg-[var(--space-brand-primary-500)] px-4 text-sm font-semibold text-[var(--space-text-on-primary)] hover:bg-[var(--space-brand-primary-600)]"
              data-testid="button-credit-confirm-approve"
              autoFocus
            >
              Use {formatCredits(quote.credits)} credit{quote.credits === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
