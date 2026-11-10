/**
 * SceneForge (Oct 2026 rebuild) — the browser-side client.
 *
 * Everything stateful goes through the `sceneforge-pipeline` server function
 * (session-gated, durable job-row + tick), so a reload resumes instead of
 * restarting. Generation, provider polling and post-production run in the
 * durable server worker; this module only owns interactive browser work:
 *   — the complete ElevenLabs voice catalog (shared lib/elevenLabsVoices),
 *   — every paginated HeyGen public/account avatar look through the same-origin
 *     proxy with X-Workspace-DB-Token,
 *   — project commands and read-only progress refreshes.
 * Idea-to-script and hook variants run on Claude Opus 5.5 through the Anthropic
 * proxy, with GPT 6.1 Sol (OpenAI proxy, interactive tier) only as the fallback.
 */
import { callHook, workspaceFetch, WORKSPACE_ID } from '../../../lib/workspace';
import { authorizeCredits, newChargeKey, refundCredits, requireVerifiedCreditSession } from '../../../lib/credits';
import type { CaptionLanguage, ForgeAutoBudget, ForgeAvatar, ForgeAvatarBundle, ForgeChoices, ForgeClonedVoice, ForgeCreatedAvatar, ForgeProject, ProjectBrand } from './forgeTypes';
import type { ForgeBrowserTask } from './forgeTypes';
import { FORGE_FALLBACK_MODEL, FORGE_OPUS_MODEL } from './forgeModels';
import { STRUCTURED_SCRIPT_FORMAT_GUIDE, parseStructuredScript, spokenScriptFromStructured, structuredPlanFor } from './scriptFormat';

// ---------------------------------------------------------------------------
// Pipeline ops
// ---------------------------------------------------------------------------

async function pipeline(body: Record<string, unknown>): Promise<any> {
  return callHook('sceneforge-pipeline', body);
}

export type ForgeTimedWord = { word: string; start: number; end: number; confidence?: number };

/**
 * Deepgram receives the exact ElevenLabs voice chunks that HeyGen used. Each
 * response is offset onto the project timeline, so cards and captions follow
 * spoken audio instead of an even text estimate. The caller deliberately
 * falls back to the server's estimate if a provider read is unavailable.
 */
export async function transcribeVoiceChunks(
  chunks: Array<{ audio_url?: string | null; audio_duration_sec?: number; duration_sec?: number }>,
  captionLanguage: CaptionLanguage = 'hinglish',
): Promise<ForgeTimedWord[]> {
  const words: ForgeTimedWord[] = [];
  let offset = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk.audio_url) continue;
    const audioResponse = await fetch(chunk.audio_url);
    if (!audioResponse.ok) throw new Error(`Voice chunk ${index + 1} could not be read for timing.`);
    const blob = await audioResponse.blob();
    const form = new FormData();
    form.append('audio', new File([blob], `sceneforge-voice-${index + 1}.mp3`, { type: blob.type || 'audio/mpeg' }));
    if (captionLanguage === 'hinglish') form.append('language', 'multi');
    if (captionLanguage === 'hindi') form.append('language', 'hi');
    if (captionLanguage === 'english') form.append('language', 'en');
    const response = await workspaceFetch(`/api/workspaces/${WORKSPACE_ID}/audio/transcribe-timestamped`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data?.words)) throw new Error(String(data?.error || `Timestamped transcription failed for voice chunk ${index + 1}.`));
    let localEnd = 0;
    for (const entry of data.words) {
      const word = String(entry?.word || '').trim();
      const start = Number(entry?.start);
      const end = Number(entry?.end);
      if (!word || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
      words.push({ word, start: offset + Math.max(0, start), end: offset + Math.max(start + 0.03, end), confidence: Number(entry?.confidence) || undefined });
      localEnd = Math.max(localEnd, end);
    }
    offset += Math.max(localEnd, Number(data?.duration) || 0, Number(chunk.audio_duration_sec || chunk.duration_sec) || 0);
  }
  if (!words.length) throw new Error('Timestamped transcription returned no spoken words.');
  return words;
}

export async function transcribeAvatarAudio(videoUrl: string, captionLanguage: CaptionLanguage = 'hinglish'): Promise<ForgeTimedWord[]> {
  const mediaResponse = await fetch(videoUrl);
  if (!mediaResponse.ok) throw new Error('The completed HeyGen master could not be read for word timing.');
  const blob = await mediaResponse.blob();
  const form = new FormData();
  form.append('audio', new File([blob], 'sceneforge-heygen-master.mp4', { type: blob.type || 'video/mp4' }));
  form.append('language', captionLanguage === 'hinglish' ? 'multi' : captionLanguage === 'hindi' ? 'hi' : 'en');
  const response = await workspaceFetch(`/api/workspaces/${WORKSPACE_ID}/audio/transcribe-timestamped`, { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data?.words)) throw new Error(String(data?.error || 'The HeyGen master audio could not be transcribed.'));
  const words = data.words.map((entry: any) => ({ word: String(entry?.word || '').trim(), start: Number(entry?.start), end: Number(entry?.end), confidence: Number(entry?.confidence) || undefined })).filter((entry: ForgeTimedWord) => entry.word && Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end >= entry.start);
  if (!words.length) throw new Error('Timestamped transcription returned no words from the HeyGen master.');
  return words;
}

export async function listProjects(): Promise<ForgeProject[]> {
  const data = await pipeline({ op: 'list' });
  return Array.isArray(data?.projects) ? data.projects : [];
}

export async function createProject(input: {
  topic: string;
  script: string;
  niche: string;
  style: string;
  target_length_sec: number;
  choices: ForgeChoices;
}): Promise<ForgeProject> {
  const data = await pipeline({ op: 'create', ...input });
  if (!data?.ok || !data.project) throw new Error(data?.error || 'The project could not be created.');
  return data.project;
}

export async function saveProjectDraft(projectId: string, input: { script?: string; topic?: string; niche?: string; style?: string; target_length_sec?: number; choices?: ForgeChoices }): Promise<ForgeProject> {
  const data = await pipeline({ op: 'save', project_id: projectId, ...input });
  if (!data?.ok || !data.project) throw new Error(data?.error || 'The project draft could not be saved.');
  return data.project;
}

export async function updateProjectBrand(projectId: string, brand: ProjectBrand): Promise<ForgeProject> {
  const data = await pipeline({ op: 'brand_update', project_id: projectId, brand });
  if (!data?.ok || !data.project) throw new Error(data?.error || 'Brand changes could not be saved.');
  return data.project;
}

export async function startProject(projectId: string, script: string, choices: ForgeChoices): Promise<ForgeProject> {
  await requireVerifiedCreditSession();
  const data = await pipeline({ op: 'start', project_id: projectId, script, choices });
  if (!data?.ok || !data.project) throw new Error(data?.error || 'Generation could not start.');
  return data.project;
}

export interface TickResult {
  project: ForgeProject | null;
  insufficient?: { required: number; shortfall: number | null };
}

export async function tickProject(projectId: string): Promise<TickResult> {
  const data = await pipeline({ op: 'tick', project_id: projectId });
  if (data?.code === 'insufficient_credits') {
    return { project: data.project || null, insufficient: { required: Number(data.required) || 0, shortfall: data.shortfall == null ? null : Number(data.shortfall) } };
  }
  return { project: data?.project || null };
}

export async function getProject(projectId: string): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'get', project_id: projectId });
  return data?.project || null;
}

export async function chooseDraft(projectId: string, variation: number): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'choose_draft', project_id: projectId, variation });
  if (!data?.ok || !data?.project) throw new Error(data?.error || 'The selected draft could not be locked.');
  return data.project;
}

export async function cancelProject(projectId: string): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'cancel', project_id: projectId });
  return data?.project || null;
}

export async function deleteProject(projectId: string): Promise<void> {
  const data = await pipeline({ op: 'delete', project_id: projectId });
  if (!data?.ok || !data?.deleted) throw new Error(data?.error || 'The project could not be deleted.');
}

export async function retryFromStep(projectId: string): Promise<ForgeProject | null> {
  await requireVerifiedCreditSession();
  const data = await pipeline({ op: 'retry_step', project_id: projectId });
  if (!data?.ok) throw new Error(data?.error || 'This step could not be retried.');
  return data.project || null;
}

/**
 * Re-runs ONLY the Auto Editor render from the saved composed edit, avatar
 * master and assets (op `render_retry`). Finished earlier render jobs are
 * adopted instead of re-rendered; voice, HeyGen and assets are never redone.
 */
export async function retryRender(projectId: string): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'render_retry', project_id: projectId });
  if (!data?.ok) throw new Error(data?.error || 'The render could not be retried.');
  return data.project || null;
}

/**
 * Opt-in QA audit of a finished Auto Editor video (op `run_qa`). Frame analysis
 * only — no credits. It proposes fixes; nothing changes until they are approved.
 */
export async function runQaAudit(projectId: string): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'run_qa', project_id: projectId });
  if (!data?.ok) throw new Error(data?.error || 'The QA audit could not start.');
  return data.project || null;
}

/** Approve and/or ignore proposed QA fixes (op `qa_fixes`); approved fixes re-render with no new charge. */
export async function reviewQaFixes(projectId: string, approve: string[], ignore: string[]): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'qa_fixes', project_id: projectId, approve, ignore });
  if (!data?.ok) throw new Error(data?.error || 'The QA fixes could not be saved.');
  return data.project || null;
}

/**
 * Browser → server report for the browser-owned avatar step
 * (op `complete_avatar_step`): persists the submitted HeyGen video id, the
 * finished video URL, or the exact failure, so the durable pipeline resumes
 * from the next step without restarting or re-charging the project.
 */
export async function reportAvatarStep(projectId: string, update: {
  state: 'submitted' | 'completed' | 'failed';
  video_id?: string;
  video_url?: string;
  duration_sec?: number;
  error?: string;
  transparent_fallback?: boolean;
  render_api?: 'v2' | 'v3';
  avatar_model?: 'avatar_iv' | 'legacy_v2';
  fallback_reason?: string | null;
  word_timestamps?: ForgeTimedWord[];
}): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'complete_avatar_step', project_id: projectId, ...update });
  if (!data?.ok) throw new Error(data?.error || 'The avatar result could not be saved to the project.');
  return data.project || null;
}

export async function reviewStep(
  projectId: string,
  step: string,
  action: 'approve' | 'regenerate' | 'edit',
  value?: string,
): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'step_action', project_id: projectId, step, action, value });
  if (!data?.ok) throw new Error(data?.error || `The ${step} step could not be updated.`);
  return data.project || null;
}

/** Re-run the Remotion agent on a delivered (or failed) Auto Editor project with one instruction. */
export async function autoReedit(projectId: string, instruction: string): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'auto_reedit', project_id: projectId, instruction });
  if (!data?.ok) throw new Error(data?.error || 'The re-edit could not start.');
  return data.project || null;
}

/** Brand answers for a finished Auto Editor project. Only confirmed values are sent; blank fields are left out, never guessed. */
export interface AutoBrandAnswers {
  name?: string;
  website?: string;
  cta?: string;
  logoChoice?: 'site' | 'web' | 'upload' | 'brand_kit' | 'none';
  logoUrl?: string;
  logoOriginalUrl?: string;
  logoSource?: string;
  logoKey?: string | null;
  logoHasBackground?: boolean;
  /** true only when the user pressed "Use my saved Brand Kit". */
  usedBrandKit?: boolean;
}

/**
 * Saves the user's answers to the delivery-notes brand questions (op `auto_brand_answers`) and re-runs the
 * existing Auto Editor re-edit path. Only studio_config.brandContext / brandBrief (and the confirmed logo) change;
 * no new charge and no draft rebuild.
 */
export async function autoBrandAnswers(projectId: string, answers: AutoBrandAnswers): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'auto_brand_answers', project_id: projectId, answers });
  if (!data?.ok) throw new Error(data?.error || 'The brand answers could not be saved.');
  return data.project || null;
}

/** Pre-start estimate of the Remotion agent's token reservation plus SceneForge's own recent usage. */
export async function getAutoBudget(script: string, seconds: number): Promise<ForgeAutoBudget | null> {
  try {
    const data = await pipeline({ op: 'auto_budget', script: script.slice(0, 30000), seconds });
    return data?.ok && data.budget ? data.budget as ForgeAutoBudget : null;
  } catch {
    return null;
  }
}

export async function applyEdit(projectId: string, changes: {
  accent?: string;
  music_mood?: string;
  timing_shift?: number;
  event_text?: Record<number, string>;
  scene_gestures?: Record<number, string>;
  scene_emotions?: Record<number, string>;
}): Promise<ForgeProject | null> {
  const data = await pipeline({ op: 'edit', project_id: projectId, ...changes });
  if (data?.ok === false) throw new Error(data?.error || 'The edit could not be applied.');
  return data?.project || null;
}

// ---------------------------------------------------------------------------
// Scripting — Claude Opus 5.5 primary, GPT 6.1 Sol fallback
// ---------------------------------------------------------------------------

async function scriptingText(system: string, user: string, options: { maxTokens: number; json?: boolean }): Promise<{ text: string; model: string }> {
  let primaryError = '';
  try {
    const res = await workspaceFetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FORGE_OPUS_MODEL,
        max_tokens: Math.min(16000, options.maxTokens),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await res.json().catch(() => null);
    const text = (Array.isArray(data?.content) ? data.content : [])
      .filter((block: any) => block && block.type === 'text')
      .map((block: any) => String(block.text || ''))
      .join('')
      .trim();
    if (res.ok && text) return { text, model: FORGE_OPUS_MODEL };
    primaryError = String(data?.error?.message || data?.error || data?.code || `HTTP ${res.status}`);
  } catch (error: any) {
    primaryError = String(error?.message || error);
  }
  console.warn('[SceneForge] Claude Opus 5.5 was unavailable for scripting; using GPT 6.1 Sol:', primaryError);
  const res = await workspaceFetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: FORGE_FALLBACK_MODEL,
      reasoning_effort: 'medium',
      max_completion_tokens: Math.min(16000, options.maxTokens),
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (!res.ok || !text) {
    console.warn('[SceneForge] GPT 6.1 Sol scripting fallback failed:', data?.error?.message || data?.error || `HTTP ${res.status}`);
    throw new Error('The script writer is unavailable right now. Please try again in a moment.');
  }
  return { text: String(text).trim(), model: FORGE_FALLBACK_MODEL };
}

function stripCodeFence(text: string): string {
  return String(text || '').replace(/^\s*```[a-z]*\s*\n/i, '').replace(/\n```\s*$/, '').trim();
}

function parseJsonObject(text: string): any {
  const clean = stripCodeFence(text);
  try { return JSON.parse(clean); } catch { /* try the outermost object below */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The hook writer did not return JSON.');
  return JSON.parse(clean.slice(start, end + 1));
}

/** Writes a script in SceneForge's structured Act / Scene / Shot / dialogue format; only the quoted dialogue is voiced. */
export async function ideaToScript(idea: string, niche: string, targetSeconds: number): Promise<string> {
  const plan = structuredPlanFor(targetSeconds);
  const end = `${Math.floor(plan.totalSec / 60)}:${String(plan.totalSec % 60).padStart(2, '0')}`;
  const system = [
    'You write scripts for SceneForge videos. Each scene carries full production direction, but only its one quoted dialogue line is spoken aloud by the on-camera presenter or character.',
    'Dialogue is conversational, specific and free of filler. Tailor examples and vocabulary to the stated niche/industry so the video feels made for that audience.',
    'Preserve the language and script used in the idea for the dialogue: Roman-script Hinglish stays natural Roman Hinglish, Devanagari stays Devanagari, and code-mixed text is never translated. Production direction stays in English.',
    'Return only the script — no preamble and no closing notes.',
    '',
    STRUCTURED_SCRIPT_FORMAT_GUIDE,
  ].join('\n');
  const user =
    'Niche/industry: ' + (niche || 'general business') + '\n' +
    `Target length: about ${plan.totalSec} seconds — exactly ${plan.scenes} scenes of about ${plan.sceneSec} seconds each, in ${plan.acts} act${plan.acts === 1 ? '' : 's'}, running 0:00–${end}.\n` +
    `Spoken dialogue in total: about ${Math.round(plan.totalSec * 2.3)} words.\n` +
    'Idea: ' + idea;
  const { text, model } = await scriptingText(system, user, { maxTokens: 16000 });
  const script = stripCodeFence(text);
  if (!parseStructuredScript(script)) console.warn(`[SceneForge] ${model} did not return the structured scene format; keeping its script as written.`);
  return script;
}

/** Generate exactly three alternate opening hooks without starting or charging a video render. */
export async function generateHookVariants(script: string, niche: string): Promise<string[]> {
  const spoken = spokenScriptFromStructured(parseStructuredScript(script)) || script;
  const { text: raw } = await scriptingText(
    'Create exactly three original spoken opening hooks for an avatar video. Preserve the script language and factual claims. Return JSON only as {"hooks":["...","...","..."]}. Each hook must be one short sentence and use a genuinely different structure.',
    `Niche: ${niche || 'general'}\nScript:\n${spoken.slice(0, 12000)}`,
    { maxTokens: 6000, json: true },
  );
  const parsed = parseJsonObject(String(raw));
  const hooks = Array.isArray(parsed?.hooks) ? parsed.hooks.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 3) : [];
  if (hooks.length !== 3) throw new Error('The hook writer did not return exactly three usable variants.');
  return hooks;
}

// ---------------------------------------------------------------------------
// Avatar Creator — creation traffic is owned by the SceneForge hook.
// The browser uploads bytes only to Audos storage; HeyGen receives public URLs server-side.
// ---------------------------------------------------------------------------

async function avatarCreator(body: Record<string, unknown>): Promise<any> {
  return callHook('sceneforge-avatar-creator', body);
}

function requestId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function requireCreatorResult(data: any, fallback: string): any {
  if (!data?.ok) {
    const error: any = new Error(String(data?.error || fallback));
    error.code = data?.code || 'avatar_creator_error';
    error.avatar = data?.avatar || null;
    throw error;
  }
  return data;
}

export async function listCreatedAvatars(): Promise<ForgeCreatedAvatar[]> {
  const data = requireCreatorResult(await avatarCreator({ op: 'list' }), 'Your avatars could not be loaded.');
  return Array.isArray(data.avatars) ? data.avatars : [];
}

export async function pollCreatedAvatar(id: number): Promise<ForgeCreatedAvatar> {
  const data = await avatarCreator({ op: 'status', id });
  if (data?.avatar && (data.code === 'enterprise_required' || data.code === 'credential_required')) return data.avatar;
  return requireCreatorResult(data, 'Avatar status could not be checked.').avatar;
}

export async function createAvatar(input: {
  name: string;
  method: 'photo' | 'prompt' | 'digital_twin';
  prompt?: string;
  url?: string;
  workspaceUrl?: string;
  referenceUrls?: string[];
  aspectRatio?: string;
  parentId?: number;
  consentAttested?: boolean;
}): Promise<ForgeCreatedAvatar> {
  const creditKey = newChargeKey('sceneforge-avatar');
  await authorizeCredits({
    engine: 'heygen/avatar-create',
    options: { jobs: 1, avatarType: input.method },
    entryKey: creditKey,
    source: 'sceneforge-avatar',
    label: `Custom avatar · ${input.method.replace('_', ' ')}`,
    note: input.name.slice(0, 120),
  });
  let created: any;
  try {
    created = await avatarCreator({
      op: 'create',
      request_id: requestId('avatar'),
      name: input.name,
      method: input.method,
      prompt: input.prompt || undefined,
      url: input.url || undefined,
      workspace_url: input.workspaceUrl || undefined,
      reference_urls: input.referenceUrls || [],
      aspect_ratio: input.aspectRatio || 'auto',
      parent_id: input.parentId || undefined,
      consent_attested: input.consentAttested === true,
    });
  } catch (error) {
    await refundCredits(creditKey, 'Avatar creation could not start');
    throw error;
  }
  // A retryable provider answer is resumed by the status poll with the same request, so it stays charged.
  if (!created?.ok && created?.code !== 'provider_retryable') await refundCredits(creditKey, 'Avatar creation failed');
  const data = requireCreatorResult(created, 'Avatar creation could not start.');
  return data.avatar;
}

export async function attestAvatarConsent(id: number): Promise<ForgeCreatedAvatar> {
  const data = requireCreatorResult(await avatarCreator({ op: 'consent_attest', id }), 'Consent could not be recorded.');
  return data.avatar;
}

export async function renameCreatedAvatar(id: number, name: string): Promise<ForgeCreatedAvatar> {
  const data = requireCreatorResult(await avatarCreator({ op: 'rename', id, name }), 'The avatar could not be renamed.');
  return data.avatar;
}

export async function deleteCreatedAvatar(id: number): Promise<string | null> {
  const data = requireCreatorResult(await avatarCreator({ op: 'delete', id }), 'The avatar could not be deleted.');
  return data.warning ? String(data.warning) : null;
}

async function uploadWorkspaceSceneForgeFile(file: File, folder: string): Promise<{ url: string; key: string | null }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('workspaceId', WORKSPACE_ID);
  form.append('folder', folder);
  const response = await workspaceFetch('/api/upload/file', {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error(String(data?.error || `Workspace upload failed (HTTP ${response.status}).`));
  return { url: String(data.url), key: data.key ? String(data.key) : null };
}

export function uploadWorkspaceAvatarFile(file: File): Promise<{ url: string; key: string | null }> {
  return uploadWorkspaceSceneForgeFile(file, 'sceneforge-avatars');
}

export function uploadProjectLogo(file: File, projectId: string): Promise<{ url: string; key: string | null }> {
  if (!projectId) return Promise.reject(new Error('Save the SceneForge project before uploading its logo.'));
  return uploadWorkspaceSceneForgeFile(file, `sceneforge-projects/${projectId}/brand`);
}

// Voice cloning uses Audos's managed ElevenLabs integration. Provider keys never reach this bundle.
export async function listClonedVoices(): Promise<ForgeClonedVoice[]> {
  const data = requireCreatorResult(await avatarCreator({ op: 'voice_list' }), 'Your cloned voices could not be loaded.');
  return Array.isArray(data.voices) ? data.voices : [];
}

export async function createClonedVoice(name: string, files: File[]): Promise<ForgeClonedVoice> {
  requireCreatorResult(await avatarCreator({ op: 'access' }), 'Sign in to clone a voice.');
  const uploaded = [] as Array<{ url: string; filename: string; contentType: string; sizeBytes: number }>;
  for (const file of files) {
    const stored = await uploadWorkspaceSceneForgeFile(file, 'sceneforge-voice-clones');
    uploaded.push({ url: stored.url, filename: file.name, contentType: file.type, sizeBytes: file.size });
  }
  const creditKey = newChargeKey('sceneforge-voice-clone');
  await authorizeCredits({
    engine: 'elevenlabs/voice-clone',
    options: { jobs: 1 },
    entryKey: creditKey,
    source: 'sceneforge-voice-clone',
    label: 'ElevenLabs voice clone',
    note: name.trim().slice(0, 120),
  });
  let created: any;
  try {
    created = await avatarCreator({ op: 'voice_create', name: name.trim(), files: uploaded });
  } catch (error) {
    await refundCredits(creditKey, 'Voice cloning could not start');
    throw error;
  }
  if (!created?.ok) await refundCredits(creditKey, 'Voice cloning failed');
  const data = requireCreatorResult(created, 'ElevenLabs voice cloning failed.');
  return data.voice;
}

export async function renameClonedVoice(id: number, name: string): Promise<ForgeClonedVoice> {
  const data = requireCreatorResult(await avatarCreator({ op: 'voice_rename', id, name }), 'The cloned voice could not be renamed.');
  return data.voice;
}

export async function deleteClonedVoice(voice: ForgeClonedVoice): Promise<void> {
  requireCreatorResult(await avatarCreator({ op: 'voice_delete', id: voice.id }), 'The cloned voice could not be deleted.');
}

export async function loadMyAvatars(): Promise<ForgeAvatar[]> {
  const rows = await listCreatedAvatars();
  return rows
    .filter((row) => row.status === 'ready' && row.provider_avatar_id)
    .map((row) => ({
      id: String(row.provider_avatar_id),
      groupId: String(row.provider_group_id || row.provider_avatar_id),
      name: row.name,
      gender: 'unspecified',
      age: 'unspecified',
      region: 'other',
      ethnicity: '',
      style: row.method === 'digital_twin' ? 'digital twin' : row.method === 'photo' ? 'photo avatar' : 'prompt avatar',
      category: 'my-avatar',
      description: `Created in SceneForge with ${row.method.replace('_', ' ')}`,
      tags: ['My avatar', row.method.replace('_', ' ')],
      previewImage: row.preview_url || '',
      previewVideo: row.preview_video_url || '',
      gestures: [],
      emotions: [],
      supportedEngines: [],
    }));
}

// ---------------------------------------------------------------------------
// HeyGen catalog — browser-only same-origin proxy, token-authenticated, all pages.
// ---------------------------------------------------------------------------

const HEYGEN_PROXY = () => `/api/workspaces/${WORKSPACE_ID}/provider-credentials/heygen/proxy`;
async function heygen(path: string, init?: RequestInit): Promise<any> {
  const response = await workspaceFetch(`${HEYGEN_PROXY()}/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: { ...(init?.method ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HeyGen HTTP ${response.status}: ${data?.error?.message || data?.message || data?.error || 'request failed'}`);
  return data;
}

// ---------------------------------------------------------------------------
// Avatar render — browser-owned HeyGen submit + status poll.
// The HeyGen credential proxy rejects server-function calls with 401
// "Same-origin request required", so the durable pipeline pauses at the avatar
// step and this signed-in tab drives the render through the same-origin proxy
// above, then persists the result with reportAvatarStep.
// ---------------------------------------------------------------------------

export interface AvatarRenderSubmission {
  videoId: string;
  renderApi: 'v2' | 'v3';
  avatarModel: 'avatar_iv' | 'legacy_v2';
  fallbackReason: string | null;
}

function legacyAvatarPayload(payload: NonNullable<ForgeBrowserTask['payload']>): { video_inputs: any[]; dimension: { width: number; height: number } } {
  const fallback = payload.fallback_v2 || payload;
  if (!Array.isArray(fallback.video_inputs) || !fallback.dimension) {
    throw new Error('The legacy HeyGen fallback request is missing from this project.');
  }
  return { video_inputs: fallback.video_inputs, dimension: fallback.dimension };
}

/**
 * Prefer HeyGen's documented Avatar IV v3 engine. Compatibility is checked
 * before the paid create call because SceneForge historically selected an
 * ElevenLabs voice and some existing avatar looks are v2-only. Any unsupported
 * look/voice or create failure falls back to the exact prior v2 audio payload.
 */
export async function submitAvatarRender(
  payload: NonNullable<ForgeBrowserTask['payload']>,
  options?: { forceLegacy?: boolean; fallbackReason?: string },
): Promise<AvatarRenderSubmission> {
  let fallbackReason = options?.fallbackReason || null;
  const preferred = payload.preferred_v3;
  if (!options?.forceLegacy && preferred) {
    try {
      const avatarId = String(preferred.avatar_id || '');
      const voiceId = String(preferred.voice_id || '');
      const lookResult = await heygen(`v3/avatars/looks/${encodeURIComponent(avatarId)}`);
      const look = lookResult?.data || lookResult || {};
      const supported = Array.isArray(look.supported_api_engines) ? look.supported_api_engines.map(String) : [];
      if (supported.indexOf('avatar_iv') < 0) throw new Error('The selected avatar look does not support Avatar IV.');
      const voiceResult = await heygen(`v3/voices/${encodeURIComponent(voiceId)}`);
      const voice = voiceResult?.data || voiceResult || {};
      if (String(voice.voice_id || '') !== voiceId) throw new Error('The selected voice is not available in HeyGen v3.');
      const data = await heygen('v3/videos', { method: 'POST', body: JSON.stringify(preferred) });
      const videoId = String(data?.data?.video_id || data?.video_id || '');
      if (!videoId) throw new Error('HeyGen Avatar IV accepted the request but did not return data.video_id.');
      return { videoId, renderApi: 'v3', avatarModel: 'avatar_iv', fallbackReason: null };
    } catch (error: any) {
      fallbackReason = String(error?.message || error || 'Avatar IV is unavailable.').slice(0, 320);
    }
  }

  const data = await heygen('v2/video/generate', { method: 'POST', body: JSON.stringify(legacyAvatarPayload(payload)) });
  const videoId = String(data?.data?.video_id || data?.video_id || '');
  if (!videoId) throw new Error('HeyGen accepted the legacy fallback request but did not return data.video_id.');
  return { videoId, renderApi: 'v2', avatarModel: 'legacy_v2', fallbackReason };
}

export interface AvatarRenderStatus {
  status: string;
  url: string | null;
  durationSec: number;
  error: string | null;
}

export async function pollAvatarRender(videoId: string, renderApi: 'v2' | 'v3' = 'v2'): Promise<AvatarRenderStatus> {
  if (renderApi === 'v3') {
    const data = await heygen(`v3/videos/${encodeURIComponent(videoId)}`);
    const video = data?.data || data || {};
    return {
      status: String(video?.status || 'processing').toLowerCase(),
      url: typeof video?.video_url === 'string' && /^https?:\/\//i.test(video.video_url) ? String(video.video_url) : null,
      durationSec: Number(video?.duration) || 0,
      error: [video?.failure_code, video?.failure_message].filter(Boolean).join(': ') || null,
    };
  }
  const data = await heygen(`v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);
  const video = data?.data || data || {};
  const failure = video?.error;
  return {
    status: String(video?.status || 'processing').toLowerCase(),
    url: typeof video?.video_url === 'string' && /^https?:\/\//i.test(video.video_url) ? String(video.video_url) : null,
    durationSec: Number(video?.duration) || 0,
    error: failure
      ? [failure.code, failure.message, failure.detail].filter(Boolean).join(': ') || 'HeyGen reported that the avatar render failed.'
      : null,
  };
}

// HeyGen caps list page sizes at 50 — a larger `limit` is rejected with
// HTTP 400 "Input should be less than or equal to 50". Page with next_token
// until the API stops returning one, accumulating the full catalog.
const HEYGEN_PAGE_LIMIT = 50;
const HEYGEN_MAX_PAGES = 200;

async function collectHeygenPages(path: string, extract: (data: any) => any[]): Promise<any[]> {
  const items: any[] = [];
  const seenTokens = new Set<string>();
  let next = '';
  for (let page = 0; page < HEYGEN_MAX_PAGES; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const suffix = next ? `&next_token=${encodeURIComponent(next)}` : '';
    const data = await heygen(`${path}${joiner}limit=${HEYGEN_PAGE_LIMIT}${suffix}`);
    const pageItems = extract(data) || [];
    items.push(...pageItems);
    next = String(
      data?.next_token || data?.nextToken || data?.page_token || data?.next_page_token ||
      data?.data?.next_token || data?.data?.nextToken || data?.data?.page_token || data?.data?.next_page_token || '',
    );
    const hasMore = data?.has_more ?? data?.hasMore ?? data?.data?.has_more ?? data?.data?.hasMore;
    if (!next || seenTokens.has(next) || hasMore === false || !pageItems.length) break;
    seenTokens.add(next);
  }
  return items;
}

let avatarCache: ForgeAvatar[] | null = null;
export async function loadAvatars(forceReload = false): Promise<ForgeAvatar[]> {
  if (forceReload) avatarCache = null;
  if (avatarCache) return avatarCache;
  const raw: any[] = [];
  let lastError: unknown = null;
  try {
    raw.push(...await collectHeygenPages('v2/avatars', (d) => [
      ...(d?.data?.avatars || d?.avatars || []),
      ...(d?.data?.talking_photos || []),
    ]));
  } catch (error) {
    lastError = error;
    try {
      const flat = await heygen('v2/avatars');
      raw.push(...(flat?.data?.avatars || flat?.avatars || []), ...(flat?.data?.talking_photos || []));
    } catch (flatError) {
      lastError = flatError;
    }
  }
  try {
    raw.push(...await collectHeygenPages('v3/avatars/looks', (d) => (
      Array.isArray(d?.data) ? d.data : Array.isArray(d?.data?.looks) ? d.data.looks : []
    )));
  } catch (error) {
    lastError = error;
  }
  if (!raw.length && lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
  const mapped = raw.map((a): ForgeAvatar | null => {
    const id = String(a?.avatar_id || a?.id || '');
    if (!id) return null;
    const groupId = String(a?.avatar_group_id || a?.group_id || a?.group?.id || '');
    const labels = a?.labels || {};
    const tags = Array.isArray(a?.tags) ? a.tags.map(String) : [];
    const listField = (...values: any[]): string[] => [...new Set(values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).map(String).map((value) => value.trim()).filter(Boolean))];
    const gestures = listField(a?.gestures, a?.supported_gestures, a?.gesture_types, labels?.gestures);
    const emotions = listField(a?.emotions, a?.supported_emotions, a?.emotion_types, labels?.emotions);
    const supportedEngines = listField(a?.supported_api_engines, a?.supportedApiEngines);
    const text = [a?.avatar_name, a?.look_name, a?.name, a?.description, a?.ethnicity, a?.region, a?.category, a?.avatar_type, labels.ethnicity, labels.region, ...tags].filter(Boolean).join(' ').toLowerCase();
    const indian = /\b(india|indian|south[ -]?asian|desi|hindi|punjabi|bengali|tamil|telugu|malayalam|marathi)\b/.test(text);
    return {
      id, groupId: groupId || undefined, name: String(a?.avatar_name || a?.look_name || a?.name || `Avatar ${id.slice(0, 8)}`),
      gender: String(a?.gender || labels.gender || 'unspecified').toLowerCase(),
      age: String(a?.age || labels.age || 'unspecified').toLowerCase(),
      region: indian ? 'indian-south-asian' : String(a?.region || labels.region || a?.ethnicity || labels.ethnicity || 'other').toLowerCase(),
      ethnicity: String(a?.ethnicity || labels.ethnicity || (indian ? 'South Asian' : '')),
      style: String(a?.style || labels.style || a?.avatar_style || a?.avatar_type || 'standard').toLowerCase(),
      category: String(a?.category || a?.avatar_type || a?.type || (a?.is_public === false ? 'account' : 'public')).toLowerCase(),
      description: String(a?.description || labels.description || ''), tags: indian ? [...tags, 'Indian', 'South Asian'] : tags,
      previewImage: String(a?.preview_image_url || a?.preview_image || a?.image_url || a?.thumbnail_url || ''),
      previewVideo: String(a?.preview_video_url || a?.preview_video || a?.video_url || ''),
      gestures,
      emotions,
      supportedEngines,
    };
  }).filter(Boolean) as ForgeAvatar[];
  const deduped = [...new Map(mapped.reverse().map((avatar) => [avatar.id, avatar])).values()];
  if (!deduped.length) throw new Error('HeyGen returned an empty avatar catalog.');
  avatarCache = deduped.sort((a, b) => a.name.localeCompare(b.name));
  return avatarCache;
}

/**
 * Bundle HeyGen avatars by the provider's stable avatar_group_id. Catalog rows
 * without a group id fall back to a conservative normalized presenter name.
 */
export function bundleAvatars(avatars: ForgeAvatar[]): ForgeAvatarBundle[] {
  const groups = new Map<string, ForgeAvatarBundle>();
  for (const a of avatars) {
    const first = a.name.split(/[\s_(\-]/)[0] || a.name;
    const key = a.groupId ? `group:${a.groupId}` : `name:${first.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) existing.looks.push(a);
    else groups.set(key, { key, name: first, looks: [a] });
  }
  return [...groups.values()].sort((x, y) => {
    const xMine = x.looks.some((look) => look.category === 'my-avatar');
    const yMine = y.looks.some((look) => look.category === 'my-avatar');
    return Number(yMine) - Number(xMine) || y.looks.length - x.looks.length || x.name.localeCompare(y.name);
  });
}

