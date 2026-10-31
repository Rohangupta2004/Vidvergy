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

const TOOL_DOC = `TOOLS — call one by adding {"name": "...", "input": {...}} to "calls" (up to 3 per turn, run in order):
• read_brand_kit {} — load the saved Brand Kit. Always do this first.
• create_brand_from_website {"url": string} — read a public website and save a Brand Kit from it.
• save_brand_kit {"businessName": string, "tagline"?: string, "website"?: string, "audience"?: string, "tone"?: string, "summary"?: string, "colors"?: string[], "logoUrl"?: string} — save brand intake answers as the Brand Kit.
• list_library {"query"?: string} — list saved finished videos.
• open_app {"appId": string} — mount one studio invisibly and return its live field/action schema. Registered ids: script-to-video, ugc-studio, faceless, sceneforge, ads-studio, video-enhancer, cineagent, brand-context.
• fill {"appId": string, "values": object} — fill studio fields through the bridge.
• run_free {"appId": string, "action": string} — run one free action.
• run_paid {"appId": string, "action": string, "note"?: string} — run one paid action; refused when its live estimate would break the budget.
• get_state {"appId": string} — read the connected studio state.
• wait_for {"appId": string, "event": string, "timeoutS"?: number} — wait for a real studio event (progress, shot, gate, finished…).
• check_frames {"videoUrl": string, "timestamps": number[], "criteria": string} — extract frames and vision-check them.
• route_brief {"appId": string, "brief": string} — when open_app cannot connect, hand a complete self-contained brief straight to that studio's intake instead. Never ask the user to open anything.
• ask_user {"purpose": "brand" | "budget", "label": string, "question": string, "options": string[], "multi"?: boolean, "requiredCredits"?: number} — ONLY brand intake ("brand") or budget approval ("budget"). Any other purpose is refused.
• deliver {"videoId": string, "appId": string} — deliver the finished, checked video.`;

function systemPrompt(budget: number): string {
  return [
    'You are Verger Autopilot, Vidverge\u2019s autonomous video producer. You make the whole video yourself with the tools below; the person only sees progress and the finished result.',
    '',
    'HARD AUTONOMY RULES:',
    '- NEVER ask the user to create, open, click, configure, retry, sign in to, or check anything. You perform every step yourself.',
    '- ask_user exists for exactly two things: purpose "brand" (short brand intake, ONLY when read_brand_kit returns no saved brand and the request contains no website URL to learn from) and purpose "budget" (approving credits beyond the stated budget). Everything else you decide yourself with sensible defaults: 30 seconds unless stated, 9:16 for social and 16:9 for product/web, tone and colours from the Brand Kit.',
    '- BRAND FIRST: read_brand_kit at the start. If a brand exists, use it. If not and the request has a website URL, create_brand_from_website. Otherwise ask ONE grouped intake question (purpose "brand") covering the business/product, audience, tone of voice, and optional website or colours — then save_brand_kit and continue without asking anything more.',
    '- If open_app fails or a studio will not connect, do NOT surface that and do NOT ask the user — call route_brief with a complete self-contained brief (goal, audience, script or direction, seconds, ratio, voice/music), or use another registered studio.',
    `- BUDGET: 1 credit = 1 second of finished video; only generation spends credits. Total budget for this run: ${budget} credits. run_paid is refused when a live estimate would break it; if the plan truly needs more, ask_user with purpose "budget", a requiredCredits number, and plain words (e.g. "This video needs 90 credits; your budget is 60.").`,
    '- QUALITY: after each finished shot, check three frames (same character, story beats, readable text, no extra people); re-render one shot at most twice. Before delivery probe duration and check six frames. Never invent progress, never automatically retry a paid submit, and finish only after a real finished event.',
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

function toList(value: unknown, limit = 12): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit);
  if (typeof value === 'string') return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, limit);
  return [];
}

async function waitFor(controller: AppController, type: string, timeoutS: number): Promise<AppEvent> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { off(); reject(new Error(`No ${type} event arrived before the wait ended.`)); }, Math.min(300, Math.max(1, timeoutS)) * 1000);
    const off = controller.subscribe((event) => { if (event.type === type) { window.clearTimeout(timer); off(); resolve(event); } });
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
  const unsubscribers: Array<() => void> = [];
  let spent = 0;
  let approvedBudget = budget;
  let delivered: (AppEvent & { type: 'finished' }) | undefined;
  let stepCounter = 0;

  const connect = (appId: AppId, controller: AppController) => {
    controllers.set(appId, controller);
    unsubscribers.push(controller.subscribe((event) => {
      callbacks.onEvent(appId, event);
      if (event.type === 'finished') delivered = event;
    }));
  };
  const requireController = (appId: AppId): AppController => {
    const controller = controllers.get(appId);
    if (!controller) throw new Error(`${friendlyAppName(appId)} is not connected yet — call open_app first, or route_brief if it will not connect.`);
    return controller;
  };

  const execute = async (name: string, input: Record<string, any>): Promise<unknown> => {
    const appId = (resolveAppId(input.appId) || String(input.appId || '')) as AppId;
    switch (name) {
      case 'read_brand_kit': {
        const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
        const document = parseBrandKitDocument(loaded?.document);
        const brand = document ? document.brands.find((item) => item.id === document.defaultBrandId) || document.brands[0] || null : null;
        return brand
          ? { saved: true, businessName: brand.identity.businessName, tagline: brand.identity.tagline, audience: brand.audienceTone.audience, tone: brand.audienceTone.tone, website: brand.websiteUrl, colors: brand.visuals.colors.slice(0, 6), summary: brand.offer.summary }
          : { saved: false, note: 'No Brand Kit yet. Use create_brand_from_website when the request has a URL; otherwise ask ONE grouped brand intake question (purpose "brand"), then save_brand_kit.' };
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
        const controller = await openApp(appId, 'hidden');
        connect(controller.appId, controller);
        return controller.schema();
      }
      case 'fill':
        return requireController(appId).fill(input.values || {}, { animate: false });
      case 'run_free': {
        const controller = requireController(appId);
        const action = controller.schema().actions.find((item) => item.key === input.action);
        if (!action || action.paid) throw new Error('That action is not free.');
        const result = await controller.run(action.key);
        if (!result.ok) throw new Error(result.error || 'The action failed.');
        return result;
      }
      case 'run_paid': {
        const controller = requireController(appId);
        const action = controller.schema().actions.find((item) => item.key === input.action);
        if (!action?.paid || !action.estimate) throw new Error('That paid action has no live estimate.');
        const estimate = (await action.estimate(controller.getState().values)).credits;
        if (spent + estimate > approvedBudget) throw new Error(`Budget blocked: ${estimate} credits would take this run past ${approvedBudget}. If the plan truly needs it, ask_user with purpose "budget" and requiredCredits ${spent + estimate}.`);
        const result = await controller.run(action.key, { approvedCredits: estimate, note: input.note });
        if (!result.ok) throw new Error(result.error || 'The paid action failed.');
        spent += estimate;
        return result;
      }
      case 'get_state':
        return requireController(appId).getState();
      case 'wait_for':
        return waitFor(requireController(appId), String(input.event), Number(input.timeoutS || 300));
      case 'check_frames':
        return checkFrames(String(input.videoUrl), input.timestamps || [0], String(input.criteria || 'Match the approved plan.'));
      case 'route_brief': {
        if (!resolveAppId(input.appId)) throw new Error('Name one registered studio id for route_brief.');
        saveVidvergeHandoff({ appId, prompt: String(input.brief || goal) });
        mountEmbeddedApp(appId, 'hidden', true);
        return { routed: true, studio: friendlyAppName(appId), note: 'The brief was handed to the studio intake. Track it with list_library, or open_app again later for live state.' };
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
      case 'deliver': {
        if (!delivered) throw new Error('No finished event exists to deliver yet.');
        return delivered;
      }
      default:
        throw new Error(`Unknown tool "${name}".`);
    }
  };

  const messages: any[] = [
    { role: 'system', content: systemPrompt(budget) },
    { role: 'user', content: `${goal}\n\nHard total budget: ${budget} credits. Choose only live model options. Start by reading the Brand Kit.` },
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
        const step: AutopilotStep = { id: `autopilot-${stepCounter}`, label: call.name.replace(/_/g, ' '), tool: call.name, status: 'running', evidence: '' };
        callbacks.onStep({ ...step });
        try {
          const result = await execute(call.name, call.input);
          step.status = 'done';
          step.evidence = compact(result);
          callbacks.onStep({ ...step });
          results.push({ tool: call.name, ok: true, result: compact(result) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/Stopped by the user/i.test(message)) throw error;
          step.status = 'failed';
          step.evidence = message;
          callbacks.onStep({ ...step });
          results.push({ tool: call.name, ok: false, error: compact(message) });
        }
      }
      if (plan?.done === true && delivered) return { spent, delivered };
      messages.push({ role: 'user', content: `[tool results]\n${JSON.stringify(results)}` });
    }
    throw new Error('Autopilot reached its safety limit before finishing.');
  } finally {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
