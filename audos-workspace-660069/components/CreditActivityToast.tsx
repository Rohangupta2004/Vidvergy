/**
 * CreditActivityToast — mounted once by the shell. Whenever any app charges or
 * refunds credits it shows exactly what moved and the new balance, so every
 * generate screen reports the deduction without wiring its own UI.
 */
import { useEffect, useState } from 'react';
import { Coins, RotateCcw, X } from 'lucide-react';
import { CREDITS_CHARGED_EVENT, CREDITS_REFUNDED_EVENT, formatCredits } from '../lib/credits';
import type { CreditsChargedDetail } from '../lib/credits';

interface Notice {
  id: number;
  kind: 'charge' | 'refund';
  text: string;
  balance: number | null;
}

let seq = 0;

export default function CreditActivityToast() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const push = (notice: Omit<Notice, 'id'>) => {
      const id = ++seq;
      setNotices((prev) => [...prev.slice(-2), { ...notice, id }]);
      window.setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 7000);
    };
    const onCharge = (event: Event) => {
      const d = (event as CustomEvent<CreditsChargedDetail>).detail;
      if (!d || d.unlimited) return;
      if (!d.charged && !d.unpriced) return;
      push({
        kind: 'charge',
        text: d.charged
          ? `−${formatCredits(d.charged)} credit${d.charged === 1 ? '' : 's'} · ${d.label}`
          : `${d.label} · not charged`,
        balance: d.balanceAfter,
      });
    };
    const onRefund = (event: Event) => {
      const d = (event as CustomEvent<{ refunded: number; balanceAfter: number | null }>).detail;
      if (!d || !d.refunded) return;
      push({ kind: 'refund', text: `+${formatCredits(d.refunded)} credit${d.refunded === 1 ? '' : 's'} refunded — the generation failed`, balance: d.balanceAfter });
    };
    window.addEventListener(CREDITS_CHARGED_EVENT, onCharge);
    window.addEventListener(CREDITS_REFUNDED_EVENT, onRefund);
    return () => {
      window.removeEventListener(CREDITS_CHARGED_EVENT, onCharge);
      window.removeEventListener(CREDITS_REFUNDED_EVENT, onRefund);
    };
  }, []);

  if (!notices.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[210] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite" data-testid="credit-activity">
      {notices.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg"
          style={{
            background: 'var(--space-surface-panel-strong)',
            borderColor: n.kind === 'refund'
              ? 'color-mix(in srgb, var(--space-semantic-success-500) 45%, transparent)'
              : 'color-mix(in srgb, var(--space-brand-primary-500) 40%, transparent)',
            color: 'var(--space-text-primary)',
          }}
          data-testid={`credit-activity-${n.kind}`}
        >
          {n.kind === 'refund'
            ? <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-[var(--space-semantic-success-500)]" aria-hidden="true" />
            : <Coins className="mt-0.5 h-4 w-4 shrink-0 text-[var(--space-text-brand)]" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className="m-0 font-medium leading-snug">{n.text}</p>
            {n.balance !== null ? (
              <p className="m-0 mt-0.5 text-xs text-[var(--space-text-muted)]">New balance: {formatCredits(n.balance)} credits</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
            className="rounded p-0.5 text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)]"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
