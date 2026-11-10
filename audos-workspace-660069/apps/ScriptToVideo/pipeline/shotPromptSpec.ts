/**
 * SHOT PROMPT SPEC — what every clip prompt sent to a video model must state.
 *
 * The clip writers (prepareScenePrompt for the step-by-step path and
 * writeDetailedShotPrompt for the durable runner) ask Opus for a structured
 * `shot` object instead of free prose. This module owns:
 *  - SHOT_SPEC_RULES: the exhaustive, assumption-free requirements;
 *  - promptFamilyGuidance(): wording tuned to the model family;
 *  - missingShotSections(): the post-check that triggers a rewrite;
 *  - assembleShotPrompt(): deterministic, budget-aware assembly, so the
 *    model's own character limit never silently cuts the MUST NOT block.
 *
 * Section labels avoid the words the provider safety scrub removes
 * (physics, realism, gravity, weight …) — hence PHYSICAL PLAUSIBILITY.
 */
import { capabilityFor } from '../v2Contracts';
import { capText } from './videoModelService';

export type PromptFamily = 'seedance-2.5' | 'kling-3' | 'generic';

export interface ShotSpec {
  subject?: string;
  pose_start?: string;
  motion_sequence?: string;
  pose_end?: string;
  hands?: string;
  face_gaze?: string;
  camera?: string;
  lighting?: string;
  environment?: string;
  depth_of_field?: string;
  physical_plausibility?: string;
  continuity?: string;
  must_not?: string[] | string;
}

/** Rewrites asked for when the post-check finds sections missing. */
export const SHOT_SPEC_MAX_REWRITES = 2;

export const SHOT_SPEC_RULES = `SHOT SPEC (required for every clip — the video model must never have to guess anything):
Return "shot" as an object with ALL of these string fields, each written in plain, concrete, physical language (no metaphors, no mood words standing in for actions):
- "subject": who or what is on screen and exactly where in frame (left/centre/right, foreground/background). For every on-screen character repeat the LOCKED description word for word, then add age band, build, skin tone, hair, clothing and every prop they hold or touch. Never re-describe a character differently.
- "pose_start": the precise body pose at the first frame — head, torso, each arm, each hand, each leg and foot, which foot carries the body, facing direction.
- "motion_sequence": the exact motion as a physically plausible sequence in order, using the TIMED BEATS timecodes (for example "0-4s: …; 4-8s: …"): what moves first, then next, the direction, the speed in plain words (slow, steady, brisk), and every contact with the ground or an object. One story beat for the whole clip. Real-time speed only.
- "pose_end": the precise body pose at the last frame, every limb, as a clean holdable state that can seed the next clip.
- "hands": both hands explicitly — five fingers each, what each hand holds or touches, grip type and contact points; or "No hands visible in frame."
- "face_gaze": facial expression, mouth state and exactly where the eyes look at the start and end; or "No faces visible in frame."
- "camera": lens in millimetres (for example 35mm), camera angle and height, movement type (static, dolly in, truck left, crane up, orbit, handheld follow…), its speed, and the start framing and end framing (shot size and what is at the frame edges).
- "lighting": the motivated light source(s), direction, colour temperature in Kelvin or plain words, contrast, and where the shadows fall.
- "environment": the setting, the background elements, which of them are static and which move, surfaces and textures.
- "depth_of_field": what is sharp, what is soft, and whether focus shifts during the clip.
- "physical_plausibility": how the downward pull, momentum and follow-through show visibly — feet planting, knees bending on a landing, cloth and hair swinging and settling, objects falling and resting only where pulled down, liquids and fabrics moving with the body. Never use the words physics, realism, realistic, gravity, inertia or weight; describe the visible behaviour instead.
- "continuity": for a continuing clip, the exact state carried over from the previous clip's last frame (position, pose, wardrobe, props, light); for a new shot, say so and state what must still match (identity, wardrobe, look).
- "must_not": an array of short items that must NOT happen in this specific shot, always including: no morphing, no extra or missing limbs or fingers, no melting or warping faces, no objects popping in or out, no text or logo distortion, no sudden camera jumps, no slow motion unless the script asks for it, no unnaturally fast motion.
Keep every field specific to THIS clip. The chosen visual style is applied automatically as the leading clause; describe content, not a different style.`;

const FAMILY_GUIDANCE: Record<PromptFamily, string> = {
  'kling-3': 'KLING 3 FAMILY: Kling follows explicit camera verbs (dolly in, truck left, crane up, orbit, handheld follow) and grounded full-body motion very well. Write short concrete clauses in the order subject, action, camera, light, environment; give one continuous camera move per 5 seconds with its speed; at most two labelled shots in a 10-second clip; motion plays at real-time pace. The clip is silent: never describe music, sound or audible speech. Reference images carry identity, so refer to them as the locked identity of the named person.',
  'seedance-2.5': 'SEEDANCE 2.5 FAMILY: write the motion as one coherent long take with a timecoded storyboard across the beats and continuous camera logic between them; Seedance holds identity across long takes. It has no separate negative field, so the MUST NOT list must be complete. Mention ambient sound only when audio is on.',
  generic: 'GENERIC FAMILY (Gemini Omni Flash and others): concise explicit sentences per section, one primary action, short clips; supplied references carry identity, so describe each person exactly as their locked text and never re-describe them differently.',
};

export function promptFamilyFor(modelId?: string | null): PromptFamily {
  return capabilityFor(String(modelId || ''))?.promptFamily || 'generic';
}

export function promptFamilyGuidance(family: PromptFamily): string {
  return FAMILY_GUIDANCE[family] || FAMILY_GUIDANCE.generic;
}

const REQUIRED: Array<{ key: keyof ShotSpec; label: string; min: number }> = [
  { key: 'subject', label: 'subject', min: 12 },
  { key: 'pose_start', label: 'pose_start', min: 12 },
  { key: 'motion_sequence', label: 'motion_sequence', min: 24 },
  { key: 'pose_end', label: 'pose_end', min: 12 },
  { key: 'hands', label: 'hands', min: 8 },
  { key: 'face_gaze', label: 'face_gaze', min: 8 },
  { key: 'camera', label: 'camera', min: 16 },
  { key: 'lighting', label: 'lighting', min: 12 },
  { key: 'environment', label: 'environment', min: 12 },
  { key: 'depth_of_field', label: 'depth_of_field', min: 8 },
  { key: 'physical_plausibility', label: 'physical_plausibility', min: 16 },
  { key: 'continuity', label: 'continuity', min: 8 },
];

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('; ');
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function mustNotItems(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value || '').split(/;|\n/);
  return list.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** The post-check. Empty array = every required section is present. */
export function missingShotSections(shot: unknown): string[] {
  if (!shot || typeof shot !== 'object') return ['shot (the whole SHOT SPEC object)'];
  const record = shot as ShotSpec;
  const missing = REQUIRED.filter((item) => asText(record[item.key]).length < item.min).map((item) => item.label);
  if (!missing.includes('camera') && !/\b\d{2,3}\s?mm\b/i.test(asText(record.camera))) missing.push('camera (state the lens in millimetres)');
  if (mustNotItems(record.must_not).length < 3) missing.push('must_not (at least three items)');
  return missing;
}

export function shotRewriteNote(missing: string[]): string {
  return `POST-CHECK FAILED — your previous answer was rejected because these SHOT SPEC sections were missing, empty or too vague: ${missing.join(', ')}. Return the complete JSON again with EVERY section filled in concretely for this clip.`;
}

export function slowMotionRequested(text: string): boolean {
  return /\bslow[- ]?mo(?:tion)?\b|\bslow motion\b|\bin slow\b/i.test(String(text || ''));
}

/** The baseline MUST NOT list every clip carries, whatever Opus wrote. */
export function defaultMustNot(allowSlowMotion = false): string[] {
  return [
    'no morphing of people or objects',
    'no extra, missing or fused limbs or fingers',
    'no melting or warping faces',
    'no objects popping in or out',
    'no text or logo distortion',
    'no sudden camera jumps',
    allowSlowMotion ? '' : 'no slow motion',
    'no sped-up or unnaturally fast motion',
  ].filter(Boolean);
}

const FILL: Partial<Record<keyof ShotSpec, string>> = {
  pose_start: 'Every on-screen person starts in a stable, balanced pose that matches the end of the previous action, limbs clearly visible.',
  motion_sequence: 'One continuous action plays at real-time pace in the order the script states, each movement starting only after the previous one completes.',
  pose_end: 'Every on-screen person ends in a clean, still, balanced pose that can seed the next clip.',
  hands: 'Each visible hand has five fingers, moves only with the arm, and grips any prop firmly with visible contact.',
  face_gaze: 'Faces keep their exact shape; expression and eyeline follow the action and stay steady.',
  camera: '35mm lens at eye level, one smooth steady movement at slow speed, start and end framing kept on the subject.',
  lighting: 'Light comes from a visible motivated source with one consistent direction and colour temperature; shadows fall away from it.',
  environment: 'The setting stays fixed; background objects stay where they are unless a visible cause moves them.',
  depth_of_field: 'The subject stays sharp; the background is gently soft; focus does not jump.',
  physical_plausibility: 'Feet plant before the body moves, momentum carries through and settles, cloth and hair swing then come to rest, nothing floats.',
  continuity: 'Identity, wardrobe, props and look match the approved references exactly.',
};

const ORDER: Array<{ key: keyof ShotSpec | 'style'; label: string; weight: number }> = [
  { key: 'style', label: 'STYLE', weight: 0.8 },
  { key: 'subject', label: 'SUBJECT', weight: 2.0 },
  { key: 'pose_start', label: 'START POSE', weight: 1.3 },
  { key: 'motion_sequence', label: 'MOTION', weight: 2.6 },
  { key: 'pose_end', label: 'END POSE', weight: 1.1 },
  { key: 'hands', label: 'HANDS', weight: 0.9 },
  { key: 'face_gaze', label: 'FACE AND GAZE', weight: 0.9 },
  { key: 'camera', label: 'CAMERA', weight: 1.3 },
  { key: 'lighting', label: 'LIGHTING', weight: 1.0 },
  { key: 'physical_plausibility', label: 'PHYSICAL PLAUSIBILITY', weight: 1.1 },
  { key: 'must_not', label: 'MUST NOT HAPPEN', weight: 1.4 },
  { key: 'continuity', label: 'CONTINUITY', weight: 0.9 },
  { key: 'environment', label: 'ENVIRONMENT', weight: 1.1 },
  { key: 'depth_of_field', label: 'DEPTH OF FIELD', weight: 0.6 },
];

/** Characters reserved for what is added around the shot spec later. */
export function shotPromptBudget(params: { maxChars: number; reservedChars?: number }): number {
  const max = Math.max(500, Number(params.maxChars) || 2500);
  const reserved = Math.max(0, Number(params.reservedChars) || 0);
  return Math.max(700, Math.min(5200, max - reserved - 40));
}

/**
 * Deterministically assemble the labelled shot prompt. Missing sections are
 * filled with safe defaults (the writer is never allowed to block a render),
 * locked character descriptions are kept verbatim, and each section is
 * shortened in proportion so the whole prompt fits the budget.
 */
export function assembleShotPrompt(params: {
  shot: unknown;
  style: string;
  /** Locked character descriptions, repeated verbatim in SUBJECT. */
  lockedSubjects?: string[];
  mustNot: string[];
  budget: number;
  /** Older free-text prompt used as MOTION when the writer returned none. */
  fallbackMotion?: string;
  /** The clip's timed beats. Their "0-4s" labels are kept in MOTION so the
   * timecode check downstream never has to prepend a second copy. */
  beats?: Array<{ start_s?: unknown; end_s?: unknown; action?: unknown }>;
}): string {
  const shot = (params.shot && typeof params.shot === 'object' ? params.shot : {}) as ShotSpec;
  const locks = (params.lockedSubjects || []).map((item) => String(item || '').trim()).filter(Boolean);
  const lockText = locks.join(' | ');
  const seen = new Set<string>();
  const mustNot = [...params.mustNot, ...mustNotItems(shot.must_not)].filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const values: Record<string, string> = {};
  for (const entry of ORDER) {
    if (entry.key === 'style') { values.style = String(params.style || '').trim(); continue; }
    if (entry.key === 'must_not') { values.must_not = mustNot.join('; '); continue; }
    let text = asText(shot[entry.key]);
    if (entry.key === 'motion_sequence' && text.length < 24) text = String(params.fallbackMotion || '').replace(/\s+/g, ' ').trim() || text;
    if (entry.key === 'motion_sequence' && params.beats?.length) {
      const labelled = params.beats.map((beat) => ({ label: `${Number(beat?.start_s)}-${Number(beat?.end_s)}s`, action: String(beat?.action || '').replace(/\s+/g, ' ').trim() }));
      if (!labelled.every((beat) => text.includes(beat.label))) {
        const lead = labelled.map((beat) => (beat.action && !text.includes(beat.action) ? `${beat.label}: ${beat.action}` : beat.label)).join('; ');
        text = text ? `${lead} — ${text}` : lead;
      }
    }
    if (entry.key === 'subject' && lockText) text = locks.reduce((rest, lock) => rest.split(lock).join(''), text).replace(/^[\s.;,|:-]+|[\s;,|:-]+$/g, '').trim();
    if (!text && entry.key !== 'subject') text = FILL[entry.key] || '';
    values[entry.key] = text;
  }

  const budget = Math.max(600, Math.round(params.budget));
  const compact = budget < 1600;
  // STYLE and MUST NOT are protected: they are capped first, at a size that
  // keeps them whole on a compact (2,500-character) model, and only the
  // descriptive sections share what is left.
  values.style = capText(values.style, compact ? 170 : 420);
  values.must_not = capText(values.must_not, compact ? 320 : 900);
  const fixedSubject = lockText ? `SUBJECT: ${lockText}${values.subject ? '. In this shot: ' : ''}` : '';
  const entries = ORDER
    .map((entry) => ({ ...entry, text: values[entry.key] || '' }))
    .filter((entry) => entry.text || (entry.key === 'subject' && fixedSubject));
  const protectedKeys = new Set(['style', 'must_not']);
  const overhead = entries.reduce((sum, entry) => sum + (entry.key === 'subject' && fixedSubject ? fixedSubject.length : entry.label.length + 2) + 1 + (protectedKeys.has(entry.key) ? entry.text.length : 0), 0);
  let remaining = Math.max(entries.length * 24, budget - overhead);
  const caps = new Map<string, number>();
  let pending = entries.filter((entry) => entry.text && !protectedKeys.has(entry.key));
  for (let guard = 0; pending.length && guard < 20; guard += 1) {
    const totalWeight = pending.reduce((sum, entry) => sum + entry.weight, 0);
    const fits = pending.filter((entry) => entry.text.length <= (remaining * entry.weight) / totalWeight);
    if (!fits.length) {
      for (const entry of pending) caps.set(entry.key, Math.max(24, Math.floor((remaining * entry.weight) / totalWeight)));
      break;
    }
    for (const entry of fits) { caps.set(entry.key, entry.text.length); remaining -= entry.text.length; }
    pending = pending.filter((entry) => !fits.includes(entry));
  }

  const assembled = entries.map((entry) => {
    const text = entry.text ? capText(entry.text, caps.get(entry.key) ?? entry.text.length) : '';
    if (entry.key === 'subject' && fixedSubject) return `${fixedSubject}${text}`.trim();
    return `${entry.label}: ${text}`;
  }).join('\n');
  return assembled.length > budget ? capText(assembled, budget) : assembled;
}

/** "0-4s, 4-8s" — the exact labels the timecode check looks for. */
export function timecodeLabels(beats: Array<{ start_s?: unknown; end_s?: unknown }>): string {
  return (Array.isArray(beats) ? beats : []).map((beat) => `${Number(beat?.start_s)}-${Number(beat?.end_s)}s`).join(', ');
}

/** Merge the shot's MUST NOT items into a negative-prompt string. */
export function mergeNegative(negative: string, items: string[], max = 500): string {
  const base = String(negative || '').trim();
  const extra = items.map((item) => item.replace(/^no\s+/i, '').trim()).filter((item) => item && !base.toLowerCase().includes(item.toLowerCase()));
  return [base, ...extra].filter(Boolean).join(', ').slice(0, max);
}
