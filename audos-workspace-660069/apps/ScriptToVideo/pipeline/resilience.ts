/**
 * PROVIDER RESILIENCE — what to do when a video provider refuses a block.
 *
 * Three refusals arrive through the same catch block and need three
 * different answers, so they are told apart here rather than guessed at the
 * call site. EVERY recovery attempt carries the same aspect ratio, duration,
 * references, negative prompt and credit key, so the shot never changes and
 * the block is never billed twice:
 *
 *   · THE REQUEST was refused (400 / 422 / moderation wording). A 400 from a
 *     generation proxy is a statement about the wording of the prompt, not
 *     about the film, so the answer is to say the same shot differently:
 *       1. the director's prompt exactly as written
 *       2. a REPHRASED prompt — same scenes, actions, characters and visual
 *          elements, different sentence structure
 *       3. the rephrased prompt on the next engine in the chain
 *
 *   · THE CONNECTION was refused (429 / 5xx / dropped socket / blown client
 *     timeout). Nothing about the request is wrong, so rewording it would
 *     waste a round trip: the identical request is sent again, a few times,
 *     with exponential backoff.
 *
 *   · THE ENGINE was refused (its provider key, its budget, its model id).
 *     The render never started and the verified fallback engine authenticates
 *     through a different route, so the block is handed over there.
 *
 * A refusal that follows the PERSON rather than the request or the engine — an
 * empty customer wallet, an unproven sign-in, an unapproved cast sheet —
 * leaves the ladder immediately. It would answer the same way however often
 * it is asked and on whichever engine, so retrying it only costs time.
 */
import { askOpus } from './opus';
import { VIDEO_MODEL } from './videoModelService';
import type { VideoModelConfig } from './videoModelService';

/** Failures no amount of rewording can fix. Checked FIRST. */
const NOT_A_WORDING_PROBLEM = /insufficient|wallet|balance is too low|top up|rate.?limit|\b429\b|\b402\b|not configured|provider key|temporarily unavailable|\b50\d\b|timed? out|cancelled/i;

/** The shapes a request-level refusal arrives in, including the sentences
 * videoModelService's own classifySubmitError wraps them in. */
const WORDING_PROBLEM = /\b400\b|rejected this request|invalid request|invalid_enum|unsupported|prompt is too long|safety filter|moderation|content policy|blocked/i;

export function isBadRequest(error: unknown): boolean {
  const text = String((error as any)?.message || error || '');
  if (NOT_A_WORDING_PROBLEM.test(text)) return false;
  // The HTTP status is harder evidence than the prose. A submit rejected with
  // 400/422 is a statement about the request even when the sentence the
  // customer reads never spells the number out.
  if ([400, 422].includes(Number((error as any)?.status || 0))) return true;
  if (!text) return false;
  return WORDING_PROBLEM.test(text);
}

/** Refusals that follow the PERSON, not the request or the engine. Checked
 * before everything else: no amount of retrying or engine-switching changes
 * an empty wallet, an unproven sign-in or an unapproved cast sheet. */
const FOLLOWS_THE_PERSON = /insufficient|not enough|wallet|balance is too low|top up|no_credentials|workspace_token_invalid|not_a_workspace_member|session (?:expired|rejected)|could not be verified|sign in|cast_approval|approve every retained|moderation|content policy|safety|likeness|blocked|cancelled|canceled/i;

/** The shapes a dropped connection or an overloaded provider arrives in,
 * including the sentences videoModelService's classifySubmitError and
 * callGenerateHook wrap them in. */
const TRANSIENT_REFUSAL = /\b(?:408|425|429|500|502|503|504)\b|rate.?limit|too many requests|temporarily unavailable|service unavailable|\boutage\b|upstream|bad gateway|gateway time|could not be reached|did not answer|stopped answering|failed to fetch|network ?error|load failed|econnreset|etimedout|socket hang up|timed? out|timeout/i;

/** Refusals that belong to the CHOSEN ENGINE's credential, budget or model id.
 * The render never started, and the verified fallback engine authenticates
 * through a different route, so handing the block over is safe and free. */
const BELONGS_TO_THE_ENGINE = /provider key|key limit exceeded|openrouter_key_limit|budget reached|spending limit|not configured|refused this workspace|workspace_service_credential|model must be one of|unsupported model|unknown model|authentication required|not available in this workspace|unavailable right now|not enabled on the/i;

/** How many times one block may send the SAME request to the SAME engine. */
export const TRANSIENT_ATTEMPTS = 3;

/** How long to wait before attempt N+1, N being 1-based. */
export function transientBackoffMs(attempt: number): number {
  const schedule = [2_000, 8_000, 24_000];
  return schedule[Math.max(0, Math.min(schedule.length - 1, Math.round(attempt) - 1))];
}

/** True when sending the IDENTICAL request again could plausibly work. */
export function isTransientProviderFailure(error: unknown): boolean {
  if ((error as any)?.transient === true) return true;
  if ([408, 425, 429, 500, 502, 503, 504].includes(Number((error as any)?.status || 0))) return true;
  const text = String((error as any)?.message || error || '');
  if (!text) return false;
  if (FOLLOWS_THE_PERSON.test(text)) return false;
  return TRANSIENT_REFUSAL.test(text);
}

/** True when the chosen engine itself is the problem. */
export function isEngineRefusal(error: unknown): boolean {
  const text = String((error as any)?.message || error || '');
  if (!text) return false;
  if (FOLLOWS_THE_PERSON.test(text)) return false;
  return BELONGS_TO_THE_ENGINE.test(text);
}

/**
 * True when handing this block to a DIFFERENT engine could plausibly work.
 *
 * The person-following check runs FIRST and on its own, ahead of the HTTP
 * status: a wallet, sign-in, moderation or cast-approval refusal answers the
 * same way on every engine, so it is never re-submitted — and never re-billed
 * — elsewhere, however the proxy happened to dress it up. Moderation in
 * particular still earns its one rephrase through `isBadRequest`; what it does
 * not earn is a paid second opinion from another provider.
 */
export function canTryAnotherModel(error: unknown): boolean {
  if (FOLLOWS_THE_PERSON.test(String((error as any)?.message || error || ''))) return false;
  return isTransientProviderFailure(error) || isEngineRefusal(error) || isBadRequest(error);
}

const REPHRASE_SYSTEM = [
  'You rewrite AI video-generation prompts that a provider refused to accept.',
  'ABSOLUTE RULE: preserve the FULL original meaning. Every scene, every action, every character description, every piece of wardrobe, every camera move, every lighting note, every environment detail and every beat in the original MUST still be present in your rewrite.',
  'Do NOT simplify. Do NOT shorten. Do NOT drop detail. Do NOT summarise. Do NOT add anything new.',
  'Change ONLY the sentence structure and the choice of words — describe exactly the same shot a different way.',
  'Stay under 950 characters.',
  'Reply with the rewritten prompt text ONLY: no preamble, no explanation, no quotation marks, no markdown.',
].join(' ');

/**
 * Rephrase a refused prompt WITHOUT losing content. A rewrite that comes back
 * dramatically shorter than the original has simplified rather than rephrased,
 * so it is discarded and the original is kept — a shorter prompt would change
 * the shot, which is exactly what this must never do.
 */
export async function rephraseVideoPrompt(prompt: string, refusal: string): Promise<string> {
  const original = String(prompt || '').trim();
  if (!original) return original;
  const user = [
    'The video provider refused this prompt with:',
    String(refusal || 'no reason given').slice(0, 400),
    '',
    'Original prompt:',
    original,
    '',
    'Rewrite it now, keeping every single element.',
  ].join('\n');
  const rewritten = String(await askOpus({ system: REPHRASE_SYSTEM, user, maxTokens: 16000, effort: 'xhigh' }))
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/, '')
    .replace(/^["'“]|["'”]$/g, '')
    .trim();
  if (!rewritten) return original;
  if (rewritten.length < Math.round(original.length * 0.6)) return original;
  return rewritten;
}

/**
 * The engines to try after the film's own engine could not deliver, in
 * preference order.
 *
 * Gemini Omni Flash is the ONLY engine entered automatically, and the switch
 * is always logged and shown. It is the platform-verified default (it is the
 * model that passed the 28 Oct 2026 paid sweep), it accepts both text-only
 * and seeded blocks, and it authenticates through a different route from
 * Kling, Seedance and Runway — so an engine-specific credential or
 * availability problem does not simply repeat there.
 *
 * Nothing else is ever entered silently: retired Kling ids and unrelated
 * Runway models stay off this chain, and when Omni is itself the engine that
 * failed there is nothing left to hand to — the block stops and asks.
 *
 * A block Omni could not render is left alone rather than quietly altered: a
 * length outside Omni's own floor and ceiling would have to be shortened to
 * fit, and an image-to-video-only stand-in could not open a film at all.
 */
export function fallbackChain(current: VideoModelConfig, opts: { hasSeedFrame: boolean; durationS: number }): VideoModelConfig[] {
  if (current.id === VIDEO_MODEL.id) return [];
  const durationS = Number(opts.durationS || 0);
  const floor = Math.max(1, Number(VIDEO_MODEL.minDuration) || 1);
  if (durationS < floor || durationS > VIDEO_MODEL.safeMaxDuration) return [];
  if (VIDEO_MODEL.imageToVideoOnly && !opts.hasSeedFrame) return [];
  return [VIDEO_MODEL];
}
