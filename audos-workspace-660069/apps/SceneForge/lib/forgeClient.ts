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
 * Idea-to-script runs on gpt-6.1-sol through the OpenAI proxy per the app AI
 * policy (interactive tier, X-Workspace-DB-Token).
 */
import { callHook, getWorkspaceToken, WORKSPACE_ID } from '../../../lib/workspace';
import type { ForgeAvatar, ForgeAvatarBundle, ForgeChoices, ForgeClonedVoice, ForgeCreatedAvatar, ForgeProject } from './forgeTypes';

// ---------------------------------------------------------------------------
// Pipeline ops
// ---------------------------------------------------------------------------

async function pipeline(body: Record<string, unknown>): Promise<any> {
  return callHook('sceneforge-pipeline', body);
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

export async function startProject(projectId: string, script: string, choices: ForgeChoices): Promise<ForgeProject> {
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
  return data?.project || null;
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
  const data = await pipeline({ op: 'retry_step', project_id: projectId });
  if (!data?.ok) throw new Error(data?.error || 'This step could not be retried.');
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
// Idea → script (gpt-6.1-sol via the OpenAI proxy — interactive tier)
// ---------------------------------------------------------------------------

export async function ideaToScript(idea: string, niche: string, targetSeconds: number): Promise<string> {
  const token = await getWorkspaceToken();
  if (!token) throw new Error('Your workspace session is not ready yet — refresh and try again.');
  const wordsTarget = Math.round((targetSeconds / 60) * 140);
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token },
    body: JSON.stringify({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
      messages: [
        {
          role: 'system',
          content:
            'You write spoken presenter scripts for avatar videos. Conversational, specific, zero filler. ' +
            'Write ONLY the words the presenter says — no stage directions, no headings, no markdown. ' +
            'Tailor examples and vocabulary to the stated niche/industry so the video feels made for that audience.',
        },
        {
          role: 'user',
          content:
            'Niche/industry: ' + (niche || 'general business') + '\n' +
            'Target length: about ' + targetSeconds + ' seconds (~' + wordsTarget + ' words).\n' +
            'Idea: ' + idea,
        },
      ],
    }),
  });
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (!res.ok || !text) throw new Error(data?.error?.message || data?.error || 'The script could not be generated.');
  return String(text).trim();
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
  const data = requireCreatorResult(await avatarCreator({
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
  }), 'Avatar creation could not start.');
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
  const token = await getWorkspaceToken();
  if (!token) throw new Error('Your workspace session is not ready yet — refresh and try again.');
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('workspaceId', WORKSPACE_ID);
  form.append('folder', folder);
  const response = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { 'X-Workspace-DB-Token': token },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) throw new Error(String(data?.error || `Workspace upload failed (HTTP ${response.status}).`));
  return { url: String(data.url), key: data.key ? String(data.key) : null };
}

export function uploadWorkspaceAvatarFile(file: File): Promise<{ url: string; key: string | null }> {
  return uploadWorkspaceSceneForgeFile(file, 'sceneforge-avatars');
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
  const data = requireCreatorResult(await avatarCreator({ op: 'voice_create', name: name.trim(), files: uploaded }), 'ElevenLabs voice cloning failed.');
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
  const token = await getWorkspaceToken();
  if (!token) throw new Error('Your workspace session is not ready yet — refresh and try again.');
  const response = await fetch(`${HEYGEN_PROXY()}/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: { ...(init?.method ? { 'Content-Type': 'application/json' } : {}), 'X-Workspace-DB-Token': token, ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HeyGen HTTP ${response.status}: ${data?.error?.message || data?.message || data?.error || 'request failed'}`);
  return data;
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

