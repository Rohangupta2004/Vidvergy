/**
 * "Regenerate from storyboard" — a new take of a finished film.
 *
 * The original film, its clips and its credits are never touched. A new
 * project is saved from the same approved plan: every block keeps its saved
 * prompt, storyboard frame, cast and model, and starts as `waiting` with fresh
 * billing state, so the production board shows the normal credit estimate and
 * Start authorizes it exactly like any other film.
 */
import { db } from './api';
import type { Film, FilmPlan, FilmScene } from './api';

const RUN_STATE_KEYS = [
  'background', 'orchestration', 'export_records', 'assistant', 'auto_qa', 'auto_qa_refund_events',
  'editor_composition', 'editor_composition_version', 'assembled_media_id', 'quality_review',
];

function freshSpec(spec: unknown, durationS: number): Record<string, unknown> {
  const next = { ...((spec && typeof spec === 'object') ? spec as Record<string, unknown> : {}) };
  delete next.request_evidence;
  delete next.excluded_optional_references;
  next.background = { status: 'queued', retries: 0, max_retries: 3, credits_estimated: Math.max(1, Math.round(durationS)) };
  return next;
}

export async function createRetakeFromStoryboard(film: Film, scenes: FilmScene[]): Promise<Film> {
  if (!film.plan) throw new Error('This film has no saved plan to make a new take from.');
  const ordered = [...scenes].filter((s) => s.status !== 'skipped').sort((a, b) => a.idx - b.idx);
  if (!ordered.length) throw new Error('This film has no scenes to make a new take from.');
  const baseTitle = String(film.title || film.plan.title || 'Untitled film').replace(/\s+—\s+new take(?: \d+)?$/i, '');
  const title = `${baseTitle} — new take`;

  const plan = { ...(film.plan as FilmPlan & Record<string, unknown>) } as FilmPlan & Record<string, unknown>;
  RUN_STATE_KEYS.forEach((key) => { delete (plan as Record<string, unknown>)[key]; });
  const studio = (plan.studio && typeof plan.studio === 'object') ? { ...(plan.studio as Record<string, unknown>) } : null;
  if (studio) {
    studio.retake_of = film.id;
    studio.created_at = new Date().toISOString();
    plan.studio = studio;
  }
  plan.title = title;
  plan.retake_of_film_id = film.id;

  const created = await db.createFilm({
    title,
    script: film.script,
    aspect_ratio: film.aspect_ratio,
    status: 'planning',
    machine_state: 'SEGMENTING_SCRIPT',
    stage_note: 'Saving the new take from your storyboard…',
    product_screenshot_url: film.product_screenshot_url,
    character_ref_url: film.character_ref_url || null,
    video_model: film.video_model,
    style_lock: film.style_lock,
    style_lock_description: film.style_lock_description,
    at_references: film.at_references || [],
  });

  try {
    const specs = new Map<string, Record<string, unknown>>();
    for (let idx = 0; idx < ordered.length; idx += 1) {
      const scene = ordered[idx];
      const duration = Number(scene.duration_s) || 6;
      const spec = freshSpec(scene.spec, duration);
      specs.set(scene.scene_key, spec);
      await db.insertScene({
        film_id: created.id,
        idx,
        scene_key: scene.scene_key,
        type: scene.type,
        script_segment: scene.script_segment,
        spec: spec as FilmScene['spec'],
        status: 'waiting',
        duration_s: duration,
        continuity_group: scene.continuity_group,
        dialogue: scene.dialogue || null,
        prompt: scene.prompt,
      });
    }
    const planScenes = (film.plan.scenes || [])
      .filter((item) => specs.has(item.scene_key))
      .map((item) => ({ ...item, idx: ordered.findIndex((s) => s.scene_key === item.scene_key), spec: specs.get(item.scene_key) as any }))
      .sort((a, b) => a.idx - b.idx);
    const patch: Partial<Film> = {
      status: 'plan_ready',
      machine_state: 'PREPARING_SCENE',
      stage_note: `New take from the storyboard of “${baseTitle}”: ${ordered.length} blocks with the same prompts, cast and frames. Press Start when you're ready — your original film is unchanged.`,
      plan: { ...plan, scenes: planScenes, clip_ids: planScenes.map((s) => s.scene_key) } as FilmPlan,
      character_refs: film.character_refs,
      error: null,
    };
    await db.updateFilm(created.id, patch);
    return (await db.getFilm(created.id)) || { ...created, ...patch } as Film;
  } catch (error) {
    await db.updateFilm(created.id, { status: 'error', stage_note: 'The new take could not be saved completely. Your original film is unchanged.', error: String((error as Error)?.message || error) }).catch(() => undefined);
    throw error;
  }
}
