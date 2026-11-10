/**
 * Enhancer Agent — the planning brain.
 *
 * One model call per user message: Claude Opus 5 through the Anthropic proxy,
 * GPT 6.1 Sol through the OpenAI proxy if Opus fails, then the offline keyword
 * planner. The context is deliberately small (measurements, the active stack
 * and a short transcript excerpt) to keep token use low.
 */
import { workspaceFetch } from '../../../lib/workspace';
import { FALLBACK_PLANNER_MODEL, PLANNER_MAX_TOKENS, PLANNER_MODEL, PLANNER_TIMEOUT_MS } from './agentConfig';
import { activeSteps } from './agentCompose';
import { keywordPlan, normalizePlan } from './agentOps';
import type { AgentPlan, AgentProject } from './agentTypes';

const SYSTEM = `You are the Enhancer Agent inside Vidverge, a pro AI video editor. Turn the user's request into an ordered operation plan for their uploaded video. The app validates and runs it automatically.
Reply with JSON only, no prose or code fences:
{"reply":"one or two short, friendly sentences to the user","steps":[{"type":"<op>","params":{},"why":"<=10 words"}],"undo":["<id or type of an active step to switch off>"]}
Rules: use only the operations below; times are seconds in the ORIGINAL video; at most 10 steps; do not repeat an active step unless changing its params; never ask questions — choose sensible defaults; Omni operations cost credits for the seconds they process (real engine cost + 30%, about 0.9 credit per second), so give start/end when the user names a moment; prefer free operations when they achieve the goal; put generative (Omni) steps first.
Free operations:
grade{look:none|cinematic|warm|cool|vintage|bw,strength:0-100 auto-correction,lut:none|teal_orange|warm_retro|faded_film|mono,lutIntensity,brightness|contrast|saturation|highlights|shadows|temperature|tint:-50..50,vignette|filmGrain|bloom:0-100}
restore{denoise:0-100,sharpen:0-100} (also masters to 1080p)
stabilize{strength:10-100}
speed{rate:0.25-4,ramp:none|punch|easeIn|easeOut,start?,end?}
trim{start,end} keep only this range
cut_silences{minSilence:0.3-2.5,padding:0.04-0.4}
captions{style:minimal|bold|gradient|karaoke|tiktok|neon|cinematic|handwritten|creator|newsroom|comic|luxury|gaming|desi,font:inter|anton|bebas|montserrat|roboto|impact|oswald|playfair|caveat|mono,position:bottom|lower-third|middle|top,uppercase:bool,maxWords:1-8,highlight:#hex}
reframe{aspect:9:16|1:1|16:9|4:5,track:bool subject tracking}
text{text,start,end,position:top|center|lower-third|bottom,style:bold|clean|glow|kinetic,color:#hex}
motion_fx{effect:lightLeak|vhs|glitch|filmGrain|vignette|bloom|halation|chromaticAberration|dustScratches|lensFlare|zoomPunch|shake,intensity:5-100}
music{bed:inspiring|cinematic-dark|energetic|calm|luxury,volume:0.05-0.6}
audio_cleanup{strength:10-100}
remove_bg{mode:transparent} (free alpha WebM cut-out of a person, clips up to 60s)
Paid operations:
broll{prompt>=10 chars,at,duration:4-8,position:full|pip} (1 credit/second)
remove_bg{mode:colour|image|generated,colour:#hex,imageUrl,prompt,start?,end?} (free on green screen, else Omni)
replace_bg{prompt,start?,end?} AI-generated background scene (Omni)
isolate{subject,backdrop:black|white|blur,start?,end?} (Omni)
restyle{prompt,start?,end?} style transfer e.g. anime, claymation, film noir (Omni)
omni_effect{prompt,start?,end?} generative effect e.g. falling snow, make it night (Omni)`;

const r1 = (n: number) => Math.round(n * 10) / 10;

function buildContext(project: AgentProject, instruction: string): string {
  const s = project.source;
  const a = project.analysis;
  const captions = activeSteps(project).find((step) => step.type === 'captions' && step.result?.words?.length);
  const transcript = captions ? captions.result!.words!.map((w) => w.text).join(' ').slice(0, 600) : '';
  return JSON.stringify({
    request: instruction.slice(0, 1200),
    video: { seconds: r1(s.duration), width: s.width, height: s.height, greenScreen: Boolean(s.greenScreen) },
    measured: a ? { exposure: Math.round(a.luma * 100), tonalRange: Math.round(a.spread * 100), saturation: Math.round(a.saturation * 100), cast: Math.abs(a.warmth) < 0.02 ? 'neutral' : a.warmth > 0 ? 'warm' : 'cool' } : null,
    active: activeSteps(project).slice(-20).map((step) => ({ id: step.id, type: step.type, params: step.params })),
    transcript: transcript || undefined,
    recent: project.messages.slice(-4).map((m) => ({ role: m.role, text: m.text.slice(0, 160) })),
  });
}

function token(): string {
  return String((window as any).__workspaceDb?.token || '');
}

function parseJson(text: string): unknown {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { /* try the outermost object */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('The planner reply was not JSON.');
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PLANNER_TIMEOUT_MS);
  try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
}

async function askClaude(user: string): Promise<string> {
  return withTimeout(async (signal) => {
    const res = await workspaceFetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token() },
      body: JSON.stringify({
        model: PLANNER_MODEL,
        max_tokens: PLANNER_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
      }),
      signal,
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new Error(String(data?.error?.message || data?.error || `Claude answered HTTP ${res.status}.`));
    const text = Array.isArray(data?.content) ? data.content.map((b: any) => (b?.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('') : '';
    if (!text.trim()) throw new Error('Claude returned an empty plan.');
    return text;
  });
}

async function askGpt(user: string): Promise<string> {
  return withTimeout(async (signal) => {
    const res = await workspaceFetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token() },
      body: JSON.stringify({
        model: FALLBACK_PLANNER_MODEL,
        reasoning_effort: 'medium',
        max_completion_tokens: PLANNER_MAX_TOKENS,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      }),
      signal,
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new Error(String(data?.error?.message || data?.error || `GPT answered HTTP ${res.status}.`));
    const text = String(data?.choices?.[0]?.message?.content || '');
    if (!text.trim()) throw new Error('GPT returned an empty plan.');
    return text;
  });
}

export async function planEdit(project: AgentProject, instruction: string): Promise<AgentPlan> {
  const user = buildContext(project, instruction);
  const duration = project.source.duration;
  try {
    const plan = normalizePlan(parseJson(await askClaude(user)), duration, 'Claude Opus 5');
    if (plan.steps.length || plan.undo.length) return plan;
    throw new Error('Claude planned no valid steps.');
  } catch (claudeError) {
    console.warn('[Enhancer Agent] Opus planning failed, trying GPT 6.1 Sol:', claudeError);
    try {
      const plan = normalizePlan(parseJson(await askGpt(user)), duration, 'GPT 6.1 Sol');
      if (plan.steps.length || plan.undo.length) return plan;
      throw new Error('GPT planned no valid steps.');
    } catch (gptError) {
      console.warn('[Enhancer Agent] GPT planning failed, using the offline planner:', gptError);
      return keywordPlan(instruction, duration);
    }
  }
}
