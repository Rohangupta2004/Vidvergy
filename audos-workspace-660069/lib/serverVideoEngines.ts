/**
 * SERVER VIDEO ENGINES — Seedance 2.5 and Kling, submitted and read through
 * Vidverge's own server function (`stv-scene-generate`, ops `engine-submit`
 * and `engine-status`).
 *
 * Both providers bill the workspace that holds the credential. A browser on
 * the public site or in an Agent Store session can hold a token minted for a
 * different workspace, which the platform refuses. The server function goes
 * out on the runner's signed identity for this workspace instead, so the
 * founder wallet pays and the visitor's own token is never used for them.
 *
 * The visitor gate is unchanged: the hook needs a validated Vidverge session,
 * and it refuses to submit unless the vv-credits receipt for `creditKey`
 * exists (or the session is an owner/admin or an unlimited wallet). Charge the
 * clip with `chargeCredits` under the same key first, so it is priced by its
 * real engine and is not charged a second time.
 *
 * Operation ids returned here are the provider's raw ids, the same ones the
 * browser proxies return, so callers and Video Provider Lab can keep storing
 * and adopting them unchanged.
 */

import { callHook } from './workspace';

export type ServerVideoProvider = 'seedance' | 'kling';

const SERVER_FUNCTION = 'stv-scene-generate';
const SEEDANCE_25_OPERATION_PREFIX = 'openrouter_seedance25_';

function serverPrefix(provider: ServerVideoProvider): string {
  return provider === 'kling' ? 'kling:' : 'seedance:';
}

export function isSeedance25Model(model: string): boolean {
  const id = String(model || '').trim().toLowerCase();
  return id === 'seedance-2.5' || id === 'openrouter/bytedance/seedance-2.5';
}

/** The platform names every Seedance 2.5 operation with this prefix. */
export function isSeedance25Operation(operationId: string): boolean {
  return String(operationId || '').startsWith(SEEDANCE_25_OPERATION_PREFIX);
}

export type ServerVideoSubmit =
  | { ok: true; operationId: string; warning: string | null }
  | { ok: false; code: string; error: string; httpStatus?: number; data?: unknown };

/**
 * Submit one clip. A provider or credit refusal comes back as `ok: false`; a
 * failure to reach the server function itself throws (HookError, or the
 * signal's abort error).
 */
export async function submitServerVideo(
  provider: ServerVideoProvider,
  body: Record<string, unknown>,
  creditKey: string,
  signal?: AbortSignal,
): Promise<ServerVideoSubmit> {
  const data = await callHook<any>(SERVER_FUNCTION, {
    op: 'engine-submit',
    provider: provider === 'kling' ? 'kling' : 'openrouter',
    body,
    creditKey,
  }, { signal });
  const prefix = serverPrefix(provider);
  const operationId = typeof data?.operationId === 'string' ? data.operationId : '';
  if (data?.status === 'submitted' && operationId.startsWith(prefix) && operationId.length > prefix.length) {
    return { ok: true, operationId: operationId.slice(prefix.length), warning: data.warning ? String(data.warning) : null };
  }
  return {
    ok: false,
    code: String(data?.code || ''),
    error: String(data?.error || ''),
    httpStatus: Number(data?.httpStatus) || undefined,
    data: data?.data ?? undefined,
  };
}

export interface ServerVideoStatus {
  status: 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  progress?: number;
  /** On `processing`, a status read that did not answer cleanly. */
  error?: string;
}

/** Read one clip's status by its raw provider id. Throws only when the server function cannot be reached. */
export async function readServerVideoStatus(
  provider: ServerVideoProvider,
  operationId: string,
  signal?: AbortSignal,
): Promise<ServerVideoStatus> {
  const data = await callHook<any>(SERVER_FUNCTION, {
    op: 'engine-status',
    operationId: serverPrefix(provider) + operationId,
  }, { signal });
  const status = String(data?.status || '').toLowerCase();
  if (status === 'completed' && data?.videoUrl) return { status: 'completed', videoUrl: String(data.videoUrl), progress: 100 };
  if (status === 'failed') return { status: 'failed', error: String(data?.error || 'The render failed at the provider.') };
  return {
    status: 'processing',
    progress: Number(data?.progress) || undefined,
    ...(data?.error ? { error: String(data.error) } : {}),
  };
}
