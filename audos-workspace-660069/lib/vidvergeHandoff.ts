import { withBrandBrief } from './brandDoc';

export const VIDVERGE_HANDOFF_KEY = 'vidverge_agent_handoff_v1';

export interface VidvergeAttachment {
  url: string;
  name: string;
  type: string;
}

export interface ScriptToVideoHandoff {
  schemaVersion: 'vergeye.s2v-handoff.v1';
  source: 'vergeye-ads-studio' | 'verger' | 'agent-chat';
  entryType?: 'idea' | 'script';
  campaignId: string;
  originatingAngleId: string;
  creativeBrief: unknown;
  generatedScript: string;
  styleId: string;
  styleConfiguration: Record<string, unknown>;
  brandKit: Record<string, unknown>;
  campaignReferences: string[];
  routerMode: 'automatic' | 'manual' | 'hybrid';
  recommendedModel: string;
  routingReason: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  durationSeconds: number;
  storyboardRequired: boolean;
  audioPolicy?: 'native-dialogue-effects' | 'narration-voiceover' | 'music-ambience' | 'no-narration' | 'fully-silent';
  claimReview: 'clear' | 'needs_human_review';
  productionNotes: string[];
}

export interface VidvergeHandoff {
  version: 1 | 2;
  appId: string;
  prompt?: string;
  attachment?: VidvergeAttachment | null;
  projectId?: string | number;
  /** Optional named surface inside a multi-surface studio. */
  surface?: 'director';
  /** Native Audos video integration slug for the target studio. */
  videoIntegration?: string;
  /** Model id within that integration (Group A string, kling-*, runway id, etc.). */
  videoModel?: string;
  /** Structured Vergeye Phase 3 intake for the shared five-stage engine. */
  scriptToVideo?: ScriptToVideoHandoff;
  /** Evidence-backed competitor-remake intake for UGC Studio. */
  ugc?: {
    variation: { hook: string; clips: Array<{ role: string; duration: number; line: string; action: string }> };
    handoff: Record<string, unknown>;
    creativeAngle: Record<string, unknown>;
    productDescription?: string;
  };
  ts: number;
}

const MAX_AGE_MS = 30 * 60 * 1000;

export function saveVidvergeHandoff(handoff: Omit<VidvergeHandoff, 'version' | 'ts'>): void {
  if (typeof window === 'undefined') return;
  // "For my brand" / "for <saved brand>" briefs arrive in the studio with the
  // Brand doc facts already written in, so the studio never asks for them.
  const prompt = typeof handoff.prompt === 'string' ? withBrandBrief(handoff.prompt) : handoff.prompt;
  window.localStorage.setItem(VIDVERGE_HANDOFF_KEY, JSON.stringify({ ...handoff, prompt, version: 2, ts: Date.now() }));
}

export function consumeVidvergeHandoff(appId: string): VidvergeHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIDVERGE_HANDOFF_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as VidvergeHandoff;
    if (!value || (value.version !== 1 && value.version !== 2) || value.appId !== appId || !value.ts || Date.now() - value.ts > MAX_AGE_MS) {
      if (!value?.ts || Date.now() - Number(value.ts) > MAX_AGE_MS) window.localStorage.removeItem(VIDVERGE_HANDOFF_KEY);
      return null;
    }
    window.localStorage.removeItem(VIDVERGE_HANDOFF_KEY);
    return value;
  } catch {
    window.localStorage.removeItem(VIDVERGE_HANDOFF_KEY);
    return null;
  }
}

const VERGER_PREFILL_KEY = 'verger:prefill:v1';

/** Carry a prompt from the Verge home into Verger's composer. */
export function prefillVerger(text: string): void {
  try { window.sessionStorage.setItem(VERGER_PREFILL_KEY, String(text || '').slice(0, 4000)); } catch { /* storage unavailable */ }
}

export function consumeVergerPrefill(): string {
  try {
    const value = window.sessionStorage.getItem(VERGER_PREFILL_KEY) || '';
    window.sessionStorage.removeItem(VERGER_PREFILL_KEY);
    return value;
  } catch {
    return '';
  }
}

export function openVidvergeStudio(appId: string): void {
  window.dispatchEvent(new CustomEvent('openApp', { detail: { appId } }));
}
