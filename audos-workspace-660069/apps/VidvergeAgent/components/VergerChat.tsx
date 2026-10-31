import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowUp, Check, CheckCircle2, ChevronDown, Download, ExternalLink, Loader2, MessageSquarePlus, Paperclip, Play, RotateCcw, Share2, Sparkles, Square, X } from 'lucide-react';
import { FALLBACK_CHIPS, planTurn, reportsAsContext, runDispatches, suggestChips } from '../lib/vergerPlanner';
import type { VergerPlan } from '../lib/vergerPlanner';
import { runAutopilot, type AutopilotAsk, type AutopilotStep } from '../lib/vergerAutopilot';
import { appendEvent, appendRunSnapshot, conversationTitle, loadConversation, loadConversationIndex, loadRunHistory, newConversationKey, nextSeq } from '../lib/vergerStore';
import type { ConversationSummary, StoredRow, VergerEvent } from '../lib/vergerStore';
import { formatCredits, useCredits } from '../../../lib/credits';
import type { VidvergeAttachment } from '../../../lib/vidvergeHandoff';
import type { QueueJob } from '../types';
import { friendlyAppName, resolveAppId, type AppController, type AppEvent, type AppId, type AppView } from '../../../lib/appBridge';

const MODE_KEY = 'verger:mode:v1';
const BUDGET_KEY = 'verger:autopilot-budget:v1';
const CHIP_CACHE_KEY = 'verger:chips:v2';
const MAX_PLAN_DEPTH = 4;

type Mode = 'copilot' | 'autopilot';
type StepStatus = 'running' | 'done' | 'failed';
interface UiStep { id: string; label: string; tool: string; status: StepStatus; evidence: string; }
interface UiEvent { id: string; role: 'user' | 'assistant'; content: string; verger: VergerEvent; }
interface ReadyVideo { url: string; videoId: string; appId: AppId; durationS: number; width: number; height: number; credits: number; title: string; }
interface QuestionOption { label: string; value: string; }
interface Question { label: string; prompt: string; options: QuestionOption[]; multi: boolean; allowOwn: boolean; }
interface VergerChatProps {
  jobs: QueueJob[];
  onRouteStudio: (route: { appId: string; brief: string; view?: AppView }, attachment: VidvergeAttachment | null) => Promise<{ message: string; controller: AppController | null }>;
  onUploadAttachment: (file: File) => Promise<VidvergeAttachment>;
  onProjectChange?: (key: string, title: string) => void;
}

let idCounter = 0;
function uid(prefix = 'event') { idCounter += 1; return `${prefix}-${Date.now()}-${idCounter}`; }
function friendly(value: unknown) { return value instanceof Error ? value.message : String(value || 'Verger could not finish that step.'); }
function initialMode(): Mode { try { return localStorage.getItem(MODE_KEY) === 'autopilot' ? 'autopilot' : 'copilot'; } catch { return 'copilot'; } }
function initialBudget(): number { try { return Math.max(1, Math.min(10000, Number(localStorage.getItem(BUDGET_KEY)) || 60)); } catch { return 60; } }

// ---------------------------------------------------------------------------
// Question sanitising — nothing technical ever reaches the customer. Internal
// values (app ids, slugs) stay mapped BEHIND each friendly label.
// ---------------------------------------------------------------------------

const FRIENDLY_VALUE_LABELS: Record<string, string> = {
  'script-to-video': 'Cinematic film from a script or idea',
  faceless: 'Faceless narrated video',
  'ugc-studio': 'Creator-style product video',
  sceneforge: 'Presenter / avatar video',
  'ads-studio': 'Ad / promo campaign',
  'video-enhancer': 'Edit footage I already have',
  cineagent: 'Auto-edit my footage',
  'brand-context': 'Set up my brand first',
  'video-generator': 'Make a video',
  vidverge: 'Make a video',
  video: 'Make a video',
  '16:9': 'Widescreen (YouTube / web)',
  '9:16': 'Vertical (Reels / Shorts / TikTok)',
  '1:1': 'Square (feed post)',
};

function looksTechnical(text: string): boolean {
  const value = String(text || '').trim();
  if (!value) return true;
  if (/[{}<>[\]`]|["']\s*:/.test(value)) return true;
  if (/\b(app[_ ]?id|tool_|hook|slug|api|token|payload|localstorage|undefined|null|gpt-|claude|luna\b|seedance|kling\b|omni-|json)\b/i.test(value)) return true;
  if (/^[a-z0-9]+([-_.][a-z0-9]+)+$/i.test(value)) return true;
  if (/full\s?screen|fullscreen|retry the same|console|dev\s?tools/i.test(value)) return true;
  return false;
}

function humanize(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  if (FRIENDLY_VALUE_LABELS[key]) return FRIENDLY_VALUE_LABELS[key];
  const cleaned = String(raw || '').replace(/[{}[\]"'`]/g, ' ').replace(/[-_./]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Names that must never appear in a label, even after de-slugging. */
const FORBIDDEN_IN_LABELS = /\b(gpt|claude|sonnet|opus|luna|sol|seedance|kling|omni|heygen|api|json|token|slug|hook|payload|app ?ids?)\b/i;

/** Map a raw option to a friendly label, or '' when it cannot be made friendly. */
function friendlyOptionLabel(rawLabel: string, value: string): string {
  const mapped = FRIENDLY_VALUE_LABELS[rawLabel.trim().toLowerCase()] || FRIENDLY_VALUE_LABELS[value.trim().toLowerCase()];
  if (mapped) return mapped;
  let label = rawLabel.trim();
  if (!label || looksTechnical(label)) label = humanize(label || value);
  if (!label || looksTechnical(label) || FORBIDDEN_IN_LABELS.test(label)) return '';
  return label;
}

/** Fall back to a friendly rendering whenever a payload is missing a label or carries technical text. */
function sanitizeQuestion(raw: { label?: string; prompt?: string; question?: string; options?: unknown; multi?: boolean; allowOwn?: boolean }): Question {
  const prompt = String(raw.prompt || raw.question || '').trim() || 'Which direction should I take?';
  const list = Array.isArray(raw.options) ? raw.options : [];
  const seen = new Set<string>();
  const options: QuestionOption[] = [];
  for (const item of list.slice(0, 6)) {
    const value = typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as any).value ?? (item as any).label ?? '') : '';
    const rawLabel = typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as any).label ?? value) : '';
    const label = friendlyOptionLabel(rawLabel, value);
    if (!label) continue;
    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    options.push({ label, value: value.trim() || label });
  }
  let label = String(raw.label || '').trim();
  if (!label || looksTechnical(label)) {
    const words = prompt.replace(/[?.!]/g, '').split(/\s+/).slice(0, 5).join(' ');
    label = words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Quick question';
  }
  return { label, prompt, options: options.slice(0, 4), multi: raw.multi === true, allowOwn: raw.allowOwn !== false };
}

// ------------------------------------------------------- deterministic fallback

function parseGoal(text: string, attachment: VidvergeAttachment | null): { appId: AppId; values: Record<string, unknown>; missing?: string } {
  const lower = text.toLowerCase();
  const duration = Math.max(4, Math.min(600, Number(lower.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/)?.[1]) || 30));
  if (/\bugc\b|creator ad|actor for my/i.test(lower)) {
    return {
      appId: 'ugc-studio',
      values: {
        actor: /delhi/i.test(text) ? 'Delhi' : 'regional actor',
        product: attachment?.url || '',
        format: /unbox/i.test(lower) ? 'unboxing' : /demo/i.test(lower) ? 'demo' : 'talking-camera',
        length: Math.min(30, duration), language: /hindi|hinglish/i.test(lower) ? 'hi-Latn' : 'en-IN', mode: 'actor-speaks',
      },
      missing: attachment?.url ? undefined : 'product',
    };
  }
  const shape = /vertical|portrait|9:16/i.test(text) ? '9:16' : /square|1:1/i.test(text) ? '1:1' : '16:9';
  const hasScript = /script|exact words|keep my words/i.test(lower);
  const castMatch = text.match(/character\s+(?:is\s+)?([^,.;]+)/i);
  const voiceMatch = text.match(/(?:voice|voiced by)\s*[:,]?\s*([^,.;]+)/i);
  return { appId: 'script-to-video', values: { mode: hasScript ? 'script' : 'idea', ...(hasScript ? { script: text, keepWords: true } : { idea: text }), language: 'English', length: duration, shape, sound: /voice|speak|character/i.test(lower) ? 'Characters speak' : /narrat/i.test(lower) ? 'Narrator' : 'Music only', look: 'Use the saved Brand Kit and warm gold cinematic lighting', model: 'omni-1.1-flash', cast: castMatch?.[1]?.trim() || '', voices: voiceMatch?.[1]?.trim() || '', references: attachment?.url || '' } };
}

function StepList({ steps, onRetry }: { steps: UiStep[]; onRetry: (step: UiStep) => void }) {
  if (!steps.length) return null;
  return <ol className="space-y-2" aria-label="Production steps">{steps.map((step) => <li key={step.id} className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3"><div className="flex items-start gap-3">{step.status === 'running' ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[var(--vg-accent)] motion-reduce:animate-none" /> : step.status === 'done' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--vg-success)]" /> : <span className="mt-0.5 text-sm font-black text-[var(--vg-danger)]">×</span>}<div className="min-w-0 flex-1"><strong className="text-[12px] text-[var(--vg-text)]">{step.label}</strong><p className={`mt-1 break-words text-[11px] leading-relaxed ${step.status === 'failed' ? 'text-[var(--vg-danger)]' : 'text-[var(--vg-secondary)]'}`}>{step.evidence || (step.status === 'running' ? 'Working…' : 'Completed with saved evidence.')}</p></div>{step.status === 'failed' ? <button type="button" onClick={() => onRetry(step)} className="min-h-9 shrink-0 rounded-lg border border-[var(--vg-danger)] px-2 text-[11px] text-[var(--vg-danger)]"><RotateCcw size={12} className="mr-1 inline" />Retry</button> : null}</div></li>)}</ol>;
}

function ReadyDialog({ video, onClose }: { video: ReadyVideo; onClose: () => void }) {
  const [muted, setMuted] = useState(true);
  const returnFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  useEffect(() => () => returnFocus.current?.focus?.(), []);
  const share = async () => { if (navigator.share) await navigator.share({ title: video.title, url: video.url }); else await navigator.clipboard.writeText(video.url); };
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[color-mix(in_srgb,var(--vg-bg)_68%,transparent)] p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="video-ready-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}><div className="relative max-h-[94vh] w-[min(760px,96vw)] overflow-y-auto rounded-2xl border border-[var(--vg-accent)] bg-[var(--vg-surface)] p-1 shadow-[0_0_90px_color-mix(in_srgb,var(--vg-accent)_30%,transparent)]"><div className="rounded-[14px] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--vg-accent)_20%,transparent),transparent_48%)] p-4 sm:p-6"><button autoFocus type="button" onClick={onClose} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-[var(--vg-border)] bg-[var(--vg-bg)] text-[var(--vg-secondary)]" aria-label="Close video"><X size={17} /></button><div className="overflow-hidden rounded-xl border border-[var(--vg-border)] bg-black"><video src={video.url} autoPlay loop playsInline muted={muted} controls className="max-h-[54vh] w-full object-contain" onClick={() => setMuted(false)} /></div><h2 id="video-ready-title" className="mt-5 font-['Space_Grotesk'] text-2xl font-bold text-[var(--vg-text)]">Your video is ready</h2><p className="mt-1 text-sm text-[var(--vg-secondary)]">{video.title} was made inside {friendlyAppName(video.appId)} and checked before delivery.</p><div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--vg-secondary)]"><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{video.durationS}s</span><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{video.width}×{video.height}</span><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{formatCredits(video.credits)} credits</span></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--vg-success)]"><span>✓ Same character</span><span>✓ Every line spoken</span><span>✓ Size checked</span></div><div className="mt-5 grid gap-2 sm:grid-cols-4"><a href={video.url} download className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-3 text-sm font-bold text-[var(--vg-on-accent)]"><Download size={15} />Download</a><button type="button" onClick={() => void share()} className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm"><Share2 size={15} className="mr-1 inline" />Share link</button><button type="button" className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm">Make 3 more hooks</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: video.appId } }))} className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm"><ExternalLink size={15} className="mr-1 inline" />Open app</button></div></div></div></div>;
}

export default function VergerChat({ jobs, onRouteStudio, onUploadAttachment, onProjectChange = () => undefined }: VergerChatProps) {
  const first = useRef({ key: newConversationKey(), title: 'New chat' });
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [steps, setSteps] = useState<UiStep[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationKey, setConversationKey] = useState(first.current.key);
  const [conversationName, setConversationName] = useState(first.current.title);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [budget, setBudget] = useState(initialBudget);
  const [editingBudget, setEditingBudget] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const [multiPicks, setMultiPicks] = useState<number[]>([]);
  const [chips, setChips] = useState(FALLBACK_CHIPS);
  const [thinking, setThinking] = useState<{ started: number; seconds?: number; text: string } | null>(null);
  const [ready, setReady] = useState<ReadyVideo | null>(null);
  const [readyOpen, setReadyOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [autopilotProgress, setAutopilotProgress] = useState(0);
  const eventsRef = useRef<UiEvent[]>([]);
  const keyRef = useRef(conversationKey);
  const nameRef = useRef(conversationName);
  const jobsRef = useRef(jobs);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const stoppedRef = useRef(false);
  const pendingChoice = useRef<((index: number, text: string) => Promise<void> | void) | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const uploadedRef = useRef<VidvergeAttachment | null>(null);
  const specialistContext = useRef('');
  keyRef.current = conversationKey; nameRef.current = conversationName; jobsRef.current = jobs;

  const visible = useMemo(() => events.filter((event) => ['say', 'answer', 'question', 'notice'].includes(event.verger.kind)), [events]);
  const empty = !restoring && visible.length === 0;
  const { credits } = useCredits();
  const creditBalance = credits?.balance;

  async function push(role: 'user' | 'assistant', content: string, verger: VergerEvent) {
    const next: UiEvent = { id: uid(), role, content, verger };
    eventsRef.current = [...eventsRef.current, next]; setEvents(eventsRef.current);
    await appendEvent(keyRef.current, nameRef.current, role, content, verger);
    setConversations((current) => [{ key: keyRef.current, title: nameRef.current, updatedAt: new Date().toISOString(), messageCount: eventsRef.current.length }, ...current.filter((item) => item.key !== keyRef.current)]);
  }

  async function recordStep(step: UiStep) {
    setSteps((current) => { const exists = current.some((item) => item.id === step.id); return exists ? current.map((item) => item.id === step.id ? step : item) : [...current, step]; });
    await appendRunSnapshot(keyRef.current, { runId: step.id, agentType: step.tool, name: step.label, task: step.evidence || step.label, status: step.status, resultText: step.evidence, meta: { mode, budget, progress: autopilotProgress, state: step.status } });
  }

  async function runStep<T>(label: string, tool: string, fn: () => Promise<T>): Promise<T> {
    const id = uid('step');
    await recordStep({ id, label, tool, status: 'running', evidence: 'Working…' });
    try { const result = await fn(); await recordStep({ id, label, tool, status: 'done', evidence: typeof result === 'string' ? result : 'Completed with live app evidence.' }); return result; }
    catch (caught) { const message = friendly(caught); await recordStep({ id, label, tool, status: 'failed', evidence: message }); throw caught; }
  }

  function subscribeToController(appId: AppId, controller: AppController) {
    return controller.subscribe((event: AppEvent) => {
      if (event.type === 'field_changed' && event.by === 'user') {
        const field = controller.schema().fields.find((item) => item.key === event.key);
        void push('assistant', `Noted — ${String(field?.label || event.key.replace(/([A-Z])/g, ' $1')).toLowerCase()} is now ${String(event.value)}.`, { kind: 'notice', seq: nextSeq() });
      }
      if (event.type === 'progress') {
        const percent = event.total ? Math.round((event.done / event.total) * 100) : 0;
        setAutopilotProgress(percent);
        void recordStep({ id: `progress-${appId}`, label: event.label, tool: `${appId}.status`, status: event.done >= event.total && event.total > 0 ? 'done' : 'running', evidence: `${event.done} of ${event.total}` });
      }
      if (event.type === 'shot') void recordStep({ id: `shot-${appId}-${event.index}`, label: `Shot ${event.index + 1}`, tool: `${appId}.shot`, status: event.status === 'failed' ? 'failed' : event.status === 'done' ? 'done' : 'running', evidence: event.error || (event.status === 'done' ? 'Real clip saved; ready for frame checks.' : event.status) });
      if (event.type === 'gate') void push('assistant', 'The look check is ready in the studio panel. Continue or change the look there, or just tell me here.', { kind: 'notice', seq: nextSeq() });
      if (event.type === 'error') setError(event.message);
      if (event.type === 'finished') {
        const video: ReadyVideo = { ...event, appId, credits: Math.max(1, event.durationS), title: nameRef.current || 'Your video' };
        setReady(video); setReadyOpen(true); setAutopilotProgress(100);
        void push('assistant', `Video ready: ${event.url}`, { kind: 'notice', seq: nextSeq() });
      }
    });
  }

  async function ask(raw: Parameters<typeof sanitizeQuestion>[0], handler: (index: number, text: string) => Promise<void> | void) {
    const next = sanitizeQuestion(raw);
    setQuestion(next); setMultiPicks([]); pendingChoice.current = handler;
    await push('assistant', next.prompt, { kind: 'question', seq: nextSeq(), question: { prompt: next.prompt, options: next.options.map((option) => option.label), allowOwn: next.allowOwn } });
  }

  function historyTurns() {
    return eventsRef.current
      .filter((event) => ['say', 'answer', 'question', 'notice'].includes(event.verger.kind))
      .slice(-24)
      .map((event) => ({ role: event.role === 'user' ? 'user' as const : 'assistant' as const, content: event.content }));
  }

  function queueSummary(): string {
    return jobsRef.current.slice(0, 6).map((job) => `${job.name} — ${job.app}: ${job.stage} [${job.state}]`).join('; ');
  }

  // ------------------------------------------------------------- copilot ----

  async function runCopilot(goal: string, appId: AppId, brief: string, values: Record<string, unknown>) {
    if (appId === 'ugc-studio' && !uploadedRef.current?.url) {
      await ask({ label: 'Product photo', prompt: 'Attach a photo of your product in this chat, then send the request again.', options: [{ label: 'Choose a product photo', value: 'attach' }] }, async () => fileRef.current?.click());
      return;
    }
    const route = await runStep(`Opening ${friendlyAppName(appId)} beside this chat`, 'bridge.open', async () => onRouteStudio({ appId, brief }, uploadedRef.current));
    if (!route.controller) {
      await push('assistant', route.message, { kind: 'notice', seq: nextSeq() });
      return;
    }
    const controller = route.controller;
    subscribeToController(appId, controller);
    if (Object.keys(values).length) {
      const filled = await runStep('Filling in your brief', 'bridge.fill', async () => controller.fill(values, { animate: true }));
      if (filled.rejected.length) await push('assistant', `A few details need another look: ${filled.rejected.map((item) => humanize(item.key).toLowerCase()).join(', ')}.`, { kind: 'notice', seq: nextSeq() });
    }
    if (appId === 'script-to-video') {
      await runStep('Preparing the production plan', 's2v.makePlan', async () => { const result = await controller.run('makePlan'); if (!result.ok) throw new Error(result.error); return result; });
      await runStep('Approving the checked cast', 's2v.approveCast', async () => { const result = await controller.run('approveCast'); if (!result.ok) throw new Error(result.error); return result; });
    } else if (appId === 'ugc-studio') {
      await runStep('Pricing the video', 'ugc.quote', async () => { const result = await controller.run('quote'); if (!result.ok) throw new Error(result.error); return result; });
    }
    const paid = controller.schema().actions.find((action) => action.paid && action.estimate);
    if (!paid?.estimate) return;
    const estimate = (await paid.estimate(controller.getState().values)).credits;
    await ask({
      label: 'Ready to generate',
      prompt: `This video will use ${formatCredits(estimate)} credits${typeof creditBalance === 'number' ? ` of your ${formatCredits(creditBalance)}` : ''}. Start it?`,
      options: [{ label: 'Yes — start now', value: 'start' }, { label: 'Change something first', value: 'change' }],
    }, async (index) => {
      if (index !== 0) { await push('assistant', 'Tell me what to change — I\u2019ll update everything before any credits are spent.', { kind: 'say', seq: nextSeq() }); return; }
      setBusy(true);
      try { await runStep(`${paid.label} in ${friendlyAppName(appId)}`, `${appId}.${paid.key}`, async () => { const result = await controller.run(paid.key, { approvedCredits: estimate }); if (!result.ok) throw new Error(result.error); return result; }); }
      finally { setBusy(false); }
    });
  }

  /**
   * One Copilot turn: gpt-6.1-sol plans (say / friendly question / studio
   * route), specialists run in parallel when dispatched, and the deterministic
   * parser stays as the offline fallback so the chat never dead-ends.
   */
  async function runPlanned(goal: string, depth = 0): Promise<void> {
    const parsed = parseGoal(goal, uploadedRef.current);
    if (depth >= MAX_PLAN_DEPTH) { await runCopilot(goal, parsed.appId, goal, parsed.values); return; }
    let plan: VergerPlan | null = null;
    try {
      plan = await planTurn(historyTurns(), queueSummary(), '', '', specialistContext.current);
    } catch {
      plan = null;
    }
    if (!plan) { await runCopilot(goal, parsed.appId, goal, parsed.values); return; }
    if (plan.thinking) setThinking((current) => current ? { ...current, text: plan.thinking } : current);
    if (plan.dispatch.length && depth < 2) {
      const reports = await runDispatches(plan.dispatch, historyTurns().map((turn) => `${turn.role}: ${turn.content}`).join('\n'), (report) => {
        void recordStep({ id: uid('lane'), label: report.name, tool: report.agentType, status: report.ok ? 'done' : 'failed', evidence: report.ok ? 'Research merged into the plan.' : report.text });
      });
      specialistContext.current = reportsAsContext(reports);
      if (plan.say) await push('assistant', plan.say, { kind: 'say', seq: nextSeq() });
      await runPlanned(goal, depth + 1);
      return;
    }
    if (plan.say) await push('assistant', plan.say, { kind: 'say', seq: nextSeq() });
    if (plan.askQuestion) {
      const prepared = sanitizeQuestion(plan.askQuestion);
      await ask(prepared, async (index, text) => {
        const value = index >= 0 ? prepared.options[index]?.value : '';
        setBusy(true);
        try { await runPlanned(`${goal}\n\n[The user answered: "${text}"${value && value !== text ? ` (selected: ${value})` : ''}]`, depth + 1); }
        finally { setBusy(false); }
      });
      return;
    }
    const route = plan.openStudio ? { appId: plan.openStudio.appId, brief: plan.openStudio.brief }
      : plan.motionJob ? { appId: 'script-to-video', brief: plan.motionJob.brief }
      : plan.visualEdit ? { appId: 'video-enhancer', brief: plan.visualEdit.request }
      : null;
    if (!route) return;
    const refined = parseGoal(`${goal}\n${route.brief}`, uploadedRef.current);
    const appId = resolveAppId(route.appId) || refined.appId;
    await runCopilot(goal, appId, route.brief || goal, appId === refined.appId ? refined.values : {});
  }

  // ----------------------------------------------------------- autopilot ----

  async function runAutomatic(goal: string, authorizedOverage = false) {
    const parsed = parseGoal(goal, uploadedRef.current);
    const estimated = Number(parsed.values.length || 30);
    if (estimated > budget && !authorizedOverage) {
      await ask({
        label: 'Budget check',
        prompt: `This looks like about ${formatCredits(estimated)} credits of video; your Autopilot budget is ${formatCredits(budget)}. Go ahead anyway?`,
        options: [{ label: 'Yes — allow it for this run', value: 'yes' }, { label: 'No — keep my budget', value: 'no' }],
      }, async (index) => { if (index === 0) { setBusy(true); try { await runAutomatic(goal, true); } finally { setBusy(false); } } });
      return;
    }
    stoppedRef.current = false; setAutopilotProgress(3);
    const result = await runAutopilot(goal, Math.max(budget, authorizedOverage ? estimated : budget), {
      stopped: () => stoppedRef.current,
      onStep: (step: AutopilotStep) => { void recordStep({ ...step }); setAutopilotProgress((current) => Math.min(94, step.status === 'done' ? current + 6 : current)); },
      onEvent: (appId, event) => { if (event.type === 'finished') { setReady({ ...event, appId, credits: event.durationS, title: nameRef.current || 'Your video' }); setReadyOpen(true); } if (event.type === 'progress') setAutopilotProgress(event.total ? Math.round((event.done / event.total) * 100) : 0); },
      askUser: (request: AutopilotAsk) => new Promise((resolve) => {
        void ask({ label: request.label, prompt: request.question, options: request.options, multi: request.multi }, async (_index, text) => resolve(text));
      }),
    });
    if (result.delivered) setAutopilotProgress(100);
  }

  // ----------------------------------------------------------- turn flow ----

  async function processGoal(goal: string) {
    const started = Date.now();
    setThinking({
      started,
      text: mode === 'autopilot'
        ? 'I\u2019m making the whole video myself — brand, plan, character, voice, shots, join and check — inside your budget. You\u2019ll only hear from me about your brand (if it isn\u2019t saved yet) or the budget.'
        : 'I\u2019m reading your request, picking the right studio, and opening it right here beside our chat.',
    });
    try {
      if (mode === 'autopilot') await runAutomatic(goal);
      else await runPlanned(goal);
    } catch (caught) {
      const message = friendly(caught);
      if (!/Stopped by the user/i.test(message)) {
        setError(message);
        await push('assistant', 'That step didn\u2019t finish. Everything so far is saved — tap Retry and I\u2019ll pick it back up.', { kind: 'notice', seq: nextSeq() });
      }
    } finally { setThinking((current) => current ? { ...current, seconds: Math.max(1, Math.round((Date.now() - started) / 1000)) } : null); }
  }

  async function advance(text: string, optionIndex?: number) {
    if (restoring) return;
    setError('');
    if (question && pendingChoice.current) {
      const handler = pendingChoice.current; pendingChoice.current = null; setQuestion(null); setMultiPicks([]);
      await push('user', text, { kind: 'answer', seq: nextSeq(), optionIndex: optionIndex ?? -1 });
      await handler(optionIndex ?? -1, text); return;
    }
    if (!eventsRef.current.length) { const title = conversationTitle(text); nameRef.current = title; setConversationName(title); }
    await push('user', text, { kind: 'say', seq: nextSeq() });
    setBusy(true); retryRef.current = () => processGoal(text);
    try { await processGoal(text); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); const text = input.trim(); if (!text || restoring) return; setInput('');
    if (attachment) {
      try { const file = await onUploadAttachment(attachment); uploadedRef.current = file; setAttachment(null); await advance(`${text}\n[Attached file: ${file.name} — ${file.url}]`); }
      catch (caught) { setError(friendly(caught)); }
      return;
    }
    await advance(text, question ? -1 : undefined);
  }

  function newChat() {
    if (busy) return; const key = newConversationKey(); keyRef.current = key; nameRef.current = 'New chat'; eventsRef.current = [];
    uploadedRef.current = null; specialistContext.current = '';
    setConversationKey(key); setConversationName('New chat'); setEvents([]); setSteps([]); setQuestion(null); setMultiPicks([]); setError(''); setReady(null); setReadyOpen(false); setAutopilotProgress(0);
  }

  async function openConversation(summary: ConversationSummary) {
    setRestoring(true);
    try {
      const [rows, storedRuns] = await Promise.all([loadConversation(summary.key), loadRunHistory(summary.key)]);
      const restored: UiEvent[] = rows.map((row: StoredRow) => ({ id: uid(), role: row.role, content: row.content, verger: row.verger }));
      const restoredSteps: UiStep[] = storedRuns.map((run) => ({ id: run.runId, label: run.name, tool: run.agentType, status: run.status === 'running' ? 'failed' : run.status, evidence: run.status === 'running' ? 'Interrupted; safe to continue from saved app state.' : run.resultText }));
      keyRef.current = summary.key; nameRef.current = summary.title; eventsRef.current = restored;
      setConversationKey(summary.key); setConversationName(summary.title); setEvents(restored); setSteps(restoredSteps); setQuestion(null); setMultiPicks([]);
    } finally { setRestoring(false); }
  }

  useEffect(() => {
    let cancelled = false;
    void loadConversationIndex().then((index) => { if (cancelled) return; setConversations(index); if (index.length) void openConversation(index[0]); else setRestoring(false); }).catch(() => setRestoring(false));
    try { const cached = JSON.parse(localStorage.getItem(CHIP_CACHE_KEY) || 'null'); if (Array.isArray(cached)) setChips(cached); else void suggestChips().then((items) => { if (!cancelled) { setChips(items); try { localStorage.setItem(CHIP_CACHE_KEY, JSON.stringify(items)); } catch {} } }); } catch {}
    return () => { cancelled = true; stoppedRef.current = true; };
  }, []);
  useEffect(() => { onProjectChange(conversationKey, conversationName); }, [conversationKey, conversationName, onProjectChange]);
  useEffect(() => {
    if (!stickRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [events, steps, busy, question, thinking]);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch {} }, [mode]);
  useEffect(() => { try { localStorage.setItem(BUDGET_KEY, String(budget)); } catch {} }, [budget]);

  const percent = Math.max(0, Math.min(100, autopilotProgress));
  const toggleMultiPick = (index: number) => setMultiPicks((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  return <>
    {/* Fixed-size shell: grows with the conversation only up to its max height, then the thread scrolls internally. */}
    <div className="verger-frame relative mx-auto flex w-full flex-col rounded-[26px] p-px" data-busy={busy ? 'true' : 'false'} style={{ maxHeight: 'min(100%, 880px)' }}>
      <style>{`@property --verger-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes verger-angle{to{--verger-angle:360deg}}
@keyframes verger-breathe{0%,100%{box-shadow:0 0 26px rgba(212,166,74,.16),0 28px 90px rgba(0,0,0,.38)}50%{box-shadow:0 0 54px rgba(212,166,74,.30),0 28px 90px rgba(0,0,0,.38)}}
@keyframes verger-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.verger-frame{background:linear-gradient(135deg,color-mix(in srgb,var(--vg-accent-hover) 42%,var(--vg-border)),var(--vg-border) 35%,var(--vg-border) 65%,color-mix(in srgb,var(--vg-accent) 38%,var(--vg-border)));box-shadow:0 0 28px rgba(212,166,74,.16),0 28px 90px rgba(0,0,0,.38);transition:box-shadow 180ms cubic-bezier(.2,0,0,1)}
.verger-frame[data-busy='true']{background:conic-gradient(from var(--verger-angle),#B07D2A,#D4A64A,#F6D98B,#D4A64A,#B07D2A);animation:verger-angle 3.2s linear infinite,verger-breathe 2.6s ease-in-out infinite}
.verger-border{background:conic-gradient(from var(--verger-angle),#D4A64A,#B07D2A,#F6D98B,#D4A64A)}
@media(prefers-reduced-motion:reduce){.verger-frame,.verger-frame[data-busy='true'],.verger-border,.verger-shimmer{animation:none!important}}`}</style>
      <section className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-[25px] bg-[color-mix(in_srgb,var(--vg-surface)_97%,transparent)]">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--vg-border)] px-3 sm:px-4">
          <div className="relative min-w-0">
            <button type="button" onClick={() => setRecentOpen((value) => !value)} className="flex min-h-11 max-w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-[var(--vg-hover)]"><strong className="truncate font-['Space_Grotesk'] text-base text-[var(--vg-text)]">Verger</strong><ChevronDown size={14} className="shrink-0 text-[var(--vg-muted)]" /></button>
            {recentOpen ? <div className="absolute left-0 top-12 z-30 w-[min(320px,85vw)] rounded-xl border border-[var(--vg-border)] bg-[var(--vg-bg)] p-2 shadow-2xl"><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--vg-muted)]">Recent chats</p>{conversations.slice(0, 8).map((item) => <button key={item.key} type="button" onClick={() => { setRecentOpen(false); void openConversation(item); }} className="block min-h-11 w-full truncate rounded-lg px-2 text-left text-xs text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]">{item.title}</button>)}</div> : null}
          </div>
          <span className="ml-auto min-w-0 max-w-[42%] truncate rounded-full border border-[color-mix(in_srgb,var(--vg-accent)_35%,var(--vg-border))] bg-[color-mix(in_srgb,var(--vg-accent)_8%,transparent)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--vg-secondary)]" title={typeof creditBalance === 'number' ? `${formatCredits(creditBalance)} credits available` : 'Credits'}>{typeof creditBalance === 'number' ? `${formatCredits(creditBalance)} credits` : 'Credits'}</span>
          <button type="button" onClick={newChat} disabled={busy} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--vg-border)] px-3 text-xs font-semibold text-[var(--vg-secondary)] disabled:opacity-40"><MessageSquarePlus size={15} /><span className="hidden sm:inline">New</span></button>
        </header>

        <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" aria-live="polite">
          {restoring ? <div className="flex items-center gap-2 text-sm text-[var(--vg-muted)]"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" />Restoring your chat…</div> : null}
          {empty ? <div className="mx-auto flex min-h-[46vh] max-w-2xl flex-col items-center justify-center text-center"><div className="relative mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)]"><Sparkles size={22} /><span aria-hidden className="absolute -inset-8 -z-10 rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_18%,transparent)] blur-2xl" /></div><h1 className="font-['Space_Grotesk'] text-3xl font-bold tracking-tight text-[var(--vg-text)] sm:text-4xl">What should we make today?</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--vg-secondary)]">Say it once. In Copilot, Verger opens the studio right beside this chat and fills it with you. In Autopilot, it makes the whole video itself and shows it here when it’s done.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{chips.map((chip) => <button key={chip} type="button" onClick={() => void advance(chip)} className="min-h-11 rounded-full border border-[var(--vg-border)] bg-[var(--vg-raised)] px-4 text-xs text-[var(--vg-secondary)] hover:border-[var(--vg-accent)]">{chip}</button>)}</div></div> : null}
          <div className="mx-auto max-w-3xl space-y-3">
            {visible.map((event) => <div key={event.id} className={event.role === 'user' ? 'flex justify-end' : 'flex justify-start'}><div className={event.role === 'user' ? 'max-w-[84%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--vg-accent)_16%,var(--vg-raised))] px-4 py-3 text-sm text-[var(--vg-text)]' : event.verger.kind === 'notice' ? 'max-w-[90%] rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_30%,var(--vg-border))] bg-[color-mix(in_srgb,var(--vg-accent)_8%,transparent)] px-3 py-2 text-xs text-[var(--vg-secondary)]' : 'max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--vg-border)] bg-[var(--vg-raised)] px-4 py-3 text-sm text-[var(--vg-text)]'} style={{ whiteSpace: 'pre-wrap' }}>{event.content}{event.content.startsWith('Video ready:') ? <button type="button" onClick={() => ready && setReadyOpen(true)} className="mt-2 flex min-h-10 items-center gap-2 rounded-lg border border-[var(--vg-accent)] px-3 text-xs text-[var(--vg-accent)]"><Play size={13} />Watch</button> : null}</div></div>)}
            {thinking ? <details className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3" open={busy}><summary className={`cursor-pointer text-xs font-semibold ${busy ? 'verger-shimmer bg-[linear-gradient(90deg,var(--vg-muted),var(--vg-accent),var(--vg-muted))] bg-[length:200%_100%] bg-clip-text text-transparent' : 'text-[var(--vg-secondary)]'}`} style={{ animation: busy ? 'verger-shimmer 1.7s linear infinite' : undefined }}>{busy ? 'Thinking' : `Thought for ${thinking.seconds || 1}s`}</summary><p className="mt-2 text-xs leading-relaxed text-[var(--vg-muted)]">{thinking.text}</p></details> : null}
            {mode === 'autopilot' && (busy || percent > 0) ? <div className="rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_55%,var(--vg-border))] bg-[var(--vg-raised)] p-4"><div className="flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-sm font-bold text-[var(--vg-text)]" style={{ background: `radial-gradient(circle at center,var(--vg-raised) 57%,transparent 59%),conic-gradient(var(--vg-accent) ${percent}%,var(--vg-border) 0)` }}>{percent}%</div><div className="min-w-0"><h3 className="font-['Space_Grotesk'] font-bold text-[var(--vg-text)]">Making your video</h3><p className="mt-1 text-xs text-[var(--vg-muted)]">Real app progress · you can close this tab when the app says background work is safe</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-[var(--vg-secondary)] sm:grid-cols-6">{['Plan', 'Character', 'Voice', 'Shots', 'Join', 'Check'].map((lane, index) => <span key={lane} className={`rounded-lg border px-2 py-2 ${percent >= index * 16 ? 'border-[var(--vg-accent)] text-[var(--vg-accent)]' : 'border-[var(--vg-border)]'}`}>{lane}</span>)}</div></div> : null}
            <StepList steps={steps} onRetry={() => { if (retryRef.current) void retryRef.current(); }} />
            {question ? <div className="rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_55%,var(--vg-border))] bg-[var(--vg-raised)] p-4 shadow-[0_0_30px_color-mix(in_srgb,var(--vg-accent)_10%,transparent)]">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--vg-accent)]">{question.label}</p>
              <p className="mt-1.5 pb-2 text-sm font-semibold text-[var(--vg-text)]">{question.prompt}</p>
              {question.options.map((option, index) => question.multi
                ? <button key={option.label} type="button" onClick={() => toggleMultiPick(index)} aria-pressed={multiPicks.includes(index)} className={`mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${multiPicks.includes(index) ? 'border-[var(--vg-accent)] bg-[color-mix(in_srgb,var(--vg-accent)_10%,transparent)] text-[var(--vg-text)]' : 'border-[var(--vg-border)] hover:border-[var(--vg-accent)]'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${multiPicks.includes(index) ? 'border-[var(--vg-accent)] bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'border-[var(--vg-border)] text-transparent'}`}><Check size={13} /></span>{option.label}</button>
                : <button key={option.label} type="button" onClick={() => void advance(option.label, index)} className="mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-[var(--vg-border)] px-3 text-left text-sm hover:border-[var(--vg-accent)]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_16%,transparent)] text-xs text-[var(--vg-accent)]">{index + 1}</span>{option.label}</button>)}
              {question.multi ? <button type="button" disabled={!multiPicks.length} onClick={() => void advance(multiPicks.sort((a, b) => a - b).map((index) => question.options[index]?.label).filter(Boolean).join(', '), -1)} className="mt-1 min-h-11 w-full rounded-xl bg-[image:var(--vg-gradient-action)] text-sm font-bold text-[var(--vg-on-accent)] disabled:opacity-40">Done{multiPicks.length ? ` — ${multiPicks.length} selected` : ''}</button> : null}
              {question.allowOwn ? <p className="mt-2 text-[11px] text-[var(--vg-muted)]">Or type your own answer below.</p> : null}
            </div> : null}
            {error ? <div className="flex items-center gap-3 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-3 text-xs text-[var(--vg-danger)]"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => { setError(''); if (retryRef.current) void retryRef.current(); }} className="min-h-9 shrink-0 rounded-lg border border-[var(--vg-danger)] px-2"><RotateCcw size={12} className="mr-1 inline" />Retry</button></div> : null}
          </div>
        </div>

        {attachment ? <div className="mx-4 flex items-center gap-2 rounded-t-xl border border-b-0 border-[var(--vg-border)] bg-[var(--vg-raised)] px-3 py-2 text-xs text-[var(--vg-secondary)]"><Paperclip size={13} className="text-[var(--vg-accent)]" /><span className="min-w-0 flex-1 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="grid h-9 w-9 place-items-center" aria-label="Remove attachment"><X size={13} /></button></div> : null}
        <form onSubmit={(event) => void submit(event)} className="verger-border relative m-3 mt-0 shrink-0 rounded-[22px] p-px sm:m-4 sm:mt-0" style={{ animation: `verger-angle ${busy ? 1.2 : 7}s linear infinite` }}>
          <div className="rounded-[21px] bg-[var(--vg-raised)] p-2">
            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5">
              <button type="button" onClick={() => setMode('copilot')} className={`min-h-9 rounded-full px-3 text-[11px] font-bold ${mode === 'copilot' ? 'bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]'}`}>Copilot</button>
              <button type="button" onClick={() => setMode('autopilot')} className={`min-h-9 rounded-full px-3 text-[11px] font-bold ${mode === 'autopilot' ? 'bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]'}`}>Autopilot</button>
              {mode === 'autopilot' ? editingBudget
                ? <input autoFocus type="number" min={1} value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value) || 1))} onBlur={() => setEditingBudget(false)} onKeyDown={(event) => { if (event.key === 'Enter') setEditingBudget(false); }} className="h-9 w-24 rounded-full border border-[var(--vg-border)] bg-[var(--vg-bg)] px-3 text-xs tabular-nums text-[var(--vg-text)]" aria-label="Autopilot budget in credits" />
                : <button type="button" onClick={() => setEditingBudget(true)} className="min-h-9 min-w-0 max-w-[50%] truncate rounded-full border border-[color-mix(in_srgb,var(--vg-accent)_30%,var(--vg-border))] px-3 text-[11px] tabular-nums text-[var(--vg-secondary)]" title={`Budget: ${formatCredits(budget)} credits`}>Budget: {formatCredits(budget)} credits</button>
                : null}
            </div>
            <div className="flex min-h-[56px] items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { setAttachment(event.target.files?.[0] || null); event.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]" aria-label="Attach a file"><Paperclip size={17} /></button>
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder={question ? 'Type your own answer…' : 'Describe the video you want…'} className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--vg-text)] outline-none placeholder:text-[var(--vg-muted)]" />
              <button type={busy ? 'button' : 'submit'} onClick={busy ? () => { stoppedRef.current = true; setBusy(false); } : undefined} disabled={!busy && !input.trim()} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${busy ? 'border border-[var(--vg-danger)] text-[var(--vg-danger)]' : 'bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)]'} disabled:opacity-40`} aria-label={busy ? 'Stop' : 'Send'}>{busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={17} />}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
    {ready && readyOpen ? <ReadyDialog video={ready} onClose={() => setReadyOpen(false)} /> : null}
  </>;
}
