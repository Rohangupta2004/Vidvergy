import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, CornerDownLeft, Eye, Lock, Maximize2, Minus, MoreHorizontal, Plus,
  Redo2, Scissors, Sparkles, Trash2, Undo2, VolumeX, X,
} from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  TRACKS, captionItems, clampEditor, editorDuration, formatEditorTime, newEditorId,
  type EditorItem, type EditorOperation, type EditorProject, type EditorTrack,
} from './modernEditorModel';

export interface ModernTimelineProps {
  project: EditorProject;
  pending?: EditorOperation[];
  pendingLabel?: string;
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
  onPendingDrop?: (index: number) => void;
  onPendingAccept?: () => void;
  onPendingDiscard?: () => void;
}

type ContextMenu = { x: number; y: number; item: EditorItem } | null;
type AddKind = 'text' | 'caption' | 'music' | 'broll' | 'ai-broll' | 'sfx' | 'voice' | 'upload';
const PREF_KEY = 'video-enhancer:v3-timeline';

function loadPrefs() {
  try { return { showEmpty: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { showEmpty: false }; }
}

function ghostTrack(operation: EditorOperation): EditorTrack {
  if (operation.type === 'add_broll') return 'broll';
  if (operation.type === 'add_text') return 'text';
  if (operation.type === 'add_music' || operation.type === 'add_sfx') return 'music';
  if (operation.type === 'add_voiceover') return 'voice';
  if (['set_style', 'set_word_role', 'set_caption_behind', 'add_captions'].includes(operation.type)) return 'caption';
  return 'video';
}

function ghostLabel(operation: EditorOperation) {
  if (operation.type === 'add_broll' && Number(operation.credits) > 0) return `${operation.credits} cr · AI B-roll`;
  if (operation.type === 'add_effect') return operation.effectId || 'Effect';
  return String(operation.why || operation.type.replace(/_/g, ' '));
}

export default function ModernTimeline(props: ModernTimelineProps) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [ask, setAsk] = useState('');
  const [menu, setMenu] = useState<ContextMenu>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [transitionFor, setTransitionFor] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const duration = Math.max(1, editorDuration(props.project));
  const pixelsPerSecond = 54 * props.zoom;
  const width = Math.max(760, duration * pixelsPerSecond);
  const pending = props.pending || [];

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pending.length) props.onPendingDiscard?.();
      setMoreOpen(false); setAddOpen(false); setTransitionFor(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [pending.length, props.onPendingDiscard]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close); window.addEventListener('blur', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('blur', close); };
  }, [menu]);

  const timeAt = (clientX: number) => {
    const bounds = laneRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const raw = (clientX - bounds.left + laneRef.current!.scrollLeft) / pixelsPerSecond;
    if (!props.snap) return clampEditor(raw, 0, duration);
    const points = [props.playhead, ...props.project.items.flatMap((item) => [item.start, item.start + item.duration]), ...props.project.words.flatMap((word) => [word.start, word.end])];
    const nearest = points.reduce((best, point) => Math.abs(point - raw) < Math.abs(best - raw) ? point : best, Math.round(raw * 10) / 10);
    return clampEditor(Math.abs(nearest - raw) * pixelsPerSecond <= 8 ? nearest : Math.round(raw * 10) / 10, 0, duration);
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
      const start = words[index - 1].end; const gap = words[index].start - start;
      if (gap >= .6) marks.push({ start, duration: gap });
    }
    words.filter((word) => word.filler).forEach((word) => marks.push({ start: word.start, duration: Math.max(.12, word.end - word.start), filler: true }));
    return marks;
  }, [props.project.words]);
  const tracks = TRACKS.filter((track) => track.id === 'video' || prefs.showEmpty || props.project.items.some((item) => item.track === track.id) || pending.some((operation) => ghostTrack(operation) === track.id));

  const resize = (event: ReactPointerEvent, item: EditorItem, edge: 'start' | 'end') => {
    event.stopPropagation(); props.onCheckpoint();
    const originX = event.clientX; const originalStart = item.start; const originalDuration = item.duration;
    const move = (next: PointerEvent) => {
      const raw = (next.clientX - originX) / pixelsPerSecond; const delta = props.snap ? Math.round(raw * 10) / 10 : raw;
      props.onEdit((project) => ({ ...project, items: project.items.map((entry) => {
        if (entry.id !== item.id) return entry;
        if (edge === 'start') { const start = clampEditor(originalStart + delta, 0, originalStart + originalDuration - .1); return { ...entry, start, sourceIn: (entry.sourceIn || 0) + (start - originalStart) * (entry.speed || 1), duration: originalDuration + originalStart - start }; }
        return { ...entry, duration: Math.max(.1, originalDuration + delta) };
      }) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const moveItem = (event: ReactPointerEvent, item: EditorItem) => {
    if ((event.target as HTMLElement).closest('.vx-handle,.vx-join')) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const ids = additive ? Array.from(new Set([...props.selected, item.id])) : props.selected.includes(item.id) ? props.selected : [item.id];
    props.onSelect(ids); props.onSeek(item.start + .01); props.onCheckpoint();
    const originX = event.clientX; const starts = new Map(props.project.items.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, entry.start]));
    const move = (next: PointerEvent) => {
      const raw = (next.clientX - originX) / pixelsPerSecond; const delta = props.snap ? Math.round(raw * 10) / 10 : raw;
      props.onEdit((project) => ({ ...project, items: project.items.map((entry) => starts.has(entry.id) ? { ...entry, start: clampEditor((starts.get(entry.id) || 0) + delta, 0, Math.max(duration, entry.start + entry.duration)) } : entry) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const submitAsk = () => { const instruction = ask.trim(); if (!instruction || !props.onAsk) return; props.onAsk(instruction); setAsk(''); };
  const addItem = (kind: AddKind) => {
    if (kind === 'upload') { document.getElementById('vx-timeline-upload')?.click(); setAddOpen(false); return; }
    props.onCheckpoint();
    props.onEdit((project) => {
      if (kind === 'caption') return { ...project, caption: { ...project.caption, enabled: true }, items: [...project.items.filter((item) => item.track !== 'caption'), ...captionItems(project.words, project.caption.wordsPerLine)] };
      const map: Record<Exclude<AddKind, 'caption' | 'upload'>, { track: EditorTrack; name: string; duration: number; credits?: number }> = {
        text: { track: 'text', name: 'Text', duration: 3 }, music: { track: 'music', name: 'Music', duration: Math.max(1, duration - props.playhead) },
        broll: { track: 'broll', name: 'Stock B-roll · free', duration: 3 }, 'ai-broll': { track: 'broll', name: '12 cr · AI B-roll', duration: 4, credits: 12 },
        sfx: { track: 'music', name: 'Sound effect', duration: 1 }, voice: { track: 'voice', name: 'Voice-over', duration: 3 },
      };
      const value = map[kind as Exclude<AddKind, 'caption' | 'upload'>];
      return { ...project, items: [...project.items, { id: newEditorId(value.track), track: value.track, name: value.name, start: props.playhead, duration: value.duration, text: kind === 'text' ? 'Text' : undefined, volume: value.track === 'broll' ? 0 : 1, credits: value.credits, ai: Boolean(value.credits) }] };
    });
    setAddOpen(false);
  };
  const setTransition = (itemId: string, transition: string) => {
    props.onCheckpoint();
    props.onEdit((project) => ({ ...project, items: project.items.map((item) => item.id === itemId ? { ...item, transition } : item) }));
    setTransitionFor(null);
  };

  return <section className={`vx-timeline${props.tall ? ' tall' : ''}`} aria-label="Multi-track timeline">
    <div className="vx-tlbar" role="toolbar" aria-label="Timeline editing controls">
      <button className="vx-icon" disabled={!props.canUndo} title="Undo (Ctrl/Cmd+Z)" onClick={props.onUndo}><Undo2 size={14} /></button>
      <button className="vx-icon" disabled={!props.canRedo} title="Redo (Shift+Ctrl/Cmd+Z)" onClick={props.onRedo}><Redo2 size={14} /></button>
      <span className="vx-divider" />
      <button className="vx-btn" onClick={props.onSplit}><Scissors size={13} /><span>Split</span></button>
      <button className="vx-btn" onClick={props.onDelete}><Trash2 size={13} /><span>Delete</span></button>
      <span className="vx-divider" />
      <button className={`vx-btn${props.project.silence.enabled ? ' on' : ''}`} title="Review detected pauses" onClick={props.onOpenSilences}><Scissors size={13} /><span>{props.project.silence.enabled && props.project.silence.removedSeconds > 0 ? `Silence cuts · ${props.project.silence.removedSeconds.toFixed(1)}s` : `Silences (${silenceMarks.length})`}</span></button>
      {pending.length ? <div className="vx-ai-proposal"><Sparkles size={14} /><span>✦ {pending.length} AI edits for “{props.pendingLabel || 'your request'}”</span><button onClick={props.onPendingAccept}>Accept all</button><button onClick={props.onPendingDiscard}>Discard</button></div> : <div className="vx-ai-ask"><Sparkles size={14} /><input value={ask} onChange={(event) => setAsk(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitAsk(); }} placeholder="Describe an edit…" aria-label="Describe an edit for AI" /><button type="button" onClick={submitAsk} disabled={!ask.trim() || !props.onAsk}><CornerDownLeft size={12} /></button></div>}
      <div className="vx-pop-wrap"><button className={`vx-icon${moreOpen ? ' on' : ''}`} aria-label="More timeline options" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={15} /></button>{moreOpen ? <div className="vx-tl-pop"><label><input type="checkbox" checked={props.snap} onChange={() => props.onSnap(!props.snap)} />Snap to clips</label><label><input type="checkbox" checked={props.ripple} onChange={() => props.onRipple(!props.ripple)} />Close gaps on delete / Ripple</label><label><input type="checkbox" checked={Boolean(props.tall)} onChange={() => props.onTall?.(!props.tall)} />Taller tracks</label><label><input type="checkbox" checked={prefs.showEmpty} onChange={() => setPrefs((value: any) => ({ ...value, showEmpty: !value.showEmpty }))} />Show empty tracks</label><small>V select · B blade · S split · Del delete · Space play · J/K/L shuttle</small></div> : null}</div>
      <span className="vx-divider" />
      <div className="vx-zoom"><button className="vx-icon" title="Zoom out" onClick={() => props.onZoom(Math.max(.35, props.zoom / 1.3))}><Minus size={13} /></button><input type="range" aria-label="Timeline zoom" min={.35} max={6} step={.05} value={props.zoom} onChange={(event) => props.onZoom(Number(event.target.value))} /><button className="vx-icon" title="Zoom in" onClick={() => props.onZoom(Math.min(6, props.zoom * 1.3))}><Plus size={13} /></button></div>
      <button className="vx-btn" onClick={() => props.onZoom(Math.max(.35, Math.min(6, (laneRef.current?.clientWidth || 760) / Math.max(1, duration * 54))))}><Maximize2 size={13} /><span>Fit</span></button>
    </div>
    <div className="vx-tlbody">
      <div className="vx-labels"><div className="vx-track-label ruler">Tracks</div>{tracks.map((track) => <div className="vx-track-label" key={track.id}><span className="dot" style={{ background: track.color }} />{track.label}<span className="vx-track-actions"><Eye size={12} /><Lock size={12} />{['music', 'voice'].includes(track.id) ? <VolumeX size={12} /> : null}</span></div>)}<div className="vx-track-label add"><button onClick={() => setAddOpen((value) => !value)}><Plus size={13} />Add</button>{addOpen ? <div className="vx-add-menu">{([['text','Text'],['caption','Captions'],['music','Music'],['broll','B-roll · stock · free'],['ai-broll','12 cr · AI B-roll'],['sfx','Sound effect'],['voice','Voice-over'],['upload','Upload file']] as [AddKind,string][]).map(([id,label]) => <button key={id} onClick={() => addItem(id)}>{label}</button>)}</div> : null}<input id="vx-timeline-upload" hidden type="file" accept="video/*,audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; props.onCheckpoint(); props.onEdit((project) => ({ ...project, items: [...project.items, { id: newEditorId(file.type.startsWith('audio/') ? 'voice' : 'video'), track: file.type.startsWith('audio/') ? 'voice' : 'video', name: file.name, start: props.playhead, duration: 3, volume: 1 }] })); event.target.value = ''; }} /></div></div>
      <div className="vx-lanes" ref={laneRef}><div className="vx-lane-grid" style={{ width }}>
        <div className="vx-ruler" onPointerDown={(event) => props.onSeek(timeAt(event.clientX))}>{ticks.map((time) => <span className="vx-line" key={time} style={{ left: time * pixelsPerSecond }}>{formatEditorTime(time)}</span>)}</div>
        {tracks.map((track) => <div className="vx-lane" data-track={track.id} aria-label={`${track.label} track`} key={track.id} onPointerDown={(event) => props.onSeek(timeAt(event.clientX))}>
          {props.project.items.filter((item) => item.track === track.id).map((item) => {
            const asset = props.project.assets.find((entry) => entry.id === item.assetId);
            const visual = (track.id === 'video' || track.id === 'broll') && asset?.preview ? `linear-gradient(90deg,${track.color}B8,${track.color}70),url(${asset.preview})` : undefined;
            return <div key={item.id} className={`vx-clip vx-clip-${track.id}${props.selected.includes(item.id) ? ' on' : ''}`} style={{ left: item.start * pixelsPerSecond, width: Math.max(5, item.duration * pixelsPerSecond), backgroundColor: track.color, backgroundImage: visual }} onPointerDown={(event) => moveItem(event, item)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); props.onSelect([item.id]); props.onSeek(timeAt(event.clientX)); setMenu({ x: Math.min(event.clientX, window.innerWidth - 232), y: Math.min(event.clientY, window.innerHeight - 250), item }); }}>
              <button className="vx-handle l" aria-label="Resize start" onPointerDown={(event) => resize(event, item, 'start')} /><span>{item.name}</span><button className="vx-handle r" aria-label="Resize end" onPointerDown={(event) => resize(event, item, 'end')} />
              {track.id === 'video' && item.start > 0 ? <button className="vx-join" aria-label="Add transition or clip" onPointerDown={(event) => event.stopPropagation()} onClick={() => setTransitionFor(transitionFor === item.id ? null : item.id)}><Plus size={11} /></button> : null}
              {transitionFor === item.id ? <div className="vx-transition-menu">{[['cut','Cut'],['crossfade','Crossfade'],['dipToBlack','Dip to black'],['flashCut','Flash'],['whipPan','Whip pan']].map(([id,label]) => <button key={id} onClick={() => setTransition(item.id,id)}>{label}</button>)}<button onClick={() => { addItem('broll'); setTransitionFor(null); }}>Insert B-roll</button></div> : null}
            </div>;
          })}
          {pending.map((operation, index) => ghostTrack(operation) === track.id ? <div key={`ghost-${index}`} className={`vx-ghost${['cut','remove_silences','remove_fillers'].includes(operation.type) ? ' danger' : ''}`} style={{ left: Math.max(0, Number(operation.t ?? operation.start) || 0) * pixelsPerSecond, width: Math.max(34, Math.max(.6, Number(operation.end) - Number(operation.start) || 2) * pixelsPerSecond) }}><span>{ghostLabel(operation)}</span><button title="Keep this edit" onClick={() => undefined}><Check size={11} /></button><button title="Drop this edit" onClick={() => props.onPendingDrop?.(index)}><X size={11} /></button></div> : null)}
          {track.id === 'voice' ? silenceMarks.map((mark, index) => <span key={`${mark.start}-${index}`} className={`vx-silence${mark.filler ? ' filler' : ''}`} title={mark.filler ? 'Filler word' : `${mark.duration.toFixed(1)}s silence`} style={{ left: mark.start * pixelsPerSecond, width: Math.max(4, mark.duration * pixelsPerSecond) }} />) : null}
        </div>)}
        <div className="vx-lane vx-add-lane" /><div className="vx-playhead" style={{ left: props.playhead * pixelsPerSecond }} />
      </div></div>
    </div>
    {menu ? <div className="vx-context" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}><button onClick={() => { props.onSplit(); setMenu(null); }}><Scissors size={14} />Split at playhead</button><button onClick={() => { props.onDuplicate(); setMenu(null); }}><Copy size={14} />Duplicate</button><button disabled>Detach audio</button><hr /><button onClick={() => { props.onOpenSilences?.(); setMenu(null); }}><Sparkles size={14} />Review silences</button><button className="danger" onClick={() => { props.onDelete(); setMenu(null); }}><Trash2 size={14} />Delete</button></div> : null}
  </section>;
}
