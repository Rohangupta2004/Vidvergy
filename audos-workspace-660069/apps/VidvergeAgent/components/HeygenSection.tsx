import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const HEYGEN_CSS = `
.vv-skeleton {
  background: linear-gradient(90deg, color-mix(in srgb, var(--vg-gold) 7%, transparent), color-mix(in srgb, var(--vg-gold) 16%, transparent), color-mix(in srgb, var(--vg-gold) 7%, transparent));
  background-size: 220% 100%;
  animation: vv-skeleton 1.4s ease-in-out infinite;
}
@keyframes vv-skeleton {
  from { background-position: 180% 0; }
  to { background-position: -40% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .vv-skeleton { animation: none; }
}
`;

interface HeygenSectionProps {
  title: string;
  summary: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function HeygenSection({ title, summary, icon, open, onToggle, children }: HeygenSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--vg-border)] bg-[var(--vg-surface)]">
      <style>{HEYGEN_CSS}</style>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--vg-hover)]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_14%,transparent)] text-[var(--vg-accent)]">
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] text-[var(--vg-text)]">{title}</span>
            <span className="shrink-0 rounded-full border border-[var(--vg-border)] px-1.5 py-[1px] text-[9px] uppercase tracking-[0.18em] text-[var(--vg-muted)]">
              Optional
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--vg-muted)]">{summary}</span>
        </span>

        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--vg-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && <div className="border-t border-[var(--vg-border)] px-4 py-3.5">{children}</div>}
    </section>
  );
}
