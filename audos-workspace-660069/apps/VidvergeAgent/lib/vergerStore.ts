import { callHook } from '../../../lib/workspace';

export const LEGACY_CONVERSATION_KEY = 'legacy-current';
export type VergerEventKind = 'say' | 'question' | 'answer' | 'results' | 'notice' | 'project';

export interface VergerSceneVersion {
  id: string;
  videoUrl: string;
  label: string;
  createdAt: string;
  sourceVersionId?: string;
  editPrompt?: string;
  editWindow?: { startSec: number; endSec: number; timestampSec: number };
}

export interface VergerScene {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  activeVersionId: string;
  versions: VergerSceneVersion[];
}

export interface VergerProject {
  id: string;
  title: string;
  script: string;
  scenes: VergerScene[];
  assets: Array<{ id: string; kind: string; url: string; name: string }>;
  renders: Array<{ id: string; url: string; label: string; createdAt: string }>;
  runLog: Array<{ id: string; agent: string; status: string; detail: string; createdAt: string }>;
  editHistory: Array<{ id: string; sceneId: string; fromVersionId: string; toVersionId: string; request: string; createdAt: string }>;
  pendingOperation?: {
    operationId: string;
    sceneId: string;
    sourceVersionId: string;
    prompt: string;
    prepared: {
      sourceUrl: string;
      sourceDuration: number;
      clipUrl: string;
      window: { startSec: number; endSec: number; timestampSec: number };
      frames: Array<{ timestamp: number; url: string }>;
      prompt: string;
      request: string;
    };
    startedAt: string;
  };
  updatedAt: string;
}

export interface VergerEvent {
  kind: VergerEventKind;
  seq: number;
  question?: { prompt: string; options: string[]; allowOwn: boolean };
  pendingRoute?: { appId: string; brief: string; estimatedSeconds: number };
  pendingProduction?: unknown;
  optionIndex?: number;
  project?: VergerProject;
}

export interface StoredRow {
  conversationKey: string;
  title: string;
  role: 'user' | 'assistant';
  content: string;
  verger: VergerEvent;
  createdAt: string;
}

export interface StoredRun {
  conversationKey: string;
  runId: string;
  agentType: string;
  name: string;
  task: string;
  status: 'running' | 'done' | 'failed';
  resultText: string;
  seq: number;
  createdAt: string;
}

export interface ConversationSummary {
  key: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

function randomKey(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${rand}`;
}

export function newConversationKey(): string {
  return randomKey('verger-conversation');
}

export function conversationTitle(text: string): string {
  const clean = text.replace(/\[Attached file:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > 54 ? `${clean.slice(0, 51).trimEnd()}…` : clean;
}

let seqCounter = Date.now() % 1_000_000_000;
export function nextSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

function safeParse(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function toEvent(value: unknown): VergerEvent | null {
  const event = safeParse(value);
  if (!event || typeof event !== 'object' || typeof event.kind !== 'string') return null;
  if (!['say', 'question', 'answer', 'results', 'notice', 'project'].includes(event.kind)) return null;
  return { ...event, seq: Number(event.seq || 0) } as VergerEvent;
}

function toStoredRow(row: any): StoredRow | null {
  const event = toEvent(row?.event_data);
  if (!event || !row?.conversation_key) return null;
  return {
    conversationKey: String(row.conversation_key),
    title: String(row.title || 'New conversation'),
    role: row.role === 'user' ? 'user' : 'assistant',
    content: String(row.content || ''),
    verger: event,
    createdAt: String(row.created_at || ''),
  };
}

function sortRows(rows: StoredRow[]): StoredRow[] {
  return rows.sort((a, b) => {
    const byTime = Date.parse(a.createdAt || '0') - Date.parse(b.createdAt || '0');
    return byTime !== 0 ? byTime : a.verger.seq - b.verger.seq;
  });
}

async function store<T = any>(payload: Record<string, unknown>): Promise<T> {
  return callHook<T>('verger-store', payload);
}

export async function appendEvent(
  conversationKey: string,
  title: string,
  role: 'user' | 'assistant',
  content: string,
  event: VergerEvent,
): Promise<boolean> {
  try {
    const result = await store<any>({
      op: 'append_event',
      conversation_key: conversationKey,
      message_key: randomKey('verger-message'),
      title: title || 'New conversation',
      role,
      content: content || '…',
      kind: event.kind,
      sequence: event.seq,
      event_data: event,
    });
    return result?.ok === true;
  } catch (error) {
    console.warn('[Verger] could not persist a conversation event.', error);
    return false;
  }
}

export async function appendRunSnapshot(
  conversationKey: string,
  run: {
    runId: string;
    agentType: string;
    name: string;
    task: string;
    status: 'running' | 'done' | 'failed';
    resultText?: string;
  },
): Promise<boolean> {
  try {
    const result = await store<any>({
      op: 'append_run',
      conversation_key: conversationKey,
      run_key: run.runId,
      snapshot_key: randomKey('verger-run-snapshot'),
      agent_type: run.agentType,
      name: run.name,
      task: run.task,
      status: run.status,
      result_text: run.resultText || null,
      sequence: nextSeq(),
      run_data: { status: run.status },
    });
    return result?.ok === true;
  } catch (error) {
    console.warn('[Verger] could not persist a production step.', error);
    return false;
  }
}

export async function loadConversationIndex(): Promise<ConversationSummary[]> {
  try {
    const response = await store<any>({ op: 'list' });
    const rows: any[] = Array.isArray(response?.rows) ? response.rows : [];
    const summaries = new Map<string, ConversationSummary>();
    for (const row of rows) {
      const key = String(row.conversation_key || '');
      if (!key) continue;
      const updatedAt = String(row.created_at || '');
      const current = summaries.get(key);
      if (!current) summaries.set(key, { key, title: String(row.title || 'Conversation'), updatedAt, messageCount: 1 });
      else {
        current.messageCount += 1;
        if (Date.parse(updatedAt || '0') > Date.parse(current.updatedAt || '0')) {
          current.updatedAt = updatedAt;
          current.title = String(row.title || current.title);
        }
      }
    }
    return Array.from(summaries.values()).sort((a, b) => Date.parse(b.updatedAt || '0') - Date.parse(a.updatedAt || '0'));
  } catch (error) {
    console.warn('[Verger] could not list saved conversations.', error);
    return [];
  }
}

export async function loadConversation(conversationKey: string): Promise<StoredRow[]> {
  try {
    const response = await store<any>({ op: 'load', conversation_key: conversationKey });
    const rows: any[] = Array.isArray(response?.rows) ? response.rows : [];
    return sortRows(rows.map(toStoredRow).filter((row): row is StoredRow => row !== null));
  } catch (error) {
    console.warn('[Verger] could not load the saved conversation.', error);
    return [];
  }
}

export async function appendProjectSnapshot(conversationKey: string, title: string, project: VergerProject): Promise<boolean> {
  return appendEvent(conversationKey, title, 'assistant', `Project updated: ${project.title}`, { kind: 'project', seq: nextSeq(), project });
}

export async function loadProjectSnapshot(conversationKey: string): Promise<VergerProject | null> {
  const rows = await loadConversation(conversationKey);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const project = rows[index]?.verger?.project;
    if (project && typeof project === 'object' && project.id) return project;
  }
  return null;
}

export async function loadRunHistory(conversationKey: string): Promise<StoredRun[]> {
  try {
    const response = await store<any>({ op: 'runs', conversation_key: conversationKey });
    const rows: any[] = Array.isArray(response?.rows) ? response.rows : [];
    const latest = new Map<string, StoredRun>();
    for (const row of rows) {
      const runId = String(row.run_key || '');
      if (!runId) continue;
      const parsed: StoredRun = {
        conversationKey,
        runId,
        agentType: String(row.agent_type || 'step'),
        name: String(row.name || row.agent_type || 'Production step'),
        task: String(row.task || ''),
        status: row.status === 'done' ? 'done' : row.status === 'failed' ? 'failed' : 'running',
        resultText: String(row.result_text || ''),
        seq: Number(row.sequence || 0),
        createdAt: String(row.created_at || ''),
      };
      const previous = latest.get(runId);
      if (!previous || parsed.seq >= previous.seq) latest.set(runId, parsed);
    }
    return Array.from(latest.values()).sort((a, b) => Date.parse(a.createdAt || '0') - Date.parse(b.createdAt || '0'));
  } catch (error) {
    console.warn('[Verger] could not load production-step history.', error);
    return [];
  }
}
