import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Bot, Check, ChevronDown, ChevronRight, Clock3, Eye, EyeOff, Film,
  History, Layers3, Loader2, MessageSquareText, Play, RotateCcw, SlidersHorizontal,
  Sparkles, Square, Type, Wand2,
} from 'lucide-react';
import {
  motionEngine,
  type MotionJob,
  type MotionLayer,
  type MotionProject,
  type MotionResponse,
} from '../lib/motionEngineSdk';

type Tab = 'timeline' | 'transcript' | 'layers' | 'versions' | 'export';

export interface MotionEditorProps {
  projectId: number;
  initialProject?: MotionProject | null;
  initialJob?: MotionJob | null;
  title?: string;
  compact?: boolean;
  onProjectChange?: (project: MotionProject) => void;
  onJobChange?: (job: MotionJob) => void;
}

const terminal = new Set(['complete', 'failed', 'cancelled', 'awaiting_approval']);
const panel: CSSProperties = {
  background: 'var(--vg-surface, var(--space-surface-card))',
  border: '1px solid var(--vg-border, var(--space-border-default))',
  borderRadius: 12,
};
const button: CSSProperties = {
  alignItems: 'center',
  border: '1px solid var(--vg-border, var(--space-border-default))',
  borderRadius: 10,
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'Manrope, sans-serif',
  fontSize: 12,
  fontWeight: 700,
  gap: 7,
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 12px',
};

function seconds(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0s';
  return `${n.toFixed(n < 10 ? 2 : 1)}s`;
}

function scenes(project: MotionProject | null) {
  return Array.isArray(project?.timeline?.scenes) ? project!.timeline.scenes! : [];
}

function tracks(project: MotionProject | null) {
  return Array.isArray(project?.timeline?.tracks) ? project!.timeline.tracks! : [];
}

function words(project: MotionProject | null): Array<{ word: string; start: number; end: number }> {
  const transcript = project?.transcript as any;
  return Array.isArray(transcript?.words) ? transcript.words : [];
}

function sourceVideo(project: MotionProject | null): string {
  return String(project?.sourceMedia?.find((item) => ['video', 'avatar_video', 'screen_recording', 'approved_render'].includes(item.kind) && item.url)?.url || '');
}

export default function MotionEditor({
  projectId,
  initialProject = null,
  initialJob = null,
  title = 'Agentic Motion Editor',
  compact = false,
  onProjectChange,
  onJobChange,
}: MotionEditorProps) {
  const [project, setProject] = useState<MotionProject | null>(initialProject);
  const [job, setJob] = useState<MotionJob | null>(initialJob);
  const [tab, setTab] = useState<Tab>('timeline');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<Array<Record<string, any>>>([]);
  const [selectedScene, setSelectedScene] = useState('');
  const [expandedTrack, setExpandedTrack] = useState('');
  const [compare, setCompare] = useState(false);

  const update = (response: MotionResponse) => {
    if (response.project) {
      setProject(response.project);
      onProjectChange?.(response.project);
    }
    if (response.job) {
      setJob(response.job);
      onJobChange?.(response.job);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void motionEngine.status({ projectId }).then((response) => {
      if (!cancelled) update(response);
    }).catch((reason) => { if (!cancelled) setError(String(reason?.message || reason)); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!job?.id || terminal.has(job.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await motionEngine.status({ projectId, jobId: job.id });
        if (!cancelled) update(response);
      } catch (reason: any) {
        if (!cancelled) setError(String(reason?.message || reason));
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 4000);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [projectId, job?.id, job?.status]);

  useEffect(() => {
    if (tab !== 'versions') return;
    void motionEngine.listVersions(projectId)
      .then((response) => setVersions(response.versions || []))
      .catch((reason) => setError(String(reason?.message || reason)));
  }, [projectId, tab, project?.version]);

  const total = useMemo(() => Math.max(1, ...scenes(project).map((scene) => Number(scene.endSec) || 0), Number((project?.brief as any)?.durationSeconds) || 1), [project]);

  const run = async (kind: 'analyze' | 'plan' | 'generate' | 'render' | 'export', extra: Record<string, unknown> = {}) => {
    if (!project || busy) return;
    setBusy(kind);
    setError('');
    try {
      const key = `motion:${project.id}:${kind}:${project.version}`;
      const jobInput = {
        idempotencyKey: key,
        aspectRatio: project.aspectRatio,
        durationSeconds: Number((project.brief as any)?.durationSeconds) || total,
        submittedBy: 'motion-editor',
        billingAuthorized: false,
      };
      const response = kind === 'analyze'
        ? await motionEngine.analyze(project.id, jobInput, extra)
        : kind === 'plan'
          ? await motionEngine.plan(project.id, jobInput, extra)
          : kind === 'generate'
            ? await motionEngine.generate(project.id, jobInput, extra)
            : kind === 'render'
              ? await motionEngine.render(project.id, jobInput, extra)
              : await motionEngine.export(project.id, jobInput, extra);
      update(response);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const revise = async () => {
    if (!project || !instruction.trim() || busy) return;
    setBusy('revise');
    setError('');
    try {
      const response = await motionEngine.revise(project.id, {
        idempotencyKey: `motion:${project.id}:revise:${project.version}:${Date.now()}`,
        aspectRatio: project.aspectRatio,
        durationSeconds: Number((project.brief as any)?.durationSeconds) || total,
        submittedBy: 'motion-editor',
      }, {
        instruction: instruction.trim(),
        scope: selectedScene ? { sceneId: selectedScene } : { project: true },
        preserve: selectedScene ? ['all other scenes', 'approved media', 'voice and lip sync'] : ['approved media', 'verified claims'],
      });
      setInstruction('');
      update(response);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const patchLayers = async (nextLayers: MotionLayer[], summary: string) => {
    if (!project || busy) return;
    setBusy('layers');
    try {
      const response = await motionEngine.edit(project.id, {
        idempotencyKey: `motion:${project.id}:layer:${project.version}:${Date.now()}`,
        aspectRatio: project.aspectRatio,
        durationSeconds: Number((project.brief as any)?.durationSeconds) || total,
        submittedBy: 'direct-manipulation',
      }, { graphicLayers: nextLayers, instruction: summary, scope: { layers: true }, preserve: ['source media', 'voice', 'unmodified layers'] });
      update(response);
    } catch (reason: any) {
      setError(String(reason?.message || reason));
    } finally {
      setBusy('');
    }
  };

  const stop = async () => {
    if (!project || !job || terminal.has(job.status)) return;
    setBusy('cancel');
    try { update(await motionEngine.cancel(project.id, job.id)); }
    catch (reason: any) { setError(String(reason?.message || reason)); }
    finally { setBusy(''); }
  };

  const approvePaidAssets = async () => {
    if (!project || !job || job.status !== 'awaiting_approval' || busy) return;
    setBusy('approve');
    setError('');
    try { update(await motionEngine.retry(project.id, job.id, { billingAuthorized: true, submittedBy: 'motion-editor-approved-retry' })); }
    catch (reason: any) { setError(String(reason?.message || reason)); }
    finally { setBusy(''); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
    { id: 'timeline', label: 'Timeline', icon: <Clock3 size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <Type size={14} /> },
    { id: 'layers', label: 'Layers', icon: <Layers3 size={14} /> },
    { id: 'versions', label: 'Versions', icon: <History size={14} /> },
    { id: 'export', label: 'Export', icon: <Film size={14} /> },
  ];

  if (!project) {
    return <div style={{ ...panel, color: 'var(--vg-muted)', padding: 20 }}><Loader2 size={16} className="animate-spin" /> Loading the canonical motion project…</div>;
  }

  return (
    <section style={{ ...panel, color: 'var(--vg-text, var(--space-text-primary))', fontFamily: 'Manrope, sans-serif', overflow: 'hidden' }}>
      <header style={{ alignItems: 'center', background: 'var(--vg-gradient-surface)', borderBottom: '1px solid var(--vg-border)', display: 'flex', flexWrap: 'wrap', gap: 10, padding: compact ? 12 : 16 }}>
        <span style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', borderRadius: 10, color: 'var(--vg-on-accent)', display: 'flex', height: 36, justifyContent: 'center', width: 36 }}><Wand2 size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontFamily: 'Space Grotesk, sans-serif', fontSize: 15 }}>{title}</strong>
          <span style={{ color: 'var(--vg-muted)', fontSize: 11 }}>Project v{project.version} · schema {project.schemaVersion} · {project.aspectRatio} · {project.frameRate}fps</span>
        </div>
        <div style={{ alignItems: 'center', display: 'flex', gap: 7, marginLeft: 'auto' }}>
          {job && !terminal.has(job.status) ? <button type="button" onClick={stop} style={{ ...button, background: 'var(--vg-danger-bg)', color: 'var(--vg-danger)' }}><Square size={12} /> Stop</button> : null}
          <button type="button" onClick={() => void run('plan')} disabled={Boolean(busy)} style={{ ...button, background: 'var(--vg-raised)', color: 'var(--vg-secondary)' }}>{busy === 'plan' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Re-plan</button>
          <button type="button" onClick={() => void run('render')} disabled={Boolean(busy) || project.aspectRatio === '1:1'} title={project.aspectRatio === '1:1' ? 'The platform renderer cannot currently deliver a native square MP4.' : 'Render the current canonical project'} style={{ ...button, background: 'var(--vg-gradient-action)', border: 0, color: 'var(--vg-on-accent)', opacity: project.aspectRatio === '1:1' ? 0.55 : 1 }}>{busy === 'render' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Render</button>
        </div>
      </header>

      {job ? (
        <div style={{ alignItems: 'center', background: 'color-mix(in srgb, var(--vg-accent) 8%, transparent)', borderBottom: '1px solid var(--vg-border)', display: 'flex', gap: 9, padding: '9px 14px' }}>
          {job.status === 'complete' ? <Check size={14} color="var(--vg-success)" /> : job.status === 'failed' ? <RotateCcw size={14} color="var(--vg-danger)" /> : <Loader2 size={14} className="animate-spin" color="var(--vg-accent)" />}
          <span style={{ color: job.status === 'failed' ? 'var(--vg-danger)' : 'var(--vg-secondary)', fontSize: 12 }}>{job.stage || job.status}</span>
          {job.status === 'awaiting_approval' ? <button type="button" onClick={approvePaidAssets} disabled={Boolean(busy)} style={{ ...button, background: 'var(--vg-gradient-action)', border: 0, color: 'var(--vg-on-accent)', marginLeft: 'auto', minHeight: 34 }}>{busy === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve planned paid assets</button> : null}
          <span style={{ color: 'var(--vg-muted)', fontSize: 10, marginLeft: job.status === 'awaiting_approval' ? 0 : 'auto' }}>{job.operation} · {job.modelUsage.length ? `${job.modelUsage.length} model stage${job.modelUsage.length === 1 ? '' : 's'} recorded` : 'models pending'}</span>
        </div>
      ) : null}

      {error ? <div role="alert" style={{ background: 'var(--vg-danger-bg)', borderBottom: '1px solid var(--vg-danger)', color: 'var(--vg-danger)', fontSize: 12, padding: '10px 14px' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(260px, .9fr) minmax(320px, 1.1fr)' }}>
        <div style={{ borderRight: compact ? 0 : '1px solid var(--vg-border)', padding: 14 }}>
          <div style={{ aspectRatio: project.aspectRatio === '9:16' ? '9 / 16' : project.aspectRatio === '1:1' ? '1' : '16 / 9', background: 'var(--vg-bg)', border: '1px solid var(--vg-border)', borderRadius: 10, display: 'grid', maxHeight: compact ? 320 : 440, overflow: 'hidden', placeItems: 'center' }}>
            {(compare ? sourceVideo(project) : project.finalVideoUrl) ? (
              <video controls playsInline preload="metadata" src={(compare ? sourceVideo(project) : project.finalVideoUrl) || ''} style={{ height: '100%', objectFit: 'contain', width: '100%' }} />
            ) : sourceVideo(project) ? (
              <video controls playsInline preload="metadata" src={sourceVideo(project)} style={{ height: '100%', objectFit: 'contain', width: '100%' }} />
            ) : <span style={{ color: 'var(--vg-muted)', fontSize: 12 }}>A preview appears after the first render.</span>}
          </div>
          {project.finalVideoUrl && sourceVideo(project) ? <button type="button" onClick={() => setCompare((value) => !value)} style={{ ...button, background: 'var(--vg-raised)', color: 'var(--vg-secondary)', marginTop: 9, width: '100%' }}>{compare ? <Eye size={13} /> : <EyeOff size={13} />} {compare ? 'Showing source · view latest render' : 'Showing latest · compare source'}</button> : null}

          <div style={{ ...panel, marginTop: 12, padding: 12 }}>
            <label style={{ color: 'var(--vg-muted)', display: 'block', fontSize: 11, marginBottom: 7 }}>Natural-language edit {selectedScene ? `· ${selectedScene}` : '· whole film'}</label>
            <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Make the typography more cinematic, but keep the voice, media and every other scene unchanged." rows={3} style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-control-border)', borderRadius: 10, color: 'var(--vg-text)', fontFamily: 'Manrope, sans-serif', fontSize: 12, lineHeight: 1.5, padding: 10, resize: 'vertical', width: '100%' }} />
            <button type="button" onClick={revise} disabled={!instruction.trim() || Boolean(busy)} style={{ ...button, background: 'var(--vg-gradient-action)', border: 0, color: 'var(--vg-on-accent)', marginTop: 8, width: '100%' }}>{busy === 'revise' ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />} Apply targeted revision</button>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <nav style={{ borderBottom: '1px solid var(--vg-border)', display: 'flex', gap: 3, overflowX: 'auto', padding: '8px 10px' }}>
            {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} style={{ ...button, background: tab === item.id ? 'color-mix(in srgb, var(--vg-accent) 14%, var(--vg-raised))' : 'transparent', borderColor: tab === item.id ? 'color-mix(in srgb, var(--vg-accent) 40%, transparent)' : 'transparent', color: tab === item.id ? 'var(--vg-text)' : 'var(--vg-muted)', minHeight: 34 }}>{item.icon}{item.label}</button>)}
          </nav>

          <div style={{ maxHeight: compact ? 420 : 620, overflowY: 'auto', padding: 12 }}>
            {tab === 'timeline' ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <div style={{ background: 'var(--vg-bg)', borderRadius: 999, height: 7, overflow: 'hidden', position: 'relative' }}>
                  {scenes(project).map((scene, index) => <span key={scene.id} title={`${scene.id} ${seconds(scene.startSec)}–${seconds(scene.endSec)}`} style={{ background: index % 2 ? 'var(--vg-accent-pressed, var(--vg-accent))' : 'var(--vg-accent)', height: '100%', left: `${(Number(scene.startSec) / total) * 100}%`, opacity: .8, position: 'absolute', width: `${Math.max(1, ((Number(scene.endSec) - Number(scene.startSec)) / total) * 100)}%` }} />)}
                </div>
                {scenes(project).map((scene) => {
                  const active = selectedScene === scene.id;
                  return <button key={scene.id} type="button" onClick={() => setSelectedScene(active ? '' : scene.id)} style={{ ...panel, background: active ? 'color-mix(in srgb, var(--vg-accent) 10%, var(--vg-raised))' : 'var(--vg-raised)', color: 'var(--vg-text)', cursor: 'pointer', padding: 11, textAlign: 'left' }}>
                    <span style={{ alignItems: 'center', display: 'flex', gap: 8 }}><ChevronRight size={13} style={{ transform: active ? 'rotate(90deg)' : undefined }} /><strong style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12 }}>{String(scene.purpose || scene.id)}</strong><span style={{ color: 'var(--vg-muted)', fontSize: 10, marginLeft: 'auto' }}>{seconds(scene.startSec)}–{seconds(scene.endSec)}</span></span>
                    {active ? <span style={{ color: 'var(--vg-secondary)', display: 'block', fontSize: 11, lineHeight: 1.5, margin: '8px 0 0 21px' }}>{String(scene.visualDecision || scene.placement || 'No scene note yet.')}</span> : null}
                  </button>;
                })}
              </div>
            ) : null}

            {tab === 'transcript' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, lineHeight: 1.7 }}>
                {words(project).length ? words(project).map((entry, index) => <button key={`${entry.start}-${index}`} type="button" title={`${seconds(entry.start)}–${seconds(entry.end)}`} onClick={() => { const scene = scenes(project).find((item) => entry.start >= Number(item.startSec) && entry.start < Number(item.endSec)); if (scene) setSelectedScene(scene.id); }} style={{ background: selectedScene && scenes(project).find((item) => item.id === selectedScene && entry.start >= Number(item.startSec) && entry.start < Number(item.endSec)) ? 'color-mix(in srgb, var(--vg-accent) 20%, transparent)' : 'transparent', border: 0, borderRadius: 5, color: 'var(--vg-secondary)', cursor: 'pointer', fontSize: 12, padding: '1px 3px' }}>{entry.word}</button>) : <p style={{ color: 'var(--vg-muted)', fontSize: 12 }}>No verified word timeline is attached. Add a Deepgram transcript before speech-aware planning.</p>}
              </div>
            ) : null}

            {tab === 'layers' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {project.graphicLayers.length ? project.graphicLayers.map((layer, index) => {
                  const layerId = String(layer.id || `layer-${index + 1}`);
                  return <div key={layerId} style={{ ...panel, background: 'var(--vg-raised)', padding: 10 }}>
                    <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                      <button type="button" aria-label={layer.visible === false ? 'Show layer' : 'Hide layer'} onClick={() => { const next = project.graphicLayers.map((item, itemIndex) => itemIndex === index ? { ...item, visible: item.visible === false } : item); void patchLayers(next, `${layer.visible === false ? 'Show' : 'Hide'} ${layerId}`); }} style={{ background: 'transparent', border: 0, color: layer.visible === false ? 'var(--vg-muted)' : 'var(--vg-accent)', cursor: 'pointer', padding: 2 }}>{layer.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      <button type="button" onClick={() => setExpandedTrack(expandedTrack === layerId ? '' : layerId)} style={{ alignItems: 'center', background: 'transparent', border: 0, color: 'var(--vg-text)', cursor: 'pointer', display: 'flex', flex: 1, fontSize: 12, gap: 6, textAlign: 'left' }}><ChevronDown size={13} style={{ transform: expandedTrack === layerId ? undefined : 'rotate(-90deg)' }} />{String(layer.label || layer.kind || layerId)}</button>
                      <span style={{ color: 'var(--vg-muted)', fontSize: 10 }}>{seconds(layer.startSec)}–{seconds(layer.endSec)}</span>
                    </div>
                    {expandedTrack === layerId ? <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2,minmax(0,1fr))', marginTop: 10 }}>
                      {(['startSec', 'endSec', 'x', 'y'] as const).map((field) => <label key={field} style={{ color: 'var(--vg-muted)', fontSize: 10 }}>{field}<input type="number" step={field === 'x' || field === 'y' ? .01 : .1} value={Number(layer[field]) || 0} onChange={(event) => { const value = Number(event.target.value); const next = project.graphicLayers.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item); void patchLayers(next, `Set ${layerId} ${field} to ${value}`); }} style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-control-border)', borderRadius: 7, color: 'var(--vg-text)', display: 'block', marginTop: 3, minHeight: 34, padding: '0 7px', width: '100%' }} /></label>)}
                    </div> : null}
                  </div>;
                }) : <p style={{ color: 'var(--vg-muted)', fontSize: 12 }}>The Creative Director has not created editable graphic layers yet.</p>}
                {tracks(project).map((track) => <div key={track.id} style={{ ...panel, alignItems: 'center', background: 'var(--vg-raised)', color: 'var(--vg-secondary)', display: 'flex', fontSize: 11, gap: 7, padding: 9 }}><SlidersHorizontal size={13} color="var(--vg-accent)" />{track.id}<span style={{ color: 'var(--vg-muted)', marginLeft: 'auto' }}>{track.kind}</span></div>)}
              </div>
            ) : null}

            {tab === 'versions' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {versions.length ? versions.slice().reverse().map((version: any) => <div key={`${version.id}-${version.at}`} style={{ ...panel, alignItems: 'center', background: 'var(--vg-raised)', display: 'flex', gap: 9, padding: 10 }}><History size={13} color="var(--vg-accent)" /><div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 11 }}>v{version.version || version.id} · {version.reason}</strong><span style={{ color: 'var(--vg-muted)', fontSize: 10 }}>{version.at ? new Date(version.at).toLocaleString() : 'Saved version'}</span></div><button type="button" onClick={async () => { setBusy('restore'); try { update(await motionEngine.restoreVersion(project.id, Number(version.id))); } catch (reason: any) { setError(String(reason?.message || reason)); } finally { setBusy(''); } }} style={{ ...button, background: 'var(--vg-surface)', color: 'var(--vg-secondary)', marginLeft: 'auto', minHeight: 34 }}><RotateCcw size={12} /> Restore</button></div>) : <p style={{ color: 'var(--vg-muted)', fontSize: 12 }}>Versions appear after the first edit or export.</p>}
              </div>
            ) : null}

            {tab === 'export' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ ...panel, background: 'var(--vg-raised)', padding: 12 }}><strong style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 12 }}>Output contract</strong><p style={{ color: 'var(--vg-secondary)', fontSize: 11, lineHeight: 1.6, margin: '7px 0 0' }}>MP4 · {project.aspectRatio} design · 30fps · source version {project.version}. Exports keep media references and provenance; they never embed provider credentials.</p></div>
                {project.aspectRatio === '1:1' ? <div role="alert" style={{ background: 'var(--vg-warning-bg)', border: '1px solid var(--vg-warning)', borderRadius: 10, color: 'var(--vg-warning)', fontSize: 11, lineHeight: 1.5, padding: 10 }}>Square design is preserved, but the current platform renderer cannot deliver a native 1:1 MP4. Export is disabled instead of silently converting it to landscape or portrait.</div> : null}
                <button type="button" disabled={Boolean(busy) || project.aspectRatio === '1:1'} onClick={() => void run('export')} style={{ ...button, background: 'var(--vg-gradient-action)', border: 0, color: 'var(--vg-on-accent)', opacity: project.aspectRatio === '1:1' ? .55 : 1 }}>{busy === 'export' ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />} Render and export current version</button>
                {project.finalVideoUrl ? <a href={project.finalVideoUrl} target="_blank" rel="noreferrer" style={{ ...button, background: 'var(--vg-raised)', color: 'var(--vg-text)', textDecoration: 'none' }}><Play size={13} /> Open latest MP4</a> : null}
                {project.qaFindings.length ? <div style={{ ...panel, background: 'var(--vg-raised)', padding: 12 }}><strong style={{ fontSize: 11 }}>Latest QA</strong><pre style={{ color: 'var(--vg-muted)', fontFamily: 'ui-monospace, monospace', fontSize: 10, margin: '7px 0 0', maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(project.qaFindings[project.qaFindings.length - 1], null, 2)}</pre></div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
