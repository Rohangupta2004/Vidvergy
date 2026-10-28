import { callHook } from './workspace';

export const CAMPAIGN_CALLER_APPS = [
  'vidverge-agent', 'ads-studio', 'script-to-video', 'sceneforge',
  'faceless', 'vidverge-engine', 'brand-context', 'cineagent',
] as const;

export type CampaignCallerApp = (typeof CAMPAIGN_CALLER_APPS)[number];
export type CampaignSetStatus = 'queued' | 'scripting' | 'awaiting_approval' | 'generating' | 'rendering' | 'complete' | 'partial' | 'failed' | 'cancelled';

export interface CampaignContext {
  schema_version?: number;
  brand_profile?: Record<string, any>;
  brand_guidelines?: Record<string, any>;
  competitor_profiles?: Array<Record<string, any>>;
  findings?: Array<Record<string, any>>;
  strengths?: string[];
  weaknesses?: string[];
  positioning?: string;
  differentiators?: string[];
  target_audiences?: string[];
  pain_points?: string[];
  objections?: string[];
  messaging_angles?: string[];
  approved_claims?: Array<string | Record<string, any>>;
  forbidden_claims?: Array<string | Record<string, any>>;
  master_brief?: Record<string, any>;
  master_scripts?: Array<Record<string, any>>;
  scene_plans?: Array<Record<string, any>>;
  creative_briefs?: Array<Record<string, any>>;
  assets?: Array<Record<string, any>>;
  outputs?: Array<Record<string, any>>;
  provenance?: Record<string, any>;
  [key: string]: any;
}

export interface CampaignSummary {
  campaign_id: string;
  brand_id?: string | null;
  name: string;
  status: string;
  current_context_version: number;
  context_json: CampaignContext;
  source_comparison_id?: number | null;
  asset_output_refs?: Array<Record<string, any>>;
  created_at: string;
  updated_at: string;
}

export interface CampaignVideo {
  video_id: string;
  set_id: string;
  campaign_id: string;
  ordinal: number;
  creative_angle: string;
  hook: string;
  script_text: string;
  script_version: number;
  context_version: number;
  scene_plan: Array<Record<string, any>>;
  cta: string;
  scene_prompts: Array<Record<string, any>>;
  claim_validation: Record<string, any>;
  clips: Array<Record<string, any>>;
  render_record?: Record<string, any> | null;
  status: string;
  stage: string;
  error_json?: Record<string, any> | null;
}

export interface CampaignVideoSet {
  set_id: string;
  campaign_id: string;
  name: string;
  pack_type: string;
  objective: string;
  platform: string;
  aspect_ratio: string;
  duration_sec: number;
  target_app: CampaignCallerApp;
  context_version: number;
  requested_video_count: number;
  status: CampaignSetStatus;
  progress_json: Record<string, any>;
  model_ids: Record<string, any>;
  estimated_cost: number;
  actual_cost: number;
  budget_cap?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSetInput {
  campaignId: string;
  packType: string;
  videoCount: number;
  platform: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  durationSec: number;
  name?: string;
  objective?: string;
  style?: string;
  language?: string;
  brandAssets?: Array<Record<string, any>>;
  modelId?: string;
  idempotencyKey?: string;
  budgetCap?: number;
  maxParallel?: number;
  approveSpend?: boolean;
  dryRun?: boolean;
}

function tokenNow(): string {
  return String((window as any).__workspaceDb?.token || '');
}

async function contextCall<T>(callerApp: CampaignCallerApp, op: string, payload: Record<string, unknown> = {}): Promise<T> {
  const result = await callHook<any>('vc-context', { op, caller_app: callerApp, ...payload });
  if (!result?.ok) throw new Error(String(result?.error || `Campaign Context ${op} failed.`));
  return result as T;
}

async function packCall<T>(callerApp: CampaignCallerApp, op: string, payload: Record<string, unknown> = {}): Promise<T> {
  const result = await callHook<any>('vc-pack', {
    op,
    caller_app: callerApp,
    workspaceToken: tokenNow(),
    ...payload,
  });
  if (!result?.ok) {
    const error = new Error(String(result?.error || `Campaign pack ${op} failed.`));
    (error as any).code = result?.code;
    (error as any).details = result;
    throw error;
  }
  return result as T;
}

export function campaignContextClient(callerApp: CampaignCallerApp) {
  return {
    listCampaigns: (limit = 50) => contextCall<{ ok: true; campaigns: CampaignSummary[] }>(callerApp, 'listCampaigns', { limit }),
    getCampaign: (campaignId: string, version?: number) => contextCall<{ ok: true; campaign: CampaignSummary; context: CampaignContext; context_version: number; context_hash: string }>(callerApp, 'getCampaign', { campaignId, ...(version ? { version } : {}) }),
    getContextFields: (campaignId: string, fields: string[], version?: number) => contextCall<{ ok: true; campaign_id: string; context_version: number; context_hash: string; fields: Partial<CampaignContext> }>(callerApp, 'getContextFields', { campaignId, fields, ...(version ? { version } : {}) }),
    createCampaign: (name: string, context: CampaignContext, changeNote = 'Campaign created') => contextCall(callerApp, 'createCampaign', { name, context, changeNote }),
    importFromVergeye: (comparisonId: number, name?: string) => contextCall(callerApp, 'importFromVergeye', { comparisonId, name }),
    analyze: (brandUrl: string, name?: string) => contextCall(callerApp, 'analyze', { brandUrl, name }),
    refreshResearch: (campaignId: string, brandUrl: string, changeNote: string) => contextCall(callerApp, 'refreshResearch', { campaignId, brandUrl, changeNote }),
    updateContext: (campaignId: string, patch: Partial<CampaignContext>, changeNote: string) => contextCall(callerApp, 'updateContext', { campaignId, patch, changeNote }),
    saveScript: (campaignId: string, script: string, options: { scriptId?: string; approved?: boolean; scenePlan?: unknown; changeNote?: string } = {}) => contextCall(callerApp, 'saveScript', { campaignId, script, ...options }),
    saveAsset: (campaignId: string, asset: Record<string, any>, contextVersion: number, scriptVersion?: number) => contextCall(callerApp, 'saveAsset', { campaignId, asset, contextVersion, scriptVersion }),
    listSets: (campaignId?: string) => contextCall<{ ok: true; sets: CampaignVideoSet[] }>(callerApp, 'listSets', campaignId ? { campaignId } : {}),
    getSet: (setId: string) => contextCall<{ ok: true; set: CampaignVideoSet; videos: CampaignVideo[] }>(callerApp, 'getSet', { setId }),
    getVideoVersionHistory: (campaignId: string) => contextCall(callerApp, 'getVideoVersionHistory', { campaignId }),
    probeModel: () => packCall(callerApp, 'probeModel'),
    createSet: (input: CreateSetInput) => packCall<{ ok: true; set: CampaignVideoSet; videos?: CampaignVideo[]; deduplicated?: boolean; approval_required?: boolean }>(callerApp, 'createSet', input as any),
    approveSpend: (setId: string) => packCall(callerApp, 'approveSpend', { setId }),
    getPack: (setId: string) => packCall<{ ok: true; set: CampaignVideoSet; videos: CampaignVideo[] }>(callerApp, 'getSet', { setId }),
    retryVideo: (videoId: string) => packCall(callerApp, 'retryVideo', { videoId }),
    retrySet: (setId: string) => packCall(callerApp, 'retrySet', { setId }),
    cancelSet: (setId: string) => packCall(callerApp, 'cancelSet', { setId }),
  };
}
