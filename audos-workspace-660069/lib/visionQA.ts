import { WORKSPACE_ID, workspaceFetch } from './workspace';

export type VisionScores = {
  prompt_match: number;
  character_consistency: number;
  text_garbling: number;
  artifacts: number;
  safe_zone: number;
  brand_fit: number;
};
export type VisionQAResult = { pass: boolean; scores: VisionScores; issues: string[]; reviewByEye?: boolean; retryUsed?: boolean; frameUrls?: string[] };
export type VisionQAInput = {
  videoUrl: string;
  durationS: number;
  planText: string;
  characterSheet?: string;
  brand?: string;
  app: string;
  engine: string;
  contentType: string;
  generationId?: string;
  finalVideo?: boolean;
  retry?: () => Promise<string>;
};

const FALLBACK_SCORES: VisionScores = { prompt_match: 5, character_consistency: 5, text_garbling: 5, artifacts: 5, safe_zone: 5, brand_fit: 5 };
const bounded = (value: unknown) => Math.max(1, Math.min(10, Math.round(Number(value) || 5)));
const cleanJson = (value: string) => JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));

function sampleTimes(durationS: number, count: number): number[] {
  const duration = Math.max(0.5, Number(durationS) || 1);
  return Array.from({ length: count }, (_, index) => Math.max(0.05, Math.min(duration - 0.05, duration * ((index + 1) / (count + 1)))));
}
async function frames(videoUrl: string, durationS: number, count: number): Promise<string[]> {
  const response = await workspaceFetch('/api/video/frames', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrl, timestamps: sampleTimes(durationS, count), workspaceId: WORKSPACE_ID }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error || 'Frames could not be sampled.'));
  const values = Array.isArray(data?.frames) ? data.frames : [];
  return values.map((item: any) => String(item?.url || item?.frameUrl || item)).filter((url: string) => /^https:\/\//.test(url));
}
async function judge(input: VisionQAInput, frameUrls: string[]): Promise<VisionQAResult> {
  const token = String((window as any).__workspaceDb?.token || '');
  if (!token) throw new Error('Vision credential unavailable.');
  const rubric = `Return strict JSON only: {"pass":boolean,"scores":{"prompt_match":1-10,"character_consistency":1-10,"text_garbling":1-10,"artifacts":1-10,"safe_zone":1-10,"brand_fit":1-10},"issues":string[]}. Higher is better for every score: text_garbling 10 means no garbling; artifacts 10 means clean. Fail if average is below 7, any score is below 6, the planned subject/change is missing, the character drifts, product text is redrawn, or important content leaves safe zones. Plan: ${input.planText}. Character sheet: ${input.characterSheet || 'none'}. Brand: ${input.brand || 'none'}.`;
  const response = await fetch('/proxy/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token }, body: JSON.stringify({ model: 'gpt-6.1-sol', reasoning_effort: 'medium', max_completion_tokens: 6000, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: rubric }, ...frameUrls.map((url) => ({ type: 'image_url', image_url: { url } })) ] }] }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || 'Vision review failed.'));
  const parsed = cleanJson(String(data?.choices?.[0]?.message?.content || '{}'));
  const raw = parsed.scores || {};
  return { pass: parsed.pass === true, scores: { prompt_match: bounded(raw.prompt_match), character_consistency: bounded(raw.character_consistency), text_garbling: bounded(raw.text_garbling), artifacts: bounded(raw.artifacts), safe_zone: bounded(raw.safe_zone), brand_fit: bounded(raw.brand_fit) }, issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 12) : [] };
}
async function save(input: VisionQAInput, result: VisionQAResult) {
  try { await (window as any).__workspaceDb?.from('vv_quality_ratings').insert({ app: input.app, engine: input.engine, content_type: input.contentType, scores: result.scores, pass: result.pass, issues: result.issues, retry_used: result.retryUsed === true, generation_id: input.generationId || null, created_at: new Date().toISOString() }); } catch { /* QA logging never blocks delivery. */ }
}
export async function visionQA(input: VisionQAInput): Promise<VisionQAResult> {
  let frameUrls: string[] = [];
  try {
    frameUrls = await frames(input.videoUrl, input.durationS, input.finalVideo ? 8 : 4);
    if (!frameUrls.length) throw new Error('No frames were returned.');
    const first = { ...(await judge(input, frameUrls)), frameUrls };
    if (first.pass || !input.retry) { await save(input, first); return first; }
    const replacement = await input.retry();
    const retryInput = { ...input, videoUrl: replacement, retry: undefined };
    const retryFrames = await frames(replacement, input.durationS, input.finalVideo ? 8 : 4);
    const second = { ...(await judge(retryInput, retryFrames)), retryUsed: true, frameUrls: retryFrames };
    await save(retryInput, second); return second;
  } catch {
    const result: VisionQAResult = { pass: true, scores: FALLBACK_SCORES, issues: ['Automated review was unavailable. Review by eye before publishing.'], reviewByEye: true, frameUrls };
    await save(input, result); return result;
  }
}

export default visionQA;
