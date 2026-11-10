import { useState, useEffect } from 'react';
import { CreditCard, Coins, Crown, LogOut, Clock, CheckCircle2, AlertCircle, Loader2, ExternalLink, CalendarX } from 'lucide-react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';
import { settingsStyles } from '../lib/colors';
import { isPaidTier, isProTier, openPricing, useUserTier } from '../lib/plans';
import { formatCreditBalance, formatCredits, useCredits } from '../lib/credits';
import CreditHistory from './CreditHistory';
import { hasTenantDelegationAuth, scopedSpaceSessionStorageKey } from '../lib/tenant-delegation-scope';
import { ThemeToggle } from './ui/Molten';
import { clearSessionIdentity } from '../lib/workspace';
import { useAmbientMusic } from '../hooks/useAmbientMusic';

interface SettingsProps {
  spaceId: string;
}

interface SubscriptionStatus {
  status: 'not_registered' | 'registered' | 'trial' | 'trialing' | 'trial_expired' | 'active' | 'canceled' | 'past_due';
  trialDaysRemaining: number;
  trialDays: number;
  trialExpired: boolean;
  trialStartDate: string | null;
  hasPaymentMethod: boolean;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  contactId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface PaymentConfig {
  enabled: boolean;
  mode: 'platform' | 'connect';
  defaultTrialDays: number;
  defaultPriceCents: number;
}

interface StoredSession {
  id?: string;
  sessionId?: string;
  workspaceSessionId?: string;
  email?: string;
  createdAt?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  isReturningUser?: boolean;
  workspaceId?: string;
}

function getPaymentAppId(spaceId: string) {
  const runtimeWindow = window as Window & {
    __APP_ID__?: string;
    __SPACE_ID__?: string;
  };
  return runtimeWindow.__APP_ID__ || runtimeWindow.__SPACE_ID__ || spaceId;
}

function getSessionStorageKey(spaceId: string) {
  return scopedSpaceSessionStorageKey(spaceId);
}

export default function Settings({ spaceId }: SettingsProps) {
  const { sessionId: contextSessionId } = useSpaceRuntime();
  const delegated = hasTenantDelegationAuth();
  const ambientMusic = useAmbientMusic();
  // VidVerge access tier from the `subscriptions` table (email -> tier +
  // video_limit). This is separate from the platform's Stripe subscription
  // state below: a row here grants access directly, so it is shown first, and
  // a granted account is never shown a checkout or an upgrade nudge.
  const {
    tier: userTier,
    loading: tierLoading,
  } = useUserTier(spaceId, contextSessionId);
  // Credits are the product's only meter (pay per use: real engine cost + 30%,
  // $0.15 per credit), so the account panel shows a balance and its history.
  const { credits } = useCredits();
  const subscriber = isPaidTier(userTier);
  const tierLabel = isProTier(userTier) ? 'Pro' : 'Pay per use';
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [managingPortal, setManagingPortal] = useState(false);
  const [billingAction, setBillingAction] = useState('');
  const [invoices, setInvoices] = useState<Array<{ id?: string; status?: string; amount?: number; currency?: string; createdAt?: string; receiptUrl?: string }>>([]);
  const [portalMessage, setPortalMessage] = useState('');

  useEffect(() => {
    // Use localStorage for cross-browser persistence (matching EmailGate.tsx)
    // Re-read when spaceId or contextSessionId changes (session update trigger)
    const sessionKey = getSessionStorageKey(spaceId);
    const existingSession = localStorage.getItem(sessionKey);
    if (existingSession) {
      try {
        const session = JSON.parse(existingSession);
        setEmail(session.email || '');
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }
    
    loadPaymentConfig();
  }, [spaceId, contextSessionId]);

  useEffect(() => {
    if (email && email.includes('@')) {
      loadSubscriptionStatus();
    }
  }, [email, spaceId]);

  const loadPaymentConfig = async () => {
    try {
      const response = await fetch('/api/space-data/payment-config.json');
      if (response.ok) {
        const config = await response.json();
        setPaymentConfig(config);
      }
    } catch {
      // Billing configuration is optional for directly granted accounts.
    }
  };

  const loadSubscriptionStatus = async (targetEmail = email) => {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail) return;
    
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/space/${spaceId}/subscription-status?email=${encodeURIComponent(normalizedEmail)}`);
      if (response.ok) {
        const status = await response.json();
        setSubscriptionStatus(status);
      }
    } catch (e) {
      console.error('Failed to load subscription status:', e);
    } finally {
      setStatusLoading(false);
    }
  };

  // Billing acts on the identity saved by the current signed-in session. It
  // deliberately cannot register or adopt a different address: typing somebody
  // else's email must never move this browser onto their account or credits.
  const requireSignedInIdentity = (): { email: string; workspaceSessionId: string } => {
    const sessionKey = getSessionStorageKey(spaceId);
    let session: StoredSession | null = null;
    try {
      const raw = localStorage.getItem(sessionKey);
      session = raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      session = null;
    }

    const workspaceSessionId =
      session?.workspaceSessionId || session?.sessionId || session?.id || '';
    const verifiedEmail = (session?.email || '').trim().toLowerCase();

    if (!workspaceSessionId.startsWith('wses_') || !verifiedEmail.includes('@')) {
      throw new Error('Please sign in with your email before managing billing.');
    }

    return { email: verifiedEmail, workspaceSessionId };
  };

  // Signing out is a platform call. The space session cookie is HttpOnly, so
  // clearing localStorage alone leaves the next person on this browser signed
  // in as the previous visitor. Name the session this app is holding too — the
  // cookie points at only one of a visitor's records.
  const handleSignOut = async () => {
    const sessionKey = getSessionStorageKey(spaceId);
    let heldSessionId = '';
    try {
      const raw = localStorage.getItem(sessionKey);
      const session: StoredSession | null = raw ? (JSON.parse(raw) as StoredSession) : null;
      heldSessionId = session?.workspaceSessionId || session?.sessionId || session?.id || '';
    } catch {}

    try {
      const sharedSpacePath = `/space/${encodeURIComponent(spaceId)}`;
      const logoutUrl = window.location.pathname === sharedSpacePath
        ? `${sharedSpacePath}/logout`
        : `/api/space/${encodeURIComponent(spaceId)}/logout`;
      await fetch(logoutUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(heldSessionId ? { 'X-Session-Id': heldSessionId } : {}),
        },
        body: JSON.stringify(heldSessionId ? { sessionId: heldSessionId } : {}),
      });
    } catch (e) {
      console.warn('[Settings] Platform sign-out call failed; clearing this browser anyway.', e);
    }

    clearSessionIdentity();
    try { localStorage.removeItem(sessionKey); } catch {}
    try { sessionStorage.removeItem('space_session_id'); } catch {}
    setEmail('');
    setSubscriptionStatus(null);
    window.location.reload();
  };

  // Subscriptions were retired with pay-per-use pricing: buying credits goes
  // through the credit-pack checkout on the pricing screen.
  const handleBuyCredits = () => {
    if (delegated) {
      setError('Tenant-agent buyers manage purchases through their agent, not card checkout.');
      return;
    }
    openPricing('nav');
  };

  const handleManageSubscription = async () => {
    setManagingPortal(true);
    setError('');
    setPortalMessage('');
    try {
      const synced = requireSignedInIdentity();
      const appId = getPaymentAppId(spaceId);
      const response = await fetch('/api/payments/portal/request-link', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-App-Id': appId
        },
        body: JSON.stringify({
          customerEmail: synced.email,
        })
      });

      if (response.status === 404) {
        const legacyResponse = await fetch('/api/payments/portal', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Id': appId,
          },
          body: JSON.stringify({
            customerEmail: synced.email,
            returnUrl: window.location.origin + window.location.pathname,
          }),
        });
        const legacyData = await legacyResponse.json().catch(() => ({}));
        if (!legacyResponse.ok || !legacyData.url) {
          throw new Error(legacyData.error || 'Failed to open subscription management');
        }
        window.location.href = legacyData.url;
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to send secure account link');
      setPortalMessage('Check your email for a secure subscription-management link.');
    } catch (e) {
      console.error('Failed to open billing portal:', e);
      setError(e instanceof Error ? e.message : 'Failed to open subscription management');
    } finally {
      setManagingPortal(false);
    }
  };

  const changeSubscription = async (action: 'cancel' | 'resume') => {
    setBillingAction(action); setError(''); setPortalMessage('');
    try {
      const synced = requireSignedInIdentity();
      const response = await fetch(`/api/payments/subscription/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Id': getPaymentAppId(spaceId) }, body: JSON.stringify({ customerEmail: synced.email, subscriptionId: subscriptionStatus?.subscriptionId }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not ${action} this subscription.`);
      setPortalMessage(action === 'cancel' ? 'Cancellation scheduled for the end of the current period.' : 'Subscription resumed.');
      await loadSubscriptionStatus(synced.email);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} this subscription.`); }
    finally { setBillingAction(''); }
  };

  const loadInvoices = async () => {
    setBillingAction('invoices'); setError('');
    try {
      const synced = requireSignedInIdentity();
      const query = new URLSearchParams({ customerEmail: synced.email });
      const response = await fetch(`/api/payments/list?${query}`, { headers: { 'X-App-Id': getPaymentAppId(spaceId) } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Invoices could not be loaded.');
      setInvoices(Array.isArray(data.payments) ? data.payments : Array.isArray(data.data) ? data.data : []);
      if (!(Array.isArray(data.payments) ? data.payments : data.data)?.length) setPortalMessage('No invoices yet.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invoices could not be loaded.'); }
    finally { setBillingAction(''); }
  };

  const savePreference = (key: string, value: string | boolean | number) => {
    try { window.localStorage.setItem(`vv-setting:${key}`, JSON.stringify(value)); } catch {}
    setPortalMessage('Saved');
    window.setTimeout(() => setPortalMessage((current) => current === 'Saved' ? '' : current), 1400);
  };

  const getStatusBadge = () => {
    if (!subscriptionStatus) return null;

    switch (subscriptionStatus.status) {
      case 'active':
        return (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium ${subscriptionStatus.cancelAtPeriodEnd ? 'border-[var(--vg-warning)] bg-[var(--vg-warning-bg)] text-[var(--vg-warning)]' : 'border-[var(--vg-success)] bg-[var(--vg-success-bg)] text-[var(--vg-success)]'}`}>
            {subscriptionStatus.cancelAtPeriodEnd ? (
              <>
                <CalendarX className="w-4 h-4" />
                Cancels {subscriptionStatus.currentPeriodEnd
                  ? new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  : 'at period end'}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Active subscription
              </>
            )}
          </div>
        );
      case 'trial':
      case 'trialing':
        return (
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--vg-info)] bg-[var(--vg-info-bg)] px-3 py-1.5 text-sm font-medium text-[var(--vg-info)]">
            <Clock className="w-4 h-4" />
            {subscriptionStatus.trialDaysRemaining} days left in trial
          </div>
        );
      case 'trial_expired':
        return (
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--vg-warning)] bg-[var(--vg-warning-bg)] px-3 py-1.5 text-sm font-medium text-[var(--vg-warning)]">
            <AlertCircle className="w-4 h-4" />
            Trial expired
          </div>
        );
      case 'past_due':
        return (
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] px-3 py-1.5 text-sm font-medium text-[var(--vg-danger)]">
            <AlertCircle className="w-4 h-4" />
            Payment past due
          </div>
        );
      case 'canceled':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] rounded-full text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            Subscription canceled
          </div>
        );
      case 'registered':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--space-surface-muted)] text-[var(--space-text-secondary)] rounded-full text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Registered
          </div>
        );
      default:
        return null;
    }
  };

  // Granted accounts are excluded: their access does not come from Stripe, so
  // prompting them to pay would be asking for money they don't owe.
  const showPaymentCTA = !delegated && subscriptionStatus && !subscriber &&
    ['trial', 'trialing', 'trial_expired', 'canceled', 'past_due', 'registered'].includes(subscriptionStatus.status);

  return (
    <div className={`${settingsStyles.container} bg-[radial-gradient(ellipse_70%_38%_at_50%_-8%,color-mix(in_srgb,var(--space-brand-primary-500)_10%,transparent),transparent_66%),var(--space-surface-bg)]`}>
      <div className={`${settingsStyles.innerContainer} mx-auto max-w-3xl`}>
        <div className="mb-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--space-text-brand)]">VidVerge account</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--space-text-primary)]">Your studio, plan and credits</h2>
          <p className="mt-2 text-sm text-[var(--space-text-secondary)]">Manage the identity and production balance shared by every VidVerge engine.</p>
        </div>
        {/* Account Section */}
        <div className={`${settingsStyles.section} rounded-2xl border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-card)_94%,transparent)] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.26)]`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--space-text-primary)]">
              Your Account
            </h3>
            {email && !delegated && (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--space-text-secondary)] hover:text-[var(--vg-danger)] hover:bg-[var(--vg-danger-bg)] rounded-lg transition-colors"
                data-testid="button-sign-out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
          </div>

          <div>
            <p className={settingsStyles.label}>Email Address</p>
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] px-4 py-3"
              data-testid="row-settings-email"
            >
              <span className="text-sm text-[var(--space-text-primary)]">{email || 'Not signed in'}</span>
              {email && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--space-brand-primary-500)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--space-text-brand)]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Signed in
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--space-text-muted)]">
              {delegated
                ? 'This buyer session is supplied by your tenant agent. Ask the agent to manage purchases or access.'
                : 'This account is tied to the address you used at sign-in. To use a different one, sign out and sign in with that email.'}
            </p>
            {error && (
              <p className={settingsStyles.errorText} data-testid="text-settings-error">
                {error}
              </p>
            )}
            {portalMessage && (
              <p className="text-sm text-[var(--vg-success)]" role="status">
                {portalMessage}
              </p>
            )}
          </div>
        </div>

        {/* Subscription Section */}
        {email && !delegated && (
          <div className="mt-6 rounded-2xl border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-card)_94%,transparent)] p-6 shadow-[0_18px_48px_rgba(0,0,0,0.26)]" style={{ minHeight: 185 }}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[var(--space-text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--space-text-primary)]">
                  Credits & billing
                </h3>
              </div>
              <button
                onClick={() => openPricing('nav')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--space-brand-highlight)] bg-[color-mix(in_srgb,var(--space-brand-primary)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--space-brand-primary)_20%,transparent)] border border-[color-mix(in_srgb,var(--space-brand-primary)_40%,transparent)] rounded-lg transition-colors"
                data-testid="button-settings-plans"
              >
                <Crown className="w-3.5 h-3.5" />
                Prices & credit packs
              </button>
            </div>

            {credits && (
              <div
                className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-muted)] px-4 py-3"
                data-testid="settings-credit-row"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--space-text-primary)]">
                    <Coins className="w-4 h-4 text-[var(--space-text-brand)]" />
                    {formatCreditBalance(credits)}{credits.unlimited ? '' : ' credits'}
                  </span>
                  <span className="text-xs text-[var(--space-text-muted)]">
                    {credits.unlimited
                      ? 'Owner access · video generation does not deduct credits'
                      : '$0.15 per credit · each generation is priced at real engine cost + 30% and shown before you start'}
                  </span>
                </span>
                {!credits.unlimited ? (
                  <button
                    onClick={handleBuyCredits}
                    className="vg-primary-action px-3 text-xs"
                    data-testid="button-settings-topup"
                  >
                    Buy credits
                  </button>
                ) : null}
              </div>
            )}

            {credits && !credits.unlimited ? (
              <div className="mb-4">
                <CreditHistory limit={15} compact />
              </div>
            ) : null}

            {!tierLoading && (
              <div
                className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
                style={{
                  borderColor: subscriber ? 'color-mix(in srgb, var(--space-brand-primary-500) 40%, transparent)' : 'var(--space-border-default)',
                  background: subscriber
                    ? 'linear-gradient(90deg, color-mix(in srgb, var(--space-brand-primary-500) 16%, transparent) 0%, color-mix(in srgb, var(--space-brand-highlight-500) 8%, transparent) 100%)'
                    : 'var(--space-surface-muted)',
                }}
                data-testid="settings-tier-row"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-[var(--space-text-secondary)]">VidVerge access</span>
                  <span className="text-xs text-[var(--space-text-muted)]">
                    {credits?.unlimited
                      ? 'Unlimited owner access — no credit deductions'
                      : 'Credits never expire — add a credit pack any time'}
                  </span>
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    color: subscriber ? 'var(--space-text-on-primary)' : 'var(--space-text-secondary)',
                    background: subscriber
                      ? 'var(--vg-gradient-action)'
                      : 'var(--space-surface-panel-strong)',
                  }}
                  data-testid="badge-settings-tier"
                >
                  <Crown className="w-3.5 h-3.5" />
                  {tierLabel}
                </span>
              </div>
            )}

            {statusLoading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-[var(--space-text-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading subscription status...
                </div>
                <div className="h-12 rounded-xl bg-[var(--space-surface-muted)]" aria-hidden="true" />
                <div className="mx-auto h-3 w-44 rounded-full bg-[var(--space-surface-muted)]" aria-hidden="true" />
              </div>
            ) : subscriber && subscriptionStatus?.status !== 'active' ? (
              // Access comes from the `subscriptions` list, so the Stripe trial
              // and checkout blocks below would be nonsense for this account.
              // An account that DOES hold a live Stripe subscription keeps the
              // normal panel, so it never loses its manage-billing link.
              <div
                className="p-4 rounded-xl border border-[color-mix(in_srgb,var(--space-brand-primary)_30%,transparent)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--space-brand-primary)_15%,transparent),color-mix(in_srgb,var(--space-brand-highlight)_5%,transparent))]"
                data-testid="settings-granted-access"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[var(--vg-success)]" />
                  <span className="text-sm font-medium text-[var(--space-text-primary)]">
                    VidVerge {tierLabel} access is active
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--space-text-secondary)]">
                  {`This account has VidVerge ${tierLabel} access, granted directly. Generations still spend credits at real engine cost + 30%.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status Badge */}
                {getStatusBadge()}

                {/* Trial Progress */}
                {(subscriptionStatus?.status === 'trial' || subscriptionStatus?.status === 'trialing') && (
                  <div className="p-4 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--space-brand-primary)_15%,transparent),color-mix(in_srgb,var(--space-brand-highlight)_10%,transparent))] rounded-xl border border-[color-mix(in_srgb,var(--space-brand-primary)_30%,transparent)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-[var(--space-text-primary)]">
                        Free Trial
                      </span>
                      <span className="text-sm text-[var(--space-text-secondary)]">
                        {subscriptionStatus.trialDaysRemaining} of {subscriptionStatus.trialDays} days remaining
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[var(--vg-raised)] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-[var(--vg-accent)] transition-all"
                        style={{ 
                          width: `${((subscriptionStatus.trialDays - subscriptionStatus.trialDaysRemaining) / subscriptionStatus.trialDays) * 100}%` 
                        }}
                      />
                    </div>
                    <p className="mt-3 text-xs text-[var(--space-text-secondary)]">
                      Add your payment method now to continue access after your trial ends.
                    </p>
                    {subscriptionStatus.hasPaymentMethod && (
                      <button
                        onClick={handleManageSubscription}
                        disabled={managingPortal}
                        className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[var(--space-text-secondary)] hover:text-[var(--space-text-primary)] hover:bg-white/10 border border-[var(--space-border-strong)] rounded-lg transition-colors disabled:opacity-50"
                      >
                        {managingPortal ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Manage Billing
                      </button>
                    )}
                  </div>
                )}

                {/* Active subscription Info */}
                {subscriptionStatus?.status === 'active' && (
                  <div className={`p-4 bg-gradient-to-r ${subscriptionStatus.cancelAtPeriodEnd ? 'from-[var(--vg-warning-bg)] to-transparent border-[color-mix(in_srgb,var(--vg-warning)_30%,transparent)]' : 'from-[var(--vg-success-bg)] to-transparent border-[color-mix(in_srgb,var(--vg-success)_30%,transparent)]'} rounded-xl border`}>
                    {subscriptionStatus.cancelAtPeriodEnd ? (
                      <>
                        <div className="flex items-center gap-2">
                          <CalendarX className="w-5 h-5 text-[var(--vg-warning)]" />
                          <span className="text-sm font-medium text-[var(--space-text-primary)]">
                            Subscription ending
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[var(--space-text-secondary)]">
                          Your subscription will end on{' '}
                          <span className="font-semibold text-[var(--space-text-primary)]">
                            {subscriptionStatus.currentPeriodEnd
                              ? new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                              : 'the end of the current billing period'}
                          </span>. You will continue to have full access until then.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-[var(--vg-success)]" />
                          <span className="text-sm font-medium text-[var(--space-text-primary)]">
                            You have full access
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[var(--space-text-secondary)]">
                          Your subscription is active. Thank you for your support!
                        </p>
                      </>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2"><button
                      onClick={handleManageSubscription}
                      disabled={managingPortal}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--space-border-strong)] bg-[var(--space-surface-panel-strong)] px-4 text-sm font-medium text-[var(--space-text-primary)] hover:bg-[var(--vg-hover)] disabled:opacity-50"
                    >
                      {managingPortal ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          Manage Subscription
                        </>
                      )}
                    </button>
                    <button type="button" onClick={() => void changeSubscription(subscriptionStatus.cancelAtPeriodEnd ? 'resume' : 'cancel')} disabled={!!billingAction} className="min-h-11 rounded-lg border border-[var(--space-border-strong)] px-4 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] disabled:opacity-50">{billingAction === 'cancel' || billingAction === 'resume' ? 'Saving…' : subscriptionStatus.cancelAtPeriodEnd ? 'Resume' : 'Cancel at period end'}</button>
                    <button type="button" onClick={() => void loadInvoices()} disabled={!!billingAction} className="min-h-11 rounded-lg border border-[var(--space-border-strong)] px-4 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] disabled:opacity-50">{billingAction === 'invoices' ? 'Loading…' : 'Invoices'}</button></div>
                    {invoices.length ? <div className="mt-3 space-y-2">{invoices.slice(0, 12).map((invoice, index) => <div key={invoice.id || index} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] px-3 text-xs"><span className="font-mono text-[var(--space-text-secondary)]">{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'Invoice'}</span><span className="text-[var(--space-text-muted)]">{invoice.status || 'paid'}</span>{invoice.receiptUrl ? <a href={invoice.receiptUrl} target="_blank" rel="noreferrer" className="text-[var(--vg-accent)] hover:text-[var(--vg-accent-hover)]">View</a> : null}</div>)}</div> : null}
                  </div>
                )}

                {/* Trial Expired Warning */}
                {subscriptionStatus?.status === 'trial_expired' && (
                  <div className="p-4 bg-gradient-to-r from-[var(--vg-warning-bg)] to-transparent rounded-xl border border-[color-mix(in_srgb,var(--vg-warning)_30%,transparent)]">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-[var(--vg-warning)]" />
                      <span className="text-sm font-medium text-[var(--space-text-primary)]">
                        Your trial has ended
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--space-text-secondary)]">
                      Vidverge is pay per use now — buy a credit pack to keep generating.
                    </p>
                  </div>
                )}

                {/* Payment CTA - show if in trial or expired, regardless of payment config */}
                {showPaymentCTA && (
                  <div className="space-y-3">
                    <div className="p-4 bg-[var(--space-surface-muted)] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-[var(--space-text-primary)]">
                          Pay per use
                        </span>
                        <span className="text-sm font-bold text-[var(--space-text-brand)]">
                          $0.15 per credit
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--space-text-secondary)]">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--vg-accent)]" />
                          Real engine cost + 30%
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--vg-accent)]" />
                          No subscription
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleBuyCredits}
                      className="vg-primary-action w-full justify-center gap-2 px-4"
                      data-testid="button-buy-credits"
                    >
                      <CreditCard className="w-4 h-4" />
                      Buy credits
                    </button>

                    <p className="text-center text-xs text-[var(--space-text-muted)]">
                      Secure hosted payment · one-time credit packs
                    </p>
                  </div>
                )}

                {/* Not registered yet */}
                {(!subscriptionStatus || subscriptionStatus.status === 'not_registered') && (
                  <div className="p-4 bg-[var(--space-surface-muted)] rounded-xl text-center">
                    <p className="text-sm text-[var(--space-text-secondary)]">
                      Pay per use — buy a credit pack whenever you need more credits
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <section className="mt-6 rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--ash)] p-6" aria-labelledby="defaults-heading">
          <div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Every new production</p><h3 id="defaults-heading" className="mt-2 font-[var(--display)] text-xl font-bold text-[var(--ivory)]">Studio defaults</h3><p className="mt-1 text-sm text-[var(--muted)]">Studios start here, then keep any project-specific choice you make.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-[var(--muted)]">Shape<select defaultValue={JSON.parse(localStorage.getItem('vv-setting:shape') || '"9:16"')} onChange={(event) => savePreference('shape', event.target.value)} className="mt-2 min-h-11 w-full rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--ash-2)] px-3 text-sm text-[var(--ivory)]"><option value="9:16">Vertical · 9:16</option><option value="16:9">Widescreen · 16:9</option><option value="1:1">Square · 1:1</option></select></label>
            <label className="text-xs font-semibold text-[var(--muted)]">Language<select defaultValue={JSON.parse(localStorage.getItem('vv-setting:language') || '"English"')} onChange={(event) => savePreference('language', event.target.value)} className="mt-2 min-h-11 w-full rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--ash-2)] px-3 text-sm text-[var(--ivory)]"><option>English</option><option>Hinglish</option><option>Hindi</option></select></label>
            <label className="text-xs font-semibold text-[var(--muted)]">Verger mode<select defaultValue={JSON.parse(localStorage.getItem('vv-setting:verger-mode') || '"autopilot"')} onChange={(event) => savePreference('verger-mode', event.target.value)} className="mt-2 min-h-11 w-full rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--ash-2)] px-3 text-sm text-[var(--ivory)]"><option value="autopilot">Autopilot</option><option value="copilot">Copilot</option></select></label>
            <label className="text-xs font-semibold text-[var(--muted)] sm:col-span-2 lg:col-span-3">Verger budget per request<input type="number" min="1" defaultValue={JSON.parse(localStorage.getItem('vv-setting:verger-budget') || '60')} onBlur={(event) => savePreference('verger-budget', Math.max(1, Number(event.target.value) || 60))} className="mt-2 min-h-11 w-full rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--ash-2)] px-3 text-sm text-[var(--ivory)]" /></label>
          </div>
        </section>
        <section className="mt-6 rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--ash)] p-6" aria-labelledby="notifications-heading"><div className="mb-4"><h3 id="notifications-heading" className="font-[var(--display)] text-xl font-bold text-[var(--ivory)]">Notifications</h3><p className="mt-1 text-sm text-[var(--muted)]">Choose which production updates reach you.</p></div><div className="space-y-2">{[['video-ready','Video ready'],['job-needs-you','A job needs you'],['weekly-summary','Weekly summary']].map(([key,label])=><label key={key} className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--ash-2)] px-3 text-sm font-semibold"><span>{label}</span><input type="checkbox" defaultChecked={JSON.parse(localStorage.getItem(`vv-setting:${key}`) || (key === 'weekly-summary' ? 'false' : 'true'))} onChange={(event) => savePreference(key,event.target.checked)} className="h-4 w-4 accent-[var(--vg-accent)]" /></label>)}</div></section>
        <section className="mt-6 rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--ash)] p-6 shadow-[0_18px_48px_color-mix(in_srgb,var(--void)_24%,transparent)]" aria-labelledby="appearance-heading">
          <div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--space-text-brand)]">Personal preference</p><h3 id="appearance-heading" className="mt-2 font-[var(--display)] text-xl font-bold text-[var(--ivory)]">Appearance</h3><p className="mt-1 text-sm text-[var(--muted)]">Theme and focus audio apply across Home, Verger and every studio.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemeToggle />
            <button type="button" role="switch" aria-checked={ambientMusic.enabled} onClick={ambientMusic.toggle} className="flex min-h-11 items-center justify-between rounded-[var(--r-control)] border border-[var(--line-2)] bg-[var(--ash-2)] px-3 text-sm font-semibold text-[var(--ivory)] hover:border-[var(--line-gold)]">
              <span>Background music</span><span className="relative h-5 w-9 rounded-full transition" style={{ background: ambientMusic.enabled ? 'var(--vg-accent)' : 'var(--ash-3)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{ left: 2, transform: ambientMusic.enabled ? 'translateX(16px)' : 'none' }} /></span>
            </button>
          </div>
        </section>
        <footer className="mt-6 flex items-center justify-center gap-5 border-t border-[var(--space-border-default)] py-5 text-xs text-[var(--space-text-muted)]">
          <a href="/pricing" className="rounded px-1 py-2 transition-colors hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">Pricing</a>
          <a href="/terms-of-service" className="rounded px-1 py-2 transition-colors hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">Terms</a>
          <a href="/privacy-policy" className="rounded px-1 py-2 transition-colors hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">Privacy</a>
          <a href="/refund" className="rounded px-1 py-2 transition-colors hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">Refund Policy</a>
        </footer>
      </div>
    </div>
  );
}
