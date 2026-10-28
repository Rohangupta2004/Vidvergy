import { ComponentType, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Settings as SettingsIcon, X } from 'lucide-react';
import BrandLogo from './BrandLogo';

export const SHELL_HEADER_HEIGHT = 60;
export const SHELL_DOCK_WIDTH = 244;
export type WorkspaceMode = 'agent' | 'manual';

export interface ShellNavItem {
  id: string;
  label: string;
  Icon: ComponentType<any>;
}

function WorkspaceModeSwitch({ mode, onModeChange, compact = false }: { mode: WorkspaceMode; onModeChange: (mode: WorkspaceMode) => void; compact?: boolean }) {
  return (
    <div role="group" aria-label="Workspace mode" className={`flex rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel-strong)] p-1 ${compact ? 'flex-col' : ''}`}>
      {(['agent', 'manual'] as const).map((value) => <button key={value} type="button" onClick={() => onModeChange(value)} aria-pressed={mode === value} title={value === 'agent' ? 'Agent mode' : 'Manual mode'} className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--vg-focus)] ${mode === value ? 'bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)]'} ${compact ? 'px-1' : ''}`}>{compact ? value.charAt(0).toUpperCase() : value === 'agent' ? 'Agent' : 'Manual'}</button>)}
    </div>
  );
}

function NavLink({ item, active, collapsed, onSelect }: { item: ShellNavItem; active: boolean; collapsed: boolean; onSelect: (id: string) => void }) {
  const { Icon } = item;
  return (
    <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`group relative flex min-h-11 w-full items-center rounded-[10px] text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? 'bg-[color-mix(in_srgb,var(--vg-accent)_15%,transparent)] text-[var(--vg-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--vg-accent)_38%,transparent)]' : 'text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)]'}`}>
      {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--vg-accent)]" /> : null}
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed ? <span className="min-w-0 truncate text-[13px] font-semibold">{item.label}</span> : null}
      {collapsed ? <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+10px)] z-[110] hidden whitespace-nowrap rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-panel-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--space-text-primary)] shadow-xl group-hover:block group-focus-visible:block">{item.label}</span> : null}
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
    return () => document.documentElement.style.removeProperty('--vv-sidebar-width');
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

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-[90] hidden flex-col border-r border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-card)_96%,transparent)] shadow-[18px_0_50px_rgba(0,0,0,.2)] backdrop-blur-xl transition-[width] duration-200 md:flex" style={{ width }} aria-label={`${workspaceName} sidebar`}>
        <button type="button" onClick={onHome} className={`flex h-[72px] shrink-0 items-center border-b border-[var(--space-border-default)] ${collapsed ? 'justify-center' : 'gap-3 px-4'}`} aria-label={`${workspaceName} home`}>
          <BrandLogo size={collapsed ? 42 : 46} glow={false} />
          {!collapsed ? <span className="min-w-0 text-left"><strong className="block truncate text-sm text-[var(--space-text-primary)]">{workspaceName}</strong><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-[var(--space-text-muted)]">Multi-agent video operator</span></span> : null}
        </button>

        <div className="border-b border-[var(--space-border-default)] p-2"><WorkspaceModeSwitch mode={mode} onModeChange={onModeChange} compact={collapsed} /></div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-label="Apps">
          {!collapsed ? <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[.16em] text-[var(--space-text-muted)]">Workspace</p> : null}
          {items.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} onSelect={select} />)}
          {utilityItems.length ? <div className="my-2 h-px bg-[var(--space-border-default)]" /> : null}
          {utilityItems.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={collapsed} onSelect={select} />)}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-[var(--space-border-default)] p-2">
          {!collapsed ? <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-panel)] p-2"><div className="flex min-h-9 items-center justify-between gap-2">{jobsSlot}{creditsSlot}</div>{onPlans ? <button type="button" onClick={onPlans} className="mt-1 min-h-9 w-full rounded-lg text-left text-xs font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)]">{planLabel}</button> : null}</div> : null}
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed} className={`flex min-h-10 w-full items-center rounded-[10px] text-xs font-semibold text-[var(--space-text-muted)] hover:bg-[var(--vg-hover)] hover:text-[var(--space-text-primary)] ${collapsed ? 'justify-center' : 'gap-2 px-3'}`}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Collapse sidebar</>}</button>
        </div>
      </aside>

      {drawerOpen ? <div className="fixed inset-0 z-[110] md:hidden"><button type="button" onClick={onDrawerClose} aria-label="Close navigation" className="absolute inset-0 h-full w-full bg-black/70" /><aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={`${workspaceName} navigation`} className="absolute inset-y-0 left-0 flex w-[min(310px,88vw)] flex-col border-r border-[var(--space-border-default)] bg-[var(--space-surface-card)] shadow-2xl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}><div className="flex h-[64px] items-center gap-3 border-b border-[var(--space-border-default)] px-3"><BrandLogo size={42} glow={false} /><strong className="text-sm text-[var(--space-text-primary)]">{workspaceName}</strong><button type="button" onClick={onDrawerClose} aria-label="Close navigation" className="ml-auto grid h-11 w-11 place-items-center rounded-[10px] text-[var(--space-text-muted)] hover:bg-[var(--vg-hover)]"><X className="h-5 w-5" /></button></div><div className="border-b border-[var(--space-border-default)] p-3"><WorkspaceModeSwitch mode={mode} onModeChange={onModeChange} /></div><nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">{items.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={false} onSelect={select} />)}{utilityItems.length ? <div className="my-2 h-px bg-[var(--space-border-default)]" /> : null}{utilityItems.map((item) => <NavLink key={item.id} item={item} active={activeId === item.id} collapsed={false} onSelect={select} />)}</nav><div className="border-t border-[var(--space-border-default)] p-3"><div className="flex min-h-10 items-center justify-between gap-2">{jobsSlot}{creditsSlot}</div>{onPlans ? <button type="button" onClick={() => { onPlans(); onDrawerClose(); }} className="mt-2 min-h-10 w-full rounded-[10px] border border-[var(--space-border-default)] text-sm font-semibold text-[var(--space-text-primary)]">{planLabel}</button> : null}</div></aside></div> : null}
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
    <header className="fixed inset-x-0 top-0 z-[100] flex h-[60px] items-center gap-2 border-b border-[var(--space-border-default)] bg-[color-mix(in_srgb,var(--space-surface-card)_96%,transparent)] px-2 backdrop-blur-xl md:hidden">
      <button type="button" onClick={onOpenDrawer} aria-label="Open sidebar" aria-expanded={drawerOpen} className="grid h-11 w-11 place-items-center rounded-[10px] border border-[var(--space-border-default)] text-[var(--space-text-secondary)]"><Menu className="h-5 w-5" /></button>
      <button type="button" onClick={onHome} className="flex min-w-0 items-center gap-2"><BrandLogo size={38} glow={false} /><span className="min-w-0 text-left"><strong className="block truncate text-xs text-[var(--space-text-primary)]">{workspaceName}</strong><span className="block max-w-[24vw] truncate text-[10px] text-[var(--space-text-muted)]">{sectionLabel || 'Home'}</span></span></button>
      <div className="ml-auto flex items-center gap-1">{jobsSlot}{creditsSlot}<div className="relative"><button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Account menu" aria-expanded={menuOpen} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--vg-accent-soft)] text-xs font-bold text-[var(--vg-accent)]">{workspaceName.charAt(0).toUpperCase()}</button>{menuOpen ? <div className="absolute right-0 top-12 w-48 rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-1.5 shadow-2xl"><button type="button" onClick={() => { setMenuOpen(false); onSettings(); }} className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)]"><SettingsIcon className="h-4 w-4" /> Settings</button><button type="button" onClick={() => { setMenuOpen(false); onPlans(); }} className="flex min-h-11 w-full items-center justify-between rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)]"><span>{planLabel}</span><ChevronRight className="h-4 w-4" /></button>{onCloseSection ? <button type="button" onClick={() => { setMenuOpen(false); onCloseSection(); }} className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-sm font-semibold text-[var(--space-text-secondary)] hover:bg-[var(--vg-hover)]">Close view</button> : null}</div> : null}</div></div>
    </header>
  );
}
