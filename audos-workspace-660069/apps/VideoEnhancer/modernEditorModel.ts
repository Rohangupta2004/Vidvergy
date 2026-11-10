export type EditorAspect = '9:16' | '1:1' | '16:9' | '4:5' | 'free';
export type EditorTrack = 'video' | 'broll' | 'caption' | 'text' | 'music' | 'voice';
export type WordRole = 'normal' | 'key' | 'emph';
export type CaptionStyleId = 'pop' | 'hz' | 'bk' | 'ol' | 'mn' | 'k' | 'gl' | 'nb' | 'mx' | 'st' | 'hw' | 'ed' | 'bh' | 'bhc' | 'ne' | 'tw' | 'stk';
export type CaptionCategory = 'bold' | 'clean' | 'mixed' | 'behind' | 'fun';
export type CaptionFontId = 'inter' | 'anton' | 'serif' | 'caveat' | 'mono';

export interface RoleStyle {
  font: CaptionFontId;
  weight: number;
  italic?: boolean;
  color: string;
  scale?: number;
  case?: 'upper' | 'none' | 'lower';
  box?: { color: string; radius: number; padX: number };
  stroke?: { color: string; width: number };
  rotate?: number;
  glow?: string;
}

export interface CaptionStyle {
  id: CaptionStyleId;
  name: string;
  cat: CaptionCategory;
  roles: { normal: RoleStyle; key: RoleStyle; emph: RoleStyle };
  plate?: { kind: 'glass' | 'bar' | 'sticker'; color: string };
  layout?: 'line' | 'bigKey' | 'stack' | 'editorial';
  behind?: 'word' | 'wordAndCaption';
  animation: 'pop' | 'karaoke' | 'fade' | 'type' | 'bounce';
}

export interface EditorAsset {
  id: string;
  name: string;
  url: string;
  preview: string;
  duration: number;
  kind: 'video' | 'image';
  hash?: string;
  cutoutUrl?: string;
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
  role?: WordRole;
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
  ai?: boolean;
  credits?: number;
}

export interface EditorPreset {
  id: string;
  name: string;
  aspect: EditorAspect;
  captionStyle: string;
  musicId: string;
  grade: string;
}

export interface EditorSilenceRegion { start: number; end: number }

export interface EditorProject {
  title: string;
  aspect: EditorAspect;
  assets: EditorAsset[];
  items: EditorItem[];
  words: EditorWord[];
  language: string;
  caption: {
    enabled: boolean;
    styleId: CaptionStyleId;
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
    autoPickRoles: boolean;
    roleStyles?: Partial<Record<WordRole, Partial<RoleStyle>>>;
    behind: { on: boolean; size: number; softness: number; which: 'key' | 'hook' | 'every'; route?: 'pixel' | 'soft-box'; status?: string };
  };
  grade: string;
  brightness: number;
  contrast: number;
  saturation: number;
  effects: EditorEffect[];
  silence: {
    enabled: boolean;
    thresholdDb: number;
    minDuration: number;
    paddingMs: number;
    regions: EditorSilenceRegion[];
    removedSeconds: number;
    analyzedAssetId?: string;
    status?: string;
  };
  customPresets: EditorPreset[];
  serverTranscript?: unknown;
  renderJob?: { operationId: string; geometry?: unknown; aspect: EditorAspect; progress: number };
  lastExportUrl?: string;
}

export interface EditorOperation {
  type: string;
  start?: number;
  end?: number;
  t?: number;
  why?: string;
  to?: number;
  itemId?: string;
  atItemId?: string;
  wordId?: string;
  role?: WordRole;
  text?: string;
  id?: string;
  kind?: string;
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
  softness?: number;
  which?: 'key' | 'hook' | 'every';
  on?: boolean;
  animation?: string;
  effectId?: string;
  intensity?: number;
  scope?: 'clip' | 'timeline';
  clipIndex?: number;
  credits?: number;
}

export const CAPTION_STYLE_IDS: CaptionStyleId[] = ['pop', 'hz', 'bk', 'ol', 'mn', 'k', 'gl', 'nb', 'mx', 'st', 'hw', 'ed', 'bh', 'bhc', 'ne', 'tw', 'stk'];
export const LEGACY_STYLE_MAP: Record<string, CaptionStyleId> = {
  tiktok: 'pop', karaoke: 'k', minimal: 'mn', neon: 'ne', bold: 'nb', newsroom: 'tw',
  cinematic: 'mn', creator: 'pop', comic: 'ol', gradient: 'stk',
};

export function normalizeCaptionStyleId(value: unknown): CaptionStyleId {
  const id = String(value || 'pop');
  return CAPTION_STYLE_IDS.includes(id as CaptionStyleId) ? id as CaptionStyleId : LEGACY_STYLE_MAP[id] || 'pop';
}

export const EMPTY_PROJECT: EditorProject = {
  title: 'Untitled edit',
  aspect: '16:9',
  assets: [],
  items: [],
  words: [],
  language: 'auto',
  caption: {
    enabled: false,
    styleId: 'pop', fontId: 'inter', size: 62, color: '#FFFFFF', activeColor: '#FFC23D',
    stroke: 3, shadow: 18, background: '#000000', position: 'bottom', x: 50, y: 78,
    animation: 'pop', wordsPerLine: 5, uppercase: true, autoPickRoles: true,
    behind: { on: false, size: 44, softness: 4, which: 'key', route: 'pixel', status: '' },
  },
  grade: 'none', brightness: 100, contrast: 100, saturation: 100, effects: [],
  silence: { enabled: false, thresholdDb: -40, minDuration: 0.6, paddingMs: 120, regions: [], removedSeconds: 0, status: '' },
  customPresets: [],
};

export const TRACKS: { id: EditorTrack; label: string; color: string }[] = [
  { id: 'video', label: 'Video', color: '#9AA0AE' },
  { id: 'broll', label: 'B-roll', color: '#D4AF37' },
  { id: 'caption', label: 'Captions', color: '#D4AF37' },
  { id: 'text', label: 'Text', color: '#E6C45A' },
  { id: 'music', label: 'Music', color: '#A8861F' },
  { id: 'voice', label: 'Voice', color: '#C3C7D1' },
];

export const BUILTIN_PRESETS: EditorPreset[] = [
  { id: 'podcast', name: 'Podcast clip', aspect: '9:16', captionStyle: 'mn', musicId: 'calm', grade: 'warm' },
  { id: 'viral', name: 'Short-form', aspect: '9:16', captionStyle: 'pop', musicId: 'energetic', grade: 'vivid' },
  { id: 'product', name: 'Product ad', aspect: '1:1', captionStyle: 'nb', musicId: 'luxury', grade: 'cinematic' },
  { id: 'short', name: 'YouTube short', aspect: '9:16', captionStyle: 'k', musicId: 'inspiring', grade: 'cool' },
  { id: 'talking', name: 'Talking head', aspect: '16:9', captionStyle: 'mx', musicId: 'calm', grade: 'none' },
];

export const newEditorId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
export const clampEditor = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export const formatEditorTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
export const editorDuration = (project: EditorProject) => Math.max(0, ...project.items.map((item) => item.start + item.duration));
export const editorSource = (project: EditorProject) => {
  const first = project.items.find((item) => item.track === 'video');
  return project.assets.find((asset) => asset.id === first?.assetId) || project.assets[0];
};

const STOP_WORDS = new Set('a an and are as at be been but by can did do does for from had has have he her hers him his how i if in into is it its just me my of on or our ours she so than that the their them then there these they this those to too us was we were what when where which who why will with you your yours um uh erm hmm basically actually literally'.split(' '));

export function pickKeyWordRoles(words: EditorWord[], wordsPerLine = 5): EditorWord[] {
  const output = words.map((word) => ({ ...word, role: word.role || 'normal' as WordRole }));
  const live = output.filter((word) => !word.removed);
  for (let index = 0; index < live.length; index += Math.max(2, wordsPerLine)) {
    const line = live.slice(index, index + Math.max(2, wordsPerLine));
    const existingKeys = line.filter((word) => word.role === 'key' && !word.filler);
    existingKeys.slice(1).forEach((word) => { word.role = 'normal'; });
    line.filter((word) => word.filler && word.role === 'key').forEach((word) => { word.role = 'normal'; });
    if (existingKeys.length) continue;
    const candidate = [...line]
      .filter((word) => !word.filler && !STOP_WORDS.has(word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')))
      .sort((a, b) => {
        const an = /\d/.test(a.text) ? 100 : a.text.length;
        const bn = /\d/.test(b.text) ? 100 : b.text.length;
        return bn - an;
      })[0];
    if (candidate) candidate.role = 'key';
  }
  let emphWindow = -1;
  let emphCount = 0;
  output.forEach((word) => {
    const windowId = Math.floor(word.start / 10);
    if (windowId !== emphWindow) { emphWindow = windowId; emphCount = 0; }
    if (word.role === 'emph') {
      if (word.filler || STOP_WORDS.has(word.text.toLowerCase()) || emphCount >= 2) word.role = 'normal';
      else emphCount += 1;
    }
  });
  return output;
}

export function cycleWordRole(role?: WordRole): WordRole {
  return role === 'key' ? 'emph' : role === 'emph' ? 'normal' : 'key';
}

export function hydrateEditorProject(raw: Partial<EditorProject> | null | undefined): EditorProject {
  const merged: EditorProject = {
    ...EMPTY_PROJECT,
    ...(raw || {}),
    assets: Array.isArray(raw?.assets) ? raw!.assets : [],
    items: Array.isArray(raw?.items) ? raw!.items : [],
    words: Array.isArray(raw?.words) ? raw!.words.map((word) => ({ ...word, role: word.role || 'normal' })) : [],
    effects: Array.isArray(raw?.effects) ? raw!.effects : [],
    silence: {
      ...EMPTY_PROJECT.silence,
      ...(raw?.silence || {}),
      regions: Array.isArray(raw?.silence?.regions)
        ? raw!.silence!.regions.filter((region) => Number.isFinite(region?.start) && Number.isFinite(region?.end) && region.end > region.start)
        : [],
    },
    customPresets: Array.isArray(raw?.customPresets) ? raw!.customPresets : [],
    caption: {
      ...EMPTY_PROJECT.caption,
      ...(raw?.caption || {}),
      enabled: typeof raw?.caption?.enabled === 'boolean'
        ? raw.caption.enabled
        : Boolean(raw?.items?.some((item) => item.track === 'caption')),
      styleId: normalizeCaptionStyleId(raw?.caption?.styleId),
      behind: { ...EMPTY_PROJECT.caption.behind, ...(raw?.caption?.behind || {}) },
    },
  };
  if (merged.caption.autoPickRoles && !merged.words.some((word) => word.role === 'key')) merged.words = pickKeyWordRoles(merged.words, merged.caption.wordsPerLine);
  if (merged.caption.enabled && (merged.caption.styleId === 'bh' || merged.caption.styleId === 'bhc')) merged.caption.behind.on = true;
  if (!merged.caption.enabled) {
    merged.items = merged.items.filter((item) => item.track !== 'caption');
    merged.caption.behind = { ...merged.caption.behind, on: false, status: '' };
  }
  return merged;
}

export function captionItems(words: EditorWord[], count: number): EditorItem[] {
  const live = words.filter((word) => !word.removed);
  const output: EditorItem[] = [];
  const size = Math.max(2, Math.round(count));
  for (let index = 0; index < live.length; index += size) {
    const part = live.slice(index, index + size);
    if (!part.length) continue;
    const text = part.map((word) => word.text).join(' ');
    output.push({ id: `caption_${part[0].id}_${part[part.length - 1].id}`, track: 'caption', name: text, text, start: part[0].start, duration: Math.max(.35, part[part.length - 1].end - part[0].start) });
  }
  return output;
}

function normalizeSilenceCuts(regions: EditorSilenceRegion[], duration: number): EditorSilenceRegion[] {
  const sorted = regions
    .map((region) => ({ start: clampEditor(Number(region.start), 0, duration), end: clampEditor(Number(region.end), 0, duration) }))
    .filter((region) => region.end - region.start > 0.04)
    .sort((a, b) => a.start - b.start);
  const merged: EditorSilenceRegion[] = [];
  sorted.forEach((region) => {
    const previous = merged[merged.length - 1];
    if (previous && region.start <= previous.end + 0.01) previous.end = Math.max(previous.end, region.end);
    else merged.push({ ...region });
  });
  return merged;
}

function mapTimeAfterCuts(time: number, cuts: EditorSilenceRegion[]): number {
  let removed = 0;
  for (const cut of cuts) {
    if (time >= cut.end) removed += cut.end - cut.start;
    else if (time > cut.start) removed += time - cut.start;
    else break;
  }
  return Math.max(0, time - removed);
}

function retainedPieces(start: number, end: number, cuts: EditorSilenceRegion[]): EditorSilenceRegion[] {
  let cursor = start;
  const output: EditorSilenceRegion[] = [];
  cuts.forEach((cut) => {
    if (cut.end <= cursor || cut.start >= end) return;
    if (cut.start > cursor + 0.02) output.push({ start: cursor, end: Math.min(end, cut.start) });
    cursor = Math.max(cursor, cut.end);
  });
  if (end > cursor + 0.02) output.push({ start: cursor, end });
  return output;
}

/**
 * Build the one composition consumed by the timeline, preview and export.
 * Silence regions stay non-destructive in the saved project; this projection
 * removes them, closes every gap, and retimes transcript/caption data together.
 */
export function effectiveEditorProject(source: EditorProject): EditorProject {
  const project = structuredClone(source);
  const videoDuration = Math.max(0, ...project.items.filter((item) => item.track === 'video').map((item) => item.start + item.duration));
  const baseDuration = videoDuration || editorDuration(project);
  const captionsOn = project.caption.enabled !== false;
  const cuts = project.silence?.enabled ? normalizeSilenceCuts(project.silence.regions || [], baseDuration) : [];

  if (!cuts.length) {
    const existingCaptions = project.items.filter((item) => item.track === 'caption');
    project.items = [
      ...project.items.filter((item) => item.track !== 'caption'),
      ...(captionsOn ? existingCaptions.length ? existingCaptions : captionItems(project.words, project.caption.wordsPerLine) : []),
    ];
    if (!captionsOn) project.caption.behind = { ...project.caption.behind, on: false, status: '' };
    return project;
  }

  const transformed: EditorItem[] = [];
  project.items.filter((item) => item.track !== 'caption' && item.track !== 'music').forEach((item) => {
    const pieces = retainedPieces(item.start, item.start + item.duration, cuts);
    pieces.forEach((piece, index) => {
      transformed.push({
        ...item,
        id: index === 0 ? item.id : `${item.id}__cut${index}`,
        start: mapTimeAfterCuts(piece.start, cuts),
        duration: piece.end - piece.start,
        sourceIn: ['video', 'voice', 'broll'].includes(item.track)
          ? (item.sourceIn || 0) + (piece.start - item.start) * (item.speed || 1)
          : item.sourceIn,
      });
    });
  });

  // A detector must never turn a fully silent/no-audio upload into an empty
  // composition. The UI also guards this case and explains it to the creator.
  if (project.items.some((item) => item.track === 'video') && !transformed.some((item) => item.track === 'video')) {
    return { ...project, silence: { ...project.silence, enabled: false, removedSeconds: 0, status: 'No audible track was found, so the video was left unchanged.' } };
  }

  const words = project.words.flatMap((word) => {
    const midpoint = (word.start + word.end) / 2;
    if (cuts.some((cut) => midpoint > cut.start && midpoint < cut.end)) return [];
    const start = mapTimeAfterCuts(word.start, cuts);
    const end = Math.max(start + 0.02, mapTimeAfterCuts(word.end, cuts));
    return [{ ...word, start, end }];
  });
  const outputDuration = mapTimeAfterCuts(baseDuration, cuts);
  const music = project.items.filter((item) => item.track === 'music').map((item) => ({
    ...item,
    start: mapTimeAfterCuts(item.start, cuts),
    duration: Math.max(0.1, Math.min(outputDuration - mapTimeAfterCuts(item.start, cuts), item.duration)),
  }));
  project.words = words;
  project.items = [
    ...transformed,
    ...music,
    ...(captionsOn ? captionItems(words, project.caption.wordsPerLine) : []),
  ];
  project.silence.removedSeconds = cuts.reduce((total, cut) => total + cut.end - cut.start, 0);
  if (!captionsOn) project.caption.behind = { ...project.caption.behind, on: false, status: '' };
  return project;
}

export function validateEditorOperations(value: unknown): EditorOperation[] {
  const allowed = new Set(['cut', 'trim', 'split', 'delete', 'move', 'duplicate', 'freeze_frame', 'add_broll', 'add_text', 'add_captions', 'set_style', 'set_caption_position', 'set_caption_size', 'set_caption_animation', 'set_word_role', 'set_caption_behind', 'add_transition', 'add_sfx', 'add_voiceover', 'add_effect', 'toggle_effect', 'add_music', 'set_volume', 'set_speed', 'crop', 'change_aspect', 'remove_fillers', 'remove_silences']);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).filter((entry): entry is EditorOperation => {
    if (!entry || typeof entry !== 'object') return false;
    const op = entry as EditorOperation;
    if (!allowed.has(String(op.type))) return false;
    if (op.type === 'set_style' && !CAPTION_STYLE_IDS.includes(normalizeCaptionStyleId(op.styleId))) return false;
    if (op.type === 'set_word_role' && !['normal', 'key', 'emph'].includes(String(op.role))) return false;
    return true;
  });
}

export function applyEditorOperations(initial: EditorProject, operations: EditorOperation[], styleIds: string[] = CAPTION_STYLE_IDS, musicBeds: { id: string; label: string; url: string }[] = []): EditorProject {
  let project = structuredClone(initial);
  const duration = () => editorDuration(project);
  operations.forEach((operation) => {
    const at = clampEditor(Number(operation.t ?? operation.start), 0, duration());
    if (operation.type === 'change_aspect' && ['9:16', '1:1', '16:9', '4:5', 'free'].includes(String(operation.aspect))) project.aspect = operation.aspect as EditorAspect;
    else if (operation.type === 'set_style') {
      const styleId = normalizeCaptionStyleId(operation.styleId);
      if (styleIds.includes(styleId)) {
        project.caption.styleId = styleId;
        project.caption.roleStyles = undefined;
        if (project.caption.enabled && (styleId === 'bh' || styleId === 'bhc')) project.caption.behind.on = true;
      }
    } else if (operation.type === 'set_word_role' && operation.wordId) {
      project.words = project.words.map((word) => word.id === operation.wordId ? { ...word, role: operation.role || 'normal' } : word);
    } else if (operation.type === 'set_caption_behind') {
      project.caption.behind = { ...project.caption.behind, on: project.caption.enabled && operation.on !== false, size: clampEditor(Number(operation.size) || project.caption.behind.size, 20, 60), which: operation.which || project.caption.behind.which };
    } else if (operation.type === 'add_transition') {
      const target = project.items.find((item) => item.id === operation.atItemId) || project.items.filter((item) => item.track === 'video').sort((a, b) => a.start - b.start).find((item) => item.start >= at);
      if (target) target.transition = String(operation.kind || 'crossfade');
    } else if (operation.type === 'add_sfx') {
      project.items.push({ id: newEditorId('sfx'), track: 'music', name: String(operation.id || 'Sound effect'), start: at, duration: 1, assetId: String(operation.id || ''), volume: .7, fadeIn: .03, fadeOut: .12 });
    } else if (operation.type === 'add_voiceover') {
      project.items.push({ id: newEditorId('voice'), track: 'voice', name: String(operation.text || 'Voice-over'), text: String(operation.text || ''), start: at, duration: Math.max(1, String(operation.text || '').split(/\s+/).length / 2.4), volume: 1 });
    } else if (operation.type === 'add_captions' && project.caption.enabled) {
      project.items = [...project.items.filter((item) => item.track !== 'caption'), ...captionItems(project.words, project.caption.wordsPerLine)];
    }
    else if (operation.type === 'set_caption_position') {
      const positions = ['top', 'upper-third', 'middle', 'lower-third', 'bottom'];
      const position = positions.includes(String(operation.position)) ? operation.position as EditorProject['caption']['position'] : project.caption.position;
      const yByPosition: Record<string, number> = { top: 11, 'upper-third': 30, middle: 50, 'lower-third': 70, bottom: 81 };
      project.caption = { ...project.caption, position, x: clampEditor(Number(operation.x ?? project.caption.x), 5, 95), y: clampEditor(Number(operation.y ?? yByPosition[position]), 11, 81) };
    } else if (operation.type === 'set_caption_size') project.caption.size = clampEditor(Number(operation.size) || project.caption.size, 24, 120);
    else if (operation.type === 'set_caption_animation') project.caption.animation = String(operation.animation || project.caption.animation);
    else if (operation.type === 'add_effect') {
      const effect: EditorEffect = { id: newEditorId('fx'), type: String(operation.effectId || 'zoomPunch'), enabled: true, intensity: clampEditor(Number(operation.intensity) || 55, 0, 100), scope: operation.scope === 'clip' ? 'clip' : 'timeline', itemId: operation.scope === 'clip' ? operation.itemId : undefined };
      project.effects = [...project.effects.filter((entry) => !(entry.type === effect.type && entry.scope === effect.scope && entry.itemId === effect.itemId)), effect];
    } else if (operation.type === 'toggle_effect') project.effects = project.effects.map((effect) => effect.type === operation.effectId ? { ...effect, enabled: !effect.enabled } : effect);
    else if (operation.type === 'remove_fillers') {
      project.words = project.words.map((word) => word.filler ? { ...word, removed: true } : word);
      project.items = [...project.items.filter((item) => item.track !== 'caption'), ...(project.caption.enabled ? captionItems(project.words, project.caption.wordsPerLine) : [])];
    } else if (operation.type === 'add_music') {
      const bed = musicBeds.find((item) => item.id === operation.musicId) || musicBeds[0];
      if (bed) project.items = [...project.items.filter((item) => item.track !== 'music'), { id: newEditorId('music'), track: 'music', name: bed.label, start: 0, duration: Math.max(1, duration()), assetId: bed.url, volume: .2, fadeIn: .4, fadeOut: .8, loop: true }];
    } else if (operation.type === 'set_volume') project.items = project.items.map((item) => operation.itemId ? item.id === operation.itemId ? { ...item, volume: clampEditor(Number(operation.volume), 0, 1) } : item : item.track === 'music' ? { ...item, volume: clampEditor(Number(operation.volume), 0, 1) } : item);
    else if (operation.type === 'set_speed') {
      const videos = project.items.filter((item) => item.track === 'video').sort((a, b) => a.start - b.start);
      const indexed = Number.isFinite(Number(operation.clipIndex)) ? videos[Math.max(0, Number(operation.clipIndex) - 1)] : undefined;
      project.items = project.items.map((item) => item.id === operation.itemId || item.id === indexed?.id || (!operation.itemId && !indexed && item.track === 'video') ? { ...item, speed: clampEditor(Number(operation.speed) || 1, .25, 4) } : item);
    } else if (operation.type === 'crop') project.items = project.items.map((item) => item.id === operation.itemId || (!operation.itemId && item.track === 'video') ? { ...item, crop: operation.crop || item.crop || { x: 0, y: 0, w: 1, h: 1 }, x: clampEditor(Number(operation.x ?? item.x ?? 50), 0, 100), y: clampEditor(Number(operation.y ?? item.y ?? 50), 0, 100), scale: clampEditor(Number(operation.scale ?? item.scale ?? 1), .1, 5) } : item);
    else if (operation.type === 'duplicate' && operation.itemId) {
      const source = project.items.find((item) => item.id === operation.itemId);
      if (source) project.items.push({ ...source, id: newEditorId(source.track), start: source.start + source.duration });
    } else if (operation.type === 'freeze_frame') {
      const source = project.items.find((item) => item.id === operation.itemId) || project.items.find((item) => item.track === 'video' && at >= item.start && at <= item.start + item.duration);
      if (source) project.items.push({ ...source, id: newEditorId('freeze'), name: `${source.name} · freeze`, start: at, duration: Math.max(.5, Number(operation.end) - at || 2), freeze: true, volume: 0 });
    } else if (operation.type === 'add_text') project.items.push({ id: newEditorId('text'), track: 'text', name: String(operation.text || 'Text'), text: String(operation.text || 'Text'), start: at, duration: Math.max(.5, Number(operation.end) - at || 3), x: 50, y: 25, scale: 1, opacity: 1 });
    else if (operation.type === 'cut' || operation.type === 'delete') {
      const start = at;
      const end = clampEditor(Number(operation.end), start, duration());
      const gap = Math.max(0, end - start);
      project.items = project.items.flatMap((item) => {
        const itemEnd = item.start + item.duration;
        if (itemEnd <= start) return [item];
        if (item.start >= end) return [{ ...item, start: Math.max(0, item.start - gap) }];
        if (!['video', 'voice', 'caption'].includes(item.track)) return [];
        const pieces: EditorItem[] = [];
        if (start > item.start + .1) pieces.push({ ...item, id: newEditorId(item.track), duration: start - item.start });
        if (end < itemEnd - .1) pieces.push({ ...item, id: newEditorId(item.track), start, sourceIn: (item.sourceIn || 0) + (end - item.start) * (item.speed || 1), duration: itemEnd - end });
        return pieces;
      });
    } else if (operation.type === 'trim') project.items = project.items.map((item) => item.track !== 'video' ? item : { ...item, start: Math.max(item.start, Number(operation.start) || item.start), duration: Math.max(.1, (Number(operation.end) || item.start + item.duration) - Math.max(item.start, Number(operation.start) || item.start)) });
    else if (operation.type === 'split') project.items = project.items.flatMap((item) => item.track !== 'video' || at <= item.start + .1 || at >= item.start + item.duration - .1 ? [item] : [{ ...item, id: newEditorId('video'), duration: at - item.start }, { ...item, id: newEditorId('video'), start: at, sourceIn: (item.sourceIn || 0) + (at - item.start) * (item.speed || 1), duration: item.start + item.duration - at }]);
    else if (operation.type === 'move' && operation.itemId) project.items = project.items.map((item) => item.id === operation.itemId ? { ...item, start: clampEditor(Number(operation.to), 0, duration()) } : item);
    else if (operation.type === 'add_broll') {
      const end = clampEditor(Number(operation.end) || at + 3, at + .2, duration());
      project.items.push({ id: newEditorId('broll'), track: 'broll', name: String(operation.text || 'Stock B-roll'), text: String(operation.text || ''), start: at, duration: end - at, volume: 0, ai: Number(operation.credits) > 0, credits: Math.max(0, Number(operation.credits) || 0) });
    } else if (operation.type === 'remove_silences') {
      const live = project.words.filter((word) => !word.removed).sort((a, b) => a.start - b.start);
      const ranges: EditorSilenceRegion[] = [];
      for (let index = 1; index < live.length; index += 1) {
        if (live[index].start - live[index - 1].end >= project.silence.minDuration) ranges.push({ start: live[index - 1].end, end: live[index].start });
      }
      const removedSeconds = ranges.reduce((total, range) => total + range.end - range.start, 0);
      project.silence = { ...project.silence, enabled: true, regions: ranges, removedSeconds, status: ranges.length ? `${removedSeconds.toFixed(1)} seconds ready to remove.` : 'No silence found at the current settings.' };
    }
  });
  return project;
}
