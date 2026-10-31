import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy, CornerDownLeft, Magnet, MousePointer2, MoveHorizontal, Redo2, Rows3,
  Scissors, Sparkles, Trash2, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  TRACKS, clampEditor, editorDuration, formatEditorTime,
  type EditorItem, type EditorProject,
} from './modernEditorModel';

export interface ModernTimelineProps {
  project: EditorProject;
  selected: string[];
  playhead: number;
  zoom: number;
  snap: boolean;
  ripple: boolean;
  tall?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSeek: (time: number) => void;
  onSelect: (ids: string[]) => void;
  onEdit: (fn: (project: EditorProject) => EditorProject) => void;
  onZoom: (zoom: number) => void;
  onSnap: (snap: boolean) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCheckpoint: () => void;
  onRipple: (ripple: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onTall?: (tall: boolean) => void;
  onOpenSilences?: () => void;
  onAsk?: (instruction: string) => void;
}

type ContextMenu = { x: number; y: number; item: EditorItem } | null;

function frameCode(seconds: number) {
  const frames = Math.max(0, Math.round(seconds * 30));
  const ff = frames % 30;
  const totalSeconds = Math.floor(frames / 30);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return [hh, mm, ss, ff].map((value) => String(value).padStart(2, '0')).join(':');
}

export default function ModernTimeline(props: ModernTimelineProps) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [ask, setAsk] = useState('');
  const [menu, setMenu] = useState<ContextMenu>(null);
  const duration = Math.max(1, editorDuration(props.project));
  const pixelsPerSecond = 54 * props.zoom;
  const width = Math.max(760, duration * pixelsPerSecond);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  const timeAt = (clientX: number) => {
    const bounds = laneRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const raw = (clientX - bounds.left + laneRef.current!.scrollLeft) / pixelsPerSecond;
    return clampEditor(props.snap ? Math.round(raw * 10) / 10 : raw, 0, duration);
  };

  const ticks = useMemo(() => {
    const step = pixelsPerSecond > 100 ? .5 : pixelsPerSecond > 44 ? 1 : pixelsPerSecond > 20 ? 2 : 5;
    const output: number[] = [];
    for (let time = 0; time <= duration; time += step) output.push(time);
    return output;
  }, [duration, pixelsPerSecond]);

  const silenceMarks = useMemo(() => {
    const words = [...props.project.words].filter((word) => !word.removed).sort((a, b) => a.start - b.start);
    const marks: { start: number; duration: number; filler?: boolean }[] = [];
    for (let index = 1; index < words.length; index += 1) {
      const start = words[index - 1].end;
      const gap = words[index].start - start;
      if (gap >= .6) marks.push({ start, duration: gap });
    }
    words.filter((word) => word.filler).forEach((word) => marks.push({ start: word.start, duration: Math.max(.12, word.end - word.start), filler: true }));
    return marks;
  }, [props.project.words]);

  const resize = (event: ReactPointerEvent, item: EditorItem, edge: 'start' | 'end') => {
    event.stopPropagation();
    props.onCheckpoint();
    const originX = event.clientX;
    const originalStart = item.start;
    const originalDuration = item.duration;
    const move = (next: PointerEvent) => {
      const raw = (next.clientX - originX) / pixelsPerSecond;
      const delta = props.snap ? Math.round(raw * 10) / 10 : raw;
      props.onEdit((project) => ({
        ...project,
        items: project.items.map((entry) => {
          if (entry.id !== item.id) return entry;
          if (edge === 'start') {
            const start = clampEditor(originalStart + delta, 0, originalStart + originalDuration - .1);
            return { ...entry, start, sourceIn: (entry.sourceIn || 0) + (start - originalStart) * (entry.speed || 1), duration: originalDuration + originalStart - start };
          }
          return { ...entry, duration: Math.max(.1, originalDuration + delta) };
        }),
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const moveItem = (event: ReactPointerEvent, item: EditorItem) => {
    const target = event.target as HTMLElement;
    if (target.closest('.vx-handle')) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const ids = additive ? Array.from(new Set([...props.selected, item.id])) : props.selected.includes(item.id) ? props.selected : [item.id];
    props.onSelect(ids);
    props.onSeek(item.start + .01);
    props.onCheckpoint();
    const originX = event.clientX;
    const starts = new Map(props.project.items.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, entry.start]));
    const move = (next: PointerEvent) => {
      const raw = (next.clientX - originX) / pixelsPerSecond;
      const delta = props.snap ? Math.round(raw * 10) / 10 : raw;
      props.onEdit((project) => ({
        ...project,
        items: project.items.map((entry) => starts.has(entry.id) ? { ...entry, start: clampEditor((starts.get(entry.id) || 0) + delta, 0, Math.max(duration, entry.start + entry.duration)) } : entry),
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const submitAsk = () => {
    const instruction = ask.trim();
    if (!instruction || !props.onAsk) return;
    props.onAsk(instruction);
    setAsk('');
  };

  return (
    <section className={`vx-timeline${props.tall ? ' tall' : ''}`} aria-label="Multi-track timeline">
      <button className="vx-tl-grip" aria-label="Toggle taller timeline" title="Taller tracks" onClick={() => props.onTall?.(!props.tall)} />
      <div className="vx-tlbar">
        <div className="vx-toolseg" role="group" aria-label="Timeline tool">
          <button className="on" title="Select (V)" aria-label="Select tool"><MousePointer2 size={14} /></button>
          <button disabled title="Blade tool placeholder — use Split at playhead" aria-label="Blade tool"><Scissors size={14} /></button>
        </div>
        <button className="vx-icon" disabled={!props.canUndo} title="Undo (Ctrl+Z)" onClick={props.onUndo}><Undo2 size={14} /></button>
        <button className="vx-icon" disabled={!props.canRedo} title="Redo (Ctrl+Shift+Z)" onClick={props.onRedo}><Redo2 size={14} /></button>
        <button className="vx-btn desktop-only" onClick={props.onSplit}><Scissors size={13} /><span>Split</span></button>
        <button className="vx-btn desktop-only" onClick={props.onDelete}><Trash2 size={13} /><span>Delete</span></button>
        <button className={`vx-btn desktop-only${props.snap ? ' on' : ''}`} onClick={() => props.onSnap(!props.snap)}><Magnet size={13} /><span>Snap</span></button>
        <button className={`vx-btn desktop-only${props.ripple ? ' on' : ''}`} title="Close gaps after deleting clips" onClick={() => props.onRipple(!props.ripple)}><MoveHorizontal size={13} /><span>Ripple</span></button>
        <button className="vx-btn desktop-only" title="Review detected pauses" onClick={props.onOpenSilences}><Scissors size={13} /><span>Silences {silenceMarks.filter((mark) => !mark.filler).length || ''}</span></button>
        <div className="vx-ai-ask">
          <Sparkles size={14} />
          <input value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitAsk(); }} placeholder="Ask AI: cut silences, bold captions, make it 30s…" aria-label="Ask AI to edit" />
          <button type="button" onClick={submitAsk} disabled={!ask.trim() || !props.onAsk}><CornerDownLeft size={12} /></button>
        </div>
        <span className="vx-time desktop-only" title="Frame-accurate playhead at 30 fps">{frameCode(props.playhead)}</span>
        <button className={`vx-icon${props.tall ? ' on' : ''}`} title="Taller tracks" aria-label="Taller tracks" onClick={() => props.onTall?.(!props.tall)}><Rows3 size={14} /></button>
        <div className="vx-row desktop-only">
          <button className="vx-icon" title="Zoom out" onClick={() => props.onZoom(Math.max(.35, props.zoom / 1.3))}><ZoomOut size={13} /></button>
          <button className="vx-icon" title="Zoom in" onClick={() => props.onZoom(Math.min(6, props.zoom * 1.3))}><ZoomIn size={13} /></button>
        </div>
      </div>
      <div className="vx-tlbody">
        <div className="vx-labels">
          <div className="vx-track-label ruler">Tracks</div>
          {TRACKS.map((track) => (
            <div className="vx-track-label" key={track.id}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: track.color }} />
              {track.label}
            </div>
          ))}
        </div>
        <div className="vx-lanes" ref={laneRef}>
          <div className="vx-lane-grid" style={{ width }}>
            <div className="vx-ruler" onPointerDown={(event) => props.onSeek(timeAt(event.clientX))}>
              {ticks.map((time) => <span className="vx-line" key={time} style={{ left: time * pixelsPerSecond }}>{formatEditorTime(time)}</span>)}
            </div>
            {TRACKS.map((track) => (
              <div className="vx-lane" data-track={track.id} aria-label={`${track.label} track`} key={track.id} onPointerDown={(event) => props.onSeek(timeAt(event.clientX))}>
                {props.project.items.filter((item) => item.track === track.id).map((item) => {
                  const asset = props.project.assets.find((entry) => entry.id === item.assetId);
                  const visual = (track.id === 'video' || track.id === 'broll') && asset?.preview ? `linear-gradient(90deg,${track.color}B8,${track.color}70),url(${asset.preview})` : undefined;
                  return <div
                    key={item.id}
                    className={`vx-clip vx-clip-${track.id}${props.selected.includes(item.id) ? ' on' : ''}`}
                    style={{ left: item.start * pixelsPerSecond, width: Math.max(5, item.duration * pixelsPerSecond), backgroundColor: track.color, backgroundImage: visual }}
                    onPointerDown={(event) => moveItem(event, item)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onSelect([item.id]);
                      props.onSeek(timeAt(event.clientX));
                      setMenu({ x: Math.min(event.clientX, window.innerWidth - 232), y: Math.min(event.clientY, window.innerHeight - 250), item });
                    }}
                  >
                    <button className="vx-handle l" aria-label="Resize start" onPointerDown={(event) => resize(event, item, 'start')} />
                    <span>{item.name}</span>
                    <button className="vx-handle r" aria-label="Resize end" onPointerDown={(event) => resize(event, item, 'end')} />
                  </div>;
                })}
                {track.id === 'voice' ? silenceMarks.map((mark, index) => <span key={`${mark.start}-${index}`} className={`vx-silence${mark.filler ? ' filler' : ''}`} title={mark.filler ? 'Filler word' : `${mark.duration.toFixed(1)}s silence`} style={{ left: mark.start * pixelsPerSecond, width: Math.max(4, mark.duration * pixelsPerSecond) }} />) : null}
              </div>
            ))}
            <div className="vx-playhead" style={{ left: props.playhead * pixelsPerSecond }} />
          </div>
        </div>
      </div>
      {menu ? <div className="vx-context" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
        <button onClick={() => { props.onSplit(); setMenu(null); }}><Scissors size={14} />Split at playhead</button>
        <button onClick={() => { props.onDuplicate(); setMenu(null); }}><Copy size={14} />Duplicate</button>
        <button disabled title="Audio detaching is not available in this editor">Detach audio</button>
        <hr />
        <button onClick={() => { props.onOpenSilences?.(); setMenu(null); }}><Sparkles size={14} />Review silences</button>
        <button className="danger" onClick={() => { props.onDelete(); setMenu(null); }}><Trash2 size={14} />Delete</button>
      </div> : null}
    </section>
  );
}
