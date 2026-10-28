/**
 * STAGE 6a — selectAssets.
 *
 * Tiers 1 and 3 only. Existing workspace footage remains the free first
 * choice. Existing stills are returned as seed frames; generateAssets animates
 * them before Remotion sees the beat. No stock-video provider is queried.
 *
 * Returns null when nothing suitable exists, which is the signal that the beat
 * falls through to generateAssets. Returning a nearly-right clip to save a
 * nickel is the wrong trade and this stage does not make it: the match
 * threshold in queryAssetIndex is deliberately strict.
 */

import type {
  AspectId,
  AssetIndex,
  FacelessBeat,
  ResolvedAsset,
} from '../types/editorial';
import { queryAssetIndex } from './buildAssetIndex';
import { stockQueryFrom } from './searchBroll';

export interface SelectAssetsInput {
  beat: FacelessBeat;
  assetIndex: AssetIndex;
  /** Retained for call-site compatibility; owned assets are orientation-agnostic. */
  aspect?: AspectId;
}

/**
 * The brief types this as returning an AssetDecision; what the pipeline needs
 * downstream is the resolved media, so it returns the decision's outcome — a
 * ResolvedAsset — or null. The beat's AssetDecision is unchanged and remains
 * the record of why this tier was chosen.
 */
export async function selectAssets(input: SelectAssetsInput): Promise<ResolvedAsset | null> {
  const { beat, assetIndex } = input;
  const beatDuration = beat.narrationEnd - beat.narrationStart;
  const query = stockQueryFrom(beat.assetDecision.searchQuery, beat.visualIntent);

  // Tier 1 — footage this workspace already owns.
  const ownedFootage = queryAssetIndex(assetIndex, query, { kinds: ['video'] });
  if (ownedFootage.length) {
    const best = ownedFootage[0].asset;
    return {
      beatId: beat.id,
      tier: 1,
      url: best.url,
      duration: best.durationSeconds || beatDuration,
      type: 'video',
      cost: 0,
      provider: best.source,
      width: best.width,
      height: best.height,
    };
  }

  // Tier 3 before Tier 2 when the beat wants a UI screenshot: a real capture
  // of the real product always beats a stock photograph of a laptop.
  const wantsUi = beat.visualType === 'ui_screenshot';
  if (wantsUi) {
    const screenshot = pickStill(assetIndex, query, ['screenshot', 'image', 'graphic']);
    if (screenshot) return screenshot;
  }

  // Tier 3 — any existing still that matches.
  if (!wantsUi) {
    const still = pickStill(assetIndex, query, ['image', 'screenshot', 'graphic']);
    if (still) return still;
  }

  return null;
}

function pickStill(
  assetIndex: AssetIndex,
  query: string,
  kinds: ('image' | 'screenshot' | 'graphic')[],
): ResolvedAsset | null {
  const matches = queryAssetIndex(assetIndex, query, { kinds });
  if (!matches.length) return null;
  const best = matches[0].asset;
  return {
    beatId: '',
    tier: 3,
    url: best.url,
    duration: 0,
    type: best.kind === 'graphic' ? 'graphic' : 'image',
    cost: 0,
    provider: best.source,
    width: best.width,
    height: best.height,
  };
}

/** selectAssets returns stills without a beat id; the caller stamps it. */
export function stampBeatId(asset: ResolvedAsset | null, beatId: string): ResolvedAsset | null {
  return asset ? { ...asset, beatId } : null;
}
