export type EditorAspect = '9:16' | '1:1' | '16:9' | '4:5' | 'free';
export type EditorTrack = 'video' | 'broll' | 'caption' | 'text' | 'music' | 'voice';

export interface EditorAsset {
  id: string;
  name: string;
  url: string;
  preview: string;
  duration: number;
  kind: 'video' | 'image';
}

export interface EditorWord {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number | null;
  filler?: boolean;
  removed?: boolean;
}

export interface EditorEffect {
  id: string;
  type: string;
  enabled: boolean;
  intensity: number;
  scope: 'clip' | 'timeline';
  itemId?: string;
}

export interface EditorItem {
  id: string;
  track: EditorTrack;
  name: string;
  start: number;
  duration: number;
  assetId?: string;
  text?: string;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  transition?: string;
  sourceIn?: number;
  speed?: number;
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  crop?: { x: number; y: number; w: number; h: number };
  freeze?: boolean;
  effects?: EditorEffect[];
}

export interface EditorPreset {
  id: string;
  name: string;
  aspect: EditorAspect;
  captionStyle: string;
  musicId: string;
  grade: string;
}

export interface EditorProject {
  title: string;
  aspect: EditorAspect;
  assets: EditorAsset[];
  items: EditorItem[];
  words: EditorWord[];
  language: string;
  caption: {
    styleId: string;
    fontId: string;
    size: number;
    color: string;
    activeColor: string;
    stroke: number;
    shadow: number;
    background: string;
    position: 'top' | 'upper-third' | 'middle' | 'lower-third' | 'bottom';
    x: number;
    y: number;
    animation: string;
    wordsPerLine: number;
    uppercase: boolean;
  };
  grade: string;
  brightness: number;
  contrast: number;
  saturation: number;
  effects: EditorEffect[];
  customPresets: EditorPreset[];
  serverTranscript?: unknown;
  renderJob?: { operationId: string; geometry?: unknown; aspect: EditorAspect; progress: number };
  lastExportUrl?: string;
}

export interface EditorOperation {
  type: string;
  start?: number;
  end?: number;
  to?: number;
  itemId?: string;
  text?: string;
  styleId?: string;
  aspect?: EditorAspect;
  volume?: number;
  speed?: number;
  musicId?: string;
  x?: number;
  y?: number;
  scale?: number;
  crop?: { x: number; y: number; w: number; h: number };
  position?: EditorProject['caption']['position'];
  size?: number;
  animation?: string;
  effectId?: string;
  intensity?: number;
  scope?: 'clip' | 'timeline';
  clipIndex?: number;
}

export const EMPTY_PROJECT: EditorProject = {
  title: 'Untitled edit',
  aspect: '16:9',
  assets: [],
  items: [],
  words: [],
  language: 'auto',
  caption: {
    styleId: 'tiktok', fontId: 'inter', size: 62, color: '#FFFFFF', activeColor: '#F2B544',
    stroke: 3, shadow: 18, background: '#000000', position: 'bottom', x: 50, y: 84,
    animation: 'pop', wordsPerLine: 5, uppercase: true,
  },
  grade: 'none',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  effects: [],
  customPresets: [],
};

export const TRACKS: { id: EditorTrack; label: string; color: string }[] = [
  { id: 'video', label: 'Video', color: '#4C8DFF' },
  { id: 'broll', label: 'B-roll', color: '#2BB3A3' },
  { id: 'caption', label: 'Captions', color: '#F2B544' },
  { id: 'text', label: 'Text', color: '#E8845C' },
  { id: 'music', label: 'Music', color: '#6CC17A' },
  { id: 'voice', label: 'Voice', color: '#9AA6B8' },
];

export const BUILTIN_PRESETS: EditorPreset[] = [
  { id: 'podcast', name: 'Podcast clip', aspect: '9:16', captionStyle: 'minimal', musicId: 'calm', grade: 'warm' },
  { id: 'viral', name: 'TikTok viral', aspect: '9:16', captionStyle: 'tiktok', musicId: 'energetic', grade: 'vivid' },
  { id: 'product', name: 'Product ad', aspect: '1:1', captionStyle: 'bold', musicId: 'luxury', grade: 'cinematic' },
  { id: 'short', name: 'YouTube short', aspect: '9:16', captionStyle: 'karaoke', musicId: 'inspiring', grade: 'cool' },
  { id: 'talking', name: 'Talking head', aspect: '16:9', captionStyle: 'creator', musicId: 'calm', grade: 'none' },
];

export const newEditorId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
export const clampEditor = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export const formatEditorTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
export const editorDuration = (project: EditorProject) => Math.max(0, ...project.items.map((item) => item.start + item.duration));
export const editorSource = (project: EditorProject) => {
  const first = project.items.find((item) => item.track === 'video');
  return project.assets.find((asset) => asset.id === first?.assetId) || project.assets[0];
};

export function captionItems(words: EditorWord[], count: number): EditorItem[] {
  const live = words.filter((word) => !word.removed);
  const output: EditorItem[] = [];
  const size = Math.max(2, Math.round(count));
  for (let index = 0; index < live.length; index += size) {
    const part = live.slice(index, index + size);
    if (!part.length) continue;
    const text = part.map((word) => word.text).join(' ');
    output.push({
      id: newEditorId('caption'), track: 'caption', name: text, text,
      start: part[0].start,
      duration: Math.max(.35, part[part.length - 1].end - part[0].start),
    });
  }
  return output;
}

export function validateEditorOperations(value: unknown): EditorOperation[] {
  const allowed = new Set(['cut', 'trim', 'split', 'delete', 'move', 'duplicate', 'freeze_frame', 'add_broll', 'add_text', 'add_captions', 'set_style', 'set_caption_position', 'set_caption_size', 'set_caption_animation', 'add_effect', 'toggle_effect', 'add_music', 'set_volume', 'set_speed', 'crop', 'change_aspect', 'remove_fillers', 'remove_silences']);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).filter((entry): entry is EditorOperation => Boolean(entry && typeof entry === 'object' && allowed.has(String((entry as EditorOperation).type))));
}

export function applyEditorOperations(
  initial: EditorProject,
  operations: EditorOperation[],
  styleIds: string[],
  musicBeds: { id: string; label: string; url: string }[],
): EditorProject {
  let project = initial;
  operations.forEach((operation) => {
    if (operation.type === 'change_aspect' && ['9:16', '1:1', '16:9', '4:5', 'free'].includes(String(operation.aspect))) {
      project = { ...project, aspect: operation.aspect as EditorAspect };
    } else if (operation.type === 'set_style' && styleIds.includes(String(operation.styleId))) {
      project = { ...project, caption: { ...project.caption, styleId: String(operation.styleId) } };
    } else if (operation.type === 'add_captions') {
      project = { ...project, items: [...project.items.filter((item) => item.track !== 'caption'), ...captionItems(project.words, project.caption.wordsPerLine)] };
    } else if (operation.type === 'set_caption_position') {
      const positions = ['top', 'upper-third', 'middle', 'lower-third', 'bottom'];
      const position = positions.includes(String(operation.position)) ? operation.position as EditorProject['caption']['position'] : project.caption.position;
      const yByPosition: Record<string, number> = { top: 12, 'upper-third': 30, middle: 50, 'lower-third': 70, bottom: 86 };
      project = { ...project, caption: { ...project.caption, position, x: clampEditor(Number(operation.x ?? project.caption.x ?? 50), 5, 95), y: clampEditor(Number(operation.y ?? yByPosition[position]), 6, 94) } };
    } else if (operation.type === 'set_caption_size') {
      project = { ...project, caption: { ...project.caption, size: clampEditor(Number(operation.size) || project.caption.size, 24, 120) } };
    } else if (operation.type === 'set_caption_animation') {
      project = { ...project, caption: { ...project.caption, animation: String(operation.animation || project.caption.animation) } };
    } else if (operation.type === 'add_effect') {
      const effect: EditorEffect = {
        id: newEditorId('fx'), type: String(operation.effectId || 'filmGrain'), enabled: true,
        intensity: clampEditor(Number(operation.intensity) || 55, 0, 100),
        scope: operation.scope === 'clip' ? 'clip' : 'timeline', itemId: operation.scope === 'clip' ? operation.itemId : undefined,
      };
      project = { ...project, effects: [...(project.effects || []).filter((entry) => !(entry.type === effect.type && entry.scope === effect.scope && entry.itemId === effect.itemId)), effect] };
    } else if (operation.type === 'toggle_effect') {
      project = { ...project, effects: (project.effects || []).map((effect) => effect.type === operation.effectId ? { ...effect, enabled: !effect.enabled } : effect) };
    } else if (operation.type === 'remove_fillers') {
      const words = project.words.map((word) => word.filler ? { ...word, removed: true } : word);
      project = { ...project, words, items: [...project.items.filter((item) => item.track !== 'caption'), ...captionItems(words, project.caption.wordsPerLine)] };
    } else if (operation.type === 'add_music') {
      const bed = musicBeds.find((item) => item.id === operation.musicId) || musicBeds[2];
      if (bed) project = { ...project, items: [...project.items.filter((item) => item.track !== 'music'), { id: newEditorId('music'), track: 'music', name: bed.label, start: 0, duration: Math.max(1, editorDuration(project)), assetId: bed.url, volume: .2, fadeIn: .4, fadeOut: .8, loop: true }] };
    } else if (operation.type === 'set_volume') {
      project = { ...project, items: project.items.map((item) => operation.itemId ? item.id === operation.itemId ? { ...item, volume: clampEditor(Number(operation.volume), 0, 1) } : item : item.track === 'music' ? { ...item, volume: clampEditor(Number(operation.volume), 0, 1) } : item) };
    } else if (operation.type === 'set_speed') {
      const videos = project.items.filter((item) => item.track === 'video').sort((a, b) => a.start - b.start);
      const indexed = Number.isFinite(Number(operation.clipIndex)) ? videos[Math.max(0, Number(operation.clipIndex) - 1)] : undefined;
      project = { ...project, items: project.items.map((item) => item.id === operation.itemId || item.id === indexed?.id || (!operation.itemId && !indexed && item.track === 'video') ? { ...item, speed: clampEditor(Number(operation.speed) || 1, .25, 4) } : item) };
    } else if (operation.type === 'crop') {
      project = { ...project, items: project.items.map((item) => item.id === operation.itemId || (!operation.itemId && item.track === 'video') ? { ...item, crop: operation.crop || item.crop || { x: 0, y: 0, w: 1, h: 1 }, x: clampEditor(Number(operation.x ?? item.x ?? 50), 0, 100), y: clampEditor(Number(operation.y ?? item.y ?? 50), 0, 100), scale: clampEditor(Number(operation.scale ?? item.scale ?? 1), .1, 5) } : item) };
    } else if (operation.type === 'duplicate' && operation.itemId) {
      const source = project.items.find((item) => item.id === operation.itemId);
      if (source) project = { ...project, items: [...project.items, { ...source, id: newEditorId(source.track), start: source.start + source.duration }] };
    } else if (operation.type === 'freeze_frame') {
      const at = clampEditor(Number(operation.start), 0, editorDuration(project));
      const source = project.items.find((item) => item.id === operation.itemId) || project.items.find((item) => item.track === 'video' && at >= item.start && at <= item.start + item.duration);
      if (source) project = { ...project, items: [...project.items, { ...source, id: newEditorId('freeze'), name: `${source.name} · freeze`, start: at, duration: Math.max(.5, Number(operation.end) - at || 2), freeze: true, volume: 0 }] };
    } else if (operation.type === 'add_text') {
      const start = clampEditor(Number(operation.start), 0, editorDuration(project));
      project = { ...project, items: [...project.items, { id: newEditorId('text'), track: 'text', name: String(operation.text || 'Text'), text: String(operation.text || 'Text'), start, duration: Math.max(.5, Number(operation.end) - start || 3), x: 50, y: 25, scale: 1, opacity: 1 }] };
    } else if (operation.type === 'cut' || operation.type === 'delete') {
      const start = clampEditor(Number(operation.start), 0, editorDuration(project));
      const end = clampEditor(Number(operation.end), start, editorDuration(project));
      const gap = Math.max(0, end - start);
      project = { ...project, items: project.items.flatMap((item) => {
        const itemEnd = item.start + item.duration;
        if (itemEnd <= start) return [item];
        if (item.start >= end) return [{ ...item, start: Math.max(0, item.start - gap) }];
        if (item.track !== 'video' && item.track !== 'voice' && item.track !== 'caption') return [];
        const pieces: EditorItem[] = [];
        if (start > item.start + .1) pieces.push({ ...item, id: newEditorId(item.track), duration: start - item.start });
        if (end < itemEnd - .1) pieces.push({ ...item, id: newEditorId(item.track), start, sourceIn: (item.sourceIn || 0) + (end - item.start) * (item.speed || 1), duration: itemEnd - end });
        return pieces;
      }) };
    } else if (operation.type === 'trim') {
      project = { ...project, items: project.items.map((item) => {
        if (item.track !== 'video') return item;
        const start = Math.max(item.start, Number(operation.start) || item.start);
        return { ...item, start, duration: Math.max(.1, (Number(operation.end) || item.start + item.duration) - start) };
      }) };
    } else if (operation.type === 'split') {
      const at = clampEditor(Number(operation.start), 0, editorDuration(project));
      project = { ...project, items: project.items.flatMap((item) => {
        if (item.track !== 'video' || at <= item.start + .1 || at >= item.start + item.duration - .1) return [item];
        return [
          { ...item, id: newEditorId('video'), duration: at - item.start },
          { ...item, id: newEditorId('video'), start: at, sourceIn: (item.sourceIn || 0) + (at - item.start) * (item.speed || 1), duration: item.start + item.duration - at },
        ];
      }) };
    } else if (operation.type === 'move' && operation.itemId) {
      project = { ...project, items: project.items.map((item) => item.id === operation.itemId ? { ...item, start: clampEditor(Number(operation.to), 0, editorDuration(project)) } : item) };
    } else if (operation.type === 'add_broll') {
      const start = clampEditor(Number(operation.start), 0, editorDuration(project));
      const end = clampEditor(Number(operation.end) || start + 3, start + .2, editorDuration(project));
      project = { ...project, items: [...project.items, { id: newEditorId('broll'), track: 'broll', name: String(operation.text || 'B-roll suggestion'), text: String(operation.text || ''), start, duration: end - start, volume: 0 }] };
    } else if (operation.type === 'remove_silences') {
      const live = project.words.filter((word) => !word.removed);
      const ranges: { start: number; end: number }[] = [];
      for (let index = 1; index < live.length; index += 1) {
        if (live[index].start - live[index - 1].end >= .55) ranges.push({ start: live[index - 1].end, end: live[index].start });
      }
      project = { ...project, items: project.items.flatMap((item) => {
        if (item.track !== 'video') return [item];
        let pieces: EditorItem[] = [item];
        ranges.forEach((range) => {
          pieces = pieces.flatMap((piece) => {
            if (piece.start + piece.duration <= range.start || piece.start >= range.end) return [piece];
            const output: EditorItem[] = [];
            if (range.start > piece.start + .1) output.push({ ...piece, id: newEditorId('video'), duration: range.start - piece.start });
            if (range.end < piece.start + piece.duration - .1) output.push({ ...piece, id: newEditorId('video'), start: range.end, duration: piece.start + piece.duration - range.end });
            return output;
          });
        });
        return pieces;
      }) };
    }
  });
  return project;
}
