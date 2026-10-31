/**
 * THE RENDER BRIDGE — one TSX string in, one MP4 URL out.
 *
 * The platform's Remotion service compiles a STANDALONE composition string: it
 * cannot import anything from this workspace, which is why every composition
 * in this app is assembled as source text rather than written as a module.
 *
 * GEOMETRY IS FIXED. The service renders at 1920x1080 / 30fps and rejects any
 * other `fps` / `width` / `height`. A portrait pipeline therefore lays out a
 * 1080x1920 canvas inside the composition and scales it into the frame — the
 * same approach the other VidVerge studios use — rather than asking the
 * service for a geometry it will refuse.
 */

import { GENERATION_TIMEOUT_MS, isAbortError, sleep, STATUS_TIMEOUT_MS, timeoutSignal } from './runtime';
import {
  readRender as readCloudRender,
  submitRender as submitCloudRender,
} from '../../../lib/render/cloudRender';

/** The service's fixed output. Sent exactly as documented. */
export const FPS = 30;
export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** The logical portrait canvas Pipeline A composes against before scaling. */
export const PORTRAIT_W = 1080;
export const PORTRAIT_H = 1920;

/** 1..18000 frames — ten minutes at 30fps. */
export const MAX_FRAMES = 18_000;

export class RenderError extends Error {
  code: string;
  constructor(message: string, code = 'render_failed') {
    super(message);
    this.name = 'RenderError';
    this.code = code;
  }
}

export function clampFrames(frames: number): number {
  return Math.max(30, Math.min(MAX_FRAMES, Math.round(frames) || FPS));
}

export function secondsToFrames(seconds: number): number {
  return Math.max(1, Math.round(seconds * FPS));
}

export interface RenderSubmission {
  compositionTsx: string;
  props: Record<string, unknown>;
  durationInFrames: number;
}

export async function submitRender(submission: RenderSubmission): Promise<string> {
  const durationInFrames = clampFrames(submission.durationInFrames);
  try {
    const submitted = await submitCloudRender({
      compositionTsx: submission.compositionTsx,
      props: submission.props,
      durationInFrames,
      aspect: '16:9',
    }, {
      signal: timeoutSignal(GENERATION_TIMEOUT_MS),
      onStatus: (phase) => console.info('[Vidverge] cloud render:', phase),
    });
    return submitted.operationId;
  } catch (error: any) {
    if (isAbortError(error)) throw new RenderError('The render service did not accept the job within 2 minutes. Try again.', 'timeout');
    const message = String(error?.message || error);
    throw new RenderError(message, /wallet|\$0\.05|402/i.test(message) ? 'insufficient_funds' : 'rejected');
  }
}

export interface RenderProgress {
  status: 'pending' | 'rendering' | 'complete' | 'failed';
  videoUrl?: string;
  error?: string;
}

export async function checkRender(operationId: string): Promise<RenderProgress> {
  try {
    const status = await Promise.race([
      readCloudRender(operationId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The status check timed out after 30s.')), STATUS_TIMEOUT_MS)),
    ]);
    if (status.state === 'complete' && status.videoUrl) return { status: 'complete', videoUrl: status.videoUrl };
    if (status.state === 'failed') return { status: 'failed', error: status.error || 'The render failed.' };
    return { status: status.state };
  } catch (error: any) {
    return { status: 'rendering', error: String(error?.message || error) };
  }
}

export interface PollOptions {
  onProgress?: (elapsedSeconds: number) => void;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}

/**
 * Follow a render to its MP4. A status read that fails is tolerated several
 * times before giving up: a dropped poll is not a dead render, and the file is
 * durable on storage the moment it lands.
 */
export async function pollRender(operationId: string, options: PollOptions = {}): Promise<string> {
  const started = Date.now();
  const deadline = started + (options.timeoutMs || 15 * 60 * 1000);
  let misses = 0;
  while (Date.now() < deadline) {
    if (options.isCancelled?.()) {
      throw new RenderError('The render was cancelled. It may still finish on the server.', 'cancelled');
    }
    const progress = await checkRender(operationId);
    if (progress.status === 'complete' && progress.videoUrl) return progress.videoUrl;
    if (progress.status === 'failed') {
      throw new RenderError(progress.error || 'The render failed.', 'render_failed');
    }
    if (progress.error) {
      misses += 1;
      if (misses >= 8) {
        throw new RenderError(`The render service stopped answering: ${progress.error}`, 'poll_lost');
      }
    } else {
      misses = 0;
    }
    options.onProgress?.(Math.round((Date.now() - started) / 1000));
    await sleep(3000);
  }
  throw new RenderError(
    'The render is taking unusually long. It may still finish — check back before resubmitting.',
    'timeout',
  );
}

/** Submit and follow in one call. */
export async function renderToMp4(
  submission: RenderSubmission,
  options: PollOptions = {},
): Promise<string> {
  const operationId = await submitRender(submission);
  return pollRender(operationId, options);
}
