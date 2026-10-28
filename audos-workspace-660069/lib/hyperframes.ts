import { callHook } from './workspace';

export type MotionEngine = 'existing' | 'hyperframes';
export type HyperframesAspect = '16:9' | '9:16' | '1:1';

export interface HyperframesTimelineCue {
  at: number;
  label: string;
}

export interface HyperframesComposition {
  html: string;
  timeline: { duration: number; cues: HyperframesTimelineCue[] };
  width: number;
  height: number;
  fps: number;
  duration: number;
}

export interface HyperframesRenderResult {
  success: boolean;
  status: 'completed' | 'rendering';
  renderId: string;
  videoUrl?: string;
  thumbnailUrl?: string | null;
  duration?: number;
  error?: string;
  code?: string;
  secretName?: string;
  allowedHost?: string;
}

export interface HyperframesAsset {
  label: string;
  dataUrl: string;
}

function dimensions(aspect: HyperframesAspect): { width: number; height: number } {
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

function workspaceToken(): string {
  const token = typeof window !== 'undefined' ? (window as any).__workspaceDb?.token : '';
  if (!token) throw new Error('Your workspace session is still loading. Wait a moment, then try again.');
  return String(token);
}

function apiError(body: any, fallback: string): string {
  const value = body?.error?.message || body?.error || body?.message || body?.errorMessage;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function jsonObject(raw: string): any {
  const clean = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The motion designer returned unreadable composition data.');
  return JSON.parse(clean.slice(start, end + 1));
}

function replaceAssets(html: string, assets: HyperframesAsset[]): string {
  let output = html;
  assets.forEach((asset, index) => {
    const marker = `{{ASSET_${index}}}`;
    output = output.split(marker).join(asset.dataUrl);
  });
  if (/\{\{ASSET_\d+\}\}/.test(output)) throw new Error('The composition referenced an unavailable image asset.');
  return output;
}

export function validateHyperframesComposition(composition: HyperframesComposition): void {
  const { html, width, height, duration, fps, timeline } = composition;
  if (!html || html.length < 400 || !/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error('The HyperFrames composition is incomplete.');
  }
  if (!Number.isFinite(duration) || duration < 0.25 || duration > 600) throw new Error('HyperFrames duration must be between 0.25 and 600 seconds.');
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) throw new Error('HyperFrames fps must be between 1 and 240.');
  const read = (name: string): number => Number(new RegExp(`${name}\\s*=\\s*["']([0-9]+(?:\\.[0-9]+)?)["']`, 'i').exec(html)?.[1]);
  if (read('data-width') !== width || read('data-height') !== height) throw new Error('HyperFrames HTML dimensions do not match the project.');
  if (Math.abs(read('data-duration') - duration) > 0.01) throw new Error('HyperFrames HTML duration does not match the project.');
  const id = /data-composition-id\s*=\s*["']([A-Za-z0-9_.:-]+)["']/i.exec(html)?.[1];
  if (!id || !/data-start\s*=\s*["']0(?:\.0+)?["']/i.test(html)) throw new Error('The HyperFrames root metadata is invalid.');
  if (!/class\s*=\s*["'][^"']*\bclip\b/i.test(html)) throw new Error('The HyperFrames composition has no timed clip.');
  if (!/gsap\.timeline\s*\(\s*\{[^}]*paused\s*:\s*true/i.test(html) || !/window\.__timelines/i.test(html)) {
    throw new Error('The HyperFrames composition must register one paused GSAP timeline.');
  }
  const hasRegistry = html.includes(`__timelines.${id}`) || html.includes(`__timelines["${id}"]`) || html.includes(`__timelines['${id}']`);
  if (!hasRegistry) throw new Error('The HyperFrames timeline key does not match the composition id.');
  const banned: Array<[RegExp, string]> = [
    [/\bfetch\s*\(/i, 'network fetches'], [/XMLHttpRequest/i, 'XMLHttpRequest'], [/\bWebSocket\b/i, 'WebSocket'],
    [/\bDate\s*\./i, 'wall-clock time'], [/performance\.now/i, 'wall-clock time'], [/Math\.random/i, 'unseeded randomness'],
    [/setTimeout\s*\(/i, 'setTimeout'], [/setInterval\s*\(/i, 'setInterval'], [/requestAnimationFrame\s*\(/i, 'requestAnimationFrame'], [/repeat\s*:\s*-1/i, 'infinite repeats'],
  ];
  for (const [pattern, label] of banned) if (pattern.test(html)) throw new Error(`The HyperFrames composition is not deterministic: remove ${label}.`);
  if (!timeline || Math.abs(Number(timeline.duration) - duration) > 0.01 || !Array.isArray(timeline.cues) || !timeline.cues.length) {
    throw new Error('The HyperFrames timeline manifest is missing or does not match the duration.');
  }
  for (const cue of timeline.cues) if (!Number.isFinite(Number(cue?.at)) || cue.at < 0 || cue.at > duration) throw new Error('A HyperFrames timeline cue falls outside the composition.');
}

export async function writeHyperframesComposition(input: {
  brief: string;
  aspect: HyperframesAspect;
  duration: number;
  fps?: number;
  assets?: HyperframesAsset[];
  palette?: string[];
}): Promise<HyperframesComposition> {
  const { width, height } = dimensions(input.aspect);
  const duration = Math.max(0.25, Math.min(600, Number(input.duration) || 6));
  const fps = Math.max(1, Math.min(240, Math.round(Number(input.fps) || 30)));
  const assets = (input.assets || []).slice(0, 5);
  const assetList = assets.length
    ? assets.map((asset, index) => `- {{ASSET_${index}}}: ${asset.label}`).join('\n')
    : '- No image assets. Use authored CSS shapes, gradients, SVG and typography.';
  const system = `You author production-ready HeyGen HyperFrames compositions as one self-contained index.html file. Return ONLY JSON: {"html":string,"timeline":{"duration":number,"cues":[{"at":number,"label":string}]}}.

HYPERFRAMES CONTRACT — follow exactly:
- Complete HTML document with one explicitly sized root: id="root", data-composition-id="vidverge", data-start="0", data-duration="${duration}", data-width="${width}", data-height="${height}".
- At least one direct child with class="clip", data-start, data-duration and data-track-index. HyperFrames owns clip visibility.
- Load GSAP from https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js.
- Build exactly one finite gsap.timeline({ paused: true }) synchronously and register it as window.__timelines.vidverge.
- Use explicit timeline positions and frame-seek-safe fromTo/to/set calls. Root data-duration is the render length.
- Do not use fetch, XMLHttpRequest, WebSocket, Date, performance.now, Math.random, timers, requestAnimationFrame, user input, infinite repeats, or runtime-generated ids.
- Never animate display or raw visibility. Animate transforms and opacity on wrappers inside a clip. Do not set clip visibility.
- Put full-screen backgrounds on a full-bleed child inside the root, not on the root itself.
- Every id is unique. Everything stays inside the ${width}x${height} frame with readable safe margins.
- Use only the supplied {{ASSET_N}} markers in img src values; never invent a URL. Data URLs are injected after generation.
- The output is code-rendered motion graphics, not a still slide: use layered entrances, purposeful camera-like transforms, clean holds, and an authored exit.
- timeline.cues is a concise manifest of the same beats in the GSAP timeline and must use duration ${duration}.
- No markdown and no prose outside the JSON.`;

  const response = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': workspaceToken() },
    body: JSON.stringify({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `SCENE BRIEF:\n${String(input.brief || '').slice(0, 12000)}\n\nPALETTE:\n${(input.palette || []).join(', ') || 'Choose a coherent palette from the brief.'}\n\nASSETS:\n${assetList}` },
      ],
      stream: false,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiError(body, `The HyperFrames motion designer answered HTTP ${response.status}.`));
  const parsed = jsonObject(String(body?.choices?.[0]?.message?.content || ''));
  const composition: HyperframesComposition = {
    html: replaceAssets(String(parsed?.html || ''), assets),
    timeline: parsed?.timeline,
    width,
    height,
    fps,
    duration,
  };
  validateHyperframesComposition(composition);
  return composition;
}

export async function renderHyperframesComposition(input: HyperframesComposition & {
  title: string;
  appId: string;
  idempotencyKey?: string;
}): Promise<HyperframesRenderResult> {
  validateHyperframesComposition(input);
  const result = await callHook<HyperframesRenderResult>('hyperframes-render', {
    html: input.html,
    timeline: input.timeline,
    resolution: { width: input.width, height: input.height },
    fps: input.fps,
    duration: input.duration,
    format: 'mp4',
    quality: 'standard',
    renderResolution: '1080p',
    title: input.title,
    appId: input.appId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!result || result.success !== true) throw new Error(result?.error || 'HyperFrames could not start this render.');
  if (result.status !== 'completed' || !result.videoUrl) throw new Error(result.error || 'HyperFrames is still rendering. Retry with the same project to resume safely.');
  return result;
}

export async function createHyperframesMotion(input: {
  brief: string;
  title: string;
  appId: string;
  aspect: HyperframesAspect;
  duration: number;
  fps?: number;
  assets?: HyperframesAsset[];
  palette?: string[];
  idempotencyKey?: string;
}): Promise<{ composition: HyperframesComposition; render: HyperframesRenderResult }> {
  const composition = await writeHyperframesComposition(input);
  const render = await renderHyperframesComposition({ ...composition, title: input.title, appId: input.appId, idempotencyKey: input.idempotencyKey });
  return { composition, render };
}
