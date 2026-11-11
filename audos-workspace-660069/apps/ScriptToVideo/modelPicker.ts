import {
  KLING_3_0, KLING_3_0_OMNI, SEEDANCE_2_5, VIDEO_MODEL, VideoModelConfig,
} from './pipeline/videoModelService';
import { engineHealthWarning } from '../../lib/videoEngines';
import { NEEDS_TAB_NOTE, RUNNER_MODEL_IDS } from './runnerModels';

export interface PickerAvailability {
  ready: boolean;
  reason: string;
  /**
   * What the last paid sweep found wrong with this engine, when it found
   * anything — empty for an engine with a clean record.
   *
   * It is deliberately NOT `ready: false`. Greying the card out would take the
   * manual model switch away, which is the one thing a creator can act on when
   * an engine misbehaves; and a frozen verdict outlives the outage that caused
   * it. So the engine stays pickable and the card says what it is risking,
   * which is also why the pipeline carries its own automatic fallback: pick a
   * refused engine and the block still lands, on the verified one.
   */
  caution: string;
  checkedAt: number;
}

export type PickerAvailabilityMap = Record<string, PickerAvailability>;

/** The selectable engines, recommended first: Kling 3.0 (best value), then
 * Gemini Omni and the two retained alternates. */
export const PICKER_MODELS_BY_PRIORITY: VideoModelConfig[] = [KLING_3_0, VIDEO_MODEL, SEEDANCE_2_5, KLING_3_0_OMNI];
export const PICKER_DISPLAY_MODELS: VideoModelConfig[] = [...PICKER_MODELS_BY_PRIORITY];

// v6 adds `caution`. A v5 entry cached in a returning browser has no such
// field, and reusing it would silently hide the engine-health warning.
// v7 adds Kling 3.0; a cached v6 map has no entry for it.
// v8 adds the needs-this-tab-open caution for models the runner cannot run.
const CACHE_KEY = 's2v:model-availability:v8';
const CACHE_MS = 10 * 60_000;
let memoryCache: PickerAvailabilityMap | null = null;

function baseAvailability(): PickerAvailabilityMap {
  const now = Date.now();
  const entry = (model: VideoModelConfig, reason: string): PickerAvailability => ({
    ready: true,
    reason,
    // Read from the shared engine-health record rather than restated here, so
    // the picker cannot keep advertising an engine the last sweep caught
    // failing — which is how a film ended up locked to a model whose provider
    // key was over its spending limit.
    caution: [RUNNER_MODEL_IDS.has(model.id) ? '' : NEEDS_TAB_NOTE, engineHealthWarning(model.apiModel) || ''].filter(Boolean).join(' '),
    checkedAt: now,
  });
  return {
    [KLING_3_0.id]: entry(KLING_3_0, 'Recommended — best value: 5s or 10s clips with strong motion and one reference. Silent, so spoken lines need a model with native sound.'),
    [VIDEO_MODEL.id]: entry(VIDEO_MODEL, 'Default — 4–8 seconds with native sound and up to 10 references.'),
    [SEEDANCE_2_5.id]: entry(SEEDANCE_2_5, 'Selectable — 4–30 seconds with optional sound and up to 3 asset references.'),
    [KLING_3_0_OMNI.id]: entry(KLING_3_0_OMNI, 'Selectable — 5s or 10s clips with strong motion and up to 4 references.'),
  };
}

function readCache(): PickerAvailabilityMap | null {
  if (memoryCache && Date.now() - (memoryCache[VIDEO_MODEL.id]?.checkedAt || 0) < CACHE_MS) return memoryCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as PickerAvailabilityMap | null;
    if (parsed && Date.now() - (parsed[VIDEO_MODEL.id]?.checkedAt || 0) < CACHE_MS) return (memoryCache = parsed);
  } catch {}
  return null;
}

export async function checkPickerAvailability(force = false): Promise<PickerAvailabilityMap> {
  if (!force) { const cached = readCache(); if (cached) return cached; }
  const state = baseAvailability();
  memoryCache = state;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch {}
  return state;
}

export function pickerModels(needsNativeAudio: boolean): VideoModelConfig[] {
  return PICKER_MODELS_BY_PRIORITY.filter((model) => !needsNativeAudio || model.audioSupported === true);
}

export function pickerDisplayModels(): VideoModelConfig[] { return PICKER_DISPLAY_MODELS; }
export function pickerModelById(id: string): VideoModelConfig | undefined { return PICKER_DISPLAY_MODELS.find((model) => model.id === id); }
