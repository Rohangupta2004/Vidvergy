import { useEffect, useState } from 'react';
import {
  callHook,
  ensureVerifiedCreditSession,
  getSessionEmail,
  getSessionId,
  getWorkspaceToken,
  refreshWorkspaceSession,
  workspaceFetch,
  workspaceTokenNow,
  type CallHookOptions,
  type WorkspaceFetchOptions,
} from './workspace';
import { getTenantDelegationScope, hasTenantDelegationAuth } from './tenant-delegation-scope';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';
export type SessionIssue = null | 'signed_out' | 'token_not_ready' | 'session_not_ready';

export interface SessionSnapshot {
  status: SessionStatus;
  sessionId: string;
  email: string;
  tokenReady: boolean;
  delegated: boolean;
  issue: SessionIssue;
}

function currentSnapshot(status: SessionStatus = 'loading'): SessionSnapshot {
  const sessionId = getSessionId();
  const email = getSessionEmail();
  const tokenReady = Boolean(workspaceTokenNow());
  const delegated = hasTenantDelegationAuth();
  const signedIn = sessionId.startsWith('wses_') && email.includes('@');
  return {
    status: signedIn ? (status === 'loading' ? 'loading' : 'signedIn') : status,
    sessionId,
    email,
    tokenReady,
    delegated,
    issue: signedIn ? (tokenReady ? null : 'token_not_ready') : (sessionId || email ? 'session_not_ready' : 'signed_out'),
  };
}

/** Wait for the host session and workspace token. One recovery pass is built in. */
export async function waitForSession(timeoutMs = 10_000): Promise<SessionSnapshot> {
  if (typeof window === 'undefined') return { status: 'signedOut', sessionId: '', email: '', tokenReady: false, delegated: false, issue: 'signed_out' };
  let sessionId = await ensureVerifiedCreditSession();
  if (!sessionId && !hasTenantDelegationAuth()) {
    await refreshWorkspaceSession();
    sessionId = await ensureVerifiedCreditSession();
  }
  const token = await getWorkspaceToken(timeoutMs);
  const email = getSessionEmail();
  const delegated = Boolean(getTenantDelegationScope());
  const signedIn = sessionId.startsWith('wses_') && email.includes('@');
  const snapshot: SessionSnapshot = {
    status: signedIn ? 'signedIn' : 'signedOut',
    sessionId,
    email,
    tokenReady: Boolean(token),
    delegated,
    issue: signedIn ? (token ? null : 'token_not_ready') : (sessionId || email ? 'session_not_ready' : 'signed_out'),
  };
  if (snapshot.issue && snapshot.issue !== 'signed_out') {
    console.warn('[VidVerge auth] reason=session_resolution_incomplete', {
      issue: snapshot.issue,
      hasSession: Boolean(snapshot.sessionId),
      hasEmail: Boolean(snapshot.email),
      hasToken: snapshot.tokenReady,
      delegated: snapshot.delegated,
    });
  }
  return snapshot;
}

/** Authenticated browser request: waits for hydration, attaches token/session/email, retries one auth refusal. */
export function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: WorkspaceFetchOptions = {},
): Promise<Response> {
  return workspaceFetch(input, init, options);
}

/** Authenticated workspace-function request through the same shared transport. */
export function authedHook<T = any>(
  name: string,
  body: Record<string, unknown> = {},
  options: CallHookOptions = {},
): Promise<T> {
  return callHook<T>(name, body, options);
}

export function useSession(): SessionSnapshot & { refresh: () => void } {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => currentSnapshot('loading'));

  useEffect(() => {
    let cancelled = false;
    const resolve = () => {
      if (cancelled) return;
      setSnapshot(currentSnapshot('loading'));
      void waitForSession().then((next) => { if (!cancelled) setSnapshot(next); });
    };
    resolve();
    window.addEventListener('audos:session-established', resolve as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('audos:session-established', resolve as EventListener);
    };
  }, []);

  return { ...snapshot, refresh: () => void waitForSession().then(setSnapshot) };
}

export { hasTenantDelegationAuth };
