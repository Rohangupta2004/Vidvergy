/**
 * 3D SCENE BUILDER — what happens to a render once it leaves the viewport.
 *
 * Nothing here adds an endpoint. Uploads use the shared workspace storage
 * helper (lib/reelioStudio uploadImage → POST /api/upload/file), recorded clips
 * land in the shared "Your videos" list through lib/videoHistory, and the
 * Stylise pass posts the render to the platform image model through the same
 * postGeneration transport lib/reelioStudio's generateImage uses — with
 * `editImageData` so the model keeps the scene's composition. AI video is not
 * started here at all: the render is handed back to the Lab conversation,
 * which owns model choice, the credit quote and the existing run ledger.
 */
import { postGeneration } from '../../../lib/videoEngineClient';
import { uploadImage } from '../../../lib/reelioStudio';
import { saveVideoToHistory } from '../../../lib/videoHistory';
import type { AspectId } from './sceneModel';

export const LAB_APP_ID = 'video-provider-lab';
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MODEL = 'gemini-3.1-flash-image';

export interface StylePreset {
  id: string;
  label: string;
  helper: string;
  prompt: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'photoreal', label: 'Photoreal', helper: 'Real materials and light, like a photo shoot.', prompt: 'a photorealistic photograph with real-world materials and textures, natural light falloff, shot on a full-frame camera with a 50mm lens and shallow depth of field' },
  { id: 'cinematic', label: 'Cinematic still', helper: 'A moody film frame with grade and grain.', prompt: 'a cinematic film still with an anamorphic lens look, dramatic contrast, subtle film grain and a professional colour grade' },
  { id: 'product', label: 'Product ad', helper: 'A glossy commercial hero shot.', prompt: 'a high-end commercial product photograph with crisp studio lighting, clean reflections and a premium look' },
  { id: 'animated', label: '3D animated', helper: 'A polished animated-feature look.', prompt: 'a frame from a polished 3D animated feature film, stylised but richly detailed, with soft global illumination' },
  { id: 'anime', label: 'Anime', helper: 'Hand-drawn anime art.', prompt: 'an anime illustration with clean line art, painterly backgrounds and vibrant colour' },
  { id: 'clay', label: 'Claymation', helper: 'A handmade clay miniature set.', prompt: 'a claymation stop-motion miniature set with handmade plasticine textures and soft studio light' },
];

export function stylisePrompt(styleId: string, notes: string): string {
  const style = STYLE_PRESETS.find((item) => item.id === styleId) || STYLE_PRESETS[0];
  return [
    `Re-render this 3D scene blockout as ${style.prompt}.`,
    'Keep the exact composition, camera angle, framing, object positions, silhouettes, proportions and lighting direction.',
    'Turn every simple placeholder shape into a detailed, realistic version of the object it stands for, keeping its colour.',
    'Mannequins and stand-in figures become real people in the same poses and positions.',
    notes.trim() ? `Scene details: ${notes.trim().slice(0, 1200)}` : '',
    'No text, captions, logos or watermarks.',
  ].filter(Boolean).join(' ');
}

function findImage(data: any): string {
  const candidates = [
    data?.imageUrl, data?.url, data?.image, data?.output,
    Array.isArray(data?.images) ? (data.images[0]?.url || data.images[0]) : '',
    Array.isArray(data?.data) ? (data.data[0]?.url || (data.data[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : '')) : '',
  ];
  const hit = candidates.find((value) => typeof value === 'string' && /^(data:image\/|https?:\/\/)/i.test(value));
  return typeof hit === 'string' ? hit : '';
}

function failureText(data: any, status: number): string {
  const detail = Array.isArray(data?.details)
    ? data.details.map((item: any) => [Array.isArray(item?.path) ? item.path.join('.') : '', item?.message].filter(Boolean).join(': ')).join(' · ')
    : '';
  const raw = String(data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message || data?.errorMessage || '');
  if (status === 402) return 'The workspace wallet is too low for an image pass. Top it up, then try again.';
  if (status === 401) return 'Your session is not ready yet. Refresh the page and try again.';
  return `The stylise pass failed${status ? ` (HTTP ${status})` : ''}: ${detail || raw || 'no reason given'}.`;
}

/** Send a render to the image model as the edit source and return the restyled image (data: or https URL). */
export async function styliseImage(opts: { imageDataUrl: string; styleId: string; notes: string; aspect: AspectId }): Promise<string> {
  const base64 = opts.imageDataUrl.split(',')[1] || '';
  if (!base64) throw new Error('There is no render to stylise yet.');
  const { res, data } = await postGeneration('/api/veo/generate/image', {
    model: IMAGE_MODEL,
    prompt: stylisePrompt(opts.styleId, opts.notes),
    aspectRatio: opts.aspect,
    editImageData: base64,
  });
  if (!res.ok || data?.success === false || String(data?.status || '').toLowerCase() === 'failed') {
    throw new Error(failureText(data, res.ok ? 0 : res.status));
  }
  const image = findImage(data);
  if (!image) throw new Error('The image model answered but returned no image.');
  return image;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /^data:([^;,]+)/.exec(head || '')?.[1] || 'application/octet-stream';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

/** The Lab's attachments are inline data URLs, so a hosted image is read back into one first. */
export async function ensureDataUrl(url: string): Promise<string> {
  if (/^data:image\//i.test(url)) return url;
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`The image could not be downloaded (HTTP ${response.status}).`);
  return blobToDataUrl(await response.blob());
}

/** Store a file in public workspace storage and return its https URL. */
export function uploadSceneFile(file: File, folder: string): Promise<string> {
  return uploadImage(file, folder);
}

export async function saveClipToHistory(opts: { blob: Blob; extension: string; title: string; durationSec: number }): Promise<{ url: string; listed: boolean }> {
  const name = `${opts.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || '3d-scene'}.${opts.extension}`;
  const file = new File([opts.blob], name, { type: opts.blob.type || `video/${opts.extension}` });
  const url = await uploadSceneFile(file, 'vpl-scene3d-clips');
  const listed = await saveVideoToHistory({
    appId: LAB_APP_ID,
    title: `3D Scene · ${opts.title}`.slice(0, 120),
    videoUrl: url,
    durationSec: Math.round(opts.durationSec),
  });
  return { url, listed };
}

export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  if (/^https?:/i.test(url)) link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function safeFileName(name: string, fallback: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || fallback;
}
