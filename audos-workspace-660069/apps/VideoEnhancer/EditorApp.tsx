import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Bot, Captions, Check, Copy, Crop, Download, Film, Image as ImageIcon, Loader2, Music2,
  Pause, Play, Plus, Redo2, RefreshCw, Search, Scissors, ShieldCheck, SlidersHorizontal, Snowflake, Sparkles, Sun, Trash2, Type, Undo2, Upload,
  Video, Volume2, Wand2, X, Zap,
} from 'lucide-react';
import { uploadVideo, fetchVideoAsFile, MAX_UPLOAD_BYTES, WORKSPACE_UUID, submitBroll, checkBroll } from './enhancerCore';
import { buildCuts, decodeAudioMono, detectSilences } from './enhancerExtras';
import { callHook, MUSIC_BEDS } from './nleCore';
import { CAPTION_STYLES } from './studioStyles';
import { listVideoHistory, saveVideoToHistory, type VideoHistoryRow } from '../../lib/videoHistory';
import ModernTimeline from './ModernTimeline';
import EditorHistoryMenu from './EditorHistoryMenu';
import { LibraryMenu, ProjectsMenu } from './EditorLibraryMenus';
import { CAPTION_CATEGORIES, CAPTION_FONT_STACK, CAPTION_FONT_STACKS, CAPTION_PRESETS, CaptionThumb, type CaptionPreset } from './captionPresets';
import SharedMotionEditor from '../../components/MotionEditor';
import { motionEngine, type MotionAspect } from '../../lib/motionEngineSdk';
import { adoptExternalOperation, resumeExternalOperation } from '../VideoProviderLab/labClient';
import { MODERN_EDITOR_CSS } from './modernEditorStyles';
import { SINGLE_PANEL_CSS } from './singlePanelStyles';
import { runAgentBrain, checkAcceptedCut, type BrainStep } from './agentBrain';
import { makePromptSafe } from '../../lib/safePrompt';
import { prepareSpeakerCutout } from './speakerCutout';
import {
  EMPTY_PROJECT, applyEditorOperations, captionItems,
  clampEditor, cycleWordRole, editorDuration, editorSource, effectiveEditorProject, formatEditorTime, hydrateEditorProject, newEditorId, pickKeyWordRoles,
  type EditorAsset, type EditorAspect, type EditorEffect, type EditorItem,
  type EditorOperation, type EditorPreset, type EditorProject, type EditorWord, type RoleStyle, type WordRole,
} from './modernEditorModel';

type Tab = 'media' | 'broll' | 'captions' | 'text' | 'effects' | 'audio';
type ProjectRow = { id: number; title: string; status: string; aspect: EditorAspect; duration_s: number; render_url?: string; project: EditorProject };
type Stock = { id: string; description?: string; altDescription?: string; urls: { thumb: string; regular: string } };

const TABS: { id: Tab; label: string; Icon: typeof Film }[] = [
  { id: 'media', label: 'Media', Icon: Film },
  { id: 'broll', label: 'AI', Icon: Sparkles },
  { id: 'captions', label: 'Captions', Icon: Captions },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'effects', label: 'Effects', Icon: SlidersHorizontal },
  { id: 'audio', label: 'Audio', Icon: Music2 },
];
type CaptionSpacing = { letter: number; word: number; line: number; pad: number };
const DEFAULT_CAPTION_SPACING: CaptionSpacing = { letter: 0, word: 0, line: 1.05, pad: 0 };
const CAPTION_SPACING_KEY = 'video-enhancer:caption-spacing';
const readCaptionSpacing = (): CaptionSpacing => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CAPTION_SPACING_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const pick = (key: keyof CaptionSpacing) => (Number.isFinite(Number(saved[key])) ? Number(saved[key]) : DEFAULT_CAPTION_SPACING[key]);
      return { letter: pick('letter'), word: pick('word'), line: pick('line'), pad: pick('pad') };
    }
  } catch { /* storage unavailable */ }
  return DEFAULT_CAPTION_SPACING;
};
const EFFECTS = [
  ['filmGrain', 'Retro film grain'], ['vhs', 'VHS / CRT scanlines'], ['vignette', 'Vignette'], ['lightLeak', 'Light leaks'],
  ['glitch', 'Glitch / RGB split'], ['chromaticAberration', 'Chromatic aberration'], ['bloom', 'Bloom / glow'], ['halation', 'Halation'],
  ['dustScratches', 'Dust & scratches'], ['gradeWarmRetro', 'Warm retro grade'], ['gradeTealOrange', 'Teal-orange grade'], ['gradeBw', 'Black & white'],
  ['gradeFaded', 'Faded grade'], ['shake', 'Camera shake'], ['zoomPunch', 'Zoom punch'], ['blur', 'Blur'], ['speedRamp', 'Speed ramp'], ['fadeDissolve', 'Fade / dissolve'],
] as const;
const CAPTION_POSITIONS = [
  ['top', 12], ['upper-third', 30], ['middle', 50], ['lower-third', 70], ['bottom', 81],
] as const;
const RENDER_CAPTION_STYLE: Record<string, string> = {
  pop: 'tiktok', hz: 'tiktok', bk: 'creator', ol: 'creator', mn: 'minimal', k: 'karaoke',
  gl: 'bold', nb: 'newsroom', mx: 'luxury', st: 'creator', hw: 'handwritten', ed: 'luxury',
  bh: 'tiktok', bhc: 'creator', ne: 'neon', tw: 'minimal', stk: 'comic',
};
const renderCaptionFont = (fontId: string) => fontId === 'serif' ? 'playfair' : ['inter', 'anton', 'caveat', 'mono'].includes(fontId) ? fontId : 'inter';
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const ACTIVE_BROLL_KEY = 'video-enhancer:editor-background-broll';
const readableError = (error: unknown) => (error instanceof Error ? error.message : String(error || 'Something went wrong.')).slice(0, 260);
const elapsedLabel = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const isVideoFile = (file: File) => file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
const frameTimecode = (seconds: number) => {
  const frames = Math.max(0, Math.round(seconds * 30));
  const totalSeconds = Math.floor(frames / 30);
  return [Math.floor(totalSeconds / 3600), Math.floor(totalSeconds / 60) % 60, totalSeconds % 60, frames % 30]
    .map((value) => String(value).padStart(2, '0')).join(':');
};

function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => reject(new Error('This video could not be decoded. Try MP4, MOV, or WebM.'));
    video.src = url;
  });
}
function Panel({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return <section className="vx-panel"><h3><span>{title}</span>{hint ? <span className="vx-h3-meta">{hint}</span> : null}</h3><div className="vx-panel-body">{children}</div></section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="vx-fieldwrap"><span className="vx-label">{label}</span>{children}</div>;
}
function Empty({ icon: Icon, title, children }: { icon: typeof Film; title: string; children?: ReactNode }) {
  return <div className="vx-empty"><Icon size={18} aria-hidden="true" /><b>{title}</b>{children ? <p>{children}</p> : null}</div>;
}
function Range({ label, value, min, max, step = 1, suffix = '', disabled = false, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return <div className={`vx-field${disabled ? ' is-disabled' : ''}`}><label><span title={label}>{label}</span><b>{Math.round(value * 100) / 100}{suffix}</b></label><input className="vx-range" type="range" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}
function FeatureToggle({ icon: Icon, label, on, detail, busy = false, busyLabel = 'Working…', disabled = false, onChange }: { icon: typeof Captions; label: string; on: boolean; detail: string; busy?: boolean; busyLabel?: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`vx-feature-toggle${on ? ' on' : ''}`} disabled={disabled || busy} onClick={() => onChange(!on)}>{busy ? <Loader2 size={14} className="vxspin" /> : <Icon size={14} />}<span><b>{label}</b><small>{busy ? busyLabel : detail}</small></span><i aria-hidden="true"><em /></i></button>;
}

export default function EditorApp({ active = true }: { active?: boolean } = {}) {
  const [project, setProject] = useState<EditorProject>(EMPTY_PROJECT);
  const projectRef = useRef(project);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tab, setTab] = useState<Tab>('media');
  const [editorMode, setEditorMode] = useState<'manual' | 'auto'>(() => {
    const mode = (window as any).__VIDVERGE_MODE__ || (window as any).__WORKSPACE_MODE__;
    return mode === 'agent' || mode === 'auto' ? 'auto' : 'manual';
  });
  const [timelineTall, setTimelineTall] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [panelView, setPanelView] = useState<'tools' | 'properties'>('tools');
  useEffect(() => { if (mobileInspectorOpen) setPanelView('properties'); }, [mobileInspectorOpen]);
  useEffect(() => { if (mobilePanelOpen) setPanelView('tools'); }, [mobilePanelOpen]);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [captionCategory, setCaptionCategory] = useState<'all' | 'bold' | 'clean' | 'mixed' | 'behind' | 'fun'>('all');
  const [agentSteps, setAgentSteps] = useState<BrainStep[]>([]);
  const [autoSpending, setAutoSpending] = useState(24);
  const [qaStatus, setQaStatus] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [ripple, setRipple] = useState(true);
  const [safeZone, setSafeZone] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  const [playerRate, setPlayerRate] = useState(1);
  const [saveState, setSaveState] = useState('Saved');
  const [history, setHistory] = useState<EditorProject[]>([]);
  const [future, setFuture] = useState<EditorProject[]>([]);
  const [capSpacing, setCapSpacing] = useState<CaptionSpacing>(readCaptionSpacing);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [silenceBusy, setSilenceBusy] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [stock, setStock] = useState<Stock[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [brollPrompt, setBrollPrompt] = useState('');
  const [brollBusy, setBrollBusy] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState('Warm modern instrumental, subtle pulse, no vocals');
  const [musicBusy, setMusicBusy] = useState(false);
  const [agentText, setAgentText] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [review, setReview] = useState<{ summary: string; instruction: string; operations: EditorOperation[]; before: EditorProject; after: EditorProject; applied: boolean; model?: string; steps?: BrainStep[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState('');
  const [motionProjectId, setMotionProjectId] = useState<number | null>(null);
  const [motionOpen, setMotionOpen] = useState(false);
  const [motionBusy, setMotionBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cutoutRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);
  const pollingOperation = useRef('');
  const sourceFiles = useRef<Map<string, File>>(new Map());
  const activeRef = useRef(active);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [exportStartedAt, setExportStartedAt] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => {
    activeRef.current = active;
    if (!active) setPlaying(false);
  }, [active]);
  useEffect(() => {
    if (!exporting) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [exporting]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => {
    if (!project.caption.behind.on || project.caption.behind.status !== 'Preparing cut-out…') return undefined;
    let cancelled = false;
    const source = editorSource(project);
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (safari || !source) {
      setProject((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, route: 'soft-box', status: 'Speaker cut out · soft box mode · free' } } }));
      return undefined;
    }
    void (async () => {
      try {
        const file = sourceFiles.current.get(source.id) || await fetch(source.url).then((response) => { if (!response.ok) throw new Error('Source unavailable.'); return response.blob(); });
        const result = await prepareSpeakerCutout(file, project.caption.behind.softness);
        if (cancelled) return;
        setProject((value) => ({ ...value, assets: value.assets.map((asset) => asset.id === source.id && result.url ? { ...asset, cutoutUrl: result.url } : asset), caption: { ...value.caption, behind: { ...value.caption.behind, route: result.route, status: result.route === 'pixel' ? `Speaker cut out · all ${formatEditorTime(editorDuration(value))} · free` : 'Speaker cut out · soft box mode · free' } } }));
      } catch { if (!cancelled) setProject((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, route: 'soft-box', status: 'Speaker cut out · soft box mode · free' } } })); }
    })();
    return () => { cancelled = true; };
  }, [project.caption.behind.on, project.caption.behind.status, project.caption.behind.softness]);
  useEffect(() => {
    try { window.localStorage.setItem(CAPTION_SPACING_KEY, JSON.stringify(capSpacing)); } catch { /* storage unavailable */ }
  }, [capSpacing]);
  useEffect(() => {
    const fonts = (document as any).fonts;
    if (!fonts?.load) return;
    void Promise.all([500, 600, 700, 800, 900].map((weight) => fonts.load(`${weight} 24px Inter`))).catch(() => undefined);
  }, []);
  const previewBaseProject = review && !review.applied ? review.after : project;
  const previewProject = effectiveEditorProject(previewBaseProject);
  const duration = editorDuration(previewProject);
  const main = editorSource(previewProject);
  const openMotionEditor = async () => {
    if (motionBusy) return;
    if (motionProjectId) { setMotionOpen((value) => !value); return; }
    if (!main?.url) { setError('Add source footage before opening the shared motion editor.'); return; }
    setMotionBusy(true);
    setError('');
    try {
      const aspect: MotionAspect = ['16:9', '9:16', '1:1'].includes(project.aspect) ? project.aspect as MotionAspect : '16:9';
      const response = await motionEngine.create({
        app: 'video-enhancer',
        name: project.title || 'Video Enhancer motion project',
        prompt: 'Preserve the edited source timeline, transcript, voice and approved manual changes. Add or revise only the requested motion graphics and overlays.',
        mode: 'footage-overlay',
        durationSeconds: duration || main.duration || 30,
        aspectRatio: aspect,
        sourceMedia: [{ id: main.id, kind: 'video', url: main.url, mimeType: 'video/mp4', durationSec: main.duration, approved: true, provenance: { system: 'video-enhancer', projectId } }],
        transcript: { text: project.words.filter((word) => !word.removed).map((word) => word.text).join(' '), words: project.words.filter((word) => !word.removed).map((word) => ({ word: word.text, start: word.start, end: word.end, confidence: word.confidence })), provider: project.words.length ? 'user_verified' : 'none', provenance: { system: 'video-enhancer', managedTranscript: Boolean(project.serverTranscript) } },
        timeline: { version: 1, scenes: project.items.filter((item) => item.track === 'video' || item.track === 'broll').map((item) => ({ id: item.id, startSec: item.start, endSec: item.start + item.duration, purpose: item.name, tool: 'existing_media' })), tracks: ['video', 'broll', 'caption', 'text', 'music', 'voice'].map((kind) => ({ id: kind, kind })) },
        graphicLayers: project.items.filter((item) => item.track === 'caption' || item.track === 'text').map((item) => ({ id: item.id, kind: item.track, label: item.name, text: item.text, startSec: item.start, endSec: item.start + item.duration, x: item.x, y: item.y, visible: item.opacity !== 0, style: { scale: item.scale, rotation: item.rotation, opacity: item.opacity } })),
        brand: { caption: project.caption, grade: project.grade },
        compatibility: { type: 'video-enhancer', id: projectId || project.title, preserveInPlace: true },
        submittedBy: 'video-enhancer-motion-adapter',
      });
      if (!response.project) throw new Error('The canonical motion project was not returned.');
      setMotionProjectId(response.project.id);
      setMotionOpen(true);
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setMotionBusy(false);
    }
  };
  const selectedItem = project.items.find((item) => selected.includes(item.id));
  const previewVideoItems = previewProject.items.filter((item) => item.track === 'video').sort((a, b) => a.start - b.start);
  const activeVideoItem = previewVideoItems.find((item) => playhead >= item.start && playhead < item.start + item.duration - .001) || (playhead >= duration - .001 ? previewVideoItems[previewVideoItems.length - 1] : previewVideoItems[0]);
  const activeVideoAsset = previewProject.assets.find((asset) => asset.id === activeVideoItem?.assetId) || main;
  const activeBrollItem = previewProject.items.find((item) => item.track === 'broll' && playhead >= item.start && playhead <= item.start + item.duration);
  const previewItem = (selectedItem && ['video', 'broll'].includes(selectedItem.track) ? selectedItem : activeBrollItem || activeVideoItem);
  const baseVideoItem = previewItem?.track === 'video' ? previewItem : activeVideoItem;
  const activeBrollAsset = previewProject.assets.find((asset) => asset.id === activeBrollItem?.assetId);
  const activeTextItems = previewProject.items.filter((item) => item.track === 'text' && playhead >= item.start && playhead <= item.start + item.duration);
  const activeCaption = previewProject.items.find((item) => item.track === 'caption' && playhead >= item.start && playhead <= item.start + item.duration);
  const activeCaptionWords = activeCaption ? previewProject.words.filter((word) => !word.removed && word.start >= activeCaption.start - .05 && word.end <= activeCaption.start + activeCaption.duration + .05) : [];
  const liveEffects = (previewProject.effects || []).filter((effect) => effect.enabled && (effect.scope === 'timeline' || effect.itemId === activeVideoItem?.id));
  const activeCaptionPreset = CAPTION_PRESETS.find((preset) => preset.styleId === previewProject.caption.styleId) || CAPTION_PRESETS[0];
  const behindWord = activeCaptionWords.find((word) => word.role === 'key') || activeCaptionWords[0];
  const edit = useCallback((fn: (value: EditorProject) => EditorProject) => setProject((value) => fn(value)), []);
  const commit = useCallback((fn: (value: EditorProject) => EditorProject) => {
    setProject((value) => {
      setHistory((stack) => [...stack.slice(-49), value]);
      setFuture([]);
      return fn(value);
    });
  }, []);
  const checkpoint = useCallback(() => {
    setHistory((stack) => [...stack.slice(-49), projectRef.current]);
    setFuture([]);
  }, []);
  const undo = useCallback(() => setHistory((stack) => {
    if (!stack.length) return stack;
    const previous = stack[stack.length - 1];
    setFuture((items) => [projectRef.current, ...items].slice(0, 50));
    setProject(previous);
    return stack.slice(0, -1);
  }), []);
  const redo = useCallback(() => setFuture((items) => {
    if (!items.length) return items;
    const next = items[0];
    setHistory((stack) => [...stack, projectRef.current].slice(-50));
    setProject(next);
    return items.slice(1);
  }), []);

  const jumpToHistory = useCallback((index: number) => {
    const states = [...history, projectRef.current, ...future];
    if (index < 0 || index >= states.length || index === history.length) return;
    setHistory(states.slice(0, index));
    setFuture(states.slice(index + 1));
    setProject(states[index]);
  }, [history, future]);

  const refreshProjects = useCallback(async () => {
    try {
      const result = await callHook('veh-projects', { action: 'list' });
      if (result?.success) setProjects(result.projects || []);
    } catch { /* history is best effort */ }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refreshProjects();
    return () => { alive.current = false; };
  }, [refreshProjects]);

  const saveProject = useCallback(async (value: EditorProject, status = 'editing', renderUrl = '') => {
    if (!value.assets.length) return null;
    const persistableValue = { ...value, assets: value.assets.map((asset) => ({ ...asset, preview: asset.preview.startsWith('blob:') ? asset.url : asset.preview })) };
    setSaveState('Saving…');
    let failure: unknown = null;
    for (const delay of [0, 1800, 5000]) {
      if (delay) await wait(delay);
      try {
        const result = await callHook('veh-projects', {
          action: 'save', id: projectId, title: value.title,
          sourceUrl: editorSource(persistableValue)?.url || '', durationS: editorDuration(persistableValue),
          aspect: persistableValue.aspect, status, renderUrl, project: persistableValue,
        });
        if (result?.success) {
          const nextId = Number(result.project?.id) || projectId;
          if (nextId && !projectId) setProjectId(nextId);
          setSaveState('Saved');
          void refreshProjects();
          return nextId;
        }
      } catch (nextFailure) { failure = nextFailure; }
    }
    setSaveState('Retrying in background');
    throw failure || new Error('Autosave failed.');
  }, [projectId, refreshProjects]);
  useEffect(() => {
    if (!project.assets.length) return undefined;
    setSaveState('Unsaved changes');
    const timer = window.setTimeout(() => { void saveProject(project).catch(() => { if (alive.current) window.setTimeout(() => { void saveProject(projectRef.current).catch(() => undefined); }, 12000); }); }, 850);
    return () => window.clearTimeout(timer);
  }, [project, saveProject]);

  const openProject = (row: ProjectRow) => {
    const assets = (row.project?.assets || []).map((asset) => ({ ...asset, preview: asset.preview?.startsWith('blob:') ? asset.url : asset.preview }));
    setProject(hydrateEditorProject({ ...row.project, assets }));
    setProjectId(row.id);
    setPlayhead(0);
    setSelected([]);
    setExportUrl(row.render_url || '');
    setNotice('Project restored from autosave.');
  };

  const [libraryRows, setLibraryRows] = useState<VideoHistoryRow[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const loadLibrary = async () => {
    setLibraryBusy(true);
    try { setLibraryRows(await listVideoHistory(12)); }
    catch { setLibraryRows([]); }
    finally { setLibraryBusy(false); }
  };
  useEffect(() => { void loadLibrary(); }, []);
  useEffect(() => {
    let cancelled = false;
    let saved: { jobId: number; prompt: string; duration: number } | null = null;
    try { saved = JSON.parse(window.localStorage.getItem(ACTIVE_BROLL_KEY) || 'null'); } catch { saved = null; }
    if (!saved?.jobId) return () => { cancelled = true; };
    setNotice('Reconnecting to the saved AI B-roll operation…');
    void resumeExternalOperation({
      jobId: saved.jobId,
      label: 'Video Enhancer · editor B-roll',
      modelId: 'veo-3.1-fast-generate-preview',
      duration: saved.duration || 6,
    }).then(() => {
      if (cancelled) return;
      window.localStorage.removeItem(ACTIVE_BROLL_KEY);
      setNotice('Your background B-roll is ready in Video Library.');
      void loadLibrary();
    }).catch((cause) => { if (!cancelled) setError(readableError(cause)); });
    return () => { cancelled = true; };
  }, []);

  /** Pick a finished video from the shared Video Library as editable footage. */
  const addLibraryVideo = async (row: VideoHistoryRow, broll = false) => {
    if (uploading) return;
    setUploading(true);
    setError('');
    try {
      const metadata = await probeVideo(row.video_url).catch(() => ({ duration: Number(row.duration_sec) || 8, width: 1920, height: 1080 }));
      const asset: EditorAsset = { id: newEditorId('asset'), name: row.title || 'Library video', url: row.video_url, preview: row.video_url, duration: metadata.duration, kind: 'video' };
      const track = broll ? 'broll' : 'video';
      const videoEnd = project.items.filter((item) => item.track === 'video').reduce((max, item) => Math.max(max, item.start + item.duration), 0);
      const item: EditorItem = { id: newEditorId(track), track, name: asset.name, start: broll ? playhead : videoEnd, duration: broll ? Math.min(metadata.duration, 5) : metadata.duration, assetId: asset.id, sourceIn: 0, speed: 1, volume: broll ? 0 : 1, fadeIn: .2, fadeOut: .4, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, crop: { x: 0, y: 0, w: 1, h: 1 } };
      commit((value) => ({
        ...value,
        title: value.assets.length ? value.title : asset.name,
        aspect: value.assets.length ? value.aspect : metadata.height > metadata.width ? '9:16' : '16:9',
        assets: [...value.assets, asset],
        items: [...value.items, item, ...(!broll ? [{ ...item, id: newEditorId('voice'), track: 'voice' as const, name: 'Original audio' }] : [])],
      }));
      setSelected([item.id]);
      setNotice(`${asset.name} added from your Video Library. Type an edit in the Agent tab or cut it by hand.`);
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setUploading(false); }
  };

  const upload = async (file: File, broll = false) => {
    if (!isVideoFile(file)) { setError('Choose an MP4, MOV, or WebM video.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError('That video is larger than 500 MB.'); return; }
    setUploading(true);
    setError('');
    const localUrl = URL.createObjectURL(file);
    try {
      const [metadata, stored] = await Promise.all([probeVideo(localUrl), uploadVideo(file)]);
      const asset: EditorAsset = { id: newEditorId('asset'), name: file.name, url: stored.url, preview: localUrl, duration: metadata.duration, kind: 'video' };
      sourceFiles.current.set(asset.id, file);
      const track = broll ? 'broll' : 'video';
      const videoEnd = project.items.filter((item) => item.track === 'video').reduce((max, item) => Math.max(max, item.start + item.duration), 0);
      const item: EditorItem = { id: newEditorId(track), track, name: file.name, start: broll ? playhead : videoEnd, duration: broll ? Math.min(metadata.duration, 5) : metadata.duration, assetId: asset.id, sourceIn: 0, speed: 1, volume: broll ? 0 : 1, fadeIn: .2, fadeOut: .4, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, crop: { x: 0, y: 0, w: 1, h: 1 } };
      commit((value) => ({
        ...value,
        title: value.assets.length ? value.title : file.name.replace(/\.[^.]+$/, ''),
        aspect: value.assets.length ? value.aspect : metadata.height > metadata.width ? '9:16' : '16:9',
        assets: [...value.assets, asset],
        items: [...value.items, item, ...(!broll ? [{ ...item, id: newEditorId('voice'), track: 'voice' as const, name: 'Original audio' }] : [])],
      }));
      setSelected([item.id]);
      setNotice(`${file.name} added to the ${track} track.`);
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setUploading(false); }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoAsset || !activeVideoItem) return;
    const sourceUrl = activeVideoAsset.preview || activeVideoAsset.url;
    const sourceTime = (activeVideoItem.sourceIn || 0) + Math.max(0, playhead - activeVideoItem.start) * (activeVideoItem.speed || 1);
    if (video.getAttribute('src') !== sourceUrl) { video.src = sourceUrl; video.load(); }
    const sourceEnd = (activeVideoItem.sourceIn || 0) + activeVideoItem.duration * (activeVideoItem.speed || 1);
    if (Math.abs(video.currentTime - sourceTime) > .12 && (!playing || video.currentTime < (activeVideoItem.sourceIn || 0) - .025 || video.currentTime > sourceEnd + .025)) {
      try { video.currentTime = Math.min(activeVideoAsset.duration, sourceTime); } catch { /* not seekable */ }
    }
    if (cutoutRef.current && Math.abs(cutoutRef.current.currentTime - sourceTime) > .12) {
      try { cutoutRef.current.currentTime = sourceTime; } catch { /* not seekable */ }
    }
  }, [activeVideoAsset?.id, activeVideoItem?.id, playhead, playing]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playerRate;
    if (playing) void video.play().catch(() => setPlaying(false)); else video.pause();
  }, [playing, playerRate]);
  const seek = (time: number) => {
    const next = clampEditor(time, 0, duration);
    setPlayhead(next);
    const item = previewProject.items.find((entry) => entry.track === 'video' && next >= entry.start && next < entry.start + entry.duration) || previewProject.items.filter((entry) => entry.track === 'video').sort((a, b) => a.start - b.start)[0];
    const asset = previewProject.assets.find((entry) => entry.id === item?.assetId);
    if (videoRef.current && item) {
      const sourceTime = (item.sourceIn || 0) + Math.max(0, next - item.start) * (item.speed || 1);
      const sourceUrl = asset?.preview || asset?.url || '';
      try {
        if (sourceUrl && videoRef.current.getAttribute('src') !== sourceUrl) { videoRef.current.src = sourceUrl; videoRef.current.load(); }
        videoRef.current.currentTime = Math.min(asset?.duration || sourceTime, sourceTime);
      } catch { /* not seekable */ }
    }
  };
  const syncPreviewTime = (video: HTMLVideoElement) => {
    if (!playing || !activeVideoItem) return;
    const sourceIn = activeVideoItem.sourceIn || 0;
    const speed = activeVideoItem.speed || 1;
    const sourceEnd = sourceIn + activeVideoItem.duration * speed;
    if (video.currentTime < sourceIn - .025) {
      try { video.currentTime = sourceIn; if (cutoutRef.current) cutoutRef.current.currentTime = sourceIn; } catch { /* seek will retry on the next update */ }
      return;
    }
    if (video.currentTime >= sourceEnd - .025) {
      const nextItem = previewProject.items.filter((item) => item.track === 'video' && item.start > activeVideoItem.start + .001).sort((a, b) => a.start - b.start)[0];
      if (!nextItem) {
        if (loopPlayback) { seek(0); void video.play().catch(() => setPlaying(false)); return; }
        setPlayhead(duration); setPlaying(false); return;
      }
      const nextAsset = previewProject.assets.find((asset) => asset.id === nextItem.assetId);
      const nextUrl = nextAsset?.preview || nextAsset?.url || '';
      setPlayhead(nextItem.start);
      try {
        if (nextUrl && video.getAttribute('src') !== nextUrl) { video.src = nextUrl; video.load(); }
        video.currentTime = nextItem.sourceIn || 0;
        if (cutoutRef.current) cutoutRef.current.currentTime = nextItem.sourceIn || 0;
        void video.play();
      } catch { /* the next timeupdate will retry */ }
      return;
    }
    setPlayhead(clampEditor(activeVideoItem.start + (video.currentTime - sourceIn) / speed, activeVideoItem.start, activeVideoItem.start + activeVideoItem.duration));
  }; 

  const split = () => {
    const item = selectedItem || project.items.find((entry) => entry.track === 'video' && playhead > entry.start && playhead < entry.start + entry.duration);
    if (!item || playhead <= item.start + .1 || playhead >= item.start + item.duration - .1) return;
    commit((value) => ({
      ...value,
      items: value.items.flatMap((entry) => entry.id !== item.id ? [entry] : [
        { ...entry, id: newEditorId(entry.track), duration: playhead - entry.start },
        { ...entry, id: newEditorId(entry.track), start: playhead, sourceIn: (entry.sourceIn || 0) + (playhead - entry.start) * (entry.speed || 1), duration: entry.start + entry.duration - playhead },
      ]),
    }));
  };
  const deleteSelected = () => {
    if (!selected.length) return;
    commit((value) => {
      const removed = value.items.filter((item) => selected.includes(item.id));
      if (!removed.length) return value;
      const start = Math.min(...removed.map((item) => item.start));
      const end = Math.max(...removed.map((item) => item.start + item.duration));
      const gap = Math.max(0, end - start);
      return {
        ...value,
        items: value.items.filter((item) => !selected.includes(item.id)).map((item) => ripple && item.start >= end ? { ...item, start: Math.max(0, item.start - gap) } : item),
      };
    });
    setSelected([]);
  };
  const duplicate = () => {
    if (!selected.length) return;
    commit((value) => {
      const copies = value.items.filter((item) => selected.includes(item.id)).map((item) => ({ ...item, id: newEditorId(item.track), start: item.start + item.duration }));
      return { ...value, items: [...value.items, ...copies] };
    });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (event.code === 'Space') { event.preventDefault(); setPlaying((value) => !value); }
      else if (event.key.toLowerCase() === 'v') { event.preventDefault(); setNotice('Select tool'); }
      else if (event.key.toLowerCase() === 'b') { event.preventDefault(); setNotice('Blade tool · click the timeline, then press S to split'); }
      else if (event.key.toLowerCase() === 's') { event.preventDefault(); split(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); }
      else if (event.key.toLowerCase() === 'j') { event.preventDefault(); setPlaying(false); seek(playhead - 1); }
      else if (event.key.toLowerCase() === 'k') { event.preventDefault(); setPlaying(false); }
      else if (event.key.toLowerCase() === 'l') { event.preventDefault(); setPlayerRate((value) => Math.min(2, value + .25)); setPlaying(true); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((value) => Math.min(6, value * 1.25)); }
      else if (event.key === '-' || event.key === '_') { event.preventDefault(); setZoom((value) => Math.max(.35, value / 1.25)); }
      else if (event.key === 'ArrowLeft') seek(playhead - (event.shiftKey ? 1 : .1));
      else if (event.key === 'ArrowRight') seek(playhead + (event.shiftKey ? 1 : .1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const transcribe = async (forceEnable = false) => {
    if (!main) return;
    if (!forceEnable && !projectRef.current.caption.enabled) {
      setNotice('Turn Captions on before generating a transcript. No transcription was started.');
      return;
    }
    setTranscribing(true);
    setError('');
    setTranscriptionError('');
    setNotice('');
    try {
      let savedId = projectId;
      if (!savedId) savedId = await saveProject(project);
      if (!savedId) throw new Error('The project must be saved before transcription.');
      const token = (window as any).__workspaceDb?.token;
      if (!token) throw new Error('Your workspace session is still loading. Retry in a moment.');
      setNotice('Preparing audio for managed Deepgram transcription…');
      let sourceBlob: Blob = sourceFiles.current.get(main.id) || new Blob();
      if (!sourceBlob.size) {
        const sourceResponse = await fetch(main.url);
        if (!sourceResponse.ok) throw new Error(`Could not read the uploaded clip (HTTP ${sourceResponse.status}).`);
        sourceBlob = await sourceResponse.blob();
      }
      const form = new FormData();
      const sourceName = /\.[a-z0-9]{2,5}$/i.test(main.name) ? main.name : `${main.name || 'source'}.mp4`;
      form.append('audio', new File([sourceBlob], sourceName, { type: sourceBlob.type || 'video/mp4' }));
      const response = await fetch(`/api/workspaces/${WORKSPACE_UUID}/audio/transcribe-timestamped`, {
        method: 'POST',
        headers: { 'X-Workspace-DB-Token': token },
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        const detail = typeof payload?.error === 'string' ? payload.error : payload?.error?.message || payload?.message || payload?.code;
        throw new Error(detail || `Managed transcription failed (HTTP ${response.status}).`);
      }
      const words = ((payload.words || []) as any[]).map((word, index): EditorWord => ({
        id: `w_${index}_${Math.round((Number(word.start) || 0) * 1000)}`,
        text: String(word.word || word.punctuated_word || '').trim(),
        start: Math.max(0, Number(word.start) || 0),
        end: Math.max(Number(word.start) || 0, Number(word.end) || 0),
        confidence: Number(word.confidence) || 0,
        speaker: Number.isFinite(Number(word.speaker)) ? Number(word.speaker) : null,
        filler: /^(um+|uh+|erm+|hmm+|basically|actually|literally)$/i.test(String(word.word || '')),
        removed: false,
        role: 'normal',
      })).filter((word) => word.text && word.end >= word.start);
      if (!words.length) throw new Error('Deepgram returned no timed words for this clip. Check that the video contains audible speech, then retry.');
      const managedResult = {
        transcript: String(payload.transcript || words.map((word) => word.text).join(' ')),
        words,
        language: String(payload.language || 'auto'),
        duration: Number(payload.duration) || words[words.length - 1].end,
        confidence: Number(payload.confidence) || 0,
        model: String(payload.model || 'nova-3'),
      };
      const persisted = await callHook('veh-transcribe', { projectId: savedId, managedResult });
      if (!persisted?.success) throw new Error(persisted?.error || 'The transcript was created but could not be saved.');
      commit((value) => {
        const roleWords = value.caption.autoPickRoles ? pickKeyWordRoles(words, value.caption.wordsPerLine) : words;
        const captionsEnabled = forceEnable || value.caption.enabled;
        return { ...value, words: roleWords, language: managedResult.language, caption: { ...value.caption, enabled: captionsEnabled }, items: [...value.items.filter((item) => item.track !== 'caption'), ...(captionsEnabled ? captionItems(roleWords, value.caption.wordsPerLine) : [])] };
      });
      setNotice(`${words.length} words transcribed with managed Deepgram word timing${managedResult.language !== 'auto' ? ` · ${managedResult.language}` : ''}.`);
    } catch (nextError) {
      const message = readableError(nextError);
      setTranscriptionError(message);
      setError(message);
    } finally { setTranscribing(false); }
  };

  const setCaptionsEnabled = (enabled: boolean) => {
    if (!enabled) {
      commit((value) => ({ ...value, caption: { ...value.caption, enabled: false, behind: { ...value.caption.behind, on: false, status: '' } }, items: value.items.filter((item) => item.track !== 'caption') }));
      setNotice('Captions off · caption layers were removed from preview, timeline and export.');
      return;
    }
    const hasWords = projectRef.current.words.some((word) => !word.removed);
    commit((value) => ({ ...value, caption: { ...value.caption, enabled: true }, items: [...value.items.filter((item) => item.track !== 'caption'), ...captionItems(value.words, value.caption.wordsPerLine)] }));
    if (hasWords) setNotice('Captions on · the saved transcript was applied with the selected style.');
    else if (main) window.setTimeout(() => { void transcribe(true); }, 0);
    else setNotice('Captions on · add footage to generate them.');
  };

  const analyzeSilence = async () => {
    const value = projectRef.current;
    const source = editorSource(value);
    if (!source || silenceBusy) return;
    setSilenceBusy(true);
    setError('');
    setNotice('Analyzing the audio track locally…');
    try {
      const file = sourceFiles.current.get(source.id) || await fetchVideoAsFile(source.url);
      const decoded = await decodeAudioMono(file);
      let peak = 0;
      for (let index = 0; index < decoded.samples.length; index += 1) peak = Math.max(peak, Math.abs(decoded.samples[index]));
      if (!decoded.samples.length || peak < 0.0001) {
        commit((current) => ({ ...current, silence: { ...current.silence, enabled: true, regions: [], removedSeconds: 0, analyzedAssetId: source.id, status: 'No audible audio track was found. The video was left unchanged.' } }));
        setNotice('No audible audio track was found. Nothing was cut.');
        return;
      }
      const detected = detectSilences(decoded.samples, decoded.sampleRate, value.silence.thresholdDb, value.silence.minDuration);
      const cuts = buildCuts(detected, value.silence.paddingMs, decoded.duration);
      const removedSeconds = cuts.reduce((total, cut) => total + cut.end - cut.start, 0);
      if (!cuts.length || removedSeconds < 0.05) {
        commit((current) => ({ ...current, silence: { ...current.silence, enabled: true, regions: [], removedSeconds: 0, analyzedAssetId: source.id, status: 'No silence found at the current settings.' } }));
        setNotice('No silence found at the current threshold and minimum duration.');
        return;
      }
      if (removedSeconds >= decoded.duration - 0.05) {
        commit((current) => ({ ...current, silence: { ...current.silence, enabled: true, regions: [], removedSeconds: 0, analyzedAssetId: source.id, status: 'No audible audio track was found. The video was left unchanged.' } }));
        setNotice('No audible audio track was found. Nothing was cut.');
        return;
      }
      commit((current) => ({ ...current, silence: { ...current.silence, enabled: true, regions: cuts, removedSeconds, analyzedAssetId: source.id, status: `${removedSeconds.toFixed(1)} seconds removed across ${cuts.length} ${cuts.length === 1 ? 'pause' : 'pauses'}.` } }));
      setPlayhead(0);
      setNotice(`${removedSeconds.toFixed(1)} seconds removed · preview, timeline and export are re-stitched.`);
    } catch (reason) {
      const message = /decode|audio/i.test(readableError(reason))
        ? 'No usable audio track was found in this video. Nothing was cut.'
        : `Silence analysis could not finish: ${readableError(reason)}`;
      commit((current) => ({ ...current, silence: { ...current.silence, enabled: true, regions: [], removedSeconds: 0, status: message } }));
      setNotice(message);
    } finally { setSilenceBusy(false); }
  };
  const setSilenceEnabled = (enabled: boolean) => {
    commit((value) => ({ ...value, silence: { ...value.silence, enabled } }));
    if (!enabled) { setNotice('Silence cuts off · the original timing is restored.'); setPlayhead(0); return; }
    if (projectRef.current.silence.regions.length) {
      setNotice(`${projectRef.current.silence.removedSeconds.toFixed(1)} seconds removed · cuts restored.`);
      setPlayhead(0);
    } else if (main) window.setTimeout(() => { void analyzeSilence(); }, 0);
    else setNotice('Silence cuts on · add footage to analyze its audio.');
  };
  const updateSilenceSetting = (patch: Partial<Pick<EditorProject['silence'], 'thresholdDb' | 'minDuration' | 'paddingMs'>>) => {
    edit((value) => ({ ...value, silence: { ...value.silence, ...patch, regions: [], removedSeconds: 0, status: 'Settings changed · detect again to update cuts.' } }));
  };

  const searchStock = async () => {
    if (!stockQuery.trim()) return;
    setStockBusy(true);
    setError('');
    try {
      const orientation = project.aspect === '9:16' ? 'portrait' : project.aspect === '1:1' ? 'squarish' : 'landscape';
      const params = new URLSearchParams({ query: stockQuery.trim(), perPage: '18', orientation });
      const response = await fetch(`/api/stock-photos?${params}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Stock search failed.');
      setStock(payload.results || []);
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setStockBusy(false); }
  };
  const addStock = (photo: Stock) => {
    const asset: EditorAsset = { id: newEditorId('asset'), name: photo.description || photo.altDescription || 'Stock image', url: photo.urls.regular, preview: photo.urls.regular, duration: 3, kind: 'image' };
    const item: EditorItem = { id: newEditorId('broll'), track: 'broll', name: asset.name, start: playhead, duration: Math.min(3, Math.max(.5, duration - playhead)), assetId: asset.id, volume: 0, x: 50, y: 50, scale: 1, opacity: 1, crop: { x: 0, y: 0, w: 1, h: 1 } };
    commit((value) => ({ ...value, assets: [...value.assets, asset], items: [...value.items, item] }));
    setSelected([item.id]);
    setNotice('Stock visual added to the B-roll track.');
  };
  const suggestBroll = () => {
    const nearby = project.words.filter((word) => word.start >= Math.max(0, playhead - 2) && word.start <= playhead + 7 && !word.removed).map((word) => word.text).join(' ').trim();
    const prompt = nearby || project.words.filter((word) => !word.removed).slice(0, 18).map((word) => word.text).join(' ') || 'cinematic creator workspace';
    setStockQuery(prompt.slice(0, 90));
    setBrollPrompt(`Cinematic visual illustrating: ${prompt.slice(0, 220)}. Natural light, strong composition, no text or logos.`);
    setNotice('B-roll brief created from the transcript around the playhead.');
  };
  const generateBroll = async (kind: 'image' | 'video') => {
    const unsafePrompt = brollPrompt.trim();
    if (!unsafePrompt || brollBusy) return;
    setBrollBusy(true);
    setError('');
    try {
      const prompt = (await makePromptSafe({ prompt: unsafePrompt, mode: editorMode === 'auto' ? 'autopilot' : 'copilot' })).prompt;
      let url = '';
      let assetDuration = 4;
      if (kind === 'image') {
        const token = (window as any).__workspaceDb?.token;
        if (!token) throw new Error('Your workspace session is still loading.');
        const aspectRatio = project.aspect === 'free' ? '16:9' : project.aspect;
        const response = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token },
          body: JSON.stringify({ prompt, aspectRatio, quality: 'standard', returnBase64: false }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.imageUrl) throw new Error(payload.error || 'AI image generation failed.');
        url = String(payload.imageUrl);
      } else {
        const operationId = await submitBroll(prompt, project.aspect === '9:16' || project.aspect === '4:5' ? '9:16' : '16:9', 6);
        setNotice('AI B-roll was handed to the server. You can close this page and return later.');
        const adopted = await adoptExternalOperation({
          provider: 'veo', operationId,
          modelId: 'veo-3.1-fast-generate-preview',
          modelName: 'Video Enhancer · editor B-roll',
          prompt, duration: 6,
          onAdopted: (jobId) => window.localStorage.setItem(ACTIVE_BROLL_KEY, JSON.stringify({ jobId, prompt, duration: 6 })),
        });
        if (adopted) {
          url = adopted.videoUrl;
          assetDuration = 6;
          window.localStorage.removeItem(ACTIVE_BROLL_KEY);
        } else {
          for (let attempt = 0; attempt < 120; attempt += 1) {
            await wait(5000);
            const status = await checkBroll(operationId);
            if (status.status === 'completed' && status.videoUrl) { url = status.videoUrl; assetDuration = 6; break; }
            if (status.status === 'failed') throw new Error(status.errorMessage || 'AI B-roll generation failed.');
          }
        }
        if (!url) throw new Error('AI B-roll is still rendering. Reopen Video Enhancer to resume this saved operation.');
      }
      const asset: EditorAsset = { id: newEditorId('asset'), name: kind === 'image' ? 'AI image' : 'AI B-roll', url, preview: url, duration: assetDuration, kind };
      const item: EditorItem = { id: newEditorId('broll'), track: 'broll', name: asset.name, start: playhead, duration: Math.min(assetDuration, Math.max(.5, duration - playhead)), assetId: asset.id, volume: 0, x: 50, y: 50, scale: 1, opacity: 1, crop: { x: 0, y: 0, w: 1, h: 1 } };
      commit((value) => ({ ...value, assets: [...value.assets, asset], items: [...value.items, item] }));
      setSelected([item.id]);
      setNotice(`${asset.name} added at ${formatEditorTime(playhead)}.`);
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setBrollBusy(false); }
  };
  const generateMusic = async () => {
    if (!musicPrompt.trim() || musicBusy) return;
    setMusicBusy(true);
    setError('');
    try {
      const token = (window as any).__workspaceDb?.token;
      if (!token) throw new Error('Your workspace session is still loading.');
      const prompt = (await makePromptSafe({ prompt: musicPrompt.trim(), mode: editorMode === 'auto' ? 'autopilot' : 'copilot' })).prompt;
      const response = await fetch(`/api/workspaces/${WORKSPACE_UUID}/audio/music/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token },
        body: JSON.stringify({ prompt, lengthMs: Math.max(3000, Math.min(600000, Math.round(Math.max(3, duration) * 1000))), instrumental: true, provider: 'gemini' }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.audioUrl) throw new Error(payload.error || 'Music generation failed.');
      const item: EditorItem = { id: newEditorId('music'), track: 'music', name: 'AI soundtrack', start: 0, duration: Math.max(1, duration), assetId: String(payload.audioUrl), volume: .22, fadeIn: .5, fadeOut: 1.2, loop: true };
      commit((value) => ({ ...value, items: [...value.items.filter((entry) => entry.track !== 'music'), item] }));
      setSelected([item.id]);
      setNotice('AI soundtrack added with voice-friendly volume.');
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setMusicBusy(false); }
  };
  const toggleWord = (word: EditorWord) => {
    commit((value) => {
      const words = value.words.map((entry) => entry.id === word.id ? { ...entry, removed: !entry.removed } : entry);
      return { ...value, words, items: [...value.items.filter((item) => item.track !== 'caption'), ...(value.caption.enabled ? captionItems(words, value.caption.wordsPerLine) : [])] };
    });
  };
  const cycleRole = (word: EditorWord) => {
    commit((value) => ({ ...value, words: value.words.map((entry) => entry.id === word.id ? { ...entry, role: cycleWordRole(entry.role) } : entry) }));
  };
  const editWord = (word: EditorWord) => {
    const next = window.prompt('Edit transcript word', word.text);
    if (next === null || !next.trim()) return;
    commit((value) => {
      const words = value.words.map((entry) => entry.id === word.id ? { ...entry, text: next.trim(), removed: false } : entry);
      return { ...value, words, items: [...value.items.filter((item) => item.track !== 'caption'), ...(value.caption.enabled ? captionItems(words, value.caption.wordsPerLine) : [])] };
    });
  };
  const cropDrag = (event: ReactPointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    if (!previewItem) return;
    event.preventDefault();
    event.stopPropagation();
    checkpoint();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const originX = event.clientX;
    const originY = event.clientY;
    const base = previewItem.crop || { x: 0, y: 0, w: 1, h: 1 };
    const move = (next: PointerEvent) => {
      const dx = (next.clientX - originX) / bounds.width;
      const dy = (next.clientY - originY) / bounds.height;
      let x = base.x, y = base.y, w = base.w, h = base.h;
      if (corner.includes('w')) { x = clampEditor(base.x + dx, 0, base.x + base.w - .1); w = base.w + base.x - x; }
      else w = clampEditor(base.w + dx, .1, 1 - base.x);
      if (corner.includes('n')) { y = clampEditor(base.y + dy, 0, base.y + base.h - .1); h = base.h + base.y - y; }
      else h = clampEditor(base.h + dy, .1, 1 - base.y);
      edit((value) => ({ ...value, items: value.items.map((item) => item.id === previewItem.id ? { ...item, crop: { x, y, w, h } } : item) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const updateRoleStyle = (roleName: WordRole, patch: Partial<RoleStyle>) => commit((value) => ({ ...value, caption: { ...value.caption, roleStyles: { ...(value.caption.roleStyles || {}), [roleName]: { ...(value.caption.roleStyles?.[roleName] || {}), ...patch } } } }));
  const applyCaptionPreset = (preset: CaptionPreset) => {
    const source = CAPTION_STYLES.find((style) => style.id === preset.styleId);
    commit((value) => ({ ...value, caption: { ...value.caption, styleId: preset.styleId, fontId: preset.fontId, animation: preset.animation, size: source ? Math.round(source.sizeRatio * 1080) : value.caption.size, color: preset.color, activeColor: preset.activeColor, stroke: preset.stroke, background: source?.background || value.caption.background, uppercase: preset.uppercase, roleStyles: undefined, behind: { ...value.caption.behind, on: value.caption.enabled && (Boolean(preset.behind) || value.caption.behind.on), status: value.caption.enabled && preset.behind ? 'Preparing cut-out…' : value.caption.behind.status } } }));
  };
  const updateEffect = (type: string, changes: Partial<EditorEffect> = {}) => {
    commit((value) => {
      const found = (value.effects || []).find((effect) => effect.type === type);
      const selectedVideo = value.items.find((item) => selected.includes(item.id) && item.track === 'video') || value.items.find((item) => item.track === 'video');
      const base: EditorEffect = found || { id: newEditorId('fx'), type, enabled: true, intensity: 55, scope: 'timeline' };
      const next = { ...base, ...changes };
      if (next.scope === 'clip') next.itemId = selectedVideo?.id;
      else delete next.itemId;
      return { ...value, effects: [...(value.effects || []).filter((effect) => effect.id !== base.id), next] };
    });
  };
  const captionDrag = (event: ReactPointerEvent) => {
    if (!activeCaption || !canvasRef.current) return;
    event.preventDefault();
    checkpoint();
    const bounds = canvasRef.current.getBoundingClientRect();
    const move = (next: PointerEvent) => edit((value) => ({ ...value, caption: { ...value.caption, x: clampEditor(((next.clientX - bounds.left) / bounds.width) * 100, 5, 95), y: clampEditor(((next.clientY - bounds.top) / bounds.height) * 100, 11, 81) } }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const applyPreset = (preset: EditorPreset) => {
    const bed = MUSIC_BEDS.find((entry) => entry.id === preset.musicId);
    commit((value) => ({
      ...value,
      aspect: preset.aspect,
      grade: preset.grade,
      caption: { ...value.caption, styleId: preset.captionStyle },
      items: [...value.items.filter((item) => item.track !== 'music'), ...(bed ? [{ id: newEditorId('music'), track: 'music' as const, name: bed.label, start: 0, duration: Math.max(1, editorDuration(value)), assetId: bed.url, volume: .22, fadeIn: .5, fadeOut: 1, loop: true }] : [])],
    }));
  };

  const runAgent = async (override?: string, forceMode?: 'manual' | 'auto') => {
    const instruction = (typeof override === 'string' ? override : agentText).trim();
    if (!instruction || agentBusy) return;
    setAgentBusy(true);
    setError('');
    setQaStatus('');
    setAgentSteps([]);
    const requestBase = projectRef.current;
    const mode = forceMode || editorMode;
    try {
      const plan = await runAgentBrain({
        project: requestBase, instruction, mode, creditCap: autoSpending,
        sourceFile: editorSource(requestBase) ? sourceFiles.current.get(editorSource(requestBase)!.id) : undefined,
        onStep: (step) => setAgentSteps((items) => [...items.filter((item) => item.id !== step.id), step]),
      });
      if (plan.question) { setNotice(plan.question); return; }
      if (!plan.operations.length) { setNotice(plan.summary || 'No safe edit was found.'); return; }
      const before = projectRef.current;
      const withTranscript = plan.transcript.length && !before.words.length ? { ...before, words: pickKeyWordRoles(plan.transcript, before.caption.wordsPerLine) } : before;
      const after = applyEditorOperations(withTranscript, plan.operations, CAPTION_PRESETS.map((style) => style.id), [...MUSIC_BEDS]);
      if (mode === 'auto') {
        setHistory((stack) => [...stack.slice(-49), before]);
        setFuture([]);
        setProject(after);
        setReview({ summary: plan.summary, instruction, operations: plan.operations, before, after, applied: true, model: plan.model, steps: plan.steps });
        setQaStatus(main?.url ? 'Checking the new cut · Gemini vision' : 'New cut not checked · no preview source');
        if (main?.url) void checkAcceptedCut(after, main.url).then((result) => { setQaStatus(result.reviewByEye ? 'New cut not checked · review by eye' : `Checked by Gemini vision · ${Math.round(Object.values(result.scores).reduce((sum, value) => sum + value, 0) / 6)}/10`); if (result.scores.safe_zone < 7) setProject((value) => ({ ...value, caption: { ...value.caption, y: 30 } })); });
      } else {
        setReview({ summary: plan.summary, instruction, operations: plan.operations, before, after, applied: false, model: plan.model, steps: plan.steps });
      }
      setNotice(plan.summary);
      setAgentText('');
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setAgentBusy(false); }
  };
  const acceptPending = () => {
    if (!review || review.applied) return;
    setHistory((stack) => [...stack.slice(-49), review.before]);
    setFuture([]);
    setProject(review.after);
    setReview({ ...review, applied: true });
    setQaStatus(main?.url ? 'Checking the new cut · Gemini vision' : 'New cut not checked · no preview source');
    if (main?.url) void checkAcceptedCut(review.after, main.url).then((result) => { setQaStatus(result.reviewByEye ? 'New cut not checked · review by eye' : `Checked by Gemini vision · ${Math.round(Object.values(result.scores).reduce((sum, value) => sum + value, 0) / 6)}/10`); if (result.scores.safe_zone < 7) setProject((value) => ({ ...value, caption: { ...value.caption, y: 30 } })); });
  };
  const dropPending = (index: number) => setReview((value) => {
    if (!value || value.applied) return value;
    const operations = value.operations.filter((_, operationIndex) => operationIndex !== index);
    return { ...value, operations, after: applyEditorOperations(value.before, operations, CAPTION_PRESETS.map((style) => style.id), [...MUSIC_BEDS]) };
  });

  useEffect(() => {
    const job = project.renderJob;
    if (!job || !job.operationId || pollingOperation.current) return;
    pollingOperation.current = job.operationId;
    setExporting(true);
    setExportStartedAt(Date.now());
    setExportProgress(job.progress || 8);
    let cancelled = false;
    void (async () => {
      try {
        for (let attempt = 0; attempt < 180 && alive.current && !cancelled; attempt += 1) {
          await wait(Math.min(12000, 3000 + attempt * 100));
          const status = await callHook('veh-render', { operationId: job.operationId, geometry: job.geometry, aspect: job.aspect, budgetMs: 20000 });
          const progress = Math.min(94, Math.max(job.progress || 8, 8 + attempt * .8));
          setExportProgress(progress);
          if (attempt % 5 === 0) edit((value) => ({ ...value, renderJob: value.renderJob ? { ...value.renderJob, progress } : undefined }));
          if (status?.status === 'complete' && status.renderUrl) {
            const url = String(status.renderUrl);
            setExportUrl(url);
            setExportProgress(100);
            setNotice('Export complete and saved to Video Library.');
            const finishedProject = { ...projectRef.current, renderJob: undefined, lastExportUrl: url };
            edit(() => finishedProject);
            void saveProject(finishedProject, 'exported', url).catch(() => undefined);
            void saveVideoToHistory({ appId: 'video-enhancer', title: finishedProject.title, videoUrl: url, durationSec: editorDuration(finishedProject) });
            break;
          }
          if (status?.status === 'failed') throw new Error(status.error || 'The export failed.');
        }
      } catch (nextError) {
        if (!cancelled) setError(readableError(nextError));
      } finally {
        if (!cancelled) setExporting(false);
        if (pollingOperation.current === job.operationId) pollingOperation.current = '';
      }
    })();
    return () => { cancelled = true; };
  }, [project.renderJob?.operationId]);

  const exportVideo = async () => {
    const renderProject = effectiveEditorProject(projectRef.current);
    const renderMain = editorSource(renderProject);
    if (!renderMain || exporting) return;
    setExporting(true);
    setExportStartedAt(Date.now());
    setExportProgress(4);
    setError('');
    try {
      const clips = renderProject.items.filter((item) => item.track === 'video').sort((a, b) => a.start - b.start).map((item) => {
        const asset = renderProject.assets.find((entry) => entry.id === item.assetId);
        const sourceIn = item.sourceIn || 0;
        return { url: asset?.url || '', in: sourceIn, out: Math.min(asset?.duration || sourceIn + item.duration * (item.speed || 1), sourceIn + item.duration * (item.speed || 1)), speed: item.speed || 1, reverse: false, opacity: item.opacity ?? 1, muted: (item.volume ?? 1) === 0, volume: item.volume ?? 1, brightness: renderProject.brightness, contrast: renderProject.contrast, saturation: renderProject.saturation, highlights: 0, shadows: 0, temperature: 0, tint: 0, x: (item.x ?? 50) / 100, y: (item.y ?? 50) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, crop: item.crop || { x: 0, y: 0, w: 1, h: 1 }, freeze: Boolean(item.freeze), effects: (renderProject.effects || []).filter((effect) => effect.enabled && effect.scope === 'clip' && effect.itemId === item.id).map((effect) => ({ id: effect.type, intensity: effect.intensity })), motion: { shake: { enabled: Boolean((renderProject.effects || []).find((effect) => effect.enabled && effect.type === 'shake' && (effect.scope === 'timeline' || effect.itemId === item.id))), intensity: (renderProject.effects || []).find((effect) => effect.type === 'shake')?.intensity || 0, frequency: 'medium' }, zoomCut: { enabled: Boolean((renderProject.effects || []).find((effect) => effect.enabled && effect.type === 'zoomPunch' && (effect.scope === 'timeline' || effect.itemId === item.id))), intensity: 'medium', direction: 'in' }, ramp: { enabled: Boolean((renderProject.effects || []).find((effect) => effect.enabled && effect.type === 'speedRamp' && (effect.scope === 'timeline' || effect.itemId === item.id))), curve: 'punch', intensity: .5 } }, transitionIn: item.transition && item.transition !== 'cut' ? { id: item.transition, duration: .35 } : (renderProject.effects || []).some((effect) => effect.enabled && effect.type === 'fadeDissolve') ? { id: 'crossfade', duration: .45 } : null, timelineStart: item.start };
      });
      const captions = renderProject.caption.enabled ? renderProject.items.filter((item) => item.track === 'caption').map((item) => ({ id: item.id, text: item.text || item.name, start: item.start, end: item.start + item.duration, words: renderProject.words.filter((word) => !word.removed && word.start >= item.start - .05 && word.end <= item.start + item.duration + .05).map((word) => ({ id: word.id, text: word.text, start: word.start, end: word.end, role: word.role || 'normal' })) })) : [];
      const broll = renderProject.items.filter((item) => item.track === 'broll').map((item) => {
        const asset = renderProject.assets.find((entry) => entry.id === item.assetId);
        return { id: item.id, label: item.name, url: asset?.url || '', previewUrl: asset?.url || '', sourceDuration: asset?.duration || item.duration, sourceIn: item.sourceIn || 0, sourceOut: Math.min(asset?.duration || item.duration, (item.sourceIn || 0) + item.duration * (item.speed || 1)), start: item.start, end: item.start + item.duration, position: 'free', x: (item.x ?? 50) / 100, y: (item.y ?? 50) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, crop: item.crop || { x: 0, y: 0, w: 1, h: 1 }, opacity: item.opacity ?? 1, radius: 0, muted: (item.volume ?? 0) === 0, volume: item.volume ?? 0, duckMain: true, duckVolume: .2, audioFadeIn: item.fadeIn ?? .2, audioFadeOut: item.fadeOut ?? .4, fadeOut: true };
      });
      const music = renderProject.items.find((item) => item.track === 'music');
      const started = await callHook('veh-render', {
        budgetMs: 20000, aspect: renderProject.aspect, grade: renderProject.grade, globalEffects: (renderProject.effects || []).filter((effect) => effect.enabled && effect.scope === 'timeline').map((effect) => ({ id: effect.type, intensity: effect.intensity })), clips, videoOverlays: broll, captions,
        captionSettings: { enabled: renderProject.caption.enabled, styleId: RENDER_CAPTION_STYLE[renderProject.caption.styleId] || 'tiktok', sourceStyleId: renderProject.caption.styleId, style: CAPTION_PRESETS.find((preset) => preset.styleId === renderProject.caption.styleId), roleStyles: renderProject.caption.roleStyles || {}, fontId: renderCaptionFont(renderProject.caption.fontId), sizeScale: renderProject.caption.size / 62, color: renderProject.caption.color, activeColor: renderProject.caption.activeColor, outlineColor: '#000000', outlineWidth: renderProject.caption.stroke, shadowBlur: renderProject.caption.shadow, position: renderProject.caption.position, x: (renderProject.caption.x ?? 50) / 100, y: Math.max(.11, Math.min(.81, (renderProject.caption.y ?? 78) / 100)), offsetY: 0, uppercase: renderProject.caption.uppercase, italic: false, burnIn: renderProject.caption.enabled, animation: renderProject.caption.animation, background: 'preset', backgroundColor: renderProject.caption.background, backgroundOpacity: .55, maxWords: renderProject.caption.wordsPerLine, letterSpacing: capSpacing.letter, wordSpacing: capSpacing.word, lineHeight: capSpacing.line, padding: capSpacing.pad, behind: renderProject.caption.enabled ? renderProject.caption.behind : { ...renderProject.caption.behind, on: false }, cutoutUrl: renderMain.cutoutUrl || '' },
        vfx: {},
        textLayers: renderProject.items.filter((item) => item.track === 'text').map((item) => ({ id: item.id, text: item.text || item.name, start: item.start, end: item.start + item.duration, x: (item.x ?? 50) / 100, y: (item.y ?? 25) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, opacity: item.opacity ?? 1, fontId: 'inter', size: 72, weight: 800, color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 0, shadowColor: '#000000', shadowBlur: 18, entrance: 'scalePop', exit: 'fadeOut', animDuration: .45, align: 'center', behindSubject: false })),
        overlays: [], musicUrl: music?.assetId || '', musicVolume: music?.volume ?? 0, musicFadeIn: music?.fadeIn ?? 0, musicFadeOut: music?.fadeOut ?? 0, musicAutoDuck: Boolean(music), musicStyle: music ? 'uptempo' : 'none',
      });
      let completed = started?.status === 'complete' ? started.renderUrl : '';
      if (!completed) {
        if (!started?.operationId) throw new Error(started?.error || 'The export could not start.');
        pollingOperation.current = String(started.operationId);
        edit((value) => ({ ...value, renderJob: { operationId: String(started.operationId), geometry: started.geometry, aspect: renderProject.aspect, progress: 8 } }));
        for (let attempt = 0; attempt < 180 && alive.current; attempt += 1) {
          await wait(Math.min(12000, 3000 + attempt * 100));
          const status = await callHook('veh-render', { operationId: started.operationId, geometry: started.geometry, aspect: renderProject.aspect, budgetMs: 20000 });
          const progress = Math.min(94, 8 + attempt * .8);
          setExportProgress(progress);
          if (attempt % 5 === 0) edit((value) => ({ ...value, renderJob: value.renderJob ? { ...value.renderJob, progress } : undefined }));
          if (status?.status === 'complete' && status.renderUrl) { completed = status.renderUrl; break; }
          if (status?.status === 'failed') throw new Error(status.error || 'The export failed.');
        }
      }
      if (!completed) throw new Error('The export is still rendering. Reopen this project to resume.');
      setExportUrl(completed);
      setExportProgress(100);
      setNotice('Export complete and saved to Video Library.');
      const finishedProject = { ...projectRef.current, renderJob: undefined, lastExportUrl: completed };
      edit(() => finishedProject);
      await saveProject(finishedProject, 'exported', completed).catch(() => undefined);
      void saveVideoToHistory({ appId: 'video-enhancer', title: finishedProject.title, videoUrl: completed, durationSec: editorDuration(finishedProject) });
    } catch (nextError) { setError(readableError(nextError)); }
    finally {
      setExporting(false);
      pollingOperation.current = '';
    }
  };

  const mediaPanel = <>
    <div className="vx-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void upload(file); }}><Upload size={23} color="var(--accent)" /><h2>{project.assets.length ? 'Add another clip' : 'Start with your footage'}</h2><p>Drop a file here or choose one · MP4, MOV or WebM · up to 500 MB</p><label className="vx-btn primary">{uploading ? <Loader2 size={13} /> : <Upload size={13} />}{uploading ? 'Uploading…' : 'Choose video'}<input hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label></div>
    <Panel title="Project media"><div className="vx-grid">{project.assets.map((asset) => { const placed = project.items.find((item) => item.assetId === asset.id); return <button type="button" className={`vx-card${placed && selected.includes(placed.id) ? ' on' : ''}`} key={asset.id} disabled={!placed} title={placed ? 'Select this clip on the timeline' : 'Not on the timeline'} onClick={() => { if (!placed) return; setSelected([placed.id]); seek(placed.start); }}><Video size={15} /><b>{asset.name}</b><small>{asset.kind} · {asset.duration.toFixed(1)}s{placed ? ` · at ${formatEditorTime(placed.start)}` : ''}</small></button>; })}</div>{!project.assets.length ? <Empty icon={Film} title="No media yet">Uploaded clips appear here and on the timeline.</Empty> : null}</Panel>
  </>;
  const brollPanel = <>
    <Panel title="AI tools"><div className="vx-actions"><button className="vx-btn" onClick={() => setSilenceOpen(true)}><Scissors size={13} />Silences</button></div><p className="vx-help">Every AI edit appears as a proposal in Manual mode. Generated B-roll shows its credit cost before use.</p></Panel>
    <Panel title="B-roll search"><div className="vx-row"><input className="vx-input vx-grow" aria-label="Search visuals" value={stockQuery} placeholder="Search visuals" onChange={(event) => setStockQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchStock(); }} /><button className="vx-icon" title="Search" aria-label="Search" onClick={() => void searchStock()}>{stockBusy ? <Loader2 size={14} /> : <Search size={14} />}</button></div><div className="vx-row vx-wrap"><button className="vx-btn" onClick={suggestBroll}><Sparkles size={13} />Suggest from transcript</button><label className="vx-btn"><Upload size={13} />Upload clip<input hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, true); event.target.value = ''; }} /></label></div></Panel>
    <Panel title="Generate B-roll"><textarea className="vx-input" aria-label="B-roll prompt" rows={3} value={brollPrompt} placeholder="Describe the cutaway…" onChange={(event) => setBrollPrompt(event.target.value)} /><p className="vx-help">AI image ≈ $0.04–$0.07 · AI video shows the wallet estimate before provider generation.</p><div className="vx-actions"><button className="vx-btn" disabled={brollBusy || !brollPrompt.trim()} onClick={() => void generateBroll('image')}>{brollBusy ? <Loader2 size={13} /> : <ImageIcon size={13} />}AI image</button><button className="vx-btn primary" disabled={brollBusy || !brollPrompt.trim()} onClick={() => void generateBroll('video')}>{brollBusy ? <Loader2 size={13} /> : <Video size={13} />}AI video</button></div></Panel>
    <div className="vx-grid">{stock.map((photo) => <button className="vx-card" key={photo.id} onClick={() => addStock(photo)}><img className="vx-thumb" src={photo.urls.thumb} alt="" /><b>{photo.description || photo.altDescription || 'Stock visual'}</b><small>Click to add at the playhead</small></button>)}</div>{!stock.length ? <Empty icon={Search} title="No visuals yet">Search royalty-free visuals matched to your transcript, then drag one onto the B-roll track.</Empty> : null}
  </>;
  const captionPanel = <>
    <Panel title="Captions"><FeatureToggle icon={Captions} label="Captions" on={project.caption.enabled} detail={project.caption.enabled ? project.words.length ? `${project.words.length} timed words` : 'On · waiting for footage' : 'Off · no caption track or cost'} busy={transcribing} busyLabel="Transcribing…" disabled={!main && !project.caption.enabled} onChange={setCaptionsEnabled} /><p className="vx-help">Turning captions off removes every caption layer from preview, timeline and export. Turning them on reuses saved timing or generates it once.</p></Panel>
    <Panel title="Transcript"><button className="vx-btn primary" disabled={!main || transcribing || !project.caption.enabled} onClick={() => void transcribe()}>{transcribing ? <Loader2 size={13} /> : <Captions size={13} />}{transcribing ? 'Transcribing…' : project.words.length ? 'Re-transcribe' : 'Generate captions'}</button>{transcriptionError ? <div className="vx-inline-error" role="alert"><b>Transcription failed</b><span>{transcriptionError}</span><button className="vx-btn" disabled={transcribing} onClick={() => void transcribe()}><RefreshCw size={13} />Retry transcription</button></div> : null}{project.words.length ? <div className="vx-transcript">{project.words.map((word) => <button key={word.id} title="Tap: Normal → Key → Emphasis · double-click: edit · right-click: cut/restore" data-role={word.role || 'normal'} className={`vx-word role-${word.role || 'normal'}${word.filler ? ' filler' : ''}${word.removed ? ' removed' : ''}${playhead >= word.start && playhead <= word.end ? ' live' : ''}`} onClick={() => { seek(word.start); cycleRole(word); }} onDoubleClick={() => editWord(word)} onContextMenu={(event) => { event.preventDefault(); toggleWord(word); }}>{word.text}</button>)}</div> : <Empty icon={Captions} title="No transcript yet">Auto captions detect punctuation and word timing. Click a word to edit it; right-click to cut or restore it.</Empty>}</Panel>
    <Panel title="Caption styles" hint={`${CAPTION_PRESETS.length} presets`}><div className="vx-cap-cats">{CAPTION_CATEGORIES.map((category) => <button key={category.id} className={`vx-pill${captionCategory === category.id ? ' on' : ''}`} onClick={() => setCaptionCategory(category.id)}>{category.id === 'behind' ? <i /> : null}{category.label}</button>)}</div><label className="vx-switch"><input type="checkbox" checked={project.caption.autoPickRoles} onChange={(event) => commit((value) => ({ ...value, caption: { ...value.caption, autoPickRoles: event.target.checked }, words: event.target.checked ? pickKeyWordRoles(value.words, value.caption.wordsPerLine) : value.words }))} /><span>Pick key words for me (AI)</span></label><div className="vx-picker" role="listbox" aria-label="Caption styles">{CAPTION_PRESETS.filter((preset) => captionCategory === 'all' || preset.cat === captionCategory).map((preset) => { const on = project.caption.styleId === preset.styleId; return <button type="button" role="option" aria-selected={on} key={preset.id} data-caption-preset={preset.styleId} className={`vx-card vx-capcard${on ? ' on' : ''}`} onClick={() => applyCaptionPreset(preset)}><CaptionThumb preset={preset} /><b>{preset.label}</b><small>{preset.hint}</small>{on ? <span className="check"><Check size={11} /></span> : null}</button>; })}</div></Panel>
    <Panel title="Text behind speaker" hint="Beta"><label className="vx-switch"><input type="checkbox" disabled={!project.caption.enabled} checked={project.caption.enabled && project.caption.behind.on} onChange={(event) => commit((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, on: value.caption.enabled && event.target.checked, status: value.caption.enabled && event.target.checked ? 'Preparing cut-out…' : '' } } }))} /><span>{project.caption.behind.on ? project.caption.behind.status || `Speaker cut out · all ${formatEditorTime(duration)} · free` : 'Off'}</span></label>{project.caption.behind.on ? <><Range label="Word size" value={project.caption.behind.size} min={20} max={60} suffix="%" onChange={(size) => edit((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, size } } }))} /><Range label="Edge softness" value={project.caption.behind.softness} min={0} max={8} suffix="px" onChange={(softness) => edit((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, softness } } }))} /><div className="vx-segment">{([['key','Key words'],['hook','Hook only'],['every','Every line']] as const).map(([which,label]) => <button key={which} className={`vx-pill${project.caption.behind.which === which ? ' on' : ''}`} onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, behind: { ...value.caption.behind, which } } }))}>{label}</button>)}</div><p className="vx-help">{project.caption.behind.route === 'soft-box' ? 'Soft box mode · free' : 'Pixel cut-out preview · export uses the same layer order'}</p></> : null}</Panel>
    <Panel title="Caption spacing"><Range label="Letter spacing" value={capSpacing.letter} min={-2} max={12} step={0.5} suffix=" px" onChange={(letter) => setCapSpacing((value) => ({ ...value, letter }))} /><Range label="Word spacing" value={capSpacing.word} min={0} max={24} suffix=" px" onChange={(word) => setCapSpacing((value) => ({ ...value, word }))} /><Range label="Line height" value={capSpacing.line} min={0.9} max={2} step={0.05} suffix="×" onChange={(line) => setCapSpacing((value) => ({ ...value, line }))} /><Range label="Padding" value={capSpacing.pad} min={0} max={32} suffix=" px" onChange={(pad) => setCapSpacing((value) => ({ ...value, pad }))} /><div className="vx-row"><button type="button" className="vx-btn" disabled={JSON.stringify(capSpacing) === JSON.stringify(DEFAULT_CAPTION_SPACING)} onClick={() => setCapSpacing(DEFAULT_CAPTION_SPACING)}><RefreshCw size={13} />Reset spacing</button></div><p className="vx-help">Spacing updates the live preview and is included in the caption style sent to export. Padding 0 keeps the style default.</p></Panel>
    <Panel title="Caption position & offset"><div className="vx-position-grid">{CAPTION_POSITIONS.map(([position, y]) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, position, y } }))}>{position.replace('-', ' ')}</button>)}</div><Range label="Offset X" value={project.caption.x ?? 50} min={5} max={95} suffix="%" onChange={(x) => edit((value) => ({ ...value, caption: { ...value.caption, x } }))} /><Range label="Offset Y" value={project.caption.y ?? 78} min={11} max={81} suffix="%" onChange={(y) => edit((value) => ({ ...value, caption: { ...value.caption, y } }))} /><p className="vx-help">Drag the caption directly on the preview. Dashed guides show the safe title area.</p></Panel>
  </>;
  const effectsPanel = <><Panel title="Preview + export effects"><p className="vx-help">Every effect is rendered by the same project spec used for export. Choose whole timeline or the selected clip.</p>{EFFECTS.map(([id, label]) => { const effect = (project.effects || []).find((entry) => entry.type === id); return <div className="vx-effect" key={id} data-effect={id}><div className="vx-row"><button className={`vx-pill${effect?.enabled ? ' on' : ''}`} onClick={() => updateEffect(id, { enabled: !effect?.enabled })}>{effect?.enabled ? 'On' : 'Off'}</button><b className="vx-grow">{label}</b><select className="vx-mini-select" value={effect?.scope || 'timeline'} onChange={(event) => updateEffect(id, { enabled: true, scope: event.target.value as 'clip' | 'timeline' })}><option value="timeline">Timeline</option><option value="clip">Clip</option></select></div><Range label="Intensity" value={effect?.intensity ?? 55} min={0} max={100} suffix="%" onChange={(intensity) => updateEffect(id, { enabled: true, intensity })} /></div>; })}</Panel><Panel title="Motion graphics"><p className="vx-help">Open the existing shared motion engine for advanced overlays without changing this cut.</p><button type="button" className="vx-btn" disabled={motionBusy || !main?.url} onClick={() => void openMotionEditor()}><Wand2 size={13} />{motionBusy ? 'Preparing…' : motionOpen ? 'Close motion editor' : 'Open motion editor'}</button></Panel></>;
  const audioPanel = <><Panel title="Music library"><div className="vx-grid">{MUSIC_BEDS.map((bed) => <button className="vx-card" key={bed.id} onClick={() => applyPreset({ id: bed.id, name: bed.label, aspect: project.aspect, captionStyle: project.caption.styleId, musicId: bed.id, grade: project.grade })}><Music2 size={14} /><b>{bed.label}</b><small>Loopable · auto-duck ready</small></button>)}</div></Panel><Panel title="Generate soundtrack"><textarea className="vx-input" aria-label="Soundtrack prompt" rows={3} value={musicPrompt} onChange={(event) => setMusicPrompt(event.target.value)} /><p className="vx-help">Gemini music costs about $0.04–$0.08 per track. Generated audio is durable and editable on the Music track.</p><button className="vx-btn primary" disabled={musicBusy || !musicPrompt.trim() || !duration} onClick={() => void generateMusic()}>{musicBusy ? <Loader2 size={13} /> : <Zap size={13} />}{musicBusy ? 'Generating…' : 'Generate & add'}</button></Panel><Panel title="Voice & SFX"><p className="vx-help">Original voice and B-roll audio stay on separate tracks. Select an audio item to trim, fade, loop or mix it in the right inspector.</p></Panel></>;
  const textPanel = <Panel title="Text overlays"><button className="vx-btn primary" onClick={() => { const item: EditorItem = { id: newEditorId('text'), track: 'text', name: 'Your headline', text: 'Your headline', start: playhead, duration: Math.min(3, Math.max(.5, duration - playhead)) }; commit((value) => ({ ...value, items: [...value.items, item] })); setSelected([item.id]); }}><Plus size={13} />Add text at playhead</button>{project.items.filter((item) => item.track === 'text').map((item) => <button className={`vx-card${selected.includes(item.id) ? ' on' : ''}`} key={item.id} onClick={() => setSelected([item.id])}><Type size={14} /><b>{item.text}</b><small>{formatEditorTime(item.start)}–{formatEditorTime(item.start + item.duration)}</small></button>)}{!project.items.some((item) => item.track === 'text') ? <Empty icon={Type} title="No text overlays">Add a headline at the playhead, then fine-tune it in the right inspector.</Empty> : null}</Panel>;
  const silencePanel = <>
    <div className="vx-auto-intro">
      <h2><Scissors size={17} />Silence cuts</h2>
      <p>Audio is analyzed locally. Included pauses are removed non-destructively and the video, voice, captions and overlays are re-stitched together.</p>
    </div>
    <Panel title="Feature">
      <FeatureToggle icon={Scissors} label="Silence cuts" on={project.silence.enabled} detail={project.silence.enabled ? project.silence.removedSeconds > 0 ? `${project.silence.removedSeconds.toFixed(1)}s removed` : 'On · no cuts found' : 'Off · original timing'} busy={silenceBusy} disabled={!main && !project.silence.enabled} onChange={setSilenceEnabled} />
      {project.silence.status ? <div className="vx-status-note" role="status">{project.silence.status}</div> : null}
    </Panel>
    <Panel title="Detection settings">
      <Range label="Quiet below" value={project.silence.thresholdDb} min={-70} max={-10} suffix=" dB" disabled={silenceBusy} onChange={(thresholdDb) => updateSilenceSetting({ thresholdDb })} />
      <Range label="Min pause" value={project.silence.minDuration} min={0.1} max={2} step={0.1} suffix=" s" disabled={silenceBusy} onChange={(minDuration) => updateSilenceSetting({ minDuration })} />
      <Range label="Keep padding" value={project.silence.paddingMs} min={0} max={500} step={10} suffix=" ms" disabled={silenceBusy} onChange={(paddingMs) => updateSilenceSetting({ paddingMs })} />
      <button className="vx-btn primary" disabled={!main || silenceBusy || !project.silence.enabled} onClick={() => void analyzeSilence()}>{silenceBusy ? <Loader2 size={13} /> : <Scissors size={13} />}{silenceBusy ? 'Analyzing…' : project.silence.regions.length ? 'Detect again' : 'Detect silences'}</button>
      <p className="vx-help">Detection uses the clip’s waveform, not transcription, so it does not trigger transcription cost.</p>
    </Panel>
    <Panel title="Detected cuts" hint={project.silence.regions.length ? `${project.silence.regions.length} pauses` : undefined}>
      {project.silence.regions.length ? project.silence.regions.map((region, index) => <div className="vx-item-row" key={`${region.start}-${region.end}-${index}`}><Scissors size={13} color="var(--danger)" /><span className="vx-grow" style={{ fontSize: 12 }}>{formatEditorTime(region.start)}–{formatEditorTime(region.end)}</span><span style={{ color: 'var(--danger)', fontSize: 12 }}>{(region.end - region.start).toFixed(1)}s</span></div>) : <Empty icon={Scissors} title="No silence cuts">Turn the feature on to analyze audio, or adjust the settings and detect again.</Empty>}
    </Panel>
  </>;
  const agentPanel = <>
    <div className="vx-auto-intro"><h2><Bot size={17} /><Sparkles size={14} />Auto agent</h2><p>Describe the finished cut. Manual mode proposes; Auto creates Version 2 while Version 1 stays undoable.</p></div>
    <Panel title="Verger edit agent"><textarea className="vx-input" aria-label="Describe the edit" rows={4} value={agentText} placeholder="Try “add B-roll and zoom on key words”" onChange={(event) => setAgentText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void runAgent(); }} /><Range label="Spending" value={autoSpending} min={0} max={100} suffix=" cr" onChange={setAutoSpending} /><p className="vx-help">Stock B-roll costs 0. AI B-roll is never planned above this cap.</p><button className="vx-btn primary" disabled={agentBusy || !agentText.trim()} onClick={() => void runAgent()}>{agentBusy ? <Loader2 size={14} /> : <Wand2 size={14} />}{agentBusy ? 'Planning…' : editorMode === 'auto' ? 'Create Version 2' : 'Propose edits'}</button></Panel>
    {agentSteps.length ? <Panel title="Run"><div className="vx-run-list">{agentSteps.map((step) => <div key={step.id} data-status={step.status}>{step.status === 'running' ? <Loader2 size={13} /> : <Check size={13} />}<span>{step.label}</span></div>)}</div>{qaStatus ? <p className="vx-help">{qaStatus}</p> : null}</Panel> : null}
    {review ? <section className="vx-agent-review"><h3>{review.applied ? 'Version 2 · What changed' : `${review.operations.length} proposed edits`}</h3><p>{review.summary}</p><ul>{review.operations.map((operation, index) => <li key={`${operation.type}-${index}`}><label><input type="checkbox" checked onChange={() => dropPending(index)} />{operation.why || operation.type.replace(/_/g, ' ')}{typeof (operation.t ?? operation.start) === 'number' ? ` · ${formatEditorTime(Number(operation.t ?? operation.start))}` : ''}</label></li>)}</ul><p className="vx-help">Planned by {review.model || 'fallback'} · one undo step</p><div className="vx-row">{review.applied ? <><button className="vx-btn primary" onClick={() => setReview(null)}><Check size={13} />Keep all</button><button className="vx-btn" onClick={() => { setProject(review.before); setReview(null); }}><Undo2 size={13} />Undo all</button></> : <><button className="vx-btn primary" onClick={acceptPending}><Check size={13} />Accept all</button><button className="vx-btn" onClick={() => setReview(null)}>Discard</button></>}</div></section> : <Empty icon={Bot} title="No plan yet">Proposed edits appear as gold ghosts on the timeline before the saved project changes.</Empty>}
  </>;
  const leftPanel = editorMode === 'auto' ? agentPanel : tab === 'media' ? mediaPanel : tab === 'broll' ? (silenceOpen ? silencePanel : brollPanel) : tab === 'captions' ? captionPanel : tab === 'text' ? textPanel : tab === 'effects' ? effectsPanel : tab === 'audio' ? audioPanel : mediaPanel;
  const reviewCount = project.words.filter((word) => word.filler).length;
  const roleStylePanel = <Panel title="Role styles">{(['normal','key','emph'] as WordRole[]).map((roleName) => { const preset = CAPTION_PRESETS.find((item) => item.styleId === project.caption.styleId) || CAPTION_PRESETS[0]; const roleStyle = { ...preset.roles[roleName], ...(project.caption.roleStyles?.[roleName] || {}) }; return <div className="vx-role-editor" key={roleName}><b>{roleName === 'emph' ? 'Emphasis' : roleName[0].toUpperCase() + roleName.slice(1)}</b><select value={roleStyle.font} onChange={(event) => updateRoleStyle(roleName, { font: event.target.value as RoleStyle['font'] })}>{['inter','anton','serif','caveat','mono'].map((font) => <option key={font} value={font}>{font}</option>)}</select><select value={roleStyle.weight} onChange={(event) => updateRoleStyle(roleName, { weight: Number(event.target.value) })}>{[400,600,700,800,900].map((weight) => <option key={weight}>{weight}</option>)}</select><input aria-label={`${roleName} colour`} type="color" value={roleStyle.color} onChange={(event) => updateRoleStyle(roleName, { color: event.target.value })} /><label><input type="checkbox" checked={Boolean(roleStyle.italic)} onChange={(event) => updateRoleStyle(roleName, { italic: event.target.checked })} />Italic</label><input aria-label={`${roleName} size`} type="range" min={.5} max={1.6} step={.05} value={roleStyle.scale || 1} onChange={(event) => updateRoleStyle(roleName, { scale: Number(event.target.value) })} /></div>; })}</Panel>;

  return (
    <div className="vex">
      <style>{MODERN_EDITOR_CSS + SINGLE_PANEL_CSS}</style>
      <div className={`vx-work${!main ? ' is-empty' : ''}${mobileInspectorOpen ? ' inspector-open' : ''}`}>
        <main className="vx-center">
          <div className="vx-stagebar"><input className="vx-title" aria-label="Project title" value={project.title} onChange={(event) => edit((value) => ({ ...value, title: event.target.value }))} /><span className="vx-save">{saveState === 'Saving…' ? <Loader2 size={12} /> : <Check size={12} />}{saveState}</span><span className="vx-grow" /><span className="vx-version">Version {review?.applied ? 2 : 1}</span><ProjectsMenu projects={projects} activeId={projectId} onOpenProject={openProject} /><LibraryMenu rows={libraryRows} busy={libraryBusy} onRefresh={() => void loadLibrary()} onAdd={(row, broll) => void addLibraryVideo(row, broll)} /><EditorHistoryMenu past={history} present={project} future={future} onJump={jumpToHistory} onUndo={undo} onRedo={redo} /><button className="vx-export" disabled={!main || exporting} title={exporting ? 'Rendering on the cloud render farm. You can keep editing.' : 'Render this edit to an MP4 on the cloud render farm'} onClick={() => void exportVideo()}>{exporting ? <Loader2 size={14} /> : <Download size={14} />}{exporting ? `Rendering ${elapsedLabel(clockNow - (exportStartedAt || clockNow))}` : 'Export'}</button></div>
          <div className="vx-stage"><div ref={canvasRef} className="vx-canvas" data-aspect={project.aspect} style={{ '--ar': project.aspect === '9:16' ? 9 / 16 : project.aspect === '1:1' ? 1 : project.aspect === '4:5' ? 4 / 5 : 16 / 9, aspectRatio: project.aspect === '9:16' ? '9/16' : project.aspect === '1:1' ? '1/1' : project.aspect === '4:5' ? '4/5' : '16/9' } as CSSProperties}>
            {activeVideoAsset ? <video ref={videoRef} src={activeVideoAsset.preview || activeVideoAsset.url} playsInline onTimeUpdate={(event) => syncPreviewTime(event.currentTarget)} onEnded={(event) => syncPreviewTime(event.currentTarget)} style={{ filter: `brightness(${project.brightness / 100}) contrast(${project.contrast / 100}) saturate(${project.saturation / 100})`, opacity: baseVideoItem?.opacity ?? 1, objectPosition: `${baseVideoItem?.x ?? 50}% ${baseVideoItem?.y ?? 50}%`, transform: `scale(${baseVideoItem?.scale ?? 1}) rotate(${baseVideoItem?.rotation ?? 0}deg)`, clipPath: baseVideoItem?.crop ? `inset(${baseVideoItem.crop.y * 100}% ${(1 - baseVideoItem.crop.x - baseVideoItem.crop.w) * 100}% ${(1 - baseVideoItem.crop.y - baseVideoItem.crop.h) * 100}% ${baseVideoItem.crop.x * 100}%)` : undefined }} /> : <div className="vx-drop"><Video size={28} color="var(--gold)" /><h2>Build your next cut</h2><p>Upload footage in Media to start editing.</p></div>}
            {activeBrollItem && activeBrollAsset ? activeBrollAsset.kind === 'image' ? <img className="vx-overlay-media" src={activeBrollAsset.preview || activeBrollAsset.url} alt="" style={{ opacity: activeBrollItem.opacity ?? 1, objectPosition: `${activeBrollItem.x ?? 50}% ${activeBrollItem.y ?? 50}%`, transform: `scale(${activeBrollItem.scale ?? 1}) rotate(${activeBrollItem.rotation ?? 0}deg)`, clipPath: activeBrollItem.crop ? `inset(${activeBrollItem.crop.y * 100}% ${(1 - activeBrollItem.crop.x - activeBrollItem.crop.w) * 100}% ${(1 - activeBrollItem.crop.y - activeBrollItem.crop.h) * 100}% ${activeBrollItem.crop.x * 100}%)` : undefined }} /> : <video key={activeBrollItem.id} className="vx-overlay-media" src={activeBrollAsset.preview || activeBrollAsset.url} muted playsInline autoPlay={playing} onLoadedMetadata={(event) => { try { event.currentTarget.currentTime = activeBrollItem.sourceIn || 0; } catch { /* not seekable */ } }} style={{ opacity: activeBrollItem.opacity ?? 1, objectPosition: `${activeBrollItem.x ?? 50}% ${activeBrollItem.y ?? 50}%`, transform: `scale(${activeBrollItem.scale ?? 1}) rotate(${activeBrollItem.rotation ?? 0}deg)` }} /> : null}
            {previewProject.caption.behind.on && behindWord ? <div className="vx-behind-word" style={{ fontSize: `${previewProject.caption.behind.size}%`, filter: `blur(${Math.max(0, previewProject.caption.behind.softness * .08)}px)` }}>{behindWord.text}</div> : null}
            {previewProject.caption.behind.on && main ? <video ref={cutoutRef} className={`vx-subject-cutout route-${previewProject.caption.behind.route || 'soft-box'}`} src={main.cutoutUrl || main.preview || main.url} muted playsInline autoPlay={playing} style={main.cutoutUrl ? undefined : { clipPath: 'ellipse(34% 48% at 50% 52%)', filter: `drop-shadow(0 0 ${previewProject.caption.behind.softness}px rgba(0,0,0,.45))` }} /> : null}
            {activeTextItems.map((item) => <div key={item.id} className="vx-text-preview" style={{ left: `${item.x ?? 50}%`, top: `${item.y ?? 25}%`, opacity: item.opacity ?? 1, transform: `translate(-50%,-50%) scale(${item.scale ?? 1}) rotate(${item.rotation ?? 0}deg)` }}>{item.text || item.name}</div>)}
            {liveEffects.map((effect) => <div key={effect.id} className={`vx-fx-preview fx-${effect.type}`} style={{ '--fx-strength': effect.intensity / 100 } as CSSProperties} />)}
            {safeZone && main ? <div className="vx-safe"><i /><i /><i /></div> : null}
            {cropMode && previewItem ? <div className="vx-crop-box" style={{ left: `${(previewItem.crop?.x || 0) * 100}%`, top: `${(previewItem.crop?.y || 0) * 100}%`, width: `${(previewItem.crop?.w || 1) * 100}%`, height: `${(previewItem.crop?.h || 1) * 100}%` }}>{(['nw', 'ne', 'sw', 'se'] as const).map((corner) => <button key={corner} aria-label={`Crop ${corner}`} className={`vx-crop-handle ${corner}`} onPointerDown={(event) => cropDrag(event, corner)} />)}</div> : null}
            {activeCaption && activeCaptionPreset.behind !== 'word' ? <div data-caption-preview className={`vx-caption-preview style-${previewProject.caption.styleId} layout-${activeCaptionPreset.layout || 'line'} anim-${activeCaptionPreset.animation}`} onPointerDown={captionDrag} style={{ left: `${previewProject.caption.x ?? 50}%`, top: `${Math.max(11, Math.min(81, previewProject.caption.y ?? 78))}%`, letterSpacing: `${capSpacing.letter}px`, wordSpacing: `${capSpacing.word}px`, lineHeight: capSpacing.line, ...(capSpacing.pad ? { padding: `${capSpacing.pad}px ${Math.round(capSpacing.pad * 1.6)}px` } : {}), fontSize: `clamp(14px,${previewProject.caption.size / 22}vw,${previewProject.caption.size}px)` }}>{activeCaptionWords.map((word) => { const role = word.role || 'normal'; const design = { ...activeCaptionPreset.roles[role], ...(previewProject.caption.roleStyles?.[role] || {}) }; const active = playhead >= word.start && playhead <= word.end; return <Fragment key={word.id}><span role="button" tabIndex={0} data-role={role} className={active ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => cycleRole(word)} style={{ fontFamily: CAPTION_FONT_STACKS[design.font] || CAPTION_FONT_STACK, fontWeight: design.weight, fontStyle: design.italic ? 'italic' : undefined, color: activeCaptionPreset.id === 'k' && active ? '#140E00' : design.box ? design.box.color === '#FFC23D' ? '#140E00' : design.color : design.color, background: activeCaptionPreset.id === 'k' && active ? '#FFC23D' : design.box?.color, borderRadius: design.box?.radius, padding: design.box ? `1px ${design.box.padX}px` : undefined, textTransform: design.case === 'upper' ? 'uppercase' : design.case === 'lower' ? 'lowercase' : 'none', WebkitTextStroke: design.stroke ? `${design.stroke.width}px ${design.stroke.color}` : undefined, textShadow: design.glow || '0 3px 14px #000', transform: `scale(${(design.scale || 1) * (active ? 1.06 : 1)}) rotate(${design.rotate || 0}deg)` }}>{word.text}</span>{' '}</Fragment>; })}{!activeCaptionWords.length ? activeCaption.text : null}{activeCaptionPreset.animation === 'type' ? <i className="vx-cursor" /> : null}</div> : null}
          </div></div>
          <div className="vx-transport"><span className="vx-time">{frameTimecode(playhead)} <span>/ {frameTimecode(duration)}</span></span><button type="button" className={`vx-icon hide-phone${loopPlayback ? ' on' : ''}`} title={loopPlayback ? 'Loop on' : 'Loop off'} aria-label="Loop playback" aria-pressed={loopPlayback} disabled={!main} onClick={() => setLoopPlayback((value) => !value)}><RefreshCw size={14} /></button><button className="vx-play" disabled={!main} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><input className="vx-scrub" type="range" min={0} max={Math.max(.1, duration)} step={1 / 30} value={Math.min(playhead, duration)} onChange={(event) => seek(Number(event.target.value))} /><button className="vx-rate hide-phone" title="J reverse · K pause · L forward" onClick={() => setPlayerRate((value) => value >= 2 ? .5 : value + .25)}>{playerRate.toFixed(2)}×</button>{(['9:16', '1:1', '16:9', '4:5'] as EditorAspect[]).map((aspect) => <button key={aspect} className={`vx-pill hide-phone${project.aspect === aspect ? ' on' : ''}`} onClick={() => commit((value) => ({ ...value, aspect }))}>{aspect}</button>)}<button className={`vx-icon hide-phone${cropMode ? ' on' : ''}`} title="Crop" disabled={!previewItem} onClick={() => setCropMode((value) => !value)}><Crop size={13} /></button><button className={`vx-icon hide-phone${safeZone ? ' on' : ''}`} title="Safe zone" onClick={() => setSafeZone((value) => !value)}><ShieldCheck size={13} /></button></div>
        </main>
        <aside className={`vx-panel-one${mobilePanelOpen || mobileInspectorOpen ? ' open' : ''}`} aria-label="Editor panel">
          <div className="vx-panel-switch" role="tablist" aria-label="Editor panel sections">
            <button type="button" role="tab" aria-selected={panelView === 'tools' && editorMode === 'manual' && tab === 'media'} onClick={() => { setEditorMode('manual'); setTab('media'); setSilenceOpen(false); setPanelView('tools'); setMobilePanelOpen(true); }}><Film size={14} />Assets</button>
            <button type="button" role="tab" aria-selected={panelView === 'tools' && !(editorMode === 'manual' && tab === 'media')} onClick={() => { if (editorMode === 'manual' && tab === 'media') setTab('broll'); setPanelView('tools'); setMobilePanelOpen(true); }}><SlidersHorizontal size={14} />Tools</button>
            <button type="button" role="tab" aria-selected={panelView === 'properties'} onClick={() => { setPanelView('properties'); setMobileInspectorOpen(true); }}>Properties{selectedItem ? <span className="dot" aria-label="Item selected" /> : null}</button>
            <button type="button" className="vx-icon vx-sheet-close" aria-label="Close panel" onClick={() => { setMobilePanelOpen(false); setMobileInspectorOpen(false); }}><X size={15} /></button>
          </div>
          <section className="vx-left" role="tabpanel" aria-label="Tools" hidden={panelView !== 'tools'}>
          <div className="vx-left-head"><div className="vx-mode" role="group" aria-label="Editing mode"><button className={editorMode === 'manual' ? 'on' : ''} onClick={() => setEditorMode('manual')}><SlidersHorizontal size={15} />Manual</button><button className={`auto${editorMode === 'auto' ? ' on' : ''}`} onClick={() => setEditorMode('auto')}><Sparkles size={15} />Auto agent</button></div><div className="vx-feature-strip" aria-label="Enhancer features"><FeatureToggle icon={Captions} label="Captions" on={project.caption.enabled} detail={project.caption.enabled ? 'On' : 'Off'} busy={transcribing} busyLabel="Transcribing…" disabled={!main && !project.caption.enabled} onChange={setCaptionsEnabled} /><FeatureToggle icon={Scissors} label="Silence cuts" on={project.silence.enabled} detail={project.silence.enabled && project.silence.removedSeconds > 0 ? `${project.silence.removedSeconds.toFixed(1)}s removed` : project.silence.enabled ? 'On' : 'Off'} busy={silenceBusy} busyLabel="Analyzing…" disabled={!main && !project.silence.enabled} onChange={setSilenceEnabled} /></div></div>
          {editorMode === 'manual' ? <nav className="vx-tabs" role="tablist" aria-label="Editor tools">{TABS.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={tab === id} data-tab={id} className={`vx-tab${tab === id ? ' on' : ''}`} onClick={() => { setTab(id); setSilenceOpen(false); setMobilePanelOpen(true); }}><Icon size={15} />{label}</button>)}</nav> : null}
          <div className="vx-scroll">{false ? <div className="vx-insp" onPointerDownCapture={(event) => { if ((event.target as HTMLElement).matches('input[type="range"]')) checkpoint(); }}><div className="vx-inspector-head"><div className="vx-inspector-title">{selectedItem ? selectedItem.name : 'Suggestions'}</div><div className="vx-inspector-sub">{selectedItem ? `${selectedItem.track} · ${formatEditorTime(selectedItem.start)}–${formatEditorTime(selectedItem.start + selectedItem.duration)}` : 'AI checks · one-tap fixes'}</div></div>
          {!selectedItem ? <><div className="vx-suggest-summary"><Sparkles size={18} /><span className="vx-grow"><b>6 things to review</b><small>Based on transcript, levels and safe zones</small></span><button className="vx-btn primary" disabled title="Fix all is not available as a single operation yet">Fix all</button></div><div>
            <div className="vx-suggestion silence"><span className="ico"><Scissors size={15} /></span><div><b>Long silences and fillers</b><small>Review red pauses and orange filler words on the Voice track.</small><button className="vx-btn" onClick={() => { setEditorMode('manual'); setSilenceOpen(true); setTab('broll'); setMobilePanelOpen(true); }}>Review</button></div></div>
            <div className="vx-suggestion audio"><span className="ico"><Music2 size={15} /></span><div><b>Music may cover voice</b><small>Select the music track to adjust its level and fades.</small><button className="vx-btn" onClick={() => { const music = project.items.find((item) => item.track === 'music'); if (music) setSelected([music.id]); }}>Select music</button></div></div>
            <div className="vx-suggestion"><span className="ico"><Sun size={15} /></span><div><b>Match light and colour</b><small>Apply the existing cinematic light correction.</small><button className="vx-btn" onClick={() => commit((value) => ({ ...value, grade: 'cinematic', brightness: 104, contrast: 108, saturation: 108 }))}>Fix</button></div></div>
            <div className="vx-suggestion safe"><span className="ico"><ShieldCheck size={15} /></span><div><b>Check text safe zones</b><small>Show title-safe guides over the preview.</small><button className="vx-btn" onClick={() => setSafeZone(true)}>Show guides</button></div></div>
          </div></> : null}
          <Panel title="Caption controls"><Field label="Style"><select className="vx-input" aria-label="Caption preset" value={project.caption.styleId} onChange={(event) => { const preset = CAPTION_PRESETS.find((entry) => entry.styleId === event.target.value); if (preset) applyCaptionPreset(preset); }}>{!CAPTION_PRESETS.some((preset) => preset.styleId === project.caption.styleId) ? <option value={project.caption.styleId}>{project.caption.styleId}</option> : null}{CAPTION_PRESETS.map((preset) => <option key={preset.id} value={preset.styleId}>{preset.label}</option>)}</select></Field><Range label="Size" value={project.caption.size} min={24} max={120} suffix="px" onChange={(size) => edit((value) => ({ ...value, caption: { ...value.caption, size } }))} /><div className="vx-position-grid">{CAPTION_POSITIONS.map(([position, y]) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, position, y } }))}>{position.replace('-', ' ')}</button>)}</div></Panel>
          <Panel title="Live effects">{(['filmGrain', 'vhs', 'glitch'] as const).map((id) => { const effect = (project.effects || []).find((entry) => entry.type === id); return <div className="vx-row" key={id}><button className={`vx-pill${effect?.enabled ? ' on' : ''}`} data-quick-effect={id} onClick={() => updateEffect(id, { enabled: !effect?.enabled })}>{id === 'filmGrain' ? 'Grain' : id.toUpperCase()}</button><input className="vx-range vx-grow" aria-label={`${id} intensity`} type="range" min={0} max={100} value={effect?.intensity ?? 55} onChange={(event) => updateEffect(id, { enabled: true, intensity: Number(event.target.value) })} /></div>; })}</Panel>
          {selectedItem ? <><Panel title="Transform"><Range label="Position X" value={selectedItem.x ?? 50} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, x: value } : item) }))} /><Range label="Position Y" value={selectedItem.y ?? 50} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, y: value } : item) }))} /><Range label="Scale" value={selectedItem.scale ?? 1} min={.1} max={5} step={.05} suffix="×" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, scale: value } : item) }))} /><Range label="Rotation" value={selectedItem.rotation ?? 0} min={-180} max={180} suffix="°" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, rotation: value } : item) }))} /><Range label="Opacity" value={(selectedItem.opacity ?? 1) * 100} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, opacity: value / 100 } : item) }))} />{['video', 'broll'].includes(selectedItem.track) ? <><Range label="Speed" value={selectedItem.speed ?? 1} min={.25} max={4} step={.05} suffix="×" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, speed: value } : item) }))} /><div className="vx-row"><button className={`vx-btn${cropMode ? ' on' : ''}`} onClick={() => setCropMode((value) => !value)}><Crop size={13} />Free crop</button><button className="vx-btn" onClick={() => commit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, crop: { x: 0, y: 0, w: 1, h: 1 }, x: 50, y: 50, scale: 1 } : item) }))}>Reset</button></div><select className="vx-input" aria-label="Transition" value={selectedItem.transition || 'cut'} onChange={(event) => commit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, transition: event.target.value } : item) }))}><option value="cut">Hard cut</option><option value="crossfade">Crossfade</option><option value="dipToBlack">Dip to black</option><option value="flashCut">Flash cut</option><option value="whipPan">Whip pan</option></select><button className="vx-btn" onClick={() => { const frozen = { ...selectedItem, id: newEditorId('freeze'), name: `${selectedItem.name} · freeze`, start: playhead, duration: 2, freeze: true, volume: 0 }; commit((current) => ({ ...current, items: [...current.items, frozen] })); setSelected([frozen.id]); }}><Snowflake size={13} />Freeze frame</button></> : null}</Panel><Panel title={selectedItem.name}><Range label="Start" value={selectedItem.start} min={0} max={Math.max(0, duration - .1)} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, start: value } : item) }))} /><Range label="Duration" value={selectedItem.duration} min={.1} max={Math.max(.1, duration || selectedItem.duration)} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, duration: value } : item) }))} />{['music', 'voice', 'broll'].includes(selectedItem.track) ? <><Range label="Volume" value={(selectedItem.volume ?? 1) * 100} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, volume: value / 100 } : item) }))} /><Range label="Fade in" value={selectedItem.fadeIn || 0} min={0} max={3} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, fadeIn: value } : item) }))} /><Range label="Fade out" value={selectedItem.fadeOut || 0} min={0} max={3} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, fadeOut: value } : item) }))} /></> : null}{['text', 'caption'].includes(selectedItem.track) ? <textarea className="vx-input" value={selectedItem.text || ''} onChange={(event) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, text: event.target.value, name: event.target.value } : item) }))} /> : null}<div className="vx-row"><button className="vx-btn" onClick={duplicate}><Copy size={13} />Duplicate</button><button className="vx-btn" onClick={deleteSelected}><Trash2 size={13} />Delete</button></div></Panel></> : <><Panel title="Enhance"><Range label="Brightness" value={project.brightness} min={50} max={160} suffix="%" onChange={(value) => edit((current) => ({ ...current, brightness: value }))} /><Range label="Contrast" value={project.contrast} min={50} max={160} suffix="%" onChange={(value) => edit((current) => ({ ...current, contrast: value }))} /><Range label="Saturation" value={project.saturation} min={0} max={200} suffix="%" onChange={(value) => edit((current) => ({ ...current, saturation: value }))} /><button className="vx-btn primary" onClick={() => commit((value) => ({ ...value, grade: 'cinematic', brightness: 104, contrast: 108, saturation: 108 }))}><Wand2 size={13} />Auto enhance</button></Panel><Panel title="Caption design"><Field label="Font"><div className="vx-input vx-readonly" role="status" aria-label="Caption font: Inter">Inter <span>Preview &amp; export</span></div></Field><div className="vx-row"><label className="vx-color">Text <input type="color" value={project.caption.color} onChange={(event) => edit((current) => ({ ...current, caption: { ...current.caption, color: event.target.value } }))} /></label><label className="vx-color">Highlight <input type="color" value={project.caption.activeColor} onChange={(event) => edit((current) => ({ ...current, caption: { ...current.caption, activeColor: event.target.value } }))} /></label></div><Field label="Animation"><select className="vx-input" aria-label="Caption animation" value={project.caption.animation} onChange={(event) => commit((current) => ({ ...current, caption: { ...current.caption, animation: event.target.value } }))}><option value="pop">Pop</option><option value="karaoke">Karaoke highlight</option><option value="typewriter">Typewriter</option><option value="fade">Soft fade</option><option value="bounce">Bounce</option></select></Field><button className={`vx-btn${project.caption.uppercase ? ' on' : ''}`} onClick={() => commit((current) => ({ ...current, caption: { ...current.caption, uppercase: !current.caption.uppercase } }))}>Uppercase</button><Range label="Size" value={project.caption.size} min={24} max={120} suffix="px" onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, size: value } }))} /><Range label="Stroke" value={project.caption.stroke} min={0} max={8} suffix="px" onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, stroke: value } }))} /><Range label="Words per line" value={project.caption.wordsPerLine} min={2} max={12} onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, wordsPerLine: value }, items: [...current.items.filter((item) => item.track !== 'caption'), ...(current.caption.enabled ? captionItems(current.words, value) : [])] }))} /><div className="vx-segment">{(['top', 'middle', 'bottom'] as const).map((position) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => edit((current) => ({ ...current, caption: { ...current.caption, position } }))}>{position}</button>)}</div></Panel></>}
        </div> : leftPanel}</div>
          </section>
          <section className="vx-right" role="tabpanel" aria-label="Properties" hidden={panelView !== 'properties'}>
          <div className="vx-inspector-head"><div><div className="vx-inspector-title">{selectedItem ? selectedItem.name : 'Suggestions'}</div><div className="vx-inspector-sub">{selectedItem ? `${selectedItem.track} · ${formatEditorTime(selectedItem.start)}–${formatEditorTime(selectedItem.start + selectedItem.duration)}` : 'AI findings and visual look'}</div></div></div>
          <div className="vx-scroll">
            {selectedItem ? <><Panel title="Item inspector"><Range label="Start" value={selectedItem.start} min={0} max={Math.max(0, duration)} step={.1} suffix="s" onChange={(start) => edit((value) => ({ ...value, items: value.items.map((item) => item.id === selectedItem.id ? { ...item, start } : item) }))} /><Range label="Duration" value={selectedItem.duration} min={.1} max={Math.max(.1, duration)} step={.1} suffix="s" onChange={(itemDuration) => edit((value) => ({ ...value, items: value.items.map((item) => item.id === selectedItem.id ? { ...item, duration: itemDuration } : item) }))} /><Range label="Opacity" value={(selectedItem.opacity ?? 1) * 100} min={0} max={100} suffix="%" onChange={(opacity) => edit((value) => ({ ...value, items: value.items.map((item) => item.id === selectedItem.id ? { ...item, opacity: opacity / 100 } : item) }))} /><div className="vx-row"><button className="vx-btn" onClick={duplicate}><Copy size={13} />Duplicate</button><button className="vx-btn" onClick={deleteSelected}><Trash2 size={13} />Delete</button></div></Panel>{selectedItem.track === 'caption' ? roleStylePanel : null}</> : <><div className="vx-suggest-summary"><Sparkles size={18} /><span className="vx-grow"><b>{reviewCount} {reviewCount === 1 ? 'thing' : 'things'} to review</b><small>{reviewCount ? 'Transcript, faces and safe zones' : 'No review findings yet'}</small></span>{reviewCount > 0 ? <button className="vx-btn primary" onClick={() => void runAgent('fix all safe issues', 'manual')}>Fix all</button> : null}</div><div className="vx-suggestion silence"><span className="ico"><Scissors size={15} /></span><div><b>Long silences and fillers</b><small>Red pauses and orange filler words stay reviewable.</small><button className="vx-btn" onClick={() => { setSilenceOpen(true); setTab('broll'); setPanelView('tools'); setMobilePanelOpen(true); }}>Review</button></div></div><div className="vx-suggestion safe"><span className="ico"><ShieldCheck size={15} /></span><div><b>Auto place captions</b><small>Keep text between 11% and 81% and away from detected faces.</small><button className="vx-btn" onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, y: value.caption.y > 50 ? 70 : 30 } }))}>Fix</button></div></div>{roleStylePanel}</>}
          </div>
          </section>
        </aside>
      </div>
      {motionOpen && motionProjectId ? <div className="vx-motion-dock"><SharedMotionEditor projectId={motionProjectId} title="Video Enhancer · Shared Motion Engine" compact /></div> : null}
      <ModernTimeline project={previewProject} pending={review && !review.applied ? review.operations : []} pendingLabel={review?.instruction} selected={selected} playhead={playhead} zoom={zoom} snap={snap} ripple={ripple} tall={timelineTall} canUndo={Boolean(history.length)} canRedo={Boolean(future.length)} onSeek={seek} onSelect={(ids) => { setSelected(ids); if (ids.length) { setPanelView('properties'); setMobileInspectorOpen(true); } }} onEdit={edit} onZoom={setZoom} onSnap={setSnap} onRipple={setRipple} onCheckpoint={checkpoint} onSplit={split} onDelete={deleteSelected} onDuplicate={duplicate} onUndo={undo} onRedo={redo} onTall={setTimelineTall} onOpenSilences={() => { setEditorMode('manual'); setSilenceOpen(true); setTab('broll'); setPanelView('tools'); setMobilePanelOpen(true); }} onAsk={(instruction) => { setEditorMode('manual'); void runAgent(instruction, 'manual'); }} onPendingDrop={dropPending} onPendingAccept={acceptPending} onPendingDiscard={() => setReview(null)} />
      <nav className="vx-mobile-tabs" aria-label="Editor tools">{TABS.slice(0, 6).map(({ id, label, Icon }) => <button key={id} className={editorMode === 'manual' && tab === id ? 'on' : ''} onClick={() => { setEditorMode('manual'); setTab(id); setSilenceOpen(false); setPanelView('tools'); setMobilePanelOpen(true); setMobileInspectorOpen(false); }}><Icon size={17} />{label}</button>)}</nav>
      {error || notice || exportUrl ? <div className={`vx-toast${error ? ' bad' : ' good'}`} role={error ? 'alert' : 'status'}>{error || notice || 'Export ready.'}{exportUrl ? <> · <a href={exportUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 800 }}>Open MP4</a></> : null}<button type="button" aria-label="Dismiss" onClick={() => { setError(''); setNotice(''); setExportUrl(''); }} style={{ marginLeft: 10, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontWeight: 800, fontSize: 16, lineHeight: 1 }}>×</button></div> : null}
    </div>
  );
}
