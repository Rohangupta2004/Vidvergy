import PublicPageChrome, { BUSINESS_NAME, SUPPORT_EMAIL, resolvePublicPage } from '../../components/PublicPageChrome';
import { CREDIT_PACK_OPTIONS, FREE_TRIAL_CREDITS } from '../../lib/credits';
import { COST_PLUS_MARKUP, CREDIT_VALUE_USD } from '../../lib/pricing';

const UPDATED = '5 November 2026';

// FOUNDER TO CONFIRM — edit these and every sentence in the policies updates.
const REFUND_WINDOW_DAYS = 14;
const REFUND_RESPONSE_TIME = '3 business days';

const CREDIT_PRICE = `$${CREDIT_VALUE_USD.toFixed(2)}`;
const MARKUP_PERCENT = Math.round((COST_PLUS_MARKUP - 1) * 100);
const PACKS = CREDIT_PACK_OPTIONS.map((pack) => pack.toLocaleString()).join(', ');

type Page = 'terms' | 'privacy' | 'refund';

const pages: Record<Page, { title: string; intro: string; sections: Array<{ title: string; body: string[] }> }> = {
  terms: {
    title: 'Terms of Service',
    intro: `These Terms of Service govern your access to and use of ${BUSINESS_NAME}, an online AI video generation service available at getvidverge.com. By creating an account or using ${BUSINESS_NAME} you agree to these terms.`,
    sections: [
      { title: '1. The service', body: [
        `${BUSINESS_NAME} provides AI-assisted tools that turn ideas, scripts, product links, images and footage into videos. It includes studios for script-to-video, faceless narration videos, presenter and avatar videos, product and ad videos, and video enhancement, plus an AI assistant (Verger) that plans and runs these workflows.`,
        'Features may change as we improve the service. We may add, modify or retire features, engines or studios at any time.',
      ] },
      { title: '2. Accounts', body: [
        'You sign in with your email address and a one-time verification code. You are responsible for activity under your account and for keeping access to your email secure.',
        'You must be at least 18 years old, or the age of majority where you live, to buy credits.',
      ] },
      { title: '3. Credits and pricing', body: [
        `${BUSINESS_NAME} is pay per use. Paid generations are charged in credits. One credit costs ${CREDIT_PRICE}, and credits are sold in one-time packs (currently ${PACKS} credits). New accounts receive ${FREE_TRIAL_CREDITS} free starter credits.`,
        `Each generation costs the real price of the engine that runs it plus ${MARKUP_PERCENT}%, converted to credits and rounded up. The exact number of credits is shown before you start a generation, and you only pay when you confirm it. Chat, writing, planning, scripts and image generation do not use credits.`,
        'Credits for a generation that fails because of a platform or provider error are returned to your balance automatically. Purchased credits do not expire while your account is active. Credits have no cash value and cannot be transferred, except as described in the Refund Policy.',
        'Current prices are published on the Pricing page. Price changes apply to future purchases and generations only, never to credits you have already bought.',
      ] },
      { title: '4. Billing, subscriptions and Paddle', body: [
        'Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries related to payment and handles returns and refunds in line with our Refund Policy. Paddle\'s Buyer Terms apply to your purchase.',
        'Prices are shown in US dollars. Sales tax, VAT or GST is calculated and collected by Paddle at checkout where applicable. Paddle issues your receipt or invoice.',
        `${BUSINESS_NAME} does not currently sell subscriptions. If a subscription plan is offered in future, it will renew automatically at the price and interval shown at checkout until you cancel; you can cancel at any time, cancellation stops future renewals, and access continues until the end of the paid period.`,
      ] },
      { title: '5. Acceptable use', body: [
        'You must have all rights and permissions needed for every script, image, video, logo, voice, likeness and other input you upload or reference.',
        'You must not use the service to create or distribute: deepfakes, impersonations or a real person\'s likeness or voice without their consent; sexual content involving minors or non-consensual sexual content; content that harasses, threatens, defames or promotes violence or hatred; misleading political or election content, fraud, scams or spam; malware; or anything that infringes intellectual property or breaks the law.',
        'You must not attempt to reverse engineer, overload, scrape or circumvent the security, credit or usage limits of the service, or resell access without our written permission.',
        'We may refuse a generation, remove content, or suspend or terminate an account that breaks these rules.',
      ] },
      { title: '6. Ownership of inputs and outputs', body: [
        'You keep ownership of the content you provide. You give us a limited licence to host, process and transform it only to operate the service for you.',
        `Subject to these terms, applicable law and third-party rights, you own the videos and other outputs you generate with ${BUSINESS_NAME} and may use them for personal and commercial purposes. Because AI models can produce similar output for other users, we cannot guarantee that an output is unique.`,
        `${BUSINESS_NAME}, its software, design, templates and brand remain our property.`,
      ] },
      { title: '7. AI output', body: [
        'AI output can be inaccurate, inconsistent or unsuitable. You are responsible for reviewing every output before you publish or rely on it, and for how you use it.',
      ] },
      { title: '8. Third-party services', body: [
        'Generations run on third-party AI and infrastructure providers listed in our Privacy Policy. Their availability is outside our control; when an engine is unavailable we may route your request to a comparable engine at the price shown before you confirm.',
      ] },
      { title: '9. Disclaimer and limitation of liability', body: [
        `The service is provided "as is" and "as available". To the maximum extent permitted by law, ${BUSINESS_NAME} disclaims all warranties, express or implied, including fitness for a particular purpose and non-infringement, and does not guarantee that every generation will succeed or meet your expectations.`,
        `To the maximum extent permitted by law, ${BUSINESS_NAME} will not be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or goodwill. Our total liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the claim.`,
        'Nothing in these terms limits liability that cannot be limited by law, or your statutory rights as a consumer.',
      ] },
      { title: '10. Termination', body: [
        'You can stop using the service and request account deletion at any time from Settings or by emailing us. We may suspend or end access for a breach of these terms. Sections 6 and 9 survive termination.',
      ] },
      { title: '11. Changes to these terms', body: [
        'We may update these terms. We will post the new version on this page with a new "last updated" date, and material changes will be notified in the product or by email. Continuing to use the service after a change means you accept it.',
      ] },
      { title: '12. Contact', body: [
        `Questions about these terms: ${SUPPORT_EMAIL}.`,
      ] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: `This Privacy Policy explains what personal data ${BUSINESS_NAME} collects when you use getvidverge.com and the ${BUSINESS_NAME} app, how we use it, who we share it with and the choices you have.`,
    sections: [
      { title: 'Data we collect', body: [
        'Account data: your email address and, if you provide them, your name and profile details.',
        'Content: the prompts, scripts, briefs, links, images, video, audio and brand details you submit, and the media we generate for you.',
        'Billing data: your credit balance, purchases and credit ledger. Card and payment details are collected and processed by Paddle; we do not see or store your full card number.',
        'Usage and device data: pages and features used, approximate location from IP address, browser and device type, referral and campaign parameters (such as utm tags), and error reports. Error reports exclude prompts and authentication tokens.',
        'Support data: messages you send us.',
      ] },
      { title: 'How we use data', body: [
        'To create and secure your account, run the generations you request, store your projects and library, maintain your credit balance, process purchases and refunds, prevent fraud and abuse, fix problems, improve the service and respond to support requests.',
        'If you opt in, to send product news and marketing emails. You can unsubscribe at any time.',
        'We do not sell your personal data, and we do not use your private content to train our own AI models.',
      ] },
      { title: 'Processors and service providers', body: [
        `${BUSINESS_NAME} shares data only with providers that help run the service, and only what each one needs: Audos (hosting, sign-in, database and email delivery); Paddle (payments, tax and invoicing, as Merchant of Record); Google (Gemini and Veo generation, cloud storage); OpenAI and Anthropic (text and planning); ElevenLabs (voice and music); Deepgram (transcription); HeyGen (avatars); Kling, Runway, Higgsfield and ByteDance models via OpenRouter (video generation); Remotion (video rendering); Apify and SerpAPI (public web and social research you request); and Meta, Reddit and Google advertising tools (measuring ad performance).`,
        'Some providers are located outside your country, including in the United States. Where required, transfers rely on appropriate safeguards such as standard contractual clauses.',
        'We may disclose data if required by law or to protect the rights, safety and security of our users and the service.',
      ] },
      { title: 'Cookies and similar technologies', body: [
        'Essential: a secure, HttpOnly session cookie and browser local storage keep you signed in and remember your preferences (for example theme and workspace mode). These are required for the service to work.',
        'Attribution: a first-party cookie stores the campaign parameters that brought you to the site for up to 24 hours.',
        'Advertising and analytics: we use the Meta Pixel, Reddit Pixel and Google Ads tag to measure sign-ups from our ads. You can block these with your browser settings or an ad-blocking extension without affecting the service.',
      ] },
      { title: 'Retention', body: [
        'We keep account, project and credit records while your account is active, and afterwards only as long as needed for legal, tax, security and billing obligations. Deleted library items remain recoverable for 30 days before permanent deletion.',
      ] },
      { title: 'Your rights', body: [
        'Depending on where you live, you may have the right to access, correct, export or delete your personal data, to object to or restrict certain processing, and to withdraw consent. You can delete your account from Settings, or email us to exercise any right. You may also complain to your local data protection authority.',
        `${BUSINESS_NAME} is not directed at children under 16, and we do not knowingly collect their data.`,
      ] },
      { title: 'Security', body: [
        'We use encryption in transit, access controls and server-side authorization for every credit and content operation. No system is perfectly secure, so please contact us if you believe your account has been compromised.',
      ] },
      { title: 'Changes', body: [
        'We will post any update to this policy on this page with a new "last updated" date and notify you of material changes.',
      ] },
      { title: 'Contact', body: [
        `For privacy questions or requests, email ${SUPPORT_EMAIL}.`,
      ] },
    ],
  },
  refund: {
    title: 'Refund Policy',
    intro: `How refunds work for ${BUSINESS_NAME} credit purchases. Payments are processed by Paddle, our Merchant of Record, and approved refunds are issued by Paddle to your original payment method.`,
    sections: [
      { title: 'How you pay', body: [
        `${BUSINESS_NAME} is pay per use. You buy one-time credit packs at ${CREDIT_PRICE} per credit and spend credits on the generations you choose. The exact cost of each generation is shown before you confirm it. New accounts receive ${FREE_TRIAL_CREDITS} free starter credits.`,
      ] },
      { title: `${REFUND_WINDOW_DAYS}-day refund on unused credits`, body: [
        `You can request a refund within ${REFUND_WINDOW_DAYS} days of a credit pack purchase. If none of the credits from that purchase have been used, we refund the full amount. If some have been used, we refund the unused credits from that purchase at the price you paid per credit.`,
        'Credits that have already been spent on a generation are not refundable, because the generation cost has already been incurred. Free starter credits and promotional credits have no cash value and are not refundable.',
      ] },
      { title: 'Subscriptions', body: [
        `${BUSINESS_NAME} does not currently sell subscriptions. If a subscription is offered in future, you can cancel at any time to stop future renewals, and you can request a refund of your first subscription charge within ${REFUND_WINDOW_DAYS} days if none of that period\'s credits have been used.`,
      ] },
      { title: 'Failed generations and billing errors', body: [
        'If a generation fails because of a platform or provider error, the credits it used are returned to your balance automatically. If that does not happen, contact us and we will restore them.',
        'If you were charged more than once for the same purchase, or charged in error, we refund the incorrect charge in full regardless of the time since purchase.',
        'Results that you simply do not like, from a clear and supported request, are not platform errors and are not refunded as credits. Verger can help you refine a brief before you spend more.',
      ] },
      { title: 'How to request a refund', body: [
        `Email ${SUPPORT_EMAIL} from the address on your account, with the date and amount of the charge (or your Paddle receipt number). You can also reply to your Paddle receipt or contact Paddle at paddle.net.`,
        `We aim to reply within ${REFUND_RESPONSE_TIME}. Approved refunds are issued by Paddle to the original payment method; the time for the money to appear depends on your bank or card issuer, usually 5 to 10 business days. Refunded credits are removed from your balance.`,
      ] },
      { title: 'Your statutory rights', body: [
        'Nothing in this policy limits any rights you have as a consumer under the law where you live, including any right of withdrawal or refund that cannot be waived.',
      ] },
    ],
  },
};

export default function LegalPage() {
  const page = resolvePublicPage<Page>(['privacy', 'refund', 'terms'], 'terms');
  const content = pages[page];
  return (
    <PublicPageChrome current={page}>
      <article className="mx-auto max-w-[760px] px-5 pt-14 sm:px-8">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--gold,#d4af37)]">{BUSINESS_NAME} legal</p>
        <h1 className="mt-4 text-[40px] font-black leading-none tracking-[-0.045em] sm:text-[56px]" style={{ fontFamily: 'var(--display)' }}>{content.title}</h1>
        <p className="mt-5 text-[15px] leading-7 text-[var(--muted,#9aa0ae)]">{content.intro}</p>
        <p className="mt-2 font-mono text-xs text-[var(--muted,#9aa0ae)]">Last updated {UPDATED}</p>
        <div className="mt-10 space-y-8">
          {content.sections.map((section) => (
            <section key={section.title} className="border-t border-[var(--line,#2a2e3a)] pt-6">
              <h2 className="text-xl font-bold tracking-[-0.015em]">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-[1.75] text-[var(--muted,#9aa0ae)]">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </PublicPageChrome>
  );
}
