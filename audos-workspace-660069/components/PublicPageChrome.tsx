import type { ReactNode } from 'react';
import GlobalStyles from './ui/GlobalStyles';
import { VIDVERGE_LOGO_IMAGE_URL } from './BrandLogo';

export const BUSINESS_NAME = 'Vidverge';
export const SUPPORT_EMAIL = 'support@getvidverge.com';

// On the custom domain the hosting edge redirects /terms and /privacy to the platform's own policies,
// so in-site links use these aliases, which serve the same Vidverge pages (see config.json routes).
export const PUBLIC_PAGES = [
  { id: 'pricing', label: 'Pricing', href: '/pricing' },
  { id: 'terms', label: 'Terms of Service', href: '/terms-of-service' },
  { id: 'privacy', label: 'Privacy Policy', href: '/privacy-policy' },
  { id: 'refund', label: 'Refund Policy', href: '/refund' },
] as const;

export type PublicPageId = (typeof PUBLIC_PAGES)[number]['id'];

/** Resolves which public page is being viewed from the path, the hash or the platform deep link. */
export function resolvePublicPage<T extends string>(candidates: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const sources = [
    window.location.pathname,
    window.location.hash.slice(1),
    new URLSearchParams(window.location.search).get('app') || '',
    String((window as any).__DEEP_LINK_APP_ID__ || ''),
  ].map((value) => value.toLowerCase());
  for (const source of sources) {
    const match = candidates.find((candidate) => source.includes(candidate));
    if (match) return match;
  }
  return fallback;
}

export default function PublicPageChrome({ current, children }: { current: PublicPageId; children: ReactNode }) {
  return (
    <div className="vv-dark min-h-screen bg-[var(--void,#0b0d12)] text-[var(--ivory,#f5f6f8)]" style={{ fontFamily: 'var(--body)' }}>
      <GlobalStyles />
      <header className="border-b border-[var(--line,#2a2e3a)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3 no-underline" aria-label={`${BUSINESS_NAME} home`}>
            <img src={VIDVERGE_LOGO_IMAGE_URL} alt="" width={44} height={26} style={{ width: 44, height: 26, objectFit: 'contain' }} />
            <span className="text-[17px] font-bold tracking-[-0.03em] text-[var(--ivory,#f5f6f8)]">{BUSINESS_NAME}</span>
          </a>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {PUBLIC_PAGES.map((page) => (
              <a
                key={page.id}
                href={page.href}
                aria-current={page.id === current ? 'page' : undefined}
                className={page.id === current ? 'font-semibold text-[var(--gold,#d4af37)]' : 'text-[var(--muted,#9aa0ae)] hover:text-[var(--gold-hi,#e6c45a)]'}
              >
                {page.label}
              </a>
            ))}
            <a href="/" className="rounded-[10px] border border-[var(--gold,#d4af37)] px-3 py-2 font-semibold text-[var(--gold,#d4af37)] hover:text-[var(--gold-hi,#e6c45a)]">
              Start free
            </a>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-[var(--line,#2a2e3a)]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-[var(--muted,#9aa0ae)] sm:px-8">
          <div className="flex items-center gap-3">
            <img src={VIDVERGE_LOGO_IMAGE_URL} alt="" width={32} height={19} style={{ width: 32, height: 19, objectFit: 'contain' }} />
            <span>© 2026 {BUSINESS_NAME}. Contact: <a className="text-[var(--gold,#d4af37)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {PUBLIC_PAGES.map((page) => (
              <a key={page.id} href={page.href} className="hover:text-[var(--gold-hi,#e6c45a)]">{page.label}</a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
