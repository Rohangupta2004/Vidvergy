import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, History as HistoryIcon, Redo2, Undo2 } from 'lucide-react';
import type { EditorProject } from './modernEditorModel';
import { CAPTION_PRESETS } from './captionPresets';

const TRACK_NOUN: Record<string, string> = {
  video: 'video clip', broll: 'B-roll', caption: 'caption', text: 'text layer', music: 'music track', voice: 'voice clip',
};
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function describeEditorStep(prev: EditorProject, next: EditorProject): string {
  if (prev === next) return 'No change';
  if (next.assets.length > prev.assets.length) {
    const asset = next.assets[next.assets.length - 1];
    return `Added ${asset?.name || 'media'}`;
  }
  if (prev.words !== next.words) {
    if (next.words.length !== prev.words.length || prev.words.some((word, index) => word.id !== next.words[index]?.id)) return 'Transcribed audio';
    const toggled = next.words.filter((word, index) => Boolean(word.removed) !== Boolean(prev.words[index].removed));
    if (toggled.length) return toggled.every((word) => word.removed) ? `Cut ${plural(toggled.length, 'word')}` : `Restored ${plural(toggled.length, 'word')}`;
    return 'Edited transcript word';
  }
  const prevIds = new Set(prev.items.map((item) => item.id));
  const nextIds = new Set(next.items.map((item) => item.id));
  const added = next.items.filter((item) => !prevIds.has(item.id));
  const removed = prev.items.filter((item) => !nextIds.has(item.id));
  const addedMain = added.filter((item) => item.track !== 'caption');
  const removedMain = removed.filter((item) => item.track !== 'caption');
  if (!addedMain.length && !removedMain.length && (added.length || removed.length)) return 'Updated captions';
  if (removedMain.length === 1 && addedMain.length === 2 && addedMain.every((item) => item.track === removedMain[0].track)) return 'Split clip';
  if (removedMain.length === 1 && addedMain.length === 1 && addedMain[0].track === removedMain[0].track) return `Replaced ${TRACK_NOUN[addedMain[0].track] || 'clip'}`;
  if (addedMain.length && !removedMain.length) return addedMain.length === 1 ? `Added ${TRACK_NOUN[addedMain[0].track] || 'clip'}` : `Added ${plural(addedMain.length, 'clip')}`;
  if (removedMain.length && !addedMain.length) return removedMain.length === 1 ? `Deleted ${TRACK_NOUN[removedMain[0].track] || 'clip'}` : `Deleted ${plural(removedMain.length, 'clip')}`;
  if (addedMain.length || removedMain.length) return 'Re-cut timeline';
  if (prev.caption !== next.caption) {
    if (prev.caption.styleId !== next.caption.styleId) {
      const preset = CAPTION_PRESETS.find((entry) => entry.styleId === next.caption.styleId);
      return `Caption style: ${preset?.label || next.caption.styleId}`;
    }
    if (prev.caption.wordsPerLine !== next.caption.wordsPerLine) return 'Caption line length';
    if (prev.caption.x !== next.caption.x || prev.caption.y !== next.caption.y || prev.caption.position !== next.caption.position) return 'Moved captions';
    return 'Caption design';
  }
  if (prev.aspect !== next.aspect) return `Aspect ratio ${next.aspect}`;
  if (prev.effects !== next.effects) return 'Effects changed';
  if (prev.grade !== next.grade || prev.brightness !== next.brightness || prev.contrast !== next.contrast || prev.saturation !== next.saturation) return 'Colour and light';
  if (prev.title !== next.title) return 'Renamed project';
  if (prev.customPresets !== next.customPresets) return 'Saved preset';
  const changed = next.items.filter((item) => { const before = prev.items.find((entry) => entry.id === item.id); return before && before !== item; });
  if (changed.length) {
    const item = changed[0];
    const before = prev.items.find((entry) => entry.id === item.id)!;
    const noun = TRACK_NOUN[item.track] || 'clip';
    if (changed.length > 1 && changed.every((entry) => prev.items.find((old) => old.id === entry.id)?.start !== entry.start)) return `Moved ${plural(changed.length, 'clip')}`;
    if (before.text !== item.text) return 'Edited text';
    if (before.duration !== item.duration || before.sourceIn !== item.sourceIn) return `Trimmed ${noun}`;
    if (before.start !== item.start) return `Moved ${noun}`;
    if (before.volume !== item.volume || before.fadeIn !== item.fadeIn || before.fadeOut !== item.fadeOut) return 'Adjusted audio';
    if (before.speed !== item.speed) return 'Changed speed';
    if (before.crop !== item.crop) return 'Cropped clip';
    if (before.transition !== item.transition) return 'Changed transition';
    return `Adjusted ${noun}`;
  }
  return 'Edit';
}

interface HistoryMenuProps {
  past: EditorProject[];
  present: EditorProject;
  future: EditorProject[];
  onJump: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export default function EditorHistoryMenu({ past, present, future, onJump, onUndo, onRedo }: HistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const current = past.length;
  const steps = past.length + future.length;

  const entries = useMemo(() => {
    if (!open) return [];
    const states = [...past, present, ...future];
    return states.map((state, index) => ({ index, label: index === 0 ? 'Original state' : describeEditorStep(states[index - 1], state) })).reverse();
  }, [open, past, present, future]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
    active?.focus({ preventScroll: true });
  }, [open]);

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || []);
    const at = options.indexOf(document.activeElement as HTMLElement);
    const next = options[Math.max(0, Math.min(options.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div className="vx-hist" ref={rootRef}>
      <button ref={buttonRef} type="button" className="vx-hist-btn" aria-haspopup="listbox" aria-expanded={open} title="History: past actions, click to jump" onClick={() => setOpen((value) => !value)}>
        <HistoryIcon size={14} />
        <span className="txt">History</span>
        {steps ? <span className="count">{steps}</span> : null}
        <ChevronDown size={13} className="chev" />
      </button>
      {open ? (
        <div className="vx-hist-pop" role="dialog" aria-label="Edit history" onKeyDown={(event) => { if (event.key === ' ') event.stopPropagation(); }}>
          <div className="vx-hist-head">
            <b>History</b>
            <span className="meta">Step {current} of {steps}</span>
            <button type="button" className="vx-icon" disabled={!past.length} title="Undo" aria-label="Undo" onClick={onUndo}><Undo2 size={14} /></button>
            <button type="button" className="vx-icon" disabled={!future.length} title="Redo" aria-label="Redo" onClick={onRedo}><Redo2 size={14} /></button>
          </div>
          {steps ? (
            <ul className="vx-hist-list" role="listbox" aria-label="Actions, newest first" ref={listRef} onKeyDown={onListKeyDown}>
              {entries.map(({ index, label }) => (
                <li key={index} role="presentation">
                  <button type="button" role="option" aria-selected={index === current} className={`vx-hist-item${index === current ? ' current' : ''}${index > current ? ' future' : ''}`} onClick={() => { if (index !== current) onJump(index); setOpen(false); }}>
                    <span className="mark">{index === current ? <Check size={13} /> : <i />}</span>
                    <span className="label">{label}</span>
                    <span className="tag">{index === current ? 'Now' : index > current ? 'Redo' : index === 0 ? 'Start' : `Step ${index}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="vx-hist-empty"><b>No actions yet</b><p>Edits you make appear here, so you can step back to any point.</p></div>
          )}
        </div>
      ) : null}
    </div>
  );
}
