import { AlertCircle, CheckCircle2, ChevronDown, Clock3, Loader2, RotateCcw, Sparkles } from 'lucide-react';

export type LaneStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed';

export interface AgentLaneRun {
  runId: string;
  agentType: string;
  name: string;
  task: string;
  status: LaneStatus;
  resultText?: string;
}

const STATUS_COPY: Record<LaneStatus, string> = {
  queued: 'Queued',
  running: 'Working',
  waiting: 'Waiting for you',
  done: 'Done',
  failed: 'Failed',
};

function StatusIcon({ status }: { status: LaneStatus }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-[var(--vg-accent)] motion-reduce:animate-none" />;
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-[var(--vg-success)]" />;
  if (status === 'failed') return <AlertCircle className="h-4 w-4 text-[var(--vg-danger)]" />;
  if (status === 'waiting') return <Clock3 className="h-4 w-4 text-[var(--vg-warning)]" />;
  return <span className="h-2.5 w-2.5 rounded-full border border-[var(--vg-control-border)]" />;
}

export default function AgentLanes({
  runs,
  busy,
  waiting,
  expanded,
  onToggle,
  onRetry,
}: {
  runs: AgentLaneRun[];
  busy: boolean;
  waiting: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onRetry: (run: AgentLaneRun) => void;
}) {
  const orchestrator: AgentLaneRun = {
    runId: 'orchestrator-live',
    agentType: 'orchestrator',
    name: 'Orchestrator',
    task: waiting ? 'Needs your answer before it can continue' : busy ? 'Planning, delegating and verifying the next real action' : 'Ready for your next instruction',
    status: waiting ? 'waiting' : busy ? 'running' : runs.length ? 'done' : 'queued',
  };
  const roster = [
    { agentType: 'brand', name: 'Brand agent', task: 'Read Brand Kit and founder clips' },
    { agentType: 'concept', name: 'Script & concept agent', task: 'Shape the concept, script and scenes' },
    { agentType: 'generation', name: 'Generation agent', task: 'Choose the studio, engine and exact quote' },
    { agentType: 'editor', name: 'Editor agent', task: 'Apply versioned Library edits' },
    { agentType: 'qa', name: 'QA agent', task: 'Check the result against the brief' },
    { agentType: 'library', name: 'Library agent', task: 'Find and save real videos' },
  ];
  const visibleRuns = runs.filter((run) => !/^(northern light|jorten)$/i.test(run.name.trim()));
  const latest = new Map<string, AgentLaneRun>();
  visibleRuns.forEach((run) => latest.set(run.agentType, run));
  const rosterTypes = new Set(roster.map((lane) => lane.agentType));
  const productionSteps = visibleRuns
    .filter((run) => !rosterTypes.has(run.agentType) && run.agentType !== 'orchestrator')
    .reduce<AgentLaneRun[]>((steps, run) => {
      const existing = steps.findIndex((item) => item.agentType === run.agentType);
      if (existing >= 0) steps[existing] = run;
      else steps.push(run);
      return steps;
    }, []);
  const lanes = [
    orchestrator,
    ...productionSteps,
    ...roster.map((lane) => latest.get(lane.agentType) || { runId: `queued-${lane.agentType}`, ...lane, status: 'queued' as const }),
  ];

  return (
    <details open={busy || waiting} className="group overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--vg-accent)_28%,var(--vg-border))] bg-[var(--vg-surface)]" aria-label="Verger thinking and tool progress">
      <style>{`
        @keyframes vergerAurora { 0%{transform:translate3d(-8%,0,0) scale(1.08)} 50%{transform:translate3d(9%,-4%,0) scale(1.16)} 100%{transform:translate3d(-8%,0,0) scale(1.08)} }
        @keyframes vergerGlow { 0%,100%{opacity:.34} 50%{opacity:.72} }
        @media (prefers-reduced-motion: reduce) { .verger-aurora,.verger-glow{animation:none!important;transform:none!important} }
      `}</style>
      <summary className="relative isolate cursor-pointer list-none overflow-hidden border-b border-[var(--vg-border)] px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="verger-aurora pointer-events-none absolute -inset-12 -z-10 opacity-60 blur-3xl" style={{ animation: busy ? 'vergerAurora 7s ease-in-out infinite' : 'none', background: 'conic-gradient(from 210deg at 50% 50%, color-mix(in srgb, var(--vg-accent) 32%, transparent), color-mix(in srgb, var(--vg-info) 22%, transparent), color-mix(in srgb, var(--vg-accent-hover) 26%, transparent), color-mix(in srgb, var(--vg-accent) 32%, transparent))' }} />
        <div className="flex items-center gap-2">
          <span className="verger-glow grid h-8 w-8 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--vg-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vg-accent)_10%,transparent)]" style={{ animation: busy ? 'vergerGlow 2.4s ease-in-out infinite' : 'none' }}><Sparkles className="h-4 w-4 text-[var(--vg-accent)]" /></span>
          <div>
            <p className="text-[12px] font-semibold text-[var(--vg-text)]">Verger thinking</p>
            <p className="text-[10px] text-[var(--vg-muted)]">Live plan · parallel specialists · verified tool steps</p>
          </div>
          <span className="ml-auto rounded-full border border-[var(--vg-border)] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[var(--vg-muted)]">{busy ? 'Live' : waiting ? 'Input needed' : 'Expand'}</span>
          <ChevronDown className="h-4 w-4 text-[var(--vg-muted)] transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <ol className="space-y-1.5 p-3">
        {lanes.map((run, index) => {
          const open = expanded.has(run.runId);
          return (
            <li key={run.runId} className="relative overflow-hidden rounded-xl border border-[var(--vg-border)] bg-[var(--vg-raised)]">
              {index < lanes.length - 1 ? <span className="pointer-events-none absolute left-[22px] top-9 h-6 w-px bg-gradient-to-b from-[var(--vg-accent)] to-transparent opacity-60" /> : null}
              <button type="button" onClick={() => onToggle(run.runId)} className="flex min-h-12 w-full items-center gap-3 px-3 text-left">
                <StatusIcon status={run.status} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><strong className="truncate text-[12px] text-[var(--vg-text)]">{run.name}</strong><span className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--vg-muted)]">{STATUS_COPY[run.status]}</span></span>
                  <span className="block truncate text-[10px] text-[var(--vg-secondary)]">{run.task}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--vg-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open ? (
                <div className="border-t border-[var(--vg-border)] px-3 py-3 text-[11px] leading-relaxed text-[var(--vg-secondary)]">
                  <p>{run.resultText || run.task}</p>
                  {run.status === 'failed' && run.agentType !== 'orchestrator' ? <button type="button" onClick={() => onRetry(run)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--vg-danger)_45%,transparent)] px-3 font-semibold text-[var(--vg-danger)]"><RotateCcw className="h-3.5 w-3.5" /> Retry this step</button> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
