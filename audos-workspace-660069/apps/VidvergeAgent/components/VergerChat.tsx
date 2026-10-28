import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Bot,
  History,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  Paperclip,
  PenLine,
  Phone,
  PhoneOff,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  FALLBACK_CHIPS,
  planTurn,
  runDispatches,
  reportsAsContext,
  suggestChips,
} from '../lib/vergerPlanner';
import AgentLanes from './AgentLanes';
import type { AgentLaneRun } from './AgentLanes';
import type { ChatTurn, VergerMotionJob, VergerOpenStudio, VergerPlan, VergerQuestion } from '../lib/vergerPlanner';
import { subAgentById } from '../lib/subAgents';
import {
  appendEvent,
  appendRunSnapshot,
  conversationTitle,
  loadConversation,
  loadConversationIndex,
  loadRunHistory,
  newConversationKey,
  nextSeq,
} from '../lib/vergerStore';
import type { ConversationSummary, StoredRow, StoredRun, VergerEvent } from '../lib/vergerStore';
import { describeCost, getCachedCredits, refreshCredits } from '../../../lib/credits';
import type { VidvergeAttachment } from '../../../lib/vidvergeHandoff';
import type { QueueJob } from '../types';
import { listVideoHistory } from '../../../lib/videoHistory';
import { appCapability } from '../lib/capabilities';
import { inspectVideoMetadata, motionEngine, type MotionResponse, type MotionSourceMedia } from '../../../lib/motionEngineSdk';
import { callHook } from '../../../lib/workspace';
import { loadPremadeVoices, speakReply, stopSpeaking } from '../lib/vergerVoice';
import {
  executeOneCommandProduction,
  isOneCommandVideoRequest,
  planOneCommandProduction,
  quoteOneCommandProduction,
  type OneCommandProduction,
  type ProductionProgress,
} from '../lib/oneCommandProduction';

const MAX_PLAN_LOOPS = 3;
const CHIP_CACHE_KEY = 'verger_chips_v1';
const CHIP_CACHE_MS = 24 * 60 * 60 * 1000;
const HELP_CHIP = 'Help me';
const HELP_TURN = "Help me — I'm not sure what to make yet. Ask me what you need to know, with options.";

interface UiEvent extends Omit<StoredRow, 'createdAt' | 'conversationKey' | 'title'> {
  id: string;
}

interface RunUi {
  runId: string;
  agentType: string;
  name: string;
  task: string;
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  resultText?: string;
}

interface VergerChatProps {
  jobs: QueueJob[];
  onRouteStudio: (route: { appId: string; brief: string }, attachment: VidvergeAttachment | null) => Promise<{ message: string }>;
  onUploadAttachment: (file: File) => Promise<VidvergeAttachment>;
  onProjectChange?: (key: string, title: string) => void;
}

let uiId = 0;
function newId(): string {
  uiId += 1;
  return `ev-${Date.now()}-${uiId}`;
}

function eventToTurns(event: UiEvent): ChatTurn[] {
  const v = event.verger;
  if (!v) return [];
  if (v.kind === 'say') return [{ role: event.role, content: event.content }];
  if (v.kind === 'question' && v.question) {
    return [{ role: 'assistant', content: `${v.question.prompt}\nOptions: ${v.question.options.map((o, i) => `${i + 1}. ${o}`).join(' ')}` }];
  }
  if (v.kind === 'answer') return [{ role: 'user', content: event.content }];
  // Live Brand Kit/Library snapshots and specialist reports are persisted for
  // recovery, but are injected separately as one latest system snapshot. They
  // must never crowd the founder's real turns out of the sliding window.
  if (v.kind === 'results') return [];
  if (v.kind === 'notice') return [{ role: 'assistant', content: event.content }];
  return []; // Specialist reports reach the model through the persisted results event.
}

function restoreFromLog(
  rows: StoredRow[],
  storedRuns: StoredRun[],
): { events: UiEvent[]; runs: RunUi[]; question: VergerQuestion | null; pendingRoute: VergerOpenStudio | null } {
  const events: UiEvent[] = rows.map((row) => ({ id: newId(), role: row.role, content: row.content, verger: row.verger }));
  let question: VergerQuestion | null = null;
  let pendingRoute: VergerOpenStudio | null = null;
  for (const event of events) {
    const v = event.verger;
    if (!v) continue;
    if (v.kind === 'question' && v.question) {
      question = v.question;
      pendingRoute = v.pendingRoute || null;
    }
    if (v.kind === 'answer' || (v.kind === 'say' && event.role === 'user')) {
      question = null;
      pendingRoute = null;
    }
  }
  // A browser-only run cannot still be executing after reload. Keep it in the
  // history, but mark the interrupted snapshot failed instead of spinning forever.
  const runs: RunUi[] = storedRuns.map((run) => ({
    runId: run.runId,
    agentType: run.agentType,
    name: run.name,
    task: run.task,
    status: run.status === 'running' ? 'failed' : run.status,
    startedAt: Date.now(),
    resultText: run.resultText,
  }));
  return { events, runs, question, pendingRoute };
}

function friendlyError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason || 'Verger could not finish that turn.');
  if (/invalid workspace session|workspace session (?:is )?required|session verification|session (?:expired|invalid)|no_credentials/i.test(message)) {
    return 'Your email session could not be refreshed. Retry once; if it continues, sign in again.';
  }
  return message.replace(/\b(?:stack|trace|internal server error)\b[\s\S]*/i, 'The production service hit an internal error.');
}

function finishedVideoUrl(content: string): string | null {
  const match = String(content || '').match(/Finished video:\s*(https?:\/\/\S+\.mp4(?:\?\S*)?)/i);
  return match?.[1]?.replace(/[),.]+$/, '') || null;
}

function loadCachedChips(): string[] | null {
  try {
    const raw = window.localStorage.getItem(CHIP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.chips) || Date.now() - Number(parsed?.at || 0) > CHIP_CACHE_MS) return null;
    return parsed.chips.slice(0, 3);
  } catch {
    return null;
  }
}

export default function VergerChat({ jobs, onRouteStudio, onUploadAttachment, onProjectChange = () => undefined }: VergerChatProps) {
  const firstConversation = useRef({ key: newConversationKey(), title: 'New conversation' });
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [runs, setRuns] = useState<RunUi[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationKey, setConversationKey] = useState(firstConversation.current.key);
  const [conversationName, setConversationName] = useState(firstConversation.current.title);
  const [question, setQuestion] = useState<VergerQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string>('');
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [chips, setChips] = useState<string[]>(FALLBACK_CHIPS);
  const [storageWarned, setStorageWarned] = useState(false);
  const [queuedTurns, setQueuedTurns] = useState<string[]>([]);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'listening' | 'error'>('idle');
  const [callMuted, setCallMuted] = useState(false);
  const [callMessage, setCallMessage] = useState('');
  const [streamingReveal, setStreamingReveal] = useState<{ id: string; text: string; chars: number } | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(() => new Set());

  const eventsRef = useRef<UiEvent[]>([]);
  const conversationKeyRef = useRef(conversationKey);
  const conversationNameRef = useRef(conversationName);
  const restoreTicket = useRef(0);
  const pendingRoute = useRef<VergerOpenStudio | null>(null);
  const pendingMotion = useRef<VergerMotionJob | null>(null);
  const pendingProduction = useRef<OneCommandProduction | null>(null);
  const lastAttachment = useRef<VidvergeAttachment | null>(null);
  const lastTurn = useRef<{ text: string; optionIndex?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const jobsRef = useRef<QueueJob[]>(jobs);
  const abortRef = useRef<AbortController | null>(null);
  const liveContextRef = useRef('');
  const latestSpecialistResultsRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  const callVoiceRef = useRef('');
  const callErrorRef = useRef(false);
  const busyRef = useRef(busy);
  jobsRef.current = jobs;
  busyRef.current = busy;
  conversationKeyRef.current = conversationKey;
  conversationNameRef.current = conversationName;

  async function openConversation(summary: ConversationSummary): Promise<void> {
    const ticket = restoreTicket.current + 1;
    restoreTicket.current = ticket;
    setRestoring(true);
    setError('');
    try {
      const [rows, storedRuns] = await Promise.all([
        loadConversation(summary.key),
        loadRunHistory(summary.key),
      ]);
      if (restoreTicket.current !== ticket) return;
      const restored = restoreFromLog(rows, storedRuns);
      conversationKeyRef.current = summary.key;
      conversationNameRef.current = summary.title;
      eventsRef.current = restored.events;
      latestSpecialistResultsRef.current = [...restored.events]
        .reverse()
        .find((event) => event.verger?.kind === 'results' && event.content.startsWith('[sub-agent results]'))?.content || '';
      pendingRoute.current = restored.pendingRoute;
      pendingMotion.current = null;
      const productionQuestion = [...restored.events]
        .reverse()
        .find((event) => event.verger?.kind === 'question' && (event.verger as any).pendingProduction);
      pendingProduction.current = restored.question
        ? ((productionQuestion?.verger as any)?.pendingProduction || null)
        : null;
      setConversationKey(summary.key);
      setConversationName(summary.title);
      setEvents(restored.events);
      setRuns(restored.runs);
      setQuestion(restored.question);
      lastAttachment.current = null;
    } catch (loadError) {
      if (restoreTicket.current === ticket) {
        setError(friendlyError(loadError));
      }
    } finally {
      if (restoreTicket.current === ticket) setRestoring(false);
    }
  }

  function startNewConversation(): void {
    if (busy || restoring) return;
    restoreTicket.current += 1;
    const key = newConversationKey();
    conversationKeyRef.current = key;
    conversationNameRef.current = 'New conversation';
    eventsRef.current = [];
    latestSpecialistResultsRef.current = '';
    liveContextRef.current = '';
    pendingRoute.current = null;
    pendingMotion.current = null;
    pendingProduction.current = null;
    lastAttachment.current = null;
    setConversationKey(key);
    setConversationName('New conversation');
    setEvents([]);
    setRuns([]);
    setQuestion(null);
    setError('');
    setStorageWarned(false);
  }

  function switchConversation(key: string): void {
    const summary = conversations.find((item) => item.key === key);
    if (summary && summary.key !== conversationKeyRef.current && !busy && !restoring) void openConversation(summary);
  }

  useEffect(() => {
    let cancelled = false;
    void loadConversationIndex()
      .then((index) => {
        if (cancelled) return;
        setConversations(index);
        if (index.length) return openConversation(index[0]);
        setRestoring(false);
        return undefined;
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(friendlyError(loadError));
        setRestoring(false);
      });
    const cached = loadCachedChips();
    if (cached) {
      setChips(cached);
    } else {
      void suggestChips()
        .then((fresh) => {
          if (cancelled) return;
          setChips(fresh);
          try {
            window.localStorage.setItem(CHIP_CACHE_KEY, JSON.stringify({ chips: fresh, at: Date.now() }));
          } catch { /* private mode */ }
        })
        .catch(() => { /* fallback chips already shown */ });
    }
    void refreshCredits().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [events, runs, busy, question, streamingReveal?.chars]);

  useEffect(() => {
    if (!streamingReveal || streamingReveal.chars >= streamingReveal.text.length) return;
    const timer = window.setTimeout(() => {
      setStreamingReveal((current) => current ? { ...current, chars: Math.min(current.text.length, current.chars + 8) } : null);
    }, 16);
    return () => window.clearTimeout(timer);
  }, [streamingReveal]);

  useEffect(() => {
    onProjectChange(conversationKey, conversationName);
  }, [conversationKey, conversationName, onProjectChange]);

  useEffect(() => {
    const useVideoContext = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const scene = String(detail.sceneLabel || 'selected scene');
      const seconds = Number(detail.timestampSec || 0).toFixed(2);
      setInput((current) => current || `In ${scene} at ${seconds}s, `);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('verger-video-context', useVideoContext);
    return () => window.removeEventListener('verger-video-context', useVideoContext);
  }, []);

  useEffect(() => () => {
    callActiveRef.current = false;
    recognitionRef.current?.stop?.();
    stopSpeaking();
  }, []);

  useEffect(() => {
    if (busy || restoring || queuedTurns.length === 0) return;
    const [next, ...rest] = queuedTurns;
    setQueuedTurns(rest);
    void advance(next);
  }, [busy, restoring, queuedTurns]);

  async function speakDuringCall(text: string): Promise<void> {
    if (!callActiveRef.current || callMuted || !text.trim()) return;
    try {
      if (!callVoiceRef.current) {
        const voices = await loadPremadeVoices();
        callVoiceRef.current = voices[0]?.id || '';
      }
      if (callVoiceRef.current) await speakReply(text, callVoiceRef.current);
    } catch {
      setCallMessage('Voice playback is unavailable, but the call transcript will keep working.');
    }
  }

  async function startCall(): Promise<void> {
    if (callActiveRef.current) return;
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setCallStatus('error');
      setCallMessage('Live voice is not supported in this browser. You can keep chatting by text.');
      return;
    }
    setCallStatus('connecting');
    setCallMessage('Requesting microphone access…');
    try {
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach((track) => track.stop());
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      recognition.onstart = () => {
        callErrorRef.current = false;
        callActiveRef.current = true;
        setCallStatus('listening');
        setCallMessage('Listening — speak naturally. Your transcript appears in this chat.');
      };
      recognition.onresult = (event: any) => {
        let finalText = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) finalText += String(event.results[index][0]?.transcript || '');
        }
        const transcript = finalText.trim();
        if (!transcript) return;
        if (busyRef.current) setQueuedTurns((previous) => [...previous, transcript]);
        else void advance(transcript);
      };
      recognition.onerror = (event: any) => {
        if (event?.error === 'no-speech' && callActiveRef.current) return;
        callErrorRef.current = true;
        callActiveRef.current = false;
        setCallStatus('error');
        setCallMessage(event?.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it in your browser settings, then retry.'
          : 'The voice call ended unexpectedly. Your chat is saved; you can retry the call.');
      };
      recognition.onend = () => {
        if (!callActiveRef.current) {
          if (!callErrorRef.current) {
            setCallStatus('idle');
            setCallMessage('');
          }
          return;
        }
        window.setTimeout(() => {
          if (callActiveRef.current) {
            try { recognition.start(); } catch { /* already restarting */ }
          }
        }, 250);
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      callErrorRef.current = true;
      callActiveRef.current = false;
      setCallStatus('error');
      setCallMessage('Microphone access is unavailable. Allow it in your browser settings, then retry.');
    }
  }

  function endCall(): void {
    callErrorRef.current = false;
    callActiveRef.current = false;
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    stopSpeaking();
    setCallStatus('idle');
    setCallMessage('Call ended. The transcript is saved in this conversation.');
  }

  function toggleCallMute(): void {
    setCallMuted((current) => {
      const next = !current;
      if (next) stopSpeaking();
      return next;
    });
  }

  async function push(role: 'user' | 'assistant', content: string, verger: VergerEvent): Promise<void> {
    const event: UiEvent = { id: newId(), role, content, verger };
    eventsRef.current = [...eventsRef.current, event];
    setEvents(eventsRef.current);
    if (role === 'assistant' && verger.kind === 'say') {
      setStreamingReveal({ id: event.id, text: content, chars: 0 });
    }
    const saved = await appendEvent(
      conversationKeyRef.current,
      conversationNameRef.current,
      role,
      content,
      verger,
    );
    if (!saved) {
      if (!storageWarned) setStorageWarned(true);
      return;
    }
    const updatedAt = new Date().toISOString();
    setConversations((previous) => {
      const existing = previous.find((item) => item.key === conversationKeyRef.current);
      const current: ConversationSummary = {
        key: conversationKeyRef.current,
        title: conversationNameRef.current,
        updatedAt,
        messageCount: (existing?.messageCount || 0) + 1,
      };
      return [current, ...previous.filter((item) => item.key !== current.key)];
    });
  }

  function historyForModel(): ChatTurn[] {
    return eventsRef.current.flatMap(eventToTurns);
  }

  function queueSummary(): string {
    return jobsRef.current
      .slice(0, 5)
      .map((job) => `${job.name} — ${job.app}: ${job.stage} (${job.state})`)
      .join('; ');
  }

  function contextDigest(): string {
    const conversation = historyForModel()
      .slice(-12)
      .map((turn) => `${turn.role}: ${turn.content.slice(0, 700)}`)
      .join('\n');
    return `${liveContextRef.current}\n\n${conversation}`.trim();
  }

  function pinnedFacts(): string {
    const conversational = eventsRef.current.filter((event) =>
      event.verger?.kind === 'say' || event.verger?.kind === 'answer' || event.verger?.kind === 'question',
    );
    const userTurns = conversational.filter((event) => event.role === 'user').map((event) => event.content);
    const combined = userTurns.join('\n');
    const urls = Array.from(new Set(combined.match(/https?:\/\/[^\s<>"')\]]+/gi) || [])).slice(-3);
    const duration = combined.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[0] || 'not explicitly specified';
    const ratio = combined.match(/\b(?:9:16|16:9|1:1|portrait|vertical|landscape|square)\b/i)?.[0] || 'not explicitly specified';
    const answers: string[] = [];
    for (let index = 1; index < conversational.length; index += 1) {
      const current = conversational[index];
      const previous = conversational[index - 1];
      if (current.verger?.kind === 'answer' && previous.verger?.kind === 'question') {
        answers.push(`${previous.content.slice(0, 220)} => ${current.content.slice(0, 220)}`);
      }
    }
    return [
      `Goal / user wording: ${(userTurns[0] || 'not stated').slice(0, 700)}`,
      `Latest user instruction: ${(userTurns[userTurns.length - 1] || 'not stated').slice(0, 700)}`,
      `Source URL(s): ${urls.length ? urls.join(', ') : 'none supplied'}`,
      `Duration: ${duration}`,
      `Aspect ratio: ${ratio}`,
      `Answered questions: ${answers.length ? answers.slice(-6).join(' | ') : 'none'}`,
    ].join('\n');
  }

  function savedBrandExists(): boolean {
    const context = liveContextRef.current;
    return Boolean(context) && !context.includes('No saved Brand Kit data was returned.') &&
      (/"brands"\s*:\s*\[[\s\S]*?\{/.test(context) || context.includes('legacySavedBrandContext'));
  }

  function urlToVideoPlan(text: string): VergerPlan | null {
    const rawUrl = text.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0]?.replace(/[.,!?]+$/, '');
    if (!rawUrl || !savedBrandExists()) return null;
    const duration = Math.max(5, Math.min(600, Number(text.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[1]) || 30));
    const aspectRatio: VergerMotionJob['aspectRatio'] = /\b(?:9:16|portrait|vertical|shorts?|reels?|tiktok)\b/i.test(text) ? '9:16' : '16:9';
    const brandContext = liveContextRef.current.split('[LIVE LIBRARY CONTEXT')[0].slice(0, 6000);
    return {
      say: `I’ll use your saved Brand Kit and the website as the source. I’m assuming ${duration}s, ${aspectRatio}, with the tone and visual identity from your brand.`,
      askQuestion: null,
      dispatch: [],
      openStudio: null,
      visualEdit: null,
      motionJob: {
        operation: 'create',
        projectId: null,
        brief: `Create a polished SaaS/product launch video from ${rawUrl}. User request: ${text}. Duration: ${duration} seconds. Aspect ratio: ${aspectRatio}. Extract only supportable product claims and visuals from the supplied website. Apply this saved Brand Kit evidence:\n${brandContext}`,
        mode: 'saas-launch',
        aspectRatio,
        durationSeconds: duration,
        estimatedPaidSeconds: duration,
        sourceUrl: rawUrl,
      },
      done: true,
    };
  }

  function questionWasRecentlyAsked(prompt: string): boolean {
    const words = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean));
    const candidate = words(prompt);
    if (!candidate.size) return false;
    return eventsRef.current
      .filter((event) => event.verger?.kind === 'question')
      .slice(-3)
      .some((event) => {
        const previous = words(event.content);
        const overlap = [...candidate].filter((word) => previous.has(word)).length;
        return overlap / Math.max(candidate.size, previous.size, 1) >= 0.72;
      });
  }

  async function loadLiveAgentContext(): Promise<string> {
    const [brandResult, libraryResult] = await Promise.allSettled([
      callHook<any>('brand-kit-store', { op: 'load' }),
      listVideoHistory(20),
    ]);
    const brandPayload = brandResult.status === 'fulfilled' ? brandResult.value : null;
    const brand = brandPayload?.document || null;
    const videos = libraryResult.status === 'fulfilled' ? libraryResult.value : [];
    const brandText = brand
      ? JSON.stringify({ defaultBrandId: brand.defaultBrandId, brands: brand.brands || [] }).slice(0, 12000)
      : brandPayload?.legacyText
        ? JSON.stringify({ legacySavedBrandContext: String(brandPayload.legacyText) }).slice(0, 12000)
        : 'No saved Brand Kit data was returned.';
    const libraryText = JSON.stringify(videos.map((video) => ({ id: video.id, appId: video.app_id, title: video.title, videoUrl: video.video_url, durationSec: video.duration_sec }))).slice(0, 12000);
    return `[LIVE BRAND KIT CONTEXT — real brand-kit-store response]\n${brandText}\n\n[LIVE LIBRARY CONTEXT — real vge-list-videos response]\n${libraryText || '[]'}`;
  }

  async function retryAgent(run: AgentLaneRun): Promise<void> {
    if (busy || run.agentType === 'orchestrator') return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    setRuns((previous) => previous.map((item) => item.runId === run.runId ? { ...item, status: 'running', resultText: '' } : item));
    try {
      const [report] = await runDispatches([{ agentType: run.agentType, task: run.task }], contextDigest(), undefined, controller.signal);
      if (!report) throw new Error('The specialist returned no result.');
      const status = report.ok ? 'done' : 'failed';
      setRuns((previous) => previous.map((item) => item.runId === run.runId ? { ...item, status, resultText: report.text } : item));
      await appendRunSnapshot(conversationKeyRef.current, { runId: run.runId, agentType: report.agentType, name: report.name, task: report.task, status, resultText: report.text });
      const reportContext = reportsAsContext([report]);
      latestSpecialistResultsRef.current = reportContext;
      await push('user', reportContext, { kind: 'results', seq: nextSeq() });
      if (!report.ok) setError(report.text);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The specialist retry failed.';
      setRuns((previous) => previous.map((item) => item.runId === run.runId ? { ...item, status: 'failed', resultText: message } : item));
      setError(message);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  async function executeRoute(route: VergerOpenStudio): Promise<void> {
    const capability = appCapability(route.appId);
    const result = await onRouteStudio({ appId: route.appId, brief: route.brief }, lastAttachment.current);
    const message = result?.message || (capability?.routable
      ? 'Opening the studio with your brief prefilled — I’ll keep the handoff and status connected to this conversation.'
      : `Opening ${capability?.name || 'the studio'} for hands-on work — your projects and finished videos stay in the shared library.`);
    await push('assistant', message, { kind: 'notice', seq: nextSeq() });
  }

  async function updateProductionProgress(progress: ProductionProgress): Promise<void> {
    const runId = `production-${progress.id}`;
    const status = progress.status;
    const next: RunUi = {
      runId,
      agentType: `production-${progress.id}`,
      name: progress.name,
      task: progress.detail,
      status,
      startedAt: Date.now(),
      resultText: progress.detail,
    };
    setRuns((previous) => {
      const existing = previous.findIndex((run) => run.runId === runId);
      if (existing < 0) return [...previous, next];
      return previous.map((run, index) => index === existing ? { ...run, ...next, startedAt: run.startedAt } : run);
    });
    await appendRunSnapshot(conversationKeyRef.current, {
      runId,
      agentType: next.agentType,
      name: next.name,
      task: next.task,
      status,
      resultText: progress.detail,
    });
  }

  async function executeProduction(plan: OneCommandProduction, signal?: AbortSignal): Promise<void> {
    const result = await executeOneCommandProduction(
      plan,
      lastAttachment.current,
      (progress) => { void updateProductionProgress(progress); },
      signal,
    );
    const message = `Finished video: ${result.videoUrl}\n\nYour ${plan.durationSeconds}s MP4 is saved in Videos and ready to download.`;
    await push('assistant', message, { kind: 'notice', seq: nextSeq() });
    void speakDuringCall('Your finished video is ready and saved in Videos.');
  }

  async function prepareOneCommandProduction(text: string, signal?: AbortSignal): Promise<boolean> {
    if (!isOneCommandVideoRequest(text)) return false;
    await updateProductionProgress({ id: 'plan', name: 'Plan & script', status: 'running', detail: 'Planning the script, character direction, scenes, voice, music and delivery route from your single brief.' });
    const production = await planOneCommandProduction(text, liveContextRef.current, lastAttachment.current, signal);
    await updateProductionProgress({ id: 'plan', name: 'Plan & script', status: 'done', detail: `${production.title}: ${production.scenes.length} scenes, ${production.characterChoice}` });
    const quote = await quoteOneCommandProduction(production);
    pendingProduction.current = production;
    const founderFree = quote?.state?.unlimited === true;
    const cost = founderFree ? '0 credits for this verified founder test' : `${quote?.cost ?? production.durationSeconds} credits`;
    const balance = quote && !founderFree ? ` You have ${quote.balance}.` : '';
    const prompt = `Plan ready: ${production.durationSeconds}s · ${production.aspectRatio} · ${cost}. Voice: ${production.voiceName}. Music and final visual QA are included.${balance} Start generation?`;
    const confirm: VergerQuestion = {
      prompt,
      options: [`Yes — generate the finished video`, 'Not yet — revise the plan'],
      allowOwn: true,
    };
    setQuestion(confirm);
    await push('assistant', `I planned the full production from your command: script, ${production.characterChoice.toLowerCase()}, ${production.scenes.length} scenes, ${production.voiceName} voiceover, original music, render and QA.`, { kind: 'say', seq: nextSeq() });
    await push('assistant', prompt, { kind: 'question', seq: nextSeq(), question: confirm, ...( { pendingProduction: production } as any ) });
    return true;
  }

  async function executeMotion(spec: VergerMotionJob, billingAuthorized = false): Promise<void> {
    const sourceMedia: MotionSourceMedia[] = [];
    const attached = lastAttachment.current;
    if (attached?.url) {
      const kind = attached.type.startsWith('video/') ? 'video' : attached.type.startsWith('image/') ? 'screenshot' : attached.type.startsWith('audio/') ? 'audio' : 'reference';
      const measured = kind === 'video' ? await inspectVideoMetadata(attached.url).catch(() => ({})) : {};
      sourceMedia.push({ id: 'verger-attachment', kind, url: attached.url, mimeType: attached.type, approved: true, ...measured, provenance: { ...((measured as any).provenance || {}), source: 'verger_attachment', name: attached.name } });
    }
    if (spec.sourceUrl) sourceMedia.push({ id: 'verger-url', kind: spec.mode === 'saas-launch' ? 'website' : 'reference', url: spec.sourceUrl, approved: true, provenance: { source: 'user_supplied_url' } });
    const job = {
      idempotencyKey: `motion:verger:${conversationKeyRef.current}:${spec.operation}:${spec.projectId || 'new'}:${nextSeq()}`,
      billingAuthorized,
      durationSeconds: spec.durationSeconds,
      aspectRatio: spec.aspectRatio,
      mode: spec.mode,
      submittedBy: 'verger',
    };
    let response: MotionResponse;
    if (spec.operation === 'create' || !spec.projectId) {
      response = await motionEngine.create({
        app: 'vidverge-agent',
        name: conversationNameRef.current || 'Verger motion project',
        prompt: spec.brief,
        brief: { objective: spec.brief, durationSeconds: spec.durationSeconds, mode: spec.mode },
        mode: spec.mode,
        durationSeconds: spec.durationSeconds,
        aspectRatio: spec.aspectRatio,
        sourceMedia,
        submittedBy: 'verger',
        autoStart: true,
        startOperation: spec.operation === 'analyze'
          ? 'analyze'
          : spec.operation === 'generate' || spec.operation === 'render'
            ? spec.operation
            : billingAuthorized && spec.estimatedPaidSeconds > 0
              ? 'generate'
              : 'plan',
        job,
      });
    } else if (spec.operation === 'analyze') response = await motionEngine.analyze(spec.projectId, job, { sourceMedia });
    else if (spec.operation === 'plan') response = await motionEngine.plan(spec.projectId, job, { sourceMedia });
    else if (spec.operation === 'generate') response = await motionEngine.generate(spec.projectId, job, { instruction: spec.brief, sourceMedia });
    else if (spec.operation === 'revise') response = await motionEngine.revise(spec.projectId, job, { instruction: spec.brief, preserve: ['approved media', 'unaffected scenes', 'verified claims'] });
    else if (spec.operation === 'render') response = await motionEngine.render(spec.projectId, job, { instruction: spec.brief });
    else response = await motionEngine.export(spec.projectId, job, { instruction: spec.brief });
    const projectId = response.project?.id || spec.projectId;
    const jobId = response.job?.id;
    const stage = response.job?.stage || response.project?.status || 'saved';
    await push('assistant', `Motion project ${projectId}${jobId ? ` · job ${jobId}` : ''} is ${stage}. It is durable, so you can keep chatting or close this tab; ask me for status or a targeted revision using that project id.`, { kind: 'notice', seq: nextSeq() });
  }

  async function handlePlan(plan: VergerPlan): Promise<void> {
    if (plan.say) {
      await push('assistant', plan.say, { kind: 'say', seq: nextSeq() });
      void speakDuringCall(plan.say);
    }
    if (plan.openStudio) {
      const route = plan.openStudio;
      if (route.estimatedSeconds > 0) {
        pendingRoute.current = route;
        const balance = getCachedCredits()?.balance;
        const prompt = `This step will generate about ${route.estimatedSeconds}s of video — ${describeCost(route.estimatedSeconds)}${typeof balance === 'number' ? ` (you have ${balance} credits)` : ''}. Start it?`;
        const confirm: VergerQuestion = {
          prompt,
          options: [`Yes — go ahead (${describeCost(route.estimatedSeconds)})`, 'Not yet — adjust the plan first'],
          allowOwn: true,
        };
        setQuestion(confirm);
        await push('assistant', prompt, { kind: 'question', seq: nextSeq(), question: confirm, pendingRoute: route });
        return;
      }
      await executeRoute(route);
    }
    if (plan.visualEdit) {
      window.location.hash = 'library';
      await push('assistant', `I opened Library for ${plan.visualEdit.sceneReference}. Your request is ready to apply through the shared versioned editor: ${plan.visualEdit.request}`, { kind: 'notice', seq: nextSeq() });
    }
    if (plan.motionJob) {
      if (plan.motionJob.estimatedPaidSeconds > 0) {
        pendingMotion.current = plan.motionJob;
        const balance = getCachedCredits()?.balance;
        const prompt = `This motion plan needs about ${plan.motionJob.estimatedPaidSeconds}s of newly generated media — ${describeCost(plan.motionJob.estimatedPaidSeconds)}${typeof balance === 'number' ? ` (you have ${balance} credits)` : ''}. Existing footage, coded graphics and repair are reused without another video-generation charge. Start it?`;
        const confirm: VergerQuestion = { prompt, options: [`Yes — go ahead (${describeCost(plan.motionJob.estimatedPaidSeconds)})`, 'Not yet — revise the plan'], allowOwn: true };
        setQuestion(confirm);
        await push('assistant', prompt, { kind: 'question', seq: nextSeq(), question: confirm });
        return;
      }
      await executeMotion(plan.motionJob, false);
    }
    if (plan.askQuestion) {
      if (questionWasRecentlyAsked(plan.askQuestion.prompt)) {
        const fallback = urlToVideoPlan(pinnedFacts());
        if (fallback) {
          await handlePlan(fallback);
          return;
        }
        await push('assistant', 'I already have that answer, so I’m keeping the known details and proceeding with sensible defaults.', { kind: 'notice', seq: nextSeq() });
        return;
      }
      setQuestion(plan.askQuestion);
      await push('assistant', plan.askQuestion.prompt, { kind: 'question', seq: nextSeq(), question: plan.askQuestion });
    }
  }

  async function advance(text: string, optionIndex?: number): Promise<void> {
    if (busy || restoring) return;
    const controller = new AbortController();
    abortRef.current = controller;
    lastTurn.current = { text, optionIndex };
    setError('');
    setBusy(true);
    try {
      const answering = question !== null;
      setQuestion(null);
      if (!eventsRef.current.length && conversationNameRef.current === 'New conversation') {
        const nextTitle = conversationTitle(text);
        conversationNameRef.current = nextTitle;
        setConversationName(nextTitle);
      }
      await push('user', text, answering ? { kind: 'answer', seq: nextSeq(), optionIndex: optionIndex ?? -1 } : { kind: 'say', seq: nextSeq() });

      // Every run gets one current Brand Kit + Library snapshot. It stays out of
      // conversation history and is injected as a system message instead.
      liveContextRef.current = await loadLiveAgentContext();

      // Re-sending the same URL while its credit card is awaiting a choice must
      // not create another confirmation or requirements question.
      if (answering && pendingMotion.current && optionIndex !== 0 && /https?:\/\//i.test(text)) {
        setQuestion(question);
        await push('assistant', 'The URL, Brand Kit and defaults are already locked in. Use the existing approval choice above to start, or tell me one change to make.', { kind: 'notice', seq: nextSeq() });
        return;
      }

      // Confirmed one-command production — execute the complete real tool chain
      // without another planner turn or another question.
      if (answering && pendingProduction.current && optionIndex === 0) {
        const production = pendingProduction.current;
        pendingProduction.current = null;
        await executeProduction(production, controller.signal);
        return;
      }
      if (answering && pendingProduction.current) pendingProduction.current = null;

      // Confirmed credit-spending route or motion job — execute without another model turn.
      if (answering && pendingMotion.current && optionIndex === 0) {
        const motion = pendingMotion.current;
        pendingMotion.current = null;
        await executeMotion(motion, true);
        return;
      }
      if (answering && pendingMotion.current) pendingMotion.current = null;
      if (answering && pendingRoute.current && optionIndex === 0) {
        const route = pendingRoute.current;
        pendingRoute.current = null;
        await executeRoute(route);
        return;
      }
      if (answering && pendingRoute.current) pendingRoute.current = null;

      // Deterministic one-command path: a clear make-video request is enough.
      // Verger plans every production choice once, quotes it, then the approval
      // runs voice, music, scenes, render, QA and delivery end to end.
      if (await prepareOneCommandProduction(text, controller.signal)) return;

      // Deterministic fast path retained for non-generation URL planning.
      const directUrlPlan = urlToVideoPlan(text);
      if (directUrlPlan) {
        await handlePlan(directUrlPlan);
        return;
      }

      for (let loop = 0; loop < MAX_PLAN_LOOPS; loop += 1) {
        const plan = await planTurn(historyForModel(), queueSummary(), pinnedFacts(), liveContextRef.current, latestSpecialistResultsRef.current, controller.signal);
        // The live Brand Kit and Library were already loaded above. Dispatch
        // specialists only when this plan genuinely needs analysis; forcing the
        // same two lanes every turn caused the previous profile loop.
        const dispatches = [...plan.dispatch];
        if (!dispatches.length) {
          await handlePlan(plan);
          return;
        }
        // Parallel specialists: show them running, persist each result, feed back.
        if (plan.say) {
          await push('assistant', plan.say, { kind: 'say', seq: nextSeq() });
          void speakDuringCall(plan.say);
        }
        const started: RunUi[] = dispatches.map((d, i) => ({
          runId: `${Date.now()}-${i}-${d.agentType}`,
          agentType: d.agentType,
          name: subAgentById(d.agentType)?.name || d.agentType,
          task: d.task,
          status: 'running' as const,
          startedAt: Date.now(),
        }));
        const runSaves = await Promise.all(started.map((run) => appendRunSnapshot(conversationKeyRef.current, run)));
        if (runSaves.some((saved) => !saved)) setStorageWarned(true);
        setRuns((previous) => [...previous, ...started]);
        const context = contextDigest();
        const reports = await runDispatches(dispatches, context, (report) => {
          const match = started.find((run) => run.runId.endsWith(`-${report.agentType}`) && run.status === 'running');
          if (!match) return;
          match.status = report.ok ? 'done' : 'failed';
          match.name = report.name;
          match.resultText = report.text;
          setRuns((previous) => previous.map((r) => (r.runId === match.runId
            ? { ...r, status: match.status, name: report.name, resultText: report.text }
            : r)));
          void appendRunSnapshot(conversationKeyRef.current, {
            runId: match.runId,
            agentType: report.agentType,
            name: report.name,
            task: report.task,
            status: match.status,
            resultText: report.text,
          }).then((saved) => { if (!saved) setStorageWarned(true); });
        }, controller.signal);
        const reportContext = reportsAsContext(reports);
        latestSpecialistResultsRef.current = reportContext;
        await push('user', reportContext, { kind: 'results', seq: nextSeq() });
      }
      // Loop budget exhausted — one final plan, dispatches ignored.
      const finalPlan = await planTurn(historyForModel(), queueSummary(), pinnedFacts(), liveContextRef.current, latestSpecialistResultsRef.current, controller.signal);
      await handlePlan({ ...finalPlan, dispatch: [] });
    } catch (err) {
      if (controller.signal.aborted) {
        await push('assistant', 'Stopped. I kept the conversation and completed steps, so you can redirect me without starting over.', { kind: 'notice', seq: nextSeq() });
        setRuns((previous) => previous.map((run) => run.status === 'running' ? { ...run, status: 'failed', resultText: 'Interrupted by the user.' } : run));
      } else {
        setError(friendlyError(err));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  }

  function stopRun(): void {
    abortRef.current?.abort();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = input.trim();
    if (!text || restoring) return;
    setInput('');
    if (busy) {
      setQueuedTurns((previous) => [...previous, text]);
      return;
    }
    let turn = text;
    if (attachment) {
      try {
        const uploaded = await onUploadAttachment(attachment);
        lastAttachment.current = uploaded;
        turn = `${text}\n[Attached file: ${uploaded.name} — ${uploaded.url}]`;
      } catch (err) {
        setError(friendlyError(err));
        return;
      } finally {
        setAttachment(null);
      }
    }
    await advance(turn, question ? -1 : undefined);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setAttachment(event.target.files?.[0] || null);
    event.target.value = '';
  }

  const visible = useMemo(
    () => events.filter((e) => e.verger && (e.verger.kind === 'say' || e.verger.kind === 'answer' || e.verger.kind === 'question' || e.verger.kind === 'notice')),
    [events],
  );
  const empty = !restoring && visible.length === 0;
  const conversationOptions = conversations.some((item) => item.key === conversationKey)
    ? conversations
    : [{ key: conversationKey, title: conversationName, updatedAt: '', messageCount: events.length }, ...conversations];
  return (
    <section className="mx-auto flex h-full min-h-0 w-full max-w-[960px] flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_22%,var(--vg-border))] bg-[color-mix(in_srgb,var(--vg-surface)_94%,transparent)] shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <header className="shrink-0 border-b border-[var(--vg-border)] px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[image:var(--vg-gradient-action)] text-[var(--vg-on-accent)] shadow-[0_10px_30px_color-mix(in_srgb,var(--vg-accent)_18%,transparent)]"><Bot size={18} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold tracking-tight text-[var(--vg-text)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Verger</h1>
            <p className="truncate text-[11px] text-[var(--vg-muted)]">{callStatus === 'listening' ? 'Live call · listening' : busy ? 'Working on it…' : 'Your Vidverge assistant'}</p>
          </div>
          {callStatus === 'listening' && (
            <button type="button" onClick={toggleCallMute} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--vg-border)] text-[var(--vg-secondary)] transition-colors hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)]" aria-label={callMuted ? 'Unmute Verger voice' : 'Mute Verger voice'}>
              {callMuted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-[var(--vg-accent)]" />}
            </button>
          )}
          <button
            type="button"
            onClick={callStatus === 'listening' || callStatus === 'connecting' ? endCall : () => void startCall()}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] ${callStatus === 'listening' ? 'border border-[color-mix(in_srgb,var(--vg-danger)_55%,transparent)] bg-[var(--vg-danger-bg)] text-[var(--vg-danger)]' : 'border border-[color-mix(in_srgb,var(--vg-accent)_42%,var(--vg-border))] bg-[var(--vg-accent-soft)] text-[var(--vg-accent)] hover:bg-[var(--vg-hover)]'}`}
          >
            {callStatus === 'connecting' ? <Loader2 size={15} className="animate-spin" /> : callStatus === 'listening' ? <PhoneOff size={15} /> : <Phone size={15} />}
            <span className="hidden xs:inline">{callStatus === 'listening' ? 'End' : 'Call'}</span>
          </button>
          <button
            type="button"
            onClick={startNewConversation}
            disabled={busy || restoring || (events.length === 0 && conversationName === 'New conversation')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--vg-border)] text-[var(--vg-secondary)] transition-colors hover:border-[color-mix(in_srgb,var(--vg-accent)_45%,transparent)] hover:bg-[var(--vg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vg-focus)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Start a new chat"
            title="New chat"
          >
            <MessageSquarePlus size={16} />
          </button>
        </div>
        <label className="relative mt-2 block min-w-0">
          <History size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vg-accent)]" />
          <span className="sr-only">Conversation history</span>
          <select
            value={conversationKey}
            onChange={(event) => switchConversation(event.target.value)}
            disabled={busy || restoring}
            className="h-9 w-full appearance-none rounded-lg border border-[var(--vg-border)] bg-[var(--vg-bg)] pl-8 pr-8 text-[11px] text-[var(--vg-secondary)] outline-none transition-colors hover:border-[var(--vg-control-border)] focus-visible:border-[var(--vg-focus)] disabled:opacity-60"
          >
            {conversationOptions.map((item) => <option key={item.key} value={item.key}>{item.title} · {item.messageCount} messages</option>)}
          </select>
        </label>
        {callMessage && <p className={`mt-2 text-[11px] ${callStatus === 'error' ? 'text-[var(--vg-warning)]' : 'text-[var(--vg-muted)]'}`} role="status">{callStatus === 'listening' ? <Mic size={12} className="mr-1 inline text-[var(--vg-accent)]" /> : callStatus === 'error' ? <MicOff size={12} className="mr-1 inline" /> : null}{callMessage}</p>}
      </header>

      {/* Transcript */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[radial-gradient(ellipse_70%_36%_at_50%_-8%,color-mix(in_srgb,var(--vg-accent)_7%,transparent),transparent_66%)] p-4 sm:p-6" aria-live="polite">
        {restoring && (
          <p className="flex items-center gap-2 text-[13px] text-[var(--vg-muted)]">
            <Loader2 size={14} className="animate-spin" /> Restoring your conversation…
          </p>
        )}
        {empty && (
          <div className="py-6 text-center">
            <p className="text-[17px] font-semibold text-[var(--vg-text)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              What do you want to make?
            </p>
            <p className="mx-auto mt-2 max-w-[460px] text-[13px] leading-relaxed text-[var(--vg-secondary)]">
              Describe the outcome, paste a URL, attach a script or drop in footage. I’ll plan and coordinate the work behind the scenes, then bring the result back here. You approve anything that spends credits.
            </p>
          </div>
        )}
        {visible.map((event) => {
          const isUser = event.role === 'user';
          const isNotice = event.verger?.kind === 'notice';
          return (
            <div key={event.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  isNotice
                    ? 'rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--vg-accent)_10%,transparent)] px-3 py-2 text-[12px] text-[var(--vg-secondary)]'
                    : isUser
                      ? 'max-w-[82%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--vg-accent)_16%,var(--vg-raised))] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--vg-text)]'
                      : 'max-w-[82%] rounded-2xl rounded-bl-md border border-[var(--vg-border)] bg-[var(--vg-raised)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--vg-text)]'
                }
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {streamingReveal?.id === event.id
                  ? event.content.slice(0, streamingReveal.chars)
                  : event.content}
                {!isUser && finishedVideoUrl(event.content) && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_35%,transparent)] bg-[var(--vg-bg)]">
                    <video src={finishedVideoUrl(event.content) || ''} controls playsInline className="aspect-video w-full bg-black object-contain" />
                    <a
                      href={finishedVideoUrl(event.content) || ''}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex min-h-11 items-center justify-center bg-[image:var(--vg-gradient-action)] px-4 text-[12px] font-bold text-[var(--vg-on-accent)]"
                    >
                      Download MP4
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {(busy || question || runs.length > 0) && (
          <AgentLanes
            runs={runs}
            busy={busy}
            waiting={Boolean(question)}
            expanded={expandedRuns}
            onToggle={(id) => setExpandedRuns((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
            onRetry={(run) => void retryAgent(run)}
          />
        )}
        {queuedTurns.length > 0 && (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--vg-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--vg-accent)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--vg-secondary)]">
            {queuedTurns.length} follow-up{queuedTurns.length === 1 ? '' : 's'} queued. Verger will read {queuedTurns.length === 1 ? 'it' : 'them'} next.
          </p>
        )}
      </div>

      {storageWarned && (
        <p className="mt-2 text-center text-[11px] text-[var(--vg-warning)]">
          Heads up: this conversation could not be saved, so a reload will start fresh.
        </p>
      )}

      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] bg-[var(--vg-danger-bg)] px-3 py-2">
          <p className="min-w-0 flex-1 text-[12px] text-[var(--vg-danger)]">{error} Your saved context and completed steps are intact; Retry will continue from them.</p>
          <button
            type="button"
            onClick={() => {
              setError('');
              if (lastTurn.current) void advance(lastTurn.current.text, lastTurn.current.optionIndex);
              else window.location.reload();
            }}
            className="flex shrink-0 items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] px-3 py-1 text-[12px] text-[var(--vg-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--vg-danger)_12%,transparent)]"
          >
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Question card with numbered options — sits ABOVE the input, per the founder's sketch */}
      {question && !busy && (
        <div className="mt-3 rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_40%,transparent)] bg-[var(--vg-raised)] p-3">
          <p className="px-1 pb-2 text-[13px] font-medium text-[var(--vg-text)]">{question.prompt}</p>
          <div className="space-y-1.5">
            {question.options.map((option, index) => (
              <button
                key={`${index}-${option}`}
                type="button"
                onClick={() => void advance(option, index)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--vg-border)] bg-[var(--vg-surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--vg-control-border)] hover:bg-[var(--vg-hover)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--vg-accent)_18%,transparent)] text-[12px] font-semibold text-[var(--vg-accent)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-[var(--vg-text)]">{option}</span>
                <ChevronRight size={15} className="shrink-0 text-[var(--vg-muted)]" />
              </button>
            ))}
            {question.allowOwn && (
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--vg-border)] px-3 py-2.5 text-left text-[13px] text-[var(--vg-secondary)] transition-colors hover:border-[var(--vg-control-border)] hover:text-[var(--vg-text)]"
              >
                <PenLine size={14} className="ml-1 shrink-0 text-[var(--vg-accent)]" />
                Write your own answer below
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggestion chips — three examples of what Verger can do, plus Help me */}
      {!question && !busy && empty && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {[...chips, HELP_CHIP].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => void advance(chip === HELP_CHIP ? HELP_TURN : chip)}
              className="rounded-full border border-[var(--vg-border)] bg-[var(--vg-surface)] px-3.5 py-1.5 text-[12px] text-[var(--vg-secondary)] transition-colors hover:border-[color-mix(in_srgb,var(--vg-accent)_40%,transparent)] hover:text-[var(--vg-text)]"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {attachment && (
        <div className="mt-2 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--vg-border)] bg-[var(--vg-surface)] px-3 py-1.5 text-[12px] text-[var(--vg-secondary)]">
            <Paperclip size={12} className="text-[var(--vg-accent)]" />
            <span className="max-w-[220px] truncate">{attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="transition-colors hover:text-[var(--vg-text)]">
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {/* Main input bar */}
      <form
        onSubmit={(e) => void submit(e)}
        className="mx-3 mb-[max(12px,env(safe-area-inset-bottom))] mt-3 flex shrink-0 items-center gap-2 rounded-[24px] border border-[var(--vg-border)] bg-[var(--vg-raised)] px-2 py-2 transition-colors focus-within:border-[var(--vg-focus)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--vg-focus)_14%,transparent)] sm:mx-4"
        style={{ boxShadow: '0 24px 60px -28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}
      >
        <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--vg-muted)] transition-colors hover:bg-[var(--vg-hover)] hover:text-[var(--vg-text)]"
          aria-label="Attach a reference, script or clip"
          title="Attach a reference, script or clip"
        >
          <Paperclip size={16} />
        </button>
        {busy && (
          <button
            type="button"
            onClick={stopRun}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] px-3 text-[12px] font-semibold text-[var(--vg-danger)] transition-colors hover:bg-[var(--vg-danger-bg)]"
            title="Stop this run"
          >
            <Square size={12} fill="currentColor" /> Stop
          </button>
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? 'Type a follow-up to queue…' : question ? 'Write your own answer…' : 'What do you want to make?'}
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-[var(--vg-text)] outline-none placeholder:text-[var(--vg-muted)]"
          aria-label="Tell Verger what you want to make"
        />
        <button
          type="submit"
          disabled={!input.trim() || restoring}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--vg-gradient-action)', color: 'var(--vg-on-accent)' }}
        >
          <ArrowUp size={15} />
          {busy ? 'Queue' : ''}
        </button>
      </form>
    </section>
  );
}
