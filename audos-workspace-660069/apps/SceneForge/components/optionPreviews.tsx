import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'format/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/fa1a5d15-4e86-45a8-b82e-a298c028e3ea.jpg',
  'format/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/52406e63-0d19-478f-8eb0-9b7ffc8f78e9.jpg',
  'edit-type/standard': 'https://storage.googleapis.com/audos-images/chat-attachments/7dfde093-289f-4dca-ac69-fb9b4b5bb975.jpg',
  'edit-type/remotion-motion-graphics-edit': 'https://storage.googleapis.com/audos-images/chat-attachments/1be332c4-806c-456f-81b5-d704f0905d26.jpg',
  'cutaways/auto': 'https://storage.googleapis.com/audos-images/chat-attachments/4e4f7fe2-5db1-482c-b76e-4083d3c3a88f.jpg',
  'cutaways/light': 'https://storage.googleapis.com/audos-images/chat-attachments/a9fe84d5-6ec7-48da-b346-9f38199441d2.jpg',
  'cutaways/rich': 'https://storage.googleapis.com/audos-images/chat-attachments/b7f92582-200d-4b0f-881b-ef7bf8ce4201.jpg',
  'cutaways/none': 'https://storage.googleapis.com/audos-images/chat-attachments/ef96be0b-cd94-42bf-9cd0-653c8cef4cd5.jpg',
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

/** One-line descriptions for caption languages, keyed by CaptionLanguage id. */
export const CAPTION_LANGUAGE_NOTES: Record<string, string> = {
  hinglish: 'Roman-script Hindi mixed with English, kept exactly as written.',
  hindi: 'Captions in Hindi, written in Devanagari script.',
  english: 'Captions in English.',
};

export const HELPER_TEXT = {
  format: 'Choose the shape of your finished video. The editor designs the layout for it, and you get one MP4 in this format.',
  editType: 'Choose how the editor treats graphics. Standard balances avatar and visuals; Motion-graphics makes a bolder, word-timed design.',
  cutaways: 'Choose how often the video cuts away from your presenter to generated images and b-roll clips.',
  captionLanguage: 'Pick the language captions are written in. Words come from your script; timing comes from the voice track.',
  voice: 'Pick the ElevenLabs voice that reads your script. Press play to hear a sample before you choose.',
  avatar: 'Pick the presenter who speaks your script. Open a presenter to see all their looks; hover a look to preview it.',
} as const;
