import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'format/presenter': 'https://storage.googleapis.com/audos-images/chat-attachments/99d50767-dd17-479a-bdc7-1a2f07d5e34d.jpg',
  'format/faceless': 'https://storage.googleapis.com/audos-images/chat-attachments/6fb1135a-2e7e-42e5-aa36-239a435f595a.jpg',
  'format/cinematic': 'https://storage.googleapis.com/audos-images/chat-attachments/4a5a84c5-ba1e-4473-a9aa-a7c1df81fafe.jpg',
  'studio/ugc-studio': 'https://storage.googleapis.com/audos-images/chat-attachments/877cdb98-318c-46d9-aa18-3d09ce3168f7.jpg',
  'studio/ads-studio': 'https://storage.googleapis.com/audos-images/chat-attachments/8c938a06-d185-43fc-a47b-2c3a1ffd770b.jpg',
  'studio/video-enhancer': 'https://storage.googleapis.com/audos-images/chat-attachments/10059cb2-efe2-460d-8713-2a0bad98c266.jpg',
  'studio/cineagent': 'https://storage.googleapis.com/audos-images/chat-attachments/0257db0a-3e02-4623-bd0d-c9150df0692a.jpg',
  'aspect/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/ba965764-401f-4d4a-8c4b-b425591d7eeb.jpg',
  'aspect/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/0c2f5481-f272-46c6-9886-341a101b2fca.jpg',
  'aspect/1:1': 'https://storage.googleapis.com/audos-images/chat-attachments/4f7ca4b0-3f23-4b6b-8bd3-9c66599710ac.jpg',
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

export interface QuestionPreview {
  thumb?: string;
  note: string;
  ratio?: string;
}

/** Keyed by the exact option values Verger's questions use (format choice, studio ids, aspect ratios). */
export const QUESTION_PREVIEWS: Record<string, QuestionPreview> = {
  presenter: { thumb: previewFor('format', 'presenter'), note: 'A presenter or avatar speaks to camera and explains your message.', ratio: '16 / 9' },
  faceless: { thumb: previewFor('format', 'faceless'), note: 'A voiceover tells the story over visuals — no one appears on camera.', ratio: '16 / 9' },
  cinematic: { thumb: previewFor('format', 'cinematic'), note: 'A scripted, multi-scene film with consistent characters and shots.', ratio: '16 / 9' },
  sceneforge: { thumb: previewFor('format', 'presenter'), note: 'A presenter or avatar delivers your script on camera with a matching voice.', ratio: '16 / 9' },
  'script-to-video': { thumb: previewFor('format', 'cinematic'), note: 'Turns your idea or script into a multi-scene film, including 30s ads.', ratio: '16 / 9' },
  'ugc-studio': { thumb: previewFor('studio', 'ugc-studio'), note: 'A creator-style ad where a regional creator shows off your product.', ratio: '16 / 9' },
  'ads-studio': { thumb: previewFor('studio', 'ads-studio'), note: 'Researches competitor ads and turns findings into original ad concepts.', ratio: '16 / 9' },
  'video-enhancer': { thumb: previewFor('studio', 'video-enhancer'), note: 'Cut, caption, reframe and polish a video you already have.', ratio: '16 / 9' },
  cineagent: { thumb: previewFor('studio', 'cineagent'), note: 'Upload raw footage and Verger’s editor decides the cut for you.', ratio: '16 / 9' },
  'brand-context': { note: 'Save your brand details from your website before making a video.' },
  '16:9': { thumb: previewFor('aspect', '16:9'), note: 'Wide frame for YouTube, websites and presentations.', ratio: '16 / 9' },
  '9:16': { thumb: previewFor('aspect', '9:16'), note: 'Tall frame for Reels, Shorts and TikTok on phones.', ratio: '9 / 16' },
  '1:1': { thumb: previewFor('aspect', '1:1'), note: 'Square frame for feed posts.', ratio: '1 / 1' },
};

/** Preview for a question option, by value then label; undefined for free-form options. */
export function questionPreview(option: { value?: string; label?: string }): QuestionPreview | undefined {
  for (const raw of [option.value, option.label]) {
    const key = String(raw || '').trim().toLowerCase();
    if (key && Object.prototype.hasOwnProperty.call(QUESTION_PREVIEWS, key)) return QUESTION_PREVIEWS[key];
  }
  return undefined;
}

export const MODE_HELPER = 'Choose how hands-on you want to be: review each studio yourself (Copilot) or let Verger make the whole video within a budget (Autopilot).';
