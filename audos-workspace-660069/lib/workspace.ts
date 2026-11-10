import { getTenantDelegationScope, scopedSpaceSessionStorageKey } from './tenant-delegation-scope';

/**
 * One place for workspace identity, the workspace DB token, the visitor
 * session id, and the hook-call envelope every app shares.
 *
 * Before this file there were 34 hard-coded copies of the workspace UUID and
 * 29 separate token getters, each with its own idea of how long to wait and
 * what to do about a 401. Import from here instead of re-deriving any of it.
 */

/** Workspace UUID. The only copy. */
export const WORKSPACE_ID = 'f24710e5-7c6d-4db4-92b4-c2c235877575';

/** Space id used in the public hook execute path. The only copy. */
export const SPACE_ID = 'workspace-660069';

declare global {
  interface Window {
    __workspaceDb?: { token?: string; setSessionId?: (id: string) => void };
    __APP_ID__?: string;
    __SPACE_ID__?: string;
    __SESSION_ID__?: string;
    /** The canonical validated `wses_…` session — published by SpaceRuntimeContext. */
    __spaceSessionId?: string;
    /** Last session explicitly accepted by the email gate or recovery helper. */
    __audosAcceptedSessionId?: string;
  }
}

const TOKEN_WAIT_MS = 10_000;
const TOKEN_POLL_MS = 150;

/** Synchronous read. Empty string when the runtime has not injected it yet. */
export function workspaceTokenNow(): string {
  if (typeof window === 'undefined') return '';
  return String(window.__workspaceDb?.token || '');
}

/**
 * Wait up to 10 seconds for the runtime to inject the workspace DB token.
 *
 * The token arrives slightly after first paint, so a component that fetches in
 * its first effect used to race it and get an anonymous 401. Every app had its
 * own retry for that. This is the shared one.
 */
export async function getWorkspaceToken(timeoutMs = TOKEN_WAIT_MS): Promise<string> {
  if (typeof window === 'undefined') return '';
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let token = workspaceTokenNow();
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
    token = workspaceTokenNow();
  }
  return token;
}

/** The space id this page is actually running under, falling back to the constant. */
export function spaceId(): string {
  if (typeof window === 'undefined') return SPACE_ID;
  return String(window.__APP_ID__ || window.__SPACE_ID__ || SPACE_ID);
}

const SESSION_EMAIL_COOKIE = 'vidverge_session_email';

function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.includes('@') ? email : '';
}

function cookieEmail(): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${SESSION_EMAIL_COOKIE}=`;
  const row = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!row) return '';
  try { return normalizeEmail(decodeURIComponent(row.slice(prefix.length))); } catch { return ''; }
}

/** Signed-in email cached across reloads and tabs. The server-validated session
 * remains authoritative; this value is identity context, never authorization. */
export function getSessionEmail(): string {
  if (typeof window === 'undefined') return '';
  const delegation = getTenantDelegationScope();
  const delegatedEmail = normalizeEmail(delegation?.email)
    || (delegation?.consumerWorkspaceId ? `delegation-${delegation.consumerWorkspaceId.toLowerCase()}@tenant-agent.audos` : '');
  if (delegatedEmail) return delegatedEmail;
  try {
    const raw = window.localStorage.getItem(scopedSpaceSessionStorageKey(spaceId()));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const email = normalizeEmail(parsed.email);
      if (email) return email;
    }
  } catch { /* cookie fallback below */ }
  return cookieEmail();
}

/** Persist only identity context that has already been accepted by the host. */
export function clearSessionIdentity(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(scopedSpaceSessionStorageKey(spaceId())); } catch { /* best effort */ }
  try { document.cookie = `${SESSION_EMAIL_COOKIE}=; max-age=0; path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`; } catch { /* best effort */ }
  window.__audosAcceptedSessionId = undefined;
  window.__spaceSessionId = undefined;
  window.__SESSION_ID__ = undefined;
  window.__workspaceDb?.setSessionId?.('');
}

export function persistSessionIdentity(sessionId: string, email: string, verified = true): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeEmail(email);
  if (!sessionId.startsWith('wses_') || !normalized) return;
  const key = scopedSpaceSessionStorageKey(spaceId());
  let previous: Record<string, unknown> = {};
  try { previous = JSON.parse(window.localStorage.getItem(key) || '{}') || {}; } catch { previous = {}; }
  try {
    window.localStorage.setItem(key, JSON.stringify({
      ...previous,
      id: sessionId,
      sessionId,
      workspaceSessionId: sessionId,
      workspaceId: WORKSPACE_ID,
      email: normalized,
      verified,
      authorized: true,
      identityMode: verified ? 'strict_verified' : String(previous.identityMode || 'legacy_registration'),
      timestamp: Date.now(),
    }));
  } catch { /* private mode may disable storage */ }
  try {
    document.cookie = `${SESSION_EMAIL_COOKIE}=${encodeURIComponent(normalized)}; max-age=31536000; path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  } catch { /* cookie may be unavailable */ }
  window.__audosAcceptedSessionId = sessionId;
  window.__spaceSessionId = sessionId;
  window.__SESSION_ID__ = sessionId;
  window.__workspaceDb?.setSessionId?.(sessionId);
}

/**
 * Canonical visitor session id (`wses_…` or its UUID form).
 *
 * THE FIRST SOURCE IS `window.__spaceSessionId` — the global the shell
 * (SpaceRuntimeContext) actually publishes the validated `wses_…` session on,
 * and the one `lib/plans.ts` already reads. This function used to read only
 * `__SESSION_ID__` and `audos:sessionId`, which nothing in this space sets, so
 * every call to a session-gated hook (`executeAuth: "workspace_session"` —
 * stv-scene-generate, vv-credits, …) went out with NO X-Session-Id and was
 * rejected with "Workspace session required" even for a signed-in customer.
 *
 * A session-gated hook rejects client-minted placeholders (`anon_…`,
 * `ephemeral_…`, `csess_…`, `space-<email>-<uuid>`), so those are filtered out
 * here rather than sent and refused.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let raw = '';
  try {
    // The shell publishes the currently validated session. Prefer it over an
    // older recovery value: a stale __audosAcceptedSessionId used to shadow a
    // freshly signed-in __spaceSessionId and made every credit retry replay the
    // stale identity forever.
    const delegation = getTenantDelegationScope();
    raw =
      String(delegation?.workspaceSessionId || '') ||
      (String(delegation?.sessionId || '').startsWith('wses_') ? String(delegation?.sessionId || '') : '') ||
      String(window.__spaceSessionId || '') ||
      String(window.__SESSION_ID__ || '') ||
      String(window.__audosAcceptedSessionId || '') ||
      (() => {
        const stored = window.localStorage.getItem(scopedSpaceSessionStorageKey(spaceId()));
        if (!stored) return '';
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        const recovered = parsed.workspaceSessionId || parsed.sessionId || parsed.id;
        const authorized = parsed.verified === true || (
          parsed.authorized === true && parsed.identityMode === 'legacy_registration'
        );
        return authorized && typeof recovered === 'string' && recovered.startsWith('wses_') ? recovered : '';
      })();
  } catch {
    raw = String(window.__spaceSessionId || window.__SESSION_ID__ || window.__audosAcceptedSessionId || '');
  }
  const id = raw.trim();
  if (!id) return '';
  if (!/^(wses_|guest_)/.test(id)) return '';
  return id;
}

/**
 * A credit-bearing identity must be a canonical workspace session whose saved
 * record contains the email that the platform verified. Guest sessions are
 * valid for browsing the workspace, but they are never a billable identity.
 */
export function getVerifiedSessionId(): string {
  if (typeof window === 'undefined') return '';
  const id = getSessionId();
  if (!id.startsWith('wses_')) return '';
  const delegation = getTenantDelegationScope();
  const delegatedId = String(delegation?.workspaceSessionId || (String(delegation?.sessionId || '').startsWith('wses_') ? delegation?.sessionId : '') || '');
  if (delegation && delegatedId === id && getSessionEmail().endsWith('@tenant-agent.audos')) return id;
  try {
    const raw = window.localStorage.getItem(scopedSpaceSessionStorageKey(spaceId()));
    if (!raw) return '';
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const storedId = String(stored.workspaceSessionId || stored.sessionId || stored.id || '');
    const email = typeof stored.email === 'string' ? stored.email.trim().toLowerCase() : '';
    const verified = stored.verified === true;
    return storedId === id && verified && email.includes('@') ? id : '';
  } catch {
    return '';
  }
}

/**
 * Prove the current canonical session even when the draft-preview host supplied
 * it before this origin had a complete localStorage record. The platform's
 * cookie-backed check is authoritative: only a verified wses_ session with a
 * matching email is adopted. Guest, stale, pending-OTP and legacy-registration
 * sessions still fail closed.
 */
export async function ensureVerifiedCreditSession(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const cached = getVerifiedSessionId();
  if (cached) return cached;
  const current = getSessionId();
  if (!current.startsWith('wses_')) return '';
  const delegation = getTenantDelegationScope();
  const delegatedId = String(delegation?.workspaceSessionId || (String(delegation?.sessionId || '').startsWith('wses_') ? delegation?.sessionId : '') || '');
  if (delegation && delegatedId === current) {
    const email = normalizeEmail(delegation.email)
      || (delegation.consumerWorkspaceId ? `delegation-${delegation.consumerWorkspaceId.toLowerCase()}@tenant-agent.audos` : '');
    if (email) {
      persistSessionIdentity(current, email, true);
      return current;
    }
  }
  try {
    const sharedPath = `/space/${encodeURIComponent(spaceId())}`;
    const onSharedPath = window.location.pathname === sharedPath;
    const query = new URLSearchParams({ sessionUuid: current });
    if (!onSharedPath) {
      query.set('workspaceId', WORKSPACE_ID);
      query.set('spaceId', spaceId());
    }
    const response = await fetch(
      onSharedPath
        ? `${sharedPath}/check-session?${query}`
        : `/api/auth/otp/space/check-session?${query}`,
      { credentials: 'include', cache: 'no-store' },
    );
    const checked = await response.json().catch(() => null);
    const accepted = String(checked?.canonicalSessionId || checked?.workspaceSessionId || current);
    const email = String(checked?.email || '').trim().toLowerCase();
    const verified = checked?.verified === true || checked?.sessionVerified === true;
    if (!response.ok || !verified || !accepted.startsWith('wses_') || !email.includes('@')) return '';

    const storageKey = scopedSpaceSessionStorageKey(spaceId());
    let previous: Record<string, unknown> = {};
    try { previous = JSON.parse(window.localStorage.getItem(storageKey) || '{}') || {}; } catch { previous = {}; }
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...previous,
      id: accepted,
      sessionId: accepted,
      workspaceSessionId: accepted,
      workspaceId: String(checked?.workspaceId || WORKSPACE_ID),
      email,
      verified: true,
      authorized: true,
      identityMode: 'strict_verified',
      timestamp: Date.now(),
    }));
    persistSessionIdentity(accepted, email, true);
    window.dispatchEvent(new CustomEvent('audos:session-established', {
      detail: { workspaceSessionId: accepted, email, verified: true, authorized: true, identityMode: 'strict_verified', recovered: true },
    }));
    return accepted;
  } catch {
    return '';
  }
}

interface StoredEmailSession {
  email?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

let sessionRefreshInFlight: Promise<string> | null = null;

/**
 * Refresh the email saved by EmailGate only when registration explicitly
 * returns a verified session or the server's OTP-disabled legacy authorization.
 * If the current policy requires OTP this returns an empty string; only
 * EmailGate's code-verification step may adopt that strict session.
 */
export async function refreshWorkspaceSession(): Promise<string> {
  if (typeof window === 'undefined') return '';
  if (sessionRefreshInFlight) return sessionRefreshInFlight;

  sessionRefreshInFlight = (async () => {
    const storageKey = scopedSpaceSessionStorageKey(spaceId());
    let stored: StoredEmailSession | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      stored = raw ? (JSON.parse(raw) as StoredEmailSession) : null;
    } catch {
      stored = null;
    }
    const email = typeof stored?.email === 'string' ? stored.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) return '';

    const storedSessionId = String(
      stored?.workspaceSessionId || stored?.sessionId || stored?.id || '',
    );

    const adopt = (
      accepted: string,
      verified: boolean,
      identityMode: 'strict_verified' | 'legacy_registration',
      resolvedWorkspaceId: string,
      extra: Record<string, unknown> = {},
    ): string => {
      const next = {
        ...(stored || {}),
        ...extra,
        id: accepted,
        sessionId: accepted,
        workspaceSessionId: accepted,
        workspaceId: resolvedWorkspaceId,
        email,
        verified,
        authorized: true,
        identityMode,
        timestamp: Date.now(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      persistSessionIdentity(accepted, email, verified);
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: { workspaceSessionId: accepted, email, verified, authorized: true, identityMode, recovered: true },
      }));
      return accepted;
    };

    // Prove every credible session candidate, newest shell state first. A
    // signed-in tab can legitimately have a fresh __spaceSessionId while its
    // localStorage record still names the previous session. Checking only the
    // stored id made "Retry" deterministically replay that stale session.
    const candidates = Array.from(new Set([
      String(window.__spaceSessionId || ''),
      String(window.__SESSION_ID__ || ''),
      String(window.__audosAcceptedSessionId || ''),
      storedSessionId,
    ].map((value) => value.trim()).filter((value) => value.startsWith('wses_'))));
    for (const candidate of candidates) {
      try {
        const sharedPath = `/space/${encodeURIComponent(spaceId())}`;
        const onSharedPath = window.location.pathname === sharedPath;
        const query = new URLSearchParams({ sessionUuid: candidate });
        if (!onSharedPath) {
          query.set('workspaceId', WORKSPACE_ID);
          query.set('spaceId', spaceId());
        }
        const checkUrl = onSharedPath
          ? `${sharedPath}/check-session?${query}`
          : `/api/auth/otp/space/check-session?${query}`;
        const checkResponse = await fetch(checkUrl, {
          credentials: 'include',
          cache: 'no-store',
        });
        const checked = await checkResponse.json().catch(() => null);
        const verified = checked?.verified === true || checked?.sessionVerified === true;
        const legacyAuthorized = checked?.authorized === true
          && checked?.identityMode === 'legacy_registration';
        const checkedEmail = String(checked?.email || '').trim().toLowerCase();
        const accepted = String(checked?.canonicalSessionId || checked?.workspaceSessionId || candidate);
        if (
          checkResponse.ok
          && accepted.startsWith('wses_')
          && checkedEmail === email
          && (verified || legacyAuthorized)
        ) {
          return adopt(
            accepted,
            verified,
            verified ? 'strict_verified' : 'legacy_registration',
            String(checked?.workspaceId || WORKSPACE_ID),
          );
        }
      } catch {
        // Try the next candidate, then the policy-aware fallback below.
      }
    }

    let visitorId = '';
    try {
      visitorId = String(window.localStorage.getItem('audos_visitor_id') || '');
      if (!visitorId) {
        visitorId = `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        window.localStorage.setItem('audos_visitor_id', visitorId);
      }
    } catch {
      visitorId = `v_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }

    const response = await fetch(`/api/space/${encodeURIComponent(spaceId())}/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        sessionId: `resume_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        visitorId,
        workspaceId: WORKSPACE_ID,
        marketingConsent: false,
        metadata: { ...(stored?.metadata || {}), source: 'automatic_session_recovery' },
      }),
    });
    const data = await response.json().catch(() => null);
    const verified = data?.sessionVerified === true || data?.verified === true;
    const legacyAuthorized = data?.otpRequired === false
      && data?.legacyAuthorized === true
      && data?.identityMode === 'legacy_registration';
    const accepted = String(data?.canonicalSessionId || data?.workspaceSessionId || '');
    if (
      !response.ok
      || data?.success === false
      || !accepted.startsWith('wses_')
      || (!verified && !legacyAuthorized)
    ) return '';

    return adopt(
      accepted,
      verified,
      verified ? 'strict_verified' : 'legacy_registration',
      String(data?.workspaceId || WORKSPACE_ID),
    );
  })();

  try {
    return await sessionRefreshInFlight;
  } finally {
    sessionRefreshInFlight = null;
  }
}

/** Public execute URL for one of this workspace's server functions. */
export function hookUrl(hookName: string): string {
  return `/api/hooks/execute/${spaceId()}/${hookName}`;
}

export interface WorkspaceFetchOptions {
  /** Wait for the injected workspace token before the first request. Default true. */
  waitForToken?: boolean;
  /** Wait for the host/delegation session to hydrate before the first request. Default true. */
  waitForSession?: boolean;
  /** Refresh the accepted email session and retry one authentication failure. Default true. */
  retryAuth?: boolean;
  /**
   * Do not send X-App-Id. The Veo proxy writes that header into a
   * foreign-keyed column, so the space id is rejected there. Default false.
   */
  skipAppId?: boolean;
  /** Explicit registered app id. null omits it; undefined uses the space id. */
  appId?: string | null;
}

export interface CallHookOptions {
  /** Wait for the workspace token before sending. Default true. */
  waitForToken?: boolean;
  /** Retry once after an auth refusal by renewing the email session and token. Default true. */
  retryOn401?: boolean;
  signal?: AbortSignal;
}

export class HookError extends Error {
  status: number;
  hookName: string;
  constructor(message: string, hookName: string, status: number) {
    super(message);
    this.name = 'HookError';
    this.hookName = hookName;
    this.status = status;
  }
}

function unwrap(payload: unknown): any {
  if (payload && typeof payload === 'object') {
    const envelope = payload as Record<string, unknown>;
    if ('response' in envelope && '_meta' in envelope) return envelope.response;
  }
  return payload;
}

const AUTH_FAILURE_TEXT = /invalid workspace session|workspace session (?:is )?required|session verification|required.*sign.?in|session (?:expired|invalid)|no_credentials|same-origin request required/i;

async function responseIsAuthFailure(response: Response): Promise<boolean> {
  if (response.status === 401 || response.status === 403) return true;
  if (response.ok) return false;
  const body = await response.clone().json().catch(() => null);
  const detail = body && typeof body === 'object'
    ? String((body as any)?.error?.message || (body as any)?.error || (body as any)?.message || (body as any)?.code || '')
    : '';
  return AUTH_FAILURE_TEXT.test(detail);
}

async function waitForRefreshedToken(previousToken: string, timeoutMs = 4000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let token = workspaceTokenNow();
  while ((!token || token === previousToken) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, TOKEN_POLL_MS));
    token = workspaceTokenNow();
  }
  // Some hosts keep one workspace token across canonical session rotations. In
  // that case the accepted wses_ header still changed and the original token is
  // valid, so return it rather than converting a recoverable retry into a miss.
  return token || previousToken;
}

/**
 * Authenticated browser fetch for Verger and shared workspace helpers.
 * Every request gets the current workspace token, canonical session and app id.
 * On an authentication refusal it renews the email session, waits for the data
 * runtime to rotate its token, and replays the request exactly once.
 */
export async function workspaceFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: WorkspaceFetchOptions = {},
): Promise<Response> {
  const { waitForToken = true, waitForSession = true, retryAuth = true, skipAppId = false, appId } = options;
  let token = waitForToken ? await getWorkspaceToken() : workspaceTokenNow();
  if (waitForSession) await ensureVerifiedCreditSession();

  const send = (activeToken: string): Promise<Response> => {
    const headers = new Headers(init.headers || {});
    if (activeToken) headers.set('X-Workspace-DB-Token', activeToken);
    const sid = getSessionId();
    const email = getSessionEmail();
    if (sid) headers.set('X-Session-Id', sid);
    if (email) headers.set('X-Session-Email', email);
    if (skipAppId || appId === null) headers.delete('X-App-Id');
    else headers.set('X-App-Id', appId === undefined ? spaceId() : appId);
    return fetch(input, { ...init, credentials: init.credentials || 'include', headers });
  };

  const requestPath = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  let response = await send(token);
  if (retryAuth && await responseIsAuthFailure(response)) {
    console.warn('[VidVerge auth] reason=auth_rejected_first_pass', { path: requestPath, status: response.status, hasSession: Boolean(getSessionId()), hasEmail: Boolean(getSessionEmail()), hasToken: Boolean(token) });
    const previousToken = token;
    const refreshed = getTenantDelegationScope()
      ? await ensureVerifiedCreditSession()
      : await refreshWorkspaceSession();
    if (!refreshed) await ensureVerifiedCreditSession();
    token = await waitForRefreshedToken(previousToken);
    response = await send(token);
    if (await responseIsAuthFailure(response)) {
      console.warn('[VidVerge auth] reason=auth_rejected_after_retry', { path: requestPath, status: response.status, hasSession: Boolean(getSessionId()), hasEmail: Boolean(getSessionEmail()), hasToken: Boolean(token) });
    }
  }
  return response;
}

/**
 * Call a server function with the full header set every gated hook expects:
 * the workspace DB token, the canonical session id, and the app id.
 *
 * A money-spending hook runs behind `executeAuth: "workspace_session"`, which
 * rejects a request with no `X-Session-Id` before any hook code runs. Routing
 * every call through here is what makes that gate safe to switch on.
 */
export async function callHook<T = any>(
  hookName: string,
  body: Record<string, unknown> = {},
  options: CallHookOptions = {},
): Promise<T> {
  const { waitForToken = true, retryOn401 = true, signal } = options;
  await ensureVerifiedCreditSession();
  const sid = getSessionId();
  const res = await workspaceFetch(hookUrl(hookName), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sid ? { session_id: sid, ...body } : body),
    signal,
  }, { waitForToken, retryAuth: retryOn401 });

  const parsed = unwrap(await res.json().catch(() => null));

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === 'object' && (parsed as any).error) ||
      ((res.status === 401 || res.status === 403)
        ? 'Your workspace session could not be refreshed. Please retry, or sign in again if it continues.'
        : `The ${hookName} service did not answer (HTTP ${res.status}).`);
    throw new HookError(String(message), hookName, res.status);
  }

  return (parsed || {}) as T;
}
