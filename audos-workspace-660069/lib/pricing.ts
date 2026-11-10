/**
 * Vidverge pricing — the single source of truth for what a generation costs.
 *
 * RULES (founder-confirmed, 5 Nov 2026; rates re-verified 6 Nov 2026):
 *   - Price = our real net provider cost x 1.30 (cost plus 30%, not margin on sale).
 *   - Credits = ceil(costUsd x 1.30 / CREDIT_VALUE_USD). One credit is $0.15.
 *   - Text (chat, scripts, scene planning, vision analysis) costs 0 credits.
 *   - Image generation costs 0 credits.
 *   - Everything that generates video or media is charged: video engines,
 *     avatars, Remotion renders, music, voiceover, transcription.
 *   - Items worth less than a credit on their own (a Remotion render, frame
 *     extraction) are bundled into the parent video's quote via `bundle`, so the
 *     ceil happens once for the whole job instead of once per item.
 *   - Real prices only. An engine whose real cost could not be confirmed is
 *     `priced: false`: it quotes 0 credits and carries a TODO until a verified
 *     rate is added here AND in the `vv-credits` server function.
 *   - No failed-render buffer: the vv_credit_ledger shows refunds are issued
 *     when the provider rejects a job before it starts (no provider cost to us),
 *     so there is no ledger evidence for a buffer.
 *
 * The `vv-credits` server function carries an identical copy of RATE_CARD and
 * quote() and is the authority that actually charges. This browser copy exists
 * so every screen can show the same quote before the customer presses Generate.
 * When you change a rate, change BOTH.
 */

export const CREDIT_VALUE_USD = 0.15;
export const COST_PLUS_MARKUP = 1.3;
export const PRICING_VERSION = '2026-11-06';

/** The engine every customer video workflow resolves to (see docs/video-model-health-2026-10-28.md). */
export const DEFAULT_VIDEO_ENGINE = 'gemini-omni-1.1-flash';

export type EngineKind = 'video' | 'avatar' | 'audio' | 'render' | 'transcription' | 'image' | 'text' | 'utility';

export interface EngineRate {
  id: string;
  label: string;
  kind: EngineKind;
  /** How the cost scales. */
  unit: 'second' | 'job' | 'minute' | '1k_chars' | 'render' | 'free' | 'quote';
  /** Where the number came from and when it was checked. */
  source: string;
  priced: boolean;
  free?: boolean;
  todo?: string;
}

export interface QuoteBundle {
  /** Remotion renders that finish this job ($0.05 each, one per started 180 s). */
  remotionRenders?: number;
  /** Deepgram nova-3 seconds transcribed for captions/timing. */
  transcriptionSeconds?: number;
  /** ElevenLabs narration characters. */
  voiceoverChars?: number;
  voiceoverModel?: string;
  /** Generated music bed length in seconds. */
  musicSeconds?: number;
  musicProvider?: 'elevenlabs' | 'gemini';
  /** Total seconds of short sound effects generated for this job. */
  sfxSeconds?: number;
  /** HeyGen HyperFrames output seconds rendered for this job. */
  hyperframesSeconds?: number;
  hyperframesResolution?: '1080p' | '4k' | string;
  hyperframesFps?: number;
}

export interface QuoteOptions {
  seconds?: number;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
  /** Kling quality tier: std = 720p, pro = 1080p. */
  mode?: 'std' | 'pro' | string;
  /** HeyGen look type. Unknown types are quoted at the engine's highest list rate. */
  avatarType?: 'photo' | 'digital_twin' | 'studio' | string;
  /** Characters for text-to-speech. */
  chars?: number;
  /** ElevenLabs TTS model id. */
  model?: string;
  /** Number of separate provider jobs of this engine (per-job engines). */
  jobs?: number;
  /** Output frame rate (HyperFrames: above 30 fps is the higher tier). */
  fps?: number;
  /** Exact USD quote returned by the provider's own quote endpoint (Runway Recipes). */
  providerQuoteUsd?: number;
  /** Runway Recipe request bodies; the wallet re-quotes them server-side before charging. */
  quoteBodies?: Array<Record<string, unknown>>;
  bundle?: QuoteBundle;
}

export interface QuoteLine {
  label: string;
  usd: number;
  priced: boolean;
  todo?: string;
}

export interface Quote {
  engine: string;
  label: string;
  kind: EngineKind;
  /** Our real net cost in USD for everything in the quote. */
  costUsd: number;
  /** What the customer pays: ceil(costUsd x 1.30 / $0.15). */
  credits: number;
  /** False when any charged line has no confirmed real price. */
  priced: boolean;
  free: boolean;
  todo?: string;
  lines: QuoteLine[];
  seconds: number;
  pricingVersion: string;
}

// ---------------------------------------------------------------------------
// Rate card. Every number below is a real provider/platform list price.
// ---------------------------------------------------------------------------

const SRC_OMNI = 'Google Gemini API pricing (ai.google.dev/gemini-api/docs/pricing, updated 2026-10-30): $17.50 per 1M video output tokens x 5,792 tokens per second of 720p = $0.10136/s; OpenRouter GET /api/v1/videos/models (fetched 2026-11-06) lists the same $0.10136/s for 720p with audio. Audos caps Omni at 720p (image-and-video-generation docs). Prompt/reference input tokens ($1.50/1M) are not included.';
const SRC_OPENROUTER = 'OpenRouter GET /api/v1/videos/models pricing_skus, fetched 2026-11-05';
const SRC_KLING = 'Audos kling-video integration tariff (checked against official Kling pricing 2026-10-14)';
const SRC_RUNWAY = 'Audos runway-recipes catalog at $0.01 per Runway credit; free /api/generate/runway/quote on 2026-10-28 returned $0.96 per 8 s (Gen-4.5) and $0.40 per 8 s (Gen-4 Turbo)';
const SRC_HIGGS = 'Audos higgsfield-media integration price table';
const SRC_HEYGEN = 'HeyGen API pricing (help.heygen.com/en/articles/10060327, last updated 2026-10-28, re-fetched 2026-11-06), self-serve price per minute charged by actual seconds generated';
const SRC_HYPERFRAMES = 'HeyGen API pricing (help.heygen.com/en/articles/10060327, re-fetched 2026-11-06): HyperFrames per minute of output — 1080p/30fps $0.15, 1080p/60fps $0.30, 4K/30fps $0.30, 4K/60fps $0.60. Billing granularity is not published, so it is quoted per started minute.';
const SRC_HEYGEN_AVATAR = 'HeyGen API pricing (help.heygen.com/en/articles/10060327, re-fetched 2026-11-06): Avatar Creation — Digital Twin $2.13 per call, Photo Avatar $1.32 per call';
const SRC_ELEVEN = 'Audos elevenlabs-audio integration tariff (provider API rates verified 2026-10-14)';
const SRC_DEEPGRAM = 'Audos deepgram-transcription integration: $0.01 per audio minute on the platform key';
const SRC_REMOTION = 'Founder-confirmed cloud Remotion render fee: $0.05 per render (one render covers up to 180 s, docs/api-costs.md)';

export const RATE_CARD: Record<string, EngineRate> = {
  'gemini-omni-1.1-flash': { id: 'gemini-omni-1.1-flash', label: 'Gemini Omni 1.1 Flash', kind: 'video', unit: 'second', source: SRC_OMNI, priced: true },
  'openrouter/bytedance/seedance-2.5': { id: 'openrouter/bytedance/seedance-2.5', label: 'Seedance 2.5', kind: 'video', unit: 'second', source: `${SRC_OPENROUTER}: $0.0000107 per video token; tokens = width x height x 24 x seconds / 1024 (Audos image-and-video-generation docs)`, priced: true },
  'openrouter/bytedance/seedance-2.0-fast': { id: 'openrouter/bytedance/seedance-2.0-fast', label: 'Seedance 2.0 Fast', kind: 'video', unit: 'second', source: `${SRC_OPENROUTER}: $0.0000042 per video token`, priced: true },
  'openrouter/google/veo-3.1': { id: 'openrouter/google/veo-3.1', label: 'Veo 3.1', kind: 'video', unit: 'second', source: `${SRC_OPENROUTER}: $0.40/s with audio, $0.20/s silent (720p/1080p); 4K $0.60/$0.40`, priced: true },
  'openrouter/google/veo-3.1-fast': { id: 'openrouter/google/veo-3.1-fast', label: 'Veo 3.1 Fast', kind: 'video', unit: 'second', source: `${SRC_OPENROUTER}: 720p $0.10/$0.08, 1080p $0.12/$0.10, 4K $0.30/$0.25 (audio/silent)`, priced: true },
  'openrouter/google/veo-3.1-lite': { id: 'openrouter/google/veo-3.1-lite', label: 'Veo 3.1 Lite', kind: 'video', unit: 'second', source: `${SRC_OPENROUTER}: 720p $0.05/$0.03, 1080p $0.08/$0.05 (audio/silent)`, priced: true },
  'kling-2.5-turbo': { id: 'kling-2.5-turbo', label: 'Kling 2.5 Turbo', kind: 'video', unit: 'second', source: `${SRC_KLING}: std $0.042/s, pro $0.070/s`, priced: true },
  'kling-2.6': { id: 'kling-2.6', label: 'Kling 2.6', kind: 'video', unit: 'second', source: `${SRC_KLING}: std $0.042/s, pro $0.070/s`, priced: true },
  'kling-3.0': { id: 'kling-3.0', label: 'Kling 3.0', kind: 'video', unit: 'second', source: `${SRC_KLING}: std $0.084/s, pro $0.112/s`, priced: true },
  'kling-3.0-omni': { id: 'kling-3.0-omni', label: 'Kling 3.0 Omni', kind: 'video', unit: 'second', source: `${SRC_KLING}: std $0.084/s, pro $0.112/s`, priced: true },
  'kling-extend': { id: 'kling-extend', label: 'Kling extend', kind: 'video', unit: 'job', source: `${SRC_KLING}: $0.25 per extension`, priced: true },
  'kling-lip-sync': { id: 'kling-lip-sync', label: 'Kling lip-sync', kind: 'video', unit: 'job', source: `${SRC_KLING}: $0.25 per lip-sync`, priced: true },
  'runway/gen4.5': { id: 'runway/gen4.5', label: 'Runway Gen-4.5', kind: 'video', unit: 'second', source: `${SRC_RUNWAY}: $0.12/s`, priced: true },
  'runway/gen4_turbo': { id: 'runway/gen4_turbo', label: 'Runway Gen-4 Turbo', kind: 'video', unit: 'second', source: `${SRC_RUNWAY}: $0.05/s`, priced: true },
  'runway/recipe': { id: 'runway/recipe', label: 'Runway Recipe', kind: 'video', unit: 'quote', source: 'Exact USD from the platform POST /api/generate/runway/quote (Recipe formulas differ per recipe). vv-credits re-quotes server-side.', priced: true },
  'higgsfield/minimax-hailuo-02': { id: 'higgsfield/minimax-hailuo-02', label: 'Higgsfield Hailuo 02', kind: 'video', unit: 'job', source: `${SRC_HIGGS}: text-to-video $1.00 per job`, priced: true },
  'higgsfield/dop-turbo': { id: 'higgsfield/dop-turbo', label: 'Higgsfield DoP Turbo', kind: 'video', unit: 'job', source: `${SRC_HIGGS}: image-to-video $1.00 per job`, priced: true },
  'higgsfield/dop-standard': { id: 'higgsfield/dop-standard', label: 'Higgsfield DoP Standard', kind: 'video', unit: 'job', source: `${SRC_HIGGS}: image-to-video $1.00 per job`, priced: true },
  'higgsfield/dop-lite': { id: 'higgsfield/dop-lite', label: 'Higgsfield DoP Lite', kind: 'video', unit: 'job', source: `${SRC_HIGGS}: image-to-video $1.00 per job`, priced: true },
  'heygen/avatar_iv': { id: 'heygen/avatar_iv', label: 'HeyGen Avatar IV', kind: 'avatar', unit: 'second', source: `${SRC_HEYGEN}: photo $2.31/min, digital twin $4.83/min, studio $4.83/min (unknown look type is quoted at $4.83/min)`, priced: true },
  'heygen/avatar_v': { id: 'heygen/avatar_v', label: 'HeyGen Avatar V', kind: 'avatar', unit: 'second', source: `${SRC_HEYGEN}: digital twin $7.20/min`, priced: true },
  'heygen/avatar_iii': { id: 'heygen/avatar_iii', label: 'HeyGen Avatar III', kind: 'avatar', unit: 'second', source: `${SRC_HEYGEN}: digital twin $0.60/min, studio $0.99/min, photo $0.99/min`, priced: true },
  'heygen/video-agent': { id: 'heygen/video-agent', label: 'HeyGen Video Agent', kind: 'avatar', unit: 'second', source: `${SRC_HEYGEN}: Video Agent prompt to video $5.82/min`, priced: true },
  'heygen/translate': { id: 'heygen/translate', label: 'HeyGen video translation', kind: 'avatar', unit: 'minute', source: `${SRC_HEYGEN}: audio only $0.57/min, speed lip sync $0.81/min, precision lip sync $1.50/min (unknown mode quoted at $1.50/min)`, priced: true },
  'heygen/cinematic-avatar': { id: 'heygen/cinematic-avatar', label: 'HeyGen cinematic avatar', kind: 'avatar', unit: 'job', source: `${SRC_HEYGEN}: Avatar Shots — Cinematic $7.30 per 720p video, $17.67 per 1080p video`, priced: true },
  'heygen/lipsync': { id: 'heygen/lipsync', label: 'HeyGen lip-sync', kind: 'avatar', unit: 'minute', source: `${SRC_HEYGEN}: lipsync audio mode speed $0.84/min, precision $1.74/min (unknown mode quoted at $1.74/min)`, priced: true },
  'heygen/hyperframes': { id: 'heygen/hyperframes', label: 'HeyGen HyperFrames render', kind: 'render', unit: 'minute', source: SRC_HYPERFRAMES, priced: true },
  'heygen/avatar-create': { id: 'heygen/avatar-create', label: 'HeyGen custom avatar', kind: 'avatar', unit: 'job', source: `${SRC_HEYGEN_AVATAR}. Prompt-designed avatars have no published rate.`, priced: true },
  'elevenlabs/tts': { id: 'elevenlabs/tts', label: 'ElevenLabs voiceover', kind: 'audio', unit: '1k_chars', source: `${SRC_ELEVEN}: eleven_turbo_v2_5 (default) $0.30 per 1K chars, eleven_v3/eleven_v4 $0.08 per 1K chars, $0.01 minimum per request`, priced: true },
  'elevenlabs/music': { id: 'elevenlabs/music', label: 'ElevenLabs music', kind: 'audio', unit: 'second', source: `${SRC_ELEVEN}: about $0.01 per generated second`, priced: true },
  'gemini/lyria-music': { id: 'gemini/lyria-music', label: 'Gemini Lyria music', kind: 'audio', unit: 'job', source: `${SRC_ELEVEN}: $0.04 per clip (<= 30 s), $0.08 per full track`, priced: true },
  'elevenlabs/voice-clone': { id: 'elevenlabs/voice-clone', label: 'ElevenLabs voice clone', kind: 'audio', unit: 'job', source: `${SRC_ELEVEN}: $1.00 per cloned voice`, priced: true },
  'elevenlabs/speech-to-speech': { id: 'elevenlabs/speech-to-speech', label: 'ElevenLabs voice changer', kind: 'audio', unit: 'minute', source: `${SRC_ELEVEN}: $0.30 per input minute, $0.01 minimum`, priced: true },
  'elevenlabs/sfx': { id: 'elevenlabs/sfx', label: 'ElevenLabs sound effect', kind: 'audio', unit: 'second', source: `${SRC_ELEVEN}: Vidverge generates sound effects through the ElevenLabs music endpoint at about $0.01 per second, 3 s minimum length per request`, priced: true },
  'deepgram/nova-3': { id: 'deepgram/nova-3', label: 'Deepgram transcription', kind: 'transcription', unit: 'minute', source: SRC_DEEPGRAM, priced: true },
  'openai/whisper': { id: 'openai/whisper', label: 'Whisper transcription', kind: 'transcription', unit: 'minute', source: 'No confirmed platform rate', priced: false, todo: 'TODO(pricing): /api/generate/transcribe (Whisper) has no documented platform price — charging disabled.' },
  'remotion/render': { id: 'remotion/render', label: 'Remotion render', kind: 'render', unit: 'render', source: SRC_REMOTION, priced: true },
  'platform/ffmpeg': { id: 'platform/ffmpeg', label: 'Frames / trim / stitch / overlay', kind: 'utility', unit: 'job', source: 'Platform utility; provider cost is not exposed to workspace code (docs/api-costs.md)', priced: false, todo: 'TODO(pricing): frame extraction, clip, stitch and overlay utilities expose no real cost — bundled at $0.' },
  image: { id: 'image', label: 'Image generation', kind: 'image', unit: 'free', source: 'Founder rule: image generation is free to customers', priced: true, free: true },
  text: { id: 'text', label: 'Text, chat and planning', kind: 'text', unit: 'free', source: 'Founder rule: text generation is free to customers', priced: true, free: true },
};

const ALIASES: Record<string, string> = {
  'gemini-omni-flash-preview': 'gemini-omni-1.1-flash',
  'gemini-omni-1.1': 'gemini-omni-1.1-flash',
  'gemini-omni': 'gemini-omni-1.1-flash',
  omni: 'gemini-omni-1.1-flash',
  'omni-flash': 'gemini-omni-1.1-flash',
  'veo-3.1-generate-preview': 'gemini-omni-1.1-flash',
  'veo-3.1-fast-generate-preview': 'gemini-omni-1.1-flash',
  'veo-3.0-generate-001': 'gemini-omni-1.1-flash',
  'veo-3.0-fast-generate-001': 'gemini-omni-1.1-flash',
  'veo-2.0-generate-001': 'gemini-omni-1.1-flash',
  'sora-2': 'gemini-omni-1.1-flash',
  'sora-2-pro': 'gemini-omni-1.1-flash',
  'platform-veo-3.1-managed': 'gemini-omni-1.1-flash',
  'bytedance/seedance-2.5': 'openrouter/bytedance/seedance-2.5',
  'seedance-2.5': 'openrouter/bytedance/seedance-2.5',
  seedance: 'openrouter/bytedance/seedance-2.5',
  'bytedance/seedance-2.0-fast': 'openrouter/bytedance/seedance-2.0-fast',
  'seedance-2.0-fast': 'openrouter/bytedance/seedance-2.0-fast',
  'google/veo-3.1': 'openrouter/google/veo-3.1',
  'google/veo-3.1-fast': 'openrouter/google/veo-3.1-fast',
  'google/veo-3.1-lite': 'openrouter/google/veo-3.1-lite',
  'kling-v2-5-turbo': 'kling-2.5-turbo',
  'kling-v2-6': 'kling-2.6',
  'kling-v3': 'kling-3.0',
  'kling-v3-omni': 'kling-3.0-omni',
  'kling-v1': 'kling-2.5-turbo',
  'kling-v1-5': 'kling-2.5-turbo',
  'kling-v1-6': 'kling-2.5-turbo',
  'kling-v2-master': 'kling-2.5-turbo',
  kling: 'kling-2.5-turbo',
  'gen4.5': 'runway/gen4.5',
  'gen-4.5': 'runway/gen4.5',
  gen4_turbo: 'runway/gen4_turbo',
  'gen4-turbo': 'runway/gen4_turbo',
  'runway-recipe': 'runway/recipe',
  'minimax-hailuo-02': 'higgsfield/minimax-hailuo-02',
  'dop-turbo': 'higgsfield/dop-turbo',
  'dop-standard': 'higgsfield/dop-standard',
  'dop-lite': 'higgsfield/dop-lite',
  avatar_iv: 'heygen/avatar_iv',
  avatar_v: 'heygen/avatar_v',
  avatar_iii: 'heygen/avatar_iii',
  'video-agent': 'heygen/video-agent',
  heygen: 'heygen/avatar_iv',
  'heygen-avatar': 'heygen/avatar_iv',
  hyperframes: 'heygen/hyperframes',
  'avatar-create': 'heygen/avatar-create',
  'heygen-avatar-create': 'heygen/avatar-create',
  sfx: 'elevenlabs/sfx',
  remotion: 'remotion/render',
  'remotion-render': 'remotion/render',
  deepgram: 'deepgram/nova-3',
  'nova-3': 'deepgram/nova-3',
  whisper: 'openai/whisper',
  elevenlabs: 'elevenlabs/tts',
  voiceover: 'elevenlabs/tts',
  lyria: 'gemini/lyria-music',
  music: 'elevenlabs/music',
};

/** Canonical rate-card id for any model/engine string the apps use (incl. `vpl:<runner>:<model>`). */
export function normalizeEngine(raw: unknown): string {
  let id = String(raw ?? '').trim();
  if (!id) return DEFAULT_VIDEO_ENGINE;
  id = id.replace(/^vpl:[a-z0-9_-]+:/i, '');
  const lower = id.toLowerCase();
  if (RATE_CARD[lower]) return lower;
  if (ALIASES[lower]) return ALIASES[lower];
  if (lower.startsWith('openrouter/') && RATE_CARD[lower]) return lower;
  if (lower.startsWith('runway/')) return lower.includes('turbo') ? 'runway/gen4_turbo' : lower.includes('recipe') ? 'runway/recipe' : 'runway/gen4.5';
  if (lower.startsWith('higgsfield/') && RATE_CARD[lower]) return lower;
  return lower;
}

export function rateFor(engine: unknown): EngineRate | null {
  return RATE_CARD[normalizeEngine(engine)] || null;
}

const SEEDANCE_25_SIZES: Record<string, Record<string, [number, number]>> = {
  '480p': { '16:9': [854, 480], '4:3': [752, 560], '1:1': [640, 640], '3:4': [560, 752], '9:16': [480, 854], '21:9': [992, 432] },
  '720p': { '16:9': [1280, 720], '4:3': [1112, 834], '1:1': [960, 960], '3:4': [834, 1112], '9:16': [720, 1280], '21:9': [1470, 630] },
};
const SEEDANCE_20_FAST_SIZES: Record<string, Record<string, [number, number]>> = {
  '480p': { '16:9': [854, 480], '4:3': [640, 480], '1:1': [480, 480], '3:4': [480, 640], '9:16': [480, 854], '21:9': [1120, 480] },
  '720p': { '16:9': [1280, 720], '4:3': [960, 720], '1:1': [720, 720], '3:4': [720, 960], '9:16': [720, 1280], '21:9': [1680, 720] },
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normRes(value: unknown, fallback: string): string {
  const v = String(value || '').toLowerCase();
  if (v === '480p' || v === '720p' || v === '1080p') return v;
  if (v === '4k' || v === '2160p') return '4k';
  return fallback;
}

function seedanceUsdPerSecond(sizes: Record<string, Record<string, [number, number]>>, usdPerToken: number, opts: QuoteOptions): number {
  const res = normRes(opts.resolution, '720p') === '480p' ? '480p' : '720p';
  const ratio = sizes[res][String(opts.aspectRatio || '16:9')] ? String(opts.aspectRatio || '16:9') : '16:9';
  const [w, h] = sizes[res][ratio];
  return ((w * h * 24) / 1024) * usdPerToken;
}

function heygenUsdPerSecond(engine: string, avatarType: unknown): number {
  const t = String(avatarType || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (engine === 'heygen/avatar_v') return 7.2 / 60;
  if (engine === 'heygen/avatar_iii') return t === 'digital_twin' ? 0.6 / 60 : 0.99 / 60;
  if (engine === 'heygen/video-agent') return 5.82 / 60;
  return t === 'photo' ? 2.31 / 60 : 4.83 / 60;
}

function heygenUsdPerMinute(engine: string, mode: unknown): number {
  const m = String(mode || '').toLowerCase();
  if (engine === 'heygen/translate') return m === 'audio' ? 0.57 : m === 'speed' ? 0.81 : 1.5;
  return m === 'speed' ? 0.84 : 1.74;
}

function hyperframesUsd(seconds: number, resolution: unknown, fps: unknown): number {
  const s = Math.max(0, seconds);
  if (!s) return 0;
  const fourK = normRes(resolution, '1080p') === '4k';
  const high = num(fps, 30) > 30;
  const perMinute = fourK ? (high ? 0.6 : 0.3) : high ? 0.3 : 0.15;
  return Math.ceil(s / 60 - 1e-9) * perMinute;
}

function avatarCreateUsd(avatarType: unknown): number | null {
  const t = String(avatarType || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (t === 'digital_twin') return 2.13;
  if (t === 'photo') return 1.32;
  return null;
}

function ttsUsd(chars: number, model: unknown): number {
  const c = Math.max(0, Math.round(chars));
  if (!c) return 0;
  const m = String(model || '').toLowerCase();
  const rate = m === 'eleven_v3' || m === 'eleven_v4' ? 0.08 : 0.3;
  return Math.max(0.01, (c / 1000) * rate);
}

/** Real USD for one engine line, before bundling. */
function engineLine(engine: string, opts: QuoteOptions): QuoteLine {
  const rate = RATE_CARD[engine];
  if (!rate) {
    return { label: engine, usd: 0, priced: false, todo: `TODO(pricing): no verified rate for engine "${engine}" — charging disabled.` };
  }
  if (rate.free) return { label: rate.label, usd: 0, priced: true };
  if (!rate.priced) return { label: rate.label, usd: 0, priced: false, todo: rate.todo };
  const seconds = Math.max(0, num(opts.seconds));
  const jobs = Math.max(1, Math.round(num(opts.jobs, 1)));
  const audio = opts.audio === true;
  const res = normRes(opts.resolution, '720p');
  const pro = String(opts.mode || '').toLowerCase() === 'pro' || res === '1080p';
  let usd = 0;
  switch (engine) {
    case 'gemini-omni-1.1-flash':
      usd = seconds * ((5792 * 17.5) / 1_000_000);
      break;
    case 'openrouter/bytedance/seedance-2.5':
      usd = seconds * seedanceUsdPerSecond(SEEDANCE_25_SIZES, 0.0000107, opts);
      break;
    case 'openrouter/bytedance/seedance-2.0-fast':
      usd = seconds * seedanceUsdPerSecond(SEEDANCE_20_FAST_SIZES, 0.0000042, opts);
      break;
    case 'openrouter/google/veo-3.1':
      usd = seconds * (res === '4k' ? (audio ? 0.6 : 0.4) : audio ? 0.4 : 0.2);
      break;
    case 'openrouter/google/veo-3.1-fast':
      usd = seconds * (res === '4k' ? (audio ? 0.3 : 0.25) : res === '1080p' ? (audio ? 0.12 : 0.1) : audio ? 0.1 : 0.08);
      break;
    case 'openrouter/google/veo-3.1-lite':
      usd = seconds * (res === '1080p' ? (audio ? 0.08 : 0.05) : audio ? 0.05 : 0.03);
      break;
    case 'kling-2.5-turbo':
    case 'kling-2.6':
      usd = seconds * (pro ? 0.07 : 0.042);
      break;
    case 'kling-3.0':
    case 'kling-3.0-omni':
      usd = seconds * (pro ? 0.112 : 0.084);
      break;
    case 'kling-extend':
    case 'kling-lip-sync':
      usd = jobs * 0.25;
      break;
    case 'runway/gen4.5':
      usd = seconds * 0.12;
      break;
    case 'runway/gen4_turbo':
      usd = seconds * 0.05;
      break;
    case 'runway/recipe': {
      const quoted = num(opts.providerQuoteUsd, NaN);
      if (!Number.isFinite(quoted) || quoted <= 0) {
        return { label: rate.label, usd: 0, priced: false, todo: 'Runway Recipe needs the live provider quote before it can be priced.' };
      }
      usd = quoted;
      break;
    }
    case 'higgsfield/minimax-hailuo-02':
    case 'higgsfield/dop-turbo':
    case 'higgsfield/dop-standard':
    case 'higgsfield/dop-lite':
      usd = jobs * 1;
      break;
    case 'heygen/avatar_iv':
    case 'heygen/avatar_v':
    case 'heygen/avatar_iii':
    case 'heygen/video-agent':
      usd = seconds * heygenUsdPerSecond(engine, opts.avatarType);
      break;
    case 'heygen/translate':
    case 'heygen/lipsync':
      usd = (seconds / 60) * heygenUsdPerMinute(engine, opts.mode);
      break;
    case 'heygen/cinematic-avatar':
      usd = jobs * (res === '1080p' ? 17.67 : 7.3);
      break;
    case 'heygen/hyperframes':
      usd = hyperframesUsd(seconds, opts.resolution, opts.fps);
      break;
    case 'heygen/avatar-create': {
      const each = avatarCreateUsd(opts.avatarType);
      if (each == null) {
        return { label: rate.label, usd: 0, priced: false, todo: 'TODO(pricing): HeyGen publishes no rate for prompt-designed avatars — charging disabled.' };
      }
      usd = jobs * each;
      break;
    }
    case 'elevenlabs/sfx':
      usd = Math.max(3, seconds) * 0.01;
      break;
    case 'elevenlabs/tts':
      usd = ttsUsd(num(opts.chars), opts.model);
      break;
    case 'elevenlabs/music':
      usd = seconds * 0.01;
      break;
    case 'gemini/lyria-music':
      usd = jobs * (seconds > 30 ? 0.08 : 0.04);
      break;
    case 'elevenlabs/voice-clone':
      usd = jobs * 1;
      break;
    case 'elevenlabs/speech-to-speech':
      usd = Math.max(0.01, (seconds / 60) * 0.3);
      break;
    case 'deepgram/nova-3':
      usd = (seconds / 60) * 0.01;
      break;
    case 'remotion/render':
      usd = 0.05 * Math.max(jobs, seconds > 0 ? Math.ceil(seconds / 180) : 1);
      break;
    default:
      return { label: rate.label, usd: 0, priced: false, todo: rate.todo || `TODO(pricing): no rate formula for ${engine}.` };
  }
  return { label: rate.label, usd, priced: true };
}

function bundleLines(bundle: QuoteBundle | undefined): QuoteLine[] {
  if (!bundle) return [];
  const out: QuoteLine[] = [];
  const renders = Math.max(0, Math.round(num(bundle.remotionRenders)));
  if (renders) out.push({ label: `Remotion render x${renders}`, usd: 0.05 * renders, priced: true });
  const tSec = Math.max(0, num(bundle.transcriptionSeconds));
  if (tSec) out.push({ label: 'Deepgram transcription', usd: (tSec / 60) * 0.01, priced: true });
  const chars = Math.max(0, num(bundle.voiceoverChars));
  if (chars) out.push({ label: 'ElevenLabs voiceover', usd: ttsUsd(chars, bundle.voiceoverModel), priced: true });
  const mSec = Math.max(0, num(bundle.musicSeconds));
  if (mSec) {
    out.push(bundle.musicProvider === 'gemini'
      ? { label: 'Gemini Lyria music', usd: mSec > 30 ? 0.08 : 0.04, priced: true }
      : { label: 'ElevenLabs music', usd: mSec * 0.01, priced: true });
  }
  const sfxSec = Math.max(0, num(bundle.sfxSeconds));
  if (sfxSec) out.push({ label: 'ElevenLabs sound effects', usd: sfxSec * 0.01, priced: true });
  const hfSec = Math.max(0, num(bundle.hyperframesSeconds));
  if (hfSec) out.push({ label: 'HyperFrames render', usd: hyperframesUsd(hfSec, bundle.hyperframesResolution, bundle.hyperframesFps), priced: true });
  return out;
}

/** Credits for a real USD cost: ceil(cost x 1.30 / $0.15). */
export function creditsForUsd(costUsd: number): number {
  const usd = num(costUsd);
  if (usd <= 0) return 0;
  return Math.ceil((usd * COST_PLUS_MARKUP) / CREDIT_VALUE_USD - 1e-9);
}

/**
 * Quote one generation: returns our real cost and the credits it costs the
 * customer. Bundled items (renders, transcription, narration, music) are added
 * to the parent's cost before the single ceil.
 */
export function quote(engine: unknown, options: QuoteOptions = {}): Quote {
  const id = normalizeEngine(engine);
  const rate = RATE_CARD[id];
  const main = engineLine(id, options);
  const lines = [main, ...bundleLines(options.bundle)];
  const unpriced = lines.filter((l) => !l.priced);
  const priced = unpriced.length === 0;
  const costUsd = Math.round(lines.reduce((sum, l) => sum + (l.priced ? l.usd : 0), 0) * 10000) / 10000;
  return {
    engine: id,
    label: rate ? rate.label : id,
    kind: rate ? rate.kind : 'video',
    costUsd,
    credits: main.priced ? creditsForUsd(costUsd) : 0,
    priced,
    free: !!rate?.free,
    todo: unpriced.map((l) => l.todo).filter(Boolean).join(' ') || undefined,
    lines,
    seconds: Math.max(0, num(options.seconds)),
    pricingVersion: PRICING_VERSION,
  };
}

/** Sum several engine lines into one job and ceil once (e.g. avatar + B-roll + render). */
export function quoteJob(items: Array<{ engine: unknown; options?: QuoteOptions }>, label = 'Video job'): Quote {
  const parts = items.map((item) => quote(item.engine, item.options || {}));
  const lines = parts.flatMap((p) => p.lines);
  const costUsd = Math.round(lines.reduce((s, l) => s + (l.priced ? l.usd : 0), 0) * 10000) / 10000;
  const anyPricedMain = parts.some((p) => p.credits > 0 || p.free);
  return {
    engine: parts.map((p) => p.engine).join('+'),
    label,
    kind: parts[0]?.kind || 'video',
    costUsd,
    credits: anyPricedMain ? creditsForUsd(costUsd) : 0,
    priced: parts.every((p) => p.priced),
    free: parts.every((p) => p.free),
    todo: parts.map((p) => p.todo).filter(Boolean).join(' ') || undefined,
    lines,
    seconds: parts.reduce((s, p) => Math.max(s, p.seconds), 0),
    pricingVersion: PRICING_VERSION,
  };
}

export function formatUsd(usd: number): string {
  const v = num(usd);
  return v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
}

/** Example rows for the pricing screen and landing page, computed from the live rate card. */
export interface RateCardRow {
  engine: string;
  label: string;
  example: string;
  credits: number;
  costUsd: number;
  priced: boolean;
}

export function rateCardExamples(): RateCardRow[] {
  const rows: Array<[string, string, QuoteOptions]> = [
    ['gemini-omni-1.1-flash', '8 s clip, 720p', { seconds: 8 }],
    ['openrouter/bytedance/seedance-2.5', '8 s clip, 720p 16:9', { seconds: 8, resolution: '720p', aspectRatio: '16:9' }],
    ['openrouter/bytedance/seedance-2.5', '8 s clip, 480p 16:9', { seconds: 8, resolution: '480p', aspectRatio: '16:9' }],
    ['openrouter/google/veo-3.1', '8 s clip with audio', { seconds: 8, audio: true }],
    ['openrouter/google/veo-3.1-fast', '8 s clip, 720p with audio', { seconds: 8, audio: true, resolution: '720p' }],
    ['openrouter/google/veo-3.1-lite', '8 s clip, 720p with audio', { seconds: 8, audio: true, resolution: '720p' }],
    ['kling-2.5-turbo', '5 s clip, std 720p', { seconds: 5, mode: 'std' }],
    ['kling-3.0-omni', '10 s clip, std 720p', { seconds: 10, mode: 'std' }],
    ['runway/gen4.5', '8 s clip', { seconds: 8 }],
    ['runway/gen4_turbo', '8 s clip', { seconds: 8 }],
    ['higgsfield/minimax-hailuo-02', 'one clip', { jobs: 1 }],
    ['heygen/avatar_iv', '30 s presenter (studio / twin)', { seconds: 30 }],
    ['heygen/avatar_iii', '30 s presenter (studio look)', { seconds: 30, avatarType: 'studio' }],
    ['elevenlabs/tts', '1,000-character voiceover (v3/v4)', { chars: 1000, model: 'eleven_v4' }],
    ['elevenlabs/music', '60 s music bed', { seconds: 60 }],
    ['heygen/hyperframes', '1 min HyperFrames render, 1080p 30 fps', { seconds: 60 }],
    ['heygen/avatar-create', 'custom photo avatar', { jobs: 1, avatarType: 'photo' }],
    ['deepgram/nova-3', '10 min transcription', { seconds: 600 }],
    ['remotion/render', 'one final render (up to 3 min)', { jobs: 1 }],
  ];
  return rows.map(([engine, example, options]) => {
    const q = quote(engine, options);
    return { engine: q.engine, label: q.label, example, credits: q.credits, costUsd: q.costUsd, priced: q.priced };
  });
}

/** One plain-language pricing rule for agent prompts and UI copy, with live example costs. */
export function pricingRuleText(): string {
  const c = (engine: string, options: QuoteOptions) => quote(engine, options).credits;
  return [
    `Pay per use: 1 credit = $${CREDIT_VALUE_USD.toFixed(2)}; every paid step costs the real engine cost + ${Math.round((COST_PLUS_MARKUP - 1) * 100)}%, rounded up to whole credits.`,
    'Text (chat, scripts, planning, research) and image generation are free.',
    `Examples: Omni Flash 8s = ${c('gemini-omni-1.1-flash', { seconds: 8 })} credits; Seedance 2.5 8s 720p = ${c('openrouter/bytedance/seedance-2.5', { seconds: 8, resolution: '720p' })};`,
    `Veo 3.1 8s with audio = ${c('openrouter/google/veo-3.1', { seconds: 8, audio: true })}; Kling 3.0 Omni 10s = ${c('kling-3.0-omni', { seconds: 10 })}; HeyGen avatar 30s = ${c('heygen/avatar_iv', { seconds: 30 })};`,
    `ElevenLabs 1,000-char voiceover = ${c('elevenlabs/tts', { chars: 1000, model: 'eleven_v4' })}; a final Remotion render = ${c('remotion/render', { jobs: 1 })}.`,
  ].join(' ');
}

/** Engines left unpriced (charging disabled) — shown to the founder in Health/pricing notes. */
export function unpricedEngines(): EngineRate[] {
  return Object.values(RATE_CARD).filter((r) => !r.priced);
}
