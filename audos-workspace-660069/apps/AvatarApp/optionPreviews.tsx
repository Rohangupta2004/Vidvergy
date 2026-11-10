import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'format/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/02ac003b-4328-4997-b2bf-69e112d48a44.jpg',
  'format/1:1': 'https://storage.googleapis.com/audos-images/chat-attachments/fa4e2134-93a5-4d1e-b343-305885612a2f.jpg',
  'format/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/350c40da-93a9-4dd2-b19c-1f51c85287eb.jpg',
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

export const HELPER = {
  mode: 'Choose how HeyGen builds your video. This decides which inputs appear below and how the estimate is worked out.',
  look: 'Choose who presents: pick a HeyGen look or paste its ID. It sets the face, outfit and default voice.',
  voice: 'Choose the voice that reads your script, or leave it empty to use the look’s default voice.',
};

export const FORMAT_NOTES: Record<string, string> = {
  '9:16': 'Vertical 1080×1920 for TikTok, Reels and Shorts.',
  '1:1': 'Square 1080×1080 for social feeds (Cinematic and Video Agent render it wide).',
  '16:9': 'Widescreen 1920×1080 for YouTube, websites and presentations.',
};

export const EXPORT_FORMAT_NOTES: Record<string, string> = {
  '9:16': 'Vertical 1080×1920 finish for TikTok, Reels and Shorts.',
  '1:1': 'Square 1080×1080 finish for social feeds.',
  '16:9': 'Widescreen 1920×1080 finish for YouTube and websites.',
};

export const MODE_NOTES: Record<string, string> = {
  avatar: 'An avatar look reads your script with a chosen or default voice.',
  image: 'Turns a photo from a public URL into a talking video.',
  audio: 'Lip-syncs an avatar look to your own audio file.',
  cinematic: 'A 5–15s cinematic shot of up to 3 looks, directed by your prompt.',
  transparent: 'Avatar with no background (WebM) for compositing in HyperFrames.',
  'video-agent': 'HeyGen’s agent plans and produces a video from one prompt.',
};

export const ENGINE_NOTES: Record<string, string> = {
  avatar_iii: 'Earlier HeyGen avatar engine, used when the look supports it.',
  avatar_iv: 'HeyGen’s Avatar IV engine — the default here, with natural lip-sync.',
  avatar_v: 'Newest HeyGen avatar engine, used when the look supports it.',
};

export const TRANSLATE_MODE_NOTES: Record<string, string> = {
  speed: 'Fastest turnaround for translated and dubbed videos.',
  precision: 'Higher-quality lip-sync, with an optional proofread before the final render.',
};

export const BATCH_TYPE_NOTES: Record<string, string> = {
  videos: 'Many avatar videos at once, e.g. a series or ad variants with different scripts.',
  translations: 'Translate and dub many source videos in one job.',
  lipsyncs: 'Lip-sync many videos to new audio tracks in one job.',
};

export const AUDIO_TYPE_NOTES: Record<string, string> = {
  music: 'Music beds to play under your presenter video.',
  sound_effects: 'Short sound effects like whooshes, clicks and hits for edits.',
};
