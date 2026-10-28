/**
 * Image-to-video generation for every Faceless beat that starts from a still.
 *
 * Gemini Omni 1.1 Flash animates every beat, match cut and documentary depth
 * plate. It is the only model that passed the 28 Oct 2026 paid sweep.
 * Every submission carries a durable seed still and clamps duration to 4–8s.
 */

import { FacelessError, type AspectId, type ResolvedAsset } from '../types/editorial';
import { callHook, sleep } from '../lib/platform';
import { aspectOf } from '../lib/facelessOptions';
import { adoptExternalOperation, resumeExternalOperation } from '../../VideoProviderLab/labClient';

const STAGE = 'assets' as const;

export const VIDEO_COST = 0.4;
export const VIDEO_MODEL = 'gemini-omni-1.1-flash';
/** Backward-compatible import name; intentionally resolves to verified Omni. */
export const SEEDANCE_VIDEO_MODEL = VIDEO_MODEL;
export type FacelessVideoModel = typeof VIDEO_MODEL;
export const MAX_CLIP_SECONDS = 8;

const POLL_MS = 6000;
const MAX_WAIT_MS = 6 * 60 * 1000;

export interface GenerateVideoOptions {
  durationSeconds?: number;
  styleSuffix?: string;
  /** Landscape unless the brief asked for portrait. */
  aspect?: AspectId;
  /** Durable first frame that this clip must animate; enforced at runtime. */
  seedImageUrl?: string;
  /** Optional prior beat still that gives a match cut shared geometry. */
  referenceImageUrl?: string;
  /** Canonical verified Gemini Omni model. */
  model?: FacelessVideoModel;
  onProgress?: (percent: number) => void;
  backgroundJobId?: number | null;
  onAdopted?: (jobId: number) => void;
}

export async function generateVideo(prompt: string, options: GenerateVideoOptions = {}): Promise<string> {
  const text = [String(prompt || '').trim(), String(options.styleSuffix || '').trim(), 'No on-screen text or lettering.']
    .filter(Boolean)
    .join(' ')
    .slice(0, 1000);
  if (text.length < 12) {
    throw new FacelessError('A video prompt needs more than a few words.', STAGE, 'prompt_too_short');
  }

  const duration = Math.max(4, Math.min(MAX_CLIP_SECONDS, Math.ceil(options.durationSeconds || 5)));
  const seedImageUrl = String(options.seedImageUrl || '');
  if (!/^https?:\/\//i.test(seedImageUrl)) {
    throw new FacelessError('AI video generation requires a durable seed still.', STAGE, 'no_seed_image');
  }
  const model = options.model || VIDEO_MODEL;
  const label = `Faceless · ${model}`;
  if (options.backgroundJobId) {
    const resumed = await resumeExternalOperation({
      jobId: options.backgroundJobId, label, modelId: model, duration,
    });
    return resumed.videoUrl;
  }

  const submitted = await callHook<{ operationId?: string }>(
    'faceless-assets',
    {
      op: 'video_submit',
      model,
      prompt: text,
      aspectRatio: aspectOf(options.aspect).providerRatio,
      duration,
      imageUrl: seedImageUrl,
      referenceImageUrl: options.referenceImageUrl || null,
    },
    STAGE,
  );
  const operationId = String(submitted.operationId || '');
  if (!operationId) {
    throw new FacelessError('The video model accepted the prompt but returned no operation id.', STAGE, 'no_operation');
  }

  const adopted = await adoptExternalOperation({
    provider: 'veo', operationId, modelId: model, modelName: label,
    prompt: text, duration, onAdopted: options.onAdopted,
  });
  if (adopted) return adopted.videoUrl;

  const deadline = Date.now() + MAX_WAIT_MS;
  let misses = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let status: { status?: string; videoUrl?: string; progress?: number; errorMessage?: string };
    try {
      status = await callHook('faceless-assets', { op: 'video_status', operationId }, STAGE);
    } catch {
      misses += 1;
      if (misses >= 6) break;
      continue;
    }
    misses = 0;
    const state = String(status.status || '');
    if (state === 'completed' && status.videoUrl) return String(status.videoUrl);
    if (state === 'failed') {
      throw new FacelessError(
        `AI video generation failed: ${status.errorMessage || 'no reason given by the provider'}`,
        STAGE,
        'video_failed',
      );
    }
    if (typeof status.progress === 'number') options.onProgress?.(status.progress);
  }

  throw new FacelessError('AI video generation did not finish in time.', STAGE, 'video_timeout');
}

export async function generateVideoAsset(
  beatId: string,
  prompt: string,
  options: GenerateVideoOptions = {},
): Promise<ResolvedAsset> {
  const url = await generateVideo(prompt, options);
  const duration = Math.max(4, Math.min(MAX_CLIP_SECONDS, Math.ceil(options.durationSeconds || 5)));
  return {
    beatId,
    tier: 5,
    url,
    duration,
    type: 'video',
    cost: VIDEO_COST,
    provider: options.model || VIDEO_MODEL,
  };
}
