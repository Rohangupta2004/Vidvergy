import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.1';

const VERSION = '0.12.10';
const LOAD_TIMEOUT_MS = 45_000;
const JOB_TIMEOUT_MS = 6 * 60_000;
const CDNS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
] as const;

let instance: any = null;
let loading: Promise<any> | null = null;
let queue: Promise<void> = Promise.resolve();

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function canUseThreads(): boolean {
  return typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
}

async function destroy(): Promise<void> {
  const current = instance;
  instance = null;
  loading = null;
  try { current?.terminate?.(); } catch { /* already stopped */ }
}

async function loadFresh(): Promise<any> {
  const attempts: string[] = [];
  const variants = canUseThreads() ? ['@ffmpeg/core-mt', '@ffmpeg/core'] : ['@ffmpeg/core'];
  for (const pkg of variants) {
    for (const cdn of CDNS) {
      const base = `${cdn}/${pkg}@${VERSION}/dist/esm`;
      const wrapperWorker = `${cdn}/@ffmpeg/ffmpeg@${VERSION}/dist/esm/worker.js`;
      const ff = new FFmpeg();
      const classWorkerURL = URL.createObjectURL(new Blob([`import "${wrapperWorker}";`], { type: 'text/javascript' }));
      try {
        const config: Record<string, string> = {
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
          classWorkerURL,
        };
        if (pkg.endsWith('core-mt')) config.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript');
        await timeout(ff.load(config as any), LOAD_TIMEOUT_MS, `FFmpeg ${pkg} load from ${cdn}`);
        instance = ff;
        return ff;
      } catch (error) {
        attempts.push(`${pkg} via ${cdn}: ${String((error as any)?.message || error).slice(0, 160)}`);
        try { ff.terminate(); } catch { /* failed load */ }
      } finally {
        URL.revokeObjectURL(classWorkerURL);
      }
    }
  }
  throw new Error(`FFmpeg could not start. ${attempts.join(' | ')}`);
}

export async function getSharedFFmpeg(): Promise<any> {
  if (instance) return instance;
  if (!loading) loading = loadFresh().catch((error) => { loading = null; throw error; });
  return loading;
}

export async function deleteFfmpegFiles(ff: any, names: Iterable<string>): Promise<void> {
  for (const name of new Set(names)) {
    if (!name) continue;
    try { await ff.deleteFile(name); } catch { /* missing or runtime was reloaded */ }
  }
}

export interface FfmpegJobOptions {
  timeoutMs?: number;
  onLog?: (line: string) => void;
  cleanup?: Iterable<string>;
  label?: string;
}

/** Serialize every browser FFmpeg job, reload after a failure, and retry once. */
export function runFfmpegJob<T>(job: (ff: any) => Promise<T>, options: FfmpegJobOptions = {}): Promise<T> {
  const run = async (): Promise<T> => {
    let firstError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ff = await getSharedFFmpeg();
      const listener = ({ message }: any) => { try { options.onLog?.(String(message || '')); } catch { /* UI only */ } };
      if (options.onLog) ff.on('log', listener);
      try {
        return await timeout(job(ff), options.timeoutMs || JOB_TIMEOUT_MS, options.label || 'FFmpeg job');
      } catch (error) {
        if (attempt === 0) firstError = error;
        await destroy();
        if (attempt === 1) {
          throw new Error(`${options.label || 'FFmpeg job'} failed after one clean reload: ${String((error as any)?.message || error)}${firstError ? ` (first attempt: ${String((firstError as any)?.message || firstError)})` : ''}`);
        }
      } finally {
        if (options.onLog) { try { ff.off('log', listener); } catch { /* older wrapper */ } }
        await deleteFfmpegFiles(ff, options.cleanup || []);
      }
    }
    throw new Error(`${options.label || 'FFmpeg job'} failed.`);
  };
  const result = queue.then(run, run);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

export async function resetSharedFFmpeg(): Promise<void> {
  await destroy();
}
