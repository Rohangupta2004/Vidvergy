/**
 * Saves a studio plan as a normal Script-to-Video project (s2v_films +
 * s2v_film_scenes) so the existing production board, credit wall, durable
 * runner and recovery sweeper handle it exactly like any other film.
 *
 * Scenes are written as `waiting` with the agent's detailed prompt already
 * saved; the prepare step (browser or durable runner) keeps that prompt and
 * attaches references: character images, project images (as @references),
 * per-scene images (spec.scene_reference_urls) and, when the creator opts in,
 * the storyboard frame (spec.storyboard_url).
 */
import { db, referenceSlug } from './api';
import type { AtReference, Film, FilmCharacter, FilmCharacterProfile, FilmPlan, PlanScene, SceneDialogue, StoredReference, VideoClipSpec } from './api';
import type { StudioPlan, StudioReference, StudioScene } from './studioAgent';
import type { StudioModel } from './studioModels';

export interface ScriptVersion {
  id: string;
  kind: 'original' | 'improved' | 'edited';
  label: string;
  text: string;
  created_at: string;
}

export interface CreateStudioFilmInput {
  plan: StudioPlan;
  model: StudioModel;
  aspect: '16:9' | '9:16' | '1:1';
  targetSeconds: number;
  versions: ScriptVersion[];
  activeVersionId: string;
  idea: string;
  projectRefs: StudioReference[];
  attachStoryboard: boolean;
  narration: boolean;
  savedRefs: StoredReference[];
  /** Series / saved-profile provenance kept on plan.studio (e.g. { series }). */
  extraStudio?: Record<string, unknown>;
  /** Saved brand (logo, colours) carried from the customer's profile. */
  brand?: Record<string, unknown> | null;
}

function sceneDialogue(scene: StudioScene, plan: StudioPlan): SceneDialogue | null {
  const first = scene.dialogue[0];
  if (first) {
    const speaker = plan.characters.find((c) => c.name.toLowerCase() === first.speaker.toLowerCase() || c.id === first.speaker.toLowerCase());
    const line = scene.dialogue.map((d) => d.line).join(' ');
    return { kind: 'character', line, speaker: speaker ? speaker.id : first.speaker, delivery: first.delivery || 'natural', language: 'English' };
  }
  if (scene.narration) return { kind: 'narrator', line: scene.narration, speaker: 'narrator', delivery: 'warm, clear voice-over', language: 'English' };
  return null;
}

export async function createStudioFilm(input: CreateStudioFilmInput): Promise<Film> {
  const { plan, model } = input;
  if (!plan.scenes.length) throw new Error('This plan has no scenes yet. Re-plan the script, then try again.');
  const active = input.versions.find((v) => v.id === input.activeVersionId) || input.versions[input.versions.length - 1];
  const imaged = new Set(plan.characters.filter((c) => c.imageUrl).map((c) => c.id));
  const total = plan.scenes.reduce((n, s) => n + s.duration_s, 0);

  // Only characters with a reference image join the cast: the pipelines refuse
  // a block whose named cast has no image, and an image-less character is
  // already fully described inside every detailed prompt.
  const profiles: FilmCharacterProfile[] = plan.characters.filter((c) => imaged.has(c.id)).map((c) => ({
    id: c.id,
    name: c.name,
    kind: imaged.has(c.id) ? 'main' : 'side',
    role: '',
    age_appearance: '',
    wardrobe: c.wardrobe,
    personality_voice: c.voice || '',
    voice: { tone: c.voice || 'natural', accent: '', pace: 'natural' },
    appearance: c.appearance,
    coverage: plan.scenes.map((s, i) => ({ scene: i + 1, lines: s.dialogue.filter((d) => d.speaker.toLowerCase() === c.name.toLowerCase()).map((d) => d.line) })).filter((cov) => cov.lines.length),
    inferred_fields: [],
  }));
  const characterRefs: FilmCharacter[] = profiles.map((profile) => {
    const source = plan.characters.find((c) => c.id === profile.id);
    const saved = source?.mention ? input.savedRefs.find((r) => r.name === source.mention) : undefined;
    return {
      ...profile,
      url: source?.imageUrl || null,
      approved: true,
      source: saved ? 'library' : source?.imageUrl ? 'uploaded' : 'generated',
      source_reference_id: saved?.id ?? null,
      sheet_required: Boolean(source?.imageUrl),
    };
  });

  const atReferences: AtReference[] = [
    ...plan.characters.filter((c) => c.mention && c.imageUrl).map((c) => ({ name: c.mention as string, url: c.imageUrl as string, type: 'character' as const, description: c.appearance })),
    ...input.projectRefs.map((r, i) => ({ name: referenceSlug(r.label) || `project-ref-${i + 1}`, url: r.url, type: 'style' as const, description: r.label })),
  ];

  const sceneSpecs = plan.scenes.map((scene, idx): VideoClipSpec & Record<string, unknown> => {
    const sceneText = `${scene.script_segment} ${scene.summary} ${scene.prompt} ${scene.dialogue.map((d) => d.speaker).join(' ')}`.toLowerCase();
    const named = plan.characters
      .filter((c) => imaged.has(c.id) && ((c.mention && sceneText.includes(`@${c.mention}`)) || (c.name.length > 2 && sceneText.includes(c.name.toLowerCase()))))
      .map((c) => c.id);
    const onScreen = Array.from(new Set([...scene.characters.filter((id) => imaged.has(id)), ...named]));
    const spoken = scene.dialogue.map((d) => `${d.speaker}: "${d.line}"`).join(' ');
    return {
      summary: scene.summary || scene.title,
      visual_goal: scene.prompt_fields?.subject || scene.summary || scene.title,
      cut_type: idx === 0 ? 'new_shot' : scene.cut_type,
      prompt_source: 'studio' as unknown as VideoClipSpec['prompt_source'],
      characters: onScreen,
      ...(onScreen.length ? {} : { no_characters_reason: 'No character with a reference image is on screen in this block.' }),
      engine_id: model.id,
      engine_reason: `Chosen in the studio: ${model.label}.`,
      workflow_kind: 'engine',
      duration_s: scene.duration_s,
      duration_notes: scene.part ? [`Part ${scene.part.index} of ${scene.part.of}, split automatically to fit ${model.label}.`] : [],
      timed_beats: [{ start_s: 0, end_s: scene.duration_s, action: scene.prompt_fields?.motion || scene.summary || scene.title, camera: scene.prompt_fields?.camera_movement || scene.camera || undefined, dialogue: spoken || undefined, audio: scene.prompt_fields?.sound || undefined }],
      model_assignment: { model_id: model.id, operation: 'generate', locked: true, reason: 'Chosen by the creator in the studio.' },
      prompt_version: 1,
      ...(input.attachStoryboard && scene.storyboard_url ? { storyboard_url: scene.storyboard_url, storyboard_status: 'ready' as const, storyboard_approved: true } : {}),
      ...(scene.storyboard_url ? { storyboard_preview_url: scene.storyboard_url } : {}),
      scene_reference_urls: scene.references.map((r) => ({ url: r.url, label: r.label })),
      studio_prompt_fields: scene.prompt_fields,
      studio_title: scene.title,
      on_screen_text_notes: scene.on_screen_text,
      background: { status: 'queued', retries: 0, max_retries: 3, credits_estimated: scene.duration_s },
    };
  });

  const planScenes: PlanScene[] = plan.scenes.map((scene, idx) => ({
    scene_key: scene.key,
    idx,
    type: 'video_clip',
    script_segment: scene.script_segment || scene.summary || scene.title,
    duration_s: scene.duration_s,
    continuity_group: null,
    spec: sceneSpecs[idx],
    dialogue: sceneDialogue(scene, plan),
    summary: scene.summary || scene.title,
    visual_goal: sceneSpecs[idx].visual_goal as string,
    characters: sceneSpecs[idx].characters as string[],
  }));

  const now = new Date().toISOString();
  const filmPlan: FilmPlan & Record<string, unknown> = {
    title: plan.title,
    style_direction: plan.visual_style,
    story_summary: plan.logline,
    world: plan.world,
    visual_style: plan.visual_style,
    characters: profiles,
    scenes: planScenes,
    assumptions: plan.notes,
    input_mode: 'ai',
    requested_duration_s: total,
    audio_enabled: true,
    narration_enabled: input.narration,
    characters_speak: model.audio && plan.scenes.some((s) => s.dialogue.length > 0),
    // An empty cast is only pre-approved for motion design; any other film asks
    // for a character (or an explicit motion-design confirmation) on the board.
    cast_reviewed: characterRefs.length > 0 || plan.film_kind === 'motion_design',
    contract_version: 2,
    entry_type: input.idea ? 'idea' : 'script',
    execution_mode: 'review',
    target_duration_sec: total,
    project_asset_ids: [],
    storyboard_only_asset_ids: [],
    storyboard_requested: plan.scenes.some((s) => Boolean(s.storyboard_url)),
    writer_model: 'Opus',
    clip_ids: planScenes.map((s) => s.scene_key),
    studio: {
      version: 3,
      created_at: now,
      idea: input.idea || null,
      script_versions: input.versions,
      active_version_id: active?.id || null,
      model_id: model.id,
      plan_notes: plan.notes,
      attach_storyboard: input.attachStoryboard,
      target_seconds: input.targetSeconds,
      ...(input.extraStudio || {}),
    },
  } as FilmPlan & Record<string, unknown>;

  const film = await db.createFilm({
    title: plan.title,
    script: active?.text || '',
    aspect_ratio: input.aspect,
    status: 'planning',
    machine_state: 'SEGMENTING_SCRIPT',
    stage_note: 'Saving the studio plan…',
    product_screenshot_url: null,
    character_ref_url: null,
    video_model: model.id,
    style_lock: true,
    style_lock_description: null,
    at_references: atReferences,
    ...(input.brand ? { brand: input.brand } : {}),
  });

  try {
    for (let idx = 0; idx < plan.scenes.length; idx += 1) {
      const scene = plan.scenes[idx];
      await db.insertScene({
        film_id: film.id,
        idx,
        scene_key: scene.key,
        type: 'video_clip',
        script_segment: planScenes[idx].script_segment,
        spec: sceneSpecs[idx],
        status: 'waiting',
        duration_s: scene.duration_s,
        continuity_group: null,
        dialogue: planScenes[idx].dialogue || null,
        prompt: scene.prompt,
      });
    }
    const patch: Partial<Film> = {
      status: 'plan_ready',
      machine_state: 'PREPARING_SCENE',
      stage_note: `${plan.scenes.length} clips planned for ${model.label}. Press Start when you're ready.`,
      plan: filmPlan,
      character_refs: characterRefs,
      error: null,
    };
    await db.updateFilm(film.id, patch);
    for (const ref of input.projectRefs) {
      void db.addAsset({ film_id: film.id, kind: 'style', name: ref.label, description: 'Project reference from the studio', url: ref.url, tags: ['studio', 'project-reference'] });
    }
    plan.scenes.forEach((scene, i) => {
      if (scene.storyboard_url) void db.addAsset({ film_id: film.id, kind: 'storyboard', name: `${scene.title} storyboard`, description: `Scene ${i + 1}`, url: scene.storyboard_url, tags: ['storyboard', 'studio'] });
    });
    return (await db.getFilm(film.id)) || { ...film, ...patch } as Film;
  } catch (error) {
    await db.updateFilm(film.id, { status: 'error', stage_note: 'The studio plan could not be saved completely. Open the studio and try again.', error: String((error as Error)?.message || error) }).catch(() => undefined);
    throw error;
  }
}
