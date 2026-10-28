/**
 * MODEL PICKER POLICY — one place that decides which video models a project
 * may choose from and in what order, so the Create screen and the per-scene
 * model select can never disagree.
 *
 * Filtering is driven by the registry's own capability flag
 * (`VideoModelConfig.audioSupported`, which mirrors `nativeAudio` in
 * v2Contracts): a model that cannot deliver the audio the project needs is
 * HIDDEN, not greyed out. When the registry later marks a Kling route as
 * audio-capable it appears under every audio policy with no change here.
 *
 * Order is capability priority, not alphabetical: long-take Seedance first,
 * then Kling motion/identity routes, Gemini Omni, and live Runway options.
 * Auto scoring may reorder compatible models for the approved brief.
 */
import { VIDEO_MODEL, VideoModelConfig } from './pipeline/videoModelService';

/** Modern models only. Auto scoring may reorder these per script, but Gemini
 * Omni Flash remains the final automatic choice and is still selectable. */
export const PICKER_MODELS_BY_PRIORITY: VideoModelConfig[] = [VIDEO_MODEL];

/** Models offered for a project, highest priority first. */
export function pickerModels(needsNativeAudio: boolean): VideoModelConfig[] {
  return PICKER_MODELS_BY_PRIORITY.filter((model) => !needsNativeAudio || model.audioSupported === true);
}

export function pickerModelById(id: string): VideoModelConfig | undefined {
  return PICKER_MODELS_BY_PRIORITY.find((model) => model.id === id);
}
