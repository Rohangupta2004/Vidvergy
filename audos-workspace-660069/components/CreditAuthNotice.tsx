import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  beginCreditEmailSignIn,
  CREDIT_AUTH_REQUIRED_EVENT,
  refreshCreditSession,
} from '../lib/credits';

/** Global recovery UI for a persistent credit-wallet 401/403. */
export default function CreditAuthNotice() {
  const [visible, setVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  useEffect(() => {
    const show = () => {
      setRefreshFailed(false);
      setVisible(true);
    };
    window.addEventListener(CREDIT_AUTH_REQUIRED_EVENT, show);
    return () => window.removeEventListener(CREDIT_AUTH_REQUIRED_EVENT, show);
  }, []);

  if (!visible) return null;

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshFailed(false);
    const ready = await refreshCreditSession();
    setRefreshing(false);
    if (ready) setVisible(false);
    else setRefreshFailed(true);
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Credit sign-in required"
      className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-xl rounded-2xl border p-4 shadow-2xl"
      style={{
        background: 'var(--space-surface-card)',
        borderColor: 'color-mix(in srgb, var(--space-semantic-warning-500) 55%, transparent)',
        color: 'var(--space-text-primary)',
      }}
      data-testid="credit-auth-notice"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--space-semantic-warning-500)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Sign in with your email to use credits</div>
          <p className="mt-1 text-sm text-[var(--space-text-secondary)]">
            Paid generation did not start. Your saved work and idempotency key are unchanged, so retrying after sign-in will not repeat earlier steps or double-charge you.
          </p>
          {refreshFailed ? (
            <p className="mt-2 text-sm text-[var(--space-semantic-warning-500)]">
              This session could not be refreshed. Sign in again to continue.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] px-4 text-sm font-semibold text-[var(--space-text-primary)]"
              data-testid="button-refresh-credit-session"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh session
            </button>
            <button
              type="button"
              onClick={beginCreditEmailSignIn}
              className="min-h-11 rounded-[10px] bg-[var(--space-brand-primary)] px-4 text-sm font-bold text-[var(--space-text-on-primary)]"
              data-testid="button-credit-email-sign-in"
            >
              Sign in with email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
