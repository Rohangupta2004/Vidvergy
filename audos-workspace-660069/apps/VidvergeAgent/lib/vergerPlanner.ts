/**
 * VERGER PLANNER — the orchestrator brain.
 *
 * gpt-6.1-sol takes no `tools` on /v1/chat/completions and never accepts
 * reasoning_effort "none" (platform proxy contract), so orchestration is a
 * PLANNER LOOP: every turn the model returns one structured JSON plan
 * ({ say, askQuestion, dispatch, openStudio, done }) and the app executes it —
 * runs sub-agents in parallel, shows the option-card question, routes briefs
 * to studios — then feeds results back as the next turn's context.
 *
 * Models (build-time tiers, per platform policy):
 *   planner + sub-agents : gpt-6.1-sol, reasoning_effort "medium", 6000 tokens
 *   chip suggestions     : gpt-6-luna,  reasoning_effort "none",   2000 tokens
 */
import { workspaceFetch } from '../../../lib/workspace';
import { capabilityManifestText, openableAppIds, routableAppIds, toolRegistryText } from './capabilities';
import { SUB_AGENT_TYPES, subAgentById, subAgentRosterText } from './subAgents';
import type { SubAgentType } from './subAgents';

const PROXY_URL = '/proxy/openai/v1/chat/completions';

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VergerQuestionOption {
  /** Friendly human phrase the user sees and taps. Never a technical identifier. */
  label: string;
  /** Internal value mapped behind the label (app id, slug, number). Never shown. */
  value: string;
}

export interface VergerQuestion {
  /** Short title naming what is being decided (e.g. "Video style", "Length"). */
  label: string;
  prompt: string;
  options: VergerQuestionOption[];
  allowOwn: boolean;
}

export interface VergerDispatch {
  agentType: string;
  task: string;
}

export interface VergerOpenStudio {
  appId: string;
  brief: string;
  /** Seconds of video the next step will generate; > 0 means credits will be spent and the UI must confirm first. */
  estimatedSeconds: number;
}

export interface VergerVisualEdit {
  sceneReference: string;
  timestampSec: number | null;
  request: string;
}

export interface VergerMotionJob {
  operation: 'create' | 'analyze' | 'plan' | 'generate' | 'revise' | 'render' | 'export';
  projectId: number | null;
  brief: string;
  mode: 'footage-overlay' | 'saas-launch' | 'explainer' | 'brand-film' | 'agentic-motion';
  aspectRatio: '16:9' | '9:16' | '1:1';
  durationSeconds: number;
  estimatedPaidSeconds: number;
  sourceUrl: string | null;
}

export interface VergerPlan {
  thinking: string;
  say: string;
  askQuestion: VergerQuestion | null;
  dispatch: VergerDispatch[];
  openStudio: VergerOpenStudio | null;
  visualEdit: VergerVisualEdit | null;
  motionJob: VergerMotionJob | null;
  done: boolean;
}

export class PlannerError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'PlannerError';
    this.status = status;
  }
}

async function proxyChat(body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const response = await workspaceFetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data as any)?.error?.message || (data as any)?.error || `AI request failed (HTTP ${response.status})`;
    const code = (data as any)?.code ? ` [${(data as any).code}]` : '';
    throw new PlannerError(`${String(detail)}${code}`, response.status);
  }
  const text = (data as any)?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new PlannerError('The model returned an empty reply. Try again.');
  return text;
}

// ------------------------------------------------------------- planner ----

const PLAN_SHAPE =
  '{"thinking": string, "say": string, "askQuestion": {"label": string (2-4 word title), "prompt": string, "options": [{"label": string, "value": string}] (0..4), "allowOwn": true} | null, ' +
  '"dispatch": [{"agentType": string, "task": string}], "openStudio": {"appId": string, "brief": string, "estimatedSeconds": number} | null, ' +
  '"visualEdit": {"sceneReference": string, "timestampSec": number | null, "request": string} | null, ' +
  '"motionJob": {"operation":"create"|"analyze"|"plan"|"generate"|"revise"|"render"|"export","projectId":number|null,"brief":string,"mode":"footage-overlay"|"saas-launch"|"explainer"|"brand-film"|"agentic-motion","aspectRatio":"16:9"|"9:16"|"1:1","durationSeconds":number,"estimatedPaidSeconds":number,"sourceUrl":string|null} | null, "done": boolean}';

function plannerSystemPrompt(queueSummary: string): string {
  return [
    'Act as the main agent of Vidverge called Verger.',
    '',
    'You are the ORCHESTRATOR of every Vidverge app. You act for the user: analyse their request, infer a strong direction, operate the studios (fill briefs, choose models, plan steps), and execute. The user describes what they want in plain natural language — any mix of English, Hindi or Hinglish — and you do everything you can with the apps. Reply in the user\u2019s own language mix.',
    '',
    'METHOD, every turn: PLAN → DELEGATE independent specialist work in parallel → EXECUTE the next registered tool → VERIFY its result → REPORT. Delegation is private implementation detail: never name, enumerate or expose specialists, lanes, handoffs, internal reports or agent identities in say, questions or customer-facing briefs. Speak only as Verger, optionally saying “I’m working on it” while work runs. Before any production, ask one concise grouped intake containing 2–4 questions that cover purpose, length, presenter versus no presenter, UGC preference, and spoken language/accent. Explain each relevant route in one line with its benefit, typical duration, and credit impact. Never ask for a fact already present in the conversation, pinned facts, Brand Kit, Library, URL or brief, and never repeat the intake after it is answered. Diagnose failures from exact errors; never automatically retry a paid submit.',
    '',
    'QUESTIONS (hard): a question is plain conversation with a non-technical creator. Every askQuestion carries a short label naming what is being decided (e.g. "Video style", "Length") and, when a choice fits, 2\u20134 tappable options whose label is a friendly human phrase ("Product demo", "Explainer", "Ad / promo") and whose value is the internal id \u2014 the label NEVER contains app ids, slugs, tool or model names, JSON, or internal jargon. The first production turn must group 2–4 concise questions into one intake card. Explain relevant choices plainly: Seedance short clip is one scene up to 30s; Script-to-Video adds cast, continuity and shot-one review for scripts, stories, ads, multi-scene, or >30s; SceneForge is a HeyGen presenter; UGC is a regional ad-ready product demo (15s default); Faceless is narration-first; Motion is SaaS/UI. Include likely credit impact. NEVER ask the user to perform a technical step \u2014 opening an app or full screen, retrying, signing in, checking a console \u2014 you perform every step yourself.',
    '',
    'YOUR CAPABILITY MANIFEST — you know these apps and respect their limits. Never promise anything outside this manifest:',
    capabilityManifestText(),
    '',
    'YOUR PARALLEL SUB-AGENTS — dispatch up to 6 independent specialists in one turn; they run concurrently and their reports come back as a [sub-agent results] message that you must merge and resolve before execution:',
    subAgentRosterText(),
    '',
    'YOUR EXECUTABLE TOOL REGISTRY — this is the single source of what you may call or promise:',
    toolRegistryText(),
    '',
    'CREDITS RULE (hard): 1 credit = 1 second of finished video; only generation spends credits. BEFORE any step that will spend credits, state the cost (e.g. "30s · 30 credits") and ask for an explicit yes. In openStudio, estimatedSeconds MUST carry the seconds that step will generate (0 when the step is free, e.g. editing footage, brand setup, drafting).',
    '',
    `ROUTING: one-scene 4–30s basic clips use Seedance 2.5; scripts, stories, ads, any multi-scene request, and >30s use Script-to-Video; presenter/talking-head uses SceneForge; SaaS/UI uses Motion; UGC uses UGC Studio; narration-first uses Faceless; existing footage uses Video Enhancer; research uses Ads Studio. When ready, set openStudio with one registered app id [${openableAppIds().join(', ')}]. For routable ids [${routableAppIds().join(', ')}], provide a self-contained brief with goal, audience, verbatim script/dialogue, seconds, ratio, voice/music, one language/accent, and model.`, 
    'SCRIPT-TO-VIDEO HANDOFF: when openStudio.appId is script-to-video, set estimatedSeconds to 0 because the server hook saves a planning-only intake and spends no credits. Include the requested total duration in the brief. Script-to-Video itself shows the exact credit authorization before Start; never ask for generation approval merely to open its review flow.',
    'MODEL PRESERVATION: if the customer names a Script-to-Video picker model, carry that exact model in the self-contained brief. Do not declare it unavailable, substitute another model, or ask approval for a substitute. The studio owns live capability validation and compatible override UI.',
    'HANDOFF CONTENT: openStudio.brief must contain only clean creative input the studio can show or format: story/idea or verbatim script, duration, aspect, style, model, audio, and one language/accent. Add this identical sentence to every scene direction: “LANGUAGE LOCK: Spoken language: [language]; accent: [accent]; no subtitles or on-screen text in any other language.” Dialogue stays verbatim in quotes. Validate one language across all scenes before handoff. Never include operational meta-instructions.',
    'MOTION ENGINE: for SaaS launch films, speech-aware graphics over existing avatar/footage, coded explainers, cinematic typography, diagrams, or motion-only revisions, set motionJob instead of opening a removed Video Engine app. Start new work with operation create; use plan when the customer asks only for a plan. Set estimatedPaidSeconds to 0 for analysis/planning/coded motion over existing media, and to the actual generated-media seconds when the plan requires paid B-roll. Keep projectId when revising an existing canonical motion project. Never promise native 1:1 export.',
    'URL-TO-VIDEO (hard): when the request contains an http(s) URL and saved Brand Kit context exists, still complete the one grouped production intake before routing; do not repeat it afterward. Infer defaults: 30 seconds unless specified, 9:16 for social/short-form or 16:9 for site/product launch, and tone/visual identity from Brand Kit. State those assumptions briefly in say and set motionJob in the SAME turn with operation create, mode saas-launch, sourceUrl equal to the supplied URL, and a complete brief combining the URL, objective, duration, ratio and Brand Kit evidence. If another registered studio is clearly superior, open it with the same complete brief instead. Preserve the normal explicit credit confirmation before any paid generation.',
    'TARGETED EDITS: if the user asks to change a saved video, scene or timestamp, set visualEdit (and do NOT open a studio). Copy only the requested change into request, identify the affected scene, and include timestampSec when stated. Verger opens the shared Library editor, where manual and agent edits call the same versioned verger-edit-video hook with autosave, undo and expected-version locking. For an existing canonical motion project, use motionJob revise instead.',
    '',
    `LIVE QUEUE (what is currently running for this user): ${queueSummary || 'nothing right now'}.`,
    '',
    'OUTPUT CONTRACT (hard): reply with EXACTLY ONE JSON object, no markdown fences, no text outside it, matching:',
    PLAN_SHAPE,
    '"thinking" is 2–4 short plain sentences explaining the route and known inputs. "say" is what you tell the user this turn (short, warm, director-like — not salesy). "dispatch" is [] when no sub-agents are needed. "done" is true only when the work for this request is fully handed off or finished.',
  ].join('\n');
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new PlannerError('The model reply was not valid JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizePlan(raw: any): VergerPlan {
  const thinking = typeof raw?.thinking === 'string' ? raw.thinking.trim() : '';
  const say = typeof raw?.say === 'string' ? raw.say.trim() : '';
  let askQuestion: VergerQuestion | null = null;
  if (raw?.askQuestion && typeof raw.askQuestion === 'object' && typeof raw.askQuestion.prompt === 'string') {
    const options = (Array.isArray(raw.askQuestion.options) ? raw.askQuestion.options : [])
      .map((o: unknown): VergerQuestionOption | null => {
        if (typeof o === 'string' && o.trim()) return { label: o.trim(), value: o.trim() };
        if (o && typeof o === 'object' && typeof (o as any).label === 'string' && (o as any).label.trim()) {
          return { label: String((o as any).label).trim(), value: String((o as any).value ?? (o as any).label).trim() };
        }
        return null;
      })
      .filter((o: VergerQuestionOption | null): o is VergerQuestionOption => o !== null)
      .slice(0, 4);
    askQuestion = { label: typeof raw.askQuestion.label === 'string' ? raw.askQuestion.label.trim() : '', prompt: raw.askQuestion.prompt.trim(), options, allowOwn: true };
  }
  const dispatch: VergerDispatch[] = Array.isArray(raw?.dispatch)
    ? raw.dispatch
        .filter((d: any) => d && typeof d.task === 'string' && subAgentById(d.agentType))
        .slice(0, 6)
        .map((d: any) => ({ agentType: String(d.agentType), task: String(d.task) }))
    : [];
  let openStudio: VergerOpenStudio | null = null;
  if (raw?.openStudio && typeof raw.openStudio === 'object' && openableAppIds().indexOf(String(raw.openStudio.appId)) >= 0) {
    openStudio = {
      appId: String(raw.openStudio.appId),
      brief: String(raw.openStudio.brief || '').trim(),
      estimatedSeconds: Math.max(0, Math.round(Number(raw.openStudio.estimatedSeconds) || 0)),
    };
    if (!openStudio.brief) openStudio = null;
  }
  let visualEdit: VergerVisualEdit | null = null;
  if (raw?.visualEdit && typeof raw.visualEdit === 'object' && typeof raw.visualEdit.request === 'string') {
    const request = raw.visualEdit.request.trim();
    if (request) {
      const timestamp = raw.visualEdit.timestampSec == null ? null : Number(raw.visualEdit.timestampSec);
      visualEdit = {
        sceneReference: String(raw.visualEdit.sceneReference || 'selected scene'),
        timestampSec: timestamp !== null && Number.isFinite(timestamp) ? Math.max(0, timestamp) : null,
        request,
      };
    }
  }
  let motionJob: VergerMotionJob | null = null;
  if (raw?.motionJob && typeof raw.motionJob === 'object' && typeof raw.motionJob.brief === 'string') {
    const operations = ['create', 'analyze', 'plan', 'generate', 'revise', 'render', 'export'];
    const modes = ['footage-overlay', 'saas-launch', 'explainer', 'brand-film', 'agentic-motion'];
    const aspects = ['16:9', '9:16', '1:1'];
    const operation = operations.includes(String(raw.motionJob.operation)) ? String(raw.motionJob.operation) : 'create';
    const mode = modes.includes(String(raw.motionJob.mode)) ? String(raw.motionJob.mode) : 'agentic-motion';
    const aspectRatio = aspects.includes(String(raw.motionJob.aspectRatio)) ? String(raw.motionJob.aspectRatio) : '16:9';
    const projectId = raw.motionJob.projectId == null ? null : Number(raw.motionJob.projectId);
    motionJob = {
      operation: operation as VergerMotionJob['operation'],
      projectId: Number.isInteger(projectId) && Number(projectId) > 0 ? Number(projectId) : null,
      brief: String(raw.motionJob.brief).trim(),
      mode: mode as VergerMotionJob['mode'],
      aspectRatio: aspectRatio as VergerMotionJob['aspectRatio'],
      durationSeconds: Math.max(1, Math.min(600, Math.round(Number(raw.motionJob.durationSeconds) || 30))),
      estimatedPaidSeconds: Math.max(0, Math.min(600, Math.round(Number(raw.motionJob.estimatedPaidSeconds) || 0))),
      sourceUrl: typeof raw.motionJob.sourceUrl === 'string' && /^https?:\/\//i.test(raw.motionJob.sourceUrl) ? raw.motionJob.sourceUrl : null,
    };
    if (!motionJob.brief || motionJob.aspectRatio === '1:1' && ['render', 'export'].includes(motionJob.operation)) motionJob = null;
  }
  if (!say && !askQuestion && !dispatch.length && !openStudio && !visualEdit && !motionJob) {
    throw new PlannerError('The model returned an empty plan.');
  }
  return { thinking, say, askQuestion, dispatch, openStudio, visualEdit, motionJob, done: raw?.done === true };
}

/**
 * One planner turn. `history` is the running conversation (user turns,
 * Verger says, answered questions, and [sub-agent results] observations).
 */
export async function planTurn(
  history: ChatTurn[],
  queueSummary: string,
  pinnedFacts: string,
  liveContext: string,
  latestSpecialistResults: string,
  signal?: AbortSignal,
): Promise<VergerPlan> {
  const messages: ChatTurn[] = [
    { role: 'system', content: plannerSystemPrompt(queueSummary) },
    { role: 'system', content: `[PINNED FACTS SO FAR — always authoritative]\n${pinnedFacts || 'No facts extracted yet.'}` },
    { role: 'system', content: `[CURRENT BRAND KIT + LIBRARY — latest snapshot only; do not ask for facts present here]\n${liveContext || 'No live context returned.'}` },
    ...(latestSpecialistResults ? [{ role: 'system' as const, content: `[LATEST SPECIALIST RESULTS — latest batch only]\n${latestSpecialistResults}` }] : []),
    ...history.slice(-40),
  ];
  const request: Record<string, unknown> = {
    model: 'gpt-6.1-sol',
    reasoning_effort: 'medium',
    max_completion_tokens: 6000,
    messages,
    response_format: { type: 'json_object' },
    stream: false,
  };
  let text: string;
  try {
    text = await proxyChat(request, signal);
  } catch (error) {
    // Some gateways refuse response_format; the prompt already demands JSON.
    if (error instanceof PlannerError && error.status === 400 && /response_format|unsupported_field/i.test(error.message)) {
      const { response_format: _omit, ...rest } = request as any;
      text = await proxyChat(rest, signal);
    } else {
      throw error;
    }
  }
  try {
    return normalizePlan(extractJson(text));
  } catch {
    // One self-repair pass: show the model its own broken output.
    const repaired = await proxyChat({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
      messages: [
        ...messages,
        { role: 'assistant', content: text },
        { role: 'user', content: `That reply was not one valid JSON object. Re-send ONLY the JSON object matching ${PLAN_SHAPE} — nothing else.` },
      ],
      stream: false,
    }, signal);
    return normalizePlan(extractJson(repaired));
  }
}

// ---------------------------------------------------------- sub-agents ----

export interface SubAgentReport {
  agentType: string;
  name: string;
  task: string;
  ok: boolean;
  /** The specialist's report, or the error message when ok is false. */
  text: string;
}

export async function runSubAgent(type: SubAgentType, task: string, context: string, signal?: AbortSignal): Promise<string> {
  const text = await proxyChat({
    model: 'gpt-6.1-sol',
    reasoning_effort: 'medium',
    max_completion_tokens: 6000,
    messages: [
      { role: 'system', content: `${type.prompt}\n\nCAPABILITY MANIFEST:\n${capabilityManifestText()}` },
      { role: 'user', content: `CONVERSATION SO FAR (condensed):\n${context}\n\nYOUR TASK:\n${task}` },
    ],
    response_format: { type: 'json_object' },
    stream: false,
  }, signal);
  try {
    return JSON.stringify(extractJson(text), null, 2);
  } catch {
    throw new PlannerError(`${type.name} returned invalid JSON. Retry this lane.`);
  }
}

/** Run every dispatch concurrently; failures become ok:false reports instead of throwing. */
export async function runDispatches(
  dispatches: { agentType: string; task: string }[],
  context: string,
  onSettle?: (report: SubAgentReport) => void,
  signal?: AbortSignal,
): Promise<SubAgentReport[]> {
  const jobs = dispatches
    .map((d) => ({ type: subAgentById(d.agentType), task: d.task }))
    .filter((j): j is { type: SubAgentType; task: string } => Boolean(j.type));
  return Promise.all(
    jobs.map(async ({ type, task }) => {
      let report: SubAgentReport;
      try {
        report = { agentType: type.id, name: type.name, task, ok: true, text: await runSubAgent(type, task, context, signal) };
      } catch (error) {
        report = { agentType: type.id, name: type.name, task, ok: false, text: error instanceof Error ? error.message : 'This specialist failed.' };
      }
      if (onSettle) onSettle(report);
      return report;
    }),
  );
}

export function reportsAsContext(reports: SubAgentReport[]): string {
  const body = reports
    .map((r) => `--- ${r.name} (${r.agentType}) ${r.ok ? '' : '[FAILED] '}---\n${r.text}`)
    .join('\n\n');
  return `[sub-agent results]\n${body}\n\nMerge these into your next plan. If one failed, work without it or re-dispatch it once.`;
}

// --------------------------------------------------------------- chips ----

export const FALLBACK_CHIPS = [
  'Make a launch video from my website',
  'Turn my script into a cinematic film',
  'Edit my footage into a sharp short',
];

/** Two example-chip suggestions via the instant tier. Cached by the caller. */
export async function suggestChips(): Promise<string[]> {
  const text = await proxyChat({
    model: 'gpt-6-luna',
    reasoning_effort: 'none',
    max_completion_tokens: 2000,
    messages: [
      {
        role: 'system',
        content:
          'Verger is the main agent of Vidverge: it makes presenter/avatar videos, faceless films, script-to-video films, ads and edits via its studios. Reply with ONLY a JSON array of exactly 3 short first-person example requests a user could tap (each under 9 words, concrete, no emoji, no quotes inside).',
      },
      { role: 'user', content: 'Three fresh example chips.' },
    ],
    stream: false,
  });
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) return FALLBACK_CHIPS;
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const chips = Array.isArray(parsed) ? parsed.filter((c: unknown) => typeof c === 'string' && c.trim()).slice(0, 3) : [];
  return chips.length === 3 ? chips : FALLBACK_CHIPS;
}

export { SUB_AGENT_TYPES };
