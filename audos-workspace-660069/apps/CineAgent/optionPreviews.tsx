import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'framing/cover': 'https://storage.googleapis.com/audos-images/chat-attachments/99f13bb0-0909-43c0-985c-4c58d96ba4d2.jpg',
  'framing/fit': 'https://storage.googleapis.com/audos-images/chat-attachments/75457b9b-48d6-40b3-b2fc-bf2552423882.jpg',
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

export const PREFS_HELPER = 'Optional: set these before you upload to steer the AI director. Leave the defaults and it decides captions, music, framing and motion.';

export const CAPTIONS_NOTES: Record<string, string> = {
  auto: 'Adds captions when there is speech; the director picks the caption style.',
  on: 'Always burns word-timed captions into the video, built from the transcript.',
  off: 'No captions; the video keeps a clean frame.',
};

export const MUSIC_NOTES: Record<string, string> = {
  auto: 'The director adds a fitting score unless the original sound should stand alone.',
  on: 'Always adds a generated underscore that dips under speech.',
  off: 'No added music; only your footage’s original audio.',
};

export const FRAMING_NOTES: Record<string, string> = {
  auto: 'The director picks fit or cover for your footage.',
  fit: 'Shows the whole shot, uncropped, with blurred fill around non-widescreen footage.',
  cover: 'Crops in to fill the whole frame edge to edge, with no bars or blurred sides.',
};

export const MOTION_NOTES: Record<string, string> = {
  subtle: 'Few, restrained graphics and gentle transitions, mostly clean footage.',
  balanced: 'Graphics only where they help, with breathing room between them.',
  expressive: 'Bolder, more frequent animated titles, callouts and punchier transitions.',
};

export const FRAMING_PREVIEWS: Record<string, string | undefined> = {
  fit: previewFor('framing', 'fit'),
  cover: previewFor('framing', 'cover'),
};
