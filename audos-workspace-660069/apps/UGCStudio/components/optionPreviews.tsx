import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'format/before-after': 'https://storage.googleapis.com/audos-images/chat-attachments/40270b12-33f8-463e-9279-908d3a39acdd.jpg',
  'format/demo': 'https://storage.googleapis.com/audos-images/chat-attachments/0d138d7f-0cf7-4727-bde8-54ba4243acef.jpg',
  'format/problem-solution': 'https://storage.googleapis.com/audos-images/chat-attachments/19f7d483-d947-4bb0-871a-6690315d6d12.jpg',
  'format/talking-camera': 'https://storage.googleapis.com/audos-images/chat-attachments/cdca2cc4-41e8-469f-a7b9-c458f04b404b.jpg',
  'format/unboxing': 'https://storage.googleapis.com/audos-images/chat-attachments/263c374a-6863-4461-8f38-bc8ac959a594.jpg',
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

export const FORMAT_NOTES: Record<string, string> = {
  'talking-camera': 'Actor speaks straight to the lens about the product, selfie-style.',
  demo: 'Actor shows the product in use, step by step, hands-on.',
  unboxing: 'Actor opens the package and reveals the product for the first time.',
  'before-after': 'Shows the situation before the product, then the improved after.',
  'problem-solution': 'Opens on a relatable problem, then presents the product as the fix.',
};

export const MODE_NOTES: Record<string, string> = {
  'actor-speaks': 'The actor says each line on camera.',
  voiceover: 'The actor acts silently; a narrator voice reads the lines.',
};

export const LANGUAGE_NOTES: Record<string, string> = {
  'hi-Latn': 'Everyday Hindi-English mix written in Roman letters.',
  'hi-Deva': 'Natural Hindi; script lines are written in Devanagari.',
  'en-IN': 'English with natural Indian phrasing and delivery.',
};

export const HELPER = {
  actor: 'Pick the synthetic presenter who appears in every clip. Their look, age and persona shape the whole ad.',
  format: 'Choose how the ad is structured. The format steers the script plan and what your actor does in each clip.',
  length: 'Up to 15s is one clip, up to 23s two, longer three. Length also sets how many words fit and the price.',
};
