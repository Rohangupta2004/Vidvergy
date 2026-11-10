/**
 * PricingScreen — VidVerge's pay-per-use credits, full frame.
 *
 * Mounted by the shell and rendered as an overlay above everything (dock,
 * agent panel, app windows). It opens from the credit pill, Settings, and
 * automatically whenever a generation is blocked for want of credits
 * (`trigger: 'credits'`).
 *
 * Pricing comes from lib/pricing.ts and is never restated here: one credit is
 * $0.15, and every engine costs its real provider price + 30%. Text and images
 * are free. Credit packs are a one-time checkout through native Audos payments.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Coins, Sparkles, X, Zap } from 'lucide-react';
import { currentUserEmail } from '../lib/plans';
import { COLORS, SHADOW } from './theme';
import type { PlanId, PricingRequest, PricingTrigger } from '../lib/plans';
import { hasTenantDelegationAuth } from '../lib/tenant-delegation-scope';
import {
  CREDIT_PACK_OPTIONS,
  CREDIT_PRICE_CENTS,
  FREE_TRIAL_CREDITS,
  formatCreditBalance,
  formatCredits,
  packCreditsFor,
  startCreditPackCheckout,
  useCredits,
} from '../lib/credits';
import { COST_PLUS_MARKUP, CREDIT_VALUE_USD, rateCardExamples, unpricedEngines } from '../lib/pricing';
import CreditHistory from './CreditHistory';

interface PricingScreenProps {
  trigger?: PricingTrigger;
  /** Extra context when a generation was blocked (credits needed vs held). */
  request?: PricingRequest | null;
  /** Kept for the shell's existing call site; plans no longer exist. */
  currentPlanId?: PlanId;
  onClose: () => void;
}

const FONT = "'Inter', 'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const BRAND = COLORS.primary;

const STYLES = `
@keyframes rlpFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rlpRise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: none } }
.rlp-root { animation: rlpFade .26s ease both; }
.rlp-rise { animation: rlpRise .55s cubic-bezier(.16,1,.3,1) both; }
.rlp-card { transition: transform .24s cubic-bezier(.2,0,0,1), border-color .24s ease; }
.rlp-card:hover { transform: translateY(-4px); }
.rlp-cta { transition: transform .18s ease, filter .18s ease; }
.rlp-cta:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.08); }
.rlp-cta:disabled { opacity: .6; cursor: default; }
.rlp-ghost { transition: color .2s ease, border-color .2s ease, background .2s ease; }
.rlp-ghost:hover { color: var(--vg-text); background: var(--vg-accent-soft); }
.rlp-scroll::-webkit-scrollbar { width: 9px; }
.rlp-scroll::-webkit-scrollbar-thumb { background: var(--vg-control-border); border-radius: 999px; }
@media (prefers-reduced-motion: reduce) { .rlp-root, .rlp-rise { animation: none; } .rlp-card:hover { transform: none; } }
`;

function tint(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

function dollars(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

const FREE_THINGS = [
  'Chat with Verger, scripts, briefs and scene planning',
  'Image generation — characters, mockups, storyboards',
  `${FREE_TRIAL_CREDITS} starter credits on every new account, no card`,
  'Automatic refund when a generation fails',
];

export default function PricingScreen({ trigger = 'nav', request = null, onClose }: PricingScreenProps) {
  const { credits } = useCredits();
  const delegated = hasTenantDelegationAuth();
  const [busyPack, setBusyPack] = useState<number | null>(null);
  const [error, setError] = useState<string>('');

  const atCreditWall = trigger === 'credits';
  const required = Math.max(0, Math.round(Number(request?.required) || 0));
  const balance = credits ? credits.balance : Math.max(0, Math.round(Number(request?.balance) || 0));
  const shortfall = Math.max(0, required - balance);
  const blockedLabel = String((request as any)?.label || '').trim();
  const suggestedPack = useMemo(() => (shortfall > 0 ? packCreditsFor(shortfall) : CREDIT_PACK_OPTIONS[1]), [shortfall]);
  const packs = useMemo(
    () => Array.from(new Set([...CREDIT_PACK_OPTIONS, suggestedPack])).sort((a, b) => a - b),
    [suggestedPack],
  );
  const rateRows = useMemo(() => rateCardExamples(), []);
  const notCharged = useMemo(() => unpricedEngines().filter((r) => r.kind !== 'utility'), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const buy = async (pack: number) => {
    setError('');
    if (delegated) {
      setError('Ask your agent to manage this purchase through the Audos wallet.');
      return;
    }
    const email = currentUserEmail() || (credits ? credits.email : '');
    setBusyPack(pack);
    try {
      const result = await startCreditPackCheckout(pack, email);
      if (!result.ok) setError(result.error || 'Checkout could not be opened.');
    } finally {
      setBusyPack(null);
    }
  };

  return (
    <div
      className="rlp-root rlp-scroll"
      style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', background: COLORS.bg, color: COLORS.text, fontFamily: FONT }}
      role="dialog"
      aria-modal="true"
      aria-label="VidVerge credits and pricing"
      data-testid="pricing-screen"
    >
      <style>{STYLES}</style>

      <button
        type="button"
        onClick={onClose}
        className="rlp-ghost"
        aria-label="Close pricing"
        style={{ position: 'fixed', top: 20, right: 20, zIndex: 3, width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, cursor: 'pointer', color: COLORS.textMuted, background: COLORS.input, border: '1px solid ' + COLORS.border }}
        data-testid="button-close-pricing"
      >
        <X size={17} />
      </button>

      <div style={{ position: 'relative', width: '100%', maxWidth: 1120, margin: '0 auto', padding: '64px 24px 56px' }}>
        {atCreditWall && required > 0 && (
          <div
            className="rlp-rise"
            style={{ maxWidth: 660, margin: '0 auto 22px', padding: '14px 20px', borderRadius: 14, textAlign: 'center', border: `1px solid ${tint(BRAND, 0.45)}`, background: COLORS.surface }}
            data-testid="banner-credit-wall"
          >
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: COLORS.text }}>
              <strong style={{ color: BRAND }}>{formatCredits(shortfall)} credits short.</strong>{' '}
              {blockedLabel ? `${blockedLabel} costs` : 'That generation costs'} {formatCredits(required)} credits and you have{' '}
              {formatCredits(balance)}. Add a pack below and press Generate again.
            </p>
          </div>
        )}

        {credits && (
          <div
            className="rlp-rise"
            style={{ maxWidth: 660, margin: '0 auto 26px', padding: '12px 18px', borderRadius: 14, textAlign: 'center', border: '1px solid ' + COLORS.border, background: COLORS.surface }}
            data-testid="banner-credit-balance"
          >
            <span style={{ fontSize: 13.5, color: COLORS.textMuted }}>
              Your balance: <strong style={{ color: COLORS.text }}>{formatCreditBalance(credits)}{credits.unlimited ? '' : ' credits'}</strong>
              {credits.unlimited ? ' — owner access does not deduct credits.' : ` (worth ${dollars(credits.balance * CREDIT_PRICE_CENTS)}).`}
            </span>
          </div>
        )}

        <div className="rlp-rise" style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 40px' }}>
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999, fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: COLORS.primaryGlow, background: tint(BRAND, 0.12), border: `1px solid ${tint(BRAND, 0.28)}` }}
          >
            {atCreditWall ? <Zap size={12} /> : <Sparkles size={12} />}
            {atCreditWall ? 'Out of credits' : 'Pay per use'}
          </span>
          <h1 style={{ margin: '20px 0 0', fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.1, color: COLORS.text }}>
            Pay for what you generate.
            <br />
            <span style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryGlow} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              Real engine cost + {Math.round((COST_PLUS_MARKUP - 1) * 100)}%.
            </span>
          </h1>
          <p style={{ margin: '18px auto 0', maxWidth: 580, fontSize: 15.5, lineHeight: 1.6, color: COLORS.textMuted }}>
            One credit is ${CREDIT_VALUE_USD.toFixed(2)}. Every video, avatar, voiceover, music bed and render is priced from what
            the engine actually costs us, plus {Math.round((COST_PLUS_MARKUP - 1) * 100)}%. You see the exact credits before you
            generate, and failed generations are refunded automatically. No subscription, no monthly plan.
          </p>
        </div>

        {/* Credit packs */}
        {delegated ? (
          <div style={{ padding: 28, textAlign: 'center', borderRadius: 20, border: '1px solid ' + COLORS.border, background: COLORS.surface }} data-testid="tenant-agent-purchase-guidance">
            <h3 style={{ margin: 0, color: COLORS.text, fontSize: 20 }}>Purchases are managed by your agent</h3>
            <p style={{ margin: '10px auto 0', maxWidth: 560, color: COLORS.textMuted, lineHeight: 1.6 }}>
              Ask the agent to buy or add credits through the Audos wallet. Card checkout is hidden for tenant buyers.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }} data-testid="credit-packs">
            {packs.map((pack, index) => {
              const highlighted = pack === suggestedPack;
              return (
                <div
                  key={pack}
                  className="rlp-card rlp-rise"
                  style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 16, padding: '22px 20px', background: COLORS.surface, border: `1px solid ${highlighted ? tint(BRAND, 0.55) : COLORS.border}`, boxShadow: highlighted ? `0 18px 48px ${tint(BRAND, 0.18)}` : SHADOW.card, animationDelay: `${100 + index * 60}ms` }}
                  data-testid={`credit-pack-${pack}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BRAND, fontSize: 13, fontWeight: 600 }}>
                    <Coins size={15} /> {formatCredits(pack)} credits
                    {highlighted && shortfall > 0 ? (
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--vg-on-btn)', background: 'var(--vg-btn)', padding: '3px 8px', borderRadius: 999 }}>Covers it</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1, color: COLORS.text, lineHeight: 1 }}>{dollars(pack * CREDIT_PRICE_CENTS)}</div>
                  <p style={{ margin: 0, fontSize: 12.5, color: COLORS.textMuted }}>One-time purchase · credits never expire</p>
                  <button
                    type="button"
                    onClick={() => void buy(pack)}
                    disabled={busyPack !== null}
                    className="rlp-cta"
                    style={{ marginTop: 'auto', width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: highlighted ? 'var(--vg-on-btn)' : BRAND, background: highlighted ? 'var(--vg-btn)' : 'transparent', border: highlighted ? 'none' : `1px solid ${BRAND}` }}
                    data-testid={`button-buy-pack-${pack}`}
                  >
                    {busyPack === pack ? 'Opening checkout…' : `Buy ${formatCredits(pack)} credits`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {error ? <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12.5, color: COLORS.error }}>{error}</p> : null}

        {/* Per-engine credit costs */}
        <div className="rlp-rise" style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          <section style={{ borderRadius: 16, border: '1px solid ' + COLORS.border, background: COLORS.surface, padding: 18 }} data-testid="rate-card">
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 650, color: COLORS.text }}>What things cost</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.textMuted }}>
              Credits = real engine cost × {COST_PLUS_MARKUP.toFixed(2)} ÷ ${CREDIT_VALUE_USD.toFixed(2)}, rounded up. Final renders are bundled into the video price.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: COLORS.textMuted, textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px 6px 0', fontWeight: 500 }}>Engine</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Example</th>
                    <th style={{ padding: '6px 0 6px 8px', fontWeight: 500, textAlign: 'right' }}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {rateRows.map((row) => (
                    <tr key={`${row.engine}-${row.example}`} style={{ borderTop: '1px solid ' + COLORS.border }}>
                      <td style={{ padding: '8px 8px 8px 0', color: COLORS.text }}>{row.label}</td>
                      <td style={{ padding: '8px', color: COLORS.textMuted }}>{row.example}</td>
                      <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 650, color: COLORS.text }}>{formatCredits(row.credits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ borderRadius: 16, border: '1px solid ' + COLORS.border, background: COLORS.surface, padding: 18 }} data-testid="free-things">
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 650, color: COLORS.text }}>Always free</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {FREE_THINGS.map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, lineHeight: 1.5, color: COLORS.textMuted }}>
                  <Check size={14} color={BRAND} style={{ flex: '0 0 auto', marginTop: 3 }} />
                  {item}
                </li>
              ))}
            </ul>
            {notCharged.length ? (
              <p style={{ margin: '14px 0 0', fontSize: 11.5, lineHeight: 1.5, color: COLORS.textMuted }}>
                Not charged yet: {notCharged.map((r) => r.label).join(', ')}.
              </p>
            ) : null}
          </section>
        </div>

        {credits && !delegated ? (
          <div className="rlp-rise" style={{ marginTop: 16 }}>
            <CreditHistory limit={20} />
          </div>
        ) : null}

        <nav aria-label="Legal" style={{ margin: '22px auto 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 18px', fontSize: 12, color: COLORS.textMuted }} data-testid="pricing-legal-links">
          <a href="/pricing" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', padding: '6px 2px' }}>Pricing</a>
          <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', padding: '6px 2px' }}>Terms</a>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', padding: '6px 2px' }}>Privacy</a>
          <a href="/refund" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', padding: '6px 2px' }}>Refund Policy</a>
        </nav>

        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            className="rlp-ghost"
            style={{ padding: '10px 20px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: COLORS.textMuted, background: 'transparent', border: '1px solid ' + COLORS.border }}
            data-testid="button-dismiss-pricing"
          >
            {atCreditWall ? 'Not right now — back to my videos' : 'Back to making videos'}
          </button>
        </div>
      </div>
    </div>
  );
}
