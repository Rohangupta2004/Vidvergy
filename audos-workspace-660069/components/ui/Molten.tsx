import React from 'react';
import { Moon, Sun } from 'lucide-react';

export type VidvergeTheme = 'dark' | 'light';
export const VIDVERGE_THEME_KEY = 'vv-theme';
export const VIDVERGE_THEME_EVENT = 'vv-theme-change';

export function readVidvergeTheme(): VidvergeTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(VIDVERGE_THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyVidvergeTheme(theme: VidvergeTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  try { window.localStorage.setItem(VIDVERGE_THEME_KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent(VIDVERGE_THEME_EVENT, { detail: { theme } }));
}

export function installVidvergeTheme(): VidvergeTheme {
  const theme = readVidvergeTheme();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }
  return theme;
}

export function ThemeToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const [theme, setTheme] = React.useState<VidvergeTheme>(() => installVidvergeTheme());

  React.useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent).detail?.theme;
      setTheme(next === 'light' ? 'light' : 'dark');
    };
    window.addEventListener(VIDVERGE_THEME_EVENT, sync);
    return () => window.removeEventListener(VIDVERGE_THEME_EVENT, sync);
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => { applyVidvergeTheme(next); setTheme(next); }}
      aria-label={`Use ${next} theme`}
      title={`Use ${next} theme`}
      className={`vv-theme-toggle vv-shell-lift flex min-h-11 items-center rounded-[11px] border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-panel)_88%,transparent)] text-xs font-semibold text-[var(--space-text-secondary)] transition-[transform,border-color,background-color] hover:-translate-y-px hover:border-[var(--line-gold)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)] ${compact ? 'w-full justify-center px-2' : 'w-full gap-2.5 px-3'} ${className}`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line-gold)] bg-[var(--molten-soft)] text-[var(--gold)]">
        {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </span>
      {compact ? null : <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>}
    </button>
  );
}

export function Rim({
  children,
  working = false,
  className = '',
  as = 'div',
}: {
  children: React.ReactNode;
  working?: boolean;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  const Tag = as as any;
  return <Tag className={`rim ${working ? 'is-working' : ''} ${className}`}>{children}</Tag>;
}

export default Rim;
