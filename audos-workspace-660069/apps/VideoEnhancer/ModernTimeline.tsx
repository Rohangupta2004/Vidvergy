import { useMemo, useRef } from 'react';
import { Copy, Magnet, MoveHorizontal, Scissors, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
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
}

export default function ModernTimeline(props: ModernTimelineProps) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const duration = Math.max(1, editorDuration(props.project));
  const pixelsPerSecond = 54 * props.zoom;
  const width = Math.max(640, duration * pixelsPerSecond);

  const timeAt = (clientX: number) => {
    const bounds = laneRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const raw = (clientX - bounds.left) / pixelsPerSecond;
    return clampEditor(props.snap ? Math.round(raw * 10) / 10 : raw, 0, duration);
  };

  const ticks = useMemo(() => {
    const step = pixelsPerSecond > 100 ? .5 : pixelsPerSecond > 44 ? 1 : pixelsPerSecond > 20 ? 2 : 5;
    const output: number[] = [];
    for (let time = 0; time <= duration; time += step) output.push(time);
    return output;
  }, [duration, pixelsPerSecond]);

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

  return (
    <section className="vx-timeline" aria-label="Multi-track timeline">
      <div className="vx-tlbar">
        <button className="vx-btn" onClick={props.onSplit}><Scissors size={13} /> Split</button>
        <button className="vx-icon" title="Duplicate selection" onClick={props.onDuplicate}><Copy size={13} /></button>
        <button className="vx-icon" title="Delete selection" onClick={props.onDelete}><Trash2 size={13} /></button>
        <button className={`vx-btn${props.snap ? ' on' : ''}`} onClick={() => props.onSnap(!props.snap)}><Magnet size={13} /> Snap</button>
        <button className={`vx-btn${props.ripple ? ' on' : ''}`} title="Close gaps after deleting clips" onClick={() => props.onRipple(!props.ripple)}><MoveHorizontal size={13} /> Ripple</button>
        <span className="vx-grow" />
        <button className="vx-icon" title="Zoom out" onClick={() => props.onZoom(Math.max(.35, props.zoom / 1.3))}><ZoomOut size={13} /></button>
        <span className="vx-time">{props.zoom.toFixed(2)}×</span>
        <button className="vx-icon" title="Zoom in" onClick={() => props.onZoom(Math.min(6, props.zoom * 1.3))}><ZoomIn size={13} /></button>
      </div>
      <div className="vx-tlbody">
        <div className="vx-labels">
          <div className="vx-track-label ruler">Tracks</div>
          {TRACKS.map((track) => (
            <div className="vx-track-label" key={track.id}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: track.color }} />
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
                  const visual = (track.id === 'video' || track.id === 'broll') && asset?.preview ? `linear-gradient(90deg,${track.color}CC,${track.color}88),url(${asset.preview})` : undefined;
                  return <div
                    key={item.id}
                    className={`vx-clip vx-clip-${track.id}${props.selected.includes(item.id) ? ' on' : ''}`}
                    style={{ left: item.start * pixelsPerSecond, width: Math.max(5, item.duration * pixelsPerSecond), backgroundColor: track.color, backgroundImage: visual }}
                    onPointerDown={(event) => moveItem(event, item)}
                  >
                    <button className="vx-handle l" aria-label="Resize start" onPointerDown={(event) => resize(event, item, 'start')} />
                    <span>{item.name}</span>
                    <button className="vx-handle r" aria-label="Resize end" onPointerDown={(event) => resize(event, item, 'end')} />
                  </div>;
                })}
              </div>
            ))}
            <div className="vx-playhead" style={{ left: props.playhead * pixelsPerSecond }} />
          </div>
        </div>
      </div>
    </section>
  );
}
