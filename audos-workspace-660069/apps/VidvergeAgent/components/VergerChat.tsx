import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, Clapperboard, Coins, Download, ExternalLink, LayoutGrid, Loader2, MessageSquarePlus, Mic, Palette, Paperclip, Play, RotateCcw, Search, Share2, SlidersHorizontal, Sparkles, Square, X } from 'lucide-react';
import { FALLBACK_CHIPS, planTurn, reportsAsContext, runDispatches, suggestChips } from '../lib/vergerPlanner';
import type { VergerPlan } from '../lib/vergerPlanner';
import { canRetryAutopilotStep, retryAutopilotStep, runAutopilot, type AutopilotAsk, type AutopilotStep } from '../lib/vergerAutopilot';
import { appendEvent, appendRunSnapshot, conversationTitle, loadConversation, loadConversationIndex, loadRunHistory, newConversationKey, nextSeq } from '../lib/vergerStore';
import type { ConversationSummary, StoredRow, VergerEvent } from '../lib/vergerStore';
import { formatCreditBalance, formatCredits, useCredits } from '../../../lib/credits';
import { consumeVergerPrefill, type VidvergeAttachment } from '../../../lib/vidvergeHandoff';
import type { QueueJob } from '../types';
import { friendlyAppName, resolveAppId, type AppController, type AppEvent, type AppId, type AppView } from '../../../lib/appBridge';
import {
  analyzeResearchItem,
  buildOriginalUgcRecreation,
  researchReference,
  researchTopic,
  type CreativeBreakdown,
  type ReferenceResearch,
  type ResearchItem,
  type ResearchPlatform,
  type ResearchTopic,
  type UgcRecreation,
} from '../../../lib/researchLibrary';
import VergerResearchPanel from './VergerResearchPanel';
import { MODE_HELPER, OptionThumb, questionPreview } from './optionPreviews';
import { confirmDefaultSavedBrand, currentBrandDocument, withBrandValues } from '../../../lib/brandDoc';
import { getDefaultBrand } from '../../../components/brandKitStore';
import { PLAYBOOK_SUMMARY, routeRequest, type RoutingCorrection, type RoutingDecision } from '../lib/routing/playbook';
import { clearRoutingHistory, loadRecentRoutingCorrections, logRoutingCorrection, logRoutingDecision, logRoutingOutcome } from '../lib/routing/memory';

const MODE_KEY = 'verger:mode:v1';
const BUDGET_KEY = 'verger:autopilot-budget:v1';
const CHIP_CACHE_KEY = 'verger:chips:v2';
const MAX_PLAN_DEPTH = 4;

type Mode = 'copilot' | 'autopilot';
type StepStatus = 'running' | 'done' | 'failed';
interface UiStep { id: string; label: string; tool: string; status: StepStatus; evidence: string; repeat?: number; }
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
function visibleVergerError(value: string): string {
  const message = String(value || '').trim();
  if (!message || /into a production script and accept it\.?$/i.test(message)) return '';
  if (/No .* event arrived before the wait ended/i.test(message)) return 'No new production update arrived yet. Your project is saved; retry the check.';
  if (/model.*not currently available|not configured/i.test(message)) return 'That model is unavailable. Verger will use Omni Flash instead.';
  if (/make the plan first/i.test(message)) return 'The production plan needs to be created before this step can continue.';
  if (/^\s*[{[]/.test(message)) return 'That step returned technical details instead of a usable update. Your project is saved; retry the step.';
  return message;
}

function friendlyStepCard(step: UiStep): UiStep {
  const tool = String(step.tool || '').toLowerCase();
  const raw = String(step.evidence || '').trim();
  const label = tool === 'read_brand_kit' ? 'Reading your Brand doc'
    : tool === 'open_app' ? 'Opening the production studio'
      : tool === 'get_state' ? 'Checking your project settings'
        : tool === 'fill' ? 'Filling in your production brief'
          : tool === 'run_free' ? (step.label && !/^\s*[{[]/.test(step.label) ? step.label : 'Preparing the production plan')
            : tool === 'run_paid' ? 'Starting video production'
              : tool === 'wait_for' ? 'Waiting for the next saved production update'
                : tool === 'check_frames' ? 'Reviewing the finished frames'
                  : step.label;
  if (!/^\s*[{[]/.test(raw)) return { ...step, label, evidence: visibleVergerError(raw) || (step.status === 'running' ? 'Working…' : 'Completed.') };
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {}
  let evidence = 'Completed.';
  if (tool === 'read_brand_kit') evidence = parsed?.saved ? `Brand details found for ${parsed.businessName || 'your project'}.` : 'Brand doc checked.';
  else if (tool === 'get_state') {
    const values = parsed?.values || parsed?.result?.values || {};
    const details = [values.length ? `${values.length}s` : '', values.shape || '', values.model ? 'Omni Flash' : ''].filter(Boolean);
    evidence = details.length ? `Project settings checked: ${details.join(' · ')}.` : 'Project settings checked.';
  } else if (tool === 'fill') {
    const rejected = parsed?.rejected || [];
    evidence = rejected.some((item: any) => item?.key === 'model') ? 'Brief filled in. That model was unavailable, so Verger switched to Omni Flash.' : 'Brief filled in with your idea, length and format.';
  } else if (tool === 'run_free') evidence = parsed?.result?.values?.script ? 'Production script prepared and accepted.' : 'Production plan step completed.';
  else if (tool === 'run_paid') evidence = 'Production started from the saved plan.';
  return { ...step, label, evidence };
}
/** Identical finished steps (same label, outcome and evidence) collapse into one row with a repeat count. */
function dedupeSteps(list: UiStep[]): UiStep[] {
  const out: UiStep[] = [];
  const seen = new Map<string, number>();
  for (const step of list) {
    if (step.status === 'running') { out.push(step); continue; }
    const key = `${step.status}|${step.label}|${step.evidence}`;
    const at = seen.get(key);
    if (at == null) { seen.set(key, out.length); out.push(step); continue; }
    out[at] = { ...out[at], repeat: (out[at].repeat || 1) + (step.repeat || 1) };
  }
  return out;
}

const STEP_FAILED_COPY = 'This step didn’t finish. Your project is saved — tap Retry and I’ll pick it back up.';

/** Long, multi-line or code-shaped text is never shown to the customer. */
function userSafeText(value: string, fallback = STEP_FAILED_COPY): string {
  const text = String(value || '').trim();
  if (!text || text.length > 240) return fallback;
  if (/\n\s*at\s|\b(?:TypeError|ReferenceError|SyntaxError|RangeError)\b|\bError:|[{}<>`]|=>|\bundefined\b|\bHTTP \d{3}\b|\[[a-z0-9_]+\]|^\s*\[/.test(text)) return fallback;
  return text;
}

type IconType = typeof Sparkles;

function questionIcon(question: Question): IconType {
  const text = `${question.label} ${question.prompt}`.toLowerCase();
  if (/credit|budget|cost|start it|start now/.test(text)) return Coins;
  if (/brand|logo|colou?r/.test(text)) return Palette;
  if (/voice|narrat|accent|language|speak/.test(text)) return Mic;
  if (/storyboard|scene|shot|script|plan|look|cast|character/.test(text)) return LayoutGrid;
  if (/format|length|shape|size|setting|ratio|duration|style/.test(text)) return SlidersHorizontal;
  return Sparkles;
}

function labelRepeatsPrompt(label: string, prompt: string): boolean {
  const norm = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(label);
  const b = norm(prompt);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

function initialMode(): Mode { try { return localStorage.getItem(MODE_KEY) === 'copilot' ? 'copilot' : 'autopilot'; } catch { return 'autopilot'; } }
function initialBudget(): number { try { return Math.max(1, Math.min(10000, Number(localStorage.getItem(BUDGET_KEY)) || 60)); } catch { return 60; } }

type ResearchRequest = { query: string; platforms: ResearchPlatform[]; wantsBrief: boolean };
function researchRequest(text: string): ResearchRequest | null {
  const lower = text.toLowerCase();
  const explicit = /\b(research|scrape|ads? library|competitor|what hooks|winning hooks|top performer|social profile|social posts?|discover)\b/i.test(text);
  if (!explicit) return null;
  const sourceUrl = text.match(/https?:\/\/[^\s)\]}]+/i)?.[0] || '';
  const platforms: ResearchPlatform[] = [];
  const add = (platform: ResearchPlatform) => { if (!platforms.includes(platform)) platforms.push(platform); };
  if (/\bmeta|facebook ads?\b/.test(lower)) add('meta');
  if (/\btiktok ads?|tiktok ad library\b/.test(lower)) add('tiktok');
  if (/\blinkedin ads?|linkedin ad library\b/.test(lower)) add('linkedin');
  if (/\binstagram|insta\b/.test(lower)) add('instagram');
  if (/\byoutube|shorts\b/.test(lower)) add('youtube');
  if (/\breddit\b/.test(lower)) add('reddit');
  if (/\bdiscover|google search|places|contact details\b/.test(lower)) add('discovery');
  if (sourceUrl && !platforms.length) {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.includes('instagram')) add('instagram');
    else if (host.includes('youtube') || host.includes('youtu.be')) add('youtube');
    else if (host.includes('reddit')) add('reddit');
    else if (/tiktok|facebook|twitter|x\.com/.test(host)) add('social');
    else add('web');
  }
  if (!platforms.length && /\bads?|creative|competitor|hooks?\b/.test(lower)) ['meta', 'tiktok', 'linkedin'].forEach((platform) => add(platform as ResearchPlatform));
  if (!platforms.length && /\bprofile|posts?|social\b/.test(lower)) add('social');
  if (!platforms.length) ['meta', 'tiktok', 'instagram'].forEach((platform) => add(platform as ResearchPlatform));
  const cleaned = text
    .replace(/https?:\/\/[^\s)\]}]+/i, '')
    .replace(/\b(?:please|can you|research|scrape|analyse|analyze|find|show me|tell me|competitor|ads? library|social profile|social posts?|discover|what hooks are working|winning hooks|top performer)\b/gi, ' ')
    .replace(/\b(?:meta|facebook|tiktok|linkedin|instagram|youtube|reddit|web|page|pages|for|on|in|from)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    query: sourceUrl || cleaned || text.trim(),
    platforms,
    wantsBrief: /\b(brief|video idea|script|recreate|remake|turn (?:it|this|findings)|make (?:an|a) (?:ad|video))\b/i.test(text),
  };
}

function researchSummary(topic: ResearchTopic, items: ResearchItem[], breakdowns: Array<CreativeBreakdown | null>): string {
  const statuses = (topic.platform_status || []).map((status) => `${status.platform}: ${status.status === 'empty' ? 'No data found' : status.status === 'failed' ? 'All actors failed' : status.status}${status.actorId ? ` via ${status.actorId}` : ''}`).join('; ');
  const evidence = items.slice(0, 3).map((item, index) => {
    const breakdown = breakdowns[index];
    const signal = item.run_days != null ? `${item.run_days} observed run days` : item.engagement && Object.keys(item.engagement).length ? Object.entries(item.engagement).slice(0, 2).map(([key, value]) => `${value} ${key}`).join(', ') : 'no public performance metric returned';
    return `${index + 1}. ${item.advertiser || 'Source creative'} (${item.platform}, ${item.source_actor}) — ${breakdown ? `hook: ${breakdown.hook}; angle: ${breakdown.angle}; format: ${breakdown.format}` : item.copy_transcript || 'no caption/transcript returned'}; ${signal}; estimated evidence score ${Number(item.performance_score || 0).toFixed(1)}.`;
  }).join('\n');
  return `Research saved to the shared library.\nStatus: ${statuses || topic.status}.\n${evidence || 'No data found.'}`;
}

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
  const singleClip = /\b(?:single clip|one clip|one shot|one scene|quick clip|model clip)\b/i.test(lower);
  const productionAd = /\b(?:ad|advert|commercial|voiceover|narration|story|multi[- ]scene)\b/i.test(lower);
  if (singleClip && !hasScript && !productionAd && duration <= 30) {
    return {
      appId: 'video-provider-lab',
      values: { prompt: text, duration, aspectRatio: shape, audio: !/\b(?:silent|no audio)\b/i.test(lower), model: 'groupa:openrouter/bytedance/seedance-2.5' },
    };
  }
  const castMatch = text.match(/character\s+(?:is\s+)?([^,.;]+)/i);
  const voiceMatch = text.match(/(?:voice|voiced by)\s*[:,]?\s*([^,.;]+)/i);
  return { appId: 'script-to-video', values: { mode: hasScript ? 'script' : 'idea', ...(hasScript ? { script: text, keepWords: true } : { idea: text }), language: 'English', length: duration, shape, sound: /voice|speak|character/i.test(lower) ? 'Characters speak' : /narrat/i.test(lower) ? 'Narrator' : 'Music only', look: 'Warm gold cinematic lighting', model: 'omni-1.1-flash', cast: castMatch?.[1]?.trim() || '', voices: voiceMatch?.[1]?.trim() || '', references: attachment?.url || '' } };
}

function OptionLabel({ option }: { option: QuestionOption }) {
  const preview = questionPreview(option);
  if (!preview) return <span className="min-w-0 break-words">{option.label}</span>;
  return <>
    <OptionThumb src={preview.thumb} ratio={preview.ratio} style={{ width: preview.ratio === '9 / 16' ? 50 : 88, flexShrink: 0, border: '1px solid var(--vg-border)' }} />
    <span className="min-w-0 flex-1 break-words">{option.label}<span className="mt-0.5 block text-[11px] leading-snug text-[var(--vg-muted)]">{preview.note}</span></span>
  </>;
}

function StepList({ steps, onRetry }: { steps: UiStep[]; onRetry: (step: UiStep) => void }) {
  if (!steps.length) return null;
  return <ol className="space-y-2" aria-label="Production steps">{steps.map((step) => <li key={step.id} className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3"><div className="flex items-start gap-3">{step.status === 'running' ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[var(--vg-accent)] motion-reduce:animate-none" /> : step.status === 'done' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--vg-success)]" /> : <span className="mt-0.5 text-sm font-black text-[var(--vg-danger)]">×</span>}<div className="min-w-0 flex-1"><strong className="text-[12px] text-[var(--vg-text)]">{step.label}</strong>{step.repeat && step.repeat > 1 ? <span className="ml-1.5 text-[10px] text-[var(--vg-muted)]">×{step.repeat}</span> : null}<p className={`mt-1 break-words text-[11px] leading-relaxed ${step.status === 'failed' ? 'text-[var(--vg-danger)]' : 'text-[var(--vg-secondary)]'}`}>{step.status === 'failed' ? userSafeText(step.evidence) : step.evidence || (step.status === 'running' ? 'Working…' : 'Completed with saved evidence.')}</p></div>{step.status === 'failed' ? <button type="button" onClick={() => onRetry(step)} className="min-h-11 shrink-0 rounded-lg border border-[var(--vg-danger)] px-3 text-[11px] text-[var(--vg-danger)]"><RotateCcw size={12} className="mr-1 inline" />Retry</button> : null}</div></li>)}</ol>;
}

const PRODUCTION_STAGES = ['Plan', 'Character', 'Voice', 'Shots', 'Join', 'Check'];

function ProductionCard({ steps, percent, running, waiting, video, collapsed, onToggle, onDismiss, onRetry, onWatch }: { steps: UiStep[]; percent: number; running: boolean; waiting: boolean; video: ReadyVideo | null; collapsed: boolean; onToggle: () => void; onDismiss: () => void; onRetry: (step: UiStep) => void; onWatch: () => void }) {
  const last = steps[steps.length - 1];
  const current = [...steps].reverse().find((step) => step.status === 'running') || last;
  const done = !running && !!video;
  const failed = !running && !done && last?.status === 'failed';
  const doneCount = steps.filter((step) => step.status === 'done').length;
  const stage = String(current?.label || (running ? 'Getting your production ready' : 'Production update')).replace(/[.…\s]+$/, '');
  const showStages = percent > 0 && !done;
  const eyebrow = done ? 'Video ready' : failed ? 'Needs a retry' : waiting ? 'Waiting for you' : running ? 'Working on it' : 'Production update';
  const status = done ? 'Your video is ready. Watch it here, download it, or open it in its studio.'
    : failed ? 'One step didn’t finish. Everything so far is saved — tap Retry and I’ll pick it back up.'
      : waiting ? 'I need one quick answer from you below, then I’ll carry on.'
        : running ? `On it — ${stage}…`
          : 'Those steps are finished and your project is saved.';
  const tone = done ? 'var(--vg-success)' : failed ? 'var(--vg-danger)' : 'var(--vg-accent)';
  return <section aria-label="Video production" className="overflow-hidden rounded-2xl border bg-[var(--vg-raised)]" style={{ borderColor: `color-mix(in srgb, ${tone} 45%, var(--vg-border))` }}>
    <div className="flex items-start gap-3 p-3 sm:p-4">
      {showStages
        ? <div role="progressbar" aria-label="Production progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums text-[var(--vg-text)]" style={{ background: `radial-gradient(circle at center,var(--vg-raised) 57%,transparent 59%),conic-gradient(var(--vg-accent) ${percent}%,var(--vg-border) 0)` }}>{percent}%</div>
        : <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>{running ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" /> : done ? <CheckCircle2 size={18} /> : failed ? <RotateCcw size={18} /> : <Clapperboard size={18} />}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[.16em]" style={{ color: tone }}>{eyebrow}</p>
        <h3 className="mt-0.5 truncate font-['Inter'] text-sm font-bold text-[var(--vg-text)]">{done && video ? video.title : stage}</h3>
        <p role="status" aria-live="polite" className="mt-1 text-xs leading-relaxed text-[var(--vg-secondary)]">{status}{steps.length ? <span className="text-[var(--vg-muted)]"> · {doneCount} of {steps.length} steps done</span> : null}</p>
      </div>
      <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show production details' : 'Hide production details'} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]"><ChevronDown size={16} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} /></button>
      {!running ? <button type="button" onClick={onDismiss} aria-label="Dismiss production card" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]"><X size={16} /></button> : null}
    </div>
    {collapsed ? null : <div className="space-y-3 border-t border-[var(--vg-border)] p-3 sm:p-4">
      {showStages ? <ol aria-label="Production stages" className="grid grid-cols-3 gap-2 text-center text-[10px] text-[var(--vg-secondary)] sm:grid-cols-6">{PRODUCTION_STAGES.map((lane, index) => <li key={lane} className={`rounded-lg border px-2 py-2 ${percent >= index * 16 ? 'border-[var(--vg-accent)] text-[var(--vg-accent)]' : 'border-[var(--vg-border)]'}`}>{lane}</li>)}</ol> : null}
      {done && video ? <div>
        <div className="overflow-hidden rounded-xl border border-[var(--vg-border)] bg-black"><video src={video.url} controls playsInline preload="metadata" aria-label={video.title} className="max-h-[52vh] max-h-[52dvh] w-full object-contain" /></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <a href={video.url} download className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-3 text-sm font-bold text-[var(--vg-on-accent)]"><Download size={15} />Download</a>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: video.appId } }))} className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-[var(--vg-border)] px-3 text-sm text-[var(--vg-text)] hover:border-[var(--vg-accent)]"><ExternalLink size={15} className="shrink-0" /><span className="truncate">Open in {friendlyAppName(video.appId)}</span></button>
          <button type="button" onClick={onWatch} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--vg-border)] px-3 text-sm text-[var(--vg-text)] hover:border-[var(--vg-accent)]"><Play size={15} />Full view</button>
        </div>
      </div> : null}
      {steps.length ? <details open={running || failed} className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[var(--vg-secondary)] [&::-webkit-details-marker]:hidden"><ChevronDown size={13} className="transition-transform group-open:rotate-180" />Steps ({steps.length})</summary><div className="mt-2"><StepList steps={steps} onRetry={onRetry} /></div></details> : null}
    </div>}
  </section>;
}

function ReadyDialog({ video, onClose }: { video: ReadyVideo; onClose: () => void }) {
  const [muted, setMuted] = useState(true);
  const returnFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  useEffect(() => () => returnFocus.current?.focus?.(), []);
  const share = async () => { if (navigator.share) await navigator.share({ title: video.title, url: video.url }); else await navigator.clipboard.writeText(video.url); };
  return <div className="verger-chat fixed inset-0 z-[100] grid place-items-center bg-[color-mix(in_srgb,var(--vg-bg)_68%,transparent)] p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="video-ready-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}><div className="relative max-h-[94vh] max-h-[94dvh] w-[min(760px,96vw)] overflow-y-auto rounded-2xl border border-[var(--vg-accent)] bg-[var(--vg-surface)] p-1 shadow-[0_0_90px_color-mix(in_srgb,var(--vg-accent)_30%,transparent)]"><div className="rounded-[14px] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--vg-accent)_20%,transparent),transparent_48%)] p-4 sm:p-6"><button autoFocus type="button" onClick={onClose} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border border-[var(--vg-border)] bg-[var(--vg-bg)] text-[var(--vg-secondary)]" aria-label="Close video"><X size={17} /></button><div className="overflow-hidden rounded-xl border border-[var(--vg-border)] bg-black"><video src={video.url} autoPlay loop playsInline muted={muted} controls className="max-h-[54vh] max-h-[54dvh] w-full object-contain" onClick={() => setMuted(false)} /></div><h2 id="video-ready-title" className="mt-5 font-['Inter'] text-2xl font-bold text-[var(--vg-text)]">Your video is ready</h2><p className="mt-1 text-sm text-[var(--vg-secondary)]">{video.title} was made inside {friendlyAppName(video.appId)} and checked before delivery.</p><div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--vg-secondary)]"><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{video.durationS}s</span><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{video.width}×{video.height}</span><span className="rounded-full border border-[var(--vg-border)] px-3 py-1.5">{formatCredits(video.credits)} credits</span></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--vg-success)]"><span>✓ Same character</span><span>✓ Every line spoken</span><span>✓ Size checked</span></div><div className="mt-5 grid gap-2 sm:grid-cols-4"><a href={video.url} download className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[image:var(--vg-gradient-action)] px-3 text-sm font-bold text-[var(--vg-on-accent)]"><Download size={15} />Download</a><button type="button" onClick={() => void share()} className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm"><Share2 size={15} className="mr-1 inline" />Share link</button><button type="button" className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm">Make 3 more hooks</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('openApp', { detail: { appId: video.appId } }))} className="min-h-11 rounded-xl border border-[var(--vg-border)] text-sm"><ExternalLink size={15} className="mr-1 inline" />Open app</button></div></div></div></div>;
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
  const [modeOpen, setModeOpen] = useState(false);
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
  const [, setScrapedSource] = useState<ReferenceResearch | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchRefreshKey, setResearchRefreshKey] = useState(0);
  const [routingInfoOpen, setRoutingInfoOpen] = useState(false);
  const [routingClearNote, setRoutingClearNote] = useState('');
  const [cardVideo, setCardVideo] = useState<ReadyVideo | null>(null);
  const [productionCollapsed, setProductionCollapsed] = useState(false);
  const [productionDismissed, setProductionDismissed] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const eventsRef = useRef<UiEvent[]>([]);
  const keyRef = useRef(conversationKey);
  const nameRef = useRef(conversationName);
  const jobsRef = useRef(jobs);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const stoppedRef = useRef(false);
  const pendingChoice = useRef<((index: number, text: string) => Promise<void> | void) | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const uploadedRef = useRef<VidvergeAttachment | null>(null);
  const specialistContext = useRef('');
  const routingCorrections = useRef<RoutingCorrection[]>([]);
  keyRef.current = conversationKey; nameRef.current = conversationName; jobsRef.current = jobs;

  const visible = useMemo(() => events.filter((event) => ['say', 'answer', 'question', 'notice'].includes(event.verger.kind)), [events]);
  const empty = !restoring && visible.length === 0;
  const { credits } = useCredits();
  const creditBalance = credits?.balance;
  const creditLabel = credits ? formatCreditBalance(credits) : 'Credits';
  const shownError = visibleVergerError(error);
  const productionRunning = steps.some((step) => step.status === 'running') || (busy && autopilotProgress > 0 && autopilotProgress < 100);

  useEffect(() => {
    const seed = consumeVergerPrefill();
    if (!seed) return;
    setInput(seed);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  async function push(role: 'user' | 'assistant', content: string, verger: VergerEvent) {
    const next: UiEvent = { id: uid(), role, content, verger };
    eventsRef.current = [...eventsRef.current, next]; setEvents(eventsRef.current);
    await appendEvent(keyRef.current, nameRef.current, role, content, verger);
    setConversations((current) => [{ key: keyRef.current, title: nameRef.current, updatedAt: new Date().toISOString(), messageCount: eventsRef.current.length }, ...current.filter((item) => item.key !== keyRef.current)]);
  }

  async function recordStep(step: UiStep) {
    const safeStep = friendlyStepCard(step);
    setSteps((current) => { const exists = current.some((item) => item.id === safeStep.id); return dedupeSteps(exists ? current.map((item) => item.id === safeStep.id ? { ...safeStep, repeat: item.repeat } : item) : [...current, safeStep]); });
    await appendRunSnapshot(keyRef.current, { runId: safeStep.id, agentType: safeStep.tool, name: safeStep.label, task: safeStep.evidence || safeStep.label, status: safeStep.status, resultText: safeStep.evidence, meta: { mode, budget, progress: autopilotProgress, state: safeStep.status } });
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

  async function runCopilot(goal: string, appId: AppId, brief: string, values: Record<string, unknown>, routing?: RoutingDecision) {
    if (appId === 'ugc-studio' && !uploadedRef.current?.url) {
      await ask({ label: 'Product photo', prompt: 'Attach a photo of your product in this chat, then send the request again.', options: [{ label: 'Choose a product photo', value: 'attach' }] }, async () => fileRef.current?.click());
      return;
    }
    let route;
    try {
      route = await runStep(`Opening ${friendlyAppName(appId)} beside this chat`, 'bridge.open', async () => onRouteStudio({ appId, brief }, uploadedRef.current));
      if (routing) void logRoutingOutcome(goal, routing, route.controller ? 'opened' : 'fallback_handoff');
    } catch (error) {
      if (routing) void logRoutingOutcome(goal, routing, 'failed');
      throw error;
    }
    if (!route.controller) {
      await push('assistant', route.message, { kind: 'notice', seq: nextSeq() });
      return;
    }
    const controller = route.controller;
    subscribeToController(appId, controller);
    if (Object.keys(values).length) {
      const filled = await runStep('Filling in your brief', 'bridge.fill', async () => controller.fill(withBrandValues(values, goal), { animate: true }));
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
    const routing = routeRequest(goal, routingCorrections.current);
    if (depth === 0) {
      void logRoutingDecision(goal, routing);
      if (routing.params.explicitOverride === true) {
        const learned: RoutingCorrection = { input_summary: goal.slice(0, 280), corrected_app: routing.app, created_at: new Date().toISOString() };
        routingCorrections.current = [learned, ...routingCorrections.current].slice(0, 12);
        void logRoutingCorrection(goal, routing, routing.app);
      }
      if (routing.needs_clarification) {
        await ask({ label: 'Choose the format', prompt: routing.clarification_question || 'Which video format should I use?', options: [
          { label: 'Presenter / avatar', value: 'presenter' },
          { label: 'Faceless narration', value: 'faceless' },
          { label: 'Cinematic multi-scene film', value: 'cinematic' },
        ] }, async (_index, text) => {
          setBusy(true);
          try { await runPlanned(`${goal}\n\n[Format choice: ${text}]`, depth + 1); } finally { setBusy(false); }
        });
        return;
      }
      await push('assistant', `Sending this to ${friendlyAppName(routing.app)} because ${routing.reason}.`, { kind: 'notice', seq: nextSeq() });
    }
    if (depth >= MAX_PLAN_DEPTH) { await runCopilot(goal, routing.app as AppId, routing.brief || goal, routing.app === parsed.appId ? parsed.values : routing.params, routing); return; }
    let plan: VergerPlan | null = null;
    try {
      const savedKit = getDefaultBrand(currentBrandDocument());
      const savedKitNote = savedKit ? `A saved Brand Kit exists${savedKit.identity.businessName ? ` (${savedKit.identity.businessName})` : ''}. Its details are NOT shared with you; the user can pick "Use my saved Brand Kit" as an option.` : 'No saved Brand Kit exists.';
      plan = await planTurn(historyTurns(), queueSummary(), '', savedKitNote, specialistContext.current);
    } catch {
      plan = null;
    }
    if (!plan) { await runCopilot(goal, routing.app as AppId, routing.brief || goal, routing.app === parsed.appId ? parsed.values : routing.params, routing); return; }
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
        if (/use my saved brand kit/i.test(`${text} ${value}`)) confirmDefaultSavedBrand();
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
    const appId = (resolveAppId(routing.app) || resolveAppId(route.appId) || refined.appId) as AppId;
    const providerValues = appId === 'video-provider-lab' ? {
      prompt: route.brief || goal,
      duration: Math.max(4, Math.min(30, Math.round(Number(plan.openStudio?.estimatedSeconds) || Number(String(route.brief).match(/\b(\d{1,2})\s*(?:seconds?|secs?|s)\b/i)?.[1]) || 8))),
      aspectRatio: /\b(?:9:16|vertical|portrait|reel|shorts?|tiktok)\b/i.test(route.brief) ? '9:16' : '16:9',
      audio: !/\b(?:silent|no audio)\b/i.test(route.brief),
      model: 'groupa:openrouter/bytedance/seedance-2.5',
    } : null;
    await runCopilot(goal, appId, route.brief || routing.brief || goal, providerValues || (appId === refined.appId ? refined.values : routing.params), routing);
  }

  // ----------------------------------------------------------- autopilot ----

  async function runAutomatic(goal: string, authorizedOverage = false, routing?: RoutingDecision) {
    const parsed = parseGoal(goal, uploadedRef.current);
    const estimated = Number(parsed.values.length || 30);
    if (estimated > budget && !authorizedOverage) {
      await ask({
        label: 'Budget check',
        prompt: `This looks like about ${formatCredits(estimated)} credits of video; your Autopilot budget is ${formatCredits(budget)}. Go ahead anyway?`,
        options: [{ label: 'Yes — allow it for this run', value: 'yes' }, { label: 'No — keep my budget', value: 'no' }],
      }, async (index) => { if (index === 0) { setBusy(true); try { await runAutomatic(goal, true, routing); } finally { setBusy(false); } } });
      return;
    }
    stoppedRef.current = false; setAutopilotProgress(3);
    let result;
    try {
      result = await runAutopilot(routing ? `${goal}\n\n[VERGER ROUTING DECISION]\nApp: ${routing.app}\nReason: ${routing.reason}\nBrief: ${routing.brief}\nParams: ${JSON.stringify(routing.params)}\nUse this route once; do not loop.` : goal, Math.max(budget, authorizedOverage ? estimated : budget), {
      stopped: () => stoppedRef.current,
      onStep: (step: AutopilotStep) => { void recordStep({ ...step }); setAutopilotProgress((current) => Math.min(94, step.status === 'done' ? current + 6 : current)); },
      onEvent: (appId, event) => { if (event.type === 'finished') { setReady({ ...event, appId, credits: event.durationS, title: nameRef.current || 'Your video' }); setReadyOpen(true); } if (event.type === 'progress') setAutopilotProgress(event.total ? Math.round((event.done / event.total) * 100) : 0); },
      askUser: (request: AutopilotAsk) => new Promise((resolve) => {
        void ask({ label: request.label, prompt: request.question, options: request.options, multi: request.multi }, async (_index, text) => { if (/use my saved brand kit/i.test(text)) confirmDefaultSavedBrand(); resolve(text); });
      }),
      });
      if (routing) void logRoutingOutcome(goal, routing, result.delivered ? 'opened' : 'fallback_handoff');
    } catch (error) {
      if (routing) void logRoutingOutcome(goal, routing, 'failed');
      throw error;
    }
    if (result.delivered) setAutopilotProgress(100);
  }

  // ----------------------------------------------------------- turn flow ----

  async function publishResearchBrief(brief: UgcRecreation, source: ResearchItem, topic: ResearchTopic) {
    const scenes = brief.scenes.map((scene) => `${scene.role} (${scene.duration}s): ${scene.line} — ${scene.action}`).join('\n');
    const message = `Original video brief from “${topic.label}” research\nHook: ${brief.hook || 'Not observable in the source; write an original hook before production.'}\nFormat: ${brief.format} · ${brief.length}s · ${brief.pacing}\nScript: ${brief.script}\nCTA: ${brief.cta}\nScenes:\n${scenes}\n\nThis uses only the observed structure and angle from ${source.source_actor}; it does not copy competitor footage, branding, names, or exact wording.`;
    specialistContext.current = `${specialistContext.current}\n${message}`.trim();
    await push('assistant', message, { kind: 'say', seq: nextSeq() });
    setResearchOpen(false);
  }

  async function processGoal(goal: string) {
    const started = Date.now();
    const requestedResearch = researchRequest(goal);
    if (requestedResearch) {
      setThinking({ started, text: `I’m checking ${requestedResearch.platforms.join(', ')} public evidence, preserving the answering actor and real empty/failure states, then saving it to the shared Research library.` });
      try {
        const result = await runStep('Researching public creative evidence', 'research.shared-library', () => researchTopic(requestedResearch.query, requestedResearch.platforms));
        setResearchRefreshKey((value) => value + 1);
        setResearchOpen(true);
        const top = result.items.slice(0, 3);
        const breakdowns = await Promise.all(top.map((item) => analyzeResearchItem(item).catch(() => null)));
        const summary = researchSummary(result.topic, top, breakdowns);
        specialistContext.current = `${specialistContext.current}\n${summary}`.trim();
        await push('assistant', summary, { kind: 'say', seq: nextSeq() });
        if (requestedResearch.wantsBrief && top[0]) {
          const brief = await runStep('Turning the top evidence into an original video brief', 'research.recreate-top-performer', () => buildOriginalUgcRecreation(top[0], '', requestedResearch.query, 15));
          await publishResearchBrief(brief, top[0], result.topic);
        }
      } catch (caught) {
        const message = friendly(caught);
        await push('assistant', /No data found|All actors failed/i.test(message) ? message : `Research did not finish: ${message}`, { kind: 'notice', seq: nextSeq() });
      } finally {
        setThinking((current) => current ? { ...current, seconds: Math.max(1, Math.round((Date.now() - started) / 1000)) } : null);
      }
      return;
    }
    let groundedGoal = goal;
    const sourceUrl = goal.match(/https?:\/\/[^\s)\]}]+/i)?.[0] || '';
    if (sourceUrl) {
      try {
        const research = await runStep('Researching the pasted reference', 'research.scrape_url', () => researchReference(sourceUrl, 'auto'));
        setScrapedSource(research);
        groundedGoal = `${goal}\n\n[SCRAPED REFERENCE — factual evidence only]\n${research.contextText}\nSource actor: ${research.actorId}.`;
      } catch (caught) {
        setScrapedSource(null);
        await push('assistant', `I couldn’t scrape that reference (${friendly(caught)}). I’ll continue with what you wrote and won’t invent missing details.`, { kind: 'notice', seq: nextSeq() });
      }
    }
    
    setThinking({
      started,
      text: mode === 'autopilot'
        ? 'I\u2019m making the whole video myself — brand, plan, character, voice, shots, join and check — inside your budget. You\u2019ll only hear from me about your brand (if it isn\u2019t saved yet) or the budget.'
        : 'I\u2019m reading your request, picking the right studio, and opening it right here beside our chat.',
    });
    try {
      if (mode === 'autopilot') {
        const routing = routeRequest(groundedGoal, routingCorrections.current);
        void logRoutingDecision(groundedGoal, routing);
        if (routing.params.explicitOverride === true) {
          const learned: RoutingCorrection = { input_summary: groundedGoal.slice(0, 280), corrected_app: routing.app, created_at: new Date().toISOString() };
          routingCorrections.current = [learned, ...routingCorrections.current].slice(0, 12);
          void logRoutingCorrection(groundedGoal, routing, routing.app);
        }
        if (routing.needs_clarification) {
          await ask({ label: 'Choose the format', prompt: routing.clarification_question || 'Which video format should I use?', options: [
            { label: 'Presenter / avatar', value: 'presenter' },
            { label: 'Faceless narration', value: 'faceless' },
            { label: 'Cinematic multi-scene film', value: 'cinematic' },
          ] }, async (_index, text) => {
            setBusy(true);
            try { await runAutomatic(`${groundedGoal}\n\n[Format choice: ${text}]`, false, routeRequest(`${groundedGoal} ${text}`, routingCorrections.current)); } finally { setBusy(false); }
          });
        } else {
          await push('assistant', `Sending this to ${friendlyAppName(routing.app)} because ${routing.reason}.`, { kind: 'notice', seq: nextSeq() });
          await runAutomatic(groundedGoal, false, routing);
        }
      } else await runPlanned(groundedGoal);
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
    stickRef.current = true;
    if (question && pendingChoice.current) {
      const handler = pendingChoice.current; pendingChoice.current = null; setQuestion(null); setMultiPicks([]);
      await push('user', text, { kind: 'answer', seq: nextSeq(), optionIndex: optionIndex ?? -1 });
      await handler(optionIndex ?? -1, text); return;
    }
    setCardVideo(null);
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
    setConversationKey(key); setConversationName('New chat'); setEvents([]); setSteps([]); setQuestion(null); setMultiPicks([]); setError(''); setReady(null); setReadyOpen(false); setAutopilotProgress(0); setScrapedSource(null); setResearchOpen(false);
  }

  async function openConversation(summary: ConversationSummary) {
    stickRef.current = true;
    setRestoring(true);
    try {
      const [rows, storedRuns] = await Promise.all([loadConversation(summary.key), loadRunHistory(summary.key)]);
      const restored: UiEvent[] = rows.map((row: StoredRow) => ({ id: uid(), role: row.role, content: row.content, verger: row.verger }));
      const restoredSteps: UiStep[] = storedRuns.map((run) => friendlyStepCard({ id: run.runId, label: run.name, tool: run.agentType, status: run.status === 'running' ? 'failed' : run.status, evidence: run.status === 'running' ? 'Interrupted; your saved project is safe to continue.' : run.resultText }));
      keyRef.current = summary.key; nameRef.current = summary.title; eventsRef.current = restored;
      setConversationKey(summary.key); setConversationName(summary.title); setEvents(restored); setSteps(dedupeSteps(restoredSteps)); setQuestion(null); setMultiPicks([]);
    } finally { setRestoring(false); }
  }

  useEffect(() => {
    let cancelled = false;
    void loadRecentRoutingCorrections().then((items) => { if (!cancelled) routingCorrections.current = items; });
    void loadConversationIndex().then((index) => { if (cancelled) return; setConversations(index); if (index.length) void openConversation(index[0]); else setRestoring(false); }).catch(() => setRestoring(false));
    try { const cached = JSON.parse(localStorage.getItem(CHIP_CACHE_KEY) || 'null'); if (Array.isArray(cached)) setChips(cached); else void suggestChips().then((items) => { if (!cancelled) { setChips(items); try { localStorage.setItem(CHIP_CACHE_KEY, JSON.stringify(items)); } catch {} } }); } catch {}
    return () => { cancelled = true; stoppedRef.current = true; };
  }, []);
  useEffect(() => { onProjectChange(conversationKey, conversationName); }, [conversationKey, conversationName, onProjectChange]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events, steps, busy, question, thinking, restoring, error, autopilotProgress]);
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const keepBottom = () => { if (stickRef.current) el.scrollTop = el.scrollHeight; };
    const observer = new ResizeObserver(keepBottom);
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch {} }, [mode]);
  useEffect(() => { try { localStorage.setItem(BUDGET_KEY, String(budget)); } catch {} }, [budget]);
  useEffect(() => { setCardVideo(ready); }, [ready]);
  useEffect(() => { setProductionDismissed(false); setProductionCollapsed(true); }, [conversationKey]);
  useEffect(() => { if (productionRunning || cardVideo) { setProductionDismissed(false); setProductionCollapsed(false); } }, [productionRunning, cardVideo]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const percent = Math.max(0, Math.min(100, autopilotProgress));
  const toggleMultiPick = (index: number) => setMultiPicks((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  const retryStep = (step: UiStep) => { if (canRetryAutopilotStep(step.id)) void retryAutopilotStep(step.id); else if (retryRef.current) void retryRef.current(); };
  const showProduction = !productionDismissed && (steps.length > 0 || percent > 0 || !!cardVideo);
  const QuestionIcon = question ? questionIcon(question) : Sparkles;
  const inputLocked = busy && !question;
  const canSend = !!input.trim() && !restoring && !inputLocked;
  const showStop = busy && !(question && input.trim());
  const jumpToLatest = () => { const el = scrollRef.current; if (!el) return; stickRef.current = true; setShowJump(false); el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); };
  return <>
    <div className="verger-chat relative mx-auto flex h-full min-h-0 w-full flex-col bg-[var(--vg-bg)]">
      <style>{`@property --verger-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes verger-angle{to{--verger-angle:360deg}}
@keyframes verger-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.verger-border{background:var(--vg-border)}
.verger-border[data-busy='true']{background:conic-gradient(from var(--verger-angle),color-mix(in srgb,var(--vg-accent) 30%,transparent),var(--vg-border),color-mix(in srgb,var(--vg-accent) 30%,transparent),var(--vg-border));animation:verger-angle 7s linear infinite}
@keyframes verger-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
.verger-dot{animation:verger-dot 1.1s ease-in-out infinite}
.verger-chat :is(button,a,summary,input[type=number]):focus-visible{outline:2px solid var(--vg-focus,var(--vg-accent));outline-offset:3px}
.verger-composer:focus-within{box-shadow:0 0 0 1px color-mix(in srgb,var(--vg-accent) 55%,transparent)}
@media(prefers-reduced-motion:reduce){.verger-border,.verger-shimmer,.verger-dot{animation:none!important}}`}</style>
      <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--vg-bg)]">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--vg-border)] px-3 sm:px-4">
          <div className="relative min-w-0">
            <button type="button" onClick={() => setRecentOpen((value) => !value)} aria-expanded={recentOpen} aria-haspopup="true" aria-label="Verger menu" className="flex min-h-11 max-w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-[var(--vg-hover)]"><strong className="truncate font-['Inter'] text-base text-[var(--vg-text)]">Verger</strong><ChevronDown size={14} className="shrink-0 text-[var(--vg-muted)]" /></button>
            {recentOpen ? <div className="absolute left-0 top-12 z-30 max-h-[70vh] w-[min(320px,85vw)] overflow-y-auto rounded-xl border border-[var(--vg-border)] bg-[var(--vg-bg)] p-2 shadow-2xl" onKeyDown={(event) => { if (event.key === 'Escape') setRecentOpen(false); }}><button type="button" onClick={() => { setResearchOpen((value) => !value); setRecentOpen(false); }} aria-expanded={researchOpen} aria-label="Research" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]"><Search size={13} className="shrink-0" />Research</button><div className="my-1 border-t border-[var(--vg-border)]" /><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--vg-muted)]">Recent chats</p>{conversations.length ? conversations.slice(0, 8).map((item) => <button key={item.key} type="button" onClick={() => { setRecentOpen(false); void openConversation(item); }} className="block min-h-11 w-full truncate rounded-lg px-2 text-left text-xs text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]">{item.title}</button>) : <p className="px-2 py-2 text-xs text-[var(--vg-muted)]">No saved chats yet.</p>}<div className="mt-1 border-t border-[var(--vg-border)] pt-1"><button type="button" onClick={() => setRoutingInfoOpen((value) => !value)} aria-expanded={routingInfoOpen} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs font-semibold text-[var(--vg-secondary)] hover:bg-[var(--vg-hover)]">How Verger routes<ChevronDown size={12} className={`shrink-0 transition-transform ${routingInfoOpen ? 'rotate-180' : ''}`} /></button>{routingInfoOpen ? <div className="mt-1 rounded-lg border border-[var(--vg-border)] bg-[var(--vg-raised)] p-3 text-[11px] leading-relaxed text-[var(--vg-muted)]"><p>{PLAYBOOK_SUMMARY}</p><p className="mt-2">Explicit corrections are saved per signed-in email and reused as examples. Only short request summaries and route metadata are stored.</p><button type="button" onClick={() => void clearRoutingHistory().then((ok) => { if (ok) { routingCorrections.current = []; setRoutingClearNote('Routing history cleared'); } else setRoutingClearNote('Could not clear history'); })} className="mt-2 min-h-11 rounded-lg border border-[var(--vg-border)] px-3 text-[11px] text-[var(--vg-secondary)]">Clear routing history</button>{routingClearNote ? <p role="status" className="mt-2 text-[10px] text-[var(--vg-success)]">{routingClearNote}</p> : null}</div> : null}</div></div> : null}
          </div>
          <span className="ml-auto min-w-0 max-w-[40%] truncate rounded-full border border-[color-mix(in_srgb,var(--vg-credit)_38%,var(--vg-border))] bg-[var(--vg-credit-soft)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--vg-credit-ink)]" title={credits?.unlimited ? 'Unlimited owner access' : typeof creditBalance === 'number' ? `${formatCredits(creditBalance)} credits available` : 'Credits'}>{credits?.unlimited ? creditLabel : typeof creditBalance === 'number' ? `${creditLabel} credits` : creditLabel}</span>
          <button type="button" onClick={newChat} disabled={busy} aria-label="New chat" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--vg-border)] px-3 text-xs font-semibold text-[var(--vg-secondary)] disabled:opacity-40"><MessageSquarePlus size={15} /><span className="hidden sm:inline">New</span></button>
        </header>
        {researchOpen ? <VergerResearchPanel refreshKey={researchRefreshKey} onClose={() => setResearchOpen(false)} onBrief={publishResearchBrief} /> : null}

        <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (!el) return; const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90; stickRef.current = nearBottom; setShowJump(!nearBottom); }} className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' }} aria-label="Conversation with Verger">
          {restoring ? <div role="status" className="mx-auto flex max-w-[740px] items-center gap-2 text-sm text-[var(--vg-muted)]"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" />Restoring your chat…</div> : null}
          {empty ? <div className="mx-auto flex min-h-[46vh] min-h-[40dvh] max-w-2xl flex-col items-center justify-center text-center"><div className="relative mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)]"><Sparkles size={22} /><span aria-hidden className="absolute -inset-8 -z-10 rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_18%,transparent)] blur-2xl" /></div><h1 className="font-[var(--display)] text-3xl font-bold tracking-tight text-[var(--vg-text)] sm:text-4xl">What should we make today?</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--vg-secondary)]">Describe your video — an idea, script, product link or footage. I’ll handle the rest.</p><div className="mt-6 flex flex-wrap justify-center gap-2" role="group" aria-label="Example requests">{chips.slice(0, 4).map((chip) => <button key={chip} type="button" onClick={() => void advance(chip)} className="min-h-11 rounded-full border border-[var(--vg-border)] bg-[var(--vg-raised)] px-4 text-xs text-[var(--vg-secondary)] hover:border-[var(--vg-accent)] hover:text-[var(--vg-text)]">{chip}</button>)}</div></div> : null}
          <div ref={contentRef} role="log" aria-live="polite" aria-relevant="additions" className="mx-auto w-full min-w-0 max-w-[740px] space-y-4">
            {visible.map((event, index) => {
              const isUser = event.role === 'user';
              const isNotice = !isUser && event.verger.kind === 'notice';
              const previous = visible[index - 1];
              const continuesAgent = !!previous && previous.role !== 'user' && previous.verger.kind !== 'notice';
              const readyUrl = event.content.startsWith('Video ready:') ? event.content.slice('Video ready:'.length).trim() : '';
              if (isUser) return <div key={event.id} className="flex min-w-0 justify-end"><div className="max-w-[84%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--vg-accent)_16%,var(--vg-raised))] px-4 py-3 text-[15px] leading-6 text-[var(--vg-text)]" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span className="sr-only">You: </span>{event.content}</div></div>;
              if (isNotice) return <div key={event.id} className="flex min-w-0 justify-start sm:pl-10"><div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-0 rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] px-3 py-1.5 text-xs leading-relaxed text-[var(--vg-secondary)]" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{readyUrl ? 'Your video is ready.' : event.content}{readyUrl ? <button type="button" onClick={() => { if (ready) setReadyOpen(true); else window.open(readyUrl, '_blank', 'noopener'); }} className="-my-1 flex min-h-11 items-center gap-2 rounded-lg border border-[var(--vg-accent)] px-3 text-xs text-[var(--vg-accent)]"><Play size={13} />Watch</button> : null}</div></div>;
              return <div key={event.id} className="flex min-w-0 items-start gap-3">{continuesAgent ? <span aria-hidden className="w-7 shrink-0" /> : <span aria-hidden className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)]"><Sparkles size={13} /></span>}<div className="min-w-0 max-w-[680px] py-1 text-[15px] leading-6 text-[var(--vg-text)]" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><span className="sr-only">Verger: </span>{event.content}</div></div>;
            })}
            {thinking ? <details className="rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)] px-3 sm:ml-10" open={busy && !question}><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden"><span className={busy ? 'verger-shimmer bg-[linear-gradient(90deg,var(--vg-muted),var(--vg-accent),var(--vg-muted))] bg-[length:200%_100%] bg-clip-text text-transparent' : 'text-[var(--vg-secondary)]'} style={{ animation: busy ? 'verger-shimmer 1.7s linear infinite' : undefined }}>{busy ? 'Verger is thinking' : `Thought for ${thinking.seconds || 1}s`}</span><ChevronDown size={12} className="ml-auto text-[var(--vg-muted)]" /></summary><p className="pb-3 text-xs leading-relaxed text-[var(--vg-muted)]">{thinking.text}</p></details> : busy ? <div aria-hidden className="flex min-h-11 items-center gap-1 px-3 sm:ml-10"><span className="verger-dot h-1.5 w-1.5 rounded-full bg-[var(--vg-accent)]" /><span className="verger-dot h-1.5 w-1.5 rounded-full bg-[var(--vg-accent)]" style={{ animationDelay: '160ms' }} /><span className="verger-dot h-1.5 w-1.5 rounded-full bg-[var(--vg-accent)]" style={{ animationDelay: '320ms' }} /></div> : null}
            {showProduction ? <ProductionCard steps={steps} percent={percent} running={productionRunning} waiting={!!question} video={cardVideo} collapsed={productionCollapsed || !!question} onToggle={() => setProductionCollapsed((value) => !value)} onDismiss={() => setProductionDismissed(true)} onRetry={retryStep} onWatch={() => setReadyOpen(true)} /> : null}
            {question ? <div role="group" aria-labelledby="verger-question-prompt" className="rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_55%,var(--vg-border))] bg-[var(--vg-raised)] p-4 shadow-[0_0_30px_color-mix(in_srgb,var(--vg-accent)_10%,transparent)]">
              <div className="flex items-start gap-3 pb-3"><span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--vg-accent)_14%,transparent)] text-[var(--vg-accent)]"><QuestionIcon size={17} /></span><div className="min-w-0">{labelRepeatsPrompt(question.label, question.prompt) ? null : <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--vg-accent)]">{question.label}</p>}<p id="verger-question-prompt" className="mt-1 break-words text-sm font-semibold leading-relaxed text-[var(--vg-text)]">{question.prompt}</p></div></div>
              {question.options.map((option, index) => question.multi
                ? <button key={option.label} type="button" onClick={() => toggleMultiPick(index)} aria-pressed={multiPicks.includes(index)} className={`mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ${multiPicks.includes(index) ? 'border-[var(--vg-accent)] bg-[color-mix(in_srgb,var(--vg-accent)_10%,transparent)] text-[var(--vg-text)]' : 'border-[var(--vg-border)] hover:border-[var(--vg-accent)]'}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${multiPicks.includes(index) ? 'border-[var(--vg-accent)] bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'border-[var(--vg-border)] text-transparent'}`}><Check size={13} /></span><OptionLabel option={option} /></button>
                : <button key={option.label} type="button" onClick={() => void advance(option.label, index)} className="mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border border-[var(--vg-border)] px-3 py-2 text-left text-sm hover:border-[var(--vg-accent)]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_16%,transparent)] text-xs text-[var(--vg-accent)]">{index + 1}</span><OptionLabel option={option} /></button>)}
              {question.multi ? <button type="button" disabled={!multiPicks.length} onClick={() => void advance(multiPicks.sort((a, b) => a - b).map((index) => question.options[index]?.label).filter(Boolean).join(', '), -1)} className="mt-1 min-h-11 w-full rounded-xl bg-[image:var(--vg-gradient-action)] text-sm font-bold text-[var(--vg-on-accent)] disabled:opacity-40">Done{multiPicks.length ? ` — ${multiPicks.length} selected` : ''}</button> : null}
              {question.allowOwn && question.options.length > 0 ? <p className="mt-2 text-[11px] text-[var(--vg-muted)]">Or type your own answer below.</p> : null}
            </div> : null}
            {shownError ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--vg-danger)] bg-[var(--vg-danger-bg)] p-3 text-sm text-[var(--vg-danger)]"><span className="min-w-0 flex-1">{userSafeText(shownError)}</span><button type="button" onClick={() => { setError(''); if (retryRef.current) void retryRef.current(); }} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--vg-danger)] px-3 text-xs font-semibold"><RotateCcw size={13} />Retry</button></div> : null}
          </div>
        </div>

        <div className="relative shrink-0 bg-[var(--vg-bg)]">
        <p className="sr-only" role="status" aria-live="polite">{busy ? 'Verger is working on your request.' : ''}</p>
        {showJump ? <button type="button" onClick={jumpToLatest} aria-label="Jump to the latest message" className="absolute -top-14 left-1/2 z-20 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full border border-[var(--vg-border)] bg-[var(--vg-raised)] text-[var(--vg-secondary)] shadow-lg hover:border-[var(--vg-accent)]"><ArrowDown size={16} /></button> : null}
        {modeOpen ? <><div aria-hidden className="fixed inset-0 z-20" onClick={() => setModeOpen(false)} /><div className="pointer-events-none absolute inset-x-0 bottom-full z-30"><div className="mx-auto w-[calc(100%-32px)] max-w-[740px]"><div role="dialog" aria-label="Mode and budget" onKeyDown={(event) => { if (event.key === 'Escape') setModeOpen(false); }} className="pointer-events-auto mb-2 w-[min(300px,100%)] rounded-xl border border-[var(--vg-border)] bg-[var(--vg-bg)] p-2 shadow-2xl">
          <p className="mb-1.5 px-1 text-[11px] leading-relaxed text-[var(--vg-muted)]">{MODE_HELPER}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setMode('copilot')} aria-pressed={mode === 'copilot'} className={`min-h-11 rounded-full px-3 text-[11px] font-bold ${mode === 'copilot' ? 'bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]'}`}>Copilot</button>
            <button type="button" onClick={() => setMode('autopilot')} aria-pressed={mode === 'autopilot'} className={`min-h-11 rounded-full px-3 text-[11px] font-bold ${mode === 'autopilot' ? 'bg-[var(--vg-accent)] text-[var(--vg-on-accent)]' : 'text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]'}`}>Autopilot</button>
          </div>
          <p className="mt-1 px-1 text-[11px] leading-relaxed text-[var(--vg-muted)]">{mode === 'autopilot' ? 'Verger makes the whole video within your budget.' : 'Review the filled-in studio before anything is generated.'}</p>
          {mode === 'autopilot' ? <label className="mt-2 flex min-w-0 items-center gap-2 px-1 text-[11px] text-[var(--vg-secondary)]"><span className="shrink-0">Budget (credits)</span><input autoFocus type="number" min={1} value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value) || 1))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setModeOpen(false); } }} className="h-11 min-w-0 flex-1 rounded-full border border-[var(--vg-border)] bg-[var(--vg-raised)] px-3 text-xs tabular-nums text-[var(--vg-text)]" aria-label="Autopilot budget in credits" /></label> : null}
        </div></div></div></>  : null}
        {attachment ? <div className="mx-auto flex w-[calc(100%-32px)] max-w-[740px] items-center gap-2 rounded-t-xl border border-b-0 border-[var(--vg-border)] bg-[var(--vg-raised)] px-3 py-1 text-xs text-[var(--vg-secondary)]"><Paperclip size={13} className="text-[var(--vg-accent)]" /><span className="min-w-0 flex-1 truncate">{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="grid h-11 w-11 place-items-center" aria-label="Remove attachment"><X size={13} /></button></div> : null}
        <form onSubmit={(event) => void submit(event)} data-busy={busy ? 'true' : 'false'} className={`rim ${busy ? 'is-working' : ''} relative mx-auto mb-[max(12px,env(safe-area-inset-bottom))] w-[calc(100%-32px)] max-w-[740px] shrink-0 overflow-hidden p-px`}>
          <div className="verger-composer rounded-[20px] bg-[var(--vg-raised)] p-2">
            <div className="flex min-w-0 items-center px-1 pb-1">
              <button type="button" onClick={() => setModeOpen((value) => !value)} aria-expanded={modeOpen} aria-haspopup="dialog" aria-label="Mode and budget" className="flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--vg-accent)_30%,var(--vg-border))] px-3 text-[11px] font-bold tabular-nums text-[var(--vg-secondary)] hover:border-[var(--vg-accent)]" title={mode === 'autopilot' ? `Autopilot · budget ${formatCredits(budget)} credits` : 'Copilot'}><span className="truncate">{mode === 'autopilot' ? `Autopilot · ${formatCredits(budget)} cr` : 'Copilot'}</span><ChevronDown size={12} className={`shrink-0 transition-transform ${modeOpen ? 'rotate-180' : ''}`} /></button>
            </div>
            <div className="flex min-h-[56px] items-end gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { setAttachment(event.target.files?.[0] || null); event.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--vg-muted)] hover:bg-[var(--vg-hover)]" aria-label="Attach a file"><Paperclip size={17} /></button>
              <textarea ref={inputRef} rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return; event.preventDefault(); if (!canSend) return; const form = event.currentTarget.form; if (form?.requestSubmit) form.requestSubmit(); else form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }} disabled={inputLocked} aria-label="Message Verger" placeholder={inputLocked ? 'Verger is working…' : question ? 'Type your own answer…' : 'Describe the video you want…'} className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-[var(--vg-text)] outline-none placeholder:text-[var(--vg-muted)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-[15px]" />
              <button type={showStop ? 'button' : 'submit'} onClick={showStop ? () => { stoppedRef.current = true; setBusy(false); } : undefined} disabled={!showStop && !canSend} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${showStop ? 'border border-[var(--vg-danger)] text-[var(--vg-danger)]' : 'bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)]'} disabled:opacity-40`} aria-label={showStop ? 'Stop Verger' : 'Send message'}>{showStop ? <Square size={14} fill="currentColor" /> : <ArrowUp size={17} />}</button>
            </div>
          </div>
        </form>
        </div>
      </section>
    </div>
    {ready && readyOpen ? <ReadyDialog video={ready} onClose={() => setReadyOpen(false)} /> : null}
  </>;
}
