/**
 * ORCHESTRATOR — the explicit state machine of the sequential Script-to-Video
 * pipeline (Sep 2026 rebuild).
 *
 *   SCRIPT_RECEIVED → ANALYZING_SCRIPT → SEGMENTING_SCRIPT → PREPARING_SCENE
 *   → PROMPT_READY → (auto-generate, or a click) → GENERATING_VIDEO → VIDEO_COMPLETED
 *   → EXTRACTING_FINAL_FRAME → FRAME_READY → DETERMINE_NEXT_REFERENCE
 *   → PREPARE_NEXT_SCENE → PROMPT_READY → …
 *   → ALL_SCENES_COMPLETED → FFMPEG_ASSEMBLY → FINAL_VIDEO
 *
 * Core rules enforced here:
 * - Opus understands the WHOLE story first (one segmentation pass), then
 *   prepares exactly ONE clip prompt at a time.
 * - Prompt preparation and video generation are SEPARATE operations — each
 *   generation is triggered from PROMPT_READY, by auto-generate or by a click,
 *   and dependent clips are never generated simultaneously.
 * - The frame stage cannot hang: every step of it is bounded, and a film found
 *   stranded at EXTRACTING_FINAL_FRAME is recovered from the clip that already
 *   rendered rather than re-rendered.
 * - After every clip: read the REAL duration from media metadata, extract and
 *   validate the final frame with FFmpeg, then require the NEXT scene to use
 *   that frame first unless the creator explicitly records a no-frame choice.
 * - A failed scene never loses completed scenes and never restarts the film:
 *   retry / regenerate-prompt / character-reference-fallback / skip act on
 *   that one scene only.
 *
 * Every step persists to WorkspaceDB, so a reload resumes instead of restarting.
 */

import {
  Aspect, AtReference, Film, FilmAudio, FilmCharacter, FilmCharacterProfile, FilmScene, MAX_OPERATION_ID_CHARS,
  MachineState, OnScreenTextItem, ParsedScene, PlanScene, ReferenceAsset, ReferenceType,
  SceneDialogue, VideoClipSpec, db, generateOpenAiImage, newSceneKey, uploadDataUrl,
  resolveAtMentions, sceneFingerprint, S2V_IMAGE_EDIT_MODEL, S2V_IMAGE_MODEL,
} from '../api';
import {
  buildManualScenePrompt, fitDurationsToTotal, manualSceneNegative, manualSceneSegment, parseManualScript,
} from '../manualScript';
import { characterSheetStyle, filmStyleText, videoStyleBans } from '../styleGuard';
import { defaultMustNot, slowMotionRequested } from './shotPromptSpec';
import {
  analyzeScriptCast, askGptVisionJson, askOpusJson, characterPortraitBrief, extractStyleFingerprint, extractVisualAttributes,
  prepareScenePrompt, segmentScript, validateScene,
} from './opus';
import {
  VideoModelService, appendTechnicalDetails, capText, publicPartOf, resolveDuration, resolveVideoModel,
} from './videoModelService';
import type { VideoModelConfig } from './videoModelService';
import {
  TRANSIENT_ATTEMPTS, canTryAnotherModel, fallbackChain, isBadRequest,
  isTransientProviderFailure, rephraseVideoPrompt, transientBackoffMs,
} from './resilience';
import { extractFinalFrame, probeVideoDuration, validateFrameUrl } from './frames';
import { extractFrame as canvasExtractFrame } from './capture';
import { assembleFilm, buildCaptionAss, interruptAssembly } from './assemble';
import type { CaptionCue, CaptionStyle } from './assemble';
import { FinishSettings, buildCaptions, listVoices, prepareFinish } from './finish';
import {
  AudioLayer, AudioLayerError, MAX_SCENE_EXTENSION_S, audioPlanCurrent,
  audioReady, audioScenes, ensureAudioPlan, generateMusicAudio,
  generateNarrationAudio, generateSfxAudio, isSpokenSource, musicReady,
  narrationReady, persistSceneNarration, sfxReady, skipMusicLayer,
  skipNarrationLayer, skipSfxLayer, withMusicPreset, withVoiceSource,
} from './audio';
import type { VoiceSourceId } from './voiceSource';
import {
  S2V_CAPABILITY_REGISTRY_VERSION, S2V_VIDEO_CAPABILITIES,
  buildLongFormSections,
} from '../v2Contracts';
import type { AudioPolicy, CodeMotionEngine, ControlMode, EntryType, ExecutionMode, VideoStyleId } from '../v2Contracts';
import { createHyperframesMotion } from '../../../lib/hyperframes';
import { splitSegmentForModel } from '../../../lib/videoEngines';
import { workspaceFetch } from '../../../lib/workspace';
import { refundCreditsStrict } from '../../../lib/credits';

export interface RunHooks {
  onFilm?: (patch: Partial<Film>) => void;
  onScene?: (sceneId: number, patch: Partial<FilmScene>) => void;
  onNote?: (note: string) => void;
  /** Live Final Assembly progress (steps + percent). Never faked — driven by
   * the real layer states and FFmpeg's own progress callbacks. */
  onAssembly?: (progress: AssemblyProgress) => void;
}

const say = (hooks: RunHooks, note: string) => { try { hooks.onNote?.(note); } catch { /* UI only */ } };

async function patchFilm(film: Film, hooks: RunHooks, patch: Partial<Film>): Promise<void> {
  Object.assign(film, patch);
  try { hooks.onFilm?.(patch); } catch { /* UI only */ }
  await db.updateFilm(film.id, patch);
}

async function patchScene(scene: FilmScene, hooks: RunHooks, patch: Partial<FilmScene>): Promise<void> {
  Object.assign(scene, patch);
  try { hooks.onScene?.(scene.id, patch); } catch { /* UI only */ }
  await db.updateScene(scene.id, patch);
}

async function setState(film: Film, hooks: RunHooks, state: MachineState, note?: string): Promise<void> {
  await patchFilm(film, hooks, { machine_state: state, ...(note ? { stage_note: note } : {}) });
  if (note) say(hooks, note);
}

// ---------------------------------------------------------------------------
// Stall protection for the frame stage
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.round(ms))));
}

/** The frame stage runs entirely in the browser (FFmpeg.wasm, <video> decode,
 * upload) and none of those steps time out on their own, so a wedged decode
 * used to strand a film at EXTRACTING_FINAL_FRAME forever. The clip itself has
 * already rendered and is stored by then, so every step of the stage is now
 * bounded and a blown budget degrades to "no keyframe" instead of hanging. */
export const FRAME_EXTRACTION_TIMEOUT_MS = 5 * 60 * 1000;
/** How long a film may sit in EXTRACTING_FINAL_FRAME before it counts as stalled. */
export const FRAME_STALL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 90_000;
const DIRECTOR_TIMEOUT_MS = 120_000;
/** A recovery pass re-reads a clip that already exists, so it degrades fast
 * rather than spending the full budget a second time. */
const RECOVERY_FRAME_TIMEOUT_MS = 90_000;

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not finish within ${Math.round(ms / 1000)}s.`)), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Milliseconds since the film row was last written. An unreadable timestamp
 * reads as "just updated", so nothing is ever recovered on a guess. */
export function msSinceFilmUpdate(film: Film): number {
  const at = Date.parse(String(film.updated_at || ''));
  return Number.isFinite(at) ? Math.max(0, Date.now() - at) : 0;
}

/** The scene whose clip landed but whose frame stage never finished. */
export function stalledFrameScene(scenes: FilmScene[]): FilmScene | null {
  return orderedScenes(scenes).find((s) => s.status === 'generating' && !!s.asset_url && !s.keyframe_url) || null;
}

/** True when the film has been sitting in the frame stage past the budget with
 * a rendered clip and nothing to show for it. */
export function isFrameExtractionStalled(film: Film, scenes: FilmScene[], stalledForMs: number): boolean {
  if (film.machine_state !== 'EXTRACTING_FINAL_FRAME') return false;
  if (stalledForMs < FRAME_STALL_MS) return false;
  return !!stalledFrameScene(scenes);
}

// ---------------------------------------------------------------------------
// Scene selection helpers
// ---------------------------------------------------------------------------

const DONE = new Set(['completed', 'skipped']);

export function orderedScenes(scenes: FilmScene[]): FilmScene[] {
  return [...scenes].sort((a, b) => a.idx - b.idx);
}

/** The scene currently in play: the first (by order) not completed/skipped. */
export function activeScene(scenes: FilmScene[]): FilmScene | null {
  return orderedScenes(scenes).find((s) => !DONE.has(String(s.status))) || null;
}

/** The nearest COMPLETED earlier scene — retained for legacy lookups. */
export function previousCompletedScene(scenes: FilmScene[], beforeIdx: number): FilmScene | null {
  return orderedScenes(scenes).filter((s) => s.idx < beforeIdx && s.status === 'completed' && s.asset_url).pop() || null;
}

/** Continuity is never allowed to jump over a failed or unfinished scene. */
export function immediatePreviousScene(scenes: FilmScene[], beforeIdx: number): FilmScene | null {
  return orderedScenes(scenes).find((s) => s.idx === beforeIdx - 1) || null;
}

function frameExtractionOf(scene: FilmScene | null | undefined): NonNullable<VideoClipSpec['background']>['frame_extraction'] | undefined {
  return ((scene?.spec || {}) as VideoClipSpec).background?.frame_extraction;
}

function onScreenCharacterReferences(film: Film, scene: FilmScene): ReferenceAsset[] {
  const spec = (scene.spec || {}) as VideoClipSpec;
  const profiles = (Array.isArray(film.plan?.characters) ? film.plan!.characters! : []).filter((profile) => profile.kind !== 'narrator');
  const explicit = Array.isArray(spec.characters) ? spec.characters.map(String) : [];
  const sourceText = `${scene.script_segment || ''} ${scene.dialogue?.speaker || ''} ${scene.dialogue?.line || ''}`.toLowerCase();
  const named = profiles.filter((profile) => [profile.id, profile.name].some((value) => sourceText.includes(String(value || '').toLowerCase()))).map((profile) => String(profile.id));
  const ids = Array.from(new Set([...explicit, ...named]));
  if (!ids.length && scene.dialogue?.speaker) {
    const speaker = String(scene.dialogue.speaker).trim().toLowerCase();
    const matchedSpeaker = profiles.find((profile) => [profile.id, profile.name].some((value) => String(value || '').trim().toLowerCase() === speaker));
    if (matchedSpeaker) ids.push(String(matchedSpeaker.id));
  }
  const cast = (Array.isArray(film.character_refs) ? film.character_refs : []).filter((character) => character.kind !== 'narrator');
  const seen = new Set<string>();
  const out: ReferenceAsset[] = [];
  for (const id of ids) {
    const character = cast.find((item) => String(item.id) === id && isHttpUrl(item.url));
    if (!character || seen.has(id)) continue;
    seen.add(id);
    out.push({ role: 'reference', url: String(character.url), type: 'character', label: character.name || id, characterId: id, priority: character.kind === 'main' ? 550 : 500, critical: true });
  }
  return out;
}

function supportingSceneReferences(film: Film): ReferenceAsset[] {
  const out: ReferenceAsset[] = [];
  if (isHttpUrl(film.product_screenshot_url)) out.push({ role: 'reference', url: String(film.product_screenshot_url), type: 'product', label: 'Product', priority: 400 });
  for (const ref of Array.isArray(film.at_references) ? film.at_references : []) {
    if (!isHttpUrl(ref?.url) || ref.type === 'character') continue;
    const type = ref.type === 'location' ? 'environment' : 'style';
    out.push({ role: 'reference', url: ref.url, type, label: `@${ref.name}`, priority: type === 'environment' ? 300 : 200 });
  }
  const first = Array.isArray(film.plan?.scenes) ? film.plan!.scenes.find((scene) => scene.idx === 0) : null;
  const styleAnchor = String((first?.spec as VideoClipSpec | undefined)?.storyboard_url || '');
  if (isHttpUrl(styleAnchor) && !out.some((asset) => asset.url === styleAnchor)) out.push({ role: 'reference', url: styleAnchor, type: 'style', label: 'Block 1 style anchor', priority: 100 });
  return out;
}

function sceneCharacterPromptNote(film: Film, scene: FilmScene): string {
  const ids = Array.isArray(((scene.spec || {}) as VideoClipSpec).characters)
    ? (((scene.spec || {}) as VideoClipSpec).characters || []).map(String)
    : [];
  const cast = (Array.isArray(film.character_refs) ? film.character_refs : []).filter((character) => character.kind !== 'narrator');
  const lines = ids.map((id) => cast.find((item) => String(item.id) === id)).filter(Boolean).map((character) =>
    `${character!.name}: ${[character!.appearance, character!.wardrobe ? `wardrobe ${character!.wardrobe}` : ''].filter(Boolean).join('; ')}`,
  );
  return lines.length ? `ON-SCREEN CHARACTERS — keep each visible in the frame position stated by this scene: ${lines.join(' | ')}` : '';
}

export function allScenesDone(scenes: FilmScene[]): boolean {
  return scenes.length > 0 && scenes.every((s) => DONE.has(String(s.status)));
}

/** Pack adjacent director beats into the chosen model's legal generation
 * blocks. Script text is concatenated verbatim and each visual beat gets an
 * explicit time range inside the block. A 60-second Seedance 2.5 plan therefore
 * becomes 30+30 (subject to the source plan's measured total), not six browser-
 * dependent 10-second jobs. The final remainder is rebalanced, never padded or
 * discarded. */
function splitScriptVerbatim(text: string, count: number): string[] {
  if (count <= 1) return [text];
  const pieces: string[] = [];
  let start = 0;
  for (let part = 1; part < count; part += 1) {
    const target = Math.round((text.length * part) / count);
    let quote = '';
    const boundaries: number[] = [];
    for (let index = start; index < text.length - 1; index += 1) {
      const char = text[index];
      if ((char === '"' || char === "'") && text[index - 1] !== '\\') quote = quote === char ? '' : quote || char;
      if (!quote && /[.!?;,:\n]/.test(char) && /\s/.test(text[index + 1] || '')) boundaries.push(index + 1);
    }
    const cut = boundaries.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] || Math.max(start + 1, Math.min(text.length - (count - part), target));
    pieces.push(text.slice(start, cut)); start = cut;
  }
  pieces.push(text.slice(start));
  return pieces;
}

/** A model that only takes fixed clip lengths (Kling: 5s or 10s) refuses a
 * 6–9s block before rendering, so packed blocks are re-timed onto the legal
 * lengths — keeping the requested total whenever a legal combination exists —
 * and each block's timed beats are scaled to match. Other models pass through. */
export function legalizeDiscreteBlocks(blocks: any[], model: VideoModelConfig, targetDuration?: number | null): any[] {
  if (!model.discreteDurations || !Array.isArray(blocks) || !blocks.length) return blocks;
  const legal = (model.supportedDurations || []).map(Number).filter((value) => value > 0);
  if (!legal.length || blocks.every((block) => legal.includes(Math.round(Number(block.duration_s))))) return blocks;
  const current = blocks.map((block) => Math.round(Number(block.duration_s)) || legal[0]);
  const step = Math.min(...legal);
  const wanted = Math.round(Number(targetDuration) || 0) || current.reduce((sum, value) => sum + value, 0);
  const options = { modelMinDuration: Math.min(...legal), modelMaxDuration: Math.max(...legal), modelSupportedDurations: legal };
  const fitted = fitDurationsToTotal(current, wanted, options)
    || fitDurationsToTotal(current, Math.max(step, Math.round(wanted / step) * step), options);
  const next = fitted || current.map((value) => legal.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) || (Math.abs(option - value) === Math.abs(best - value) && option > best) ? option : best), legal[0]));
  return blocks.map((block, index) => {
    const from = Number(block.duration_s) || next[index];
    const to = next[index];
    if (from === to) return block;
    const scale = to / from;
    const beats = (Array.isArray(block.timed_beats) ? block.timed_beats : []).map((beat: any, beatIndex: number, list: any[]) => ({
      ...beat,
      start_s: Math.round(Number(beat.start_s) * scale * 100) / 100,
      end_s: beatIndex === list.length - 1 ? to : Math.round(Number(beat.end_s) * scale * 100) / 100,
    }));
    return {
      ...block,
      duration_s: to,
      timed_beats: beats,
      visual_goal: beats.length ? beats.map((beat: any) => `[${beat.start_s}–${beat.end_s}s] ${beat.action}`).join('\n') : block.visual_goal,
      duration_notes: [...(Array.isArray(block.duration_notes) ? block.duration_notes : []), `Re-timed from ${from}s to ${to}s because ${model.label} accepts only ${legal.join('s or ')}s clips.`],
    };
  });
}

export function packPlannedBlocks(source: any[], model: VideoModelConfig, targetDuration?: number | null): any[] {
  const max = Math.max(4, Number(model.safeMaxDuration) || 8);
  const min = Math.max(4, Number(model.minDuration) || 4);
  const blocks = (Array.isArray(source) ? source : []).flatMap((scene, index) => {
    const requested = Math.round(Number(scene?.duration_s) || max);
    const sourceText = String(scene.script_segment || '');
    const parts = requested > max ? splitSegmentForModel(model.apiModel, sourceText, requested) : [{ text: sourceText, durationS: Math.max(min, requested) }];
    const exactParts = splitScriptVerbatim(sourceText, parts.length);
    return parts.map((part, partIndex) => ({
      ...scene,
      script_segment: exactParts[partIndex],
      duration_s: Math.max(min, Math.min(max, part.durationS)),
      transition: index === 0 && partIndex === 0 ? 'new_shot' : partIndex > 0 ? 'continuous' : scene.transition === 'continuous' ? 'continuous' : 'new_shot',
      timed_beats: partIndex === 0 ? scene.timed_beats : [{ start_s: 0, end_s: part.durationS, action: scene.visual_goal || scene.summary || '', dialogue: undefined }],
      dialogue: partIndex === 0 ? scene.dialogue : null,
      duration_notes: [...(Array.isArray(scene.duration_notes) ? scene.duration_notes : []), ...(parts.length > 1 ? [`Split the ${requested}s block at a sentence or clause boundary into ${parts.length} legal ${model.label} blocks.`] : [])],
    }));
  });
  if (!blocks.length) return [];
  const wanted = Math.max(0, Math.round(Number(targetDuration) || 0));
  if (wanted) {
    const total = () => blocks.reduce((sum, block) => sum + Number(block.duration_s), 0);
    const spokenFloor = (block: any) => {
      const line = String(block?.dialogue?.line || '');
      const words = line.trim().split(/\s+/).filter(Boolean).length;
      return Math.min(max, Math.max(min, Math.ceil(words / (/[\u0900-\u097F]/.test(line) ? 2.2 : 2.5))));
    };
    // Spread the difference one second at a time across the film: lengthen the
    // shortest block, or shorten the longest block that still fits its line.
    const rebalance = (floor: (block: any) => number) => {
      let delta = wanted - total();
      for (let guard = 0; delta !== 0 && guard < 20000; guard += 1) {
        let chosen = -1;
        for (let i = 0; i < blocks.length; i += 1) {
          const seconds = Number(blocks[i].duration_s);
          if (delta > 0 ? seconds >= max : seconds <= floor(blocks[i])) continue;
          const best = chosen < 0 ? 0 : Number(blocks[chosen].duration_s);
          if (chosen < 0 || (delta > 0 ? seconds < best : seconds > best)) chosen = i;
        }
        if (chosen < 0) break;
        blocks[chosen].duration_s = Number(blocks[chosen].duration_s) + (delta > 0 ? 1 : -1);
        delta += delta > 0 ? -1 : 1;
      }
    };
    rebalance(spokenFloor);
    if (wanted - total() < 0) rebalance(() => min);
    // Every block is already at the model maximum and the film is still short:
    // split the longest unspoken block at a sentence or clause boundary into a
    // continuous follow-on block, then rebalance again.
    for (let guard = 0; wanted - total() > 0 && guard < 200; guard += 1) {
      let target = -1;
      for (let i = 0; i < blocks.length; i += 1) {
        const text = String(blocks[i].script_segment || '');
        if (text.trim().split(/\s+/).filter(Boolean).length < 2) continue;
        if (target < 0) { target = i; continue; }
        const spoken = Boolean(blocks[i].dialogue?.line);
        const targetSpoken = Boolean(blocks[target].dialogue?.line);
        if ((targetSpoken && !spoken) || (targetSpoken === spoken && text.length > String(blocks[target].script_segment || '').length)) target = i;
      }
      if (target < 0) break;
      const original = blocks[target];
      const [head, tail] = splitScriptVerbatim(String(original.script_segment || ''), 2);
      if (!String(head || '').trim() || !String(tail || '').trim()) break;
      blocks.splice(target, 1,
        { ...original, script_segment: head },
        {
          ...original,
          script_segment: tail,
          duration_s: min,
          transition: 'continuous',
          dialogue: null,
          timed_beats: [{ start_s: 0, end_s: min, action: original.visual_goal || original.summary || '', dialogue: undefined }],
          duration_notes: [...(Array.isArray(original.duration_notes) ? original.duration_notes : []), `Split into a continuous follow-on block to reach the requested ${wanted}s.`],
        },
      );
      rebalance(spokenFloor);
      if (wanted - total() < 0) rebalance(() => min);
    }
    const delta = wanted - total();
    if (delta !== 0) blocks.forEach((block) => { block.duration_notes = [...(block.duration_notes || []), `Requested ${wanted}s; the closest legal ${model.label} plan differs by ${Math.abs(delta)}s without cutting dialogue.`]; });
  }
  return blocks.map((block) => {
    const duration = Number(block.duration_s);
    const supplied = Array.isArray(block.timed_beats) ? block.timed_beats.filter((beat: any) => Number(beat?.end_s) > Number(beat?.start_s)) : [];
    const sourceBeats = supplied.length ? supplied : [{ start_s: 0, end_s: duration, action: String(block.visual_goal || block.summary || ''), dialogue: block.dialogue?.line || undefined }];
    const weights = sourceBeats.map((beat: any) => {
      const line = String(beat.dialogue || '');
      const words = line.trim().split(/\s+/).filter(Boolean).length;
      const speechNeed = words ? words / (/[\u0900-\u097F]/.test(line) ? 2.2 : 2.5) : 0;
      return Math.max(0.5, Number(beat.end_s) - Number(beat.start_s) || 1, speechNeed);
    });
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let cursor = 0;
    const timedBeats = sourceBeats.map((beat: any, beatIndex: number) => {
      const start_s = Math.round(cursor * 100) / 100;
      cursor = beatIndex === sourceBeats.length - 1 ? duration : cursor + duration * (weights[beatIndex] / totalWeight);
      const end_s = beatIndex === sourceBeats.length - 1 ? duration : Math.round(cursor * 100) / 100;
      return { ...beat, start_s, end_s, action: String(beat.action || block.visual_goal || block.summary || ''), camera: beat.camera ? String(beat.camera) : undefined, dialogue: beat.dialogue ? String(beat.dialogue) : undefined, audio: beat.dialogue ? (block.dialogue?.kind === 'narrator' ? 'narration' : 'native dialogue') : 'native ambience/effects' };
    });
    const tight = timedBeats.find((beat: any) => {
      const line = String(beat.dialogue || '');
      const words = line.trim().split(/\s+/).filter(Boolean).length;
      const need = words ? words / (/[\u0900-\u097F]/.test(line) ? 2.2 : 2.5) : 0;
      return need > Number(beat.end_s) - Number(beat.start_s) + 0.05;
    });
    const speech_warning = tight ? `Speech is tight: ${String(tight.dialogue).trim().split(/\s+/).filter(Boolean).length} words may not fit ${(Number(tight.end_s) - Number(tight.start_s)).toFixed(1)} seconds. Review timing before Start.` : block.speech_warning;
    return { ...block, timed_beats: timedBeats, ...(speech_warning ? { speech_warning } : {}), visual_goal: timedBeats.map((beat) => `[${beat.start_s}–${beat.end_s}s] ${beat.action}`).join('\n') };
  });
}

// ---------------------------------------------------------------------------
// Manual Script Mode + the dual-reference (n+1) method
// ---------------------------------------------------------------------------

/** True when this film's scenes were parsed from a script the customer pasted
 * rather than segmented by the director model. Manual mode does not rewrite
 * the script, but every rendered clip still receives the required vision check. */
export function isManualFilm(film: Film): boolean {
  return film.plan?.input_mode === 'manual';
}

/** Append a note to a prompt without the proxy's hard character cap cutting
 * the note itself back off the end. */
function appendPromptNote(prompt: string, note: string, maxChars: number): string {
  const body = String(prompt || '').trim();
  if (!note) return body;
  return `${capText(body, Math.max(160, maxChars - note.length - 1))}\n${note}`;
}

// ---------------------------------------------------------------------------
// Stored @name references + style lock — the two things every scene of a film
// carries, whatever else changes clip to clip
// ---------------------------------------------------------------------------

/** The stored references this script summoned with @name, resolved once when
 * the film is created and then persisted on the film row. A reference lookup
 * must never stop a film from being made, so a failure resolves to none. */
async function resolveFilmAtReferences(script: string): Promise<AtReference[]> {
  try {
    const stored = await db.listReferences();
    return resolveAtMentions(script, stored).map((r) => ({
      name: r.name,
      url: r.url,
      type: r.type,
      ...(r.description ? { description: r.description } : {}),
    }));
  } catch {
    return [];
  }
}

/** The stored references' appearance notes in words, so a model carrying
 * fewer pictures than the script summoned still gets their identity. */
function appendAtReferenceNote(film: Film, prompt: string, modelId?: string | null): string {
  const described = (Array.isArray(film.at_references) ? film.at_references : [])
    .filter((r) => r?.type !== 'character' && String(r?.description || '').trim());
  if (!described.length) return prompt;
  const note = `Stored references (match them exactly): ${described.map((r) => `${r.name} — ${capText(String(r.description), 1000)}`).join('; ')}`;
  return appendPromptNote(prompt, capText(note, 5000), resolveVideoModel(modelId || film.video_model).promptMaxChars);
}

/**
 * STYLE LOCK — scene 1's visual fingerprint, prepended verbatim to every
 * later prompt so clip 7 cannot drift into a different palette, light or lens
 * than clip 1. The combined text is capped to the model's own limit AFTER
 * prepending (the scene body is trimmed from the end), so the lock itself is
 * never the part that gets cut.
 */
function applyStyleLock(film: Film, scene: FilmScene, prompt: string): string {
  const lock = String(film.style_lock_description || '').trim();
  if (film.style_lock !== true || !lock || scene.idx === 0) return prompt;
  const head = `STYLE LOCK (maintain exactly):\n${lock}\n\n`;
  const modelId = ((scene.spec || {}) as VideoClipSpec).engine_id || film.video_model;
  const room = Math.max(200, resolveVideoModel(modelId).promptMaxChars - head.length);
  return `${head}${capText(prompt, room)}`;
}

/** Everything a prepared prompt carries beyond the scene itself: the stored
 * reference notes, then the film's locked style. */
function finishScenePrompt(film: Film, scene: FilmScene, prompt: string): string {
  const modelId = ((scene.spec || {}) as VideoClipSpec).engine_id || film.video_model;
  return applyStyleLock(film, scene, appendAtReferenceNote(film, prompt, modelId));
}

function sceneStarts(scenes: PlanScene[]): number[] {
  let cursor = 0;
  return scenes.map((scene) => { const start = cursor; cursor += Math.max(0.25, Number(scene.duration_s) || 0); return start; });
}

function plannedTextTimeline(items: Array<{ text: string; scene_numbers: number[]; start_s: number; end_s: number; position: OnScreenTextItem['position']; style: OnScreenTextItem['style'] }>, scenes: PlanScene[]): OnScreenTextItem[] {
  const starts = sceneStarts(scenes);
  return items.map((item, index) => {
    const indexes = item.scene_numbers.map((number) => Math.min(scenes.length - 1, Math.max(0, number - 1))).sort((a, b) => a - b);
    const first = indexes[0] ?? 0;
    const last = indexes[indexes.length - 1] ?? first;
    const windowStart = starts[first] || 0;
    const windowEnd = (starts[last] || 0) + Math.max(0.25, Number(scenes[last]?.duration_s) || 0);
    const start = Math.min(windowEnd - 0.25, windowStart + Math.max(0, Number(item.start_s) || 0));
    const end = Math.min(windowEnd, windowStart + Math.max(Number(item.end_s) || 0, Number(item.start_s) + 0.25));
    return {
      id: `text_${index + 1}_${newSceneKey()}`,
      text: item.text,
      scene_keys: indexes.map((sceneIndex) => scenes[sceneIndex]?.scene_key).filter(Boolean) as string[],
      start_s: start,
      end_s: Math.max(start + 0.25, end),
      position: item.position,
      style: item.style,
      source: 'brief' as const,
    };
  }).filter((item) => item.text && item.end_s > item.start_s);
}

function manualTextTimeline(parsed: ParsedScene[], scenes: PlanScene[]): OnScreenTextItem[] {
  const starts = sceneStarts(scenes);
  const items: OnScreenTextItem[] = [];
  parsed.forEach((source, index) => {
    const scene = scenes[index];
    if (!scene) return;
    (source.onScreenText || []).forEach((text, textIndex) => items.push({
      id: `text_${index + 1}_${textIndex + 1}_${newSceneKey()}`,
      text,
      scene_keys: [scene.scene_key],
      start_s: starts[index] || 0,
      end_s: (starts[index] || 0) + Math.max(0.25, Number(scene.duration_s) || 0),
      position: 'bottom',
      style: 'clean',
      source: 'manual',
    }));
  });
  return items;
}

function sceneTextItems(film: Film, scene: FilmScene): OnScreenTextItem[] {
  return (film.plan?.on_screen_text || []).filter((item) => (item.scene_keys || []).includes(scene.scene_key));
}

// ---------------------------------------------------------------------------
// Stage 1 — script received → analyzed → segmented → first scene prepared
// ---------------------------------------------------------------------------

export async function createAndSegmentFilm(params: {
  script: string;
  aspect: Aspect;
  referenceImageUrl?: string | null;
  /** Character reference image for the dual-reference (n+1) method. */
  characterRefUrl?: string | null;
  note?: string;
  /** Video model registry id (see VIDEO_MODELS); null/undefined = default. */
  videoModel?: string | null;
  /** Style Lock (default ON): freeze the look after scene 1. */
  styleLock?: boolean | null;
  targetDuration?: number | null;
  audioEnabled?: boolean;
  narrationEnabled?: boolean;
  charactersSpeak?: boolean;
  entryType?: EntryType;
  controlMode?: ControlMode;
  executionMode?: ExecutionMode;
  motionEngine?: CodeMotionEngine;
  videoStyle?: VideoStyleId;
  customVisualDirection?: string;
  audioPolicy?: AudioPolicy;
  maxAuthorizedCredits?: number | null;
  storyboardRequested?: boolean;
  /** Separate-provider versions reuse these exact approved sheets. */
  reuseCharacterRefs?: FilmCharacter[];
}, hooks: RunHooks = {}): Promise<{ film: Film; scenes: FilmScene[] }> {
  const requestedDuration = Math.round(Number(params.targetDuration) || 0);
  if (requestedDuration > 600) throw new Error('The maximum assembled project duration is 10:00.');
  if (requestedDuration && requestedDuration < 4) throw new Error('Choose at least a 4-second project duration.');
  // Anything the script summoned with @name is resolved BEFORE the row is
  // written, so every scene of this film carries the same references.
  const atReferences = await resolveFilmAtReferences(params.script);
  const film = await db.createFilm({
    title: null,
    script: params.script,
    aspect_ratio: params.aspect,
    status: 'planning',
    machine_state: 'SCRIPT_RECEIVED',
    stage_note: 'Script received.',
    product_screenshot_url: params.referenceImageUrl || null,
    character_ref_url: params.characterRefUrl || null,
    video_model: resolveVideoModel(params.videoModel).id,
    style_lock: params.styleLock !== false,
    style_lock_description: null,
    at_references: atReferences,
  });
  try {
    if (atReferences.length) say(hooks, `${atReferences.length} stored reference${atReferences.length === 1 ? '' : 's'} resolved from your script (${atReferences.map((r) => `@${r.name}`).join(', ')}) — they travel with every scene.`);
    await setState(film, hooks, 'ANALYZING_SCRIPT', 'The director is reading the entire script and mapping the story…');
    const castVoices = await listVoices().catch(() => []);
    const plan = await segmentScript({
      script: params.script,
      aspect: params.aspect,
      note: params.note,
      referenceImageUrl: params.referenceImageUrl,
      audioEnabled: params.audioEnabled !== false,
      narrationEnabled: params.narrationEnabled === true,
      charactersSpeak: params.charactersSpeak === true,
      voices: castVoices,
      targetDuration: requestedDuration || null,
      videoModel: params.videoModel,
      videoStyle: params.customVisualDirection || params.videoStyle,
      audioPolicy: params.audioPolicy,
      maxAuthorizedCredits: params.maxAuthorizedCredits,
    });
    await setState(film, hooks, 'SEGMENTING_SCRIPT', `Written by ${plan.writer_model}. Story understood — checking and packing ${plan.scenes.length} sequential clips…`);
    plan.notes.forEach((note) => say(hooks, `Planning guardrail: ${note}`));

    // One model-selection state drives planner, UI and server. The creative
    // planner may recommend shot intents, but it cannot silently override the
    // film's approved primary model scene by scene.
    const primaryModel = resolveVideoModel(params.videoModel);
    const primaryReason = primaryModel.id === 'seedance-2.5'
      ? 'Seedance 2.5 is the approved primary model: 4–30 whole seconds per block, optional audio, and first/last frames or up to three asset references.'
      : primaryModel.id === 'kling-3.0-omni'
        ? 'Kling Omni 3.0 is the approved primary model: 5s or 10s blocks with up to four recurring-subject references.'
        : `${primaryModel.label} is the approved primary model for this film.`;
    const packedScenes = legalizeDiscreteBlocks(packPlannedBlocks(plan.scenes, primaryModel, requestedDuration || null), primaryModel, requestedDuration || null);
    const packedDuration = packedScenes.reduce((sum, scene) => sum + Number(scene.duration_s || 0), 0);
    if (requestedDuration && Math.abs(packedDuration - requestedDuration) > 1) {
      throw new Error(`The accepted script supports ${packedDuration}s of non-duplicated model blocks, not the requested ${requestedDuration}s. Choose one: use ${packedDuration}s, allow the writer to expand the script, or add more source material. Nothing was submitted or billed.`);
    }
    const planScenes = packedScenes.map((s, i) => ({
      scene_key: newSceneKey(),
      idx: i,
      type: 'video_clip' as const,
      script_segment: s.script_segment,
      duration_s: s.duration_s,
      continuity_group: null,
      spec: {
        summary: s.summary,
        visual_goal: s.visual_goal,
        cut_type: s.transition === 'continuous' ? 'continuous' : 'new_shot',
        characters: s.characters,
        shot_intent: s.shot_intent,
        workflow_kind: s.workflow_kind,
        engine_id: primaryModel.id,
        engine_reason: primaryReason,
        // The approved film model owns duration. Shot-intent routing notes were
        // calculated before that choice and can incorrectly claim an 8s model
        // on a legal 30s Seedance block, so they never travel into the plan.
        duration_notes: [],
        duration_s: s.duration_s,
        timed_beats: Array.isArray(s.timed_beats) ? s.timed_beats : [],
        model_assignment: { model_id: primaryModel.apiModel, operation: 'generate', locked: params.controlMode === 'manual', reason: primaryReason },
        prompt_version: 1,
        background: {
          idempotency_key: `stv:film:${film.id}:scene:${i}`,
          status: 'queued', retries: 0, max_retries: 3,
          credits_estimated: s.duration_s,
        },
      } as VideoClipSpec,
      dialogue: s.dialogue || null,
      summary: s.summary,
      visual_goal: s.visual_goal,
      characters: s.characters,
    }));
    const onScreenText = plannedTextTimeline(plan.on_screen_text || [], planScenes);
    for (const s of planScenes) {
      await db.insertScene({
        film_id: film.id,
        idx: s.idx,
        scene_key: s.scene_key,
        type: 'video_clip',
        script_segment: s.script_segment,
        spec: s.spec,
        status: 'waiting',
        duration_s: s.duration_s,
        continuity_group: null,
        dialogue: s.dialogue || null,
      });
    }
    const reusableCast = Array.isArray(params.reuseCharacterRefs) ? params.reuseCharacterRefs : [];
    const characterRefs = reusableCast.length
      ? plan.characters.map((profile) => {
          if (profile.kind === 'narrator') return { ...profile, appearance: '', wardrobe: '', url: null, approved: true, source: 'generated' as const, sheet_required: false };
          const match = reusableCast.find((item) => castSlug(item.id) === castSlug(profile.id) || castSlug(item.name) === castSlug(profile.name));
          return match ? { ...profile, ...match, id: profile.id, name: profile.name, approved: match.approved === true } : { ...profile, url: null, approved: false, source: 'generated' as const, image_error: 'The original film has no approved sheet for this named character.' };
        })
      : await generateInitialCharacterSheets(
          film, plan.characters, characterSheetStyle({ video_style: params.videoStyle, custom_visual_direction: params.customVisualDirection, visual_style: plan.visual_style }), params.characterRefUrl || null, atReferences, hooks,
        );
    const sheetRefs = characterRefs.filter((character) => character.sheet_required !== false);
    await patchFilm(film, hooks, {
      title: plan.title,
      status: 'plan_ready',
      plan: {
        title: plan.title,
        style_direction: plan.visual_style,
        story_summary: plan.story_summary,
        world: plan.world,
        visual_style: plan.visual_style,
        characters: plan.characters,
        scenes: planScenes,
        on_screen_text: onScreenText,
        assumptions: [...plan.notes, ...(params.note ? [params.note] : [])],
        input_mode: 'ai',
        requested_duration_s: requestedDuration || null,
        contract_version: 2,
        entry_type: params.entryType || 'idea',
        control_mode: params.controlMode || 'agentic',
        execution_mode: params.executionMode || 'review',
        motion_engine: params.motionEngine || 'browser',
        video_style: params.videoStyle || 'cinematic-live-action',
        custom_visual_direction: params.customVisualDirection || '',
        target_duration_sec: requestedDuration || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0),
        audio_policy: params.audioPolicy || 'native-dialogue-effects',
        max_authorized_credits: Number(params.maxAuthorizedCredits) || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0),
        master_script_version: 1,
        scene_plan_version: 1,
        model_registry_snapshot: { version: S2V_CAPABILITY_REGISTRY_VERSION, captured_at: new Date().toISOString(), capabilities: S2V_VIDEO_CAPABILITIES },
        project_asset_ids: [],
        storyboard_only_asset_ids: [],
        storyboard_requested: params.storyboardRequested === true,
        writer_model: plan.writer_model,
        clip_ids: planScenes.map((scene) => scene.scene_key),
        sections: buildLongFormSections(requestedDuration || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0), planScenes.map((scene) => scene.duration_s)),
        continuity_manifest: {
          version: 1,
          cast: Object.fromEntries(plan.characters.map((character) => [character.id, character.kind === 'narrator' ? { name: character.name, appearance: '', wardrobe: '', voice: character.voice } : { name: character.name, appearance: character.appearance, wardrobe: character.wardrobe, voice: character.voice }])),
          style: { direction: params.customVisualDirection || plan.visual_style, lock: params.styleLock !== false },
          locations: {}, products: {}, handoffs: [],
        },
        orchestration: {
          state: params.executionMode === 'automatic' ? 'auto_authorized' : 'awaiting_approval',
          intent: 'plan', checkpoint: 'storyboard_ready', manual_locks: {}, paused: false, cancel_requested: false,
          completed_count: 0, total_count: planScenes.length,
          credits_estimated: planScenes.reduce((sum, scene) => sum + scene.duration_s, 0), credits_reserved: 0, credits_actual: 0, billed_so_far: 0,
          updated_at: new Date().toISOString(),
        },
        editor_composition_version: 0,
        export_records: [],
        audio_enabled: params.audioEnabled !== false,
        narration_enabled: params.audioEnabled !== false && params.narrationEnabled === true,
        characters_speak: params.audioEnabled !== false && params.charactersSpeak === true,
        cast_reviewed: characterRefs.every((character) => character.sheet_required === false),
      },
      character_refs: characterRefs,
      stage_note: sheetRefs.length
        ? sheetRefs.some((character) => !character.url)
          ? `${planScenes.length} legal ${primaryModel.label} block${planScenes.length === 1 ? '' : 's'} planned. ${sheetRefs.filter((character) => !character.url).length} cast sheet image${sheetRefs.filter((character) => !character.url).length === 1 ? '' : 's'} still need attention before Start.`
          : `${planScenes.length} legal ${primaryModel.label} block${planScenes.length === 1 ? '' : 's'} planned. Review and approve ${sheetRefs.length} cast sheet${sheetRefs.length === 1 ? '' : 's'} before Start.`
        : `${planScenes.length} legal ${primaryModel.label} block${planScenes.length === 1 ? '' : 's'} planned. No clear characters were found — add one if the film needs a recurring identity, or confirm the character-free plan.`,
    });

    const scenes = await db.listScenes(film.id);
    const fresh = await db.getFilm(film.id);
    return { film: fresh || film, scenes };
  } catch (e: any) {
    await db.updateFilm(film.id, { status: 'error', error: String(e?.message || e), stage_note: 'Script analysis failed.' });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Character reference — generated ONCE per character, reused forever
// ---------------------------------------------------------------------------

function castSlug(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Generate every proposed sheet before plan approval. Existing @name library
 * references and a creator-uploaded cast image are reused first; only the
 * remaining sheets spend image-generation credits. Nothing is auto-approved.
 *
 * Cast imagery is OpenAI end to end: `gpt-image-1.5` reference editing when an
 * identity picture exists, `gpt-image-2` text-to-image otherwise, and the
 * retry after a refused reference edit is the OpenAI text route too. No
 * Gemini image model is used for any cast or reference sheet.
 */
async function requestCharacterSheet(profile: FilmCharacterProfile, visualStyle: string, sourceUrl?: string): Promise<{ url: string; model: string }> {
  const prompt = characterPortraitBrief(profile, visualStyle);
  if (!sourceUrl) {
    return { url: await generateOpenAiImage(prompt, '16:9', 'draft'), model: S2V_IMAGE_MODEL };
  }
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await workspaceFetch('/api/generate/image-to-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: S2V_IMAGE_EDIT_MODEL, prompt, images: [{ data: sourceUrl, label: 'PERSON IDENTITY: likeness only' }], referenceLimit: 1, inputFidelity: 'high', quality: 'medium', size: '1536x1024', fallbackPolicy: 'none' }),
      });
      const data = await response.json().catch(() => null);
      let url = String(data?.imageUrl || data?.url || '');
      if (response.ok && url.startsWith('data:image/')) url = await uploadDataUrl(url, `s2v-character-${castSlug(profile.name)}-${Date.now()}.jpg`);
      if (response.ok && isHttpUrl(url)) return { url, model: S2V_IMAGE_EDIT_MODEL };
      lastError = String(data?.error?.message || data?.error || `Character sheet generation failed (HTTP ${response.status}).`);
      if (![408, 409, 425, 429, 500, 502, 503, 504].includes(response.status) && !/temporar|overload|timeout/i.test(lastError)) break;
    } catch (error: any) {
      lastError = String(error?.message || error);
      if (!/network|fetch|temporar|overload|timeout|timed out/i.test(lastError)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, [700, 1800, 4000][attempt]));
  }
  try {
    return { url: await generateOpenAiImage(prompt, '16:9', 'draft'), model: S2V_IMAGE_MODEL };
  } catch (fallbackError: any) {
    throw new Error(`${lastError || 'The reference image route failed.'} Text-to-image retry: ${String(fallbackError?.message || fallbackError)}`);
  }
}

async function inspectCharacterSheet(profile: FilmCharacterProfile, url: string): Promise<{ pass: boolean; issues: string[]; unavailable?: boolean }> {
  try {
    const result = await askGptVisionJson<{ pass: boolean; issues: string[] }>(
      'Inspect this character sheet and reply only with JSON {"pass":boolean,"issues":string[]}. Pass only when it has one large face close-up and four full-body views: front, three-quarter, side and back; every panel is the same person with matching face, hair, build, wardrobe, shoes and accessories; the backdrop is plain; there are no extra people and no text.',
      `CHARACTER: ${profile.name}. WARDROBE: ${profile.wardrobe}. APPEARANCE: ${profile.appearance}.`,
      [url],
    );
    return { pass: result?.pass === true, issues: Array.isArray(result?.issues) ? result.issues.map(String) : [] };
  } catch (error: any) {
    return { pass: true, unavailable: true, issues: [`Vision check unavailable — review by eye. ${String(error?.message || error)}`.slice(0, 300)] };
  }
}

export async function generateCharacterSheet(profile: FilmCharacterProfile, visualStyle: string, sourceUrl?: string): Promise<{ url: string; imageModel: string; reviewByEye: boolean; issues: string[] }> {
  if (profile.kind === 'narrator') throw new Error('The narrator is voice-only and never gets a character sheet.');
  const candidates: Array<{ url: string; imageModel: string; issues: string[] }> = [];
  for (let pass = 0; pass < 2; pass += 1) {
    const generated = await requestCharacterSheet(profile, visualStyle, sourceUrl);
    const check = await inspectCharacterSheet(profile, generated.url);
    if (check.unavailable) return { url: generated.url, imageModel: generated.model, reviewByEye: true, issues: check.issues };
    if (check.pass) return { url: generated.url, imageModel: generated.model, reviewByEye: false, issues: [] };
    candidates.push({ url: generated.url, imageModel: generated.model, issues: check.issues });
  }
  const best = candidates.sort((a, b) => a.issues.length - b.issues.length)[0];
  return { url: best.url, imageModel: best.imageModel, reviewByEye: true, issues: best.issues };
}

async function generateInitialCharacterSheets(
  film: Film,
  profiles: FilmCharacterProfile[],
  visualStyle: string,
  uploadedUrl: string | null,
  atReferences: AtReference[],
  hooks: RunHooks,
): Promise<FilmCharacter[]> {
  const output: FilmCharacter[] = [];
  // The narrator is a voice only: it never gets a sheet, an image, or the uploaded identity.
  const uploadIndex = profiles.findIndex((profile) => profile.kind !== 'narrator');
  for (let index = 0; index < profiles.length; index += 1) {
    const profile = profiles[index];
    if (profile.kind === 'narrator') {
      output.push({ ...profile, appearance: '', wardrobe: '', url: null, approved: true, source: 'generated', sheet_required: false });
      continue;
    }
    const matched = atReferences.find((ref) => castSlug(ref.name) === castSlug(profile.name) || castSlug(ref.name) === castSlug(profile.id));
    const identitySource = index === uploadIndex && isHttpUrl(uploadedUrl) ? String(uploadedUrl) : String(matched?.url || '');
    const source: FilmCharacter['source'] = identitySource ? (index === uploadIndex && uploadedUrl ? 'uploaded' : 'library') : 'generated';
    let url = '';
    let imageError = '';
    let imageModel = identitySource ? S2V_IMAGE_EDIT_MODEL : S2V_IMAGE_MODEL;
    let reviewByEye = false;
    try {
      say(hooks, `Generating and checking ${profile.name}'s 16:9 character sheet…`);
      const generated = await generateCharacterSheet(profile, visualStyle, identitySource || undefined);
      url = generated.url;
      imageModel = generated.imageModel;
      reviewByEye = generated.reviewByEye;
      imageError = generated.issues.join('; ').slice(0, 500);
    } catch (error: any) {
      imageError = String(error?.message || error).slice(0, 500);
    }
    const sheet: FilmCharacter = { ...profile, url: url || null, approved: false, source, sheet_required: true, ...(reviewByEye ? { image_review_by_eye: true } : {}), ...(imageError ? { image_error: imageError } : {}), ...(url ? { image_model: imageModel } : {}) };
    output.push(sheet);
    if (url) await db.addAsset({ film_id: film.id, kind: 'character', name: `${profile.name} character sheet`, description: profile.appearance.slice(0, 200), url });
  }
  return output;
}

function isHttpUrl(value: unknown): boolean {
  return /^https:\/\//i.test(String(value || '').trim());
}

// ---------------------------------------------------------------------------
// Stage 2 — prepare ONE scene (continuation decision + prompt)
// ---------------------------------------------------------------------------

export async function prepareScene(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
  opts: { revisionNote?: string | null; forceIndependent?: boolean } = {},
): Promise<void> {
  // Manual Script Mode writes its own prompt straight from the pasted text —
  // the director model is never called for a manual film.
  if (isManualFilm(film)) { await prepareManualScene(film, scenes, scene, hooks, opts); return; }
  const statusBefore = scene.status;
  const plannedCut = ((scene.spec || {}) as VideoClipSpec).cut_type || (scene.idx === 0 ? 'new_shot' : 'continuous');
  const prev = plannedCut === 'continuous' ? immediatePreviousScene(scenes, scene.idx) : null;
  await setState(
    film, hooks,
    scene.idx === 0 || !prev ? 'PREPARING_SCENE' : 'DETERMINE_NEXT_REFERENCE',
    scene.idx === 0 || !prev
      ? `Preparing scene ${scene.idx + 1}: the director is writing the shot…`
      : `Scene ${scene.idx + 1}: the director is studying scene ${prev.idx + 1}'s final frame and deciding continuity…`,
  );
  try {
    const prepared = await prepareScenePrompt({
      film,
      scene,
      prevScene: prev,
      characterRefs: (Array.isArray(film.character_refs) ? film.character_refs : []).filter((character) => character.kind !== 'narrator'),
      revisionNote: opts.revisionNote,
      forceIndependent: opts.forceIndependent || plannedCut === 'new_shot',
    });

    if (prev && scene.idx > 0) await setState(film, hooks, 'PREPARE_NEXT_SCENE', `Scene ${scene.idx + 1}: ${prepared.continuation ? `continuing from scene ${prev.idx + 1}'s final frame` : 'independent scene'} — writing the prompt…`);

    // Mandatory n→n+1 chain. The creative director still writes the scene,
    // but it cannot demote continuity or substitute a character sheet into the
    // first-frame slot. Only the explicit user override recorded on the prior
    // card permits a later scene to proceed without that frame.
    const existingSpec = (scene.spec || {}) as VideoClipSpec;
    const assets: ReferenceAsset[] = [];
    if (plannedCut === 'new_shot' && isHttpUrl(existingSpec.storyboard_url)) {
      assets.push({ role: 'first_frame', url: String(existingSpec.storyboard_url), type: 'storyboard', label: `Block ${scene.idx + 1} storyboard keyframe`, priority: 600, critical: true });
    }
    let continuation = false;
    let referenceType: ReferenceType = 'none';
    const immediate = scene.idx > 0 ? immediatePreviousScene(scenes, scene.idx) : null;
    if (scene.idx > 0 && plannedCut === 'continuous') {
      const extraction = frameExtractionOf(immediate);
      if (!immediate || (immediate.status !== 'completed' && !(immediate.status === 'skipped' && extraction?.status === 'continued_without'))) {
        throw new Error(`Scene ${scene.idx + 1} is waiting for Scene ${scene.idx}'s validated last frame.`);
      }
      if (isHttpUrl(immediate.keyframe_url)) {
        assets.push({
          role: 'first_frame', url: String(immediate.keyframe_url), type: 'continuity-frame', label: `Scene ${immediate.idx + 1} last frame`,
          sourceSceneId: immediate.id, sourceSceneIndex: immediate.idx, method: extraction?.method, atSecond: extraction?.at_second,
          priority: 600, critical: true,
        });
        continuation = true;
        referenceType = 'previous_final_frame';
      } else if (extraction?.status !== 'continued_without') {
        throw new Error(`Scene ${scene.idx + 1} is waiting for Scene ${scene.idx}'s last frame. Retry frame extraction or explicitly continue without continuity on that scene card.`);
      }
    }
    const candidateRefs = [...onScreenCharacterReferences(film, scene), ...supportingSceneReferences(film)];
    for (const ref of candidateRefs) if (!assets.some((asset) => asset.url === ref.url)) assets.push(ref);
    if (scene.idx === 0 && assets.length) referenceType = assets[0].type === 'character' ? 'character_reference' : 'scene_reference';
    const characterNote = sceneCharacterPromptNote(film, scene);
    const prompt = characterNote
      ? appendPromptNote(prepared.prompt, characterNote, resolveVideoModel(existingSpec.engine_id || film.video_model).promptMaxChars)
      : prepared.prompt;

    const spec: VideoClipSpec = {
      ...existingSpec,
      negative: prepared.negative,
      reasoning: prepared.reasoning,
    };
    await patchScene(scene, hooks, {
      status: 'ready',
      error: null,
      prompt: finishScenePrompt(film, scene, prompt),
      continuation,
      reference_type: referenceType,
      reference_assets: assets,
      spec,
      clip_fingerprint: sceneFingerprint({ type: scene.type, spec }, (film.aspect_ratio || '16:9') as Aspect),
    });
    await setState(film, hooks, 'PROMPT_READY', `Scene ${scene.idx + 1} is ready — review the prompt and generate when you are.`);
  } catch (e: any) {
    // A completed scene whose prompt REVISION failed keeps its clip — only a
    // scene that never rendered becomes failed.
    await patchScene(scene, hooks, statusBefore === 'completed'
      ? { status: 'completed', error: String(e?.message || e) }
      : { status: 'failed', error: String(e?.message || e) });
    await patchFilm(film, hooks, { stage_note: `Scene ${scene.idx + 1} could not be prepared.`, error: String(e?.message || e) });
    throw e;
  }
}

/**
 * Prepare ONE manual scene. No model is called at any point: the prompt is
 * assembled from the scene's own parsed visual, camera and dialogue plus the
 * script's overall style block, and the references follow the same
 * dual-reference rule every other mode uses.
 */
async function prepareManualScene(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
  opts: { revisionNote?: string | null; forceIndependent?: boolean } = {},
): Promise<void> {
  const statusBefore = scene.status;
  const prev = previousCompletedScene(scenes, scene.idx);
  await setState(
    film, hooks,
    scene.idx === 0 || !prev ? 'PREPARING_SCENE' : 'PREPARE_NEXT_SCENE',
    `Scene ${scene.idx + 1}: building the prompt from your script…`,
  );
  try {
    const spec = (scene.spec || {}) as VideoClipSpec;
    const manual = spec.manual;
    if (!manual) throw new Error(`Scene ${scene.idx + 1} carries no parsed script data — re-create this film from the pasted script.`);

    const immediate = scene.idx > 0 ? immediatePreviousScene(scenes, scene.idx) : null;
    const extraction = frameExtractionOf(immediate);
    const continuation = scene.idx > 0 && !!immediate?.keyframe_url;
    const assets: ReferenceAsset[] = [];
    if (scene.idx > 0 && (!immediate || (immediate.status !== 'completed' && !(immediate.status === 'skipped' && extraction?.status === 'continued_without')))) throw new Error(`Scene ${scene.idx + 1} is waiting for Scene ${scene.idx}'s validated last frame.`);
    if (continuation && immediate?.keyframe_url) assets.push({ role: 'first_frame', url: immediate.keyframe_url, type: 'continuity-frame', label: `Scene ${immediate.idx + 1} last frame`, sourceSceneId: immediate.id, sourceSceneIndex: immediate.idx, method: extraction?.method, atSecond: extraction?.at_second, priority: 600, critical: true });
    else if (scene.idx > 0 && extraction?.status !== 'continued_without') throw new Error(`Scene ${scene.idx + 1} is waiting for Scene ${scene.idx}'s last frame. Retry frame extraction or explicitly continue without continuity.`);
    for (const ref of [...onScreenCharacterReferences(film, scene), ...supportingSceneReferences(film)]) if (!assets.some((asset) => asset.url === ref.url)) assets.push(ref);

    const model = resolveVideoModel(film.video_model);
    const audioEnabled = film.plan?.audio_enabled !== false;
    const narrationEnabled = audioEnabled && film.plan?.narration_enabled === true;
    const charactersSpeak = audioEnabled && film.plan?.characters_speak === true;
    const promptScene: ParsedScene = {
      ...manual,
      dialogue: manual.dialogue.filter((entry) => {
        const narrator = /^(narrator|voice[ -]?over|vo)$/i.test(entry.speaker.trim());
        return narrator ? narrationEnabled : charactersSpeak;
      }),
    };
    const basePrompt = buildManualScenePrompt({
      scene: promptScene,
      globalStyle: String(film.plan?.global_style || ''),
      styleLead: filmStyleText(film.plan),
      mustNot: [...defaultMustNot(slowMotionRequested(`${manual.visual} ${manual.camera}`)), ...videoStyleBans(film.plan)],
      continuity: continuation,
      revisionNote: opts.revisionNote,
      maxChars: model.promptMaxChars,
    });
    const characterNote = sceneCharacterPromptNote(film, scene);
    const finalPrompt = characterNote ? appendPromptNote(basePrompt, characterNote, model.promptMaxChars) : basePrompt;

    const nextSpec: VideoClipSpec = {
      ...spec,
      negative: manualSceneNegative(promptScene),
      reasoning: continuation
        ? `Manual Script Mode — continuing from scene ${(prev?.idx ?? 0) + 1}'s final frame.`
        : 'Manual Script Mode — staged exactly as written in your script.',
    };
    await patchScene(scene, hooks, {
      status: 'ready',
      error: null,
      prompt: finishScenePrompt(film, scene, finalPrompt),
      continuation,
      reference_type: continuation ? 'previous_final_frame' : assets.length ? (assets[0].type === 'character' ? 'character_reference' : 'scene_reference') : 'none',
      reference_assets: assets,
      spec: nextSpec,
      clip_fingerprint: sceneFingerprint({ type: scene.type, spec: nextSpec }, (film.aspect_ratio || '16:9') as Aspect),
    });
    await setState(film, hooks, 'PROMPT_READY', `Scene ${scene.idx + 1} is ready — review the prompt and generate when you are.`);
  } catch (e: any) {
    await patchScene(scene, hooks, statusBefore === 'completed'
      ? { status: 'completed', error: String(e?.message || e) }
      : { status: 'failed', error: String(e?.message || e) });
    await patchFilm(film, hooks, { stage_note: `Scene ${scene.idx + 1} could not be prepared.`, error: String(e?.message || e) });
    throw e;
  }
}

/** A manual scene's on-camera line, as the audio stage reads it: a scene that
 * speaks keeps the clip's own generated voice and is never narrated over. */
function manualSceneDialogue(scene: ParsedScene, options: { audioEnabled: boolean; narrationEnabled: boolean; charactersSpeak: boolean }): SceneDialogue | null {
  if (!options.audioEnabled) return null;
  const spoken = scene.dialogue.filter((entry) => entry.line.trim()).filter((entry) => {
    const narrator = /^(narrator|voice[ -]?over|vo)$/i.test(entry.speaker.trim());
    return narrator ? options.narrationEnabled : options.charactersSpeak;
  });
  if (!spoken.length) return null;
  return {
    kind: /^(narrator|voice[ -]?over|vo)$/i.test(spoken[0].speaker.trim()) ? 'narrator' : 'character',
    line: spoken.map((entry) => entry.line.trim()).join(' '),
    speaker: spoken[0].speaker || 'the speaker', 
    delivery: 'natural, exactly as written in the script',
    language: 'English',
  };
}

/**
 * MANUAL SCRIPT MODE — create a film straight from a pre-formatted script.
 * The parser is the only thing that reads the text: no scene detection and no
 * directing pass run. The scenes it produces enter the normal generation
 * pipeline exactly as a planned film's would, so everything downstream —
 * sequential rendering, frame extraction, the review board, post-production
 * and Final Assembly — is unchanged.
 */
export async function createManualScriptFilm(params: {
  script: string;
  aspect: Aspect;
  /** Character reference image for the dual-reference (n+1) method. */
  characterRefUrl?: string | null;
  referenceImageUrl?: string | null;
  note?: string | null;
  videoModel?: string | null;
  /** Style Lock (default ON): freeze the look after scene 1. */
  styleLock?: boolean | null;
  targetDuration?: number | null;
  audioEnabled?: boolean;
  narrationEnabled?: boolean;
  charactersSpeak?: boolean;
  entryType?: EntryType;
  controlMode?: ControlMode;
  executionMode?: ExecutionMode;
  motionEngine?: CodeMotionEngine;
  videoStyle?: VideoStyleId;
  customVisualDirection?: string;
  audioPolicy?: AudioPolicy;
  maxAuthorizedCredits?: number | null;
  storyboardRequested?: boolean;
  /** Separate-provider versions reuse these exact approved sheets. */
  reuseCharacterRefs?: FilmCharacter[];
}, hooks: RunHooks = {}): Promise<{ film: Film; scenes: FilmScene[] }> {
  const requestedDuration = Math.round(Number(params.targetDuration) || 0);
  if (requestedDuration > 600) throw new Error('The maximum assembled project duration is 10:00.');
  const parsed = parseManualScript(params.script);
  if (!parsed.scenes.length) {
    throw new Error('No scenes were found in that script. Every scene must open with a line like "Scene 1 — Title | 8 sec".');
  }
  const parsedDuration = parsed.scenes.reduce((total, scene) => total + Math.max(0, Number(scene.durationSec) || 0), 0);
  if (parsedDuration > 600) throw new Error('The maximum assembled project duration is 10:00. Shorten the pasted script before continuing.');
  // A director note has nobody to direct in this mode, so it joins the
  // overall style block and reaches every clip that way.
  const globalStyle = [parsed.globalStyle, String(params.note || '').trim()].filter(Boolean).join(' ');
  const model = resolveVideoModel(params.videoModel);
  say(hooks, 'Reading the full script to propose the cast without changing your wording…');
  const castVoices = await listVoices().catch(() => []);
  const proposedCast = await analyzeScriptCast(params.script, castVoices);
  // The @name mentions are read from the pasted script exactly as they are in
  // AI Mode — the parser leaves them in the visual text.
  const atReferences = await resolveFilmAtReferences(params.script);
  const film = await db.createFilm({
    title: parsed.scenes[0].title || 'Manual script film',
    script: params.script,
    aspect_ratio: params.aspect,
    status: 'planning',
    machine_state: 'SEGMENTING_SCRIPT',
    stage_note: `${parsed.scenes.length} scenes read from your script.`,
    product_screenshot_url: params.referenceImageUrl || null,
    character_ref_url: params.characterRefUrl || null,
    video_model: model.id,
    style_lock: params.styleLock !== false,
    style_lock_description: null,
    at_references: atReferences,
  });
  try {
    if (atReferences.length) say(hooks, `${atReferences.length} stored reference${atReferences.length === 1 ? '' : 's'} resolved from your script (${atReferences.map((r) => `@${r.name}`).join(', ')}) — they travel with every scene.`);
    const planScenes: PlanScene[] = [];
    for (const parsedScene of parsed.scenes) {
      const idx = parsedScene.index - 1;
      // MANUAL SCRIPT MODE films the length the script asks for. The only
      // thing allowed to change it is the provider's own floor/ceiling, so a
      // "| 7 sec" scene is seven seconds long — it is no longer rounded down
      // onto a fixed 4/6/8/10 ladder.
      const duration = resolveDuration(parsedScene.durationSec, model);
      const segment = manualSceneSegment(parsedScene);
      const dialogue = manualSceneDialogue(parsedScene, {
        audioEnabled: params.audioEnabled !== false,
        narrationEnabled: params.narrationEnabled === true,
        charactersSpeak: params.charactersSpeak === true,
      });
      const sceneKey = newSceneKey();
      const spec: VideoClipSpec = {
        summary: parsedScene.title,
        visual_goal: parsedScene.visual,
        duration_s: duration,
        timed_beats: [{ start_s: 0, end_s: duration, action: parsedScene.visual, camera: parsedScene.camera, dialogue: dialogue?.line, audio: dialogue ? (dialogue.kind === 'narrator' ? 'narration' : 'native dialogue') : 'native ambience/effects' }],
        model_assignment: { model_id: model.apiModel, operation: 'generate', locked: true, reason: 'Creator locked this model in Manual mode.' },
        prompt_version: 1,
        background: { idempotency_key: `stv:film:${film.id}:scene:${idx}`, status: 'queued', retries: 0, max_retries: 3, credits_estimated: duration },
        manual: parsedScene,
      };
      planScenes.push({
        scene_key: sceneKey,
        idx,
        type: 'video_clip',
        script_segment: segment,
        duration_s: duration,
        continuity_group: null,
        spec,
        dialogue,
        summary: parsedScene.title,
        visual_goal: parsedScene.visual,
      });
      await db.insertScene({
        film_id: film.id,
        idx,
        scene_key: sceneKey,
        type: 'video_clip',
        script_segment: segment,
        spec,
        status: 'waiting',
        duration_s: duration,
        continuity_group: null,
        dialogue,
      });
    }
    const onScreenText = manualTextTimeline(parsed.scenes, planScenes);
    const characterRefs = await generateInitialCharacterSheets(
      film, proposedCast, characterSheetStyle({ video_style: params.videoStyle || 'custom', custom_visual_direction: params.customVisualDirection || globalStyle, visual_style: globalStyle }), params.characterRefUrl || null, atReferences, hooks,
    );
    await patchFilm(film, hooks, {
      status: 'plan_ready',
      plan: {
        title: String(film.title || 'Manual script film'),
        style_direction: globalStyle,
        visual_style: globalStyle,
        story_summary: parsed.scenes.map((s) => `${s.index}. ${s.title}`).join(' · ').slice(0, 1200),
        world: '',
        characters: proposedCast,
        scenes: planScenes,
        on_screen_text: onScreenText,
        assumptions: params.note ? [String(params.note)] : [],
        input_mode: 'manual',
        global_style: globalStyle,
        requested_duration_s: requestedDuration || parsed.scenes.reduce((n, scene) => n + scene.durationSec, 0),
        contract_version: 2,
        entry_type: params.entryType || 'script', control_mode: 'manual', execution_mode: params.executionMode || 'review',
        motion_engine: params.motionEngine || 'browser',
        video_style: params.videoStyle || 'custom', custom_visual_direction: params.customVisualDirection || globalStyle,
        target_duration_sec: requestedDuration || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0),
        audio_policy: params.audioPolicy || 'native-dialogue-effects',
        max_authorized_credits: Number(params.maxAuthorizedCredits) || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0),
        master_script_version: 1, scene_plan_version: 1,
        model_registry_snapshot: { version: S2V_CAPABILITY_REGISTRY_VERSION, captured_at: new Date().toISOString(), capabilities: S2V_VIDEO_CAPABILITIES },
        project_asset_ids: [], storyboard_only_asset_ids: [], storyboard_requested: params.storyboardRequested === true, writer_model: 'GPT Sol', clip_ids: planScenes.map((scene) => scene.scene_key),
        sections: buildLongFormSections(requestedDuration || planScenes.reduce((sum, scene) => sum + scene.duration_s, 0), planScenes.map((scene) => scene.duration_s)),
        continuity_manifest: { version: 1, cast: Object.fromEntries(proposedCast.map((character) => [character.id, character.kind === 'narrator' ? { name: character.name, appearance: '', wardrobe: '', voice: character.voice } : { name: character.name, appearance: character.appearance, wardrobe: character.wardrobe, voice: character.voice }])), style: { direction: params.customVisualDirection || globalStyle, lock: params.styleLock !== false }, locations: {}, products: {}, handoffs: [] },
        orchestration: { state: params.executionMode === 'automatic' ? 'auto_authorized' : 'awaiting_approval', intent: 'plan', checkpoint: 'storyboard_ready', manual_locks: { script: true, model: true, prompts: true }, paused: false, cancel_requested: false, completed_count: 0, total_count: planScenes.length, credits_estimated: planScenes.reduce((sum, scene) => sum + scene.duration_s, 0), credits_reserved: 0, credits_actual: 0, billed_so_far: 0, updated_at: new Date().toISOString() },
        editor_composition_version: 0, export_records: [],
        audio_enabled: params.audioEnabled !== false,
        narration_enabled: params.audioEnabled !== false && params.narrationEnabled === true,
        characters_speak: params.audioEnabled !== false && params.charactersSpeak === true,
        cast_reviewed: characterRefs.every((character) => character.sheet_required === false),
      },
      character_refs: characterRefs,
      stage_note: characterRefs.some((character) => character.sheet_required !== false)
        ? `${parsed.scenes.length} scenes read from your script. Review and approve ${characterRefs.filter((character) => character.sheet_required !== false).length} proposed cast sheet${characterRefs.filter((character) => character.sheet_required !== false).length === 1 ? '' : 's'} before Start.`
        : `${parsed.scenes.length} scenes read from your script. No clear characters were found — add one if needed, or confirm this character-free plan.`,
    });

    const scenes = await db.listScenes(film.id);
    const fresh = await db.getFilm(film.id);
    return { film: fresh || film, scenes };
  } catch (e: any) {
    await db.updateFilm(film.id, { status: 'error', error: String(e?.message || e), stage_note: 'The pasted script could not be turned into scenes.' });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — generate ONE scene (explicitly triggered), then extract the frame
// ---------------------------------------------------------------------------

export async function generateScene(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
  opts: {
    /** Multi-generate only: this scene may render alongside others. */
    allowConcurrent?: boolean;
    /** false = do not prepare the following scene's prompt when this clip
     * lands (a batch run prepares nothing, so parallel renders cannot race
     * each other rewriting the same waiting scene). */
    prepareNext?: boolean;
  } = {},
): Promise<void> {
  // A scene counts as prepared when it actually HAS a prompt — the prompt
  // field itself is the authority. The old guard also required the status
  // flag to read 'ready', and when that flag lagged behind the written prompt
  // it threw a false "no prepared prompt" error (and silently blocked
  // generation) on scenes whose prompt was plainly visible on the card.
  const preparedPrompt = typeof scene.prompt === 'string' ? scene.prompt.trim() : '';
  if (!preparedPrompt) throw new Error(`Scene ${scene.idx + 1} has no prepared prompt yet — prepare it first.`);
  if (!opts.allowConcurrent && scenes.some((s) => s.status === 'generating')) throw new Error('Another scene is already generating — clips render one at a time.');

  let beforeSpec = (scene.spec || {}) as VideoClipSpec;
  let billingBackground = { ...(beforeSpec.background || {}) };
  const baseCreditKey = String(billingBackground.idempotency_key || `stv:film:${film.id}:scene:${scene.id}`);
  const activeCreditKey = String(billingBackground.active_credit_key || baseCreditKey);
  // A previous terminal refund may have failed only because the tab's session
  // expired. Confirm it before minting a fresh paid attempt; reusing the old
  // charge while a refund is pending could either deliver for free later or
  // double-charge if a new key were started prematurely.
  if (billingBackground.terminal_refund_pending_key === activeCreditKey) {
    await refundCreditsStrict(activeCreditKey, 'Reconcile the previous terminal Script-to-Video failure before Retry');
    billingBackground = {
      ...billingBackground,
      terminal_refunded_key: activeCreditKey,
      terminal_refunded_at: new Date().toISOString(),
      terminal_refund_pending_key: undefined,
      terminal_refund_error: undefined,
    };
  }
  const previousAttempt = Math.max(1, Number(billingBackground.credit_attempt || 1));
  const needsFreshCharge = billingBackground.terminal_refunded_key === activeCreditKey || Boolean(scene.asset_url);
  const creditAttempt = needsFreshCharge ? previousAttempt + 1 : previousAttempt;
  const creditKey = needsFreshCharge ? `${baseCreditKey}:attempt:${creditAttempt}` : activeCreditKey;
  billingBackground = {
    ...billingBackground,
    active_credit_key: creditKey,
    credit_attempt: creditAttempt,
  };
  beforeSpec = { ...beforeSpec, background: billingBackground };
  await patchFilm(film, hooks, { status: 'producing', error: null });
  await setState(film, hooks, 'GENERATING_VIDEO', `Scene ${scene.idx + 1}: generating the clip…`);
  const beforeBackground = { ...billingBackground, status: 'submitted' as const, provider_status: 'submitting', retries: Number(billingBackground.retries || 0) };
  await patchScene(scene, hooks, { status: 'generating', error: null, spec: { ...beforeSpec, background: beforeBackground } });
  try {
    const spec = (scene.spec || {}) as VideoClipSpec;
    const aspect = (film.aspect_ratio || '16:9') as Aspect;
    // A completed clip stores its measured length (e.g. 8.04s); round it so a
    // retry or regenerate is checked against the planned whole-second block.
    const durationS = Math.round(Number(scene.duration_s) || 6) || 6;
    // AI plans carry a per-shot routed engine. Manual and legacy scenes fall
    // back to the film-level choice so existing projects keep working.
    const chosenModel = resolveVideoModel(spec.engine_id || film.video_model);
    let requestAssets = scene.idx === 0
      ? (scene.reference_assets || []).filter((asset) => asset && !asset.storyboardOnly && asset.type !== 'storyboard'
        && !(asset.characterId && (film.character_refs || []).some((character) => character.kind === 'narrator' && String(character.id) === String(asset.characterId))))
      : (scene.reference_assets || []).filter((asset) => asset && asset.type !== 'continuity-frame' && asset.role !== 'first_frame');
    if (scene.idx > 0) {
      const previous = immediatePreviousScene(scenes, scene.idx);
      const extraction = frameExtractionOf(previous);
      if (!previous || (previous.status !== 'completed' && !(previous.status === 'skipped' && extraction?.status === 'continued_without'))) throw new Error(`Scene ${scene.idx + 1} is waiting for Scene ${scene.idx} to finish and validate its last frame.`);
      if (isHttpUrl(previous.keyframe_url)) {
        const check = await validateFrameUrl(String(previous.keyframe_url), aspect);
        if (!check.ok) {
          const previousSpec = (previous.spec || {}) as VideoClipSpec;
          await patchScene(previous, hooks, {
            status: 'needs_action', keyframe_url: null,
            error: `The saved continuity frame is no longer valid: ${check.reason || 'validation failed'}`,
            spec: { ...previousSpec, background: { ...(previousSpec.background || {}), frame_extraction: { status: 'failed', error: check.reason || 'The saved frame failed validation.' } } },
          });
          throw new Error(`Scene ${scene.idx + 1} was not submitted. Retry frame extraction on Scene ${scene.idx}, or explicitly continue without continuity.`);
        }
        requestAssets = [{
          role: 'first_frame', url: String(previous.keyframe_url), type: 'continuity-frame', label: `Scene ${previous.idx + 1} last frame`,
          sourceSceneId: previous.id, sourceSceneIndex: previous.idx, method: extraction?.method, atSecond: extraction?.at_second,
          priority: 600, critical: true,
        }, ...requestAssets];
      } else if (extraction?.status !== 'continued_without') {
        throw new Error(`Scene ${scene.idx + 1} was not submitted. It is waiting for Scene ${scene.idx}'s validated last frame.`);
      }
      await patchScene(scene, hooks, { reference_assets: requestAssets, continuation: requestAssets[0]?.type === 'continuity-frame', reference_type: requestAssets[0]?.type === 'continuity-frame' ? 'previous_final_frame' : 'none' });
    }
    // Storyboard frames guide the models that accept image input. With a
    // continuity frame in the first-frame slot the storyboard rides along as a
    // reference (Gemini Omni Flash keeps it; Seedance 2.5 records it as dropped
    // because it cannot combine both). Without one, the storyboard opens the
    // block as its first frame, matching the durable server runner.
    const storyboardUrl = String((spec as any).storyboard_url || '');
    if (isHttpUrl(storyboardUrl) && (chosenModel.id === 'omni-1.1-flash' || chosenModel.id === 'seedance-2.5') && !requestAssets.some((asset) => asset?.url === storyboardUrl)) {
      const seeded = requestAssets.some((asset) => asset?.role === 'first_frame');
      requestAssets = seeded
        ? [...requestAssets, { role: 'reference', url: storyboardUrl, type: 'storyboard', label: `Block ${scene.idx + 1} storyboard frame`, priority: 450 }]
        : [{ role: 'first_frame', url: storyboardUrl, type: 'storyboard', label: `Block ${scene.idx + 1} storyboard keyframe`, priority: 600, critical: true }, ...requestAssets];
    }
    const useHyperframes = film.plan?.motion_engine === 'hyperframes'
      && (spec.workflow_kind === 'code' || scene.type === 'web_graphic' || scene.type === 'product_mockup' || scene.type === 'asset_overlay');
    if (useHyperframes) {
      say(hooks, `Scene ${scene.idx + 1}: writing a deterministic HyperFrames composition…`);
      const title = `${film.title || 'Script-to-Video'} · scene ${scene.idx + 1}`;
      const rendered = await createHyperframesMotion({
        brief: [
          preparedPrompt,
          `Exact source segment: ${scene.script_segment}`,
          `Film direction: ${film.plan?.custom_visual_direction || film.plan?.visual_style || film.plan?.style_direction || ''}`,
          'This is a code-rendered motion or overlay scene. Preserve exact supplied words and do not invent claims.',
        ].join('\n\n'),
        title,
        appId: 'script-to-video',
        aspect,
        duration: durationS,
        fps: 30,
        idempotencyKey: `s2v-hyperframes:${film.id}:${scene.id}:${scene.clip_fingerprint || scene.scene_key}`.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 255),
      });
      const videoUrl = String(rendered.render.videoUrl || '');
      if (!videoUrl) throw new Error('HyperFrames completed without a video URL.');
      await setState(film, hooks, 'VIDEO_COMPLETED', `Scene ${scene.idx + 1}: HyperFrames clip landed.`);
      await patchScene(scene, hooks, {
        asset_url: videoUrl,
        veo_operation_id: null,
        spec: {
          ...spec,
          background: {
            ...(spec.background || {}),
            status: 'succeeded',
            provider_status: 'completed',
            provider_job_id: rendered.render.renderId,
            credits_estimated: 0,
            credits_actual: 0,
            hyperframes: { render_id: rendered.render.renderId, composition_html: rendered.composition.html, timeline: rendered.composition.timeline },
          },
        } as VideoClipSpec,
      });
      await finalizeScene(film, scenes, scene, hooks, videoUrl, { prepareNext: opts.prepareNext });
      return;
    }

    const hasSeedFrame = requestAssets.some((asset) => asset?.role === 'first_frame');
    const modelMin = Math.max(1, Number(chosenModel.minDuration) || 1);
    const modelMax = Math.max(modelMin, Number(chosenModel.safeMaxDuration) || modelMin);
    const discreteOk = !chosenModel.discreteDurations || chosenModel.supportedDurations.includes(Math.round(durationS));
    if (durationS < modelMin || durationS > modelMax || !discreteOk) {
      const legal = chosenModel.discreteDurations
        ? chosenModel.supportedDurations.join('s or ') + 's'
        : `${modelMin}–${modelMax}s`;
      throw new Error(`Scene ${scene.idx + 1} cannot be submitted: ${chosenModel.label} accepts ${legal}; this block is ${Math.round(durationS)}s.`);
    }

    // RECOVERY LADDER (see ./resilience). The aspect, duration, references,
    // negative prompt and creditKey are IDENTICAL on every automatic attempt,
    // so the shot never changes and vv-credits authorizes exactly one charge.
    // No rung refunds eagerly: success keeps that charge; only the terminal
    // catch refunds it after every retry and fallback has failed.
    //
    //   · a dropped connection or an overloaded provider (429 / 5xx / client
    //     timeout) → the identical request again, up to TRANSIENT_ATTEMPTS
    //     times, with exponential backoff between tries
    //   · a refused REQUEST (400 / 422 / moderation wording) → the same shot
    //     rephrased, once
    //   · still failing, and another engine could plausibly take it → one run
    //     on the verified fallback engine, announced to the creator
    //
    // A refusal that follows the person rather than the request — no credits,
    // no proven sign-in, an unapproved cast sheet — leaves the ladder at once.
    const attempts: { prompt: string; model: VideoModelConfig }[] = [{ prompt: preparedPrompt, model: chosenModel }];
    let job: Awaited<ReturnType<typeof VideoModelService.createVideo>> | null = null;
    /** The config the job actually went out on — the provider fallback may
     * have moved it — so the poll loop uses THAT model's interval and
     * timeout rather than Omni Flash's. */
    let jobModel: VideoModelConfig = chosenModel;
    let submitError: any = null;
    let lastError: any = null;
    let rephrased = '';
    /** Sends of the identical request to the CURRENT engine. Reset when the
     * ladder moves on, so a stand-in engine gets its own attempt budget. */
    let sameEngineTries = 1;
    let totalTries = 0;
    let rephrasedOnce = false;
    let switchedEngine = false;
    const enginesTried: VideoModelConfig[] = [chosenModel];
    for (let step = 0; step < attempts.length && !job; step += 1) {
      const attempt = attempts[step];
      try {
        totalTries += 1;
        job = await VideoModelService.createVideo({
          prompt: attempt.prompt,
          negative: spec.negative,
          aspect,
          durationS,
          referenceAssets: requestAssets,
          model: attempt.model,
          creditKey,
          refundOnFailure: false,
          generateAudio: film.plan?.audio_enabled !== false,
          onRequestBuilt: async (evidence) => {
            const normalizedEvidence = scene.idx > 0 && evidence.frame_chain.status === 'first_scene'
              ? { ...evidence, frame_chain: { source_scene_id: immediatePreviousScene(scenes, scene.idx)?.id, source_scene_index: scene.idx - 1, status: 'continued_without' as const } }
              : evidence;
            const currentSpec = (scene.spec || spec) as VideoClipSpec;
            await patchScene(scene, hooks, {
              spec: {
                ...currentSpec,
                request_evidence: normalizedEvidence,
                excluded_optional_references: normalizedEvidence.dropped.map((asset) => ({ asset_id: asset.assetId, url: asset.url, type: asset.type, label: asset.label, reason: asset.dropReason })),
              },
            });
          },
        });
        jobModel = attempt.model;
        if (job.warning) say(hooks, `Scene ${scene.idx + 1}: ${job.warning}`);
        // The board shows the prompt that actually rendered.
        if (step > 0 && attempt.prompt !== preparedPrompt) await patchScene(scene, hooks, { prompt: attempt.prompt });
      } catch (e: any) {
        lastError = e;
        // The FIRST refusal is the one the creator is told about: it came from
        // the engine they chose. A stand-in's later failure is evidence for the
        // owner, not the headline.
        if (!submitError) submitError = e;

        // Same request, same engine, after a wait. Nothing about the request is
        // wrong, so rewording it or paying a second engine are both premature.
        if (isTransientProviderFailure(e) && sameEngineTries < TRANSIENT_ATTEMPTS) {
          const waitMs = transientBackoffMs(sameEngineTries);
          sameEngineTries += 1;
          const liveSpec = (scene.spec || spec) as VideoClipSpec;
          await patchScene(scene, hooks, {
            spec: {
              ...liveSpec,
              background: {
                ...(liveSpec.background || {}),
                status: 'retrying',
                provider_status: 'retrying',
                retries: totalTries,
                next_retry_at: new Date(Date.now() + waitMs).toISOString(),
              },
            },
          });
          say(hooks, `Scene ${scene.idx + 1}: ${attempt.model.label} did not answer — sending the same request again in ${Math.round(waitMs / 1000)}s (attempt ${sameEngineTries} of ${TRANSIENT_ATTEMPTS}). Nothing extra is charged.`);
          await sleep(waitMs);
          attempts.push(attempt);
          continue;
        }

        // A refused REQUEST gets exactly one rephrase, on whichever engine is
        // current: the same shot, different sentences.
        if (isBadRequest(e) && !rephrasedOnce) {
          rephrasedOnce = true;
          say(hooks, `Scene ${scene.idx + 1}: the provider refused this request — retrying with a rephrased prompt…`);
          rephrased = await rephraseVideoPrompt(attempt.prompt, String(e?.message || e));
          if (rephrased && rephrased !== attempt.prompt) {
            attempts.push({ prompt: rephrased, model: attempt.model });
            continue;
          }
        }

        // Everything this engine can be asked has been asked. Hand the block to
        // the verified fallback engine once, with its own attempt budget.
        if (!switchedEngine && canTryAnotherModel(e)) {
          const next = fallbackChain(attempt.model, { hasSeedFrame, durationS })[0];
          if (next) {
            switchedEngine = true;
            sameEngineTries = 1;
            enginesTried.push(next);
            say(hooks, `Scene ${scene.idx + 1}: ${attempt.model.label} could not deliver this block after ${totalTries} attempt${totalTries === 1 ? '' : 's'} — switching to ${next.label} for one more try. No extra credits are charged.`);
            attempts.push({ prompt: attempt.prompt, model: next });
            continue;
          }
        }
        break;
      }
    }
    if (!job) {
      // The headline stays the chosen engine's own refusal. What was actually
      // tried goes with the evidence rather than into the sentence the creator
      // reads: it is how an owner tells one bad engine apart from a genuinely
      // unreachable provider.
      const headline: any = submitError || new Error(`Scene ${scene.idx + 1} could not be submitted to any video provider.`);
      headline.message = appendTechnicalDetails(String(headline.message || headline), [
        `attempts=${totalTries}`,
        `engines=${enginesTried.map((model) => model.apiModel).join(' → ')}`,
        lastError && lastError !== headline ? `stand-in engine answered: ${publicPartOf(lastError?.message || lastError)}` : '',
      ].filter(Boolean).join(' · '));
      throw headline;
    }
    const engineSwitched = jobModel.id !== chosenModel.id;
    if (engineSwitched) {
      say(hooks, `Scene ${scene.idx + 1}: rendered with ${jobModel.label} instead of ${chosenModel.label}. Choose a different model from the scene panel if you would rather this block came from somewhere else.`);
    } else if (totalTries > 1) {
      say(hooks, `Scene ${scene.idx + 1}: ${jobModel.label} accepted the block on attempt ${totalTries}.`);
    }
    // The job id is capped before it is written: some providers (Seedance
    // 2.0, a few Runway/OpenRouter models) answer with ids long enough that
    // the data API refused the value ("value too long") and failed the whole
    // scene write — losing the id of a render already paid for.
    await patchScene(scene, hooks, {
      veo_operation_id: job.jobId.slice(0, MAX_OPERATION_ID_CHARS),
      spec: {
        ...spec,
        excluded_optional_references: job.requestEvidence.dropped.map((asset) => ({ asset_id: asset.assetId, url: asset.url, type: asset.type, label: asset.label, reason: asset.dropReason })),
        request_evidence: scene.idx > 0 && job.requestEvidence.frame_chain.status === 'first_scene'
          ? { ...job.requestEvidence, frame_chain: { source_scene_id: immediatePreviousScene(scenes, scene.idx)?.id, source_scene_index: scene.idx - 1, status: 'continued_without' as const } }
          : job.requestEvidence,
        background: {
          ...(spec.background || {}),
          status: 'processing',
          provider_status: 'processing',
          provider_job_id: job.jobId.slice(0, MAX_OPERATION_ID_CHARS),
          retries: Math.max(0, totalTries - 1),
          next_retry_at: '',
          requested_model: chosenModel.apiModel,
          actual_model: jobModel.apiModel,
          model_fallback: engineSwitched ? `${chosenModel.label} → ${jobModel.label}` : null,
        },
      },
    });
    const videoUrl = await VideoModelService.getVideoResult(job.jobId, {
      onProgress: (p) => say(hooks, `Scene ${scene.idx + 1}: rendering… ${Math.round(p)}%`),
      creditKey,
      model: jobModel,
      refundOnFailure: false,
    });
    await setState(film, hooks, 'VIDEO_COMPLETED', `Scene ${scene.idx + 1}: clip landed.`);
    await patchScene(scene, hooks, { asset_url: videoUrl, veo_operation_id: null });
    await finalizeScene(film, scenes, scene, hooks, videoUrl, { prepareNext: opts.prepareNext });
  } catch (e: any) {
    const failedSpec = (scene.spec || {}) as VideoClipSpec;
    const message = String(e?.message || e);
    const continuityBlocked = /was not submitted|is waiting for Scene .*last frame|waiting for Scene .*finish and validate/i.test(message);
    let refundConfirmed = false;
    let refundError = '';
    if (!continuityBlocked) {
      try {
        await refundCreditsStrict(creditKey, `Scene ${scene.idx + 1} failed after every automatic provider attempt`);
        refundConfirmed = true;
      } catch (refundFailure: any) {
        refundError = String(refundFailure?.message || refundFailure);
      }
    }
    const failedBackground = {
      ...(failedSpec.background || {}),
      status: continuityBlocked ? 'needs_action' as const : 'failed' as const,
      provider_status: continuityBlocked ? 'waiting_for_frame' : 'failed',
      retries: Number(failedSpec.background?.retries || 0),
      ...(refundConfirmed ? {
        terminal_refunded_key: creditKey,
        terminal_refunded_at: new Date().toISOString(),
        terminal_refund_pending_key: undefined,
        terminal_refund_error: undefined,
      } : refundError ? {
        terminal_refund_pending_key: creditKey,
        terminal_refund_error: refundError,
      } : {}),
    };
    await patchScene(scene, hooks, {
      status: continuityBlocked ? 'ready' : 'failed', error: message, veo_operation_id: null,
      spec: { ...failedSpec, background: failedBackground },
    });
    await setState(film, hooks, continuityBlocked ? 'FRAME_READY' : 'PROMPT_READY', continuityBlocked
      ? `Scene ${scene.idx + 1} was not submitted. Resolve the prior scene's continuity frame first.`
      : refundConfirmed
        ? `Scene ${scene.idx + 1} failed after its automatic retries, and its credits were returned. Completed scenes are untouched. Retry it, regenerate the prompt, choose another model, or Skip it to release the rest of the film.`
        : `Scene ${scene.idx + 1} failed after its automatic retries. Its refund is pending reconciliation, so Retry will confirm that refund before starting a new paid attempt. Completed scenes are untouched.`);
    throw e;
  }
}

/** Real duration → FFmpeg final frame → continuity attributes → director check
 * → scene completed → next scene's reference decided and prompt prepared.
 *
 * Every step is bounded. By the time this runs the clip has rendered and is
 * stored. If every extractor fails, the clip is preserved in needs_action and
 * no dependent scene is submitted until Retry frame or an explicit override. */
async function finalizeScene(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
  videoUrl: string,
  opts: { frameTimeoutMs?: number; prepareNext?: boolean } = {},
): Promise<void> {
  const aspect = (film.aspect_ratio || '16:9') as Aspect;
  const frameBudget = opts.frameTimeoutMs ?? FRAME_EXTRACTION_TIMEOUT_MS;
  await setState(film, hooks, 'EXTRACTING_FINAL_FRAME', `Scene ${scene.idx + 1}: reading the real clip duration and extracting the final frame…`);

  let realDuration = 0;
  try { realDuration = await withTimeout(probeVideoDuration(videoUrl), PROBE_TIMEOUT_MS, 'Reading the clip duration'); } catch { realDuration = 0; }
  const extractingSpec = (scene.spec || {}) as VideoClipSpec;
  await patchScene(scene, hooks, {
    spec: { ...extractingSpec, background: { ...(extractingSpec.background || {}), frame_extraction: { status: 'extracting' } } },
  });
  let finalFrameUrl: string | null = null;
  let extractedFrame: Awaited<ReturnType<typeof extractFinalFrame>> | null = null;
  let frameError = '';
  const progressLabel: Record<string, string> = {
    'loading-ffmpeg': 'loading FFmpeg.wasm',
    'decoding-video': 'decoding the clip near its real end',
    'validating-frame': 'validating decode, aspect ratio and pixels',
    'uploading-frame': 'uploading the durable PNG',
    'canvas-fallback': 'trying the browser canvas fallback',
  };
  try {
    extractedFrame = await withTimeout(extractFinalFrame(videoUrl, aspect, (stage) => {
      const progressNote = `Scene ${scene.idx + 1}: ${progressLabel[stage] || stage}…`;
      say(hooks, progressNote);
      try { hooks.onFilm?.({ stage_note: progressNote }); } catch { /* live progress only */ }
    }), frameBudget, 'Final frame extraction');
    finalFrameUrl = extractedFrame.url;
  } catch (e: any) {
    frameError = String(e?.message || e).slice(0, 500);
  }
  let firstFrameUrl: string | null = null;
  try { firstFrameUrl = await withTimeout(canvasExtractFrame(videoUrl, 0.15), PROBE_TIMEOUT_MS, 'Thumbnail capture'); } catch { /* thumbnail only */ }

  if (!finalFrameUrl || !extractedFrame) {
    const failedSpec = (scene.spec || {}) as VideoClipSpec;
    await patchScene(scene, hooks, {
      status: 'needs_action',
      error: `Continuity frame extraction failed: ${frameError || 'no validated frame was produced'}`,
      asset_url: videoUrl,
      first_frame_url: firstFrameUrl,
      keyframe_url: null,
      validation: { pass: false, issues: frameError || 'No validated continuity frame was produced.', method: 'frame_extraction' },
      spec: { ...failedSpec, background: { ...(failedSpec.background || {}), frame_extraction: { status: 'failed', error: frameError || 'No validated continuity frame was produced.' } } },
    });
    await setState(film, hooks, 'FRAME_READY', `Scene ${scene.idx + 1}'s clip is safe, but its final frame could not be validated. Retry frame extraction, or explicitly continue without continuity.`);
    return;
  }

  await setState(film, hooks, 'FRAME_READY', `Scene ${scene.idx + 1}: final frame captured, validated and uploaded.`);

  // Manual mode skips creative end-state rewriting, but it still runs the
  // required post-clip visibility check before a frame can pass forward.
  const manual = isManualFilm(film);
  let attrs: any = null;
  if (finalFrameUrl && !manual) {
    say(hooks, `Scene ${scene.idx + 1}: reading the end state for continuity…`);
    try { attrs = await withTimeout(extractVisualAttributes(finalFrameUrl), DIRECTOR_TIMEOUT_MS, 'Reading the end state'); } catch { attrs = null; }
  }
  const frames = [firstFrameUrl, finalFrameUrl].filter(Boolean) as string[];
  const expectedIds = Array.isArray(((scene.spec || {}) as VideoClipSpec).characters) ? (((scene.spec || {}) as VideoClipSpec).characters || []).map(String) : [];
  const expectedCharacters = (Array.isArray(film.character_refs) ? film.character_refs : [])
    .filter((character) => character.kind !== 'narrator' && expectedIds.includes(String(character.id)))
    .map((character) => ({ id: String(character.id), name: character.name, appearance: character.appearance, wardrobe: character.wardrobe }));
  let verdict: { pass: boolean; issues: string; method: string } = {
    pass: false,
    issues: 'No decoded frame was available for the required post-clip character visibility check.',
    method: 'vision_unavailable',
  };
  if (frames.length) {
    try { verdict = await withTimeout(validateScene(scene, frames, expectedCharacters, sceneTextItems(film, scene)), DIRECTOR_TIMEOUT_MS, 'The post-clip character visibility check'); }
    catch { verdict = { pass: false, issues: 'The post-clip character visibility check could not complete, so this frame cannot be passed forward.', method: 'vision_unavailable' }; }
  }

  const completedSpec = (scene.spec || {}) as VideoClipSpec;
  const repairReason = !videoUrl
    ? 'the rendered clip URL is missing'
    : verdict.pass === false
      ? String(verdict.issues || 'the automatic scene check failed')
      : '';
  if (repairReason) {
    const repairAttempts = Number(completedSpec.background?.repair_attempts || 0);
    const creditCost = Number(completedSpec.background?.credits_estimated || scene.duration_s || 0);
    if (repairAttempts < 1) {
      const repairSpec: VideoClipSpec = {
        ...completedSpec,
        background: { ...(completedSpec.background || {}), repair_attempts: repairAttempts + 1, status: 'retrying', provider_status: 'repairing' },
      };
      await patchScene(scene, hooks, { status: 'ready', validation: verdict, error: `Automatic check: ${repairReason}.`, spec: repairSpec });
      say(hooks, `Scene ${scene.idx + 1} did not pass its automatic check (${repairReason}) — repairing it once${creditCost > 0 ? ` (up to ${creditCost} video credits)` : ''}.`);
      try {
        await regenerateScenePrompt(film, scenes, scene, hooks, `Automatic check failed: ${repairReason}. Correct this exact defect; preserve the approved story, cast, timing and style.`);
        const preparedRepairSpec = (scene.spec || {}) as VideoClipSpec;
        await patchScene(scene, hooks, {
          spec: { ...preparedRepairSpec, background: { ...(preparedRepairSpec.background || {}), repair_attempts: repairAttempts + 1 } },
        });
        await generateScene(film, scenes, scene, hooks, { prepareNext: opts.prepareNext });
      } catch (repairError: any) {
        await patchScene(scene, hooks, { status: 'failed', error: `Automatic repair did not pass: ${String(repairError?.message || repairError).slice(0, 180)}` });
      }
      return;
    }
    await patchScene(scene, hooks, {
      status: 'failed', validation: verdict,
      error: `Automatic repair was already used; this scene still needs attention: ${repairReason}.`,
      spec: { ...completedSpec, background: { ...(completedSpec.background || {}), status: 'needs_action', provider_status: 'failed' } },
    });
    await setState(film, hooks, 'PROMPT_READY', `Scene ${scene.idx + 1} still needs attention after one automatic repair. Retry it once from the scene card.`);
    return;
  }
  await patchScene(scene, hooks, {
    status: 'completed',
    error: null,
    first_frame_url: firstFrameUrl,
    keyframe_url: finalFrameUrl,
    visual_attributes: attrs,
    validation: verdict,
    duration_s: realDuration || scene.duration_s,
    spec: { ...completedSpec, background: { ...(completedSpec.background || {}), status: 'succeeded', provider_status: 'completed', actual_duration_s: realDuration || Number(scene.duration_s) || undefined, credits_actual: Number(completedSpec.background?.credits_estimated || scene.duration_s || 0), frame_extraction: { status: 'ready', method: extractedFrame.method, at_second: extractedFrame.atSecond, url: extractedFrame.url } } },
  });
  if (film.plan?.orchestration) {
    const flow = film.plan.orchestration;
    const actualCredits = Number(completedSpec.background?.credits_estimated || scene.duration_s || 0);
    const handoff = finalFrameUrl ? { from_clip_id: scene.scene_key, frame_url: finalFrameUrl, attributes: attrs || {}, created_at: new Date().toISOString() } : null;
    const plan = {
      ...film.plan,
      continuity_manifest: film.plan.continuity_manifest ? { ...film.plan.continuity_manifest, handoffs: handoff ? [...film.plan.continuity_manifest.handoffs, handoff] : film.plan.continuity_manifest.handoffs } : film.plan.continuity_manifest,
      orchestration: { ...flow, state: 'generating' as const, checkpoint: `clip_${scene.idx + 1}_completed`, completed_count: Math.min(flow.total_count, Number(flow.completed_count || 0) + 1), credits_actual: Number(flow.credits_actual || 0) + actualCredits, billed_so_far: Number(flow.billed_so_far || 0) + actualCredits, updated_at: new Date().toISOString() },
    };
    await patchFilm(film, hooks, { plan });
  }
  if (finalFrameUrl) {
    await db.addAsset({ film_id: film.id, kind: 'keyframe', name: `Scene ${scene.idx + 1} final frame`, description: `Continuity reference — ${String(scene.script_segment).slice(0, 120)}`, url: finalFrameUrl });
  }

  // STYLE LOCK — scene 1 is the clip that decides what this film looks like.
  // Its fingerprint is read ONCE, the moment that clip is in the can, and
  // every later prompt then carries it. A failure here is cosmetic: the film
  // simply continues without a lock.
  if (scene.idx === 0 && film.style_lock === true && !film.style_lock_description && scene.prompt) {
    try {
      say(hooks, 'Style lock: reading scene 1’s look so every later clip matches it…');
      const fingerprint = await withTimeout(
        extractStyleFingerprint({ film, prompt: String(scene.prompt) }),
        DIRECTOR_TIMEOUT_MS,
        'Reading the film’s visual style',
      );
      if (fingerprint) await patchFilm(film, hooks, { style_lock_description: fingerprint });
    } catch (e: any) {
      say(hooks, `The style lock could not be read (${String(e?.message || e).slice(0, 120)}) — the film continues without it.`);
    }
  }

  // Decide the NEXT scene's reference and prepare its prompt — preparation
  // only. Generation always waits for an explicit trigger. A preparation
  // failure never touches THIS scene: its clip just landed and stays completed.
  const next = orderedScenes(scenes).find((s) => s.idx > scene.idx && !DONE.has(String(s.status)) && s.status !== 'generating');
  if (next && opts.prepareNext !== false) {
    try {
      await prepareScene(film, scenes, next, hooks);
    } catch (e: any) {
      say(hooks, `Scene ${next.idx + 1} could not be prepared (${String(e?.message || e).slice(0, 140)}) — scene ${scene.idx + 1} is safely completed; retry the preparation from the board.`);
    }
  } else if (allScenesDone(scenes)) {
    await setState(film, hooks, 'ALL_SCENES_COMPLETED', 'All video scenes are complete — prepare the audio and run Final Assembly.');
  }
}

// ---------------------------------------------------------------------------
// Per-scene recovery — never restart the project, never lose completed scenes
// ---------------------------------------------------------------------------

/** [Retry] — rerun generation with the SAME prompt and references.
 *
 * BUG FIX (Sep 27 2026): the old version flipped the scene to 'ready' and
 * cleared its error BEFORE generateScene's pre-flight guards ran. When a
 * guard threw ("Another scene is already generating"), the scene was left
 * stranded at 'ready' with its failure context wiped — the Retry / New
 * prompt / Skip recovery row disappeared even though nothing had been
 * retried. The guard is now checked first, and a throw that happens before
 * the render actually starts restores the failed state with its error. */
export async function retryScene(film: Film, scenes: FilmScene[], scene: FilmScene, hooks: RunHooks): Promise<void> {
  if (!scene.prompt) { await prepareScene(film, scenes, scene, hooks); return; }
  if (scenes.some((s) => s.id !== scene.id && s.status === 'generating')) {
    throw new Error('Another scene is already generating — clips render one at a time. Wait for it to finish, then retry.');
  }
  const previousError = scene.error;
  await patchScene(scene, hooks, { status: 'ready', error: null });
  try {
    await generateScene(film, scenes, scene, hooks);
  } catch (e: any) {
    // generateScene marks a scene 'failed' itself when the render fails; only
    // a pre-flight throw leaves it at 'ready' — restore the failed state so
    // the recovery actions stay on screen with an honest reason.
    if (scene.status === 'ready') {
      await patchScene(scene, hooks, { status: 'failed', error: String(e?.message || e) || previousError });
    }
    throw e;
  }
}

/** [Regenerate Prompt] — Opus re-analyzes the scene (with the failure or a
 * user instruction as context) and writes an improved prompt. */
export async function regenerateScenePrompt(film: Film, scenes: FilmScene[], scene: FilmScene, hooks: RunHooks, instruction?: string): Promise<void> {
  const note = [instruction, scene.error ? `Previous failure: ${scene.error}` : ''].filter(Boolean).join(' · ') || 'Improve the prompt — the previous attempt was unsatisfying.';
  await prepareScene(film, scenes, scene, hooks, { revisionNote: note });
}

/** Retry only the extraction/validation/upload stage from the already-paid
 * clip. No provider generation is submitted and no video credit is spent. */
export async function retryFinalFrame(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
): Promise<void> {
  if (!isHttpUrl(scene.asset_url)) throw new Error('This scene has no durable clip to extract a frame from. Retry the video instead.');
  await finalizeScene(film, scenes, scene, hooks, String(scene.asset_url), { frameTimeoutMs: FRAME_EXTRACTION_TIMEOUT_MS });
}

/** The sole escape hatch for a failed chain. The choice is persisted on the
 * source scene before the following scene can be prepared or submitted. */
export async function continueWithoutContinuityFrame(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
): Promise<void> {
  if (!isHttpUrl(scene.asset_url)) throw new Error('There is no completed clip to keep. Retry the video instead.');
  const spec = (scene.spec || {}) as VideoClipSpec;
  const choiceAt = new Date().toISOString();
  await patchScene(scene, hooks, {
    status: 'completed', error: null, keyframe_url: null,
    validation: { ...(scene.validation || {}), pass: true, issues: 'Creator explicitly continued without a continuity frame after extraction failed.', method: 'explicit_continue_without_continuity' },
    spec: { ...spec, background: { ...(spec.background || {}), frame_extraction: { status: 'continued_without', error: spec.background?.frame_extraction?.error, choice_recorded_at: choiceAt } } },
  });
  const next = orderedScenes(scenes).find((candidate) => candidate.idx === scene.idx + 1) || null;
  if (next && !DONE.has(String(next.status))) {
    if (film.plan?.background?.enabled) {
      await patchFilm(film, hooks, { stage_note: 'Continue-without-continuity recorded. The durable worker will prepare the next block without a frame.' });
      return;
    }
    await prepareScene(film, scenes, next, hooks, { forceIndependent: true });
  } else if (allScenesDone(scenes)) {
    await setState(film, hooks, 'ALL_SCENES_COMPLETED', 'All video scenes are complete — prepare the audio and run Final Assembly.');
  }
}

/** RECOVERY — the film is stranded at EXTRACTING_FINAL_FRAME: the browser that
 * was extracting the frame went away, or the decode wedged. The clip itself
 * already rendered and is stored, so recovery NEVER re-renders (and never
 * re-bills). A second extraction failure becomes an explicit user decision. */
export async function recoverStalledFrameExtraction(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  const stalled = stalledFrameScene(scenes);
  if (!stalled) {
    // Nothing to salvage — re-arm the pipeline head instead of sitting stuck.
    await resumeFilm(film, scenes, hooks);
    return;
  }
  say(hooks, `Scene ${stalled.idx + 1}: the final-frame extraction stalled — picking it up again from the clip that already rendered.`);
  try {
    await finalizeScene(film, scenes, stalled, hooks, String(stalled.asset_url), { frameTimeoutMs: RECOVERY_FRAME_TIMEOUT_MS });
    return;
  } catch (e: any) {
    say(hooks, `Scene ${stalled.idx + 1}: the retry could not finish (${String(e?.message || e).slice(0, 120)}) — keeping the clip and moving on without a keyframe.`);
  }
  const spec = (stalled.spec || {}) as VideoClipSpec;
  const reason = 'The final frame could not be extracted after the automatic retry.';
  await patchScene(stalled, hooks, {
    status: 'needs_action',
    error: reason,
    keyframe_url: null,
    validation: { pass: false, issues: reason, method: 'frame_extraction' },
    spec: { ...spec, background: { ...(spec.background || {}), frame_extraction: { status: 'failed', error: reason } } },
  });
  await setState(film, hooks, 'FRAME_READY', `Scene ${stalled.idx + 1}'s clip is safe. Retry frame extraction or explicitly continue without continuity; no later scene was submitted.`);
}

/** [Skip Scene] — exclude this scene and move on; nothing else changes. */
export async function skipScene(film: Film, scenes: FilmScene[], scene: FilmScene, hooks: RunHooks): Promise<void> {
  const spec = (scene.spec || {}) as VideoClipSpec;
  await patchScene(scene, hooks, {
    status: 'skipped', error: null,
    spec: { ...spec, background: { ...(spec.background || {}), frame_extraction: { status: 'continued_without', error: 'Scene skipped by creator.', choice_recorded_at: new Date().toISOString() } } },
  });
  const next = orderedScenes(scenes).find((s) => s.idx > scene.idx && !DONE.has(String(s.status)));
  if (next && next.status === 'waiting') {
    await prepareScene(film, scenes, next, hooks);
  } else if (allScenesDone(scenes)) {
    await setState(film, hooks, 'ALL_SCENES_COMPLETED', 'All video scenes are complete — prepare the audio and run Final Assembly.');
  }
}

// ---------------------------------------------------------------------------
// Optional AUTO mode — the same sequential loop, self-triggering. Still one
// clip at a time: prepare → generate → extract → decide → prepare next → …
// ---------------------------------------------------------------------------

export async function autoProduce(film: Film, scenes: FilmScene[], hooks: RunHooks, shouldContinue: () => boolean): Promise<void> {
  // Continuity is mandatory and it is what makes two cuts read as one take:
  // block N+1 is generated FROM block N's validated last frame, so it cannot
  // be prepared or submitted until that frame exists. A block that is still
  // failing therefore holds the ones behind it — generating them anyway would
  // only buy clips that do not match the film.
  //
  // What the loop owes the creator instead is that it never sits there
  // silently: generateScene has already exhausted its own bounded retries and
  // its fallback engine by the time control reaches here, so the one thing
  // left is a decision, and this names the single click that releases the
  // queue. Retry and Skip both re-enter this loop, and Skip records a
  // continue-without-continuity choice on the skipped block so the next one
  // can be prepared immediately.
  for (;;) {
    if (!shouldContinue()) { say(hooks, 'Auto-generate paused.'); return; }
    const pending = orderedScenes(scenes).filter((s) => !DONE.has(String(s.status)));
    const next = pending[0] || null;
    if (!next) {
      if (allScenesDone(scenes)) await setState(film, hooks, 'ALL_SCENES_COMPLETED', 'All video scenes are complete — prepare the audio and run Final Assembly.');
      return;
    }
    const behind = pending.length - 1;
    const holding = behind ? ` The ${behind} block${behind === 1 ? '' : 's'} behind it need its last frame to stay in continuity.` : '';
    if (next.status === 'failed' || next.status === 'needs_action') {
      const billing = ((next.spec || {}) as VideoClipSpec).background;
      const refundCopy = billing?.terminal_refunded_key
        ? 'Its credits were returned.'
        : billing?.terminal_refund_pending_key
          ? 'Its refund is pending reconciliation; Retry will confirm it before a new charge.'
          : 'No later block was charged.';
      say(hooks, `Block ${next.idx + 1} still needs a decision after its automatic retries. ${refundCopy}${holding} Retry it, regenerate the prompt, switch its model, or Skip it — any of those releases the rest of the film straight away.`);
      return;
    }
    if (next.status === 'generating') return; // already in flight elsewhere
    if (next.status === 'waiting') {
      try {
        await prepareScene(film, scenes, next, hooks);
      } catch {
        say(hooks, `Block ${next.idx + 1}'s prompt could not be written.${holding} Regenerate its prompt, or Skip it to release the rest of the film.`);
        return;
      }
    }
    if (!shouldContinue()) { say(hooks, 'Auto-generate paused.'); return; }
    if (next.status === 'ready') {
      try {
        await generateScene(film, scenes, next, hooks);
      } catch {
        const billing = ((next.spec || {}) as VideoClipSpec).background;
        const refundCopy = billing?.terminal_refunded_key
          ? 'Its credits were returned.'
          : 'Its refund must be reconciled before a new paid Retry.';
        say(hooks, `Block ${next.idx + 1} could not be rendered. ${refundCopy}${holding} Retry it, regenerate the prompt, switch its model, or Skip it — any of those releases the rest of the film straight away.`);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MULTI-GENERATE — every prepared scene at once (deliberately NOT the
// sequential loop above, which stays exactly as it is for normal use)
// ---------------------------------------------------------------------------

/**
 * Fire generation for EVERY scene that already has a prepared prompt.
 *
 * The sequential loop is still how a film is normally made: one clip at a
 * time, each seeded from the last one's final frame. This is for a board full
 * of scenes that are already prepared and independent, where waiting for each
 * render in turn is the only thing left slowing the film down. Each scene
 * keeps its own prompt, references and credit key, so one that fails fails
 * alone, and no scene is billed twice.
 *
 * Nothing is prepared and no post-production is advanced here — the caller
 * decides what happens when the batch lands.
 */
export async function generateAllReadyScenes(
  film: Film,
  scenes: FilmScene[],
  hooks: RunHooks,
): Promise<void> {
  const ready = orderedScenes(scenes).filter((s) => s.status === 'ready' && String(s.prompt || '').trim());
  if (!ready.length) throw new Error('No scene has a prepared prompt waiting — prepare a scene first.');

  await patchFilm(film, hooks, { status: 'producing', error: null });
  await setState(film, hooks, 'GENERATING_VIDEO', `Generating ${ready.length} prepared scene${ready.length === 1 ? '' : 's'} in continuity order…`);
  const failed: FilmScene[] = [];
  let rendered = 0;
  for (const scene of ready) {
    try {
      // Deliberately sequential: if an earlier scene is regenerated, the next
      // scene must wait and consume that NEW validated last frame, never the
      // previous version or a frame that has not landed yet.
      await generateScene(film, scenes, scene, hooks, { prepareNext: false });
      if (scene.status === 'completed') rendered += 1;
      else if (scene.status === 'needs_action') break;
    } catch (error: any) {
      failed.push(scene);
      const reason = String(error?.message || error);
      if (scene.status !== 'failed') await patchScene(scene, hooks, { status: 'failed', error: reason });
      // Every later block is generated from this one's validated last frame,
      // so submitting them now would buy clips that do not match the film.
      // generateScene has already spent its retries and its fallback engine;
      // the queue is released by Retry or Skip on this block.
      break;
    }
  }

  const attempted = rendered + failed.length;
  await setState(
    film, hooks,
    allScenesDone(scenes) ? 'ALL_SCENES_COMPLETED' : 'PROMPT_READY',
    failed.length
      ? `${rendered} of ${attempted} attempted scenes rendered. Scene${failed.length === 1 ? '' : 's'} ${failed.map((s) => s.idx + 1).join(', ')} failed after their automatic retries; terminal billing reconciliation is recorded on each failed scene, and the scenes behind them need that validated last frame, so Retry or Skip there releases them.`
      : rendered === ready.length
        ? `All ${rendered} prepared scene${rendered === 1 ? '' : 's'} rendered in continuity order.`
        : `${rendered} scene${rendered === 1 ? '' : 's'} rendered; the next scene is waiting for a frame decision.`, 
  );
}

/** [Style Lock] — toggled from the board mid-production. Turning it ON after
 * scene 1 has already landed reads the fingerprint straight away so the very
 * next prompt carries it; turning it OFF keeps the fingerprint on the row (so
 * turning it back on costs nothing) and simply stops injecting it. Prompts
 * already written are not rewritten — regenerate a scene's prompt for that. */
export async function setStyleLock(film: Film, scenes: FilmScene[], hooks: RunHooks, on: boolean): Promise<void> {
  await patchFilm(film, hooks, { style_lock: on });
  if (!on) { say(hooks, 'Style lock off — later clips are prompted on their own look.'); return; }
  const first = orderedScenes(scenes).find((s) => s.idx === 0) || null;
  if (film.style_lock_description) { say(hooks, 'Style lock on — every later clip carries scene 1’s look.'); return; }
  if (!first || first.status !== 'completed' || !first.prompt) {
    say(hooks, 'Style lock on — the look is read from scene 1 as soon as it lands.');
    return;
  }
  try {
    say(hooks, 'Style lock: reading scene 1’s look…');
    const fingerprint = await withTimeout(
      extractStyleFingerprint({ film, prompt: String(first.prompt) }),
      DIRECTOR_TIMEOUT_MS,
      'Reading the film’s visual style',
    );
    if (fingerprint) await patchFilm(film, hooks, { style_lock_description: fingerprint });
  } catch (e: any) {
    say(hooks, `The style lock could not be read (${String(e?.message || e).slice(0, 120)}) — it is read again after the next clip.`);
  }
}

// ---------------------------------------------------------------------------
// Stage 4 — FFmpeg assembly (+ optional finishing layers)
// ---------------------------------------------------------------------------

export async function assembleReadyFilm(
  film: Film,
  scenes: FilmScene[],
  hooks: RunHooks,
  finishSettings?: FinishSettings,
): Promise<void> {
  const ordered = orderedScenes(scenes);
  const done = ordered.filter((s) => s.status === 'completed' && s.asset_url);
  if (!done.length) throw new Error('No completed scenes to assemble yet.');
  const textOverlays = (film.plan?.on_screen_text || []).filter((item) => item.text && item.end_s > item.start_s);
  const finishing = textOverlays.length > 0 || (!!finishSettings && (finishSettings.narration || finishSettings.music || finishSettings.captions));
  await patchFilm(film, hooks, {
    status: 'assembling',
    machine_state: 'FFMPEG_ASSEMBLY',
    stage_note: finishing ? 'Preparing the optional finishing layers…' : 'FFmpeg is joining your clips…',
    error: null,
  });
  try {
    const prepared = finishSettings && (finishSettings.narration || finishSettings.music || finishSettings.captions)
      ? await prepareFinish(film, done, finishSettings, (note) => {
          say(hooks, note);
          try { hooks.onFilm?.({ stage_note: note }); } catch { /* UI only */ }
        })
      : null;
    if (prepared) await patchFilm(film, hooks, { finish: prepared.state });

    const audioRequired = film.plan?.audio_enabled !== false;
    const result = await assembleFilm(
      done.map((s) => {
        // AI clips normally keep native sound. A creator-approved character
        // fallback is the one exception: its stored per-scene ElevenLabs take
        // replaces the silent model's dialogue while every other scene stays
        // untouched.
        const dialogueFallback = s.dialogue?.kind === 'character' && s.narration?.audioUrl
          ? String(s.narration.audioUrl)
          : null;
        return {
          sceneKey: s.scene_key,
          url: String(s.asset_url),
          narrationUrl: dialogueFallback || (s.type === 'video_clip' || s.type === 'veo_cinematic' ? null : s.narration_url || null),
          nativeVolume: dialogueFallback ? 0.16 : undefined,
          durationS: Number(s.duration_s) || undefined,
          targetDurationS: dialogueFallback ? sceneTargetDuration(s, { voice_source: 'elevenlabs', duration_s: s.narration?.duration_s }) : undefined,
          strictAudio: dialogueFallback ? true : undefined,
        };
      }),
      (film.aspect_ratio || '16:9') as Aspect,
      (note) => say(hooks, note),
      prepared ? {
        durationS: prepared.durationS,
        narrationUrls: prepared.narrationUrls,
        musicUrl: prepared.musicUrl,
        captionsSrt: prepared.captionsSrt,
        textOverlays,
        requireAudibleAudio: audioRequired,
      } : {
        durationS: done.reduce((sum, scene) => sum + (Number(scene.duration_s) || 0), 0),
        textOverlays,
        requireAudibleAudio: audioRequired,
      },
    );
    let durationS = 0; let thumb = '';
    try { durationS = await probeVideoDuration(result.url); } catch { /* cosmetic */ }
    try { thumb = await canvasExtractFrame(result.url, 0.3); } catch { /* cosmetic */ }
    const textOverlayCheck = await verifyAssembledText(result.url, textOverlays);
    if (!textOverlayCheck.pass) throw new Error(`Final on-screen text validation failed. ${textOverlayCheck.items.filter((item) => !item.pass).map((item) => `“${item.text}”: ${item.issue}`).join(' ')}`);
    const finishedLayers = finishSettings ? [
      finishSettings.narration ? 'narration' : '',
      finishSettings.music ? 'ducked music' : '',
      finishSettings.captions ? 'burned-in captions' : '',
      textOverlays.length ? `${textOverlays.length} verified text overlay${textOverlays.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', ') : textOverlays.length ? `${textOverlays.length} verified text overlay${textOverlays.length === 1 ? '' : 's'}` : '';
    await patchFilm(film, hooks, {
      status: 'ready',
      machine_state: 'FINAL_VIDEO',
      stage_note: finishing
        ? `Finished with ${finishedLayers}; native clip sound is preserved${typeof result.audioMeanDb === 'number' ? ` and measured ${result.audioMeanDb.toFixed(1)} dB mean` : ''}.`
        : result.via === 'ffmpeg_wasm'
          ? `Assembled in your browser with FFmpeg${typeof result.audioMeanDb === 'number' ? ` · audio verified ${result.audioMeanDb.toFixed(1)} dB mean` : ''}.`
          : 'Assembled with the platform joiner (FFmpeg fallback).',
      final_video_url: result.url,
      final_thumb_url: thumb || null,
      duration_s: durationS || result.durationS || null,
      finish: prepared
        ? { ...prepared.state, text_overlay_check: textOverlayCheck, completed_at: new Date().toISOString() }
        : { ...(film.finish || { settings: { narration: false, music: false, musicPreset: 'cinematic', captions: false }, source_fingerprint: '' }), text_overlay_check: textOverlayCheck, completed_at: new Date().toISOString() },
      error: null,
    });
  } catch (e: any) {
    await patchFilm(film, hooks, {
      status: finishing && !!film.final_video_url ? 'ready' : 'producing',
      machine_state: 'ALL_SCENES_COMPLETED',
      stage_note: finishing ? 'The finish pass failed — your previous film is still intact.' : 'Assembly failed — fix the note below and try again. Completed scenes are untouched.',
      error: String(e?.message || e),
    });
    throw e;
  }
}

export async function finishReadyFilm(
  film: Film,
  scenes: FilmScene[],
  settings: FinishSettings,
  hooks: RunHooks,
): Promise<void> {
  if (!settings.narration && !settings.music && !settings.captions) throw new Error('Choose at least one finishing layer.');
  await assembleReadyFilm(film, scenes, hooks, settings);
}

// ---------------------------------------------------------------------------
// Stage 5 — AUDIO (voice plan / narration / music / SFX) + FINAL ASSEMBLY.
// Audio work NEVER regenerates video: change voice → re-record lines →
// re-assemble; change music → re-compose → re-assemble. Existing clips are
// reused as-is, which is why re-assembly is fast.
// ---------------------------------------------------------------------------

function silentAudioState(scenes: FilmScene[]): FilmAudio {
  return {
    version: 1,
    voice_plan: null,
    narration: orderedScenes(scenes).map((scene) => ({ scene_key: scene.scene_key, text: '', voice_source: 'none', planned_source: 'none', status: 'ready' })),
    music: { required: false, preset: 'silent', status: 'skipped' },
    sfx: [],
    sfx_status: 'skipped',
    voice_source: 'none',
    planned_fingerprint: `silent:${orderedScenes(scenes).map((scene) => `${scene.scene_key}:${scene.duration_s}`).join('|')}`,
    planned_at: new Date().toISOString(),
  };
}

async function ensureSilentAudio(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  if (film.plan?.audio_policy !== 'fully-silent' && film.plan?.audio_enabled !== false) return;
  const audio = silentAudioState(scenes);
  await patchFilm(film, hooks, { audio, machine_state: 'AUDIO_READY', stage_note: 'Fully silent selected — no speech, music or effects were generated.' });
}

export type AssemblyStepKey = 'scenes' | 'narration' | 'music' | 'sfx' | 'captions' | 'mix' | 'render' | 'validate';
export type AssemblyStepStatus = 'pending' | 'active' | 'done' | 'failed';
export interface AssemblyProgress {
  steps: { key: AssemblyStepKey; label: string; status: AssemblyStepStatus; detail?: string }[];
  percent: number;
  running: boolean;
  /** What the active step is doing right now, in plain words. */
  detail?: string;
}

const finishStopRequested = new Set<number>();

/** Stop after the active network layer, or immediately while FFmpeg is active.
 * All durable inputs remain saved, so Retry resumes without regenerating clips. */
export function stopFinalAssembly(filmId: number): void {
  finishStopRequested.add(filmId);
  interruptAssembly();
}

const ASSEMBLY_STEPS: { key: AssemblyStepKey; label: string }[] = [
  { key: 'scenes', label: 'Checking clips' },
  { key: 'narration', label: 'Narration' },
  { key: 'music', label: 'Music' },
  { key: 'sfx', label: 'Sound effects' },
  { key: 'captions', label: 'Captions' },
  { key: 'mix', label: 'Mixing audio' },
  { key: 'render', label: 'Rendering' },
  { key: 'validate', label: 'Saving' },
];

/** The length a scene occupies on the final timeline: its real clip duration,
 * extended (capped) when its narration needs slightly more room. */
export function sceneTargetDuration(scene: FilmScene, narration?: { voice_source?: string; duration_s?: number } | null): number {
  const base = Number(scene.duration_s) || 6;
  if (!narration || !isSpokenSource(narration.voice_source) || !narration.duration_s) return base;
  return Math.max(base, Math.min(narration.duration_s + 0.3, base + MAX_SCENE_EXTENSION_S));
}

/** Plan (or refresh) the film's audio, then generate every missing layer.
 * Layer failures are typed (AudioLayerError) so the UI offers the right
 * recovery: [Retry Voice]/[Choose Voice], [Retry]/[Continue Without Music],
 * [Retry]/[Continue Without SFX]. */
export async function prepareFilmAudioStage(
  film: Film,
  scenes: FilmScene[],
  hooks: RunHooks,
  opts: {
    voiceId?: string;
    voiceName?: string;
    forceReplan?: boolean;
    /** Voice source for this run; omitted = the film's own choice. */
    voiceSource?: VoiceSourceId;
    openaiVoice?: string;
  } = {},
): Promise<void> {
  await setState(film, hooks, 'AUDIO_PLANNING', film.audio ? 'Updating the audio plan…' : 'Opus is planning narration, music and SFX together with the scenes…');
  try {
    const audio = await ensureAudioPlan(film, scenes, (n) => say(hooks, n), opts);
    await patchFilm(film, hooks, { audio, error: null });
  } catch (e: any) {
    await patchFilm(film, hooks, { machine_state: 'ALL_SCENES_COMPLETED', stage_note: 'The audio plan could not be created.', error: String(e?.message || e) });
    throw e;
  }
  await generateAudioLayers(film, scenes, hooks);
}

/** Generate every missing audio layer. Each layer fails independently and the
 * others still run; the FIRST failure is rethrown at the end so nothing
 * generated is lost and the UI can target the broken layer. */
async function generateAudioLayers(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  const audio = film.audio;
  if (!audio) throw new Error('The audio plan is missing — prepare the audio first.');
  await setState(film, hooks, 'AUDIO_GENERATING', 'Generating the audio layers…');
  const done = audioScenes(scenes);
  const totalTarget = done.reduce((n, s) => n + sceneTargetDuration(s, audio.narration.find((x) => x.scene_key === s.scene_key)), 0);
  let firstFailure: any = null;

  try {
    if (!narrationReady(audio)) await generateNarrationAudio(audio, scenes, (n) => say(hooks, n));
    await persistSceneNarration(audio, scenes);
  } catch (e) { firstFailure = firstFailure || e; }
  await patchFilm(film, hooks, { audio: { ...audio } });

  try { await generateMusicAudio(audio, totalTarget, (n) => say(hooks, n)); }
  catch (e) { firstFailure = firstFailure || e; }
  await patchFilm(film, hooks, { audio: { ...audio } });

  try { await generateSfxAudio(audio, (n) => say(hooks, n)); }
  catch (e) { firstFailure = firstFailure || e; }
  await patchFilm(film, hooks, { audio: { ...audio } });

  if (firstFailure) {
    const layer: AudioLayer = firstFailure instanceof AudioLayerError ? firstFailure.layer : 'narration';
    await patchFilm(film, hooks, {
      stage_note: layer === 'music' ? 'Music preparation failed.' : layer === 'sfx' ? 'SFX preparation failed.' : 'Narration generation failed.',
      error: String(firstFailure?.message || firstFailure),
    });
    throw firstFailure;
  }
  await patchFilm(film, hooks, {
    machine_state: 'AUDIO_READY',
    stage_note: audio.music?.skip_reason === 'providers_unavailable'
      ? 'Music providers are unavailable — continuing without music, and ready for Final Assembly.'
      : 'Narration, music and SFX are ready for Final Assembly.',
    error: null,
  });
}

/** [Retry Voice] / [Retry] per layer — clears only that layer's failures and
 * regenerates what is missing. Video clips are untouched. */
export async function retryAudioLayer(film: Film, scenes: FilmScene[], hooks: RunHooks, layer: 'narration' | 'music' | 'sfx'): Promise<void> {
  if (!film.audio) { await prepareFilmAudioStage(film, scenes, hooks); return; }
  const audio = film.audio;
  if (layer === 'narration') {
    audio.narration.forEach((n) => {
      if (isSpokenSource(n.voice_source) && (n.status === 'failed' || !n.audioUrl)) { n.status = 'pending'; n.error = undefined; }
    });
  } else if (layer === 'music' && audio.music) {
    audio.music.required = true;
    audio.music.status = 'pending';
    audio.music.audioUrl = undefined;
    audio.music.provider = undefined;
    audio.music.skip_reason = undefined;
    audio.music.error = undefined;
  } else if (layer === 'sfx') {
    audio.sfx.forEach((f) => { if (f.status === 'failed') { f.status = 'pending'; f.error = undefined; } });
    audio.sfx_status = audio.sfx.length ? 'pending' : 'none';
  }
  await patchFilm(film, hooks, { audio: { ...audio }, error: null });
  await generateAudioLayers(film, scenes, hooks);
}

/** [Continue Without Voiceover] / [Continue Without Music] / [Continue Without
 * SFX]. Every audio layer is optional: dropping one leaves the clips and the
 * other layers exactly as they are and unlocks Final Assembly. */
export async function skipAudioLayer(film: Film, scenes: FilmScene[], hooks: RunHooks, layer: 'narration' | 'music' | 'sfx'): Promise<void> {
  if (!film.audio) return;
  const audio = layer === 'narration' ? skipNarrationLayer(film.audio)
    : layer === 'music' ? skipMusicLayer(film.audio)
      : skipSfxLayer(film.audio);
  await patchFilm(film, hooks, { audio, error: null });
  if (audioReady(audio)) {
    await patchFilm(film, hooks, {
      machine_state: 'AUDIO_READY',
      stage_note: layer === 'narration' ? 'Continuing without a voiceover — run Final Assembly.'
        : layer === 'music' ? 'Continuing without music — run Final Assembly.'
        : 'Continuing without SFX — run Final Assembly.',
    });
  }
}

/**
 * [Voice Source] — No Voiceover / ElevenLabs / built-in AI voice.
 *
 * The choice only re-shapes the narration layer: music, SFX and every video
 * clip are untouched, and 'No Voiceover' completes the step immediately, so
 * Final Assembly is never held up waiting on a voice provider. Recording the
 * new lines stays an explicit step (the narration card's own button, or Final
 * Assembly), so switching engines never spends the wallet by itself.
 */
export async function changeVoiceSource(
  film: Film,
  scenes: FilmScene[],
  hooks: RunHooks,
  source: VoiceSourceId,
  openaiVoice?: string,
): Promise<void> {
  // Nothing planned yet: record the choice on the brief so the plan that
  // Final Assembly builds later speaks (or stays silent) as chosen here.
  if (!film.audio) {
    if (film.plan && film.plan.audio_enabled !== false) {
      await patchFilm(film, hooks, { plan: { ...film.plan, narration_enabled: source !== 'none' }, error: null });
    }
    return;
  }
  const audio = withVoiceSource(film.audio, source, openaiVoice);
  await patchFilm(film, hooks, { audio, error: null });
  if (!allScenesDone(scenes)) return;
  if (audioReady(audio)) {
    await patchFilm(film, hooks, {
      machine_state: 'AUDIO_READY',
      stage_note: source === 'none'
        ? 'No voiceover — run Final Assembly whenever you are ready.'
        : 'Narration, music and SFX are ready for Final Assembly.',
    });
  } else {
    await patchFilm(film, hooks, {
      machine_state: 'ALL_SCENES_COMPLETED',
      stage_note: source === 'openai'
        ? 'Built-in AI voice selected — generate the narration, or just run Final Assembly.'
        : 'ElevenLabs selected — generate the narration, or just run Final Assembly.',
    });
  }
}

/** [Choose Voice] — same narration plan and lines, new voice identity. Every
 * ElevenLabs line is re-recorded; the videos are NOT regenerated. */
export async function changeNarrationVoice(film: Film, scenes: FilmScene[], hooks: RunHooks, voiceId: string, voiceName?: string): Promise<void> {
  await prepareFilmAudioStage(film, scenes, hooks, { voiceId, voiceName });
}

/**
 * Re-compose music into a candidate. The accepted bed and previous assembled
 * film remain untouched until the creator approves this candidate.
 */
export async function changeMusicDirection(film: Film, scenes: FilmScene[], hooks: RunHooks, preset: string): Promise<void> {
  if (!film.audio) { await prepareFilmAudioStage(film, scenes, hooks); return; }
  const accepted = film.audio;
  const candidateAudio = withMusicPreset({ ...accepted, narration: [...accepted.narration], sfx: [...accepted.sfx] }, preset);
  const done = audioScenes(scenes);
  const totalTarget = done.reduce((n, s) => n + sceneTargetDuration(s, candidateAudio.narration.find((x) => x.scene_key === s.scene_key)), 0);
  await setState(film, hooks, 'AUDIO_GENERATING', `Composing a ${preset} replacement music bed…`);
  try {
    await generateMusicAudio(candidateAudio, totalTarget, (note) => say(hooks, note));
    if (!candidateAudio.music || candidateAudio.music.status !== 'ready' || !candidateAudio.music.audioUrl) {
      candidateAudio.music = { ...(candidateAudio.music || { required: true, preset }), status: 'failed', error: 'No replacement music file was produced.' };
      throw new Error('No replacement music file was produced.');
    }
    const audio = { ...accepted, music_candidate: candidateAudio.music } as FilmAudio & { music_candidate?: FilmAudio['music'] };
    await patchFilm(film, hooks, { audio, machine_state: 'AUDIO_READY', stage_note: 'Replacement music is ready to preview. The accepted track and previous final video are unchanged until you approve it.', error: null });
  } catch (error: any) {
    const audio = { ...accepted, music_candidate: candidateAudio.music } as FilmAudio & { music_candidate?: FilmAudio['music'] };
    await patchFilm(film, hooks, { audio, machine_state: 'AUDIO_READY', stage_note: 'Replacement music failed. The accepted track and previous final video are unchanged.', error: String(error?.message || error) });
    throw error;
  }
}

/** Accept the staged music bed; no video scene is regenerated or recharged. */
export async function acceptMusicCandidate(film: Film, hooks: RunHooks): Promise<void> {
  if (!film.audio) throw new Error('No audio plan is available.');
  const candidate = (film.audio as FilmAudio & { music_candidate?: FilmAudio['music'] }).music_candidate;
  if (!candidate || candidate.status !== 'ready' || !candidate.audioUrl) throw new Error('No replacement music is ready to approve.');
  const audio = { ...film.audio, music: { ...candidate } } as FilmAudio & { music_candidate?: FilmAudio['music'] };
  delete audio.music_candidate;
  await patchFilm(film, hooks, {
    audio,
    final_video_url: null,
    final_thumb_url: null,
    status: 'producing',
    machine_state: 'AUDIO_READY',
    stage_note: 'Replacement music approved. Final Assembly will reuse every existing video scene with this track.',
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Post-production steps — each layer individually triggerable (manual mode)
// and an auto-advance entry point for when the last scene lands. Video clips
// are NEVER regenerated by any of these.
// ---------------------------------------------------------------------------

const LAYER_NOTES: Record<'narration' | 'music' | 'sfx', { run: string; done: string; fail: string }> = {
  narration: { run: 'Generating narration…', done: 'Narration ready.', fail: 'Narration generation failed.' },
  music: { run: 'Selecting music…', done: 'Music selected.', fail: 'Music preparation failed.' },
  sfx: { run: 'Preparing SFX…', done: 'SFX prepared.', fail: 'SFX preparation failed.' },
};

async function ensurePlanPersisted(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  if (audioPlanCurrent(film, scenes)) return;
  await setState(film, hooks, 'AUDIO_PLANNING', 'Opus is planning narration, music and SFX together with the scenes…');
  try {
    const audio = await ensureAudioPlan(film, scenes, (n) => say(hooks, n));
    await patchFilm(film, hooks, { audio, error: null });
  } catch (e: any) {
    await patchFilm(film, hooks, { machine_state: 'ALL_SCENES_COMPLETED', stage_note: 'The audio plan could not be created.', error: String(e?.message || e) });
    throw e;
  }
}

/** Run ONE post-production step (manual mode). Ensures the audio plan exists,
 * generates only that layer, and reports Ready for Final Assembly when the
 * last layer lands. Existing ready audio and all video clips are untouched. */
export async function runAudioLayerStep(film: Film, scenes: FilmScene[], hooks: RunHooks, layer: 'narration' | 'music' | 'sfx'): Promise<void> {
  await ensurePlanPersisted(film, scenes, hooks);
  const audio = film.audio!;
  await setState(film, hooks, 'AUDIO_GENERATING', LAYER_NOTES[layer].run);
  try {
    if (layer === 'narration') {
      if (!narrationReady(audio)) await generateNarrationAudio(audio, scenes, (n) => say(hooks, n));
      await persistSceneNarration(audio, scenes);
    } else if (layer === 'music') {
      const done = audioScenes(scenes);
      const totalTarget = done.reduce((n, s) => n + sceneTargetDuration(s, audio.narration.find((x) => x.scene_key === s.scene_key)), 0);
      await generateMusicAudio(audio, totalTarget, (n) => say(hooks, n));
    } else {
      await generateSfxAudio(audio, (n) => say(hooks, n));
    }
    await patchFilm(film, hooks, { audio: { ...audio }, error: null });
    if (audioReady(audio)) {
      await patchFilm(film, hooks, {
        machine_state: 'AUDIO_READY',
        stage_note: audio.music?.skip_reason === 'providers_unavailable'
          ? 'Music providers are unavailable — continuing without music, and ready for Final Assembly.'
          : 'Narration, music and SFX are ready for Final Assembly.',
      });
    } else {
      await patchFilm(film, hooks, {
        machine_state: 'ALL_SCENES_COMPLETED',
        stage_note: layer === 'music' && audio.music?.skip_reason === 'providers_unavailable'
          ? 'Music providers are unavailable — continuing without music.'
          : LAYER_NOTES[layer].done,
      });
    }
  } catch (e: any) {
    await patchFilm(film, hooks, {
      audio: { ...audio },
      machine_state: 'ALL_SCENES_COMPLETED',
      stage_note: LAYER_NOTES[layer].fail,
      error: String(e?.message || e),
    });
    throw e;
  }
}

/** [Regenerate Narration] — re-records EVERY spoken line on the film's current
 * engine and voice. Music, SFX and every video clip are untouched. */
export async function regenerateNarration(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  if (!film.audio) { await prepareFilmAudioStage(film, scenes, hooks); return; }
  const audio = film.audio;
  audio.narration.forEach((n) => {
    if (isSpokenSource(n.voice_source)) { n.status = 'pending'; n.audioUrl = undefined; n.duration_s = undefined; n.error = undefined; }
  });
  await patchFilm(film, hooks, { audio: { ...audio }, error: null });
  await runAudioLayerStep(film, scenes, hooks, 'narration');
}

/** [Regenerate SFX] — re-makes every planned effect. Nothing else changes. */
export async function regenerateSfx(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  if (!film.audio) { await prepareFilmAudioStage(film, scenes, hooks); return; }
  const audio = film.audio;
  audio.sfx.forEach((f) => { f.status = 'pending'; f.audioUrl = undefined; f.error = undefined; });
  audio.sfx_status = audio.sfx.length ? 'pending' : 'none';
  await patchFilm(film, hooks, { audio: { ...audio }, error: null });
  await runAudioLayerStep(film, scenes, hooks, 'sfx');
}

/** AUTO-ADVANCE — called when the last scene completes (11/11 ✓ + continuity ✓).
 * Runs the post-production sequence narration → music → SFX with the same
 * sequential generators, ending at AUDIO_READY ("Ready for Final Assembly").
 * Ready layers are reused; video is never regenerated. */
export async function autoPostProduce(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  if (!allScenesDone(scenes)) return;
  if (film.plan?.audio_policy === 'fully-silent' || film.plan?.audio_enabled === false) {
    await ensureSilentAudio(film, scenes, hooks);
    return;
  }
  if (audioPlanCurrent(film, scenes) && audioReady(film.audio)) {
    await patchFilm(film, hooks, {
      machine_state: 'AUDIO_READY',
      stage_note: film.audio?.music?.skip_reason === 'providers_unavailable'
        ? 'Music providers are unavailable — continuing without music, and ready for Final Assembly.'
        : 'Narration, music and SFX are ready for Final Assembly.',
    });
    return;
  }
  await prepareFilmAudioStage(film, scenes, hooks);
}

async function verifyAssembledText(videoUrl: string, overlays: OnScreenTextItem[]): Promise<NonNullable<NonNullable<Film['finish']>['text_overlay_check']>> {
  const items: NonNullable<NonNullable<Film['finish']>['text_overlay_check']>['items'] = [];
  for (const overlay of overlays) {
    const at = overlay.start_s + Math.max(0.1, (overlay.end_s - overlay.start_s) / 2);
    let frameUrl = '';
    try {
      frameUrl = await canvasExtractFrame(videoUrl, at);
      const verdict = await askOpusJson<{ pass: boolean; issue?: string }>({
        system: 'You verify one deterministic post-production text overlay in a finished video frame. Reply only with JSON: {"pass":boolean,"issue":string}. PASS only when the exact requested text is visibly present and legible. Ignore all other creative choices.',
        user: `REQUIRED EXACT TEXT: ${JSON.stringify(overlay.text)}\nEXPECTED POSITION: ${overlay.position}\nDoes this assembled-output frame visibly contain that exact text?`,
        images: [frameUrl],
        maxTokens: 512,
        effort: 'low',
      });
      items.push({ id: overlay.id, text: overlay.text, at_s: at, frame_url: frameUrl, pass: verdict.pass === true, issue: verdict.pass === true ? undefined : String(verdict.issue || 'The exact text was not legible in the sampled assembled frame.') });
    } catch (error: any) {
      items.push({ id: overlay.id, text: overlay.text, at_s: at, frame_url: frameUrl || undefined, pass: false, issue: `Final text check unavailable: ${String(error?.message || error).slice(0, 160)}` });
    }
  }
  return { pass: items.every((item) => item.pass), checked_at: new Date().toISOString(), items };
}

/** A scene clip that cannot be assembled. The message names the scene(s) so
 * the Finish screen can send the creator back to the scene board. */
export class FinishClipError extends Error {
  sceneNumbers: number[];
  constructor(message: string, sceneNumbers: number[]) {
    super(message);
    this.name = 'FinishClipError';
    this.sceneNumbers = sceneNumbers;
  }
}

/** The creator's Finish choices. Every one only changes how the existing
 * clips and audio are mixed and rendered. */
export interface FinishOptions {
  captions?: boolean;
  captionStyle?: CaptionStyle;
  /** Music bed gain (0..0.6). 0 leaves the music out of this cut; omitted = the plan's level. */
  musicLevel?: number;
  /** Narration gain (0..2, 1 = as recorded). */
  voiceLevel?: number;
  transition?: 'cut' | 'soft';
  /** The creator's narration choice when no audio plan exists yet. */
  voiceSource?: VoiceSourceId;
  openaiVoice?: string;
}

const AUDIO_STEP_TIMEOUT_MS = 6 * 60_000;
const CLIP_PROBE_TIMEOUT_MS = 20_000;
const VALIDATE_TIMEOUT_MS = 30_000;

function withFinishTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const span = ms < 60_000 ? `${Math.round(ms / 1000)} seconds` : `${Math.round(ms / 60_000)} minutes`;
  const limit = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${span} and was stopped.`)), ms);
  });
  return Promise.race([work, limit]).finally(() => { if (timer) clearTimeout(timer); });
}

interface ClipProbe { durationS: number; width: number; height: number; playable: boolean }

function loadClipMetadata(url: string, timeoutMs: number): Promise<ClipProbe> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('could not be checked in this browser')); return; }
    const video = document.createElement('video');
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      try { video.removeAttribute('src'); video.load(); } catch { /* released */ }
      fn();
    };
    const timer = setTimeout(() => settle(() => reject(new Error('timed out while loading'))), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const probe = { durationS: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth || 0, height: video.videoHeight || 0, playable: true };
      settle(() => resolve(probe));
    };
    video.onerror = () => settle(() => reject(new Error('could not be played')));
    video.src = url;
  });
}

async function clipReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const stop = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    try { await res.body?.cancel(); } catch { /* closed */ }
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(stop);
  }
}

/** A clip the browser cannot decode (e.g. some .mov files) may still be fine
 * for FFmpeg, so only an unreachable file blocks assembly. */
async function probeClip(url: string): Promise<ClipProbe> {
  try {
    return await loadClipMetadata(url, CLIP_PROBE_TIMEOUT_MS);
  } catch (error) {
    if (await clipReachable(url)) return { durationS: 0, width: 0, height: 0, playable: false };
    throw error;
  }
}

function sceneList(numbers: number[]): string {
  if (numbers.length <= 1) return `Scene ${numbers[0] ?? ''}`.trim();
  return `Scenes ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/** PREFLIGHT — every scene that is not skipped must already have a finished,
 * loadable clip. Nothing is generated here: a missing or broken clip stops
 * assembly with the scene named, before any audio or render work starts. */
async function preflightClips(
  scenes: FilmScene[],
  onChecked: (checked: number, total: number) => void,
): Promise<{ done: FilmScene[]; probes: Map<number, ClipProbe> }> {
  const required = orderedScenes(scenes).filter((s) => s.status !== 'skipped');
  if (!required.length) throw new FinishClipError('There are no scenes to assemble yet. Open the scene board to make them first.', []);
  const missing = required.filter((s) => !(s.status === 'completed' && s.asset_url));
  if (missing.length) {
    const numbers = missing.map((s) => s.idx + 1);
    const failed = missing.some((s) => s.status === 'failed');
    throw new FinishClipError(
      `${sceneList(numbers)} ${numbers.length === 1 ? 'has' : 'have'} no finished clip${failed ? ' (generation failed)' : ''}. `
        + `Open the scene board to finish or skip ${numbers.length === 1 ? 'it' : 'them'}, then retry assembly. Nothing was regenerated or charged.`,
      numbers,
    );
  }
  const probes = new Map<number, ClipProbe>();
  const problems: { scene: FilmScene; reason: string }[] = [];
  const queue = [...required];
  let checked = 0;
  const worker = async () => {
    for (let scene = queue.shift(); scene; scene = queue.shift()) {
      try {
        const probe = await probeClip(String(scene.asset_url));
        if (probe.playable && (!probe.width || !probe.height)) problems.push({ scene, reason: 'has no picture' });
        else probes.set(scene.id, probe);
      } catch (error: any) {
        problems.push({ scene, reason: String(error?.message || 'could not be loaded') });
      }
      checked += 1;
      onChecked(checked, required.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, required.length) }, () => worker()));
  if (problems.length) {
    problems.sort((a, b) => a.scene.idx - b.scene.idx);
    const numbers = problems.map((p) => p.scene.idx + 1);
    throw new FinishClipError(
      problems.length === 1
        ? `Scene ${numbers[0]}'s clip ${problems[0].reason}. Open the scene board to regenerate or replace that scene, then retry assembly. Nothing was regenerated or charged.`
        : `${sceneList(numbers)} have clips that could not be loaded (${problems[0].reason}). Open the scene board to regenerate or replace them, then retry assembly. Nothing was regenerated or charged.`,
      numbers,
    );
  }
  return { done: required, probes };
}

function clipAspect(probe: ClipProbe): Aspect | null {
  if (!probe.width || !probe.height) return null;
  const ratio = probe.width / probe.height;
  return (ratio < 0.8 ? '9:16' : ratio > 1.25 ? '16:9' : '1:1') as Aspect;
}

/** The planned aspect, unless every measured clip agrees on a different one —
 * then the output follows the clips instead of letterboxing them. */
function resolveAssemblyAspect(film: Film, probes: Map<number, ClipProbe>): Aspect {
  const planned = (film.aspect_ratio || '') as Aspect;
  const seen = [...probes.values()].map(clipAspect).filter(Boolean) as Aspect[];
  if (seen.length && seen.every((a) => a === seen[0]) && seen[0] !== planned) return seen[0];
  return (planned || seen[0] || '16:9') as Aspect;
}

function audioCoversScenes(audio: FilmAudio, done: FilmScene[]): boolean {
  const keys = new Set(audio.narration.map((n) => n.scene_key));
  return done.every((s) => keys.has(s.scene_key));
}

function finishFileName(title: string | null | undefined): string {
  const slug = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'film';
  return `${slug}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}.mp4`;
}

const CAPTION_STYLE_LABEL: Record<CaptionStyle, string> = { 'bold-pop': 'Bold pop', clean: 'Clean', karaoke: 'Karaoke' };

/** FINAL ASSEMBLY — assembly only. Existing, verified scene clips are joined in
 * order with the chosen audio mix and (if ticked) burned captions into one MP4.
 * It NEVER generates or regenerates video and never calls a scene step: a
 * missing clip stops it with that scene named. Narration (when chosen), music
 * and SFX already recorded are reused; only a layer that is still missing is
 * recorded once and saved, so Retry and resume never pay for it twice. */
export async function runFinalAssembly(
  film: Film,
  scenes: FilmScene[],
  hooks: RunHooks,
  opts: FinishOptions = {},
): Promise<void> {
  finishStopRequested.delete(film.id);
  const progress: AssemblyProgress = { steps: ASSEMBLY_STEPS.map((s) => ({ ...s, status: 'pending' as AssemblyStepStatus })), percent: 0, running: true };
  const emit = () => { try { hooks.onAssembly?.({ ...progress, steps: progress.steps.map((x) => ({ ...x })) }); } catch { /* UI only */ } };
  const report = (key: AssemblyStepKey, status: AssemblyStepStatus, percent?: number, detail?: string) => {
    const step = progress.steps.find((s) => s.key === key);
    if (step) { step.status = status; if (detail !== undefined) step.detail = detail; }
    if (typeof percent === 'number') progress.percent = Math.max(progress.percent, Math.min(100, Math.round(percent)));
    if (detail !== undefined) progress.detail = detail;
    emit();
  };
  const checkStop = () => { if (finishStopRequested.has(film.id)) throw new Error('finish_paused'); };
  const persistAudio = async () => { if (film.audio) await patchFilm(film, hooks, { audio: { ...film.audio } }); };

  try {
    report('scenes', 'active', 1, 'Checking that every scene clip loads');
    const { done, probes } = await preflightClips(scenes, (n, total) => report('scenes', 'active', 1 + Math.round((n / total) * 9), `Checked ${n} of ${total} clips`));
    report('scenes', 'done', 10, `${done.length} clip${done.length === 1 ? '' : 's'} ready`);
    checkStop();

    const silent = film.plan?.audio_policy === 'fully-silent' || film.plan?.audio_enabled === false;
    if (silent) {
      await ensureSilentAudio(film, scenes, hooks);
    } else if (!film.audio || (!audioPlanCurrent(film, scenes) && !audioCoversScenes(film.audio, done))) {
      report('narration', 'active', 11, 'Planning the soundtrack');
      try {
        const planned = await withFinishTimeout(
          ensureAudioPlan(film, scenes, undefined, film.audio ? {} : { voiceSource: opts.voiceSource, openaiVoice: opts.openaiVoice }),
          AUDIO_STEP_TIMEOUT_MS,
          'Planning the soundtrack',
        );
        await patchFilm(film, hooks, { audio: planned, error: null });
      } catch (e: any) {
        throw e instanceof AudioLayerError ? e : new AudioLayerError('narration', String(e?.message || e));
      }
    }
    const audio = film.audio!;

    // NARRATION — only when the creator chose a voice; otherwise the clips keep
    // their own sound and no voice provider is called.
    const narrationOn = audio.narration.some((n) => isSpokenSource(n.voice_source));
    const narrationMissing = audio.narration.some((n) => isSpokenSource(n.voice_source) && (n.status !== 'ready' || !n.audioUrl));
    if (!narrationOn) {
      report('narration', 'done', 20, silent ? 'Audio is off' : 'Off — clips keep their own sound');
    } else if (narrationMissing) {
      report('narration', 'active', 12, 'Recording the narration');
      try {
        await withFinishTimeout(generateNarrationAudio(audio, scenes), AUDIO_STEP_TIMEOUT_MS, 'Recording the narration');
        await persistSceneNarration(audio, scenes);
      } catch (e: any) {
        throw e instanceof AudioLayerError ? e : new AudioLayerError('narration', String(e?.message || e));
      } finally {
        await persistAudio();
      }
      report('narration', 'done', 20, 'Narration recorded and saved');
    } else {
      await persistSceneNarration(audio, scenes);
      report('narration', 'done', 20, 'Reusing the saved narration');
    }
    checkStop();

    const musicWanted = typeof opts.musicLevel === 'number' ? opts.musicLevel > 0.001 : true;
    const music = audio.music;
    if (!music || !music.required || music.status === 'skipped' || !musicWanted) {
      report('music', 'done', 25, !musicWanted ? 'Off for this cut' : 'No music');
    } else if (music.status === 'ready' && music.audioUrl) {
      report('music', 'done', 25, 'Reusing the saved music bed');
    } else {
      report('music', 'active', 21, `Composing the ${music.preset || 'music'} bed`);
      const totalTarget = done.reduce((n, s) => n + sceneTargetDuration(s, audio.narration.find((x) => x.scene_key === s.scene_key)), 0);
      try {
        await withFinishTimeout(generateMusicAudio(audio, totalTarget), AUDIO_STEP_TIMEOUT_MS, 'Composing the music');
      } catch (e: any) {
        throw e instanceof AudioLayerError ? e : new AudioLayerError('music', String(e?.message || e));
      } finally {
        await persistAudio();
      }
      report('music', 'done', 25, audio.music?.status === 'ready' ? 'Music bed saved' : 'Music unavailable — continuing without it');
    }
    checkStop();

    const sfxPending = audio.sfx_status !== 'skipped' && audio.sfx.some((f) => f.status !== 'ready' || !f.audioUrl);
    if (sfxPending) {
      report('sfx', 'active', 26, 'Preparing the sound effects');
      try {
        await withFinishTimeout(generateSfxAudio(audio), AUDIO_STEP_TIMEOUT_MS, 'Preparing the sound effects');
      } catch (e: any) {
        throw e instanceof AudioLayerError ? e : new AudioLayerError('sfx', String(e?.message || e));
      } finally {
        await persistAudio();
      }
    } else if (audio.sfx_status !== 'skipped') {
      audio.sfx_status = audio.sfx.length ? 'ready' : 'none';
    }
    report('sfx', 'done', 30, audio.sfx_status === 'ready' ? `${audio.sfx.length} effect${audio.sfx.length === 1 ? '' : 's'}` : 'None');
    checkStop();

    // TIMELINE — measured clip lengths, extended (capped) only where the
    // narration needs room. Narration placement doubles as the music duck key
    // and the caption timing, so all three stay in sync.
    const aspect = resolveAssemblyAspect(film, probes);
    const voiceGain = Math.min(2, Math.max(0, typeof opts.voiceLevel === 'number' ? opts.voiceLevel : 1));
    const narrationByKey = new Map(audio.narration.map((n) => [n.scene_key, n]));
    const voiceTrack: { url: string; atS: number }[] = [];
    const cues: CaptionCue[] = [];
    let cursor = 0;
    const inputs = done.map((s) => {
      const entry = narrationByKey.get(s.scene_key) || null;
      const narrated = !!entry && isSpokenSource(entry.voice_source) && entry.status === 'ready' && !!entry.audioUrl;
      const dialogueFallback = s.dialogue?.kind === 'character' && s.narration?.audioUrl ? s.narration : null;
      const spokenUrl = dialogueFallback?.audioUrl || (narrated ? String(entry!.audioUrl) : null);
      const spokenDur = Number(dialogueFallback ? dialogueFallback.duration_s : narrated ? entry!.duration_s : 0) || 0;
      const measured = probes.get(s.id)?.durationS || 0;
      const baseDur = measured || Number(s.duration_s) || 6;
      const targetDur = spokenUrl && spokenDur
        ? Math.max(baseDur, Math.min(spokenDur + 0.3, baseDur + MAX_SCENE_EXTENSION_S))
        : baseDur;
      if (spokenUrl) voiceTrack.push({ url: spokenUrl, atS: cursor });
      const line = dialogueFallback
        ? String(s.dialogue?.line || dialogueFallback.text || '')
        : narrated ? String(entry!.text || '')
          : String(s.dialogue?.line || '');
      if (line.trim()) {
        const start = cursor + (spokenUrl ? 0.05 : 0.15);
        const end = cursor + (spokenUrl && spokenDur ? Math.min(targetDur, spokenDur + 0.05) : Math.max(0.4, targetDur - 0.15));
        if (end > start + 0.2) cues.push({ startS: start, endS: end, text: line });
      }
      cursor += targetDur;
      const sfx = audio.sfx
        .filter((f) => f.scene_key === s.scene_key && f.status === 'ready' && f.audioUrl && audio.sfx_status === 'ready')
        .map((f) => ({ url: String(f.audioUrl), atS: Number(f.at_s) || 0, volume: Number(f.volume) || 0.25, durationS: Number(f.duration_s) || undefined }));
      return {
        sceneKey: s.scene_key,
        url: String(s.asset_url),
        narrationUrl: spokenUrl,
        // Narration is the authoritative voice: the clip's own sound drops to
        // low ambience under it. Without narration the clip plays as-is.
        nativeVolume: silent ? 0 : spokenUrl ? 0.16 : 1,
        narrationVolume: voiceGain,
        durationS: baseDur,
        measuredDurationS: measured || undefined,
        targetDurationS: targetDur,
        sfx,
        strictAudio: true,
      };
    });
    const totalTarget = cursor;

    let captionsAss = '';
    if (opts.captions) {
      const style = opts.captionStyle || 'clean';
      report('captions', 'active', 31, 'Timing the captions');
      captionsAss = buildCaptionAss(cues, aspect, style);
      report('captions', 'done', 33, captionsAss ? `${CAPTION_STYLE_LABEL[style]} · timed to the ${narrationOn ? 'narration' : 'dialogue'}` : 'No spoken lines to caption');
    } else {
      report('captions', 'done', 33, 'Off');
    }
    const textOverlays = (film.plan?.on_screen_text || []).filter((item) => item.text && item.end_s > item.start_s);
    const musicUrl = musicWanted && audio.music && audio.music.status === 'ready' && audio.music.audioUrl ? audio.music.audioUrl : undefined;
    const musicVolume = typeof opts.musicLevel === 'number' ? opts.musicLevel : audio.music?.volume;
    checkStop();

    await patchFilm(film, hooks, { status: 'assembling', machine_state: 'FFMPEG_ASSEMBLY', stage_note: 'Final Assembly: joining the finished clips and mixing the sound…', error: null });
    report('mix', 'active', 34, 'Starting the video engine');

    let stage: 'mix' | 'render' | 'validate' = 'mix';
    const onAssembleProgress = (note: string, fraction: number) => {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0));
      const detail = String(note || '').replace(/…$/, '');
      if (f >= 0.975) {
        if (stage !== 'validate') { report('mix', 'done'); report('render', 'done'); stage = 'validate'; }
        report('validate', 'active', 94, 'Uploading the finished MP4');
      } else if (f >= 0.895) {
        if (stage === 'mix') { report('mix', 'done'); stage = 'render'; }
        if (stage === 'render') report('render', 'active', 80 + Math.round(((f - 0.895) / 0.08) * 12), detail);
      } else if (stage === 'mix') {
        report('mix', 'active', 34 + Math.round((f / 0.88) * 44), detail);
      }
    };
    const assembleOnce = () => assembleFilm(inputs, aspect, onAssembleProgress, {
      durationS: totalTarget,
      musicUrl,
      musicVolume,
      captionsAss: captionsAss || undefined,
      textOverlays,
      voiceTrack,
      loudnessNormalize: !silent,
      transition: opts.transition === 'soft' ? 'soft' : 'cut',
      fileName: finishFileName(film.title),
      // Only a layer WE add (narration or music) must be audible. A cut that
      // keeps the clips' own sound ships them as-is, even when a model's
      // clips are quiet or silent.
      requireAudibleAudio: film.plan?.audio_enabled !== false && (voiceTrack.length > 0 || !!musicUrl),
    });
    let result;
    try {
      result = await assembleOnce();
    } catch (firstAssemblyError: any) {
      checkStop();
      stage = 'mix';
      report('mix', 'active', undefined, `Render hit a problem — retrying once (${String(firstAssemblyError?.message || firstAssemblyError).slice(0, 90)})`);
      result = await assembleOnce();
    }
    report('mix', 'done');
    report('render', 'done', 93);
    report('validate', 'active', 95, 'Checking the finished film');
    if (!result.url) throw new Error('Final Assembly produced no video file.');
    let durationS = 0; let thumb = '';
    try { durationS = await withFinishTimeout(probeVideoDuration(result.url), VALIDATE_TIMEOUT_MS, 'Reading the film length'); } catch { /* cosmetic */ }
    try { thumb = await withFinishTimeout(canvasExtractFrame(result.url, Math.min(1.2, Math.max(0.3, (durationS || totalTarget) * 0.1))), VALIDATE_TIMEOUT_MS, 'Saving the thumbnail'); } catch { /* cosmetic */ }
    let textOverlayCheck: NonNullable<NonNullable<Film['finish']>['text_overlay_check']>;
    try {
      textOverlayCheck = await withFinishTimeout(verifyAssembledText(result.url, textOverlays), 3 * 60_000, 'Checking the on-screen text');
    } catch (checkError: any) {
      const issue = `Final text check unavailable: ${String(checkError?.message || checkError).slice(0, 160)}`;
      textOverlayCheck = { pass: false, checked_at: new Date().toISOString(), items: textOverlays.map((item) => ({ id: item.id, text: item.text, at_s: item.start_s, pass: false, issue })) };
    }
    // The cut is already rendered and uploaded: a text check that fails or
    // cannot run is recorded on the film as a warning, never allowed to discard it.
    const textWarning = textOverlayCheck.pass ? '' : `On-screen text could not be confirmed — ${textOverlayCheck.items.filter((item) => !item.pass).map((item) => `“${item.text}”: ${item.issue}`).join(' ').slice(0, 220)}`;
    if (textWarning) { try { console.warn('[ScriptToVideo] Final on-screen text check (non-fatal):', textWarning); } catch { /* no console */ } }

    const usedBuiltInVoice = audio.voice_used === 'openai' || audio.narration.some((entry) => entry.voice_source === 'openai' && entry.status === 'ready');
    const narrationLabel = usedBuiltInVoice
      ? `built-in AI narration (${audio.openai_voice || 'alloy'}${audio.voice_fallback_reason ? ', ElevenLabs unavailable after one retry' : ''})`
      : `ElevenLabs narration (${audio.voice_plan?.voiceName || 'one voice'})`;
    const layerSummary = [
      inputs.some((c) => c.narrationUrl) ? `${narrationLabel}, clip sound ducked` : silent ? 'audio off' : 'clips\u2019 own sound',
      musicUrl ? `${audio.music?.preset || ''} music, ducked under speech`.trim() : '',
      inputs.some((c) => c.sfx.length) ? 'SFX' : '',
      captionsAss ? `${CAPTION_STYLE_LABEL[opts.captionStyle || 'clean']} captions` : '',
      opts.transition === 'soft' ? 'soft transitions' : '',
      textOverlays.length ? `${textOverlays.length} on-screen text overlay${textOverlays.length === 1 ? '' : 's'} ${textOverlayCheck.pass ? 'verified' : 'burned in (not verified)'}` : '',
    ].filter(Boolean).join(' · ');
    const measuredDuration = durationS || result.durationS || null;
    const settings = {
      narration: narrationOn,
      captions: Boolean(captionsAss),
      caption_style: opts.captionStyle || 'clean',
      music_level: typeof musicVolume === 'number' ? musicVolume : null,
      voice_level: voiceGain,
      transition: opts.transition === 'soft' ? 'soft' : 'cut',
      audio_policy: film.plan?.audio_policy || 'legacy',
      measured_duration_s: measuredDuration,
      size_bytes: result.bytes || null,
      aspect,
      via: result.via,
    };
    const exportId = `assembly_${Date.now().toString(36)}`;
    const finalPlan = film.plan ? {
      ...film.plan,
      assembled_media_id: result.url,
      orchestration: film.plan.orchestration ? { ...film.plan.orchestration, state: 'ready' as const, intent: 'export' as const, checkpoint: 'verified_final_media', completed_count: film.plan.orchestration.total_count, updated_at: new Date().toISOString() } : film.plan.orchestration,
      export_records: [...(film.plan.export_records || []), { id: exportId, status: 'complete' as const, url: result.url, created_at: new Date().toISOString(), completed_at: new Date().toISOString(), settings }],
    } : film.plan;
    progress.running = false;
    report('validate', 'done', 100, 'Saved to your library');
    await patchFilm(film, hooks, {
      status: 'ready',
      machine_state: 'FINAL_VIDEO',
      stage_note: `${layerSummary ? `Final video ready — ${layerSummary}.` : 'Final video ready.'}${textWarning ? ` ${textWarning}` : ''}`,
      final_video_url: result.url,
      final_thumb_url: thumb || null,
      duration_s: measuredDuration,
      plan: finalPlan as any,
      finish: {
        ...(film.finish || { settings: { narration: false, music: false, musicPreset: 'cinematic', captions: Boolean(captionsAss) }, source_fingerprint: '' }),
        text_overlay_check: textOverlayCheck,
        last_failure: undefined,
        completed_at: new Date().toISOString(),
        size_bytes: result.bytes || undefined,
        timeline_s: totalTarget,
        output_aspect: aspect,
      } as any,
      error: null,
    });
  } catch (e: any) {
    progress.running = false;
    const raw = String(e?.message || e);
    const paused = finishStopRequested.has(film.id) || raw === 'finish_paused';
    const clipError = e instanceof FinishClipError;
    const layer: AudioLayer = e instanceof AudioLayerError ? e.layer : 'assembly';
    const activeKey = progress.steps.find((s) => s.status === 'active')?.key;
    const failKey: AssemblyStepKey | undefined = clipError ? 'scenes' : layer !== 'assembly' ? layer : activeKey;
    progress.steps.forEach((s) => { if (s.status === 'active') s.status = 'pending'; });
    const failStep = failKey ? progress.steps.find((s) => s.key === failKey) : undefined;
    if (failStep && !paused) failStep.status = 'failed';
    progress.detail = undefined;
    emit();
    const late = /took longer than/.test(raw) ? ' in time' : '';
    const publicError = paused
      ? 'Finishing is paused. Press Retry assembly to continue — saved clips, narration and music are reused.'
      : clipError ? raw
        : layer === 'narration'
          ? `The narration could not be recorded${late}. Your clips are safe — press Retry assembly, or turn the voiceover off on the Voice tab.`
          : layer === 'music'
            ? `The music bed could not be prepared${late}. Press Retry assembly, or choose \u201cContinue without music\u201d on the Music tab.`
            : layer === 'sfx'
              ? `The sound effects could not be prepared${late}. Press Retry assembly, or choose \u201cContinue without SFX\u201d on the SFX tab.`
              : late
                ? `${raw} Your clips and audio are saved — press Retry assembly.`
                : 'The final film could not be rendered. Your clips and audio are saved — press Retry assembly.';
    const failedStepName = failKey || 'assembly';
    const shortReason = raw.replace(/\s+/g, ' ').trim();
    // friendlyErrors.ts classifies only the text before " Technical details:",
    // so the friendly sentence survives and the real cause rides behind it.
    const shownError = paused || clipError || publicError.includes(raw)
      ? publicError
      : `${publicError} Technical details: ${failedStepName} step — ${shortReason.slice(0, 140)}${shortReason.length > 140 ? '…' : ''}`;
    if (!paused && !clipError) { try { console.warn('[ScriptToVideo] Final Assembly failed at step', failedStepName, raw); } catch { /* no console */ } }
    const failureRecord = paused ? {} : {
      finish: {
        ...(film.finish || { settings: { narration: false, music: false, musicPreset: 'cinematic', captions: false }, source_fingerprint: '' }),
        last_failure: { step: failedStepName, error: raw.slice(0, 4000), at: new Date().toISOString() },
      } as any,
    };
    await patchFilm(film, hooks, clipError ? {
      status: film.final_video_url ? 'ready' : 'producing',
      stage_note: shownError,
      error: shownError,
      ...failureRecord,
    } : {
      status: film.final_video_url ? 'ready' : 'producing',
      machine_state: audioReady(film.audio) ? 'AUDIO_READY' : 'ALL_SCENES_COMPLETED',
      stage_note: shownError,
      error: shownError,
      ...failureRecord,
    });
    throw new Error(shownError);
  }
}

// ---------------------------------------------------------------------------
// Resume after a reload — adopt in-flight renders; never auto-generate
// ---------------------------------------------------------------------------

export async function resumeFilm(film: Film, scenes: FilmScene[], hooks: RunHooks): Promise<void> {
  for (const scene of orderedScenes(scenes)) {
    if (scene.status !== 'generating') continue;
    if (scene.asset_url) {
      // The clip landed but the browser went away mid-frame-stage. Finish from
      // the stored clip — re-rendering it would pay for the same video twice.
      try {
        await finalizeScene(film, scenes, scene, hooks, String(scene.asset_url), { frameTimeoutMs: RECOVERY_FRAME_TIMEOUT_MS });
      } catch {
        await recoverStalledFrameExtraction(film, scenes, hooks);
      }
    } else if (scene.veo_operation_id) {
      try {
        say(hooks, `Scene ${scene.idx + 1}: picking the render back up…`);
        const resumeSpec = (scene.spec || {}) as VideoClipSpec;
        const resumeCreditKey = String(resumeSpec.background?.active_credit_key || resumeSpec.background?.idempotency_key || `stv:film:${film.id}:scene:${scene.id}`);
        const videoUrl = await VideoModelService.getVideoResult(scene.veo_operation_id, {
          creditKey: resumeCreditKey,
          model: resolveVideoModel(film.video_model),
        });
        await patchScene(scene, hooks, { asset_url: videoUrl, veo_operation_id: null });
        await finalizeScene(film, scenes, scene, hooks, videoUrl);
      } catch (e: any) {
        await patchScene(scene, hooks, { status: 'failed', error: String(e?.message || e), veo_operation_id: null });
      }
    } else {
      // Interrupted before the job id landed — the prompt is intact.
      await patchScene(scene, hooks, { status: scene.prompt ? 'ready' : 'waiting', error: null });
    }
  }
  // Make sure the pipeline has an actionable head: if nothing is prepared or
  // running, prepare the next waiting scene's prompt (preparation only).
  const head = activeScene(scenes);
  if (head && head.status === 'waiting') {
    await prepareScene(film, scenes, head, hooks);
  } else if (allScenesDone(scenes) && !film.final_video_url) {
    await setState(film, hooks, 'ALL_SCENES_COMPLETED', 'All video scenes are complete — preparing the audio for Final Assembly.');
  }
}

// ---------------------------------------------------------------------------
// AUTO-ASSEMBLE (bug D1)
//
// Final Assembly used to wait for a button press, and nothing else in this
// pipeline does. A film left to run on its own therefore stopped dead at
// "Narration, music and SFX are ready" — everything paid for, nothing
// delivered — and stayed there until somebody came back and clicked.
//
// So the last step is the same kind of step as the others now: when every
// scene is finished and every audio layer is ready, assembly starts by itself.
// Reviewing the cut before it is assembled stays available as an OPT-IN (the
// review toggle in App.tsx), because some films genuinely want a look first —
// but it is a choice, not the default.
// ---------------------------------------------------------------------------

/**
 * Is this film's next step Final Assembly, with nothing left to wait for?
 *
 * Deliberately conservative: a film already assembling, already finished, or
 * still missing a scene or an audio layer answers false, so a caller polling
 * this on a timer can never start a second assembly or jump the queue.
 */
export function readyToAutoAssemble(film: Film | null | undefined, scenes: FilmScene[]): boolean {
  if (!film) return false;
  if (film.status === 'ready' || film.final_video_url) return false;
  if (film.status === 'assembling' || film.machine_state === 'FFMPEG_ASSEMBLY') return false;
  if (!allScenesDone(scenes)) return false;
  return audioReady(film.audio);
}

// ---------------------------------------------------------------------------
// SCENE WATCHDOG (bug D2)
//
// A scene whose render stopped answering used to sit on "generating the
// clip…" indefinitely: nothing measured how long it had been there, so an
// automated film never finished and the board offered no way out.
//
// The budget is measured from the SCENE ROW's own updated_at, not from when a
// tab happened to open the film, so a render abandoned an hour ago is stalled
// the moment the board loads rather than getting a fresh fifteen minutes.
// ---------------------------------------------------------------------------

/** No progress for this long means the job is gone, not slow. */
export const SCENE_STALL_MS = 15 * 60 * 1000;

/** Milliseconds since this scene row last changed. Falls back to the film's
 * own timestamp for a row written before scenes carried one. */
export function msSinceSceneUpdate(scene: FilmScene, film?: Film | null): number {
  const sceneAt = Date.parse(String(scene.updated_at || ''));
  const filmAt = Date.parse(String(film?.updated_at || ''));
  const at = Number.isFinite(sceneAt) ? sceneAt : filmAt;
  return Number.isFinite(at) ? Math.max(0, Date.now() - at) : 0;
}

/** True for a scene mid-render that has shown no progress for the stall
 * budget. Only 'generating' counts — every other status is either finished or
 * deliberately waiting on a person. */
export function isSceneStalled(scene: FilmScene, sinceMs: number): boolean {
  if (String(scene.status) !== 'generating') return false;
  return sinceMs >= SCENE_STALL_MS;
}

/** The first stalled scene on the board, or null. */
export function stalledScene(film: Film | null | undefined, scenes: FilmScene[]): FilmScene | null {
  for (const scene of orderedScenes(scenes)) {
    if (isSceneStalled(scene, msSinceSceneUpdate(scene, film))) return scene;
  }
  return null;
}

/**
 * Retry ONE stalled scene, exactly once.
 *
 * A second failure is where it stops: the scene is marked `failed` with a
 * sentence a person can act on, which is what puts the board's retry control
 * in front of them. Leaving a card spinning is the single outcome this
 * function exists to prevent, so even an unexpected error ends in a failed
 * scene rather than a quiet return.
 */
export async function recoverStalledScene(
  film: Film,
  scenes: FilmScene[],
  scene: FilmScene,
  hooks: RunHooks,
): Promise<void> {
  const minutes = Math.round(SCENE_STALL_MS / 60000);
  say(hooks, `Scene ${scene.idx + 1} has shown no progress for ${minutes} minutes — retrying it once.`);
  // The dead job id has to go first, or the retry adopts the render that
  // stopped answering instead of starting a new one.
  await patchScene(scene, hooks, { status: 'ready', error: null, veo_operation_id: null });
  try {
    await retryScene(film, scenes, scene, hooks);
  } catch (e: any) {
    await patchScene(scene, hooks, {
      status: 'failed',
      error: `This scene stopped responding for ${minutes} minutes and the retry did not work either `
        + `(${String(e?.message || e).slice(0, 160)}). Retry it from this step, or skip it — every `
        + 'other scene in the film is untouched.',
    });
    return;
  }
  if (String(scene.status) === 'generating') {
    await patchScene(scene, hooks, {
      status: 'failed',
      error: `This scene stopped responding for ${minutes} minutes and the retry did not finish either. `
        + 'Retry it from this step, or skip it — every other scene in the film is untouched.',
    });
  }
}
