/**
 * ADS STUDIO — shared types, auth plumbing, uploads, server-function calls and
 * localStorage session persistence for the agentic short-form ad engine:
 *
 *   product URL + avatar + assets
 *     → web research (scrape-website server function + creative planner)
 *     → ad angles → clip script → intent-led scene plan
 *     → Veo generation with Opus inspection + continuity notes
 *     → GSAP/SVG overlay layer (screenshot mockups, callouts, captions)
 *     → FFmpeg.wasm assembly (NO Remotion anywhere)
 *     → final downloadable MP4 + hook/body/CTA variations
 *
 * Vergeye supplies the research/intelligence entry point; this module remains
 * the existing short-ad production engine. Long-form film production stays in
 * Script-to-Video rather than being duplicated here.
 */

import type { ShotIntent } from '../../lib/videoEngines';
import {
  WORKSPACE_ID,
  callHook as callWorkspaceHook,
  getSessionId,
  spaceId,
  workspaceFetch,
  workspaceTokenNow,
} from '../../lib/workspace';

// ---------------------------------------------------------------------------
// Session / auth plumbing
// ---------------------------------------------------------------------------

export const wsToken = workspaceTokenNow;
export const sessionId = getSessionId;
export const appId = spaceId;

/** The workspace's UUID, injected by the platform at serve time. Used for
 *  provider-credential proxy and server-stitch endpoints that address the
 *  workspace by UUID rather than by space id. */
export function workspaceUuid(): string {
  return WORKSPACE_ID;
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface UploadedAsset { name: string; url: string }

export interface ProductResearch {
  product_name: string;
  one_liner: string;
  core_features: string[];
  pricing: string;
  target_audience: string;
  pain_points: string[];
  desires: string[];
  objections: string[];
  mechanism: string;
  awareness_level: string;
  customer_language: string[];
  positioning: string;
  proof_elements: string[];
  brand_context?: {
    website_url: string;
    tone: string;
    logo_url: string;
    colors: string[];
    fonts: string[];
    images: string[];
    social_links: string[];
    pages_read: Array<{ url: string; status: string }>;
    gaps: string[];
  };
}

export const ANGLE_TYPES = [
  'Problem/Pain', 'Identity', 'Mechanism', 'Benefit/Result', 'Objection Breaker',
  'Emotional', 'Status/Aspirational', 'Fear/Loss', 'Time/Convenience',
  'Price/Value', 'Comparison', 'Myth-Buster',
] as const;

export interface AdAngle {
  id: string;
  angle_name: string;
  angle_type: string;
  core_idea: string;
  target_audience_state: string;
  hook: string;
  problem: string;
  mechanism: string;
  desired_outcome: string;
  proof_opportunity: string;
  creative_direction: string;
}

export interface AdHook {
  id: string;
  angle: 'problem' | 'curiosity' | 'social-proof' | 'bold-claim' | 'before-after' | 'question' | 'identity' | 'objection';
  headline: string;
  firstSeconds: string;
  rationale: string;
  visualDirection: string;
}

/** Whole seconds. The familiar 4/6/8/10 ladder is only what short-clip
 * engines offer — models with different legal ranges derive their choices from
 * the canonical capability registry rather than a hard-coded provider belief. */
export type ClipDuration = number;

const LADDER_WORD_LIMITS: Record<number, number> = { 4: 9, 6: 13, 8: 17, 10: 22 };

/** HARD word limit for a clip of this length (about 2.2 spoken words a second,
 * matching the 4/6/8/10 ladder). */
export function wordLimitFor(seconds: number): number {
  const whole = Math.round(Number(seconds) || 0);
  return LADDER_WORD_LIMITS[whole] ?? Math.max(1, Math.round(whole * 2.2));
}

/** HARD word limits per clip duration — enforced in the UI and in prompts. */
export const WORD_LIMITS: Record<number, number> = (() => {
  const out: Record<number, number> = {};
  for (let seconds = 1; seconds <= 60; seconds += 1) out[seconds] = wordLimitFor(seconds);
  return out;
})();

/** The clip lengths the script step offers for an engine whose legal range is
 * minS–maxS: the 4/6/8/10 ladder with anything below the engine's floor
 * removed or, when the floor sits above the whole ladder, steps of five from
 * the floor up to the maximum. */
export function clipDurationChoices(limits: { minS: number; maxS: number }): ClipDuration[] {
  const base = [4, 6, 8, 10].filter((d) => d >= limits.minS);
  if (base.length) return base;
  const out: number[] = [];
  for (let d = limits.minS; d < limits.maxS; d += 5) out.push(d);
  out.push(limits.maxS);
  return out;
}

export function wordCount(line: string): number {
  return String(line || '').trim().split(/\s+/).filter(Boolean).length;
}

export interface ScriptClip {
  clip_number: number;
  clip_role: string;
  duration_seconds: ClipDuration;
  spoken_line: string;
  word_count: number;
  visual_concept: string;
  overlay_idea: string;
  emotion: string;
}

export type OverlayType =
  | 'none' | 'screenshot_mockup' | 'text_callout' | 'review_card'
  | 'stat_counter' | 'cta_button' | 'arrow_highlight';

export type MockupDevice = 'phone' | 'laptop' | 'browser' | 'tablet' | 'monitor';

export interface GeneratedAssetNeed { description: string; purpose: string }

export interface ScenePlan {
  clip_number: number;
  /** The creative decision. Shared routing turns this intent into a workflow. */
  shot_intent?: ShotIntent;
  /** Resolved by routeShotIntent; never invented by the planner. */
  workflow_kind?: 'engine' | 'recipe' | 'code' | 'unavailable';
  engine_id?: string | null;
  engine_reason?: string;
  /** Every duration clamp/violation is visible; none is applied silently. */
  duration_notes?: string[];
  camera_movement: string;
  framing: string;
  subject_position: string;
  micro_action: string;
  gesture: string;
  spoken_line: string;
  voice_description: string;
  accent: string;
  expression: string;
  environment: string;
  lighting: string;
  visual_style: string;
  product_interaction: string;
  continuity_notes: string;
  do_not_show: string;
  overlay_assets: string[];
  overlay_type: OverlayType;
  overlay_text: string;
  veo_prompt: string;
  use_screenshot_mockup: boolean;
  screenshot_mockup_type: MockupDevice;
  generated_assets_needed?: GeneratedAssetNeed[];
}

export interface GeneratedAsset extends GeneratedAssetNeed { url: string }

export type ClipStatus = 'pending' | 'generating' | 'inspecting' | 'accepted' | 'regenerated' | 'failed';

export interface GeneratedClip {
  clipNumber: number;
  videoUrl: string | null;
  status: ClipStatus;
  issues: string[];
  attempts: number;
  lastFrameUrl: string | null;
  promptUsed: string;
  /** The ACTUAL model this clip rendered on — recorded per clip, never assumed. */
  modelUsed?: string | null;
  /** creatables_jobs row used to resume the exact provider operation. */
  backgroundJobId?: number | null;
  note: string;
}

export interface HookVideoJob {
  id: string;
  hookId: string;
  hook: AdHook;
  status: 'queued' | 'planning' | 'generating' | 'assembling' | 'done' | 'failed';
  progress: number;
  stage: string;
  error: string;
  videoUrl: string | null;
  script: ScriptClip[];
  scenePlan: ScenePlan[];
  clips: GeneratedClip[];
  startedAt: string;
  updatedAt: string;
}

export interface VariationMatrix {
  /** Alternative spoken lines for the hook clip; index 0 = the original. */
  hooks: string[];
  /** Alternative middle-section line sets, keyed by clip_number; index 0 = original. */
  bodies: Record<string, string>[];
  /** Alternative CTA-clip lines; index 0 = the original. */
  ctas: string[];
}

export interface AdVariation {
  id: string;
  hookIdx: number;
  bodyIdx: number;
  ctaIdx: number;
  status: 'pending' | 'generating' | 'assembling' | 'done' | 'error';
  error: string | null;
  videoUrl: string | null;
  clipVideos: Record<string, string>;
  /** Per-clip creatables_jobs rows for an interrupted variation build. */
  backgroundJobs?: Record<string, number>;
}

export interface AdsSession {
  // Intake
  productUrl: string;
  productDescription: string;
  offerCta: string;
  avatar: UploadedAsset | null;
  screenshots: UploadedAsset[];
  productImages: UploadedAsset[];
  productVideos: UploadedAsset[];
  logo: UploadedAsset | null;
  aspect: '9:16' | '16:9' | '1:1';
  // Research
  research: ProductResearch | null;
  researchStatus: 'idle' | 'loading' | 'done' | 'error';
  researchError: string | null;
  // Angles
  angles: AdAngle[];
  selectedAngleIds: string[];
  activeAngleId: string | null;
  opusPick: { angleId: string; reason: string } | null;
  // Hook-first multi-video flow
  hookIdeas: AdHook[];
  selectedHookIds: string[];
  hookJobs: HookVideoJob[];
  // Script
  script: ScriptClip[];
  // Scene plan
  scenePlan: ScenePlan[];
  voiceDescription: string;
  /** Film-level guardrail/routing notes surfaced on the storyboard. */
  planNotes: string[];
  generatedAssets: GeneratedAsset[];
  // Cast — the ONE presenter every clip renders from. castUrl is the locked
  // reference image (the uploaded avatar, or a portrait cast and generated
  // once), castDescription its text half. Both are remembered on the session
  // so a resume, a retake or a variation reuses the same person.
  castUrl: string | null;
  castDescription: string;
  // Generation
  clips: GeneratedClip[];
  // Assembly
  finalVideoUrl: string | null;
  assemblyStatus: 'idle' | 'assembling' | 'done' | 'error';
  assemblyError: string | null;
  // Variations
  matrix: VariationMatrix | null;
  variations: AdVariation[];
  // UI
  currentStep: number;
  isProcessing: boolean;
}

export function emptySession(): AdsSession {
  return {
    productUrl: '', productDescription: '', offerCta: '',
    avatar: null, screenshots: [], productImages: [], productVideos: [], logo: null,
    aspect: '9:16',
    research: null, researchStatus: 'idle', researchError: null,
    angles: [], selectedAngleIds: [], activeAngleId: null, opusPick: null,
    hookIdeas: [], selectedHookIds: [], hookJobs: [],
    script: [],
    scenePlan: [], voiceDescription: '', planNotes: [], generatedAssets: [],
    castUrl: null, castDescription: '',
    clips: [],
    finalVideoUrl: null, assemblyStatus: 'idle', assemblyError: null,
    matrix: null, variations: [],
    currentStep: 1, isProcessing: false,
  };
}

// ---------------------------------------------------------------------------
// localStorage persistence — refresh-and-continue
// ---------------------------------------------------------------------------

const STORE_KEY = 'ads_studio_session_v1';

export function loadSession(): AdsSession {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) || {};
    const s: AdsSession = { ...emptySession(), ...parsed, isProcessing: false };
    const array = <T,>(value: unknown): T[] => Array.isArray(value) ? value.filter(Boolean) as T[] : [];
    s.screenshots = array<UploadedAsset>(parsed.screenshots);
    s.productImages = array<UploadedAsset>(parsed.productImages);
    s.productVideos = array<UploadedAsset>(parsed.productVideos);
    s.angles = array<AdAngle>(parsed.angles);
    s.selectedAngleIds = array<string>(parsed.selectedAngleIds).map(String);
    const hookAngles = ['problem', 'curiosity', 'social-proof', 'bold-claim', 'before-after', 'question', 'identity', 'objection'];
    s.hookIdeas = array<any>(parsed.hookIdeas || parsed.hooks).map((hook) => ({
      id: String(hook?.id || newId('hook')),
      angle: (hookAngles.includes(hook?.angle) ? hook.angle : 'curiosity') as AdHook['angle'],
      headline: String(hook?.headline || 'Saved opening'), firstSeconds: String(hook?.firstSeconds || ''),
      rationale: String(hook?.rationale || ''), visualDirection: String(hook?.visualDirection || ''),
    }));
    s.selectedHookIds = array<string>(parsed.selectedHookIds).map(String);
    s.script = array<ScriptClip>(parsed.script);
    s.scenePlan = array<ScenePlan>(parsed.scenePlan).map((plan) => ({
      ...plan,
      overlay_assets: array<string>(plan?.overlay_assets),
      duration_notes: array<string>(plan?.duration_notes),
      generated_assets_needed: array<GeneratedAssetNeed>(plan?.generated_assets_needed),
    }));
    s.planNotes = array<string>(parsed.planNotes).map(String);
    s.generatedAssets = array<GeneratedAsset>(parsed.generatedAssets);
    if (s.research) {
      s.research = {
        ...s.research,
        core_features: array<string>(s.research.core_features), pain_points: array<string>(s.research.pain_points),
        desires: array<string>(s.research.desires), objections: array<string>(s.research.objections),
        customer_language: array<string>(s.research.customer_language), proof_elements: array<string>(s.research.proof_elements),
        brand_context: s.research.brand_context ? {
          ...s.research.brand_context,
          colors: array<string>(s.research.brand_context.colors), fonts: array<string>(s.research.brand_context.fonts),
          images: array<string>(s.research.brand_context.images), social_links: array<string>(s.research.brand_context.social_links),
          pages_read: array<{ url: string; status: string }>(s.research.brand_context.pages_read), gaps: array<string>(s.research.brand_context.gaps),
        } : undefined,
      };
    }
    if (s.researchStatus === 'loading') s.researchStatus = s.research ? 'done' : 'idle';
    if (s.assemblyStatus === 'assembling') s.assemblyStatus = s.finalVideoUrl ? 'done' : 'idle';
    s.clips = array<GeneratedClip>(parsed.clips).map((c) => {
      const safe = { ...c, issues: array<string>(c?.issues), attempts: Number(c?.attempts) || 0 };
      return c.status === 'generating' || c.status === 'inspecting'
        ? (c.videoUrl
          ? { ...safe, status: 'accepted' as const, note: c.note || 'Adopted after a reload.' }
          : c.backgroundJobId
            ? { ...safe, status: 'generating' as const, note: 'The server kept this provider operation running. Resume generation to reattach.' }
            : { ...safe, status: 'failed' as const, note: 'Interrupted before the provider operation was saved — regenerate this clip.' })
        : safe;
    });
    s.hookJobs = array<HookVideoJob>(parsed.hookJobs).map((job) => {
      const rawHook: any = job?.hook && typeof job.hook === 'object'
        ? job.hook
        : s.hookIdeas.find((hook) => hook.id === job?.hookId) || {};
      const hook: AdHook = {
        id: String(rawHook.id || job?.hookId || ''),
        angle: (hookAngles.includes(rawHook.angle) ? rawHook.angle : 'curiosity') as AdHook['angle'],
        headline: String(rawHook.headline || 'Saved opening'), firstSeconds: String(rawHook.firstSeconds || ''),
        rationale: String(rawHook.rationale || ''), visualDirection: String(rawHook.visualDirection || ''),
      };
      const interrupted = ['queued', 'planning', 'generating', 'assembling'].includes(job?.status);
      return {
        ...job,
        hook,
        script: array<ScriptClip>(job?.script),
        scenePlan: array<ScenePlan>(job?.scenePlan).map((plan) => ({
          ...plan,
          overlay_assets: array<string>(plan?.overlay_assets), duration_notes: array<string>(plan?.duration_notes),
          generated_assets_needed: array<GeneratedAssetNeed>(plan?.generated_assets_needed),
        })),
        clips: array<GeneratedClip>(job?.clips).map((clip) => ({ ...clip, issues: array<string>(clip?.issues) })),
        status: job?.status === 'done' && job.videoUrl ? 'done' : interrupted ? 'failed' : job?.status === 'failed' ? 'failed' : 'failed',
        error: job?.status === 'done' && job.videoUrl ? String(job.error || '') : interrupted ? 'Interrupted by a reload — retry this hook video.' : String(job?.error || ''),
      };
    });
    s.matrix = s.matrix ? {
      hooks: array<string>(s.matrix.hooks), bodies: array<Record<string, string>>(s.matrix.bodies), ctas: array<string>(s.matrix.ctas),
    } : null;
    s.variations = array<AdVariation>(parsed.variations).map((v) => {
      const safe = {
        ...v,
        clipVideos: v?.clipVideos && typeof v.clipVideos === 'object' ? v.clipVideos : {},
        backgroundJobs: v?.backgroundJobs && typeof v.backgroundJobs === 'object' ? v.backgroundJobs : {},
      };
      return v.status === 'generating' || v.status === 'assembling'
        ? (v.videoUrl
          ? { ...safe, status: 'done' as const, error: null }
          : Object.keys(safe.backgroundJobs || {}).length
            ? { ...safe, status: 'generating' as const, error: null }
            : { ...safe, status: 'error' as const, error: 'Interrupted before the provider operation was saved — build it again.' })
        : safe;
    });
    return s;
  } catch {
    return emptySession();
  }
}

export function saveSession(s: AdsSession): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, isProcessing: false }));
  } catch { /* quota or private mode — persistence degrades gracefully */ }
}

export function clearSession(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORE_KEY); } catch { /* best-effort */ }
}

export async function generateAdHooks(input: {
  research: ProductResearch;
  productUrl: string;
  offerCta: string;
  count?: number;
}): Promise<AdHook[]> {
  const response = await workspaceFetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-6.1-sol', reasoning_effort: 'medium', max_completion_tokens: 6000, stream: false,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a performance creative director. Return valid JSON only: {"hooks":[{"angle":"problem|curiosity|social-proof|bold-claim|before-after|question|identity|objection","headline":"spoken opening line","firstSeconds":"what happens in seconds 0-3","rationale":"why this can stop the scroll without promising performance","visualDirection":"specific opening shot and motion"}]}. Write 5-8 distinct hooks across different angles. Keep each spoken headline natural, truthful, under 9 words, and usable as the first 1-3 seconds of a 9:16 short ad. Never invent statistics, testimonials, scarcity, guarantees or product facts.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            requestedHooks: Math.max(5, Math.min(8, Number(input.count) || 6)),
            productUrl: input.productUrl,
            product: input.research.product_name,
            description: input.research.one_liner,
            audience: input.research.target_audience,
            painPoints: input.research.pain_points,
            desires: input.research.desires,
            proofAvailable: input.research.proof_elements,
            positioning: input.research.positioning,
            offerCta: input.offerCta,
          }),
        },
      ],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || `Hook generation failed (HTTP ${response.status}).`));
  const raw = String(data?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new Error('The hook writer returned an unreadable response. Retry to get a clean hook set.'); }
  const allowed = new Set(['problem', 'curiosity', 'social-proof', 'bold-claim', 'before-after', 'question', 'identity', 'objection']);
  const hooks = (Array.isArray(parsed?.hooks) ? parsed.hooks : []).map((hook: any, index: number) => ({
    id: newId('hook'),
    angle: allowed.has(hook?.angle) ? hook.angle : 'curiosity',
    headline: String(hook?.headline || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    firstSeconds: String(hook?.firstSeconds || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    rationale: String(hook?.rationale || '').replace(/\s+/g, ' ').trim().slice(0, 360),
    visualDirection: String(hook?.visualDirection || '').replace(/\s+/g, ' ').trim().slice(0, 360),
    _index: index,
  })).filter((hook: any) => hook.headline && hook.visualDirection).slice(0, 8).map(({ _index, ...hook }: any) => hook as AdHook);
  if (hooks.length < 5) throw new Error('The hook writer returned fewer than five usable hooks. Retry for a complete set.');
  return hooks;
}

// ---------------------------------------------------------------------------
// Uploads (platform file-storage integration)
// ---------------------------------------------------------------------------

export async function uploadDataUrl(dataUrl: string, fileName: string): Promise<string> {
  const res = await workspaceFetch('/api/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Id': appId() },
    body: JSON.stringify({ imageData: dataUrl, fileName }),
  });
  const data = await res.json().catch(() => null);
  const url = data && (data.imageUrl || data.url);
  if (!res.ok || typeof url !== 'string') throw new Error(String(data?.error || `Image upload failed (HTTP ${res.status}).`));
  return url;
}

export async function uploadBlob(blob: Blob, fileName: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File([blob], fileName, { type: blob.type || 'application/octet-stream' }));
  form.append('folder', 'ads-studio');
  const res = await workspaceFetch('/api/upload/file', { method: 'POST', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(String(data?.error || `File upload failed (HTTP ${res.status}).`));
  return String(data.url);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

/** Park a user-picked file on durable storage; images go through the image
 * endpoint, videos and everything else through file upload. */
export async function uploadUserFile(file: File): Promise<UploadedAsset> {
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  if (file.type.startsWith('image/')) {
    const dataUrl = await readAsDataUrl(file);
    return { name: file.name, url: await uploadDataUrl(dataUrl, safeName) };
  }
  return { name: file.name, url: await uploadBlob(file, safeName) };
}

// ---------------------------------------------------------------------------
// Server-function calls (browser → registered hooks)
// ---------------------------------------------------------------------------

export async function callHook(name: string, body: Record<string, unknown>): Promise<any> {
  return callWorkspaceHook(name, body);
}

/** Generate a bespoke image asset through the cached Asset Generator hook
 * (asset-image-gen → Omni Flash → durable GCS URL) — the same engine every
 * other app in this workspace uses. */
export async function generateImageAsset(prompt: string, aspect: '9:16' | '16:9' | '1:1'): Promise<string> {
  const data = await callHook('asset-image-gen', { op: 'generate', prompt, aspect });
  const url = data?.imageUrl;
  if (!url || typeof url !== 'string') throw new Error(String(data?.error || 'The asset engine returned no image.'));
  return url;
}

// ---------------------------------------------------------------------------
// Design tokens — dark, premium, creative-agency; derived from the VidVerge
// brand (see config.json themeTokens) so Ads Studio matches the shell.
// ---------------------------------------------------------------------------

export const T = {
  canvas: 'var(--vg-bg, #0B0D12)',
  panel: 'var(--vg-surface, #12141B)',
  card: 'var(--vg-surface, #12141B)',
  raised: 'var(--vg-raised, #1A1D26)',
  line: 'var(--vg-border, #2A2E3A)',
  lineStrong: 'var(--vg-control-border, #3A3F4D)',
  ink: 'var(--vg-text, #F5F6F8)',
  soft: 'var(--vg-secondary, #C3C7D1)',
  muted: 'var(--vg-muted, #9AA0AE)',
  accent: 'var(--vg-accent, #D4AF37)',
  accentDeep: 'var(--vg-accent-pressed, #A8861F)',
  highlight: 'var(--vg-accent-hover, #E6C45A)',
  good: 'var(--vg-success, #3FB950)',
  bad: 'var(--vg-danger, #E5484D)',
  warn: 'var(--vg-warning, #FFB020)',
  /** Input well — recessed below a card rather than level with it. */
  input: 'var(--vg-bg, #0B0D12)',
  sans: "'Manrope', 'Segoe UI', sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
} as const;

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

/** The 8-step workflow rail. */
export const STEPS = [
  { n: 1, id: 'product', label: 'Product' },
  { n: 2, id: 'research', label: 'Research' },
  { n: 3, id: 'hooks', label: 'Hooks' },
  { n: 4, id: 'script', label: 'Script' },
  { n: 5, id: 'sceneplan', label: 'Scene Plan' },
  { n: 6, id: 'generate', label: 'Generate' },
  { n: 7, id: 'review', label: 'Review' },
  { n: 8, id: 'variations', label: 'Variations' },
] as const;
