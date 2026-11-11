/**
 * 3D SCENE BUILDER — the scene document and everything that describes it.
 *
 * Plain data only: no three.js, no React. The engine (./sceneEngine) turns a
 * SceneDoc into a live scene; the builder UI (./SceneBuilder3D) edits it; the
 * store (./sceneStore) saves it as JSON in the `vpl_scenes` WorkspaceDB table.
 *
 * Units are metres, the floor is y = 0 and rotations are stored in degrees so
 * the numeric inputs read naturally.
 */

export type Vec3 = [number, number, number];

export type ElementKind =
  | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus' | 'text'
  | 'pedestal' | 'table' | 'chair' | 'lamp' | 'plant' | 'arch' | 'stairs'
  | 'mannequin' | 'figure'
  | 'model' | 'billboard';

export type MaterialKind = 'matte' | 'glossy' | 'metal' | 'glass';
export type LightingId = 'studio' | 'sunset' | 'night' | 'neon';
export type BackdropId = 'cyclorama' | 'floor' | 'void';
export type AspectId = '16:9' | '9:16' | '1:1';
export type CategoryId = 'primitives' | 'props' | 'characters' | 'uploads';

export interface SceneElement {
  id: string;
  kind: ElementKind;
  name: string;
  position: Vec3;
  /** Degrees. */
  rotation: Vec3;
  scale: Vec3;
  color: string;
  material: MaterialKind;
  /** 3D text only. */
  text?: string;
  /** GLB/GLTF model or billboard image. https once uploaded; blob: while only on this device. */
  assetUrl?: string;
  assetName?: string;
}

export interface CameraView {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface CameraShot extends CameraView {
  id: string;
  name: string;
}

export interface TransformKey {
  t: number;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface CameraKey extends CameraView {
  t: number;
}

export interface SceneAnimation {
  /** Seconds. */
  duration: number;
  elements: Record<string, TransformKey[]>;
  camera: CameraKey[];
}

export interface SceneDoc {
  version: 1;
  name: string;
  lighting: LightingId;
  backdrop: BackdropId;
  backdropColor: string;
  aspect: AspectId;
  elements: SceneElement[];
  shots: CameraShot[];
  camera: CameraView;
  animation: SceneAnimation;
}

/**
 * What the builder hands back to the Lab conversation for AI video: inline
 * JPEG renders and how the Lab should attach them (start frame, first + last
 * frame, or reference images).
 */
export interface SceneHandoff {
  images: string[];
  role: 'seed' | 'frames' | 'reference';
  prompt: string;
  aspectRatio: AspectId;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export interface CategoryDef {
  id: CategoryId;
  label: string;
  helper: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'primitives', label: 'Primitives', helper: 'Basic shapes and 3D text to block out any idea.' },
  { id: 'props', label: 'Props', helper: 'Simple set pieces: pedestals, furniture, plants and steps.' },
  { id: 'characters', label: 'Characters', helper: 'Stand-in figures to place people and plan poses.' },
  { id: 'uploads', label: 'Your uploads', helper: 'Bring your own GLB/GLTF models or images as billboards.' },
];

export interface LibraryItem {
  kind: ElementKind;
  label: string;
  category: CategoryId;
  helper: string;
  color: string;
  material: MaterialKind;
  /** Where a freshly added element sits; primitives are centred, props stand on the floor. */
  y: number;
  scale?: Vec3;
}

export const LIBRARY: LibraryItem[] = [
  { kind: 'cube', label: 'Cube', category: 'primitives', helper: 'A 1 m box.', color: '#d4af37', material: 'matte', y: 0.5 },
  { kind: 'sphere', label: 'Sphere', category: 'primitives', helper: 'A 1 m ball.', color: '#c3c7d1', material: 'glossy', y: 0.5 },
  { kind: 'cylinder', label: 'Cylinder', category: 'primitives', helper: 'A 1 m column.', color: '#9aa0ae', material: 'matte', y: 0.5 },
  { kind: 'cone', label: 'Cone', category: 'primitives', helper: 'A 1 m cone.', color: '#e6c45a', material: 'matte', y: 0.5 },
  { kind: 'torus', label: 'Ring', category: 'primitives', helper: 'A standing ring.', color: '#d4af37', material: 'metal', y: 0.55 },
  { kind: 'plane', label: 'Panel', category: 'primitives', helper: 'A flat 2 m wall or card.', color: '#3a3f4d', material: 'matte', y: 1 },
  { kind: 'text', label: '3D text', category: 'primitives', helper: 'Extruded lettering.', color: '#d4af37', material: 'metal', y: 0.3 },
  { kind: 'pedestal', label: 'Pedestal', category: 'props', helper: 'A product plinth.', color: '#e9e6df', material: 'matte', y: 0 },
  { kind: 'table', label: 'Table', category: 'props', helper: 'A simple desk-height table.', color: '#8a6a4a', material: 'matte', y: 0 },
  { kind: 'chair', label: 'Chair', category: 'props', helper: 'A basic chair.', color: '#5e6472', material: 'matte', y: 0 },
  { kind: 'lamp', label: 'Floor lamp', category: 'props', helper: 'Casts its own warm light.', color: '#2a2e3a', material: 'metal', y: 0 },
  { kind: 'plant', label: 'Plant', category: 'props', helper: 'A potted plant.', color: '#c9b79c', material: 'matte', y: 0 },
  { kind: 'arch', label: 'Arch', category: 'props', helper: 'A doorway arch.', color: '#e9e6df', material: 'matte', y: 0 },
  { kind: 'stairs', label: 'Steps', category: 'props', helper: 'Five steps up.', color: '#9aa0ae', material: 'matte', y: 0 },
  { kind: 'mannequin', label: 'Mannequin', category: 'characters', helper: 'Jointed figure, 1.75 m tall.', color: '#d8cbb8', material: 'matte', y: 0 },
  { kind: 'figure', label: 'Person stand-in', category: 'characters', helper: 'Simple silhouette, 1.7 m tall.', color: '#9aa0ae', material: 'matte', y: 0 },
];

export function libraryItem(kind: ElementKind): LibraryItem | null {
  return LIBRARY.find((item) => item.kind === kind) || null;
}

export const MATERIALS: Array<{ id: MaterialKind; label: string; helper: string }> = [
  { id: 'matte', label: 'Matte', helper: 'Soft, no shine.' },
  { id: 'glossy', label: 'Glossy', helper: 'Lacquered with a clear coat.' },
  { id: 'metal', label: 'Metal', helper: 'Polished, mirror-like.' },
  { id: 'glass', label: 'Glass', helper: 'See-through, tinted by the colour.' },
];

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

export interface LightDef {
  type: 'directional' | 'point' | 'spot';
  color: string;
  intensity: number;
  position: Vec3;
  target?: Vec3;
  castShadow?: boolean;
  distance?: number;
  angle?: number;
}

export interface LightingPreset {
  id: LightingId;
  label: string;
  helper: string;
  /** CSS gradient shown when a rendered thumbnail is unavailable. */
  swatch: string;
  background: string;
  backdropColor: string;
  hemisphere: { sky: string; ground: string; intensity: number };
  environment: number;
  exposure: number;
  fog?: { color: string; near: number; far: number };
  lights: LightDef[];
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'studio',
    label: 'Studio',
    helper: 'Clean, even softbox light for products and portraits.',
    swatch: 'linear-gradient(135deg,#f5f6f8 0%,#c3c7d1 55%,#5e6472 100%)',
    background: '#c9ccd3',
    backdropColor: '#cfd2d8',
    hemisphere: { sky: '#ffffff', ground: '#8a8f99', intensity: 0.6 },
    environment: 0.85,
    exposure: 0.9,
    lights: [
      { type: 'directional', color: '#ffffff', intensity: 2.6, position: [4, 7, 5], castShadow: true },
      { type: 'directional', color: '#e8eeff', intensity: 0.9, position: [-6, 4, 3] },
      { type: 'directional', color: '#ffffff', intensity: 1.2, position: [0, 5, -7] },
    ],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    helper: 'Low golden sun with long shadows and a warm sky.',
    swatch: 'linear-gradient(135deg,#ffd27a 0%,#f08a5d 50%,#6a3a5e 100%)',
    background: '#e9906a',
    backdropColor: '#f1b48c',
    hemisphere: { sky: '#ffb98a', ground: '#4a2f48', intensity: 0.55 },
    environment: 0.6,
    exposure: 1.05,
    fog: { color: '#e9906a', near: 18, far: 60 },
    lights: [
      { type: 'directional', color: '#ffb060', intensity: 3.4, position: [9, 2.6, -4], castShadow: true },
      { type: 'directional', color: '#7f6bd6', intensity: 0.5, position: [-6, 5, 6] },
    ],
  },
  {
    id: 'night',
    label: 'Night',
    helper: 'Cool moonlight with one warm practical glow.',
    swatch: 'linear-gradient(135deg,#25345e 0%,#0d1426 60%,#05070d 100%)',
    background: '#070a14',
    backdropColor: '#141a2b',
    hemisphere: { sky: '#3b4f8a', ground: '#05070d', intensity: 0.25 },
    environment: 0.18,
    exposure: 1.1,
    fog: { color: '#070a14', near: 12, far: 40 },
    lights: [
      { type: 'directional', color: '#8fb3ff', intensity: 1.1, position: [-5, 8, 4], castShadow: true },
      { type: 'point', color: '#ffb46b', intensity: 18, position: [2.5, 1.8, 2], distance: 9 },
    ],
  },
  {
    id: 'neon',
    label: 'Neon',
    helper: 'Magenta and cyan club lighting on a dark set.',
    swatch: 'linear-gradient(135deg,#ff3ecf 0%,#3a0f52 50%,#16e0ff 100%)',
    background: '#0a0612',
    backdropColor: '#151022',
    hemisphere: { sky: '#3a1d5a', ground: '#05030a', intensity: 0.2 },
    environment: 0.25,
    exposure: 1.15,
    lights: [
      { type: 'spot', color: '#ff2fd0', intensity: 120, position: [-4, 4.5, 3], target: [0, 0.8, 0], angle: 0.7, castShadow: true, distance: 20 },
      { type: 'spot', color: '#16e0ff', intensity: 120, position: [4, 4.5, 2], target: [0, 0.8, 0], angle: 0.7, distance: 20 },
      { type: 'point', color: '#8a5cff', intensity: 12, position: [0, 3, -3], distance: 10 },
    ],
  },
];

export function lightingPreset(id: LightingId | string): LightingPreset {
  return LIGHTING_PRESETS.find((preset) => preset.id === id) || LIGHTING_PRESETS[0];
}

export const BACKDROPS: Array<{ id: BackdropId; label: string; helper: string }> = [
  { id: 'cyclorama', label: 'Infinity wall', helper: 'Curved seamless studio backdrop.' },
  { id: 'floor', label: 'Open floor', helper: 'Ground plane fading into the sky.' },
  { id: 'void', label: 'Void', helper: 'Plain background, shadows only.' },
];

export const ASPECTS: Array<{ id: AspectId; label: string; width: number; height: number }> = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
];

export function aspectRatio(aspect: AspectId): number {
  const def = ASPECTS.find((item) => item.id === aspect) || ASPECTS[0];
  return def.width / def.height;
}

/** Pixel size for an export whose long side is `longSide`, rounded to even numbers for video encoders. */
export function exportSize(aspect: AspectId, longSide: number): { width: number; height: number } {
  const ratio = aspectRatio(aspect);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return ratio >= 1
    ? { width: even(longSide), height: even(longSide / ratio) }
    : { width: even(longSide * ratio), height: even(longSide) };
}

// ---------------------------------------------------------------------------
// Ids, defaults, element factory
// ---------------------------------------------------------------------------

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const DEFAULT_CAMERA: CameraView = { position: [3.1, 1.9, 4.5], target: [0, 0.95, 0], fov: 40 };
export const MAX_DURATION = 20;
export const MIN_DURATION = 1;

export function createElement(kind: ElementKind, extra: Partial<SceneElement> = {}): SceneElement {
  const item = libraryItem(kind);
  const label = item?.label || (kind === 'model' ? '3D model' : kind === 'billboard' ? 'Image billboard' : 'Element');
  return {
    id: newId('el'),
    kind,
    name: label,
    position: [0, item ? item.y : 0, 0],
    rotation: [0, 0, 0],
    scale: item?.scale ? [...item.scale] as Vec3 : [1, 1, 1],
    color: item?.color || '#ffffff',
    material: item?.material || 'matte',
    ...(kind === 'text' ? { text: 'VIDVERGE' } : {}),
    ...extra,
  };
}

export function createDoc(name = 'Untitled scene'): SceneDoc {
  const pedestal = createElement('pedestal', { position: [0, 0, 0] });
  const sphere = createElement('sphere', { name: 'Hero sphere', position: [0, 1.31, 0], scale: [0.7, 0.7, 0.7], color: '#d4af37', material: 'metal' });
  return {
    version: 1,
    name,
    lighting: 'studio',
    backdrop: 'cyclorama',
    backdropColor: lightingPreset('studio').backdropColor,
    aspect: '16:9',
    elements: [pedestal, sphere],
    shots: [],
    camera: { ...DEFAULT_CAMERA, position: [...DEFAULT_CAMERA.position] as Vec3, target: [...DEFAULT_CAMERA.target] as Vec3 },
    animation: { duration: 5, elements: {}, camera: [] },
  };
}

export function cloneDoc(doc: SceneDoc): SceneDoc {
  return JSON.parse(JSON.stringify(doc)) as SceneDoc;
}

// ---------------------------------------------------------------------------
// Sanitising loaded JSON — a saved row is untrusted input
// ---------------------------------------------------------------------------

const KINDS: ElementKind[] = [
  'cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus', 'text', 'pedestal', 'table', 'chair', 'lamp', 'plant',
  'arch', 'stairs', 'mannequin', 'figure', 'model', 'billboard',
];

function num(value: unknown, fallback: number, min = -1000, max = 1000): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function vec(value: unknown, fallback: Vec3, min = -1000, max = 1000): Vec3 {
  const list = Array.isArray(value) ? value : [];
  return [num(list[0], fallback[0], min, max), num(list[1], fallback[1], min, max), num(list[2], fallback[2], min, max)];
}

function hex(value: unknown, fallback: string): string {
  const text = String(value || '');
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.indexOf(value as T) >= 0 ? (value as T) : fallback;
}

function cameraView(value: any, fallback: CameraView): CameraView {
  return {
    position: vec(value?.position, fallback.position),
    target: vec(value?.target, fallback.target),
    fov: num(value?.fov, fallback.fov, 10, 100),
  };
}

export function sanitizeDoc(raw: unknown): SceneDoc {
  const base = createDoc();
  let source: any = raw;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = null; }
  }
  if (!source || typeof source !== 'object') return base;

  const elements: SceneElement[] = (Array.isArray(source.elements) ? source.elements : [])
    .slice(0, 200)
    .filter((item: any) => item && KINDS.indexOf(item.kind) >= 0)
    .map((item: any) => {
      const fallback = createElement(item.kind);
      const asset = typeof item.assetUrl === 'string' && /^(https:|blob:)/.test(item.assetUrl) ? item.assetUrl : undefined;
      return {
        id: typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : fallback.id,
        kind: item.kind,
        name: String(item.name || fallback.name).slice(0, 80),
        position: vec(item.position, fallback.position),
        rotation: vec(item.rotation, fallback.rotation, -3600, 3600),
        scale: vec(item.scale, fallback.scale, 0.01, 100),
        color: hex(item.color, fallback.color),
        material: pick(item.material, ['matte', 'glossy', 'metal', 'glass'] as const, fallback.material),
        ...(item.kind === 'text' ? { text: String(item.text ?? 'TEXT').slice(0, 40) } : {}),
        ...(asset ? { assetUrl: asset } : {}),
        ...(item.assetName ? { assetName: String(item.assetName).slice(0, 120) } : {}),
      } as SceneElement;
    });

  const ids = new Set(elements.map((item) => item.id));
  const anim = source.animation && typeof source.animation === 'object' ? source.animation : {};
  const elementTracks: Record<string, TransformKey[]> = {};
  if (anim.elements && typeof anim.elements === 'object') {
    Object.keys(anim.elements).forEach((id) => {
      if (!ids.has(id) || !Array.isArray(anim.elements[id])) return;
      elementTracks[id] = sortKeys(anim.elements[id].slice(0, 100).map((key: any) => ({
        t: num(key?.t, 0, 0, MAX_DURATION),
        position: vec(key?.position, [0, 0, 0]),
        rotation: vec(key?.rotation, [0, 0, 0], -3600, 3600),
        scale: vec(key?.scale, [1, 1, 1], 0.01, 100),
      })));
    });
  }
  const cameraKeys: CameraKey[] = sortKeys((Array.isArray(anim.camera) ? anim.camera : []).slice(0, 100).map((key: any) => ({
    t: num(key?.t, 0, 0, MAX_DURATION),
    ...cameraView(key, DEFAULT_CAMERA),
  })));

  return {
    version: 1,
    name: String(source.name || base.name).slice(0, 80),
    lighting: pick(source.lighting, ['studio', 'sunset', 'night', 'neon'] as const, 'studio'),
    backdrop: pick(source.backdrop, ['cyclorama', 'floor', 'void'] as const, 'cyclorama'),
    backdropColor: hex(source.backdropColor, base.backdropColor),
    aspect: pick(source.aspect, ['16:9', '9:16', '1:1'] as const, '16:9'),
    elements,
    shots: (Array.isArray(source.shots) ? source.shots : []).slice(0, 30).map((shot: any, index: number) => ({
      id: typeof shot?.id === 'string' && shot.id ? shot.id.slice(0, 64) : newId('shot'),
      name: String(shot?.name || `Shot ${index + 1}`).slice(0, 60),
      ...cameraView(shot, DEFAULT_CAMERA),
    })),
    camera: cameraView(source.camera, DEFAULT_CAMERA),
    animation: {
      duration: num(anim.duration, 5, MIN_DURATION, MAX_DURATION),
      elements: elementTracks,
      camera: cameraKeys,
    },
  };
}

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

export function sortKeys<T extends { t: number }>(keys: T[]): T[] {
  return keys.slice().sort((a, b) => a.t - b.t);
}

/** Keys closer than this are the same key, so re-keying at the playhead updates instead of stacking. */
export const KEY_SNAP = 0.05;

export function upsertKey<T extends { t: number }>(keys: T[] | undefined, key: T): T[] {
  const list = (keys || []).filter((item) => Math.abs(item.t - key.t) > KEY_SNAP);
  return sortKeys([...list, key]);
}

export function removeKeyAt<T extends { t: number }>(keys: T[] | undefined, t: number): T[] {
  return (keys || []).filter((item) => Math.abs(item.t - t) > KEY_SNAP);
}

function ease(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function lerpVec(a: Vec3, b: Vec3, k: number): Vec3 {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

function bracket<T extends { t: number }>(keys: T[], t: number): { a: T; b: T; k: number } | null {
  if (!keys.length) return null;
  if (t <= keys[0].t) return { a: keys[0], b: keys[0], k: 0 };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { a: last, b: last, k: 0 };
  for (let index = 0; index < keys.length - 1; index += 1) {
    const a = keys[index];
    const b = keys[index + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      return { a, b, k: span > 0 ? ease((t - a.t) / span) : 0 };
    }
  }
  return { a: last, b: last, k: 0 };
}

export interface Transform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export function evaluateTransform(keys: TransformKey[] | undefined, t: number): Transform | null {
  const hit = bracket(keys || [], t);
  if (!hit) return null;
  return {
    position: lerpVec(hit.a.position, hit.b.position, hit.k),
    rotation: lerpVec(hit.a.rotation, hit.b.rotation, hit.k),
    scale: lerpVec(hit.a.scale, hit.b.scale, hit.k),
  };
}

export function evaluateCamera(keys: CameraKey[] | undefined, t: number): CameraView | null {
  const hit = bracket(keys || [], t);
  if (!hit) return null;
  return {
    position: lerpVec(hit.a.position, hit.b.position, hit.k),
    target: lerpVec(hit.a.target, hit.b.target, hit.k),
    fov: lerp(hit.a.fov, hit.b.fov, hit.k),
  };
}

/** The transform an element shows at time t: its keyframes when it has any, otherwise its base pose. */
export function displayTransform(doc: SceneDoc, element: SceneElement, t: number): Transform {
  return evaluateTransform(doc.animation.elements[element.id], t) || {
    position: element.position,
    rotation: element.rotation,
    scale: element.scale,
  };
}

export function hasAnimation(doc: SceneDoc): boolean {
  return doc.animation.camera.length > 1 || Object.keys(doc.animation.elements).some((id) => (doc.animation.elements[id] || []).length > 1);
}

/** A slow 40° orbit around the current target, used when a clip is recorded with no keyframes. */
export function turntableView(start: CameraView, t: number, duration: number): CameraView {
  const dx = start.position[0] - start.target[0];
  const dz = start.position[2] - start.target[2];
  const radius = Math.sqrt(dx * dx + dz * dz) || 1;
  const angle = Math.atan2(dx, dz) + ((40 * Math.PI) / 180) * ease(Math.min(1, Math.max(0, t / Math.max(0.001, duration))));
  return {
    position: [start.target[0] + Math.sin(angle) * radius, start.position[1], start.target[2] + Math.cos(angle) * radius],
    target: start.target,
    fov: start.fov,
  };
}
