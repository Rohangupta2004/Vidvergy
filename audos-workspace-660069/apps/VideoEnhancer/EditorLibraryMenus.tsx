import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { ChevronDown, Film, FolderOpen, Library, Loader2, Plus, RefreshCw, Video, X } from 'lucide-react';
import type { VideoHistoryRow } from '../../lib/videoHistory';
import { formatEditorTime } from './modernEditorModel';

interface DropdownProps {
  label: string;
  title: string;
  count?: number;
  icon: ReactNode;
  busy?: boolean;
  headerAction?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
}

/** Compact toolbar button + overlay. Lives in the stage bar, never in the panel flow. */
function ToolbarDropdown({ label, title, count, icon, busy, headerAction, onOpenChange, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);
  const close = useCallback(() => setOpenState(false), [setOpenState]);

  const measure = useCallback(() => {
    const button = buttonRef.current;
    const bar = button?.closest('.vx-stagebar') as HTMLElement | null;
    if (!button || !bar) return;
    const host = (bar.closest('.vx-center') as HTMLElement | null) || bar;
    const buttonBox = button.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    const width = Math.max(220, Math.min(348, barBox.width - 16));
    const left = Math.max(8, Math.min(buttonBox.left - barBox.left, barBox.width - width - 8));
    const maxHeight = Math.max(160, Math.min(420, hostBox.bottom - barBox.bottom - 14));
    setPlace({ left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>('[data-dd-item]')?.focus({ preventScroll: true });
  }, [open]);

  const onPopKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Keep editor shortcuts (space, S, delete, arrows...) from firing while the menu has focus.
    event.stopPropagation();
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>('[data-dd-item]') || []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = items[Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    event.preventDefault();
    next?.focus();
  };

  const style = place ? ({ '--dd-left': `${place.left}px`, '--dd-w': `${place.width}px`, '--dd-mh': `${place.maxHeight}px` } as CSSProperties) : undefined;

  return (
    <div className="vx-dd" ref={rootRef}>
      <button ref={buttonRef} type="button" className="vx-dd-btn" aria-haspopup="dialog" aria-expanded={open} title={title} onClick={() => setOpenState(!open)}>
        {busy ? <Loader2 size={14} className="vx-dd-spin" /> : icon}
        <span className="txt">{label}</span>
        {count ? <span className="count">{count}</span> : null}
        <ChevronDown size={13} className="chev" />
      </button>
      {open ? (
        <div ref={popRef} className="vx-dd-pop" role="dialog" aria-label={label} style={style} onKeyDown={onPopKeyDown}>
          <div className="vx-dd-head">
            <b>{label}</b>
            <span className="meta">{count ? `${count} saved` : 'Nothing yet'}</span>
            {headerAction}
            <button type="button" className="vx-icon vx-dd-close" title="Close" aria-label={`Close ${label}`} onClick={() => { close(); buttonRef.current?.focus(); }}><X size={14} /></button>
          </div>
          <div className="vx-dd-scroll">{children(close)}</div>
        </div>
      ) : null}
    </div>
  );
}

interface ProjectMenuRow {
  id: number;
  title: string;
  status: string;
  aspect: string;
  duration_s: number;
}

export function ProjectsMenu<T extends ProjectMenuRow>({ projects, activeId, onOpenProject }: { projects: T[]; activeId: number | null; onOpenProject: (row: T) => void }) {
  return (
    <ToolbarDropdown label="Projects" title="Saved projects: reopen an autosaved edit" count={projects.length} icon={<FolderOpen size={14} />}>
      {(close) => projects.length ? (
        <ul className="vx-dd-list">
          {projects.map((row) => (
            <li key={row.id}>
              <button type="button" data-dd-item className={`vx-dd-item${row.id === activeId ? ' current' : ''}`} onClick={() => { onOpenProject(row); close(); }}>
                <span className="ico"><Film size={14} /></span>
                <span className="body"><b>{row.title || 'Untitled project'}</b><small>{row.status} · {row.aspect} · {formatEditorTime(row.duration_s)}</small></span>
                <span className="tag">{row.id === activeId ? 'Open' : 'Reopen'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="vx-dd-empty"><b>No saved projects</b><p>Your edits autosave and can be reopened from here.</p></div>
      )}
    </ToolbarDropdown>
  );
}

export function LibraryMenu({ rows, busy, onRefresh, onAdd }: { rows: VideoHistoryRow[]; busy: boolean; onRefresh: () => void; onAdd: (row: VideoHistoryRow, broll?: boolean) => void }) {
  return (
    <ToolbarDropdown
      label="Library"
      title="Video Library: add a finished video to the timeline"
      count={rows.length}
      icon={<Library size={14} />}
      busy={busy}
      headerAction={<button type="button" className="vx-icon" title="Refresh library" aria-label="Refresh library" disabled={busy} onClick={onRefresh}>{busy ? <Loader2 size={14} className="vx-dd-spin" /> : <RefreshCw size={14} />}</button>}
    >
      {(close) => rows.length ? (
        <ul className="vx-dd-list">
          {rows.map((row) => (
            <li key={row.id} className="vx-dd-row">
              <button type="button" data-dd-item className="vx-dd-item" title="Add to the video track" onClick={() => { onAdd(row); close(); }}>
                <span className="ico"><Video size={14} /></span>
                <span className="body"><b>{row.title}</b><small>{row.app_id}{row.duration_sec ? ` · ${row.duration_sec}s` : ''}</small></span>
                <span className="tag">Add</span>
              </button>
              <button type="button" data-dd-item className="vx-icon vx-dd-aux" title="Add as B-roll at the playhead" aria-label={`Add ${row.title} as B-roll`} onClick={() => { onAdd(row, true); close(); }}><Plus size={14} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="vx-dd-empty"><b>{busy ? 'Loading library…' : 'Library is empty'}</b><p>Finished videos from your other studios will show up here. Add one, then describe the edit in the Agent tab.</p></div>
      )}
    </ToolbarDropdown>
  );
}
