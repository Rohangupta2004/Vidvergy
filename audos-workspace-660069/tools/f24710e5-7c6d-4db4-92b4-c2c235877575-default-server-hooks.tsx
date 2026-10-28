import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Stack, Badge, Card, EmptyState } from 'dashboard-blocks';
import { Webhook, Clock, Code, Shield, AlertTriangle, ChevronDown, ChevronRight, Calendar, Hash, Zap, Play, RotateCw, CheckCircle, XCircle, Terminal, Copy, Check, FileDown, Search, Brain, Cpu, Film, Image as ImageIcon, MessageSquare, FileText } from 'lucide-react';
import { ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface TemplateProps {
  workspaceId: string;
  authToken?: string;
}

interface Hook {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  code: string;
  language: string;
  enabled: boolean;
  hasSecret: boolean;
  lastExecutedAt?: string;
  executionCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface Schedule {
  id: string;
  name: string;
  description?: string;
  actionType: string;
  actionPayload?: any;
  scheduleType: string;
  rrule?: string;
  timezone?: string;
  status: string;
  nextRun?: string;
  lastRun?: string;
  runCount: number;
  lastError?: string;
  createdAt: string;
}

interface InterceptedAction {
  type: string;
  description: string;
  payload?: any;
}

interface TestResult {
  success: boolean;
  statusCode: number;
  durationMs?: number;
  body?: any;
  logs?: string[];
  error?: string;
  dryRun?: boolean;
  interceptedActions?: InterceptedAction[];
}

function ActionIcon({ type }: { type: string }) {
  switch (type) {
    case 'db_insert': return <span className="text-blue-500">➕</span>;
    case 'db_update': return <span className="text-amber-500">✏️</span>;
    case 'db_delete': return <span className="text-red-500">➖</span>;
    case 'send_email': return <span className="text-purple-500">✉</span>;
    case 'post_message': return <span className="text-indigo-500">💬</span>;
    case 'create_contact': return <span className="text-green-500">👤</span>;
    case 'external_fetch': return <span className="text-cyan-500">🌐</span>;
    default: return <span>⚠</span>;
  }
}

function TestResultPanel({ result, onClose }: { result: TestResult; onClose: () => void }) {
  const [showBody, setShowBody] = useState(false);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  return (
    <div className={`rounded-md border p-3 text-xs space-y-2 ${
      result.success
        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {result.success
            ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          }
          <span className="font-semibold">
            {result.success ? 'Success' : 'Failed'} — HTTP {result.statusCode}
          </span>
          {result.durationMs != null && (
            <span className="text-gray-500">{result.durationMs}ms</span>
          )}
          {result.dryRun && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 font-medium text-[10px] uppercase tracking-wide">
              Dry Run
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          ✕
        </button>
      </div>

      {result.dryRun && (
        <div className="text-amber-700 dark:text-amber-300 text-[11px]">
          No data was modified. DB writes, emails, and messages were intercepted.
        </div>
      )}

      {result.error && (
        <div className="text-red-700 dark:text-red-300 font-mono break-all">{result.error}</div>
      )}

      {result.interceptedActions && result.interceptedActions.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 mb-1.5">
            <Shield className="w-3 h-3" />
            <span className="font-medium">Intercepted actions ({result.interceptedActions.length})</span>
          </div>
          <div className="space-y-1">
            {result.interceptedActions.map((action, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setExpandedAction(expandedAction === i ? null : i)}
                >
                  <ActionIcon type={action.type} />
                  <span className="flex-1 truncate">{action.description}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{action.type}</span>
                  {action.payload && (expandedAction === i ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />)}
                </div>
                {expandedAction === i && action.payload && (
                  <pre className="px-2 pb-2 text-[10px] font-mono text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(action.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.logs && result.logs.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 mb-1">
            <Terminal className="w-3 h-3" />
            <span className="font-medium">Console output ({result.logs.length} lines)</span>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
            {result.logs.join('\n')}
          </pre>
        </div>
      )}

      {result.body && (
        <div>
          <div
            className="flex items-center gap-1 text-gray-600 dark:text-gray-400 cursor-pointer"
            onClick={() => setShowBody(!showBody)}
          >
            {showBody ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span className="font-medium">Response body</span>
          </div>
          {showBody && (
            <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto mt-1 whitespace-pre-wrap">
              {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
        copied
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function CollapsibleCode({ code, language, forceExpanded }: { code: string; language: string; forceExpanded?: boolean }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded || localExpanded;
  const lines = code.split('\n');
  const preview = lines.slice(0, 3).join('\n');
  const needsCollapse = lines.length > 3;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <div
          className="cursor-pointer flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
          onClick={() => setLocalExpanded(!localExpanded)}
        >
          {needsCollapse && (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          <span className="font-mono">{language}</span>
          <span>· {lines.length} lines</span>
          {needsCollapse && (
            <span className="text-gray-400">· {expanded ? 'collapse' : 'show full code'}</span>
          )}
        </div>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre className="bg-gray-900 text-gray-100 dark:bg-gray-950 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-all">
        {expanded || !needsCollapse ? code : preview + '\n...'}
      </pre>
    </div>
  );
}

function HookCard({ hook, workspaceId, authToken, forceExpanded }: { hook: Hook; workspaceId: string; authToken?: string; forceExpanded?: boolean }) {
  const endpointUrl = `/api/workspaces/${workspaceId}/hooks/${hook.name}/execute`;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const __dt = typeof localStorage !== 'undefined' ? localStorage.getItem('workspace_device_token') : null;
  const authHeaders: Record<string, string> = authToken ? { 'Authorization': 'Bearer ' + authToken } : __dt ? { 'x-device-token': __dt } : {};

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const startTime = Date.now();
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ _test: true }),
        credentials: 'include',
      });
      const elapsed = Date.now() - startTime;
      const data = await res.json().catch(() => null);
      const meta = data?._meta || {};
      setTestResult({
        success: meta.success !== undefined ? meta.success : res.ok,
        statusCode: res.status,
        durationMs: meta.durationMs || elapsed,
        body: data,
        logs: meta.logs || [],
        error: meta.error || (!res.ok ? `HTTP ${res.status}` : undefined),
        dryRun: meta.dryRun || false,
        interceptedActions: meta.interceptedActions || [],
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        statusCode: 0,
        error: err.message || 'Network error',
      });
    } finally {
      setTesting(false);
    }
  }, [endpointUrl]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">{hook.name}</h3>
            {hook.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hook.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hook.enabled ? 'success' : 'default'}>
            {hook.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
      </div>

      <CollapsibleCode code={hook.code} language={hook.language} forceExpanded={forceExpanded} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Shield className="w-3 h-3" />
          <span>Secret:</span>
          <span className="font-medium">{hook.hasSecret ? '•••••••• (set)' : 'None'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Hash className="w-3 h-3" />
          <span>Runs:</span>
          <span className="font-medium">{hook.executionCount}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Last run:</span>
          <span className="font-medium">
            {hook.lastExecutedAt ? new Date(hook.lastExecutedAt).toLocaleString() : 'Never'}
          </span>
        </div>
        {hook.lastError && (
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 col-span-2">
            <AlertTriangle className="w-3 h-3" />
            <span className="truncate">{hook.lastError}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 flex-1 flex items-center gap-2 min-w-0">
          <Code className="w-3 h-3 text-gray-500 flex-shrink-0" />
          <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all truncate">{endpointUrl}</code>
        </div>
        <div className="relative group">
          <button
            onClick={handleTest}
            disabled={testing || !hook.enabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              testing
                ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-wait'
                : !hook.enabled
                ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60'
            }`}
          >
            {testing
              ? <><RotateCw className="w-3 h-3 animate-spin" /> Running...</>
              : <><Play className="w-3 h-3" /> Dry Run</>
            }
          </button>
        </div>
      </div>

      {testResult && (
        <TestResultPanel result={testResult} onClose={() => setTestResult(null)} />
      )}
    </Card>
  );
}

function ScheduleCard({ schedule, workspaceId, authToken }: { schedule: Schedule; workspaceId: string; authToken?: string }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [showError, setShowError] = useState(false);
  const __dt = typeof localStorage !== 'undefined' ? localStorage.getItem('workspace_device_token') : null;
  const authHeaders: Record<string, string> = authToken ? { 'Authorization': 'Bearer ' + authToken } : __dt ? { 'x-device-token': __dt } : {};

  const statusVariant = (() => {
    switch (schedule.status) {
      case 'pending': return 'warning';
      case 'processing': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'danger';
      case 'cancelled': return 'default';
      default: return 'default';
    }
  })();

  const actionIcon = (() => {
    switch (schedule.actionType) {
      case 'hook': return <Webhook className="w-3 h-3" />;
      case 'webhook': return <Zap className="w-3 h-3" />;
      case 'email': return <Play className="w-3 h-3" />;
      default: return <Play className="w-3 h-3" />;
    }
  })();

  const canTest = schedule.actionType === 'hook' && schedule.actionPayload?.hookName;

  const handleTestHook = useCallback(async () => {
    if (!canTest) return;
    const hookName = schedule.actionPayload.hookName;
    setTesting(true);
    setTestResult(null);
    try {
      const startTime = Date.now();
      const res = await fetch(`/api/workspaces/${workspaceId}/hooks/${hookName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ _test: true, _scheduledTask: schedule.name }),
        credentials: 'include',
      });
      const elapsed = Date.now() - startTime;
      const data = await res.json().catch(() => null);
      const meta = data?._meta || {};
      setTestResult({
        success: meta.success !== undefined ? meta.success : res.ok,
        statusCode: res.status,
        durationMs: meta.durationMs || elapsed,
        body: data,
        logs: meta.logs || [],
        error: meta.error || (!res.ok ? `HTTP ${res.status}` : undefined),
        dryRun: meta.dryRun || false,
        interceptedActions: meta.interceptedActions || [],
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        statusCode: 0,
        error: err.message || 'Network error',
      });
    } finally {
      setTesting(false);
    }
  }, [workspaceId, schedule, canTest]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">{schedule.name}</h3>
            {schedule.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{schedule.description}</p>
            )}
          </div>
        </div>
        <Badge variant={statusVariant}>{schedule.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          {actionIcon}
          <span>Type:</span>
          <span className="font-medium">{schedule.actionType}</span>
          {schedule.actionType === 'hook' && schedule.actionPayload?.hookName && (
            <span className="font-mono text-indigo-600 dark:text-indigo-400">({schedule.actionPayload.hookName})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Frequency:</span>
          <span className="font-medium font-mono">{schedule.rrule || schedule.scheduleType}</span>
        </div>
        {schedule.timezone && (
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <Clock className="w-3 h-3" />
            <span>Timezone:</span>
            <span className="font-medium">{schedule.timezone}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Hash className="w-3 h-3" />
          <span>Runs:</span>
          <span className="font-medium">{schedule.runCount}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Next run:</span>
          <span className="font-medium">
            {schedule.nextRun ? new Date(schedule.nextRun).toLocaleString() : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>Last run:</span>
          <span className="font-medium">
            {schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : 'Never'}
          </span>
        </div>
      </div>

      {schedule.lastError && (
        <div
          className="flex items-start gap-1.5 text-red-600 dark:text-red-400 text-xs cursor-pointer"
          onClick={() => setShowError(!showError)}
        >
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className={showError ? '' : 'truncate block'}>{schedule.lastError}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {schedule.actionPayload && (
          <button
            onClick={() => setShowPayload(!showPayload)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {showPayload ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Action config
          </button>
        )}
        <div className="flex-1" />
        {canTest && (
          <button
            onClick={handleTestHook}
            disabled={testing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              testing
                ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-wait'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60'
            }`}
          >
            {testing
              ? <><RotateCw className="w-3 h-3 animate-spin" /> Running...</>
              : <><Play className="w-3 h-3" /> Dry Run Hook</>
            }
          </button>
        )}
      </div>

      {showPayload && schedule.actionPayload && (
        <pre className="bg-gray-900 text-gray-100 rounded-md p-2 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
          {JSON.stringify(schedule.actionPayload, null, 2)}
        </pre>
      )}

      {testResult && (
        <TestResultPanel result={testResult} onClose={() => setTestResult(null)} />
      )}
    </Card>
  );
}

function buildAllCodeFile(hooks: Hook[]): string {
  const stamp = new Date().toISOString();
  const header = [
    '/*',
    ' * Vidverge — Server Hooks source export',
    ` * Generated: ${stamp}`,
    ` * Hooks: ${hooks.length}`,
    ' */',
    '',
  ].join('\n');

  const bodies = hooks.map((hook, i) => {
    const divider = '='.repeat(72);
    const metaLines = [
      `// ${divider}`,
      `// HOOK ${i + 1}/${hooks.length}: ${hook.name}`,
      hook.description ? `// ${hook.description}` : null,
      `// language: ${hook.language} | enabled: ${hook.enabled} | runs: ${hook.executionCount}` +
        (hook.hasSecret ? ' | secret: set' : '') +
        (hook.lastExecutedAt ? ` | last run: ${hook.lastExecutedAt}` : ''),
      hook.lastError ? `// last error: ${hook.lastError}` : null,
      `// POST /api/workspaces/${hook.workspaceId || ''}/hooks/${hook.name}/execute`,
      `// ${divider}`,
      '',
    ].filter(Boolean).join('\n');
    return metaLines + (hook.code || '// (no code)') + '\n';
  });

  return header + bodies.join('\n\n');
}

interface ModelRole {
  role: string;
  model: string | null;
  icon: JSX.Element;
}

interface VideoUsageRow {
  product: string;
  model: string;
  n: number;
}

interface SurfacePref {
  surface: string;
  engine: string;
  model_id: string;
}

const CHART_COLORS = ['#0d69b3', '#009f50', '#ec8c22', '#9b6ba8'];

type ModelKind = 'LLM' | 'Image' | 'Video' | 'Unknown';

function classifyModel(model: string | null | undefined): ModelKind {
  const s = (model || '').toLowerCase();
  if (!s) return 'Unknown';
  if (/claude|opus|sonnet|haiku|gpt|o1|o3|llama|mistral|deepseek|grok/.test(s)) return 'LLM';
  if (/image|flash-image|imagen|dall|sdxl|stable-diffusion/.test(s)) return 'Image';
  if (/veo|kling|seedance|omni|runway|sora|luma|pika|hailuo|wan/.test(s)) return 'Video';
  return 'Unknown';
}

// Is this a Claude / Sonnet / Opus preset the user specifically asked us to flag?
function isClaudePreset(model: string | null | undefined): boolean {
  return /claude|sonnet|opus|haiku/i.test(model || '');
}

const KIND_VARIANT: Record<ModelKind, 'info' | 'success' | 'warning' | 'default'> = {
  LLM: 'info',
  Image: 'warning',
  Video: 'success',
  Unknown: 'default',
};

function ModelPill({ model }: { model: string | null | undefined }) {
  if (!model) return <span className="text-gray-400 text-xs">— not set</span>;
  const claude = isClaudePreset(model);
  return (
    <code className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${
      claude
        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 font-semibold'
        : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    }`}>
      {model}
    </code>
  );
}

interface AppModelRow {
  app: string;
  purpose: string;
  model: string | null;
  kind: ModelKind;
}

function AppModelMatrix({ rows }: { rows: AppModelRow[] }) {
  const llmCount = rows.filter(r => r.kind === 'LLM' && r.model).length;
  const claudeModels = Array.from(
    new Set(rows.filter(r => isClaudePreset(r.model)).map(r => r.model as string))
  );

  return (
    <Card className="p-4 space-y-3 lg:col-span-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Cpu className="w-4 h-4 text-indigo-500" />
        <h3 className="font-semibold text-sm">Model preset per app</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">which LLM / image / video model each app is wired to</span>
      </div>

      {claudeModels.length > 0 && (
        <div className="rounded-md border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/40 p-2.5 text-xs text-purple-900 dark:text-purple-100 flex items-start gap-2">
          <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Claude presets in use:</span>{' '}
            {claudeModels.map((m, i) => (
              <span key={m}>
                <code className="font-mono font-semibold">{m}</code>{i < claudeModels.length - 1 ? ', ' : ''}
              </span>
            ))}
            . Rows highlighted below use a Claude model (e.g. Sonnet&nbsp;5 / Opus&nbsp;5).
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-1.5 pr-3 font-medium">App</th>
              <th className="py-1.5 pr-3 font-medium">Purpose</th>
              <th className="py-1.5 pr-3 font-medium">Model</th>
              <th className="py-1.5 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const claude = isClaudePreset(r.model);
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                    claude ? 'bg-purple-50/60 dark:bg-purple-950/20' : ''
                  }`}
                >
                  <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">{r.app}</td>
                  <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{r.purpose}</td>
                  <td className="py-2 pr-3"><ModelPill model={r.model} /></td>
                  <td className="py-2">
                    {r.model
                      ? <Badge variant={KIND_VARIANT[r.kind]}>{r.kind}</Badge>
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        {llmCount} LLM role{llmCount !== 1 ? 's' : ''} configured. LLM presets come from <code className="font-mono">sceneforge_settings</code>; video rows reflect the model actually chosen on each project.
      </p>
    </Card>
  );
}

function ModelUsageSection({ workspaceId, authToken }: { workspaceId: string; authToken?: string }) {
  const [roles, setRoles] = useState<ModelRole[]>([]);
  const [videoUsage, setVideoUsage] = useState<VideoUsageRow[]>([]);
  const [surfacePrefs, setSurfacePrefs] = useState<SurfacePref[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token = authToken || (typeof window !== 'undefined' ? (window as any).__DASHBOARD_AUTH_TOKEN__ : undefined);
    const __dt = typeof localStorage !== 'undefined' ? localStorage.getItem('workspace_device_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(!token && __dt ? { 'x-device-token': __dt } : {}),
    };
    const runSql = async (query: string, label: string): Promise<any[]> => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/db/sql`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ query, limit: 100 }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = await res.json();
        return json.rows || [];
      } catch (e: any) {
        if (!cancelled) setErrors(prev => [...prev, `${label}: ${e.message || e}`]);
        return [];
      }
    };

    async function load() {
      setLoading(true);
      setErrors([]);
      const [settings, usage, prefs] = await Promise.all([
        runSql(
          'SELECT llm_model, script_model, scene_decider_model, image_model, coding_model FROM sceneforge_settings LIMIT 1',
          'SceneForge models'
        ),
        runSql(
          "SELECT 'Fact Check' AS product, video_model AS model, count(*) AS n FROM fc_projects WHERE video_model IS NOT NULL GROUP BY video_model " +
            "UNION ALL SELECT 'Script-to-Video Films', video_model, count(*) FROM s2v_films WHERE video_model IS NOT NULL GROUP BY video_model",
          'Video model usage'
        ),
        runSql(
          'SELECT surface, engine, model_id FROM video_model_prefs',
          'Chat model prefs'
        ),
      ]);
      if (cancelled) return;

      const s = settings[0] || {};
      setRoles([
        { role: 'Script writing', model: s.script_model ?? null, icon: <FileText className="w-3.5 h-3.5 text-blue-500" /> },
        { role: 'Scene decisions', model: s.scene_decider_model ?? null, icon: <Brain className="w-3.5 h-3.5 text-purple-500" /> },
        { role: 'General LLM', model: s.llm_model ?? null, icon: <Cpu className="w-3.5 h-3.5 text-indigo-500" /> },
        { role: 'Code generation', model: s.coding_model ?? null, icon: <Code className="w-3.5 h-3.5 text-emerald-500" /> },
        { role: 'Image generation', model: s.image_model ?? null, icon: <ImageIcon className="w-3.5 h-3.5 text-amber-500" /> },
      ]);

      setVideoUsage(
        (usage || []).map((r: any) => ({ product: r.product, model: r.model, n: Number(r.n) || 0 }))
      );

      // de-duplicate identical surface/engine/model rows
      const seen = new Set<string>();
      const dedup: SurfacePref[] = [];
      for (const r of prefs || []) {
        const key = `${r.surface}|${r.engine}|${r.model_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push({ surface: r.surface, engine: r.engine, model_id: r.model_id });
      }
      setSurfacePrefs(dedup);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [workspaceId, authToken]);

  const factCheck = videoUsage.filter(r => r.product === 'Fact Check').sort((a, b) => b.n - a.n);
  const s2v = videoUsage.filter(r => r.product === 'Script-to-Video Films').sort((a, b) => b.n - a.n);

  // Flatten everything into one "which model does each app use" matrix.
  const matrixRows: AppModelRow[] = [
    ...roles.map(r => ({ app: 'SceneForge', purpose: r.role, model: r.model, kind: classifyModel(r.model) })),
    ...factCheck.map(r => ({ app: 'Fact Check', purpose: `Video · ${r.n} project${r.n !== 1 ? 's' : ''}`, model: r.model, kind: classifyModel(r.model) })),
    ...s2v.map(r => ({ app: 'Script-to-Video', purpose: `Video · ${r.n} film${r.n !== 1 ? 's' : ''}`, model: r.model, kind: classifyModel(r.model) })),
    ...surfacePrefs.map(p => ({ app: 'Chat options bar', purpose: `${p.engine} engine`, model: p.model_id, kind: classifyModel(p.model_id) })),
  ];

  // Catalog of every distinct model wired into the workspace, grouped by type.
  // These are the alternatives any app can be switched to (via Otto).
  const catalog: { kind: ModelKind; models: { model: string; usedBy: string[]; preset: boolean }[] }[] = (() => {
    const map = new Map<string, { kind: ModelKind; usedBy: Set<string>; preset: boolean }>();
    const add = (model: string | null | undefined, app: string, preset: boolean) => {
      if (!model) return;
      if (!map.has(model)) map.set(model, { kind: classifyModel(model), usedBy: new Set(), preset: false });
      const e = map.get(model)!;
      e.usedBy.add(app);
      if (preset) e.preset = true;
    };
    // SceneForge role presets (configured defaults)
    roles.forEach(r => add(r.model, `SceneForge · ${r.role}`, true));
    // Chat options bar engine presets
    surfacePrefs.forEach(p => add(p.model_id, `Chat · ${p.engine}`, true));
    // Models actually chosen on projects (in-use, not a global preset)
    factCheck.forEach(r => add(r.model, 'Fact Check', false));
    s2v.forEach(r => add(r.model, 'Script-to-Video', false));

    const byKind: Record<string, { model: string; usedBy: string[]; preset: boolean }[]> = {};
    for (const [model, v] of map.entries()) {
      (byKind[v.kind] ||= []).push({ model, usedBy: Array.from(v.usedBy), preset: v.preset });
    }
    const order: ModelKind[] = ['LLM', 'Image', 'Video', 'Unknown'];
    return order
      .filter(k => byKind[k]?.length)
      .map(k => ({ kind: k, models: byKind[k].sort((a, b) => a.model.localeCompare(b.model)) }));
  })();

  return (
    <div>
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4 text-indigo-500" />
        LLM &amp; Model Usage
        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">which model each product / role uses</span>
      </h2>

      {errors.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="font-medium mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Some model queries failed</div>
          {errors.map((e, i) => <div key={i} className="font-mono break-all">{e}</div>)}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-500" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Per-app model matrix — answers "which LLM each app uses" directly */}
          <AppModelMatrix rows={matrixRows} />

          {/* Full catalog of models + alternatives, with Otto switch instructions */}
          <Card className="p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm">Available models &amp; alternatives</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">every model wired into the workspace — switch any app to one of these</span>
            </div>

            <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40 p-2.5 text-xs text-indigo-900 dark:text-indigo-100 flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">To point a particular app at a specific model, ask Otto</span> in the Agent panel — e.g.{' '}
                <span className="italic">"Switch SceneForge code generation to <code className="font-mono">claude-opus-5</code>"</span>,{' '}
                <span className="italic">"Use <code className="font-mono">veo-3.1-fast-generate-preview</code> for Fact Check videos"</span>, or{' '}
                <span className="italic">"Set the image model to <code className="font-mono">gemini-3.1-flash-image</code>"</span>.
              </div>
            </div>

            {catalog.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                {catalog.map(group => (
                  <div key={group.kind}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge variant={KIND_VARIANT[group.kind]}>{group.kind}</Badge>
                      <span className="text-[11px] text-gray-400">
                        {group.models.length} option{group.models.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.models.map(m => (
                        <div key={m.model} className="rounded border border-gray-100 dark:border-gray-800 p-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <ModelPill model={m.model} />
                            {m.preset && <Badge variant="info">preset</Badge>}
                            {isClaudePreset(m.model) && <Badge variant="default">Claude</Badge>}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1 leading-snug">{m.usedBy.join(' · ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-4 text-center">No models configured yet.</p>
            )}
            <p className="text-[11px] text-gray-400">
              <span className="font-medium">preset</span> = a configured default (SceneForge role or chat engine). Models without a preset badge are ones projects have chosen ad-hoc. Any model can be assigned to any compatible role by asking Otto.
            </p>
          </Card>

          {/* SceneForge model assignments */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm">SceneForge — model per role</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">From <code className="font-mono">sceneforge_settings</code> (workspace config)</p>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {roles.map(r => (
                <div key={r.role} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    {r.icon}
                    <span>{r.role}</span>
                  </div>
                  <ModelPill model={r.model} />
                </div>
              ))}
            </div>
          </Card>

          {/* Chat options bar video engine prefs */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm">Chat video engines</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">Models wired to the chat options bar (<code className="font-mono">video_model_prefs</code>)</p>
            {surfacePrefs.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {surfacePrefs.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <Badge variant="info">{p.engine}</Badge>
                    <ModelPill model={p.model_id} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-4 text-center">No chat model preferences set.</p>
            )}
          </Card>

          {/* Video model usage by product */}
          <Card className="p-4 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm">Video model usage by product</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">count of projects per model</span>
            </div>
            {videoUsage.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Fact Check ({factCheck.reduce((a, b) => a + b.n, 0)} projects)</div>
                  <ResponsiveContainer width="100%" height={Math.max(120, factCheck.length * 46)}>
                    <RBarChart data={factCheck} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="model" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v} projects`, 'Count']} />
                      <Bar dataKey="n" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Script-to-Video Films ({s2v.reduce((a, b) => a + b.n, 0)} films)</div>
                  <ResponsiveContainer width="100%" height={Math.max(120, s2v.length * 46)}>
                    <RBarChart data={s2v} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="model" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v} films`, 'Count']} />
                      <Bar dataKey="n" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                    </RBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-4 text-center">No video generation projects yet.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export function ServerHooksDashboard({ workspaceId, authToken }: TemplateProps) {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandAll, setExpandAll] = useState(false);
  const __dt = typeof localStorage !== 'undefined' ? localStorage.getItem('workspace_device_token') : null;
  const authHeaders: Record<string, string> = authToken ? { 'Authorization': 'Bearer ' + authToken } : __dt ? { 'x-device-token': __dt } : {};

  useEffect(() => {
    async function fetchData() {
      try {
        const [hooksRes, schedulesRes] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/hooks`, { credentials: 'include', headers: authHeaders }),
          fetch(`/api/workspaces/${workspaceId}/schedules`, { credentials: 'include', headers: authHeaders })
        ]);
        const hooksData = await hooksRes.json();
        setHooks(Array.isArray(hooksData) ? hooksData : []);

        const schedulesData = await schedulesRes.json();
        setSchedules(schedulesData.schedules || []);
      } catch (err) {
        console.error('Failed to fetch hooks/schedules:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [workspaceId]);

  const handleDownloadAll = useCallback(() => {
    const content = buildAllCodeFile(hooks);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vidverge-server-hooks-${new Date().toISOString().slice(0, 10)}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [hooks]);

  const q = search.trim().toLowerCase();
  const filteredHooks = q
    ? hooks.filter(h =>
        (h.name || '').toLowerCase().includes(q) ||
        (h.description || '').toLowerCase().includes(q) ||
        (h.code || '').toLowerCase().includes(q)
      )
    : hooks;

  if (loading) {
    return (
      <Stack>
        <PageHeader
          title="Server Hooks & Scheduled Tasks"
          subtitle="Loading..."
          icon={<Webhook className="w-5 h-5 text-indigo-600" />}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        </div>
      </Stack>
    );
  }

  const hasHooks = hooks.length > 0;
  const hasSchedules = schedules.length > 0;

  return (
    <Stack>
      <PageHeader
        title="Server Hooks & Scheduled Tasks"
        subtitle={`${hooks.length} hook${hooks.length !== 1 ? 's' : ''} · ${schedules.length} scheduled task${schedules.length !== 1 ? 's' : ''}`}
        icon={<Webhook className="w-5 h-5 text-indigo-600" />}
      />

      <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40 p-3 text-sm text-indigo-900 dark:text-indigo-100">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">How to create hooks and scheduled tasks</div>
            <div className="text-indigo-800/90 dark:text-indigo-200/90 leading-relaxed">
              This dashboard is a <span className="font-medium">monitor</span> — there is no "new hook" button by design. To create one, open the Agent panel and ask Otto, e.g.{' '}
              <span className="italic">"Create a hook called <code className="font-mono text-xs">stripe-webhook</code> that verifies the Stripe signature and inserts <code className="font-mono text-xs">checkout.session.completed</code> events into my <code className="font-mono text-xs">orders</code> table"</span> or{' '}
              <span className="italic">"Schedule the <code className="font-mono text-xs">daily-summary</code> hook every weekday at 9am Eastern."</span>{' '}
              New hooks appear here with their callable URL{' '}
              (<code className="font-mono text-xs">POST /api/workspaces/:wsId/hooks/:name/execute</code>),{' '}
              an execution counter, the last error, and a <span className="font-medium">Dry Run</span> button to test in place.
            </div>
          </div>
        </div>
      </div>

      <ModelUsageSection workspaceId={workspaceId} authToken={authToken} />

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2 mr-auto">
            <Webhook className="w-4 h-4 text-indigo-500" />
            Server Hooks
            <Badge variant="default">{hooks.length}</Badge>
          </h2>
          {hasHooks && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, description or code…"
                  className="pl-7 pr-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 w-56 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <button
                onClick={() => setExpandAll(v => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                {expandAll ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expandAll ? 'Collapse all code' : 'Expand all code'}
              </button>
              <CopyButton text={buildAllCodeFile(hooks)} label="Copy all code" />
              <button
                onClick={handleDownloadAll}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition-colors"
              >
                <FileDown className="w-3 h-3" />
                Download all code
              </button>
            </>
          )}
        </div>
        {hasHooks ? (
          filteredHooks.length > 0 ? (
            <>
              {q && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Showing {filteredHooks.length} of {hooks.length} hooks matching “{search.trim()}”
                </p>
              )}
              <div className="grid gap-3">
                {filteredHooks.map(hook => (
                  <HookCard key={hook.id} hook={hook} workspaceId={workspaceId} authToken={authToken} forceExpanded={expandAll} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Search className="w-8 h-8 text-gray-400" />}
              title="No matching hooks"
              description={`No hooks match “${search.trim()}”. Try a different search term.`}
            />
          )
        ) : (
          <EmptyState
            icon={<Webhook className="w-8 h-8 text-gray-400" />}
            title="No server hooks"
            description="Server hooks will appear here when created through the agent. Hooks are custom code endpoints that respond to HTTP requests."
          />
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-500" />
          Scheduled Tasks
          <Badge variant="default">{schedules.length}</Badge>
        </h2>
        {hasSchedules ? (
          <div className="grid gap-3">
            {schedules.map(schedule => (
              <ScheduleCard key={schedule.id} schedule={schedule} workspaceId={workspaceId} authToken={authToken} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Calendar className="w-8 h-8 text-gray-400" />}
            title="No scheduled tasks"
            description="Scheduled tasks will appear here when created through the agent. Tasks can run on a recurring schedule or at a specific time."
          />
        )}
      </div>
    </Stack>
  );
}
