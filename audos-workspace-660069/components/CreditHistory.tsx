/**
 * CreditHistory — the signed-in wallet's usage history: what was generated,
 * credits used (or refunded / added) and the balance after each movement.
 * Shared by the pricing screen and Settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import {
  CREDITS_CHARGED_EVENT,
  CREDITS_REFUNDED_EVENT,
  fetchCreditHistory,
  formatCredits,
} from '../lib/credits';
import type { CreditHistoryEntry } from '../lib/credits';
import { rateFor } from '../lib/pricing';

const KIND_LABEL: Record<string, string> = {
  charge: 'Generated',
  refund: 'Refund',
  topup: 'Credit pack',
  trial: 'Starter credits',
  trial_upgrade: 'Starter credits',
  grant: 'Granted',
};

function describe(entry: CreditHistoryEntry): string {
  const engine = entry.engine ? rateFor(entry.engine.split('+')[0])?.label || entry.engine : '';
  const note = (entry.note || '').split(' · ')[0];
  if (entry.kind === 'charge' || entry.kind === 'refund') {
    const what = note || engine || entry.source || 'Generation';
    const length = entry.seconds ? ` · ${entry.seconds}s` : '';
    return `${what}${engine && !what.includes(engine) ? ` · ${engine}` : ''}${length}`;
  }
  return note || KIND_LABEL[entry.kind] || entry.kind;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CreditHistory({ limit = 30, compact = false }: { limit?: number; compact?: boolean }) {
  const [entries, setEntries] = useState<CreditHistoryEntry[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    const rows = await fetchCreditHistory(limit);
    if (rows === null) {
      setState('error');
      return;
    }
    setEntries(rows);
    setState('ready');
  }, [limit]);

  useEffect(() => {
    void load();
    const onMove = () => { void load(); };
    window.addEventListener(CREDITS_CHARGED_EVENT, onMove);
    window.addEventListener(CREDITS_REFUNDED_EVENT, onMove);
    window.addEventListener('audos:session-established', onMove);
    return () => {
      window.removeEventListener(CREDITS_CHARGED_EVENT, onMove);
      window.removeEventListener(CREDITS_REFUNDED_EVENT, onMove);
      window.removeEventListener('audos:session-established', onMove);
    };
  }, [load]);

  return (
    <section
      className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-4"
      data-testid="credit-history"
      aria-label="Credit usage history"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--space-text-primary)]">
          <History className="h-4 w-4 text-[var(--space-text-brand)]" aria-hidden="true" />
          Credit usage
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[var(--space-text-muted)] hover:bg-[var(--space-surface-card-hover)]"
          data-testid="button-refresh-credit-history"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${state === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {state === 'error' && !entries ? (
        <p className="text-xs text-[var(--space-text-muted)]">Sign in to see your credit history. Nothing could be read from your wallet just now.</p>
      ) : state === 'loading' && !entries ? (
        <p className="text-xs text-[var(--space-text-muted)]">Loading your credit history…</p>
      ) : entries && entries.length === 0 ? (
        <p className="text-xs text-[var(--space-text-muted)]">No credit activity yet. Your first generation will appear here with its cost and the balance after it.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr className="text-[var(--space-text-muted)]">
                {!compact && <th className="py-1.5 pr-3 font-medium">When</th>}
                <th className="py-1.5 pr-3 font-medium">What</th>
                <th className="py-1.5 pr-3 text-right font-medium">Credits</th>
                <th className="py-1.5 text-right font-medium">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((entry) => {
                const positive = entry.amount > 0;
                return (
                  <tr key={entry.id} className="border-t border-[var(--space-border-default)]" data-testid={`credit-history-row-${entry.id}`}>
                    {!compact && <td className="whitespace-nowrap py-2 pr-3 text-[var(--space-text-muted)]">{when(entry.createdAt)}</td>}
                    <td className="py-2 pr-3 text-[var(--space-text-primary)]">
                      <span className="mr-1.5 text-[var(--space-text-muted)]">{KIND_LABEL[entry.kind] || entry.kind}</span>
                      {describe(entry)}
                    </td>
                    <td
                      className="whitespace-nowrap py-2 pr-3 text-right font-semibold"
                      style={{ color: positive ? 'var(--space-semantic-success-500)' : entry.amount < 0 ? 'var(--space-text-primary)' : 'var(--space-text-muted)' }}
                    >
                      {entry.amount === 0 ? '0' : `${positive ? '+' : '−'}${formatCredits(Math.abs(entry.amount))}`}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right text-[var(--space-text-secondary)]">{formatCredits(entry.balanceAfter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
