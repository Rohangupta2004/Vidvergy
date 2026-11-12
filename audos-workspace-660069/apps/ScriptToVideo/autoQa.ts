/**
 * Automatic quality guarantee for finished films.
 *
 * The browser measures the finished MP4 with the pipeline's own tools — real
 * duration, platform-extracted frames run through the flat/black frame check,
 * and decoded audio — and reports to the s2v-film-qa server function. The
 * server re-verifies (vision on its own frames, audio-track scan, end-of-film
 * probe) and only a confirmed failure refunds the film's credits through the
 * existing wallet refund. The result is saved on the film (plan.auto_qa), so a
 * film is checked once per finished cut.
 */
import { workspaceFetch, WORKSPACE_ID } from '../../lib/workspace';
import { callS2vHook } from './friendlyErrors';
import { probeClipAudio } from './pipeline/capture';
import { probeVideoDuration, validateFrameUrl } from './pipeline/frames';
import type { Film, FilmScene } from './api';

export interface AutoQaFinding { id: 'black' | 'audio' | 'cutoff'; status: 'pass' | 'fail' | 'unknown' | 'not_applicable'; detail: string; frames?: string[] }

export interface AutoQaRecord {
  version: 1;
  video_url: string;
  checked_at: string;
  status: 'passed' | 'failed' | 'inconclusive';
  findings: AutoQaFinding[];
  expected_s?: number;
  actual_s?: number;
  refund?: { status: string; credits: number } | null;
  summary: string;
}

/** The saved check for the film's CURRENT cut, or null when it has not run. */
export function autoQaFor(film: Film | null | undefined): AutoQaRecord | null {
  const record = (film?.plan as any)?.auto_qa as AutoQaRecord | undefined;
  if (!film?.final_video_url || !record || record.video_url !== film.final_video_url) return null;
  return record;
}

function sceneSeconds(scene: FilmScene): number {
  const trim = Number(((scene.spec as any)?.background || {}).trim_to_s) || 0;
  return trim > 0 ? trim : Number(scene.duration_s) || 0;
}

async function extractFrames(videoUrl: string, timestamps: number[]): Promise<Array<{ t: number; url: string }>> {
  const response = await workspaceFetch('/api/video/frames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, timestamps: timestamps.slice(0, 20), workspaceId: WORKSPACE_ID }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data?.frames)) return [];
  return data.frames
    .filter((f: any) => /^https:\/\//i.test(String(f?.url || '')))
    .map((f: any) => ({ t: Math.round(Number(f.timestamp) * 100) / 100, url: String(f.url) }));
}

export async function measureFinishedFilm(film: Film, scenes: FilmScene[]) {
  const videoUrl = String(film.final_video_url || '');
  const done = [...scenes].filter((s) => s.status === 'completed' && s.asset_url).sort((a, b) => a.idx - b.idx);
  const expected = done.reduce((sum, s) => sum + sceneSeconds(s), 0);
  const actual = await probeVideoDuration(videoUrl).catch(() => 0);
  const span = actual || expected;
  const stamps: number[] = [];
  let cursor = 0;
  done.forEach((s) => { const len = sceneSeconds(s); stamps.push(Math.round((cursor + len / 2) * 100) / 100); cursor += len; });
  [0.15, 0.5, 0.85].forEach((f) => stamps.push(Math.round(span * f * 100) / 100));
  const inside = Array.from(new Set(stamps)).filter((t) => t > 0.3 && t < Math.max(0.6, span - 0.4)).slice(0, 16);
  let frames: Array<{ t: number; flat: boolean; reason?: string }> = [];
  try {
    const extracted = await extractFrames(videoUrl, inside);
    frames = await Promise.all(extracted.map(async (frame) => {
      const check = await validateFrameUrl(frame.url);
      return { t: frame.t, flat: !check.ok && /flat|single-color|black/i.test(String(check.reason || '')), reason: check.ok ? undefined : check.reason };
    }));
  } catch { frames = []; }
  let audio: { measured: boolean; hasTrack?: boolean; audible?: boolean; rmsDb?: number | null } = { measured: false };
  try {
    const probe = await probeClipAudio(videoUrl);
    audio = { measured: true, hasTrack: probe.hasAudioTrack, audible: probe.audible, rmsDb: Number.isFinite(probe.rmsDb) ? probe.rmsDb : null };
  } catch { audio = { measured: false }; }
  return { duration: { expected: Math.round(expected * 100) / 100, actual: Math.round(actual * 100) / 100 }, frames, audio };
}

/** Measure, then let the server verify and settle. Returns the saved record. */
export async function runAutoQa(film: Film, scenes: FilmScene[], force = false): Promise<AutoQaRecord | null> {
  if (!film.final_video_url) return null;
  const checks = await measureFinishedFilm(film, scenes);
  const result = await callS2vHook<{ ok?: boolean; auto_qa?: AutoQaRecord; error?: string; code?: string }>('s2v-film-qa', {
    op: 'report',
    filmId: film.id,
    videoUrl: film.final_video_url,
    checks,
    ...(force ? { force: true } : {}),
  });
  if (result?.code === 'stale_video') return null;
  return result?.auto_qa || null;
}
