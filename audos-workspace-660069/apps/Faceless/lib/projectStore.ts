import { waitForDbSession } from '../../../lib/reelioStudio';
import type { FacelessProject, PipelineStep } from './pipeline';
import { motionEngine, type MotionAspect } from '../../../lib/motionEngineSdk';

const TABLE = 'faceless_films';
const RESUME_WINDOW_MS = 48 * 60 * 60 * 1000;
const PIPELINE_STEPS: PipelineStep[] = ['brief', 'script', 'voiceover', 'timing', 'storyboard', 'images', 'clips', 'finishing', 'review', 'export'];

function client(): any {
  const value = typeof window === 'undefined' ? null : (window as any).__workspaceDb;
  if (!value || typeof value.from !== 'function') throw new Error('Project storage is still loading. Try again in a moment.');
  return value;
}

export function newProjectId(): string {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `faceless-v2-${suffix}`;
}

export async function createProject(project: FacelessProject): Promise<void> {
  await waitForDbSession();
  await client().from(TABLE).insert({
    id: project.id,
    topic: project.title,
    mode: project.settings.mode,
    script: project.script || project.brief,
    status: 'running',
    stage: project.step,
    progress_log: [],
    analysis: project,
    timeline: null,
    resolved_assets: {},
    prepared_assets: [],
    spec_history: [],
    revision_count: 0,
    cost_estimate: project.settings.targetDuration,
    error_msg: null,
    settings: { options: project.settings, pipelineVersion: 2 },
  });
}

let projectWrites: Promise<unknown> = Promise.resolve();

export async function saveProject(project: FacelessProject): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(project)) as FacelessProject;
  projectWrites = projectWrites.catch(() => undefined).then(async () => {
    await waitForDbSession();
    const finished = snapshot.step === 'review' || snapshot.step === 'export';
    await client().from(TABLE).update(snapshot.id, {
    topic: snapshot.title,
    mode: snapshot.settings.mode,
    script: snapshot.script || snapshot.brief,
    status: snapshot.status === 'error' ? 'failed' : finished ? 'completed' : 'running',
    stage: snapshot.step,
    narration_url: snapshot.voiceover?.audioUrl || null,
    narration_duration: snapshot.voiceover?.duration || null,
    narration_timestamps: snapshot.voiceover?.words || null,
    analysis: snapshot,
    timeline: snapshot.storyboard,
    resolved_assets: Object.fromEntries(snapshot.scenes.map((scene) => [scene.id, scene])),
    motion_plan: { music: snapshot.music, sfx: snapshot.sfx, review: snapshot.review },
    render_url: snapshot.previewUrl || null,
    final_url: snapshot.finalUrl || null,
    cost_estimate: snapshot.scenes.reduce((total, scene) => total + scene.duration, 0),
    error_msg: snapshot.error || null,
    settings: { options: snapshot.settings, pipelineVersion: 2 },
    updated_at: new Date().toISOString(),
    });
  });
  await projectWrites;
}

function projectFromRow(row: any): FacelessProject | null {
  const saved = row?.analysis;
  if (!saved || saved.pipelineVersion !== 2 || !saved.id) return null;
  const stage = PIPELINE_STEPS.includes(row?.stage as PipelineStep) ? row.stage as PipelineStep : saved.step;
  const status: FacelessProject['status'] = row?.status === 'failed'
    ? 'error'
    : row?.status === 'completed'
      ? 'ready'
      : 'running';
  return {
    ...saved,
    step: stage,
    status,
    error: status === 'error' ? String(row?.error_msg || saved.error || 'Film processing failed.') : undefined,
    previewUrl: row?.render_url || saved.previewUrl,
    finalUrl: row?.final_url || saved.finalUrl,
  } as FacelessProject;
}

export async function loadProject(id: string): Promise<FacelessProject | null> {
  await waitForDbSession();
  const result = await client().from(TABLE, { shared: true }).getById(id);
  return projectFromRow(result?.data);
}

export async function findResumableProject(): Promise<FacelessProject | null> {
  try {
    await waitForDbSession();
    const result = await client().from(TABLE, { shared: true })
      .orderBy('created_at', 'desc')
      .limit(30)
      .get();
    const cutoff = Date.now() - RESUME_WINDOW_MS;
    const rows = Array.isArray(result?.data) ? result.data : [];
    for (const row of rows) {
      const createdAt = new Date(row.created_at || row.updated_at || 0).getTime();
      if (Number.isFinite(createdAt) && createdAt < cutoff) continue;
      const project = projectFromRow(row);
      if (project && project.step !== 'export') return project;
    }
  } catch (error) {
    console.warn('[Faceless] resume lookup failed:', error);
  }
  return null;
}

/**
 * Adopt a Faceless film into the shared motion engine without changing its
 * narration-first pipeline, approved scene assets, render URLs or history.
 */
export async function adoptFacelessIntoMotionEngine(project: FacelessProject) {
  const settings = project.settings as any;
  const requested = String(settings?.aspectRatio || settings?.aspect || '9:16');
  const aspect: MotionAspect = ['16:9', '9:16', '1:1'].includes(requested) ? requested as MotionAspect : '9:16';
  const scenes = (project.scenes || []) as any[];
  const sourceMedia = [
    ...(project.previewUrl ? [{ id: 'faceless-preview', kind: 'approved_render', url: project.previewUrl, approved: true, provenance: { system: 'faceless', stage: 'preview' } }] : []),
    ...(project.finalUrl ? [{ id: 'faceless-final', kind: 'approved_render', url: project.finalUrl, approved: true, provenance: { system: 'faceless', stage: 'final' } }] : []),
    ...(project.voiceover?.audioUrl ? [{ id: 'faceless-narration', kind: 'audio', url: project.voiceover.audioUrl, durationSec: project.voiceover.duration, approved: true, provenance: { provider: 'elevenlabs', system: 'faceless' } }] : []),
  ];
  return motionEngine.create({
    app: 'faceless',
    name: project.title || 'Faceless motion project',
    prompt: 'Preserve the approved narration, timed storyboard, generated clips and editorial decisions. Continue motion design in the shared canonical project.',
    mode: 'explainer',
    durationSeconds: scenes.reduce((total, scene) => total + Math.max(0, Number(scene.duration) || 0), 0) || project.voiceover?.duration || settings?.targetDuration || 30,
    aspectRatio: aspect,
    sourceMedia,
    transcript: {
      text: project.script || project.brief || '',
      words: project.voiceover?.words || [],
      provider: project.voiceover?.words?.length ? 'deepgram' : 'sceneforge_timing_estimate',
      provenance: { system: 'faceless', verified: Boolean(project.voiceover?.words?.length) },
    },
    timeline: {
      version: 1,
      scenes: scenes.map((scene, index) => ({ id: String(scene.id || `scene-${index + 1}`), startSec: Number(scene.start || scene.startSec) || 0, endSec: Number(scene.end || scene.endSec) || (Number(scene.start || scene.startSec) || 0) + (Number(scene.duration) || 0), purpose: String(scene.purpose || scene.visual || scene.narration || `Scene ${index + 1}`), tool: scene.videoUrl ? 'existing_media' : 'remotion' })),
      tracks: [{ id: 'narration', kind: 'audio' }, { id: 'visuals', kind: 'video' }, { id: 'motion', kind: 'motion' }, { id: 'captions', kind: 'captions' }],
    },
    assets: scenes.map((scene) => ({ id: scene.id, imageUrl: scene.imageUrl, videoUrl: scene.videoUrl, provenance: scene.provenance })).filter((asset) => asset.imageUrl || asset.videoUrl),
    brand: { settings },
    compatibility: { type: 'faceless', id: project.id, preserveInPlace: true },
    submittedBy: 'faceless-compatibility-adapter',
  });
}

export function stepLabel(step: PipelineStep): string {
  return ({
    brief: 'Brief', script: 'Script', voiceover: 'ElevenLabs voiceover', timing: 'Deepgram timing',
    storyboard: 'Timed storyboard', images: 'Scene images', clips: 'Seedance clips',
    finishing: 'Remotion finishing', review: 'Review', export: 'Export',
  } as Record<PipelineStep, string>)[step];
}
