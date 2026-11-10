import { callHook } from './workspace';

let sentAt = 0;
let sentThisMinute = 0;

function text(value: unknown, max: number): string {
  return String(value || '').replace(/(?:Bearer\s+|token["'=:\s]+)[A-Za-z0-9._-]+/gi, '[redacted]').replace(/(?:prompt|messages|input)\s*[:=][\s\S]*/gi, '[content removed]').slice(0, max);
}

export function reportClientError(error: unknown, app = 'shell', errorClass = 'client_error'): void {
  const now = Date.now();
  if (now - sentAt > 60000) { sentAt = now; sentThisMinute = 0; }
  if (sentThisMinute >= 10) return;
  sentThisMinute += 1;
  const value = error instanceof Error ? error : new Error(text(error, 800));
  void callHook('vv-client-errors', {
    app: text(app, 80),
    errorClass: text(errorClass, 80),
    message: text(value.message, 800),
    stack: text(value.stack, 3000),
    path: typeof location === 'undefined' ? '' : location.pathname,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  }).catch(() => undefined);
}

export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => reportClientError(event.error || event.message, 'shell', 'window_error');
  const onRejection = (event: PromiseRejectionEvent) => reportClientError(event.reason, 'shell', 'unhandled_rejection');
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}
