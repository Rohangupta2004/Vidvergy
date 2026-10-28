/**
 * Plain-language errors and request guards for Script-to-Video.
 *
 * Nothing a customer reads in this app should be raw hook, provider or
 * database text. Every error shown on screen goes through
 * `friendlyErrorMessage` / `classifyError`; anything that is not a recognised
 * case and still looks technical collapses to one safe generic sentence.
 */
import { callHook } from '../../lib/workspace';
import type { CallHookOptions } from '../../lib/workspace';
import { videoEngine } from '../../lib/videoEngines';

/** Gemini Omni is the only model that keeps rendering after the tab closes. */
export const OMNI_MODEL_ID = 'omni-1.1-flash';
export const OMNI_LABEL = 'Gemini Omni';

export type FriendlyErrorKind =
  | 'tab-required'
  | 'auth'
  | 'empty-results'
  | 'db-timeout'
  | 'missing-op'
  | 'cast-approval'
  | 'not-approved'
  | 'credits'
  | 'billing'
  | 'wallet'
  | 'rate-limit'
  | 'outage'
  | 'interrupted'
  | 'other';

export interface FriendlyError {
  kind: FriendlyErrorKind;
  message: string;
  canRetry: boolean;
  /** True when the one-click Switch to Omni action makes sense. */
  canSwitchToOmni: boolean;
}

export const TAB_REQUIRED_MESSAGE =
  'This model runs from your signed-in browser. Keep this tab open; the selected model will not be changed.';
export const AUTH_MESSAGE =
  'Your sign-in needs a quick refresh, so nothing was started or charged. Tap Retry. If it happens again, refresh the page and sign in once more.';
export const EMPTY_RESULTS_MESSAGE =
  'The service did not send anything back this time. Your film and completed scenes are safe. Tap Retry.';
export const DB_TIMEOUT_MESSAGE =
  'Your project took too long to load. Your film and completed scenes are safe. Tap Retry.';
export const MISSING_OP_MESSAGE =
  'The studio sent an incomplete request, so nothing was started or charged. Tap Retry. If it keeps happening, refresh the page.';
export const GENERIC_MESSAGE =
  'Something went wrong on our side. Your film and completed scenes are safe. Tap Retry. If it keeps happening, refresh the page.';

function rawText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  const record = value as Record<string, unknown>;
  const nested = record?.error as Record<string, unknown> | string | undefined;
  const candidate = record?.message
    || (nested && typeof nested === 'object' ? nested.message : nested)
    || record?.errorMessage;
  if (candidate) return String(candidate);
  try { return JSON.stringify(value); } catch { return String(value); }
}

/** True when the text still reads like a code, a status line or a stack. */
function looksTechnical(text: string): boolean {
  if (text.length > 260) return true;
  return /[{}[\]<>]|https?:\/\/|\b(?:HTTP|SQL|JSON|stack|undefined|null|NaN|TypeError|ReferenceError|SyntaxError|Exception|ECONN\w*|ETIMEDOUT)\b|\b(?:HTTP|status|code)\s*[:=]?\s*[45]\d\d\b|[a-z]+_[a-z_]+|\bError:|\bat \w+ \(|\b[45]\d\d\s+(?:not found|bad request|unauthorized|forbidden|internal server error|bad gateway|service unavailable|gateway time-?out)\b|status check failed/i.test(text);
}

const OP_REQUIRED_HOOKS = new Set(['s2v-run', 's2v-recovery-sweeper', 'stv-scene-generate', 'vv-credits']);

export class MissingOperationError extends Error {
  code = 'missing_op';
  hook: string;
  constructor(hook: string) {
    super(MISSING_OP_MESSAGE);
    this.name = 'MissingOperationError';
    this.hook = hook;
  }
}

/** Throws before any network call when a hook that needs an `op` has none. */
export function assertValidOp(hook: string, body: Record<string, unknown> | null | undefined): void {
  if (!OP_REQUIRED_HOOKS.has(hook)) return;
  const op = body && typeof body.op === 'string' ? body.op.trim() : '';
  if (!op) throw new MissingOperationError(hook);
}

/** `callHook` for Script-to-Video: the operation is validated client-side first. */
export function callS2vHook<T = any>(
  hook: string,
  body: Record<string, unknown> = {},
  options: CallHookOptions = {},
): Promise<T> {
  try {
    assertValidOp(hook, body);
  } catch (error) {
    return Promise.reject(error);
  }
  return callHook<T>(hook, body, options);
}

function make(kind: FriendlyErrorKind, message: string, extra: Partial<FriendlyError> = {}): FriendlyError {
  return { kind, message, canRetry: true, canSwitchToOmni: false, ...extra };
}

export function classifyError(value: unknown): FriendlyError {
  const code = value && typeof value === 'object' ? String((value as { code?: unknown }).code || '') : '';
  const raw = rawText(value).trim() || 'This step could not be completed.';
  const named = raw.replace(/(?:openrouter\/[^\s,;]+|gemini-omni-flash-preview|veo-[\w.-]+)/g, (id) => videoEngine(id)?.label || 'the selected video engine');
  // Technical details are appended after the customer-facing sentence by the
  // generation layer; classify the sentence, never the suffix.
  const publicMessage = named.split(' Technical details:')[0].trim();
  const probe = `${code} ${publicMessage}`;

  if (code === 'missing_op' || /unknown op\b|missing_op|no operation (?:was )?(?:sent|specified)/i.test(probe)) return make('missing-op', MISSING_OP_MESSAGE);
  if (/operation was aborted|aborterror|signal is aborted|generation was interrupted/i.test(probe)) {
    return make('interrupted', 'The request ended before a result was confirmed. Your plan is safe. Tap Retry, or use another option for this step.');
  }
  if (/cast_approval_required|approve every retained character|confirm that this script needs no cast/i.test(probe)) {
    return make('cast-approval', 'Approve every retained character sheet, or confirm that no cast is needed, before Start.', { canRetry: false });
  }
  if (/key limit exceeded|spending limit|openrouter_key_limit|provider budget reached/i.test(probe)) {
    return make('outage', 'Provider budget reached. This film remains paused; retry on the selected model later or create a separate Omni version.', { canSwitchToOmni: true, canRetry: false });
  }
  if (/keep (?:this|the) (?:browser )?tab open|stay on this tab|closed-tab|browser session token|workspace_service_credential|workspace-level service credential|needs your current signed-in workspace session|founder workspace (?:backend )?credential/i.test(probe)) {
    return make('tab-required', TAB_REQUIRED_MESSAGE, { canSwitchToOmni: true });
  }
  if (/not_approved_for_founder_billing|not approved for founder-funded|not on the founder-approved/i.test(probe)) {
    return make('not-approved', 'This account is not on the founder-approved testing list. No credits were charged and no provider render was submitted.', { canRetry: false });
  }
  if (/\bnot_a_workspace_member\b/i.test(probe)) {
    return make('auth', 'This signed-in account is not a member of this workspace. Nothing was submitted.', { canRetry: false });
  }
  if (/\b(?:no_credentials|workspace_token_invalid)\b|authentication required|session required|workspace session|session (?:expired|invalid)|\b401\b/i.test(probe)) {
    return make('auth', AUTH_MESSAGE);
  }
  if (/\b403\b|wrong workspace|wrong owner|provider refused this workspace/i.test(probe)) {
    return make('outage', 'The provider refused this workspace or task owner. The selected film remains paused; retry after access is restored.', { canSwitchToOmni: true });
  }
  if (/empty results?|returned no results|no results returned/i.test(probe)) return make('empty-results', EMPTY_RESULTS_MESSAGE);
  if (/statement timeout|canceling statement|query (?:timed out|timeout)|database[^.]*time(?:d)? ?out|db[^.]*time(?:d)? ?out|connection (?:terminated|timeout)|ETIMEDOUT/i.test(probe)) {
    return make('db-timeout', DB_TIMEOUT_MESSAGE);
  }
  if (/workspace wallet|wallet balance is too low|provider wallet/i.test(probe)) {
    return make('wallet', 'Video generation is paused because the studio provider wallet needs funding. Your film is saved and the failed scene authorization was refunded.', { canRetry: false });
  }
  if (/\binsufficient_credits\b|not enough vidverge credits/i.test(probe)) {
    return make('credits', 'You do not have enough Vidverge credits for this scene. Add credits, then retry. Your completed clips are safe.', { canRetry: false });
  }
  if (/billing[_-]/i.test(probe)) {
    return make('billing', 'Credit authorization could not be confirmed. Refresh your signed-in session and retry. No render was submitted.');
  }
  if (/rate.?limit|\b429\b/i.test(probe)) return make('rate-limit', 'The video service is busy right now. Wait a moment, then tap Retry.');
  if (/provider[_ -]?error|\b50[0234]\b|service unavailable|could not reach the video service/i.test(probe)) {
    return make('outage', 'The video service is temporarily unavailable. Your film is saved. Tap Retry shortly.');
  }
  if (!publicMessage || looksTechnical(publicMessage)) return make('other', GENERIC_MESSAGE);
  return make('other', publicMessage);
}

export function friendlyErrorMessage(value: unknown): string {
  return classifyError(value).message;
}
