import { callHook, WORKSPACE_ID } from '../../../lib/workspace';

export type Endpoint = {
  id: string;
  category: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  paid?: boolean;
  sample?: Record<string, unknown>;
};

export class HeyGenError extends Error {
  status: number;
  code: string;
  data: unknown;
  constructor(message: string, status = 0, code = '', data: unknown = null) {
    super(message);
    this.name = 'HeyGenError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export const ENGINE_PREFERENCE = ['avatar_iv', 'avatar_v', 'avatar_iii'] as const;

function workspaceId() {
  return String((typeof window !== 'undefined' && (window as any).__WORKSPACE_ID__) || WORKSPACE_ID);
}

export function heygenProxyUrl(path: string) {
  return `/api/workspaces/${encodeURIComponent(workspaceId())}/provider-credentials/heygen/proxy/${path.replace(/^\/+/, '')}`;
}

function errorMessage(data: any, status: number) {
  const error = data?.error;
  const detail = (error && typeof error === 'object' ? error.message : typeof error === 'string' ? error : '')
    || data?.message || data?.failure_message || (typeof data === 'string' ? data.slice(0, 300) : '');
  return `HeyGen returned HTTP ${status}${detail ? `: ${detail}` : ''}`;
}

/** Same-origin call through the Audos HeyGen proxy; the platform injects the key server-side. */
export async function heygen(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}) {
  let response: Response;
  try {
    response = await fetch(heygenProxyUrl(path), {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (error: any) {
    throw new HeyGenError(`Could not reach HeyGen: ${String(error?.message || error)}`, 0, 'network_error');
  }
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const code = String((data?.error && typeof data.error === 'object' ? data.error.code : '') || data?.code || '');
    throw new HeyGenError(errorMessage(data, response.status), response.status, code, data);
  }
  return data;
}

function queryString(query?: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Lightweight readiness probe. */
export async function probeHeygen() {
  return heygen('v3/avatars/looks?limit=1');
}

/** One page of a v3 list endpoint (`{ data, has_more, next_token }`); pass next_token back as `token`. */
export async function listPage(path: string, options: { limit?: number; token?: string | null; query?: Record<string, string | number> } = {}) {
  const result = await heygen(`${path}${queryString({ ...(options.query || {}), limit: options.limit, token: options.token || undefined })}`);
  return {
    items: Array.isArray(result?.data) ? result.data : [],
    hasMore: Boolean(result?.has_more),
    nextToken: (result?.next_token as string | null) || null,
  };
}

/** Reads the look's supported_api_engines and returns an explicit engine to send. */
export async function resolveEngine(lookId: string, preferred?: string) {
  const response = await heygen(`v3/avatars/looks/${encodeURIComponent(lookId)}`);
  const look = response?.data || response || {};
  const supported: string[] = Array.isArray(look.supported_api_engines) ? look.supported_api_engines : [];
  const engine = preferred && supported.includes(preferred)
    ? preferred
    : ENGINE_PREFERENCE.find((candidate) => supported.includes(candidate));
  if (!engine) throw new HeyGenError('This avatar look does not support a v3 video engine.', 400, 'unsupported_engine', look);
  return { engine, look, supported };
}

export async function validateVoice(voiceId: string) {
  const response = await heygen(`v3/voices/${encodeURIComponent(voiceId)}`);
  const voice = response?.data || response;
  if (voice?.voice_id !== voiceId) throw new HeyGenError('The selected voice is not available in HeyGen v3.', 404, 'voice_not_found', voice);
  return voice;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls GET v3/videos/:id until completed or failed (surfacing failure_code / failure_message). */
export async function pollVideo(videoId: string, onUpdate?: (detail: any) => void, options: { intervalMs?: number; timeoutMs?: number } = {}) {
  const interval = options.intervalMs ?? 5000;
  const deadline = Date.now() + (options.timeoutMs ?? 20 * 60_000);
  for (let attempt = 0; Date.now() < deadline; attempt += 1) {
    if (attempt) await sleep(interval);
    const response = await heygen(`v3/videos/${encodeURIComponent(videoId)}`);
    const detail = response?.data || response || {};
    onUpdate?.(detail);
    const state = String(detail.status || '').toLowerCase();
    if (state === 'completed') return detail;
    if (state === 'failed') {
      throw new HeyGenError(`HeyGen render failed${detail.failure_code ? ` (${detail.failure_code})` : ''}: ${detail.failure_message || 'no failure message returned'}`, 200, String(detail.failure_code || 'render_failed'), detail);
    }
  }
  throw new HeyGenError('The render is still processing. Check it later from API Console with "Get / poll video".', 0, 'poll_timeout');
}

export const HEYGEN_ENDPOINTS: Endpoint[] = [
  { id: 'users.me', category: 'Account', label: 'Get current user', method: 'GET', path: '/v3/users/me' },
  { id: 'videos.list', category: 'Videos', label: 'List videos', method: 'GET', path: '/v3/videos' },
  { id: 'videos.create', category: 'Videos', label: 'Create Avatar III / IV / V, image, audio, cinematic or Studio video', method: 'POST', path: '/v3/videos', paid: true, sample: { type: 'avatar', avatar_id: 'LOOK_ID', engine: { type: 'avatar_iv' }, script: 'Hello from Avatar App.', voice_id: 'VOICE_ID', resolution: '1080p', aspect_ratio: '9:16', fit: 'cover', output_format: 'mp4' } },
  { id: 'videos.get', category: 'Videos', label: 'Get / poll video', method: 'GET', path: '/v3/videos/{video_id}' },
  { id: 'videos.edit', category: 'Videos', label: 'Edit scenes and re-render', method: 'POST', path: '/v3/videos/{video_id}', paid: true },
  { id: 'videos.scenes', category: 'Videos', label: 'Get editable scenes', method: 'GET', path: '/v3/videos/{video_id}/scenes' },
  { id: 'agents.create', category: 'Video Agent', label: 'Create Video Agent session', method: 'POST', path: '/v3/video-agents', paid: true, sample: { prompt: 'A presenter explaining our product in 30 seconds', mode: 'generate', orientation: 'portrait' } },
  { id: 'agents.list', category: 'Video Agent', label: 'List Video Agent sessions', method: 'GET', path: '/v3/video-agents' },
  { id: 'agents.styles', category: 'Video Agent', label: 'List Video Agent styles', method: 'GET', path: '/v3/video-agents/styles' },
  { id: 'agents.get', category: 'Video Agent', label: 'Get Video Agent session', method: 'GET', path: '/v3/video-agents/{session_id}' },
  { id: 'agents.message', category: 'Video Agent', label: 'Send message / revision', method: 'POST', path: '/v3/video-agents/{session_id}' },
  { id: 'agents.videos', category: 'Video Agent', label: 'List session videos', method: 'GET', path: '/v3/video-agents/{session_id}/videos' },
  { id: 'agents.stop', category: 'Video Agent', label: 'Stop session', method: 'POST', path: '/v3/video-agents/{session_id}/stop' },
  { id: 'avatars.create', category: 'Avatars', label: 'Create photo, prompt or Digital Twin avatar', method: 'POST', path: '/v3/avatars', paid: true, sample: { type: 'photo', name: 'My avatar', image_url: 'https://...' } },
  { id: 'avatars.groups', category: 'Avatars', label: 'List avatar groups', method: 'GET', path: '/v3/avatars' },
  { id: 'avatars.group.get', category: 'Avatars', label: 'Get avatar group', method: 'GET', path: '/v3/avatars/{group_id}' },
  { id: 'avatars.consent', category: 'Avatars', label: 'Start avatar consent', method: 'POST', path: '/v3/avatars/{group_id}/consent' },
  { id: 'avatars.looks', category: 'Avatars', label: 'List avatar looks', method: 'GET', path: '/v3/avatars/looks' },
  { id: 'avatars.look.create', category: 'Avatars', label: 'Create Look Pack / look template', method: 'POST', path: '/v3/avatars/looks', paid: true },
  { id: 'avatars.look.get', category: 'Avatars', label: 'Get avatar look and engines', method: 'GET', path: '/v3/avatars/looks/{look_id}' },
  { id: 'voices.list', category: 'Voices', label: 'List voices', method: 'GET', path: '/v3/voices' },
  { id: 'voices.get', category: 'Voices', label: 'Get voice / clone status', method: 'GET', path: '/v3/voices/{voice_id}' },
  { id: 'voices.clone', category: 'Voices', label: 'Clone voice', method: 'POST', path: '/v3/voices/clone', paid: true },
  { id: 'voices.design', category: 'Voices', label: 'Design voice', method: 'POST', path: '/v3/voices' },
  { id: 'voices.speech', category: 'Voices', label: 'Generate speech', method: 'POST', path: '/v3/voices/speech', paid: true },
  { id: 'templates.list', category: 'Studio & Templates', label: 'List API-ready templates', method: 'GET', path: '/v3/templates' },
  { id: 'templates.create', category: 'Studio & Templates', label: 'Create template from video', method: 'POST', path: '/v3/templates' },
  { id: 'templates.get', category: 'Studio & Templates', label: 'Get template and variables', method: 'GET', path: '/v3/templates/{template_id}' },
  { id: 'templates.generate', category: 'Studio & Templates', label: 'Generate from template', method: 'POST', path: '/v3/templates/{template_id}', paid: true },
  { id: 'brand-kits.list', category: 'Brand', label: 'List Brand Kits', method: 'GET', path: '/v3/brand-kits' },
  { id: 'brand-kits.create', category: 'Brand', label: 'Import Brand Kit from URL', method: 'POST', path: '/v3/brand-kits' },
  { id: 'brand-kits.get', category: 'Brand', label: 'Get Brand Kit', method: 'GET', path: '/v3/brand-kits/{brand_kit_id}' },
  { id: 'glossaries.list', category: 'Brand', label: 'List brand glossaries', method: 'GET', path: '/v3/brand-glossaries' },
  { id: 'glossaries.create', category: 'Brand', label: 'Create brand glossary', method: 'POST', path: '/v3/brand-glossaries' },
  { id: 'glossaries.get', category: 'Brand', label: 'Get brand glossary', method: 'GET', path: '/v3/brand-glossaries/{brand_glossary_id}' },
  { id: 'translations.create', category: 'Translate & Dub', label: 'Translate / dub (Speed or Precision)', method: 'POST', path: '/v3/video-translations', paid: true, sample: { video_url: 'https://...', output_languages: ['Spanish'], mode: 'speed', translate_audio_only: false } },
  { id: 'translations.list', category: 'Translate & Dub', label: 'List translations', method: 'GET', path: '/v3/video-translations' },
  { id: 'translations.get', category: 'Translate & Dub', label: 'Get translation', method: 'GET', path: '/v3/video-translations/{video_translation_id}' },
  { id: 'translations.languages', category: 'Translate & Dub', label: 'List supported languages', method: 'GET', path: '/v3/video-translations/languages' },
  { id: 'proofreads.create', category: 'Translate & Dub', label: 'Create Precision proofread session', method: 'POST', path: '/v3/video-translations/proofreads' },
  { id: 'proofreads.get', category: 'Translate & Dub', label: 'Get proofread session', method: 'GET', path: '/v3/video-translations/proofreads/{proofread_id}' },
  { id: 'proofreads.srt.get', category: 'Translate & Dub', label: 'Download proofread SRT', method: 'GET', path: '/v3/video-translations/proofreads/{proofread_id}/srt' },
  { id: 'proofreads.generate', category: 'Translate & Dub', label: 'Generate approved Precision translation', method: 'POST', path: '/v3/video-translations/proofreads/{proofread_id}/generate', paid: true },
  { id: 'lipsyncs.create', category: 'Lipsync', label: 'Create Speed / Precision lipsync', method: 'POST', path: '/v3/lipsyncs', paid: true, sample: { video_url: 'https://...', audio_url: 'https://...', mode: 'precision' } },
  { id: 'lipsyncs.list', category: 'Lipsync', label: 'List lipsyncs', method: 'GET', path: '/v3/lipsyncs' },
  { id: 'lipsyncs.get', category: 'Lipsync', label: 'Get lipsync', method: 'GET', path: '/v3/lipsyncs/{lipsync_id}' },
  { id: 'audio.search', category: 'Audio tools', label: 'Search music or SFX', method: 'GET', path: '/v3/audio/sounds' },
  { id: 'clipping.create', category: 'Post-production', label: 'Create AI clipping job', method: 'POST', path: '/v3/ai-clipping', paid: true },
  { id: 'clipping.get', category: 'Post-production', label: 'Get AI clipping job', method: 'GET', path: '/v3/ai-clipping/{job_id}' },
  { id: 'fillers.create', category: 'Post-production', label: 'Remove filler words and silences', method: 'POST', path: '/v3/filler-word-removals', paid: true },
  { id: 'fillers.get', category: 'Post-production', label: 'Get filler-word removal', method: 'GET', path: '/v3/filler-word-removals/{filler_word_removal_id}' },
  { id: 'batches.videos.create', category: 'Batches', label: 'Create video batch (up to 100)', method: 'POST', path: '/v3/videos/batches', paid: true },
  { id: 'batches.videos.get', category: 'Batches', label: 'Get video batch', method: 'GET', path: '/v3/videos/batches/{batch_id}' },
  { id: 'batches.videos.statuses', category: 'Batches', label: 'Bulk video statuses', method: 'GET', path: '/v3/videos/statuses' },
  { id: 'batches.translations.create', category: 'Batches', label: 'Create translation batch', method: 'POST', path: '/v3/video-translations/batches', paid: true },
  { id: 'batches.translations.get', category: 'Batches', label: 'Get translation batch', method: 'GET', path: '/v3/video-translations/batches/{batch_id}' },
  { id: 'batches.lipsyncs.create', category: 'Batches', label: 'Create lipsync batch', method: 'POST', path: '/v3/lipsyncs/batches', paid: true },
  { id: 'batches.lipsyncs.get', category: 'Batches', label: 'Get lipsync batch', method: 'GET', path: '/v3/lipsyncs/batches/{batch_id}' },
  { id: 'webhooks.event-types', category: 'Webhooks', label: 'List webhook event types', method: 'GET', path: '/v3/webhooks/event-types' },
  { id: 'webhooks.list', category: 'Webhooks', label: 'List webhook endpoints', method: 'GET', path: '/v3/webhooks/endpoints' },
  { id: 'webhooks.create', category: 'Webhooks', label: 'Create webhook endpoint', method: 'POST', path: '/v3/webhooks/endpoints' },
  { id: 'hyperframes.list', category: 'HyperFrames', label: 'List HyperFrames renders', method: 'GET', path: '/v3/hyperframes/renders' },
  { id: 'hyperframes.get', category: 'HyperFrames', label: 'Get HyperFrames render', method: 'GET', path: '/v3/hyperframes/renders/{render_id}' },
];

export async function avatarApi(endpoint: string, options: { params?: Record<string, string>; query?: Record<string, string | number | boolean>; body?: unknown } = {}) {
  const spec = HEYGEN_ENDPOINTS.find((item) => item.id === endpoint);
  if (!spec) throw new HeyGenError(`Unsupported endpoint: ${endpoint}`, 400, 'unsupported_endpoint');
  const path = spec.path.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const value = String(options.params?.[key] ?? '').trim();
    if (!/^[A-Za-z0-9_.:-]+$/.test(value)) throw new HeyGenError(`A valid ${key} is required.`, 400, 'invalid_parameter');
    return encodeURIComponent(value);
  });
  return heygen(`${path}${queryString(options.query)}`, spec.method === 'POST' ? { method: 'POST', body: options.body ?? {} } : {});
}

const CRC_TABLE = (() => { const table: number[] = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; } return table; })();
function crc32(bytes: Uint8Array) { let crc = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
const le16 = (v: number) => [v & 255, (v >>> 8) & 255];
const le32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

/** Stored (uncompressed) single-file ZIP containing index.html, as HyperFrames expects. */
function zipIndex(html: string) {
  const encoder = new TextEncoder(); const name = encoder.encode('index.html'); const data = encoder.encode(html); const crc = crc32(data);
  const local = [...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0)];
  const central = [...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(0)];
  const centralOffset = local.length + name.length + data.length;
  const end = [...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(1), ...le16(1), ...le32(central.length + name.length), ...le32(centralOffset), ...le16(0)];
  const parts = [Uint8Array.from(local), name, data, Uint8Array.from(central), name, Uint8Array.from(end)];
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function renderHyperframes(input: { html: string; width: number; height: number; duration: number; title: string; format?: 'mp4' | 'webm' | 'mov'; quality?: 'draft' | 'standard' | 'high' }, onUpdate?: (detail: any) => void) {
  const aspect = input.width === input.height ? '1:1' : input.width < input.height ? '9:16' : '16:9';
  const created = await heygen('v3/hyperframes/renders', { method: 'POST', body: { project: { type: 'base64', data: toBase64(zipIndex(input.html)) }, fps: 30, quality: input.quality || 'standard', format: input.format || 'mp4', resolution: '1080p', aspect_ratio: aspect, composition: 'index.html', title: input.title.slice(0, 500) || 'Avatar App render' } });
  const renderId = String(created?.data?.render_id || created?.render_id || '');
  if (!renderId) throw new HeyGenError('HeyGen accepted the HyperFrames render but returned no render_id.', 200, 'missing_render_id', created);
  const deadline = Date.now() + 10 * 60_000;
  for (let attempt = 0; Date.now() < deadline; attempt += 1) {
    if (attempt) await sleep(5000);
    const polled = await heygen(`v3/hyperframes/renders/${encodeURIComponent(renderId)}`);
    const detail = polled?.data || polled || {};
    onUpdate?.(detail);
    const state = String(detail.status || '').toLowerCase();
    if (state === 'completed') {
      const url = String(detail.video_url || '');
      if (/^https?:\/\//i.test(url)) void callHook('avatar-app-api', { op: 'save_history', url, title: input.title, duration: input.duration }).catch(() => undefined);
      return { success: true, status: 'completed', engine: 'hyperframes', renderId, videoUrl: url, thumbnailUrl: detail.thumbnail_url || null, duration: Number(detail.duration) || input.duration, aspectRatio: aspect };
    }
    if (state === 'failed') throw new HeyGenError(`HyperFrames render failed${detail.failure_code ? ` (${detail.failure_code})` : ''}: ${detail.failure_message || detail.error || 'no failure message returned'}`, 200, String(detail.failure_code || 'hyperframes_failed'), detail);
  }
  return { success: true, status: 'rendering', engine: 'hyperframes', renderId, message: 'The cloud render is still running. Poll it from API Console with "Get HyperFrames render".' };
}

export async function directorTurn(messages: Array<{ role: string; content?: string; tool_calls?: unknown; tool_call_id?: string }>, context: Record<string, unknown>) {
  const token = (window as any).__workspaceDb?.token;
  if (!token) throw new Error('Workspace credentials are still loading.');
  const tools = [
    { type: 'function', function: { name: 'estimate_credits', description: 'Estimate generated seconds and Vidverge credits before any paid action.', parameters: { type: 'object', properties: { script: { type: 'string' }, seconds: { type: 'number' } }, required: [] } } },
    { type: 'function', function: { name: 'prepare_production', description: 'Prepare a reviewable Avatar App production plan. This never starts paid generation.', parameters: { type: 'object', properties: { mode: { type: 'string' }, aspect_ratio: { type: 'string' }, style_id: { type: 'string' }, notes: { type: 'string' } }, required: ['mode', 'aspect_ratio'] } } },
    { type: 'function', function: { name: 'inspect_capability', description: 'Check whether an Avatar App capability exists and which endpoint family implements it.', parameters: { type: 'object', properties: { capability: { type: 'string' } }, required: ['capability'] } } },
  ];
  const response = await fetch('/proxy/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token }, body: JSON.stringify({ model: 'gpt-5.6-sol', reasoning_effort: 'medium', max_completion_tokens: 6000, messages: [{ role: 'system', content: 'You are Avatar App Director, reusing SceneForge production language. Be concise. Use tools to estimate and prepare before recommending generation. Never claim a paid action ran; the user must click Generate. Available context: ' + JSON.stringify(context) }, ...messages], tools, tool_choice: 'auto' }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Director request failed.');
  return data?.choices?.[0]?.message;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function safeUrl(value: string) {
  return /^https:\/\//i.test(value) ? value.replace(/["'<>]/g, '') : '';
}

export function buildHyperframesComposition(input: { script: string; avatarUrl?: string; backgroundUrl?: string; logoUrl?: string; title: string; endCard?: string; width: number; height: number; duration: number; accent?: string }) {
  const words = input.script.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 5) chunks.push(words.slice(index, index + 5).join(' '));
  const duration = Math.max(4, input.duration);
  const endStart = Math.max(1, duration - 2.2);
  const cueDuration = Math.max(.7, endStart / Math.max(1, chunks.length));
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent! : '#F6BE3B';
  const captions = chunks.map((chunk, index) => `<div class="caption clip" data-start="${(index * cueDuration).toFixed(2)}" data-duration="${Math.min(cueDuration + .2, duration).toFixed(2)}">${escapeHtml(chunk)}</div>`).join('');
  const cues = chunks.map((chunk, index) => ({ at: Number((index * cueDuration).toFixed(2)), label: chunk }));
  cues.push({ at: Number(endStart.toFixed(2)), label: 'end-card' });
  const avatar = safeUrl(input.avatarUrl || '');
  const background = safeUrl(input.backgroundUrl || '');
  const logo = safeUrl(input.logoUrl || '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#070708;font-family:Arial,sans-serif}.composition{position:relative;width:${input.width}px;height:${input.height}px;overflow:hidden;background:radial-gradient(circle at 70% 25%,#2d2515,#070708 54%);color:#fff}.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.08) 60%,rgba(0,0,0,.36))}.avatar{position:absolute;right:0;bottom:0;height:96%;max-width:72%;object-fit:contain}.brand{position:absolute;left:5%;top:5%;height:6%;max-width:24%;object-fit:contain}.caption{position:absolute;left:7%;right:7%;bottom:9%;opacity:0;transform:translateY(24px);font-size:${Math.round(input.height * .045)}px;line-height:1.05;font-weight:900;text-transform:uppercase;text-shadow:0 4px 24px #000;max-width:82%}.caption:before{content:'';display:block;width:64px;height:7px;background:${accent};margin-bottom:14px;border-radius:99px}.end{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:#090909;opacity:0;padding:8%}.end h1{font-size:${Math.round(input.height * .078)}px;margin:0 0 18px}.end p{color:${accent};font-size:${Math.round(input.height * .032)}px;margin:0}.safe{position:absolute;inset:4%;border:1px solid rgba(255,255,255,.08);pointer-events:none}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script></head><body><main class="composition clip" data-composition-id="avatar-app" data-start="0" data-duration="${duration}" data-width="${input.width}" data-height="${input.height}">${background ? `<video class="bg" src="${background}" autoplay muted loop playsinline></video>` : ''}<div class="shade"></div>${avatar ? `<video class="avatar" src="${avatar}" autoplay playsinline></video>` : ''}${logo ? `<img class="brand" src="${logo}">` : ''}${captions}<section class="end clip" data-start="${endStart.toFixed(2)}" data-duration="2.2"><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.endCard || 'Made with Avatar App')}</p></section><div class="safe"></div></main><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});document.querySelectorAll('.caption').forEach((el,i)=>{const at=i*${cueDuration.toFixed(4)};tl.to(el,{opacity:1,y:0,duration:.18},at).to(el,{opacity:0,y:-12,duration:.16},Math.min(${endStart.toFixed(2)},at+${Math.max(.3, cueDuration - .18).toFixed(4)}));});tl.to('.end',{opacity:1,duration:.35},${endStart.toFixed(2)});window.__timelines['avatar-app']=tl;</script></body></html>`;
  return { html, timeline: { duration, cues } };
}

import { quote as quotePrice } from '../../../lib/pricing';
import type { QuoteOptions } from '../../../lib/pricing';

/** Estimated output seconds and credits (real HeyGen cost + 30%, lib/pricing.ts). */
export function estimateCredits(script: string, seconds?: number, engine = 'heygen/avatar_iv', options: QuoteOptions = {}) {
  const estimatedSeconds = Math.max(1, Math.ceil(seconds || script.trim().split(/\s+/).filter(Boolean).length / 2.4));
  const priced = quotePrice(engine, { ...options, seconds: estimatedSeconds });
  return { seconds: estimatedSeconds, credits: priced.credits, costUsd: priced.costUsd, label: priced.label, engine: priced.engine, priced: priced.priced };
}
