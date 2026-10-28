import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Captions, Check, Copy, Crop, Download, Film, Image as ImageIcon, Loader2, Music2,
  Pause, Play, Plus, Redo2, RefreshCw, Search, SlidersHorizontal, Snowflake, Sparkles, Trash2, Type, Undo2, Upload,
  Video, Volume2, Wand2, Zap,
} from 'lucide-react';
import { uploadVideo, MAX_UPLOAD_BYTES, WORKSPACE_UUID, submitBroll, checkBroll } from './enhancerCore';
import { callHook, MUSIC_BEDS } from './nleCore';
import { CAPTION_STYLES } from './studioStyles';
import { planNaturalLanguageEdit } from './studioAgent';
import { listVideoHistory, saveVideoToHistory, type VideoHistoryRow } from '../../lib/videoHistory';
import ModernTimeline from './ModernTimeline';
import SharedMotionEditor from '../../components/MotionEditor';
import { motionEngine, type MotionAspect } from '../../lib/motionEngineSdk';
import { adoptExternalOperation, resumeExternalOperation } from '../VideoProviderLab/labClient';
import { MODERN_EDITOR_CSS } from './modernEditorStyles';
import {
  BUILTIN_PRESETS, EMPTY_PROJECT, applyEditorOperations, captionItems,
  clampEditor, editorDuration, editorSource, formatEditorTime, newEditorId,
  type EditorAsset, type EditorAspect, type EditorEffect, type EditorItem,
  type EditorOperation, type EditorPreset, type EditorProject, type EditorWord,
} from './modernEditorModel';

type Tab = 'media' | 'broll' | 'captions' | 'effects' | 'audio' | 'presets' | 'text' | 'properties' | 'agent';
type ProjectRow = { id: number; title: string; status: string; aspect: EditorAspect; duration_s: number; render_url?: string; project: EditorProject };
type Stock = { id: string; description?: string; altDescription?: string; urls: { thumb: string; regular: string } };

const TABS: { id: Tab; label: string; Icon: typeof Film }[] = [
  { id: 'media', label: 'Media', Icon: Film },
  { id: 'broll', label: 'B-roll', Icon: ImageIcon },
  { id: 'captions', label: 'Captions', Icon: Captions },
  { id: 'effects', label: 'Effects', Icon: SlidersHorizontal },
  { id: 'audio', label: 'Audio', Icon: Music2 },
  { id: 'presets', label: 'Presets', Icon: Sparkles },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'properties', label: 'Properties', Icon: Crop },
  { id: 'agent', label: 'Agent', Icon: Wand2 },
];
const CAPTION_PRESETS = [
  { id: 'tiktok', label: 'Bold Pop', hint: 'Punchy word pops', animation: 'pop', fontId: 'anton' },
  { id: 'karaoke', label: 'Karaoke', hint: 'Spoken-word highlight', animation: 'karaoke', fontId: 'inter' },
  { id: 'minimal', label: 'Minimal Clean', hint: 'Quiet editorial clarity', animation: 'fade', fontId: 'inter' },
  { id: 'neon', label: 'Neon Glow', hint: 'Electric active words', animation: 'pop', fontId: 'oswald' },
  { id: 'bold', label: 'Boxed Highlight', hint: 'High-contrast caption plate', animation: 'pop', fontId: 'inter' },
  { id: 'newsroom', label: 'Retro Typewriter', hint: 'Typed broadcast rhythm', animation: 'typewriter', fontId: 'mono' },
] as const;
const EFFECTS = [
  ['filmGrain', 'Retro film grain'], ['vhs', 'VHS / CRT scanlines'], ['vignette', 'Vignette'], ['lightLeak', 'Light leaks'],
  ['glitch', 'Glitch / RGB split'], ['chromaticAberration', 'Chromatic aberration'], ['bloom', 'Bloom / glow'], ['halation', 'Halation'],
  ['dustScratches', 'Dust & scratches'], ['gradeWarmRetro', 'Warm retro grade'], ['gradeTealOrange', 'Teal-orange grade'], ['gradeBw', 'Black & white'],
  ['gradeFaded', 'Faded grade'], ['shake', 'Camera shake'], ['zoomPunch', 'Zoom punch'], ['blur', 'Blur'], ['speedRamp', 'Speed ramp'], ['fadeDissolve', 'Fade / dissolve'],
] as const;
const CAPTION_POSITIONS = [
  ['top', 12], ['upper-third', 30], ['middle', 50], ['lower-third', 70], ['bottom', 86],
] as const;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const ACTIVE_BROLL_KEY = 'video-enhancer:editor-background-broll';
const readableError = (error: unknown) => (error instanceof Error ? error.message : String(error || 'Something went wrong.')).slice(0, 260);

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
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="vx-panel"><h3>{title}</h3><div className="vx-panel-body">{children}</div></section>;
}
function Range({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <div className="vx-field"><label><span>{label}</span><b>{Math.round(value * 100) / 100}{suffix}</b></label><input className="vx-range" type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

export default function EditorApp() {
  const [project, setProject] = useState<EditorProject>(EMPTY_PROJECT);
  const projectRef = useRef(project);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tab, setTab] = useState<Tab>('media');
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [stockQuery, setStockQuery] = useState('');
  const [stock, setStock] = useState<Stock[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [brollPrompt, setBrollPrompt] = useState('');
  const [brollBusy, setBrollBusy] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState('Warm modern instrumental, subtle pulse, no vocals');
  const [musicBusy, setMusicBusy] = useState(false);
  const [agentText, setAgentText] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [review, setReview] = useState<{ summary: string; operations: EditorOperation[]; before: EditorProject; after: EditorProject; applied: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState('');
  const [motionProjectId, setMotionProjectId] = useState<number | null>(null);
  const [motionOpen, setMotionOpen] = useState(false);
  const [motionBusy, setMotionBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const alive = useRef(true);
  const pollingOperation = useRef('');
  const sourceFiles = useRef<Map<string, File>>(new Map());

  useEffect(() => { projectRef.current = project; }, [project]);
  const duration = editorDuration(project);
  const main = editorSource(project);
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
  const activeVideoItem = project.items.find((item) => item.track === 'video' && playhead >= item.start && playhead <= item.start + item.duration) || project.items.find((item) => item.track === 'video');
  const activeBrollItem = project.items.find((item) => item.track === 'broll' && playhead >= item.start && playhead <= item.start + item.duration);
  const previewItem = (selectedItem && ['video', 'broll'].includes(selectedItem.track) ? selectedItem : activeBrollItem || activeVideoItem);
  const baseVideoItem = previewItem?.track === 'video' ? previewItem : activeVideoItem;
  const activeBrollAsset = project.assets.find((asset) => asset.id === activeBrollItem?.assetId);
  const activeTextItems = project.items.filter((item) => item.track === 'text' && playhead >= item.start && playhead <= item.start + item.duration);
  const activeCaption = project.items.find((item) => item.track === 'caption' && playhead >= item.start && playhead <= item.start + item.duration);
  const activeCaptionWords = activeCaption ? project.words.filter((word) => !word.removed && word.start >= activeCaption.start - .05 && word.end <= activeCaption.start + activeCaption.duration + .05) : [];
  const liveEffects = (project.effects || []).filter((effect) => effect.enabled && (effect.scope === 'timeline' || effect.itemId === activeVideoItem?.id));

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
    setProject({ ...EMPTY_PROJECT, ...row.project, assets, caption: { ...EMPTY_PROJECT.caption, ...(row.project?.caption || {}) }, customPresets: row.project?.customPresets || [] });
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
    if (!file.type.startsWith('video/')) { setError('Choose an MP4, MOV, or WebM video.'); return; }
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
    if (!video || !main) return;
    if (video.src !== main.preview && video.src !== main.url) { video.src = main.preview || main.url; video.load(); }
    if (!playing && Math.abs(video.currentTime - playhead) > .25) {
      try { video.currentTime = Math.min(main.duration, playhead); } catch { /* not seekable */ }
    }
  }, [main, playhead, playing]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playerRate;
    if (playing) void video.play().catch(() => setPlaying(false)); else video.pause();
  }, [playing, playerRate]);
  const seek = (time: number) => {
    const next = clampEditor(time, 0, duration);
    setPlayhead(next);
    if (videoRef.current) {
      try { videoRef.current.currentTime = Math.min(videoRef.current.duration || next, next); } catch { /* not seekable */ }
    }
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
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (event.code === 'Space') { event.preventDefault(); setPlaying((value) => !value); }
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

  const transcribe = async () => {
    if (!main) return;
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
      commit((value) => ({ ...value, words, language: managedResult.language, items: [...value.items.filter((item) => item.track !== 'caption'), ...captionItems(words, value.caption.wordsPerLine)] }));
      setNotice(`${words.length} words transcribed with managed Deepgram word timing${managedResult.language !== 'auto' ? ` · ${managedResult.language}` : ''}.`);
    } catch (nextError) {
      const message = readableError(nextError);
      setTranscriptionError(message);
      setError(message);
    } finally { setTranscribing(false); }
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
    const prompt = brollPrompt.trim();
    if (!prompt || brollBusy) return;
    setBrollBusy(true);
    setError('');
    try {
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
      const response = await fetch(`/api/workspaces/${WORKSPACE_UUID}/audio/music/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token },
        body: JSON.stringify({ prompt: musicPrompt.trim(), lengthMs: Math.max(3000, Math.min(600000, Math.round(Math.max(3, duration) * 1000))), instrumental: true, provider: 'gemini' }),
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
      return { ...value, words, items: [...value.items.filter((item) => item.track !== 'caption'), ...captionItems(words, value.caption.wordsPerLine)] };
    });
  };
  const editWord = (word: EditorWord) => {
    const next = window.prompt('Edit transcript word', word.text);
    if (next === null || !next.trim()) return;
    commit((value) => {
      const words = value.words.map((entry) => entry.id === word.id ? { ...entry, text: next.trim(), removed: false } : entry);
      return { ...value, words, items: [...value.items.filter((item) => item.track !== 'caption'), ...captionItems(words, value.caption.wordsPerLine)] };
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

  const applyCaptionPreset = (preset: typeof CAPTION_PRESETS[number]) => {
    const source = CAPTION_STYLES.find((style) => style.id === preset.id);
    commit((value) => ({ ...value, caption: { ...value.caption, styleId: preset.id, fontId: preset.fontId, animation: preset.animation, size: source ? Math.round(source.sizeRatio * 1080) : value.caption.size, color: source?.color || value.caption.color, activeColor: source?.activeColor || value.caption.activeColor, stroke: source?.outlineWidth ?? value.caption.stroke, background: source?.background || value.caption.background, uppercase: source?.uppercase ?? value.caption.uppercase } }));
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
    const move = (next: PointerEvent) => edit((value) => ({ ...value, caption: { ...value.caption, x: clampEditor(((next.clientX - bounds.left) / bounds.width) * 100, 5, 95), y: clampEditor(((next.clientY - bounds.top) / bounds.height) * 100, 6, 94) } }));
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

  const runAgent = async () => {
    if (!agentText.trim() || agentBusy) return;
    setAgentBusy(true);
    setError('');
    const requestBase = projectRef.current;
    try {
      const plan = await planNaturalLanguageEdit(agentText.trim(), requestBase);
      if (plan.question) { setNotice(plan.question); return; }
      if (!plan.operations.length) { setNotice(plan.summary || 'That edit is not supported yet.'); return; }
      const before = projectRef.current;
      const after = applyEditorOperations(before, plan.operations, CAPTION_STYLES.map((style) => style.id), [...MUSIC_BEDS]);
      const userEditedWhilePlanning = before !== requestBase;
      if (!userEditedWhilePlanning) {
        setHistory((stack) => [...stack.slice(-49), before]);
        setFuture([]);
        setProject(after);
      }
      setReview({ summary: `${plan.summary}${userEditedWhilePlanning ? ' You edited while Verger was planning, so this batch is waiting for approval.' : ''}`, operations: plan.operations, before, after, applied: !userEditedWhilePlanning });
      setNotice(plan.summary);
      setAgentText('');
    } catch (nextError) { setError(readableError(nextError)); }
    finally { setAgentBusy(false); }
  };

  useEffect(() => {
    const job = project.renderJob;
    if (!job || !job.operationId || pollingOperation.current) return;
    pollingOperation.current = job.operationId;
    setExporting(true);
    setExportProgress(job.progress || 8);
    let cancelled = false;
    void (async () => {
      try {
        for (let attempt = 0; attempt < 180 && alive.current && !cancelled; attempt += 1) {
          await wait(Math.min(12000, 3000 + attempt * 100));
          const status = await callHook('veh-render', { operationId: job.operationId, geometry: job.geometry, aspect: job.aspect });
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
    if (!main || exporting) return;
    setExporting(true);
    setExportProgress(4);
    setError('');
    try {
      const clips = project.items.filter((item) => item.track === 'video').map((item) => {
        const asset = project.assets.find((entry) => entry.id === item.assetId);
        const sourceIn = item.sourceIn || 0;
        return { url: asset?.url || '', in: sourceIn, out: Math.min(asset?.duration || sourceIn + item.duration * (item.speed || 1), sourceIn + item.duration * (item.speed || 1)), speed: item.speed || 1, reverse: false, opacity: item.opacity ?? 1, muted: (item.volume ?? 1) === 0, volume: item.volume ?? 1, brightness: project.brightness, contrast: project.contrast, saturation: project.saturation, highlights: 0, shadows: 0, temperature: 0, tint: 0, x: (item.x ?? 50) / 100, y: (item.y ?? 50) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, crop: item.crop || { x: 0, y: 0, w: 1, h: 1 }, freeze: Boolean(item.freeze), effects: (project.effects || []).filter((effect) => effect.enabled && effect.scope === 'clip' && effect.itemId === item.id).map((effect) => ({ id: effect.type, intensity: effect.intensity })), motion: { shake: { enabled: Boolean((project.effects || []).find((effect) => effect.enabled && effect.type === 'shake' && (effect.scope === 'timeline' || effect.itemId === item.id))), intensity: (project.effects || []).find((effect) => effect.type === 'shake')?.intensity || 0, frequency: 'medium' }, zoomCut: { enabled: Boolean((project.effects || []).find((effect) => effect.enabled && effect.type === 'zoomPunch' && (effect.scope === 'timeline' || effect.itemId === item.id))), intensity: 'medium', direction: 'in' }, ramp: { enabled: Boolean((project.effects || []).find((effect) => effect.enabled && effect.type === 'speedRamp' && (effect.scope === 'timeline' || effect.itemId === item.id))), curve: 'punch', intensity: .5 } }, transitionIn: item.transition && item.transition !== 'cut' ? { id: item.transition, duration: .35 } : (project.effects || []).some((effect) => effect.enabled && effect.type === 'fadeDissolve') ? { id: 'crossfade', duration: .45 } : null, timelineStart: item.start };
      });
      const captions = project.items.filter((item) => item.track === 'caption').map((item) => ({ id: item.id, text: item.text || item.name, start: item.start, end: item.start + item.duration, words: project.words.filter((word) => !word.removed && word.start >= item.start - .05 && word.end <= item.start + item.duration + .05).map((word) => ({ text: word.text, start: word.start, end: word.end })) }));
      const broll = project.items.filter((item) => item.track === 'broll').map((item) => {
        const asset = project.assets.find((entry) => entry.id === item.assetId);
        return { id: item.id, label: item.name, url: asset?.url || '', previewUrl: asset?.url || '', sourceDuration: asset?.duration || item.duration, sourceIn: item.sourceIn || 0, sourceOut: Math.min(asset?.duration || item.duration, (item.sourceIn || 0) + item.duration * (item.speed || 1)), start: item.start, end: item.start + item.duration, position: 'free', x: (item.x ?? 50) / 100, y: (item.y ?? 50) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, crop: item.crop || { x: 0, y: 0, w: 1, h: 1 }, opacity: item.opacity ?? 1, radius: 0, muted: (item.volume ?? 0) === 0, volume: item.volume ?? 0, duckMain: true, duckVolume: .2, audioFadeIn: item.fadeIn ?? .2, audioFadeOut: item.fadeOut ?? .4, fadeOut: true };
      });
      const music = project.items.find((item) => item.track === 'music');
      const started = await callHook('veh-render', {
        aspect: project.aspect, grade: project.grade, globalEffects: (project.effects || []).filter((effect) => effect.enabled && effect.scope === 'timeline').map((effect) => ({ id: effect.type, intensity: effect.intensity })), clips, videoOverlays: broll, captions,
        captionSettings: { styleId: project.caption.styleId, fontId: project.caption.fontId, sizeScale: project.caption.size / 62, color: project.caption.color, activeColor: project.caption.activeColor, outlineColor: '#000000', outlineWidth: project.caption.stroke, shadowBlur: project.caption.shadow, position: project.caption.position, x: (project.caption.x ?? 50) / 100, y: (project.caption.y ?? 84) / 100, offsetY: 0, uppercase: project.caption.uppercase, italic: false, burnIn: true, animation: project.caption.animation, background: 'preset', backgroundColor: project.caption.background, backgroundOpacity: .55, maxWords: project.caption.wordsPerLine },
        vfx: {},
        textLayers: project.items.filter((item) => item.track === 'text').map((item) => ({ id: item.id, text: item.text || item.name, start: item.start, end: item.start + item.duration, x: (item.x ?? 50) / 100, y: (item.y ?? 25) / 100, scale: item.scale ?? 1, rotation: item.rotation ?? 0, opacity: item.opacity ?? 1, fontId: 'inter', size: 72, weight: 800, color: '#FFFFFF', outlineColor: '#000000', outlineWidth: 0, shadowColor: '#000000', shadowBlur: 18, entrance: 'scalePop', exit: 'fadeOut', animDuration: .45, align: 'center', behindSubject: false })),
        overlays: [], musicUrl: music?.assetId || '', musicVolume: music?.volume ?? 0, musicFadeIn: music?.fadeIn ?? 0, musicFadeOut: music?.fadeOut ?? 0, musicAutoDuck: Boolean(music), musicStyle: music ? 'uptempo' : 'none',
      });
      let completed = started?.status === 'complete' ? started.renderUrl : '';
      if (!completed) {
        if (!started?.operationId) throw new Error(started?.error || 'The export could not start.');
        pollingOperation.current = String(started.operationId);
        edit((value) => ({ ...value, renderJob: { operationId: String(started.operationId), geometry: started.geometry, aspect: project.aspect, progress: 8 } }));
        for (let attempt = 0; attempt < 180 && alive.current; attempt += 1) {
          await wait(Math.min(12000, 3000 + attempt * 100));
          const status = await callHook('veh-render', { operationId: started.operationId, geometry: started.geometry, aspect: project.aspect });
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
    <div className="vx-drop"><Upload size={23} color="var(--accent)" /><h2>{project.assets.length ? 'Add another clip' : 'Start with your footage'}</h2><p>MP4, MOV or WebM · up to 500 MB</p><label className="vx-btn primary">{uploading ? <Loader2 size={13} /> : <Upload size={13} />}{uploading ? 'Uploading…' : 'Choose video'}<input hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label></div>
    <Panel title="Project media"><div className="vx-grid">{project.assets.map((asset) => <button className="vx-card" key={asset.id}><Video size={15} /><b>{asset.name}</b><small>{asset.kind} · {asset.duration.toFixed(1)}s</small></button>)}</div>{!project.assets.length ? <p className="vx-help">Uploaded media appears here and on the timeline.</p> : null}</Panel>
    <Panel title="From Video Library"><div className="vx-row"><p className="vx-help vx-grow">Pick a finished video from any studio, then describe the edit in the Agent tab.</p><button className="vx-icon" title="Refresh library" onClick={() => void loadLibrary()}>{libraryBusy ? <Loader2 size={14} /> : <RefreshCw size={14} />}</button></div><div className="vx-grid">{libraryRows.map((row) => <button className="vx-card" key={row.id} onClick={() => void addLibraryVideo(row)}><Video size={15} /><b>{row.title}</b><small>{row.app_id}{row.duration_sec ? ` · ${row.duration_sec}s` : ''}</small></button>)}</div>{!libraryRows.length && !libraryBusy ? <p className="vx-help">No finished videos in your library yet.</p> : null}</Panel>
    <Panel title="Recent projects">{projects.slice(0, 8).map((row) => <button className="vx-card" key={row.id} onClick={() => openProject(row)}><b>{row.title}</b><small>{row.status} · {row.aspect} · {formatEditorTime(row.duration_s)}</small></button>)}{!projects.length ? <p className="vx-help">No saved projects yet.</p> : null}</Panel>
  </>;
  const brollPanel = <>
    <Panel title="B-roll search"><div className="vx-row"><input className="vx-input vx-grow" value={stockQuery} placeholder="Search visuals" onChange={(event) => setStockQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchStock(); }} /><button className="vx-icon" onClick={() => void searchStock()}>{stockBusy ? <Loader2 size={14} /> : <Search size={14} />}</button></div><div className="vx-row vx-wrap"><button className="vx-btn" onClick={suggestBroll}><Sparkles size={13} />Suggest from transcript</button><label className="vx-btn"><Upload size={13} />Upload clip<input hidden type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, true); event.target.value = ''; }} /></label></div></Panel>
    <Panel title="Generate B-roll"><textarea className="vx-input" rows={3} value={brollPrompt} placeholder="Describe the cutaway…" onChange={(event) => setBrollPrompt(event.target.value)} /><p className="vx-help">AI image ≈ $0.04–$0.07 · AI video shows the wallet estimate before provider generation.</p><div className="vx-row"><button className="vx-btn" disabled={brollBusy || !brollPrompt.trim()} onClick={() => void generateBroll('image')}>{brollBusy ? <Loader2 size={13} /> : <ImageIcon size={13} />}AI image</button><button className="vx-btn primary" disabled={brollBusy || !brollPrompt.trim()} onClick={() => void generateBroll('video')}>{brollBusy ? <Loader2 size={13} /> : <Video size={13} />}AI video</button></div></Panel>
    <div className="vx-grid">{stock.map((photo) => <button className="vx-card" key={photo.id} draggable onClick={() => addStock(photo)} onDragEnd={() => addStock(photo)}><img className="vx-thumb" src={photo.urls.thumb} alt="" /><b>{photo.description || photo.altDescription || 'Stock visual'}</b><small>Click or drag to timeline</small></button>)}</div>{!stock.length ? <p className="vx-help">Search royalty-free visuals matched to your transcript, then drag one onto the B-roll track.</p> : null}
  </>;
  const captionPanel = <>
    <Panel title="Transcript"><button className="vx-btn primary" disabled={!main || transcribing} onClick={() => void transcribe()}>{transcribing ? <Loader2 size={13} /> : <Captions size={13} />}{transcribing ? 'Transcribing…' : project.words.length ? 'Re-transcribe' : 'Auto captions'}</button>{transcriptionError ? <div className="vx-inline-error" role="alert"><b>Transcription failed</b><span>{transcriptionError}</span><button className="vx-btn" disabled={transcribing} onClick={() => void transcribe()}><RefreshCw size={13} />Retry transcription</button></div> : null}{project.words.length ? <div className="vx-transcript">{project.words.map((word) => <button key={word.id} title="Click to edit · right-click to cut/restore" className={`vx-word${word.filler ? ' filler' : ''}${word.removed ? ' removed' : ''}${playhead >= word.start && playhead <= word.end ? ' live' : ''}`} onClick={() => { seek(word.start); editWord(word); }} onContextMenu={(event) => { event.preventDefault(); toggleWord(word); }}>{word.text}</button>)}</div> : <p className="vx-help">Deepgram detects punctuation and word timing server-side. Click a word to edit it; right-click to cut or restore that word in the transcript edit.</p>}</Panel>
    <Panel title="Caption presets"><div className="vx-grid">{CAPTION_PRESETS.map((preset) => <button key={preset.id} data-caption-preset={preset.id} className={`vx-card vx-caption-card${project.caption.styleId === preset.id ? ' on' : ''}`} onClick={() => applyCaptionPreset(preset)}><span className={`vx-caption-swatch style-${preset.id} anim-${preset.animation}`}>Edit <em>faster</em></span><b>{preset.label}</b><small>{preset.hint}</small></button>)}</div></Panel>
    <Panel title="Caption position"><div className="vx-position-grid">{CAPTION_POSITIONS.map(([position, y]) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, position, y } }))}>{position}</button>)}</div><Range label="Horizontal" value={project.caption.x ?? 50} min={5} max={95} suffix="%" onChange={(x) => edit((value) => ({ ...value, caption: { ...value.caption, x } }))} /><Range label="Vertical" value={project.caption.y ?? 84} min={6} max={94} suffix="%" onChange={(y) => edit((value) => ({ ...value, caption: { ...value.caption, y } }))} /><p className="vx-help">Drag the caption directly on the preview. Dashed guides show the safe title area.</p></Panel>
  </>;
  const effectsPanel = <><Panel title="Preview + export effects"><p className="vx-help">Every effect is rendered by the same project spec used for export. Choose whole timeline or the selected clip.</p>{EFFECTS.map(([id, label]) => { const effect = (project.effects || []).find((entry) => entry.type === id); return <div className="vx-effect" key={id} data-effect={id}><div className="vx-row"><button className={`vx-pill${effect?.enabled ? ' on' : ''}`} onClick={() => updateEffect(id, { enabled: !effect?.enabled })}>{effect?.enabled ? 'On' : 'Off'}</button><b className="vx-grow">{label}</b><select className="vx-mini-select" value={effect?.scope || 'timeline'} onChange={(event) => updateEffect(id, { enabled: true, scope: event.target.value as 'clip' | 'timeline' })}><option value="timeline">Timeline</option><option value="clip">Clip</option></select></div><Range label="Intensity" value={effect?.intensity ?? 55} min={0} max={100} suffix="%" onChange={(intensity) => updateEffect(id, { enabled: true, intensity })} /></div>; })}</Panel></>;
  const audioPanel = <><Panel title="Music library"><div className="vx-grid">{MUSIC_BEDS.map((bed) => <button className="vx-card" key={bed.id} onClick={() => applyPreset({ id: bed.id, name: bed.label, aspect: project.aspect, captionStyle: project.caption.styleId, musicId: bed.id, grade: project.grade })}><Music2 size={14} /><b>{bed.label}</b><small>Loopable · auto-duck ready</small></button>)}</div></Panel><Panel title="Generate soundtrack"><textarea className="vx-input" rows={3} value={musicPrompt} onChange={(event) => setMusicPrompt(event.target.value)} /><p className="vx-help">Gemini music costs about $0.04–$0.08 per track. Generated audio is durable and editable on the Music track.</p><button className="vx-btn primary" disabled={musicBusy || !musicPrompt.trim() || !duration} onClick={() => void generateMusic()}>{musicBusy ? <Loader2 size={13} /> : <Zap size={13} />}{musicBusy ? 'Generating…' : 'Generate & add'}</button></Panel><Panel title="Voice & SFX"><p className="vx-help">Original voice and B-roll audio stay on separate tracks. Select an audio item to trim, fade, loop or mix it in Properties.</p></Panel></>;
  const presetsPanel = <><Panel title="Full edit presets"><div className="vx-grid">{[...BUILTIN_PRESETS, ...project.customPresets].map((preset) => <button className="vx-card" key={preset.id} onClick={() => applyPreset(preset)}><Sparkles size={14} /><b>{preset.name}</b><small>{preset.aspect} · {preset.captionStyle}</small></button>)}</div></Panel><Panel title="Custom presets"><button className="vx-btn" onClick={() => { const name = window.prompt('Preset name'); if (!name) return; const music = project.items.find((item) => item.track === 'music'); commit((value) => ({ ...value, customPresets: [...value.customPresets, { id: newEditorId('preset'), name, aspect: value.aspect, captionStyle: value.caption.styleId, musicId: MUSIC_BEDS.find((bed) => bed.url === music?.assetId)?.id || 'calm', grade: value.grade }] })); }}><Plus size={13} />Save current setup</button>{project.customPresets.map((preset) => <div className="vx-row" key={preset.id}><span className="vx-grow vx-help">{preset.name}</span><button className="vx-icon" onClick={() => commit((value) => ({ ...value, customPresets: value.customPresets.filter((entry) => entry.id !== preset.id) }))}><Trash2 size={13} /></button></div>)}</Panel></>;
  const textPanel = <Panel title="Text overlays"><button className="vx-btn primary" onClick={() => { const item: EditorItem = { id: newEditorId('text'), track: 'text', name: 'Your headline', text: 'Your headline', start: playhead, duration: Math.min(3, Math.max(.5, duration - playhead)) }; commit((value) => ({ ...value, items: [...value.items, item] })); setSelected([item.id]); }}><Plus size={13} />Add text at playhead</button>{project.items.filter((item) => item.track === 'text').map((item) => <button className={`vx-card${selected.includes(item.id) ? ' on' : ''}`} key={item.id} onClick={() => setSelected([item.id])}><Type size={14} /><b>{item.text}</b><small>{formatEditorTime(item.start)}–{formatEditorTime(item.start + item.duration)}</small></button>)}</Panel>;
  const agentPanel = <>
    <Panel title="Verger edit agent"><textarea className="vx-input" rows={4} value={agentText} placeholder="Try “cut silences, add bold captions, and make it 30 seconds”" onChange={(event) => setAgentText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void runAgent(); }} /><p className="vx-help">Verger proposes undoable edits. If you edit while it plans, your manual changes win and the batch waits for approval.</p><button className="vx-btn primary" disabled={agentBusy || !agentText.trim()} onClick={() => void runAgent()}>{agentBusy ? <Loader2 size={14} /> : <Wand2 size={14} />}{agentBusy ? 'Planning…' : 'Plan edit'}</button></Panel>
    {review ? <section className="vx-agent-review"><h3>{review.summary}</h3><ul>{review.operations.map((operation, index) => <li key={`${operation.type}-${index}`}>{operation.type.replace(/_/g, ' ')}{typeof operation.start === 'number' && Number.isFinite(operation.start) ? ` at ${formatEditorTime(operation.start)}` : ''}</li>)}</ul><p className="vx-help">{review.before.items.length} → {review.after.items.length} timeline items · one undo step</p><div className="vx-row">{review.applied ? <button className="vx-btn" onClick={() => { setProject(review.before); setReview(null); }}><Undo2 size={13} />Undo batch</button> : <button className="vx-btn primary" onClick={() => { setHistory((stack) => [...stack.slice(-49), review.before]); setFuture([]); setProject(review.after); setReview({ ...review, applied: true }); }}><Check size={13} />Apply batch</button>}<button className="vx-btn" onClick={() => setReview(null)}>{review.applied ? 'Keep' : 'Dismiss'}</button></div></section> : <p className="vx-help">Agent plans and edit history stay here instead of covering the preview.</p>}
  </>;
  const leftPanel = tab === 'media' ? mediaPanel : tab === 'broll' ? brollPanel : tab === 'captions' ? captionPanel : tab === 'effects' ? effectsPanel : tab === 'audio' ? audioPanel : tab === 'presets' ? presetsPanel : tab === 'text' ? textPanel : tab === 'agent' ? agentPanel : mediaPanel;

  return (
    <div className="vex">
      <style>{MODERN_EDITOR_CSS}</style>
      <header className="vx-top">
        <span className="vx-logo"><Film size={17} /></span>
        <span className="vx-brand"><b>Video Enhancer</b><small>PRO EDITOR</small></span>
        <input className="vx-title" aria-label="Project title" value={project.title} onChange={(event) => edit((value) => ({ ...value, title: event.target.value }))} />
        <span className="vx-save">{saveState === 'Saving…' ? <Loader2 size={12} /> : <Check size={12} />}{saveState}</span>
        <span className="vx-grow" />
        <button className="vx-icon" disabled={!history.length} title="Undo" onClick={undo}><Undo2 size={15} /></button>
        <button className="vx-icon" disabled={!future.length} title="Redo" onClick={redo}><Redo2 size={15} /></button>
        <button className="vx-btn primary" disabled={!main || exporting} onClick={() => void exportVideo()}>{exporting ? <Loader2 size={14} /> : <Download size={14} />}{exporting ? `${Math.round(exportProgress)}%` : 'Export'}</button>
      </header>
      <div className="vx-work">
        <aside className="vx-left">
          <nav className="vx-tabs">{TABS.map(({ id, label, Icon }) => <button key={id} className={`vx-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}><Icon size={15} />{label}</button>)}</nav>
          <div className="vx-scroll">{leftPanel}</div>
        </aside>
        <main className="vx-center">
          <div className="vx-stagebar"><span className="vx-time">{formatEditorTime(playhead)} / {formatEditorTime(duration)}</span><span className="vx-grow" />{(['9:16', '1:1', '16:9', '4:5', 'free'] as EditorAspect[]).map((aspect) => <button key={aspect} className={`vx-pill${project.aspect === aspect ? ' on' : ''}`} onClick={() => commit((value) => ({ ...value, aspect }))}>{aspect}</button>)}<button className={`vx-btn${cropMode ? ' on' : ''}`} disabled={!previewItem} onClick={() => setCropMode((value) => !value)}><Crop size={13} />Crop</button><button className={`vx-btn${safeZone ? ' on' : ''}`} onClick={() => setSafeZone((value) => !value)}>Safe zone</button></div>
          <div className="vx-stage"><div ref={canvasRef} className="vx-canvas" data-aspect={project.aspect} style={{ aspectRatio: project.aspect === '9:16' ? '9/16' : project.aspect === '1:1' ? '1/1' : project.aspect === '4:5' ? '4/5' : '16/9' }}>
            {main ? <video ref={videoRef} src={main.preview || main.url} playsInline onTimeUpdate={(event) => { if (playing) setPlayhead(Math.min(duration, event.currentTarget.currentTime)); }} onEnded={() => setPlaying(false)} style={{ filter: `brightness(${project.brightness / 100}) contrast(${project.contrast / 100}) saturate(${project.saturation / 100})`, opacity: baseVideoItem?.opacity ?? 1, objectPosition: `${baseVideoItem?.x ?? 50}% ${baseVideoItem?.y ?? 50}%`, transform: `scale(${baseVideoItem?.scale ?? 1}) rotate(${baseVideoItem?.rotation ?? 0}deg)`, clipPath: baseVideoItem?.crop ? `inset(${baseVideoItem.crop.y * 100}% ${(1 - baseVideoItem.crop.x - baseVideoItem.crop.w) * 100}% ${(1 - baseVideoItem.crop.y - baseVideoItem.crop.h) * 100}% ${baseVideoItem.crop.x * 100}%)` : undefined }} /> : <div className="vx-drop" style={{ margin: 24 }}><Video size={28} color="var(--accent)" /><h2>Build your next cut</h2><p>Upload footage in Media to start editing.</p></div>}
            {activeBrollItem && activeBrollAsset ? activeBrollAsset.kind === 'image' ? <img className="vx-overlay-media" src={activeBrollAsset.preview || activeBrollAsset.url} alt="" style={{ opacity: activeBrollItem.opacity ?? 1, objectPosition: `${activeBrollItem.x ?? 50}% ${activeBrollItem.y ?? 50}%`, transform: `scale(${activeBrollItem.scale ?? 1}) rotate(${activeBrollItem.rotation ?? 0}deg)`, clipPath: activeBrollItem.crop ? `inset(${activeBrollItem.crop.y * 100}% ${(1 - activeBrollItem.crop.x - activeBrollItem.crop.w) * 100}% ${(1 - activeBrollItem.crop.y - activeBrollItem.crop.h) * 100}% ${activeBrollItem.crop.x * 100}%)` : undefined }} /> : <video className="vx-overlay-media" src={activeBrollAsset.preview || activeBrollAsset.url} muted playsInline autoPlay={playing} style={{ opacity: activeBrollItem.opacity ?? 1, objectPosition: `${activeBrollItem.x ?? 50}% ${activeBrollItem.y ?? 50}%`, transform: `scale(${activeBrollItem.scale ?? 1}) rotate(${activeBrollItem.rotation ?? 0}deg)` }} /> : null}
            {activeTextItems.map((item) => <div key={item.id} className="vx-text-preview" style={{ left: `${item.x ?? 50}%`, top: `${item.y ?? 25}%`, opacity: item.opacity ?? 1, transform: `translate(-50%,-50%) scale(${item.scale ?? 1}) rotate(${item.rotation ?? 0}deg)` }}>{item.text || item.name}</div>)}
            {liveEffects.map((effect) => <div key={effect.id} className={`vx-fx-preview fx-${effect.type}`} style={{ '--fx-strength': effect.intensity / 100 } as CSSProperties} />)}
            {safeZone ? <div className="vx-safe"><i /><i /><i /></div> : null}
            {cropMode && previewItem ? <div className="vx-crop-box" style={{ left: `${(previewItem.crop?.x || 0) * 100}%`, top: `${(previewItem.crop?.y || 0) * 100}%`, width: `${(previewItem.crop?.w || 1) * 100}%`, height: `${(previewItem.crop?.h || 1) * 100}%` }}>{(['nw', 'ne', 'sw', 'se'] as const).map((corner) => <button key={corner} aria-label={`Crop ${corner}`} className={`vx-crop-handle ${corner}`} onPointerDown={(event) => cropDrag(event, corner)} />)}</div> : null}
            {activeCaption ? <div data-caption-preview className={`vx-caption-preview style-${project.caption.styleId} anim-${project.caption.animation}`} onPointerDown={captionDrag} style={{ left: `${project.caption.x ?? 50}%`, top: `${project.caption.y ?? 84}%`, color: project.caption.color, fontFamily: ['serif', 'playfair'].includes(project.caption.fontId) ? 'Georgia, serif' : project.caption.fontId === 'mono' ? 'ui-monospace, monospace' : ['condensed', 'anton', 'oswald'].includes(project.caption.fontId) ? 'Impact, sans-serif' : project.caption.fontId === 'caveat' ? 'cursive' : 'Space Grotesk, sans-serif', fontSize: `clamp(14px,${project.caption.size / 22}vw,${project.caption.size}px)`, textTransform: project.caption.uppercase ? 'uppercase' : 'none', WebkitTextStroke: `${project.caption.stroke}px #000`, textShadow: `0 3px ${project.caption.shadow}px #000` }}>{activeCaptionWords.map((word) => <span key={word.id} className={playhead >= word.start && playhead <= word.end ? 'active' : ''} style={{ color: playhead >= word.start && playhead <= word.end ? project.caption.activeColor : undefined }}>{word.text} </span>)}{!activeCaptionWords.length ? activeCaption.text : null}</div> : null}
          </div></div>
          <div className="vx-transport"><button className="vx-btn primary" disabled={!main} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button className="vx-pill" title="J reverse · K pause · L forward" onClick={() => setPlayerRate((value) => value >= 2 ? .5 : value + .25)}>{playerRate.toFixed(2)}×</button><input className="vx-scrub" type="range" min={0} max={Math.max(.1, duration)} step={.02} value={Math.min(playhead, duration)} onChange={(event) => seek(Number(event.target.value))} /><Volume2 size={14} color="var(--muted)" /></div>
        </main>
        <aside className="vx-inspector" onPointerDownCapture={(event) => { if ((event.target as HTMLElement).matches('input[type="range"]')) checkpoint(); }}><div className="vx-inspector-title">Inspector · effects · captions</div><div className="vx-scroll">
          <Panel title="Caption controls"><select className="vx-input" aria-label="Caption preset" value={project.caption.styleId} onChange={(event) => { const preset = CAPTION_PRESETS.find((entry) => entry.id === event.target.value); if (preset) applyCaptionPreset(preset); }}>{CAPTION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select><Range label="Size" value={project.caption.size} min={24} max={120} suffix="px" onChange={(size) => edit((value) => ({ ...value, caption: { ...value.caption, size } }))} /><div className="vx-position-grid">{CAPTION_POSITIONS.map(([position, y]) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => commit((value) => ({ ...value, caption: { ...value.caption, position, y } }))}>{position}</button>)}</div></Panel>
          <Panel title="Live effects">{(['filmGrain', 'vhs', 'glitch'] as const).map((id) => { const effect = (project.effects || []).find((entry) => entry.type === id); return <div className="vx-row" key={id}><button className={`vx-pill${effect?.enabled ? ' on' : ''}`} data-quick-effect={id} onClick={() => updateEffect(id, { enabled: !effect?.enabled })}>{id === 'filmGrain' ? 'Grain' : id.toUpperCase()}</button><input className="vx-range vx-grow" aria-label={`${id} intensity`} type="range" min={0} max={100} value={effect?.intensity ?? 55} onChange={(event) => updateEffect(id, { enabled: true, intensity: Number(event.target.value) })} /></div>; })}</Panel>
          {selectedItem ? <><Panel title="Transform"><Range label="Position X" value={selectedItem.x ?? 50} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, x: value } : item) }))} /><Range label="Position Y" value={selectedItem.y ?? 50} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, y: value } : item) }))} /><Range label="Scale" value={selectedItem.scale ?? 1} min={.1} max={5} step={.05} suffix="×" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, scale: value } : item) }))} /><Range label="Rotation" value={selectedItem.rotation ?? 0} min={-180} max={180} suffix="°" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, rotation: value } : item) }))} /><Range label="Opacity" value={(selectedItem.opacity ?? 1) * 100} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, opacity: value / 100 } : item) }))} />{['video', 'broll'].includes(selectedItem.track) ? <><Range label="Speed" value={selectedItem.speed ?? 1} min={.25} max={4} step={.05} suffix="×" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, speed: value } : item) }))} /><div className="vx-row"><button className={`vx-btn${cropMode ? ' on' : ''}`} onClick={() => setCropMode((value) => !value)}><Crop size={13} />Free crop</button><button className="vx-btn" onClick={() => commit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, crop: { x: 0, y: 0, w: 1, h: 1 }, x: 50, y: 50, scale: 1 } : item) }))}>Reset</button></div><select className="vx-input" aria-label="Transition" value={selectedItem.transition || 'cut'} onChange={(event) => commit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, transition: event.target.value } : item) }))}><option value="cut">Hard cut</option><option value="crossfade">Crossfade</option><option value="dipToBlack">Dip to black</option><option value="flashCut">Flash cut</option><option value="whipPan">Whip pan</option></select><button className="vx-btn" onClick={() => { const frozen = { ...selectedItem, id: newEditorId('freeze'), name: `${selectedItem.name} · freeze`, start: playhead, duration: 2, freeze: true, volume: 0 }; commit((current) => ({ ...current, items: [...current.items, frozen] })); setSelected([frozen.id]); }}><Snowflake size={13} />Freeze frame</button></> : null}</Panel><Panel title={selectedItem.name}><Range label="Start" value={selectedItem.start} min={0} max={Math.max(0, duration - .1)} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, start: value } : item) }))} /><Range label="Duration" value={selectedItem.duration} min={.1} max={Math.max(.1, duration || selectedItem.duration)} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, duration: value } : item) }))} />{['music', 'voice', 'broll'].includes(selectedItem.track) ? <><Range label="Volume" value={(selectedItem.volume ?? 1) * 100} min={0} max={100} suffix="%" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, volume: value / 100 } : item) }))} /><Range label="Fade in" value={selectedItem.fadeIn || 0} min={0} max={3} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, fadeIn: value } : item) }))} /><Range label="Fade out" value={selectedItem.fadeOut || 0} min={0} max={3} step={.1} suffix="s" onChange={(value) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, fadeOut: value } : item) }))} /></> : null}{['text', 'caption'].includes(selectedItem.track) ? <textarea className="vx-input" value={selectedItem.text || ''} onChange={(event) => edit((current) => ({ ...current, items: current.items.map((item) => item.id === selectedItem.id ? { ...item, text: event.target.value, name: event.target.value } : item) }))} /> : null}<div className="vx-row"><button className="vx-btn" onClick={duplicate}><Copy size={13} />Duplicate</button><button className="vx-btn" onClick={deleteSelected}><Trash2 size={13} />Delete</button></div></Panel></> : <><Panel title="Enhance"><Range label="Brightness" value={project.brightness} min={50} max={160} suffix="%" onChange={(value) => edit((current) => ({ ...current, brightness: value }))} /><Range label="Contrast" value={project.contrast} min={50} max={160} suffix="%" onChange={(value) => edit((current) => ({ ...current, contrast: value }))} /><Range label="Saturation" value={project.saturation} min={0} max={200} suffix="%" onChange={(value) => edit((current) => ({ ...current, saturation: value }))} /><button className="vx-btn primary" onClick={() => commit((value) => ({ ...value, grade: 'cinematic', brightness: 104, contrast: 108, saturation: 108 }))}><Wand2 size={13} />Auto enhance</button></Panel><Panel title="Caption design"><select className="vx-input" aria-label="Caption font" value={project.caption.fontId} onChange={(event) => commit((current) => ({ ...current, caption: { ...current.caption, fontId: event.target.value } }))}><option value="inter">Space Grotesk</option><option value="montserrat">Montserrat</option><option value="condensed">Condensed display</option><option value="anton">Anton display</option><option value="oswald">Oswald</option><option value="serif">Editorial serif</option><option value="playfair">Playfair</option><option value="caveat">Handwritten</option><option value="notoDevanagari">Unicode sans</option><option value="mono">Monospace</option></select><div className="vx-row"><label className="vx-color">Text <input type="color" value={project.caption.color} onChange={(event) => edit((current) => ({ ...current, caption: { ...current.caption, color: event.target.value } }))} /></label><label className="vx-color">Highlight <input type="color" value={project.caption.activeColor} onChange={(event) => edit((current) => ({ ...current, caption: { ...current.caption, activeColor: event.target.value } }))} /></label></div><select className="vx-input" aria-label="Caption animation" value={project.caption.animation} onChange={(event) => commit((current) => ({ ...current, caption: { ...current.caption, animation: event.target.value } }))}><option value="pop">Pop</option><option value="karaoke">Karaoke highlight</option><option value="typewriter">Typewriter</option><option value="fade">Soft fade</option><option value="bounce">Bounce</option></select><button className={`vx-btn${project.caption.uppercase ? ' on' : ''}`} onClick={() => commit((current) => ({ ...current, caption: { ...current.caption, uppercase: !current.caption.uppercase } }))}>Uppercase</button><Range label="Size" value={project.caption.size} min={24} max={120} suffix="px" onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, size: value } }))} /><Range label="Stroke" value={project.caption.stroke} min={0} max={8} suffix="px" onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, stroke: value } }))} /><Range label="Words per line" value={project.caption.wordsPerLine} min={2} max={12} onChange={(value) => edit((current) => ({ ...current, caption: { ...current.caption, wordsPerLine: value }, items: [...current.items.filter((item) => item.track !== 'caption'), ...captionItems(current.words, value)] }))} /><div className="vx-row vx-wrap">{(['top', 'center', 'bottom'] as const).map((position) => <button className={`vx-pill${project.caption.position === position ? ' on' : ''}`} key={position} onClick={() => edit((current) => ({ ...current, caption: { ...current.caption, position } }))}>{position}</button>)}</div></Panel></>}
        </div></aside>
      </div>
      <div style={{ borderTop: '1px solid var(--vg-border)', padding: '8px 12px' }}>
        <button type="button" className="vx-btn" disabled={motionBusy || !main?.url} onClick={() => void openMotionEditor()}><Wand2 size={13} />{motionBusy ? 'Preparing verified project…' : motionOpen ? 'Close shared motion editor' : 'Open shared motion editor'}</button>
      </div>
      {motionOpen && motionProjectId ? <div style={{ borderTop: '1px solid var(--vg-border)', padding: 12 }}><SharedMotionEditor projectId={motionProjectId} title="Video Enhancer · Shared Motion Engine" compact /></div> : null}
      <ModernTimeline project={project} selected={selected} playhead={playhead} zoom={zoom} snap={snap} ripple={ripple} onSeek={seek} onSelect={setSelected} onEdit={edit} onZoom={setZoom} onSnap={setSnap} onRipple={setRipple} onCheckpoint={checkpoint} onSplit={split} onDelete={deleteSelected} onDuplicate={duplicate} />
      {error || notice || exportUrl ? <div className={`vx-toast${error ? ' bad' : ' good'}`}>{error || notice}{exportUrl ? <> · <a href={exportUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 800 }}>Open MP4</a></> : null}</div> : null}
    </div>
  );
}
