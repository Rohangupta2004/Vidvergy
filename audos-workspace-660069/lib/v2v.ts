import { callHook, WORKSPACE_ID, workspaceFetch } from './workspace';
import { generateWithSafePrompt, type GenerationModel } from './safePrompt';

export type V2VRoute = 'omni' | 'runway-product-swap';
export type V2VInput = { sourceUrl: string; instruction: string; durationS: number; aspect: '16:9' | '9:16' | '1:1'; productImageUrl?: string; originalProductImageUrl?: string; app: string; entryKey: string; onProgress?: (done: number, total: number) => void };
export type V2VResult = { videoUrl: string; route: V2VRoute; windows: number; credits: number; originalUrl: string; keep: () => string; undo: () => string };

export function chooseV2VRoute(instruction: string, hasProductImage = false): V2VRoute {
  return hasProductImage && /(?:swap|replace|put|bottle|product|package|packaging|label)/i.test(instruction) ? 'runway-product-swap' : 'omni';
}
export function planV2VWindows(durationS: number): Array<{ start: number; end: number }> {
  const duration = Math.max(0.1, Number(durationS) || 0.1); const out = []; let start = 0;
  while (start < duration - 0.05) { const end = Math.min(duration, start + 8); out.push({ start, end }); if (end >= duration) break; start = Math.max(start + 0.1, end - 0.5); }
  return out;
}
async function requireCredits(seconds: number) {
  const quote = await callHook<any>('vv-credits', { op: 'quote', seconds });
  if (!quote?.ok || !quote.affordable) throw new Error(`This edit costs ${Math.ceil(seconds)} credits${quote?.shortfall ? `; add ${quote.shortfall} more` : ''}.`);
  return Math.ceil(seconds);
}
async function charge(input: V2VInput, seconds: number) {
  const result = await callHook<any>('vv-credits', { op: 'charge', seconds, entryKey: input.entryKey, source: `${input.app}-v2v`, note: `Video edit: ${input.instruction.slice(0, 180)}` });
  if (!result?.ok) throw new Error(result?.error || 'The completed edit could not be charged.');
}
async function trim(url: string, startSec: number, endSec: number): Promise<string> {
  const response = await workspaceFetch('/api/video/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrlOrKey: url, startSec, endSec, workspaceId: WORKSPACE_ID }) });
  const data = await response.json().catch(() => null); const result = String(data?.url || '');
  if (!response.ok || !/^https:\/\//.test(result)) throw new Error(String(data?.error || 'The edit window could not be prepared.'));
  return result;
}
async function pollOmni(operationId: string): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await workspaceFetch(`/api/veo/status/${encodeURIComponent(operationId)}`); const data = await response.json().catch(() => null); const status = String(data?.status || '').toLowerCase();
    if (status === 'completed' && /^https:\/\//.test(String(data?.videoUrl || ''))) return String(data.videoUrl);
    if (['failed','cancelled','canceled','rejected'].includes(status)) throw new Error(String(data?.errorMessage || data?.error || `Omni ended ${status}.`));
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('The video edit took too long.');
}
async function omniWindow(sourceUrl: string, instruction: string, duration: number, aspect: V2VInput['aspect']): Promise<string> {
  const response = await workspaceFetch('/api/veo/generate/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gemini-omni-1.1-flash', prompt: `${instruction}. Change only that. Preserve the same face, body motion, timing, camera move, product label, framing and audio unless the request explicitly changes one of them.`, videoData: sourceUrl, videoMimeType: 'video/mp4', duration: Math.max(2, Math.round(duration)), aspectRatio: aspect, resolution: '720p', generateAudio: true }) });
  const data = await response.json().catch(() => null); const operationId = String(data?.operationId || '');
  if (!response.ok || !operationId) throw new Error(String(data?.error?.message || data?.error || 'Omni refused this edit.'));
  return pollOmni(operationId);
}
async function runwaySwap(input: V2VInput): Promise<string> {
  if (!input.productImageUrl) throw new Error('Add the replacement product image first.');
  const token = String((window as any).__workspaceDb?.token || '');
  const response = await fetch('/api/generate/runway/recipes/product_swap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token, 'Idempotency-Key': input.entryKey }, body: JSON.stringify({ referenceVideo: { uri: input.sourceUrl }, ...(input.originalProductImageUrl ? { originalProductImage: { uri: input.originalProductImageUrl } } : {}), newProductImages: [{ uri: input.productImageUrl }], userConcept: input.instruction }) });
  const job = await response.json().catch(() => null); const taskId = String(job?.taskId || job?.id || '');
  if ((!response.ok && response.status !== 202) || !taskId) throw new Error(String(job?.error?.message || job?.error || 'Runway refused this product swap.'));
  for (let attempt = 0; attempt < 120; attempt += 1) { const statusResponse = await fetch(`/api/generate/runway/status/${encodeURIComponent(taskId)}`, { headers: { 'X-Workspace-DB-Token': token } }); const status = await statusResponse.json().catch(() => null); if (status?.status === 'succeeded') { const url = String(status?.mediaUrls?.[0] || status?.outputs?.[0]?.url || ''); if (url) return url; } if (['failed','cancelled'].includes(status?.status)) throw new Error(String(status?.error?.message || status?.error || `Runway ended ${status.status}.`)); await new Promise((resolve) => setTimeout(resolve, 5000)); }
  throw new Error('The product swap took too long.');
}
async function join(urls: string[]): Promise<string> {
  if (urls.length === 1) return urls[0];
  const response = await workspaceFetch(`/api/workspaces/${WORKSPACE_ID}/videos/stitch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrls: urls }) }); const data = await response.json().catch(() => null); const url = String(data?.stitchedUrl || '');
  if (!response.ok || !url) throw new Error(String(data?.error || 'The edited windows could not be joined.'));
  return url;
}
export async function changeVideo(input: V2VInput): Promise<V2VResult> {
  const credits = await requireCredits(input.durationS); const route = chooseV2VRoute(input.instruction, !!input.productImageUrl);
  try {
    let videoUrl = '';
    if (route === 'runway-product-swap') videoUrl = await runwaySwap(input);
    else {
      const windows = planV2VWindows(input.durationS); const outputs: string[] = [];
      const models: GenerationModel[] = [{ id: 'gemini-omni-1.1-flash', provider: 'google' }];
      for (let index = 0; index < windows.length; index += 1) { const window = windows[index]; const source = await trim(input.sourceUrl, window.start, window.end); const generated = await generateWithSafePrompt({ app: input.app, prompt: { prompt: input.instruction }, models, generate: (_model, prompt) => omniWindow(source, prompt, window.end - window.start, input.aspect) }); outputs.push(generated.result); input.onProgress?.(index + 1, windows.length); }
      videoUrl = await join(outputs);
    }
    await charge(input, input.durationS);
    return { videoUrl, route, windows: route === 'omni' ? planV2VWindows(input.durationS).length : 1, credits, originalUrl: input.sourceUrl, keep: () => videoUrl, undo: () => input.sourceUrl };
  } catch (error) { try { await callHook('vv-credits', { op: 'refund', entryKey: input.entryKey, source: `${input.app}-v2v`, note: 'Video edit failed' }); } catch {} throw error; }
}
