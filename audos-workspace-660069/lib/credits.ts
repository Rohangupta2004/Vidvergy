/**
 * VidVerge credits — the client side of the pay-per-use wallet.
 *
 * PRICING lives in `lib/pricing.ts`: every generation costs our real provider
 * cost + 30%, in $0.15 credits, per engine. Text and images are free. This
 * module asks the wallet to quote/charge/refund for a named engine and tells
 * every screen what moved (CREDITS_CHARGED_EVENT / CREDITS_REFUNDED_EVENT).
 *
 * FREE: every new verified user receives 30 starter credits; scripting,
 * briefing, storyboards, brand reads, agent conversation and image generation
 * remain free.
 *
 * The balance itself is server-owned. This module never computes it — it asks
 * the `vv-credits` server function, which is the only writer of
 * `vv_credit_accounts` / `vv_credit_ledger`. A published space bundle carries
 * a public workspace token, so anything the browser could write, anyone could
 * forge; the wallet therefore lives behind a session-gated function.
 *
 * Wallets are keyed on the signed-in EMAIL, so a balance follows the person
 * across devices and sessions rather than dying with a tab.
 */
import { useEffect, useState } from 'react';
import { openPricing } from './plans';
import type { PlanId } from './plans';
import { CREDIT_VALUE_USD, DEFAULT_VIDEO_ENGINE, quote as quoteLocal, rateFor } from './pricing';
import type { Quote, QuoteOptions } from './pricing';
import { clearSessionIdentity, getSessionId, getVerifiedSessionId, hookUrl, refreshWorkspaceSession, spaceId } from './workspace';
import { authedHook, waitForSession } from './session';
import { hasTenantDelegationAuth, scopedSpaceSessionStorageKey } from './tenant-delegation-scope';

export const CREDITS_HOOK_ENDPOINT = hookUrl('vv-credits');

/** Fired whenever the cached balance moves, so every surface re-renders. */
export const CREDITS_EVENT = 'vidverge:credits';
/** Opens the shell-level recovery notice after a persistent wallet 401/403. */
export const CREDIT_AUTH_REQUIRED_EVENT = 'vidverge:credit-auth-required';
/** Fired only after an explicit recovery refresh proves the wallet again. */
export const CREDIT_AUTH_REFRESHED_EVENT = 'vidverge:credit-auth-refreshed';

/** Fired after a successful charge: { charged, balanceBefore, balanceAfter, label, engine, costUsd, source }. */
export const CREDITS_CHARGED_EVENT = 'vidverge:credits-charged';
/** Fired after a refund lands: { refunded, balanceAfter, note }. */
export const CREDITS_REFUNDED_EVENT = 'vidverge:credits-refunded';
/** Asks the shell to show a quote + balance and wait for approval: CreditConfirmRequest. */
export const CREDIT_CONFIRM_EVENT = 'vidverge:credit-confirm';
/** How long "don't ask again" covers further charges from the same studio. */
export const CREDIT_APPROVAL_WINDOW_MS = 15 * 60 * 1000;

export const FREE_TRIAL_CREDITS = 30;
export const CREDIT_PRICE_CENTS = Math.round(CREDIT_VALUE_USD * 100);
/** Credit packs offered at checkout (credits x $0.15). */
export const CREDIT_PACK_OPTIONS = [100, 250, 500, 1000];

export interface CreditState {
  email: string;
  plan: PlanId;
  planLabel: string;
  /** Credits available to spend right now. */
  balance: number;
  /** Retired with the monthly plans; always 0 / false / null. */
  monthlyCredits: number;
  rollover: boolean;
  nextGrantAt: string | null;
  lastGrantAt: string | null;
  lifetimeGranted: number;
  lifetimeSpent: number;
  trialGranted: boolean;
  founderExempt: boolean;
  unlimited: boolean;
}

/** Thrown when a generation is blocked because the wallet is short. */
export class InsufficientCreditsError extends Error {
  code = 'insufficient_credits';
  required: number;
  balance: number;
  shortfall: number;
  seconds: number;
  plan: PlanId;
  constructor(detail: { required: number; balance: number; seconds: number; plan: PlanId; label?: string }) {
    super(
      `${detail.label || 'This generation'} needs ${detail.required} credits and you have ${detail.balance}. ` +
        'Buy a credit pack to keep generating.',
    );
    this.name = 'InsufficientCreditsError';
    this.required = detail.required;
    this.balance = detail.balance;
    this.shortfall = Math.max(0, detail.required - detail.balance);
    this.seconds = detail.seconds;
    this.plan = detail.plan;
  }
}

export function isInsufficientCreditsError(e: unknown): e is InsufficientCreditsError {
  return e instanceof InsufficientCreditsError;
}

/** A wallet authorization failure that is not a balance shortfall. */
export class CreditAuthorizationError extends Error {
  code: string;
  status: number;
  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message);
    this.name = 'CreditAuthorizationError';
    this.code = opts.code || 'credit_authorization_failed';
    this.status = opts.status || 0;
  }
}

export function isCreditAuthorizationError(e: unknown): e is CreditAuthorizationError {
  return e instanceof CreditAuthorizationError;
}

/** The customer looked at the quote and chose not to spend the credits. */
export class CreditConfirmationDeclinedError extends Error {
  code = 'credit_confirmation_declined';
  constructor(label: string) {
    super(`${label || 'This generation'} was cancelled before it started. No credits were used.`);
    this.name = 'CreditConfirmationDeclinedError';
  }
}

export function isCreditConfirmationDeclined(e: unknown): e is CreditConfirmationDeclinedError {
  return e instanceof CreditConfirmationDeclinedError;
}

export interface CreditConfirmRequest {
  quote: Quote;
  label: string;
  source: string;
  /** Spendable balance right now; null for unknown. */
  balance: number | null;
  /** approved=false cancels the generation; rememberSource skips the prompt for this studio for a while. */
  respond: (approved: boolean, rememberSource?: boolean) => void;
}

let confirmHosts = 0;
const confirmedEntryKeys = new Set<string>();
const approvedSourcesUntil = new Map<string, number>();

/** Mounted once by the shell. Without a host, charges proceed as before (no prompt). */
export function registerCreditConfirmHost(): () => void {
  confirmHosts += 1;
  return () => {
    confirmHosts = Math.max(0, confirmHosts - 1);
  };
}

/**
 * Show the quote and the current balance and wait for the customer before any
 * credits move. A retry of an approved generation (same entryKey) and screens
 * that already showed their own priced confirmation (`preconfirmed`) skip it.
 */
async function confirmCharge(request: ChargeRequest, local: Quote): Promise<void> {
  if (typeof window === 'undefined' || !confirmHosts || request.preconfirmed) return;
  if (confirmedEntryKeys.has(request.entryKey)) return;
  const source = request.source || 'app';
  if ((approvedSourcesUntil.get(source) || 0) > Date.now()) {
    confirmedEntryKeys.add(request.entryKey);
    return;
  }
  const state = cached || (await refreshCredits());
  if (state?.unlimited) return;
  let shown = local;
  if (!local.priced) {
    const { entryKey: _entryKey, ...spec } = request;
    const server = await quoteCredits(spec).catch(() => null);
    if (server) shown = server.quote;
  }
  if (!shown.credits) return;
  const label = request.label || shown.label;
  const approved = await new Promise<boolean>((resolve) => {
    const detail: CreditConfirmRequest = {
      quote: shown,
      label,
      source,
      balance: state ? state.balance : null,
      respond: (ok, rememberSource) => {
        if (ok && rememberSource) approvedSourcesUntil.set(source, Date.now() + CREDIT_APPROVAL_WINDOW_MS);
        resolve(ok);
      },
    };
    window.dispatchEvent(new CustomEvent(CREDIT_CONFIRM_EVENT, { detail }));
  });
  if (!approved) throw new CreditConfirmationDeclinedError(label);
  confirmedEntryKeys.add(request.entryKey);
}

/**
 * Credits for `seconds` of media on `engine` (default: the canonical video
 * engine every customer workflow resolves to). Same math the wallet charges.
 */
export function creditsForSeconds(seconds: number, engine: string = DEFAULT_VIDEO_ENGINE, options: QuoteOptions = {}): number {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return quoteLocal(engine, { ...options, seconds: s }).credits;
}

/** The full local quote (cost, credits, lines) for one generation. */
export function quoteGeneration(engine: string = DEFAULT_VIDEO_ENGINE, options: QuoteOptions = {}): Quote {
  return quoteLocal(engine, options);
}

export function formatCredits(value: number): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return n.toLocaleString();
}

/** One shared label for every balance surface; owner wallets never expose a number. */
export function formatCreditBalance(state: Pick<CreditState, 'balance' | 'unlimited'>): string {
  return state.unlimited ? 'Unlimited' : formatCredits(state.balance);
}

/**
 * "8s · Gemini Omni 1.1 Flash · 8 credits · balance 120" — the line shown next
 * to a generate button. The balance is the last one this tab resolved.
 */
export function describeCost(seconds: number, engine: string = DEFAULT_VIDEO_ENGINE, options: QuoteOptions = {}): string {
  const q = quoteLocal(engine, { ...options, seconds });
  const label = rateFor(engine)?.label || q.label;
  const balance = cached ? ` · balance ${formatCreditBalance(cached)}` : '';
  if (!q.credits) return `${label} · ${q.priced ? 'free' : 'not charged'}${balance}`;
  const length = Number(seconds) > 0 ? `${Math.round(seconds)}s · ` : '';
  return `${length}${label} · ${formatCredits(q.credits)} credit${q.credits === 1 ? '' : 's'}${balance}`;
}

/** Smallest offered credit pack that covers a shortfall (or the shortfall rounded up to 50). */
export function packCreditsFor(shortfall: number): number {
  const needed = Math.max(1, Math.ceil(Number(shortfall) || 0));
  const pack = CREDIT_PACK_OPTIONS.find((size) => size >= needed);
  return pack || Math.ceil(needed / 50) * 50;
}

function normalizePlan(value: unknown): PlanId {
  const plan = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return plan === 'creator' || plan === 'pro' || plan === 'payg' ? (plan as PlanId) : 'free';
}

function toState(data: any): CreditState | null {
  if (!data || typeof data !== 'object' || typeof data.email !== 'string') return null;
  const plan = normalizePlan(data.plan);
  const founderExempt = data.founderExempt === true;
  const unlimited = data.unlimited === true || founderExempt;
  const rawBalance = Math.max(0, Math.round(Number(data.balance) || 0));
  const overflowSentinel = rawBalance >= 2_147_483_647;
  if (overflowSentinel && !unlimited) {
    console.warn('[VidVerge credits] reason=invalid_32bit_balance_sentinel', { emailPresent: true, plan });
  }
  return {
    email: data.email,
    plan,
    planLabel: String(data.planLabel || 'Pay per use'),
    balance: unlimited || overflowSentinel ? 0 : rawBalance,
    monthlyCredits: 0,
    rollover: false,
    nextGrantAt: null,
    lastGrantAt: data.lastGrantAt ? String(data.lastGrantAt) : null,
    lifetimeGranted: Math.max(0, Math.round(Number(data.lifetimeGranted) || 0)),
    lifetimeSpent: Math.max(0, Math.round(Number(data.lifetimeSpent) || 0)),
    trialGranted: data.trialGranted === true,
    founderExempt,
    unlimited,
  };
}

let cached: CreditState | null = null;

/** The last balance this tab resolved, or null before the first read lands. */
export function getCachedCredits(): CreditState | null {
  return cached;
}

function publish(state: CreditState | null): CreditState | null {
  cached = state;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: state }));
  }
  return state;
}

export interface CreditsChargedDetail {
  charged: number;
  balanceBefore: number | null;
  balanceAfter: number | null;
  label: string;
  engine: string;
  costUsd: number;
  source: string;
  unlimited: boolean;
  unpriced: boolean;
}

function announce(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

type CreditAuthIssue = 'signed_out' | 'session_unverified' | 'token_unavailable' | 'session_rejected';

// Each line names the thing that actually failed. "Sign in with your email"
// belongs only on signed_out: showing it to a signed-in customer whose session
// merely needed re-proving sent people round a loop that could not end.
const CREDIT_AUTH_COPY: Record<CreditAuthIssue, string> = {
  signed_out: 'You are signed out, so there is no wallet to spend from. Sign in with your email to use credits; no generation was started.',
  session_unverified: 'You appear to be signed in, but Audos could not confirm this sign-in just now. Refresh the page and retry; nothing was charged.',
  token_unavailable: 'This page has not finished loading your workspace credential. Wait a moment and retry; nothing was charged.',
  session_rejected: 'Audos refused this sign-in when the charge was attempted. Refresh the page and retry — nothing was charged. If it keeps happening, sign out and back in.',
};

function announceCreditAuthorizationRequired(issue: CreditAuthIssue, message: string): void {
  if (typeof window === 'undefined') return;
  console.warn('[VidVerge auth] reason=credit_authorization_failed', { code: issue, requiresSignIn: issue === 'signed_out' });
  window.dispatchEvent(new CustomEvent(CREDIT_AUTH_REQUIRED_EVENT, {
    detail: { code: issue, message, requiresSignIn: issue === 'signed_out' },
  }));
}

function creditAuthorizationError(issue: CreditAuthIssue, notify = true): CreditAuthorizationError {
  const message = CREDIT_AUTH_COPY[issue];
  if (notify) announceCreditAuthorizationRequired(issue, message);
  return new CreditAuthorizationError(message, {
    code: issue,
    status: issue === 'token_unavailable' ? 0 : 401,
  });
}

/** Clear only this workspace's identity, then reopen the standard email gate. */
export function beginCreditEmailSignIn(): void {
  if (typeof window === 'undefined') return;
  clearSessionIdentity();
  try {
    window.sessionStorage.removeItem('space_session_id');
    window.sessionStorage.setItem('vidverge:force-credit-sign-in', '1');
  } catch { /* storage may be disabled */ }
  window.location.reload();
}

async function sendCredits(payload: Record<string, unknown>): Promise<any> {
  return authedHook('vv-credits', payload, { retryOn401: false });
}

/** A failure the wallet can plausibly recover from by re-acquiring the
 * signed-in session and waiting for the runtime's workspace token. */
function isRecoverableAuthFailure(error: unknown): boolean {
  if (!error) return false;
  const status = Math.round(Number((error as { status?: unknown }).status) || 0);
  if (status === 401 || status === 403) return true;
  if (isCreditAuthorizationError(error)) return true;
  const text = String((error as { message?: unknown }).message || '');
  return /no_credentials|same-origin request required|workspace session|session (?:expired|invalid)|session_expired|credit authorization/i.test(text);
}

/**
 * Re-acquire the credit-bearing identity: the runtime's injected workspace DB
 * token AND a verified `wses_` session. `vv-credits` needs both, and both can
 * legitimately be absent for a moment after a tab is reopened, after a
 * refresh, or when a saved project is resumed — which is exactly when a
 * charge used to fail with "credit authorization is missing" and leave the
 * creator with no way forward.
 *
 * Returns the accepted session id, or an empty string when the visitor really
 * does need to sign in again.
 */
export interface CreditAuthorizationSnapshot {
  sessionId: string;
  token: string;
  issue: CreditAuthIssue | null;
}

/** Resolve both credentials the wallet route needs and report which one failed. */
export async function resolveCreditAuthorization(timeoutMs = 10_000): Promise<CreditAuthorizationSnapshot> {
  if (typeof window === 'undefined') return { sessionId: '', token: '', issue: 'signed_out' };
  const proposed = getSessionId();
  const session = await waitForSession(timeoutMs);
  const verified = session.sessionId && getVerifiedSessionId() ? session.sessionId : '';
  if (!verified) {
    return {
      sessionId: '',
      token: session.tokenReady ? 'ready' : '',
      issue: proposed.startsWith('wses_') || session.email ? 'session_unverified' : 'signed_out',
    };
  }
  if (!session.tokenReady) return { sessionId: verified, token: '', issue: 'token_unavailable' };
  return { sessionId: verified, token: 'ready', issue: null };
}

export async function acquireCreditAuthorization(timeoutMs = 10_000): Promise<string> {
  const authorization = await resolveCreditAuthorization(timeoutMs);
  return authorization.issue ? '' : authorization.sessionId;
}

/**
 * Prove the saved `wses_` session against the platform before every charge or
 * refund. The balance preflight proves the wallet resolved the session to an
 * email.
 *
 * ONE automatic recovery pass covers every way the authorization can be
 * missing — token not injected yet, session not yet adopted on this origin, a
 * rotated session the wallet has not seen — so the caller only ever sees an
 * error after re-acquiring the authorization has ALSO failed. Nothing is
 * charged on a failed pass: the wallet keys every charge on `entryKey`, so a
 * replayed attempt settles against the same ledger entry.
 */
async function callVerifiedCredits(
  payload: Record<string, unknown>,
  options: { preflight?: boolean; notify?: boolean } = {},
): Promise<any> {
  const { preflight = false, notify = true } = options;
  if (typeof window === 'undefined') throw creditAuthorizationError('signed_out', notify);

  const attempt = async (): Promise<any> => {
    if (preflight && payload.op !== 'balance') {
      const balance = await sendCredits({ op: 'balance' });
      if (!balance || balance.ok !== true || typeof balance.email !== 'string' || !balance.email.includes('@')) {
        throw new CreditAuthorizationError('Credit authorization is not confirmed for this session yet.', {
          code: 'credit_authorization_unconfirmed',
          status: 401,
        });
      }
    }
    return sendCredits(payload);
  };

  let lastError: unknown = null;
  for (let pass = 0; pass < 2; pass += 1) {
    const authorization = await resolveCreditAuthorization(pass === 0 ? 10_000 : 6_000);
    if (authorization.issue) {
      lastError = creditAuthorizationError(authorization.issue, false);
      if (pass === 0 && authorization.issue !== 'signed_out') continue;
      break;
    }
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (pass === 1 || !isRecoverableAuthFailure(error)) break;
      if (hasTenantDelegationAuth()) await waitForSession(6_000);
      else await refreshWorkspaceSession();
    }
  }
  if (isCreditAuthorizationError(lastError)) {
    const issue = (lastError.code in CREDIT_AUTH_COPY ? lastError.code : 'session_rejected') as CreditAuthIssue;
    throw creditAuthorizationError(issue, notify);
  }
  if (isRecoverableAuthFailure(lastError)) throw creditAuthorizationError('session_rejected', notify);
  throw lastError;
}

/** Re-check the email session from the global recovery notice. */
export async function refreshCreditSession(): Promise<boolean> {
  try {
    // This button is an explicit recovery action, so do not trust only the
    // cached local session. Re-prove the current candidate, let the runtime
    // rotate its token when needed, then verify that vv-credits resolves the
    // refreshed identity to an email before announcing recovery.
    if (hasTenantDelegationAuth()) await waitForSession(10_000);
    else await refreshWorkspaceSession();
    const authorization = await resolveCreditAuthorization(10_000);
    if (authorization.issue) return false;
    const data = await callVerifiedCredits({ op: 'balance' }, { notify: false });
    const state = toState(data);
    if (!state) return false;
    publish(state);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CREDIT_AUTH_REFRESHED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Fail closed before a durable pipeline creates provider work. */
export async function requireVerifiedCreditSession(): Promise<CreditState> {
  try {
    const data = await callVerifiedCredits({ op: 'balance' });
    const state = toState(data);
    if (!state) throw creditAuthorizationError('session_rejected', true);
    publish(state);
    return state;
  } catch (error: any) {
    if (isCreditAuthorizationError(error)) throw error;
    const status = Math.round(Number(error?.status) || 0);
    if (status === 401 || status === 403) throw creditAuthorizationError('session_rejected', true);
    throw new CreditAuthorizationError('Credit authorization could not be confirmed. Your generation was not started.', {
      code: 'credit_authorization_unavailable',
      status,
    });
  }
}

/**
 * One passive wallet read. Signed-out and guest visitors have no wallet yet,
 * so balance/quote callers receive null without opening the sign-in notice.
 */
async function callCredits(payload: Record<string, unknown>): Promise<any | null> {
  if (typeof window === 'undefined') return null;
  const current = getSessionId();
  if (!current || current.startsWith('guest_')) return null;
  try {
    return await callVerifiedCredits(payload, { notify: false });
  } catch (e) {
    console.warn('[VidVerge] credit wallet unreachable:', e);
    return null;
  }
}

let refreshInFlight: Promise<CreditState | null> | null = null;

/** Resolve the signed-in visitor's balance and cache it. Concurrent callers share one request. */
export async function refreshCredits(): Promise<CreditState | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const data = await callCredits({ op: 'balance' });
    const state = toState(data);
    return publish(state);
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** A fresh idempotency key for one generation attempt. */
export function newChargeKey(prefix = 'gen'): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${rand}`;
}

export interface ChargeRequest {
  /** Length of the media being generated, in seconds (per-second engines). */
  seconds?: number;
  /** Rate-card engine or model id (lib/pricing.ts). Defaults to the canonical video engine. */
  engine?: string;
  /** Resolution, audio, mode, chars, jobs, bundle… — see QuoteOptions. */
  options?: QuoteOptions;
  /** A multi-engine job priced and ceiled once (e.g. avatar + B-roll + render). */
  items?: Array<{ engine: string; options?: QuoteOptions }>;
  /** Human label for the history, e.g. "Omni 8s clip". */
  label?: string;
  /** Idempotency key — reuse it on a retry so the same clip is billed once. */
  entryKey: string;
  /** Which surface is spending (group-a, runway, …) — ledger context only. */
  source?: string;
  note?: string;
  /** The screen already showed this exact credit price and the customer approved it. */
  preconfirmed?: boolean;
}

export interface ChargeResult {
  /** False when the meter could not run at all (signed out, wallet offline). */
  metered: boolean;
  charged: number;
  state: CreditState | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  costUsd?: number;
  engine?: string;
}

function localQuoteFor(request: ChargeRequest): Quote {
  if (request.items && request.items.length) {
    const parts = request.items.map((item) => quoteLocal(item.engine, item.options || {}));
    const costUsd = parts.reduce((sum, p) => sum + p.costUsd, 0);
    const any = parts.some((p) => p.credits > 0);
    const base = parts[0];
    return {
      ...base,
      engine: parts.map((p) => p.engine).join('+'),
      label: request.label || parts.map((p) => p.label).join(' + '),
      costUsd,
      credits: any ? Math.ceil((costUsd * 1.3) / CREDIT_VALUE_USD - 1e-9) : 0,
      priced: parts.every((p) => p.priced),
      free: parts.every((p) => p.free),
    };
  }
  const options = { ...(request.options || {}) };
  if (options.seconds == null && request.seconds != null) options.seconds = Number(request.seconds);
  return quoteLocal(request.engine || DEFAULT_VIDEO_ENGINE, options);
}

function chargePayload(request: ChargeRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    entryKey: request.entryKey,
    source: request.source || 'app',
    note: request.note,
    label: request.label,
  };
  if (request.items && request.items.length) {
    payload.items = request.items;
  } else {
    payload.engine = request.engine || DEFAULT_VIDEO_ENGINE;
    const options = { ...(request.options || {}) };
    if (options.seconds == null && request.seconds != null) options.seconds = Math.max(0, Number(request.seconds) || 0);
    payload.options = options;
    if (request.seconds != null) payload.seconds = Math.max(0, Number(request.seconds) || 0);
  }
  return payload;
}

/**
 * Spend credits for one generation, BEFORE the provider is called.
 *
 * Two failure modes, deliberately treated differently:
 *   - The wallet answers "not enough" → the generation is blocked, the plans
 *     screen opens on the credit wall, and this throws InsufficientCreditsError.
 *   - The wallet cannot be reached or the session cannot be authorized → the
 *     generation is refused before provider submission. No anonymous or
 *     unmetered fallback is allowed for a paid render.
 */
export async function authorizeCredits(
  request: ChargeRequest,
  options: { preflight?: boolean } = {},
): Promise<ChargeResult> {
  const local = localQuoteFor(request);
  // Text and image generation are free: nothing to authorize.
  if (local.free) return { metered: false, charged: 0, state: cached, costUsd: 0, engine: local.engine };
  await confirmCharge(request, local);
  const seconds = Math.round(Number(request.seconds ?? request.options?.seconds) || 0);

  let data: any;
  try {
    data = await callVerifiedCredits({ op: 'charge', ...chargePayload(request) }, { preflight: options.preflight !== false });
  } catch (e: any) {
    if (isCreditAuthorizationError(e)) throw e;
    const status = Math.round(Number(e?.status) || 0);
    const auth = status === 401 || status === 403;
    if (auth) throw creditAuthorizationError('session_rejected', true);
    throw new CreditAuthorizationError(
      'Credit authorization could not be confirmed. Your generation was not started.',
      { code: 'credit_authorization_unavailable', status },
    );
  }

  const state = toState(data);
  if (state) publish(state);
  const label = String(data?.quote?.label || request.label || local.label);
  if (data?.code === 'insufficient_credits') {
    const balance = state ? state.balance : 0;
    const plan = state ? state.plan : 'free';
    const required = Math.max(0, Math.round(Number(data.required) || local.credits));
    openPricing('credits', { required, balance, seconds, label });
    throw new InsufficientCreditsError({ required, balance, seconds, plan, label });
  }
  if (data?.ok !== true) {
    throw new CreditAuthorizationError(String(data?.error || 'Credit authorization was refused.'), {
      code: String(data?.code || 'credit_authorization_refused'),
    });
  }
  const charged = Math.max(0, Math.round(Number(data.charged) || 0));
  const result: ChargeResult = {
    metered: true,
    charged,
    state,
    balanceBefore: Number.isFinite(Number(data.balanceBefore)) ? Number(data.balanceBefore) : null,
    balanceAfter: state ? state.balance : null,
    costUsd: Number(data?.quote?.costUsd) || local.costUsd,
    engine: String(data?.quote?.engine || local.engine),
  };
  if (!data.duplicate) {
    announce(CREDITS_CHARGED_EVENT, {
      charged,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      label,
      engine: result.engine,
      costUsd: result.costUsd,
      source: request.source || 'app',
      unlimited: !!state?.unlimited,
      unpriced: data.unpriced === true,
    } as CreditsChargedDetail);
  }
  return result;
}

export async function chargeCredits(request: ChargeRequest): Promise<ChargeResult> {
  return authorizeCredits(request);
}

/**
 * Publish a charge that a server function made on this wallet itself (for
 * example UGC Studio, which re-quotes Runway server-side), so the shell shows
 * the deduction and the new balance exactly like a browser-side charge.
 */
export function reportServerCharge(detail: {
  charged: number;
  balanceAfter: number | null;
  label: string;
  engine: string;
  source: string;
  costUsd?: number;
  unlimited?: boolean;
}): void {
  const charged = Math.max(0, Math.round(Number(detail.charged) || 0));
  if (cached && detail.balanceAfter != null && !cached.unlimited) publish({ ...cached, balance: Math.max(0, Math.round(detail.balanceAfter)) });
  else void refreshCredits();
  if (!charged || detail.unlimited) return;
  announce(CREDITS_CHARGED_EVENT, {
    charged,
    balanceBefore: detail.balanceAfter != null ? detail.balanceAfter + charged : null,
    balanceAfter: detail.balanceAfter,
    label: detail.label,
    engine: detail.engine,
    costUsd: Number(detail.costUsd) || 0,
    source: detail.source,
    unlimited: false,
    unpriced: false,
  } as CreditsChargedDetail);
}

/** Hand credits back when the provider never actually started the render. */
export async function refundCredits(entryKey: string, note?: string): Promise<void> {
  try {
    await refundCreditsStrict(entryKey, note);
  } catch (error) {
    console.warn('[VidVerge] credit refund could not be confirmed:', error);
  }
}

/** Authenticated refund variant for flows that must prove reconciliation. */
export async function refundCreditsStrict(entryKey: string, note?: string): Promise<void> {
  let data: any;
  try {
    data = await callVerifiedCredits({ op: 'refund', entryKey, note }, { preflight: true });
  } catch (e: any) {
    if (isCreditAuthorizationError(e)) throw e;
    const status = Math.round(Number(e?.status) || 0);
    if (status === 401 || status === 403) throw creditAuthorizationError('session_rejected', true);
    throw new CreditAuthorizationError('Credit refund could not be confirmed.', {
      code: 'credit_refund_unavailable',
      status,
    });
  }
  const state = toState(data);
  if (state) publish(state);
  if (data?.ok !== true) throw new CreditAuthorizationError(String(data?.error || 'Credit refund was refused.'), { code: String(data?.code || 'credit_refund_refused') });
  const refunded = Math.max(0, Math.round(Number(data.refunded) || 0));
  if (refunded > 0) announce(CREDITS_REFUNDED_EVENT, { refunded, balanceAfter: state ? state.balance : null, note: note || '' });
}

export interface CreditQuoteResult {
  cost: number;
  balance: number;
  affordable: boolean;
  shortfall: number;
  state: CreditState | null;
  quote: Quote;
}

/**
 * Ask what a generation would cost without spending anything. Pass seconds
 * (canonical video engine) or a full ChargeRequest-like spec. Returns null when
 * the wallet is unknown, so a caller can tell "can't afford" apart from
 * "don't know yet".
 */
export async function quoteCredits(
  spec: number | Omit<ChargeRequest, 'entryKey'>,
  engine?: string,
  options?: QuoteOptions,
): Promise<CreditQuoteResult | null> {
  const request: ChargeRequest = typeof spec === 'number'
    ? { entryKey: 'quote', seconds: spec, engine, options }
    : { entryKey: 'quote', ...spec };
  const local = localQuoteFor(request);
  const payload = chargePayload(request);
  delete payload.entryKey;
  const data = await callCredits({ op: 'quote', ...payload });
  if (!data || data.ok !== true) return null;
  const state = toState(data);
  if (state) publish(state);
  const serverQuote = data.quote && typeof data.quote === 'object' ? (data.quote as Quote) : local;
  return {
    cost: Math.max(0, Math.round(Number(data.cost) || 0)),
    balance: state ? state.balance : 0,
    affordable: data.affordable === true,
    shortfall: Math.max(0, Math.round(Number(data.shortfall) || 0)),
    state,
    quote: { ...local, ...serverQuote, lines: serverQuote.lines || local.lines },
  };
}

export interface CreditHistoryEntry {
  id: number;
  kind: string;
  amount: number;
  balanceAfter: number;
  seconds: number | null;
  source: string | null;
  note: string | null;
  engine: string | null;
  costUsd: number | null;
  createdAt: string;
}

/** The signed-in wallet's recent movements, newest first. */
export async function fetchCreditHistory(limit = 30): Promise<CreditHistoryEntry[] | null> {
  const data = await callCredits({ op: 'history', limit });
  if (!data || data.ok !== true) return null;
  const state = toState(data);
  if (state) publish(state);
  const rows: any[] = Array.isArray(data.entries) ? data.entries : [];
  return rows.map((row) => ({
    id: Number(row.id) || 0,
    kind: String(row.kind || ''),
    amount: Math.round(Number(row.amount) || 0),
    balanceAfter: Math.round(Number(row.balance_after) || 0),
    seconds: row.seconds == null ? null : Number(row.seconds),
    source: row.source ? String(row.source) : null,
    note: row.note ? String(row.note) : null,
    engine: row.engine ? String(row.engine) : null,
    costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
    createdAt: String(row.created_at || ''),
  }));
}

/**
 * React binding. Resolves on mount, re-renders on every balance movement, and
 * re-resolves when a session is established after the email gate.
 */
export function useCredits(): { credits: CreditState | null; loading: boolean; refresh: () => void } {
  const [credits, setCredits] = useState<CreditState | null>(() => getCachedCredits());
  const [loading, setLoading] = useState<boolean>(() => getCachedCredits() === null);

  useEffect(() => {
    let cancelled = false;

    const resolve = () => {
      if (cancelled) return;
      setLoading(true);
      void refreshCredits().then((next) => {
        if (cancelled) return;
        setCredits(next);
        setLoading(false);
      });
    };

    const onCreditsEvent = (event: Event) => {
      if (cancelled) return;
      setCredits(((event as CustomEvent).detail as CreditState | null) ?? getCachedCredits());
    };

    resolve();
    window.addEventListener(CREDITS_EVENT, onCreditsEvent as EventListener);
    window.addEventListener('audos:session-established', resolve as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener(CREDITS_EVENT, onCreditsEvent as EventListener);
      window.removeEventListener('audos:session-established', resolve as EventListener);
    };
  }, []);

  return { credits, loading, refresh: () => void refreshCredits() };
}

// ---------------------------------------------------------------------------
// Checkout — native Audos payments (`stripe-payments`)
//
// Credits are sold one-time in packs at $0.15 per credit. The flow returns to
// the app with `?vv_checkout=credits&session_id=…`, which
// `consumeCheckoutReturn()` below hands to the wallet function — and the wallet
// re-reads the payment from the platform and credits amount / $0.15, so a
// hand-typed return URL buys nothing.
// ---------------------------------------------------------------------------

function returnUrl(kind: 'credits'): string {
  const base = window.location.origin + window.location.pathname;
  // Keep the screen the buyer was on; {CHECKOUT_SESSION_ID} must stay literal
  // for the provider to fill in, so it is appended rather than URL-encoded.
  const params = new URLSearchParams(window.location.search);
  params.delete('vv_checkout');
  params.delete('session_id');
  const kept = params.toString();
  return `${base}?${kept ? `${kept}&` : ''}vv_checkout=${kind}&session_id={CHECKOUT_SESSION_ID}${window.location.hash}`;
}

export interface CheckoutStart {
  ok: boolean;
  error?: string;
}

/** Subscriptions were retired with pay-per-use pricing; kept so older callers compile. */
export async function startSubscriptionCheckout(_plan: string, _email: string): Promise<CheckoutStart> {
  return { ok: false, error: 'Vidverge is pay per use now — buy a credit pack instead.' };
}

/** Buy a pack of `credits` credits at $0.15 each. */
export async function startCreditPackCheckout(credits: number, email: string): Promise<CheckoutStart> {
  if (hasTenantDelegationAuth()) return { ok: false, error: 'Ask your agent to manage this purchase through the Audos wallet.' };
  const count = Math.max(CREDIT_PACK_OPTIONS[0], Math.round(Number(credits) || CREDIT_PACK_OPTIONS[0]));
  const amount = count * CREDIT_PRICE_CENTS;
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Add your email in Settings first so the credits have an account to land in.' };
  }
  try {
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Id': spaceId() },
      body: JSON.stringify({
        amount,
        productName: `VidVerge — ${count} credits`,
        productDescription: `${count} Vidverge credits at $0.15 each. Spend them on any engine; credits never expire.`,
        customerEmail: email,
        successUrl: returnUrl('credits'),
        cancelUrl: window.location.href,
        metadata: { vvEmail: email, vvCredits: String(count) },
      }),
    });
    const data = await res.json().catch(() => null);
    if (data && data.checkoutUrl) {
      window.location.href = String(data.checkoutUrl);
      return { ok: true };
    }
    return { ok: false, error: String(data?.error || 'Checkout could not be opened. Try again in a moment.') };
  } catch (e: any) {
    return { ok: false, error: `Checkout could not be reached: ${String(e?.message || e)}` };
  }
}

let checkoutReturnHandled = false;

/**
 * Finish a checkout the customer just came back from. Mounted once by the
 * shell: it hands the checkout session id to the wallet function, which
 * verifies the payment server-side before any credits move, then clears the
 * query string so a refresh cannot look like a second purchase.
 */
export async function consumeCheckoutReturn(): Promise<CreditState | null> {
  if (typeof window === 'undefined' || checkoutReturnHandled) return null;
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('vv_checkout');
  const checkoutSessionId = params.get('session_id');
  if (!kind || !checkoutSessionId || checkoutSessionId.startsWith('{')) return null;
  checkoutReturnHandled = true;

  const data = await callCredits({ op: 'redeem_checkout', checkoutSessionId });
  const state = toState(data);
  if (state) publish(state);
  if (data && data.ok !== true) {
    console.warn('[VidVerge] checkout not applied yet:', data.code || data.error);
  }

  params.delete('vv_checkout');
  params.delete('session_id');
  const query = params.toString();
  window.history.replaceState(
    {},
    '',
    window.location.pathname + (query ? `?${query}` : '') + window.location.hash,
  );
  return state;
}
