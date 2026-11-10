import React, { useState } from 'react';

// Generated once with gpt-image-2 by the option-preview-seed server function (vv_option_previews).
// 640px JPEG thumbnails; a missing or broken image falls back to the original text-only card.
export const OPTION_PREVIEWS: Record<string, string> = {
  'ad-format/16:9': 'https://storage.googleapis.com/audos-images/chat-attachments/4d51c61e-7e03-441c-b001-6b8499669344.jpg',
  'ad-format/1:1': 'https://storage.googleapis.com/audos-images/chat-attachments/cb33bf62-8596-454e-b054-9c4c07a62193.jpg',
  'ad-format/9:16': 'https://storage.googleapis.com/audos-images/chat-attachments/a5456f99-e58a-418d-80e4-33385c3365fc.jpg',
  'production-path/multi-shot': 'https://storage.googleapis.com/audos-images/chat-attachments/3bd49bab-4e6c-4cad-ac91-203194fe0277.jpg',
  'production-path/recipes': 'https://storage.googleapis.com/audos-images/chat-attachments/37a24b18-2055-4e7d-a10b-ad0a588f4fe5.jpg',
  'production-path/ugc': 'https://storage.googleapis.com/audos-images/chat-attachments/411c1229-6c4c-4fae-9c89-badbc9773712.jpg',
  'production-path/workflow': 'https://storage.googleapis.com/audos-images/chat-attachments/50f52be1-45b5-4396-9190-f714de3afc8b.jpg',
  'visual-style/Bold': 'https://storage.googleapis.com/audos-images/chat-attachments/bf5f7e17-f5bd-47b7-ab9a-c8a354ebde49.jpg',
  'visual-style/Brand': 'https://storage.googleapis.com/audos-images/chat-attachments/c9e8d1e6-87fe-4163-9afe-e5ccb84b9b96.jpg',
  'visual-style/Cinematic': 'https://storage.googleapis.com/audos-images/chat-attachments/609081be-8321-4e52-aef1-19d90c2a1ebe.jpg',
  'visual-style/Minimal': 'https://storage.googleapis.com/audos-images/chat-attachments/18266dda-fc7c-4bbc-b3e3-13e8096adfe7.jpg',
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

// ---------------------------------------------------------------------------
// Step 1 - Ad format
// ---------------------------------------------------------------------------

export const AD_FORMAT_HELPER = 'Pick the shape of your ad. It sets the frame for every clip, generated asset and the final MP4.';

export const AD_FORMAT_RATIOS: Record<string, string> = {
  '9:16': '9 / 16',
  '1:1': '1 / 1',
  '16:9': '16 / 9',
};

export const AD_FORMAT_NOTES: Record<string, string> = {
  '9:16': 'Tall, full-screen vertical video for Reels, TikTok and Shorts.',
  '1:1': 'Square video that fills the feed on Instagram and Facebook.',
  '16:9': 'Wide landscape video for YouTube, websites and desktop.',
};

// ---------------------------------------------------------------------------
// Step 4 - Choose how to make this ad
// ---------------------------------------------------------------------------

export const PRODUCTION_PATH_HELPER = 'Choose how this ad gets made. It decides who appears on screen, how many shots it has and which tool films it.';

export const PRODUCTION_PATH_NOTES: Record<string, string> = {
  ugc: 'A creator-style presenter shows and talks about your product, selfie-video feel.',
  'multi-shot': 'A short story cut from 3–5 different shots of your product.',
  recipes: 'Ready-made templates: product ads, product swaps, localized ads and campaign imagery.',
  workflow: 'Full control: edit the script, plan each scene, film clips and review before assembly.',
};

// ---------------------------------------------------------------------------
// Recipes - Angle & script pre-step
// ---------------------------------------------------------------------------

export const VISUAL_STYLE_HELPER = 'Pick the look for every shot. The style is added to each clip, so the whole ad feels consistent.';

export const TONE_NOTES: Record<string, string> = {
  Professional: 'Clear, credible, businesslike delivery.',
  Playful: 'Light, witty, friendly copy.',
  Urgent: 'Fast, action-driven copy with a reason to act now.',
  Emotional: 'Warm, story-led copy that connects on feelings.',
};

// ---------------------------------------------------------------------------
// Strategize - content types (keyed by ContentSelection id) and angle types
// ---------------------------------------------------------------------------

export const CONTENT_TYPE_NOTES: Record<string, string> = {
  'video-ugc': 'Creator-style video where a presenter shows and talks about the product.',
  'video-talking-head-seedance-2-5': 'A presenter speaks straight to camera, rendered on Seedance 2.5.',
  'video-cinematic': 'Film-like hero video with rich lighting and camera moves.',
  'video-saas-launch': 'Software launch video: product screens, key features, clear CTA.',
  'video-demo': 'Shows the product in use, step by step.',
  'video-competitive-differentiation': 'Explains why you beat the alternatives; claims need review.',
  'video-explainer': 'Simple walkthrough of what it is and how it works.',
  'video-motion-graphics': 'Animated shapes, icons and type instead of live footage.',
  'video-social-short': 'Fast vertical short for Reels, TikTok and Shorts.',
  'video-custom': 'Blend: cinematic opening, product demo, talking-head close.',
  'image-single-image-ad': 'One static ad image; headline and CTA are added on top.',
  'image-carousel': 'A swipeable set of images telling one story.',
  'image-product-visual': 'Clean hero image of the product itself.',
  'image-feature-highlight-post': 'A 4:5 post spotlighting one feature or benefit.',
  'image-campaign-variation': 'Alternate versions of the ad image for testing.',
  'marketing-product-article': 'Long-form article about the product.',
  'marketing-educational-article': 'Teaches a topic your audience cares about, with the product as support.',
  'marketing-product-comparison': 'Side-by-side comparison with alternatives; claims need review.',
  'marketing-feature-explanation': 'Deep dive into how one feature works and why it matters.',
  'marketing-industry-article': 'Thought-leadership piece on trends in your market.',
  'marketing-faq': 'Answers to the questions buyers ask most.',
  'marketing-seo-landing-copy': 'Search-optimized copy for a landing page.',
  'marketing-answer-oriented-ai-search-content': 'Direct, quotable answers written for AI search assistants.',
  'marketing-captions': 'Ready-to-post social captions.',
  'marketing-headlines-ctas': 'Alternative headlines and calls to action.',
};

export const ANGLE_TYPE_NOTES: Record<string, string> = {
  'Problem > Solution': 'Name the problem, then show the product solving it.',
  'Before > After': 'Contrast life before and after using the product.',
  'Product Demo': 'Let the product prove itself on screen.',
  'Competitive Differentiation': 'Show what sets you apart from rivals.',
  Explainer: 'Explain simply what it is and how it works.',
  'Founder Story': 'The founder shares why they built it.',
  'UGC-style': 'Feels like a creator’s post, never shown as a real testimonial.',
  Cinematic: 'Premium, film-like storytelling around the brand.',
  'SaaS Launch': 'Announce a software product or feature launch.',
  'Curiosity Hook': 'Open a question the viewer wants answered.',
  'Feature Highlight': 'Spotlight one standout feature.',
  'Customer Pain Point': 'Lead with a specific frustration your buyer has.',
  'Social Trend Adaptation': 'Adapt a current social format to your brand.',
  'Benefit-focused': 'Lead with the outcome the buyer gets.',
};
