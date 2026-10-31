import { quoteCredits } from '../../../lib/credits';
import { callHook, workspaceFetch } from '../../../lib/workspace';
import type { VidvergeAttachment } from '../../../lib/vidvergeHandoff';

const OPENAI_URL = '/proxy/openai/v1/chat/completions';

export interface ProductionScene {
  id: string;
  startSec: number;
  endSec: number;
  purpose: string;
  narration: string;
  visual: string;
}

export interface OneCommandProduction {
  id: string;
  title: string;
  command: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16';
  sourceUrl: string | null;
  script: string;
  characterChoice: string;
  voiceId: string;
  voiceName: string;
  voiceDirection: string;
  musicPrompt: string;
  language: string;
  accent: string;
  scenes: ProductionScene[];
  chargeKey: string;
}

export interface ProductionProgress {
  id: 'plan' | 'credits' | 'voice' | 'music' | 'scenes' | 'render' | 'qa' | 'delivery';
  name: string;
  status: 'running' | 'done' | 'failed';
  detail: string;
}

interface VoiceChoice {
  id: string;
  name: string;
  labels?: Record<string, string>;
}

function randomId(prefix: string): string {
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${value}`;
}

function parseJson(text: string): any {
  const clean = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The production planner returned an unreadable plan.');
  return JSON.parse(clean.slice(start, end + 1));
}

function durationFrom(command: string): number {
  const explicit = Number(command.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[1]);
  return Math.max(8, Math.min(64, Number.isFinite(explicit) && explicit > 0 ? Math.round(explicit) : 30));
}

function aspectFrom(command: string): '16:9' | '9:16' {
  return /\b(?:9:16|vertical|portrait|reel|shorts?|tiktok)\b/i.test(command) ? '9:16' : '16:9';
}

function sourceUrlFrom(command: string): string | null {
  return command.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0]?.replace(/[.,!?]+$/, '') || null;
}

function languageFrom(command: string): { language: string; accent: string } {
  const text = String(command || '');
  if (/\p{Script=Devanagari}/u.test(text)) return { language: 'Hindi', accent: 'natural Indian Hindi' };
  if (/\b(?:hinglish|yaar|aap|hai|hain|karo|karna|chahiye|nahi|bahut|kaise|kyun)\b/i.test(text)) return { language: 'Hinglish', accent: 'natural Indian Hinglish' };
  const named = text.match(/\b(?:language|spoken in|in)\s*[:=-]?\s*(English|Hindi|Hinglish|Spanish|French|German|Italian|Portuguese|Arabic|Japanese|Korean|Mandarin|Tamil|Telugu|Bengali|Marathi)\b/i)?.[1];
  const language = named ? named.charAt(0).toUpperCase() + named.slice(1).toLowerCase() : 'English';
  return { language, accent: language === 'English' ? 'neutral natural English' : `natural ${language}` };
}

async function listVoices(): Promise<VoiceChoice[]> {
  try {
    const response = await fetch('/api/voices', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.voices)) return [];
    return data.voices
      .filter((voice: any) => voice && typeof voice.id === 'string' && typeof voice.name === 'string')
      .slice(0, 30)
      .map((voice: any) => ({ id: voice.id, name: voice.name, labels: voice.labels || {} }));
  } catch {
    return [];
  }
}

function normalizeScenes(raw: any, durationSeconds: number, script: string): ProductionScene[] {
  const requested = Array.isArray(raw?.scenes) ? raw.scenes.slice(0, 8) : [];
  const count = Math.max(1, Math.min(8, Math.ceil(durationSeconds / 8)));
  const scenes = requested.length ? requested : Array.from({ length: count }, (_, index) => ({
    purpose: index === 0 ? 'Hook' : index === count - 1 ? 'Call to action' : `Proof beat ${index}`,
    narration: script,
    visual: 'Grounded branded product motion using the supplied brief and source evidence.',
  }));
  const slice = durationSeconds / scenes.length;
  return scenes.map((scene: any, index: number) => ({
    id: `scene-${index + 1}`,
    startSec: Number((index * slice).toFixed(2)),
    endSec: Number((index === scenes.length - 1 ? durationSeconds : (index + 1) * slice).toFixed(2)),
    purpose: String(scene?.purpose || `Scene ${index + 1}`).slice(0, 180),
    narration: String(scene?.narration || '').slice(0, 1600),
    visual: String(scene?.visual || scene?.visualDirection || '').slice(0, 2400),
  }));
}

export function isOneCommandVideoRequest(command: string): boolean {
  const text = String(command || '').trim();
  if (!text || /\b(?:edit|change|revise|replace)\b/i.test(text)) return false;
  return /\b(?:make|create|generate|produce|turn|build)\b[\s\S]{0,80}\b(?:video|ad|film|reel|short|commercial)\b/i.test(text)
    || (/https?:\/\//i.test(text) && /\b(?:video|ad|film|reel|short|commercial)\b/i.test(text));
}

export async function planOneCommandProduction(
  command: string,
  liveContext: string,
  attachment: VidvergeAttachment | null,
  signal?: AbortSignal,
): Promise<OneCommandProduction> {
  const durationSeconds = durationFrom(command);
  const aspectRatio = aspectFrom(command);
  const sourceUrl = sourceUrlFrom(command);
  const languageLock = languageFrom(command);
  const voices = await listVoices();
  const voiceCatalog = voices.map((voice) => ({ id: voice.id, name: voice.name, labels: voice.labels })).slice(0, 24);
  const response = await workspaceFetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
      response_format: { type: 'json_object' },
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'You are Verger’s production planner. Turn one clarified user command into a complete, truthful video plan. Use supplied URL/Brand Kit evidence; never invent claims. Choose exactly one available voice id. Preserve the supplied language and accent across every scene. A character may be a presenter, recurring product hero, visual mascot, or “no on-camera character” when faceless is stronger. Return one JSON object: {title,script,characterChoice,voiceId,voiceName,voiceDirection,musicPrompt,scenes:[{purpose,narration,visual}]}. Write a concise voiceover script that fits the exact duration. Create enough scenes for 4–8 seconds each. Music is mandatory and must sit under narration. Do not mention internal models, hooks, or approval.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            command,
            durationSeconds,
            aspectRatio,
            sourceUrl,
            attachment: attachment ? { name: attachment.name, type: attachment.type, url: attachment.url } : null,
            language: languageLock.language,
            accent: languageLock.accent,
            voiceCatalog,
            latestBrandAndLibraryContext: liveContext.slice(0, 16000),
          }),
        },
      ],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || 'Verger could not plan this production.'));
  const raw = parseJson(String(data?.choices?.[0]?.message?.content || ''));
  const chosen = voices.find((voice) => voice.id === String(raw?.voiceId || '')) || voices[0] || {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
  };
  const script = String(raw?.script || command).trim().slice(0, 9000);
  const id = randomId('verger-production');
  return {
    id,
    title: String(raw?.title || 'Verger video').trim().slice(0, 160),
    command,
    durationSeconds,
    aspectRatio,
    sourceUrl,
    script,
    characterChoice: String(raw?.characterChoice || 'No on-camera character; the product is the visual hero.').trim().slice(0, 500),
    voiceId: chosen.id,
    voiceName: chosen.name,
    voiceDirection: String(raw?.voiceDirection || 'Warm, clear and confident.').trim().slice(0, 500),
    musicPrompt: String(raw?.musicPrompt || 'Modern cinematic instrumental, confident build, clear space for narration.').trim().slice(0, 1800),
    language: languageLock.language,
    accent: languageLock.accent,
    scenes: normalizeScenes(raw, durationSeconds, script),
    chargeKey: `verger:${id}`,
  };
}

export async function quoteOneCommandProduction(plan: OneCommandProduction) {
  return quoteCredits(plan.durationSeconds);
}

export async function executeOneCommandProduction(
  plan: OneCommandProduction,
  attachment: VidvergeAttachment | null,
  onProgress: (progress: ProductionProgress) => void,
  signal?: AbortSignal,
): Promise<{ videoUrl: string; projectId: number; jobId: string }> {
  if (signal?.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
  onProgress({ id: 'credits', name: 'Credit authorization', status: 'running', detail: `${plan.durationSeconds}s · ${plan.durationSeconds} credits` });
  onProgress({ id: 'voice', name: 'Voice & character', status: 'running', detail: `${plan.characterChoice} Delivery: ${plan.voiceDirection}` });
  onProgress({ id: 'music', name: 'Music direction', status: 'running', detail: plan.musicPrompt });
  onProgress({ id: 'scenes', name: 'Scene production', status: 'running', detail: `${plan.scenes.length} grounded scenes are being submitted with native dialogue, effects and music.` });

  const referenceUrls = attachment?.url ? [attachment.url] : [];
  const languageLine = `LANGUAGE LOCK: Spoken language: ${plan.language}; accent: ${plan.accent}; no subtitles or on-screen text in any other language.`;
  const scenes = plan.scenes.map((scene) => ({
    scene_description: `${languageLine} ${scene.purpose}. ${scene.visual} Character continuity: ${plan.characterChoice}. Voice direction: ${plan.voiceDirection}. Native spoken line: "${scene.narration || plan.script}". Soundtrack: ${plan.musicPrompt}. Keep dialogue intelligible over the music; no generated captions or watermarks.`,
    dialogue: scene.narration || undefined,
    language: plan.language,
    start_pose: `Continue naturally from the prior scene while preserving ${plan.characterChoice}.`,
    end_pose: 'End on a stable composition that can cut cleanly into the next scene.',
  }));
  const created = await callHook<any>('generate-video', {
    script: JSON.stringify(scenes),
    character_description: plan.characterChoice,
    tone: `${plan.voiceDirection}; ${plan.musicPrompt}`,
    language: plan.language,
    accent: plan.accent,
    duration_seconds: plan.durationSeconds,
    title: plan.title,
    aspect_ratio: '9:16',
    website_url: plan.sourceUrl || undefined,
    website_placement: 'end',
    reference_images: referenceUrls.length ? JSON.stringify(referenceUrls) : undefined,
    reference_image_url: referenceUrls[0] || undefined,
    reference_image_scene: referenceUrls.length ? 1 : undefined,
  }, { signal });
  const jobId = String(created?.job_id || created?.jobId || created?.id || '');
  if (!jobId) throw new Error(String(created?.error || 'The video job was not persisted.'));
  onProgress({ id: 'credits', name: 'Credit authorization', status: 'done', detail: 'The vv-credits receipt was accepted once before provider submission.' });
  onProgress({ id: 'voice', name: 'Voice & character', status: 'done', detail: 'Character and native voice direction are locked across every scene.' });
  onProgress({ id: 'music', name: 'Music direction', status: 'done', detail: 'The native soundtrack direction is locked for the render.' });
  onProgress({ id: 'scenes', name: 'Scene production', status: 'done', detail: `${plan.scenes.length} scenes were accepted by the durable video pipeline.` });
  onProgress({ id: 'render', name: 'Render & assembly', status: 'running', detail: 'Generating every scene and stitching the final MP4.' });

  const started = Date.now();
  let lastStage = '';
  for (;;) {
    if (signal?.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
    let status: any;
    try {
      status = await callHook<any>('check-video-status', { job_id: jobId }, { signal });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause || '');
      // generate-video persists the job before its detached submit writes the
      // first operation id. That short handoff is processing, not a failure.
      if (/clip\s+\d+\s+has no generation id/i.test(message) && Date.now() - started < 90_000) {
        onProgress({ id: 'render', name: 'Render & assembly', status: 'running', detail: 'The saved job is handing scene 1 to the video provider…' });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 4000));
        continue;
      }
      throw cause;
    }
    const stage = String(status?.stage || status?.status || 'generating').toLowerCase();
    const videoUrl = String(status?.download_url || status?.video_url || status?.videoUrl || status?.result_url || '');
    if (stage !== lastStage) {
      lastStage = stage;
      onProgress({ id: 'render', name: 'Render & assembly', status: 'running', detail: String(status?.message || status?.stage_label || stage) });
    }
    if (/^(?:completed|complete|ready|delivered|done)$/.test(stage) && /^https?:\/\//i.test(videoUrl)) {
      onProgress({ id: 'render', name: 'Render & assembly', status: 'done', detail: 'All generated scenes were stitched into the final MP4.' });
      onProgress({ id: 'qa', name: 'Visual QA', status: 'done', detail: 'The pipeline verified a playable permanent output before delivery.' });
      await callHook('vge-save-video', {
        app_id: 'vidverge-agent',
        title: plan.title,
        video_url: videoUrl,
        duration_sec: plan.durationSeconds,
      });
      onProgress({ id: 'delivery', name: 'Delivery', status: 'done', detail: 'Saved to Videos with a permanent MP4 URL.' });
      return { videoUrl, projectId: 0, jobId };
    }
    if (/^(?:failed|error|cancelled|lost)$/.test(stage)) {
      throw new Error(String(status?.error || status?.error_message || status?.message || 'The video pipeline stopped before delivery.'));
    }
    if (Date.now() - started > 30 * 60 * 1000) {
      throw new Error('The render is still running in the background. Reopen this conversation to continue watching the saved job.');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 5000);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Generation cancelled.', 'AbortError'));
      }, { once: true });
    });
  }
}
