import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'agent-look/cinematic': 'https://storage.googleapis.com/audos-images/chat-attachments/a9990766-f627-43dc-a954-81d917efc81d.jpg',
  'agent-look/product-pop': 'https://storage.googleapis.com/audos-images/chat-attachments/6ca0a702-36dd-4155-82db-5c2a5c3fc474.jpg',
  'agent-look/social-vertical': 'https://storage.googleapis.com/audos-images/chat-attachments/ca51bf67-4a77-4e2d-b32d-5e585d0d0229.jpg',
  'agent-look/talking-head': 'https://storage.googleapis.com/audos-images/chat-attachments/34309807-521e-4c26-97ed-3c80d0580a7f.jpg',
  'look/bw': 'https://storage.googleapis.com/audos-images/chat-attachments/551325c9-d26d-4a36-8f38-0a90272d2955.jpg',
  'look/cinematic': 'https://storage.googleapis.com/audos-images/chat-attachments/0b5b4992-f998-4081-a09f-9dae4f814174.jpg',
  'look/cool': 'https://storage.googleapis.com/audos-images/chat-attachments/036e97cb-962f-41e5-8255-eff4db488b9f.jpg',
  'look/none': 'https://storage.googleapis.com/audos-images/chat-attachments/989b884d-0f27-4912-83ce-c56d1972d1cf.jpg',
  'look/vintage': 'https://storage.googleapis.com/audos-images/chat-attachments/f4c00a60-d698-4546-8e17-f5c4a95fa998.jpg',
  'look/warm': 'https://storage.googleapis.com/audos-images/chat-attachments/74f5c217-b583-481b-ac53-ea5ee2b7a272.jpg',
  'preset/ad': 'https://storage.googleapis.com/audos-images/chat-attachments/b8b08e50-c303-484c-a0f1-12f9fefd84ee.jpg',
  'preset/archival': 'https://storage.googleapis.com/audos-images/chat-attachments/b0e7c90a-b724-4492-ac2d-8aabce44681e.jpg',
  'preset/social': 'https://storage.googleapis.com/audos-images/chat-attachments/c53b3b5f-3ab1-4822-87f2-f83da2125477.jpg',
};

export function previewFor(picker: string, id: string): string | undefined {
  return OPTION_PREVIEWS[`${picker}/${id}`];
}

export function OptionThumb({ src, ratio = '16 / 9', fallback = null, style, onFail }: { src?: string; ratio?: string; fallback?: React.ReactNode; style?: React.CSSProperties; onFail?: () => void }) {
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
      onError={() => { setFailed(true); onFail?.(); }}
      style={{ display: 'block', width: '100%', aspectRatio: ratio, objectFit: 'cover', borderRadius: 8, ...style }}
    />
  );
}

/** Helper lines shown at each picker. */
export const AGENT_LOOKS_HELP = 'Pick a ready-made recipe. The agent adds its steps to the stack below, and you can undo any of them.';
export const ENHANCE_PRESET_HELP = 'Choose a starting point for colour and finish. Fine-tune anything below; the live preview updates instantly.';
export const ENHANCE_MODE_HELP = 'Decide how much changes on its own: measured auto-correction, only your own grade, or a clean remaster.';
export const ENHANCE_LOOK_HELP = 'Pick a colour look laid over the correction. It sets the mood of the whole clip.';

/** One-liners for the Enhance tab look chips, keyed by LookId. */
export const LOOK_NOTES: Record<string, string> = {
  none: 'No stylised look; keeps true-to-life colour after correction.',
  cinematic: 'Deeper contrast and richer colour with a filmic hue shift.',
  warm: 'Golden, cosy warmth with a touch more saturation and brightness.',
  cool: 'Crisp, cooler blue-shifted colour with clean contrast.',
  vintage: 'Faded, sepia-washed nostalgic look with softer contrast.',
  bw: 'Black and white with punchy contrast.',
};
