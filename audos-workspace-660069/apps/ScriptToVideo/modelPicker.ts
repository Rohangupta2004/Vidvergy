import {
  KLING_2_5_TURBO, KLING_2_6, KLING_3_0, KLING_3_0_OMNI,
  SEEDANCE_2_5, VIDEO_MODEL, VideoModelConfig,
} from './pipeline/videoModelService';
import { workspaceFetch } from '../../lib/workspace';

export interface PickerAvailability {
  ready: boolean;
  reason: string;
  checkedAt: number;
}

export type PickerAvailabilityMap = Record<string, PickerAvailability>;

/** Auto and manual selection may use only models that are actually enabled. */
export const PICKER_MODELS_BY_PRIORITY: VideoModelConfig[] = [VIDEO_MODEL];
/** The chooser also shows disabled providers with the exact reason. */
export const PICKER_DISPLAY_MODELS: VideoModelConfig[] = [
  VIDEO_MODEL, SEEDANCE_2_5, KLING_3_0_OMNI, KLING_3_0, KLING_2_6, KLING_2_5_TURBO,
];

const CACHE_KEY = 's2v:model-availability:v4';
const CACHE_MS = 10 * 60_000;
let memoryCache: PickerAvailabilityMap | null = null;

function baseAvailability(): PickerAvailabilityMap {
  const now = Date.now();
  return {
    [VIDEO_MODEL.id]: { ready: true, reason: 'On — 4–8 seconds with native sound.', checkedAt: now },
    [SEEDANCE_2_5.id]: { ready: false, reason: 'Off — provider budget reached. Founder can test again from Advanced.', checkedAt: now },
    [KLING_3_0_OMNI.id]: { ready: false, reason: 'Off — no sound on this route yet.', checkedAt: now },
    [KLING_3_0.id]: { ready: false, reason: 'Off — no sound on this route yet.', checkedAt: now },
    [KLING_2_6.id]: { ready: false, reason: 'Off — no sound on this route yet.', checkedAt: now },
    [KLING_2_5_TURBO.id]: { ready: false, reason: 'Off — no sound on this route yet.', checkedAt: now },
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
  try {
    const response = await workspaceFetch('/api/generate/kling/models', { method: 'GET' });
    const data = await response.json().catch(() => null);
    const models = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
    for (const config of [KLING_3_0_OMNI, KLING_3_0, KLING_2_6, KLING_2_5_TURBO]) {
      const catalog = models.find((item: any) => [item?.id, item?.model, item?.appModel].map(String).includes(config.id));
      const durations = (Array.isArray(catalog?.supportedDurations) ? catalog.supportedDurations : Array.isArray(catalog?.durations) ? catalog.durations : []).map(Number);
      const capabilityList = Array.isArray(catalog?.capabilities) ? catalog.capabilities.map(String) : [];
      const nativeAudio = catalog?.nativeAudio === true || catalog?.audio === true || catalog?.capabilities?.nativeAudio === true || capabilityList.includes('native-audio');
      const has15 = durations.includes(15) || Number(catalog?.maxDuration) >= 15;
      if (nativeAudio && has15) {
        const legal = durations.length ? durations.filter((value) => value >= 3 && value <= 15).sort((a, b) => a - b) : Array.from({ length: 13 }, (_, index) => index + 3);
        config.audioSupported = true;
        config.supportedDurations = legal;
        config.minDuration = legal[0] || 3;
        config.safeMaxDuration = legal[legal.length - 1] || 15;
        config.discreteDurations = false;
        if (!PICKER_MODELS_BY_PRIORITY.some((model) => model.id === config.id)) PICKER_MODELS_BY_PRIORITY.push(config);
        state[config.id] = { ready: true, reason: 'On — live catalog reports native sound and durations through 15 seconds.', checkedAt: Date.now() };
      } else state[config.id] = { ready: false, reason: nativeAudio ? 'Off — 15-second clips are not exposed on this route yet.' : 'Off — no sound on this route yet.', checkedAt: Date.now() };
    }
  } catch (error: any) {
    for (const model of [KLING_3_0_OMNI, KLING_3_0, KLING_2_6, KLING_2_5_TURBO]) state[model.id] = { ready: false, reason: `Off — availability check failed: ${String(error?.message || error)}`, checkedAt: Date.now() };
  }
  memoryCache = state;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch {}
  return state;
}

export function pickerModels(needsNativeAudio: boolean): VideoModelConfig[] {
  return PICKER_MODELS_BY_PRIORITY.filter((model) => !needsNativeAudio || model.audioSupported === true);
}

export function pickerDisplayModels(): VideoModelConfig[] { return PICKER_DISPLAY_MODELS; }
export function pickerModelById(id: string): VideoModelConfig | undefined { return PICKER_DISPLAY_MODELS.find((model) => model.id === id); }
