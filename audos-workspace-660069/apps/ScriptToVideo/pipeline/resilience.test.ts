import {
  TRANSIENT_ATTEMPTS, canTryAnotherModel, fallbackChain, isBadRequest,
  isEngineRefusal, isTransientProviderFailure, transientBackoffMs,
} from './resilience';
import { SEEDANCE_2_5, KLING_3_0_OMNI, VIDEO_MODEL } from './videoModelService';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

/**
 * The failure that prompted this ladder: a 5-block film locked to Seedance 2.5
 * stopped on block 1 with "The video provider is temporarily unavailable",
 * zero retries recorded, and four blocks left on 'waiting'. That sentence was
 * also all anyone could see — the provider's own words were only ever logged
 * to the browser console — so these cases pin BOTH halves: that the refusal is
 * recognised as retryable, and that the evidence travels with it.
 */
const REPORTED_OUTAGE = 'The video provider is temporarily unavailable. Retry shortly or switch models. Technical details: code=provider_http_503 · http=503 · upstream provider error';

export function runResilienceTests(): void {
  // The reported failure must retry, must not be rephrased, and must be
  // allowed to move to another engine.
  assert(isTransientProviderFailure(new Error(REPORTED_OUTAGE)), 'the reported provider outage must be retryable');
  assert(!isBadRequest(new Error(REPORTED_OUTAGE)), 'an outage must never be treated as a wording problem');
  assert(canTryAnotherModel(new Error(REPORTED_OUTAGE)), 'an outage must be allowed to move to another engine');

  // A status or an explicit flag outranks the prose: a dropped connection
  // carries no number to read, and a friendly sentence carries no status.
  assert(isTransientProviderFailure({ message: 'anything', status: 503 }), 'HTTP 503 must be retryable');
  assert(isTransientProviderFailure({ message: 'anything', status: 429 }), 'HTTP 429 must be retryable');
  assert(isTransientProviderFailure({ message: 'anything', transient: true }), 'an explicitly transient error must be retryable');
  assert(isBadRequest({ message: 'no number in this sentence', status: 400 }), 'HTTP 400 must be a wording problem even when the sentence hides it');
  assert(isBadRequest({ message: 'no number in this sentence', status: 422 }), 'HTTP 422 must be a wording problem even when the sentence hides it');

  // A dropped connection and a blown client timeout are the same answer.
  assert(isTransientProviderFailure(new Error('The video service did not answer within 45 seconds. Nothing new was submitted. Tap Retry.')), 'a client timeout must be retryable');
  assert(isTransientProviderFailure(new Error('The video service could not be reached. Your film and completed scenes are safe. Tap Retry shortly.')), 'an unreachable gateway must be retryable');
  assert(isTransientProviderFailure(new Error('Failed to fetch')), 'a dropped fetch must be retryable');
  assert(isTransientProviderFailure(new Error('The video provider is rate-limited. Wait briefly, then retry this scene or switch models.')), 'a rate limit must be retryable');

  // Refusals that follow the PERSON cost exactly one submit. Retrying them
  // wastes the block's budget, and re-submitting them elsewhere spends money
  // on an answer that cannot change.
  for (const message of [
    'You do not have enough Vidverge credits for this scene. Add credits, then retry; no paid render was started.',
    'Your workspace session could not be verified. Refresh and retry; no render was submitted.',
    'The studio provider wallet needs funding before this render can start. The scene credit authorization was refunded.',
    'The provider blocked this scene on safety or likeness checks. Regenerate the prompt or adjust its references before retrying.',
    'cast_approval_required: approve every retained character sheet',
    'This generation was cancelled.',
  ]) {
    assert(!isTransientProviderFailure(new Error(message)), `must not retry unchanged: ${message}`);
    assert(!canTryAnotherModel(new Error(message)), `must not re-bill another engine: ${message}`);
  }
  // Moderation still earns its one rephrase; what it must not earn is a paid
  // second opinion from a different provider.
  assert(isBadRequest(new Error('The provider blocked this scene on safety or likeness checks.')), 'moderation must still reach the rephrase step');

  // A refusal that belongs to the chosen ENGINE moves engine without first
  // wasting attempts on the engine that cannot serve it.
  for (const message of [
    'Provider budget reached. No render was started. Keep this film paused and retry later, or create a separate Omni version.',
    'Authentication required',
    'model must be one of: gen4.5, gen4_turbo.',
    'This model is not available in this workspace. Choose another model and retry this scene.',
  ]) {
    assert(isEngineRefusal(new Error(message)), `must be an engine refusal: ${message}`);
    assert(canTryAnotherModel(new Error(message)), `must be allowed another engine: ${message}`);
  }
  assert(!isTransientProviderFailure(new Error('This model is not available in this workspace. Choose another model and retry this scene.')), 'an unconfigured engine must not be asked again unchanged');

  // Three sends per engine, backing off 2s then 8s, is what keeps a blip
  // invisible without leaving a creator watching a spinner for minutes.
  assert(TRANSIENT_ATTEMPTS === 3, 'the per-engine attempt budget must stay at three');
  assert(transientBackoffMs(1) === 2_000 && transientBackoffMs(2) === 8_000 && transientBackoffMs(3) === 24_000, 'backoff must stay exponential');
  assert(transientBackoffMs(0) === 2_000 && transientBackoffMs(99) === 24_000, 'backoff must clamp rather than return undefined');

  // Gemini Omni is the only engine entered automatically, and only for a block
  // it can actually render — a block outside its length range is left alone
  // rather than quietly resized to fit.
  assert(fallbackChain(SEEDANCE_2_5, { hasSeedFrame: false, durationS: 6 })[0]?.id === VIDEO_MODEL.id, 'a 6s Seedance block must fall back to Omni');
  assert(fallbackChain(SEEDANCE_2_5, { hasSeedFrame: true, durationS: 6 })[0]?.id === VIDEO_MODEL.id, 'a seeded 6s block must fall back to Omni');
  assert(fallbackChain(KLING_3_0_OMNI, { hasSeedFrame: false, durationS: 5 })[0]?.id === VIDEO_MODEL.id, 'a 5s Kling block must fall back to Omni');
  assert(fallbackChain(KLING_3_0_OMNI, { hasSeedFrame: false, durationS: 10 }).length === 0, 'a 10s block is past Omni’s ceiling and must not be resized to fit');
  assert(fallbackChain(SEEDANCE_2_5, { hasSeedFrame: false, durationS: 30 }).length === 0, 'a 30s block is past Omni’s ceiling and must not be resized to fit');
  assert(fallbackChain(SEEDANCE_2_5, { hasSeedFrame: false, durationS: 2 }).length === 0, 'a 2s block is under Omni’s floor and must not be resized to fit');
  assert(fallbackChain(VIDEO_MODEL, { hasSeedFrame: false, durationS: 6 }).length === 0, 'Omni has no stand-in to hand to — the block stops and asks');
}
