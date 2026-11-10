// Plain-English one-liners for the model picker, keyed by the exact LAB_MODELS keys in ./labModels.ts.
// A key missing here simply shows no note; the picker itself is unaffected.
export const MODEL_NOTES: Record<string, string> = {
  'groupa:openrouter/bytedance/seedance-2.0-fast': 'Quick ByteDance clips, 4–15s, from text or one start frame, with optional audio.',
  'groupa:openrouter/bytedance/seedance-2.5': 'Longer ByteDance clips up to 30s; start/end frames or up to 3 reference images.',
  'groupa:gemini-omni-1.1-flash': 'Google’s flagship: 3–8s 720p clips, up to 10 references, frame control, video edits.',
  'groupa:openrouter/google/veo-3.1': 'Google Veo 3.1: 4/6/8s clips up to 4K from text or a start frame, optional audio.',
  'groupa:openrouter/google/veo-3.1-fast': 'Faster Veo 3.1: 4/6/8s clips up to 4K from text or a start frame, optional audio.',
  'groupa:openrouter/google/veo-3.1-lite': 'Lightweight Veo 3.1: 4/6/8s clips at 720p or 1080p from text or a start frame.',
  'runway:gen4.5': 'Runway’s current model: 2–10s silent clips from text or one start frame.',
  'runway:gen4_turbo': 'Runway image-to-video: turns one required start image into a 2–10s silent clip.',
  'kling:kling-2.5-turbo': 'Kling 2.5 Turbo: 5/10s silent clips; first+last frames need Pro mode.',
  'kling:kling-2.6': 'Kling 2.6: 5/10s silent clips at 720p/1080p; first+last frames in Pro mode.',
  'kling:kling-3.0': 'Kling 3.0: 5/10s silent single-shot clips with a start frame or first+last frames.',
  'kling:kling-3.0-omni': 'Kling 3.0 Omni: 5/10s silent clips from text, a start frame or first+last frames.',
  'kling-multi:kling-3.0-omni': 'Builds a 5/10s Kling clip from 2–4 reference images you attach.',
  'kling-extend': 'Tool: adds about 4–5s to an older Kling V1.x clip, using its task ID.',
  'kling-lipsync': 'Tool: lip-syncs a finished Kling clip to text or a public audio URL.',
};

export const MODEL_PICKER_HELP = 'Pick the video model that renders your clip. It decides length, frame shapes, resolution, what you can attach, and cost.';
