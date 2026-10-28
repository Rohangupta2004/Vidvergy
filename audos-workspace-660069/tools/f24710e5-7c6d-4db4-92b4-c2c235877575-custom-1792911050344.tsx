import { useState, useEffect, useMemo } from 'react';
import {
  PlayCircle, Users, MousePointerClick, Target, Clock, X, Activity,
  LogIn, AppWindow, MessageSquare, Eye, UserCheck, Mail
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import {
  PageHeader, Grid, Stack, Card, StatCard, DataTable, Badge, Button,
  DetailRow, EmptyState,
} from 'dashboard-blocks';

interface TemplateProps { workspaceId: string; }

interface EventRow {
  id: string;
  eventType: string;
  spaceId: string;
  sessionId: string;
  visitorId: string;
  eventData: Record<string, any> | null;
  createdAt: string;
}

interface SessionRow {
  sessionId: string;
  visitorId: string;
  events: EventRow[];
  start: number;
  end: number;
  durationSec: number;
  eventCount: number;
  typeCounts: Record<string, number>;
  apps: string[];
  converted: boolean;
}

const EVENT_META: Record<string, { label: string; icon: any; variant: any }> = {
  space_entered: { label: 'Space Entered', icon: LogIn, variant: 'info' },
  app_opened: { label: 'App Opened', icon: AppWindow, variant: 'default' },
  agent_message: { label: 'Agent Message', icon: MessageSquare, variant: 'default' },
  landing_page_view: { label: 'Page View', icon: Eye, variant: 'info' },
  lead: { label: 'Lead', icon: UserCheck, variant: 'success' },
  email_submit: { label: 'Email Submit', icon: Mail, variant: 'success' },
};

const CONVERSION_TYPES = new Set(['lead', 'email_submit']);

function fmtDuration(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function eventLabel(ev: EventRow): string {
  const d = ev.eventData || {};
  if (ev.eventType === 'app_opened') return d.appName || d.appId || 'App';
  if (ev.eventType === 'landing_page_view') return d.path || d.source || '/';
  if (ev.eventType === 'space_entered') return d.url ? String(d.url).replace(/^https?:\/\//, '') : 'Entered space';
  return EVENT_META[ev.eventType]?.label || ev.eventType;
}

export function SessionRecordingsDashboard({ workspaceId }: TemplateProps) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<SessionRow | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrors([]);
    fetch(`/api/crm/events?workspaceId=${workspaceId}&days=60&limit=2000`)
      .then(r => { if (!r.ok) return r.text().then(t => Promise.reject(new Error(t))); return r.json(); })
      .then(json => { setEvents(json.data || []); setLoading(false); })
      .catch(e => { setErrors(prev => [...prev, `events: ${e.message}`]); setLoading(false); });
  }, [workspaceId]);

  const sessions = useMemo<SessionRow[]>(() => {
    const map = new Map<string, EventRow[]>();
    for (const ev of events) {
      if (!ev.sessionId) continue;
      if (!map.has(ev.sessionId)) map.set(ev.sessionId, []);
      map.get(ev.sessionId)!.push(ev);
    }
    const rows: SessionRow[] = [];
    map.forEach((evs, sessionId) => {
      const sorted = [...evs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      const start = +new Date(sorted[0].createdAt);
      const end = +new Date(sorted[sorted.length - 1].createdAt);
      const typeCounts: Record<string, number> = {};
      const apps = new Set<string>();
      let converted = false;
      for (const e of sorted) {
        typeCounts[e.eventType] = (typeCounts[e.eventType] || 0) + 1;
        if (CONVERSION_TYPES.has(e.eventType)) converted = true;
        if (e.eventType === 'app_opened') {
          const a = e.eventData?.appName || e.eventData?.appId;
          if (a) apps.add(a);
        }
      }
      rows.push({
        sessionId,
        visitorId: sorted[0].visitorId,
        events: sorted,
        start, end,
        durationSec: Math.round((end - start) / 1000),
        eventCount: sorted.length,
        typeCounts,
        apps: Array.from(apps),
        converted,
      });
    });
    return rows.sort((a, b) => b.end - a.end);
  }, [events]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const last7 = sessions.filter(s => s.end >= weekAgo).length;
    const converted = sessions.filter(s => s.converted).length;
    const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);
    const avgEvents = sessions.length ? (totalEvents / sessions.length) : 0;
    const multiEvent = sessions.filter(s => s.eventCount > 1);
    const avgDur = multiEvent.length
      ? Math.round(multiEvent.reduce((sum, s) => sum + s.durationSec, 0) / multiEvent.length)
      : 0;
    return {
      total: sessions.length,
      last7,
      converted,
      convRate: sessions.length ? Math.round((converted / sessions.length) * 100) : 0,
      avgEvents: avgEvents.toFixed(1),
      avgDur,
    };
  }, [sessions]);

  const dailyData = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of sessions) {
      const key = new Date(s.start).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({
        day,
        label: new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        sessions: count,
      }));
  }, [sessions]);

  const columns = [
    {
      key: 'start', header: 'Session', sortable: true,
      render: (_: any, row: SessionRow) => (
        <div>
          <div className="font-medium">{fmtTime(row.start)}</div>
          <div className="text-xs text-gray-400 font-mono">{row.visitorId}</div>
        </div>
      ),
    },
    {
      key: 'durationSec', header: 'Duration', sortable: true,
      render: (v: number) => <span className="whitespace-nowrap">{fmtDuration(v)}</span>,
    },
    {
      key: 'eventCount', header: 'Events', sortable: true,
      render: (v: number) => <Badge variant="default">{v}</Badge>,
    },
    {
      key: 'typeCounts', header: 'Activity',
      render: (_: any, row: SessionRow) => (
        <div className="flex gap-1 flex-wrap max-w-xs">
          {Object.keys(row.typeCounts).map(t => {
            const meta = EVENT_META[t];
            return (
              <Badge key={t} variant={meta?.variant || 'default'}>
                {(meta?.label || t)}{row.typeCounts[t] > 1 ? ` ×${row.typeCounts[t]}` : ''}
              </Badge>
            );
          })}
        </div>
      ),
    },
    {
      key: 'apps', header: 'Apps',
      render: (v: string[]) => v.length
        ? <span className="text-sm">{v.join(', ')}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'converted', header: 'Outcome',
      render: (v: boolean) => v
        ? <Badge variant="success">Converted</Badge>
        : <span className="text-gray-400 text-sm">—</span>,
    },
  ];

  return (
    <Stack>
      <PageHeader
        title="Session Recordings"
        subtitle={`${stats.total} visitor sessions reconstructed from funnel activity · last 60 days`}
        icon={<PlayCircle className="w-5 h-5" />}
      />

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm">
          <div className="font-semibold mb-1">Some data failed to load</div>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <Grid cols={4}>
        <StatCard title="Total Sessions" value={stats.total} subtitle="last 60 days"
          icon={<Users className="w-4 h-4" />} loading={loading} />
        <StatCard title="Sessions (Last 7 Days)" value={stats.last7} subtitle={`of ${stats.total} total`}
          icon={<Activity className="w-4 h-4" />} loading={loading} />
        <StatCard title="Avg Duration" value={fmtDuration(stats.avgDur)} subtitle="multi-event sessions"
          icon={<Clock className="w-4 h-4" />} loading={loading} />
        <StatCard title="Converted Sessions" value={stats.converted} subtitle={`${stats.convRate}% · lead or email`}
          icon={<Target className="w-4 h-4" />} loading={loading} />
      </Grid>

      <Card title="Sessions per Day">
        {dailyData.length === 0 ? (
          <EmptyState icon={<MousePointerClick className="w-6 h-6" />} title="No session activity yet" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d69b3" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0d69b3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#0d69b3"
                strokeWidth={2} fill="url(#sessGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <DataTable
        title="Recent Sessions"
        data={sessions}
        loading={loading}
        searchable
        searchKeys={['sessionId', 'visitorId']}
        pageSize={15}
        onRowClick={(row: SessionRow) => setSelected(row)}
        emptyMessage="No sessions found in the last 60 days"
        columns={columns}
      />

      {selected && (
        <Card
          title="Session Timeline"
          actions={<Button size="sm" variant="secondary" icon={<X className="w-3 h-3" />} onClick={() => setSelected(null)}>Close</Button>}
        >
          <Stack gap="md">
            <Grid cols={3}>
              <DetailRow label="Visitor" value={<span className="font-mono text-xs">{selected.visitorId}</span>} />
              <DetailRow label="Duration" value={fmtDuration(selected.durationSec)} />
              <DetailRow label="Events" value={selected.eventCount} />
              <DetailRow label="Started" value={fmtTime(selected.start)} />
              <DetailRow label="Ended" value={fmtTime(selected.end)} />
              <DetailRow label="Outcome" value={selected.converted ? <Badge variant="success">Converted</Badge> : <span className="text-gray-400">No conversion</span>} />
            </Grid>
            <DetailRow label="Session ID" value={<span className="font-mono text-xs break-all">{selected.sessionId}</span>} />

            <div>
              <div className="text-sm font-semibold text-gray-700 mb-3">Event Sequence</div>
              <div className="space-y-0">
                {selected.events.map((ev, i) => {
                  const meta = EVENT_META[ev.eventType];
                  const Icon = meta?.icon || Activity;
                  const isLast = i === selected.events.length - 1;
                  return (
                    <div key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-gray-600" />
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" style={{ minHeight: 16 }} />}
                      </div>
                      <div className="pb-4 pt-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={meta?.variant || 'default'}>{meta?.label || ev.eventType}</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(+new Date(ev.createdAt))}</span>
                        </div>
                        <div className="text-sm text-gray-700 mt-1 break-all">{eventLabel(ev)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

export default SessionRecordingsDashboard;
