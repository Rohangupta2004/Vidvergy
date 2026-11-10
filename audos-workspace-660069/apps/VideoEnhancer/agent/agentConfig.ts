/**
 * Enhancer Agent — tunables in one place.
 *
 * OMNI_MAX_CHUNK_S is the longest input clip Omni Flash accepts for a
 * video-to-video edit. Every chunking decision reads it, so raising it here is
 * the only change needed when Omni Flash accepts longer inputs.
 */

import { COST_PLUS_MARKUP, CREDIT_VALUE_USD, quote } from '../../../lib/pricing';

export const OMNI_MODEL = 'gemini-omni-1.1-flash';
export const OMNI_MAX_CHUNK_S = 8;
/** Seconds shared by neighbouring chunks; the stitch crossfades across it. */
export const OMNI_OVERLAP_S = 0.5;
/** Shortest clip worth sending. A shorter tail is widened backwards instead. */
export const OMNI_MIN_CHUNK_S = 2;
export const OMNI_CONCURRENCY = 2;
/** Omni Flash credits per processed second at real cost + 30% (lib/pricing.ts); chunks are rounded up. */
export const OMNI_CREDITS_PER_SECOND = ((quote(OMNI_MODEL, { seconds: 1000 }).costUsd / 1000) * COST_PLUS_MARKUP) / CREDIT_VALUE_USD;
export const OMNI_POLL_TIMEOUT_MS = 15 * 60 * 1000;

export const AGENT_APP_ID = 'video-enhancer';

export const PLANNER_MODEL = 'claude-opus-5';
export const FALLBACK_PLANNER_MODEL = 'gpt-6.1-sol';
export const PLANNER_MAX_TOKENS = 6000;
export const PLANNER_TIMEOUT_MS = 60000;

/** Paid work a single request may start without asking. The user can change it. */
export const DEFAULT_CREDIT_CAP = 40;
export const CREDIT_CAP_CHOICES = [0, 10, 20, 40, 100, 250];
export const MAX_STEPS_PER_TURN = 10;
export const MAX_STEPS_PER_PROJECT = 40;

/** Browser-side person matting is frame-by-frame, so it is kept to short clips. */
export const TRANSPARENT_MAX_S = 60;
/**
 * The denoise/sharpen pass is an SVG filter evaluated per frame on the render
 * farm, roughly a minute of render time per few seconds of video, so longer
 * clips skip it rather than run into the render timeout.
 */
export const RESTORE_MAX_S = 30;
/** Larger files are not decoded in the browser for audio analysis. */
export const AUDIO_DECODE_MAX_BYTES = 300 * 1024 * 1024;

export const RENDER_TIMEOUT_MS = 45 * 60 * 1000;
export const RENDER_POLL_BUDGET_MS = 15000;
