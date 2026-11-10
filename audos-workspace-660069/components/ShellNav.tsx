import { ComponentType, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Music, Settings as SettingsIcon, X } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { ThemeToggle } from './ui/Molten';
import { useAmbientMusic } from '../hooks/useAmbientMusic';

export const SHELL_HEADER_HEIGHT = 60;
export const SHELL_DOCK_WIDTH = 244;
export type WorkspaceMode = 'agent' | 'manual';

export interface ShellNavItem {
  id: string;
  label: string;
  Icon: ComponentType<any>;
}

const SHELL_MOTION_STYLES = `
  @keyframes vv-shell-beam-sweep {
    0%, 100% { opacity: .18; transform: translate3d(-18%, 12%, 0) rotate(-18deg) scaleY(.92); }
    50% { opacity: .48; transform: translate3d(18%, -8%, 0) rotate(-11deg) scaleY(1.06); }
  }
  @keyframes vv-shell-active-glow {
    0%, 100% { opacity: .62; transform: scaleY(.72); }
    50% { opacity: 1; transform: scaleY(1); }
  }
  .vv-shell-beam { animation: vv-shell-beam-sweep 9s ease-in-out infinite; }
  .vv-shell-active-glow { animation: vv-shell-active-glow 3.8s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .vv-shell-beam, .vv-shell-active-glow { animation: none !important; }
    .vv-shell-lift { transition: none !important; transform: none !important; }
  }
`;

function WorkspaceModeSwitch({ mode, onModeChange, compact = false }: { mode: WorkspaceMode; onModeChange: (mode: WorkspaceMode) => void; compact?: boolean }) {
  return (
    <div
      role="group"
      aria-label="Workspace mode"
      className={`relative flex overflow-hidden rounded-xl border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-panel-strong)_92%,transparent)] p-1 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--space-text-primary)_5%,transparent)] ${compact ? 'flex-col gap-1' : 'gap-1'}`}
    >
      {(['agent', 'manual'] as const).map((value) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
            aria-pressed={selected}
            aria-label={value === 'agent' ? 'Agent mode' : 'Manual mode'}
            title={value === 'agent' ? 'Agent mode' : 'Manual mode'}
            className={`relative min-h-11 flex-1 overflow-hidden rounded-lg px-3 text-xs font-semibold transition-[color,transform,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--vg-focus)] ${compact ? 'px-1' : ''} ${selected ? 'text-[var(--vg-on-btn)] shadow-[0_8px_24px_color-mix(in_srgb,var(--vg-accent)_18%,transparent)]' : 'text-[var(--space-text-secondary)] hover:-translate-y-px hover:text-[var(--space-text-primary)]'}`}
            style={selected ? { background: 'var(--vg-btn)' } : undefined}
          >
            <span className="relative z-[1]">{compact ? value.charAt(0).toUpperCase() : value === 'agent' ? 'Agent' : 'Manual'}</span>
          </button>
        );
      })}
    </div>
  );
}

function AmbientMusicChip({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const music = useAmbientMusic();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = music.tracks.find((track) => track.id === music.trackId) || music.tracks[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          music.toggle();
          setOpen(true);
        }}
        aria-expanded={open}
        aria-pressed={music.enabled}
        aria-label={`Ambient music: ${music.enabled ? 'on' : 'off'} — ${selected.label}`}
        className={`vv-shell-lift flex min-h-11 w-full items-center rounded-[11px] border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-panel)_88%,transparent)] text-xs font-semibold text-[var(--space-text-secondary)] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--vg-accent)_32%,transparent)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)] ${compact ? 'justify-center px-2' : 'gap-2.5 px-3'}`}
        title={`Music ${music.enabled ? 'on' : 'off'}: ${selected.label}`}
      >
        <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--vg-selected-soft)] text-[var(--vg-selected)]">
          <Music className="h-4 w-4" aria-hidden="true" />
          {music.error ? <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--vg-warning)] shadow-[0_0_8px_var(--vg-warning)]" /> : music.playing ? <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--vg-selected)] shadow-[0_0_8px_var(--vg-selected)]" /> : null}
        </span>
        {compact ? null : <span className="truncate">{music.enabled ? selected.label : 'Music off'}</span>}
      </button>
      {music.error && !open ? <p role="status" className={`absolute bottom-12 z-[129] rounded-lg border border-[var(--vg-warning)] bg-[var(--space-surface-card)] px-2 py-1 text-[10px] text-[var(--vg-warning)] shadow-lg ${compact ? 'left-12 w-48' : 'left-0 w-full'}`}>{music.error}</p> : null}
      {open ? (
        <div className={`absolute bottom-12 z-[130] max-h-[min(70vh,520px)] w-64 overflow-y-auto rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_24%,var(--space-border-default))] bg-[color-mix(in_srgb,var(--space-surface-card)_97%,transparent)] p-3 shadow-[0_22px_60px_color-mix(in_srgb,var(--space-surface-page)_80%,transparent)] backdrop-blur-xl ${compact ? 'left-12' : 'left-0'}`} role="dialog" aria-label="Ambient music">
          <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
            <p className="text-xs font-bold text-[var(--space-text-primary)]">Ambient music</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close ambient music" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--space-text-muted)] hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <div className="space-y-1">
            {music.tracks.map((track) => (
              <button key={track.id} type="button" onClick={() => { music.selectTrack(track.id); setOpen(false); }} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)] ${track.id === music.trackId ? 'bg-[var(--vg-selected-soft)] text-[var(--vg-selected)]' : 'text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)]'}`}>
                <span>{track.label}</span>{track.id === music.trackId ? '✓' : ''}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs text-[var(--space-text-muted)]">Volume <span className="font-mono tabular-nums">{Math.round(music.volume * 100)}%</span><input className="mt-2 w-full accent-[var(--vg-selected)]" type="range" min="3" max="35" value={Math.round(music.volume * 100)} onChange={(event) => music.setVolume(Number(event.target.value) / 100)} /></label>
          {music.error ? <p className="mt-2 text-xs text-[var(--vg-warning)]">{music.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function NavLink({ item, active, collapsed, onSelect }: { item: ShellNavItem; active: boolean; collapsed: boolean; onSelect: (id: string) => void }) {
  const { Icon } = item;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={`vv-shell-lift group relative flex min-h-11 w-full items-center rounded-[12px] text-left transition-[transform,background-color,color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] ${collapsed ? 'justify-center px-1.5' : 'gap-3 px-2.5'} ${active ? 'bg-[image:var(--vg-gradient-selected)] text-[var(--space-text-primary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--vg-selected)_18%,transparent),0_10px_26px_color-mix(in_srgb,var(--vg-selected)_8%,transparent)]' : 'text-[var(--space-text-secondary)] hover:-translate-y-px hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)]'}`}
    >
      {active ? <span aria-hidden="true" className="vv-shell-active-glow absolute inset-y-2 left-0 w-[3px] origin-center rounded-r-full bg-[image:var(--vg-gradient-brand)] shadow-[0_0_14px_var(--vg-accent)]" /> : null}
      <span
        className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border ${active ? 'border-transparent text-[var(--vg-accent)] shadow-[var(--vg-glow)]' : 'border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-panel-strong)_88%,transparent)] text-[var(--space-text-secondary)] group-hover:border-[color-mix(in_srgb,var(--vg-accent)_28%,transparent)] group-hover:text-[var(--vg-accent)]'}`}
        style={active ? { background: 'linear-gradient(var(--space-surface-panel-strong), var(--space-surface-panel-strong)) padding-box, var(--vg-gradient-brand) border-box' } : undefined}
      >
        <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
        {active ? <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-[var(--space-surface-panel-strong)] bg-[var(--vg-selected)] shadow-[0_0_9px_var(--vg-selected)]" /> : null}
      </span>
      {!collapsed ? <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em]">{item.label}</span> : null}
      {collapsed ? <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+10px)] z-[110] hidden whitespace-nowrap rounded-lg border border-[color-mix(in_srgb,var(--vg-accent)_24%,var(--space-border-default))] bg-[var(--space-surface-panel-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--space-text-primary)] shadow-xl group-hover:block group-focus-visible:block">{item.label}</span> : null}
    </button>
  );
}

export interface ShellDockProps {
  workspaceName: string;
  items: ShellNavItem[];
  utilityItems: ShellNavItem[];
  homeItem: ShellNavItem;
  activeId: string | null;
  onSelect: (id: string) => void;
  onHome: () => void;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  jobsSlot?: ReactNode;
  creditsSlot?: ReactNode;
  onPlans?: () => void;
  planLabel?: string;
}

export function ShellDock({ workspaceName, items, utilityItems, homeItem, activeId, onSelect, onHome, drawerOpen, onDrawerClose, mode, onModeChange, jobsSlot, creditsSlot, onPlans, planLabel = 'Plans' }: ShellDockProps) {
  const [collapsed, setCollapsed] = useState(() => { try { return window.localStorage.getItem('vv-sidebar-collapsed') === '1'; } catch { return false; } });
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const width = collapsed ? 72 : SHELL_DOCK_WIDTH;

  useEffect(() => {
    document.documentElement.style.setProperty('--vv-sidebar-width', `${width}px`);
    try { window.localStorage.setItem('vv-sidebar-collapsed', collapsed ? '1' : '0'); } catch {}
    return () => { document.documentElement.style.removeProperty('--vv-sidebar-width'); };
  }, [collapsed, width]);

  const select = useCallback((id: string) => {
    if (id === homeItem.id) onHome(); else onSelect(id);
    onDrawerClose();
  }, [homeItem.id, onDrawerClose, onHome, onSelect]);

  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.querySelector<HTMLElement>('button')?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onDrawerClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [drawerOpen, onDrawerClose]);

  const utilityCard = (mobile = false) => (
    <div className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_22%,var(--space-border-default))] bg-[color-mix(in_srgb,var(--space-surface-panel)_88%,transparent)] p-2 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--space-text-primary)_5%,transparent)]">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[image:var(--vg-gradient-brand)] opacity-80" />
      <div className="flex min-h-11 items-center justify-between gap-2">{jobsSlot}{creditsSlot}</div>
      {onPlans ? (
        <button
          type="button"
          onClick={() => { onPlans(); if (mobile) onDrawerClose(); }}
          className="vv-shell-lift mt-1 flex min-h-11 w-full items-center justify-between rounded-[10px] px-3 text-left text-xs font-semibold text-[var(--space-text-primary)] transition-[transform,background-color] duration-200 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"
          style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--vg-accent) 14%, transparent), color-mix(in srgb, var(--vg-selected) 7%, transparent))' }}
        >
          <span>{planLabel}</span><ChevronRight className="h-4 w-4 text-[var(--vg-accent)]" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const brandBlock = (mobile = false) => (
    <div className={`relative overflow-hidden border-b border-[var(--space-border-default)] ${mobile ? 'h-[68px]' : 'h-[76px]'}`}>
      <span aria-hidden="true" className="vv-shell-beam absolute -bottom-14 left-4 h-32 w-20 origin-bottom rounded-full bg-[image:var(--vg-gradient-brand)] opacity-30 blur-2xl" />
      <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_18%_120%,color-mix(in_srgb,var(--vg-accent)_16%,transparent),transparent_52%)]" />
      <button type="button" onClick={onHome} className={`relative z-[1] flex h-full w-full items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--vg-focus)] ${mobile ? 'gap-3 px-3' : collapsed ? 'justify-center' : 'gap-3 px-4'}`} aria-label={`${workspaceName} home`}>
        <span className="grid shrink-0 place-items-center">
          <BrandLogo size={mobile ? 42 : collapsed ? 42 : 46} glow={false} />
        </span>
        {(mobile || !collapsed) ? <strong className="min-w-0 truncate text-left text-[15px] font-semibold tracking-[-0.03em] text-[var(--space-text-primary)]">Vidverge</strong> : null}
      </button>
    </div>
  );

  return (
    <>
      <style>{SHELL_MOTION_STYLES}</style>
      <aside
        className="fixed inset-y-0 left-0 z-[90] hidden flex-col border-r border-[color-mix(in_srgb,var(--gold)_18%,var(--space-border-default))] shadow-[20px_0_60px_color-mix(in_srgb,var(--space-surface-page)_65%,transparent)] backdrop-blur-xl transition-[width] duration-200 md:flex"
        style={{ width, background: 'var(--side-bg)', backgroundImage: 'radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--gold) 10%, transparent), transparent 28%)' }}
        aria-label={`${workspaceName} sidebar`}
      >
        {brandBlock()}
        <div className="border-b border-[var(--space-border-default)] p-2"><WorkspaceModeSwitch mode={mode} onModeChange={onModeChange} compact={collapsed} /></div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="Apps">
          {items.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} onSelect={select} />)}
          {utilityItems.length ? <div className="my-2 h-px bg-[linear-gradient(90deg,transparent,var(--space-border-strong),transparent)]" /> : null}
          {utilityItems.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} onSelect={select} />)}
        </nav>
        <div className="shrink-0 space-y-2 border-t border-[var(--space-border-default)] p-2">
          <ThemeToggle compact={collapsed} />
          <AmbientMusicChip compact={collapsed} />
          {!collapsed ? utilityCard() : null}
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`vv-shell-lift flex min-h-11 w-full items-center rounded-[11px] text-xs font-semibold text-[var(--space-text-muted)] transition-[transform,background-color,color] duration-200 hover:-translate-y-px hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)] ${collapsed ? 'justify-center' : 'gap-2 px-3'}`}>{collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Collapse sidebar</>}</button>
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[110] md:hidden">
          <button type="button" onClick={onDrawerClose} aria-label="Close navigation" className="absolute inset-0 h-full w-full bg-[color-mix(in_srgb,var(--space-surface-page)_78%,transparent)] backdrop-blur-sm" />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${workspaceName} navigation`}
            className="absolute inset-y-0 left-0 flex w-[min(310px,88vw)] flex-col border-r border-[color-mix(in_srgb,var(--vg-accent)_22%,var(--space-border-default))] bg-[color-mix(in_srgb,var(--space-surface-card)_98%,transparent)] shadow-[24px_0_70px_color-mix(in_srgb,var(--space-surface-page)_70%,transparent)] backdrop-blur-xl"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', backgroundImage: 'radial-gradient(circle at 10% 4%, color-mix(in srgb, var(--vg-accent) 10%, transparent), transparent 28%), radial-gradient(circle at 96% 42%, color-mix(in srgb, var(--vg-selected) 5%, transparent), transparent 34%)' }}
          >
            <div className="relative">
              {brandBlock(true)}
              <button type="button" onClick={onDrawerClose} aria-label="Close navigation" className="absolute right-2 top-3 z-[2] grid h-11 w-11 place-items-center rounded-[11px] border border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-panel)_86%,transparent)] text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="border-b border-[var(--space-border-default)] p-3"><WorkspaceModeSwitch mode={mode} onModeChange={onModeChange} /></div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="Apps">
              {items.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={false} onSelect={select} />)}
              {utilityItems.length ? <div className="my-2 h-px bg-[linear-gradient(90deg,transparent,var(--space-border-strong),transparent)]" /> : null}
              {utilityItems.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={false} onSelect={select} />)}
            </nav>
            <div className="shrink-0 space-y-2 border-t border-[var(--space-border-default)] p-3">
              <ThemeToggle />
              <AmbientMusicChip />
              {utilityCard(true)}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

export interface ShellHeaderProps {
  workspaceName: string;
  sectionLabel: string | null;
  jobsSlot?: ReactNode;
  creditsSlot?: ReactNode;
  onHome: () => void;
  onSettings: () => void;
  ownerLinks?: ShellNavItem[];
  onOpenOwnerLink?: (id: string) => void;
  onPlans: () => void;
  planLabel: string;
  onCloseSection?: () => void;
  onOpenDrawer: () => void;
  drawerOpen: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

/** Mobile-only top bar. Desktop navigation and account actions live in the sidebar. */
export function ShellHeader({ workspaceName, sectionLabel, jobsSlot, creditsSlot, onHome, onSettings, onPlans, planLabel, onCloseSection, onOpenDrawer, drawerOpen }: ShellHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-[100] flex h-[60px] items-center gap-2 border-b border-[color-mix(in_srgb,var(--vg-accent)_18%,var(--space-border-default))] bg-[color-mix(in_srgb,var(--space-surface-card)_96%,transparent)] px-2 shadow-[0_10px_32px_color-mix(in_srgb,var(--space-surface-page)_45%,transparent)] backdrop-blur-xl md:hidden">
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-[image:var(--vg-gradient-brand)] opacity-60" />
      <button type="button" onClick={onOpenDrawer} aria-label="Open sidebar" aria-expanded={drawerOpen} className="grid h-11 w-11 place-items-center rounded-[11px] border border-[color-mix(in_srgb,var(--vg-accent)_24%,var(--space-border-default))] bg-[color-mix(in_srgb,var(--space-surface-panel)_86%,transparent)] text-[var(--vg-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><Menu className="h-5 w-5" aria-hidden="true" /></button>
      <button type="button" onClick={onHome} className="flex min-h-11 min-w-0 items-center gap-2 rounded-[10px] px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><BrandLogo size={38} glow={false} /><span className="min-w-0 text-left"><strong className="block truncate text-xs text-[var(--space-text-primary)]">{workspaceName}</strong><span className="block max-w-[24vw] truncate text-[10px] text-[var(--space-text-muted)]">{sectionLabel || 'Verge'}</span></span></button>
      <div className="ml-auto flex items-center gap-1"><div className="w-11"><AmbientMusicChip compact /></div>{jobsSlot}{creditsSlot}<div className="relative"><button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Account menu" aria-expanded={menuOpen} className="grid h-11 w-11 place-items-center rounded-full border border-[color-mix(in_srgb,var(--vg-accent)_28%,transparent)] bg-[var(--vg-accent-soft)] text-xs font-bold text-[var(--vg-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">{workspaceName.charAt(0).toUpperCase()}</button>{menuOpen ? <div className="absolute right-0 top-12 w-48 rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_22%,var(--space-border-default))] bg-[var(--space-surface-card)] p-1.5 shadow-2xl"><button type="button" onClick={() => { setMenuOpen(false); onSettings(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><SettingsIcon className="h-4 w-4" /> Settings</button><button type="button" onClick={() => { setMenuOpen(false); onPlans(); }} className="flex min-h-11 w-full items-center justify-between rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]"><span>{planLabel}</span><ChevronRight className="h-4 w-4" /></button>{onCloseSection ? <button type="button" onClick={() => { setMenuOpen(false); onCloseSection(); }} className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)]">Close view</button> : null}</div> : null}</div></div>
    </header>
  );
}
