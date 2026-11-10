import { Check, Coins, CreditCard, Film, RefreshCw } from 'lucide-react';
import PublicPageChrome, { BUSINESS_NAME, SUPPORT_EMAIL } from '../../components/PublicPageChrome';
import { CREDIT_PACK_OPTIONS, FREE_TRIAL_CREDITS } from '../../lib/credits';
import { COST_PLUS_MARKUP, CREDIT_VALUE_USD, quote, rateCardExamples } from '../../lib/pricing';

const MARKUP_PERCENT = Math.round((COST_PLUS_MARKUP - 1) * 100);
const KLING_EXAMPLE = quote('kling-2.5-turbo', { seconds: 5, mode: 'std' });
const SEEDANCE_EXAMPLE = quote('openrouter/bytedance/seedance-2.5', { seconds: 8, resolution: '720p', aspectRatio: '16:9' });

function usd(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

const ALWAYS_FREE = [
  'Chat with Verger, scripts, briefs and scene planning',
  'Image generation: characters, mockups and storyboards',
  `${FREE_TRIAL_CREDITS} starter credits on every new account, no card required`,
  'Automatic credit refund when a generation fails',
];

const FAQ = [
  {
    q: 'Is there a subscription?',
    a: `No. ${BUSINESS_NAME} is pay per use. You buy one-time credit packs and spend them on the generations you choose. Nothing renews automatically.`,
  },
  {
    q: 'How much does a generation cost?',
    a: `Each generation costs the real price of the engine that runs it plus ${MARKUP_PERCENT}%, converted to credits at ${usd(CREDIT_VALUE_USD)} per credit and rounded up. The exact number of credits is shown before you press Generate.`,
  },
  {
    q: 'Do unused credits roll over?',
    a: 'Yes. Unused credits roll over with no monthly reset and never expire while your account is active.',
  },
  {
    q: 'Who processes payments?',
    a: `Payments are processed by Paddle.com, our Merchant of Record. Paddle handles checkout, invoices, receipts and sales tax or VAT. Prices are in US dollars; applicable taxes are added at checkout.`,
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes. Unused credits can be refunded within 14 days of purchase. See the Refund Policy for full details.',
  },
];

export default function PricingPage() {
  const examples = rateCardExamples().filter((row) => row.priced && row.credits > 0);
  const featuredPack = CREDIT_PACK_OPTIONS.includes(500) ? 500 : CREDIT_PACK_OPTIONS[Math.floor(CREDIT_PACK_OPTIONS.length / 2)];

  return (
    <PublicPageChrome current="pricing">
      <section className="mx-auto max-w-[1120px] px-5 pt-14 sm:px-8">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--gold,#d4af37)]">{BUSINESS_NAME} pricing</p>
        <h1 className="mt-4 text-[40px] font-black leading-[1.02] tracking-[-0.045em] sm:text-[56px]" style={{ fontFamily: 'var(--display)' }}>
          Pay per use. Real engine cost + {MARKUP_PERCENT}%.
        </h1>
        <p className="mt-5 max-w-[680px] text-[15.5px] leading-7 text-[var(--muted,#9aa0ae)]">
          {BUSINESS_NAME} is an AI video generation service. One credit costs {usd(CREDIT_VALUE_USD)}. Every video, avatar,
          voiceover, music bed and render is priced from what the engine really costs plus {MARKUP_PERCENT}%, and you see the
          exact credits before you generate. Text and images are free. There is no subscription.
        </p>
      </section>

      <section aria-label="Credit packs" className="mx-auto mt-10 grid max-w-[1120px] gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-5">
        <article className="flex flex-col rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
          <h2 className="text-[15px] font-bold">Starter credits</h2>
          <p className="mt-3 text-[36px] font-extrabold tracking-[-0.04em]">Free</p>
          <p className="text-[12.5px] text-[var(--muted,#9aa0ae)]">on sign-up</p>
          <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--warn,#ffb020)]">{FREE_TRIAL_CREDITS} credits</p>
          <p className="mt-4 text-[13px] leading-6 text-[var(--muted,#9aa0ae)]">No card required. Every studio unlocked.</p>
        </article>
        {CREDIT_PACK_OPTIONS.map((pack) => {
          const featured = pack === featuredPack;
          return (
            <article
              key={pack}
              className={`flex flex-col rounded-xl border p-6 ${featured ? 'border-[var(--gold,#d4af37)] bg-[color-mix(in_srgb,var(--gold,#d4af37)_8%,var(--ash,#12141b))]' : 'border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)]'}`}
            >
              <h2 className="text-[15px] font-bold">{pack.toLocaleString()} credits</h2>
              <p className={`mt-3 text-[36px] font-extrabold tracking-[-0.04em] ${featured ? 'text-[var(--gold-hi,#e6c45a)]' : ''}`}>{usd(pack * CREDIT_VALUE_USD)}</p>
              <p className="text-[12.5px] text-[var(--muted,#9aa0ae)]">one-time purchase</p>
              <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--warn,#ffb020)]">{usd(CREDIT_VALUE_USD)} per credit</p>
              <p className="mt-4 text-[13px] leading-6 text-[var(--muted,#9aa0ae)]">Unused credits roll over and never expire.</p>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="how-credits-work" className="mx-auto mt-10 max-w-[1120px] px-5 sm:px-8">
        <h2 id="how-credits-work" className="text-[24px] font-bold tracking-[-0.02em]">How credits work</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><Coins size={17} className="text-[var(--gold,#d4af37)]" />What a credit is worth</h3>
            <p className="mt-3 text-[13.5px] leading-6 text-[var(--muted,#9aa0ae)]">
              1 credit = {usd(CREDIT_VALUE_USD)}. Every paid generation is priced at the real engine cost + {MARKUP_PERCENT}%, divided by
              {' '}{usd(CREDIT_VALUE_USD)} and rounded up to whole credits. Text and image generation cost 0 credits.
            </p>
          </article>
          <article className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><CreditCard size={17} className="text-[var(--gold,#d4af37)]" />How you buy credits</h3>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13.5px] leading-6 text-[var(--muted,#9aa0ae)]">
              <li>Sign in with your email. New accounts start with {FREE_TRIAL_CREDITS} free credits.</li>
              <li>Open Credits from your balance or Settings and pick a pack of {CREDIT_PACK_OPTIONS.map((pack) => pack.toLocaleString()).join(', ')} credits.</li>
              <li>Pay once at checkout, processed by Paddle, our Merchant of Record. Credits are added to your balance after payment.</li>
              <li>Before each paid generation you see its exact credit cost. Credits are deducted only when you confirm.</li>
            </ol>
          </article>
          <article className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><RefreshCw size={17} className="text-[var(--gold,#d4af37)]" />Credits roll over</h3>
            <p className="mt-3 text-[13.5px] leading-6 text-[var(--muted,#9aa0ae)]">
              There is no monthly reset. Unused credits roll over and stay in your balance for as long as your account is active, ready
              for any studio and any engine.
            </p>
          </article>
          <article className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><Film size={17} className="text-[var(--gold,#d4af37)]" />Kling and Seedance use your credit balance</h3>
            <p className="mt-3 text-[13.5px] leading-6 text-[var(--muted,#9aa0ae)]">
              Kling and Seedance generations are deducted from your {BUSINESS_NAME} credit balance at their real engine cost + {MARKUP_PERCENT}%,
              like every other engine. For example, {KLING_EXAMPLE.label} 5 s (std 720p) = {KLING_EXAMPLE.credits.toLocaleString()} credits and
              {' '}{SEEDANCE_EXAMPLE.label} 8 s (720p) = {SEEDANCE_EXAMPLE.credits.toLocaleString()} credits. Failed generations are refunded automatically.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto mt-10 grid max-w-[1120px] gap-4 px-5 sm:px-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
          <h2 className="text-[18px] font-bold">What things cost</h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted,#9aa0ae)]">
            Credits = real engine cost × {COST_PLUS_MARKUP.toFixed(2)} ÷ {usd(CREDIT_VALUE_USD)}, rounded up. Example prices from the live rate card:
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[var(--muted,#9aa0ae)]">
                  <th className="py-2 pr-3 font-medium">Engine</th>
                  <th className="px-3 py-2 font-medium">Example</th>
                  <th className="py-2 pl-3 text-right font-medium">Credits</th>
                  <th className="py-2 pl-3 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {examples.map((row) => (
                  <tr key={`${row.engine}-${row.example}`} className="border-t border-[var(--line,#2a2e3a)]">
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="px-3 py-2 text-[var(--muted,#9aa0ae)]">{row.example}</td>
                    <td className="py-2 pl-3 text-right font-semibold">{row.credits.toLocaleString()}</td>
                    <td className="py-2 pl-3 text-right text-[var(--muted,#9aa0ae)]">{usd(row.credits * CREDIT_VALUE_USD)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line,#2a2e3a)] bg-[var(--ash,#12141b)] p-6">
          <h2 className="text-[18px] font-bold">Always free</h2>
          <ul className="mt-4 space-y-3">
            {ALWAYS_FREE.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] leading-6 text-[var(--muted,#9aa0ae)]">
                <Check size={15} className="mt-1 shrink-0 text-[var(--gold,#d4af37)]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-[860px] px-5 sm:px-8">
        <h2 className="text-[24px] font-bold tracking-[-0.02em]">Questions</h2>
        <div className="mt-4 space-y-6">
          {FAQ.map((item) => (
            <div key={item.q} className="border-t border-[var(--line,#2a2e3a)] pt-5">
              <h3 className="text-[16px] font-semibold">{item.q}</h3>
              <p className="mt-2 text-[14px] leading-7 text-[var(--muted,#9aa0ae)]">{item.a}</p>
            </div>
          ))}
          <p className="border-t border-[var(--line,#2a2e3a)] pt-5 text-[14px] leading-7 text-[var(--muted,#9aa0ae)]">
            Questions about pricing or billing? Email <a className="text-[var(--gold,#d4af37)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </section>
    </PublicPageChrome>
  );
}
