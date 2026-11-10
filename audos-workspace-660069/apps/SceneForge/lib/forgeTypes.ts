/**
 * SceneForge (Oct 2026 rebuild) — shared client types and catalogs.
 *
 * The product: long HeyGen avatar videos with ElevenLabs sound, then
 * post-production — voice-synced motion graphics written by an expert Remotion
 * coder agent, meaningful Veo 3.1 Fast B-roll in between, ElevenLabs music and
 * SFX — delivered as BOTH 16:9 and a native 9:16 layout from ONE set of
 * choices made before generation.
 */

import type { ProjectBrand, StyleBrief } from './stylePresets';
import type { ForgeOpusModel } from './forgeModels';
import type { StructuredOutline } from './scriptFormat';
export { AUTO_EDITOR_STYLE_ID, BASE_COLOR_ROLES, DRAFT_EDIT_RECIPES, FORGE_STYLES } from './stylePresets';
export type { ColorRoles, EditingRecipe, KineticReelBrief, LogoPlacement, ProjectBrand, StyleBrief, StylePreset } from './stylePresets';

export type ForgeStatus =
  | 'draft'
  | 'voicing'
  | 'avatar'
  | 'transcribe'
  | 'direct'
  | 'assets'
  | 'code'
  | 'drafts'
  | 'draft_pick'
  | 'final_render'
  | 'portrait_finish'
  | 'qa'
  | 'done'
  | 'failed';

/**
 * Browser-owned avatar render handoff. The platform's HeyGen credential proxy
 * only accepts same-origin browser calls with X-Workspace-DB-Token (a server
 * function gets 401 "Same-origin request required"), so the durable pipeline
 * pauses at the avatar step and publishes this task; the signed-in tab submits
 * and polls the render, then reports back via op `complete_avatar_step`.
 * It never contains any credential.
 */
export interface ForgeBrowserTask {
  step: 'avatar';
  video_id: string | null;
  render_api: 'v2' | 'v3' | null;
  avatar_model: 'avatar_iv' | 'legacy_v2' | null;
  fallback_reason: string | null;
  expected_duration_sec: number | null;
  transparent_requested: boolean;
  bg_color: string;
  requested_at: string | null;
  payload: {
    preferred_v3?: Record<string, unknown> | null;
    fallback_v2?: { video_inputs: any[]; dimension: { width: number; height: number } };
    motion_cues?: Array<{ scene: number; dialogue: string; body_language: string; emotion: string }>;
    video_inputs?: any[];
    dimension?: { width: number; height: number };
  } | null;
}

export interface ForgeChunk {
  i: number;
  has_audio: boolean;
  audio_url: string | null;
  video_id?: string | null;
  video_url: string | null;
  duration_sec: number;
  gesture: string | null;
  emotion: string | null;
  error?: string | null;
}

export interface ForgeDraft {
  variation: number;
  label: string;
  description?: string;
  style_name?: string;
  recommended?: boolean;
  palette?: string[];
  styleBrief?: StyleBrief;
  operation_id?: string;
  video_url?: string | null;
  status: string;
  error?: string | null;
  scrapped?: boolean;
}

export type CaptionLanguage = 'hinglish' | 'hindi' | 'english';
export type ForgeSceneLayout = 'split-left' | 'split-right' | 'overlay-blank' | 'full-graphic';
export type ForgeDiagramType = 'flowchart' | 'steps' | 'comparison' | 'stat' | 'bar' | 'line' | 'timeline' | 'callouts';

export interface ForgeDiagramElement {
  id: string;
  label: string;
  value?: number | string;
  keyword: string;
  at: number;
  end?: number;
  emphasis?: boolean;
}

export interface ForgeDiagramSpec {
  type: ForgeDiagramType;
  title: string;
  elements: ForgeDiagramElement[];
  xLabel?: string;
  yLabel?: string;
  fallback?: boolean;
}

export interface ForgeSceneDirection {
  sceneIndex: number;
  start: number;
  end: number;
  layout: ForgeSceneLayout;
  avatarSide: 'left' | 'right' | 'full' | 'hidden';
  safeZone: 'left' | 'right' | 'top' | 'bottom' | 'center';
  reason?: string;
  diagram: ForgeDiagramSpec;
}

export type KineticTone = 'neg' | 'pos' | 'key';
export type KineticBeatType = 'nameTag' | 'checklist' | 'equation' | 'pillsIcons' | 'bigWord' | 'flowCard' | 'meter' | 'compareRows' | 'thought' | 'gauge' | 'notePoint' | 'stepCard' | 'strike' | 'brandCard' | 'counter' | 'ctaCard';

export interface KineticWord {
  i: number;
  w: string;
  d: string;
  s: number;
  e: number;
  word?: string;
  start?: number;
  end?: number;
  matched?: boolean;
}

export interface KineticBeat {
  id: string;
  type: KineticBeatType;
  startWord: number;
  endWord: number;
  props: Record<string, any>;
}

export type DirectorCapability = 'video' | 'image' | 'music' | 'sfx' | 'voice' | 'lipsync' | 'transcription' | 'vision' | 'render';
export type KineticOpening = 'numberReveal' | 'splitComparison' | 'cinematicBroll' | 'questionTension' | 'documentReveal' | 'custom';
export type KineticVisualMode = 'broll' | 'split' | 'graphicFull' | 'avatar' | 'avatarPiP';
export type KineticFormat = '9:16' | '16:9';

export interface DirectorCapabilityEntry {
  id: string;
  capability: DirectorCapability;
  route: string;
  strengths: string[];
  limits: {
    durations?: number[] | { min: number; max: number };
    aspectRatios?: KineticFormat[];
    audioSupport?: boolean;
    referenceImageSupport?: boolean;
    [key: string]: unknown;
  };
  available: boolean;
  healthCheckedAt?: string | null;
  estimatedCost: number | null;
  avgLatency: number | null;
  recentSuccessRate: number | null;
}

export interface KineticCreativeClip {
  id: string;
  purpose: string;
  capability: 'video' | 'image';
  preferredModel: string;
  fallbackModels: string[];
  prompt: string;
  durationSec: number;
  formats: KineticFormat[];
  cropSafe: boolean;
  status: 'planned' | 'queued' | 'generating' | 'reviewing' | 'approved' | 'failed' | 'replaced';
  urls?: Partial<Record<KineticFormat, string>>;
  review?: Record<string, unknown>;
  regenRequestedAt?: string;
}

export interface KineticVisualSegment {
  id: string;
  startWord: number;
  endWord: number;
  mode: KineticVisualMode;
  clipIds: string[];
  motion: string;
  reason: string;
}

export interface KineticCreativePlan {
  version: 2;
  summary: {
    chosenOpening: KineticOpening;
    why: string;
    avatarRevealWord: number;
    openingOptions?: Array<{ type: KineticOpening; summary: string; reason?: string }>;
  };
  visualTrack: KineticVisualSegment[];
  clips: KineticCreativeClip[];
  audio: {
    music: { enabled: boolean; prompt: string; duckUnderSpeechDb: -18 };
    sfx: Array<{ anchorWord: number; prompt: string; gainDb: number }>;
  };
  validationWarnings?: string[];
}

export interface KineticBeatSheet {
  chapters: Array<{ startWord: number; endWord: number; label: string }>;
  beats: KineticBeat[];
  punches: Array<{ anchorWord: number; amount: number; shake?: number }>;
  flashes: Array<{ anchorWord: number; tone: KineticTone }>;
  captionHidden: Array<{ startWord: number; endWord: number }>;
  tones: Array<{ word: number; tone: KineticTone }>;
  creativePlan?: KineticCreativePlan;
  planner?: ForgeOpusModel | 'gpt-6.1-sol' | 'deterministic-fallback';
  validationWarnings?: string[];
}

export interface KineticFacePoint { t: number; cx: number; cy: number; h: number }

export interface KineticQa {
  status: 'pending' | 'running' | 'passed' | 'warning';
  landscape?: Record<string, any>;
  portrait?: Record<string, any>;
  sync?: { checked: number; maxErrorMs: number; pass: boolean };
  issues?: string[];
}

export type ForgeOutputFormat = '16:9' | '9:16';
export type ForgeCutaways = 'auto' | 'light' | 'rich' | 'none';

/**
 * Brand context handed to the Remotion agent (and its asset library). Built only
 * from the answers the user confirmed on the Brand step — never from the saved
 * Brand Kit unless the user chose "Use my saved Brand Kit".
 */
export interface ForgeBrandContext {
  name?: string;
  tagline?: string;
  website?: string;
  offer?: string;
  audience?: string;
  tone?: string;
  ctas?: string[];
  fonts?: string[];
  /** true = the user chose "No brand font / neutral is fine" on the Brand step, so fonts counts as answered. */
  fontsNeutral?: boolean;
  images?: Array<{ url: string; alt?: string }>;
  confirmedByUser?: boolean;
  /** false = the user said these are NOT brand colours; the agent picks a neutral look. */
  colorsConfirmed?: boolean;
  /** Where the confirmed logo came from, or 'none' when the user chose no logo. */
  logoSource?: string;
}

/** Answers to SceneForge's pre-generation brand questions. Blank answers are left out, never guessed. */
export interface ForgeBrandBrief {
  name?: string;
  website?: string;
  tone?: string;
  keyMessage?: string;
  cta?: string;
  logoChoice?: 'site' | 'web' | 'upload' | 'brand_kit' | 'none';
  /** The logo URL the user confirmed; must equal brand.logoUrl to count as confirmed. */
  logoUrl?: string;
  logoOriginalUrl?: string;
  logoSource?: string;
  colorsChoice?: 'confirmed' | 'none';
  /** Optional free-text brand fonts (comma separated). Blank stays blank. */
  fonts?: string;
  /** 'neutral' = the user said no brand font is needed; counts as answered. */
  fontsChoice?: 'neutral';
  usedBrandKit?: boolean;
  lookedUpAt?: string;
}

export interface ForgeAutoUsage { at: string; step: string; model: string; reserved: number; ok: boolean; note?: string | null }

export interface ForgeQaIssue { type: string; detail?: string }
export interface ForgeQaScene { id: string; type: string; s: number; e: number; layout?: string | null }
export interface ForgeQaFinding { t: number; url: string | null; pass: boolean; unavailable: boolean; issues: ForgeQaIssue[]; beat: { id: string; type: string; s: number; e: number } | null }
export interface ForgeQaFix { id?: string; status?: 'proposed' | 'approved' | 'ignored'; t: number; beat: string; issue: string; fix: string }

/** Auto Editor QA. `opt_in` audits run only when the user asks and only PROPOSE fixes. */
export interface ForgeAutoQa {
  status: string;
  round: number;
  checked: number;
  total: number;
  issues: string[];
  fixes: ForgeQaFix[];
  first_pass_issues: string[];
  opt_in?: boolean;
  requested_at?: string | null;
  finished_at?: string | null;
  note?: string | null;
  duration?: number | null;
  scenes?: ForgeQaScene[];
  findings?: ForgeQaFinding[];
  proposed?: ForgeQaFix[];
  applied?: ForgeQaFix[];
  applied_at?: string | null;
  original_url?: string | null;
}

/** Agent skill the Remotion agent loaded for this plan, with its delivery report (see lib/skills). */
export interface ForgeAutoSkill {
  id: string;
  title: string;
  version: number;
  trigger: 'choice' | 'instructions' | 'reedit';
  /** false when the built-in plan replaced the agent, so the skill could not shape the edit. */
  applied: boolean;
  note: string | null;
  report: {
    durationSec: number;
    format: ForgeOutputFormat;
    /** Never filled with a guess: null means it was not measured. */
    loudness: { lufs: number; truePeakDbtp: number } | null;
    notMeasured: string[];
    onScreenTextNotInVoiceover: string[];
    leftOut: string[];
    tier2Deviations: Array<{ what: string; why: string }>;
    brandQuestions: string[];
    qaRisks: string[];
    /** The concept the agent chose (skill Part B); absent on reports from skill v1. */
    concept?: { bigIdea: string; hook: string; heroMoment: string; look: string; motion: string; layoutPattern: string; why: string; alternatives: string[] } | null;
  };
}

/** Server view of the one-click Auto Editor run (`project.auto`). */
export interface ForgeAutoState {
  format: ForgeOutputFormat;
  revision: number;
  reedit_instruction: string | null;
  plan: { model: string | null; fallbackFrom: string | null; reserved: number | null; maxTokens: number | null; notice: string | null; budget: boolean; warnings: string[] } | null;
  look: { name: string; why: string; palette: Record<string, string>; headingFont: string; energy: string; transition: string; captionStyle: string } | null;
  beat_count: number;
  beat_types: Record<string, number>;
  /** Beats per scene layout (FULL_AVATAR, PIP_MOTION_GRAPHIC, PIP_BROLL, PIP_IMAGE, SPLIT, FULL_GRAPHIC, CTA). */
  scene_mix?: Record<string, number>;
  skill?: ForgeAutoSkill | null;
  assets: Array<{ id: string; kind: string; style?: string | null; purpose: string; status: string; url: string | null }>;
  music: { status: string } | null;
  render: {
    attempt: number;
    progress: number;
    safe_mode: string | null;
    render_seconds: number | null;
    render_fps: number | null;
    operation_id?: string | null;
    submitted_at?: string | null;
    last_poll_at?: string | null;
    last_status?: string | null;
    last_error?: string | null;
    status_misses?: number;
    errors?: string[];
    stalls?: number;
    cap_minutes?: number;
    fallback?: { reason: string | null; at: string | null } | null;
    adopted_op?: string | null;
  };
  qa: ForgeAutoQa | null;
  usage: ForgeAutoUsage[];
  delivered: { url: string; format: ForgeOutputFormat; at: string; revision: number } | null;
}

export interface ForgeAutoBudget {
  phrases: number;
  plannerInput: number;
  plannerOutputCap: number;
  plannerReserved: number;
  plannerCalls: number;
  voiceCueReserved: number;
  total: number;
  window: number;
  recentReserved: number;
  windowMinutes: number;
  remainingEstimate: number;
}

export interface ForgeChoices {
  voiceId?: string;
  voiceName?: string;
  avatarId?: string;
  avatarName?: string;
  style?: string;
  niche?: string;
  musicMood?: string;
  brollAmount?: 'none' | 'light' | 'medium' | 'rich';
  captionLanguage?: CaptionLanguage;
  transparentBg?: boolean;
  transparent_fallback?: boolean;
  bgColor?: string;
  avatarGestures?: string[];
  avatarEmotions?: string[];
  avatar_script?: Array<{ text: string; emotion: string; gesture: string; startSec?: number; endSec?: number }>;
  brand?: ProjectBrand;
  /** Optional founder direction. The Remotion agent treats this as higher priority than style guidance. */
  userInstructions?: string;
  autopilot?: boolean;
  outputFormat?: ForgeOutputFormat;
  cutaways?: ForgeCutaways;
  brandContext?: ForgeBrandContext;
  brandBrief?: ForgeBrandBrief;
  /** Agent skills chosen for this project (lib/skills). Unset = decided from userInstructions; [] = explicitly off. */
  agentSkills?: string[];
  /** The user's full structured script (Act / Scene / Shot / prompt / dialogue) when the project voices only its dialogue lines. */
  structuredScript?: string;
  /** Prompt-free acts, scenes and timecodes parsed from structuredScript (lib/scriptFormat). */
  scriptOutline?: StructuredOutline;
}

export interface ForgeProject {
  id: string;
  status: ForgeStatus;
  stage_note: string | null;
  topic: string;
  niche: string | null;
  style: string | null;
  script: string | null;
  studio_config: ForgeChoices;
  target_length_sec: number;
  estimated_duration_sec: number | null;
  avatar_duration_sec: number | null;
  heygen_video_url: string | null;
  heygen_chunks: ForgeChunk[];
  word_count: number;
  kinetic_words?: KineticWord[];
  beat_sheet?: KineticBeatSheet | null;
  face_track?: KineticFacePoint[];
  kinetic_qa?: KineticQa | null;
  capability_registry?: DirectorCapabilityEntry[];
  usage_ledger?: Array<{ projectId: string; step: string; model: string; prompt?: string | null; seed?: string | number | null; latencyMs?: number | null; durationSec?: number; retry: number; status: string; finalOutcome?: string | null; cost?: number | null; creditAmount?: number; idempotencyKey?: string }>;
  insufficient?: { required: number; shortfall: number | null } | null;
  render_progress?: { landscape: number; portrait: number; stage?: string } | null;
  director_plan: {
    events?: any[];
    scene_layouts?: ForgeSceneDirection[];
    captions_required?: boolean;
    caption_language?: CaptionLanguage;
    [key: string]: any;
  } | null;
  drafts: ForgeDraft[] | null;
  style_briefs?: StyleBrief[];
  locked_style_brief?: StyleBrief | null;
  chosen_draft: number | null;
  coder_model: string | null;
  music_url: string | null;
  final_video_url: string | null;
  portrait_video_url: string | null;
  charged_seconds: number | null;
  avatar_model?: 'avatar_iv' | 'legacy_v2' | null;
  avatar_render_api?: 'v2' | 'v3' | null;
  avatar_fallback_reason?: string | null;
  failed_step?: string | null;
  review_step?: string | null;
  browser_task?: ForgeBrowserTask | null;
  approved_steps?: Record<string, { approved_at: string }>;
  portrait_preview_url?: string | null;
  portrait_unavailable_reason?: string | null;
  asset_regens?: Record<string, { scene_id: string; previous_url: string | null; candidate_url: string | null; prompt: string; operation_id: string; charge_key: string; seconds: number; revision: number; status: 'generating' | 'ready' | 'failed'; error?: string | null; refunded?: boolean }>;
  music_regen?: { previous_url: string | null; candidate_url: string | null; prompt: string; status: 'ready' | 'failed'; error?: string | null } | null;
  auto?: ForgeAutoState | null;
  created_at: string;
  updated_at: string;
}

export const MUSIC_MOODS = ['confident', 'inspiring', 'dramatic', 'calm', 'energetic', 'dark', 'playful', 'cinematic'];

export const BROLL_AMOUNTS: Array<{ id: 'none' | 'light' | 'medium' | 'rich'; name: string; blurb: string }> = [
  { id: 'none', name: 'None', blurb: 'Avatar + graphics only' },
  { id: 'light', name: 'A few', blurb: '~2 meaningful inserts' },
  { id: 'medium', name: 'Some', blurb: '~3 inserts' },
  { id: 'rich', name: 'Rich', blurb: 'Up to 5 inserts' },
];

/** HeyGen avatar entry as the picker uses it. */
export interface ForgeAvatar {
  id: string;
  groupId?: string;
  name: string;
  gender: string;
  age: string;
  region: string;
  ethnicity: string;
  style: string;
  category: string;
  description: string;
  tags: string[];
  previewImage: string;
  previewVideo: string;
  gestures: string[];
  emotions: string[];
  supportedEngines: string[];
}

/** Avatars bundled by HeyGen group id — the different looks of one person grouped together. */
export interface ForgeAvatarBundle {
  key: string;
  name: string;
  looks: ForgeAvatar[];
}

export type ForgeAvatarMethod = 'photo' | 'prompt' | 'digital_twin';
export type ForgeAvatarCreationStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'enterprise_required';

export interface ForgeClonedVoice {
  id: number;
  voiceId: string;
  name: string;
  category: 'cloned';
  createdAt: string;
}

/** Session-owned custom avatar persisted by sceneforge-avatar-creator. */
export interface ForgeCreatedAvatar {
  id: number;
  name: string;
  method: ForgeAvatarMethod;
  provider_avatar_id: string | null;
  provider_group_id: string | null;
  preview_url: string | null;
  preview_video_url: string | null;
  default_voice_id: string | null;
  consent_status: string | null;
  consent_attested: boolean;
  status: ForgeAvatarCreationStatus;
  error: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
