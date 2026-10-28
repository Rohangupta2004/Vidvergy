/**
 * STAGE 6b — generateAssets.
 *
 * Walks the waves the visual plan produced. Inside a wave, beats run in
 * parallel because nothing in it depends on anything else in it. Between
 * waves, the pipeline WAITS — a match-cut beat has to see the frame it is
 * matching before it can be generated, and a blanket parallel fan-out is
 * exactly how a match cut turns into two unrelated shots that happen to be
 * adjacent.
 *
 * Every still follows the same paid path: resolve or generate a durable first
 * frame, persist it, then animate that exact frame with Gemini Omni Flash.
 * Workspace-owned footage remains reusable as-is. A failed animation leaves
 * the beat unresolved rather than silently rendering a static image.
 */

import type {
  AspectId,
  AssetIndex,
  EditorialTimeline,
  FacelessBeat,
  ResolvedAsset,
  VisualPlan,
} from '../types/editorial';
import { selectAssets, stampBeatId } from './selectAssets';
import { generateImageAsset, styleSuffixFrom } from './generateImage';
import { generateVideoAsset } from './generateVideo';
import { stillPromptFrom } from './createVisualPlan';
import { saveGeneratedAsset } from '../lib/filmStore';
import { aspectOf } from '../lib/facelessOptions';

/** Generations in flight at once. High enough to be quick, low enough not to trip the proxy rate limiter. */
const WAVE_CONCURRENCY = 4;

export interface GenerateAssetsInput {
  timeline: EditorialTimeline;
  visualPlan: VisualPlan;
  assetIndex: AssetIndex;
  /** Landscape unless the brief asked for portrait. Reaches every provider. */
  aspect?: AspectId;
  onNote?: (note: string) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface GenerateAssetsResult {
  resolved: Record<string, ResolvedAsset>;
  spend: number;
  unresolved: string[];
  notes: string[];
}

export async function generateAssets(input: GenerateAssetsInput): Promise<GenerateAssetsResult> {
  const { timeline, visualPlan, assetIndex } = input;
  const beats = new Map(timeline.beats.map((beat) => [beat.id, beat]));
  const styleSuffix = styleSuffixFrom(timeline.continuityGuide, input.aspect);

  const resolved: Record<string, ResolvedAsset> = {};
  const notes: string[] = [];
  const unresolved: string[] = [];
  let done = 0;
  const total = timeline.beats.length;

  for (let waveIndex = 0; waveIndex < visualPlan.waves.length; waveIndex += 1) {
    const wave = visualPlan.waves[waveIndex];
    if (waveIndex > 0) {
      input.onNote?.(`Wave ${waveIndex + 1}: ${wave.length} match-cut beat(s) waiting on the shot they align to…`);
    } else {
      input.onNote?.(`Sourcing ${wave.length} independent beats…`);
    }

    const queue = wave.slice();
    const workers = Array.from({ length: Math.min(WAVE_CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const beatId = queue.shift();
        if (!beatId) return;
        const beat = beats.get(beatId);
        if (!beat) return;

        const outcome = await resolveBeat(timeline.filmId, beat, assetIndex, styleSuffix, resolved, input.aspect);
        if (outcome.asset) resolved[beatId] = outcome.asset;
        else unresolved.push(beatId);
        if (outcome.note) notes.push(outcome.note);

        done += 1;
        input.onProgress?.(done, total);
      }
    });
    await Promise.all(workers);
  }

  return {
    resolved,
    spend: round2(Object.values(resolved).reduce((sum, asset) => sum + (asset.cost || 0), 0)),
    unresolved,
    notes,
  };
}

async function resolveBeat(
  filmId: string,
  beat: FacelessBeat,
  assetIndex: AssetIndex,
  styleSuffix: string,
  alreadyResolved: Record<string, ResolvedAsset>,
  aspect?: AspectId,
): Promise<{ asset: ResolvedAsset | null; note?: string }> {
  const beatSeconds = beat.narrationEnd - beat.narrationStart;
  const prompt = beat.assetDecision.generationPrompt || stillPromptFrom(undefined, beat.visualIntent);
  let seed: ResolvedAsset | null = null;

  // Reuse workspace-owned footage and stills before spending. Footage remains a
  // finished clip; a still is only a seed and never reaches Remotion directly.
  try {
    const selected = stampBeatId(await selectAssets({ beat, assetIndex, aspect }), beat.id);
    if (selected?.type === 'video') return { asset: selected };
    if (selected) seed = selected;
  } catch (error) {
    // A catalog failure is non-fatal: generation below still gives this beat a
    // durable first frame instead of falling back to stock video.
    console.warn(`[Faceless] owned asset lookup failed for beat ${beat.id}:`, error);
  }

  if (!seed) {
    try {
      const generated = await generateImageAsset(beat.id, prompt, {
        styleSuffix,
        aspectRatio: aspectOf(aspect).providerRatio,
      });
      seed = await persistGenerated(filmId, beat, generated, prompt);
    } catch (error) {
      return {
        asset: null,
        note: `Beat ${beat.id}: its seed still could not be generated (${short(error)}).`,
      };
    }
  }

  try {
    const reference = matchCutReference(beat, alreadyResolved);
    const clip = await generateVideoAsset(beat.id, beat.assetDecision.generationPrompt || beat.visualIntent, {
      durationSeconds: beatSeconds,
      styleSuffix,
      aspect,
      seedImageUrl: seed.url,
      referenceImageUrl: reference,
    });
    const resolved = {
      ...clip,
      seedImageUrl: seed.url,
      cost: (seed.cost || 0) + (clip.cost || 0),
    };
    return { asset: await persistGenerated(filmId, beat, resolved, prompt) };
  } catch (error) {
    return {
      asset: null,
      note: `Beat ${beat.id}: its saved still could not be animated (${short(error)}).`,
    };
  }
}

async function persistGenerated(
  filmId: string,
  beat: FacelessBeat,
  asset: ResolvedAsset,
  prompt: string,
): Promise<ResolvedAsset> {
  try {
    await saveGeneratedAsset({ filmId, beat, asset, prompt });
  } catch (error) {
    // The media itself is already paid for and usable. A catalog write failure
    // must not discard it or make the whole film fail.
    console.warn(`[Faceless] could not index generated asset for beat ${beat.id}:`, error);
  }
  return asset;
}

/**
 * The source beat's persisted seed frame, handed to the video model so both
 * halves of a match cut share geometry even though the resolved assets are
 * generated clips.
 */
function matchCutReference(beat: FacelessBeat, resolved: Record<string, ResolvedAsset>): string | undefined {
  const dependency = beat.assetDecision.matchCutDependencyBeatId;
  if (!dependency) return undefined;
  const source = resolved[dependency];
  return source?.seedImageUrl;
}

function short(error: unknown): string {
  return String((error as any)?.message || error || 'unknown error').slice(0, 140);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
