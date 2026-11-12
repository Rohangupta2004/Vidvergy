import { pricingRuleText } from '../../../lib/pricing';

/**
 * VERGER AUTOPILOT — fully autonomous production on gpt-6.1-sol.
 *
 * MODEL NOTE: the Audos OpenAI proxy's /v1/chat/completions takes no `tools`
 * parameter for gpt-6.1-sol, so the agent loop is a structured-JSON protocol:
 * each turn the model returns {thinking, calls[], done, summary}; the browser
 * executes the named tools against the live app bridge / server functions and
 * feeds the results back as the next user message. Requests go through
 * workspaceFetch, which attaches X-Workspace-DB-Token on every call.
 *
 * AUTONOMY CONTRACT: Autopilot never asks the user to create, open, or do
 * anything. ask_user is allowed for exactly two purposes — brand intake when
 * no Brand Kit is saved, and credit/budget approval — enforced both in the
 * system prompt and in the ask_user executor below. When a studio will not
 * connect, the model is steered to route_brief (direct handoff) instead of
 * ever surfacing a technical step to the user.
 */
import { callHook, workspaceFetch, WORKSPACE_ID } from '../../../lib/workspace';
import { listVideoHistory } from '../../../lib/videoHistory';
import { friendlyAppName, mountEmbeddedApp, openApp, resolveAppId, type AppController, type AppEvent, type AppId } from '../../../lib/appBridge';
import { saveVidvergeHandoff } from '../../../lib/vidvergeHandoff';
import { emptyBrandKit, fetchBrandFromWebsite, makeBrandRecord, parseBrandKitDocument } from '../../../components/brandKitStore';
import type { BrandKitDocument, BrandRecord } from '../../../components/brandKitStore';
import { brandDocFacts, rememberBrandDocument, resolveBrandForRequest } from '../../../lib/brandDoc';

export interface AutopilotStep { id: string; label: string; tool: string; status: 'running' | 'done' | 'failed'; evidence: string; }
export interface AutopilotAsk { purpose: 'brand' | 'budget'; label: string; question: string; options: string[]; multi?: boolean; }
export interface AutopilotCallbacks {
  onStep(step: AutopilotStep): void;
  onEvent(appId: AppId, event: AppEvent): void;
  askUser(ask: AutopilotAsk): Promise<string>;
  stopped(): boolean;
}

const RESULT_LIMIT = 1900;
const MAX_TURNS = 60;
const WAIT_MIN_S = 30;
const WAIT_MAX_S = 600;
const WAIT_FIRST_POLL_MS = 3000;
const WAIT_MAX_POLL_MS = 15000;
const WAIT_REPORT_EVERY_MS = 30_000;
const RETRYABLE_FREE_ACTIONS = new Set(['writeScript', 'useScript', 'makePlan', 'approveCast']);

/** Failed read-only or free steps that the step card's Retry can re-run in place. */
const retryableSteps = new Map<string, { step: AutopilotStep; rerun: (step: AutopilotStep) => Promise<void> }>();
const retryingSteps = new Set<string>();

function isRetryable(name: string, input: Record<string, any>): boolean {
  return name === 'wait_for' || name === 'get_state' || (name === 'run_free' && RETRYABLE_FREE_ACTIONS.has(String(input.action)));
}

export function canRetryAutopilotStep(stepId: string): boolean {
  return retryableSteps.has(stepId);
}

/** Re-run one failed Autopilot step (resume a wait, rebuild a plan) without restarting the run. */
export async function retryAutopilotStep(stepId: string): Promise<boolean> {
  const entry = retryableSteps.get(stepId);
  if (!entry) return false;
  if (retryingSteps.has(stepId)) return true;
  retryingSteps.add(stepId);
  try { await entry.rerun(entry.step); } finally { retryingSteps.delete(stepId); }
  return true;
}

const TOOL_DOC = `TOOLS — call one by adding {"name": "...", "input": {...}} to "calls" (up to 3 per turn, run in order):
• read_brand_kit {"brand"?: string} — load what is saved in the Brand doc (name, products, audience, voice, tone, colours, fonts, logos, characters/mascots, do/don't) so you can OFFER it as "Use my saved Brand Kit". Nothing in it is applied until the user confirms it. Pass "brand" when the request names a company or product; it returns that saved brand, else the default.
• lookup_brand {"url"?: string, "name"?: string} — read-only: read the website and search the web for the brand's real logo, name and colours. Returns unconfirmed candidates only; nothing is saved or applied.
• create_brand_from_website {"url": string} — read a public website and save a Brand Kit from it. Only when the user explicitly asked to save their brand.
• save_brand_kit {"businessName": string, "tagline"?: string, "website"?: string, "audience"?: string, "tone"?: string, "summary"?: string, "colors"?: string[], "logoUrl"?: string} — save brand answers as the Brand Kit. Only when the user explicitly asked to save their brand.
• list_library {"query"?: string} — list saved finished videos.
• open_app {"appId": string} — mount one studio invisibly and return its live field/action schema. Registered ids: script-to-video, video-provider-lab, ugc-studio, faceless, sceneforge, ads-studio, video-enhancer, cineagent, brand-context.
• fill {"appId": string, "values": object} — fill studio fields through the bridge.
• run_free {"appId": string, "action": string} — run one free action.
• run_paid {"appId": string, "action": string, "note"?: string} — run one paid action; refused when its live estimate would break the budget.
• get_state {"appId": string} — read the connected studio state.
• wait_for {"appId": string, "event": string, "timeoutS"?: number} — wait for a real studio event (progress, shot, gate, finished…). It keeps checking with backoff for up to timeoutS (30–600, default 300). It returns {"type": "still_working"} when the studio is active but that event has not arrived yet; then wait again — never restart or re-plan.
• check_frames {"videoUrl": string, "timestamps": number[], "criteria": string} — extract frames and vision-check them.
• route_brief {"appId": string, "brief": string} — when open_app cannot connect, hand a complete self-contained brief straight to that studio's intake instead. Never ask the user to open anything.
• ask_user {"purpose": "brand" | "budget", "label": string, "question": string, "options": string[], "multi"?: boolean, "requiredCredits"?: number} — ONLY brand intake ("brand") or budget approval ("budget"). Any other purpose is refused.
• list_weekly_videos {} — list the user's weekly autopilot series (title, topic, day, status, last outcome).
• schedule_weekly_video {"topic": string, "title"?: string, "weekday"?: number (1 = Monday, default), "hour"?: number (0-23, default 9), "filmTitle"?: string} — turn one of the user's FINISHED Script-to-Video films (the one named, else the newest) into "one new video every week on this topic" with the same look, cast and settings. It shows the user the real weekly credit price and asks them to approve it itself. Use it only when the user asked for a recurring or weekly video. Posting to social media is not available.
• deliver {"videoId": string, "appId": string} — deliver the finished, checked video.`;

function systemPrompt(budget: number): string {
  return [
    'You are Verger Autopilot, Vidverge\u2019s autonomous video producer. You make the whole video yourself with the tools below; the person only sees progress and the finished result.',
    '',
    'HARD AUTONOMY RULES:',
    '- NEVER ask the user to create, open, click, configure, retry, sign in to, or check anything. You perform every step yourself.',
    '- ask_user exists for exactly two things: purpose "brand" (ONE grouped brand confirmation of name, website, logo and colours, whenever the video is for their own brand, company or product, skipping only what the request already states) and purpose "budget" (approving credits beyond the stated budget). Everything else you decide yourself with sensible defaults: 30 seconds unless stated, 9:16 for social and 16:9 for product/web; tone and colours only from what the user confirmed, never silently from the saved Brand Kit.',
    '- BRAND DOC: when the request says "for my brand", "our company", "on-brand" or names a company/product, the saved Brand doc is only a suggestion, never the source of truth. Copy its briefBlock into a brief you fill or route only after the user picked "Use my saved Brand Kit" and confirmed it (name, colours, tone, voice, logo, audience, products, characters, do/don\'t) and never invent a logo, name, colour or company fact that was not confirmed.',
    '- BRAND FIRST (hard): never assume or invent brand details. read_brand_kit at the start only shows what is saved; nothing in it is applied until the user confirms it. When the video is for their own brand, company or product, ask ONE grouped question (purpose "brand") that confirms brand name, website, logo and brand colours, skipping only what the request already states, and offer "Use my saved Brand Kit" as an option when one exists. If a website or name is known, call lookup_brand first to find the real logo, name and colours and put them in that question for the user to confirm. A logo is only ever their real logo (a confirmed candidate or their upload), never a guess; if none is confirmed, leave the logo out. Do not call create_brand_from_website or save_brand_kit unless the user asked to save their brand. Once answered, do not ask again.',
    '- ROUTING: an ad or video is production, not research. Use Script-to-Video for every scripted, story-led, voiceover, multi-scene, or 30-second ad; say that you chose it. Use Video Provider Lab only for a quick single model clip with no multi-scene script. Use Ads Studio only when the user explicitly asks for competitor research, ad research, evidence, angles, or concepts — never as the final renderer.',
    '- Once the route is chosen, open it, fill the complete brief plus only the brand details the user confirmed, start its real generation action within budget, then wait for real status and deliver the real result.',
    '- SCRIPT-TO-VIDEO ORDER: after fill, an idea MUST run writeScript and useScript before makePlan; a supplied script runs useScript before makePlan. Then run approveCast, then start. Never call makePlan while can.makePlan is false, and never wait for a gate before a plan exists.',
    '- makePlan answers only once the plan is saved, and a character-free plan is confirmed automatically. After makePlan succeeds, never call fill, writeScript, useScript or makePlan again in this run; continue with approveCast and start.',
    '- MODEL DEFAULT: use internal model value "omni-1.1-flash" for Script-to-Video. If any requested model is rejected or missing, continue on Omni Flash automatically and mention the switch only as a short plain-language status.',
    '- If open_app fails after its one automatic remount, do NOT call open_app for that app again in this run. Do NOT surface a technical instruction — immediately call route_brief with a complete self-contained brief (goal, audience, brand facts, script or direction, seconds, ratio, voice/music), or choose the other suitable production app.',
    `- BUDGET: ${pricingRuleText()} Total budget for this run: ${budget} credits. run_paid is refused when a live estimate would break it; if the plan truly needs more, ask_user with purpose "budget", a requiredCredits number, and plain words (e.g. "This video needs 90 credits; your budget is 60.").`,
    '- QUALITY: after each finished shot, check three frames (same character, story beats, readable text, no extra people); re-render one shot at most twice. Before delivery probe duration and check six frames. Never invent progress, never automatically retry a paid submit, and finish only after a real finished event.',
    '- WEEKLY: when the user wants a recurring video ("every Monday", "weekly", "each week"), make sure one finished Script-to-Video film exists first (make it in this run if needed), then call schedule_weekly_video; it asks the user to approve the weekly price itself, so do not ask again.',
    '- LANGUAGE: anything the user could read (ask_user label/question/options, summary) is warm plain language — never app ids, slugs, tool or model names, JSON, or error text.',
    '',
    TOOL_DOC,
    '',
    'OUTPUT (hard): reply with EXACTLY ONE JSON object, no markdown fences, matching {"thinking": string, "calls": [{"name": string, "input": object}], "done": boolean, "summary": string}. "calls" may be empty only when "done" is true. "done" is true only after deliver succeeds; "summary" is then one short plain-language sentence.',
  ].join('\n');
}

async function sol(messages: unknown[]): Promise<string> {
  const request: Record<string, unknown> = {
    model: 'gpt-6.1-sol',
    reasoning_effort: 'medium',
    max_completion_tokens: 6000,
    messages,
    response_format: { type: 'json_object' },
    stream: false,
  };
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await workspaceFetch('/proxy/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = String((data as any)?.error?.message || (data as any)?.error || `The AI request failed (HTTP ${response.status}).`);
        if (response.status === 400 && /response_format|unsupported_field/i.test(detail) && request.response_format) {
          delete request.response_format;
          continue;
        }
        throw new Error(detail);
      }
      const text = (data as any)?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('The model returned an empty reply.');
      return text;
    } catch (error) {
      last = error;
      if (attempt === 3 || !/abort|timeout|429|5\d\d|network|fetch|empty reply/i.test(String(error))) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** attempt));
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw last;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model reply was not valid JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function compact(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return text.length > RESULT_LIMIT ? `${text.slice(0, RESULT_LIMIT)}…` : text;
}

function toolLabel(name: string, input: Record<string, any>): string {
  const app = resolveAppId(input.appId) ? friendlyAppName(resolveAppId(input.appId) as AppId) : 'the studio';
  if (name === 'read_brand_kit') return 'Checking your Brand Kit';
  if (name === 'lookup_brand') return 'Looking up your website and logo';
  if (name === 'create_brand_from_website') return 'Learning your brand from its website';
  if (name === 'save_brand_kit') return 'Saving your Brand Kit';
  if (name === 'list_library') return 'Checking your video library';
  if (name === 'open_app') return `Opening ${app}`;
  if (name === 'get_state') return 'Checking your project settings';
  if (name === 'fill') return 'Filling in your production brief';
  if (name === 'run_free') {
    if (input.action === 'writeScript') return 'Turning your idea into a production script';
    if (input.action === 'useScript') return 'Accepting the production script';
    if (input.action === 'makePlan') return 'Building the production plan';
    if (input.action === 'approveCast') return 'Checking and approving the cast';
    return 'Preparing the next production step';
  }
  if (name === 'run_paid') return 'Starting video production';
  if (name === 'wait_for') return 'Waiting for the next saved production update';
  if (name === 'check_frames') return 'Reviewing the finished frames';
  if (name === 'route_brief') return `Sending the complete brief to ${app}`;
  if (name === 'ask_user') return input.purpose === 'budget' ? 'Checking the production budget' : 'Confirming your brand details';
  if (name === 'schedule_weekly_video') return 'Setting up your weekly video';
  if (name === 'list_weekly_videos') return 'Checking your weekly videos';
  if (name === 'deliver') return 'Preparing your finished video';
  return 'Working on your video';
}

function toolSuccess(name: string, input: Record<string, any>, result: any): string {
  if (name === 'read_brand_kit') return result?.saved ? `A saved Brand Kit exists for ${result.businessName || 'your project'}; waiting for you to confirm it.` : 'No saved Brand Kit found yet.';
  if (name === 'lookup_brand') return Array.isArray(result?.logoCandidates) && result.logoCandidates.length ? `Found ${result.logoCandidates.length} possible logo${result.logoCandidates.length === 1 ? '' : 's'} to confirm.` : 'No logo found; you can share it or skip it.';
  if (name === 'open_app') return `${friendlyAppName((resolveAppId(input.appId) || input.appId) as AppId)} is ready.`;
  if (name === 'get_state') {
    const values = result?.values || {};
    const parts = [values.length ? `${values.length}s` : '', values.shape || '', values.model ? 'Omni Flash' : ''].filter(Boolean);
    return parts.length ? `Project settings checked: ${parts.join(' · ')}.` : 'Project settings checked.';
  }
  if (name === 'fill') {
    const values = input.values || {};
    const parts = [values.idea || values.script ? 'your idea' : 'the brief', values.length ? `length ${values.length}s` : '', values.shape ? `${values.shape} format` : ''].filter(Boolean);
    if (result?.planReused) return 'The saved production plan for this video was kept.';
    return result?.modelFallback ? `Filled in ${parts.join(', ')}. That model was unavailable, so I switched to Omni Flash.` : `Filled in ${parts.join(', ')}.`;
  }
  if (name === 'run_free') {
    if (input.action === 'writeScript') return 'Production script written from your idea.';
    if (input.action === 'useScript') return 'Production script accepted.';
    if (input.action === 'makePlan') {
      const planned = result?.result || {};
      const base = planned.reused ? 'The saved production plan was reused.' : 'Production plan created and saved.';
      return planned.castConfirmed ? `${base} No recurring character is needed, so the character-free plan was confirmed.` : base;
    }
    if (input.action === 'approveCast') return 'Cast check complete.';
    return 'Production step completed.';
  }
  if (name === 'run_paid') return 'Production started from the saved plan.';
  if (name === 'wait_for') return result?.type === 'still_working' ? 'Production is still working. Your project is saved, and I will keep checking.' : 'A new production update arrived.';
  if (name === 'check_frames') return result?.pass === false ? 'Quality review found something to correct.' : 'Frame quality check passed.';
  if (name === 'route_brief') return 'The complete brief is saved in the selected studio.';
  if (name === 'schedule_weekly_video') return result?.scheduled ? `Weekly video set: every ${result.day} at ${result.time}.` : 'The weekly video was not set up.';
  if (name === 'list_weekly_videos') return Array.isArray(result) && result.length ? `${result.length} weekly video series found.` : 'No weekly videos yet.';
  if (name === 'deliver') return 'Finished video ready.';
  if (name === 'list_library') return 'Video library checked.';
  return 'Completed.';
}

function toolFailure(name: string, message: string): string {
  const text = String(message || '');
  if (/production script and accept|make the plan first/i.test(text)) return name === 'run_free' ? 'The script must be accepted before the production plan can be built.' : 'The production plan is not ready yet.';
  if (/model.*not currently available|not configured/i.test(text)) return 'That model is unavailable, so this step will continue with Omni Flash.';
  if (/update was saved in the last/i.test(text)) return 'No new saved update arrived in the last few minutes. The project is still saved — Retry keeps checking without restarting.';
  if (/Another studio step is still finishing/i.test(text)) return 'Another studio step was still finishing. Retry builds the plan once it is free.';
  if (/No .* event arrived before the wait ended/i.test(text)) return 'No new saved update arrived yet. The project is still saved and can be checked again.';
  if (/connect|not connected|taking a moment/i.test(text)) return 'The studio did not connect in time. The brief is saved so it can continue without losing your work.';
  if (/session|unauthori[sz]ed|\b401\b|\b403\b/i.test(text)) return 'Your session needs to be refreshed before this step can continue.';
  if (/timeout|timed out|took too long/i.test(text)) return 'This step took longer than expected. Your saved work is safe; retry it once.';
  return 'That step did not finish. Your saved work is safe; retry it once.';
}

function toList(value: unknown, limit = 12): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit);
  if (typeof value === 'string') return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, limit);
  return [];
}

function studioSnapshot(controller: AppController): { screen: string; busy: boolean; values: Record<string, unknown> } | null {
  try {
    const state = controller.getState();
    return { screen: state.screen, busy: state.busy, values: state.values };
  } catch {
    return null;
  }
}

function formatWait(ms: number): string {
  return ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.round(ms / 60_000)} min`;
}

/**
 * Bounded polling for the next saved studio update. The requested event ends
 * the wait at once. Any other studio activity in the window (progress, shots,
 * a state change) means production is alive, so the wait ends neutrally as
 * still_working; only a window with no activity at all is an error.
 */
function waitFor(controller: AppController, type: string, options: { timeoutS: number; stopped(): boolean; onStill(elapsedMs: number): void }): Promise<unknown> {
  const limitMs = Math.min(WAIT_MAX_S, Math.max(WAIT_MIN_S, Number(options.timeoutS) || 300)) * 1000;
  const started = Date.now();
  let activity = 0;
  let signature = JSON.stringify(studioSnapshot(controller));
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    let delay = WAIT_FIRST_POLL_MS;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      off();
      settle();
    };
    const off = controller.subscribe((event) => {
      if (event.type === type) finish(() => resolve(event));
      else if (event.type !== 'field_changed' && event.type !== 'error') activity += 1;
    });
    const tick = () => {
      if (options.stopped()) { finish(() => reject(new Error('Stopped by the user.'))); return; }
      const next = JSON.stringify(studioSnapshot(controller));
      if (next !== signature) { activity += 1; signature = next; }
      const elapsed = Date.now() - started;
      if (elapsed >= limitMs) {
        const minutes = Math.max(1, Math.round(limitMs / 60_000));
        finish(() => activity > 0
          ? resolve({ type: 'still_working', waitedFor: type, waitedS: Math.round(elapsed / 1000), studio: studioSnapshot(controller) })
          : reject(new Error(`No ${type} update was saved in the last ${minutes} minute${minutes === 1 ? '' : 's'}.`)));
        return;
      }
      options.onStill(elapsed);
      delay = Math.min(WAIT_MAX_POLL_MS, Math.round(delay * 1.5));
      timer = window.setTimeout(tick, Math.min(delay, limitMs - elapsed));
    };
    timer = window.setTimeout(tick, delay);
  });
}

async function checkFrames(videoUrl: string, timestamps: number[], criteria: string) {
  const framesResponse = await workspaceFetch('/api/video/frames', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrl, timestamps: timestamps.slice(0, 20), workspaceId: WORKSPACE_ID }) });
  const framesData = await framesResponse.json().catch(() => null);
  if (!framesResponse.ok || !Array.isArray(framesData?.frames)) throw new Error('Frames could not be extracted.');
  const response = await workspaceFetch('/proxy/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-6.1-sol', reasoning_effort: 'medium', max_completion_tokens: 6000, messages: [{ role: 'user', content: [{ type: 'text', text: `Check these frames. Criteria: ${criteria}. Return JSON {pass:boolean,issues:string[]}.` }, ...framesData.frames.map((frame: any) => ({ type: 'image_url', image_url: { url: frame.url } }))] }], response_format: { type: 'json_object' }, stream: false }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || 'Vision check failed.'));
  try { return JSON.parse(data?.choices?.[0]?.message?.content || '{}'); } catch { return { pass: false, issues: ['The vision result was not valid JSON.'] }; }
}

async function saveBrandRecord(brand: BrandRecord): Promise<{ savedBrandId: string; businessName: string }> {
  const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
  const document = parseBrandKitDocument(loaded?.document) || emptyBrandKit();
  const next: BrandKitDocument = {
    ...document,
    brands: [...document.brands.filter((item) => item.id !== brand.id), brand],
    defaultBrandId: document.defaultBrandId || brand.id,
    updatedAt: new Date().toISOString(),
  };
  const saved = await callHook<any>('brand-kit-store', { op: 'save', document: next });
  if (saved?.ok !== true) throw new Error(String(saved?.error || 'The Brand Kit could not be saved.'));
  return { savedBrandId: brand.id, businessName: brand.identity.businessName };
}

function brandFromIntake(input: Record<string, any>): BrandRecord {
  const record = makeBrandRecord({
    websiteUrl: String(input.website || '').trim(),
    identity: { businessName: String(input.businessName || '').trim() || 'My brand', tagline: String(input.tagline || '').trim() },
    offer: { summary: String(input.summary || '').trim(), features: toList(input.features), benefits: toList(input.benefits), pricing: [], offersCtas: [] },
    audienceTone: { audience: String(input.audience || '').trim(), tone: String(input.tone || '').trim() },
    visuals: { logoUrl: /^https?:\/\//i.test(String(input.logoUrl || '')) ? String(input.logoUrl) : '', colors: toList(input.colors, 8), fonts: [], images: [], socialLinks: [] },
    pages: [],
    gaps: [],
    sources: { intake: 'Saved by Verger Autopilot from brand intake answers' },
    fetchedAt: '',
    limited: false,
  });
  record.confirmedAt = new Date().toISOString();
  return record;
}

export async function runAutopilot(goal: string, budget: number, callbacks: AutopilotCallbacks): Promise<{ spent: number; delivered?: AppEvent & { type: 'finished' } }> {
  const controllers = new Map<AppId, AppController>();
  const failedConnections = new Set<AppId>();
  const unsubscribers: Array<() => void> = [];
  let spent = 0;
  let approvedBudget = budget;
  let delivered: (AppEvent & { type: 'finished' }) | undefined;
  let stepCounter = 0;
  let active = true;
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const runStartedAt = Date.now();
  // Studio events that land between tool turns are kept so the next wait_for
  // sees them instead of reporting that nothing arrived.
  const seenEvents = new Map<string, { event: AppEvent; at: number }>();
  const lastWaitAt = new Map<string, number>();
  const pendingNotes: string[] = [];
  retryableSteps.clear();

  const connect = (appId: AppId, controller: AppController) => {
    controllers.set(appId, controller);
    unsubscribers.push(controller.subscribe((event) => {
      seenEvents.set(`${appId}:${event.type}`, { event, at: Date.now() });
      callbacks.onEvent(appId, event);
      if (event.type === 'finished') delivered = event;
    }));
  };
  const requireController = (appId: AppId): AppController => {
    const controller = controllers.get(appId);
    if (!controller) throw new Error(`${friendlyAppName(appId)} is not connected yet — call open_app first, or route_brief if it will not connect.`);
    return controller;
  };

  const execute = async (name: string, input: Record<string, any>, step?: AutopilotStep): Promise<unknown> => {
    const appId = (resolveAppId(input.appId) || String(input.appId || '')) as AppId;
    switch (name) {
      case 'read_brand_kit': {
        const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
        const document = parseBrandKitDocument(loaded?.document);
        if (document) rememberBrandDocument(document);
        const named = document ? resolveBrandForRequest(document, `${String(input.brand || '')}\n${goal}`) : null;
        const brand = document ? named || document.brands.find((item) => item.id === document.defaultBrandId) || document.brands[0] || null : null;
        return brand
          ? { ...brandDocFacts(brand), otherSavedBrands: document ? document.brands.filter((item) => item.id !== brand.id).map((item) => item.identity.businessName).filter(Boolean).slice(0, 6) : [] }
          : { saved: false, note: 'No Brand Kit yet. Use lookup_brand when a website or name is known, then ask ONE grouped brand confirmation question (purpose "brand"). Never invent brand details.' };
      }
      case 'lookup_brand': {
        const name = String(input.name || '').trim().slice(0, 80);
        const url = String(input.url || '').trim().slice(0, 200);
        if (!name && !url) throw new Error('lookup_brand needs a brand name or a website.');
        const found = await callHook<any>('sceneforge-brand-lookup', { name, url });
        if (!found?.ok) throw new Error(String(found?.error || 'The brand lookup did not answer.'));
        return {
          unconfirmed: true,
          name: found.name || '',
          website: found.website ? { url: found.website.url, read: found.website.read === true, name: found.website.name || '', colors: found.website.colors || [] } : null,
          logoCandidates: (found.candidates || []).slice(0, 4).map((item: any) => ({ url: item.url, label: item.label, lowRes: item.lowRes === true })),
          possibleWebsites: (found.siteSuggestions || []).slice(0, 3).map((item: any) => item.url),
          notes: (found.notes || []).slice(0, 2),
        };
      }
      case 'create_brand_from_website': {
        const brand = await fetchBrandFromWebsite(String(input.url || ''));
        brand.confirmedAt = new Date().toISOString();
        return saveBrandRecord(brand);
      }
      case 'save_brand_kit':
        return saveBrandRecord(brandFromIntake(input));
      case 'list_library':
        return (await listVideoHistory(20))
          .filter((video) => !input.query || video.title.toLowerCase().includes(String(input.query).toLowerCase()))
          .map((video) => ({ id: video.id, title: video.title, length: video.duration_sec }));
      case 'open_app': {
        if (failedConnections.has(appId)) throw new Error(`${friendlyAppName(appId)} already used its one bounded connection attempt. Use route_brief now; do not call open_app again.`);
        try {
          const controller = await openApp(appId, 'hidden');
          connect(controller.appId, controller);
          return controller.schema();
        } catch (error) {
          failedConnections.add(appId);
          throw error;
        }
      }
      case 'fill': {
        const controller = requireController(appId);
        const values = { ...(input.values || {}) };
        if (values.model) values.model = resolveVideoModelAlias(String(values.model));
        const result = await controller.fill(values, { animate: false, autopilotRunId: runId });
        const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
        if (rejected.some((item: any) => item?.key === 'model')) {
          return {
            ...result,
            rejected: rejected.filter((item: any) => item?.key !== 'model'),
            modelFallback: true,
            effectiveModel: 'omni-1.1-flash',
          };
        }
        return result;
      }
      case 'run_free': {
        const controller = requireController(appId);
        const action = controller.schema().actions.find((item) => item.key === input.action);
        if (!action || action.paid) throw new Error('That action is not free.');
        const result = await controller.run(action.key, { autopilotRunId: runId });
        if (!result.ok) throw new Error(result.error || 'The action failed.');
        return result;
      }
      case 'run_paid': {
        const controller = requireController(appId);
        const action = controller.schema().actions.find((item) => item.key === input.action);
        if (!action?.paid || !action.estimate) throw new Error('That paid action has no live estimate.');
        const estimate = (await action.estimate(controller.getState().values)).credits;
        if (spent + estimate > approvedBudget) throw new Error(`Budget blocked: ${estimate} credits would take this run past ${approvedBudget}. If the plan truly needs it, ask_user with purpose "budget" and requiredCredits ${spent + estimate}.`);
        const result = await controller.run(action.key, { approvedCredits: estimate, note: input.note, autopilotRunId: runId });
        if (!result.ok) throw new Error(result.error || 'The paid action failed.');
        spent += estimate;
        return result;
      }
      case 'get_state':
        return requireController(appId).getState();
      case 'wait_for': {
        const controller = requireController(appId);
        const type = String(input.event || 'progress');
        const key = `${appId}:${type}`;
        const seen = seenEvents.get(key);
        if (seen && seen.at > (lastWaitAt.get(key) || runStartedAt)) {
          lastWaitAt.set(key, Date.now());
          return seen.event;
        }
        let reportedAt = 0;
        const result = await waitFor(controller, type, {
          timeoutS: Number(input.timeoutS || 300),
          stopped: () => callbacks.stopped(),
          onStill: (elapsed) => {
            if (!step || elapsed - reportedAt < WAIT_REPORT_EVERY_MS) return;
            reportedAt = elapsed;
            callbacks.onStep({ ...step, status: 'running', evidence: `Still working — checked for ${formatWait(elapsed)}. Your project is saved.` });
          },
        });
        lastWaitAt.set(key, Date.now());
        return result;
      }
      case 'check_frames':
        return checkFrames(String(input.videoUrl), input.timestamps || [0], String(input.criteria || 'Match the approved plan.'));
      case 'route_brief': {
        if (!resolveAppId(input.appId)) throw new Error('Name one registered studio id for route_brief.');
        const brief = String(input.brief || goal).trim();
        if (appId === 'script-to-video') {
          const duration = Math.max(2, Math.min(600, Math.round(Number(brief.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[1]) || 30)));
          const aspect = /\b(?:9:16|vertical|portrait|reel|shorts?|tiktok)\b/i.test(brief) ? '9:16' : /\b(?:1:1|square)\b/i.test(brief) ? '1:1' : '16:9';
          const routed = await callHook<any>('s2v-agent-handoff', { op: 'create_handoff', source: 'verger', brief, entry_type: /\bscript\b/i.test(brief) ? 'script' : 'idea', duration_seconds: duration, aspect_ratio: aspect });
          if (!routed?.success) throw new Error(String(routed?.error || 'Script-to-Video could not save the brief.'));
        } else {
          saveVidvergeHandoff({ appId, prompt: brief });
        }
        mountEmbeddedApp(appId, 'hidden', true);
        return { routed: true, studio: friendlyAppName(appId), note: 'The complete brief was saved to the studio intake. Track real progress with get_state when connected, or list_library for the finished video. Do not call open_app again after a connection failure.' };
      }
      case 'ask_user': {
        const purpose = String(input.purpose || '');
        if (purpose !== 'brand' && purpose !== 'budget') {
          throw new Error('ask_user is reserved for brand intake ("brand") and budget approval ("budget"). Decide this yourself with a sensible default and continue.');
        }
        const answer = await callbacks.askUser({
          purpose,
          label: String(input.label || (purpose === 'budget' ? 'Budget check' : 'About your brand')),
          question: String(input.question || ''),
          options: toList(input.options, 6),
          multi: input.multi === true,
        });
        if (purpose === 'budget' && /^\s*(yes|go ahead|approve|raise|ok)/i.test(answer)) {
          const fromInput = Math.round(Number(input.requiredCredits) || 0);
          const fromQuestion = Math.round(Number((String(input.question).match(/(\d{1,5})\s*credits?/i) || [])[1]) || 0);
          const needed = Math.max(fromInput, fromQuestion);
          if (needed > approvedBudget) approvedBudget = needed;
        }
        return { answer };
      }
      case 'list_weekly_videos': {
        const listed = await callHook<any>('s2v-series', { op: 'list' });
        if (listed?.ok !== true) throw new Error(String(listed?.error || 'Weekly videos could not be read.'));
        return (Array.isArray(listed.series) ? listed.series : []).map((s: any) => ({ title: s.title, topic: s.topic, status: s.status, weekday: s.weekday, hour: s.hour_local, episodes: s.episodes, last: s.last_status }));
      }
      case 'schedule_weekly_video': {
        const topic = String(input.topic || '').trim().slice(0, 600);
        if (topic.length < 4) throw new Error('schedule_weekly_video needs the topic every episode is about.');
        const wanted = String(input.filmTitle || '').trim().toLowerCase();
        const wdb = (window as any).__workspaceDb;
        if (!wdb) throw new Error('Your session is still loading.');
        const { data } = await wdb.from('s2v_films').orderBy('created_at', 'desc').limit(50).get();
        const finished = (Array.isArray(data) ? data : []).filter((row: any) => row && row.final_video_url);
        const film = (wanted ? finished.find((row: any) => String(row.title || '').toLowerCase().includes(wanted)) : null) || finished[0];
        if (!film) throw new Error('No finished Script-to-Video film exists yet. Make one first; the weekly series copies its look, cast and settings.');
        const quoted = await callHook<any>('s2v-series', { op: 'quote', filmId: film.id });
        if (quoted?.ok !== true) throw new Error(String(quoted?.error || 'The weekly price could not be checked.'));
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const weekday = Math.min(7, Math.max(1, Math.round(Number(input.weekday) || 1)));
        const hour = Math.min(23, Math.max(0, Math.round(Number(input.hour ?? 9) || 0)));
        const credits = quoted.quote?.credits == null ? null : Math.round(Number(quoted.quote.credits));
        const price = quoted.quote?.exempt ? 'no credits on your account' : credits != null ? `about ${credits} credits each week` : 'the usual credits for each episode';
        const time = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'am' : 'pm'}`;
        const answer = await callbacks.askUser({
          purpose: 'budget',
          label: 'Weekly video',
          question: `Make a new video about “${topic}” every ${days[weekday - 1]} at ${time}, with the look and cast of “${film.title || 'your film'}”? That is ${price}. A week is skipped and nothing is charged if your balance is short, and you can pause or cancel any time.`,
          options: ['Yes, start it', 'Not now'],
        });
        if (!/^\s*(yes|start|ok|approve|go)/i.test(String(answer || ''))) return { scheduled: false, reason: 'The user did not approve the weekly price.' };
        const created = await callHook<any>('s2v-series', {
          op: 'create', filmId: film.id, topic, title: String(input.title || film.title || 'Weekly video').slice(0, 120), weekday, hourLocal: hour,
          utcOffsetMin: -new Date().getTimezoneOffset(),
          timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })(),
          creditCap: credits || 0,
        });
        if (created?.ok !== true) throw new Error(String(created?.error || 'The weekly video could not be set up.'));
        return { scheduled: true, day: days[weekday - 1], time, credits, series: created.series?.title || film.title };
      }
      case 'deliver': {
        if (!delivered) throw new Error('No finished event exists to deliver yet.');
        return delivered;
      }
      default:
        throw new Error(`Unknown tool "${name}".`);
    }
  };

  const resolveVideoModelAlias = (value: string): string => {
    const key = String(value || '').trim().toLowerCase();
    if (!key || key === 'auto' || key.includes('omni') || key.includes('gemini')) return 'omni-1.1-flash';
    if (key.includes('seedance-2.5')) return 'seedance-2.5';
    if (key.includes('kling-3.0-omni')) return 'kling-3.0-omni';
    return 'omni-1.1-flash';
  };

  const runTool = async (call: { name: string; input: Record<string, any> }, step: AutopilotStep): Promise<Record<string, unknown>> => {
    callbacks.onStep({ ...step });
    try {
      const result = await execute(call.name, call.input, step);
      step.status = 'done';
      step.evidence = toolSuccess(call.name, call.input, result);
      callbacks.onStep({ ...step });
      retryableSteps.delete(step.id);
      return { tool: call.name, ok: true, result: compact(result) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Stopped by the user/i.test(message)) throw error;
      step.status = 'failed';
      step.evidence = toolFailure(call.name, message);
      callbacks.onStep({ ...step });
      if (isRetryable(call.name, call.input)) {
        retryableSteps.set(step.id, {
          step,
          rerun: async (target) => {
            target.status = 'running';
            target.evidence = 'Checking again…';
            const outcome = await runTool(call, target).catch(() => {
              target.status = 'failed';
              target.evidence = 'Stopped before this check finished. Your project is saved.';
              callbacks.onStep({ ...target });
              return null;
            });
            if (outcome && active) pendingNotes.push(`[creator retried "${target.label}"] ${JSON.stringify(outcome)}`);
          },
        });
      }
      return { tool: call.name, ok: false, error: compact(message) };
    }
  };

  const messages: any[] = [
    { role: 'system', content: systemPrompt(budget) },
    { role: 'user', content: `${goal}\n\nHard total budget: ${budget} credits. Choose only live model options. Start by checking what is saved, then confirm the brand details with the user before filling any brief.` },
  ];
  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (callbacks.stopped()) throw new Error('Stopped by the user.');
      const recent = messages.length > 52 ? [messages[0], messages[1], ...messages.slice(messages.length - 50)] : messages;
      const text = await sol(recent);
      let plan: any;
      try {
        plan = extractJson(text);
      } catch {
        messages.push({ role: 'assistant', content: text }, { role: 'user', content: '[tool results]\nThat reply was not one valid JSON object. Re-send ONLY the JSON object matching {"thinking","calls","done","summary"} — nothing else.' });
        continue;
      }
      messages.push({ role: 'assistant', content: JSON.stringify(plan) });
      const calls: Array<{ name: string; input: Record<string, any> }> = Array.isArray(plan?.calls)
        ? plan.calls
            .filter((call: any) => call && typeof call.name === 'string')
            .slice(0, 3)
            .map((call: any) => ({ name: call.name, input: call.input && typeof call.input === 'object' ? call.input : {} }))
        : [];
      if (!calls.length) {
        if (plan?.done === true) return { spent, delivered };
        messages.push({ role: 'user', content: '[tool results]\nNo tool was called and the run is not done. Continue with the next tool call, or set done true only after deliver succeeds.' });
        continue;
      }
      const results: Array<Record<string, unknown>> = [];
      for (const call of calls) {
        if (callbacks.stopped()) throw new Error('Stopped by the user.');
        stepCounter += 1;
        const step: AutopilotStep = { id: `autopilot-${runId}-${stepCounter}`, label: toolLabel(call.name, call.input), tool: call.name, status: 'running', evidence: 'Working…' };
        results.push(await runTool(call, step));
      }
      if (plan?.done === true && delivered) return { spent, delivered };
      const notes = pendingNotes.splice(0);
      messages.push({ role: 'user', content: `[tool results]\n${JSON.stringify(results)}${notes.length ? `\n${notes.join('\n')}` : ''}` });
    }
    throw new Error('Autopilot reached its safety limit before finishing.');
  } finally {
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
