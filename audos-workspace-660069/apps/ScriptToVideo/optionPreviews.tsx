import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'look/2d-animation': 'https://storage.googleapis.com/audos-images/chat-attachments/fb808711-6777-4ad3-9f6f-3341f2ec6cbf.jpg',
  'look/3d-animation': 'https://storage.googleapis.com/audos-images/chat-attachments/53d474a5-5dce-4e1b-9332-5b733b9fa447.jpg',
  'look/anime': 'https://storage.googleapis.com/audos-images/chat-attachments/6ca76b02-4b37-4afe-af62-0329fc4c1320.jpg',
  'look/cinematic-live-action': 'https://storage.googleapis.com/audos-images/chat-attachments/f52c9e69-ae72-4e81-8310-8063779c4f8e.jpg',
  'look/documentary-natural': 'https://storage.googleapis.com/audos-images/chat-attachments/9b57d352-561b-4edf-8ffd-b0b79655f149.jpg',
  'look/hand-drawn-sketch': 'https://storage.googleapis.com/audos-images/chat-attachments/ce679777-88b9-4cda-bbf2-08af48118e6a.jpg',
  'look/motion-graphics': 'https://storage.googleapis.com/audos-images/chat-attachments/f05149c8-f449-453f-86df-c223179c25f2.jpg',
  'look/photoreal-commercial': 'https://storage.googleapis.com/audos-images/chat-attachments/80aaca6d-d631-405e-a41b-3c6053d27f43.jpg',
  'shape/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/ea311a5f-6299-413d-ac4f-ba3fb9285d5e.jpg',
  'shape/1:1': 'https://storage.googleapis.com/audos-images/chat-attachments/88788325-4792-4fd8-b503-7b3c88735473.jpg',
  'shape/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/321a1dd3-7a45-41b8-86f6-9e4189970d59.jpg',
};

export function previewFor(picker: string, id: string): string | undefined {
  return OPTION_PREVIEWS[`${picker}/${id}`];
}

export function OptionThumb({ src, ratio = '16 / 9', fallback = null, style }: { src?: string; ratio?: string; fallback?: React.ReactNode; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      style={{ display: 'block', width: '100%', aspectRatio: ratio, objectFit: 'cover', borderRadius: 8, ...style }}
    />
  );
}

export const PICKER_HELP = {
  look: 'Pick the visual style for every clip. It sets the look, lighting and texture the video model aims for.',
  shape: 'Choose the frame shape. Every clip and the final video use it, so pick where the film will be posted.',
  length: 'How long the finished film runs. Pick a preset, or Custom for any length up to 10 minutes.',
  sound: 'Choose how the film sounds: characters talking on camera, one narrator, or music only.',
  model: 'Auto uses the recommended model. Choose lets you pick one; models differ in clip length, sound and references.',
  voiceSource: 'Choose who narrates the film. Changing the voice re-records only the narration; your clips stay as they are.',
  captions: 'Pick how burned-in captions look. Choosing a style also turns captions on.',
  transition: 'Choose how one clip moves to the next: a straight cut or a short soft fade.',
} as const;

export const LOOK_NOTES: Record<string, string> = {
  'cinematic-live-action': 'Filmic live action with natural acting, motivated camera and rich contrast.',
  'photoreal-commercial': 'Polished, photoreal ad look with crisp product lighting and smooth moves.',
  '3d-animation': 'High-end stylized 3D animation with dimensional light and rich materials.',
  '2d-animation': 'Clean 2D animation with graphic shapes, bold lines and consistent colour.',
  anime: 'Cinematic anime with expressive characters, clean linework and dramatic light.',
  'hand-drawn-sketch': 'Pencil-and-ink sketch animation with tactile, slightly imperfect lines.',
  'motion-graphics': 'Bold geometric motion graphics with kinetic shapes and clear hierarchy.',
  'documentary-natural': 'Observational documentary feel: available light, natural camera, real detail.',
  'comic-graphic-novel': 'Graphic-novel panels in motion with bold inks and halftone texture.',
  'watercolor-painterly': 'Soft watercolour illustration with visible pigment and gentle motion.',
};

export const SHAPE_NOTES: Record<string, string> = {
  '9:16': 'Tall vertical — best for TikTok, Reels and Shorts.',
  '16:9': 'Wide landscape — best for YouTube, websites and presentations.',
  '1:1': 'Square — works well in social feeds and ads.',
};

export const FILM_TYPE_NOTES: Record<string, string> = {
  ad: 'A short promotional film that sells a product or offer.',
  story: 'A narrative film with characters and a beginning, middle and end.',
  explainer: 'Explains how something works or why it matters, step by step.',
  ugc: 'Creator-style video that feels like a real customer talking.',
  launch: 'Announces a new product or feature with a punchy reveal.',
};

export const TONE_NOTES: Record<string, string> = {
  Warm: 'Friendly and human — reassuring, approachable writing.',
  Bold: 'Confident and punchy — strong lines, no hedging.',
  Playful: 'Light and fun — humour and energy.',
  Cinematic: 'Dramatic and evocative — big moments and vivid imagery.',
  Direct: 'Plain and to the point — no fluff.',
};

export const LANGUAGE_NOTES: Record<string, string> = {
  English: 'The script and spoken lines are written in English.',
  Hinglish: 'A conversational mix of Hindi and English.',
  Hindi: 'The script and spoken lines are written in Hindi.',
  Spanish: 'The script and spoken lines are written in Spanish.',
  French: 'The script and spoken lines are written in French.',
};

export const MUSIC_NOTES: Record<string, string> = {
  corporate: 'Clean, professional background for business videos.',
  tech: 'Modern electronic pulse for product and tech videos.',
  uplifting: 'Positive, rising music that builds optimism.',
  calm: 'Gentle, relaxed bed that stays out of the way.',
  energetic: 'Driving, high-energy beat for fast edits.',
  playful: 'Light, bouncy music for fun or casual videos.',
  cinematic: 'Big, emotional score for dramatic films.',
  lofi: 'Laid-back lo-fi beats with a warm, cosy feel.',
};

export const CAPTION_NOTES: Record<string, string> = {
  'bold-pop': 'Big, bold captions that pop on screen.',
  clean: 'Simple, understated subtitles.',
  karaoke: 'Highlights each word as it is spoken.',
};

export const TRANSITION_NOTES: Record<string, string> = {
  cut: 'Jumps straight to the next clip.',
  soft: 'Briefly fades between clips for a gentler change.',
};
