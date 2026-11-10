/**
 * Omni Flash chunk planning — pure maths, no network.
 *
 * Omni Flash only accepts input clips up to OMNI_MAX_CHUNK_S long, so a span is
 * cut into windows that each share OMNI_OVERLAP_S with the next one. The stitch
 * crossfades across exactly that overlap, which keeps the stitched timeline the
 * same length as the source and the original audio in sync.
 */
import { OMNI_MAX_CHUNK_S, OMNI_MIN_CHUNK_S, OMNI_OVERLAP_S } from './agentConfig';

export interface ChunkWindow { index: number; start: number; end: number }

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function planChunks(spanStart: number, spanEnd: number, sourceDuration: number): ChunkWindow[] {
  const total = Math.max(0, Number(sourceDuration) || 0);
  const start = Math.max(0, Math.min(total, Number(spanStart) || 0));
  const end = Math.max(start, Math.min(total, Number(spanEnd) || total));
  if (end - start < 0.1) return [];
  const max = Math.max(OMNI_MIN_CHUNK_S + OMNI_OVERLAP_S, OMNI_MAX_CHUNK_S);
  const out: ChunkWindow[] = [];
  let cursor = start;
  while (cursor < end - 0.05 && out.length < 400) {
    const windowEnd = Math.min(end, cursor + max);
    out.push({ index: out.length, start: r3(cursor), end: r3(windowEnd) });
    if (windowEnd >= end) break;
    cursor = windowEnd - OMNI_OVERLAP_S;
  }
  // A sliver at the end is widened backwards (more overlap) rather than sent alone.
  const last = out[out.length - 1];
  if (last && out.length > 1 && last.end - last.start < OMNI_MIN_CHUNK_S) {
    last.start = r3(Math.max(start, last.end - OMNI_MIN_CHUNK_S));
  }
  // A whole span shorter than the minimum is widened into its surroundings.
  if (out.length === 1 && out[0].end - out[0].start < OMNI_MIN_CHUNK_S) {
    const missing = OMNI_MIN_CHUNK_S - (out[0].end - out[0].start);
    out[0].start = r3(Math.max(0, out[0].start - missing / 2));
    out[0].end = r3(Math.min(total, out[0].start + OMNI_MIN_CHUNK_S));
  }
  return out;
}

/** Seconds of overlap between chunk i-1 and chunk i (0 for the first). */
export function overlapBefore(chunks: { start: number; end: number }[], index: number): number {
  if (index <= 0) return 0;
  return Math.max(0, chunks[index - 1].end - chunks[index].start);
}

export function omniAspect(width: number, height: number): '16:9' | '9:16' {
  return width && height && width < height ? '9:16' : '16:9';
}

const PRESERVE = 'Preserve the same people, faces, body motion, timing, camera move and framing exactly. No on-screen text, captions, logos or watermarks.';

export function omniPrompt(type: string, p: Record<string, any>, chunk: { index: number; total: number }): string {
  const continuity = chunk.total > 1
    ? ` This is segment ${chunk.index + 1} of ${chunk.total} of one continuous shot: keep the look identical to the other segments.`
    : '';
  let core: string;
  switch (type) {
    case 'remove_bg':
      if (p.mode === 'colour') core = `Replace the entire background behind the subject with a flat, evenly lit solid colour backdrop (${p.colour}). Keep the subject perfectly intact with clean edges.`;
      else if (p.mode === 'image') core = 'Replace the entire background behind the subject with the scene shown in the reference image. Match its lighting on the subject. Keep the subject perfectly intact.';
      else core = `Replace the entire background behind the subject with ${p.prompt}. Keep the subject perfectly intact and match the lighting.`;
      break;
    case 'replace_bg':
      core = `Replace only the background with this scene: ${p.prompt}. Keep the subject perfectly intact, lit to match the new scene.`;
      break;
    case 'isolate':
      core = p.backdrop === 'blur'
        ? `Keep ${p.subject} sharp and heavily blur everything else into a soft, dark bokeh.`
        : `Keep only ${p.subject}. Replace everything else with a plain, solid ${p.backdrop} background with clean edges.`;
      break;
    case 'restyle':
      core = `Restyle the whole clip as: ${p.prompt}.`;
      break;
    default:
      core = `${p.prompt}. Change only that.`;
  }
  return `${core} ${PRESERVE}${continuity}`.slice(0, 1800);
}
