import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ArrowRight,
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  DEFAULT_MOTION_TEMPLATE,
  MotionStylePicker,
  presentationTemplateByLabel,
  type MotionTemplate,
  type PresentationTemplateDefinition,
} from './MotionTemplates';
import { callHook } from '../../lib/workspace';
import { createHyperframesMotion } from '../../lib/hyperframes';
import { saveVideoToHistory } from '../../lib/videoHistory';

type GenerationPhase = 'idle' | 'analyzing' | 'writing' | 'rendering' | 'done' | 'error';
type BrandMood =
  | 'bold/energetic'
  | 'premium/minimal'
  | 'professional/corporate'
  | 'playful/bright';

interface VisionImage {
  index: number;
  description: string;
  suggestedRole: string;
}

interface VisionResult {
  palette: string[];
  mood: BrandMood;
  images: VisionImage[];
  textEffect: string;
}

interface ProductAsset {
  id: string;
  file: File;
  objectUrl: string;
  label: string;
}

interface ProductMotionEmbedProps {
  compact?: boolean;
}

const WORKSPACE_ID = 'f24710e5-7c6d-4db4-92b4-c2c235877575';
const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCENT = 'var(--vg-accent)';
const ACCENT_DARK = 'var(--vg-gold-deep)';
const MOODS: BrandMood[] = [
  'bold/energetic',
  'premium/minimal',
  'professional/corporate',
  'playful/bright',
];

const APP_CSS = `
@keyframes pm-pulse { 0%,100% { opacity:.45; transform:scale(.92) } 50% { opacity:1; transform:scale(1) } }
@keyframes pm-slide { 0% { transform:translateX(-110%) } 100% { transform:translateX(320%) } }
@keyframes pm-blink { 0%,45% { opacity:1 } 46%,100% { opacity:0 } }
@keyframes pm-rise { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
.pm-rise { animation:pm-rise .42s cubic-bezier(.16,1,.3,1) both }
.pm-dot { animation:pm-pulse 1.2s ease-in-out infinite }
.pm-cursor { animation:pm-blink .8s steps(1) infinite }
.pm-sheen::after { content:''; position:absolute; inset:0 auto 0 0; width:34%; background:linear-gradient(90deg,transparent,rgba(212,175,55,.22),transparent); animation:pm-slide 1.8s linear infinite }
.pm-button { transition:transform .18s ease, filter .18s ease, box-shadow .18s ease }
.pm-button:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.08); box-shadow:0 16px 44px -18px rgba(212,175,55,.5) }
.pm-button:active:not(:disabled) { transform:scale(.985) }
.pm-drop { transition:border-color .2s ease, background .2s ease, transform .2s ease }
.pm-drop:hover { border-color:var(--vg-accent); background:var(--vg-gold-tint) }
.pm-focus:focus-visible { outline:2px solid var(--vg-focus); outline-offset:3px }
@media (prefers-reduced-motion:reduce) { .pm-rise,.pm-dot,.pm-cursor,.pm-sheen::after { animation:none !important } .pm-button:hover:not(:disabled) { transform:none } }
`;

function uid(): string {
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function workspaceToken(): string {
  const token = (window as any).__workspaceDb?.token;
  if (!token) {
    throw new Error('Your workspace session is still loading. Wait a moment, then try again.');
  }
  return String(token);
}

async function waitForWorkspaceToken(timeoutMs = 12000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let token = (window as any).__workspaceDb?.token;
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    token = (window as any).__workspaceDb?.token;
  }
  if (!token) {
    throw new Error('Your workspace session is still loading. Wait a moment, then try again.');
  }
  return String(token);
}

function activeWorkspaceId(): string {
  return String((window as any).__workspaceDb?.workspaceId || (window as any).__WORKSPACE_ID__ || WORKSPACE_ID);
}

function apiError(body: any, fallback: string): string {
  const value = body?.error?.message || body?.error || body?.message || body?.errorMessage;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function inferLabel(file: File, index: number): string {
  const name = file.name.toLowerCase();
  if (/screen|dashboard|app|ui|mobile|desktop|site|web/.test(name)) return `App Screen ${index + 1}`;
  if (/feature|detail|callout/.test(name)) return `Feature Shot ${index + 1}`;
  return `Product Shot ${index + 1}`;
}

function roleLabel(role: string, index: number): string {
  const normalized = role.toLowerCase();
  if (/screen|dashboard|interface|app|ui|website/.test(normalized)) return `App Screen ${index + 1}`;
  if (/feature|detail|callout/.test(normalized)) return `Feature Shot ${index + 1}`;
  if (/logo|brand/.test(normalized)) return `Brand Asset ${index + 1}`;
  return `Product Shot ${index + 1}`;
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

async function makeVisionImage(file: File): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const image = await readImage(file);
  let maxSide = 1050;
  let quality = 0.78;
  let dataUrl = '';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare images for analysis.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length < 46_000) break;
    maxSide = Math.round(maxSide * 0.78);
    quality = Math.max(0.46, quality - 0.08);
  }

  const data = dataUrl.split(',')[1];
  if (!data) throw new Error(`Could not prepare ${file.name} for analysis.`);
  return { mediaType: 'image/jpeg', data };
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision analysis returned an unreadable result.');
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeVision(value: any, count: number): VisionResult {
  const mood = MOODS.includes(value?.mood) ? value.mood : 'professional/corporate';
  const fallbackEffect: Record<BrandMood, string> = {
    'bold/energetic': 'kinetic punch text',
    'premium/minimal': 'mask reveal',
    'professional/corporate': 'stagger-type',
    'playful/bright': 'spring bounce',
  };
  const palette = Array.isArray(value?.palette)
    ? value.palette.filter((color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 5)
    : [];
  while (palette.length < 3) {
    palette.push(['#0a0a0a', '#f59e0b', '#f8fafc'][palette.length]);
  }
  const rawImages = Array.isArray(value?.images) ? value.images : [];
  const images = Array.from({ length: count }, (_, index) => {
    const item = rawImages.find((candidate: any) => Number(candidate?.index) === index) || rawImages[index] || {};
    return {
      index,
      description: typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : `Product image ${index + 1}`,
      suggestedRole: typeof item.suggestedRole === 'string' && item.suggestedRole.trim()
        ? item.suggestedRole.trim()
        : 'product hero shot',
    };
  });
  return {
    palette,
    mood,
    images,
    textEffect: typeof value?.textEffect === 'string' && value.textEffect.trim()
      ? value.textEffect.trim()
      : fallbackEffect[mood],
  };
}

async function analyzeImages(assets: ProductAsset[]): Promise<VisionResult> {
  const token = workspaceToken();
  const prepared = await Promise.all(assets.map((asset) => makeVisionImage(asset.file)));
  const analyses = await Promise.all(prepared.map(async (image, index) => {
    try {
      const response = await fetch('/api/generate/vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-DB-Token': token,
        },
        body: JSON.stringify({
          prompt: `Analyze product image ${index + 1} of ${assets.length}. Return ONLY JSON with exactly this shape: {"palette":["#RRGGBB"],"mood":"bold/energetic | premium/minimal | professional/corporate | playful/bright","description":"what the image visibly shows","suggestedRole":"product hero shot | app screenshot | feature callout | brand asset"}. Use 2-4 dominant hex colors. Analyze only what is visible and never invent product claims.`,
          image: image.data,
          mimeType: image.mediaType,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || typeof body.result !== 'string') {
        throw new Error(body?.error || `Image analysis failed (${response.status}).`);
      }
      return { ok: true, value: extractJson(body.result) };
    } catch (error) {
      console.warn(`[Product Motion] Image ${index + 1} analysis failed:`, error);
      return { ok: false, value: null };
    }
  }));

  const successful = analyses.filter((entry) => entry.ok && entry.value);
  if (successful.length === 0) {
    throw new Error('The product images could not be analyzed. Please try again.');
  }

  const moods = successful.map((entry) => String(entry.value?.mood || '')).filter(Boolean);
  const mood = moods.sort((a, b) => moods.filter((item) => item === b).length - moods.filter((item) => item === a).length)[0];
  const palette = Array.from(new Set(successful.flatMap((entry) => Array.isArray(entry.value?.palette) ? entry.value.palette : []))).slice(0, 5);
  return normalizeVision({
    palette,
    mood,
    images: analyses.map((entry, index) => ({
      index,
      description: entry.value?.description || `Product image ${index + 1}`,
      suggestedRole: entry.value?.suggestedRole || 'product hero shot',
    })),
  }, assets.length);
}

async function uploadProductImage(asset: ProductAsset): Promise<{ filename: string; url: string }> {
  const token = workspaceToken();
  const form = new FormData();
  form.append('file', asset.file, asset.file.name);
  form.append('workspaceId', activeWorkspaceId());
  form.append('folder', 'product-motion');
  const response = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { 'X-Workspace-DB-Token': token },
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.url) {
    throw new Error(body?.error || `Could not upload ${asset.file.name}.`);
  }
  return { filename: asset.file.name, url: String(body.url) };
}

function cleanTsx(raw: string): string {
  return raw.trim().replace(/^```(?:tsx|typescript|jsx)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function validateComposition(code: string): void {
  if (code.length < 600) throw new Error('The generated composition was incomplete.');
  if (!/export\s+default\b/.test(code)) {
    throw new Error('The generated composition is missing a default export.');
  }
  if (!/\breturn\b/.test(code)) {
    throw new Error('The generated composition is missing its render return.');
  }
  const required = ['useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'Sequence', 'AbsoluteFill'];
  const missing = required.filter((name) => !new RegExp(`\\b${name}\\b`).test(code));
  if (missing.length > 0) throw new Error(`The generated composition is missing ${missing.join(', ')}.`);
  const imports = Array.from(code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)).map((match) => match[1]);
  if (imports.some((source) => source !== 'remotion')) {
    throw new Error('The generated composition tried to import an unsupported library.');
  }
  if (!/\bstaticFile\s*\(/.test(code)) {
    throw new Error('The generated composition did not include staticFile image resolution.');
  }
}

async function writeComposition(
  vision: VisionResult,
  images: Array<{ filename: string; url: string }>,
  durationInFrames: number,
  presentationTemplate: PresentationTemplateDefinition,
): Promise<string> {
  const token = workspaceToken();
  const system = `You are an expert Remotion creative coder. Write a COMPLETE, VALID, bespoke Remotion TSX composition from scratch for the supplied product-image analysis. This is never a fill-in-the-blank template: invent the layout, pacing, transitions, typography, and visual rhythm for this exact image set.

Hard requirements:
- Return ONLY TSX source. No markdown fences and no explanation.
- Import only from 'remotion'. Import and use useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, AbsoluteFill, Img, and staticFile.
- Default-export one composition component accepting props shaped as { images: Array<{ filename: string; url: string }>; palette: string[]; mood: string; textEffect: string }.
- Resolve every image with a helper that prefers its durable URL but explicitly falls back to staticFile(asset.filename), for example asset.url || staticFile(asset.filename). The public URL is necessary for server rendering; the staticFile filename fallback preserves normal Remotion asset behavior.
- Use every supplied image at least once. Use Img, never a CSS background URL.
- Follow this selected presentation template throughout: ${presentationTemplate.label}. ${presentationTemplate.generationPrompt}
- Implement the detected text effect. Kinetic punch text should use sharply timed scale/position interpolation; mask reveal should use clipPath or overflow masks; stagger-type should reveal characters or words in sequence; spring bounce should visibly use spring().
- Give hero product shots a slow Ken Burns zoom/pan.
- Give app screenshots a convincing CSS 3D tilt with perspective plus rotateX and rotateY.
- Use staggered spring entrances whenever multiple images share a layout.
- The composition is exactly ${durationInFrames} frames at 30fps, 1920x1080. Export const calculateDemoVideoDuration = () => ${durationInFrames}.
- Keep all animation deterministic and frame-driven. Do not fetch, use timers, access window/document, or use Math.random.
- Use only claims visible in the analysis. Favor short editorial text such as mood-appropriate verbs or image descriptions over invented product promises.
- Avoid tiny type, image distortion, dead frames, and content outside safe margins.`;

  const response = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-DB-Token': token,
    },
    body: JSON.stringify({
      model: 'gpt-5.6-sol',
      reasoning_effort: 'high',
      max_completion_tokens: 8192,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Create the composition for this vision direction:\n${JSON.stringify(vision, null, 2)}\n\nSelected presentation template: ${presentationTemplate.label}\nTemplate direction: ${presentationTemplate.generationPrompt}\n\nAvailable image props, in order:\n${JSON.stringify(images, null, 2)}`,
        },
      ],
      stream: false,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || `Composition generation failed (${response.status}).`);
  }
  const code = cleanTsx(String(body?.choices?.[0]?.message?.content || ''));
  validateComposition(code);
  return code;
}

async function renderComposition(
  compositionTsx: string,
  images: Array<{ filename: string; url: string }>,
  vision: VisionResult,
  durationInFrames: number,
): Promise<string> {
  const created = await callHook<any>('vv-render-job', {
    op: 'create',
    app: 'product-motion',
    title: 'Product Motion render',
    aspect: '16:9',
    compositionTsx,
    durationInFrames,
    props: {
      images,
      palette: vision.palette,
      mood: vision.mood,
      textEffect: vision.textEffect,
    },
  });
  const jobId = String(created?.job_id || '');
  if (!jobId) throw new Error(apiError(created, 'The durable render job could not be created.'));

  // Read-only progress polling. The shared server worker owns submission,
  // provider polling, retries, frame checks and the durable final URL.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
    const row = await callHook<any>('vv-render-job', { op: 'status', job_id: jobId });
    const state = String(row?.status || '').toLowerCase();
    if (state === 'complete' && row?.video_url) return String(row.video_url);
    if (state === 'failed') {
      throw new Error(String(row?.error_message || row?.stage_detail || 'The Remotion render failed.'));
    }
  }
  throw new Error('The render is still running on the server. Reopen Product Motion to see its persisted progress.');
}

async function logRender(_input: {
  filenames: string[];
  vision: VisionResult;
  code: string;
  renderUrl: string | null;
  status: 'complete' | 'failed';
}): Promise<void> {
  // Historical builds wrote product_motion_renders, but that table no longer
  // exists. Completed projects now persist once in video_jobs and the unified
  // vv_video_history path below, including the selected motion engine.
}

async function addProductVideoToJobs(input: {
  title: string;
  renderUrl: string;
  durationInFrames: number;
  filenames: string[];
  vision: VisionResult;
  presentationTemplate: string;
  engine: 'remotion' | 'hyperframes';
}): Promise<void> {
  const db = (window as any).__workspaceDb;
  if (!db) throw new Error('The video library session is still loading.');
  await db.from('video_jobs').insert({
    job_id: `${input.engine}:${Date.now()}`,
    title: input.title,
    status: 'completed',
    video_url: input.renderUrl,
    delivery_url: input.renderUrl,
    source: input.engine,
    phase_mode: false,
    model_used: input.engine,
    tone: `${input.vision.mood} · ${input.presentationTemplate}`,
    duration_seconds: Math.round(input.durationInFrames / 30),
    scene_count: input.filenames.length,
    aspect_ratio: '16:9',
    script_json: {
      mode: input.engine,
      motionEngine: input.engine,
      filenames: input.filenames,
      textEffect: input.vision.textEffect,
      presentationTemplate: input.presentationTemplate,
    },
  });
  void saveVideoToHistory({
    appId: 'product-videos',
    title: input.title,
    videoUrl: input.renderUrl,
    durationSec: Math.round(input.durationInFrames / 30),
  });
}

function ProgressSteps({ phase, engine }: { phase: GenerationPhase; engine: 'remotion' | 'hyperframes' }) {
  const steps = [
    { key: 'analyzing', label: 'Analyzing your images…', note: 'Vision layer' },
    { key: 'writing', label: 'Writing your composition…', note: engine === 'hyperframes' ? 'HyperFrames HTML + GSAP' : 'Custom TSX' },
    { key: 'rendering', label: 'Rendering…', note: engine === 'hyperframes' ? 'HeyGen managed cloud' : 'Polishing every frame' },
  ] as const;
  const order: GenerationPhase[] = ['analyzing', 'writing', 'rendering', 'done'];
  const current = order.indexOf(phase);
  return (
    <div style={{ display: 'grid', gap: 12 }} role="status" aria-live="polite">
      {steps.map((step, index) => {
        const active = step.key === phase;
        const complete = current > index;
        return (
          <div
            key={step.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '14px 16px',
              borderRadius: 14,
              border: `1px solid ${active ? 'var(--vg-accent)' : 'var(--vg-border)'}`,
              background: active ? 'var(--vg-gold-tint)' : 'var(--vg-surface)',
              opacity: active || complete ? 1 : 0.5,
            }}
          >
            <span
              className={active ? 'pm-dot' : undefined}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: 999,
                color: complete || active ? 'var(--vg-on-btn)' : 'var(--vg-muted)',
                background: complete ? 'var(--vg-success)' : active ? ACCENT : 'var(--vg-raised)',
              }}
            >
              {complete ? <Check size={15} /> : active ? <Loader2 size={15} /> : index + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 14, color: active ? 'var(--vg-text)' : 'var(--vg-secondary)' }}>
                {step.label}{active && step.key === 'writing' ? <span className="pm-cursor">▋</span> : null}
              </strong>
              <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--vg-muted)' }}>{step.note}</span>
            </span>
          </div>
        );
      })}
      <div className="pm-sheen" style={{ position: 'relative', height: 4, overflow: 'hidden', borderRadius: 999, background: 'var(--vg-raised)' }}>
        <div style={{ width: `${Math.max(12, (Math.max(0, current) + 1) * 33.333)}%`, height: '100%', borderRadius: 999, background: ACCENT }} />
      </div>
    </div>
  );
}

function VisionCard({ vision }: { vision: VisionResult }) {
  return (
    <div
      className="pm-rise"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        flexWrap: 'wrap',
        padding: '15px 17px',
        borderRadius: 14,
        border: '1px solid var(--vg-border)',
        background: 'var(--vg-raised)',
      }}
    >
      <div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--vg-muted)', textTransform: 'uppercase', letterSpacing: '.09em' }}>
          <Sparkles size={12} /> Direction detected
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--vg-gold-tint)', color: 'var(--vg-text)', fontSize: 12, fontWeight: 700 }}>
            {vision.mood}
          </span>
          <span style={{ fontSize: 12, color: 'var(--vg-muted)' }}>{vision.textEffect}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} aria-label={`Palette: ${vision.palette.join(', ')}`}>
        <Palette size={15} color="var(--vg-muted)" />
        {vision.palette.map((color) => (
          <span key={color} title={color} style={{ width: 24, height: 24, borderRadius: 8, background: color, border: '1px solid var(--vg-border)', boxShadow: '0 5px 16px rgba(0,0,0,0.35)' }} />
        ))}
      </div>
    </div>
  );
}

export function ProductMotionEmbed({ compact = false }: ProductMotionEmbedProps) {
  const [assets, setAssets] = useState<ProductAsset[]>([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [compositionCode, setCompositionCode] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const [logWarning, setLogWarning] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [motionTemplate, setMotionTemplate] = useState<MotionTemplate>(DEFAULT_MOTION_TEMPLATE);
  const [motionEngine, setMotionEngine] = useState<'remotion' | 'hyperframes'>(() => {
    try { return window.localStorage.getItem('product-videos:motion-engine') === 'hyperframes' ? 'hyperframes' : 'remotion'; }
    catch { return 'remotion'; }
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem('product-videos:motion-engine', motionEngine); }
    catch { /* preference only; completed jobs also persist the engine */ }
  }, [motionEngine]);

  // Reattach to the newest persisted Product Motion render. This is read-only:
  // vv-render-job continues and adopts the final URL even with no page open.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    const readLatest = async () => {
      try {
        const data = await callHook<any>('vv-render-job', { op: 'list', app: 'product-motion', limit: 1 });
        const latest = Array.isArray(data?.jobs) ? data.jobs[0] : null;
        if (cancelled || !latest) return;
        if (latest.status === 'complete' && latest.video_url) {
          setVideoUrl(String(latest.video_url));
          setPhase('done');
          return;
        }
        if (latest.status === 'failed') {
          setError(String(latest.error_message || latest.stage_detail || 'The saved render failed.'));
          setPhase('error');
          return;
        }
        setPhase('rendering');
        timer = window.setTimeout(readLatest, 4000);
      } catch {
        // A cold-load read miss does not affect the durable server job.
      }
    };
    void readLatest();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, []);

  const addFiles = (files: File[]) => {
    setError('');
    const room = MAX_IMAGES - assets.length;
    const accepted = files.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, room));
    const tooLarge = accepted.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 12 MB. Choose a smaller image.`);
      return;
    }
    if (accepted.length === 0) {
      setError(assets.length >= MAX_IMAGES ? `You can use up to ${MAX_IMAGES} images.` : 'Choose PNG, JPG, WebP, or GIF images.');
      return;
    }
    const next = accepted.map((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      objectUrls.current.add(objectUrl);
      return {
        id: uid(),
        file,
        objectUrl,
        label: inferLabel(file, assets.length + index),
      };
    });
    setAssets((current) => [...current, ...next]);
    setVision(null);
    setVideoUrl('');
    setCompositionCode('');
    setPhase('idle');
  };

  const removeAsset = (id: string) => {
    if (phase !== 'idle' && phase !== 'error') return;
    setAssets((current) => {
      const removed = current.find((asset) => asset.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.objectUrl);
        objectUrls.current.delete(removed.objectUrl);
      }
      return current.filter((asset) => asset.id !== id);
    });
    setVision(null);
    setVideoUrl('');
    setCompositionCode('');
  };

  const generate = async () => {
    if (assets.length === 0 || ['analyzing', 'writing', 'rendering'].includes(phase)) return;
    setError('');
    setLogWarning('');
    setVideoUrl('');
    setPhase('analyzing');
    let analyzed: VisionResult | null = null;
    let code = '';
    const selectedTemplate = presentationTemplateByLabel(motionTemplate);
    try {
      // The workspace token arrives asynchronously on a cold load. Waiting here
      // prevents the first click from failing before either AI request starts.
      await waitForWorkspaceToken();
      analyzed = await analyzeImages(assets);
      setVision(analyzed);
      setAssets((current) => current.map((asset, index) => ({
        ...asset,
        label: roleLabel(analyzed!.images[index]?.suggestedRole || '', index),
      })));

      const uploaded = await Promise.all(assets.map(uploadProductImage));
      const durationInFrames = Math.min(300, Math.max(150, 165 + assets.length * 24));
      setPhase('writing');
      let renderedUrl = '';
      if (motionEngine === 'hyperframes') {
        const inlineAssets = await Promise.all(assets.map(async (asset, index) => {
          const prepared = await makeVisionImage(asset.file);
          return {
            label: `${roleLabel(analyzed!.images[index]?.suggestedRole || '', index)} — ${analyzed!.images[index]?.description || asset.file.name}`,
            dataUrl: `data:${prepared.mediaType};base64,${prepared.data}`,
          };
        }));
        const brief = [
          'Create a premium product motion video from the supplied product shots.',
          `Detected mood: ${analyzed.mood}.`,
          `Text treatment: ${analyzed.textEffect}.`,
          `Presentation direction: ${selectedTemplate.label}. ${selectedTemplate.generationPrompt}`,
          ...analyzed.images.map((image, index) => `Shot ${index + 1}: ${image.description}; role: ${image.suggestedRole}.`),
          'Use every supplied image once, preserve its pixels, and make all copy short and evidence-based.',
        ].join('\n');
        setPhase('rendering');
        const result = await createHyperframesMotion({
          brief,
          title: `${assets[0]?.file.name.replace(/\.[^.]+$/, '') || 'Product'} · HyperFrames`,
          appId: 'product-videos',
          aspect: '16:9',
          duration: durationInFrames / 30,
          fps: 30,
          assets: inlineAssets,
          palette: analyzed.palette,
          idempotencyKey: `product-videos:${assets.map((asset) => asset.file.name).join('-').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160)}:${durationInFrames}`,
        });
        code = result.composition.html;
        renderedUrl = String(result.render.videoUrl || '');
      } else {
        code = await writeComposition(analyzed, uploaded, durationInFrames, selectedTemplate);
        setCompositionCode(code);
        setPhase('rendering');
        renderedUrl = await renderComposition(code, uploaded, analyzed, durationInFrames);
      }
      setCompositionCode(code);
      setPhase('rendering');
      if (!renderedUrl) throw new Error('The selected motion engine returned no video URL.');
      setVideoUrl(renderedUrl);
      setPhase('done');
      try {
        const filenames = assets.map((asset) => asset.file.name);
        await Promise.all([
          logRender({
            filenames,
            vision: analyzed,
            code,
            renderUrl: renderedUrl,
            status: 'complete',
          }),
          addProductVideoToJobs({
            title: `${filenames[0]?.replace(/\.[^.]+$/, '') || 'Product'} · ${motionEngine === 'hyperframes' ? 'HyperFrames' : 'Remotion'}`,
            renderUrl: renderedUrl,
            durationInFrames,
            filenames,
            vision: analyzed,
            presentationTemplate: selectedTemplate.label,
            engine: motionEngine,
          }),
        ]);
      } catch {
        setLogWarning('The video is ready, but its My Videos entry could not be saved.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `${motionEngine === 'hyperframes' ? 'HyperFrames' : 'Remotion'} could not finish this video.`;
      setError(message);
      setPhase('error');
      if (analyzed && code) {
        try {
          await logRender({
            filenames: assets.map((asset) => asset.file.name),
            vision: analyzed,
            code,
            renderUrl: null,
            status: 'failed',
          });
        } catch {
          // The actionable generation error remains the primary message.
        }
      }
    }
  };

  const downloadVideo = async () => {
    if (!videoUrl || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'product-motion.mp4';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // Cross-origin storage may refuse a blob fetch even though the permanent
      // media URL is valid. A normal anchor still gives the user the file.
      const link = document.createElement('a');
      link.href = videoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    assets.forEach((asset) => URL.revokeObjectURL(asset.objectUrl));
    objectUrls.current.clear();
    setAssets([]);
    setVision(null);
    setCompositionCode('');
    setVideoUrl('');
    setError('');
    setLogWarning('');
    setMotionTemplate(DEFAULT_MOTION_TEMPLATE);
    setMotionEngine('remotion');
    setPhase('idle');
    if (inputRef.current) inputRef.current.value = '';
  };

  const busy = ['analyzing', 'writing', 'rendering'].includes(phase);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    addFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: compact ? 540 : '100%',
        boxSizing: 'border-box',
        background: 'var(--vg-bg)',
        color: 'var(--vg-text)',
        fontFamily: "'Inter', 'Geist', system-ui, -apple-system, sans-serif",
        padding: compact ? 20 : 'clamp(22px, 5vw, 64px)',
      }}
    >
      <style>{APP_CSS}</style>
      <div style={{ width: '100%', maxWidth: compact ? 760 : 1020, margin: '0 auto' }}>
        {!compact ? (
          <header style={{ marginBottom: 34 }} className="pm-rise">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--vg-accent)', fontSize: 12, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase' }}>
              <Film size={15} /> {motionEngine === 'hyperframes' ? 'HyperFrames' : 'Remotion'}
            </div>
            <h1 style={{ margin: '12px 0 0', maxWidth: 780, fontSize: 'clamp(34px, 6vw, 64px)', lineHeight: 1.02, letterSpacing: '-.045em', fontWeight: 760 }}>
              Your product shots,<br /><span style={{ color: 'var(--vg-accent)' }}>directed frame by frame.</span>
            </h1>
            <p style={{ margin: '16px 0 0', maxWidth: 620, color: 'var(--vg-muted)', lineHeight: 1.65, fontSize: 15 }}>
              Choose the existing Remotion flow or opt into HyperFrames HTML motion rendered by HeyGen's managed cloud.
            </p>
          </header>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
            <Sparkles size={17} color="var(--vg-accent)" />
            <strong style={{ fontSize: 16 }}>Generate a motion video</strong>
          </div>
        )}

        {phase !== 'done' ? (
          <div style={{ display: 'grid', gap: 18 }}>
            {!busy ? (
              <div className="pm-rise" style={{ padding: 'clamp(14px,3vw,20px)', borderRadius: 18, border: '1px solid var(--vg-border)', background: 'var(--vg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--vg-text)' }}>
                  <Film size={15} />
                  <strong style={{ fontSize: 14 }}>Motion engine</strong>
                </div>
                <div role="radiogroup" aria-label="Motion engine" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                  {([['remotion', 'Remotion', 'Existing default'], ['hyperframes', 'HyperFrames', 'HeyGen cloud · opt in']] as const).map(([id, label, note]) => {
                    const active = motionEngine === id;
                    return <button key={id} type="button" role="radio" aria-checked={active} onClick={() => setMotionEngine(id)} style={{ minHeight: 58, textAlign: 'left', borderRadius: 12, border: `1px solid ${active ? 'var(--vg-accent)' : 'var(--vg-border)'}`, background: active ? 'var(--vg-gold-tint)' : 'transparent', color: 'var(--vg-text)', padding: '10px 12px', cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 13 }}>{label}</strong><span style={{ display: 'block', color: 'var(--vg-muted)', fontSize: 11, marginTop: 3 }}>{note}</span></button>;
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: 'var(--vg-text)' }}>
                  <Sparkles size={15} />
                  <strong style={{ fontSize: 14 }}>Choose a motion style</strong>
                </div>
                <p style={{ margin: '0 0 13px', color: 'var(--vg-muted)', fontSize: 12, lineHeight: 1.5 }}>
                  Watch all 15 layouts move, then choose the presentation direction for your product video.
                </p>
                <MotionStylePicker selected={motionTemplate} onSelect={setMotionTemplate} />
              </div>
            ) : null}

            <div
              className="pm-drop pm-focus"
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(event) => {
                if (!busy && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={busy ? -1 : 0}
              aria-disabled={busy}
              style={{
                minHeight: compact ? 190 : 270,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                cursor: busy ? 'default' : 'pointer',
                borderRadius: 22,
                border: `1.5px dashed ${dragging ? 'var(--vg-accent)' : 'var(--vg-control-border)'}`,
                background: dragging ? 'var(--vg-gold-tint)' : 'linear-gradient(145deg, rgba(212,175,55,.07), var(--vg-surface))',
                transform: dragging ? 'scale(1.006)' : undefined,
                padding: 26,
              }}
              data-testid="product-motion-dropzone"
            >
              <div>
                <span style={{ width: 54, height: 54, display: 'inline-grid', placeItems: 'center', borderRadius: 17, color: 'var(--vg-accent)', background: 'var(--vg-gold-tint)', border: '1px solid var(--line-gold)' }}>
                  <UploadCloud size={25} />
                </span>
                <h2 style={{ margin: '16px 0 6px', fontSize: compact ? 20 : 25, letterSpacing: '-.02em' }}>Drop your product shots here</h2>
                <p style={{ margin: 0, color: 'var(--vg-muted)', fontSize: 13 }}>or click to choose up to five images · 12 MB each</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                disabled={busy || assets.length >= MAX_IMAGES}
                onClick={(event) => { event.currentTarget.value = ''; }}
                onChange={(event) => addFiles(Array.from(event.target.files || []))}
                style={{ display: 'none' }}
                data-testid="product-motion-file-input"
              />
            </div>

            {assets.length > 0 ? (
              <div className="pm-rise" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 8px' }}>
                {assets.map((asset) => (
                  <div key={asset.id} style={{ position: 'relative', flex: '0 0 132px' }}>
                    <div style={{ height: 96, borderRadius: 13, overflow: 'hidden', border: '1px solid var(--vg-border)', background: 'var(--vg-raised)' }}>
                      <img src={asset.objectUrl} alt={asset.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <span style={{ display: 'block', marginTop: 7, color: 'var(--vg-muted)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.label}</span>
                    {!busy ? (
                      <button
                        type="button"
                        onClick={() => removeAsset(asset.id)}
                        className="pm-focus"
                        aria-label={`Remove ${asset.file.name}`}
                        style={{ position: 'absolute', top: 6, right: 6, width: 25, height: 25, display: 'grid', placeItems: 'center', border: 0, borderRadius: 999, color: '#fff', background: 'rgba(0,0,0,.55)', cursor: 'pointer' }}
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {vision ? <VisionCard vision={vision} /> : null}

            {busy ? (
              <div className="pm-rise" style={{ padding: 'clamp(17px, 3vw, 24px)', borderRadius: 18, border: '1px solid var(--vg-border)', background: 'var(--vg-surface)' }}>
                <ProgressSteps phase={phase} engine={motionEngine} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void generate()}
                disabled={assets.length === 0}
                className="pm-button pm-focus"
                style={{
                  minHeight: 54,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 9,
                  width: '100%',
                  border: 0,
                  borderRadius: 15,
                  background: assets.length ? 'var(--vg-btn)' : 'var(--vg-raised)',
                  color: assets.length ? 'var(--vg-on-btn)' : 'var(--vg-muted)',
                  fontSize: 16,
                  fontWeight: 750,
                  cursor: assets.length ? 'pointer' : 'not-allowed',
                }}
                data-testid="product-motion-generate"
              >
                {phase === 'error' ? <RefreshCw size={18} /> : <Sparkles size={18} />}
                {phase === 'error' ? 'Retry generation' : 'Generate Motion Video'} <ArrowRight size={18} />
              </button>
            )}

            {error ? (
              <div className="pm-rise" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '13px 15px', borderRadius: 13, border: '1px solid color-mix(in srgb, var(--vg-danger) 35%, transparent)', background: 'var(--vg-danger-bg)', color: 'var(--vg-danger)', fontSize: 13, lineHeight: 1.5 }}>
                <X size={16} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="pm-rise" style={{ display: 'grid', gap: 18 }}>
            <div style={{ padding: 'clamp(14px, 3vw, 24px)', borderRadius: 20, border: '1px solid var(--vg-border)', background: 'var(--vg-surface)', boxShadow: '0 32px 90px -45px rgba(0,0,0,.6)' }}>
              <video src={videoUrl} controls playsInline style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, background: '#000' }} data-testid="product-motion-video" />
            </div>
            {vision ? <VisionCard vision={vision} /> : null}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void downloadVideo()}
                disabled={downloading}
                className="pm-button pm-focus"
                style={{ minHeight: 50, flex: '1 1 220px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 0, borderRadius: 14, color: 'var(--vg-on-btn)', cursor: downloading ? 'wait' : 'pointer', fontWeight: 750, background: 'var(--vg-btn)', opacity: downloading ? .72 : 1 }}
                data-testid="product-motion-download"
              >
                {downloading ? <Loader2 size={18} className="pm-dot" /> : <Download size={18} />}
                {downloading ? 'Preparing download…' : 'Download'}
              </button>
              <button
                type="button"
                onClick={reset}
                className="pm-focus"
                style={{ minHeight: 50, flex: '1 1 180px', borderRadius: 14, border: '1px solid var(--vg-accent)', color: 'var(--vg-accent)', background: 'transparent', cursor: 'pointer', fontWeight: 650 }}
              >
                Generate another
              </button>
            </div>
            {logWarning ? <p style={{ margin: 0, color: 'var(--vg-warning)', fontSize: 12 }}>{logWarning}</p> : null}
            {compositionCode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--vg-muted)', fontSize: 11 }}>
                <ImageIcon size={13} /> Unique {motionEngine === 'hyperframes' ? 'HyperFrames HTML' : 'TSX'} composition · {compositionCode.length.toLocaleString()} characters
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return <ProductMotionEmbed />;
}
