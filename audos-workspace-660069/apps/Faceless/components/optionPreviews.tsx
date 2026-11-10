import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'format/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/3c2fa51b-37ec-485b-ae62-a5ad888e04ba.jpg',
  'format/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/155e5b44-5979-427d-b2ec-89ff86e7ff8d.jpg',
  'mode/business': 'https://storage.googleapis.com/audos-images/chat-attachments/d08c4d5c-a7df-420e-885e-dd06c5756b9a.jpg',
  'mode/documentary': 'https://storage.googleapis.com/audos-images/chat-attachments/bc6e7b9c-d98b-47c6-b3e7-f0c5aeb72cdc.jpg',
  'mode/educational': 'https://storage.googleapis.com/audos-images/chat-attachments/f0cac643-65c2-4958-b885-3640cad25f2f.jpg',
  'mode/explainer': 'https://storage.googleapis.com/audos-images/chat-attachments/1be2a5b7-dcde-4901-8e0e-4c3058c14dc7.jpg',
  'mode/news': 'https://storage.googleapis.com/audos-images/chat-attachments/e7f4e3f0-cd37-422b-b33a-2fa07cc6da8f.jpg',
  'mode/story': 'https://storage.googleapis.com/audos-images/chat-attachments/c02150f9-9aff-4c7d-8333-dc92733c0165.jpg',
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

export const MODE_HELP = 'Pick the kind of film. It shapes the narration\'s tone and structure, the storyboard\'s look and the music feel.';

export const MODE_NOTES: Record<string, string> = {
  documentary: 'Fact-driven narration over cinematic, real-world imagery.',
  explainer: 'Breaks one idea down step by step with clear, simple visuals.',
  news: 'Punchy, timely report style with an urgent, energetic pace.',
  business: 'Polished, professional tone for companies, markets and products.',
  story: 'A narrative with a hook, build and payoff, told with cinematic mood.',
  educational: 'Teaches a topic clearly, like a short lesson for learners.',
};

export const DURATION_NOTES: Record<number, string> = {
  30: 'Quick hook and payoff: around 80 words of narration.',
  60: 'Standard short: around 135 words of narration.',
  90: 'Room to develop a point: around 200 words of narration.',
  120: 'The fullest story: around 270 words of narration and more scenes.',
};

export const FORMAT_HELP = 'Choose the frame shape. Portrait suits Reels, TikTok and Shorts; landscape suits YouTube and the web.';

export const FORMAT_NOTES: Record<string, string> = {
  '9:16': 'Vertical 9:16 for Reels, TikTok and Shorts.',
  '16:9': 'Widescreen 16:9 for YouTube, website embeds and the web.',
};

export const VOICE_HELP = 'Pick the narrator. Play a preview to hear a voice; the one you choose reads the whole script.';

export const AUDIO_HELP = 'Captions highlight each spoken word; music adds a generated bed plus a soft whoosh on scene cuts.';
