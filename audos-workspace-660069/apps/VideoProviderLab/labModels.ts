/**
 * VIDEO PROVIDER LAB — official-doc-sourced model catalog.
 *
 * Capabilities are the intersection of (1) the provider's official model docs
 * and (2) the Audos proxy contract this browser can actually call. An upstream
 * feature that the proxy rejects is shown as unavailable rather than guessed or
 * silently dropped. Sources were checked 2026-10-25.
 */

export type LabPlugin =
  | 'image-and-video-generation'
  | 'google-veo3'
  | 'runway-recipes'
  | 'kling-video';

export type LabRunner = 'group-a' | 'veo-managed' | 'runway' | 'higgsfield' | 'kling' | 'unavailable';
export type LabGroupId = 'bytedance' | 'google' | 'runway' | 'kling';
export type LabImageMode = 'none' | 'optional' | 'required' | 'multi';
export type LabImageRole = 'seed' | 'frames' | 'reference';

export interface LabGroup { id: LabGroupId; label: string; note: string }
export interface LabModeOption { id: string; label: string }

export const CAMERA_PRESETS: LabModeOption[] = [
  { id: 'none', label: 'Auto (no preset)' },
  { id: 'push_in', label: 'Push in' },
  { id: 'pull_out', label: 'Pull out' },
  { id: 'pan_left', label: 'Pan left' },
  { id: 'pan_right', label: 'Pan right' },
  { id: 'tilt_up', label: 'Tilt up' },
  { id: 'tilt_down', label: 'Tilt down' },
  { id: 'orbit_left', label: 'Orbit left' },
  { id: 'orbit_right', label: 'Orbit right' },
];

export const LAB_GROUPS: LabGroup[] = [
  { id: 'bytedance', label: 'ByteDance · Seedance', note: 'OpenRouter video API through the Audos unified proxy.' },
  { id: 'google', label: 'Google · Gemini & Veo', note: 'Current Gemini Omni plus OpenRouter-hosted Veo models.' },
  { id: 'runway', label: 'Runway', note: 'Current Gen-4.5 and Gen-4 Turbo proxy routes.' },
  { id: 'kling', label: 'Kling AI', note: 'Current proxy subset of Kling 2.5, 2.6, 3.0 and 3.0 Omni.' },
];

export interface LabImageLimits {
  maxBytes: number;
  mimeTypes: string[];
  minWidth?: number;
  minHeight?: number;
  minAspect?: number;
  maxAspect?: number;
  summary: string;
}

export interface LabParams {
  durations: number[];
  defaultDuration: number | null;
  durationMin: number | null;
  durationMax: number | null;
  durationStep: number;
  aspectRatios: string[];
  resolutions: string[];
  audio: boolean;
  negativePrompt: boolean;
  modes: LabModeOption[];
  camera: boolean;
  cfgScale: boolean;
  seed: boolean;
  multiImage: boolean;
  extend: boolean;
  lipSync: boolean;
  imageRole: boolean;
  maxRefs: number;
  minRefs: number;
  fit: boolean;
  voiceSpeed: boolean;
  videoUpload: boolean;
  textToVideo: boolean;
  startFrame: boolean;
  endFrame: boolean;
  referenceImages: boolean;
  referenceVideo: boolean;
  audioInput: boolean;
  endFrameMode?: string;
  capabilityHint: string;
}

const P = (over: Partial<LabParams> = {}): LabParams => ({
  durations: [], defaultDuration: null, durationMin: null, durationMax: null, durationStep: 1,
  aspectRatios: [], resolutions: [], audio: false, negativePrompt: false, modes: [],
  camera: false, cfgScale: false, seed: false, multiImage: false, extend: false,
  lipSync: false, imageRole: false, maxRefs: 0, minRefs: 1, fit: false,
  voiceSpeed: false, videoUpload: false, textToVideo: true, startFrame: false,
  endFrame: false, referenceImages: false, referenceVideo: false, audioInput: false,
  capabilityHint: '', ...over,
});

export interface LabModel {
  key: string;
  modelId: string;
  name: string;
  provider: string;
  group: LabGroupId;
  plugins: LabPlugin[];
  runner: LabRunner;
  submitPath: string;
  statusPath: string;
  blurb: string;
  specs: string[];
  image: LabImageMode;
  maxImages: number;
  params: LabParams;
  imageLimits?: LabImageLimits;
  sourceUrl: string;
  capMs: number;
  costHint: string;
  available: boolean;
  unavailableReason?: string;
}

const TEN_MB = 10 * 1024 * 1024;
const PROXY_IMAGE_LIMITS: LabImageLimits = {
  maxBytes: TEN_MB,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  summary: 'PNG, JPEG or WebP; up to 10MB per image (Audos proxy limit).',
};
const KLING_IMAGE_LIMITS: LabImageLimits = {
  maxBytes: TEN_MB,
  mimeTypes: ['image/jpeg', 'image/png'],
  minWidth: 300,
  minHeight: 300,
  minAspect: 0.4,
  maxAspect: 2.5,
  summary: 'JPEG or PNG; up to 10MB; at least 300×300px; aspect ratio 1:2.5–2.5:1.',
};
const RUNWAY_45_LIMITS: LabImageLimits = {
  maxBytes: TEN_MB,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  minAspect: 0.5,
  maxAspect: 2,
  summary: 'JPEG, PNG or WebP; Runway allows 16MB by URL, but this lab’s base64 staging route is limited to ~10MB; aspect ratio 0.5–2.',
};
const RUNWAY_TURBO_LIMITS: LabImageLimits = {
  ...RUNWAY_45_LIMITS,
  maxAspect: 2.358,
  summary: 'JPEG, PNG or WebP; Runway allows 16MB by URL, but this lab’s base64 staging route is limited to ~10MB; aspect ratio 0.5–2.358.'
};

const RUNWAY_DOC = 'https://docs.dev.runwayml.com/api.md';
const KLING_DOC = 'https://app.klingai.com/global/dev/document-api/guides/capability-map/video';

function groupA(model: Omit<LabModel, 'plugins' | 'runner' | 'submitPath' | 'statusPath' | 'capMs' | 'available'>): LabModel {
  return {
    ...model,
    plugins: ['image-and-video-generation'],
    runner: 'group-a',
    submitPath: 'POST /api/veo/generate/video',
    statusPath: 'GET /api/veo/status/:operationId',
    capMs: 1_800_000,
    available: true,
  };
}

const GEMINI_OMNI = groupA({
  key: 'groupa:gemini-omni-1.1-flash', modelId: 'gemini-omni-1.1-flash',
  name: 'Gemini Omni 1.1 Flash', provider: 'Google', group: 'google',
  blurb: 'Google’s current video model. The Audos proxy exposes start/end frames, up to 10 image references and source-video editing.',
  specs: ['text or image → video', '3–8s through this proxy', '720p', 'up to 10 image references', 'first + last frame', 'source-video edit'],
  image: 'optional', maxImages: 10, imageLimits: PROXY_IMAGE_LIMITS,
  params: P({
    durations: [3, 4, 5, 6, 7, 8], defaultDuration: 8,
    aspectRatios: ['16:9', '9:16'], resolutions: ['720p'], audio: true,
    imageRole: true, maxRefs: 10, startFrame: true, endFrame: true,
    referenceImages: true, videoUpload: true,
    capabilityHint: 'Start frame, first+last frames, up to 10 image references, or one source video for editing. Reference audio is not exposed by this proxy.',
  }),
  sourceUrl: 'https://ai.google.dev/gemini-api/docs/omni',
  costHint: 'wallet quote returned by the proxy',
});

const SEEDANCE_20_FAST = groupA({
  key: 'groupa:openrouter/bytedance/seedance-2.0-fast', modelId: 'openrouter/bytedance/seedance-2.0-fast',
  name: 'Seedance 2.0 Fast', provider: 'ByteDance via OpenRouter', group: 'bytedance',
  blurb: 'Fast Seedance generation. OpenRouter supports richer references upstream; the Audos proxy currently exposes only one start frame.',
  specs: ['text or start frame', '4–15s', '480p / 720p', 'optional audio', 'no lab reference-video field'],
  image: 'optional', maxImages: 1, imageLimits: PROXY_IMAGE_LIMITS,
  params: P({
    durationMin: 4, durationMax: 15, defaultDuration: 8,
    aspectRatios: ['1:1', '3:4', '9:16', '4:3', '16:9', '21:9', '9:21'],
    resolutions: ['480p', '720p'], audio: true, startFrame: true,
    capabilityHint: 'OpenRouter documents first/last frames plus image, audio and video references. This Audos proxy exposes only a single start frame, so the other upstream inputs stay disabled here.',
  }),
  sourceUrl: 'https://openrouter.ai/bytedance/seedance-2.0-fast/llms.txt',
  costHint: 'OpenRouter usage cost via wallet',
});

const SEEDANCE_25 = groupA({
  key: 'groupa:openrouter/bytedance/seedance-2.5', modelId: 'openrouter/bytedance/seedance-2.5',
  name: 'Seedance 2.5', provider: 'ByteDance via OpenRouter', group: 'bytedance',
  blurb: 'Longer Seedance generation with first/last-frame interpolation or up to three image references through the Audos proxy.',
  specs: ['text, frames or image references', '4–30s', '480p / 720p', 'optional audio', '3 image refs through proxy'],
  image: 'optional', maxImages: 3, imageLimits: PROXY_IMAGE_LIMITS,
  params: P({
    durationMin: 4, durationMax: 30, defaultDuration: 8,
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
    resolutions: ['480p', '720p'], audio: true, imageRole: true,
    startFrame: true, endFrame: true, referenceImages: true, maxRefs: 3,
    capabilityHint: 'Choose one start frame, first+last frames, or 1–3 image references. OpenRouter supports larger mixed image/audio/video reference sets upstream; this proxy intentionally exposes only these documented fields.',
  }),
  sourceUrl: 'https://openrouter.ai/bytedance/seedance-2.5/llms.txt',
  costHint: 'OpenRouter usage cost via wallet',
});

function veo(id: string, name: string, resolutions: string[]): LabModel {
  return groupA({
    key: `groupa:openrouter/google/${id}`, modelId: `openrouter/google/${id}`,
    name, provider: 'Google via OpenRouter', group: 'google',
    blurb: 'OpenRouter-hosted Veo. Official metadata supports first/last frames, but the current Audos proxy exposes only one start frame for this route.',
    specs: ['text or start frame', '4 / 6 / 8s', resolutions.join(' / '), '16:9 / 9:16', 'optional audio'],
    image: 'optional', maxImages: 1, imageLimits: PROXY_IMAGE_LIMITS,
    params: P({
      durations: [4, 6, 8], defaultDuration: 8,
      aspectRatios: ['16:9', '9:16'], resolutions, audio: true, startFrame: true,
      capabilityHint: 'One start frame is available through this proxy. Official OpenRouter metadata lists a last frame too, but the proxy rejects lastFrameImage and reference arrays for this model.',
    }),
    sourceUrl: `https://openrouter.ai/google/${id}/llms.txt`,
    costHint: 'OpenRouter usage cost via wallet',
  });
}

const RUNWAY_45: LabModel = {
  key: 'runway:gen4.5', modelId: 'gen4.5', name: 'Runway Gen-4.5', provider: 'Runway', group: 'runway',
  plugins: ['runway-recipes'], runner: 'runway',
  submitPath: 'POST /api/generate/runway/video', statusPath: 'GET /api/generate/runway/status/:taskId',
  blurb: 'Current Runway text-to-video and image-to-video model. One start frame only; no end frame, reference set, reference video or audio input.',
  specs: ['text or one start frame', '2–10s', 'six image-video ratios', 'silent'],
  image: 'optional', maxImages: 1, imageLimits: RUNWAY_45_LIMITS,
  params: P({
    durationMin: 2, durationMax: 10, defaultDuration: 5,
    aspectRatios: ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'],
    startFrame: true,
    capabilityHint: 'Text-to-video or one start frame. End frames, multiple references, reference video and audio inputs are not documented for Gen-4.5.',
  }),
  sourceUrl: RUNWAY_DOC, capMs: 1_800_000, costHint: 'quoted before billing', available: true,
};

const RUNWAY_TURBO: LabModel = {
  key: 'runway:gen4_turbo', modelId: 'gen4_turbo', name: 'Runway Gen-4 Turbo', provider: 'Runway', group: 'runway',
  plugins: ['runway-recipes'], runner: 'runway',
  submitPath: 'POST /api/generate/runway/video', statusPath: 'GET /api/generate/runway/status/:taskId',
  blurb: 'Current image-to-video-only Runway model. A single start image is required and prompt text is optional.',
  specs: ['start frame required', '2–10s', 'six ratios', 'silent'],
  image: 'required', maxImages: 1, imageLimits: RUNWAY_TURBO_LIMITS,
  params: P({
    durationMin: 2, durationMax: 10, defaultDuration: 5,
    aspectRatios: ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'],
    textToVideo: false, startFrame: true,
    capabilityHint: 'One start frame is required. End frames, reference sets, reference video and audio inputs are not supported.',
  }),
  sourceUrl: RUNWAY_DOC, capMs: 1_800_000, costHint: 'quoted before billing', available: true,
};

function klingModel(opts: {
  id: string; name: string; specs: string[]; endFrameMode?: string; hint: string;
}): LabModel {
  return {
    key: `kling:${opts.id}`, modelId: opts.id, name: opts.name, provider: 'Kling AI', group: 'kling',
    plugins: ['kling-video'], runner: 'kling',
    submitPath: 'POST /api/generate/kling/text-to-video or /image-to-video',
    statusPath: 'GET /api/generate/kling/status/:taskId',
    blurb: opts.hint,
    specs: opts.specs,
    image: 'optional', maxImages: 2, imageLimits: KLING_IMAGE_LIMITS,
    params: P({
      durations: [5, 10], defaultDuration: 5,
      aspectRatios: ['16:9', '9:16', '1:1'],
      modes: [{ id: 'std', label: 'Standard · 720p' }, { id: 'pro', label: 'Pro · 1080p' }],
      negativePrompt: opts.id !== 'kling-3.0-omni', imageRole: true,
      startFrame: true, endFrame: true, endFrameMode: opts.endFrameMode,
      capabilityHint: opts.hint,
    }),
    sourceUrl: KLING_DOC, capMs: 1_800_000,
    costHint: 'proxy per-second price; mode and length affect cost', available: true,
  };
}

const KLING_25 = klingModel({
  id: 'kling-2.5-turbo', name: 'Kling 2.5 Turbo', endFrameMode: 'pro',
  specs: ['text or first frame', 'first+last in Pro', '5 / 10s', '720p / 1080p', 'silent proxy'],
  hint: 'Text, one start frame, or first+last frames in Pro mode. The current proxy is silent and does not expose reference video, camera, CFG or seed.',
});
const KLING_26 = klingModel({
  id: 'kling-2.6', name: 'Kling 2.6', endFrameMode: 'pro',
  specs: ['text or first frame', 'first+last in Pro', '5 / 10s', '720p / 1080p', 'silent proxy'],
  hint: 'Text, one start frame, or first+last frames in Pro mode. Native audio and voice inputs exist upstream but are rejected by the current proxy, so they are disabled here.',
});
const KLING_30 = klingModel({
  id: 'kling-3.0', name: 'Kling 3.0',
  specs: ['text or first frame', 'first+last frame', '5 / 10s through proxy', '720p / 1080p', 'silent proxy'],
  hint: 'Text, one start frame, or first+last frames. Official Kling supports 3–15s, multi-shot, audio and 4K upstream; this proxy exposes only silent single-shot 5/10s Standard or Pro.',
});
const KLING_30_OMNI = klingModel({
  id: 'kling-3.0-omni', name: 'Kling 3.0 Omni',
  specs: ['text or first frame', 'first+last frame', '5 / 10s through proxy', '720p / 1080p', 'silent proxy'],
  hint: 'Text, one start frame, or first+last frames. Use the separate References row for 2–4 images. Official Omni reference video is not exposed by the current proxy.',
});

const KLING_OMNI_REFERENCES: LabModel = {
  key: 'kling-multi:kling-3.0-omni', modelId: 'kling-3.0-omni',
  name: 'Kling 3.0 Omni — References', provider: 'Kling AI', group: 'kling',
  plugins: ['kling-video'], runner: 'kling', submitPath: 'POST /api/generate/kling/multi-image',
  statusPath: 'GET /api/generate/kling/status/:taskId',
  blurb: 'The only current lab model the proxy accepts on its 2–4 image-reference route.',
  specs: ['2–4 image references', '5 / 10s', '16:9 / 9:16 / 1:1', '720p / 1080p', 'silent proxy'],
  image: 'multi', maxImages: 4, imageLimits: KLING_IMAGE_LIMITS,
  params: P({
    durations: [5, 10], defaultDuration: 5,
    aspectRatios: ['16:9', '9:16', '1:1'],
    modes: [{ id: 'std', label: 'Standard · 720p' }, { id: 'pro', label: 'Pro · 1080p' }],
    multiImage: true, imageRole: true, referenceImages: true, maxRefs: 4, minRefs: 2,
    capabilityHint: 'Attach 2–4 JPEG/PNG references. They are sent as images[] to the proxy, which maps them to Omni reference IDs. Reference video is not exposed by this proxy.',
  }),
  sourceUrl: 'https://app.klingai.com/global/dev/document-api/api/video/3-0-omni/video-omni',
  capMs: 1_800_000, costHint: 'Kling 3.0 Omni proxy price', available: true,
};

const KLING_EXTEND: LabModel = {
  key: 'kling-extend', modelId: '', name: 'Kling — Video Extend', provider: 'Kling AI', group: 'kling',
  plugins: ['kling-video'], runner: 'kling', submitPath: 'POST /api/generate/kling/extend',
  statusPath: 'GET /api/generate/kling/status/:taskId',
  blurb: 'Extends only older compatible Kling V1.0/V1.5/V1.6 jobs. Current 2.5/2.6/3.0 sources are officially unsupported.',
  specs: ['older compatible task ID', '+~4–5s', 'optional prompt'], image: 'none', maxImages: 0,
  params: P({ extend: true, textToVideo: false, capabilityHint: 'Paste an older compatible Kling task ID. Current lab model outputs cannot be extended by this endpoint.' }),
  sourceUrl: 'https://app.klingai.com/global/dev/document-api/api/video/extend-video',
  capMs: 1_800_000, costHint: '$0.25 / extend', available: true,
};

const KLING_LIPSYNC: LabModel = {
  key: 'kling-lipsync', modelId: '', name: 'Kling — Lip Sync', provider: 'Kling AI', group: 'kling',
  plugins: ['kling-video'], runner: 'kling', submitPath: 'POST /api/generate/kling/lip-sync',
  statusPath: 'GET /api/generate/kling/status/:taskId',
  blurb: 'Platform convenience route for lip-syncing a finished Kling task from text or a public audio URL.',
  specs: ['finished task ID', 'text or audio URL', 'no model selector'], image: 'none', maxImages: 0,
  params: P({ lipSync: true, textToVideo: false, capabilityHint: 'The proxy resolves the finished video and performs Kling face/audio preparation. Supply text or a public audio URL.' }),
  sourceUrl: 'https://app.klingai.com/global/dev/document-api/api/video/lip-sync',
  capMs: 1_800_000, costHint: '$0.25 / sync', available: true,
};

const LAB_HEALTH_FAILURES: Record<string, string> = {
  [SEEDANCE_20_FAST.key]: 'OpenRouter key limit exceeded ($254.45 used of $250.00); no render started.',
  [SEEDANCE_25.key]: 'Founder Scene 2 and today’s sweep hit the non-resetting OpenRouter spending limit; no render starts.',
  'groupa:openrouter/google/veo-3.1': 'OpenRouter key limit exceeded ($254.45 used of $250.00); no render started.',
  'groupa:openrouter/google/veo-3.1-fast': 'OpenRouter key limit exceeded ($254.45 used of $250.00); no render started.',
  'groupa:openrouter/google/veo-3.1-lite': 'OpenRouter key limit exceeded ($254.45 used of $250.00); no render started.',
  [RUNWAY_45.key]: 'Catalog and quote passed, but generation returned 401 no_credentials.',
  [RUNWAY_TURBO.key]: 'Catalog and quote passed, but generation returned 401 no_credentials.',
  [KLING_25.key]: 'Generation returned 401 no_credentials; no charge.',
  [KLING_26.key]: 'Generation returned 401 no_credentials; no charge.',
  [KLING_30.key]: 'Generation returned 401 no_credentials; no charge.',
  [KLING_30_OMNI.key]: 'Generation returned 401 no_credentials; no charge.',
  [KLING_OMNI_REFERENCES.key]: 'Kling generation returned 401 no_credentials; references do not change provider auth.',
  [KLING_EXTEND.key]: 'Disabled while Kling generation authentication is failing.',
  [KLING_LIPSYNC.key]: 'Disabled while Kling generation authentication is failing.',
};

const LAB_MODEL_CATALOG: LabModel[] = [
  SEEDANCE_20_FAST, SEEDANCE_25, GEMINI_OMNI,
  veo('veo-3.1', 'Veo 3.1', ['720p', '1080p', '4k']),
  veo('veo-3.1-fast', 'Veo 3.1 Fast', ['720p', '1080p', '4k']),
  veo('veo-3.1-lite', 'Veo 3.1 Lite', ['720p', '1080p']),
  RUNWAY_45, RUNWAY_TURBO,
  KLING_25, KLING_26, KLING_30, KLING_30_OMNI,
  KLING_OMNI_REFERENCES, KLING_EXTEND, KLING_LIPSYNC,
];

export const LAB_MODELS: LabModel[] = LAB_MODEL_CATALOG.map((model) => {
  const reason = LAB_HEALTH_FAILURES[model.key];
  return reason ? { ...model, available: false, unavailableReason: reason } : model;
});

export const DEFAULT_LAB_MODEL_KEY = GEMINI_OMNI.key;

export function labModel(key: string | null | undefined): LabModel | null {
  return LAB_MODELS.find((model) => model.key === String(key || '')) || null;
}
export function labModelsInGroup(group: LabGroupId): LabModel[] { return LAB_MODELS.filter((model) => model.group === group); }
export function isKlingTool(model: LabModel): boolean { return model.params.extend || model.params.lipSync; }

export function labInputLabel(model: LabModel): string {
  if (model.params.extend) return 'Task ID → longer clip';
  if (model.params.lipSync) return 'Task ID + text/audio → lip-synced clip';
  if (model.params.multiImage) return `${model.params.minRefs}–${model.maxImages} references → video`;
  if (model.image === 'required') return 'Start frame → video';
  if (model.params.startFrame) return model.params.textToVideo ? 'Text or frame(s) → video' : 'Start frame → video';
  return 'Text → video';
}

export function pluginLabel(plugin: LabPlugin): string { return plugin; }

export type VerifiedOutcome = 'pass' | 'fail' | 'inconclusive' | 'no-endpoint';
export interface VerifiedResult { outcome: VerifiedOutcome; note: string }
export const LAB_VERIFIED_AT = '2026-10-28';
export const LAB_VERIFIED: Record<string, VerifiedResult> = Object.fromEntries(
  LAB_MODELS.map((model) => [model.key, model.key === GEMINI_OMNI.key
    ? { outcome: 'pass' as VerifiedOutcome, note: 'Paid 8s test passed in 32.2s and returned a durable MP4.' }
    : { outcome: 'fail' as VerifiedOutcome, note: model.unavailableReason || 'No paid pass was recorded in the 28 Oct 2026 sweep.' }]),
);
export function labVerified(key: string): VerifiedResult | null { return LAB_VERIFIED[key] || null; }

export interface LabRunInput {
  prompt: string;
  negativePrompt: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  audio: boolean;
  mode: string;
  camera: string;
  cameraPreset: string;
  cfgScale: number;
  seed: number | null;
  sourceTaskId: string;
  lipSyncText: string;
  lipSyncAudioUrl: string;
  voiceId: string;
  language: string;
  imageRole: LabImageRole;
  fit: 'cover' | 'contain';
  voiceSpeed: number;
  images: string[];
  videoInput: string;
}

export function supportedImageRoles(model: LabModel): Array<{ id: LabImageRole; label: string }> {
  const roles: Array<{ id: LabImageRole; label: string }> = [];
  if (model.params.startFrame) roles.push({ id: 'seed', label: model.image === 'required' ? 'Start frame' : 'Start frame (optional)' });
  if (model.params.endFrame) roles.push({ id: 'frames', label: 'First + last frames' });
  if (model.params.referenceImages) roles.push({ id: 'reference', label: `${model.params.minRefs}–${model.params.maxRefs} reference images` });
  return roles;
}

export function defaultRunInput(model: LabModel, prompt: string): LabRunInput {
  const p = model.params;
  return {
    prompt, negativePrompt: '', duration: p.defaultDuration ?? p.durations[0] ?? p.durationMin ?? 5,
    aspectRatio: p.aspectRatios[0] ?? '16:9', resolution: p.resolutions[0] ?? '', audio: false,
    mode: p.modes[0]?.id ?? '', camera: '', cameraPreset: 'none', cfgScale: 0.5, seed: null,
    sourceTaskId: '', lipSyncText: '', lipSyncAudioUrl: '', voiceId: '', language: '',
    imageRole: p.multiImage ? 'reference' : 'seed', fit: 'cover', voiceSpeed: 1,
    images: [], videoInput: '',
  };
}

export function retargetRunInput(input: LabRunInput, model: LabModel): LabRunInput {
  const p = model.params;
  const keep = <T,>(value: T, allowed: T[], fallback: T): T => allowed.length === 0 ? fallback : allowed.includes(value) ? value : allowed[0];
  const roles = supportedImageRoles(model).map((item) => item.id);
  const ranged = p.durationMin !== null && p.durationMax !== null
    ? Math.max(p.durationMin, Math.min(p.durationMax, Math.round(input.duration))) : null;
  return {
    ...input,
    duration: ranged ?? keep(input.duration, p.durations, p.defaultDuration ?? p.durations[0] ?? input.duration),
    aspectRatio: keep(input.aspectRatio, p.aspectRatios, p.aspectRatios[0] ?? input.aspectRatio),
    resolution: keep(input.resolution, p.resolutions, p.resolutions[0] ?? ''),
    audio: p.audio ? input.audio : false,
    mode: keep(input.mode, p.modes.map((item) => item.id), p.modes[0]?.id ?? ''),
    camera: p.camera ? input.camera : '', cameraPreset: p.camera ? input.cameraPreset : 'none',
    cfgScale: p.cfgScale ? input.cfgScale : 0.5, seed: p.seed ? input.seed : null,
    negativePrompt: p.negativePrompt ? input.negativePrompt : '',
    imageRole: roles.includes(input.imageRole) ? input.imageRole : (roles[0] ?? 'seed'),
    videoInput: p.videoUpload ? input.videoInput : '',
  };
}

export function effectiveRunInput(model: LabModel, input: LabRunInput): LabRunInput {
  const limit = input.imageRole === 'frames' ? 2
    : input.imageRole === 'reference' ? model.params.maxRefs
      : model.params.startFrame ? 1 : 0;
  return { ...input, images: input.images.slice(0, Math.max(0, limit)) };
}

export function describeImageNotice(model: LabModel, input: LabRunInput): string | null {
  if (!input.images.length) return null;
  const effective = effectiveRunInput(model, input).images.length;
  if (!effective) return `${model.name} takes no image input; attached images will not be sent.`;
  if (input.images.length > effective) return `${model.name} will send only the first ${effective} of ${input.images.length} attached images for the selected input mode.`;
  if (model.runner === 'runway') return 'The lab uploads the image to workspace storage and sends Runway a public HTTPS URL.';
  return null;
}

export function describeRunBlock(model: LabModel, input: LabRunInput): string | null {
  if (!model.available) return model.unavailableReason || `${model.name} is unavailable.`;
  if (model.params.extend || model.params.lipSync) {
    if (!input.sourceTaskId.trim()) return `${model.name} needs a finished Kling task ID.`;
    if (model.params.lipSync && !input.lipSyncText.trim() && !input.lipSyncAudioUrl.trim()) return 'Lip Sync needs text or an audio URL.';
    return null;
  }
  const prompt = input.prompt.trim();
  if (model.params.textToVideo || prompt) {
    if (prompt.length < 10) return 'This endpoint needs a prompt of at least 10 characters.';
  }
  if (!Number.isInteger(input.duration)) return `${model.name} duration must be a whole number.`;
  const p = model.params;
  if (p.durationMin !== null && p.durationMax !== null && (input.duration < p.durationMin || input.duration > p.durationMax)) return `${model.name} accepts ${p.durationMin}–${p.durationMax} seconds.`;
  if (p.durations.length && !p.durations.includes(input.duration)) return `${model.name} accepts ${p.durations.join(' / ')} seconds.`;
  if (input.videoInput && !p.videoUpload) return `${model.name} does not accept a source video through this proxy.`;
  if (input.videoInput && input.images.length) return 'Choose either source-video editing or image/frame inputs for one run, not both.';
  if (model.image === 'required' && input.images.length < 1) return `${model.name} requires one start image.`;
  if (input.imageRole === 'frames') {
    if (!p.endFrame) return `${model.name} does not support an end frame through this proxy.`;
    if (input.images.length < 2) return 'First + last frame mode needs exactly two images, in that order.';
    if (p.endFrameMode && input.mode !== p.endFrameMode) return `${model.name} first + last frames require ${p.endFrameMode === 'pro' ? 'Pro' : p.endFrameMode} mode.`;
  }
  if (input.imageRole === 'reference') {
    if (!p.referenceImages) return `${model.name} does not support reference images through this proxy.`;
    if (input.images.length < p.minRefs) return `${model.name} needs at least ${p.minRefs} reference image${p.minRefs === 1 ? '' : 's'}.`;
    if (input.images.length > p.maxRefs) return `${model.name} accepts at most ${p.maxRefs} reference images.`;
  }
  return null;
}
