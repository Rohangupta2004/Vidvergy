import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle, Check, CheckCircle2, Clapperboard, Clock, Download,
  Film, Image as ImageIcon, Loader2, Music2, Play, RefreshCw, Sparkles,
  Type, Upload, Video, Volume2, Wand2,
} from 'lucide-react';
import BeamBackground from '../../components/BeamBackground';
import GridOverlay from '../../components/GridOverlay';
import GlobalStyles from '../../components/ui/GlobalStyles';
import VoicePicker, { useVoiceCatalog } from '../../components/shared/VoicePicker';
import ReferenceImport from '../../components/ReferenceImport';
import { FALLBACK_VOICE_ID } from '../../lib/elevenLabsVoices';
import { withBrandContext } from '../../components/BrandContextLayer';
import { consumeVidvergeHandoff } from '../../lib/vidvergeHandoff';
import { listVideoHistory, saveVideoToHistory, type VideoHistoryRow } from '../../lib/videoHistory';
import {
  type FacelessProject, type FacelessSettings, type PipelineStep, type StoryboardScene,
  ensurePortraitMaster, replaceSceneClip, rerenderReview, retryFinishingOnly, retryScene, runFacelessPipeline, syncFinishing,
} from './lib/pipeline';
import MediaFrame, { probeVideoSize } from './components/MediaFrame';
import { AUDIO_HELP, DURATION_NOTES, FORMAT_HELP, FORMAT_NOTES, MODE_HELP, MODE_NOTES, OptionThumb, previewFor, VOICE_HELP } from './components/optionPreviews';
import { createProject, findResumableProject, loadProject, newProjectId, saveProject, stepLabel } from './lib/projectStore';

const MODES = [
  ['documentary', 'Documentary'], ['explainer', 'Explainer'], ['news', 'News'],
  ['business', 'Business'], ['story', 'Story'], ['educational', 'Educational'],
] as const;
const DURATIONS = [30, 60, 90, 120];
const PIPELINE: PipelineStep[] = ['brief', 'script', 'voiceover', 'timing', 'storyboard', 'images', 'clips', 'finishing', 'review', 'export'];

const BrandedFaceless = withBrandContext(FacelessApp, 'Faceless');
export default BrandedFaceless;

function FacelessApp() {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [settings, setSettings] = useState<FacelessSettings>({
    mode: 'documentary', aspect: '9:16', targetDuration: 60,
    voiceId: FALLBACK_VOICE_ID, captions: true, music: true, musicVolume: 0.28,
  });
  const [project, setProject] = useState<FacelessProject | null>(null);
  const [resume, setResume] = useState<FacelessProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<VideoHistoryRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const voices = useVoiceCatalog();

  useEffect(() => {
    const handoff = consumeVidvergeHandoff('faceless');
    if (handoff?.prompt?.trim()) {
      const value = handoff.prompt.trim();
      setBrief(value);
      setTitle(value.split(/\n|\.|\?|!/)[0].slice(0, 90));
    }
    void findResumableProject().then(setResume);
    void listVideoHistory(12).then(setHistory);
  }, []);

  useEffect(() => {
    if (!project?.finishing?.operationId || project.finishing.status !== 'rendering') return;
    let cancelled = false;
    let ticks = 0;
    const startedAt = Date.parse(project.finishing?.startedAt || '') || Date.now();
    const poll = async () => {
      ticks += 1;
      // The background worker normally settles the film; this server-side check
      // covers a worker that was never reached or stopped early.
      if (ticks % 12 === 0 && Date.now() - startedAt > 120000) {
        await syncFinishing(project.id).catch((error) => console.warn('[Faceless] finishing sync check failed:', error));
      }
      try {
        const fresh = await loadProject(project.id);
        if (!cancelled && fresh) setProject(fresh);
      } catch (error) {
        if (!cancelled) console.warn('[Faceless] finishing status poll failed:', error);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [project?.id, project?.finishing?.operationId, project?.finishing?.status]);

  const checkpoint = useCallback(async (next: FacelessProject) => {
    await saveProject(next);
    setProject(next);
  }, []);

  const run = useCallback(async (seed: FacelessProject) => {
    setBusy(true); setProject(seed); setNotice(null);
    try { await runFacelessPipeline(seed, checkpoint); }
    catch (error: any) { setNotice(String(error?.message || error)); }
    finally { setBusy(false); }
  }, [checkpoint]);

  const start = useCallback(async () => {
    const now = new Date().toISOString();
    const seed: FacelessProject = {
      pipelineVersion: 2,
      id: newProjectId(),
      title: title.trim() || brief.trim().split(/\n|\.|\?|!/)[0].slice(0, 80) || 'Untitled faceless film',
      brief: brief.trim(),
      script: '',
      settings: { ...settings },
      step: 'brief', status: 'running', notice: 'Brief saved.', scenes: [],
      music: undefined, sfx: undefined,
      review: { captions: settings.captions, music: settings.music, musicVolume: settings.musicVolume },
      createdAt: now, updatedAt: now,
    };
    try {
      await createProject(seed);
      await run(seed);
    } catch (error: any) {
      setNotice(String(error?.message || error || 'The project could not be created.'));
    }
  }, [title, brief, settings, run]);

  const resumeProject = useCallback(async (saved: FacelessProject) => {
    setResume(null);
    setTitle(saved.title); setBrief(saved.brief); setSettings(saved.settings);
    if (saved.status === 'error' || saved.finishing?.status === 'rendering') {
      setProject(saved);
      return;
    }
    await run(saved);
  }, [run]);

  const retryFinishing = useCallback(async () => {
    if (!project) return;
    setBusy(true); setNotice(null);
    try {
      await retryFinishingOnly(project);
      const fresh = await loadProject(project.id);
      if (fresh) setProject(fresh);
    } catch (error: any) {
      setNotice(String(error?.message || error || 'Finishing could not be retried.'));
    } finally {
      setBusy(false);
    }
  }, [project]);

  const retry = useCallback(async (scene: StoryboardScene, withImage: boolean) => {
    if (!project) return;
    setBusy(true); setNotice(null);
    try { await retryScene(project, scene.id, withImage, checkpoint); }
    catch (error: any) { setNotice(String(error?.message || error)); }
    finally { setBusy(false); }
  }, [project, checkpoint]);

  const swap = useCallback(async (scene: StoryboardScene, url: string) => {
    if (!project) return;
    setBusy(true); setNotice(null);
    try { await replaceSceneClip(project, scene.id, url, checkpoint); }
    catch (error: any) { setNotice(String(error?.message || error)); }
    finally { setBusy(false); }
  }, [project, checkpoint]);

  const applyReview = useCallback(async () => {
    if (!project) return;
    setBusy(true); setNotice(null);
    try { await rerenderReview(project, checkpoint); }
    catch (error: any) { setNotice(String(error?.message || error)); }
    finally { setBusy(false); }
  }, [project, checkpoint]);

  const exportFilm = useCallback(async () => {
    if (!project?.previewUrl) return;
    setBusy(true); setNotice(null);
    try {
      let finalUrl = project.previewUrl;
      if (project.settings.aspect === '9:16') {
        const size = await probeVideoSize(finalUrl);
        if (size && size.width > size.height) {
          finalUrl = await ensurePortraitMaster(finalUrl);
          if (finalUrl === project.previewUrl) {
            setNotice('The 1080×1920 portrait conversion is unavailable right now, so this MP4 is the 16:9 review render with the vertical frame centred. Try Export again in a minute for a true vertical file.');
          }
        }
      }
      const next = { ...project, step: 'export' as const, previewUrl: finalUrl, finalUrl, status: 'ready' as const, notice: 'MP4 ready to download.', updatedAt: new Date().toISOString() };
      await checkpoint(next);
      void saveVideoToHistory({ appId: 'faceless', title: next.title, videoUrl: next.finalUrl, durationSec: next.voiceover?.duration || null })
        .then(() => listVideoHistory(12).then(setHistory));
    } catch (error: any) {
      setNotice(String(error?.message || error || 'The export could not be saved.'));
    } finally {
      setBusy(false);
    }
  }, [project, checkpoint]);

  const newFilm = () => {
    setProject(null); setNotice(null); setTitle(''); setBrief('');
  };

  return (
    <div className="vv-app-shell h-full w-full overflow-y-auto" style={{ position: 'relative', isolation: 'isolate', background: 'var(--space-surface-bg, #0D0E10)', color: 'var(--space-text-primary, #F6F2E9)' }}>
      <GlobalStyles /><BeamBackground /><GridOverlay />
      <style>{`.studio-input{width:100%;min-height:44px;border:1px solid var(--space-border-default,#393E47);border-radius:10px;background:var(--space-surface-bg,#0D0E10);padding:10px 12px;color:var(--space-text-primary,#F6F2E9);outline:none}.studio-input:focus{border-color:var(--vg-focus);box-shadow:0 0 0 2px color-mix(in srgb,var(--vg-focus) 24%,transparent)}.studio-input::placeholder{color:var(--space-text-muted,#929AA7)}.muted{color:var(--space-text-muted,#929AA7)}`}</style>
      <main className="relative z-[1] mx-auto w-full max-w-6xl px-4 py-7 sm:px-7">
        <Header project={project} onNew={project ? newFilm : undefined} />
        {notice && <ErrorBanner message={visibleError(notice)} onClose={() => setNotice(null)} />}
        {!project ? (
          <BriefScreen
            title={title} setTitle={setTitle} brief={brief} setBrief={setBrief}
            settings={settings} setSettings={setSettings} voices={voices}
            resume={resume} onResume={resumeProject} onDismissResume={() => setResume(null)}
            onStart={start} history={history} busy={busy}
          />
        ) : (
          <Studio
            project={project} busy={busy} onContinue={() => run(project)} onRetryFinishing={retryFinishing} onRetry={retry}
            onSwap={swap} onReviewChange={(review) => setProject({ ...project, review })}
            onApplyReview={applyReview} onExport={exportFilm}
          />
        )}
        {project?.step === 'export' && project.finalUrl && <HistoryPanel rows={history} />}
      </main>
    </div>
  );
}

function Header({ project, onNew }: { project: FacelessProject | null; onNew?: () => void }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb,var(--vg-accent) 16%,transparent)' }}>
          <Clapperboard className="h-5 w-5" style={{ color: 'var(--vg-accent)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faceless</h1>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--space-text-secondary, #B7BBC4)' }}>
            Narration-first video production: every scene, cut, caption and sound lands against the words being spoken.
          </p>
          {project && <p className="mt-1 text-xs" style={{ color: 'var(--vg-accent)' }}>{project.title}</p>}
        </div>
      </div>
      {onNew && <button type="button" onClick={onNew} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--space-border-default, #393E47)' }}>New film</button>}
    </header>
  );
}

function BriefScreen(props: {
  title: string; setTitle: (value: string) => void; brief: string; setBrief: (value: string) => void;
  settings: FacelessSettings; setSettings: (value: FacelessSettings) => void; voices: ReturnType<typeof useVoiceCatalog>;
  resume: FacelessProject | null; onResume: (project: FacelessProject) => void; onDismissResume: () => void;
  onStart: () => void; history: VideoHistoryRow[]; busy: boolean;
}) {
  const patch = (value: Partial<FacelessSettings>) => props.setSettings({ ...props.settings, ...value });
  const valid = props.brief.trim().length >= 30 && props.title.trim().length >= 3;
  return (
    <div className="space-y-4">
      {props.resume && (
        <Panel className="border-amber-400/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {props.resume.status === 'error' && <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--space-semantic-danger-500, #FF9A9A)' }} />}
                {props.resume.status === 'error' ? `Film failed at ${stepLabel(props.resume.step)}` : `Resume “${props.resume.title}”`}
              </div>
              <div className="mt-1 text-xs muted">{props.resume.status === 'error' ? visibleError(props.resume.error || 'Film processing stopped.') : `Saved within the last 48 hours at ${stepLabel(props.resume.step)}. Completed paid work will not run again.`}</div>
            </div>
            <div className="flex gap-2"><SecondaryButton onClick={props.onDismissResume}>Dismiss</SecondaryButton><PrimaryButton onClick={() => props.onResume(props.resume)}>{props.resume.status === 'error' ? 'View failure & retry' : 'Resume project'}</PrimaryButton></div>
          </div>
        </Panel>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-4">
      <Panel>
        <Label>Optional research reference</Label>
        <ReferenceImport
          label="Import from URL"
          onImport={(result) => {
            if (!props.title.trim() && result.productName) props.setTitle(result.productName.slice(0, 90));
            const imported = [result.contextText, result.caption ? `Reference caption: ${result.caption}` : '', result.engagement ? `Observed engagement: ${JSON.stringify(result.engagement)}` : ''].filter(Boolean).join('\n');
            props.setBrief([props.brief.trim(), imported].filter(Boolean).join('\n\n'));
          }}
        />
        <p className="mb-5 mt-2 text-xs muted">Website and public social evidence is added to the editable brief. If scraping fails, you can continue normally.</p>
        <Label>Title or topic</Label>
        <input value={props.title} onChange={(event) => props.setTitle(event.target.value)} placeholder="Why the internet lives under the ocean" className="studio-input" />
        <div className="mt-5"><Label>Creative brief</Label></div>
        <textarea value={props.brief} onChange={(event) => props.setBrief(event.target.value)} rows={8} placeholder="Explain the topic, who it is for, the key point to land, and any facts or call to action that must be included." className="studio-input resize-y leading-relaxed" />
        <p className="mt-2 text-xs muted">First we write the narration for your approval. Voice recording and visual planning begin only after the script is ready.</p>
      </Panel>

      <Panel>
        <Label>Mode</Label>
        <p className="mb-3 text-xs muted">{MODE_HELP}</p>
        {MODES.some(([id]) => previewFor('mode', id)) ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{MODES.map(([id, label]) => previewFor('mode', id) ? <PreviewCard key={id} active={props.settings.mode === id} onClick={() => patch({ mode: id })} src={previewFor('mode', id)} ratio="1 / 1" label={label} note={MODE_NOTES[id]} /> : <Pill key={id} active={props.settings.mode === id} onClick={() => patch({ mode: id })}>{label}</Pill>)}</div>
        ) : (
          <div className="flex flex-wrap gap-2">{MODES.map(([id, label]) => <Pill key={id} active={props.settings.mode === id} onClick={() => patch({ mode: id })}>{label}</Pill>)}</div>
        )}
        <div className="mt-5"><Label>Target length</Label></div>
        <div className="flex flex-wrap gap-2">{DURATIONS.map((seconds) => <Pill key={seconds} active={props.settings.targetDuration === seconds} onClick={() => patch({ targetDuration: seconds })}>{seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}</Pill>)}</div>
        {DURATION_NOTES[props.settings.targetDuration] && <p className="mt-2 text-xs muted">{DURATION_NOTES[props.settings.targetDuration]}</p>}
        <div className="mt-5"><Label>Format</Label></div>
        <p className="mb-3 text-xs muted">{FORMAT_HELP}</p>
        {previewFor('format', '9:16') || previewFor('format', '16:9') ? (
          <div className="grid max-w-md grid-cols-2 gap-2">
            <PreviewCard active={props.settings.aspect === '9:16'} onClick={() => patch({ aspect: '9:16' })} src={previewFor('format', '9:16')} ratio="9 / 16" thumbStyle={{ width: 'auto', height: 120, alignSelf: 'center' }} label="Portrait 9:16" note={FORMAT_NOTES['9:16']} />
            <PreviewCard active={props.settings.aspect === '16:9'} onClick={() => patch({ aspect: '16:9' })} src={previewFor('format', '16:9')} ratio="16 / 9" label="Landscape 16:9" note={FORMAT_NOTES['16:9']} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2"><Pill active={props.settings.aspect === '9:16'} onClick={() => patch({ aspect: '9:16' })}>Portrait 9:16</Pill><Pill active={props.settings.aspect === '16:9'} onClick={() => patch({ aspect: '16:9' })}>Landscape 16:9</Pill></div>
        )}
      </Panel>

      <Panel>
        <Label>ElevenLabs voice</Label>
        <p className="mb-3 text-xs muted">{VOICE_HELP}</p>
        <VoicePicker catalog={props.voices} value={props.settings.voiceId} onChange={(voiceId) => patch({ voiceId })} maxHeight={290} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle checked={props.settings.captions} onChange={(captions) => patch({ captions })} icon={<Type className="h-4 w-4" />} label="Word-timed captions" />
          <Toggle checked={props.settings.music} onChange={(music) => patch({ music })} icon={<Music2 className="h-4 w-4" />} label="Background music + SFX" />
        </div>
        <p className="mt-2 text-xs muted">{AUDIO_HELP}</p>
      </Panel>
      </div><aside className="space-y-4 lg:sticky lg:top-4">
        <section className="rim overflow-hidden p-4"><div className={`mx-auto w-full ${props.settings.aspect === '16:9' ? '' : 'max-w-[260px]'} overflow-hidden rounded-[30px] border border-[var(--line-gold)] bg-black p-2 shadow-[0_22px_64px_color-mix(in_srgb,var(--gold)_16%,transparent)]`}><div className={`relative ${props.settings.aspect === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} overflow-hidden rounded-[23px] bg-[radial-gradient(circle_at_50%_18%,color-mix(in_srgb,var(--gold)_22%,transparent),transparent_34%),linear-gradient(180deg,var(--ash-2),#000)]`}><div className="absolute inset-x-5 top-[43%] text-center"><p className="font-[var(--display)] text-xl font-bold leading-tight text-[var(--gold-hi)]">{props.title.trim() || 'Your story appears here'}</p><p className="mt-3 line-clamp-3 text-xs leading-5 text-white/70">{props.brief.trim() || 'The caption preview follows the narration as you write.'}</p></div><div className="absolute inset-x-4 bottom-5 h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full w-2/3 rounded-full bg-[var(--vg-accent)]" /></div></div></div><div className="mt-4"><Label>Outline & timing</Label>{props.brief.trim()?<div className="space-y-2">{['Hook','Build','Payoff'].map((label,index)=><div key={label} className="flex items-center gap-3 border-b border-[var(--line)] py-2 text-xs"><span className="w-10 tabular-nums text-[var(--gold)]">{index*20}s</span><span className="font-semibold">{label}</span></div>)}</div>:<p className="text-sm text-[var(--muted)]">The outline appears here as you write.</p>}</div></section>

      <Panel>
        <div className="flex items-end justify-between gap-3"><div><Label>Example videos</Label><p className="text-xs muted">Recent finished films show the final pacing and polish.</p></div></div>
        {props.history.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{props.history.slice(0, 3).map((item) => <article key={item.id} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--space-border-default, #393E47)' }}><MediaFrame kind="video" src={item.video_url} poster={item.thumbnail_url || undefined} controls muted preload="metadata" maxHeight={220} /><div className="truncate p-3 text-xs font-medium">{item.title}</div></article>)}</div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{['Documentary cut', 'Motion explainer', 'Cinematic story'].map((label, index) => <div key={label} className="flex aspect-video items-center justify-center rounded-xl border" style={{ borderColor: 'var(--space-border-default, #393E47)', background: `linear-gradient(${120 + index * 15}deg,var(--vg-surface),var(--vg-raised))` }}><div className="text-center"><Play className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--vg-accent)' }} /><div className="text-xs muted">{label}</div></div></div>)}</div>
        )}
      </Panel>

      <div className="rounded-xl border p-3 text-xs muted" style={{ borderColor: 'color-mix(in srgb,var(--vg-accent) 35%,transparent)', background: 'color-mix(in srgb,var(--vg-accent) 8%,transparent)' }}>
        Credit estimate: {props.settings.targetDuration} credits for approximately {props.settings.targetDuration}s of generated scene clips. Scripting and planning remain free; generation is guarded before providers run.
      </div>
      <PrimaryButton disabled={!valid || props.busy} onClick={props.onStart} className="w-full justify-center py-3.5"><Sparkles className="h-4 w-4" /> Write the narration</PrimaryButton>
      </aside></div>
    </div>
  );
}

function Studio(props: {
  project: FacelessProject; busy: boolean; onContinue: () => void; onRetryFinishing: () => void;
  onRetry: (scene: StoryboardScene, withImage: boolean) => void; onSwap: (scene: StoryboardScene, url: string) => void;
  onReviewChange: (review: FacelessProject['review']) => void; onApplyReview: () => void; onExport: () => void;
}) {
  const { project } = props;
  const current = PIPELINE.indexOf(project.step);
  const failed = project.status === 'error';
  const finishingFailed = failed && project.step === 'finishing';
  const finishingOnServer = project.finishing?.status === 'rendering' && project.status === 'running';
  const canContinue = !props.busy && !failed && !finishingOnServer && project.step !== 'review' && project.step !== 'export';
  return (
    <div className="space-y-4">
      <Panel>
        <div className="overflow-x-auto pb-1"><div className="flex min-w-[780px] items-center">{PIPELINE.map((step, index) => { const done = index < current || project.step === 'export'; const active = step === project.step; const failedStep = failed && active; return <div key={step} className="flex min-w-0 flex-1 items-center"><div className="min-w-0 text-center"><div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border text-[11px]" style={{ borderColor: failedStep ? 'var(--space-semantic-danger-500, #FF9A9A)' : done || active ? 'var(--vg-accent)' : 'var(--space-border-default, #393E47)', background: done ? 'var(--vg-accent)' : failedStep ? 'color-mix(in srgb,var(--space-semantic-danger-500) 15%,transparent)' : active ? 'color-mix(in srgb,var(--vg-accent) 15%,transparent)' : 'transparent', color: done ? 'var(--vg-on-accent)' : failedStep ? 'var(--space-semantic-danger-500, #FF9A9A)' : undefined }}>{done ? <Check className="h-3.5 w-3.5" /> : failedStep ? <AlertCircle className="h-3.5 w-3.5" /> : index + 1}</div><div className="mt-1 truncate text-[9px] muted">{stepLabel(step)}</div></div>{index < PIPELINE.length - 1 && <div className="mx-1 h-px flex-1" style={{ background: done ? 'var(--vg-accent)' : 'var(--space-border-default, #393E47)' }} />}</div>; })}</div></div>
        <div className="mt-4 flex items-center gap-2 text-sm"><StatusIcon status={project.status} busy={props.busy || finishingOnServer} /><span>{failed ? 'Film processing failed.' : project.notice}</span></div>
        {project.error && <div className="mt-3 rounded-lg border p-3 text-xs" style={{ borderColor: 'color-mix(in srgb,var(--space-semantic-danger-500) 45%,transparent)', background: 'color-mix(in srgb,var(--space-semantic-danger-500) 10%,transparent)', color: 'var(--space-semantic-danger-500, #FF9A9A)' }}><div className="font-semibold">{finishingFailed ? 'Finishing failed' : 'This film stopped'}</div><div className="mt-1">{visibleError(project.error)}</div>{finishingFailed && <div className="mt-3"><PrimaryButton disabled={props.busy} onClick={props.onRetryFinishing}><RefreshCw className="h-4 w-4" /> Retry finishing only</PrimaryButton><p className="mt-2 text-[11px] muted">Uses the saved clips, images and voiceover. No generation credits are charged.</p></div>}</div>}
        {canContinue && <div className="mt-3"><PrimaryButton onClick={props.onContinue}><RefreshCw className="h-4 w-4" /> Continue from saved checkpoint</PrimaryButton></div>}
      </Panel>

      {project.script && <Panel><Label>Generated script</Label><p className="whitespace-pre-wrap text-sm leading-7" style={{ color: 'var(--space-text-secondary, #B7BBC4)' }}>{project.script}</p>{project.voiceover?.audioUrl && <audio className="mt-4 w-full" src={project.voiceover.audioUrl} controls />}</Panel>}

      {project.scenes.length > 0 && (
        <Panel>
          <div className="flex items-end justify-between gap-3"><div><Label>Timed storyboard & scene production</Label><p className="text-xs muted">{project.scenes.length} scenes aligned to {project.voiceover?.words.length || 0} Deepgram word timestamps · bounded to 2 simultaneous AI video jobs</p></div><div className="rounded-full border px-2.5 py-1 text-[10px]" style={{ borderColor: 'var(--space-border-default, #393E47)' }}>Gemini Omni Flash</div></div>
          {project.storyboard && <div className="mt-3 rounded-lg p-3 text-xs muted" style={{ background: 'var(--space-surface-muted, #21242A)' }}><strong className="text-white">Style lock:</strong> {project.storyboard.styleDescriptor}<br /><strong className="text-white">Character lock:</strong> {project.storyboard.characterDescriptor}</div>}
          <div className="mt-4 grid gap-3 md:grid-cols-2">{project.scenes.map((scene) => <SceneCard key={scene.id} scene={scene} aspect={project.settings.aspect} busy={props.busy} onRetry={props.onRetry} onSwap={props.onSwap} />)}</div>
        </Panel>
      )}

      {project.previewUrl && (
        <ReviewPanel project={project} busy={props.busy} onChange={props.onReviewChange} onApply={props.onApplyReview} onExport={props.onExport} />
      )}
    </div>
  );
}

function SceneCard({ scene, aspect, busy, onRetry, onSwap }: { scene: StoryboardScene; aspect: FacelessSettings['aspect']; busy: boolean; onRetry: (scene: StoryboardScene, withImage: boolean) => void; onSwap: (scene: StoryboardScene, url: string) => void }) {
  const portrait = aspect === '9:16';
  const [swapUrl, setSwapUrl] = useState('');
  const failed = scene.imageStatus === 'error' || scene.clipStatus === 'error';
  return (
    <article className="overflow-hidden rounded-xl border" style={{ borderColor: failed ? 'color-mix(in srgb,var(--space-semantic-danger-500) 55%,transparent)' : 'var(--space-border-default, #393E47)', background: 'var(--space-surface-muted, #17191D)' }}>
      <MediaFrame
        kind={scene.clipUrl ? 'video' : 'image'}
        src={scene.clipUrl || scene.imageUrl}
        aspect={aspect}
        fit={portrait || !scene.clipUrl ? 'cover' : 'contain'}
        controls={Boolean(scene.clipUrl)}
        muted
        preload="none"
        maxHeight={360}
        className={portrait ? 'pt-3' : ''}
        frameClassName={portrait ? 'rounded-lg' : undefined}
        placeholder={<ImageIcon className="h-7 w-7 muted" />}
      ><div className="absolute left-2 top-2 rounded-full px-2 py-1 text-[10px]" style={{ background: 'rgba(8,9,11,.78)', color: '#fff' }}>{scene.start.toFixed(1)}–{scene.end.toFixed(1)}s · {scene.visualType}</div></MediaFrame>
      <div className="space-y-3 p-3">
        <p className="line-clamp-3 text-xs leading-5 muted">{scene.narration}</p>
        <div className="grid grid-cols-2 gap-2"><MiniStatus icon={<ImageIcon className="h-3.5 w-3.5" />} label="Image" status={scene.imageStatus} /><MiniStatus icon={<Video className="h-3.5 w-3.5" />} label={`Clip${scene.clipStatus === 'working' ? ` ${Math.round(scene.progress)}%` : ''}`} status={scene.clipStatus} /></div>
        {scene.clipStatus === 'working' && <div className="h-1 overflow-hidden rounded-full" style={{ background: 'var(--vg-raised)' }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, scene.progress)}%`, background: 'var(--vg-accent)' }} /></div>}
        {scene.error && <div className="rounded-lg border p-2.5 text-xs" style={{ borderColor: 'color-mix(in srgb,var(--space-semantic-danger-500) 45%,transparent)', color: 'var(--space-semantic-danger-500, #FF9A9A)' }}><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{visibleError(scene.error)}</span></div><div className="mt-2 flex flex-wrap gap-2"><SecondaryButton disabled={busy} onClick={() => onRetry(scene, scene.imageStatus === 'error')}>Retry failed step</SecondaryButton><SecondaryButton disabled={busy} onClick={() => onRetry(scene, true)}>Regenerate image + clip</SecondaryButton></div></div>}
        {scene.clipStatus === 'ready' && <div className="flex gap-2"><SecondaryButton disabled={busy} onClick={() => onRetry(scene, false)}><RefreshCw className="h-3.5 w-3.5" /> Regenerate clip</SecondaryButton></div>}
        <details><summary className="cursor-pointer text-[11px] muted">Swap this clip</summary><div className="mt-2 flex gap-2"><input value={swapUrl} onChange={(event) => setSwapUrl(event.target.value)} placeholder="Paste public MP4 URL" className="studio-input !py-2 text-xs" /><SecondaryButton disabled={busy || !swapUrl.trim()} onClick={() => onSwap(scene, swapUrl.trim())}><Upload className="h-3.5 w-3.5" /> Swap</SecondaryButton></div></details>
      </div>
    </article>
  );
}

function ReviewPanel({ project, busy, onChange, onApply, onExport }: { project: FacelessProject; busy: boolean; onChange: (review: FacelessProject['review']) => void; onApply: () => void; onExport: () => void }) {
  const update = (patch: Partial<FacelessProject['review']>) => onChange({ ...project.review, ...patch });
  const portrait = project.settings.aspect === '9:16';
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => { setPreviewSize(null); }, [project.previewUrl]);
  return (
    <Panel>
      <Label>Review</Label>
      {portrait ? (
        <>
          {/* cover crops the centred portrait canvas out of a 16:9 review render; a true 1080x1920 file fits exactly */}
          <MediaFrame kind="video" src={project.previewUrl} aspect="9:16" fit="cover" controls maxHeight="min(72vh, 760px)" frameClassName="rounded-xl" onMeasure={(width, height) => setPreviewSize({ width, height })} />
          {previewSize && previewSize.width > previewSize.height && <p className="mt-2 text-center text-[11px] muted">Showing the vertical frame of the 16:9 review render. Export converts it to a 1080×1920 MP4.</p>}
        </>
      ) : (
        <div className="mx-auto overflow-hidden rounded-xl bg-black"><video src={project.previewUrl} controls playsInline className="w-full" /></div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><Toggle checked={project.review.captions} onChange={(captions) => update({ captions })} icon={<Type className="h-4 w-4" />} label="Captions" /><Toggle checked={project.review.music} onChange={(music) => update({ music })} icon={<Music2 className="h-4 w-4" />} label="Music" /></div>
      <div className="mt-4 flex items-center gap-3"><Volume2 className="h-4 w-4 muted" /><input type="range" min={0} max={55} step={1} value={Math.round(project.review.musicVolume * 100)} onChange={(event) => update({ musicVolume: Number(event.target.value) / 100 })} disabled={!project.review.music} className="flex-1" style={{ accentColor: 'var(--vg-accent)' }} /><span className="w-10 text-right text-xs muted">{Math.round(project.review.musicVolume * 100)}%</span></div>
      {(project.music?.status === 'error' || project.sfx?.status === 'error') && <p className="mt-3 text-xs" style={{ color: 'var(--space-semantic-warning-500, #F1C778)' }}>The video is reviewable, but {project.music?.status === 'error' ? 'music' : 'SFX'} generation was unavailable. Remotion finished with the available audio layers.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><SecondaryButton disabled={busy} onClick={onApply}><Wand2 className="h-4 w-4" /> Apply finishing changes</SecondaryButton><PrimaryButton disabled={busy} onClick={onExport}><Film className="h-4 w-4" /> Export MP4</PrimaryButton>{project.step === 'export' && project.finalUrl && <a href={project.finalUrl} download className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--vg-accent)', color: 'var(--vg-on-accent)' }}><Download className="h-4 w-4" /> Download MP4</a>}</div>
    </Panel>
  );
}

function HistoryPanel({ rows }: { rows: VideoHistoryRow[] }) {
  return <Panel className="mt-4"><Label>Unified video history</Label>{rows.length ? <div className="grid gap-3 sm:grid-cols-3">{rows.slice(0, 6).map((row) => <a key={row.id} href={row.video_url} target="_blank" rel="noreferrer" className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--space-border-default, #393E47)' }}>{row.title}</a>)}</div> : <p className="text-sm muted">Your exported film is being added to history.</p>}</Panel>;
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border p-5 ${className}`} style={{ background: 'var(--space-surface-panel, #17191D)', borderColor: 'var(--space-border-default, #393E47)' }}>{children}</section>;
}
function Label({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--space-text-muted, #929AA7)' }}>{children}</span>;
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className="min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors" style={{ borderColor: active ? 'var(--vg-accent)' : 'var(--space-border-default, #393E47)', background: active ? 'color-mix(in srgb,var(--vg-accent) 14%,transparent)' : 'transparent', color: active ? 'var(--space-text-primary, #F6F2E9)' : 'var(--space-text-secondary, #B7BBC4)' }}>{children}</button>;
}
function PreviewCard({ active, onClick, src, ratio, thumbStyle, label, note }: { active: boolean; onClick: () => void; src?: string; ratio: string; thumbStyle?: CSSProperties; label: string; note?: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-2 text-left text-xs transition-colors" style={{ borderColor: active ? 'var(--vg-accent)' : 'var(--space-border-default, #393E47)', background: active ? 'color-mix(in srgb,var(--vg-accent) 14%,transparent)' : 'transparent', color: active ? 'var(--space-text-primary, #F6F2E9)' : 'var(--space-text-secondary, #B7BBC4)' }}><OptionThumb src={src} ratio={ratio} style={thumbStyle} /><span className="font-medium">{label}</span>{note && <span className="text-[11px] leading-4 muted">{note}</span>}</button>;
}
function Toggle({ checked, onChange, icon, label }: { checked: boolean; onChange: (value: boolean) => void; icon: ReactNode; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: checked ? 'var(--vg-accent)' : 'var(--space-border-default, #393E47)', background: checked ? 'color-mix(in srgb,var(--vg-accent) 10%,transparent)' : 'transparent' }}><span className="flex items-center gap-2">{icon}{label}</span><span className="relative h-5 w-9 rounded-full" style={{ background: checked ? 'var(--vg-accent)' : 'var(--vg-control-border)' }}><span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform" style={{ left: 2, transform: checked ? 'translateX(16px)' : 'none' }} /></span></button>;
}
function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${className}`} style={{ background: 'var(--vg-btn)', color: 'var(--vg-on-btn)' }}>{children}</button>;
}
function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: 'var(--vg-accent)', color: 'var(--vg-accent)' }}>{children}</button>;
}
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: 'color-mix(in srgb,var(--space-semantic-danger-500) 45%,transparent)', background: 'color-mix(in srgb,var(--space-semantic-danger-500) 10%,transparent)', color: 'var(--space-semantic-danger-500, #FF9A9A)' }}><span>{message}</span><button type="button" onClick={onClose}>×</button></div>;
}
function visibleError(message: string): string {
  return /pexels|PEXELS_API_KEY/i.test(message)
    ? 'This saved project stopped in a retired media-search step. Retry the failed scene to continue with generated image-to-video clips.'
    : message;
}
function MiniStatus({ icon, label, status }: { icon: ReactNode; label: string; status: string }) {
  const color = status === 'ready' ? 'var(--space-semantic-success-500, #79D5A5)' : status === 'error' ? 'var(--space-semantic-danger-500, #FF9A9A)' : status === 'working' ? 'var(--vg-accent)' : 'var(--space-text-muted, #929AA7)';
  return <div className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--space-border-default, #393E47)', color }}>{status === 'working' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : icon}<span>{label} · {status}</span></div>;
}
function StatusIcon({ status, busy }: { status: FacelessProject['status']; busy: boolean }) {
  if (busy) return <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--vg-accent)' }} />;
  if (status === 'ready') return <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--space-semantic-success-500, #79D5A5)' }} />;
  if (status === 'error') return <AlertCircle className="h-4 w-4" style={{ color: 'var(--space-semantic-danger-500, #FF9A9A)' }} />;
  return <Clock className="h-4 w-4 muted" />;
}
