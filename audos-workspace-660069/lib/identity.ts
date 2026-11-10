/**
 * WHO IS USING VIDVERGE — the single answer, for every app.
 *
 * Before this file each surface answered the question its own way, and the
 * answers disagreed in the one place it mattered: the credit wallet is keyed on
 * the verified EMAIL, while everything else was keyed on the `wses_…` session
 * id. A session id is a property of the tab. It rotates on a new sign-in, it
 * expires, and a second browser gets a different one — so a project started on
 * Monday was invisible on Tuesday and a long render's charge was refused with
 * "invalid workspace session" while the person sat there signed in.
 *
 * The rule this module exists to enforce:
 *
 *   IDENTITY IS THE EMAIL. The session id is a cache in front of it.
 *
 * Resolution order is platform first, app second — the Audos runtime's session
 * (published on `window.__spaceSessionId` and proved against the platform's own
 * check-session route) outranks anything this space wrote to localStorage, in
 * the draft preview and on the published site alike. The email gate is only
 * the fallback for a visitor the platform has not placed yet.
 *
 * Server side, the same rule is carried by naming the owner email on the wallet
 * call (see `vv-credits`), so a background tick with no visitor session at all
 * still bills the right person.
 */
import { useEffect, useState } from 'react';
import {
  ensureVerifiedCreditSession,
  getSessionId,
  getVerifiedSessionId,
  getWorkspaceToken,
  refreshWorkspaceSession,
  spaceId,
  workspaceTokenNow,
} from './workspace';
import { scopedSpaceSessionStorageKey } from './tenant-delegation-scope';

export type IdentitySource = 'platform' | 'email_gate' | 'guest' | 'anonymous';

export interface Identity {
  /** Canonical `wses_…` session, or '' when the platform has placed nobody. */
  sessionId: string;
  /** The verified address the wallet and every owned row are keyed on. */
  email: string;
  /** True only when the platform confirmed the person owns that address. */
  verified: boolean;
  /** Whether the runtime has injected the workspace DB token yet. */
  hasWorkspaceToken: boolean;
  source: IdentitySource;
}

const ANONYMOUS: Identity = {
  sessionId: '',
  email: '',
  verified: false,
  hasWorkspaceToken: false,
  source: 'anonymous',
};

/** The email this space last stored for the current session, if any. */
function storedEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(scopedSpaceSessionStorageKey(spaceId()));
    if (!raw) return '';
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const email = typeof stored.email === 'string' ? stored.email.trim().toLowerCase() : '';
    return email.includes('@') ? email : '';
  } catch {
    return '';
  }
}

/**
 * Whatever can be answered without a network call. Safe in a first render.
 * `verified` is false until `resolveIdentity()` has proved the session, so a
 * caller must never spend credits on the strength of this alone.
 */
export function identityNow(): Identity {
  if (typeof window === 'undefined') return ANONYMOUS;
  const sessionId = getSessionId();
  const verifiedSession = getVerifiedSessionId();
  const email = storedEmail();
  const source: IdentitySource = verifiedSession
    ? 'platform'
    : sessionId.startsWith('guest_')
      ? 'guest'
      : email
        ? 'email_gate'
        : 'anonymous';
  return {
    sessionId,
    email,
    verified: Boolean(verifiedSession && email),
    hasWorkspaceToken: Boolean(workspaceTokenNow()),
    source,
  };
}

/**
 * The authoritative answer. Proves the session against the platform, adopting a
 * session the runtime placed on this origin even when this space has never
 * written its own localStorage record — which is what makes a second browser,
 * a fresh device and the Audos draft preview all resolve to the same person.
 *
 * One recovery pass is built in: a stale saved session is re-proved, and only
 * if that also fails does the caller learn the visitor must sign in.
 */
export async function resolveIdentity(timeoutMs = 10_000): Promise<Identity> {
  if (typeof window === 'undefined') return ANONYMOUS;

  const hasWorkspaceToken = Boolean(await getWorkspaceToken(timeoutMs));
  let sessionId = await ensureVerifiedCreditSession();
  if (!sessionId) {
    await refreshWorkspaceSession();
    sessionId = await ensureVerifiedCreditSession();
  }

  if (!sessionId) {
    const fallback = identityNow();
    return { ...fallback, verified: false, hasWorkspaceToken };
  }
  return {
    sessionId,
    email: storedEmail(),
    verified: true,
    hasWorkspaceToken,
    source: 'platform',
  };
}

/**
 * The key every owned row should carry alongside its session id. Server
 * functions match on this first and fall back to the session, so ownership
 * survives a sign-out, a new device and an expired session.
 */
export async function ownerEmail(): Promise<string> {
  const identity = await resolveIdentity();
  return identity.verified ? identity.email : '';
}

/**
 * Why a paid action cannot proceed, in words that match what is actually
 * wrong. Returns null when nothing is wrong.
 *
 * Telling a signed-in Pro customer to "sign in with your email" when the real
 * fault was a server-side session replay is the failure this replaces.
 */
export function describeIdentityGap(identity: Identity): string | null {
  if (identity.verified) return null;
  if (!identity.sessionId) {
    return 'You are signed out. Sign in with your email to use credits.';
  }
  if (identity.sessionId.startsWith('guest_')) {
    return 'You are browsing as a guest. Sign in with your email so generations can be billed to your account.';
  }
  if (!identity.hasWorkspaceToken) {
    return 'This page has not finished loading your workspace credential. Wait a moment and retry — nothing was charged.';
  }
  return 'Your saved sign-in could not be confirmed with Audos. Refresh the page; if it keeps happening, sign in again.';
}

/** React binding. Resolves on mount and again whenever a session is adopted. */
export function useIdentity(): { identity: Identity; loading: boolean; refresh: () => void } {
  const [identity, setIdentity] = useState<Identity>(() => identityNow());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolve = () => {
      if (cancelled) return;
      setLoading(true);
      void resolveIdentity().then((next) => {
        if (cancelled) return;
        setIdentity(next);
        setLoading(false);
      });
    };

    resolve();
    window.addEventListener('audos:session-established', resolve as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('audos:session-established', resolve as EventListener);
    };
  }, []);

  return { identity, loading, refresh: () => void resolveIdentity().then(setIdentity) };
}
