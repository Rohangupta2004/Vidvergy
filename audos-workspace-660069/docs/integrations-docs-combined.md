# Integrations Documentation

## Table of contents

### Video and media

- [gemini-video-understanding](#gemini-video-understanding)
- [gemini-vision-transform](#gemini-vision-transform)
- [google-veo3](#google-veo3)
- [heygen-video](#heygen-video)
- [higgsfield-media](#higgsfield-media)
- [image-and-video-generation](#image-and-video-generation)
- [kling-video](#kling-video)
- [meshy-3d](#meshy-3d)
- [remotion-rendering](#remotion-rendering)
- [rive-animation](#rive-animation)
- [runway-recipes](#runway-recipes)
- [stock-photos](#stock-photos)
- [video-clip](#video-clip)
- [video-frames](#video-frames)
- [video-overlay](#video-overlay)
- [video-stitch](#video-stitch)

### AI text and audio

- [ai-phone-calls](#ai-phone-calls)
- [anthropic-text-generation](#anthropic-text-generation)
- [audio-transcription](#audio-transcription)
- [deepgram-transcription](#deepgram-transcription)
- [document-analysis](#document-analysis)
- [elevenlabs-audio](#elevenlabs-audio)
- [openai-realtime](#openai-realtime)
- [openai-text-generation](#openai-text-generation)

### Platform and data

- [custom-api-keys](#custom-api-keys)
- [domain-registration](#domain-registration)
- [file-storage](#file-storage)
- [human-tasks](#human-tasks)
- [mcp-agent-tools](#mcp-agent-tools)
- [permalink-pages](#permalink-pages)
- [server-functions](#server-functions)
- [session-management](#session-management)
- [space-chat](#space-chat)
- [space-platform-contract](#space-platform-contract)
- [task-scheduler](#task-scheduler)
- [workspace-community](#workspace-community)
- [workspace-db](#workspace-db)

### Marketing/CRM/email

- [apollo-leads](#apollo-leads)
- [connect-meta](#connect-meta)
- [crm-tags](#crm-tags)
- [email-sequences](#email-sequences)
- [funnel-analytics](#funnel-analytics)
- [google-ads](#google-ads)
- [inbound-email](#inbound-email)
- [meta-ads](#meta-ads)
- [seo-social-previews](#seo-social-previews)
- [slack](#slack)
- [social-publishing](#social-publishing)

### Payments/commerce/web

- [alibaba-suppliers](#alibaba-suppliers)
- [printify-products](#printify-products)
- [razorpay-payments](#razorpay-payments)
- [stripe-payments](#stripe-payments)
- [web-scraping](#web-scraping)
- [web-search](#web-search)

---

## Video and media

# gemini-video-understanding

Source: integrations/gemini-video-understanding/docs.md

# Gemini Video Understanding Integration

Analyze videos with Google's Gemini API to extract insights, summarize content, answer questions, and reference specific timestamps.

## Category
AI/ML

## Required API Keys
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` (server-side only)

## API Endpoints

### 1. Analyze Video (File Upload for videos >20MB)

Upload a video file for analysis. Best for larger videos or when you need to reuse the video across multiple queries.

```
POST /api/generate/video-analysis
```

**Request (multipart/form-data):**
```
file: <video-file>
prompt: "Summarize this video and list the key topics discussed"
```

**Response:**
```json
{
  "success": true,
  "result": "This video covers three main topics: 1) Introduction to machine learning...",
  "metadata": {
    "model": "gemini-2.5-flash",
    "duration": "5:32",
    "processedAt": "2024-01-15T10:30:00Z"
  }
}
```

### 2. Analyze Video (Inline for videos <20MB)

For smaller videos, send the video data directly in the request body.

```
POST /api/generate/video-inline
```

**Request:**
```json
{
  "prompt": "What happens at the 2 minute mark?",
  "video": "<base64-encoded-video>",
  "mimeType": "video/mp4"
}
```

**Response:**
```json
{
  "success": true,
  "result": "At the 2 minute mark, the presenter demonstrates...",
  "metadata": {
    "model": "gemini-2.5-flash",
    "processedAt": "2024-01-15T10:30:00Z"
  }
}
```

### 3. Analyze YouTube Video

Analyze a YouTube video by passing its URL directly.

```
POST /api/generate/video-youtube
```

**Request:**
```json
{
  "prompt": "Create a quiz with 5 questions based on this video",
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

**Response:**
```json
{
  "success": true,
  "result": "Quiz based on the video:\n\n1. What is the main topic discussed?\na) ...",
  "metadata": {
    "model": "gemini-2.5-flash",
    "source": "youtube",
    "processedAt": "2024-01-15T10:30:00Z"
  }
}
```

## Helper Functions

```typescript
export const geminiVideo = {
  // Analyze a video file (upload method for larger files)
  async analyzeVideoFile(file: File, prompt: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prompt', prompt);
    
    const response = await fetch('/api/generate/video-analysis', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.result;
  },
  
  // Analyze a video with inline base64 data (for smaller videos <20MB)
  async analyzeVideoInline(videoBase64: string, prompt: string, mimeType = 'video/mp4') {
    const response = await fetch('/api/generate/video-inline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, video: videoBase64, mimeType })
    });
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.result;
  },
  
  // Analyze a YouTube video by URL
  async analyzeYouTube(youtubeUrl: string, prompt: string) {
    const response = await fetch('/api/generate/video-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, youtubeUrl })
    });
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.result;
  },
  
  // Helper: Convert File to base64
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  
  // Shortcut: Summarize video
  async summarize(file: File) {
    return this.analyzeVideoFile(file, 'Provide a comprehensive summary of this video. Include the main topics, key points, and any important details mentioned.');
  },
  
  // Shortcut: Extract timestamps
  async extractTimestamps(file: File) {
    return this.analyzeVideoFile(file, 'List all the key moments in this video with their timestamps. Format as: [MM:SS] - Description');
  },
  
  // Shortcut: Generate transcript
  async transcribe(file: File) {
    return this.analyzeVideoFile(file, 'Transcribe the spoken content in this video as accurately as possible.');
  },
  
  // Shortcut: Ask question about video
  async askQuestion(file: File, question: string) {
    return this.analyzeVideoFile(file, question);
  }
};
```

## Example Prompts

### Summarization
```
"Summarize this video in 3 paragraphs"
"What are the main takeaways from this video?"
```

### Q&A
```
"What product is being demonstrated?"
"Who are the speakers in this video?"
"What problem is being solved?"
```

### Timestamps
```
"At what timestamp does the presenter discuss pricing?"
"List all the topics covered with their timestamps"
"What happens between 1:30 and 2:00?"
```

### Content Extraction
```
"Extract all URLs, email addresses, or contact info mentioned"
"List all statistics or data points mentioned"
"What brands or products are shown?"
```

### Educational
```
"Create a quiz based on this video content"
"Generate study notes from this lecture"
"What concepts should I understand before watching this?"
```

## Use Cases

- **Video Summarization**: Get quick summaries of long videos
- **Content Q&A**: Ask specific questions about video content
- **Timestamp Extraction**: Find when specific topics are discussed
- **Transcription**: Get text versions of spoken content
- **Quiz Generation**: Create educational quizzes from video content
- **Video Search**: Find specific moments in videos
- **Content Moderation**: Analyze video content for compliance
- **Accessibility**: Generate descriptions for video content

## Supported Video Formats

- MP4 (video/mp4)
- WebM (video/webm)
- MOV (video/quicktime)
- AVI (video/x-msvideo)
- MKV (video/x-matroska)
- 3GP (video/3gpp)

## Technical Details

- **Max file size (inline)**: 20MB
- **Max file size (upload)**: 2GB
- **Max duration**: ~1 hour (depends on resolution)
- **Frame sampling**: ~1 FPS by default
- **Audio**: Processed alongside video for speech understanding

## Documentation
- [Gemini Video Understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Files API](https://ai.google.dev/gemini-api/docs/files)


---

# gemini-vision-transform

Source: integrations/gemini-vision-transform/docs.md

# Gemini Vision & Image Transformation

Analyze images with Gemini Vision and transform them into new styles (line art, stylization, etc.) using AI-powered image-to-image processing.

<!-- MANIFEST:INTRO -->
`POST /api/generate/image-to-image` accepts optional `aspectRatio: "3:4"`,
`"4:3"`, `"4:5"`, or `"5:4"` for exact native Gemini portrait or landscape
edits. With no `model`, the platform selects `gemini-3-pro-image`; an explicit
OpenAI edit model with any of those ratios returns
`400 unsupported_aspect_ratio`. Responses preserve the provider's MIME type and
include the actual provider/model attempt history.
Strict GPT Image 1.5 edits use `fallbackPolicy: "none"`, authenticated workspace
context, ordered labeled references (opt-in `referenceLimit: 16`), and explicit
`quality: "medium"` / `inputFidelity: "high"`. Legacy defaults stay unchanged.
<!-- MANIFEST:END -->

## API Endpoints

### Strict GPT Image 1.5 reference editing (opt-in)

Use the **existing** `POST /api/generate/image-to-image` endpoint for portraits
that require exact model/settings and more than three references:

```json
{
  "model": "gpt-image-1.5",
  "prompt": "Build the approved portrait using the numbered reference roles.",
  "images": [
    { "data": "https://example.com/base.png", "label": "BASE SCENE: preserve all people and setting" },
    { "data": "https://example.com/person.png", "label": "PERSON IDENTITY: likeness only" }
  ],
  "referenceLimit": 16,
  "inputFidelity": "high",
  "quality": "medium",
  "size": "1024x1024",
  "fallbackPolicy": "none",
  "returnBase64": true
}
```

- `referenceLimit`: integer 1–16, default **3**. No truncation. Above three is
  supported only with explicit `gpt-image-1.5` and `fallbackPolicy: "none"`.
- Explicit `quality` (`low`, `medium`, `high`) and `inputFidelity` (`low`, `high`)
  take effect only in that strict contract. Without `fallbackPolicy: "none"`,
  these fields, `referenceLimit`, and image `label` remain ignored as before:
  legacy callers keep three images, **high** quality and provider-default fidelity.
- Array order is multipart image order. Optional `label` strings produce a
  1-based prompt-to-image map; when labels are used, **every image needs one**,
  at most 4000 characters each. Combined prompt limit is 32000 characters.
  Deduplication belongs to the caller: combine roles on the retained image.
- URL inputs use guarded fetching (including redirects); PNG/JPEG/WebP bytes
  are detected, not trusted from a claimed MIME. Each input is capped at 20 MiB;
  strict edits additionally cap total decoded references at 40 MiB.
- The no-fallback contract currently supports **only GPT Image 1.5**; no
  substitution to GPT Image 1 or Gemini occurs. Unsupported options fail with
  400 before provider execution. More than the selected image limit also fails.
- Strict calls require workspace authentication: a workspace token or member
  credential, or the platform's signed server-function context. Browser
  callers present `X-Workspace-DB-Token`; server functions use
  `await platform.fetch('/api/generate/image-to-image', ...)` with no key.
  An optional body workspace ID must match the authenticated context.
- `returnBase64: true` returns `{ success, imageBase64, mimeType, metadata }`.
  Strict OpenAI output is PNG; metadata includes actual dispatched provider/model,
  attempt history, fallback policy, quality, fidelity, size, input count,
  authenticated workspace, provider request ID and provider usage when supplied.
  This edit route does **not** debit a workspace wallet or write the image usage
  ledger. Returned usage is provider evidence, not proof of wallet billing.
- Strict provider execution has a shared 180-second deadline and no SDK retry.
  Fetching references is additional time; slow hooks should set
  `metadata.timeout: 600000` (the runtime hard maximum).
- OpenAI documents up to 16 edit inputs and high fidelity for GPT Image 1.5:
  https://developers.openai.com/api/reference/typescript/resources/images/methods/edit
  A numbered role map preserves the request semantics; visual equivalence with a
  Responses image-generation tool is not established by contract tests.

### 1. Vision Analysis — Describe or analyze an image

```
POST /api/generate/vision
```

**Request:**
```json
{
  "prompt": "Describe the main subject of this image",
  "image": "<base64-encoded-image>",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "success": true,
  "result": "The image shows a sailboat on calm blue water..."
}
```

**Answer too long (HTTP 422):** one call returns at most ~8k output tokens (roughly
15,000 characters). If the answer would be longer, it is cut off and reported instead
of returned as success:

```json
{
  "success": false,
  "errorCode": "VISION_OUTPUT_TRUNCATED",
  "error": "The image has more text than one analysis can return...",
  "partialResult": "{\"words\":[{\"text\":\"Hello\", ..."
}
```

A cut-off JSON answer will not parse. For dense pages, ask for less per call (crop the
image, or skip per-word coordinates); for word-level OCR boxes, use a dedicated OCR API
such as Google Cloud Vision through the `custom-api-keys` secrets proxy.

---

### 2. Image-to-Image — Transform an image into a new style

```
POST /api/generate/image-to-image
```

**Single image request:**
```json
{
  "prompt": "Create clean line art from this image",
  "image": "<base64-encoded-image>",
  "mimeType": "image/jpeg",
  "aspectRatio": "3:4",
  "style": "clean line art, black outlines on white background"
}
```

**Multi-image request (up to 3 images):**
```json
{
  "prompt": "Blend these reference images into a single illustration",
  "images": [
    { "data": "<base64-encoded-image>", "mimeType": "image/jpeg" },
    { "data": "<base64-encoded-image>", "mimeType": "image/png" }
  ],
  "style": "watercolor illustration"
}
```

**Optional — return base64 instead of uploading to cloud storage:**

Add `"returnBase64": true` to either request format to skip the GCS upload and receive the generated image directly as base64. Useful for in-memory processing or when you want to display the result immediately without persisting it.

**Optional — request a native portrait or landscape shape:**

Set `"aspectRatio"` to `"3:4"`, `"4:3"`, `"4:5"`, or `"5:4"` (`4:5` / `5:4`
are the print-friendly 8x10 / 10x8 shapes). These values use Gemini image
editing and are forwarded unchanged; when `model` is omitted the platform
selects `gemini-3-pro-image`. An explicit OpenAI edit model with any of these
ratios returns `400 unsupported_aspect_ratio` instead of silently producing a
square — OpenAI's image models cannot render them exactly.

**Response (default — cloud storage URL):**
```json
{
  "success": true,
  "imageUrl": "https://storage.googleapis.com/...",
  "description": "Image transformed successfully",
  "metadata": {
    "model": "gemini-3-pro-image",
    "aspectRatio": "3:4",
    "style": "clean line art, black outlines on white background",
    "processedAt": "2026-03-03T00:00:00.000Z"
  }
}
```

**Response (when `returnBase64: true`):**
```json
{
  "success": true,
  "imageBase64": "<base64-encoded-result>",
  "mimeType": "image/png",
  "description": "Image transformed successfully",
  "metadata": {
    "model": "gemini-3-pro-image",
    "aspectRatio": "3:4",
    "style": "clean line art, black outlines on white background",
    "processedAt": "2026-03-03T00:00:00.000Z"
  }
}
```

---

## Helper Functions

```typescript
export const geminiVision = {
  // Analyze an image and get a text description
  async analyzeImage(imageBase64: string, prompt: string, mimeType = 'image/jpeg') {
    const response = await fetch('/api/generate/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image: imageBase64, mimeType })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.result;
  },

  // Transform a single image to a new style — returns a cloud storage URL
  async transformImage(imageBase64: string, prompt: string, style: string, mimeType = 'image/jpeg') {
    const response = await fetch('/api/generate/image-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image: imageBase64, mimeType, style })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.imageUrl;
  },

  // Transform and get result as base64 (skips cloud upload)
  async transformImageBase64(imageBase64: string, prompt: string, style: string, mimeType = 'image/jpeg') {
    const response = await fetch('/api/generate/image-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image: imageBase64, mimeType, style, returnBase64: true })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return { imageBase64: data.imageBase64, mimeType: data.mimeType };
  },

  // Blend multiple images (up to 3) — returns a cloud storage URL
  async blendImages(images: Array<{ data: string; mimeType: string }>, prompt: string, style?: string) {
    const response = await fetch('/api/generate/image-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, images, style })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.imageUrl;
  },

  // Shortcut: Convert to line art — returns a cloud storage URL
  async toLineArt(imageBase64: string, mimeType = 'image/jpeg') {
    return this.transformImage(
      imageBase64,
      'Create clean, minimalist line art from this image. Black lines on white background.',
      'clean line art, professional illustration, black outlines only',
      mimeType
    );
  },

  // Helper: Convert a File object to base64
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
};
```

---

## Use Cases

- **Line Art Conversion**: Transform photos into clean line drawings
- **Image Analysis**: Get AI-powered descriptions of image content
- **Style Transfer**: Convert images to different artistic styles
- **Multi-Image Blending**: Combine up to 3 reference images into one output
- **Content Detection**: Analyze what's in an image before processing

## Required Environment Variables

- `GOOGLE_API_KEY` — Your Google AI API key (server-side only)

## Important Notes

1. **Server-side only**: API keys are accessed on the server. Space apps call the endpoints via `fetch()`.
2. **Base64 encoding**: Images must be sent as base64-encoded strings (no `data:image/...;base64,` prefix).
3. **MIME types**: Supported types include `image/jpeg`, `image/png`, `image/webp`.
4. **Multi-image limit**: The `images[]` array supports up to 3 images.
5. **`returnBase64` vs URL**: Use `returnBase64: true` for ephemeral processing; omit it (default) to get a persistent cloud storage URL.
6. **Rate limits**: Be mindful of Google API rate limits for production use.


---

# google-veo3

Source: integrations/google-veo3/docs.md

# AI Video & Image Generation Integration

Generate AI-powered videos and images using Google Gemini Omni 1.1 Flash (video), Gemini image models, or OpenAI DALL-E 3.

<!-- MANIFEST:INTRO -->
Seedance 2.5 is an explicit video option: `openrouter/bytedance/seedance-2.5`,
4–30 integer seconds, 480p/720p, six ratios, audio, first/last frames or 3 image
references. See `image-and-video-generation/docs.md` for its wallet/auth contract.
`POST /api/generate/image` supports image ratios `1:1`, `16:9`, `9:16`,
`3:4`, `4:3`, `4:5`, and `5:4`. Exact `3:4` / `4:3` / `4:5` / `5:4` requests
use managed Gemini image generation; other ratios use the platform's
OpenAI-first fallback chain. `quality: "hd"` requests 2K output on Gemini
(`"standard"` uses 1K). An optional `model: "gpt-image-2"` opts into GPT
Image 2 for OpenAI-compatible ratios, but combining that model with `3:4`,
`4:3`, `4:5`, or `5:4` returns `400 unsupported_aspect_ratio`. Responses
report the model that actually ran and preserve the provider's image MIME type.
<!-- MANIFEST:END -->

## Category
AI/ML

## Required API Keys
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` (for Gemini video and image)
- `OPENAI_API_KEY` (for DALL-E 3)

## API Endpoints

**Generate Image (platform-managed)**
```
POST /api/generate/image
```

**Request:**
```json
{
  "prompt": "A professional headshot photo",
  "aspectRatio": "3:4",
  "quality": "standard"
}
```

Supported image ratios are `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `4:5`, and
`5:4`. The `3:4`, `4:3`, `4:5`, and `5:4` values use Gemini's native
image-ratio support so the proxy does not substitute OpenAI's nearest portrait
or landscape size (`4:5` / `5:4` are the print-friendly 8x10 / 10x8 shapes).
Set `quality: "hd"` for 2K Gemini output; `quality: "standard"` uses 1K.

**Response:**
```json
{
  "imageUrl": "https://storage.googleapis.com/..."
}
```

**Generate Video (full proxy)**
```
POST /api/veo/generate/video
```

This is the schema-validated proxy used by apps built on the platform. It accepts every option the underlying SDK supports, including the "ingredients" workflow (reference images, or a first frame plus an optional last-frame image).

**Minimal request:**
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "A cat playing with yarn",
  "aspectRatio": "16:9",
  "generateAudio": true
}
```

**Full request with reference images:**
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "A golden retriever running through a sunlit meadow, cinematic, 35mm film",
  "aspectRatio": "16:9",
  "duration": 8,
  "resolution": "720p",
  "referenceImages": [
    { "imageData": "<base64-png>", "mimeType": "image/png", "referenceType": "asset" },
    { "imageData": "<base64-png>", "mimeType": "image/png", "referenceType": "style" }
  ]
}
```

**Image-to-video with a locked last frame** (first/last-frame interpolation — the seed image is the first frame, `lastFrameImage` is the final frame, and the model interpolates the motion between them):
```json
{
  "model": "gemini-omni-1.1-flash",
  "prompt": "Camera pulls back from the subject as the scene transitions to dusk",
  "imageData": "https://storage.googleapis.com/bucket/opening-frame.png",
  "lastFrameImage": {
    "imageData": "https://storage.googleapis.com/bucket/closing-frame.png"
  }
}
```

Each `imageData` field (on the top-level seed, on `referenceImages[]`, and on `lastFrameImage`) accepts any of:

- raw base64-encoded image bytes (no `data:` prefix), or
- a `data:image/<mime>;base64,<bytes>` URL, or
- an `http(s)://` URL — the proxy downloads the image and forwards the bytes to Google.

**Response:**
```json
{
  "success": true,
  "generationId": "gen_abc123",
  "operationId": "operations/...",
  "status": "processing",
  "progress": 10,
  "estimatedDuration": "1-3 minutes",
  "message": "Video generation started. Use the operationId to check status."
}
```

**Simple proxy (defaults to `gemini-omni-1.1-flash`):**
```
POST /api/generate/video
```

```json
{
  "prompt": "A cat playing with yarn",
  "aspectRatio": "16:9",
  "generateAudio": true
}
```

**Check Video Status**
```
GET /api/veo/status/:operationId
```

**Response:**
```json
{
  "status": "completed",
  "videoUrl": "https://storage.googleapis.com/...",
  "progress": 100
}
```

## Ingredients: reference images + first/last frame

The default model, `gemini-omni-1.1-flash`, supports an "ingredients" workflow on top of the basic text-to-video and image-to-video paths. You can pass:

- `referenceImages`: up to **10** images (including `imageData`, which counts as one) that the model uses as subject/character/style references. Each entry has:
  - `imageData` — base64 / `data:` URL / `http(s)://` URL, max ~10MB decoded for inline base64.
  - `mimeType` — one of `image/png`, `image/jpeg`, `image/webp`. Optional; inferred from the data URL or `Content-Type` header when omitted, defaulting to `image/png`.
  - `referenceType` — `"asset"` (default) or `"style"`. Accepted for compatibility; all references are sent as images.
- `lastFrameImage`: a single image used as the final frame of the generated clip.
  - Same `imageData` / `mimeType` shape as a reference image.
  - Designed to be combined with `imageData` (the first frame): the model interpolates the motion between the two frames. May also be sent on its own.
- `videoData` (+ optional `videoMimeType`): a source video for editing.

**Combining rules** (enforced by the proxy — violating them returns a `400`):

- `lastFrameImage` cannot be combined with `referenceImages` — first/last-frame interpolation takes exactly a first frame (`imageData`) and a last frame.
- `imageData` + `lastFrameImage` is allowed (the canonical first/last-frame flow).
- `imageData` + `referenceImages` is allowed (seed frame plus subject references).
- `imageData` alone, `lastFrameImage` alone, and `referenceImages` alone are all allowed.

### Model support

| Model                                       | `imageData` (single seed) | `referenceImages` | `lastFrameImage` |
| ------------------------------------------- | :-----------------------: | :---------------: | :--------------: |
| `gemini-omni-1.1-flash` (default)           | ✅                        | ✅ (max 10)       | ✅               |
| `openrouter/google/veo-3.1` (and `-fast`, `-lite`) | ✅                 | ❌                | ❌               |
| `openrouter/bytedance/seedance-2.0-fast`    | ✅                        | ❌                | ❌               |
| `openrouter/bytedance/seedance-2.5` | ✅ | ✅ (3 asset images; no frames) | ✅ (requires first) |

Passing `referenceImages` or `lastFrameImage` to a model that does not support them returns a `400` from the proxy with a message naming the unsupported fields rather than silently dropping them.

> **Retired model ids:** older ids (Veo 3.1 / 3.0 / 2.0 previews, Sora 2, and the Omni Flash preview) are still accepted so existing apps keep working, but they are served by `gemini-omni-1.1-flash`. Use `gemini-omni-1.1-flash` in new code.

> **Character consistency tip:** for a recurring character/subject across multiple scene clips, send the SAME `referenceImages` with every scene request — see `integrations/image-and-video-generation/` for a full example.

### Per-request limits

- Up to **10** images per request (`imageData` + `referenceImages`).
- Each `imageData` is at most ~**10MB** decoded (`14_000_000` characters of base64 input). The proxy enforces this on every input shape (raw base64, `data:` URL, and the bytes downloaded from an `http(s)://` URL).
- Accepted mime types: `image/png`, `image/jpeg`, `image/webp`. The whitelist is enforced against the explicit `mimeType`, the type embedded in a `data:` URL, and the `Content-Type` header returned by an `http(s)://` URL.
- For URL inputs the proxy refuses to fetch from non-public ranges (loopback, link-local, RFC1918 private, CGNAT, multicast, IPv6 unique-local, the AWS metadata service, etc.) and refuses HTTP redirects. Use a public HTTPS URL or upload a `data:` / base64 payload directly.
- Exceeding any of these returns a `400` from the proxy. Schema-level violations include a Zod-style `details` array; runtime ingredient failures (mime, size, SSRF, fetch error) include `field` and `message` describing the offending input.

### Otto / agent guidance

When the user is generating a hero video, Otto can suggest:

1. Adding `referenceImages` of the brand subject, product, or character so the video stays on-model.
2. Setting a `lastFrameImage` (together with an `imageData` first frame) to lock the final frame — useful for endings that lead into a logo plate or product hero shot. Do not combine it with `referenceImages`.
3. Keeping the same `referenceImages` on every scene when the goal is a consistent character/subject across multiple scenes.

## Automated long video (multi-clip chaining + auto-stitch)

Clips are capped at ~8 seconds. To produce a video **longer than 8s** without
manually chaining clips, post an ordered list of scene prompts and let the server
generate each clip, seed the next clip with the previous clip's extracted last
frame (so motion continues seamlessly), and auto-stitch them into one MP4.

**Start a long video job**
```
POST /api/veo/generate-long-video
```

**Request:**
```json
{
  "model": "gemini-omni-1.1-flash",
  "aspectRatio": "16:9",
  "startImage": "https://storage.googleapis.com/bucket/opening-frame.png",
  "scenes": [
    { "prompt": "A drone shot rising over a misty forest at dawn" },
    { "prompt": "The camera glides forward between the treetops" },
    { "prompt": "It breaks above the canopy into golden sunrise light" }
  ]
}
```

- `scenes`: ordered list of `{ prompt, lastFrameImage? }`, **1–8** entries. Each
  clip uses the previous clip's last frame as its first frame.
- `startImage` (optional): seeds the very first clip's first frame.
- `model` (optional, defaults to `gemini-omni-1.1-flash`), `aspectRatio`
  (default `16:9`), `duration`, `resolution`, `generateAudio` (default `false`),
  `enhancePrompt` (default `true`) apply to every clip — keep them consistent.
- `lastFrameImage` is allowed on Omni or Seedance 2.5 (Seedance requires `imageData`). Other models return `400`.

**Response:**
```json
{
  "success": true,
  "jobId": "long_video_...",
  "overallStatus": "pending",
  "overallProgress": 0,
  "statusUrl": "/api/veo/status-long-video/long_video_..."
}
```

**Poll status**
```
GET /api/veo/status-long-video/:jobId
```

**Response:**
```json
{
  "jobId": "long_video_...",
  "overallStatus": "completed",
  "overallProgress": 100,
  "stitchedUrl": "https://storage.googleapis.com/.../longvideo_....mp4",
  "clipUrls": ["https://.../clip0.mp4", "https://.../clip1.mp4"],
  "clips": [ { "index": 0, "status": "completed", "videoUrl": "..." } ]
}
```

- `overallStatus`: `pending` → `processing` → `stitching` → `completed`.
  `partial` means clips rendered but stitching failed (`stitchedUrl` falls back to
  the first clip); `failed` means a clip could not be generated.
- When `completed`, `stitchedUrl` is the final long video. A single-scene job
  skips stitching and returns that clip as `stitchedUrl`.

## Installation

### Image Generation (platform-managed)
```javascript
const response = await fetch('/api/generate/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'A professional headshot photo',
    aspectRatio: '3:4', // also '1:1', '16:9', '9:16', '4:3', '4:5', or '5:4'
    quality: 'standard' // 'standard' or 'hd'
  })
});
const { imageUrl } = await response.json();
// Image is automatically uploaded to GCS!
```

### Video Generation (with reference images)
```javascript
// Start video generation
const response = await fetch('/api/veo/generate/video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemini-omni-1.1-flash',
    prompt: 'A cat playing with yarn in a sunlit kitchen, cinematic',
    aspectRatio: '16:9',
    duration: 8,
    resolution: '720p',
    referenceImages: [
      { imageData: brandSubjectBase64, referenceType: 'asset' },
      { imageData: moodBoardBase64,   referenceType: 'style' }
    ]
  })
});
const { operationId } = await response.json();

// Poll for completion
const checkStatus = async () => {
  const status = await fetch(`/api/veo/status/${operationId}`).then(r => r.json());
  if (status.status === 'completed') return status.videoUrl;
  if (status.status === 'failed') throw new Error(status.errorMessage);
  await new Promise(r => setTimeout(r, 5000));
  return checkStatus();
};
const videoUrl = await checkStatus();
```

## Use Cases
- Product mockups
- Marketing content
- Social media assets
- Video ads
- Animated explainers
- Hero images/videos
- Brand-consistent video where reference images keep the subject on-model

## Supported Aspect Ratios
- **Images**: 1:1, 16:9, 9:16, 3:4, 4:3, 4:5, 5:4
- **Videos**: 16:9, 9:16

## Documentation
- [Gemini Omni video docs](https://ai.google.dev/gemini-api/docs/omni)
- [DALL-E 3 Docs](https://platform.openai.com/docs/guides/images)


---

# heygen-video

Source: integrations/heygen-video/docs.md

# HeyGen Video Integration

Generate avatar and prompt-driven videos with HeyGen while keeping the workspace's HeyGen API key out of app code and browser bundles.

## Category
AI / Video

## Required API Keys (Platform or Workspace)

HeyGen can use the platform secret `HEYGEN_API_KEY` or a per-workspace provider credential. Do **not** paste the API key into a mini-app, workspace file, prompt, or client-side code.

- `HEYGEN_API_KEY` — platform-managed secret read by the server-side proxy
- Per-workspace encrypted credential — optional override for a specific workspace

If a workspace-specific override is needed, the workspace owner or an Audos admin sets it through the secure credential endpoint:

```
PUT /api/workspaces/:workspaceId/provider-credentials/heygen
```

Request:

```json
{
  "apiKey": "YOUR_HEYGEN_API_KEY"
}
```

Response only returns masked metadata:

```json
{
  "credential": {
    "workspaceId": "workspace-uuid",
    "provider": "heygen",
    "configured": true,
    "keyLast4": "abcd"
  }
}
```

Apps call HeyGen through the same-origin proxy. Audos injects `X-Api-Key` server-side from the workspace credential when present, otherwise from `HEYGEN_API_KEY`:

```
/api/workspaces/:workspaceId/provider-credentials/heygen/proxy/:heygenPath
```

The proxy is a transparent transport:

- It supports `GET` and `POST`.
- It forwards the path, query string, and JSON body to `https://api.heygen.com`
  without translating fields between API versions.
- It returns HeyGen's status code and response body unchanged.
- A v2 payload sent to a v3 path (or the reverse) fails with HeyGen schema
  errors such as `Extra inputs are not permitted`.

Use **v3 for new code**. HeyGen's legacy v1/v2 endpoints still pass through the
proxy, but they use different payloads and are scheduled for retirement after
October 31, 2026.

## Definitive portrait avatar request (v3)

For a 1080x1920 portrait MP4, use `aspect_ratio: "9:16"`,
`resolution: "1080p"`, and `fit: "cover"` so the avatar fills the phone.
`fit: "contain"` letterboxes a landscape talking-head onto black — do not
use it for Reels/TikTok/Shorts. `dimension` is a v2 field and is rejected by
`POST /v3/videos`.

```ts
const avatarId = "YOUR_AVATAR_LOOK_ID";
const lookResponse = await fetch(
  `/api/workspaces/${workspaceId}/provider-credentials/heygen/proxy/v3/avatars/looks/${encodeURIComponent(avatarId)}`,
).then((res) => res.json());
const supportedEngines = lookResponse.data?.supported_api_engines || lookResponse.supported_api_engines || [];
const engine = ["avatar_iv", "avatar_v", "avatar_iii"].find((candidate) =>
  supportedEngines.includes(candidate),
);
if (!engine) throw new Error("This avatar does not support a v3 video engine");

await fetch(`/api/workspaces/${workspaceId}/provider-credentials/heygen/proxy/v3/videos`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    type: "avatar",
    avatar_id: avatarId,
    engine: { type: engine },
    script: "Welcome to ReelPilot.",
    voice_id: "YOUR_VOICE_ID",
    voice_settings: { speed: 1.0 },
    resolution: "1080p",
    aspect_ratio: "9:16",
    fit: "cover",
    background: { type: "color", value: "#0f172a" },
    output_format: "mp4"
  })
});
```

---

## Endpoints

Use the proxy path exactly as below from mini-app code.

### List avatar looks and select an engine

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/avatars/looks?limit=50
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/avatars/looks/:lookId
```

The list response is:

```json
{
  "data": [
    {
      "id": "LOOK_ID",
      "default_voice_id": "VOICE_ID",
      "image_width": 1920,
      "image_height": 1080,
      "preferred_orientation": "landscape",
      "supported_api_engines": ["avatar_v", "avatar_iv", "avatar_iii"]
    }
  ],
  "has_more": true,
  "next_token": "..."
}
```

Do not invent an avatar or voice ID. Resolve both from HeyGen's live catalogs.
For v3, list or validate voices with:

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/voices?limit=100
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/voices/:voiceId
```

The v3 list returns `{ "data": [...], "has_more": boolean, "next_token": string
| null }`. Each voice has a `voice_id`. Validate the chosen ID through the
detail endpoint before creating a paid render.

The legacy v2 catalog remains available for v2 callers:

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v2/voices
```

### Create a portrait avatar video (recommended v3 path)

<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/videos | Create a portrait avatar video -->

```
POST /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/videos
```

Exact portrait request shape:

```json
{
  "type": "avatar",
  "avatar_id": "YOUR_AVATAR_LOOK_ID",
  "engine": { "type": "avatar_iv" },
  "script": "Hello, this is a portrait sample video.",
  "voice_id": "YOUR_VOICE_ID",
  "voice_settings": { "speed": 1.0 },
  "resolution": "1080p",
  "aspect_ratio": "9:16",
  "fit": "cover",
  "background": { "type": "color", "value": "#0f172a" },
  "output_format": "mp4"
}
```

Field contract:

| Field | v3 contract |
|---|---|
| `resolution` | Use `"1080p"` for this portrait flow; `"720p"` is also supported. `"4k"` is currently unavailable on Avatar IV/V and is limited to eligible Avatar III digital-twin/studio looks (photo avatars max out at 1080p). |
| `aspect_ratio` | `"16:9"`, `"9:16"`, `"4:5"`, `"5:4"`, `"1:1"`, or `"auto"` |
| `fit` | `"contain"` or `"cover"` |
| `background` | `{ "type": "color", "value": "#hex" }` or `{ "type": "image", "url": "https://..." }` (an image `asset_id` may replace `url`) |
| `voice_settings.speed` | Number from `0.5` through `1.5`; do not put `speed` directly on a `voice` object in v3 |
| `output_format` | `"mp4"` for a normal video; `"webm"` is reserved for supported transparent-background avatar renders |

`POST /v3/videos` rejects unknown fields. Do **not** send the v2-only
`dimension`, `video_inputs`, or nested `voice` fields to this endpoint.

Successful creation response:

```json
{
  "data": {
    "video_id": "v_abc123",
    "status": "waiting",
    "output_format": "mp4"
  }
}
```

Read `data.video_id` (not `data.id`) before polling.

### Engine selection and avatar compatibility (v3)

Omitting `engine` selects Avatar IV. It does **not** make HeyGen choose an
engine compatible with the supplied avatar.

Before creating a video, fetch the selected look:

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/avatars/looks/:lookId
```

Read its `supported_api_engines` array and send one of those values explicitly:

- Prefer `avatar_iv` for broad support.
- Use `avatar_v` only when the look lists it; Avatar V is opt-in and primarily
  supports eligible digital twins.
- Older stock looks may list only `avatar_iii`. Send that value explicitly.

Do not assume an id copied from the flat `GET /v2/avatars` catalog supports the
default Avatar IV engine. Requesting an engine absent from
`supported_api_engines` returns HTTP 400 `invalid_parameter`.

Valid v3 engine discriminators are:

- `avatar_iii`
- `avatar_iv`
- `avatar_v`

`avatar_v` is valid only when the look's `supported_api_engines` includes it.

### Poll v3 video status

<!-- MANIFEST:ENDPOINT GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/videos/:videoId | Poll v3 video status -->

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/videos/:videoId
```

Status is `pending`, `processing`, `completed`, or `failed`. The response shape
is:

```json
{
  "data": {
    "id": "v_abc123",
    "title": "Portrait sample",
    "status": "completed",
    "created_at": 1787690000,
    "completed_at": 1787690045,
    "video_url": "https://files.heygen.ai/video/v_abc123.mp4",
    "thumbnail_url": "https://files.heygen.ai/thumb/v_abc123.jpg",
    "gif_url": null,
    "captioned_video_url": null,
    "subtitle_url": null,
    "duration": 30.5,
    "folder_id": null,
    "output_language": null,
    "failure_code": null,
    "failure_message": null,
    "video_page_url": "https://app.heygen.com/video/v_abc123"
  }
}
```

On failure, surface both `failure_code` and `failure_message`.

### Prompt-driven Video Agent (different v3 API)

```
POST /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v3/video-agents
```

This API creates a video from a prompt and uses `orientation: "portrait"` rather
than the avatar endpoint's `aspect_ratio`. Do not use its payload with
`POST /v3/videos`.

```json
{
  "prompt": "A presenter explaining our product launch in 30 seconds",
  "mode": "generate",
  "orientation": "portrait",
  "avatar_id": "OPTIONAL_LOOK_ID",
  "voice_id": "OPTIONAL_VOICE_ID"
}
```

### Legacy v2 avatar video

```
POST /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v2/video/generate
```

v2 remains a transparent proxy path, but its nested schema is not compatible
with v3:

```json
{
  "video_inputs": [
    {
      "character": {
        "type": "avatar",
        "avatar_id": "YOUR_V2_AVATAR_ID",
        "avatar_style": "normal"
      },
      "voice": {
        "type": "text",
        "input_text": "Hello from the legacy v2 endpoint.",
        "voice_id": "YOUR_VOICE_ID",
        "speed": 1.0
      },
      "background": {
        "type": "color",
        "value": "#0f172a"
      }
    }
  ],
  "dimension": {
    "width": 1080,
    "height": 1920
  }
}
```

Creation returns `data.video_id`. Poll a v2-created video with:

```
GET /api/workspaces/:workspaceId/provider-credentials/heygen/proxy/v1/video_status.get?video_id=:videoId
```

Legacy polling returns an envelope like:

```json
{
  "code": 100,
  "data": {
    "id": "v_abc123",
    "status": "processing",
    "thumbnail_url": null,
    "video_url": null,
    "caption_url": null,
    "gif_url": null,
    "error": null,
    "duration": null,
    "callback_id": null,
    "video_url_caption": null
  },
  "message": "Success"
}
```

When v1 status is `failed`, `data.error` contains the upstream failure
`code`, `message`, and optional `detail`. Do not read v3's
`failure_code`/`failure_message` fields from this legacy envelope.

## Quick Start

```tsx
const workspaceId = (window as any).__WORKSPACE_ID__;

async function heygen(path: string, init?: RequestInit) {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/provider-credentials/heygen/proxy/${path.replace(/^\/+/, "")}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        (typeof data?.error === "string" ? data.error : null) ||
        "HeyGen request failed",
    );
  }
  return data;
}

async function resolveAvatarEngine(avatarId: string) {
  const response = await heygen(
    `v3/avatars/looks/${encodeURIComponent(avatarId)}`,
  );
  const supported = response.data?.supported_api_engines || response.supported_api_engines || [];
  const engine = ["avatar_iv", "avatar_v", "avatar_iii"].find((candidate) =>
    supported.includes(candidate),
  );
  if (!engine) throw new Error("This avatar does not support a v3 video engine");
  return engine;
}

async function validateVoiceId(voiceId: string) {
  const response = await heygen(`v3/voices/${encodeURIComponent(voiceId)}`);
  const voice = response.data || response;
  if (voice.voice_id !== voiceId) {
    throw new Error("The selected voice is not available in HeyGen v3");
  }
}

const avatarId = "YOUR_AVATAR_LOOK_ID";
const engine = await resolveAvatarEngine(avatarId);
await validateVoiceId("YOUR_VOICE_ID");
const created = await heygen("v3/videos", {
  method: "POST",
  body: JSON.stringify({
    type: "avatar",
    avatar_id: avatarId,
    engine: { type: engine },
    script: "Welcome to ReelPilot.",
    voice_id: "YOUR_VOICE_ID",
    voice_settings: { speed: 1.0 },
    resolution: "1080p",
    aspect_ratio: "9:16",
    fit: "cover",
    background: { type: "color", value: "#0f172a" },
    output_format: "mp4",
  }),
});

const videoId = created.data?.video_id || created.video_id;
if (!videoId) throw new Error("HeyGen did not return data.video_id");
const status = await heygen(`v3/videos/${videoId}`);
```

## MP4 and B-roll compositing

- `POST /v3/videos` returns MP4 when `output_format: "mp4"` is used.
- Use HeyGen's `background` field for a static color or image behind the avatar.
- Generate the talking-head with `aspect_ratio: "9:16"` and `fit: "cover"` so
  the avatar **fills** 1080×1920. Cover-scaling a letterboxed master later
  cannot remove bars that are already burned into the pixels.
- For timed portrait B-roll over that talking-head, call
  `POST /api/workspaces/:workspaceId/videos/overlay` (`integrations/video-overlay/`).
  It cover-crops the base and each overlay to 1080×1920, applies
  `overlay=enable='between(t,start,end)'`, and keeps the HeyGen audio.
- For real server-side overlays in a **landscape** MP4, submit a composition to
  `POST /api/render/remotion` and poll its operation URL. The public Remotion
  endpoint currently renders submitted compositions only at 1920x1080, so it
  is not a supported 1080x1920 overlay path.
- `POST /api/workspaces/:workspaceId/videos/stitch` only concatenates clips; it
  does not overlay B-roll. It also normalizes output to 1280x720 at 30 fps, so
  do not use it for a portrait export.
- Browser `canvas.captureStream()` + `MediaRecorder` cannot reliably request
  MP4 and will commonly produce WebM. Do not label the browser WebM path as an
  MP4 export.

## Security Rules

- Never ask Otto, Cursor, or an app-editing agent to paste the HeyGen API key into source code.
- Never use `process.env.HEYGEN_API_KEY` in a client-side mini-app. Space apps run in the browser.
- Use only the Audos proxy path from app code. The proxy adds the HeyGen key on the server and returns HeyGen's response without revealing the key.
- If testing with a temporary key, rotate it in HeyGen after the test is complete.


---

# higgsfield-media

Source: integrations/higgsfield-media/docs.md

# Higgsfield Media Generation Integration

Generate images and videos with Higgsfield AI - text-to-image (Popcorn),
Soul cinematic images, text-to-video (MiniMax Hailuo), and image-to-video
(DoP camera motion). The platform proxies requests so apps never manage the
Higgsfield key, polling boilerplate, or wallet billing.

## Category
AI / Media

## Required API Keys (Platform-Level)

All provider keys are managed at the platform level and are never exposed to the
client.

**This does NOT authenticate your app's caller.** Endpoints that spend the
workspace wallet require the caller to present the workspace token
(`X-Workspace-DB-Token: window.__workspaceDb.token`); an anonymous request is
rejected. Apps must also apply their own session and access controls before
exposing a "generate" button.

- `HIGGSFIELD_API_KEY` - Managed by platform admin (not per workspace). The proxy
  never exposes it to the client.

---

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/generate/higgsfield/image` | Text-to-image (Popcorn). |
| `POST` | `/api/generate/higgsfield/soul` | Soul - Higgsfield's cinematic/photoreal image model. |
| `POST` | `/api/generate/higgsfield/video` | Text-to-video (MiniMax Hailuo). |
| `POST` | `/api/generate/higgsfield/image-to-video` | Animate an input image (DoP camera-motion model). |
| `POST` | `/api/generate/higgsfield/upload` | Upload an input image, get back a URL. |
| `GET`  | `/api/generate/higgsfield/status/:requestId` | Poll a generation. |
| `GET`  | `/api/generate/higgsfield/models` | List available models per mode. |

All endpoints accept and return JSON. Auth follows the standard app session /
`x-app-id` + `x-user-id` headers. Wallet attribution resolves from `x-app-id`,
`?workspaceId=`, or a `workspaceId` field in the body.

Every kickoff returns `{ requestId, status, model, mode, estimatedDuration }`.
Poll the status endpoint every ~5 seconds until `status` becomes `completed`,
`failed`, or `nsfw`.

---

## `POST /api/generate/higgsfield/image`

Text-to-image generation.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string (1-2000) | yes | What to generate. |
| `model` | string | no | `popcorn` (default). Unknown ids fall back to the default. |
| `aspectRatio` | string | no | e.g. `"1:1"`, `"16:9"`, `"9:16"`. |
| `seed` | integer | no | Reproducibility. |
| `workspaceId` | string | no | Wallet attribution. Inferred from `x-app-id` when omitted. |

### Example

```javascript
const res = await fetch('/api/generate/higgsfield/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'A neon-lit ramen shop at night', aspectRatio: '16:9' })
});
const { requestId } = await res.json();
```

---

## `POST /api/generate/higgsfield/soul`

Soul is Higgsfield's signature cinematic, photoreal image model with curated
style presets.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string (1-2000) | yes | What to generate. |
| `model` | string | no | `soul-standard` (default), `soul-cinema`, or `soul-character`. |
| `widthAndHeight` | string | no | e.g. `"1536x1536"`, `"2048x1152"`. |
| `quality` | string | no | e.g. `"720p"`, `"1080p"`. |
| `batchSize` | `1` \| `4` | no, default `1` | Generate 1 or 4 variations. Batch of 4 costs more. |
| `styleId` | string | no | A Soul style preset id (optional). |
| `seed` | integer | no | Reproducibility. |
| `workspaceId` | string | no | Wallet attribution. |

---

## `POST /api/generate/higgsfield/video`

Text-to-video generation.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string (1-2000) | yes | Scene description. |
| `model` | string | no | `minimax-hailuo-02` (default). |
| `aspectRatio` | string | no | e.g. `"16:9"`, `"9:16"`. |
| `durationSeconds` | integer (1-15) | no | Clip length where the model supports it. |
| `seed` | integer | no | Reproducibility. |
| `workspaceId` | string | no | Wallet attribution. |

Video generation takes 1-5 minutes; poll the status endpoint.

---

## `POST /api/generate/higgsfield/image-to-video`

Animates an input image with Higgsfield's DoP camera-motion model.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `imageData` | string | yes | Raw base64, a `data:image/...;base64,...` URL, or an `http(s)://` URL. Inline images capped at ~10MB decoded. |
| `prompt` | string | no | Motion / scene guidance. |
| `model` | string | no | `dop-turbo` (default), `dop-standard`, or `dop-lite`. |
| `seed` | integer | no | Reproducibility. |
| `workspaceId` | string | no | Wallet attribution. |

Inline images are uploaded to Higgsfield's file storage automatically. To reuse
one image across several generations, upload it once via
`POST /api/generate/higgsfield/upload` (`{ imageData }` → `{ url }`) and pass
the returned URL as `imageData`.

---

## `GET /api/generate/higgsfield/status/:requestId`

### Response (`200`)

```json
{
  "status": "completed",
  "requestId": "req_abc123",
  "images": [{ "url": "https://storage.googleapis.com/.../higgsfield/req_abc123/req_abc123-0.png" }],
  "videoUrl": null,
  "errorMessage": null
}
```

`status` is one of `queued | processing | completed | failed | nsfw`. Image
results arrive in `images`; video results in `videoUrl`. Completed assets are
re-hosted on platform storage (CORS-enabled, non-expiring). `nsfw` means
Higgsfield's moderation rejected the generation - adjust the prompt and retry.

---

## Models

`GET /api/generate/higgsfield/models` returns the live list. Current catalog:

| Mode | `model` id | Notes |
| ---- | ---------- | ----- |
| text-to-image | `popcorn` | Default. Higgsfield Popcorn Auto. |
| soul | `soul-standard` | Default. Higgsfield Soul. |
| soul | `soul-cinema` | Film-look Soul preset. |
| soul | `soul-character` | Consistent-character Soul preset. |
| text-to-video | `minimax-hailuo-02` | Default. MiniMax Hailuo 02 Standard. |
| image-to-video | `dop-turbo` | Default. Fast camera-motion animation. |
| image-to-video | `dop-standard` | Higher quality, slower. |
| image-to-video | `dop-lite` | Fastest / cheapest. |

Unknown model ids never fail the call - they fall back to the mode default and
the kickoff response includes a `modelFallback` note.

---

## Pricing

Each kickoff is wallet-debited via the platform spending gate. If the provider
kickoff fails, the charge is automatically refunded.

| Call | Price (USD) |
| ---- | ----------- |
| Text-to-image | $0.10 |
| Soul image (batch of 1) | $0.15 |
| Soul image (batch of 4) | $0.40 |
| Text-to-video | $1.00 |
| Image-to-video | $1.00 |
| Upload | free |

When the wallet is short, the endpoint returns a canonical `insufficient_funds`
(402). If no billable workspace can be resolved, kickoff endpoints reject with
`400` - paid provider usage is never run un-billed.

---

## Error shapes

| Status | Meaning |
| ------ | ------- |
| `400` | Invalid request parameters (Zod `details` array), or no billable workspace could be resolved. |
| `402` | Insufficient wallet balance (canonical `insufficient_funds`). |
| `429` | Rate limited (per-workspace submit throttle or provider limit). Honor the `Retry-After` header and retry. |
| `502` | Provider kickoff failed - wallet charge auto-refunded (`{ error, refunded }`). |
| `503` | Higgsfield is not configured on this platform. |
| `500` | Unexpected server error. |

---

## Full polling example

```javascript
// 1. Kick off
const start = await fetch('/api/generate/higgsfield/video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Slow dolly shot over a misty forest at sunrise' })
});
if (start.status === 402) throw new Error('Wallet balance too low');
const { requestId } = await start.json();

// 2. Poll until done
async function poll() {
  const r = await fetch(`/api/generate/higgsfield/status/${requestId}`);
  const s = await r.json();
  if (s.status === 'completed') return s.videoUrl || s.images[0]?.url;
  if (s.status === 'failed' || s.status === 'nsfw') {
    throw new Error(s.errorMessage || 'Generation failed');
  }
  await new Promise((res) => setTimeout(res, 5000));
  return poll();
}
const assetUrl = await poll();
```


---

# image-and-video-generation

Source: integrations/image-and-video-generation/docs.md

# Image & Video Generation

Unified reference for the image and video generation endpoints exposed to apps built on the platform. The platform proxies requests to Google Gemini Omni 1.1 Flash, OpenRouter-hosted video models, OpenAI DALL-E 3, and Gemini Flash Image so apps don't have to manage provider keys themselves.

<!-- MANIFEST:INTRO -->
Video apps can explicitly select `openrouter/bytedance/seedance-2.5`: integer
4–30 seconds, 480p/720p, six aspect ratios, optional audio, first/last frames,
or up to 3 asset image references. Requires an authorized workspace for wallet billing.
Image generation supports `1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `4:5`, and
`5:4`. `POST /api/veo/generate/image` requires an explicit Gemini or DALL·E
model; `POST /api/generate/image` is platform-managed, with optional
`model: "gpt-image-2"` as the only model override. Exact `3:4` / `4:3` /
`4:5` / `5:4` requests use Gemini and reject that OpenAI override with
`400 unsupported_aspect_ratio`. Gemini preserves its returned MIME type and
uses 1K for standard quality or 2K for HD quality.
<!-- MANIFEST:END -->

For provider-specific notes, see also:
For labeled reference edits (including portraits), reuse
`POST /api/generate/image-to-image`, not `/api/generate/image`. The opt-in
GPT Image 1.5 contract supports `quality: "medium"`, `inputFidelity: "high"`,
`referenceLimit: 16`, and `fallbackPolicy: "none"` with workspace authentication.
It returns `imageBase64` plus MIME/provider/model/settings metadata when
`returnBase64: true`; it does not debit the workspace wallet.
See [`gemini-vision-transform/docs.md`](../gemini-vision-transform/docs.md)
for the full limits, authentication, role labels and error contract.
See the Seedance 2.5 contract below before selecting that model.
- [`google-veo3/docs.md`](../google-veo3/docs.md) — full video request examples (including reference images and first/last frame).
- [`gemini-vision-transform/docs.md`](../gemini-vision-transform/docs.md) — image edits with Gemini.

---

## Seedance 2.5 (explicit choice; defaults unchanged)

Legacy app/user generation lists intentionally omit Seedance records. Use the
returned status URL with your workspace credential to retrieve your job.

Both submit/status pairs support `model: "openrouter/bytedance/seedance-2.5"`.
This model is app-integration-only: onboarding/hero profiles, scene groups,
workspace-video creation and chained long-video endpoints do not expose it.
Supply `workspaceId` or `X-Audos-Workspace-Id` with a workspace credential;
the platform supplies provider keys. Retrieval requires access to the owning workspace.

```js
// Published apps can use their workspace-scoped SDK token, not provider keys.
const workspaceAuthHeaders = { 'X-Workspace-Db-Token': window.__workspaceDb.token };
const response = await fetch('/api/generate/video', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...workspaceAuthHeaders },
  body: JSON.stringify({ workspaceId, model: 'openrouter/bytedance/seedance-2.5',
    prompt: 'A slow cinematic reveal of a ceramic mug in morning light.',
    duration: 30, resolution: '720p', aspectRatio: '21:9', generateAudio: true })
});
const job = await response.json(); // check response.ok; poll job.statusUrl with workspaceAuthHeaders
```

- Every integer duration 4–30 (default 8); 480p/720p (default 720p).
- Ratios: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9.
- Text-only; `imageData` first frame; first plus `lastFrameImage`; or 1–3
  `referenceImages` with `referenceType: 'asset'`. Last requires first.
  References cannot be combined with either frame.
- PNG/JPEG/WebP, raw base64/data URL/public HTTP(S) URL, ~10MB per image.
- Audio is optional and forwarded unchanged (full proxy defaults false,
  convenience proxy true). `enhancePrompt` is compatibility-only.
- Not exposed: negativePrompt, style reference roles, video/audio references,
  source-video editing, extension, 50 mixed assets, arbitrary provider options.
  Unsupported fields or combinations return 400.
- Video-token admission estimate: `(width * height * 24 * seconds) / 1024`
  at $0.0000107/token; actual completion uses OpenRouter `usage.cost`, not a
  Google estimate or universal per-second rate. Operation-keyed wallet receipts
  prevent duplicate polling charges; missing actual cost fails explicitly.

Public catalog/payload checked 2026-10-14 at
https://openrouter.ai/api/v1/videos/models and
https://openrouter.ai/docs/features/multimodal/video-generation.
Seedance 2.5 (`openrouter/bytedance/seedance-2.5`) is available on these video endpoints for every workspace. Submit with that workspace's credential; the platform calls OpenRouter as `bytedance/seedance-2.5`.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/veo/generate/video` | Schema-validated video generation proxy. Supports every video option, including reference images and first/last frame. |
| `POST` | `/api/generate/video` | Lightweight convenience proxy. Defaults to `gemini-omni-1.1-flash`. |
| `GET`  | `/api/veo/status/:operationId` | Poll the status of a video job. |
| `GET`  | `/api/generate/video/status/:operationId` | Same as above, alternate path used by some integrations. |
| `POST` | `/api/veo/generate/image` | Schema-validated image generation proxy (Gemini Flash Image / DALL-E 3). |
| `POST` | `/api/generate/image` | Convenience image proxy. |

All endpoints accept and return JSON. Auth follows the standard app session / `x-app-id` + `x-user-id` headers.

---

## `POST /api/veo/generate/video`

Starts an asynchronous video generation job. Returns an `operationId` that the app polls until the video is ready.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `model` | enum | yes | Use `gemini-omni-1.1-flash` (default). Also accepted: `openrouter/bytedance/seedance-2.5`, `openrouter/bytedance/seedance-2.0-fast`, `openrouter/google/veo-3.1`, `openrouter/google/veo-3.1-fast`, `openrouter/google/veo-3.1-lite`. Retired ids (Veo 3.x / 2.0 previews, Sora 2, Omni Flash preview) are still accepted and served by `gemini-omni-1.1-flash`. |
| `prompt` | string (10–10,000) | yes | Text prompt describing the desired video. Sent to the provider unchanged (never truncated). 10,000 characters is the Audos limit, not a guarantee every model accepts that much — if a model rejects a long prompt, the response carries that provider's error; shorten the prompt for that model. The same 10–10,000 limit applies to `POST /api/generate/video` and to each long-video scene prompt. |
| `negativePrompt` | string | no | Things that should not appear. |
| `aspectRatio` | string | no, default `"16:9"` | Seedance 2.5: all six ratios above. Others: 16:9, 9:16, 1:1. |
| `generateAudio` | boolean | no, default `false` | |
| `enhancePrompt` | boolean | no, default `true` | Accepted for compatibility; current models ignore it. |
| `duration` | integer | no | Seedance 2.5: 4–30, unrounded. Others: 4–25 with existing normalization. |
| `resolution` | string | no | Seedance 2.5: only 480p/720p. Others: existing 720p/1080p/4k contract; Omni is capped at 720p. |
| `imageData` | string | no | Single seed image (first frame) for image-to-video. May be combined with `lastFrameImage` or, on `gemini-omni-1.1-flash`, with `referenceImages`. |
| `referenceImages` | array | no | Omni max 10; Seedance 2.5 max 3 asset references without frames. Items: `{ imageData, mimeType?, referenceType? }`. |
| `lastFrameImage` | object | no | Final frame for first/last-frame interpolation (sent to Omni as a second image after `imageData`). `{ imageData, mimeType? }`. Cannot be combined with `referenceImages`. |
| `videoData` | string | no | Omni Flash source video for editing. Same shapes as `imageData` (raw base64 / `data:` URL / `http(s)` URL). Other models return `400`. |
| `videoMimeType` | enum | no | Omni only. One of `video/mp4`, `video/webm`, `video/quicktime`, `video/mpeg`, `video/mpg`, `video/mpegs`, `video/x-flv`, `video/wmv`, `video/3gpp`. Defaults to `video/mp4`. |

Every `imageData` field (top-level seed, `referenceImages[].imageData`, and `lastFrameImage.imageData`) accepts any of:

- raw base64-encoded image bytes (no `data:` prefix), or
- a `data:image/<mime>;base64,<bytes>` URL, or
- an `http(s)://` URL — the proxy downloads and base64-encodes the image before forwarding it to Google.

`referenceImages[].referenceType` is `"asset"` (default) or `"style"` on Omni.
Seedance 2.5 exposes only `"asset"`; `"style"` returns 400.

`mimeType` for any ingredient image accepts `image/png`, `image/jpeg`, or `image/webp`. It is optional — when omitted it is inferred from the data URL or HTTP `Content-Type` header, defaulting to `image/png`. Each inline base64 `imageData` is capped at ~10MB decoded (`14_000_000` characters of base64 input).

**Combining rules** (enforced by the proxy — violating any returns a `400`):

- `lastFrameImage` cannot be combined with `referenceImages` — first/last-frame interpolation takes exactly a first frame (`imageData`) and a last frame.
- `imageData` + `lastFrameImage` together is the canonical first/last-frame flow (seed = first frame, `lastFrameImage` = locked final frame; the model interpolates the motion between them).
- `imageData` + `referenceImages` is allowed on `gemini-omni-1.1-flash` (seed frame plus subject references; `imageData` counts toward the 10-image cap).
- On Omni each input can be sent on its own. Seedance 2.5 lastFrameImage requires imageData.

### Per-model image-input support matrix

| Model | `imageData` (single seed) | `referenceImages` | `lastFrameImage` |
| ----- | :-----------------------: | :---------------: | :--------------: |
| `gemini-omni-1.1-flash` (default) | ✅ | ✅ (max 10, multimodal references) | ✅ |
| `openrouter/bytedance/seedance-2.5` | ✅ | ✅ (max 3, asset only; no frames) | ✅ (requires first frame) |
| Other `openrouter/*` (Seedance 2.0 Fast, Veo 3.1 / Fast / Lite) | ✅ | ❌ | ❌ |

Passing `referenceImages` or `lastFrameImage` to a model that does not support them returns `400` with a Zod-style `details` array naming the unsupported field — the proxy never silently drops them.

**Retired model ids still work.** Older ids (the Veo 3.x / 2.0 previews, Sora 2 and the Omni Flash preview) are still accepted so existing apps keep working, but every one of them is served by `gemini-omni-1.1-flash`. Use `gemini-omni-1.1-flash` in new code.

### Gemini Omni 1.1 Flash (`gemini-omni-1.1-flash`) — character consistency

Google's Omni Flash video model is the default and the strongest option when the **same character, product, or subject must stay visually consistent across multiple scenes** (multi-scene commercials, episodic content, recurring mascots). It consumes `referenceImages` as Google multimodal inputs (up to **10**, matching the live Interactions API image cap) and allows combining them with a top-level `imageData` seed. Send `videoData` to edit an existing clip. Send `imageData` + `lastFrameImage` for first/last-frame interpolation.

Capabilities: up to 8-second clips, `16:9` / `9:16`, output capped at 720p, optional audio, up to 10 reference images, first/last-frame interpolation, optional source-video editing. Runs through the same wallet-billed platform proxy — no Google API key needed. Use `gemini-omni-1.1-flash`; do not invent a different Omni model id.

```javascript
// Character consistency across scenes: send the SAME character reference
// image(s) with every scene request.
const characterRef = { imageData: heroCharacterBase64, mimeType: 'image/png', referenceType: 'asset' };

for (const scenePrompt of scenePrompts) {
  const res = await fetch('/api/veo/generate/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-omni-1.1-flash',
      prompt: scenePrompt, // e.g. 'The same red-jacketed explorer crosses a rope bridge at dawn'
      aspectRatio: '16:9',
      duration: 8,
      referenceImages: [characterRef],
    })
  });
  const { operationId } = await res.json();
  // poll /api/veo/status/:operationId as usual
}
```

### Response (`200`)

```json
{
  "success": true,
  "generationId": "gen_abc123",
  "operationId": "operations/...",
  "status": "processing",
  "progress": 10,
  "cost": "0.40",
  "estimatedDuration": "1-3 minutes",
  "message": "Video generation started. Use the operationId to check status."
}
```

### Common errors (`400`)

```json
{
  "error": "Invalid request parameters",
  "details": [
    {
      "code": "custom",
      "path": ["model"],
      "message": "Model \"openrouter/google/veo-3.1\" does not support the ingredients fields (referenceImages). Supported models: gemini-omni-1.1-flash."
    }
  ]
}
```

### Example: reference images

```javascript
const res = await fetch('/api/veo/generate/video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemini-omni-1.1-flash',
    prompt: 'A golden retriever running through a sunlit meadow, cinematic, 35mm film',
    aspectRatio: '16:9',
    duration: 8,
    referenceImages: [
      { imageData: subjectBase64,  mimeType: 'image/png' },
      { imageData: moodBoardBase64, mimeType: 'image/jpeg' }
    ]
  })
});
const { operationId } = await res.json();
```

### Example: first + last frame

```javascript
await fetch('/api/veo/generate/video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemini-omni-1.1-flash',
    prompt: 'Camera pulls back from the subject as the scene transitions to dusk',
    imageData: openingFrameBase64,
    lastFrameImage: { imageData: closingFrameBase64, mimeType: 'image/png' }
  })
});
```

---

## Polling

```
GET /api/veo/status/:operationId
```

Returns:

```json
{
  "status": "processing | completed | failed",
  "progress": 60,
  "videoUrl": "https://storage.googleapis.com/...",
  "errorMessage": "..."
}
```

Poll every ~5 seconds until `status` becomes `completed` or `failed`.

---

## Otto / agent guidance

When an app generates video, Otto can recommend:

1. Adding `referenceImages` of the brand subject, product, or character to keep the video on-model — and sending the same `referenceImages` with each scene request when the user wants a consistent character/subject across multiple scenes (up to 10; a seed `imageData` may be sent alongside them).
2. Setting a `lastFrameImage` (with an `imageData` first frame) to lock the final frame — useful for ad endings that lead into a logo plate or product hero shot. It cannot be combined with `referenceImages`.
3. Using the default model for the Omni examples; other OpenRouter models accept only a single seed, except Seedance 2.5 as documented above.
4. For video editing, sending `videoData` (and optional `videoMimeType`) with a short edit prompt.

---

## Image generation (overview)

The two image endpoints behave differently — one lets the app pick the model, the other manages the model for you.

### `POST /api/veo/generate/image` — schema-validated, app picks the model

```json
{
  "model": "gemini-3.1-flash-image" | "dall-e-3",
  "prompt": "A professional headshot photo",
  "negativePrompt": "<optional>",
  "aspectRatio": "1:1" | "16:9" | "9:16" | "3:4" | "4:3" | "4:5" | "5:4",
  "editImageData": "<optional base64 for image edits>"
}
```

`model` is required and must be exactly one of `"gemini-3.1-flash-image"`, `"gemini-2.5-flash-image-preview"` or `"dall-e-3"`. Any other value — a `-preview` suffix on the 3.1 id, or the shorter `"gemini-2.5-flash-image"` id — is rejected with a `400`.

Use **`gemini-3.1-flash-image`** (Nano Banana 2) for Gemini image work. It handles
both directions from the one endpoint:

- **text-to-image** — send `prompt` on its own.
- **image-to-image** — send `editImageData` (base64, no `data:` prefix) alongside
  `prompt`. This is the path for face and subject references, product shots, and
  any "keep this thing, change that thing" edit.
- **native portrait / landscape ratios** — `3:4`, `4:3`, `4:5`, and `5:4` are
  supported by the Gemini image models (`4:5` / `5:4` are the print-friendly
  8x10 / 10x8 shapes). DALL·E 3 requests using any of these values return
  `400` instead of silently substituting a different shape.

`gemini-2.5-flash-image-preview` is still accepted by the schema so older apps keep
validating, but Google has retired it: the provider answers `404` for
`generateContent`, so the request comes back `status: "failed"`. Do not use it in new
code. `dall-e-3` is unaffected.

The response `imageUrl` is a `data:` URL carrying the provider's own mime type —
`gemini-3.1-flash-image` returns `image/jpeg`, DALL·E 3 returns a hosted URL. Read the
mime type off the URL rather than assuming PNG.

The response `cost` field reports `$0.067` per image for `gemini-3.1-flash-image` (its
default 1K / 1024px output) and `$0.04` for `dall-e-3`.

### `POST /api/generate/image` — convenience proxy, platform-managed model

```json
{
  "prompt": "A professional headshot photo",
  "aspectRatio": "1:1" | "16:9" | "9:16" | "3:4" | "4:3" | "4:5" | "5:4",
  "quality": "standard" | "hd",
  "returnBase64": false
}
```

This endpoint manages model selection server-side (currently `gpt-image-1.5`,
with an automatic Gemini image-model fallback) and reports the model actually
used in `metadata.model`. The only accepted model override is
`"gpt-image-2"`, which opts into GPT Image 2 with `gpt-image-1.5` fallback for
OpenAI-compatible ratios. Combining that override with `3:4`, `4:3`, `4:5`,
or `5:4` returns `400 unsupported_aspect_ratio`; it is never silently replaced
by Gemini.

`3:4`, `4:3`, `4:5`, and `5:4` requests use Gemini's native image-ratio
support rather than substituting OpenAI's nearest `2:3` or `3:2` size. On that
path, `quality: "standard"` requests 1K output and `quality: "hd"` requests 2K.

The response includes the resulting `imageUrl` (uploaded to GCS) once the job
completes. With `returnBase64: true`, `mimeType` matches the provider's bytes
(Gemini may return JPEG rather than PNG). See
[`gemini-vision-transform/docs.md`](../gemini-vision-transform/docs.md) for
image-edit specifics.


---

# kling-video

Source: integrations/kling-video/docs.md

# Kling AI Video Generation

## Authentication

Platform-managed `KLING_API_KEY`; never expose it to apps. Send
`X-Workspace-DB-Token: window.__workspaceDb.token` with every generation and
status request. Workspace identity comes from that token. Session Bearer JWT
and device credentials are also accepted; cross-workspace access is refused.
Omni requires the platform's single API key, not a legacy key-pair JWT.

## Models and supported subset

Read `GET /api/generate/kling/models` before building pickers. This is a
contract catalog, NOT proof of provider account access or successful generation.

| App model | Provider identity | Inputs | std/pro USD per second |
| --- | --- | --- | --- |
| `kling-2.5-turbo` | `kling-v2-5-turbo` | text, first frame; first+last in pro | $0.042 / $0.070 |
| `kling-2.6` | `kling-v2-6` | text, first frame, first+last | $0.042 / $0.070 |
| `kling-3.0` | `kling-v3` | text, first frame, first+last | $0.084 / $0.112 |
| `kling-3.0-omni` | `kling-v3-omni` | text, first frame, first+last, 2–4 reference images | $0.084 / $0.112 |

Provider identities are explicit aliases. Text/image defaults use 2.5 Turbo;
multi-image defaults use 3.0 Omni. `std` means 720p; `pro` means 1080p.
All current proxy generations are **silent, single-shot, 5 or 10 seconds**.
Default mode/duration: `std` / `"5"`. Pricing is per selected model, not
operation alone: a default 5-second text/image generation costs $0.21;
default multi-image costs $0.42. No audio surcharge is applied.

Retired known IDs (`kling-v1`, `kling-v1-5`, `kling-v1-6`, `kling-v2-master`)
parse as explicit replacements using the operation default. `kling-v1`
multi-image is refused. Results disclose replacements in `modelFallback`,
with `requestedModel`, resolved `model`, and `providerModel`. Show that notice
to users; do not label replacement output as the retired model.
Unknown model IDs now return 400 before billing instead of silently falling back.

Unsupported: `cameraControl`, `dynamicMasks`, `cfgScale`, `seed`, native audio,
voice controls, video references, element IDs, multi-shot controls and 4K.
These are rejected before billing, not stripped. Do not send unsupported fields,
including empty values. Omni rejects separate `negativePrompt`; put negative
descriptions in `prompt`. Wider upstream capabilities are not proxy support.

## Endpoints

All paths below begin with `/api/generate/kling`.

| Method/path | Body / result |
| --- | --- |
| POST `/text-to-video` | `prompt` required; `model`, `mode`, `duration`, `aspectRatio`, `negativePrompt` optional |
| POST `/image-to-video` | `imageData` required; `tailImageData`, `prompt`, `negativePrompt`, `model`, `mode`, `duration` optional |
| POST `/multi-image` | `images` (2–4 references), optional `prompt`, `model`, `mode`, `duration` |
| GET `/status/:taskId` | No generationType query; ownership selects the correct polling API, including Omni |
| POST `/extend` | `sourceTaskId`, optional `prompt`, `negativePrompt`, `cfgScale`; older compatible videos only ($0.25); current-model sources refused before billing |
| POST `/lip-sync` | `videoTaskId`, `audioType: "text" \| "audio"`, corresponding `text` or `audioUrl`; existing operation ($0.25) |
| GET `/models` | Public discovery, model-specific prices, aliases, capabilities and replacement policy |

Aspect ratios: `16:9`, `9:16`, `1:1`. Images may be URL, base64 or data URL;
provider image-format/dimension restrictions still apply. Keep prompts within
2500 characters. Multi-image inputs are reference images, not first/last frames.
Omni reference IDs are `image_1`, `image_2`, etc.; refer to them as `@image_1`
in the prompt when needed. No automatic retry of paid submissions.

Kickoff: `{ taskId, status, model, requestedModel, providerModel, mode, duration,
generationType, estimatedDuration, modelFallback? }`.
Poll every five seconds until `completed` or `failed`. Status includes
`videoId`, `videoUrl`, `videoDuration`, and `errorMessage`. Extend resolves
the video-level ID server-side; never submit a caller-selected videoId.

## Example

```javascript
const headers = {
  'Content-Type': 'application/json',
  'X-Workspace-DB-Token': window.__workspaceDb.token
};
const start = await fetch('/api/generate/kling/text-to-video', {
  method: 'POST', headers,
  body: JSON.stringify({ prompt: 'Gentle waves on a quiet beach',
    model: 'kling-2.5-turbo', mode: 'std', duration: '5' })
});
const task = await start.json();
if (!start.ok) throw new Error(task.error);
// Display task.modelFallback if present, then poll with the same headers.
const status = await fetch(`/api/generate/kling/status/${encodeURIComponent(task.taskId)}`, { headers });
const result = await status.json();
if (!status.ok) throw new Error(result.error);
// Only completed + videoUrl is a playable result; queued is not success.
```

## Errors and billing

400 invalid/unsupported selection; 401 unauthenticated; 402 insufficient wallet;
403 wrong workspace or task owner; 429 throttled (honor Retry-After);
503 platform credential unavailable; 502 provider kickoff failure.
Failed kickoffs use the existing refund gate: inspect `refunded`, never infer it
from status alone. A discontinued-model response has
`code: "kling_model_discontinued"`, `providerCode`, `providerStatus`,
`retryable: false`, and `refunded`. Change the selection before resubmitting.
Polling a failed task does not authorize another paid generation.

Contracts/prices checked against official Kling documentation on 2026-10-14.
Account entitlement, deployed routing and paid generation are separate proofs.


---

# meshy-3d

Source: integrations/meshy-3d/docs.md

# Meshy 3D Integration

Generate 3D models from text prompts or reference images using Meshy AI — the platform proxies requests so apps never manage the Meshy key, polling, or wallet billing.

The platform proxies requests to Meshy so your app never manages the Meshy API
key, polling boilerplate, or wallet billing — call the endpoints below with a
simple `fetch()`.

## Category
AI / 3D

## Required API Keys (Platform-Level)

All provider keys are managed at the platform level and are never exposed to the
client.

**This does NOT authenticate your app's caller.** Endpoints that spend the
workspace wallet require the caller to present the workspace token
(`X-Workspace-DB-Token: window.__workspaceDb.token`); an anonymous request is
rejected. Apps must also apply their own session and access controls before
exposing a "generate" button.

- `MESHY_API_KEY` — Managed by platform admin (not per workspace). The proxy
  never exposes it to the client.

---

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/generate/3d/text` | Kick off a text-to-3D job. |
| `POST` | `/api/generate/3d/image` | Kick off an image-to-3D job. |
| `GET`  | `/api/generate/3d/status/:taskId` | Poll a job's status. |

All endpoints accept and return JSON. Auth follows the standard app session /
`x-app-id` + `x-user-id` headers. Wallet attribution resolves from `x-app-id`,
`?workspaceId=`, or a `workspaceId` field in the body.

---

## `POST /api/generate/3d/text`

```
POST /api/generate/3d/text
```

Starts an asynchronous text-to-3D job. Returns a `taskId` you poll until the
model is ready.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `prompt` | string (1–600) | yes (preview) | Text description of the model. Required when `mode` is `preview`. |
| `artStyle` | enum | no | One of `realistic`, `cartoon`, `low-poly`, `sculpture`, `pbr`. Default `realistic`. |
| `negativePrompt` | string | no | Things that should not appear. |
| `mode` | `"preview"` \| `"refine"` | no, default `"preview"` | `preview` generates base geometry; `refine` adds textures. |
| `previewTaskId` | string | yes (refine) | The id of a completed preview task to refine. |
| `workspaceId` | string | no | Wallet attribution. Inferred from `x-app-id` when omitted. |

### Response (`200`)

```json
{
  "taskId": "0193b...e4",
  "status": "pending",
  "estimatedDuration": "1-3 minutes"
}
```

### Example

```javascript
const res = await fetch('/api/generate/3d/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'A low-poly wooden treasure chest with iron bands',
    artStyle: 'low-poly'
  })
});
const { taskId } = await res.json();
```

---

## `POST /api/generate/3d/image`

```
POST /api/generate/3d/image
```

Starts an asynchronous image-to-3D job from a reference image.

### Request body

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `imageData` | string | yes | A reference image as raw base64, a `data:image/...;base64,...` URL, or an `http(s)://` URL. Inline images are capped at ~10MB decoded. |
| `artStyle` | enum | no | Same enum as text-to-3D. Default `realistic`. |
| `mode` | `"preview"` \| `"refine"` | no | |
| `workspaceId` | string | no | Wallet attribution. |

`imageData` accepts the same three input shapes as the
`image-and-video-generation` integration:

- raw base64-encoded image bytes (no `data:` prefix), or
- a `data:image/<mime>;base64,<bytes>` URL, or
- an `http(s)://` URL — passed through to Meshy, which downloads it.

### Response (`200`)

```json
{
  "taskId": "0193b...e4",
  "status": "pending",
  "estimatedDuration": "1-3 minutes"
}
```

### Example

```javascript
// http(s) URL input
await fetch('/api/generate/3d/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageData: 'https://example.com/product.png',
    artStyle: 'realistic'
  })
});

// data: URL input
await fetch('/api/generate/3d/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageData: 'data:image/png;base64,iVBORw0KG...' })
});
```

---

## `GET /api/generate/3d/status/:taskId`

```
GET /api/generate/3d/status/:taskId
```

Polls a job. Works for both text and image jobs. Optionally pass `?type=text`
or `?type=image` as a hint; otherwise the proxy tries text first, then image.

### Response (`200`)

```json
{
  "status": "processing",
  "progress": 60,
  "modelUrls": {
    "glb": "https://assets.meshy.ai/.../model.glb",
    "fbx": "https://assets.meshy.ai/.../model.fbx",
    "obj": "https://assets.meshy.ai/.../model.obj",
    "usdz": "https://assets.meshy.ai/.../model.usdz"
  },
  "thumbnailUrl": "https://assets.meshy.ai/.../thumbnail.png",
  "errorMessage": null
}
```

`status` is one of `pending | processing | completed | failed`. `modelUrls` is
populated as soon as the job completes. Poll every ~5 seconds until `status`
becomes `completed` or `failed`.

---

## Art styles

| `artStyle` | Best for |
| ---------- | -------- |
| `realistic` | Photoreal products, props, lifelike objects (default). |
| `cartoon` | Stylized, game-ready characters and objects. |
| `low-poly` | Lightweight, faceted meshes for real-time / web. |
| `sculpture` | High-detail statue / figurine looks. |
| `pbr` | Realistic geometry with physically-based rendering textures. |

---

## Pricing

Each kickoff is wallet-debited via the platform spending gate. If the provider
kickoff fails, the charge is automatically refunded.

| Call | Price (USD) |
| ---- | ----------- |
| Text-to-3D (preview) | $0.20 |
| Text-to-3D (refine) | $0.40 |
| Image-to-3D | $0.30 |

When the wallet is short, the endpoint returns a canonical `insufficient_funds`
(402):

```json
{
  "code": "insufficient_funds",
  "required": 0.20,
  "available": 0.05,
  "shortfall": 0.15,
  "headroomMultiplier": 1.0,
  "message": "Insufficient wallet balance for Meshy text-to-3D (preview). ..."
}
```

If no billable workspace can be resolved, the kickoff endpoints reject the
request with `400` — paid provider usage is never run un-billed.

---

## Error shapes

| Status | Meaning |
| ------ | ------- |
| `400` | Invalid request parameters (Zod `details` array), missing required field, or no billable workspace could be resolved. |
| `402` | Insufficient wallet balance (canonical `insufficient_funds`). |
| `502` | Provider kickoff failed — wallet charge auto-refunded (`{ error, refunded }`). |
| `503` | Meshy is not configured on this platform. |
| `500` | Unexpected server error. |

> A billable workspace is **required** for the two kickoff endpoints. Supply a
> valid `x-app-id` header, `?workspaceId=` query param, or a `workspaceId` body
> field — otherwise the call is rejected with `400` (paid provider usage is never
> run un-billed).

---

## Full polling example

```javascript
// 1. Kick off
const start = await fetch('/api/generate/3d/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'A ceramic coffee mug', artStyle: 'realistic' })
});
const { taskId } = await start.json();

// 2. Poll until done
async function poll() {
  const r = await fetch(`/api/generate/3d/status/${taskId}`);
  const s = await r.json();
  if (s.status === 'completed') return s.modelUrls.glb;
  if (s.status === 'failed') throw new Error(s.errorMessage || '3D generation failed');
  await new Promise((res) => setTimeout(res, 5000));
  return poll();
}
const glbUrl = await poll();
```

Render the resulting `.glb` with `<model-viewer>` (see `example.tsx`) or any
GLTF-capable 3D viewer.


---

# remotion-rendering

Source: integrations/remotion-rendering/docs.md

# Remotion Rendering Integration

Render arbitrary Remotion compositions to MP4 server-side. Submit a TSX composition + props, get back a job ID, then poll for the final video URL.

This is the same rendering pipeline that powers the platform's built-in demo-video composer — you get the full Remotion runtime (React, Framer Motion, Audio, Sequences, Google Fonts, lucide-react icons) without running a render farm yourself.

## Category
Media / Video

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `GCS_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_CREDENTIALS` (final MP4 storage)

---

## Quick Start

```tsx
const compositionTsx = `
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

export default function Composition({ title }: { title: string }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#000', color: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <h1>{title} {frame}</h1>
    </AbsoluteFill>
  );
}

export const calculateDemoVideoDuration = () => 90;
`;

const response = await fetch('/api/render/remotion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId,
    compositionTsx,
    props: { title: 'Hello' },
    durationInFrames: 90,
  }),
});
const { operationId } = await response.json();
```

Prefer a default component export. For compatibility, named `DemoVideo` or `Composition` exports are also accepted. The platform composition ID is always `DemoVideo`, regardless of the component's export name.

---

## API Endpoints

### Submit Render Job
```
POST /api/render/remotion
```

**Request:**
```json
{
  "workspaceId": "ws_required",
  "compositionTsx": "import React from 'react'; import { AbsoluteFill, useCurrentFrame } from 'remotion'; export default function Composition({ title }) { const f = useCurrentFrame(); return <AbsoluteFill style={{ background: '#000', color: '#fff', alignItems: 'center', justifyContent: 'center' }}><h1>{title} {f}</h1></AbsoluteFill>; } export const calculateDemoVideoDuration = () => 90;",
  "props": { "title": "Hello" },
  "durationInFrames": 90,
  "fps": 30,
  "width": 1920,
  "height": 1080
}
```

| Field | Type | Notes |
|-------|------|-------|
| `workspaceId` | string | Required. Render is namespaced + billed per workspace. |
| `compositionTsx` | string | Required. Export a React component as default (preferred), named `DemoVideo`, or named `Composition`. Also export `calculateDemoVideoDuration`, or include `durationInFrames` and the platform injects it. |
| `props` | object | Optional. Passed straight to your composition. |
| `durationInFrames` | number | Optional override for length. 1 to 18000 frames (10 min @ 30fps). |
| `fps`, `width`, `height` | number | Optional, but when supplied must match the platform's fixed render geometry: 30 fps at 1920x1080. |

**Response (immediate):**
```json
{
  "success": true,
  "operationId": "9c8a7b6e-1234-...",
  "status": "pending",
  "statusUrl": "/api/render/remotion/9c8a7b6e-1234-..."
}
```

### Get Render Status
```
GET /api/render/remotion/:operationId
```

**Response (while rendering):**
```json
{
  "success": true,
  "operationId": "9c8a7b6e-...",
  "status": "rendering"
}
```

**Response (complete):**
```json
{
  "success": true,
  "operationId": "9c8a7b6e-...",
  "status": "complete",
  "videoUrl": "https://storage.googleapis.com/.../render.mp4",
  "completedAt": "2026-05-19T23:30:00.000Z"
}
```

`status` is one of `pending | rendering | complete | failed`. On failure an `error` field is populated.

---

## Installation Helper

```javascript
export const remotion = {
  async render({ workspaceId, compositionTsx, props, durationInFrames }) {
    const r = await fetch('/api/render/remotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, compositionTsx, props, durationInFrames }),
    });
    const { operationId } = await r.json();
    return operationId;
  },
  async poll(operationId, { intervalMs = 2000, timeoutMs = 600000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(`/api/render/remotion/${operationId}`);
      const body = await res.json();
      if (body.status === 'complete') return body.videoUrl;
      if (body.status === 'failed') throw new Error(body.error || 'Render failed');
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Render timed out');
  },
};
```

## Use Cases
- Personalized share videos
- Data-driven explainer clips
- Animated certificates / receipts
- AI-narrated walk-throughs (pair with `elevenlabs-audio`)

## Limits
- Max ~10 min @ 30fps per render
- Single concurrent render per job ID; submit multiple jobs to render in parallel
- Renders run in-process — long jobs survive only until the next deploy; the final MP4 is durable on GCS


---

# rive-animation

Source: integrations/rive-animation/docs.md

# Rive Animation Integration

Render interactive, state-driven Rive animations (`.riv` files) inside a Space app — perfect for animated avatars whose expression reacts to an AI's emotional response. The Rive React runtime is pre-registered as an allowed library, so a bare `import { useRive } from "@rive-app/react-canvas"` resolves to a pinned CDN build that shares the host React 18 instance.

## Category
UI / Animation

## What this gives you

- The Rive React runtime (`@rive-app/react-canvas@4.29.1`) and its canvas runtime (`@rive-app/canvas@2.38.1`) as first-class allowed imports — no setup, no `cdnDependencies` edit needed.
- A reliable WebAssembly load: Rive fetches a separate `.wasm` binary at runtime, and the #1 cause of a blank canvas is that `.wasm` URL not resolving. Pin it explicitly (see below).
- `.riv` files can be uploaded via `file-storage` and fetched from your app (the object route serves them cross-origin with a binary content type).

---

## Step 1 — Pin the WebAssembly URL (REQUIRED, do this once)

Rive's runtime downloads a `rive.wasm` binary the first time an animation mounts. If that URL is wrong the canvas stays blank with no obvious error. Always set it explicitly at module scope, **before** any component mounts, and pin it to the canvas runtime version that ships with `@rive-app/react-canvas@4.29.1`, which is **`@rive-app/canvas@2.38.1`**:

```tsx
import { RuntimeLoader } from "@rive-app/react-canvas";

// MUST match the @rive-app/canvas version bundled by react-canvas@4.29.1.
RuntimeLoader.setWasmUrl(
  "https://unpkg.com/@rive-app/canvas@2.38.1/rive.wasm"
);
```

`RuntimeLoader` is re-exported from `@rive-app/react-canvas`, so you do not need a separate import from `@rive-app/canvas`.

---

## Step 2 — Render a `.riv` animation

```tsx
import { useRive } from "@rive-app/react-canvas";

function Avatar({ src }: { src: string }) {
  const { RiveComponent } = useRive({
    src,                       // URL to a .riv file (see Step 4)
    stateMachines: "State Machine 1",
    autoplay: true,
  });
  return <RiveComponent style={{ width: 320, height: 320 }} />;
}
```

The `RiveComponent` returned by `useRive` is a ready-to-render React component bound to its own `<canvas>`. Give it explicit width/height — a 0×0 canvas also renders blank.

---

## Step 3 — Drive an emotion from the AI's response (state machine inputs)

Animated avatars expose **state machine inputs** that you set to switch expression. Inputs come in three flavors:

- **Number** input (e.g. an `emotion` index): `input.value = 2`
- **Boolean** input (e.g. `isHappy`): `input.value = true`
- **Trigger** input (e.g. `wave`): `input.fire()`

Use `useStateMachineInput(rive, stateMachineName, inputName)` to grab one, then set it when the AI replies:

```tsx
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

const STATE_MACHINE = "State Machine 1";

// Map an AI emotion label to the avatar's numeric `emotion` input.
const EMOTION_TO_VALUE: Record<string, number> = {
  neutral: 0, happy: 1, excited: 2, thinking: 3, sad: 4,
};

function ChatAvatar({ src, emotion }: { src: string; emotion: string }) {
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: STATE_MACHINE,
    autoplay: true,
  });

  const emotionInput = useStateMachineInput(rive, STATE_MACHINE, "emotion");

  React.useEffect(() => {
    if (emotionInput) {
      emotionInput.value = EMOTION_TO_VALUE[emotion] ?? 0;
    }
  }, [emotion, emotionInput]);

  return <RiveComponent style={{ width: 320, height: 320 }} />;
}
```

> The exact state-machine name (`"State Machine 1"`) and input names (`"emotion"`, etc.) are defined by the avatar's designer inside the `.riv` file. Ask the customer for the names their animator used, or open the `.riv` in the Rive editor to read them. If `useStateMachineInput` returns `null`, the name is wrong or the file has no state machine.

You can derive `emotion` from your AI call. The platform's `openai-text-generation` endpoint returns text — ask the model to also return an emotion label (e.g. a JSON `{ "reply": "...", "emotion": "happy" }`) and feed `emotion` into `<ChatAvatar />`.

---

## Step 4 — Upload and serve `.riv` files

Upload a `.riv` binary with the `file-storage` integration's multipart endpoint, then use the returned URL as the `src`:

```tsx
async function uploadRiv(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file); // a .riv File from <input type="file">
  const res = await fetch("/api/upload/file", { method: "POST", body: form });
  const { url } = await res.json();
  return url; // pass this to <Avatar src={url} />
}
```

`.riv` files are served with a binary content type (`application/octet-stream`) and the storage bucket allows cross-origin `GET`, so Rive can fetch the file from a running app on a different origin. You can also load a `.riv` from any public `https://` URL (e.g. the customer's CDN).

---

## Common failure → fix

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Blank canvas, no error | `.wasm` URL not resolving | Call `RuntimeLoader.setWasmUrl(...)` at module scope (Step 1) |
| Blank canvas, `RiveComponent` renders | Canvas has no size | Give `RiveComponent` explicit width/height |
| `useStateMachineInput` returns `null` | Wrong state-machine / input name | Use the exact names from the `.riv` (case-sensitive) |
| Animation loads but never reacts | Input never set | Set `input.value` / call `input.fire()` on the AI response |
| WASM version mismatch errors | `.wasm` version ≠ runtime | Pin `@rive-app/canvas@2.38.1/rive.wasm` exactly |


---

# runway-recipes

Source: integrations/runway-recipes/docs.md

# Runway Recipes

Create product ads, UGC, product swaps, multi-shot videos, localized ads, marketing stock images, and product campaign images through the platform's authenticated Runway proxy. The proxy owns the Runway secret, workflow versions, wallet billing, polling, and durable media storage.

## Category
AI / Media / Advertising

## Required API Keys (Platform-Level)

The platform manages `RUNWAYML_API_SECRET`. It is never exposed to a Space app. The provider uses the documented API version header and pinned Recipe workflow versions server-side. Runtime availability is deployment/configuration-gated: `RUNWAY_GENERATION_ENABLED` defaults to `false`, and callers must handle `503 generation_disabled` or `503 provider_unavailable`. The secret is not configured in this environment; these examples are contract-validated, not live-verified.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Required API Keys" above. -->
Availability is deployment/configuration-gated and not live-verified here.
<!-- MANIFEST:END -->

## Authentication (REQUIRED)

Every submission and status request must include `X-Workspace-DB-Token: window.__workspaceDb.token`. The paid endpoint resolver checks that the credential belongs to the wallet being charged. Never accept an arbitrary workspace id as authorization.

Every `POST` submission also requires a unique `Idempotency-Key` header (1-128 characters). Reusing the key with the same workspace and normalized payload returns the original task. Reusing it with different input returns `409 idempotency_conflict`. A provider timeout is returned as `202` with `status: "uncertain"`; do not retry it by creating a second task.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/api/generate/runway/capabilities` | List supported models, Recipes, pinned versions, input requirements, and prices. |
| `POST` | `/api/generate/runway/quote` | Validate a prospective video or Recipe request and return its exact quote without auth, billing, provider work, or media fetching. |
| `POST` | `/api/generate/runway/video` | Submit supported Gen-4.5 text-to-video, Gen-4.5 image-to-video, or Gen-4 Turbo image-to-video. |
| `POST` | `/api/generate/runway/recipes/:recipeId` | Submit one of the seven allowlisted Recipes. |
| `GET` | `/api/generate/runway/status/:taskId` | Poll an owned task until its durable media outputs are ready. |

<!-- MANIFEST:ENDPOINT GET /api/generate/runway/capabilities | List supported models, Recipes, pinned versions, input requirements, and prices. -->
<!-- MANIFEST:ENDPOINT POST /api/generate/runway/quote | Validate a video or Recipe request and return its exact quote without auth, billing, provider work, or DNS/media checks. -->
<!-- MANIFEST:ENDPOINT POST /api/generate/runway/video | Submit supported Gen-4.5 or Gen-4 Turbo video generation. -->
<!-- MANIFEST:ENDPOINT POST /api/generate/runway/recipes/:recipeId | Submit one of the seven allowlisted Recipes. -->
<!-- MANIFEST:ENDPOINT GET /api/generate/runway/status/:taskId | Poll an owned task until durable outputs are ready. -->

<!-- MANIFEST:NOTES — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the Endpoints, Authentication, and Recipes sections. -->
Recipes: `product_ad`, `product_swap`, `product_ugc`, `multi_shot_video`,
`ad_localization`, `marketing_stock_image`, and `product_campaign_image`.
Every generation POST requires `X-Workspace-DB-Token` and an `Idempotency-Key`.
The quote POST does not. Read capabilities before choosing fields or pricing;
marketing stock defaults to four outputs and campaign images return four outputs.
<!-- MANIFEST:END -->

## Capabilities and pricing

Call `GET /api/generate/runway/capabilities` before rendering a form. It is the source of truth for supported model, duration, ratio, resolution, quality, audio, Recipe version, output count, and price combinations. Unknown or unpriced combinations are rejected before wallet work. `marketing_stock_image` defaults to four images and `product_campaign_image` returns four images; quotes include the selected output count.

Provider credits are priced by the platform catalog at `$0.01` per credit. Use the quote endpoint with either a video body or `{ recipeId, ...recipeFields }`; it validates catalog/input shape and pricing without DNS or provider work. Submit performs the DNS check before provider I/O. Recipe formulas and output counts differ by Recipe, so do not calculate a quote in app code or assume one output.

## Basic video generation

The normalized video body is selected from the capabilities response. Use the documented model ids and input fields returned there. The supported combinations are Gen-4.5 text-to-video, Gen-4.5 image-to-video, and Gen-4 Turbo image-to-video.

```javascript
const headers = {
  'Content-Type': 'application/json',
  'X-Workspace-DB-Token': window.__workspaceDb.token,
  'Idempotency-Key': crypto.randomUUID(),
};

const kickoff = await fetch('/api/generate/runway/video', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: 'gen4.5',
    promptText: 'A product hero shot moving through warm studio light',
    ratio: '1280:720',
    duration: 5,
  }),
}).then(async response => {
  const data = await response.json();
  if (!response.ok && response.status !== 202) throw new Error(data.error?.message || data.error);
  return data;
});
```

For image-to-video, `promptImage` is either a bounded HTTPS URI string or an ordered array of `{ uri, position: "first" | "last" }` frames. It is deliberately **not** a `{ uri }` object; Recipe media fields below do use `{ uri }`. Gen-4.5 image-to-video also requires `promptText`; Gen-4 Turbo uses image-to-video only and defaults duration to 5 seconds.

```javascript
const imageKickoff = await fetch('/api/generate/runway/video', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: 'gen4.5',
    mode: 'image-to-video',
    promptText: 'A slow premium product reveal',
    promptImage: 'https://cdn.example.com/product.png',
    ratio: '1104:832',
    duration: 5,
  }),
});

const turboKickoff = await fetch('/api/generate/runway/video', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: 'gen4_turbo',
    promptImage: [{ uri: 'https://cdn.example.com/product.png', position: 'first' }],
    ratio: '960:960',
  }),
});
```

Before any submit, reference URLs are parsed and DNS-resolved to public addresses. Private, loopback, link-local, multicast, reserved, credential-bearing, port-bearing, and non-HTTPS URLs are rejected. Reference media is **never downloaded by validation**; only provider output URLs are downloaded after a successful provider task, with bounded content type/size, redirect, timeout, and DNS checks.

## Recipes

Use the Recipe id in the route and send the fields listed by `GET /api/generate/runway/capabilities`. Recipe versions are pinned by the platform; apps must not send an unsafe latest version.

| Recipe id | Use it for | Typical inputs |
| --- | --- | --- |
| `product_ad` | A polished product advertisement | Product image, creative direction, and catalog-selected output options |
| `product_swap` | Replace the product in supported creative media | Source media, replacement product image, and catalog-selected options |
| `product_ugc` | Product-focused UGC-style creative | Product image, creator direction or script, and catalog-selected options |
| `multi_shot_video` | A video assembled from several directed shots | Ordered shot prompts and catalog-selected duration/ratio |
| `ad_localization` | Localize an existing advertisement | Source ad, target locale or locales, and catalog-selected options |
| `marketing_stock_image` | Generate a marketing stock image | Commercial image prompt and catalog-selected image options |
| `product_campaign_image` | Generate a campaign image set | Product image, campaign direction, and catalog-selected options |

Example helper for every Recipe:

```javascript
const quote = await fetch('/api/generate/runway/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipeId: 'product_ad',
    productImages: [{ uri: 'https://cdn.example.com/product.png' }],
  }),
}).then(response => response.json());

async function runRecipe(recipeId, input) {
  const response = await fetch(`/api/generate/runway/recipes/${encodeURIComponent(recipeId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-DB-Token': window.__workspaceDb.token,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok && response.status !== 202) {
    throw new Error(data.error?.message || data.error || 'Runway Recipe failed');
  }
  return data;
}

const productAd = await runRecipe('product_ad', {
  productImages: [{ uri: 'https://cdn.example.com/product.png' }],
  userConcept: 'A clean studio product ad with a premium editorial finish',
});
const productSwap = await runRecipe('product_swap', {
  referenceVideo: { uri: 'https://cdn.example.com/source.mp4' },
  originalProductImage: { uri: 'https://cdn.example.com/original.png' },
  newProductImages: [{ uri: 'https://cdn.example.com/replacement.png' }],
});
const productUgc = await runRecipe('product_ugc', {
  characterImage: { uri: 'https://cdn.example.com/creator.png' },
  productImage: { uri: 'https://cdn.example.com/product.png' },
  userConcept: 'Show how this product fits into a busy morning routine.',
});
const multiShot = await runRecipe('multi_shot_video', {
  prompt: 'Wide product setup followed by a close-up detail shot',
  mode: 'auto',
  duration: 10,
});
const localized = await runRecipe('ad_localization', {
  referenceImage: { uri: 'https://cdn.example.com/ad.png' },
  targetLanguage: 'fr',
});
const stockImage = await runRecipe('marketing_stock_image', {
  prompt: 'Bright editorial image for a sustainable skincare campaign',
  quality: 'high',
});
const campaignImages = await runRecipe('product_campaign_image', {
  image: { uri: 'https://cdn.example.com/product.png' },
  prompt: 'Four coordinated campaign images with a premium studio look',
});
```

The URLs above illustrate public HTTPS inputs. Use real, accessible reference assets from your app or the file-storage integration, not provider URLs that expire. `marketing_stock_image` and `product_campaign_image` return four outputs by default; render all returned outputs rather than taking only index zero.

## Polling and durable outputs

```javascript
async function pollRunway(taskId) {
  for (;;) {
    const response = await fetch(`/api/generate/runway/status/${encodeURIComponent(taskId)}`, {
      headers: { 'X-Workspace-DB-Token': window.__workspaceDb.token },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || result.error);
    if (result.status === 'succeeded') return result;
    if (['failed', 'cancelled'].includes(result.status)) {
      throw new Error(`Runway task ended ${result.status}: ${result.error?.message || 'no successful output'}`);
    }
    if (result.status === 'uncertain') {
      throw new Error('Runway task outcome is uncertain; do not submit a duplicate.');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

Statuses are `admitting`, `charged`, `submitting`, `queued`, `running`, `throttled`, `succeeded`, `failed`, `cancelled`, `uncertain`, and `persisting`. Only `succeeded` is success and it contains only durable platform media URLs and media ids. `uncertain` means provider acceptance or settlement cannot be reconciled; never call it successful and never create a duplicate. `failed` and `cancelled` trigger refund settlement, but `refund_pending` or `refund_uncertain` remain non-success states requiring reconciliation. `persisting` means polling may be retried without creating a new generation or charge. Insufficient funds, disabled generation, missing secret, unavailable storage, and other `4xx`/`5xx` responses are errors, never successful task results.


---

# stock-photos

Source: integrations/stock-photos/docs.md

# Stock Photos Integration (Unsplash)

Search the Unsplash library for royalty-free, attribution-friendly photography. Use the URLs in `<img>` tags, as hero backgrounds, or as starting material for image-edit AI tools.

## Category
Media / Images

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `UNSPLASH_ACCESS_KEY`

---

## API Endpoints

### Search Photos
```
GET /api/stock-photos?query=...&perPage=10&orientation=landscape
```

| Param | Type | Notes |
|-------|------|-------|
| `query` (or `q`) | string | Required. Search keywords. |
| `perPage` | number | Optional. 1–30. Default 10. |
| `orientation` | string | Optional. One of `landscape`, `portrait`, `squarish`. |
| `workspaceId` | string | Optional. Used for usage attribution. |

**Response:**
```json
{
  "success": true,
  "query": "mountains",
  "perPage": 10,
  "results": [
    {
      "id": "abc123",
      "description": "Snow-capped mountain range at dawn",
      "altDescription": "...",
      "urls": {
        "thumb": "https://images.unsplash.com/.../thumb",
        "small": "https://images.unsplash.com/.../small",
        "regular": "https://images.unsplash.com/.../regular",
        "full": "https://images.unsplash.com/.../full",
        "raw": "https://images.unsplash.com/.../raw"
      }
    }
  ]
}
```

---

## Installation Helper

```javascript
export const stockPhotos = {
  async search(query, { perPage = 10, orientation } = {}) {
    const params = new URLSearchParams({ query, perPage: String(perPage) });
    if (orientation) params.set('orientation', orientation);
    const r = await fetch(`/api/stock-photos?${params}`);
    const { results } = await r.json();
    return results;
  },
};
```

## Use Cases
- Hero/section background images
- Card thumbnails when the user hasn't uploaded their own asset yet
- Mood-board / inspiration grids
- Starting frames for image-edit workflows (gemini-vision-transform, google-veo3)

## Attribution
Unsplash photos are free to use, but giving credit to the photographer is encouraged. The `id` field is the canonical Unsplash photo ID — link back to `https://unsplash.com/photos/<id>` where possible.


---

# video-clip

Source: integrations/video-clip/docs.md

# Video Clip / Trim Integration

Trim a source video to a single `[startSec, endSec]` segment server-side with ffmpeg and get back a permanent public MP4 URL on GCS. Use it to produce clean clips for the Raw-to-Post flow or social sharing without bundling ffmpeg.wasm in the browser or paying for a full Remotion render just to cut a video.

## Category
Media / Video

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `GCS_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_CREDENTIALS` (clip storage)

---

## API Endpoints

### Trim a Clip
```
POST /api/video/clip
```

**Request:**
```json
{
  "videoUrlOrKey": "https://storage.googleapis.com/.../source.mp4",
  "startSec": 12.5,
  "endSec": 27,
  "workspaceId": "ws_optional"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `videoUrl` | string (https) | Public URL of the source video. Alias of `videoUrlOrKey`. |
| `videoUrlOrKey` | string | Public https URL **or** a GCS object key. One of `videoUrl`/`videoUrlOrKey` required. |
| `startSec` | number | Segment start in seconds (float OK). Must be ≥ 0. |
| `endSec` | number | Segment end in seconds. Must be greater than `startSec`. |
| `workspaceId` | string | Optional. Clips get namespaced under `workspaces/<id>/clips/`. When present, the call is wallet-gated (auto-refunds on failure). |

**Response:**
```json
{
  "success": true,
  "url": "https://storage.googleapis.com/.../<id>-12500-27000.mp4",
  "key": "workspaces/ws_123/clips/<id>-12500-27000.mp4",
  "durationSec": 14.5
}
```

---

## Installation Helper

```javascript
export const videoClip = {
  async trim(videoUrlOrKey, startSec, endSec, workspaceId) {
    const r = await fetch('/api/video/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrlOrKey, startSec, endSec, workspaceId }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Clip failed');
    return data; // { url, key, durationSec }
  },
};
```

## Use Cases
- Raw-to-Post: cut a clean segment out of a raw upload before publishing
- Social clip trimming (highlight reels, teasers)
- Producing short shareable clips without a full Remotion render
- Pre-trimming footage before frame extraction or AI video analysis

## Limits
- `endSec` must be greater than `startSec`
- Max clip duration is 10 minutes per call
- ffmpeg timeout scales with clip length (60s floor, 10 min ceiling)
- Output is always MP4 (stream-copy when possible, re-encode fallback for clean cuts)


---

# video-frames

Source: integrations/video-frames/docs.md

# Video Frame Extraction Integration

Pull still PNG frames out of any video URL at the timestamps you specify. Powered by ffmpeg server-side; returns public GCS URLs you can use as thumbnails, scrubber previews, or AI vision inputs.

## Category
Media / Video

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `GCS_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_CREDENTIALS` (frame storage)

---

## API Endpoints

### Extract Frames
```
POST /api/video/frames
```

**Request:**
```json
{
  "videoUrl": "https://storage.googleapis.com/.../clip.mp4",
  "timestamps": [0, 1.5, 3, 5, 10],
  "workspaceId": "ws_optional"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `videoUrl` | string (http/https) | Public URL of the source video. Required. |
| `timestamps` | number[] | Seconds (float OK). 1–20 values per call. |
| `workspaceId` | string | Optional. Frames get namespaced under `workspaces/<id>/video-frames/`. |

**Response:**
```json
{
  "success": true,
  "frames": [
    { "timestamp": 0, "url": "https://storage.googleapis.com/.../frame-0.png" },
    { "timestamp": 1.5, "url": "https://storage.googleapis.com/.../frame-1.png" }
  ]
}
```

---

## Installation Helper

```javascript
export const videoFrames = {
  async extract(videoUrl, timestamps, workspaceId) {
    const r = await fetch('/api/video/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, timestamps, workspaceId }),
    });
    const { frames } = await r.json();
    return frames;
  },
};
```

## Use Cases
- Video thumbnails and scrubber preview strips
- Hero stills for share cards
- Frame-by-frame review tools
- Feeding frames into vision LLMs (gemini-vision-transform, document-analysis)

## Limits
- Max 20 timestamps per request
- 30s ffmpeg timeout per frame
- Output is always PNG


---

# video-overlay

Source: integrations/video-overlay/docs.md

# Video Overlay / Timed Portrait B-roll Integration

Composite **timed full-frame overlays** (B-roll clips or still images) onto an existing talking-head MP4 with server-side ffmpeg, and get back one permanent public **1080×1920** MP4 on GCS. An optional `music_url` mixes a ducked music bed on that same encode, and optional `captions` burn in timed caption plates. Use this when a HeyGen (or other) portrait presenter is already rendered and you need B-roll to appear over it at stored timecodes — e.g. a Reel / TikTok / Shorts talking-head with product footage at 17.5s and 25s.

This is **real overlay compositing**, not concatenation and not a browser `canvas.captureStream()` recording. The server downloads the base and every overlay, cover-scales each to 1080×1920, overlays them with `enable='between(t,start,end)'`, keeps the **base audio**, uploads the result to GCS, and verifies the object exists and is non-empty before reporting success. Output duration is the longest of the talking-head, the last overlay `end_time`, and optional `duration_seconds` — if HeyGen returns a 24s master and B-roll is planned at 26s, the compositor freeze-frames the last talking-head frame (and pads audio) so that overlay still appears. Do **not** fake this in app code (canvas compositor, looping `<video>` tags) — call this endpoint.

> Difference from the other video endpoints:
> - `video-stitch` (`POST /api/workspaces/:workspaceId/videos/stitch`) **concatenates** clips and **normalizes output to 1280×720**. It cannot overlay B-roll and must not be used for a portrait export.
> - `video-clip` (`POST /api/video/clip`) **cuts** one segment out of a single source video.
> - `google-veo3` `POST /api/veo/generate-long-video` **generates** new clips and auto-stitches them (also landscape 1280×720).
> - `remotion-rendering` public `POST /api/render/remotion` is locked to **1920×1080**.
> - **This endpoint overlays existing clips onto an existing portrait base** at 1080×1920. It does not generate footage.

## Category
Media / Video

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `GCS_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_CREDENTIALS` (composited-video storage)
- ffmpeg is provided by the platform.

---

## API Endpoints

### Overlay Timed B-roll onto a Portrait Base
```
POST /api/workspaces/:workspaceId/videos/overlay
```

**Request:**
```json
{
  "base_video_url": "https://storage.googleapis.com/.../heygen-talking-head.mp4",
  "overlays": [
    {
      "asset_url": "https://storage.googleapis.com/.../broll-1.mp4",
      "start_time": 17.5,
      "end_time": 21.5,
      "position": "full"
    },
    {
      "asset_url": "https://storage.googleapis.com/.../broll-2.mp4",
      "start_time": 25,
      "end_time": 29,
      "position": "full"
    }
  ],
  "dimensions": { "width": 1080, "height": 1920 },
  "output_format": "mp4",
  "duration_seconds": 30
}
```

| Field | Type | Notes |
|-------|------|-------|
| `base_video_url` | string | Public MP4 URL of the talking-head (or other) base. Its audio is kept. |
| `overlays` | object[] | Timed overlays, applied in `start_time` order. Still images (`.png`, `.jpg`, `.webp`, …) are looped for the slot. |
| `overlays[].asset_url` | string | Public URL of the overlay clip or still. |
| `overlays[].start_time` | number | Seconds from the start of the base. |
| `overlays[].end_time` | number | Seconds from the start of the base. Must be greater than `start_time`. |
| `overlays[].position` | `"full"` | Full-frame only in this ship. Omit or send `"full"`. PiP is not supported. |
| `dimensions` | `{ width, height }` | **Must be `{ "width": 1080, "height": 1920 }`**. Any other size is rejected with 400 so a landscape export cannot happen silently. |
| `output_format` | `"mp4"` | Optional; only `mp4` is accepted. |
| `duration_seconds` | number | Optional planned reel length. Output is `max(base duration, last overlay end, duration_seconds)`. Never shorter than the last overlay. |
| `music_url` | string | Optional public http(s) URL of a music bed. Looped to the output length, mixed once on the final encode. |
| `music_volume` | number | Optional linear gain for the bed. Clamped to 0.05–1. Default `0.2`. |
| `captions` | object[] | Optional burned-in captions: `{ asset_url, start_time, end_time }` per window. Each `asset_url` is a transparent **1080×1920 PNG** plate with the caption already drawn. Windows may touch but not overlap. Up to 200. Drawn above the grade and dips, under `layer: "graphic"` plates. Switches on the assembly renderer and counts toward its 180 s limit. |

### Assembly directives (color grade, transitions, per-clip motion)

Add an `assembly` object (or the same object under its Brain name `production_directives` — send one, not both) to render an edited reel instead of plain hard cuts. Values are a closed enum; unknown keys or values return `400` naming the field. Some Brain fields are accepted and not rendered: `music_mood`, `clip_transition_style`, `transitions[].intensity`, and `clip_effects[].scale` / `duration_frames` / `color_grade`. They show up in `assembly.ignored`. These Brain values are mapped and reported the same way. For `color_grade`: `cinematic_contrast`, `noir` and `triumphant` → `cinematic`; `golden_hour` → `warm`; `high_key_clean` → `neutral`; `moody_cool` and `desaturated_moody` → `cool`. For `transitions[].type`: `smash_cut` and `whip_cut` → `hard_cut`. Any other value still returns 400.

```json
{
  "base_video_url": "https://.../heygen.mp4",
  "overlays": [
    { "asset_url": "https://.../broll-1.mp4", "start_time": 3, "end_time": 6, "slot": 1, "source_start": 2, "source_end": 5 },
    { "asset_url": "https://.../broll-2.mp4", "start_time": 6, "end_time": 9, "slot": 2 },
    { "asset_url": "https://.../product.png", "start_time": 14, "end_time": 17, "slot": 3, "fade_out": true },
    { "asset_url": "https://.../watermark.png", "start_time": 0, "end_time": 30, "layer": "graphic" }
  ],
  "assembly": {
    "color_grade": "warm",
    "pacing": "fast_cut",
    "transitions": [
      { "before_slot": 1, "type": "dip_to_black" },
      { "before_slot": 2, "type": "whip_pan", "duration": 0.25 }
    ],
    "clip_effects": [
      { "slot": 1, "effect": "zoom_punch", "intensity": 0.6 },
      { "slot": 3, "effect": "ken_burns" }
    ]
  },
  "dimensions": { "width": 1080, "height": 1920 },
  "duration_seconds": 30
}
```

| Field | Values | Notes |
|-------|--------|-------|
| `color_grade` | `warm` `cool` `neutral` `cinematic` `brand` | Applied to the presenter and B-roll. `layer: "graphic"` plates and captions sit above it ungraded. Brain aliases are listed above. |
| `style` | `energetic` `documentary` `cinematic` `clean` | Accepted for the record; send the concrete fields you want. |
| `pacing` | `fast_cut` `slow_reveal` | Default transition length: 0.18 s / 0.45 s (0.25 s otherwise). |
| `transitions[].before_slot` | integer ≥ 1 | The transition belongs to the **incoming** B-roll slot. |
| `transitions[].type` | `hard_cut` `cross_dissolve` `zoom_transition` `dip_to_black` `whip_pan` | `duration` optional, clamped to 0.05–1.5 s. Aliases: `smash_cut` and `whip_cut` → `hard_cut`. |
| `clip_effects[].slot` | integer ≥ 1 | |
| `clip_effects[].effect` | `zoom_punch` `ken_burns` `speed_ramp` `none` | `intensity` optional (0.05–1, default 0.5). `speed_ramp` applies to video only. `direction` (≤ 24 chars) is accepted and ignored. |

New overlay fields (any of them also switches on the assembly renderer):

| Field | Notes |
|-------|-------|
| `slot` | 1-based slot the directives bind to. Defaults to B-roll start order. Two B-roll overlays with the same slot → 400. |
| `layer` | `"broll"` (default) or `"graphic"` — watermark, hook text, captions. Graphics take no slot, trim, or `fade_out`. |
| `source_start` / `source_end` | In/out points inside the asset, in seconds. When the window is longer than the (trimmed) clip, it loops from `source_start`. |
| `hold_last_frame` | `true` holds the clip's last frame for the rest of its window instead of looping it. B-roll only. |
| `fade_out` | Dip to black as this clip ends. |

How it renders: blends between contiguous clips (gap ≤ 0.1 s) keep the outgoing clip playing underneath; at other edges the clip fades to and from the presenter. A 0.4 s dip to black lands at the end of every `fade_out` clip, on `dip_to_black` cuts, and — when an `assembly` block is sent — after any clip followed by a gap longer than 1.5 s. `zoom_transition` and `whip_pan` push or slide in only over a contiguous cut. Assembly renders are limited to 180 s.

Directives for a slot with no B-roll overlay, and repeated entries for the same slot (the first one applies), are reported rather than rejected.

**Response (success):**
```json
{
  "success": true,
  "overlayUrl": "https://storage.googleapis.com/.../<workspaceId>_overlay_<ts>.mp4",
  "video": {
    "id": "vid_...",
    "workspaceId": "...",
    "status": "completed",
    "videoUrl": "https://storage.googleapis.com/.../<workspaceId>_overlay_<ts>.mp4"
  },
  "assembly": {
    "color_grade": "warm",
    "transitions_applied": [{ "before_slot": 2, "type": "whip_pan", "duration": 0.25 }],
    "clip_effects_applied": [{ "slot": 1, "effect": "zoom_punch", "intensity": 0.6 }],
    "ignored": ["transitions[2]: slot 7 has no B-roll overlay"]
  },
  "music": { "applied": true, "volume": 0.2, "ducked": true },
  "captions": { "applied": true, "count": 24 }
}
```

`music` is present only when the request included `music_url` and the bed was mixed. `ducked` is true when the base had a speech track to duck under. `captions` is present only when the request included `captions` and they were burned in — if you sent captions and the response has no `captions` key, the server did not draw them.

`overlayUrl` is the composited 1080×1920 MP4 (30 fps, H.264 + AAC, `+faststart`). The same video is also saved to the workspace video catalog (`status: "completed"`). `assembly` appears only when the request used directives or the new overlay fields — if you sent directives and the response has no `assembly` key, the server did not apply them.

**Response (failure):**
```json
{ "success": false, "error": "....", "walletRefunded": true }
```

- `400` — missing `base_video_url`, dimensions other than 1080×1920, inverted overlay times, a non-`full` position, an unknown assembly key or value, a `music_url` that is not http(s), a non-numeric `music_volume`, overlapping caption windows, a caption plate that is not a 1080×1920 PNG, duplicate B-roll slots, or an assembly render over 180 s.
- `402` — insufficient wallet balance (no charge made).
- `503` — persistent storage (GCS) not configured; overlay is refused rather than returning an ephemeral local URL.
- `500` — the overlay failed (ffmpeg missing, an asset could not be downloaded, or the MP4 was missing/empty in GCS). The wallet charge is **auto-refunded** (`walletRefunded: true`).

The endpoint never returns `success: true` unless a non-empty 1080×1920 MP4 was actually produced **and verified in GCS**.

---

## ffmpeg behavior

- Scale **the base and each overlay** with `force_original_aspect_ratio=increase` then `crop=1080:1920` (cover, not stretch, not letterbox).
- Overlay with `overlay=enable='between(t,start,end)'` in start-time order. Each overlay's timestamps are delayed so the clip begins at `start_time`, not at t=0 of the source file.
- Keep **base audio** (`-map 0:a`). If the base has no audio stream, a silent stereo track is synthesized.
- When `music_url` is set, loop that bed (`-stream_loop -1`), trim it to the output duration, and mix it once on the final encode. If the base has speech, duck the bed under it (`sidechaincompress`) at `music_volume` (default 0.2). If the base has no audio, the bed is the audio track and is not ducked. A bed with no audio stream fails the render and refunds the charge. A request without `music_url` uses the same ffmpeg arguments as before.
- When `captions` is set, every plate plays from one concat-demuxer track (transparent between windows), so 25 captions add one ffmpeg input, not 25. Window edges land on 40 ms steps.
- Output is 30 fps, `libx264`, `yuv420p`, AAC, `+faststart`.

Cover-scaling cannot remove letterbox bars that are **already burned into** the base pixels. For a talking-head that fills the phone, generate the HeyGen source with v3 `aspect_ratio: "9:16"` and `fit: "cover"` first, then call this endpoint.

---

## Cost & Wallet Safety

- A flat render compute cost is charged per overlay call (downloads + re-encode, similar to stitch).
- The charge is taken up front and **idempotently refunded** automatically if the overlay fails or produces no verified output.

---

## Installation Helper

```javascript
export const videoOverlay = {
  async composite(workspaceId, { baseVideoUrl, overlays, assembly, musicUrl, musicVolume, captions }) {
    const r = await fetch(`/api/workspaces/${workspaceId}/videos/overlay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-DB-Token': window.__workspaceDb?.token,
      },
      body: JSON.stringify({
        base_video_url: baseVideoUrl,
        overlays,
        dimensions: { width: 1080, height: 1920 },
        output_format: 'mp4',
        ...(assembly ? { assembly } : {}),
        ...(musicUrl ? { music_url: musicUrl, music_volume: musicVolume } : {}),
        ...(captions?.length ? { captions } : {}),
      }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Portrait overlay failed');
    return data; // { overlayUrl, video, assembly?, music?, captions? }
  },
};
```

## Use Cases
- Overlay approved 9:16 B-roll onto a HeyGen talking-head at Brain timecodes
- Hold a still product photo over the presenter for a slot
- Render Brain `production_directives` (grade, transitions, zoom / Ken Burns / speed ramp) server-side instead of a browser canvas
- Mix a music bed under the HeyGen voice without a browser recorder
- Burn in word-synced captions rendered as PNG plates, without a browser recorder
- Re-encode a portrait master to a verified 1080×1920 GCS MP4 even with no overlays

## Limits
- Dimensions other than 1080×1920 are rejected.
- Full-frame overlays only (`position: "full"`). Picture-in-picture is not supported on this endpoint.
- The call is synchronous — it returns once the MP4 is uploaded and verified (expect several seconds to a minute depending on duration and overlay count).
- Output is always MP4. Do not use `videos/stitch` or public Remotion for a portrait overlay export.


---

# video-stitch

Source: integrations/video-stitch/docs.md

# Video Stitch / Merge Existing Clips Integration

Merge an **ordered list of existing video clips** into a single playable MP4 server-side with ffmpeg, and get back one permanent public MP4 URL on GCS. Use this when the user already has multiple clips (uploaded, AI-generated, or trimmed) and wants them concatenated into one continuous video — e.g. a commercial assembled from several scenes, a highlight reel, or a multi-shot social video.

This is **real concatenation**, not playback of clips back-to-back: the server downloads every clip, normalizes them, concatenates them with ffmpeg, uploads the result to GCS, and verifies the output exists and is non-empty before reporting success. Do **not** fake stitching in app code (looping `<video>` tags, fake progress bars) — call this endpoint.

> Difference from the other video endpoints:
> - `video-clip` (`POST /api/video/clip`) **cuts** one segment out of a single source video.
> - `google-veo3` `POST /api/veo/generate-long-video` **generates** brand-new clips from prompts and auto-stitches them.
> - **This endpoint merges clips that already exist** into one MP4. It does not generate anything.

## Category
Media / Video

## Required API Keys (Platform-Level)

Handled by platform — no per-workspace setup.

- `GCS_BUCKET_NAME`, `GCP_PROJECT_ID`, `GCP_CREDENTIALS` (stitched-video storage)
- ffmpeg is provided by the platform.

---

## API Endpoints

### Merge Existing Clips
```
POST /api/workspaces/:workspaceId/videos/stitch
```

**Request (by URL):**
```json
{
  "videoUrls": [
    "https://storage.googleapis.com/.../clip-1.mp4",
    "https://storage.googleapis.com/.../clip-2.mp4",
    "https://storage.googleapis.com/.../clip-3.mp4"
  ]
}
```

**Request (by catalog ID):**
```json
{
  "videoIds": ["vid_abc", "vid_def", "vid_ghi"]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `videoUrls` | string[] | Ordered list of public MP4 URLs to merge. Order is preserved in the output. At least **2** required. |
| `videoIds` | string[] | Alternative to `videoUrls`: IDs of videos already in the workspace catalog. Resolved to their URLs server-side. At least **2** resolvable required. |

Provide **either** `videoUrls` **or** `videoIds`. When both are sent, `videoIds` takes precedence.

**Response (success):**
```json
{
  "success": true,
  "stitchedUrl": "https://storage.googleapis.com/.../<workspaceId>_stitched_<ts>.mp4",
  "video": {
    "id": "vid_...",
    "workspaceId": "...",
    "status": "completed",
    "videoUrl": "https://storage.googleapis.com/.../<workspaceId>_stitched_<ts>.mp4"
  }
}
```

`stitchedUrl` is the merged MP4. The same video is also saved to the workspace video catalog (`status: "completed"`).

**Response (failure):**
```json
{ "success": false, "error": "....", "walletRefunded": true }
```

- `402` — insufficient wallet balance (no charge made).
- `503` — persistent storage (GCS) not configured; stitching is refused rather than returning an ephemeral local URL.
- `500` — the stitch failed (ffmpeg missing, a clip could not be downloaded, or the merged MP4 was missing/empty in GCS). The wallet charge is **auto-refunded** (`walletRefunded: true`).

The endpoint never returns `success: true` unless a non-empty MP4 was actually produced **and verified in GCS** — there is no fake-success / ephemeral-local-URL path.

---

## Cost & Wallet Safety

- A flat render compute cost is charged per stitch call (heavier than a single-clip trim because every clip is downloaded and re-encoded/normalized).
- The charge is taken up front and **idempotently refunded** automatically if the stitch fails or produces no verified output, mirroring the Cloud Run render safety pattern.

---

## Installation Helper

```javascript
export const videoStitch = {
  // urlsOrIds: ordered array. Pass clip URLs, or pass { videoIds } for catalog IDs.
  async merge(workspaceId, videoUrls) {
    const r = await fetch(`/api/workspaces/${workspaceId}/videos/stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrls }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Stitch failed');
    return data; // { stitchedUrl, video }
  },

  async mergeByIds(workspaceId, videoIds) {
    const r = await fetch(`/api/workspaces/${workspaceId}/videos/stitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoIds }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Stitch failed');
    return data; // { stitchedUrl, video }
  },
};
```

## Use Cases
- Assemble a commercial / ad from several existing scene clips into one MP4
- Merge AI-generated clips (from Veo) that were produced separately into one video
- Build a highlight reel from trimmed clips
- Concatenate uploaded footage into a single deliverable

## Limits
- At least 2 clips are required.
- The call is synchronous — it returns once the merged MP4 is uploaded and verified (expect several seconds to a minute depending on clip count/length).
- Output is always MP4 (clips are normalized then concatenated).
- This is plain concatenation only — no transitions, trimming, or audio mixing. Trim clips first with `video-clip` if you need to cut them before merging.


---

## AI text and audio

# ai-phone-calls

Source: integrations/ai-phone-calls/docs.md

# AI Phone Calls Integration

Make and receive AI-powered phone calls on behalf of workspace customers using Retell AI or ElevenLabs.

## Category
Communication / Voice

## Required API Keys (Platform-Level)

All API keys are stored as platform-level secrets (Replit secrets), NOT per workspace. Workspaces share the platform's phone infrastructure. There is no API endpoint to configure provider credentials — they are managed by the platform admin.

- `RETELL_API_KEY` — Retell AI API key (recommended provider)
- OR `ELEVENLABS_API_KEY` — ElevenLabs API key (alternative provider)

**The voice provider credential is platform-only, by design and permanently.**
One credential covers the whole platform provider account — every workspace's
agents, numbers and call media — so it is never handed to a workspace, a server
function, an app, or a proxy that forwards arbitrary provider calls, and no
request for it can be granted. Everything a workspace legitimately needs it for
is available without it: the
[provider storage controls](#provider-storage-controls) on the agent API, and
the `platform.phone` capability in Server Functions (list and read your own
calls, copy a recording into your own private storage, purge the provider's
copy).

## Concepts

- **AI Voice Agent** — A configured AI agent that can conduct phone conversations with natural-sounding voice, following custom instructions and using workspace context.
- **Workspace-Scoped Agent** — An agent created via the API, tagged with a workspace ID using the naming convention `ws_{workspaceId}::{identifier}`. This ensures workspace isolation — each workspace can only see and manage its own agents.
- **Agent Identifier** — Either `default` (the workspace's main agent) or an email address (for contact-specific agents, e.g., `vip@customer.com`).
- **Agent Tools** — Custom functions an agent can call mid-conversation to look up live data. Tools are backed by Server Functions (hooks) in the same workspace.
- **Outbound Call** — An AI-initiated phone call to a customer for appointment reminders, lead qualification, follow-ups, etc.
- **Inbound Call** — A customer calls the workspace's phone number and speaks with the AI agent.
- **Batch Calling** — Initiate multiple outbound calls simultaneously for campaigns (reminders, surveys, alerts).
- **Call Transcript** — Automatic transcription of the full conversation, stored for review and analysis.
- **Auto-Resolve** — When making a call, if no specific agentId is provided, the system automatically resolves the best agent: contact-specific agent (by email) → workspace default agent → config-level fallback.

---

## Provider Comparison

| Feature | Retell AI | ElevenLabs + Twilio |
|---------|-----------|-------------------|
| Pricing | $0.07/min flat | ~$0.10-0.15/min combined |
| Voice Quality | Natural, low latency | Premium, most natural |
| Batch Calling | Native | Via API |
| Branded Caller ID | Yes | Via Twilio |
| Agent Management | Full API (create/list/update/delete) | Manual setup |
| Mid-Call Tools | Yes (custom functions) | Limited |
| Compliance | SOC 2, HIPAA, GDPR | SOC 2, HIPAA, GDPR |
| Setup Complexity | Low | Medium |
| Languages | 30+ | 32+ |

**Recommendation:** Retell AI for fastest setup, agent management, and mid-call tools. ElevenLabs for premium voice quality.

---

## API Endpoints

All endpoints are scoped to a workspace via the URL path.

### Phone Configuration (Auto-Provisioned)

**You do not need to configure the phone number manually.** The platform automatically provisions the outbound phone number for your workspace the first time a call is made. All you need to do is create an agent with your prompt — the platform handles the rest.

The config is created automatically when your workspace makes its first outbound call, using the platform's shared phone number and your workspace's default agent.

### Get Phone Config
```
GET /api/workspaces/:workspaceId/phone/config
```

Returns the current phone configuration for the workspace. This will be empty until the first call is made (which triggers auto-provisioning).

The response includes `postCallHook`: the server function nominated to run after
a call finishes with a recording, or `null` when none is nominated (the
default).

### Post-call trigger

```
POST /api/workspaces/:workspaceId/phone/config
{ "provider": "retell", "agentId": "agent_abc123", "phoneNumber": "+15551234567",
  "postCallHook": "archive-recording" }
```
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/phone/config | Set Phone Config, including the optional `postCallHook` server function -->

`postCallHook` names **one of this workspace's own server functions**. It runs
after a provider callback that carries a recording, so a copy-then-purge happens
within seconds of hang-up. Rules:

- The name must be a server function registered in this workspace; a name that
  is not gets a `400` at write time rather than silently never running.
- Send `"postCallHook": ""` (or `null`) to turn the trigger off. Omit the field
  entirely to leave it as it is.
- Unset means nothing is dispatched — the state of every workspace by default.
- Dispatch happens **after** the callback has been answered, so a slow or
  failing function never delays or fails the provider callback. Its outcome is
  recorded on the call (`metadata.postCallHook`) where you can see it.

The function receives:

```json
{ "event": "call_recording_available", "callId": "...", "providerCallId": "..." }
```

---

## Agent Management

Manage AI phone agents scoped to a workspace. Agents are stored directly in Retell (no local database table) and tagged with the workspace ID using the naming convention `ws_{workspaceId}::{identifier}`.

**Workspace isolation:** Every endpoint filters agents by the workspace ID prefix. A workspace can never see, modify, or delete another workspace's agents.

### Create an Agent
```
POST /api/workspaces/:workspaceId/phone/agents
```

Creates a new Retell LLM + Agent pair tagged with the workspace ID.

**Request:**
```json
{
  "prompt": "You are a friendly receptionist for Acme Dental. Greet callers warmly, answer questions about office hours (9-5 M-F), and take messages for the dentist.",
  "identifier": "default",
  "voiceId": "11labs-Cimo",
  "language": "en-US"
}
```

- `prompt` — Required. The instructions for the agent (what it says, how it behaves).
- `identifier` — Optional. Defaults to `"default"`. Use `"default"` for the workspace's main agent, or an email like `"vip@customer.com"` for a contact-specific agent.
- `voiceId` — Optional. Retell voice ID. Defaults to `"11labs-Cimo"`.
- `language` — Optional. Language code. Defaults to `"en-US"`.
- `tools` — Optional. Array of tools the agent can use mid-call (see Tools section below).
- `dataStorageSetting` — Optional. How much of a call the **voice provider** keeps
  for this agent. See [Provider storage controls](#provider-storage-controls).
  Omitted leaves the provider's own default (`everything`).
- `optInSignedUrl` — Optional boolean. When `true`, the provider returns signed,
  expiring recording URLs instead of plain ones. Omitted leaves the provider
  default (`false`).

**Response:**
```json
{
  "agentId": "agent_abc123def456",
  "llmId": "llm_xyz789",
  "agentName": "ws_workspace-123::default",
  "tools": [],
  "dataStorageSetting": "everything",
  "optInSignedUrl": false
}
```

### Create a Contact-Specific Agent

An entrepreneur may want different agents for different customers:

```json
{
  "prompt": "You are speaking with a VIP customer. Be extra attentive, offer premium support, and prioritize their requests.",
  "identifier": "vip@customer.com"
}
```

This creates an agent named `ws_{workspaceId}::vip@customer.com`. When making a call to this contact (using `contactEmail`), this agent is automatically selected over the workspace default.

### List Agents
```
GET /api/workspaces/:workspaceId/phone/agents
```

Returns all agents belonging to this workspace.

**Response:**
```json
{
  "agents": [
    {
      "agentId": "agent_abc123",
      "agentName": "ws_workspace-123::default",
      "voiceId": "11labs-Cimo",
      "language": "en-US",
      "llmId": "llm_xyz789"
    },
    {
      "agentId": "agent_def456",
      "agentName": "ws_workspace-123::vip@customer.com",
      "voiceId": "11labs-Cimo",
      "language": "en-US",
      "llmId": "llm_abc123"
    }
  ]
}
```

### Get a Specific Agent
```
GET /api/workspaces/:workspaceId/phone/agents/:agentId
```
<!-- MANIFEST:ENDPOINT GET /api/workspaces/:workspaceId/phone/agents/:agentId | Get a Specific Agent (returns `dataStorageSetting`, `optInSignedUrl`) -->

Returns the agent details, including the two provider storage controls
(`dataStorageSetting`, `optInSignedUrl`), so you can confirm what is in force.
Returns 404 if the agent doesn't belong to this workspace.

### Update an Agent
```
PATCH /api/workspaces/:workspaceId/phone/agents/:agentId
```
<!-- MANIFEST:ENDPOINT PATCH /api/workspaces/:workspaceId/phone/agents/:agentId | Update an Agent (prompt and/or provider storage controls) -->

Updates the prompt, the provider storage controls, or both. At least one of
`prompt`, `dataStorageSetting` or `optInSignedUrl` is required.

**Request:**
```json
{
  "prompt": "Updated instructions: You are now also able to schedule appointments...",
  "dataStorageSetting": "everything_except_pii",
  "optInSignedUrl": true
}
```

**Response:**
```json
{
  "agentId": "agent_abc123",
  "agentName": "ws_workspace-123::default",
  "updated": true,
  "dataStorageSetting": "everything_except_pii",
  "optInSignedUrl": true
}
```

The update edits the agent in place: it does **not** cut a new agent version, so
a phone number bound to the agent stays bound and picks up the change on its
next call. Returns 404 if the agent doesn't belong to this workspace.

### Provider storage controls

Two fields on the agent decide how much the voice provider itself keeps. They
are accepted on create and on update, and returned on read.

`dataStorageSetting` — one of exactly:

| Value | What the provider keeps |
|-------|--------------------------|
| `everything` | Provider default. Full transcript and recording. |
| `everything_except_pii` | The call, with personally identifiable information stripped. |
| `basic_attributes_only` | Basic call attributes only — **no transcript and no recording**. |

Anything else is rejected with `400` and a message naming the accepted values.

**Who may set them.** The two storage controls are authorized writes: the
request must carry a platform principal that is a member of this workspace
(the same sign-in your workspace tools use). Without one the request answers
`401` and nothing is changed at the provider — `basic_attributes_only` blinds
every future call of that agent, so it is not something an anonymous caller may
switch on. Everything else on this API is unchanged: creating an agent, editing
its prompt, placing calls and reading call history keep exactly the access they
always had.

**Choosing `basic_attributes_only` costs you your own call history content.**
The response carries a `warning` saying so in plain words: from then on the
provider returns no transcript and no recording for that agent's calls, so
`GET /phone/calls/:callId` shows an empty transcript and no `recordingUrl`, and
there is nothing for `platform.phone.copyRecordingToPrivateFiles()` to copy.
Calls already completed are unaffected. The platform does not refuse the
setting — the choice is yours.

`optInSignedUrl` — boolean. `true` makes the provider hand back signed, expiring
recording URLs rather than plain ones.

Neither control is set for any workspace by default, and nothing changes for a
workspace that never sends them.

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Provider storage controls" above and "Required API Keys". -->
**Provider storage controls.** `dataStorageSetting` (`everything`,
`everything_except_pii`, `basic_attributes_only`) and `optInSignedUrl` are
accepted on create and update and returned on read. `basic_attributes_only`
answers with a warning: the provider then returns no transcript and no
recording, so the workspace's own call history shows neither.

**The voice provider credential is platform-only, by design and permanently** —
one key covers every workspace's agents, numbers and call media, so it is never
exposed to an app, a server function, or an arbitrary-call proxy. Use the
storage controls above and the `platform.phone` capability in `server-functions`
(list/read own calls, copy a recording into the workspace's private storage,
purge the provider's copy) instead.
<!-- MANIFEST:END -->

### Delete an Agent
```
DELETE /api/workspaces/:workspaceId/phone/agents/:agentId
```
<!-- MANIFEST:ENDPOINT DELETE /api/workspaces/:workspaceId/phone/agents/:agentId | Delete an Agent -->

Deletes the agent and its associated LLM from Retell. Returns 404 if the agent doesn't belong to this workspace.

**Response:**
```json
{
  "deleted": true
}
```

---

## Agent Tools (Mid-Call Function Calling)

Agents can call **Server Functions (hooks)** mid-conversation to look up live data, check inventory, query a database, or perform any server-side logic. Tools are backed by Server Functions (hooks) in the same workspace.

### How It Works

1. When creating an agent, pass a `tools` array. Each tool maps to a workspace Server Function (hook) by `hookName`.
2. The system registers these as custom functions on the Retell LLM, pointing to the platform's tool-call webhook.
3. During a live call, when the agent decides to use a tool, Retell calls the webhook.
4. The webhook looks up the matching hook in the workspace, executes it, and returns the result.
5. The agent speaks the result back to the caller.

### Creating an Agent with Tools

First, create the Server Function (hook) that the tool will call:

```
POST /api/workspaces/:workspaceId/hooks
```
```json
{
  "name": "lookup_hours",
  "description": "Look up business hours",
  "code": "const day = request.body.args.day || 'today'; respond(200, { hours: 'Monday-Friday 9am-6pm Pacific. Closed weekends.' });"
}
```

Then, create the agent with the tool attached:

```
POST /api/workspaces/:workspaceId/phone/agents
```
```json
{
  "prompt": "You are a helpful assistant for NoTimeForPods. When someone asks about hours, use the lookup_hours tool to get accurate information. Never guess or make up information — always use your tools.",
  "identifier": "default",
  "tools": [
    {
      "name": "Business Hours Lookup",
      "description": "Look up the business hours for any day of the week. Use this whenever someone asks about hours, availability, or when the business is open.",
      "hookName": "lookup_hours",
      "parameters": {
        "type": "object",
        "properties": {
          "day": {
            "type": "string",
            "description": "The day of the week to check hours for"
          }
        }
      }
    }
  ]
}
```

### Tool Definition Fields

Each tool in the `tools` array:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name for the tool (shown in logs) |
| `description` | Yes | Description that tells the agent WHEN to use this tool. Be specific. |
| `hookName` | Yes | The name of the Server Function (hook) in the same workspace to execute |
| `parameters` | No | JSON Schema defining what arguments the agent should extract from the conversation |
| `speakDuringExecution` | No | Whether the agent says "Let me look that up..." while waiting (default: `true`) |
| `speakAfterExecution` | No | Whether the agent speaks the result after getting it (default: `true`) |

### What the Hook Receives

When a tool is called mid-conversation, the hook's `request.body` contains:

```json
{
  "args": {
    "day": "Friday"
  },
  "call": {
    "call_id": "call_abc123",
    "agent_id": "agent_xyz",
    "from_number": "+14155551234",
    "to_number": "+15551234567"
  }
}
```

- `args` — The arguments extracted by the agent from the conversation
- `call` — Metadata about the current call (call ID, agent ID, phone numbers)

The hook should use `respond(200, ...)` to return data that the agent will speak back.

### Tool Example: Customer Lookup

Hook:
```javascript
const email = request.body.args.email;
const customers = {
  "john@example.com": { name: "John", plan: "Premium", renewalDate: "March 15" },
  "jane@example.com": { name: "Jane", plan: "Basic", renewalDate: "April 1" }
};
const customer = customers[email];
if (customer) {
  respond(200, { result: `${customer.name} is on the ${customer.plan} plan, renewing on ${customer.renewalDate}.` });
} else {
  respond(200, { result: "I couldn't find that customer in our records." });
}
```

Agent tool:
```json
{
  "name": "Customer Lookup",
  "description": "Look up a customer's account details by their email address. Use when someone asks about their plan, billing, or account status.",
  "hookName": "customer_lookup",
  "parameters": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "The customer's email address"
      }
    },
    "required": ["email"]
  }
}
```

---

## Making Calls

### Supported Call Destinations

> ⚠️ **A `+1` prefix does NOT mean the number is dialable.** The platform can
> only place calls to a fixed set of destination countries. US territories —
> Puerto Rico (`+1 787` / `+1 939`), the U.S. Virgin Islands (`+1 340`), Guam
> (`+1 671`), American Samoa (`+1 684`) and the Northern Mariana Islands
> (`+1 670`) — share the `+1` dialing prefix with the mainland United States but
> are **separate destinations** with their own ISO country codes (`PR`, `VI`,
> `GU`, `AS`, `MP`). They are **not** dialable unless they appear in the
> supported list below. Never promise a customer a call without checking first.

Today the supported set is **`US, CA, MX, GB, FR, DE, ES, IT, IN, JP, ID, PH,
MY, TH, AU`** — the destinations the underlying carrier will dial from a
platform-managed number. Note what is *absent*: the US territories. It is
configuration, not code — ops widens it via the
`PHONE_SUPPORTED_CALL_COUNTRIES` environment variable (comma-separated ISO
3166-1 alpha-2 codes, e.g. `US,PR,VI,GU,AS,MP`) once a carrier route to those
destinations exists. Always read the list at runtime rather than hardcoding it;
the JSON samples below are abridged.

#### List supported destinations
```
GET /api/workspaces/:workspaceId/phone/destinations
```

**Response:**
```json
{
  "supportedDestinations": [
    { "code": "US", "name": "United States" },
    { "code": "CA", "name": "Canada" },
    { "code": "MX", "name": "Mexico" }
  ],
  "configuredVia": "PHONE_SUPPORTED_CALL_COUNTRIES"
}
```

The same `supportedDestinations` array is also returned by
`GET /api/workspaces/:workspaceId/phone/config` (including on its `404` when
the workspace has not made its first call yet).

#### Pre-check one number
```
POST /api/workspaces/:workspaceId/phone/destinations/check
```

**Request:**
```json
{ "toNumber": "+1 340 555 1234" }
```

Always responds `200` — this reports on a destination, it does not attempt a
call, so `supported: false` is a successful answer.

**Response (dialable):**
```json
{
  "supported": true,
  "normalizedNumber": "+14155551234",
  "country": "US",
  "countryName": "United States"
}
```

**Response (not dialable):**
```json
{
  "supported": false,
  "code": "destination_country_not_supported",
  "toNumber": "+1 340 555 1234",
  "normalizedNumber": "+13405551234",
  "country": "VI",
  "countryName": "U.S. Virgin Islands",
  "supportedCountries": [
    { "code": "US", "name": "United States" },
    { "code": "CA", "name": "Canada" }
  ],
  "message": "We can't place calls to U.S. Virgin Islands (VI) yet — it shares the +1 dialing prefix with the United States but counts as a separate destination. Callable destinations right now: United States (US), Canada (CA), Mexico (MX), United Kingdom (GB) and 11 more."
}
```

Numbers are normalized to E.164 before the country is derived, so
`(415) 555-1234`, `1-415-555-1234` and `+1 415 555 1234` all resolve to
`+14155551234`. A bare 10-digit number is assumed to be NANP.

### Destination Error Contract

Outbound and batch calls validate the destination **before** contacting the
carrier. A rejected destination returns the canonical payload above (plus an
`error` field mirroring `message`, for older clients) with these statuses:

| `code` | HTTP | Meaning |
| --- | --- | --- |
| `invalid_destination_number` | `400` | Not parseable as a dialable number — fix the input |
| `destination_country_not_supported` | `422` | Valid number, but the platform cannot dial that country |

Branch on `code`, never on `message`. The same `destination_country_not_supported`
code is returned when the carrier itself refuses the destination, so the
contract holds even if the platform list and the carrier list drift apart.
Errors are never raw provider output and never name the underlying vendor.

Rejected attempts **are** recorded: they appear in
`GET /api/workspaces/:workspaceId/phone/calls` with `status: "failed"` and the
reason in `errorMessage`.

### Make an Outbound Call
```
POST /api/workspaces/:workspaceId/phone/calls/outbound
```

**Request:**
```json
{
  "toNumber": "+15551234567",
  "contactEmail": "john@example.com",
  "dynamicVariables": {
    "customerName": "John Doe",
    "appointmentDate": "January 20, 2025",
    "appointmentTime": "2:00 PM"
  },
  "metadata": {
    "contactId": "contact-abc",
    "purpose": "appointment-reminder"
  }
}
```

- `toNumber` — Required. The phone number to call. Accepts any common format; it
  is normalized to E.164 before dialing. **Must be a supported destination** —
  see [Supported Call Destinations](#supported-call-destinations).
- `agentId` — Optional. Specific Retell agent ID to use. If omitted, the system auto-resolves (see below).
- `contactEmail` — Optional. The contact's email address. Used for auto-resolving to a contact-specific agent.
- `dynamicVariables` — Optional. Key-value pairs injected into the agent's prompt as `{{variableName}}`.
- `metadata` — Optional. Custom metadata attached to the call record.

**From a Server Function (including scheduled runs):** call this path with
`platform.fetch()`. The platform stamps the request for this workspace
automatically — do not add a session cookie, JWT, secrets-proxy header, or
workspace-db token. `platform.externalFetch()` and `platform.secretsProxy()`
to this same path are stamped the same way, and so is a scheduled webhook
whose URL is this path. A browser session is only required when the same
endpoint is called from published app code.

**Agent Auto-Resolution (when `agentId` is omitted):**
1. If `contactEmail` is provided, look for an agent named `ws_{workspaceId}::{contactEmail}`
2. If not found, look for `ws_{workspaceId}::default`
3. If not found, fall back to the `agentId` in the workspace's phone config

**Response (`201`):**
```json
{
  "callId": "uuid-call-id",
  "providerCallId": "call_retell_xyz",
  "status": "initiated"
}
```

**Response (`422`, unsupported destination):** the canonical payload described
in [Destination Error Contract](#destination-error-contract).

### Batch Outbound Calls
```
POST /api/workspaces/:workspaceId/phone/calls/batch
```

**Request:**
```json
{
  "agentId": "agent_xyz789",
  "calls": [
    {
      "toNumber": "+15551234567",
      "dynamicVariables": { "customerName": "John Doe", "appointmentDate": "Jan 20" }
    },
    {
      "toNumber": "+15559876543",
      "dynamicVariables": { "customerName": "Jane Smith", "appointmentDate": "Jan 21" }
    }
  ]
}
```

**Response:**

Each item is validated with the identical destination rules as the single-call
route and reports the same canonical `code`, so you can branch per item.

```json
{
  "calls": [
    { "toNumber": "+15551234567", "callId": "uuid-1", "providerCallId": "call_1", "status": "initiated" },
    {
      "toNumber": "+13405551234",
      "status": "failed",
      "supported": false,
      "code": "destination_country_not_supported",
      "normalizedNumber": "+13405551234",
      "country": "VI",
      "countryName": "U.S. Virgin Islands",
      "supportedCountries": [
        { "code": "US", "name": "United States" },
        { "code": "CA", "name": "Canada" }
      ],
      "message": "We can't place calls to U.S. Virgin Islands (VI) yet — …",
      "error": "We can't place calls to U.S. Virgin Islands (VI) yet — …"
    }
  ]
}
```

### Get Call Details
```
GET /api/workspaces/:workspaceId/phone/calls/:callId
```

Returns full call details including transcript and recording.

**Response:**
```json
{
  "id": "uuid-call-id",
  "workspaceId": "workspace-123",
  "provider": "retell",
  "providerCallId": "call_retell_xyz",
  "direction": "outbound",
  "toNumber": "+15551234567",
  "fromNumber": "+14155551234",
  "agentId": "agent_abc123",
  "status": "ended",
  "duration": 145,
  "transcript": "Agent: Hi John, this is a reminder about your dental appointment...\nUser: Yes, I'll be there...",
  "recordingUrl": "https://cloudfront.net/.../recording.wav",
  "outcome": null,
  "dynamicVariables": { "customerName": "John Doe" },
  "metadata": { "purpose": "appointment-reminder" },
  "errorMessage": null,
  "startedAt": null,
  "endedAt": "2025-01-14T12:02:25.000Z",
  "createdAt": "2025-01-14T12:00:00.000Z",
  "updatedAt": "2025-01-14T12:02:30.000Z"
}
```

The `recordingUrl` is the voice provider's own hosted URL, stored verbatim.
The platform does not sign, proxy, or expire it — see
[Security & Compliance](#security--compliance).

### List Calls
```
GET /api/workspaces/:workspaceId/phone/calls?limit=50
```

Returns recent calls for the workspace, ordered by most recent first.

### Delete a Call Recording
```
DELETE /api/workspaces/:workspaceId/phone/calls/:callId/recording
```

Deletes the call's recording **at the source**: the provider's copy of the
call media is purged (recording plus the provider-side call data), and the
stored `recordingUrl` pointer is cleared. Your own call row — status, the
transcript stored on the platform, duration, metadata — is kept for call
history. A late provider webhook cannot restore the pointer afterwards.

Idempotent: deleting an already-deleted recording returns success with
`alreadyDeleted: true`.

**Response:**
```json
{ "deleted": true, "providerPurged": true }
```

Returns `404` if the call doesn't belong to this workspace, `502` if the
provider refuses the purge (nothing is cleared in that case — the pointer is
only removed once the media is actually gone).

### Bulk Recording Cleanup
```
POST /api/workspaces/:workspaceId/phone/recordings/cleanup
```

Delete recordings for a specific list of calls in one request — useful for
honoring a retention or erasure request covering multiple calls.

**Request:**
```json
{ "callIds": ["uuid-call-1", "uuid-call-2"] }
```

**Response (per-item results; one failure doesn't stop the rest):**
```json
{
  "results": [
    { "callId": "uuid-call-1", "deleted": true, "providerPurged": true },
    { "callId": "uuid-call-2", "deleted": false, "error": "Call not found" }
  ]
}
```

---

## Webhooks

### Call Status Updates
```
POST /api/workspaces/:workspaceId/phone/webhooks/retell
POST /api/workspaces/:workspaceId/phone/webhooks/elevenlabs
```

Configure these URLs in your Retell/ElevenLabs dashboard to receive post-call updates (transcript, recording URL, call status, duration).

### Mid-Call Tool Execution Webhook
```
POST /api/workspaces/:workspaceId/phone/tool-call
```

This endpoint is called by Retell during a live phone call when the agent decides to use a tool. It is NOT called by Otto or workspace code directly — it is configured automatically when creating agents with tools.

**How it works:**
1. Retell sends a POST with the tool name and arguments extracted from the conversation
2. The endpoint maps the tool name to a Server Function (hook) in the workspace
3. The hook executes and returns data
4. The endpoint returns the result as a speakable string to Retell
5. The agent speaks the result to the caller

**Important:** This endpoint always returns `200 OK` with a string result, even if the hook fails. This prevents the phone agent from encountering HTTP errors mid-conversation. On failure, it returns a graceful fallback message like "I'm sorry, I wasn't able to look that up right now."

---

## Scheduler Integration

Schedule AI phone calls using the Task Scheduler:

```
POST /api/workspaces/:workspaceId/schedules
```

```json
{
  "name": "Appointment Reminder Call",
  "scheduledAt": "2025-01-19T10:00:00Z",
  "actionType": "hook",
  "actionPayload": {
    "hookName": "make-reminder-call",
    "payload": {
      "toNumber": "+15551234567",
      "customerName": "John Doe",
      "appointmentDate": "January 20, 2025"
    }
  }
}
```

---

## Typical Setup Flow

1. **Create a default agent** — `POST /phone/agents` with `identifier: "default"` and a prompt describing the business and how the AI should behave on calls
2. **Create hooks** for any live data the agent needs (hours, pricing, customer lookup, etc.)
3. **Attach tools to the agent** — Re-create or update the agent with `tools` pointing to those hooks
4. **Make calls** — `POST /phone/calls/outbound` with just `toNumber`; the platform auto-provisions the outbound phone number on the first call and auto-resolves the agent
5. **Check results** — `GET /phone/calls/:callId` for transcript, recording, and duration

> **No phone number setup required.** The platform provides a shared outbound number automatically. Your workspace only needs to define the agent and its prompt.

---

## Use Cases

1. **Appointment Reminders** — Automated reminder calls with confirmation/rescheduling
2. **Lead Qualification** — AI calls leads to qualify interest and book demos
3. **Payment Follow-ups** — Gentle reminder calls for overdue invoices
4. **Customer Surveys** — Post-service satisfaction surveys via phone
5. **Order Confirmations** — Call to confirm large or unusual orders
6. **Welcome Calls** — Personalized onboarding calls for new customers
7. **Emergency Alerts** — Batch calls for urgent notifications
8. **Personal Assistant** — Contact-specific agents that call on behalf of a person
9. **Live Data Agents** — Agents with tools that query real databases, check inventory, or look up customer records mid-call

---

## Security & Compliance

- API keys are stored at the platform level as encrypted secrets
- Agents are workspace-isolated via naming convention (`ws_{workspaceId}::...`)
- All agent CRUD operations enforce workspace ownership checks
- Mid-call tool execution is scoped to the same workspace's hooks
- All calls are recorded and transcribed (configurable — see
  [Provider storage controls](#provider-storage-controls))
- HIPAA-compliant mode available (Retell AI)
- **The voice provider credential is platform-only, by design and
  permanently.** There is one provider credential and it covers the whole
  platform provider account — every workspace's agents, phone numbers and call
  media sit behind it. Code holding it could read, reconfigure and delete other
  workspaces' data, so it is never exposed to a workspace, a server function,
  an app, or a proxy that forwards arbitrary provider API calls. This will not
  change. What replaces it: the
  [provider storage controls](#provider-storage-controls) above, and the
  `platform.phone` capability in Server Functions, which does the privileged
  work in-process scoped to your workspace — list and read your own calls, copy
  a recording into your own private storage, and purge the provider's copy.
- **Call recordings are provider-hosted until you copy them.** By default
  recording media lives on the voice provider's infrastructure and the
  `recordingUrl` returned by the API is the provider's URL, stored verbatim —
  the platform does not sign or expire these URLs itself. Anyone who obtains
  one can fetch the media for as long as the provider keeps it, so treat
  `recordingUrl` values as sensitive: don't embed them in public pages, logs,
  or emails.
- **You can take the media off the provider.** A server function can call
  `platform.phone.copyRecordingToPrivateFiles(callId)` to copy the audio into
  your workspace's private storage, then
  `platform.phone.purgeProviderRecording(callId)` to purge the provider's copy.
  The private copy is reachable only through the existing authorized,
  time-limited private-file link path, and every read is attributed to the
  caller that asked for it. Both steps are safe to repeat.
- **Recordings can be deleted.** `DELETE /phone/calls/:callId/recording`
  purges the media at the provider and clears the stored pointer (see
  [Delete a Call Recording](#delete-a-call-recording)). Use this to honor
  GDPR/CCPA-style retention or erasure commitments. A late provider webhook
  cannot bring a purged pointer back.
- **Copy within seconds of hang-up.** Name one of your own server functions as
  `postCallHook` in the phone config and it runs right after a call callback
  that carries a recording (see [Post-call trigger](#post-call-trigger)). Unset
  means nothing is dispatched, which is the default for every workspace.

---

## Task #1235: Dedicated phone numbers per workspace

Apps can purchase Twilio-backed phone numbers dedicated to a workspace
(and optionally bound to a single space or contact). Numbers carry a
recurring monthly charge — the `phone-number-renewal` cron debits the
wallet every 30 days and gracefully releases numbers whose wallet runs
dry (status flips to `renewal_failed`).

### Outbound resolution chain

When `makeOutboundCall` runs, the dedicated registry is consulted first:

1. Contact-bound number (`contactId` match)
2. Space-bound number (`spaceId` match, no `contactId`)
3. Workspace-default number (`isWorkspaceDefault = true`)
4. Legacy platform-shared `workspace_settings.phone_config` (existing path)

A dedicated number is used as the Retell `from_number` only after it is
imported (`retell_phone_number_id` set). Dedicated caller ID requires
`RETELL_TWILIO_SIP_TERMINATION_URI` (Twilio elastic SIP trunk). Without
that env, or if import fails, outbound still places the call from the
shared platform Retell number instead of 404ing.

### Inbound webhook routing

The shared `/phone/webhook/:workspaceId/:provider` endpoint now looks up
the destination number in `workspace_phone_numbers` when it can't find a
pre-existing call row — so inbound calls to a dedicated number are
attributed to the correct workspace + space + contact.

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/workspaces/:workspaceId/phone/numbers/search` | Twilio inventory search (`areaCode`, `contains`) |
| `POST` | `/api/workspaces/:workspaceId/phone/numbers/quote` | Monthly price quote with safety-headroom multiplier |
| `POST` | `/api/workspaces/:workspaceId/phone/numbers/purchase` | Wallet-gated purchase. Returns 402 with canonical `insufficient_funds` body when short. |
| `GET` | `/api/workspaces/:workspaceId/phone/numbers` | List dedicated numbers |
| `DELETE` | `/api/workspaces/:workspaceId/phone/numbers/:numberId` | Release (Twilio DELETE + DB flag) |

### Insufficient-funds response (402)

Identical shape to `domain-registration`:

```json
{
  "code": "insufficient_funds",
  "required": 1.65,
  "available": 0.50,
  "shortfall": 1.15,
  "headroomMultiplier": 1.10,
  "message": "Insufficient wallet balance for Provision phone number +14155551212. …",
  "phoneNumber": "+14155551212"
}
```

### Environment

| Var | Default | Notes |
| --- | --- | --- |
| `PHONE_SUPPORTED_CALL_COUNTRIES` | `US,CA,MX,GB,FR,DE,ES,IT,IN,JP,ID,PH,MY,TH,AU` | Comma-separated ISO 3166-1 alpha-2 destinations the platform will dial. US territories (`PR,VI,GU,AS,MP`) are deliberately absent — a platform-managed number cannot reach them. Widen once a carrier route exists — no code change needed. |
| `PHONE_NUMBER_MONTHLY_PRICE` | `1.50` | Per-number monthly charge in USD |
| `PHONE_NUMBER_HEADROOM_MULTIPLIER` | `1.10` | Wallet must cover price × multiplier |
| `PHONE_NUMBER_RENEWAL_ENABLED` | unset | Set to `1` on the prod replica to arm the renewal cron |
| `PHONE_NUMBER_RENEWAL_INTERVAL_MS` | `3600000` (1h) | Renewal poll cadence |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | — | Required for purchase / release |
| `TWILIO_VOICE_WEBHOOK_URL` | — | If set, applied to newly purchased numbers |
| `RETELL_API_KEY` | — | Platform Retell credential (never exposed to workspaces) |
| `RETELL_PLATFORM_PHONE_NUMBER` | — | Shared Retell number used when a dedicated number is not registered |
| `RETELL_TWILIO_SIP_TERMINATION_URI` | unset | Twilio elastic SIP trunk (`*.pstn.twilio.com`). Required for dedicated caller ID / Retell import |
| `RETELL_TWILIO_SIP_AUTH_USERNAME` / `RETELL_TWILIO_SIP_AUTH_PASSWORD` | unset | Optional SIP trunk auth sent on import |
| `TWILIO_SIP_TRUNK_SID` | unset | If set, purchased Incoming Phone Numbers are assigned onto this trunk before import |

### Failure model

- Twilio purchase succeeds but wallet charge fails → number is auto-released.
- Wallet charge succeeds but DB row write fails → wallet is auto-refunded AND the Twilio number is released.
- Retell import after purchase fails (or SIP trunk env is unset) → number stays in Twilio, `retell_phone_number_id` stays null, outbound falls back to the shared platform number. Wallet is not refunded.
- Renewal wallet charge fails → number released, status `renewal_failed`, app should re-purchase from inventory.

---
# anthropic-text-generation

Source: integrations/anthropic-text-generation/docs.md

# Anthropic Text Generation (Claude) Integration

Generate text, chatbots, content creation, and AI responses using Anthropic Claude models.

## Category
AI/ML

## Required API Keys (Platform-Level)

The platform supplies the Anthropic API key and the `anthropic-version` header when it calls Anthropic. That key management does **not** authenticate the app user calling the Audos proxy — your app must still identify itself (see below).

- `ANTHROPIC_API_KEY` — managed by the platform (never exposed to the browser)

---

## Authentication (REQUIRED)

**Every call to this proxy spends platform credentials and requires a workspace
token. An unauthenticated request is rejected with `401` before Anthropic is
called.** This is not optional and the platform does not do it for you.

```javascript
const ws = (window as any).__workspaceDb;

const AUDOS_AI_HEADERS = {
  'Content-Type': 'application/json',
  'X-Workspace-DB-Token': ws?.token,
};
```

`window.__workspaceDb` is injected by the platform into any app that calls this
endpoint. Read `.token` at call time — never copy the value into your source and
never commit it.

Rejection responses carry a machine-readable `code`:

| Status | `code` | Meaning |
|---|---|---|
| 401 | `no_credentials` | No token sent. |
| 401 | `workspace_token_invalid` | Token expired, revoked, or blocked by its origin allowlist. |
| 403 | `workspace_token_wrong_workspace` | Token belongs to a different workspace than `X-Audos-Workspace-Id`. |
| 403 | `not_a_workspace_member` | Signed-in user is not a member of this workspace. |
| 403 | `cross_site_session_denied` | A cookie-backed browser session was used from another site. Send the workspace token instead. |
| 429 | `rate_limited` | Per-workspace / per-caller / per-IP burst limit. Retry after `retryAfterSeconds`. |
| 404 | `unsupported_endpoint` | Only `/v1/messages` is proxied. |
| 405 | `unsupported_method` | Only `POST` is proxied. |
| 400 | `unsupported_model` | Model is not on the supported text-model list. |
| 400 | `unsupported_field` | A top-level request field that the proxy does not forward. |
| 400 | `output_tokens_too_large` | `max_tokens` above the ceiling. |
| 413 | `body_too_large` / `input_too_large` | Request body or conversation history above the ceiling. |

Authentication is a gate, not a budget. The token lives in the visitor's
browser, so calls are also rate-limited and capped — apply your own session and
access controls before exposing a "generate" button.

**Cross-origin note.** Your published app calls this proxy from its own domain,
so the request is cross-origin. Send the token header and use a plain
`fetch` — do **not** set `credentials: 'include'`. The proxy deliberately does
not allow credentialed cross-origin calls, and a signed-in browser session is
only accepted on same-origin requests (a cross-site call that relies on cookies
is refused with `403 cross_site_session_denied`).

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the Authentication and API Endpoint sections of this doc. -->
**Authentication is REQUIRED.** The proxy rejects anonymous calls with `401`
(`code: "no_credentials"`) before Anthropic is contacted. Send the workspace
token on every request:

```javascript
const ws = (window as any).__workspaceDb;

const response = await fetch('/proxy/anthropic/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Workspace-DB-Token': ws?.token,
  },
  body: JSON.stringify({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});
```

`POST /v1/messages` is the ONLY proxied Anthropic path — everything else
returns `404 unsupported_endpoint`. Only approved text models are accepted
(`400 unsupported_model`), `max_tokens` is capped at 16,384, and calls are
rate-limited per workspace. See
`integrations/anthropic-text-generation/docs.md` for the full contract.
<!-- MANIFEST:END -->

---

## API Endpoint

**Messages (Proxied) — the only proxied Anthropic endpoint**
```
POST /proxy/anthropic/v1/messages
```

Nothing else is reachable through `/proxy/anthropic/*`: model listing, batches,
files, and every other provider operation return `404 unsupported_endpoint`.

**Request:**
```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 1024,
  "thinking": { "type": "disabled" },
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false
}
```

**Response:**
```json
{
  "content": [
    { "type": "text", "text": "Hello! How can I help you today?" }
  ],
  "stop_reason": "end_turn"
}
```

Read the reply from `content[].text` (concatenate every block with `type === "text"`), NOT `choices[0].message.content` — that is the OpenAI shape and does not exist here.

## Limits

| Limit | Value | Behaviour |
|---|---|---|
| Request body | 256 KB | `413 body_too_large` |
| Conversation input | 200,000 characters | `413 input_too_large` |
| `max_tokens` | 16,384 | Above it → `400 output_tokens_too_large`. Omitted → the proxy applies the ceiling. |

Only these top-level fields are forwarded: `model`, `messages`, `system`,
`max_tokens`, `stream`, `temperature`, `top_p`, `top_k`, `stop_sequences`,
`metadata`, `thinking`, `output_config`, `tools`, `tool_choice`. Anything else
is refused with `400 unsupported_field`.

## Streaming

`stream: true` is supported and the SSE event sequence is forwarded unchanged
(`message_start` → `content_block_delta` → `message_delta` → `message_stop`).

## Choosing a Model (decide once per call site, at build time)

- **Balanced (default)** — chat, summaries, extraction, rewriting, classification, straightforward generation: `claude-sonnet-5`.
- **Frontier (escalate)** — multi-step reasoning, tool orchestration, long-document synthesis, or consequential accuracy: `claude-opus-5`.

## Hard Rules (violations return a 400 or wreck latency)

- **For interactive Sonnet 5 calls, send `thinking: { "type": "disabled" }`.** Sonnet 5 otherwise uses adaptive thinking and adds latency before the first token.
- **Opus 5 cannot disable thinking.** Pair `thinking: { "type": "adaptive" }` with `output_config: { "effort": "medium" }`, and reserve it for frontier call sites that justify the extra latency.
- **Never send `temperature`, `top_p`, or `top_k`.** Claude 5 models reject non-default sampling parameters with a 400 error.
- **`max_tokens` is required** on every request (unlike OpenAI's optional `max_completion_tokens`).
- **`system` is a top-level string field**, not a message with `role: "system"`.

## Installation

```javascript
function audosAiHeaders() {
  const token = (window as any).__workspaceDb?.token;
  if (!token) {
    throw new Error(
      'Workspace token unavailable — the Anthropic proxy requires X-Workspace-DB-Token.'
    );
  }
  return { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token };
}

function thinkingConfigFor(model) {
  if (model === 'claude-opus-5') {
    return {
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' }
    };
  }
  return { thinking: { type: 'disabled' } };
}

async function throwIfNotOk(response) {
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  const code = data?.code ? ` [${data.code}]` : '';
  const message =
    data?.error?.message || data?.error || `Claude request failed (${response.status})`;
  throw new Error(`${message}${code}`);
}

export const claudeText = {
  async generateText(messages, options = {}) {
    const model = options.model || 'claude-sonnet-5';
    const response = await fetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: audosAiHeaders(),
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 1024,
        ...thinkingConfigFor(model),
        ...(options.system ? { system: options.system } : {}),
        messages
      })
    });

    await throwIfNotOk(response);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Claude request failed');
    return (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  },

  async chat(userMessage, conversationHistory = [], systemPrompt = null, options = {}) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    return await this.generateText(messages, {
      ...options,
      ...(systemPrompt ? { system: systemPrompt } : {})
    });
  },

  async streamChat(
    userMessage,
    onChunk,
    conversationHistory = [],
    systemPrompt = null,
    options = {}
  ) {
    const model = options.model || 'claude-sonnet-5';
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await fetch('/proxy/anthropic/v1/messages', {
      method: 'POST',
      headers: audosAiHeaders(),
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 1024,
        ...thinkingConfigFor(model),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
        stream: true
      })
    });

    await throwIfNotOk(response);
    if (!response.body) throw new Error('Claude streaming response has no body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    const consumeLine = (line) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data) return;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        throw new Error('Invalid Claude stream event');
      }
      if (event.type === 'error') {
        throw new Error(event.error?.message || 'Claude stream failed');
      }
      if (event.type === 'message_stop') {
        completed = true;
        return;
      }
      // Anthropic streams content_block_delta events with text_delta payloads
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        onChunk(event.delta.text);
      }
    };

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        consumeLine(line);
        if (completed) return;
      }
    }

    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      consumeLine(line);
      if (completed) return;
    }

    throw new Error('Claude stream ended before message_stop');
  }
};
```

## Migration note for already-published apps

Apps published before this change called the proxy anonymously
(`headers: { 'Content-Type': 'application/json' }`) and now receive
`401 no_credentials`. Fix: add the `X-Workspace-DB-Token` header as shown above
and republish the app. The platform injects `window.__workspaceDb` into any app
whose source references `/proxy/anthropic/`, so no extra setup is needed — but
the app must be recompiled/republished for the injection to reach the served
bundle.

## Use Cases
- AI chatbots
- Content generation
- Text summarization
- Question answering
- Creative writing assistance
- Long-document analysis

## Supported Models

Recommended:
- `claude-sonnet-5` — balanced default; always pair with `thinking: { "type": "disabled" }` for interactive features
- `claude-opus-5` — frontier tier; requires adaptive thinking with medium effort

Also accepted (existing apps): the current Claude text ids such as
`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-6` and their dated
pins. Any other id is refused with `400 unsupported_model`.

## Verifying the platform credential

GET `/api/workspaces/WORKSPACE_ID/ai-proxy/health` reports state `configured` | `verified` | `invalid` | `unreachable` per provider. `configured` (and `available: true` on `/proxy/status`) is not proof the key works; read `verified` (or make one tiny real call) before writing app code against the proxy or telling a founder it works.

## Documentation
- [Anthropic Messages API Docs](https://docs.anthropic.com/en/api/messages)

---
# audio-transcription

Source: integrations/audio-transcription/docs.md

# Audio Transcription Integration

Record audio and convert speech to text using OpenAI Whisper (default) or Deepgram nova-3. Simple POST endpoint for record-then-send transcription workflows.

## Category
AI/ML

## Required API Keys
- `OPENAI_API_KEY`

## API Endpoint

**Transcribe Audio**
```
POST /api/generate/transcribe
```

**Request:**
Send a `multipart/form-data` request with an `audio` file field.

```
Content-Type: multipart/form-data
Field: audio (File - .webm, .mp3, .wav, .m4a, .ogg)
Field: language (optional - e.g. language=en; omit for auto-detection)
Field: provider (optional - "deepgram" to elect Deepgram nova-3 instead of Whisper)
```

**Language:** pass `language=en` (or another BCP-47 / provider code such as `"es"`) when you know the spoken language. Omit the `language` field entirely for auto-detection.

**Choosing a provider:** the default is OpenAI Whisper. You can elect Deepgram
per request with `provider=deepgram` (faster on long recordings; supports
`response_format` json, text, or verbose_json - not srt/vtt). For word-level
timestamps with confidences plus BYOK support, prefer the dedicated
`deepgram-transcription` integration endpoint instead.

**Response:**
```json
{
  "text": "The transcribed text from the audio recording"
}
```

## Installation

```javascript
export const audioTranscription = {
  async transcribe(audioBlob, language) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    // Optional: language=en (or "es", …). Omit for auto-detection.
    if (language) formData.append('language', language);

    const response = await fetch('/api/generate/transcribe', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Transcription failed');
    const { text } = await response.json();
    return text;
  },

  async recordAndTranscribe(language) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks = [];

    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        try {
          const text = await audioTranscription.transcribe(blob, language);
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      mediaRecorder.onerror = reject;
      mediaRecorder.start();
    });
  }
};
```

## Use Cases
- Voice input for form fields
- Voice memos and note dictation
- Meeting/conversation recording
- Accessibility voice input
- Voice-to-text search

## When to Use This vs Realtime API
| Scenario | Use |
|---|---|
| Record audio, then get text back | `/api/generate/transcribe` |
| Voice input for a form field | `/api/generate/transcribe` |
| Voice memo / note dictation | `/api/generate/transcribe` |
| Live bidirectional voice conversation | Realtime API (`/api/realtime/token`) |
| Real-time streaming transcription | Realtime API (`/api/realtime/token`) |

## Supported Audio Formats
- WebM (recommended for browser recording)
- MP3
- WAV
- M4A
- OGG

## Documentation
- [OpenAI Audio API Docs](https://platform.openai.com/docs/guides/speech-to-text)

---
# deepgram-transcription

Source: integrations/deepgram-transcription/docs.md

# Deepgram Timestamped Transcription Integration

Record audio and get back a transcript with **word-level timestamps** (word, start, end, confidence) powered by Deepgram nova-3. Use this instead of the plain-text `audio-transcription` integration whenever timing matters: pacing/prosody analysis, aligning the same phrase across recordings, karaoke-style transcript highlighting, silence detection.

## Category
AI / Audio

## Required API Keys (Platform-Level)

The `DEEPGRAM_API_KEY` is managed at the platform level — apps just call the endpoint below.

Optional BYOK: if the workspace has its own `DEEPGRAM_API_KEY` in the workspace custom-secrets store, it is used automatically (and the workspace wallet is not charged).

## API Endpoint

**Transcribe with word timestamps**
```
POST /api/workspaces/:workspaceId/audio/transcribe-timestamped
```

**Auth (required):** send the workspace API key in the `X-Workspace-DB-Token` header. In space apps this is available as `window.__workspaceDb.token`.

**Request:**
`multipart/form-data` with:
- `audio` — File field (.webm, .mp3, .wav, .m4a, .ogg)
- `language` — optional (e.g. `"en"`, `"es"`); auto-detected when omitted

**Response:**
```json
{
  "success": true,
  "transcript": "Welcome to the show. Let's get started.",
  "words": [
    { "word": "Welcome", "start": 0.08, "end": 0.42, "confidence": 0.99 },
    { "word": "to", "start": 0.42, "end": 0.55, "confidence": 0.99 },
    { "word": "the", "start": 0.55, "end": 0.66, "confidence": 0.98 },
    { "word": "show.", "start": 0.66, "end": 1.02, "confidence": 0.99 }
  ],
  "duration": 4.6,
  "confidence": 0.98,
  "model": "nova-3",
  "provider": "deepgram"
}
```

`start`/`end` are in **seconds** from the beginning of the recording. `word` includes smart punctuation.

**Errors:**
- `401/403` — missing or wrong workspace token
- `503` with `code: "deepgram_not_configured"` — no Deepgram key is available (neither platform nor workspace BYOK)

## Installation

```javascript
export const deepgramTranscription = {
  async transcribe(workspaceId, audioBlob, language) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (language) formData.append('language', language);

    const response = await fetch(
      `/api/workspaces/${workspaceId}/audio/transcribe-timestamped`,
      {
        method: 'POST',
        headers: { 'X-Workspace-DB-Token': window.__workspaceDb.token },
        body: formData,
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Timestamped transcription failed');
    }
    return response.json(); // { transcript, words, duration, confidence, ... }
  },
};
```

## Use Cases
- **Pacing / prosody analysis** — words-per-minute, pause detection, filler-word timing for speech-coaching apps
- **Phrase alignment** — compare the timing of the same phrase across multiple recordings
- **Transcript highlighting** — highlight the current word while audio plays back
- **Silence/gap detection** — find gaps between consecutive words (`words[i].start - words[i-1].end`)
- **Clip extraction** — locate exact timestamps of a quote for trimming

## When to Use This vs Other Audio Integrations
| Scenario | Use |
|---|---|
| Need word-level timestamps | **this integration** |
| Plain text is enough (voice input, dictation) | `audio-transcription` (`/api/generate/transcribe`) |
| Live bidirectional voice conversation | `openai-realtime` |
| Text-to-speech / music | `elevenlabs-audio` |

## Tips
- Compute words-per-minute from `words.length / (duration / 60)`.
- For pause analysis, gaps > 1 second between consecutive words usually indicate a deliberate pause.
- Recordings up to 500 MB are accepted; Deepgram handles long recordings without chunking.
- Cost: ~$0.01 per minute of audio (charged to the workspace wallet on the platform-key path; free with workspace BYOK).

## Documentation
- [Deepgram Pre-recorded Audio Docs](https://developers.deepgram.com/docs/pre-recorded-audio)

---
# document-analysis

Source: integrations/document-analysis/docs.md

# Document Analysis Integration (AI Vision)

Analyze images and PDFs with an AI vision model - extract data from invoices, forms, diagrams, and more. Supports native PDF processing (up to 100 pages, 32MB max).

## Category
AI/ML

## Required API Keys
- `OPENAI_API_KEY`

## API Endpoint

**Analyze Document**
```
POST /api/analyze-document
```

**Request:**
```json
{
  "documentUrl": "https://storage.googleapis.com/...",
  "analysisPrompt": "Extract invoice data",
  "documentType": "pdf"
}
```

**Response:**
```json
{
  "success": true,
  "analysis": "{ invoiceNumber: '12345', ... }",
  "documentUrl": "https://storage.googleapis.com/...",
  "documentType": "pdf"
}
```

## PDF Capabilities
- Processes PDFs directly via OpenAI's native support
- Handles up to 100 pages per PDF
- Maximum 32MB file size
- Extracts both text and visual elements (charts, tables, diagrams)
- No page-to-image conversion needed

## Installation

```javascript
export const documentAnalysis = {
  // Step 1: Upload document to get URL
  async uploadDocument(file) {
    const reader = new FileReader();
    const base64Data = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
    
    const response = await fetch('/api/upload/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: base64Data,
        fileName: file.name
      })
    });
    
    const { imageUrl } = await response.json();
    return imageUrl;
  },
  
  // Step 2: Analyze document with custom prompt
  async analyze(documentUrl, analysisPrompt, documentType = 'image') {
    const response = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-App-Id': window.__APP_ID__
      },
      body: JSON.stringify({
        documentUrl,
        analysisPrompt,
        documentType // 'image' or 'pdf'
      })
    });
    
    const { analysis } = await response.json();
    return analysis;
  }
};
```

## Use Cases
- Invoice extraction
- Receipt scanning
- Form processing
- ID verification
- Document digitization
- Chart/diagram analysis

## Supported Document Types
- Images (JPEG, PNG, GIF, WebP)
- PDFs (up to 100 pages, 32MB)

## Documentation
- [OpenAI Vision Docs](https://platform.openai.com/docs/guides/vision)

---
# elevenlabs-audio

Source: integrations/elevenlabs-audio/docs.md

# ElevenLabs Audio Integration

Generate natural-sounding speech from text, clone voices, re-voice recordings with the voice changer (speech-to-speech), and create AI background music. Powered by ElevenLabs with 30+ premium voices and 8 music presets; background music can alternatively be rendered by Google Gemini (Lyria) via `provider: "gemini"`.

## Category
AI / Audio

## Required API Keys (Platform-Level)

The platform supplies the ElevenLabs API key when it calls ElevenLabs. This key management does not authenticate or authorize the app user calling an Audos endpoint.

- `ELEVENLABS_API_KEY` — Managed by platform admin (not per workspace)

---

## Authentication (REQUIRED)

**Every generation endpoint below spends the workspace's wallet and requires a
workspace token. An unauthenticated request is rejected with `401` before
ElevenLabs is called.** This is not optional and the platform does not do it
for you.

Send the workspace token on every `POST`:

```javascript
const ws = (window as any).__workspaceDb;

const AUDOS_AUDIO_HEADERS = {
  'Content-Type': 'application/json',
  'X-Workspace-DB-Token': ws?.token,
};
```

`window.__workspaceDb` is injected by the platform into any app that calls
these endpoints. Read `.token` at call time — do not copy the value into your
source, and never commit it.

Prefer `X-Workspace-DB-Token`. The spend gate also accepts
`Authorization: Bearer` and the short `n` header with the same token.
Generation paths skip the shared `/api` session gate so a Bearer workspace
key is not mistaken for a sign-in JWT and rejected as
`{ error: "Authentication required" }` with no `code`. Unauthenticated calls
still return `401` `no_credentials` from the spend guard.

Rejection responses carry a machine-readable `code` so you can tell the cases
apart:

| Status | `code` | Meaning |
|---|---|---|
| 401 | `no_credentials` | No token sent, or the token is expired/revoked. |
| 403 | `workspace_token_wrong_workspace` | Token belongs to a different workspace than the `:workspaceId` in the path. |
| 403 | `not_a_workspace_member` | Signed-in user is not a member of this workspace. |
| 429 | `rate_limited` | Per-workspace burst limit hit. Retry after `retryAfterSeconds`. |

The two **catalog reads are public** and need no token, because they cost
nothing: `GET /api/voices` and `GET /api/audio/music/presets`.

Authentication is a gate, not a budget. The token lives in the visitor's
browser, so these endpoints are also rate-limited per workspace, cap script
length, and refuse to run when the wallet is empty. Apps should still apply
their own session and access controls before exposing a "generate" button.

---

## Neutral Path Aliases

The original endpoints live under `/api/workspaces/:workspaceId/demo-video/...` (left in place for back-compat). Hosted apps that aren't building demo-videos should prefer these **neutral aliases**, which delegate to the exact same handlers:

| Neutral alias | Original path |
|---|---|
| `GET /api/voices` | `GET /api/voiceover/voices` |
| `POST /api/workspaces/:workspaceId/audio/voiceover` | `…/demo-video/voiceover` |
| `POST /api/workspaces/:workspaceId/audio/voiceover/segments` | `…/demo-video/voiceover/segments` |
| `GET /api/audio/music/presets` | `GET /api/music/presets` |
| `POST /api/workspaces/:workspaceId/audio/music/preset` | `…/demo-video/music/preset` |
| `POST /api/workspaces/:workspaceId/audio/music/custom` | `…/demo-video/music/custom` |

The request/response shapes are identical — the alias choice is purely cosmetic.
Both forms enforce the **same authentication**: the alias is not a way around
the token requirement.

---

## Text-to-Speech (TTS)

Convert any text to natural speech audio. Returns a public URL to the generated MP3 file.

<!-- MANIFEST:INTRO -->
### Explicit Voiceover Models

Both `/audio/voiceover` and `/demo-video/voiceover` (including `/segments`)
accept optional `modelId`. Otto's workspace and background video tools accept
the same field. **Omitted model remains `eleven_turbo_v2_5`**; existing code
and legacy billing are unchanged. Other existing legacy IDs remain selectable.

| Model ID | Provider endpoint | Effective per-segment limit | Settings | Platform price / 1K chars |
|---|---|---|---|---|
| `eleven_turbo_v2_5` (default) | Text-to-Speech | 10,000 platform single-script cap | Legacy settings below | $0.30 |
| `eleven_v3` | Text-to-Speech | 5,000 | Only `stability`: 0, 0.5 (default), or 1 | $0.08 |
| `eleven_v4` | Text-to-Dialogue, one input with one voice | 2,000 | `stability` 0–1 (default 0.5), `similarity_boost` 0–1 (default 0.75) | $0.08 |

V4 maps `similarity_boost` to provider `settings.similarity`; it does not send
legacy `voice_settings`. Neither new model accepts `style`, `speed`, or
`use_speaker_boost`; v3 also rejects `similarity_boost`. Unsupported settings
and oversized inputs return HTTP 400 before debit or generation, not a silent
fallback. Unknown setting names are rejected rather than discarded.

Expressive tags such as `[excited]`, `[whispering]`, and `[laughs]` pass through
unchanged. Tags count toward character limits and billing. V3/v4 do not support
SSML: use audio tags, punctuation or ellipses for pauses. The advertised v4
10,000-character model limit is **not** this API's limit: the Text-to-Dialogue
endpoint documents reliable generation only up to 2,000 characters per call.

Segments inherit the top-level `modelId`. Explicit segment `modelId` wins.
Segment `voiceSettings` replaces the entire top-level object; omitted segment
settings inherit the entire object. Do not inherit legacy style settings into
a new model. Each segment is its own provider call and may override `voiceId`.
The platform still caps the whole request at 100 segments / 20,000 characters.

```json
{
  "modelId": "eleven_v4",
  "voiceSettings": { "stability": 0.5 },
  "segments": [
    { "text": "[excited] Welcome to the show!" },
    { "text": "[whispering] Here is the secret.", "modelId": "eleven_v3" }
  ]
}
```

Billing sums `text.length / 1000 * modelRate` across effective segment models,
then applies a **$0.01 minimum once per request**, not per segment. Legacy
requests remain $0.30/1K characters. New v3/v4 pricing uses the provider's
published $0.08/1K API rate (verified 2026-10-14); this is the platform tariff
for these new IDs, not a claim about the platform account's private invoice.
The wallet records effective models, endpoints, character counts and unit rates.
Provider or upload failures refund the generation charge. No automatic model
substitution occurs. Insufficient balance prevents provider generation.

Availability: the platform's authenticated read-only `/v1/models` catalog listed
both IDs on 2026-10-14 with TTS capability and no alpha requirement. Each new
request checks that catalog before debit. This is **not** proof that paid
generation or every voice works. No live paid audio smoke check was run.
V3 Professional Voice Clones are not fully optimized; v4 supports clones but
existing PVCs may require v4-specific training. Voice Design results can vary.
Select a usable voice from the workspace catalog and test only with consent
and an approved budget; voice ownership rules still apply.

Sources: [models](https://elevenlabs.io/docs/overview/models),
[v4 settings and cloning](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4),
[dialogue API](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert),
[API pricing](https://elevenlabs.io/pricing/api).
<!-- MANIFEST:END -->

### Spend Approval for New Models

When the ElevenLabs approval gate is active, pass the server-issued, human-approved
`spendIntentId` on either route family or tool. Authentication is still required.
Use `propose_spend` with category `elevenlabs`, action `elevenlabs_full_voiceover`
or `elevenlabs_voiceover` for segments, and `amountCents = Math.round(cost * 100)`.
Approval must happen before provider generation. Never invent an intent or reuse it.

Approval `params` for a single script are `{ charCount: script.length, voiceId,
voiceover: [resolvedSegment] }`; for segments they are `{ totalChars, voiceId,
segments: segmentCount, voiceover: resolvedSegments }`. Default voiceId is Sarah
(`EXAVITQu4vr4xnSDxMaL`). Every resolved segment is exactly:
`{ text, modelId, voiceSettings, endpoint, unitPriceUsdPer1000Chars, voiceId }`.
Use effective inherited values and defaults: v3 settings `{ stability: 0.5 }`,
endpoint `"text-to-speech"`, rate `0.08`; v4 settings `{ stability: 0.5,
similarity: 0.75 }`, endpoint `"text-to-dialogue"`, rate `0.08`. Legacy segments
in a mixed request include all four legacy default settings and rate `0.30`.
Text includes tags unchanged. Changing text, settings, models, or voices invalidates
the approval. Legacy-only approvals retain their previous params shape.

### List Available Voices
```
GET /api/voices
```
(alias for `GET /api/voiceover/voices`)

**Response:**
```json
{
  "success": true,
  "voices": [
    {
      "id": "EXAVITQu4vr4xnSDxMaL",
      "name": "Sarah",
      "category": "premade",
      "labels": { "accent": "American", "age": "young", "gender": "female" },
      "previewUrl": "https://..."
    }
  ]
}
```

### Choose an Available Voice

Voice availability changes. Call `GET /api/voices` when selecting a voice and use an `id` from that response; do not rely on copied catalog IDs. If `voiceId` is omitted, the endpoint uses its Sarah default.

The platform forwards a supplied `voiceId` to ElevenLabs without checking it against the current voice list. If the ID is unavailable, ElevenLabs rejects it with `404 voice_not_found`; it is not silently replaced.

### Generate Speech
```
POST /api/workspaces/:workspaceId/demo-video/voiceover
```
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/demo-video/voiceover | Generate Speech (optional `voiceSettings`: stability, similarity_boost, style, use_speaker_boost) -->

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.

**Request:**
```json
{
  "script": "Welcome to our app! Here's how to get started.",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "voiceSettings": { "stability": 0.37, "style": 0.5 }
}
```

- `script` — Required. Capped at **10,000 characters** per request by the platform (a longer script is rejected with HTTP 400 before anything is billed). Split longer scripts into segments.
- `voiceId` — Optional. Defaults to Sarah (`EXAVITQu4vr4xnSDxMaL`). Call the voice list endpoint at selection time and use an ID from its response.
- `voiceSettings` — Optional. See [Voice Settings](#voice-settings).

**Response:**
```json
{
  "success": true,
  "audioUrl": "https://storage.googleapis.com/.../voiceover.mp3",
  "estimatedDurationMs": 3200,
  "script": "Welcome to our app! Here's how to get started."
}
```

**Errors** (wallet charge is refunded when generation fails after debit):

| Status | `code` | Meaning |
|---|---|---|
| 404 | `voice_not_found` | ElevenLabs does not recognise the `voiceId`. |
| 400 | `invalid_voiceover_request` | Settings, model-specific limit, or SSML unsupported; correct the request before retrying. |
| 503 | `model_unavailable` | Account/endpoint cannot use the selected model. No fallback; explicitly select another model or contact platform support. |
| 422 | `provider_rejected_text` | ElevenLabs could not generate speech from this text. |
| 502 | `provider_error` | ElevenLabs failed. Retry only when `retryable` is `true`. |
| 503 | `provider_quota_exceeded` | The platform ElevenLabs account is out of credits. **Not retryable** — this is not the workspace wallet. Surface the message; do not ask the founder for an ElevenLabs API key. |

### Generate Segmented Speech
```
POST /api/workspaces/:workspaceId/demo-video/voiceover/segments
```
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/demo-video/voiceover/segments | Generate Segmented Speech (optional `voiceSettings`, top-level or per segment) -->

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.

Generate multiple audio segments with individual timing. Useful for step-by-step narration or multi-section audio.

Limits: at most **100 segments** and **20,000 characters** of combined segment
text per request.

**Request:**
```json
{
  "segments": [
    { "text": "Step one: Enter your email address." },
    { "text": "Step two: Choose your plan." },
    { "text": "Step three: Start building!" }
  ],
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "voiceSettings": { "stability": 0.37, "style": 0.5 },
  "fps": 30
}
```

- `voiceSettings` — Optional, applies to every segment. A segment can carry
  its own `voiceSettings` object, which replaces the top-level one for that
  segment. See [Voice Settings](#voice-settings).

**Response:**
```json
{
  "success": true,
  "segments": [
    { "text": "Step one...", "audioUrl": "https://...", "durationMs": 2100 },
    { "text": "Step two...", "audioUrl": "https://...", "durationMs": 1800 },
    { "text": "Step three...", "audioUrl": "https://...", "durationMs": 1500 }
  ],
  "totalSegments": 3,
  "totalDurationMs": 6300
}
```

### Voice Settings

For legacy models, both speech endpoints accept an optional `voiceSettings` object, passed to
ElevenLabs as `voice_settings`. Use it to change how a voice (premade or
cloned) delivers the script. Send only the fields you want to change; omitted
fields keep the platform defaults.

| Field | Type | Default | Effect |
|---|---|---|---|
| `stability` | number, 0–1 | `0.3` | Lower gives a more expressive, varied delivery; higher is steadier and flatter. |
| `similarity_boost` | number, 0–1 | `0.75` | How closely the output matches the original voice. |
| `style` | number, 0–1 | `0.4` | Style exaggeration. Higher makes the delivery more dramatic. |
| `use_speaker_boost` | boolean | `true` | Boosts similarity to the original speaker. |

A value outside its range, or a wrong type, is rejected with HTTP 400 before
anything is billed. Settings apply per request; nothing is stored on the
voice, so send them on every call that should use them.

---

## Voice Cloning (Instant Voice Clone)

Create a custom voice from uploaded audio samples and use its `voiceId` in the
TTS endpoints above. Cloned voices are **workspace-private**: only the
workspace that created a voice can list it, generate speech with it, or delete
it. All three endpoints require the workspace token (same auth as generation).

Cost: **$1.00 per voice created** (charged to the workspace wallet, refunded
automatically if creation fails). Using a cloned voice for TTS costs the same
as any other voice.

### Create a Cloned Voice
```
POST /api/workspaces/:workspaceId/audio/voices
```

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.
Send `multipart/form-data` (NOT JSON):

- `name` — Required text field, 1–80 characters.
- `files` — 1–5 audio samples. Allowed types: mp3, wav, webm, ogg, m4a, aac,
  flac. Max **10 MB per file**, **25 MB total**. 1–3 minutes of clean speech
  gives the best clone.

```javascript
const form = new FormData();
form.append('name', 'Founder Voice');
form.append('files', sampleBlob, 'sample1.mp3'); // repeat for more samples
const response = await fetch(`/api/workspaces/${workspaceId}/audio/voices`, {
  method: 'POST',
  headers: { 'X-Workspace-DB-Token': window.__workspaceDb?.token }, // no Content-Type — the browser sets the multipart boundary
  body: form,
});
```

**Response:**
```json
{ "success": true, "voice": { "voiceId": "abc123...", "name": "Founder Voice", "createdAt": "2026-08-06T00:00:00.000Z" } }
```

Use `voice.voiceId` as `voiceId` in the voiceover endpoints.

**Errors:**

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_voice_name` / `no_samples` / `too_many_samples` | Bad request shape. |
| 413 | `sample_too_large` / `samples_too_large` | A file exceeds 10 MB, or the batch exceeds 25 MB. Rejected before anything is billed. |
| 415 | `unsupported_audio_type` | Not an allowed audio MIME type. |
| 409 | `voice_limit_reached` | The platform's ElevenLabs account has no free voice slots. **Not retryable** — surface the message; the platform operator must free capacity. |

### List Workspace Voices
```
GET /api/workspaces/:workspaceId/audio/voices
```

**Headers:** `X-Workspace-DB-Token` — required (unlike the public premade
catalog at `GET /api/voices`, this response contains workspace-scoped data).

Returns this workspace's cloned voices (`"category": "cloned"`) followed by
the shared premade catalog (`"category": "premade"`). Other workspaces'
cloned voices are never included.

```json
{
  "success": true,
  "voices": [
    { "id": "abc123...", "name": "Founder Voice", "category": "cloned", "createdAt": "..." },
    { "id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "category": "premade", "labels": { "gender": "female" } }
  ]
}
```

### Delete a Cloned Voice
```
DELETE /api/workspaces/:workspaceId/audio/voices/:voiceId
```

**Headers:** `X-Workspace-DB-Token` — required.

Only the owning workspace can delete a voice; anything else returns
`403 voice_not_owned`. After deletion, generation requests using that
`voiceId` fail with a clear `410 voice_deleted` error.

### Using Cloned Voices in TTS

Pass the cloned `voiceId` to any voiceover endpoint. Ownership is enforced:

| Status | `code` | Meaning |
|---|---|---|
| 403 | `voice_not_owned` | The `voiceId` is another workspace's cloned voice. |
| 410 | `voice_deleted` | The voice was deleted; pick another voice. |

Premade catalog voices remain usable by everyone.

---

## Voice Changer (Speech-to-Speech)

Re-voice a recording: the words, timing and emotion of the input audio are
kept and the voice is replaced with `voiceId` — any premade voice or one of
this workspace's cloned voices (see Voice Cloning above). Record a line once,
play it back in a character's or a cloned voice.

Cost: **$0.30 per minute of input audio** (metered to the millisecond, $0.01
minimum), charged to the workspace wallet and refunded automatically if the
conversion fails. The billed length is measured by decoding the upload on the
server, not read from the file header.

<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/audio/speech-to-speech | Voice changer: re-voice an uploaded recording into a premade or cloned voice (multipart `audio` + `voiceId`, $0.30/min) -->

### Convert Speech to Another Voice
```
POST /api/workspaces/:workspaceId/audio/speech-to-speech
```

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.
Send `multipart/form-data` (NOT JSON):

- `audio` — Required. Exactly one file. Allowed types: mp3, wav, webm, ogg,
  m4a, aac, flac — browser `MediaRecorder` output (e.g.
  `audio/webm;codecs=opus`) is fine. Max **25 MB** and **5 minutes**; split
  longer recordings.
- `voiceId` — Required. The target voice: an `id` from
  `GET /api/workspaces/:workspaceId/audio/voices` (this workspace's cloned
  voices, then the premade catalog).
- `modelId` — Optional. `eleven_multilingual_sts_v2` (default, 29 languages,
  usually best even for English) or `eleven_english_sts_v2`.
- `removeBackgroundNoise` — Optional. `"true"` strips background noise from
  the input first.
- `voiceSettings` — Optional JSON string, e.g.
  `{"stability":0.5,"similarity_boost":0.8}` (same fields as TTS; see
  [Voice Settings](#voice-settings)).

```javascript
const form = new FormData();
form.append('audio', recordingBlob, 'take-1.webm'); // e.g. from MediaRecorder
form.append('voiceId', voiceId);
const response = await fetch(`/api/workspaces/${workspaceId}/audio/speech-to-speech`, {
  method: 'POST',
  headers: { 'X-Workspace-DB-Token': window.__workspaceDb?.token }, // no Content-Type — the browser sets the multipart boundary
  body: form,
});
const data = await response.json();
if (!response.ok) throw new Error(data.error || 'Voice change failed');
```

**Response:**
```json
{
  "success": true,
  "audioUrl": "https://storage.googleapis.com/.../speech-to-speech-1759160000000.mp3",
  "durationMs": 12480,
  "voiceId": "abc123...",
  "modelId": "eleven_multilingual_sts_v2"
}
```

`audioUrl` is a permanent public MP3 URL. `durationMs` is the measured input
length that was billed.

**Errors:**

| Status | `code` | Meaning |
|---|---|---|
| 400 | `no_audio` / `unexpected_file` / `invalid_request` | Missing file, more than one file, or a bad `voiceId` / `modelId` / `voiceSettings`. |
| 413 | `audio_too_large` / `audio_too_long` | Over 25 MB or over 5 minutes. Rejected before anything is billed. |
| 415 | `unsupported_audio_type` | Not an allowed audio MIME type. |
| 422 | `invalid_audio` / `audio_duration_unknown` | The file could not be decoded as audio, or its length could not be measured. Not billed. |
| 402 | `insufficient_balance` | The workspace wallet cannot cover the conversion. ElevenLabs is not called. |
| 403 / 410 | `voice_not_owned` / `voice_deleted` | Same cloned-voice ownership rules as TTS. |
| 404 | `voice_not_found` | ElevenLabs does not recognise the `voiceId`. Refunded. |
| 422 | `provider_rejected_audio` | ElevenLabs could not process the audio. Refunded. |
| 502 | `provider_error` | ElevenLabs failed. Refunded; retry only when `retryable` is `true`. |
| 503 | `provider_quota_exceeded` | The platform ElevenLabs account is out of credits. Refunded. **Not retryable** — surface the message. |

---

## Music Generation

Generate AI background music from text prompts or presets. Returns a public URL to the generated audio file.

### List Music Presets
```
GET /api/music/presets
```

**Available Presets:**

| Preset | Style |
|--------|-------|
| `corporate` | Upbeat, inspiring, piano + guitar |
| `tech` | Electronic ambient, futuristic synths |
| `uplifting` | Acoustic guitar, warm and friendly |
| `calm` | Soft piano, ambient pads, relaxing |
| `energetic` | Driving drums, modern synths |
| `playful` | Bouncy, cheerful, xylophone |
| `cinematic` | Epic orchestral, strings + brass |
| `lofi` | Lo-fi hip hop, chill beats |

<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/audio/music/preset | Generate Music from Preset (`provider`: `elevenlabs` default, or `gemini`) -->
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/audio/music/custom | Generate Custom Music (`provider`: `elevenlabs` default, or `gemini`) -->

### Generate Music from Preset
```
POST /api/workspaces/:workspaceId/demo-video/music/preset
```
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/audio/music/preset | Generate Music from Preset (`provider`: `elevenlabs` default, or `gemini`) -->

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.

**Request:**
```json
{
  "preset": "calm",
  "lengthMs": 30000
}
```

- `preset` — Required. One of: corporate, tech, uplifting, calm, energetic, playful, cinematic, lofi.
- `lengthMs` — Optional. Duration in milliseconds (3000-600000). Default: 60000 (1 minute).
- `provider` — Optional. `"elevenlabs"` (default) or `"gemini"`. See [Music providers](#music-providers).

**Response:**
```json
{
  "success": true,
  "provider": "elevenlabs",
  "audioUrl": "https://storage.googleapis.com/.../music.mp3",
  "durationMs": 30000,
  "prompt": "calm and peaceful background music..."
}
```

### Generate Custom Music
```
POST /api/workspaces/:workspaceId/demo-video/music/custom
```
<!-- MANIFEST:ENDPOINT POST /api/workspaces/:workspaceId/audio/music/custom | Generate Custom Music (`provider`: `elevenlabs` default, or `gemini`) -->

**Headers:** `X-Workspace-DB-Token: <window.__workspaceDb.token>` — required.

**Request:**
```json
{
  "prompt": "jazzy piano with soft drums, laid-back and sophisticated, 90 BPM",
  "lengthMs": 45000,
  "instrumental": true
}
```

- `prompt` — Required (10-4100 chars). Text description of the music style.
- `lengthMs` — Optional. Duration in milliseconds (3000-600000). Default: 60000.
- `instrumental` — Optional. Default: true. Set to false for vocals.
- `provider` — Optional. `"elevenlabs"` (default) or `"gemini"`. See [Music providers](#music-providers).

**Response:**
```json
{
  "success": true,
  "provider": "elevenlabs",
  "audioUrl": "https://storage.googleapis.com/.../music.mp3",
  "durationMs": 45000,
  "prompt": "jazzy piano with soft drums..."
}
```

### Music providers

Both music endpoints accept an optional `provider` field. Omitting it keeps the
ElevenLabs behaviour above unchanged. Passing `"gemini"` renders the same
request with Google Gemini's Lyria models instead (many founders prefer its
output for Remotion videos). There is no silent fallback between providers: if
Gemini is not configured on the platform the endpoint answers `503` with
`{ "code": "gemini_music_not_configured" }`.

| | `elevenlabs` (default) | `gemini` |
|---|---|---|
| Length | Exact `lengthMs` (3s–10min) | Model-driven: requests ≤30s render a fixed ~30s clip (`lyria-3-clip-preview`); longer requests render a prompt-steered full track, clamped to 240s (`lyria-3.5`). The response's `durationMs` is the **measured** length of the file. |
| Format | MP3 | MP3 (`format` field in the response) |
| Cost | ~$0.01 per second | Per track: $0.04 (clip) / $0.08 (full track) |

Gemini responses add `model`, `requestedLengthMs`, `clampedLengthMs`,
`lengthClamped` and `format` so your app can see when the rendered length
differs from the request:

```json
{
  "success": true,
  "provider": "gemini",
  "model": "lyria-3-clip-preview",
  "audioUrl": "https://storage.googleapis.com/.../background-music-gemini-....mp3",
  "durationMs": 30800,
  "requestedLengthMs": 15000,
  "clampedLengthMs": 30000,
  "lengthClamped": true,
  "format": "mp3",
  "prompt": "jazzy piano with soft drums..."
}
```

```typescript
// Same call, Gemini provider
const response = await fetch(`/api/workspaces/${workspaceId}/audio/music/custom`, {
  method: 'POST',
  headers: authHeaders(),
  body: JSON.stringify({ prompt, lengthMs: 30000, provider: 'gemini' }),
});
```

---

## Installation Helper

Every generation call sends the workspace token. `authHeaders()` throws when
the token is unavailable, so a misconfigured app fails loudly instead of
silently issuing an anonymous request that the platform rejects with a 401.

```javascript
function authHeaders() {
  const token = window.__workspaceDb?.token;
  if (!token) {
    throw new Error(
      'Workspace token unavailable — audio generation requires window.__workspaceDb.token'
    );
  }
  return { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token };
}

export const elevenlabsAudio = {
  // Public catalog read — costs nothing, needs no token.
  async listVoices() {
    const response = await fetch('/api/voices');
    const data = await response.json();
    return data.voices;
  },

  // Legacy settings remain optional. For v3/v4 use model-compatible settings;
  // options can carry { modelId: 'eleven_v4', spendIntentId }.
  async speak(workspaceId, text, voiceId, voiceSettings, options = {}) {
    const response = await fetch(`/api/workspaces/${workspaceId}/audio/voiceover`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...options, script: text, voiceId: voiceId || 'EXAVITQu4vr4xnSDxMaL', voiceSettings })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Voiceover failed');
    const data = await response.json();
    return data.audioUrl;
  },

  async speakSegments(workspaceId, segments, voiceId, voiceSettings, options = {}) {
    const response = await fetch(`/api/workspaces/${workspaceId}/audio/voiceover/segments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...options, segments: segments.map(s => typeof s === 'string' ? { text: s } : s), voiceId, voiceSettings })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Segments failed');
    return response.json();
  },

  async generateMusic(workspaceId, preset, lengthMs = 30000) {
    const response = await fetch(`/api/workspaces/${workspaceId}/audio/music/preset`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ preset, lengthMs })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Music failed');
    const data = await response.json();
    return data.audioUrl;
  },

  async generateCustomMusic(workspaceId, prompt, lengthMs = 30000) {
    const response = await fetch(`/api/workspaces/${workspaceId}/audio/music/custom`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt, lengthMs, instrumental: true })
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Music failed');
    const data = await response.json();
    return data.audioUrl;
  },

  // Voice changer: re-voice a recording (max 25 MB / 5 minutes) into voiceId.
  // Multipart, so send only the token header — the browser sets Content-Type.
  async changeVoice(workspaceId, audioFile, voiceId, { modelId, removeBackgroundNoise } = {}) {
    const { 'X-Workspace-DB-Token': token } = authHeaders();
    const form = new FormData();
    form.append('audio', audioFile, audioFile.name || 'recording.webm');
    form.append('voiceId', voiceId);
    if (modelId) form.append('modelId', modelId);
    if (removeBackgroundNoise) form.append('removeBackgroundNoise', 'true');
    const response = await fetch(`/api/workspaces/${workspaceId}/audio/speech-to-speech`, {
      method: 'POST',
      headers: { 'X-Workspace-DB-Token': token },
      body: form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Voice change failed');
    return data.audioUrl;
  }
};
```

---

## Use Cases

- **Accessibility** — Read app content aloud for visually impaired users
- **Language Learning** — Generate pronunciation examples and listening exercises
- **Meditation / Wellness** — Guided meditations with calming voice + ambient music
- **Podcast Tools** — Convert written scripts to audio episodes
- **Audio Content** — Generate audio versions of articles, newsletters, or lessons
- **Notification Audio** — Speak alerts and status updates
- **Character Voices / Voice Changer** — Record a line once and play it back in a character's or cloned voice, keeping the original delivery
- **Music Creation** — Background music for presentations, videos, or ambient app experiences
- **Voice Assistants** — Text-to-speech responses in conversational apps

---

## Tips

- ElevenLabs emphasizes **CAPITALIZED** words — use ALL CAPS for brand names or emphasis
- For longer texts, use the segmented endpoint to generate per-section audio
- Music generation takes 10-30 seconds depending on length; show a loading state
- All generated audio files are stored in Google Cloud Storage with permanent public URLs
- Cost: $0.08 per 1000 characters for explicit v3/v4, $0.30 for legacy TTS; $0.01 minimum per voiceover request. $0.30 per minute of input audio (voice changer), $1.00 per cloned voice, ~$0.01 per second (ElevenLabs music), $0.04–$0.08 per track (Gemini music)

---
# openai-realtime

Source: integrations/openai-realtime/docs.md

# OpenAI Realtime Audio Integration

Real-time voice conversations with AI using OpenAI's Realtime API.

## Category
AI/ML

## Required API Keys
- `OPENAI_API_KEY`

## API Endpoint

**Get Ephemeral Token**
```
GET /api/realtime/token
```

Returns a short-lived OpenAI client secret for secure client-side realtime
connections. Fetch a fresh one immediately before each `connect()` and use the
returned `model` so the client and secret agree.

**Response:**
```json
{
  "token": "<ephemeral client secret>",
  "expires": 1723049460000,
  "model": "gpt-realtime",
  "sdk": "agents"
}
```

## Quick Start

This integration uses ephemeral tokens for security - never expose API keys to
the browser. Each token starts in a neutral hold state with no tools and tool
use disabled. If the app supplies tools, it must explicitly enable tool use in
its own session configuration.

```javascript
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';

export async function startVoiceSession({
  tools = [],
  toolChoice = 'none',
} = {}) {
  const response = await fetch('/api/realtime/token');
  if (!response.ok) throw new Error('Failed to get realtime token');
  const { token, model } = await response.json();

  const agent = new RealtimeAgent({
    name: 'Assistant',
    instructions: 'You are a helpful voice assistant.',
    tools,
  });

  const session = new RealtimeSession(agent, {
    model,
    // Tools remain disabled unless the caller explicitly passes "auto".
    config: { toolChoice },
  });
  await session.connect({ apiKey: token });
  return session;
}

// Explicit tool opt-in:
// await startVoiceSession({ tools: myTools, toolChoice: 'auto' });
```

## Use Cases
- Voice assistants
- Real-time transcription
- Voice-controlled interfaces
- Interactive voice apps
- Language learning tools

## Documentation
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)

---
# openai-text-generation

Source: integrations/openai-text-generation/docs.md

# OpenAI Text Generation (GPT) Integration

Generate text, chatbots, content creation, and AI responses using OpenAI GPT models.

## Category
AI/ML

## Required API Keys (Platform-Level)

The platform supplies the OpenAI API key when it calls OpenAI. That key management does **not** authenticate the app user calling the Audos proxy — your app must still identify itself (see below).

- `OPENAI_API_KEY` — managed by the platform (never exposed to the browser)

---

## Authentication (REQUIRED)

**Every call to this proxy spends platform credentials and requires a workspace
token. An unauthenticated request is rejected with `401` before OpenAI is
called.** This is not optional and the platform does not do it for you.

```javascript
const ws = (window as any).__workspaceDb;

const AUDOS_AI_HEADERS = {
  'Content-Type': 'application/json',
  'X-Workspace-DB-Token': ws?.token,
};
```

`window.__workspaceDb` is injected by the platform into any app that calls this
endpoint. Read `.token` at call time — never copy the value into your source and
never commit it.

Rejection responses carry a machine-readable `code`:

| Status | `code` | Meaning |
|---|---|---|
| 401 | `no_credentials` | No token sent. |
| 401 | `workspace_token_invalid` | Token expired, revoked, or blocked by its origin allowlist. |
| 403 | `workspace_token_wrong_workspace` | Token belongs to a different workspace than `X-Audos-Workspace-Id`. |
| 403 | `not_a_workspace_member` | Signed-in user is not a member of this workspace. |
| 403 | `cross_site_session_denied` | A cookie-backed browser session was used from another site. Send the workspace token instead. |
| 429 | `rate_limited` | Per-workspace / per-caller / per-IP burst limit. Retry after `retryAfterSeconds`. |
| 404 | `unsupported_endpoint` | Only `/v1/chat/completions`, `/v1/audio/speech`, and `/v1/embeddings` are proxied. |
| 405 | `unsupported_method` | Only `POST` is proxied. |
| 400 | `unsupported_model` | Model is not on the supported list for that endpoint. |
| 400 | `unsupported_field` | A top-level request field that the proxy does not forward. |
| 400 | `output_tokens_too_large` | `max_completion_tokens` / `max_tokens` above the ceiling. |
| 413 | `body_too_large` / `input_too_large` | Request body or conversation history above the ceiling. |

Authentication is a gate, not a budget. The token lives in the visitor's
browser, so calls are also rate-limited and capped — apply your own session and
access controls before exposing a "generate" button.

**Cross-origin note.** Your published app calls this proxy from its own domain,
so the request is cross-origin. Send the token header and use a plain
`fetch` — do **not** set `credentials: 'include'`. The proxy deliberately does
not allow credentialed cross-origin calls, and a signed-in browser session is
only accepted on same-origin requests (a cross-site call that relies on cookies
is refused with `403 cross_site_session_denied`).

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the Authentication and API Endpoint sections of this doc. -->
**Authentication is REQUIRED.** The proxy rejects anonymous calls with `401`
(`code: "no_credentials"`) before OpenAI is contacted. Send the workspace token
on every request:

```javascript
const ws = (window as any).__workspaceDb;

const response = await fetch('/proxy/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Workspace-DB-Token': ws?.token,
  },
  body: JSON.stringify({
    model: 'gpt-6.1-sol',
    reasoning_effort: 'medium',
    messages: [{ role: 'user', content: 'Hello!' }],
    max_completion_tokens: 6000,
    stream: false,
  }),
});
```

`POST /v1/chat/completions`, `POST /v1/audio/speech`, and `POST /v1/embeddings`
are the only proxied OpenAI paths — model listing, image generation,
transcription, video, batches, fine-tuning and the Responses API all return
`404 unsupported_endpoint`. Chat accepts only approved text models
(`400 unsupported_model`); speech accepts `tts-1` and `tts-1-hd` and returns
audio bytes (not JSON); embeddings accept `text-embedding-3-small`,
`text-embedding-3-large`, and `text-embedding-ada-002`.
Chat output is capped at 16,384 tokens, and calls are rate-limited per
workspace. Streaming works on chat; the terminal usage chunk has an
empty `choices` array, so read deltas with `event.choices?.[0]?.delta?.content`.
Pick the tier by whether a person is waiting: `gpt-6-luna` + `reasoning_effort:
"none"` when they wait on every keystroke, `gpt-6.1-sol` + `"medium"` (default)
when they watch a streamed answer, `gpt-6.1-sol` + `"high"`/`"xhigh"` when
nobody is waiting. `gpt-6.1-sol` rejects `"none"` and takes no `tools` on chat
completions — tool-calling call sites use `gpt-6-luna` at `"none"` or `gpt-5.6-sol`.
See `integrations/openai-text-generation/docs.md` for the full contract.
<!-- MANIFEST:END -->

---

## API Endpoint

**Chat Completions (Proxied)**
```
POST /proxy/openai/v1/chat/completions
```

**Speech (Proxied)** — same auth as chat; success is audio bytes, not JSON.
```
POST /proxy/openai/v1/audio/speech
```

```json
{
  "model": "tts-1",
  "voice": "nova",
  "input": "Hello!"
}
```

Accepted speech models: `tts-1`, `tts-1-hd`. Accepted fields:
`model`, `input` (max 4,096 characters), `voice`, `response_format`, `speed`,
`instructions`. Do not `JSON.parse` the success body.

**Embeddings (Proxied)** — same auth as chat; success is JSON vectors.
```
POST /proxy/openai/v1/embeddings
```

```json
{
  "model": "text-embedding-3-small",
  "input": "match this query against knowledge chunks"
}
```

Accepted embedding models: `text-embedding-3-small`, `text-embedding-3-large`,
`text-embedding-ada-002`. Accepted fields: `model`, `input` (string or string
array), `encoding_format` (`float` or `base64`), `dimensions` (embedding-3
models only), `user`.

Nothing else is reachable through `/proxy/openai/*`: model listing
(`/v1/models`), image generation, transcription, batches, and
fine-tuning all return `404 unsupported_endpoint`.

**Request:**
```json
{
  "model": "gpt-6.1-sol",
  "reasoning_effort": "medium",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "max_completion_tokens": 6000,
  "stream": false
}
```

**Response:**
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    }
  }]
}
```

## Limits

| Limit | Value | Behaviour |
|---|---|---|
| Request body | 256 KB | `413 body_too_large` |
| Conversation input | 200,000 characters | `413 input_too_large` |
| Output tokens | 16,384 | Above it → `400 output_tokens_too_large`. **Omitted → the proxy applies the ceiling for you.** Reasoning tokens count against this cap. |
| Completions (`n`) | 4 | `400 too_many_completions` |

Only these top-level fields are forwarded: `model`, `messages`, `stream`,
`stream_options`, `temperature`, `top_p`, `max_tokens`,
`max_completion_tokens`, `presence_penalty`, `frequency_penalty`, `stop`,
`seed`, `n`, `response_format`, `tools`, `tool_choice`,
`parallel_tool_calls`, `reasoning_effort`, `verbosity`, `logit_bias`, `user`,
`metadata`. Anything else is refused with `400 unsupported_field`.

## Streaming

`stream: true` is supported and returns Server-Sent Events unchanged. The proxy
always forces `stream_options: { include_usage: true }` (merging over anything
you send, so usage reporting cannot be switched off), which means **the final
data chunk has an empty `choices` array** — always read deltas defensively
(`event.choices?.[0]?.delta?.content`), exactly as the helper below does. A
`stream_options` value that is not an object is refused with
`400 invalid_stream_options`.

## Choosing a Tier (decide once per call site, at build time)

One model, a reasoning dial. Set the dial by **whether a person is waiting**, not by how hard the task looks — reasoning is cheap, latency is what the user feels.

| Tier | Model | `reasoning_effort` | `max_completion_tokens` | When |
|---|---|---|---|---|
| **Instant** | `gpt-6-luna` | `"none"` | 2000 | A person is waiting on every keystroke or click — autocomplete, inline suggestions, tagging, quick validation. |
| **Interactive (default)** | `gpt-6.1-sol` | `"medium"` | 6000 | A person is watching a streamed answer or a spinner — chat, summaries, extraction, rewriting, classification, image analysis. |
| **Background** | `gpt-6.1-sol` | `"high"` | 16000 | Nobody is waiting live — reports, scheduled jobs, webhooks, batch analysis. |
| **Background, heavy** | `gpt-6.1-sol` | `"xhigh"` | 16000 | Background work where the output is consequential — multi-step analysis, long-document synthesis, anything a founder acts on without checking. |

**Reasoning rules:** `gpt-6.1-sol` accepts `"low"`, `"medium"` (its default), `"high"`, `"xhigh"`, and `"max"` — it never accepts `"none"`, so there is no way to run it without reasoning; drop to `gpt-6-luna` when you need that. Reasoning tokens are spent *before* any visible text and bill against `max_completion_tokens`, so send the tier's cap (a 1000-token cap on `"medium"` often returns an empty `content`). Streaming hides most of the reasoning delay in chat UIs; prefer `stream: true` for anything a person watches.

**Function tools:** `gpt-6.1-sol` does not take `tools` on `/v1/chat/completions` (OpenAI serves its tool calling on the Responses API, which this proxy does not expose yet). A call site that needs function tools uses `gpt-6-luna` with `reasoning_effort: "none"` (the only GPT-6 configuration that takes tools on chat completions) or `gpt-5.6-sol`.

**Token parameter:** use `max_completion_tokens` (the older `max_tokens` is rejected by GPT-5 and later models). If you send both, both are checked against the ceiling and the proxy forwards a single normalized field carrying the smaller value.

## Installation

```javascript
// Tier defaults — see "Choosing a Tier". Pass `tier: 'instant' | 'interactive' |
// 'background' | 'background_heavy'`, or override `model` / `reasoningEffort` /
// `maxTokens` directly.
const TIERS = {
  instant: { model: 'gpt-6-luna', reasoningEffort: 'none', maxTokens: 2000 },
  interactive: { model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 6000 },
  background: { model: 'gpt-6.1-sol', reasoningEffort: 'high', maxTokens: 16000 },
  background_heavy: { model: 'gpt-6.1-sol', reasoningEffort: 'xhigh', maxTokens: 16000 }
};

function completionConfigFor(options) {
  const tier = TIERS[options.tier] || TIERS.interactive;
  const model = options.model || tier.model;
  // gpt-6.1-sol never accepts "none"; fall back to its lowest effort.
  let reasoningEffort = options.reasoningEffort || tier.reasoningEffort;
  if (model === 'gpt-6.1-sol' && reasoningEffort === 'none') reasoningEffort = 'low';
  return {
    model,
    reasoning_effort: reasoningEffort,
    max_completion_tokens: options.maxTokens || tier.maxTokens
  };
}

// Every proxied call sends the workspace token (X-Workspace-DB-Token).
function audosAiHeaders() {
  const token = (window as any).__workspaceDb?.token;
  if (!token) {
    throw new Error(
      'Workspace token unavailable — the OpenAI proxy requires X-Workspace-DB-Token.'
    );
  }
  return { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token };
}

async function throwIfNotOk(response) {
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  const code = data?.code ? ` [${data.code}]` : '';
  const message =
    data?.error?.message || data?.error || `OpenAI request failed (${response.status})`;
  throw new Error(`${message}${code}`);
}

export const openaiText = {
  async generateText(messages, options = {}) {
    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: audosAiHeaders(),
      body: JSON.stringify({
        ...completionConfigFor(options),
        messages,
        stream: false
      })
    });

    await throwIfNotOk(response);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'OpenAI request failed');
    return data.choices?.[0]?.message?.content || '';
  },

  async chat(userMessage, conversationHistory = [], systemPrompt = null, options = {}) {
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push(...conversationHistory);
    messages.push({ role: 'user', content: userMessage });

    return await this.generateText(messages, options);
  },

  async streamChat(userMessage, onChunk, conversationHistory = [], options = {}) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await fetch('/proxy/openai/v1/chat/completions', {
      method: 'POST',
      headers: audosAiHeaders(),
      body: JSON.stringify({
        ...completionConfigFor(options),
        messages,
        stream: true
      })
    });

    await throwIfNotOk(response);
    if (!response.body) throw new Error('OpenAI streaming response has no body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    const consumeLine = (line) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data) return;
      if (data === '[DONE]') {
        completed = true;
        return;
      }

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        throw new Error('Invalid OpenAI stream event');
      }
      if (event.error) {
        throw new Error(event.error.message || 'OpenAI stream failed');
      }
      // The terminal usage chunk carries an empty `choices` array.
      const content = event.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    };

    while (!completed) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        consumeLine(line);
        if (completed) return;
      }
    }

    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      consumeLine(line);
      if (completed) return;
    }

    throw new Error('OpenAI stream ended before [DONE]');
  }
};
```

## Migration note for already-published apps

Apps published before this change called the proxy anonymously
(`headers: { 'Content-Type': 'application/json' }`) and now receive
`401 no_credentials`. Fix: add the `X-Workspace-DB-Token` header as shown above
and republish the app. The platform injects `window.__workspaceDb` into any app
whose source references `/proxy/openai/`, so no extra setup is needed — but the
app must be recompiled/republished for the injection to reach the served
bundle.

## Use Cases
- AI chatbots
- Content generation
- Text summarization
- Question answering
- Semantic search / knowledge-base retrieval
- Creative writing assistance
- Code generation

## Supported Models

Recommended:
- `gpt-6.1-sol` — the default for every call site a person watches or that runs in the background; set `reasoning_effort` by tier (`"medium"` interactive, `"high"`/`"xhigh"` background). Accepts images as input. Never accepts `"none"`; no `tools` on chat completions.
- `gpt-6-luna` — the instant tier (`reasoning_effort: "none"`) for keystroke-latency work; also the GPT-6 model to use when a call site needs function tools on the proxy.

Also accepted (existing apps): `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`gpt-5`, `gpt-5.5`, `gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`, `gpt-4.1`,
`gpt-4.1-mini`, `gpt-4o`, `gpt-4o-mini` and their dated pins. Any other id on chat — including image, audio, video, realtime and
embedding models — is refused with `400 unsupported_model`. Speech uses
`tts-1` or `tts-1-hd` on `/v1/audio/speech`. Embeddings use
`text-embedding-3-small`, `text-embedding-3-large`, or
`text-embedding-ada-002` on `/v1/embeddings`.

## Verifying the platform credential

GET `/api/workspaces/WORKSPACE_ID/ai-proxy/health` reports state `configured` | `verified` | `invalid` | `unreachable` per provider. `configured` (and `available: true` on `/proxy/status`) is not proof the key works; read `verified` (or make one tiny real call) before writing app code against the proxy or telling a founder it works.

## Documentation
- [OpenAI Text Generation Docs](https://platform.openai.com/docs/guides/text-generation)

---
## Platform and data

# custom-api-keys

Source: integrations/custom-api-keys/docs.md

# Custom API Keys (BYOK)

Use the founder's own third-party API keys in your app without ever exposing the secret value to the browser.

Audos native payments, including Stripe Test and Live modes, are configured in Wallet → Accept Payments and do not use custom API keys.

## Category
Backend / Security

## Required API Keys
None — the founder stores their own keys as named workspace secrets (managed by Otto or the Integrations panel).

---

## Concepts

- **Named secret** — An encrypted, per-workspace API key stored under an
  uppercase NAME (e.g. `SERVICE_API_KEY`, `SENDGRID_API_KEY`). Only the NAME,
  label, allow-listed hosts, last 4 characters, enabled flag, and last-used time
  are ever readable. The plaintext value is never returned to the app, the
  model, or the logs.
- **Secrets proxy** — A workspace-scoped edge endpoint that forwards an HTTP
  request to a third-party API and substitutes `{{secrets.NAME}}` placeholders
  with the real values server-side. Your app never sees the key.
- **Allowed hosts** — Each key has an allow-list of upstream hostnames it may be
  sent to (e.g. `api.example.com`). The proxy refuses to use a key against any
  host not on its list, and it refuses a key with an empty list.

Space apps run in the browser and **must never contain a real API key**. Always
call third-party APIs through the secrets proxy using `{{secrets.NAME}}`.

---

## Endpoint

```
POST /api/workspaces/:workspaceId/secrets/proxy
Headers:
  Content-Type: application/json
  X-Workspace-DB-Token: <window.__workspaceDb.token>
Body (JSON):
  {
    "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    "url": "https://api.example.com/v1/thing",   // HTTPS only; host must be allow-listed on every referenced key
    "query":   { ... },                          // optional
    "headers": { ... },                          // optional
    "json":    { ... },                          // optional — JSON body
    "form":    { ... },                          // optional — application/x-www-form-urlencoded body
    "body":    "raw string",                      // optional — raw body
    "responseType": "json" | "text" | "binary"   // optional — see "Response shape"
  }
Response:
  { "status": number, "headers": { ... }, "body": <upstream response body>, "encoding"?: "base64" }
```

The request schema is **strict** — an unknown field is rejected outright, so use
exactly these names.

### Request body and Content-Type

Only one of `json`, `body`, or `form` may be supplied. `GET` and `HEAD` requests
cannot carry any of them.

| Field | Accepted shape | What the proxy sends | Content-Type applied for you |
|---|---|---|---|
| `json` | Any JSON value: object, array, string, number, boolean, or `null` | The proxy runs `JSON.stringify` after replacing secret placeholders. Pass the value itself — do not pre-stringify an object. | `application/json` |
| `body` | A raw string | UTF-8 bytes exactly as supplied after placeholder replacement | `text/plain; charset=utf-8` |
| `form` | An object whose keys and values are strings | URL-encoded by default; set `formEncoding: "multipart"` for text-only multipart fields | `application/x-www-form-urlencoded`, or `multipart/form-data` with the generated boundary |

Yes: when you use `json`, the proxy sets `Content-Type: application/json` for
you. The same automatic default applies to raw and form bodies as shown above.
If you provide a `Content-Type` header yourself it wins; otherwise the optional
top-level `contentType` override wins over the automatic default. A request with
no body gets no automatic Content-Type.

### Response shape

| `responseType` | `body` | `encoding` |
|---|---|---|
| omitted (default) | parsed JSON when the upstream is JSON, otherwise the text — **unless** the bytes aren't valid UTF-8 (mp3, image, PDF…), in which case they come back base64-encoded automatically instead of being mangled by a lossy UTF-8 decode | `"base64"` only in that automatic binary case |
| `"json"` | parsed JSON (falls back to the raw text when it doesn't parse) | — |
| `"text"` | the response as a string | — |
| `"binary"` | the bytes, base64-encoded | `"base64"` |

An explicit `responseType` always wins over the automatic behaviour. Callers
that might receive binary must branch on `encoding` — a base64 body is bytes,
not text, and re-encoding it as a string destroys it. In the browser:

```ts
if (data.encoding === 'base64') {
  const bytes = Uint8Array.from(atob(data.body), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: data.headers['content-type'] }));
  new Audio(url).play();
}
```

Upstream responses are capped at **10 MB** of raw bytes (base64 inflates the
reply by roughly a third). Over the cap the call fails with
`code: 'response_too_large'` rather than returning a truncated body.

### Failure codes

**Permanent or transient?** Permanent means do not retry the same unchanged
request — fix the request/configuration or take the fallback path. Transient
means retry later with backoff (and still take the fallback path if retries are
exhausted). An upstream HTTP 4xx/5xx is not one of these proxy failures: the
proxy call succeeds and returns that upstream status in `status`.

| `code` | HTTP status | Class | Meaning and action |
|---|---:|---|---|
| `invalid_request` | 400 | Permanent | The request shape is invalid (including unknown fields, conflicting body fields, or a body on GET/HEAD). Fix it. |
| `unknown_secret` | 400 | Permanent | A referenced secret is missing or disabled. Configure/enable it or use the fallback. |
| `no_allowed_hosts` | 400 | Permanent | A referenced secret has no host allow-list. Configure the key before trying again. |
| `invalid_url` | 400 | Permanent | The substituted target URL is invalid. Fix the URL. |
| `https_required` | 400 | Permanent | The target is not HTTPS. Use an HTTPS endpoint. |
| `blocked_host` | 403 | Permanent | The target host or resolved IP is blocked by the proxy's SSRF policy. Choose a public third-party endpoint. |
| `host_not_allowed` | 403 | Permanent | At least one referenced secret does not allow the target host. Fix that key's allow-list. |
| `request_too_large` | 413 | Permanent | The built request body exceeds the proxy limit. Reduce or split it. |
| `rate_limited` | 429 | Transient | The workspace used its per-minute allowance. Retry later with backoff. |
| `concurrency_limited` | 429 | Transient | Too many proxy calls are active for the workspace. Retry after another call finishes. |
| `signer_error` | 500 | Transient | The platform request signer failed. Retry later; use the fallback if it repeats. |
| `proxy_error` | 500 | Transient | An unexpected internal proxy failure occurred. Retry once later, then use the fallback and report it if it repeats. |
| `bad_redirect` | 502 | Permanent | The upstream returned an invalid redirect location. Use a correct final URL or another endpoint. |
| `cross_host_redirect` | 502 | Permanent | The upstream tried to redirect secret-bearing headers to another host. Call an allowed final host directly. |
| `too_many_redirects` | 502 | Permanent | The upstream redirect chain exceeds the proxy limit. Use the final URL or another endpoint. |
| `response_too_large` | 502 | Permanent | The raw upstream response exceeds the proxy limit. Ask for less data or use another transfer path. |
| `upstream_error` | 502 | Transient | DNS, connection, TLS, timeout, or another upstream transport failure occurred. Retry later with backoff. |

### `{{secrets.NAME}}` placeholders

Placeholders may appear anywhere in `url`, `query`, `headers`, `json`, `form`,
or `body`. At the edge, each `{{secrets.NAME}}` is replaced with the decrypted
value of the workspace secret named `NAME`. The substituted value never reaches
client code, the model, or logs.

```
Authorization: "Bearer {{secrets.SERVICE_API_KEY}}"
```

### Rules

- **HTTPS only.** Non-HTTPS `url` values are rejected.
- **Host allow-list.** Every referenced secret must allow the request's host.
- **Enabled only.** A disabled secret is not resolved.
- **NAME format.** `^[A-Za-z][A-Za-z0-9_]{0,127}$`, stored upper-cased. Reference
  the upper-cased NAME in placeholders.

---

### HTTP Basic auth

Placeholder substitution is **verbatim** — there is no base64 (or any other)
transform, and app code can never `btoa()` a placeholder client-side (that
would require the plaintext). So you **cannot** build
`Authorization: Basic base64(user:{{secrets.KEY}})` at request time; the
usual Basic-auth patterns do not work here.

For an API that only accepts Basic auth (e.g. `api:KEY` style), store the
**pre-encoded** value as the secret — i.e. save `base64("api:YOUR_KEY")` as
the secret's value — then send it verbatim:

```
Authorization: "Basic {{secrets.PROVIDER_BASIC}}"
```

If the provider also accepts a Bearer / `X-Api-Key` header or a query
parameter, prefer that instead.

---

## Managing keys

The founder (workspace owner) manages keys conversationally through Otto
(`set_custom_api_key`, `list_custom_api_keys`, `check_custom_api_key`,
`set_custom_api_key_enabled`, `delete_custom_api_key`) or via the Integrations
panel. Writes are owner-only. Never build an app UI that collects a raw key and
stores it in your own tables — route the founder to the secret manager instead.

## Can code tell whether a key is stored?

**No. Stored secrets are not discoverable from code.** No API returns the list
of secret NAMEs a workspace holds to code — not the proxy, not the hook helper,
not the WorkspaceDB, not the build agent's toolset. There is no "does
SERVICE_API_KEY exist?" read your app can call. Listing keys is a workspace-chat
capability, not an app capability.

| Vantage point | Can it see which keys exist? |
|---|---|
| The founder, in the workspace's own Otto chat | **Yes** — `list_custom_api_keys` and `check_custom_api_key` return masked summaries (NAME, label, allowed hosts, last 4, enabled, last used), never a value. The Integrations panel shows the same. |
| Another member of that workspace, in the same Otto chat | **Yes** — those two reads are open to any workspace member. Only the writes (`set_custom_api_key`, `set_custom_api_key_enabled`, `delete_custom_api_key`) are owner-only. |
| A customer chatting with the space | No — the key tools do not exist on the customer-facing surface. |
| A browser space app | No. |
| A server function (workspace hook) | No. It can **use** a key — through the proxy, or by signing with it (below) — but it can never read one, or ask whether one exists. |
| The in-workspace build agent writing the app | No. |

Two things not to do because of this:

- **Do not create a throwaway hook just to probe for a key** and delete it
  afterwards. The probe belongs inside the feature that needs the key (below),
  where it keeps working the day the founder adds, disables, or rotates it.
- **Do not stall the build asking the founder whether the key is there.** Build
  the feature so it works either way, ship it, and let the app tell the founder
  what it needs at the moment it needs it.

## Building for a key that may not be there

The only way to learn anything about a secret is to *use* it: send the real
request with the `{{secrets.NAME}}` placeholder and branch on what comes back.

**Probe once, then latch the verdict.** Every attempt is a real round trip (and
inside a hook it also spends one of that hook's 50 fetch slots, even when the
proxy refuses the call before contacting anyone). Record the verdict in one
module-level variable and reuse it for the rest of the execution instead of
re-probing per item, per row, or per render.

Latch "no usable key" **only** on these:

| What came back | Meaning | Latch? |
|---|---|---|
| `unknown_secret` | No secret with that NAME — or it exists but is disabled. The two are indistinguishable. | Yes — keyless path. |
| `no_allowed_hosts` | The key exists but its host allow-list is empty. | Yes — keyless path; tell the founder to allow-list the host. |
| `host_not_allowed` | The key exists but does not allow this host. | Yes — keyless path; name the host. |
| A proxy call that succeeded, with upstream `status` 401 or 403 | The key exists and the third party rejected it. | Yes — but say "rejected", not "missing". |
| `rate_limited`, `concurrency_limited`, `signer_error`, `proxy_error`, `upstream_error` | Transient. | **No.** Retry later; latching here disables a working key for the rest of the run over a blip. |
| `invalid_request`, `invalid_url`, `https_required`, `blocked_host`, `request_too_large`, `bad_redirect`, `cross_host_redirect`, `too_many_redirects`, `response_too_large` | Your request is wrong, not the founder's key. | **No.** Fix the code. |
| Any code you do not recognise | Unknown. | **No.** Treat it as transient and surface the raw code. |

There are no `no_secrets` or `secret_disabled` codes — a missing key and a
disabled key both come back as `unknown_secret`. See **Failure codes** above for
the complete set.

```ts
type KeyVerdict = 'unknown' | 'usable' | 'missing' | 'host-not-allowed' | 'rejected';

const CONFIG_FAILURES = new Set(['unknown_secret', 'no_allowed_hosts', 'host_not_allowed']);

// One latch for the whole execution — not one per call site.
let verdict: KeyVerdict = 'unknown';

async function enrich(input: string) {
  if (verdict !== 'unknown' && verdict !== 'usable') return keylessEnrich(input);

  const res = await fetch(`/api/workspaces/${ws.workspaceId}/secrets/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token },
    body: JSON.stringify({
      method: 'GET',
      url: `https://api.example.com/v1/lookup?q=${encodeURIComponent(input)}`,
      headers: { Authorization: 'Bearer {{secrets.EXAMPLE_API_KEY}}' },
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    const code = data?.code as string | undefined;
    if (code && CONFIG_FAILURES.has(code)) {
      verdict = code === 'host_not_allowed' ? 'host-not-allowed'
        : code === 'no_allowed_hosts' ? 'host-not-allowed'
        : 'missing';
      return keylessEnrich(input);          // latched: no more probes this run
    }
    throw new Error(`Lookup failed (${code ?? res.status})`); // transient/bug — do not latch
  }

  // The proxy round trip succeeded. Now read the UPSTREAM status.
  if (data.status === 401 || data.status === 403) {
    verdict = 'rejected';                   // key exists; the provider said no
    return keylessEnrich(input);
  }
  verdict = 'usable';
  return data.body;
}
```

### A successful proxy call is not a successful API call

`ok` / HTTP 200 from the proxy means only that the round trip completed. You
must still read the upstream `status`:

- `status` 401 or 403 → the key **exists** and the provider rejected it (wrong
  value, revoked, wrong account, missing scope). That is the opposite of a
  missing key. Never show "no API key configured" here — it sends the founder to
  add a key they already added.
- `status` 2xx → the key works.

### The allow-list trap

A key can exist, be enabled, and work perfectly against one API and still fail
against a new host with `host_not_allowed` until the founder adds that host to
that key's allow-list. Nothing is wrong with the key or its value.

So whenever you surface this, **name the host that needs allow-listing**:
"`EXAMPLE_API_KEY` isn't allowed to call `api.example.com` — add that host to
the key in the Integrations panel", never a bare "API call failed".

Three founder-facing messages, kept distinct:

| Verdict | What to tell the founder |
|---|---|
| `missing` | "Add an `EXAMPLE_API_KEY` custom API key (allow-listed for `api.example.com`) to turn on live lookups." |
| `rejected` | "`EXAMPLE_API_KEY` was rejected by api.example.com (401). Check or rotate the key's value." |
| `host-not-allowed` | "`EXAMPLE_API_KEY` isn't allowed to call `api.example.com`. Add that host to the key." |

## Server-side hooks

Workspace hooks (server functions) have no workspace token and must NOT fetch
the HTTP proxy endpoint (it always 401s for them). Hooks call the proxy via the
built-in `platform.secretsProxy(request)` helper instead — same request shape,
same rules, no token needed. See the `server-functions` integration docs.

### A stored webhook signing secret can VERIFY, without the code seeing it

A webhook signing secret (Stripe `whsec_…`, GitHub, Paddle) saved here is used
as an HMAC key by name:

```javascript
const expected = await platform.crypto.hmacWithSecret({
  secretName: 'STRIPE_WEBHOOK_SECRET',   // the NAME, never the key
  payload: `${t}.${request.rawBody}`,
});
```

The platform returns only the digest. `{{secrets.NAME}}` placeholders are not
substituted inside `platform.crypto.hmac()` — they only work in outbound proxy
requests. See `platform.crypto.hmacWithSecret` in the `server-functions` docs.

### A stored key can also SIGN, without the code seeing it

Sending a key to a third party is not the only thing a secret is for. A server
function can also use a stored **private key** to sign locally:

```javascript
const assertion = await platform.crypto.signJwt({
  secretName: 'GOOGLE_SERVICE_ACCOUNT',   // the NAME, never the key
  claims: { aud: 'https://oauth2.googleapis.com/token', scope: '…' },
  expiresIn: 3600,
});
```

The contract is the same as the proxy's, in the direction that matters: **the
caller names the secret and never sees its value.** The platform resolves and
decrypts it server-side, signs, and returns only the token or signature; the key
never appears in function code, a log line, or the execution history, and every
signature is stamped against the secret in the same usage/audit trail an
outbound proxy call records.

Two differences worth knowing:

- **Allowed hosts do not apply.** Nothing leaves the platform, so a signing
  secret needs no host allow-list — but a key you *also* send to an API still
  does, for that use.
- **A disabled secret is reported distinctly.** The proxy answers
  `unknown_secret` for both missing and disabled (they are indistinguishable
  there); the signing calls throw `unknown_secret` and `secret_disabled`
  separately, because the caller is the workspace's own server-side code.

Store the credential exactly as the provider gives it to you — a whole Google
service-account JSON, or a bare PEM / Apple `.p8`. Escaped `\n` newlines are
accepted. **Never paste a private key into function source, and never
hand-write RSA in JavaScript.** The full argument list, algorithm allow-list,
refusal codes and a worked Google Wallet recipe are in the `server-functions`
integration docs.

See `example.tsx` for a working call.

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Must equal buildSecretsProxyManifestBlock() in scripts/task-4769-manifest-guidance.ts: "Request body and Content-Type" and "Failure codes" above plus the condensed optional-key guidance. -->
#### Secrets proxy request bodies, Content-Type, and failures

Only one of `json`, `body`, or `form` may be supplied. `GET` and `HEAD` requests
cannot carry any of them.

| Field | Accepted shape | What the proxy sends | Content-Type applied for you |
|---|---|---|---|
| `json` | Any JSON value: object, array, string, number, boolean, or `null` | The proxy runs `JSON.stringify` after replacing secret placeholders. Pass the value itself — do not pre-stringify an object. | `application/json` |
| `body` | A raw string | UTF-8 bytes exactly as supplied after placeholder replacement | `text/plain; charset=utf-8` |
| `form` | An object whose keys and values are strings | URL-encoded by default; set `formEncoding: "multipart"` for text-only multipart fields | `application/x-www-form-urlencoded`, or `multipart/form-data` with the generated boundary |

Yes: when you use `json`, the proxy sets `Content-Type: application/json` for
you. The same automatic default applies to raw and form bodies as shown above.
If you provide a `Content-Type` header yourself it wins; otherwise the optional
top-level `contentType` override wins over the automatic default. A request with
no body gets no automatic Content-Type.

##### Failure codes

**Permanent or transient?** Permanent means do not retry the same unchanged
request — fix the request/configuration or take the fallback path. Transient
means retry later with backoff (and still take the fallback path if retries are
exhausted). An upstream HTTP 4xx/5xx is not one of these proxy failures: the
proxy call succeeds and returns that upstream status in `status`.

| `code` | HTTP status | Class | Meaning and action |
|---|---:|---|---|
| `invalid_request` | 400 | Permanent | The request shape is invalid (including unknown fields, conflicting body fields, or a body on GET/HEAD). Fix it. |
| `unknown_secret` | 400 | Permanent | A referenced secret is missing or disabled. Configure/enable it or use the fallback. |
| `no_allowed_hosts` | 400 | Permanent | A referenced secret has no host allow-list. Configure the key before trying again. |
| `invalid_url` | 400 | Permanent | The substituted target URL is invalid. Fix the URL. |
| `https_required` | 400 | Permanent | The target is not HTTPS. Use an HTTPS endpoint. |
| `blocked_host` | 403 | Permanent | The target host or resolved IP is blocked by the proxy's SSRF policy. Choose a public third-party endpoint. |
| `host_not_allowed` | 403 | Permanent | At least one referenced secret does not allow the target host. Fix that key's allow-list. |
| `request_too_large` | 413 | Permanent | The built request body exceeds the proxy limit. Reduce or split it. |
| `rate_limited` | 429 | Transient | The workspace used its per-minute allowance. Retry later with backoff. |
| `concurrency_limited` | 429 | Transient | Too many proxy calls are active for the workspace. Retry after another call finishes. |
| `signer_error` | 500 | Transient | The platform request signer failed. Retry later; use the fallback if it repeats. |
| `proxy_error` | 500 | Transient | An unexpected internal proxy failure occurred. Retry once later, then use the fallback and report it if it repeats. |
| `bad_redirect` | 502 | Permanent | The upstream returned an invalid redirect location. Use a correct final URL or another endpoint. |
| `cross_host_redirect` | 502 | Permanent | The upstream tried to redirect secret-bearing headers to another host. Call an allowed final host directly. |
| `too_many_redirects` | 502 | Permanent | The upstream redirect chain exceeds the proxy limit. Use the final URL or another endpoint. |
| `response_too_large` | 502 | Permanent | The raw upstream response exceeds the proxy limit. Ask for less data or use another transfer path. |
| `upstream_error` | 502 | Transient | DNS, connection, TLS, timeout, or another upstream transport failure occurred. Retry later with backoff. |

##### Optional keys: you cannot ask whether a secret exists

No code can list a workspace's stored secrets — not a browser app, not a server
function, not the build agent. Listing keys is a workspace-chat capability:
people in the workspace see the masked NAMEs through Otto
(`list_custom_api_keys`, `check_custom_api_key`) or the Integrations panel,
and only the writes there are owner-only. So do **not** create a throwaway probe
hook, and do **not** stall a build asking the founder whether a key is
configured. Call the proxy with the `{{secrets.NAME}}` placeholder, branch on
the answer, and latch the verdict once per execution:

- `unknown_secret` (missing **or** disabled — indistinguishable),
  `no_allowed_hosts`, `host_not_allowed` → the key is unusable as configured.
  Latch and take the keyless path. There are no `no_secrets` or
  `secret_disabled` codes.
- A call that succeeded but whose **upstream** `status` is 401/403 → the key
  EXISTS and the provider rejected it. Latch, but say "rejected", never
  "missing". `ok: true` means only that the round trip completed; always read
  the upstream status before trusting the body.
- Transient codes (`rate_limited`, `concurrency_limited`, `signer_error`,
  `proxy_error`, `upstream_error`) and any unrecognised code → never latch.
- In a hook, every proxy call spends one of the 50 fetch calls, **including** a
  call refused on configuration grounds before any upstream request. Dry-run
  test mode returns a synthetic `{ ok: true, status: 0 }` without calling
  anything, so a probe run in test mode proves nothing.

Keep three distinct founder-facing messages — "no key stored", "the provider
rejected the key", and "this key isn't allowed to call HOST" — and always name
the host in the last one: a key that exists, is enabled, and works elsewhere
still fails against a new host until the founder allow-lists that host. The
worked example lives in `integrations/custom-api-keys/docs.md`.
<!-- MANIFEST:END -->

---
# domain-registration

Source: integrations/domain-registration/docs.md

# Domain Registration Integration

Wallet-gated, idempotent purchase of new apex domains through DNSimple,
with automatic Cloudflare hostname setup and auto-attachment to the
permalink-host registry. Every attempt — including aborted attempts — is
written to `domain_purchase_audit` so an incident can reconstruct exactly
which user approved which spend.

> **Task #1235.** Replaces the bare `POST /api/domains/register-with-cloudflare`
> path for app-driven flows. The underlying registrar work is unchanged;
> this integration adds the wallet-gating layer (canonical
> `insufficient_funds` shape, idempotency, audit, refund-on-failure) and
> the post-success permalink-host attach side-effect.

## Endpoints

All endpoints are mounted under `/api/workspaces/:workspaceId/domains`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/quote` | DNSimple availability + price (no charge, no audit-impacting outcome) |
| `POST` | `/preview-spend` | Wallet preview against the quoted price; returns `insufficient_funds` if low |
| `POST` | `/register` | Idempotent purchase with audit + refund-on-failure |
| `GET` | `/audit` | Per-workspace audit feed (default 50, max 200) |
| `GET` | `/` | List `purchased_domains` rows for this workspace |

### `POST /register`

```json
{
  "domain": "myapp.com",
  "userConfirmed": true,
  "idempotencyKey": "optional-stable-key"
}
```

`userConfirmed: true` is required when the request originates from an
agent context (presence of `x-audos-agent` header). Human-origin requests
do not need it.

The route:
1. Asserts user-approval (agent vs human).
2. Quotes DNSimple, checks wallet balance with safety headroom.
3. Returns `402 insufficient_funds` if the wallet cannot fund it.
4. Reserves an idempotency row; replays return the cached response with
   `idempotent: true` and **never** re-charge the wallet.
5. Delegates to the canonical registrar route (single source of charging).
6. On success, auto-attaches the apex + `www.<apex>` to the permalink-host
   registry so app authors can immediately publish pages on it.
7. On failure (registrar error, Cloudflare error), the underlying route
   has already refunded; this layer flips the audit row to `failed`.

### Insufficient-funds response (402)

```json
{
  "code": "insufficient_funds",
  "required": 12.99,
  "available": 5.00,
  "shortfall": 7.99,
  "headroomMultiplier": 1.0,
  "message": "Insufficient wallet balance for Register domain myapp.com. Required: $12.99 . Available: $5.00. Add $7.99 to continue.",
  "domain": "myapp.com",
  "registrationPrice": 12.99
}
```

This shape is shared with `phone-numbers/purchase` and any future
wallet-gated integration. Render it as an "Add $X to continue" CTA.

## Environment

| Var | Default | Notes |
| --- | --- | --- |
| `WALLET_SAFETY_HEADROOM_MULTIPLIER` | `1.0` | Multiplier applied to `required` before computing `shortfall`. Set >1 to require buffer for FX / TLD price drift. |
| `DNSIMPLE_API_TOKEN` / `DNSIMPLE_ACCOUNT_ID` | — | Required to quote and register. |
| `CLOUDFLARE_API_TOKEN` | — | Required for hostname setup (existing). |

## Audit row outcomes

| Outcome | When |
| --- | --- |
| `quoted` | `POST /quote` succeeded |
| `insufficient_funds` | `POST /register` rejected at the wallet gate |
| `registered` | Full registrar + Cloudflare setup completed |
| `failed` | Underlying registrar route returned non-2xx (refunded by the underlying route) |

## See also

- `permalink-pages` — uses the auto-attached hosts.
- `ai-phone-calls` — same `insufficient_funds` shape, same idempotency helper.
- `APP_INTEGRATION_MANIFEST.md` — runtime registry.

---
# file-storage

Source: integrations/file-storage/docs.md

# File Storage Integration (Google Cloud Storage)

Permanently store images and files in Google Cloud Storage. Uploads are public by default; a private mode is available per upload.

## Category
Storage

## Required API Keys
- `GCS_BUCKET_NAME`
- `GCP_PROJECT_ID`
- `GCP_CREDENTIALS`
- `GCS_PRIVATE_BUCKET_NAME` (only needed for private uploads)

## Public vs private storage

By default every upload goes to a **public** bucket and the response gives you a
`https://storage.googleapis.com/...` address that anyone with the link can open.
Object names are random, but they are not secret — treat a public upload as
world-readable.

A private upload — `platform.privateFiles.store()` inside a server function, or
`private: true` on the platform upload route for a credentialed server-side
caller — puts the bytes in a separate bucket that has public access prevention
enforced. There is no public address for those files.
Instead the response returns a stable platform reference,
`/api/private-files/workspaces/<workspaceId>/private-uploads/<folder>/<id>.<ext>`,
which serves the file only to a caller that proves it belongs to the owning
workspace:

- the founder / a workspace member signed in on the platform,
- an Audos admin,
- a workspace API key carrying the `files:read` scope,
- this workspace's own **server functions** — `fetch('/api/private-files/…')`
  from hook code is credentialed automatically, no headers required.

An anonymous or cross-workspace caller gets a refusal that does not say whether
the file exists. A visitor browser holding `window.__workspaceDb.token` is NOT
enough to **read** a private file — that token is embedded in the published
bundle and carries only the generic data scopes, so `GET /api/private-files/...`
with `X-Workspace-DB-Token` answers `404 {"success":false,"error":"File not found"}`.
The same header **can** authorize a private **write** on the upload routes
(see below). The token is write-only for private files.

Need to hand someone a private file? The app's own back end mints a temporary
link with `platform.privateFiles.link()` (default 15 minutes, 24 hours maximum —
see the next section); Otto and Audos admins can mint one too. The file stays
private; the link expires.

**How a workspace opts in:** nothing to switch on globally. Store the
individual files that should be private from a **server function**, with
`platform.privateFiles.store()` (next section), and keep using the normal
browser upload for everything else. Existing uploads are unaffected — they stay
exactly where they are, at exactly the same public addresses.

## Private uploads go through a back-end function

**A visitor session cannot write a private file, and the published workspace
token cannot read one.** The HTTP upload routes authorize the workspace named
in the request. Observed `POST /api/upload/file` (and `/api/upload/image`)
with `private=true` + `workspaceId`:

| Credential | Result |
|---|---|
| Header `X-Workspace-DB-Token: <window.__workspaceDb.token>` | `200` — private object written. The same header on a later `GET /api/private-files/...` is refused (`404 File not found`). |
| None | `401 {"success":false,"error":"Authentication required"}` |
| A `workspaceId` the token does not own | `404 {"success":false,"error":"Workspace not found"}` |
| A signed-in *visitor* space session (`wses_`) | `401 Authentication required` — a customer session is not workspace membership |

`private: true` with no credential, or with only a visitor session, is the
`401` the catalog used to describe as “the browser cannot write.” A page that
sends the workspace token **can** write. That token is still the wrong tool
for a private-file flow: it is visible in the published bundle, and it cannot
read the object back. Design private-file flows so both write and read happen
in a server function.

The supported route is: the page posts the file to one of this workspace's own
**server functions**, and the function stores it with `platform.privateFiles`.
Inside a server function the owning workspace is already known — it is the
workspace that owns the function — so there is **no key, token, workspace id or
header** to pass in your code, and no way to reach another workspace's files.

| Helper | What it does |
|--------|--------------|
| `platform.privateFiles.store({ data \| text, contentType, filename?, folder?, extension? })` | Stores bytes privately. Returns `{ key, reference, url, contentType, bytes, storage: 'private' }`, where `reference` (and its `url` alias) is a `/api/private-files/...` platform reference — never a public address. Bytes go in as base64 in `data` (a `data:` URL works too) or UTF-8 content in `text`. Same 50MB ceiling as the public upload. |
| `platform.privateFiles.read(keyOrReference)` | Returns `{ key, contentType, bytes, base64 }` for a private file this workspace owns — base64 because the sandbox has no `Buffer`. Use it to attach the file to an email, analyse it, or re-serve it with `respondRaw(..., { encoding: 'base64' })`. |
| `platform.privateFiles.thumbnail(keyOrReference)` | Creates a separate private WebP thumbnail from a workspace-owned PNG, JPEG, or WebP. The longest edge is at most 640px; the original is never changed. Returns a new private-file result plus `originalKey` and `maxDimension`. |
| `platform.privateFiles.link(keyOrReference, { expiresInMinutes })` | Mints a temporary link a customer can open. **Default 15 minutes, maximum 24 hours (1440).** The file stays private; only the link expires. |

Every call is scoped to the executing function's own workspace. A key belonging
to another workspace is refused with `File not found` — the same words as a key
that never existed, so the refusal reveals nothing.

```javascript
// Server function: keep the customer's upload private and email them a link
// that stops working in 15 minutes.
const stored = await platform.privateFiles.store({
  data: request.body.fileBase64,        // base64 sent by the page
  contentType: 'application/pdf',
  filename: request.body.filename,      // only used to pick the extension
  folder: 'contracts',
});

await db.insert('contracts', {
  email: request.body.email,
  file_key: stored.key,                 // store the KEY, never a link
});

const link = await platform.privateFiles.link(stored.key, { expiresInMinutes: 15 });
await platform.sendEmail({
  to: request.body.email,
  subject: 'Your contract',
  text: `Your contract: ${link.url} — the link expires in 15 minutes.`,
});

respond(200, { success: true, key: stored.key });
```

Store the **key** in your database, never the temporary link: keys are stable,
links expire. When a page needs to show a private file, have it ask a server
function for a fresh link at the moment the customer clicks.

## Where objects land

The object name is always a fresh UUID; you never choose it. Which prefix it
goes under depends on the endpoint:

| Endpoint | `private` | Storage key |
|---|---|---|
| `/api/upload/file` | omitted | `uploads/<folder>/<uuid>.<ext>` |
| `/api/upload/file` + `workspaceId` | omitted | `workspaces/<workspaceId>/uploads/<folder>/<uuid>.<ext>` |
| `/api/upload/file` + `workspaceId` | `true` | `workspaces/<workspaceId>/private-uploads/<folder>/<uuid>.<ext>` |
| `/api/upload/image` | omitted | `chat-attachments/<uuid>.<ext>` — always, and `workspaceId` / `folder` / `spaceId` are ignored |
| `/api/upload/image` + `workspaceId` | `true` | `workspaces/<workspaceId>/private-uploads/chat-attachments/<uuid>.<ext>` |
| `/api/upload/signed-url` | n/a | `workspaces/<workspaceId>/app-uploads/<appId>/<uuid>.<ext>` — entirely server-derived |

`<folder>` defaults to `general`. `/api/upload/image` has no folder control.

## API Endpoints

### Upload Image (base64 JSON)
```
POST /api/upload/image
```

Use this when you already have base64 data (canvas export, clipboard paste, AI-generated data URL).

**Request:**
```json
{
  "imageData": "data:image/png;base64,...",
  "fileName": "photo.png"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "https://storage.googleapis.com/bucket/chat-attachments/<uuid>.png"
}
```

The public URL field is `imageUrl` on this endpoint only.

**Storage namespace: `chat-attachments/<uuid>.<ext>`, not `uploads/...`.** This
is the endpoint that fills the `chat-attachments/` namespace listed under
[delete](#delete-an-uploaded-file). It is a bucket-level prefix with no
workspace segment, so a public image upload is **not** workspace-scoped:
every space writes into the same `chat-attachments/` prefix.

`workspaceId`, `folder`, and `spaceId` are accepted and have **no effect** on
the public key. `fileName` does not either — the extension comes from the data
URL's MIME type, so `{ imageData: "data:image/png;base64,...", fileName: "photo.jpg" }`
still stores a `.png`. `fileName` is optional.

**If you need workspace-scoped storage, use `/api/upload/file` with a
`workspaceId`.**

This route accepts the same `private` flag. `private` is the one case where it
reads `workspaceId` (required). Auth matches `/api/upload/file`: no credential
→ `401 Authentication required`; workspace token → write succeeds; that same
token cannot read the file back. Prefer `platform.privateFiles.store()` from a
server function — see "Private uploads go through a back-end function" above.
A private image is workspace-scoped, but the trailing folder is still
hard-coded to `chat-attachments`.

### Upload Any File (multipart binary)
```
POST /api/upload/file
```

Use this for binary files up to 50MB. Multipart upload avoids the ~10MB base64 limit and preserves the original content type. Use the signed upload flow below for larger files.

**Request** — `multipart/form-data`:

| Field | Type | Notes |
|-------|------|-------|
| `file` | file | Required. Single file, max 50MB. |
| `workspaceId` | string | Optional. Namespaces the object under `workspaces/<id>/uploads/`. Required when `private` is set. |
| `folder` | string | Optional. Sub-folder hint inside the namespace. |
| `private` | boolean | Optional. Requires `workspaceId` **and** a workspace-authenticated caller. No credential / visitor session → `401 Authentication required`. Workspace token (`X-Workspace-DB-Token`) → write succeeds, but that token cannot read the file back. Prefer `platform.privateFiles.store()` from a server function. |

**Response:**
```json
{
  "success": true,
  "url": "https://storage.googleapis.com/bucket/workspaces/ws_x/uploads/general/abc.mp4",
  "key": "workspaces/ws_x/uploads/general/abc.mp4",
  "contentType": "video/mp4",
  "bytes": 7340032,
  "originalName": "my-clip.mp4"
}
```

**Response when `private: true`** (workspace-authenticated caller) — note
`storage: "private"` and that `url` is a platform reference, not a public
address:
```json
{
  "success": true,
  "storage": "private",
  "url": "/api/private-files/workspaces/ws_x/private-uploads/general/abc.pdf",
  "key": "workspaces/ws_x/private-uploads/general/abc.pdf",
  "contentType": "application/pdf",
  "bytes": 184320,
  "originalName": "deck.pdf"
}
```

### Upload a Large File (signed direct upload)
```
POST /api/upload/signed-url
```

Use this metadata-only route for files above 50MB and up to 500MB. It returns a 15-minute, create-only GCS upload URL. The server resolves the **app from the request Host** (a hosted / imported / custom-domain app bound to the authenticated workspace) and the workspace from the caller. The workspace token must include `data:write`. Do not send an app ID, workspace ID, object key, bucket, host, file name, or folder — those fields are not read.

Reference `window.__workspaceDb` so the platform injects the workspace token. Send that token with the request.

**`app_context_not_found` is the usual answer from a published space.**
Authentication is not the failing step:

| Credential | Result |
|---|---|
| None | `401 {"error":"authentication_required"}` |
| `X-Workspace-DB-Token` (same token that can private-upload) | `404 {"error":"app_context_not_found"}` unless `Host` resolves to a hosted app owned by that workspace |

Calling from `audos.com` or a generic space host, and adding `X-App-Id` /
`X-Space-Id` / `X-Workspace-Id` / `Origin` / `Referer`, does not supply the
missing app. Until the request is made on a host the platform maps to an
`app_…` registry entity, **50 MiB via `/api/upload/file` is the real ceiling
for space app code.** The installation helper below will throw on that 404 —
test the grant before shipping a large-upload flow.

**Request:**
```json
{
  "size": 136314880,
  "contentType": "video/mp4"
}
```

**Response:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "key": "workspaces/ws_x/app-uploads/app_x/uuid.mp4",
  "expiresAt": "2026-08-13T04:15:00.000Z"
}
```

The signed PUT binds the exact byte count and content type (`x-goog-content-length-range`) and requires the create-only generation header (`x-goog-if-generation-match: 0`). GCS returns `412 Precondition Failed` instead of replacing an existing object. The grant limit is 30 requests per minute on a single server instance. A replicated service must replace this process-local limit with a shared limiter.

### Delete an Uploaded File
```
DELETE /api/upload/file          (JSON body)
POST   /api/upload/delete        (same body, for clients that can't send DELETE bodies)
```

Erases a previously uploaded object. Pass either the `key` returned by
`/api/upload/file` or the public `url` returned by any upload endpoint.
Deleting an already-deleted object still answers `success: true` (erasure is
idempotent).

Only objects in the **public** upload namespaces can be deleted:

| Namespace | Written by |
|---|---|
| `uploads/<folder>/` | `/api/upload/file` with no `workspaceId` |
| `workspaces/<id>/uploads/<folder>/` | `/api/upload/file` with a `workspaceId` |
| `chat-attachments/` | `/api/upload/image` (public mode) |

**Private objects cannot be erased through this endpoint.** A
`workspaces/<id>/private-uploads/...` key is refused with
`400 {"success":false,"error":"Only uploaded files can be deleted with this endpoint"}`.
`/api/upload/signed-delete` only accepts `app-uploads/` keys and has the same
host/`app_context_not_found` limitation as the grant route. **There is no
app-callable way to delete a private object — ask Otto, or delete from a
server function if you stored the key yourself.**

Signed direct-upload keys (`workspaces/<id>/app-uploads/<appId>/...`) are
refused here with the same `400` — they belong to
[`/api/upload/signed-delete`](#delete-a-large-uploaded-file).

**Request:**
```json
{ "key": "workspaces/ws_x/uploads/general/abc.mp4" }
```
or
```json
{ "url": "https://storage.googleapis.com/bucket/chat-attachments/abc.png" }
```

**Response:**
```json
{ "success": true, "key": "workspaces/ws_x/uploads/general/abc.mp4", "deleted": true }
```

### Delete a Large Uploaded File
```
POST /api/upload/signed-delete
```

Pass the `key` returned by `/api/upload/signed-url`. This route uses the same
authenticated workspace, `data:write` scope, and Host-resolved app as the
grant route. It can delete only a server-derived key for that exact app.
Deleting an already-deleted object is successful.

**Same `app_context_not_found` limitation as the grant route.** A workspace
token from a published space that is not on a hosted-app host gets
`404 {"error":"app_context_not_found"}`. `DELETE /api/upload/file` will not
stand in: an `app-uploads/` key is refused there with
`400 {"success":false,"error":"Only uploaded files can be deleted with this endpoint"}`.

**Request:**
```json
{ "key": "workspaces/ws_x/app-uploads/app_x/uuid.mp4" }
```

**Response:**
```json
{ "success": true, "key": "workspaces/ws_x/app-uploads/app_x/uuid.mp4", "deleted": true }
```

## Installation

```javascript
export const fileStorage = {
  // Recommended private path: post bytes to a server function and let it
  // call platform.privateFiles.store(). A page that sends the workspace
  // token CAN write privately, but that token cannot read the file back.
  // `configId` is this workspace's numeric config id.
  async uploadPrivateViaServerFunction(file, configId, hookName, { folder } = {}) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch(`/n/workspace-${configId}/${encodeURIComponent(hookName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: base64,
        filename: file.name,
        contentType: file.type,
        folder,
      }),
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Private upload failed');
    // The function returns the KEY. There is no public URL — ask a server
    // function for a temporary link (platform.privateFiles.link()) when the
    // customer needs to open the file.
    return result;
  },

  // Direct-to-GCS path for files above 50MB and up to 500MB.
  // From a typical published space this grant returns 404
  // app_context_not_found — Host must resolve to a hosted app.
  async uploadLargeFile(file) {
    const ws = window.__workspaceDb;
    if (!ws?.token) {
      throw new Error('Authenticated workspace context is required');
    }

    const grantResponse = await fetch('/api/upload/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-DB-Token': ws.token
      },
      body: JSON.stringify({
        size: file.size,
        contentType: file.type
      })
    });
    if (!grantResponse.ok) throw new Error('Could not authorize large upload');
    const grant = await grantResponse.json();

    const uploadResponse = await fetch(grant.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
        'x-goog-content-length-range': `${file.size},${file.size}`,
        'x-goog-if-generation-match': '0'
      },
      body: file
    });
    if (!uploadResponse.ok) throw new Error('Large upload failed');
    return grant.key;
  },

  async deleteLargeFile(key) {
    const ws = window.__workspaceDb;
    if (!ws?.token) throw new Error('Authenticated workspace context is required');

    const response = await fetch('/api/upload/signed-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-DB-Token': ws.token
      },
      body: JSON.stringify({ key })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Large-file delete failed');
    return result.deleted;
  },

  async uploadImage(file) {
    const reader = new FileReader();
    const base64Data = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });

    const response = await fetch('/api/upload/image', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-App-Id': window.__APP_ID__
      },
      body: JSON.stringify({
        imageData: base64Data,
        fileName: file.name
      })
    });

    const { imageUrl } = await response.json();
    return imageUrl;
  },
  // Erase a buffered/base64 object — pass its returned key or public URL.
  async deleteFile(keyOrUrl) {
    const body = /^https?:\/\//.test(keyOrUrl) ? { url: keyOrUrl } : { key: keyOrUrl };
    const response = await fetch('/api/upload/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': window.__APP_ID__
      },
      body: JSON.stringify(body)
    });
    const { success, error } = await response.json();
    if (!success) throw new Error(error || 'Delete failed');
    return true;
  }
};
```

## Use Cases
- User avatars
- Product images
- Document storage
- Media galleries
- File uploads
- Asset management

## Supported File Types
- Images (JPEG, PNG, GIF, WebP)
- Documents (PDF)
- Videos (MP4, QuickTime, WebM)
- Audio (MP3, MP4 audio, Ogg, WAV)
- ZIP archives
- The buffered route also accepts other GCS-supported file types. The large-file route uses only the types listed above.

## Documentation
- [Google Cloud Storage Docs](https://cloud.google.com/storage/docs)

---
# human-tasks

Source: integrations/human-tasks/docs.md

# Human Tasks API

Request, approve, track, and complete human tasks with wallet-based budgeting. Tasks go through an approval workflow before being posted to Slack.

## Endpoints

### List Tasks
```
GET /api/human-tasks?workspaceId={workspaceId}
GET /api/workspace/{workspaceId}/human-tasks
```

Query params:
- `workspaceId` (required) — workspace UUID
- `status` — filter: `awaiting_approval`, `pending`, `in_progress`, `completed`, `cancelled`
- `includeCompleted` — `true` to include completed/cancelled tasks

Response:
```json
{
  "success": true,
  "tasks": [
    {
      "id": "task_abc123",
      "workspaceId": "...",
      "title": "Research competitor pricing",
      "description": "Find pricing pages for top 5 competitors...",
      "status": "awaiting_approval",
      "approvalStatus": "pending",
      "priority": "medium",
      "estimatedHours": "2",
      "hourlyRate": "2500",
      "quotedBudget": "5000",
      "channel": "human-tasks",
      "createdAt": "2026-01-15T...",
      "approvedAt": null,
      "completedAt": null,
      "finalCost": null
    }
  ]
}
```

### Create Task
```
POST /api/human-tasks
POST /api/workspace/{workspaceId}/human-tasks
```

Body:
```json
{
  "workspaceId": "uuid-here",
  "title": "Task title",
  "description": "Detailed description of what needs to be done",
  "estimatedHours": 2,
  "hourlyRate": 2500,
  "priority": "medium",
  "dueDate": "2026-02-15T00:00:00Z"
}
```

- `workspaceId` (required)
- `title` (required)
- `description` (required)
- `estimatedHours` (required, positive number)
- `hourlyRate` (optional, in cents, default 2500 = $25/hr)
- `quotedBudget` (optional, auto-calculated from hours × rate, in cents)
- `priority` (optional: `low`, `medium`, `high`, default `medium`)
- `dueDate` (optional, ISO date)

New tasks always start with `status: "awaiting_approval"` and `approvalStatus: "pending"`.

Response:
```json
{ "success": true, "taskId": "task_abc123" }
```

### Approve Task
```
POST /api/human-tasks/{taskId}/approve
POST /api/workspace/{workspaceId}/human-tasks/{taskId}/approve
```

Body:
```json
{
  "workspaceId": "uuid-here",
  "approvedBy": "user@example.com"
}
```

Checks wallet balance, posts task to Slack channel, updates status to `pending`.

### Complete Task
```
POST /api/human-tasks/{taskId}/complete
POST /api/workspace/{workspaceId}/human-tasks/{taskId}/complete
```

Body:
```json
{
  "workspaceId": "uuid-here",
  "actualHours": 1.5,
  "notes": "Completed research, findings attached"
}
```

Charges the workspace wallet, creates a wallet transaction, posts completion to Slack thread.

### Reject Task
```
POST /api/human-tasks/{taskId}/reject
POST /api/workspace/{workspaceId}/human-tasks/{taskId}/reject
```

Body:
```json
{
  "workspaceId": "uuid-here",
  "reason": "Budget too high"
}
```

Sets status to `cancelled` and approval to `rejected`.

## Task Lifecycle

1. **Created** → `awaiting_approval` / `pending`
2. **Approved** → `pending` / `approved` (posted to Slack)
3. **In Progress** → `in_progress` / `approved`
4. **Completed** → `completed` / `approved` (wallet charged)
5. **Rejected** → `cancelled` / `rejected`

## Budget

- `hourlyRate` and `quotedBudget` are stored in **cents** (e.g., 2500 = $25.00)
- Display: `$${(value / 100).toFixed(2)}`
- Wallet balance is checked on approve and on complete
- Final cost may differ from quoted budget if `actualHours` is provided on completion

---
# mcp-agent-tools

Source: integrations/mcp-agent-tools/docs.md

# MCP Agent Tools (customer tools registry)

Register **MCP tools** that THIS workspace's customer-facing agent can call
mid-conversation. The agent gets these tools injected into its next session, so
it can take real actions (look something up, create a row, fire an event) on
behalf of the visitor instead of only talking about them.

This is the workspace-side of MCP: each tool is an `api_call` the agent is
allowed to make to a small allow-list of safe endpoints. Tools live in a
per-workspace **registry** that you read/write over HTTP.

## Registry shape

```json
{
  "version": 1,
  "tools": [
    {
      "name": "add_to_catalog",
      "description": "Add an item to the shared catalog when the visitor asks to save or share something.",
      "parameters": {
        "name": { "type": "string", "required": true, "description": "Item name" },
        "description": { "type": "string", "required": false, "description": "Optional details" }
      },
      "action": {
        "type": "api_call",
        "method": "POST",
        "endpoint": "/api/hooks/execute/workspace-{configId}/add-to-catalog",
        "bodyMapping": { "name": "name", "description": "description" }
      }
    }
  ]
}
```

- `name` — tool name the agent sees (snake_case).
- `description` — when the agent should reach for it. Be explicit; this is the
  only hint the model gets.
- `parameters` — typed args (`string` | `number` | `boolean`, each optional
  `required` / `default` / `enum`). Turned into the tool's input schema.
- `action.endpoint` — must start with one of the allowed prefixes (below).
- `action.bodyMapping` — maps tool args → request body fields.

## Allowed endpoint prefixes

A registered tool may only call endpoints under these prefixes (anything else is
rejected at registration time):

```
/api/crm/        /api/spaces/         /api/community/    /api/app-skills/
/api/funnel/     /api/workspace-settings/   /api/microsites/
/api/space-tools/   /api/hooks/
```

**Hook-backed tools and this allow-list:** the only allow-listed way to point a
tool at a workspace server function (hook) is the public execute alias
`/api/hooks/execute/workspace-{configId}/{hookName}` (under the `/api/hooks/`
prefix). The management/webhook URL form
`/api/workspaces/{workspaceId}/hooks/{hookName}/execute` is NOT on the
allow-list — it is only accepted as a recognized legacy exception for
already-registered tools; do not use it for new registrations. Both URLs
execute the same hook.

## Authentication

Registry read/write is **not** open. Both endpoints in the next section require
an authenticated caller with access to the workspace.

| Surface | Auth required |
|---|---|
| `GET /api/workspace-settings/:workspaceId/customer-tools` | Authenticated caller with workspace access — the workspace dashboard or the workspace agent. Missing credentials fail with `401 {"error":"Authentication required"}`. |
| `PUT /api/workspace-settings/:workspaceId/customer-tools` | Same as GET. Missing credentials fail with `401 {"error":"Authentication required"}` and the body is never applied. |

**Build agents and workspace code-bridge sessions cannot change the registry
themselves.** They have no platform session, so every registry call answers
`401` no matter how the body is shaped. Hand the change to Otto or another
authenticated platform session instead — e.g. ask Otto to "register an MCP tool
that lets the agent add items to the shared catalog". The `401` is deliberate
security hardening, not an outage.

> **A `400` here does not mean the route is open.** Malformed JSON is rejected by
> the global body parser *before* auth runs, so a `PUT` with a broken body
> returns `400 {"success":false,"error":"Unexpected end of JSON input"}`. Fixing
> the JSON does not get you past the wall: a well-formed unauthenticated `PUT`
> returns `401`. Do not read that `400` as "authenticated, bad payload".

## Endpoints

### Read the registry
Requires an authenticated caller (see Authentication).
```
GET /api/workspace-settings/{workspaceId}/customer-tools
→ { "registry": { "version": number, "tools": [...] } }   (404 if none yet)
→ 401 { "error": "Authentication required" }   (no platform session)
```

### Replace the registry
Requires an authenticated caller (see Authentication).
```
PUT /api/workspace-settings/{workspaceId}/customer-tools
Body: { "registry": { "version": 1, "tools": [ ...full list... ] } }
→ 401 { "error": "Authentication required" }   (no platform session)
```

The PUT replaces the whole `tools` array — read first, append, then write back
so you don't drop existing tools.

## How it reaches the agent

On the agent's next conversation the platform calls
`loadCustomerToolsRegistry(workspaceId)` and turns each entry into a live MCP
tool. When the visitor's intent matches a tool's `description`, the agent calls
it, the platform performs the `api_call`, and the result flows back into the
conversation. No redeploy needed — registry changes take effect on the next
session.

## Session & auth context handoff

When the agent calls a registered tool, the platform doesn't hit the endpoint
blindly — it forwards the current visitor's context:

- **`X-Session-Id`** — the visitor's workspace session is forwarded on every
  tool call, but a hook stamps `session_id` only when that id resolves to a real
  session row in this workspace. A missing, invalid, cross-workspace, or
  unavailable session lookup leaves a legacy hook running with no resolved
  owner; writes that omit `session_id` then stay shared. Hook reads and deletes
  are never automatically filtered by visitor. Never copy the raw header into
  a row yourself; use the hook's validated `session.id` and an explicit owner
  filter. See **Visitor ownership is conditional in hooks** in the
  `server-functions` docs for the full contract and examples.
- **Shared writes** — from a session-carrying hook, set `session_id: null`
  explicitly in the hook payload. Pointing the tool at an endpoint that writes
  without a session is also shared. Apps read those rows with `{ shared: true }`.
  Shared rows are world-readable and must never contain sensitive data.
- **`workspaceId`** — auto-injected into the request body (POST/PUT/PATCH) or
  query string (GET) of every tool call, so endpoints always know which
  workspace they're acting on.
- **App-side auth** — your app components authenticate their OWN WorkspaceDB
  calls with the workspace DB token (`window.__workspaceDb`, sent as the
  `X-Workspace-DB-Token` header). The agent's tool calls use the session
  channel above instead; both paths read and write the same tables.

## Request shaping (fixed)

The platform builds every tool-call request the same way — none of this is
configurable per tool:

- **Static query parameters are preserved.** Anything baked into
  `action.endpoint` (e.g. `?secret=abc`) stays on the outgoing request; the
  platform appends its own parameters alongside yours.
- **Arguments become one flat request body.** For `POST`/`PUT`/`PATCH`, the
  tool's arguments are sent as a single flat JSON object: `bodyMapping`
  renames top-level keys (`{ toolArgumentName: requestBodyField }`), and when
  it is omitted all arguments pass through as-is. There is no nesting,
  templating, or per-field transformation. For `GET`, arguments land in the
  query string instead.
- **Workspace identity is injected for you.** The canonical workspace UUID is
  added automatically as `workspaceId` — always on the query string, and also
  in the body for write verbs — so endpoints know which workspace is acting.
  Never declare it as a tool parameter.
- **Custom request headers cannot be configured.** The platform sends a fixed
  header set: `Content-Type: application/json`, `X-Workspace-Id`, and the
  forwarded visitor `X-Session-Id`. A tool cannot add auth or API-key
  headers — if the target needs a credential, back the tool with a hook and
  keep the credential server-side, or use a static `?secret=` query
  parameter.

## Pairs well with WorkspaceDB

Point a tool at a hook (`/api/hooks/execute/workspace-{configId}/{hookName}`)
that writes to WorkspaceDB (see the Collection app) so the agent can populate the
same tables your apps read from. Visitor ownership is conditional: a hook adds to the visitor's
**private** list only when the forwarded session resolves in this workspace.
For the **shared catalog**, write `session_id: null` explicitly in the hook (or
use an endpoint that writes with no session). Human-created and agent-created
rows stay in sync either way.

> Tip: ask Otto to "register an MCP tool that lets the agent add items to the
> shared catalog" and it will write the registry entry for you.

---
# permalink-pages

Source: integrations/permalink-pages/docs.md

# Permalink Pages Integration

Generate standalone, publicly accessible pages at unique URLs — static HTML or compiled React/TSX apps.

## Category
Content / Publishing

## Required API Keys
None

## Concepts

- **Permalink Page** — A standalone page stored in the database, accessible at a public URL. Each page is scoped to a workspace and identified by a unique slug.
- **Page Types** — Pages can be `static` (raw HTML) or `tsx` (compiled React/TypeScript apps). TSX pages are compiled server-side using ESBuild and served as fully interactive React apps.
- **Slug** — A URL-safe identifier for the page (e.g., `invoice-2024-001`, `receipt-abc`). Must be unique within a workspace.
- **Access Control** — Pages can be public (anyone with the URL) or protected with an access token.
- **User-Key Scoping** — Pages are tagged with `sessionId`, `contactId`, or `userId` to prevent cross-customer data leakage. Apps must provide a user-key to list or fetch pages.

---

## User-Key Requirement

When an app (space) calls the list or get endpoints, it **must** provide at least one user-key to scope the results to the current customer:

| Key | Header | Query Param |
|-----|--------|-------------|
| sessionId | `x-session-id` | `?sessionId=...` |
| contactId | `x-contact-id` | `?contactId=...` |
| userId | `x-user-id` | `?userId=...` |

Without a user-key, the create, list, and get-by-id endpoints return `400 Missing user-key`.

**Otto / entrepreneur access**: Use the internal `call_internal_api` tool which hits internal routes that don't require user-key scoping.

---

## API Endpoints

All endpoints are scoped to a workspace via the URL path.

### Create a Permalink Page

```
POST /api/workspaces/:workspaceId/permalink-pages
```

**Requires user-key.** The page is automatically tagged with the caller's user-key (from headers or query params).

#### Static HTML Page

```json
{
  "slug": "invoice-2024-001",
  "title": "Invoice #2024-001",
  "htmlContent": "<div style='font-family: sans-serif;'><h1>Invoice</h1><p>Amount: $500</p></div>",
  "metadata": { "type": "invoice" },
  "isPublic": true
}
```

#### Compiled TSX Page (React App)

Send `tsxSource` instead of `htmlContent`. The server compiles it with ESBuild and serves it as a full React app with CDN-loaded React 18, Lucide icons, and Tailwind CSS.

```json
{
  "slug": "pricing-calculator",
  "title": "Pricing Calculator",
  "tsxSource": "import { useState } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { Calculator } from 'lucide-react';\n\nfunction App() {\n  const [qty, setQty] = useState(1);\n  return (\n    <div className=\"min-h-screen flex items-center justify-center bg-gray-50 p-8\">\n      <div className=\"bg-white rounded-2xl shadow-xl p-8 max-w-md w-full\">\n        <div className=\"flex items-center gap-3 mb-6\">\n          <Calculator className=\"w-6 h-6 text-purple-600\" />\n          <h1 className=\"text-2xl font-bold\">Pricing</h1>\n        </div>\n        <input type=\"number\" value={qty} onChange={e => setQty(Number(e.target.value))} min={1} className=\"w-full border rounded-lg px-4 py-2 mb-4\" />\n        <p className=\"text-3xl font-bold text-purple-600\">${(qty * 29.99).toFixed(2)}</p>\n      </div>\n    </div>\n  );\n}\n\ncreateRoot(document.getElementById('root')!).render(<App />);",
  "isPublic": true
}
```

**Headers (auto-tagging):**
```
x-session-id: session-abc-123
```

**Fields:**
- `slug` — Required. URL-safe unique identifier within the workspace.
- `title` — Required. Page title (used in browser tab).
- `htmlContent` — Required for static pages. Full HTML content.
- `tsxSource` — Required for TSX pages. Single-file React/TypeScript source code. Must include `createRoot` mount. When provided, `htmlContent` is generated automatically from compilation.
- `metadata` — Optional. JSON metadata for tracking and querying.
- `isPublic` — Optional. Defaults to `true`.
- `accessToken` — Optional. Required to view the page if `isPublic` is false.
- `expiresAt` — Optional. ISO datetime after which the page returns 404.
- `externalEmbed` — Optional. Defaults to **off**. Opts the page in to being framed on a third-party website. See [Embedding a page on a customer's website](#embedding-a-page-on-a-customers-website).

**Response:**
```json
{
  "id": "uuid-abc-123",
  "workspaceId": "workspace-123",
  "slug": "pricing-calculator",
  "title": "Pricing Calculator",
  "pageType": "tsx",
  "sessionId": "session-abc-123",
  "publicUrl": "https://www.mybusiness.com/p/workspace-123/pricing-calculator",
  "createdAt": "2024-01-14T12:00:00.000Z"
}
```

> **`publicUrl` and custom domains:** The `publicUrl` field returns a full URL. When the workspace has a verified custom domain, it uses that domain (e.g., `https://www.mybusiness.com/p/workspace-123/pricing-calculator`). Otherwise, it falls back to the platform domain (e.g., `https://audos.com/p/workspace-123/pricing-calculator`). Always use the `publicUrl` from the API response when sharing links — do not construct URLs manually.

**Compilation errors** return `422`:
```json
{
  "error": "TSX compilation failed",
  "details": "Unexpected token (line 15, col 4)\n  > return <div>..."
}
```

### List Permalink Pages
```
GET /api/workspaces/:workspaceId/permalink-pages
```

**Requires user-key** (header or query param). Returns only pages belonging to the current user, sorted by creation date.

### Get a Permalink Page
```
GET /api/workspaces/:workspaceId/permalink-pages/:pageId
```

**Requires user-key.** Returns 404 if the page doesn't belong to the caller.

### Update a Permalink Page
```
PATCH /api/workspaces/:workspaceId/permalink-pages/:pageId
```

Updatable fields: `slug`, `title`, `htmlContent`, `tsxSource`, `metadata`, `isPublic`, `accessToken`, `expiresAt`, `externalEmbed`, `sessionId`, `contactId`, `userId`.

When `tsxSource` is updated, the page is recompiled automatically. If compilation fails, the update is rejected with `422`.

### Recompile a TSX Page
```
POST /api/workspaces/:workspaceId/permalink-pages/:pageId/recompile
```

Forces recompilation of an existing TSX page from its stored source. Useful if the compilation pipeline is updated.

### Delete a Permalink Page
```
DELETE /api/workspaces/:workspaceId/permalink-pages/:pageId
```

### View a Permalink Page (Public URL)

On the platform default host, the page is served at:
```
GET /p/:workspaceId/:slug
GET /p/:workspaceId/:slug?token=access-token-here
```

On a workspace-owned custom host (Task #1235), the workspace UUID is
omitted because the Host header identifies the workspace:
```
GET /p/:slug                    (on https://billing.myapp.com)
GET /p/:slug?token=...
```

Static pages render raw HTML. TSX pages render as full React apps with importmaps and CDN dependencies. Both URL shapes go through the same `servePermalinkPage` renderer — `expiresAt`, `isPublic`/`accessToken` gating, and view accounting behave identically.

---

## TSX Page Details

### What's Available in TSX Pages

TSX pages are compiled using the same ESBuild pipeline as spaces. The following are available via importmap:

| Package | Version |
|---------|---------|
| `react` | 18.3.1 |
| `react-dom` | 18.3.1 |
| `react-dom/client` | 18.3.1 |
| `lucide-react` | 0.462.0 |

Tailwind CSS 3.4.1 is loaded via CDN stylesheet.

### TSX Page Rules

1. Must be a single file — all components in one file
2. Must call `createRoot(document.getElementById('root')!).render(...)` to mount
3. Can import from `react`, `react-dom/client`, and `lucide-react`
4. Can use Tailwind CSS classes
5. Can use `useState`, `useEffect`, `useRef`, and all React hooks
6. Can fetch data from APIs using `fetch()` at runtime
7. Can access `window.__PERMALINK_WORKSPACE_ID__` and `window.__PERMALINK_SLUG__`

### Example: Interactive Dashboard Page

```tsx
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, TrendingUp, Users } from 'lucide-react';

function Dashboard() {
  const [data, setData] = useState<any>(null);
  const workspaceId = (window as any).__PERMALINK_WORKSPACE_ID__;

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/analytics`)
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8">Analytics Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <Users className="w-5 h-5 text-blue-500 mb-2" />
          <p className="text-2xl font-bold">{data.totalUsers}</p>
          <p className="text-sm text-gray-500">Total Users</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <BarChart3 className="w-5 h-5 text-green-500 mb-2" />
          <p className="text-2xl font-bold">{data.pageViews}</p>
          <p className="text-sm text-gray-500">Page Views</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <TrendingUp className="w-5 h-5 text-purple-500 mb-2" />
          <p className="text-2xl font-bold">{data.conversion}%</p>
          <p className="text-sm text-gray-500">Conversion</p>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Dashboard />);
```

---

## Use Cases

1. **Invoices** — Generate unique invoice pages (static HTML or interactive TSX)
2. **Receipts** — Create shareable payment confirmation pages
3. **Proposals** — Share business proposals with interactive pricing calculators
4. **Certificates** — Issue completion certificates or awards
5. **Event Tickets** — Generate ticket pages with QR codes
6. **Reports** — Share analytics dashboards at unique links
7. **Contracts** — Host agreement pages for review and signature
8. **Interactive Tools** — Calculators, configurators, quizzes at unique URLs
9. **Client Portals** — Personalized pages that fetch live data for each customer

---

## Common Patterns

### Static Invoice Page from Hook

```javascript
const { customerName, amount, items, dueDate } = request.body;
const slug = `invoice-${Date.now()}`;

const html = `
<div style="font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 40px; border: 1px solid #e5e7eb;">
  <h1 style="color: #111;">Invoice</h1>
  <p><strong>To:</strong> ${customerName}</p>
  <p><strong>Due:</strong> ${dueDate}</p>
  <hr/>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; padding: 8px;">Item</th><th style="text-align: right; padding: 8px;">Amount</th></tr>
    ${items.map(i => `<tr><td style="padding: 8px;">${i.name}</td><td style="text-align: right; padding: 8px;">$${i.amount}</td></tr>`).join('')}
  </table>
  <hr/>
  <p style="text-align: right; font-size: 1.2em;"><strong>Total: $${amount}</strong></p>
</div>
`;

// `publicUrl` is what the create-page response returns; on a custom host
// it is `https://<host>/p/<slug>`, on the platform default it is
// `/p/<workspaceId>/<slug>`.
respond(200, { slug, html });
```

### TSX Interactive Calculator from Hook

```javascript
const { productName, basePrice } = request.body;
const slug = `calc-${productName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

const tsxSource = `
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Calculator() {
  const [qty, setQty] = useState(1);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4">${productName}</h2>
        <label className="block text-sm text-gray-600 mb-1">Quantity</label>
        <input type="number" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} min={1} className="w-full border rounded px-3 py-2 mb-4" />
        <p className="text-3xl font-bold text-purple-600">\${(qty * ${basePrice}).toFixed(2)}</p>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Calculator />);
`;

respond(200, { slug, tsxSource });
```

### Share with Expiration
```json
{
  "slug": "proposal-q1-2024",
  "title": "Q1 2024 Proposal",
  "htmlContent": "...",
  "isPublic": true,
  "expiresAt": "2024-03-31T23:59:59Z"
}
```

### Protected Page with Token
```json
{
  "slug": "contract-nda-smith",
  "title": "NDA - Smith Industries",
  "htmlContent": "...",
  "isPublic": false,
  "accessToken": "secure-random-token-here"
}
```

Accessible at the `publicUrl` returned by the API (e.g., `https://www.mybusiness.com/p/contract-nda-smith?token=secure-random-token-here` on a custom host, or `/p/<workspaceId>/contract-nda-smith?token=…` on the platform default host)

---

## Task #1235: Custom-host hosting

Permalink pages can be served on any host the workspace owns. The eligible
host set is the union of:

1. The workspace's primary `custom_domain` (and its `www` variant), implicit.
2. Rows in `workspace_permalink_hosts`, explicit. Add additional hosts via
   `POST /api/workspaces/:workspaceId/permalink-hosts` — the request is
   ownership-checked against `purchased_domains` before being persisted.

### Selecting a host on create / update

```http
POST /api/workspaces/:workspaceId/permalink-pages
{
  "slug": "invoice-2024-001",
  "html": "<h1>Invoice</h1>",
  "host": "billing.myapp.com"   // optional, must be in the eligible set
}
```

The response now includes both `publicUrl` and `host`:

```json
{ "id": "...", "slug": "invoice-2024-001", "host": "billing.myapp.com",
  "publicUrl": "https://billing.myapp.com/p/invoice-2024-001" }
```

If the workspace has no custom hosts, the response falls back to the
platform default URL and `host: null`.

### Host-registry endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/permalink-hosts` | Eligible host union |
| `POST` | `/api/workspaces/:workspaceId/permalink-hosts` | Add a secondary host |
| `POST` | `/api/workspaces/:workspaceId/permalink-hosts/check-ownership` | Pre-flight |
| `DELETE` | `/api/workspaces/:workspaceId/permalink-hosts/:host` | Remove a secondary host |

Hosts that are not owned by the workspace return `403`. Hosts already in
the registry return `409`.

---

## Embedding a page on a customer's website

Permalink pages are **not** framable by default. Every `/p/...` response carries
`X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`,
so a page dropped into an `<iframe>` on someone else's site is blocked by the
browser before any of the page's own JavaScript runs.

A page can opt in with `externalEmbed`. It is accepted on create and on update,
either at the top level of the request body or nested inside `metadata` (where
it is ultimately stored, so no other metadata keys are disturbed).

**Allow every origin:**

```json
{
  "slug": "document-viewer",
  "title": "Document",
  "tsxSource": "...",
  "externalEmbed": true
}
```

**Restrict to specific customer origins:**

```json
{
  "externalEmbed": {
    "enabled": true,
    "allowedOrigins": ["https://customer.com", "https://app.customer.com"]
  }
}
```

**Turn it back off:** `{ "externalEmbed": false }`, or `null` to remove the
setting entirely.

### Origin rules

Validated identically on write and on serve:

- Scheme + host only — `https://customer.com`, `http://localhost:3000`,
  `https://customer.com:8443`. An optional port is fine.
- No paths, queries, fragments, or userinfo. `https://customer.com/docs` is
  rejected.
- One wildcard is allowed, and only as the leading label:
  `https://*.customer.com`. `https://a.*.com`, `https://*.com` and `*` are
  rejected.
- An invalid value is rejected with `400`. If a malformed value ever reaches
  storage, the renderer **fails closed** and the page stays non-framable.

### Reading back the effective policy

Every create / update / get / list response carries `embedPolicy`, so an app can
tell whether its page is actually embeddable and build a correct snippet:

```json
"embedPolicy": {
  "embeddable": true,
  "mode": "origins",
  "allowedOrigins": ["https://customer.com"],
  "frameAncestors": "'self' https://customer.com"
}
```

`mode` is `"none"` (the default), `"any"`, or `"origins"`.

### What the renderer does

On an embeddable page the renderer removes `X-Frame-Options` entirely — there is
no standard permissive value for that header — and emits the `frameAncestors`
directive above. The page-known error states (expired, and access-token refused)
carry the same relaxed headers, so an embedded viewer renders **its own** message
inside the frame instead of a browser-blocked empty box. A request for a slug
that does not exist has no page to consult and stays same-origin.

Embeddable responses are marked `Cache-Control: private, no-store` so a
relaxed-framing response can never be replayed out of a shared cache for a page
that has not opted in.

### Security expectation

Opting in only removes the browser's framing block. It authenticates nobody.

- An embeddable page is world-framable. Put no secrets in its `htmlContent` /
  `tsxSource` — treat the page as a shell.
- **Validate `?token=` on every load, client-side, against your own hook**, and
  render a neutral "this link is not valid" state when it fails. Do not reveal
  whether a token merely expired.
- Prefer `allowedOrigins` over `true` whenever the customer set is known.
- Never embed anything that takes a payment or a credential. The payment
  permalink (`slug: "pay"`) and its `/@handle` URL are hard-excluded from this
  opt-in and stay same-origin no matter what is stored on them.

### Snippet the customer pastes

```html
<iframe src="https://www.mybusiness.com/p/document-viewer?token=CUSTOMER_TOKEN"
        width="100%" height="800" style="border:0" loading="lazy"></iframe>
```

---
# server-functions

Source: integrations/server-functions/docs.md

# Server Functions (Workspace Hooks) Integration

Define server-side handler functions that receive HTTP requests at unique URLs per workspace.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the sections it summarizes. -->
**Messaging a person from a function: `platform.postAgentMessage()` has TWO destinations and the default is NOT the founder's chat.** The default `destination: 'space_chat'` writes into a workspace SESSION's space chat — the visitor-facing surface the desktop workspace no longer renders — so an automation addressed to the owner reports success every run and is invisible to them. `destination: 'founder_chat'` writes into the founder's own Otto conversation (My Plan) and appears live with no reload. Use `'founder_chat'` for anything addressed to the founder/owner (digests, alerts, "your job finished") and the default only for messages addressed to a customer in a space conversation. Each automation reuses ONE ongoing founder conversation named after the function, and a retried run of the same occurrence is suppressed (`duplicate: true`), so never mirror to both destinations and never add your own dedupe table. Both destinations — and the dry run — return `deliveredTo`, a plain sentence naming the conversation the message went to; an unrecognised `destination` throws rather than falling back. See the "platform.postAgentMessage" section of the integration docs.

Platform-pushed triggers: a function registered under the reserved name `inbound-email` receives inbound mail, and one registered (enabled) under the reserved name `subscription-events` with the opt-in marker `audos:subscription-events` in its code receives subscription lifecycle events (`customer.subscription.created` / `.updated` / `.deleted`) in the provider's own event shape, already signature-verified by the platform. Nomination is the opt-in — a workspace without that function receives nothing. A third reserved name, `flutterwave-events` (marker `audos:flutterwave-events`), receives this workspace's Flutterwave events in Flutterwave's own shape — including payments started outside Audos — from the ONE shared webhook address a Flutterwave account registers. See the "Reacting to Workspace Events" section of the integration docs. A fourth, non-reserved trigger runs after a SUCCESSFUL PUBLISH: the workspace owner names any registered function in the `publish_completed_hook` workspace setting (empty by default, refused if the name is not registered) and the platform calls it with `{ event: "publish.completed", workspaceId, spaceId, publishedAt, cause, publishCount, _audos }`, where `cause` is only ever `founder_publish` or `coding_agent` — platform-owned repair/seed republishes are excluded. It runs the function and NOTHING ELSE: it never re-registers, redeploys or rebuilds a function, and a running function still cannot write the registry. No loops (a publish from inside a triggered run does not re-fire), no stacking (60-second minimum interval, publishes coalesce into one run and `publishCount` reports how many), self-pauses after 5 consecutive failures until the setting is saved again, and the publish never waits for it or fails because of it.

Signed webhooks: `request.rawBody` carries the exact transmitted text (JSON/urlencoded execute calls only; `null` for multipart, non-UTF-8, bodies over 2 MB, and platform-triggered runs with no HTTP request), and `platform.crypto.hmac({ secret, payload, algorithm?, encoding? })` plus `platform.crypto.timingSafeEqual(a, b)` compute and compare the digest. A signing secret saved as a Provider Credential is used by NAME with `await platform.crypto.hmacWithSecret({ secretName, payload, algorithm?, encoding? })` — the key never enters function code; `{{secrets.NAME}}` placeholders are NOT substituted inside `hmac()`. Private-key signing: `platform.crypto.signJwt({ secretName, claims, algorithm?, header?, keyId?, expiresIn? })` mints a signed JWT (RS256 default — Google service accounts and Wallet; ES256 for an Apple `.p8`) and `platform.crypto.sign({ secretName, content | contentBase64, algorithm?, encoding?, dsaEncoding? })` returns a raw signature, both using a private key held in the workspace secret store that the function NAMES but never sees — `await` them, 50 calls per execution, typed refusals (`unknown_secret`, `secret_disabled`, `invalid_key`, `key_algorithm_mismatch`, `key_passphrase_required`, `content_too_large`, `budget_exceeded`). A whole Google service-account JSON works as stored and defaults `iss`/`kid`/`iat`. Never paste a private key into function source or hand-write RSA in JavaScript. Hashing, comparison and signing only — no randomness, encryption, or key generation/storage, and no provider-specific verifier. See the "`request.rawBody`" and "platform.crypto" sections of the integration docs.

**A function can declare that its answer may be REUSED by the browser — and by default nothing is.** Every execute answer carries no cache instruction at all, so a script or catalogue a site loads on every page view is re-run and re-downloaded every time. Opt in either from the answering call — `respond(200, body, { cache: { maxAge, scope } })` / `respondRaw(200, body, contentType, { cache: { maxAge, scope } })` — or as a setting that survives code edits, `metadata.responseCache = { maxAge, scope }`; code wins over the setting, `null` turns the setting off. `maxAge` is whole seconds, `0`–`31536000` (1 year), and an out-of-range or malformed declaration is refused (a thrown message from code, `400 invalid_response_cache` on the management API), never silently ignored. `scope: 'public'` means any cache may keep it; `'private'` (the default) means only the browser that asked. **Always publish a VERSIONED URL with a long lifetime** (`?v=7`, a build date, a content hash) — a cached answer is keyed by its URL, so a redeploy is invisible to a browser holding the old copy. **An answer that could have depended on who asked can never be shared:** a required secret or `?secret=` / `x-hook-secret` / `x-shared-search-secret`, `metadata.executeAuth`, an inbound `x-session-id` / `x-ws-session-id` / `Cookie` / `Authorization`, or a `Set-Cookie` on the way out all downgrade `public` to `private`, with every matching reason (`hook_secret_required`, `session_auth_required`, `request_session_header`, `request_cookie`, `request_authorization_header`, `response_set_cookie`) written into the execution log as a `[cache]` line. Any answer carrying a reuse instruction also varies by `Cookie`, `Authorization`, `x-hook-secret`, `x-shared-search-secret`, `x-session-id` and `x-ws-session-id`, including a `public` one that carried none of them, so a stored copy can never stand in for an authorization check. A declaration on a non-2xx answer is ignored the same way. A function that declares nothing is byte-for-byte unchanged. See the "Reusing an answer in the browser" section of the integration docs.

**Registry state from inside a function:** `platform.serverFunctions.self()` and
`platform.serverFunctions.list()` return read-only metadata for this workspace's
server functions — `name`, `description`, `enabled`, `status`, `statusReason`,
`codeUpdatedAt`, `lastExecutedAt`, `executionCount`, `hasEverRun`, `lastError`
(redacted, 500 chars), `createdAt`, `codeFingerprint` —
**including functions that have never run**. `codeFingerprint` is the sha256 of
the registered source's UTF-8 bytes, lowercase hex, and covers the code and
nothing else.
Never source or secrets, never another workspace, and never writable: change /
enable / disable / redeploy / invoke throw a stated refusal.

**The registry's web endpoints (`/api/workspaces/:workspaceId/hooks…`) answer
`401` to a running server function — that refusal is permanent — but they are
not closed to everyone.** An external caller holding a workspace API key with
the `hooks:manage` scope can list, read, create and update this workspace's
functions with no browser; deleting one still needs a person or an agent. That
is the headless deploy path (see "Deploying without a browser"). To find what
actually needs re-registering, sha256 the bytes you are about to send and
compare them with `codeFingerprint` — equal means already registered, skip the
write. The platform never registers a function from a same-named file in the
space tree, and the registry stores no source path and no source hash.

**Validated visitor sessions are opt-in per function.** Set `executeAuth:
"workspace_session"` with `manage_server_functions` or
`workspace_server_functions` to reject missing, fabricated, unusable, and
cross-workspace sessions before code runs when space OTP
is enabled. OTP-disabled workspaces retain the documented legacy registration
allowance. Then read the
validated `session.id` / `session.email` globals — never trust an email in the
request body or parse identity from a session string. Do not enable this on a
timer-, inbound-email-, payment-event-, post-publish-, credential-login/logout-, or phone-triggered
function because those calls have no visitor session.

**Private image thumbnails:** `platform.privateFiles.thumbnail(keyOrReference)`
creates a separate private WebP with a longest edge of 640px from a
workspace-owned private PNG, JPEG, or WebP. It never changes or exposes the
original; store the returned key and mint a fresh link when rendering it.
<!-- MANIFEST:END -->

## Category
Backend / Server Logic

## Required API Keys
None — but "no API keys" does **not** mean "no auth". The hooks API has two
distinct auth models (see "Authentication" below):

- **Management endpoints** (create/list/read/update/delete hooks) require an
  authenticated caller with access to the workspace. Missing credentials
  return `401 {"error":"Authentication required"}`. An authenticated caller
  without workspace access receives `404 {"error":"Workspace not found"}` so
  the API does not reveal whether the workspace exists.
- **Execution** (`/api/workspaces/.../hooks/.../execute` and
  `/api/hooks/execute/...`) is **public**, gated only by the hook's own optional
  `secret`.

If you are a build agent in a Cursor/Fable bridge delegation session, the
management endpoints are closed to you — use the `workspace_server_functions`
bridge action for every create/read/update/edit/execute, including verifying
your own change. Every REST management example in this guide belongs to the
owner/dashboard route and is not a step you can perform. See "Authentication"
below for why, and never conclude the capability is missing.

---

## Authentication

| Surface | Auth required |
|---|---|
| `POST/GET/PATCH/DELETE /api/workspaces/:workspaceId/hooks[/:hookId]` | Authenticated caller with workspace access. Missing credentials fail with `401 {"error":"Authentication required"}`. Authenticated callers without workspace access fail with `404 {"error":"Workspace not found"}`. These endpoints are meant to be called from the workspace dashboard or by the workspace agent — not from public app code. |

Accepted management principals (each bound to the target workspace only):

- **The workspace owner** — any session/device credential whose email matches the
  workspace's owner email (or `allowedEmails`). No separate members-table row is
  needed, and the credential does not have to have been minted for this
  workspace: a multi-workspace founder's token works on every workspace their
  email owns.
- **A delegated tenant-agent credential** — an opaque `tac_live_…` marketplace
  credential (sent as `x-marketplace-credential`), minted per tenant agent and
  bound server-side to exactly one workspace, carrying `miniapp:read`
  (list/read) or `miniapp:write` (create/update/delete). This is a **different
  surface** from a build-agent delegation session: running inside a workspace
  does not give you one, and there is no way to mint one for yourself.
- **A workspace API key carrying the `hooks:manage` scope** — the headless
  route. A key the workspace owner explicitly created, sent as
  `x-workspace-db-token`, admits a plain HTTP client (a script, a cron job, a CI
  step) to **list, read, create and update** server functions with no browser
  session at all. It cannot **delete** one, and no other scope grants any of
  this. See "Deploying without a browser" below.
- **Trusted in-process callers** and Audos admins.

A data/page/bundle token (`x-workspace-db-token`) is a public data-plane
capability and is **never** a management principal — it always gets `404` here.
The page bundle token is minted with `data:read`/`data:write` only and can never
carry `hooks:manage`, so the key embedded in every published page stays refused
on these endpoints. Only a key the owner explicitly created with that scope is
admitted, and only for list/read/create/update.

**A bridge delegation session (the Cursor/Fable "audos" MCP bridge) is NOT a
management principal.** Such a session authenticates to the bridge with the
bridge platform key alone; that key carries no workspace binding and no
`miniapp:*` scope, so the management endpoints above reject it — `401
{"error":"Authentication required"}` when it is the only credential present,
`404 {"error":"Workspace not found"}` when some other non-owner identity is
attached. No key present in a delegation session's environment reaches this API,
and none can be requested. From a delegation session the bridge's
`workspace_server_functions` action is the **only** supported way to create,
read, update, edit, or run a server function — do not call these REST endpoints
and do not report the capability as missing when they refuse you.

A registered hook's stored source is always readable through the authenticated
`GET` endpoints above (the `code` field), even when no `hooks/<name>.js` file
exists in the workspace tree — the registry row is the export surface, so
file-based tooling and auto-fix agents can read and rewrite any hook.

Agent surfaces: the workspace agent (Otto) manages hooks with its
`manage_server_functions` tool, and Cursor/Fable delegation sessions use the
`workspace_server_functions` bridge action (list/read/create/update/edit/execute,
workspace-scoped) — which, as above, is their only route: the REST management
endpoints are closed to them. Hook source lives ONLY in the hooks registry — never look for
(or write) a hook file in the workspace source tree. Change an already-large
function with the anchored `edit` operation (`old_string` → `new_string`) rather
than `update`: `update` has to carry the whole source in a single call, and past
a few tens of KB that call is big enough to stall the run instead of completing.
`list` reports each function's `codeBytes`, so an agent can tell which is which.
| `GET/POST/DELETE/PUT/PATCH /api/workspaces/:workspaceId/hooks/:hookName/execute[/<subPath...>]`<br>`GET/POST/DELETE/PUT/PATCH /api/hooks/execute/:workspaceRef/:hookName[/<subPath...>]` | Public — no platform session. Extra path segments invoke the same named hook and are available to hook code as `request.subPath` (leading `/`, or `""` on the exact URL); `request.path` also includes the appended segments. CORS preflight supports the same methods. If the hook has a `secret` configured, callers must supply it via the `x-hook-secret` header or `?secret=` query parameter; otherwise anyone with the URL can execute the hook. A missing or incorrect hook secret returns `401`; disabled hooks return `403`. |

---

## Validated Workspace Sessions and Execution Gates

The supported caller identity inside a Server Function is the sandbox's
validated `session` global:

```javascript
if (!session?.id || !session?.email) {
  respond(401, { error: 'A verified workspace session is required' });
  return;
}

const caller = {
  sessionId: session.id,
  email: session.email,
};
```

Never derive identity from `request.body.email`, `request.body.user_email`, or
a string in `request.headers['x-session-id']`. Request fields are
caller-controlled. The platform populates `session` only after resolving the
supplied session id against this workspace's real session rows.

For browser- or AgentChat-facing functions that must reject unproven callers
before any function code runs, set the execution gate during create or update:

```json
{
  "operation": "update",
  "name": "save-private-profile",
  "executeAuth": "workspace_session"
}
```

Both `manage_server_functions` and `workspace_server_functions` accept
`executeAuth: "workspace_session"` to enable the gate and `executeAuth: "none"`
to remove it. When omitted, the current setting is preserved. The default stays
optional for backwards compatibility: without the gate, a missing or invalid
session produces `session: null` and legacy function code still runs.

Owner/dashboard and `hooks:manage` API-key callers use the same values under
`metadata.executeAuth` on the hook create/PATCH endpoints. A metadata update
that omits `executeAuth` preserves the current gate; send
`metadata.executeAuth: "none"` explicitly to remove it. These routes apply the
same known-trigger conflict checks as the agent tools.

The caller must send a real platform-issued `wses_…` id or its workspace
session UUID in `X-Session-Id`. Client-minted placeholders such as `anon_…`,
`ephemeral_…`, `csess_…`, and composed strings such as
`space-<email>-<uuid>` are not identity and are rejected by a gated function.
Use the canonical session id returned by the space registration/OTP flow.

For email-possession proof, enable the workspace's space OTP flow. At an
OTP-disabled workspace, the compatibility policy may accept a server-issued,
same-workspace registration session and expose its registration email; that is
not proof that the visitor owns the address.

For a hook-to-hook call on behalf of the same visitor, forward the canonical
`X-Session-Id` value. The downstream function validates it independently
against its workspace before exposing `session`; never copy an email through
the body as a substitute. A Server Function's `fetch()` does not automatically
credential another hook execute URL.

Use a hook `secret` for routing or administrative functions that should accept
only callers holding a server-side shared secret. Those callers send
`x-hook-secret`; direct requests without the correct secret are rejected before
function code runs. Do not place the secret in a published browser bundle.

Do **not** enable `executeAuth: "workspace_session"` on functions driven by a
scheduled task, inbound email, subscription or payment events, post-publish
automation, credential sign-in/logout, or a phone tool. Those platform calls have no visitor workspace
session and would be rejected. The management tools refuse known scheduled and
platform-pushed functions; phone-tool wiring lives outside the hook registry,
so confirm that use manually before enabling the gate.

---

<!-- MANIFEST:APPENDIX — this section is emitted into APP_INTEGRATION_MANIFEST.md (headings nested) by scripts/generate-app-integration-manifest.ts. Keep it consistent with session-management's "Custom Credential Sign-In". -->
## Credential Sign-In Hooks (NEW generated apps only)

Platform email OTP is the default for generated apps. If a new app explicitly
requires its own password or other credential, keep the verifier in a
registered Server Function and create a paired sign-in/logout hook contract.
The sign-in hook must accept `POST`, reject bad credentials explicitly, and
return a stable subject plus normalized email only after the real server-side
verifier succeeds. Never return password hashes, salts, or credential material.

A response shape alone is not authority. The platform-owned, reviewed binding
pins the workspace, immutable hook ID, exact code hash/version, allowed `POST`
method, accepted status/predicate, subject and email extractors, expiry, and
credential authority. A name, hook metadata field, request header,
`_meta.success`, or lookalike response cannot opt a hook in. Editing the
registered source invalidates recognition until the new version is reviewed.
Page JavaScript cannot create or update this binding.

The browser caller uses a root-relative, same-origin URL and
`credentials: 'include'`; the browser supplies `Origin`. On a recognized
success, the platform may set a signed HttpOnly `hook_credential` cookie without
changing the hook's status or body. That grant is scoped to private WorkspaceDB
identity. It is not OTP/email-possession verification and cannot confer founder,
delegation, mailroom, or other strict-email authority.

Until a reviewed binding exists for that exact hook version — and by default
none does — a hook success creates NO platform session. A stored "signed in"
record that carries no platform session id must never count as signed in: the
platform reads that browser as an anonymous visitor, so the person's private
rows stay invisible and every private write is refused with
`SESSION_VERIFICATION_REQUIRED`. Clear such a record and send the person back
through platform OTP.

Never tell page JavaScript to set `verified`, `sessionVerified`,
`canonicalSessionId`, `workspaceSessionId`, or `X-Session-Id` for this flow.
Generate a paired, reviewed `POST` logout hook so the platform can revoke the
grant and clear the cookie. If no reviewed binding is available, use platform
OTP rather than shipping a custom flow that assumes a response mints identity.

Existing deployed apps do not need to adopt this contract, change hooks, or
republish. Their recognition is handled separately by platform-owned fleet
review.

```javascript
/*
 * NEW generated apps only: call this registered POST hook from a root-relative,
 * same-origin fetch with credentials: 'include'.
 * A response shape alone is not authority; only a platform-owned binding for
 * this exact hook ID and code version can establish scoped WorkspaceDB identity.
 * Never set platform verification or session fields in page JavaScript.
 * Existing deployed apps do not need to adopt this contract.
 */
function finishCredentialSignIn(credentialUser) {
  // credentialUser must come from this hook's genuine server-side verifier.
  if (!credentialUser?.id || !credentialUser?.email) {
    respond(401, { success: false, error: 'Invalid credentials' });
    return;
  }

  respond(200, {
    success: true,
    user: {
      id: String(credentialUser.id),
      email: credentialUser.email,
    },
  });
}
```

For logout, complete any app-specific cleanup and return the reviewed logout
hook's configured success response:

```javascript
respond(200, { success: true });
```
<!-- MANIFEST:END -->

---

## Workspace ID Format

**Any of the following formats work interchangeably** in all Server Functions API endpoints. The platform resolves them to the same workspace automatically:

| Format | Example | Description |
|---|---|---|
| Numeric config ID | `665201` | Shortest — use this by default |
| `workspace-{configId}` | `workspace-665201` | Alternate prefix format |
| UUID | `8a8181a4-9eab-...` | Internal UUID — also accepted |

**Recommendation: use the numeric configId** (e.g. `665201`) for REST API fetch URLs. It is the most stable identifier and easiest to find — it appears in the workspace URL and in `get_workspace_email` tool responses. The `resolveWorkspace()` middleware automatically resolves configId to UUID. However, for direct workspace DB engine operations (e.g., `workspaceDbEngine.*()` calls), always use the workspace UUID — never pass configId directly.

```
GET /api/workspaces/665201/hooks       ✅ works
GET /api/workspaces/workspace-665201/hooks  ✅ works
GET /api/workspaces/8a8181a4-.../hooks ✅ works
```

Inside the hook sandbox, the `workspaceId` global is always the **resolved UUID** so it's safe to pass to internal platform API calls.

---

## Concepts

- **Hook** — A named server-side JavaScript function stored in the database and executed in a sandboxed environment. Each hook is scoped to a workspace and accessible via a unique URL.
- **Hook Execution** — When a hook URL is called, the platform runs the hook code in a secure sandbox with a **5-minute (300s) timeout**. The hook receives the HTTP request context and can return custom responses via `respond()`.
- **Hook Secret** — An optional shared secret for webhook authentication. When set, callers must include the secret in the `x-hook-secret` header or `?secret=` query parameter.

---

## Deploying Hook Code (IMPORTANT)

**A file under `hooks/` is not a registered hook.** The hook registry (the database row behind the hook-management API) is the source of truth for execution:

- **Creating `hooks/<name>.js` does NOT register a new hook.** The execute endpoint has nothing to run until a registry row exists — the file alone is inert, no matter how correct the code is.
- **Editing `hooks/<name>.js` does NOT update the running hook.** Writing a file under `hooks/` succeeds and the Draft compilation picks the file up into the compiled manifest, but neither step syncs the file's contents into the registry — the edit stays silently dormant, and calling the execute endpoint still runs the OLD registered code. (Verified 2026-07-27 on a live workspace: a `hooks/qa-guru-replay.js` rewrite was readable back byte-for-byte, yet the registered hook's code and `updatedAt` were unchanged and new actions returned `unknown-action` until an explicit deploy.)

**Deploying means writing the registry — but which route writes it depends on
who you are.** The three routes below are not interchangeable and not steps in
one sequence. Find the row that describes your session, follow that route, and
ignore the other two:

| You are | Deploy and verify with | REST management API |
|---|---|---|
| A build agent in a Cursor/Fable bridge delegation session | The `workspace_server_functions` bridge action | **Closed to you** — no credential in your session authenticates there, and none can be requested. |
| Otto, the workspace agent | The `manage_server_functions` tool | Not needed. |
| The workspace owner, the workspace dashboard, or a tenant-agent credential | The REST endpoints under "API Endpoints" | Available. |
| A script, cron job or CI step run by the workspace owner, with no browser | The same REST endpoints, using a workspace API key carrying `hooks:manage` | Available for list/read/create/update. Delete is not. See "Deploying without a browser". |

### Bridge delegation session — `workspace_server_functions` (your only route)

The action is workspace-scoped (identity comes from the MCP URL your client
connected to, so there is no `workspaceId` argument) and covers the whole
lifecycle, including verification:

| What you need | Call |
|---|---|
| See which functions exist, with each one's `codeBytes` | `{ "operation": "list" }` |
| Read a function's stored source (the live source — the registry, not a file) | `{ "operation": "read", "name": "<name>" }` |
| Register a new function | `{ "operation": "create", "name": "<name>", "code": "<source>", "description": "<what it does>" }` |
| Replace the whole source, or flip `enabled` | `{ "operation": "update", "name": "<name>", "code": "<source>" }` |
| Change part of an already-large function | `{ "operation": "edit", "name": "<name>", "old_string": "<exact snippet>", "new_string": "<replacement>" }` |
| Run it and see status, console logs, response body and duration | `{ "operation": "execute", "name": "<name>", "body": { ... } }` |

**Verify without leaving the tool.** After a write, `read` the function back and
compare it with what you sent, then `execute` it and check the returned status,
logs and body. `execute` runs through the platform's internal runner, so it also
works for a function that has a `secret` configured — the public execute URL
would answer `401` to you, and no agent surface can read that secret by design.

- Prefer `edit` over `update` on a large function: `update` has to carry the
  whole source in one tool call, and past a few tens of KB that call is big
  enough to stall the run instead of completing. `list` reports `codeBytes`, so
  you can tell which functions those are.
- Writing a file under `hooks/` deploys nothing, and reading one tells you
  nothing about what is running. `read` is the live source.
- **Never call the REST hook-management endpoints from a delegation session.**
  They need a management principal you do not have and cannot obtain, so they
  answer `401`/`404` however the request is shaped. That refusal is the
  permission model working as designed — not a broken hook, not a missing
  prerequisite, and not a capability gap to report. It also means nothing you
  sent was applied: redo the operation with `workspace_server_functions` before
  reporting the work as done.
- If a call is rejected before it reaches the platform, resend the same
  operation with `code_gz` (or `old_string_gz` / `new_string_gz` for `edit`) —
  the same text gzipped, then base64-encoded. Never rewrite, simplify, or
  otherwise alter founder source to get it through.

### Otto (the workspace agent) — `manage_server_functions`

When working through Otto, use `manage_server_functions` to create or update
the registry row. Main Otto delegates that mutating operation to a background
sub-Otto; verify it with `test_server_function` or `get_hook_logs`. This is
ordinary workspace work — never escalate hook registration to support.

### Workspace owner or dashboard session — REST management API

**This route requires a management principal** — an owner/dashboard session, a
tenant-agent credential (`x-marketplace-credential`), or a trusted in-process
caller (see "Authentication"). It is **not** a bridge-agent deployment step: a
build agent in a delegation session uses `workspace_server_functions` above and
never the calls below.

To deploy a file-based hook from an owner/dashboard context:

1. Write/patch the source file under `hooks/` as usual (keeps the source tree reviewable).
2. Deploy the file's contents to the registry:
   - **New hook** — register it:
     ```
     POST /api/workspaces/{workspaceId}/hooks
     { "name": "<name>", "code": "<full contents of hooks/<name>.js>" }
     ```
   - **Existing hook** — update the registered code:
     ```
     PATCH /api/workspaces/{workspaceId}/hooks/{hookId}
     { "code": "<full contents of hooks/<name>.js>" }
     ```
3. Verify: `GET /api/workspaces/{workspaceId}/hooks/{hookId}` and confirm the returned `codeFingerprint` equals the sha256 (hex, UTF-8 bytes) of what you sent, and that `updatedAt` advanced. Only then does the execute endpoint run the new code.

Reading `codeFingerprint` **before** writing is also how you avoid the write
entirely: list the workspace's functions, hash each local body, and `PATCH`
only the ones whose fingerprints differ. Nothing about the platform ever
re-registers a function from a file — the registry stores no source path and no
source hash, and a same-named file in the space tree is frequently not the
bytes that are registered.

Do not treat a successful file write or a fresh Draft compile as evidence the hook is registered or updated — always verify against the registry.


### Deploying without a browser — a workspace key with `hooks:manage`

The REST management endpoints above normally require a signed-in person, the
dashboard, a tenant-agent credential, or a trusted in-process caller. That makes
the last step of a code sprint — re-registering every function so its drift
warning clears — a thing you can only do from a logged-in browser.

A workspace API key carrying the **`hooks:manage`** scope is the supported way to
do it headlessly. Create one from the workspace's API-key management endpoint
(owner-gated — you must be signed in as the workspace owner to *create* the key,
but never again to *use* it):

```
POST /api/workspace-api-keys/{workspaceId}
{ "name": "deploy-script", "scopes": ["hooks:manage"] }
```
<!-- MANIFEST:ENDPOINT POST /api/workspace-api-keys/{workspaceId} | Deploying without a browser — a workspace key with `hooks:manage` -->

The response's `plainKey` (`ak_live_…`) is shown once. Store it the way you store
any other deploy secret. Send it on every management call as the
`x-workspace-db-token` header:

```bash
curl -s -H "x-workspace-db-token: $AUDOS_HOOKS_KEY" \
  https://audos.com/api/workspaces/{workspaceId}/hooks

curl -s -X PATCH \
  -H "x-workspace-db-token: $AUDOS_HOOKS_KEY" \
  -H 'content-type: application/json' \
  --data-binary @payload.json \
  https://audos.com/api/workspaces/{workspaceId}/hooks/{hookId}
```

**Exactly these four operations are unlocked**, and only for the workspace the
key belongs to:

| Endpoint | With a `hooks:manage` key |
|---|---|
| `GET /api/workspaces/:workspaceId/hooks` | ✅ list |
| `GET /api/workspaces/:workspaceId/hooks/:hookId` | ✅ read (source included, `secret` redacted) |
| `POST /api/workspaces/:workspaceId/hooks` | ✅ create |
| `PATCH /api/workspaces/:workspaceId/hooks/:hookId` | ✅ update (this is the deploy) |
| `DELETE /api/workspaces/:workspaceId/hooks/:hookId` | ❌ **refused** — still needs a person or an agent |
| `PUT /api/workspaces/:workspaceId/hooks/:hookId/ai-budget` | ❌ refused — owner-only spend opt-in |

**What it deliberately cannot do — do not "fix" these refusals.** They are the
permission model working as designed:

- **It cannot delete a server function.** Deletion is destructive and
  irreversible, so it stays with a signed-in person, the workspace agent, or a
  trusted internal caller. A `hooks:manage` key gets the same
  `404 {"error":"Workspace not found"}` there as any other key-only caller.
- **It cannot reach another workspace.** The key is bound server-side to the
  workspace it was created in; pointing it at a different `:workspaceId`
  answers `404 {"error":"Workspace not found"}`.
- **A key without the scope changes nothing.** Any other key — including the
  page-bundle token compiled into every published page — is refused on these
  endpoints exactly as before, with the same `404`. That `404` is a denial, not
  a statement that the workspace does not exist; it is deliberate so the API
  never reveals which workspaces exist.
- **It does not give running hook code this capability.** Inside the sandbox,
  `platform.serverFunctions.*` stays read-only and the registry's web endpoints
  still answer `401` to a server function. A function does not receive this key.

⚠️ **Never put this key in space-app code.** Everything the space compiler ships
to the browser — app components, page JavaScript, anything under the app tree —
is **public**: it is downloaded by every visitor of the published space. A
`hooks:manage` key placed there hands any visitor the ability to read and rewrite
your workspace's server-function source. Keep it in your deploy environment
(CI secret, shell environment, scheduled-job configuration) and nowhere else. If
it ever reaches page code, revoke it immediately with
`DELETE /api/workspace-api-keys/{workspaceId}/{keyId}` and create a new one.

**Large function bodies must be sent gzipped.** The production request gateway
inspects the raw body of hook-management `POST`/`PATCH` requests and rejects
ordinary source code before it reaches the API — you get an HTML `403`, not the
API's JSON. This is not an authentication problem and your key is fine. Send the
source with the existing `code_gz` transport instead (see "Recovering a source
write rejected before the API" immediately below): gzip the exact UTF-8 bytes,
base64 the gzip bytes, and send `code_gz` in place of `code`. For the function
sizes that make a headless deploy worth automating (tens of KB and up), treat
`code_gz` as the default rather than the recovery path. Never rewrite or
simplify the source to get it through.

### Recovering a source write rejected before the API

A production request gateway can inspect the raw body of hook-management
`POST` and `PATCH` requests and reject ordinary source code before the Hooks
API receives it. This response is an HTTP `403` with an HTML body instead of
the API's normal JSON. It is not proof that the workspace connection is down.

When this happens, do not rewrite, simplify, or otherwise alter the hook source.
Gzip the exact UTF-8 bytes, base64-encode the gzip bytes, then resend the same
authenticated request with `code_gz` instead of `code`:

```javascript
import { gzipSync } from 'node:zlib';

const code_gz = gzipSync(Buffer.from(code, 'utf8')).toString('base64');
// POST create: { name, code_gz, ...otherFields }
// PATCH update: { code_gz, ...otherFields }
```

Omit `code` when sending `code_gz`. The server authorizes workspace access
before decompressing, restores the byte-identical text, and then runs the same
validation, collision checks, partial-update behavior, persistence, and
write-verification path as a plain request.

Supplying both forms, a non-text value, malformed or non-gzip data, invalid
UTF-8, or an oversized expansion returns structured JSON with
`encoded_arg_conflict`, `encoded_arg_invalid`, or
`encoded_arg_too_large`; the hook is not written. The request gateway's
signatures can change, so never diagnose a particular source fragment or edit
founder code to work around one.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the recovery passage above. -->
**Hook source-write recovery:** If an authenticated hook-management `POST` or
`PATCH` returns an HTML `403` instead of JSON, do not alter the source. Gzip
the exact UTF-8 code, base64 the gzip bytes, resend it as `code_gz`, and omit
`code`. The server decodes it after workspace authorization and runs the same
write pipeline. Never send both forms or rewrite founder code to get around the
request gateway. See `integrations/server-functions/docs.md` for limits and
structured error codes.
<!-- MANIFEST:END -->

*This recovery belongs to the owner/dashboard REST route. A bridge delegation
session hits the same gateway and solves it the same way, but through the
`workspace_server_functions` action's `code_gz` / `old_string_gz` /
`new_string_gz` arguments — never by retrying against the REST endpoints.*

---

## API Endpoints

**The management endpoints below are the owner/dashboard route.** Create, list,
get, update and delete each require a management principal — an owner/dashboard
session, a tenant-agent credential, or a trusted in-process caller. Create,
list, get and update additionally accept a workspace API key carrying the
`hooks:manage` scope, which is how you deploy from a script with no browser
(see "Deploying without a browser"); delete never does. A
Cursor/Fable bridge delegation session is not one of them: from a delegation
session, use the `workspace_server_functions` action (see "Deploying Hook Code")
for every one of these operations, including reading a function back to verify
it. Only the execute endpoints at the end of this section are public.

All endpoints accept any workspace ID format (numeric configId, `workspace-{configId}`, or UUID). See "Workspace ID Format" above.

### Create a Hook
```
POST /api/workspaces/:workspaceId/hooks
```

**Request:**
```json
{
  "name": "process-payment",
  "description": "Handle incoming Stripe webhooks",
  "code": "const event = request.body;\nconsole.log('Received event:', event.type);\nrespond(200, { received: true });",
  "language": "javascript",
  "enabled": true,
  "secret": "whsec_abc123"
}
```

- `name` — Required. Unique name within the workspace. Used in the execution URL.
- `description` — Optional. Human-readable description.
- `code` — Required unless `code_gz` is supplied. JavaScript code to execute. Runs in a sandboxed environment.
- `code_gz` — Optional transport alternative for `code`: gzip the exact UTF-8 source, then base64 the gzip bytes. Never send both forms.
- `language` — Optional. Defaults to `javascript`.
- `enabled` — Optional. Defaults to `true`. Disabled hooks return 403 when called.
- `secret` — Optional. If set, callers must provide this secret to execute the hook.

**Response:**
```json
{
  "id": "uuid-abc-123",
  "workspaceId": "8a8181a4-9eab-4076-b996-14b133c6558f",
  "name": "process-payment",
  "description": "Handle incoming Stripe webhooks",
  "code": "...",
  "language": "javascript",
  "enabled": true,
  "secret": "whsec_abc123",
  "executionCount": 0,
  "lastExecutedAt": null,
  "lastError": null,
  "createdAt": "2024-01-14T12:00:00.000Z",
  "updatedAt": "2024-01-14T12:00:00.000Z"
}
```

Note: `workspaceId` in the response is always the resolved UUID, regardless of what format you used in the URL.

### List Hooks
```
GET /api/workspaces/:workspaceId/hooks
```

Returns an array of all hooks for the workspace. Returns `[]` if no hooks have been created yet.

Every element carries `codeFingerprint`: the sha256 of that function's
registered source, as lowercase hex of the UTF-8 bytes. It is the same value
`GET .../hooks/:hookId`, the `workspace_server_functions` agent tool and
`platform.serverFunctions` report for the same function. Hash the bytes you are
about to deploy the same way and compare — matching means the registry already
holds exactly those bytes, so skip the `PATCH`. That is what "drift" means
here: nothing else moves the fingerprint, so a description or `enabled` edit
leaves it untouched.

**Not callable from inside a server function.** A running function has no
identity of its own, so this endpoint answers `401 Authentication required` to
it — by design, permanently. From inside hook code use
`platform.serverFunctions.list()` (see Platform Helpers), which reports the
same `codeFingerprint`. That refusal applies to the *sandbox*, not to every
caller: an external script holding a workspace key with `hooks:manage` gets
`200` from this endpoint (see "Deploying without a browser").

### Get a Hook
```
GET /api/workspaces/:workspaceId/hooks/:hookId
```
<!-- MANIFEST:ENDPOINT GET /api/workspaces/:workspaceId/hooks/:hookId | Get a Hook -->

### Update a Hook
```
PATCH /api/workspaces/:workspaceId/hooks/:hookId
```

Updatable fields: `name`, `description`, `code` (or its `code_gz` transport), `language`, `enabled`, `secret`, `metadata`.

Only the fields you send are changed. A PATCH that carries just `code` never
touches `enabled` — an enabled hook stays enabled, a disabled one stays
disabled. To change whether a hook runs, send `enabled` explicitly.

### The `enabled` field

`enabled` is the only thing that decides whether a hook answers calls. A
disabled hook returns `403` from every execute surface.

| Situation | What happens to `enabled` |
|---|---|
| `POST` without `enabled` | Defaults to **`true`** — a newly created hook is live immediately. |
| `POST` with `"enabled": false` | Created disabled. |
| `PATCH` without `enabled` (e.g. a code-only edit) | **Unchanged.** Editing `code`, `description`, `secret`, or `metadata` never flips a hook off. |
| `PATCH` with `"enabled": true` / `false` | Set to exactly that value. |

`enabled` is the field name. There is no `isEnabled`, `active`, `status`, or
`disabled` field — sending one of those changes nothing, and the hook keeps
whatever state it already had.

**Writes never lie about the stored row.** Create and update read the row back
after writing it and compare it against what you asked for. If anything below
the API overrode a field, the request fails with `409` naming the field that
diverged, instead of returning `200`/`201` with the value you sent:

```json
{
  "error": "Hook update did not persist as requested: enabled (requested true, stored false). The stored row was overridden below the application, so this write was not applied as asked.",
  "overriddenFields": ["enabled"],
  "hook": { "id": "uuid-abc-123", "enabled": false, "...": "the row as actually stored" }
}
```

So a `2xx` response means the row really is in the state you asked for. Treat a
`409` as "the write did not take" and report it — do not retry blindly.

**If a hook is off and you did not turn it off.** Authenticated reads
(`GET .../hooks` and `GET .../hooks/:hookId`) include `disabled`, `disabledBy`
(`platform` | `owner` | `unknown`) and a plain-language `disabledReason`.
`disabledBy: "platform"` means a since-retired platform check disabled it, not
anything the workspace did — the code is fine and a `PATCH` with
`"enabled": true` brings it straight back. The public execute endpoints keep
their bare `403` and never expose this detail.

### Delete a Hook
```
DELETE /api/workspaces/:workspaceId/hooks/:hookId
```

Returns 204 No Content on success.

Deletion accepts **no API-key caller**. Unlike list/get/create/update, a
workspace key carrying `hooks:manage` is refused here with
`404 {"error":"Workspace not found"}` — destroying a registered function
requires a signed-in person, the workspace agent, or a trusted internal caller.

### Execute a Hook (Webhook Endpoint)

Two public execute URL families reach the same hook. Both accept `GET`, `POST`,
`DELETE`, `PUT`, and `PATCH`:

```
/api/workspaces/:workspaceId/hooks/:hookName/execute[/<subPath...>]
/api/hooks/execute/:workspaceRef/:hookName[/<subPath...>]
```

Either is the URL you give to external services (Stripe, Mailgun, etc.) as a
webhook URL. Both `:workspaceId` and `:workspaceRef` accept any workspace id
format (numeric configId, `workspace-{configId}`, or UUID). Customer chat
tools registered in the `mcp-agent-tools` registry must point at the canonical
alias form `/api/hooks/execute/workspace-{configId}/{hookName}` — that is the
endpoint shape the tool registry accepts (see Customer Chat Tool Integration
below).

Extra path segments do not change the hook name. For example,
`GET /api/hooks/execute/workspace-123/pass-api/v1/passes/type/serial` runs
`pass-api` with `request.subPath === "/v1/passes/type/serial"`.
`request.subPath` is `""` on the exact execute URL; `request.path` also
contains the appended segments.

#### Calling a hook from another site (browser CORS)

By default the execute URLs grant **no** cross-site browser access: a
preflight from another origin is answered `204` without
`Access-Control-Allow-Origin`, so a page on a different domain cannot read
the reply. CORS headers a hook sets itself are ignored by design. The only
control is the hook's registered allowlist, `metadata.browserCors.allowedOrigins`:

- Otto: `manage_server_functions` create/update with
  `allowedOrigins: ["https://customer.example", "https://www.customer.example"]`
  (`[]` removes cross-site access; `list` shows the current list).
- REST / `hooks:manage` key: include
  `"browserCors": { "allowedOrigins": [...] }` in the hook's `metadata` on
  create or update. Metadata is replaced as a whole: keys you omit are
  removed, except execution auth and the AI allowance, which are kept.

Each entry is an exact origin: scheme and host, optional port, no path, no
wildcard. `https://www.customer.example` and `https://customer.example` are
separate entries. A listed origin gets `Access-Control-Allow-Origin` on the
preflight and on every response; credentials are never allowed cross-site, so
do not rely on a visitor cookie or `executeAuth: "workspace_session"` for a
cross-site caller. Allowed request headers are `Content-Type`,
`x-hook-secret`, `x-shared-search-secret`, `x-session-id` and
`x-ws-session-id`.

For an embeddable chat widget: keep the system prompt and AI call inside the
hook with `platform.generateText`, never a browser-side AI call that ships
the workspace token. Hook replies are returned whole; streaming a hook
response is not supported. If the widget also needs a page other sites can
`<iframe>`, use a permalink page with `externalEmbed` (see the
permalink-pages integration); app routes on the space have no framing setting.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with this section and "Reacting to Workspace Events". -->
**Execute URLs & reacting to events:** A hook is publicly executable at both
`/api/workspaces/:workspaceId/hooks/:hookName/execute` and the canonical alias
`/api/hooks/execute/:workspaceRef/:hookName` (customer chat tools must use the
alias form `/api/hooks/execute/workspace-{configId}/{hookName}`). Either URL
may append extra path segments; they still invoke `hookName`, with the suffix
available as `request.subPath` (leading `/`, or `""` on the exact URL) and the
appended segments also remain in `request.path`. Execute routes accept
GET/POST/DELETE/PUT/PATCH. The `secret` is optional — a secret-less hook's
execute URL is open. `respond()` JSON
responses carry an appended `_meta` execution block; `respondRaw()` responses
intentionally omit the wrapper. Outside the three reserved-name pushes
(`inbound-email`, `subscription-events`, `flutterwave-events`) there is no
event→hook subscription: react to
workspace analytics events with a scheduled hook that polls
`GET /api/crm/events` (`{ success, data, count }` envelope, at-least-once with
an idempotent side effect — see the "Reacting to Workspace Events" section of
`integrations/server-functions/docs.md`).
<!-- MANIFEST:END -->

**Authentication:** A hook's `secret` is optional. If the hook has one,
callers must include it as:
- Header: `x-hook-secret: your-secret`
- Query: `?secret=your-secret`

If the hook has no secret, both execute URLs are open — anyone who knows the
URL can run the hook, so write secret-less hook code as handling untrusted
input. Hooks used as customer chat tools should stay secret-less or carry the
secret as a static `?secret=` query parameter in the registered endpoint.

**Response:**
```json
{
  "received": true,
  "_meta": {
    "success": true,
    "durationMs": 45,
    "logs": ["Received event: payment_intent.succeeded"],
    "error": null
  }
}
```

The response body comes from whatever the hook code passes to `respond()`.
For these JSON responses the `_meta` field (success, durationMs, logs, error)
is always appended with execution details. A hook that answers with
`respondRaw()` intentionally omits this wrapper: the body is returned verbatim
(plain text or base64-decoded bytes) with no `_meta`, which is what external
services that require an exact echo (e.g. Meta webhook verification) expect.


#### Reusing an answer in the browser — `cache` (opt-in)

By default a server function's answer carries **no cache instruction at all**:
every page view re-runs the function and re-downloads the whole body. That is
still the default. A function that says nothing keeps exactly the headers it
has today.

A function can declare that its answer may be reused, and for how long, from
the call that sends the answer:

```javascript
// A generated script the site loads on every page view.
respondRaw(200, bundleSource, 'application/javascript', {
  cache: { maxAge: 31536000, scope: 'public' },   // 1 year
});

// The JSON shape takes the same declaration.
respond(200, { rates }, { cache: { maxAge: 3600, scope: 'public' } });
```

…or as a **setting on the function**, so it needs no code change and survives
every later code edit:

```
PATCH /api/workspaces/:workspaceId/hooks/:hookId
{ "metadata": { "responseCache": { "maxAge": 31536000, "scope": "public" } } }
```

A declaration made in the code wins over the setting for that answer. Set
`metadata.responseCache` to `null` to turn the setting off.

| Field | Meaning |
|---|---|
| `maxAge` | Whole seconds the answer may be reused. Integer, `0`–`31536000` (1 year). `0` means "revalidate every time". |
| `scope` | `'public'` — any cache may keep it. `'private'` (the default when omitted) — only the browser that asked. |

An out-of-range or malformed declaration is **refused, never ignored**. From
code the call fails with a message naming the surface (`respond() cache.maxAge
must be between 0 and 31536000 seconds (1 year), received 99999999`); on the
management API the write is answered `400` with `code: "invalid_response_cache"`.

**Use a versioned URL whenever you use a long lifetime.** A cached answer is
keyed by its URL, so a browser holding a one-year copy will not notice that you
redeployed the function. Publish the URL with a version in it — `?v=7`,
`?build=2026-09-25`, a content hash — and change that value when the answer
changes. Without a versioned URL, a long `maxAge` is a promise you cannot take
back for up to a year.

**An answer that could have depended on who asked can never be shared.** The
platform classifies the request it actually served — not the declaration — and
downgrades `scope: 'public'` to `private` (the browser that asked may still
reuse it; nobody else may) whenever any of these is true:

| Signal | Reason recorded |
|---|---|
| The function is protected by a secret, or the call carried `?secret=`, `x-hook-secret` or `x-shared-search-secret` | `hook_secret_required` |
| The function requires a workspace session (`metadata.executeAuth`) | `session_auth_required` |
| The call carried `x-session-id` or `x-ws-session-id` | `request_session_header` |
| The call carried a `Cookie` | `request_cookie` |
| The call carried an `Authorization` header | `request_authorization_header` |
| The answer sets a cookie on its way out | `response_set_cookie` |

**Any answer that carries a reuse instruction also varies by every credential
the platform reads** — `Cookie`, `Authorization`, `x-hook-secret`,
`x-shared-search-secret`, `x-session-id` and `x-ws-session-id` — including a
`public` answer that carried none of them. A
copy stored while a visitor was signed out has to stop matching the moment they
sign in, and a copy stored for one account has to stop matching after a switch
to another; without that the stored answer is replayed to a request the
classifier never sees. `?secret=` needs no entry: it is part of the URL, which
is already the cache key.

The downgrade is written into the execution log — and into `_meta.logs` on a
JSON answer — as a line beginning `[cache]`, so an owner who expected shared
reuse and did not get it can see exactly which signal caused it. A declaration
on a non-2xx answer is ignored the same way, with its own `[cache]` line: a
failure is never cached.

This option is for the public, credential-free case — a generated script, a
rate card, a catalogue, an embeddable widget — where the same bytes go to every
visitor.

#### Accepted request body formats

The execute endpoint parses all three common webhook body encodings into `request.body`:

| Content-Type | How it lands in `request.body` |
|---|---|
| `application/json` | Parsed JSON object |
| `application/x-www-form-urlencoded` | One key per form field |
| `multipart/form-data` | One key per **text** field; file parts under `request.body.files` |

**Multipart support (inbound email webhooks).** Email inbound-parse services post `multipart/form-data` — SendGrid Inbound Parse always does (it has no JSON mode), and Mailgun forwards multipart whenever attachments are present. Point either provider directly at a hook's execute URL and the email's fields (`from`, `subject`, `text` / `body-plain`, etc.) arrive as plain keys on `request.body`, exactly like a urlencoded post. Repeated field names become arrays.

File parts (email attachments) surface as `request.body.files`, an array of:

```json
{
  "field": "attachment1",
  "filename": "notes.pdf",
  "contentType": "application/pdf",
  "size": 48211,
  "encoding": "base64",
  "content": "JVBERi0xLjQg..."
}
```

`content` is the file's bytes base64-encoded — decode with `Buffer.from(f.content, 'base64')` if you need the raw bytes. `files` is a reserved key: a text field literally named `files` is replaced by this array.

**Multipart limits** (violations return a structured JSON error, never a silently empty body):

| Limit | Value | Error |
|---|---|---|
| Total body | 30 MB | `413 PAYLOAD_TOO_LARGE` |
| Per file part | 5 MB | `413 PART_TOO_LARGE` (includes `field`/`filename`) |
| File parts per request | 10 | `413 TOO_MANY_FILES` |
| Per text field | 2 MB | `413 FIELD_TOO_LARGE` |
| Malformed body / missing boundary | — | `400 MALFORMED_MULTIPART` |

If you expect attachments larger than 5 MB, have the sender strip or link them instead — or configure the provider to skip attachments (SendGrid: post without "Send Raw"; Mailgun: use the `forward()` action which links attachment URLs in `attachments` JSON).

#### `request.rawBody` — the exact transmitted text (signed webhooks)

Every provider that signs a webhook — Paddle, Stripe, GitHub, Lemon Squeezy,
Flutterwave — signs the **exact bytes it sent**. `request.body` is a re-parsed
object: key order and whitespace differ from the wire, so `JSON.stringify(request.body)`
produces a different string and any digest computed from it will never match the
provider's header.

`request.rawBody` is the untouched payload the caller transmitted, as a UTF-8
string. That is the single representation — there is no Buffer or byte-array
form. Hash it with [`platform.crypto.hmac()`](#platformcryptohmac-secret-payload-algorithm-encoding)
and compare with `platform.crypto.timingSafeEqual()`.

```javascript
// Paddle Billing: Paddle-Signature: ts=1738000000;h1=<hex sha256>
const header = request.headers['paddle-signature'] || '';
const ts = (header.match(/ts=([^;]+)/) || [])[1];
const h1 = (header.match(/h1=([^;]+)/) || [])[1];

if (!request.rawBody || !ts || !h1) {
  respond(400, { error: 'unsigned or unreadable request' });
} else {
  const expected = platform.crypto.hmac({
    secret: paddleSecret,                  // your Paddle notification secret
    payload: `${ts}:${request.rawBody}`,   // Paddle signs timestamp + raw body
    algorithm: 'sha256',
    encoding: 'hex',
  });
  if (!platform.crypto.timingSafeEqual(expected, h1)) {
    respond(401, { error: 'invalid signature' });
  } else {
    // request.body is still the parsed object — use it as normal from here.
    respond(200, { received: true });
  }
}
```

**`rawBody` is `null`, never `""`, whenever there is no faithful text to give.**
Branch on `null` rather than guessing:

| Situation | `request.rawBody` |
|---|---|
| JSON or urlencoded body on an execute URL | The exact transmitted text |
| The request carried **no body** (e.g. `GET`, or an empty `POST`) | `null` |
| `multipart/form-data` (email webhooks, file uploads) | `null` — file parts already arrive decoded under `request.body.files`, and the bytes are not re-buffered |
| A body that is **not valid UTF-8 text** (binary upload) | `null` — a digest over a lossy decode would be silently wrong |
| A body **larger than 2 MB** | `null` — the parse is unchanged, only retention has this ceiling |
| The function was invoked by the **platform, not an HTTP caller** — a scheduled run, `inbound-email`, a phone-agent tool call, an agent capability, a `subscription-events` delivery | `null` — there was no wire request to retain |

`request.body` is completely unaffected: it is parsed exactly as it always was,
whether or not your code reads `rawBody`.

---

## Sandbox Environment

Hook code runs in a sandboxed JavaScript environment with:

### Available Globals
- `request` — The incoming HTTP request: `{ method, path, subPath, query, body, rawBody, headers }`. `rawBody` is the exact transmitted text for signed-webhook verification, and `null` whenever there is no faithful text (see "`request.rawBody` — the exact transmitted text" above).
- `workspaceId` — The workspace UUID string (always resolved to UUID regardless of URL format used)
- `hookName` — The hook's name
- `respond(statusCode, body, options?)` — Set the response status and body (JSON-wrapped with `_meta`). **Call this to return data to the caller.** If never called, the response defaults to `{ ok: true }` with status 200. Pass `options = { cache: { maxAge, scope } }` to declare that the answer may be reused by the browser (see "Reusing an answer in the browser" above).
- `respondRaw(statusCode, body, contentType?, options?)` — Return a raw response without JSON wrapping or `_meta`. Defaults to `text/plain`. Use this when external services require a non-JSON response (e.g. Meta webhook verification expects raw `hub.challenge` echoed as plain text). Pass `options = { encoding: 'base64' }` with a base64 string body to emit **real bytes** — that's how a hook returns audio, an image, or a PDF the browser can actually play/render (see "Returning binary from a hook" below). `options.cache = { maxAge, scope }` declares that the answer may be reused by the browser (see "Reusing an answer in the browser" above).
- `fetch(url, options)` — Make HTTP requests (max **50 calls** per execution, **90s default timeout** each). Hook code has no page origin, so use the platform's full `https://...` address by default; only the workspace-authenticated payment and subscriber endpoints listed below accept a path-only URL.
- `platform` — Helper object for common platform actions (see Platform Helpers below)
- `db` — Direct access to the workspace's database tables (see Database Access below)
- `console.log/error/warn/info` — Logging (captured in `_meta.logs`)
- `JSON`, `Date`, `Math`, `parseInt`, `parseFloat`, `Array`, `Object`, `String`, `Number`, `Boolean`, `Map`, `Set`, `Promise`, `RegExp`, `Error`
- `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`
- `setTimeout` (capped at 5 minutes), `clearTimeout` — cancel a timer this hook started
- `AbortController`, `AbortSignal` — cancel your own work. Pass `controller.signal` to `fetch(url, { signal })` and calling `controller.abort()` really aborts that request. The platform fetch timeout still applies: whichever fires first wins, and neither lets the hook outlive its execution timeout.

```javascript
const controller = new AbortController();
const giveUp = setTimeout(() => controller.abort(), 5000);
try {
  const res = await fetch('https://slow.example.com/report', { signal: controller.signal });
  clearTimeout(giveUp);
  respond(200, await res.json());
} catch (err) {
  respond(504, { error: 'upstream did not answer in 5s' });
}
```

### NOT Available (Security)
- `require` / `import` — No module loading
- `process` — No access to Node.js process
- `fs` — No filesystem access
- `eval` — No nested evaluation
- `crypto` / `Buffer` / `TextEncoder` — No general-purpose crypto library, no random-number generation, no encryption or key management, and no byte-array type. Webhook signature verification is covered by `platform.crypto.hmac()` and `platform.crypto.timingSafeEqual()` (below) — a keyed hash and a constant-time comparison. **Signing with a private key IS possible and needs none of the above:** `platform.crypto.signJwt()` mints a signed JWT (RS256 for Google service accounts / Wallet, ES256 for an Apple `.p8`) and `platform.crypto.sign()` returns a raw signature, both using a key held in the workspace secret store that your code names but never sees. Never hand-write RSA in JavaScript, and never paste a private key into function source.
- The server-function **registry's own web endpoints** (`/api/workspaces/:workspaceId/hooks…`) — a running function carries no identity, so those routes answer `401 Authentication required` to it. That refusal is permanent *for the sandbox*: the same prefix also updates, deletes and publicly executes functions, so it is deliberately never credentialed for running code. It is not a claim about every caller — an **external** script holding a workspace API key with the `hooks:manage` scope is answered `200` by list, get, create and update (see "Deploying without a browser"). From inside a function, use `platform.serverFunctions.self()` / `.list()` for read-only registry state, including each function's `codeFingerprint` (see Platform Helpers).

### Timeout
Hooks have a **5-minute (300-second)** default execution timeout. If exceeded, the hook returns a 500 error.

**Configurable per-hook timeout:** Set `metadata.timeout` (in milliseconds) to override both the fetch timeout and the VM execution ceiling for that specific hook:

```
PATCH /api/workspaces/{workspaceId}/hooks/{hookId}
{ "metadata": { "timeout": 300000 } }
```

- **Default fetch timeout:** 90s (applies when no `metadata.timeout` is set)
- **Default VM ceiling:** 300s
- **With `metadata.timeout`:** both fetch timeout and VM ceiling use that value
- **Maximum:** 600000ms (10 minutes) — requests above this are capped

Use this for hooks that call slow external APIs (video analysis, AI processing, long-running scrapers).

**The platform Apify proxy waits for your run.** A call to `/api/apify/run` (or the legacy `/api/apify-actor`) is allowed the run `timeout` you send it (minutes, default 5) plus 15 seconds instead of the 90-second default, but never more than what is left of the function's execution ceiling. With the default 300-second ceiling, keep each actor run under about 4 minutes or raise `metadata.timeout`. If the request is cut off first, the actor keeps running and is still billed, and its results are lost.

When the platform's per-request limit is what stopped a `fetch`, the execution log says so: `fetch to <host/path> was aborted after <N>s by the server function's per-request limit`.

### Long-running work: one call is not a background job

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Long-running work" below. -->
**Long-running work must survive a restart.** A server-function call is not durable: a deploy or server restart ends every call in progress at once, with no error to the caller and no retry, and raising `metadata.timeout` does not change that. For anything over about a minute, store a job row, do the work in steps that each finish well inside the limit, save results after each step, keep a short lease you renew while working, and let the page call again to resume. "Recover" must read the saved results, not re-run the pipeline.
<!-- MANIFEST:END -->

A raised timeout lets one call run longer; it does not make it safe. Deploys and server restarts end every call in progress on that server immediately: the caller gets no answer, nothing retries, and the run's response is never delivered. A run that had been going for at least 20 seconds is shown in execution history as **Interrupted: the server restarted while this server function was running**; a shorter one leaves no record. Work it saved before the restart (database rows, provider results) is kept.

For work that can take more than about a minute (multi-step scraping, provider polling, batched AI review):

1. **Store a job row first** and return its id. The page polls a cheap status call; the status call never does the work itself.
2. **Do the work in bounded steps.** Each call runs one step that fits well inside the limit (aim for under 60 seconds), saves what it produced, and returns. The page, or a schedule, calls again for the next step until the job is done.
3. **Save results as you go**, keyed by the job or the signed-in user rather than by one browser tab, so a reload or another device still finds them.
4. **Use a short lease and renew it.** Mark the job running with an expiry about 60–90 seconds ahead and push it forward every time you save progress. A lapsed lease means the run died: the next call resumes from the saved results instead of waiting out a long lease or starting over.
5. **Make "recover" read what was saved.** A recovery that re-runs the pipeline discards everything the dead run already paid for; one that reads the saved rows shows it straight away.

---

## Database Access


### Calling the existing image-edit integration from a server function

`await platform.fetch('/api/generate/image-to-image', { method: 'POST',
headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) })`
resolves locally and carries the runner's signed workspace/hook context.
No customer secret is required. Only this exact media path is stamped; it is
not permission to credential other media routes or external provider hosts.
For strict GPT Image 1.5 portraits, use `fallbackPolicy: "none"`,
`quality: "medium"`, `inputFidelity: "high"`, `referenceLimit: 16`,
`size: "1024x1024"`, and `returnBase64: true`. Read `imageBase64` and `mimeType`,
not a Responses tool output. See `gemini-vision-transform/docs.md`.
Set hook `metadata.timeout: 600000` for large-reference edits (fetching
references adds time to the 180-second provider deadline).

`await platform.crypto.sha256(text)` returns a lowercase hex SHA-256 digest of
UTF-8 text, at most 65536 bytes. It shares the 100-call hashing budget with
`hmac`. Use it for capability-token hashes; the sandbox has no WebCrypto or
TextEncoder. It neither reads nor returns secrets.

Hooks have direct read/write access to the workspace's database tables via the `db` global. This is the same database that the workspace's App Studio apps and the AI agent's `db_query` tool operate on.

All `db` methods are async and automatically scoped to the current workspace — no need to pass `workspaceId`.

### Visitor ownership is conditional in hooks

A forwarded `X-Session-Id` does **not** make every hook database operation
visitor-scoped. The platform first resolves that id to a real session row in
this workspace. Only when it resolves do `db.insert`, `db.bulkInsert`, and
`db.update` add that validated `session.id` as `session_id`, and only when the
hook payload did not set `session_id` itself. Use the sandbox's validated
`session.id`; never copy the caller-supplied request header into a row yourself.

Legacy hooks still run when the header is absent, invalid, belongs to another
workspace, or the session lookup fails. In those cases `session` is `null` and
a write without an explicit `session_id` keeps an empty owner
(`session_id = NULL`). That is a **shared row**: any visitor can read it through
a shared read. The workspace DB token also ships in the published space, so
treat an ownerless row as world-readable and world-writable by anyone holding
that token. A shared row must never contain secrets, private customer data, or
anything else sensitive.

Hook reads and deletes are **never** filtered by the forwarded visitor. An
unfiltered `db.query()` reads matching rows across every visitor, and
`db.delete()` deletes exactly the rows matched by the filters you pass. For a
per-visitor list, count, quota, update, or delete, require the validated
`session` and filter explicitly:

```javascript
if (!session) {
  respond(401, { error: 'A valid workspace session is required' });
  return;
}

const mine = await db.query('app_items', {
  where: { session_id: session.id },
});

await db.delete('app_items', {
  id: request.body.id,
  session_id: session.id,
});
```

An explicit owner in the hook payload always wins. To deliberately create or
keep a shared row from a session-carrying hook, set `session_id: null`:

```javascript
await db.insert('app_catalog', {
  title: request.body.title,
  session_id: null,
});

await db.update(
  'app_catalog',
  { id: request.body.id, session_id: null },
  { title: request.body.title, session_id: null },
);
```

The explicit `session_id: null` on that update matters. With a valid visitor
session, an update patch that omits `session_id` inherits the automatic stamp
and can silently convert an existing shared row into that visitor's private
row.

### Server Functions are the trusted write path

A Server Function runs **server-side**, so its `db` writes are trusted and are
exempt from the per-table write policy that constrains browser writes.

That matters because the workspace DB token embedded in a published app bundle
is effectively **public** — anyone can extract it and replay writes. The server
therefore treats every browser write as untrusted: it verifies the caller's
claimed session against the workspace's real sessions, refuses writes that
attribute a row to another app user, refuses writes to columns the table marks
server-only, and refuses shared/unowned writes on tables that do not accept
them. Refusals come back as a structured `403` with
`code: "WRITE_POLICY_DENIED"` and the `rule` that fired.

**Rule of thumb:** money-, payment-, entitlement-, scoring- or otherwise
trust-sensitive state must be written by a Server Function, never by the app.
Mark those columns as `protectedColumns` on the table (ask Otto:
"make `paid` and `amount_cents` server-only on `app_splits`") and the client
can read them but never set them — only this code can:

```javascript
// mark-paid hook — the server decides who paid, after checking the provider.
const payment = await fetch(`https://api.example.com/v1/payments/${body.paymentId}`, {
  headers: { Authorization: `Bearer ${secrets.PAYMENT_PROVIDER_API_KEY}` },
}).then((r) => r.json());

if (payment.status !== 'succeeded') {
  respond(402, { error: 'payment_not_captured' });
} else {
  await db.update('app_splits', { id: body.splitId }, { paid: true, amount_cents: payment.amount });
  respond(200, { ok: true });
}
```

### db.query(tableName, opts?)

Read rows from a table.

```javascript
// Read the first page
const result = await db.query('subscribers');
console.log(result.rows);        // Array of row objects
console.log(result.rowCount);    // Number of rows returned

// With filtering and options
const result = await db.query('subscribers', {
  select: ['id', 'email', 'status'],
  where: { status: 'active' },
  orderBy: [{ column: 'created_at', direction: 'desc' }],
  limit: 50,
  offset: 0,
});
```

**Options:**
- `select` — Array of column names to return. Omit to return all columns.
- `where` — Either a plain object `{ column: value }` for simple equality filters, or an array of filter objects `[{ column, operator, value }]` for complex queries. Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `ILIKE`, `IN`, `IS NULL`, `IS NOT NULL`.
- `orderBy` — Array of `{ column, direction }` objects. Direction defaults to `'asc'`.
- `limit` — Max rows to return (default: 50, max: 10,000). A larger `limit` is rejected with an error naming the ceiling — it is never quietly shortened.
- `offset` — Row offset for pagination.

`db.query` returns one page. `result.truncated` is `false` only when that page completes the read. A full page with more rows has `truncated: true`.

The ops setting `hooks.database_page_cap` has modes `off`, `shadow`, and `enforce`. The default is `shadow`. Off and shadow return the existing rows and result fields. Shadow counts and logs every page that would exceed the 16 MiB byte cap without cutting it. These are operator settings, not hook options.

In enforce mode, a page also has `nextOffset`. It is the numeric offset of the next unread row, or `null` at the end. An oversized single row fails before its payload reaches the hook. Use `select` to request smaller columns.

A byte-cut page fails with an error by default. To handle partial pages, set `allowByteTruncated: true`. Such a page has `truncated: "bytes"`, `byteLimited: true`, and `nextOffset`. A row-limited page still has `truncated: true`. Advance by `nextOffset` or by the number of returned rows. A short page can still have more rows. Never advance by the requested limit after a byte cut.

```javascript
const rows = [];
let offset = 0;
while (true) {
  const page = await db.query('subscribers', {
    limit: 1000,
    offset,
    allowByteTruncated: true,
  });
  rows.push(...page.rows);
  if (page.truncated === false) break;
  offset = page.nextOffset ?? offset + page.rows.length;
}
```

This loop works in all three modes. The fallback covers off and shadow, which have no `nextOffset`. In enforce mode, offsets must be nonnegative whole numbers. An offset supplied as a numeric string is normalized to a number. If `orderBy` is absent or is an object, enforce orders pages by the primary key. Off and shadow preserve the existing order. Supply an array of ordering columns for an explicit order.

<!-- MANIFEST:NOTES -->
`db.query` returns a page. Follow `truncated` until `false`. The `hooks.database_page_cap` ops setting defaults to `shadow` and measures a 16 MiB cap without changing rows. Enforce refuses byte-cut pages unless `allowByteTruncated: true`. An opted-in cut has `truncated: "bytes"` and numeric `nextOffset`. Use `nextOffset` or advance by `rows.length`, never by the requested limit after a byte cut. Oversized rows fail in enforce. Use `select` for smaller columns.
<!-- MANIFEST:END -->

### db.insert(tableName, data)

Insert one or more rows. Pass a single object or an array of objects.

```javascript
// Insert one row
const result = await db.insert('subscribers', {
  email: 'jane@example.com',
  status: 'active',
  created_at: new Date().toISOString(),
});
console.log(result.insertedRows);  // Array of inserted rows (with auto-generated IDs)
console.log(result.count);         // Number of rows inserted

// Insert multiple rows
const result = await db.insert('orders', [
  { product_id: 1, quantity: 2, status: 'pending' },
  { product_id: 3, quantity: 1, status: 'pending' },
]);
```

### db.update(tableName, where, data)

Update matching rows. Returns the updated rows.

```javascript
// Update by simple equality
const result = await db.update('subscribers', { email: 'jane@example.com' }, {
  status: 'unsubscribed',
  updated_at: new Date().toISOString(),
});
console.log(result.count);        // Number of rows updated
console.log(result.updatedRows);  // Updated row objects

// Update with complex filter (array syntax)
const result = await db.update('orders',
  [{ column: 'status', operator: '=', value: 'pending' },
   { column: 'created_at', operator: '<', value: '2024-01-01' }],
  { status: 'expired' }
);
```

### Writing to `json` columns (db.insert / db.update)

A `json` column is stored as PostgreSQL JSONB. Pass a plain JavaScript object
or array directly as the value — do **not** `JSON.stringify` it first. This
matches the browser SDK (`window.__workspaceDb`): both write paths accept
native objects and arrays, including an empty array `[]`, and reads return
the parsed object/array, not a string.

```javascript
await db.insert('orders', {
  customer_name: 'Alice',
  line_items: [{ sku: 'A1', qty: 2 }],   // json column: pass the array directly
  metadata: { source: 'webhook' },       // objects work the same way
  tags: [],                              // [] round-trips as [], not {}
});

await db.update('orders', { id: request.body.id }, {
  line_items: [{ sku: 'B2', qty: 1 }],   // native arrays work in updates too
});
```

A string value is accepted only when it is itself valid JSON text — code that
already calls `JSON.stringify(...)` keeps working and is **not**
double-encoded, but the manual stringify workaround is no longer required. A
malformed JSON string makes the write fail. Ordinary text and PostgreSQL
array columns are unaffected by this rule.

### db.delete(tableName, where)

Delete matching rows.

```javascript
const result = await db.delete('subscribers', { status: 'bounced' });
console.log(result.deletedCount);  // Number of rows deleted
```

### db.rawQuery(sql, params?)

Run one raw SQL `SELECT`, `WITH` (CTE), or `EXPLAIN` query against the workspace database. Use `$1`, `$2`, etc. for parameterized values.

**This is the supported way to merge several lookups into one round trip.** A hook that runs four `db.query()` calls in sequence pays four round trips; one `db.rawQuery` with a `JOIN`, a `UNION ALL`, or a `WITH` (CTE) block answers all of them in a single trip and is usually several times faster end to end:

```javascript
// Four sequential reads → one merged read
const merged = await db.rawQuery(`
  WITH recent_orders AS (
    SELECT id, email, total FROM app_orders WHERE created_at > $1
  )
  SELECT 'order' AS kind, id, email, total FROM recent_orders
  UNION ALL
  SELECT 'subscriber', id, email, NULL FROM app_subscribers WHERE status = 'active'
`, ['2024-01-01']);
```

**Raw SQL needs the PHYSICAL table name.** The other `db.*` helpers take the logical name and resolve it for you — `db.query('orders')` reads the `app_orders` table. `db.rawQuery` hands your SQL to Postgres verbatim, so `FROM orders` fails with `relation "orders" does not exist`. The physical name is `<module>_<tableName>`, and `module` is `app` unless the table was created under another module:

```javascript
const tables = await db.listTables();
tables.forEach(t => console.log(`${t.module}_${t.tableName}`));  // app_orders, app_subscribers, ...
```

```javascript
const result = await db.rawQuery(
  'SELECT email, COUNT(*) as order_count FROM app_orders GROUP BY email ORDER BY order_count DESC LIMIT 10',
);
console.log(result.rows);

// With parameters
const result = await db.rawQuery(
  'SELECT * FROM app_subscribers WHERE created_at > $1 AND status = $2',
  ['2024-01-01', 'active']
);
```

Leave table names unqualified — they resolve inside this workspace's own schema, and a reference to another workspace's schema is rejected. Queries are read-only: `SELECT`, `WITH` (CTE), and `EXPLAIN` only, one statement per call.

PostgreSQL double-quoted identifiers are supported and remain case-sensitive. Unquoted identifiers fold to lower case. For example, `"OrderItems"` and `orderitems` are different names.

**Catalog reads are scoped to your workspace.** Supported catalog relations such as `pg_attribute`, `pg_class`, `pg_indexes`, `information_schema.columns`, and `information_schema.tables` return only this workspace's objects. Catalog metadata functions, session mutation, and all workspace-defined functions are rejected.

Workspace data relations must be base or partitioned tables. Normal views, materialized views, foreign tables, sequences, and other relation kinds are rejected before execution.

Table columns must use PostgreSQL built-in data types from `pg_catalog`. Workspace-defined types are rejected.

Functions are limited to `avg`, `count`, `current_schema`, `generate_series`, `length`, `max`, `min`, `pg_size_pretty`, `pg_typeof`, `sum`, and `to_jsonb`. They resolve from `pg_catalog` under a fixed search path. Workspace-defined functions are not supported. Schema-qualified non-built-in functions, overload shadows, security-definer functions, and functions granted after role setup are also rejected.

**There is no per-call ceiling on the number of operations in a query.** One `db.rawQuery` call counts as **one** database operation no matter how many tables, UNION branches, joins, or CTEs it touches, so batching work into a single statement lowers your usage rather than risking a limit. The only two limits that apply are the rows returned per read and the operations allowed per hour, both described next.

Data-changing CTEs (`INSERT`, `UPDATE`, `DELETE`, or `MERGE` inside `WITH`, including `EXPLAIN WITH`) are rejected with `RAW_QUERY_RESTRICTED`.

The database returns at most 10,000 rows in one call. Check `result.truncated`; when it is `true`, page the rest with `OFFSET`, add a narrower filter, or use a smaller `LIMIT`.

Database operations are counted per workspace per UTC hour: by default 5,000 for agent, server-function and dashboard queries and 25,000 for the published app's data API. Going over returns HTTP 429 with `code: "RATE_LIMIT_EXCEEDED"`. That response's `error` field is written for whoever is looking at the app — it says the app is temporarily over its hourly database allowance and when it starts working again — so show it (or `userMessage`, which is identical) rather than a generic failure message. `resetsAt` and `retryAfterSeconds` carry the same facts as fields. Founders can see the current hour's usage and ask for a higher allowance in the workspace Developer window (Database allowance).

### db.listTables()

List all tables in the workspace database.

```javascript
const tables = await db.listTables();
tables.forEach(t => console.log(t.tableName, t.rowCount));
```

### Complete Example: Sync webhook data to DB

```javascript
const event = request.body;

if (event.type === 'checkout.session.completed') {
  const session = event.data.object;

  // Check if order already exists
  const existing = await db.query('orders', {
    where: { stripe_session_id: session.id },
    limit: 1,
  });

  if (existing.rowCount === 0) {
    await db.insert('orders', {
      stripe_session_id: session.id,
      customer_email: session.customer_details?.email,
      amount_total: session.amount_total,
      currency: session.currency,
      status: 'paid',
      created_at: new Date().toISOString(),
    });

    await platform.postAgentMessage({
      message: `New order received! ${session.customer_details?.email} paid $${(session.amount_total / 100).toFixed(2)}`,
    });
  }
}

respond(200, { received: true });
```

---

## fetch (HTTP Requests)

Hooks can make outbound HTTP requests using the standard `fetch` API:

```javascript
const response = await fetch('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
});
const data = await response.json();
console.log('API response:', data);
respond(200, { result: data });
```

**Limits:**
- Maximum **50 fetch calls** per hook execution
- Each fetch has a **90-second default timeout** (override with `metadata.timeout` — see Timeout section)
- External services and ordinary platform endpoints require a full `https://...` address. Hook code has no page origin, so relative URLs (including path-relative, root path-only, and protocol-relative forms) fail before any request is sent, and broad `try/catch` code may reduce that to an "unknown error".
- Deliberate root path-only exceptions: `/api/payments/capture`, `/api/payments/cancel-hold`, `/api/payments/refund` (including their legacy `/api/sdk/payments/...` aliases), and `/api/crm/subscribers/...`. The platform resolves and authenticates those endpoints for the workspace.

---

## Platform Helpers

The `platform` object provides convenience methods for common workspace actions. These are pre-scoped to the current workspace — no need to pass `workspaceId`.

### platform.postAgentMessage({ message, destination?, ... })

Post a message into a conversation. **There are two different conversations, and choosing the wrong one is the single most common reason a scheduled automation reports success while nobody ever sees its message.** Pick with `destination`:

| `destination` | Where it lands | Who sees it |
|---------------|----------------|-------------|
| `'space_chat'` *(default)* | The **space chat** for a workspace session (`workspace_session_messages`) | A **visitor/customer** who has that space conversation open. The desktop workspace does **not** render this surface, so the workspace owner will not see it there. |
| `'founder_chat'` | The **founder's own Otto conversation** (My Plan) in the desktop workspace | The **workspace owner**, live, in the chat they actually use every day. |

**Rule of thumb: if the message is addressed to the founder/owner — a nightly digest, an alert, "your job finished" — use `destination: 'founder_chat'`. If it is addressed to a customer in a space conversation, keep the default.**

The default is unchanged and stays the default: omitting `destination` behaves exactly as it always has.

---

#### `destination: 'founder_chat'` — message the workspace owner

```javascript
const result = await platform.postAgentMessage({
  message: "Good morning! Today's digest: 5 new race entries, 2 pending payments.",
  destination: 'founder_chat',
});
// result = {
//   success: true,
//   destination: 'founder_chat',
//   messageId: 41502,
//   planThreadId: 'a1b2c3d4-…',
//   planThreadTitle: 'Daily Race Digest',
//   conversationCreated: false,
//   dedupeKey: 'hook:daily-race-digest:2026-09-11T01:10:00.000Z',
//   duplicate: false,
//   deliveredTo: 'Delivered to the founder\'s Otto chat (My Plan) in this workspace — conversation "Daily Race Digest" (plan thread a1b2c3d4-…).'
// }
```

- The message appears in the founder's workspace **live**, with no reload.
- **One conversation per automation.** Every run of the same server function reuses the same conversation, named after the function (`daily-race-digest` → "Daily Race Digest"), so a nightly job appends to one ongoing thread instead of creating a new entry every night. `conversationCreated` is `true` only on the very first run. If the founder archives that conversation, the next run visibly starts a fresh one.
- **A retried run does not post twice.** Delivery is idempotent on the automation plus the occurrence it is running for. A scheduled run carries its occurrence automatically; a retry of the same occurrence returns `duplicate: true` and adds nothing. Pass `occurrenceKey` to supply your own identity (e.g. an order id) when the natural unit of work is not the schedule tick. Without any occurrence at all, the message text plus the UTC date is used, so an identical repeat on the same day is suppressed while different text still posts.
- `contextType`, `contextId`, `sessionId` and `threadId` do not apply to this destination — the founder's conversation is resolved from the workspace.

**Do not** send both destinations "to be safe". Mirroring a daily automation into both surfaces is how founders end up with duplicate notifications.

---

#### `destination: 'space_chat'` (default) — message a space visitor

Full signature: `platform.postAgentMessage({ message, contextType?, contextId?, sessionId?, threadId? })`

The message is **persisted** to `workspace_session_messages` and **broadcast** on the session WebSocket so a visitor who has that conversation open sees it live. It does **not** appear in Otto / My Plan.

```javascript
await platform.postAgentMessage({
  message: "Good morning! Here's your daily summary: 5 new contacts, 2 pending tasks.",
});
respond(200, { sent: true });
```

**Targeting a specific user's session and conversation:**
```javascript
const result = await platform.postAgentMessage({
  message: "Hello! Just checking in...",
  contextType: 'space',
  sessionId: 'wses_41502c7d…',
  threadId: 'main',
});
// result = { success: true, destination: 'space_chat', messageId: 881234, sessionId: 'wses_41502c7d…', threadId: 'main', storedThreadId: null, deliveredTo: 'Delivered to the space chat for session wses_41502c7d… — conversation "main". …' }
```

- `message` — Required. The text message to post.
- `contextType` — Optional. Defaults to `'space'` (not `'workspace'`). Can be `'workspace'`, `'space'`, or `'landing_page'`. When `sessionId` is provided this is stored on the row only — it does **not** change which session the message is written to.
- `contextId` — Optional. Defaults to the current workspace UUID.
- `sessionId` — Optional. A `wses_…` id or session UUID. When provided, the message goes into that session. When omitted, defaults to the workspace owner's session for `contextType` + `contextId`.
- `threadId` — Optional. Which **conversation** inside that session to write to.
  - `"main"` (or omitted) is the primary conversation. It is stored as `thread_id = NULL` so it matches every pre-thread row and `GET /chat/history?threadId=main`.
  - `"main"` is **not** "whatever conversation the visitor currently has open". After someone starts another conversation (`t_…`), that sidebar thread is a different id. Posting to `"main"` while they are looking at `t_…` succeeds and is invisible on the open thread.
  - A `t_…` (or any `[A-Za-z0-9_-]{1,64}`) id writes into that conversation. List ids with `GET /api/space/{spaceId}/chat/threads?sessionId=wses_…`.
  - A malformed `threadId` **throws**. The call does not return `{ success: true }` and does not silently fall back to `main`.

The return value always names the delivery location: `{ success, destination, messageId, sessionId, threadId, storedThreadId, deliveredTo }`. `threadId` is the public id (`"main"` or `t_…`). `storedThreadId` is `null` for the primary conversation (the column value) and the same string otherwise.

---

#### "It said success but I can't find it"

Read **`deliveredTo`** on the return value. Both destinations return it, in plain words, and a dry run returns the same sentence prefixed with `Dry run — would deliver…` naming the conversation the live run would use. If it says *space chat*, that is the visitor surface and the workspace owner will not see it in their desktop workspace — re-send with `destination: 'founder_chat'`. An unrecognised `destination` **throws**; it never silently falls back.

### platform.getChatHistory({ sessionId, limit?, excludeSystem?, threadId? })

Retrieve chat messages from a specific user's session. Returns messages in chronological order. By default, system messages (like `[SYSTEM:...]` prefixed messages and JSON blobs) are filtered out so you get only human-readable conversation content.

```javascript
const history = await platform.getChatHistory({
  sessionId: 'wses_41502c7d…',
  threadId: 'main',
  limit: 30,
});
// Returns: { messages: [{ role: 'user'|'assistant', content: '...', createdAt: '...', threadId: 'main' }] }

const lastUserMessage = history.messages.filter(m => m.role === 'user').pop();
console.log('Last thing the user said:', lastUserMessage?.content);
```

- `sessionId` — Required. A `wses_…` id or session UUID to read messages from.
- `limit` — Optional. Maximum number of messages to return. Defaults to 50.
- `excludeSystem` — Optional. Defaults to `true`. When true, filters out `[SYSTEM:...]` messages and raw JSON blobs, returning only readable conversation content.
- `threadId` — Optional. When set (including `"main"`), only that conversation is returned. Omit it to read every thread in the session (v3-compatible). Each message includes its public `threadId` (`"main"` when the stored column is NULL).

### platform.generateText({ userPrompt | messages, systemPrompt?, model?, maxTokens?, reasoningEffort?, temperature?, jsonMode? })

Call an AI model from inside the hook — a single prompt, a multi-turn conversation, or structured JSON. No API key needed; the platform supplies the credentials. For new or regenerated hooks, choose the tier at build time by **whether a person is waiting on the result**: a hook that answers a live request runs `model: 'gpt-6.1-sol'` at `reasoningEffort: 'medium'` (the default — interactive); a hook that runs on a schedule, a webhook, or a batch runs `gpt-6.1-sol` at `'high'` (`'xhigh'` when the output is consequential); only a hook on the hot path of every keystroke runs `model: 'gpt-6-luna'` with `reasoningEffort: 'none'`. Do not omit `model` in new or regenerated hooks: omission exists only so already-deployed hooks retain their historical runtime behavior.

For GPT-5, GPT-6 and o-series models, the helper sends `maxTokens` as `max_completion_tokens`. `gpt-6-luna` (and legacy `gpt-5.6-terra`) calls send `reasoning_effort: 'none'` unless you pass `reasoningEffort`; every other model keeps its own default reasoning effort (`medium` for `gpt-6.1-sol` and `gpt-5.6-sol`) unless you pass one. `gpt-6.1-sol` never accepts `'none'` — a request for it is sent as `'low'`.

> **⚠️ Output is capped at 1000 tokens unless you say otherwise** (roughly 700 words; **6000 on `gpt-6*` models**, which cannot run without reasoning). When a response runs past the cap the model simply stops mid-sentence: long summaries end abruptly, and JSON comes back unclosed so `JSON.parse(result.text)` throws `Unexpected end of JSON input`. Pass a larger `maxTokens` for anything long, and check `result.truncated` before parsing.

> **⚠️ Reasoning-capable models spend that same cap *before* writing anything.**
> `gpt-5*`, `gpt-6*` and o-series models (so `gpt-6.1-sol` at every effort,
> and any GPT-5 tier you select for multi-step reasoning)
> bill their internal reasoning against `maxTokens`, and they spend it first.
> A cap below the model's reasoning need therefore does **not** come back
> half-written — it comes back **empty**: `text: ''` with `truncated: true` and
> `finishReason: 'length'`, which reads like "the model returned nothing" and
> sends authors hunting for a prompt or credential fault.
> `result.reasoningTokens` says how much of the allowance went to reasoning, and
> this case logs its own distinct **`returned NO TEXT`** warning into
> `_meta.logs` (an ordinary mid-sentence cut-off logs `was TRUNCATED` instead).
> Size `maxTokens` as the reasoning cost **plus** the output length you expect —
> background work at `'high'`/`'xhigh'` wants 16000 — or, when the task does
> not need step-by-step reasoning, use `gpt-6-luna` with
> `reasoningEffort: 'none'` so the whole allowance goes to the answer.

AI calls also use a durable rolling spend budget. The default 24-hour limits
are 50,000 accounted tokens per verified workspace session and 500,000 per
workspace. Before calling the provider, the platform reserves a conservative
input/output estimate; after a successful call it persists the provider's
actual token usage. A failed provider call releases its reservation. Request
rate limits and these token budgets are separate and both remain enforced.

When admission would exceed either limit, the provider is not called and the
whole hook returns HTTP 429 with `HOOK_AI_BUDGET_EXCEEDED` diagnostics such as
`Session AI budget exceeded for the rolling accounting window ... Nothing was
spent for this request.` This budget failure is intentionally not reduced to a
normal `{ text: '', error }` provider result.

**Long-running generation opt-in (owner/admin only).** A workspace owner,
workspace admin, or Audos admin can raise one registered hook's rolling
session/workspace allowance through the dedicated management endpoint:

```http
PUT /api/workspaces/{workspaceId}/hooks/{hookId}/ai-budget
Content-Type: application/json

{ "tokenBudget": 750000 }
```

The maximum owner-configurable allowance is **1,000,000 tokens**. Send
`{ "tokenBudget": null }` to remove the opt-in and restore platform defaults.
The response reports the effective session/workspace limits and accounting
window.

This is a trusted management setting, not a hook parameter:

- public execute payloads and `platform.generateText()` options cannot raise it;
- hook code cannot change it;
- generic hook create/update metadata cannot add, alter, or remove it;
- delegated/agent server-function editing tools cannot set it;
- a stored oversized value is defensively clamped to the platform ceiling.

Only use the opt-in for a reviewed hook that legitimately performs many AI
calls (for example, assembling a long document from many sections). The normal
defaults remain unchanged for every other hook, and all usage still lands in
the same durable session/workspace accounting ledger.

**Simple prompt (interactive — a person is waiting on the response):**
```javascript
const result = await platform.generateText({
  userPrompt: 'Summarize this in 2 sentences: ' + longText,
  model: 'gpt-6.1-sol',
  reasoningEffort: 'medium',
  maxTokens: 6000,
});
console.log('Summary:', result.text);
respond(200, { summary: result.text });
```

**Multi-turn conversation (messages array):**
```javascript
const result = await platform.generateText({
  systemPrompt: 'You are a helpful business assistant.',
  model: 'gpt-6.1-sol',
  reasoningEffort: 'medium',
  maxTokens: 6000,
  messages: [
    { role: 'user', content: 'I sell handmade candles.' },
    { role: 'assistant', content: 'Lovely! Which scents sell best?' },
    { role: 'user', content: 'Lavender and vanilla. Write me a product description.' },
  ],
});
respond(200, { description: result.text });
```

**Structured output (JSON mode, background — nobody is waiting live) — raise the cap and check for truncation:**
```javascript
const result = await platform.generateText({
  model: 'gpt-6.1-sol',
  reasoningEffort: 'high',
  systemPrompt: 'Extract the CV as JSON with keys: name, email, roles[].',
  userPrompt: cvText,
  jsonMode: true,
  maxTokens: 16000,   // reasoning + a long JSON document need far more than the default
});

if (result.error) {
  respond(502, { error: result.error });
} else if (result.truncated) {
  // Cut off at result.maxTokens — the JSON is unclosed, so parsing it would throw.
  respond(502, { error: `Response truncated at ${result.maxTokens} tokens; retry with a larger maxTokens.` });
} else {
  respond(200, JSON.parse(result.text));
}
```

**Instant tier (a person is waiting on every keystroke) — no reasoning overhead:**
```javascript
const result = await platform.generateText({
  model: 'gpt-6-luna',
  reasoningEffort: 'none',   // no hidden reasoning: the whole cap goes to the answer
  systemPrompt: 'Suggest up to 3 tags for this note. Return a JSON array of strings.',
  userPrompt: noteText,
  jsonMode: true,
  maxTokens: 2000,
});
```

**Parameters:**
- `userPrompt` — The main prompt. Use this **or** `messages`; a call with neither comes back as an error result.
- `messages` — Array of `{ role, content }` for multi-turn conversations. Roles: `user`, `assistant`, `system`.
- `systemPrompt` (alias: `system`) — Optional. Sets the AI's behaviour. Works with both `userPrompt` and `messages`.
- `model` — Optional only for runtime compatibility with already-deployed hooks. New or regenerated hooks must select a tier explicitly: `gpt-6.1-sol` for anything a person watches or that runs in the background (the reasoning effort sets the tier), or `gpt-6-luna` for keystroke-latency work.
- `maxTokens` (alias: `max_tokens`) — Optional. **Maximum tokens in the response. Defaults to 1000** (6000 when `model` is a `gpt-6*` model, which bills reasoning against the cap). The platform adds no ceiling of its own — the value goes straight to the model, so that model's own completion limit is the real maximum. Ask for more than the model allows and the provider rejects the call: you get `{ text: '', error: '...max_tokens...' }` back, never a silently clamped response.
- `reasoningEffort` (alias: `reasoning_effort`) — Optional. How much the model reasons before it answers: `'none'`, `'minimal'`, `'low'`, `'medium'`, `'high'`, or `'xhigh'`. Reasoning tokens count against `maxTokens` and add latency. Set it by whether a person is waiting: `'medium'` when they watch the response, `'high'` (or `'xhigh'`) when nobody is waiting live, and `'none'` on `gpt-6-luna` when they wait on every keystroke. Omit it to keep the default: `'none'` on `gpt-6-luna` and `gpt-5.6-terra`, the model's own default (`'medium'` on `gpt-6.1-sol` and `gpt-5.6-sol`) everywhere else. See "Reasoning effort by model" below for what each model accepts.
- `temperature` — Optional. Compatible legacy requests default to 0.7 when omitted, and an explicit value overrides that default. It is not sent for GPT-5 / GPT-6 / o-series models, so new call sites should omit it.
- `jsonMode` — Optional. When `true`, forces the response to be valid JSON. It does **not** protect against truncation — an unfinished JSON document is still unparseable.

**Reasoning effort by model:**

| Model | Accepted values | Sent instead of an unaccepted value |
|-------|-----------------|-------------------------------------|
| `gpt-6.1-sol` | `low`, `medium`, `high`, `xhigh` | `none` → `low`, `minimal` → `low` |
| `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.2` | `none`, `low`, `medium`, `high`, `xhigh` | `minimal` → `none` |
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `minimal`, `low`, `medium`, `high` | `none` → `minimal`, `xhigh` → `high` |

Dated snapshots (for example `gpt-5-mini-2025-08-07`) follow their base model. A substituted value logs a `sent reasoning_effort "…" instead of "…"` warning into `_meta.logs`. On any other model — including an omitted `model`, which runs `gpt-4o-mini` — and for a value outside the list above, the option is **ignored**: the request goes out exactly as if you had not passed it, and a `platform.generateText() ignored …` warning naming the option and the reason appears in `_meta.logs`. A reasoning-effort value never makes the call fail.

**Returns:**
```json
{
  "text": "The generated text response...",
  "model": "gpt-6.1-sol",
  "usage": {
    "promptTokens": 25,
    "completionTokens": 80,
    "totalTokens": 105,
    "cachedTokens": 0,
    "prompt_tokens": 25,
    "completion_tokens": 80,
    "cached_tokens": 0
  },
  "finishReason": "stop",
  "truncated": false,
  "maxTokens": 6000,
  "reasoningTokens": 412
}
```

- `text` — The generated text. `''` when the call failed.
- `model` — The exact model version that answered.
- `usage` — Token counts (`promptTokens`, `completionTokens`, `totalTokens`, `cachedTokens`), or `null` when the provider did not report them. The same numbers are also present as `prompt_tokens`, `completion_tokens`, and `cached_tokens`. `cachedTokens` is the provider-reported prompt-cache read count; it is omitted when the provider did not report it.
- `finishReason` — Why the model stopped: `stop` (finished normally), `length` (hit the cap), `content_filter`, …
- `truncated` — `true` when `finishReason` is `length`, i.e. the output was cut off at `maxTokens` and `text` is incomplete. A truncated call also logs a warning naming the cap, which shows up in the execution response's `_meta.logs`. On a reasoning model `truncated: true` can arrive with an **empty** `text` — the cap was consumed by reasoning before any output — and that case logs its own distinct `returned NO TEXT` warning instead of the `was TRUNCATED` one.
- `maxTokens` — The cap that was applied to this call (1000 unless you passed one; 6000 on `gpt-6*` models).
- `reasoningTokens` — Reasoning tokens the model billed against `maxTokens` before emitting any visible text (`gpt-5*` / `gpt-6*` / o-series). `null` when the provider did not report them, which is every non-reasoning model. When `truncated` is `true` and `text` is `''`, this is where the whole allowance went — raise `maxTokens` past it.

**On provider/request-shape failure** the helper returns the same shape with an `error` string so the hook can decide what to do:
```json
{
  "text": "",
  "error": "400 Unsupported value: 'max_tokens' is not supported with this model",
  "model": null,
  "usage": null,
  "finishReason": null,
  "truncated": false,
  "maxTokens": 1000,
  "reasoningTokens": null
}
```

Spend-budget admission failures are the exception: they stop the hook with HTTP
429 before any provider spend, as described above.

Always check `result.error` — and, for long or structured output, `result.truncated` — before using `result.text`. Treat `truncated: true` with an empty `text` as the reasoning-cap case above, not as a provider failure.


### platform.sendEmail({ to, subject, text?, html?, scheduledAt?, attachments? })

Send an email using the workspace's email system — immediately, or at a future
moment with `scheduledAt` (see **Scheduling an email for later** below).

Supply `text`, `html`, or both. An HTML-only email is fine for both immediate
and scheduled sends.

```javascript
await platform.sendEmail({
  to: 'user@example.com',
  subject: 'Your daily report',
  text: 'Here is your report...',
  html: '<h1>Daily Report</h1><p>Here is your report...</p>',
});
respond(200, { emailSent: true });
```

**Inline attachments.** Attachments use a JSON-safe, bounded base64 shape. The
helper decodes the bytes in memory and passes them to the existing workspace
mail transport:

```javascript
// reportBase64 may come from an inbound multipart file, a bounded binary
// secretsProxy response, or a caller that encoded the bytes before invoking
// the hook. The email helper validates and decodes it server-side.
const reportBase64 = request.body.reportBase64;
await platform.sendEmail({
  to: 'user@example.com',
  subject: 'Your report',
  text: 'The CSV report is attached.',
  attachments: [{
    filename: 'report.csv',
    contentType: 'text/csv',
    encoding: 'base64',
    content: reportBase64,
  }],
});
```

Hook code does not have filesystem access. `attachments` accepts only an array
of objects with exactly these fields:

- `filename` — Required plain filename, at most 255 UTF-8 bytes. Path
  separators, `.` / `..`, NUL, and control characters are rejected.
- `contentType` — Required MIME type such as `application/pdf` or `text/csv`.
- `encoding` — Required and must be exactly `"base64"`.
- `content` — Required standard padded base64 string containing the file bytes.

Limits are **10 attachments**, **5 MiB per file (5,242,880 decoded bytes)**, and
**10 MiB total (10,485,760 decoded bytes)** per email. Every field, base64
payload, filename, and limit is validated before mail is sent. Invalid input
throws a clear hook execution error and is also recorded in the hook logs; it
is never truncated or silently dropped. Dry-run tests apply the same
validation without retaining attachment content in intercepted-action logs.

Local paths, `file:` URLs, remote URLs, and unknown fields such as `path`,
`url`, or `data` are not accepted, and this helper never fetches attachment
content. Fetch bytes through an already-authorized bounded platform integration
when appropriate, then pass its base64 body explicitly. When forwarding an
inbound multipart file from `request.body.files`, select only the four allowed
fields because inbound entries also contain `field` and `size`:

```javascript
const attachments = (request.body.files || []).map((file) => ({
  filename: file.filename,
  contentType: file.contentType,
  encoding: 'base64',
  content: file.content,
}));
```

Use the plural `attachments`; the singular Mailgun-style `attachment` argument
is rejected. Attachments are immediate-send only: combining `attachments` with
`scheduledAt` is rejected rather than scheduling an email without its files —
schedule a server function that sends the attachment instead. Existing
text/HTML calls that omit `attachments` behave unchanged.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Inline attachments" above. -->
**Email attachments:** `platform.sendEmail({ ..., attachments })` accepts up to
10 inline files as `{ filename, contentType, encoding: "base64", content }`,
limited to 5 MiB per file and 10 MiB total. Paths, URLs, malformed base64,
traversal filenames, unknown fields, and scheduled attachments are rejected
explicitly; see the full `server-functions` docs.
<!-- MANIFEST:END -->

### platform.createSignInLink({ email | sessionId })

Mint a sign-in link for one of **your own customers** and put it in the email you
send them. Someone who taps it on a phone opens your space already signed in —
on your own branded address when your custom domain is verified — instead of
landing on the signed-out sign-in form. (A phone mail app opens links in its own
browser with empty storage, so a plain space link cannot tell who arrived.)

```javascript
const signIn = await platform.createSignInLink({ email: 'ada@example.com' });
const url = signIn ? signIn.link : 'https://audos.com/site/294861';

await platform.sendEmail({
  to: 'ada@example.com',
  subject: 'Someone waved at your family',
  text: 'See the wave: ' + url,
  html: '<a href="' + url + '">See the wave</a>',
});
```

- `email` — the recipient. Must already be a customer of this workspace (a CRM
  contact or an existing space session). Pass `sessionId` instead when you
  already have the customer's session.
- If you pass `sessionId`, the link belongs to that session's own customer. An
  `email` that disagrees with the session is refused (`null`) — a link signs in
  whoever the session belongs to, so the two must name the same person.
- Returns `{ link, email, expiresAt }`, or **`null`** when the address is not a
  known customer of this workspace — a sign-in link is never minted for a
  stranger. Always keep a plain fallback URL for the `null` case.
- The link is valid for 24 hours and a handful of taps. After that the visitor
  lands on your space's normal sign-in page with a short explanation, never a
  dead-end error.
- Only email it to the person it was minted for. It signs in whoever opens it.

### platform.getContacts({ limit?, offset?, tag? })

Retrieve contacts from the workspace CRM.

```javascript
const result = await platform.getContacts({ limit: 10, tag: 'vip' });
console.log(`Found ${result.contacts?.length} VIP contacts`);
respond(200, { contacts: result.contacts });
```

### platform.createContact({ email, name?, phone?, source?, tags?, upsert? })

Add a contact to this execution's workspace CRM. `upsert: true` reuses the
normalized email instead of returning a duplicate error. `source` sets a new
contact's acquisition source; upsert preserves existing acquisition attribution.
Use an additive tag such as `source:my-campaign` to show later campaign
participation in Relationships. Tags can trigger configured automations.
Check `result.success` and `result.contact.id` before reporting a saved signup.
Failures (including tag-save failures) are not successful capture; retry using
upsert. Never put management credentials in a browser form.

```javascript
await platform.createContact({
  email: 'newuser@example.com',
  name: 'Jane Doe',
  tags: ['lead', 'website'],
});
respond(200, { created: true });
```

### platform.serverFunctions.self() / platform.serverFunctions.list()

Read the registered state of this workspace's server functions — **including the
ones that have never run**, which no execution log can show you (a function that
never ran has no execution rows). This is the supported way for a watchdog
function to check on itself and its siblings.

Both calls take no arguments. The workspace is the one the platform already
resolved for this execution, so there is no parameter through which a function
can point the lookup at another workspace.

```javascript
const me = await platform.serverFunctions.self();
const all = await platform.serverFunctions.list();

const suspicious = all.filter(fn => !fn.hasEverRun || fn.lastError || !fn.enabled);
respond(200, {
  me: me?.name,
  checked: all.length,
  suspicious: suspicious.map(fn => ({
    name: fn.name,
    neverRan: !fn.hasEverRun,
    status: fn.status,
    lastError: fn.lastError,
  })),
});
```

Every record has exactly these fields, and nothing else:

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Registry id of the function |
| `name` | string | Registered name (the last segment of its execute URL) |
| `description` | string \| null | The description registered with it |
| `enabled` | boolean | Whether it is switched on and will answer calls |
| `status` | `"enabled"` \| `"disabled_by_owner"` \| `"disabled_by_platform"` \| `"disabled"` | Published-state status |
| `statusReason` | string \| null | Owner-facing sentence explaining a disabled status |
| `codeUpdatedAt` | ISO string \| null | When the **code** last changed (not moved by bookkeeping writes) |
| `lastExecutedAt` | ISO string \| null | When it last ran — `null` means it has **never** run |
| `executionCount` | number | How many times it has run (`0` for a function that never ran) |
| `hasEverRun` | boolean | `false` for a function that has never run once |
| `lastError` | string \| null | Last recorded error — redacted and capped at 500 characters |
| `createdAt` | ISO string \| null | When it was registered |
| `codeFingerprint` | string | sha256 of the registered source's UTF-8 bytes, lowercase hex. Covers the code and nothing else — a description or `enabled` change does not move it. Identical to the value the management endpoints and the `workspace_server_functions` agent tool report for the same function. |

**Source code and hook secrets are never returned, in any shape.** The fields
above are selected explicitly, so nothing else can appear here later by default.

`self()` returns `null` when the running function is not registered under its
own name; `list()` returns `[]` for a workspace with no server functions.

**Limits.** Up to **20 registry reads per execution**, a separate budget from
the 50-call `fetch` ceiling. Exceeding it throws — read once and reuse the
result instead of calling inside a loop. A dry run (test) returns the same real
data a live call does.

**Read-only, by design.** `platform.serverFunctions` cannot create, update,
enable, disable, delete, redeploy or invoke a function. Those method names exist
and **throw a stated error** rather than silently doing nothing: the request for
write access from inside a running function is still open and is blocked on
scoped, expiring, single-use, audited capabilities being built first. Make
changes from the workspace dashboard or ask Otto to manage the function.

**Do not call the registry's own web endpoints from a server function.**
`GET /api/workspaces/:workspaceId/hooks` — and every other
`/api/workspaces/:workspaceId/hooks…` route — answers
`401 Authentication required` to a server function. A running function carries
no identity of its own, and that same route prefix also updates, deletes and
publicly executes functions, so it is deliberately never credentialed for the
sandbox. That is permanent. `platform.serverFunctions` is the replacement, and
it is the only registry access a server function gets.

That `401` is about the *sandbox*, not about the endpoint. The same routes
answer `200` to an **external** caller holding a workspace API key with the
`hooks:manage` scope — that is the supported headless path for a deploy script
or a scheduled job outside the platform (see "Deploying without a browser"). If
your function detects drift and you want it repaired automatically, have it
report the mismatch (compare `codeFingerprint` with the sha256 of the bytes you
expect) and let the external script or an agent do the write.

**Write the comparison against `codeFingerprint`, not a source path.** The
registry holds no source path and no source hash: a function's registered bytes
are frequently a bundle a toolchain composed, so a same-named file in the space
tree is not evidence of anything and the platform will never deploy from one.

**Kill switch.** The platform can withdraw this capability with the
`HOOK_REGISTRY_VIEW_ENABLED` environment switch (default: on). While it is off,
both calls throw a message saying exactly that.

### platform.privateFiles.store() / .read() / .thumbnail() / .link()

Store a file in the workspace's **private** file store, read it back, create a
lightweight image thumbnail, and mint a temporary link for a customer — without
a key, a token, or an HTTP call.

This is the only way an app can put a file in private storage. The public upload
routes (`/api/upload/file`, `/api/upload/image`) authorize the workspace named in
the *request*, which page JavaScript cannot prove, so a `private: true` upload
sent straight from a browser answers `401 Authentication required` by design. A
visitor's browser likewise cannot read a private file, even holding
`window.__workspaceDb.token`. Route the upload through a server function
instead: the page posts the file to your function, and the function stores it.

The workspace is the one the platform already resolved for this execution —
there is no argument through which a function can name another workspace, and a
key belonging to another workspace is refused with `File not found`, the same
words as a key that never existed.

```javascript
// 1. Store — base64 bytes (or a data: URL) in `data`, or UTF-8 in `text`.
const stored = await platform.privateFiles.store({
  data: request.body.fileBase64,
  contentType: 'application/pdf',
  filename: request.body.filename,   // only used to choose the extension
  folder: 'contracts',               // optional sub-folder
});
// → { key, reference, url, contentType, bytes, storage: 'private' }
//   `reference`/`url` is a /api/private-files/... platform reference,
//   NOT a public https://storage.googleapis.com address.

// 2. Read the bytes back later (base64 — the sandbox has no Buffer).
const file = await platform.privateFiles.read(stored.key);
// → { key, contentType, bytes, base64 }

// 3. Create a private 640px WebP thumbnail without changing the original.
const thumbnail = await platform.privateFiles.thumbnail(stored.key);
// → { key, reference, url, contentType: 'image/webp', bytes, storage,
//     originalKey, maxDimension: 640 }

// 4. Mint temporary links for a customer.
const thumbnailLink = await platform.privateFiles.link(thumbnail.key);
const link = await platform.privateFiles.link(stored.key, { expiresInMinutes: 15 });
// → { url, key, expiresAt, expiresInMinutes }
```

- **`store({ data | base64 | text, contentType?, filename?, extension?, folder? })`** —
  `data` must be base64 (or a `data:` URL); plain text goes in `text`. A `data`
  string that is not valid base64 is rejected rather than stored as its literal
  characters. Ceiling **50MB**, the same as the public upload route.
- **`read(keyOrReference)`** — accepts either the `key` or the
  `/api/private-files/...` reference. Use it to attach the file to
  `platform.sendEmail`, analyse it, or hand it back with
  `respondRaw(200, file.base64, file.contentType, { encoding: 'base64' })`.
- **`thumbnail(keyOrReference)`** — accepts a private PNG, JPEG, or WebP owned
  by this workspace and stores a separate private WebP whose longest edge is at
  most **640px**. The original is never modified. Store the returned thumbnail
  key and mint a fresh link when rendering it; unsupported files and images
  that cannot produce a smaller derivative throw a clear error.
- **`link(keyOrReference, { expiresInMinutes })`** — **default 15 minutes,
  maximum 24 hours (1440)**; a larger value is clamped down. The file itself
  stays private — only the link expires, and the mint is recorded with the
  function's name as the actor. Store the **key** in your database, never the
  link, and mint a fresh link when a customer actually clicks.

Maximum **20 private-file calls** per execution. In a dry-run test `store()` and
the write half of `thumbnail()` are intercepted and write nothing (each returns
a well-formed key that names no file), while thumbnail source reads, `read()`,
and `link()` run for real.

### platform.phone.list() / .get() / .copyRecordingToPrivateFiles() / .purgeProviderRecording()

This workspace's own phone calls and their recordings — **without any voice
provider credential**.

**The voice provider credential is platform-only, by design and permanently.**
One credential covers the whole platform provider account, so code holding it
could read, reconfigure and delete every other workspace's agents, numbers and
call media. It is never handed to a server function, and there is no proxy that
forwards arbitrary provider API calls. `platform.phone` is the replacement: the
platform performs the privileged work in-process, scoped to your workspace.

The workspace is the one the platform already resolved for this execution —
there is no argument through which a function can name another workspace. A call
belonging to anyone else is refused with `Call not found`, the same words as a
call that never existed.

```javascript
// 1. This workspace's recent calls (newest first).
const calls = await platform.phone.list({ limit: 25 });   // max 100
// → [{ id, provider, providerCallId, direction, status, toNumber, fromNumber,
//      agentId, duration, outcome, startedAt, endedAt, createdAt,
//      hasRecording, recordingUrl, recordingPurgedAt, privateRecording }]

// 2. One call, with its transcript.
const call = await platform.phone.get(calls[0].id);

// 3. Copy the recording into THIS workspace's private storage (server-side
//    download; the provider URL is never handed to the browser).
const copy = await platform.phone.copyRecordingToPrivateFiles(call.id);
// → { callId, copied, alreadyCopied, key, reference, contentType, bytes, copiedAt }

// 4. Purge the provider's copy once yours is safe.
const purge = await platform.phone.purgeProviderRecording(call.id);
// → { callId, purged, providerPurged, alreadyPurged }

// 5. Hand the private copy to a customer through the normal authorized,
//    time-limited link path — each read is attributed to the caller.
const link = await platform.privateFiles.link(copy.key, { expiresInMinutes: 15 });
```

- **`list({ limit })`** — default 25, maximum 100. Fields are selected
  explicitly, so nothing new leaks in when the call record grows. Caller and
  destination numbers come back decrypted by the platform's own boundary.
- **`get(callId)`** — the same fields plus `transcript`.
- **`copyRecordingToPrivateFiles(callId)`** — downloads the provider media
  server-side and stores it in this workspace's private file store, recording
  the pointer on the call. **Safe to repeat**: a second run returns the existing
  copy with `alreadyCopied: true` and downloads nothing. Ceiling **50MB**; a
  provider fetch that fails throws a readable reason and stores nothing.
- **`purgeProviderRecording(callId)`** — the same deletion path as
  `DELETE /phone/calls/:callId/recording`: the provider's media is purged and
  the stored `recordingUrl` pointer is cleared. **Idempotent** — an
  already-purged call answers `alreadyPurged: true`, and a late provider webhook
  cannot bring the pointer back. Your private copy is untouched.

Maximum **20 `platform.phone` calls** per execution. This ceiling is **separate
from** the 50-call outbound-fetch budget. In a dry-run test the copy and the
purge are intercepted and do nothing; the reads run for real.

**Not offered, and each name says so.** `platform.phone.apiKey()`,
`.getApiKey()`, `.credentials()`, `.providerFetch()`, `.proxy()` and friends
exist and **throw** the reason above — the credential is platform-only,
permanently. `.createAgent()`, `.updateAgent()`, `.makeCall()`, `.dial()`,
`.sendSms()`, `.deleteCall()` and similar also exist and throw: this capability
covers your own call records and their recordings only. Place calls and manage
agents through the workspace phone API (`/api/workspaces/:workspaceId/phone/…`)
with `platform.fetch()`. The platform stamps that fetch for this workspace
automatically — scheduled and other server-function runs do not need a browser
session, JWT, or secrets-proxy header. Nothing ever silently no-ops.

**Kill switch.** The platform can withdraw this capability with the
`HOOK_PHONE_CAPABILITY_ENABLED` environment switch (default: on). While it is
off the `platform.phone` namespace is still present and every method throws a
message saying exactly that, so a function fails loudly instead of quietly
skipping the copy.

**Run it seconds after hang-up.** Nominate one of your own server functions as
`postCallHook` in the phone config and the platform runs it after each call
callback that carries a recording, with
`{ event: 'call_recording_available', callId, providerCallId }` in
`request.body`. Unset means nothing is dispatched. See the AI Phone Calls
integration docs.

```javascript
// Example: a post-call function that takes the audio off the provider.
export default async function handler(request, respond) {
  const { callId } = request.body;
  const copy = await platform.phone.copyRecordingToPrivateFiles(callId);
  const purge = await platform.phone.purgeProviderRecording(callId);
  console.log(`archived ${copy.bytes} bytes as ${copy.key}; provider purged: ${purge.providerPurged}`);
  return respond(200, { key: copy.key, purged: purge.purged });
}
```

### platform.crypto.hmac({ secret, payload, algorithm?, encoding? })

Compute a keyed hash (HMAC) over a secret and a payload. This is the primitive
webhook signature verification needs — pair it with
[`request.rawBody`](#requestrawbody--the-exact-transmitted-text-signed-webhooks).

| Argument | Required | Notes |
|---|---|---|
| `secret` | yes | The provider's signing secret, as text. Non-empty string, max 4096 bytes. **Never logged** — it does not appear in `_meta.logs`, in an error message, or in the execution history. **Saved the secret as a Provider Credential? Use [`hmacWithSecret()`](#platformcryptohmacwithsecret-secretname-payload-algorithm-encoding) with its name instead** — a `{{secrets.NAME}}` placeholder here is hashed as literal text. |
| `payload` | yes | The string that was signed — usually `request.rawBody`, sometimes with a timestamp prefix the provider specifies. Max 2 MB. |
| `algorithm` | no | `sha256` (default), `sha1` (older GitHub / Shopify schemes), or `sha512`. |
| `encoding` | no | `hex` (default), `base64`, or `base64url` — the encodings providers actually publish. |

Returns the digest as a string. Synchronous, no `await`. Maximum **100 calls**
per execution; a signed webhook needs one.

```javascript
// Stripe: Stripe-Signature: t=<ts>,v1=<hex sha256>
const hex = platform.crypto.hmac({ secret, payload: `${t}.${request.rawBody}` });

// GitHub: X-Hub-Signature-256: sha256=<hex>
const github = 'sha256=' + platform.crypto.hmac({ secret, payload: request.rawBody });

// Lemon Squeezy / Flutterwave style base64 digests
const b64 = platform.crypto.hmac({ secret, payload: request.rawBody, encoding: 'base64' });
```

### platform.crypto.hmacWithSecret({ secretName, payload, algorithm?, encoding? })

`hmac()` keyed by a **saved Provider Credential** instead of key text. This is
how a webhook signing secret you stored in the Integrations panel (Stripe's
`whsec_…`, a GitHub webhook secret, a Paddle notification secret) verifies the
provider's signature. Your code names the secret; the platform resolves it
server-side, computes the digest and returns only the digest. **The key never
enters function code, a log line, or the execution history**, so there is no
need to copy it into a private file or re-enter it anywhere.

| Argument | Required | Notes |
|---|---|---|
| `secretName` | yes | The **NAME** of a workspace secret — the same names `{{secrets.NAME}}` uses — never the key itself. Case-insensitive. The stored value is used as the key exactly as saved (max 4096 bytes). |
| `payload` | yes | As for `hmac()` — usually `request.rawBody`, with any prefix the provider specifies. Max 2 MB. |
| `algorithm` | no | `sha256` (default), `sha1`, or `sha512`. |
| `encoding` | no | `hex` (default), `base64`, or `base64url`. |

Returns the digest as a string. **`await` it** — it reads the workspace secret
store, so unlike `hmac()` it is asynchronous. It shares `hmac()`'s **100-call**
budget, and the secret is read once per execution however many digests you
compute. Each use is stamped against the secret in the same usage/audit trail
an outbound `platform.secretsProxy()` call records (actor: the calling function,
no target host).

**`{{secrets.NAME}}` does nothing inside `hmac()`.** Placeholders are only
substituted in outbound `platform.secretsProxy()` requests; passed as `secret`
to `hmac()` the literal placeholder text becomes the key and the digest never
matches. Use `hmacWithSecret` with the name instead. Passing `secretName` to
`hmac()` throws and points here.

```javascript
// Stripe: Stripe-Signature: t=<ts>,v1=<hex sha256 of "<ts>.<raw body>">
const header = request.headers['stripe-signature'] || '';
const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
if (!request.rawBody || !parts.t || !parts.v1) {
  respond(400, { error: 'unsigned or unreadable request' });
  return;
}
const expected = await platform.crypto.hmacWithSecret({
  secretName: 'STRIPE_WEBHOOK_SECRET',            // the NAME, never the key
  payload: `${parts.t}.${request.rawBody}`,
});
if (!platform.crypto.timingSafeEqual(expected, parts.v1)) {
  respond(400, { error: 'invalid signature' });
  return;
}
// Reject stale deliveries (Stripe's default tolerance is 5 minutes).
if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) {
  respond(400, { error: 'timestamp outside tolerance' });
  return;
}
respond(200, { received: true });
```

**TEST and LIVE signing secrets are different values.** Each Stripe endpoint
(sandbox or live) has its own `whsec_…`. Save each under its own name — for
example `STRIPE_WEBHOOK_SECRET_TEST` and `STRIPE_WEBHOOK_SECRET_LIVE` — and
verify against the one that matches the endpoint sending to this function. A
function that receives both can try each name and accept the first match.

Refusals **throw** with a stable `err.code`, and never contain the key:

| `err.code` | Meaning and what to do |
|---|---|
| `invalid_request` | No or malformed `secretName`, a non-string `payload` (e.g. `rawBody` is `null`), or a bad `algorithm`/`encoding`. |
| `unknown_secret` | This workspace has no secret with that name. Add it in the Integrations panel. |
| `secret_disabled` | The secret exists but is disabled. Re-enable it. |
| `invalid_key` | The stored value is empty or over 4096 bytes. Re-store the credential. |
| `content_too_large` | `payload` over 2 MB. |
| `budget_exceeded` | More than 100 `hmac`/`hmacWithSecret` calls in one execution. |

### platform.crypto.timingSafeEqual(a, b)

Constant-time string comparison. Use it instead of `===` when comparing a
computed digest with the one in the request header — a plain `===` returns as
soon as two characters differ, which tells an attacker how much of a forged
signature was correct.

```javascript
if (!platform.crypto.timingSafeEqual(expected, providedFromHeader)) {
  respond(401, { error: 'invalid signature' });
  return;
}
```

Returns `false` (it never throws) when either argument is not a string, is
empty, or the two differ in length. A signature's length is fixed by the
algorithm and encoding, so it is public and comparing it leaks nothing.

### platform.crypto.signJwt({ secretName, claims, algorithm?, header?, keyId?, expiresIn? })

Mint a **signed JWT** with a private key held in the workspace secret store.
Your code names the secret; the platform resolves and decrypts it server-side,
signs, and hands back the finished token. **The key never enters function code,
a log line, or the execution history** — there is no way to read it, and there
does not need to be.

This is what Google service accounts require (Wallet, Sheets, Drive, FCM v1 —
the OAuth 2.0 JWT-bearer flow) and what Apple requires (`.p8` push, pass and App
Store Connect tokens). Before this existed the only options were hand-writing
RSA in JavaScript or pasting a private key into function source. **Do neither.**

| Argument | Required | Notes |
|---|---|---|
| `secretName` | yes | The **NAME** of a workspace secret — the same names `{{secrets.NAME}}` uses — never the key itself. Case-insensitive. |
| `claims` | yes | The JWT payload, as an object. Max 64 KB serialised. |
| `algorithm` | no | `RS256` (default — Google), `RS384`, `RS512`, `PS256`, `PS384`, `PS512`, `ES256` (Apple `.p8`), `ES384`, `ES512`. |
| `header` | no | Extra JOSE header fields. `alg` cannot be set here, so the header always states what actually signed the token. |
| `keyId` | no | Sets `kid`. Needed for a bare key such as an Apple `.p8`; a service-account JSON defaults it for you. |
| `expiresIn` | no | Seconds. Sets `exp` to `iat + expiresIn`, **only** when you did not set `exp` yourself. |

Returns the compact token as a string. **`await` it** — unlike `hmac()`, this
reads the workspace secret store, so it is asynchronous.

**Store the whole service-account JSON exactly as Google gives it to you.** The
platform takes `private_key` out of it and defaults `iss` from `client_email`,
`kid` from `private_key_id`, and `iat` from the current time. **No default ever
overwrites a claim you set.** A key pasted with escaped `\n` newlines is accepted
as stored. A bare PEM works too — then supply `iss`/`keyId` yourself.

`ES*` signatures are emitted as the raw `r||s` pair the JWT format requires,
never DER — the form Apple and every JWT library expect.

```javascript
// Apple: ES256 over a .p8, kid from the developer portal, iss = team id
const appleToken = await platform.crypto.signJwt({
  secretName: 'APPLE_AUTH_KEY',
  algorithm: 'ES256',
  keyId: 'ABC1234DEF',
  claims: { iss: 'TEAMID1234' },
  expiresIn: 1200,
});
```

### platform.crypto.sign({ secretName, content | contentBase64, algorithm?, encoding?, dsaEncoding? })

The lower-level companion: a raw signature over content you supply, for binary
and provider-specific envelopes (pass bundles, signed manifests, upload
policies) that are not JWTs.

| Argument | Required | Notes |
|---|---|---|
| `secretName` | yes | As above — the NAME of a workspace secret. |
| `content` | one of | UTF-8 text to sign. |
| `contentBase64` | one of | Base64 bytes to sign, for content that is not text. Max 1 MB decoded. |
| `algorithm` | no | Same allow-list as `signJwt`; `RS256` by default. |
| `encoding` | no | `base64` (default), `base64url`, or `hex`. |
| `dsaEncoding` | no | EC keys only: `der` (default — what binary schemes normally want) or `ieee-p1363` (raw `r||s`). Ignored for RSA. |

Returns the signature as a string. `await` it.

```javascript
const signature = await platform.crypto.sign({
  secretName: 'PASS_SIGNING_KEY',
  contentBase64: manifestBytesBase64,   // exact bytes, not re-serialised text
  algorithm: 'RS256',
  encoding: 'base64',
});
```

#### Signing refusals and budgets

Both calls **throw** on refusal — they do not return an `ok: false` shape — with
a stable `err.code` you can branch on. **No refusal, log line, or
execution-history entry ever contains key material**: messages report sizes,
algorithm names, and the secret NAME you already passed.

| `err.code` | Meaning and what to do |
|---|---|
| `invalid_request` | The arguments are wrong (no `secretName`, no `claims`, both or neither `content` form, a `header.alg`, a bad `encoding`). Fix the call. |
| `unknown_secret` | This workspace has no secret with that name. Add it in the Integrations panel. |
| `secret_disabled` | The secret exists but is disabled. Re-enable it. |
| `invalid_key` | The stored value is not a usable private key — not a PEM, JSON with no `private_key`, empty, or unreadable. Re-store the credential. |
| `key_passphrase_required` | The key is passphrase-protected. The platform never prompts for a passphrase; store the decrypted key. |
| `key_algorithm_mismatch` | The key cannot produce that algorithm (an RSA key with `ES256`, an EC key with `RS256`, or the wrong curve for `ES384`/`ES512`). |
| `invalid_algorithm` | The algorithm is not on the allow-list above. |
| `content_too_large` | Claims over 64 KB, or content over 1 MB. |
| `budget_exceeded` | More than **50 signing calls** in one execution — shared by `signJwt` and `sign`, and separate from the 100-call `hmac` budget. |
| `signing_failed` | The key parsed but could not produce the signature. |

The key is parsed **once per execution**, so minting many tokens from the same
secret does not re-read the store. Every signature is stamped against that
secret through the same usage/audit trail an outbound `platform.secretsProxy()`
call records — with the calling function as the actor and no target host,
because nothing left the platform — so the founder can see the credential is in
use.

**A test run signs for real.** Unlike `platform.secretsProxy()`, which returns a
synthetic success in a dry run, signing has no external side effect, so a test
run produces the genuine token. Testing a signed integration would otherwise
prove nothing.

#### Worked example: Google Wallet

Two signatures with the same stored service-account JSON — one exchanged for an
access token, one handed to the browser as the "Add to Google Wallet" link.
Nothing here is Wallet-specific on the platform side; you compose Google's own
scheme.

```javascript
// 1. A signed assertion, exchanged for an access token (OAuth 2.0 JWT bearer).
//    iss, kid and iat all come from the stored service-account JSON.
const assertion = await platform.crypto.signJwt({
  secretName: 'GOOGLE_SERVICE_ACCOUNT',
  claims: {
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
  },
  expiresIn: 3600,
});

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body:
    'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
    '&assertion=' + encodeURIComponent(assertion),
});
const { access_token } = await tokenRes.json();
if (!access_token) {
  respond(502, { error: 'Google refused the assertion' });
  return;
}

// 2. Create the loyalty class with that token (once per programme).
await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + access_token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    id: ISSUER_ID + '.' + CLASS_SUFFIX,
    issuerName: 'Acme Coffee',
    programName: 'Acme Rewards',
    reviewStatus: 'UNDER_REVIEW',
  }),
});

// 3. The save link is itself a JWT signed with the same key — no API call.
const saveToken = await platform.crypto.signJwt({
  secretName: 'GOOGLE_SERVICE_ACCOUNT',
  claims: {
    aud: 'google',
    typ: 'savetowallet',
    origins: ['https://your-space.example.com'],
    payload: { loyaltyObjects: [{ id: ISSUER_ID + '.' + objectSuffix }] },
  },
});
respond(200, { saveUrl: 'https://pay.google.com/gp/v/save/' + saveToken });
```

**What this is not.** `platform.crypto` is hashing, comparison and signing only.
There is deliberately no random-number generation, no encryption/decryption, no
key generation, rotation or storage, and no provider-specific verifier or minter
— compose the provider's documented scheme yourself from `rawBody` + `hmac` +
`timingSafeEqual`, or from `signJwt` / `sign`, exactly as the Paddle, Stripe,
GitHub, Apple and Google Wallet examples above do. A stored secret's plaintext
is still never readable from function code: the signing calls **use** the key,
they never return it.

### platform.fetch(url, options)

Same as the global `fetch` — an alias for the scoped fetch function.

### platform.secretsProxy(request)

Call a third-party API through the workspace BYOK secrets proxy — the trusted
server-side path for hooks (hooks carry no workspace token, so they must NOT
fetch the HTTP proxy endpoint; that always returns 401). The request has the
exact same shape as the HTTP endpoint body, with `{{secrets.NAME}}`
placeholders substituted server-side. All proxy rules still apply (HTTPS only,
allow-listed hosts, enabled keys only).

```javascript
const result = await platform.secretsProxy({
  method: 'GET',
  url: 'https://api.example.com/v1/items',
  headers: { Authorization: 'Bearer {{secrets.MY_API_KEY}}' },
});
if (result.ok) {
  respond(200, { items: result.body });
} else {
  // Failure codes (further down this section) says whether to stop or retry.
  respond(502, { error: result.error, code: result.code });
}
```

Returns `{ ok: true, status, headers, body, encoding? }` on success or
`{ ok: false, code, error, status }` on any proxy-level failure — it never
throws for those, so hooks can fail gracefully.

**`ok: true` only means the round trip completed.** It is not "the API call
worked". Read `result.status` — the upstream's own status — before you treat the
answer as data. A **401 or 403 there means the key exists and the third party
rejected it**, which is the opposite of a missing key; telling the founder to
add a key at that point sends them to fix something that is already there.

**Fetch budget: every proxy call spends one of the hook's 50 fetch calls** —
including a call the proxy refuses on configuration grounds (`unknown_secret`,
`no_allowed_hosts`, `host_not_allowed`) before it makes any upstream request.
The budget is charged when the helper is entered, not when bytes leave the
platform, and it is the same 50-call budget `fetch` draws from. Budget a probe
accordingly, and latch its verdict instead of repeating it.

**Dry-run/test mode returns a synthetic success.** When a hook runs in test mode
the helper returns `{ ok: true, status: 0, headers: {}, body: null }` without
calling anything. `status: 0` is the tell — a probe run in test mode proves
nothing about whether a key exists or works.

See the `custom-api-keys` integration docs for managing the keys.

#### Optional keys: works with the key, works without it

**No hook can ask whether a workspace has a secret.** There is no list-secrets
read for hooks — nor for browser apps, nor for the build agent. Listing keys is
a workspace-chat capability instead: people in the workspace can see the masked
NAMEs through Otto (`list_custom_api_keys`, `check_custom_api_key`) or the
Integrations panel, and only the writes there are owner-only. Code gets none of
that. So do not create a throwaway hook to probe for a key and delete it
afterwards, and do not stall a build asking the founder whether the key is
configured. Make the real call and branch on the answer.

Probe once, then latch the verdict for the rest of the execution — each extra
attempt spends another fetch slot:

```javascript
const CONFIG_FAILURES = ['unknown_secret', 'no_allowed_hosts', 'host_not_allowed'];
let keyVerdict = null;   // null = not probed yet

async function lookup(term) {
  if (keyVerdict && keyVerdict !== 'usable') return keylessLookup(term);

  const result = await platform.secretsProxy({
    method: 'GET',
    url: 'https://api.example.com/v1/lookup?q=' + encodeURIComponent(term),
    headers: { Authorization: 'Bearer {{secrets.EXAMPLE_API_KEY}}' },
  });

  if (!result.ok) {
    if (CONFIG_FAILURES.indexOf(result.code) >= 0) {
      keyVerdict = result.code === 'unknown_secret' ? 'missing' : 'host-not-allowed';
      return keylessLookup(term);          // latched — no more probes this run
    }
    throw new Error('Lookup failed: ' + result.code);   // transient or my bug
  }

  if (result.status === 401 || result.status === 403) {
    keyVerdict = 'rejected';               // the key exists; the provider said no
    return keylessLookup(term);
  }

  keyVerdict = 'usable';
  return result.body;
}
```

Latch **only** on those three configuration codes and on an upstream 401/403.
Never latch on a transient code (`rate_limited`, `concurrency_limited`,
`signer_error`, `proxy_error`, `upstream_error`) or on a code you do not
recognise — that turns one blip into a keyless run. There are no `no_secrets` or
`secret_disabled` codes: a missing key and a disabled key both come back as
`unknown_secret`.

Keep the founder-facing messages distinct, because the fixes are different — "no
key stored", "the provider rejected the key", and "this key isn't allowed to
call that host". The last one is easy to miss: a key that exists, is enabled and
works elsewhere still fails with `host_not_allowed` against a new host until the
founder adds that host to the key's allow-list, so **always name the host** in
that message. The browser version of this pattern is in the `custom-api-keys`
integration docs.

#### Request body and Content-Type

Only one of `json`, `body`, or `form` may be supplied. `GET` and `HEAD` requests
cannot carry any of them.

| Field | Accepted shape | What the proxy sends | Content-Type applied for you |
|---|---|---|---|
| `json` | Any JSON value: object, array, string, number, boolean, or `null` | The proxy runs `JSON.stringify` after replacing secret placeholders. Pass the value itself — do not pre-stringify an object. | `application/json` |
| `body` | A raw string | UTF-8 bytes exactly as supplied after placeholder replacement | `text/plain; charset=utf-8` |
| `form` | An object whose keys and values are strings | URL-encoded by default; set `formEncoding: "multipart"` for text-only multipart fields | `application/x-www-form-urlencoded`, or `multipart/form-data` with the generated boundary |

Yes: when you use `json`, the proxy sets `Content-Type: application/json` for
you. The same automatic default applies to raw and form bodies as shown above.
If you provide a `Content-Type` header yourself it wins; otherwise the optional
top-level `contentType` override wins over the automatic default. A request with
no body gets no automatic Content-Type.

#### Failure codes

**Permanent or transient?** Permanent means do not retry the same unchanged
request — fix the request/configuration or take the fallback path. Transient
means retry later with backoff (and still take the fallback path if retries are
exhausted). An upstream HTTP 4xx/5xx is not one of these proxy failures:
`result.ok` remains `true` and the upstream status is returned in
`result.status`.

| `code` | HTTP status | Class | Meaning and action |
|---|---:|---|---|
| `invalid_request` | 400 | Permanent | The request shape is invalid (including unknown fields, conflicting body fields, or a body on GET/HEAD). Fix it. |
| `unknown_secret` | 400 | Permanent | A referenced secret is missing or disabled. Configure/enable it or use the fallback. |
| `no_allowed_hosts` | 400 | Permanent | A referenced secret has no host allow-list. Configure the key before trying again. |
| `invalid_url` | 400 | Permanent | The substituted target URL is invalid. Fix the URL. |
| `https_required` | 400 | Permanent | The target is not HTTPS. Use an HTTPS endpoint. |
| `blocked_host` | 403 | Permanent | The target host or resolved IP is blocked by the proxy's SSRF policy. Choose a public third-party endpoint. |
| `host_not_allowed` | 403 | Permanent | At least one referenced secret does not allow the target host. Fix that key's allow-list. |
| `request_too_large` | 413 | Permanent | The built request body exceeds the proxy limit. Reduce or split it. |
| `rate_limited` | 429 | Transient | The workspace used its per-minute allowance. Retry later with backoff. |
| `concurrency_limited` | 429 | Transient | Too many proxy calls are active for the workspace. Retry after another call finishes. |
| `signer_error` | 500 | Transient | The platform request signer failed. Retry later; use the fallback if it repeats. |
| `proxy_error` | 500 | Transient | An unexpected internal proxy failure occurred. Retry once later, then use the fallback and report it if it repeats. |
| `bad_redirect` | 502 | Permanent | The upstream returned an invalid redirect location. Use a correct final URL or another endpoint. |
| `cross_host_redirect` | 502 | Permanent | The upstream tried to redirect secret-bearing headers to another host. Call an allowed final host directly. |
| `too_many_redirects` | 502 | Permanent | The upstream redirect chain exceeds the proxy limit. Use the final URL or another endpoint. |
| `response_too_large` | 502 | Permanent | The raw upstream response exceeds the proxy limit. Ask for less data or use another transfer path. |
| `upstream_error` | 502 | Transient | DNS, connection, TLS, timeout, or another upstream transport failure occurred. Retry later with backoff. |

**Binary responses (audio, images, PDFs).** Add `responseType` to the request:

| `responseType` | `body` you get back | `encoding` |
|---|---|---|
| omitted (default) | parsed JSON when the upstream is JSON, otherwise the text — **unless** the bytes aren't valid UTF-8, in which case you get base64 automatically | `"base64"` only in that automatic binary case |
| `"json"` | parsed JSON (falls back to the raw text if it doesn't parse) | — |
| `"text"` | the response as a string | — |
| `"binary"` | the bytes, base64-encoded | `"base64"` |

Always branch on `result.encoding` before treating `body` as text. Never
re-encode a base64 body into a string — that destroys the bytes.

Limit: **10 MB** of upstream bytes per response (base64 makes the reply ~33%
larger). Over that the call fails cleanly with
`code: 'response_too_large'` — you never get a truncated body.

### Returning binary from a hook

OpenAI TTS uses `POST /proxy/openai/v1/audio/speech` (same proxy as chat), not
`{{secrets.OPENAI_API_KEY}}`. For a founder's own third-party key:

```javascript
const result = await platform.secretsProxy({
  method: 'POST',
  url: 'https://api.example.com/v1/render.bin',
  headers: { Authorization: 'Bearer {{secrets.MY_KEY}}' },
  json: { id: request.body.jobId },
  responseType: 'binary',            // optional here — auto-detected too
});

if (!result.ok) {
  respond(502, { error: result.error, code: result.code });
} else if (result.encoding === 'base64') {
  respondRaw(200, result.body, result.headers['content-type'] || 'application/octet-stream', {
    encoding: 'base64',
  });
} else {
  respond(502, { error: 'Expected binary', body: result.body });
}
```

`respondRaw(..., { encoding: 'base64' })` decodes the base64 and sends the raw
bytes with your chosen `Content-Type`. Without that option the raw path
stringifies the body, which is fine for text but produces an unplayable file
for audio or a broken image. An invalid base64 string fails the hook with a
clear error instead of shipping garbage.

---


## Apple Wallet Pass Updates (APNs push relay)

A server function can host Apple's Wallet **pass update web service** and push
the silent "this pass changed" notification that makes the phone re-download
the pass. Two platform capabilities cover it.

### 1. Extra path segments reach one hook

Apple calls fixed URL shapes such as
`/v1/devices/{deviceId}/registrations/{passTypeId}/{serial}`. Put your hook's
execute URL in the pass's `webServiceURL` and every extra segment arrives as
`request.subPath` (see **Execute a Hook** above), so one hook serves the whole
web service:

```javascript
// webServiceURL: https://audos.com/api/hooks/execute/workspace-123456/pass-api
// GET    /v1/devices/:deviceId/registrations/:passTypeId        -> changed serials
// POST   /v1/devices/:deviceId/registrations/:passTypeId/:serial -> register
// DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial -> unregister
// GET    /v1/passes/:passTypeId/:serial                          -> updated .pkpass
const parts = request.subPath.split('/').filter(Boolean);
```

Apple sends the device's push token on registration. Store the registrations in
your OWN WorkspaceDB table — the platform does not track them.

### 2. `POST /api/apns/pass-update` — notify the devices

Apple's pass-update notification is an empty-payload push over HTTP/2 signed
with your Apple auth key. Hook code has neither HTTP/2 nor the key, so the
platform relays it. Call it from a server function with a plain `fetch`: the
runner recognises the self-targeted URL and authenticates it for you, so there
is **no key, token or header in your hook code**. It is callable ONLY from your
workspace's own server function — browser code and anonymous callers are
refused, and the relay only ever notifies with your workspace's own credential.

<!-- MANIFEST:ENDPOINT POST /api/apns/pass-update | Send Apple's silent Wallet pass-update push (APNs relay; server-function-only, uses the workspace's own Apple credential) -->

#### Credential setup (once)

Create an APNs **Auth Key** in the Apple Developer portal (Keys → enable Apple
Push Notifications service) and store three named workspace secrets — see the
`custom-api-keys` integration for managing them:

| Secret name | Value |
|---|---|
| `APPLE_PUSH_AUTH_KEY` | The whole `.p8` file contents, including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines. Multi-line values are stored and used intact. |
| `APPLE_PUSH_KEY_ID` | The 10-character Key ID Apple shows for that key |
| `APPLE_PUSH_TEAM_ID` | Your 10-character Apple Team ID |

The auth key is encrypted at rest, is never readable back, is never returned to
a browser and is never printed in logs. Only the platform relay decrypts it.
To hold more than one credential, name the trio with a different prefix (e.g.
`STAGING_AUTH_KEY` / `STAGING_KEY_ID` / `STAGING_TEAM_ID`) and pass
`credentialName: "STAGING"`.

#### Request

```javascript
const res = await fetch('https://audos.com/api/apns/pass-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    passTypeIdentifier: 'pass.com.example.stamps', // the APNs topic
    deviceTokens: ['a1b2...'],                     // up to 500 per call
    environment: 'production',                     // or 'sandbox'
  }),
});
const result = await res.json();
```

| Field | Required | Meaning |
|---|---|---|
| `passTypeIdentifier` | yes | The Pass Type Identifier, used as the APNs topic. `topic` is accepted as an alias. |
| `deviceTokens` | yes | Hex device tokens Apple gave you at registration. Max **500** per call; duplicates are collapsed. |
| `environment` | no | `production` (default) or `sandbox`. **A pass built with a development profile will not accept a production notification** — send development passes to `sandbox`. |
| `credentialName` | no | Secret-name prefix. Defaults to `APPLE_PUSH`. |
| `workspaceId` | no | If supplied it must be your own workspace; naming another workspace is refused. |

#### Response

```json
{
  "success": true,
  "environment": "production",
  "passTypeIdentifier": "pass.com.example.stamps",
  "delivered": 2,
  "failed": 1,
  "deleteRegistrations": ["c3d4..."],
  "results": [
    { "deviceToken": "a1b2...", "delivered": true,  "code": "delivered", "detail": "...", "deleteRegistration": false, "apnsId": "..." },
    { "deviceToken": "c3d4...", "delivered": false, "code": "device_unregistered", "detail": "...", "deleteRegistration": true }
  ]
}
```

**A partial failure never fails the call** — check each entry in `results`.

**Dead-token rule:** for every device with `deleteRegistration: true`, delete
that device's registration row from your own table. Apple returns those for
tokens that are gone or belong to another environment, and it will keep
rejecting them until you stop sending them.

| Per-device `code` | Delete the registration? | Meaning |
|---|---|---|
| `delivered` | no | Apple accepted the notification |
| `device_unregistered` | **yes** | The pass was removed from that device |
| `bad_device_token` | **yes** | Malformed token, or a token for the other Apple environment |
| `invalid_topic` | no | The pass type identifier does not match the pass or the credential's team |
| `credential_rejected` | no | Apple rejected the stored credential — recheck the three secrets |
| `apple_rate_limited` | no | Apple is throttling this device; retry later |
| `apns_unavailable` | no | Apple did not answer; retry later |
| `apns_rejected` | no | Apple rejected the notification for another reason |

#### Refusals

Every rejection is `{ "success": false, "code": ..., "detail": ... }` — a
stable machine code plus a short sentence. Apple's raw reason strings and your
credential never appear in a response body.

| `code` | HTTP status | Meaning and action |
|---|---:|---|
| `server_context_required` | 403 | Called from something other than this workspace's own server function. Move the call into a hook. |
| `workspace_mismatch` | 403 | The call named another workspace. Omit `workspaceId` or pass your own. |
| `workspace_not_found` | 404 | The calling workspace could not be resolved. |
| `invalid_request` | 400 | Missing `passTypeIdentifier`, empty `deviceTokens`, or a non-hex device token. |
| `too_many_devices` | 400 | More than 500 device tokens in one call. Split it. |
| `rate_limited` | 429 | The workspace used its 300 pass-update calls this hour. Retry later. |
| `credential_missing` | 400 | One of the three secrets is not set. Configure them. |
| `credential_invalid` | 400 | The stored auth key is not a usable Apple `.p8` key. |
| `apns_unavailable` | 502 | Apple could not be reached at all; nothing was delivered. Retry later. |

**Limits:** 500 devices per call, 300 calls per workspace per hour.

#### Full pattern: pass changed → notify → prune dead registrations

```javascript
// Called after your app updates a customer's stamp count.
const rows = await db.query('pass_registrations', {
  where: { serial_number: request.body.serialNumber },
});

const res = await fetch('https://audos.com/api/apns/pass-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    passTypeIdentifier: 'pass.com.example.stamps',
    deviceTokens: rows.map((r) => r.push_token),
    environment: 'production',
  }),
});
const result = await res.json();

if (!result.success) {
  respond(502, { error: result.detail, code: result.code });
} else {
  for (const dead of result.deleteRegistrations) {
    await db.delete('pass_registrations', { push_token: dead });
  }
  respond(200, { delivered: result.delivered, pruned: result.deleteRegistrations.length });
}
```

---

## Scheduler Integration

Hooks can be triggered on a schedule using the Task Scheduler with `actionType: "hook"`:

```
POST /api/workspaces/:workspaceId/schedules
```

```json
{
  "name": "Nightly Cleanup",
  "frequency": "daily",
  "time": "02:00",
  "timezone": "UTC",
  "actionType": "hook",
  "actionPayload": {
    "hookName": "nightly-cleanup",
    "payload": { "dryRun": false }
  }
}
```

The scheduler will call the named hook with the provided payload in `request.body`.

For a one-time future email, you do not need a schedule at all — call
`platform.sendEmail({ ..., scheduledAt })` from hook code (see **Scheduling an
email for later** above). The durable alert pattern combines the two: a
recurring `hook` schedule wakes a server function on a cadence, and that
function schedules the individual future emails it decides are due.

See the `task-scheduler` integration docs for the full schedule lifecycle
(list/update/delete, frequencies, statuses).

---

## Customer Chat Tool Integration (MCP)

Hooks can also back **customer chat tools**: register an entry in the
workspace's customer-tools registry whose action points at the hook's public
execute alias:

```
/api/hooks/execute/workspace-{configId}/{hookName}
```

When the customer-facing agent calls the tool mid-conversation, the platform
executes the hook and forwards the visitor's `X-Session-Id`. In-hook writes
inherit visitor ownership only when that id resolves to a real session in this
workspace; see "Visitor ownership is conditional in hooks" under Database
Access for the shared-row fallback and the unfiltered read/delete rules.
See the `mcp-agent-tools` integration docs for the registry format and how
entries get registered. Registering is a **management** action: the registry's
own addresses under `/api/workspace-settings/{workspaceId}/customer-tools`
require the workspace owner (or an equivalent admin principal), so a hook, app
runtime code, or a visitor's browser calling them gets `401`/`403` by design
and always will. Hooks are what the registered tools *call*, never what
registers them.

---


## Reacting to Workspace Events

A hook is invoked in four ways: direct HTTP execution (the public execute URLs
above), the Task Scheduler (`actionType: "hook"`), and three **platform-pushed
deliveries** to reserved hook names — inbound email (`inbound-email`, see
`integrations/inbound-email/`), subscription lifecycle events
(`subscription-events`, below) and Flutterwave payment events
(`flutterwave-events`, below). All three are opt-in by registering the reserved
name; a workspace that has not registered one receives nothing.

**There is still no general declarative event→hook subscription.** Outside the
three reserved names there is no API to subscribe a hook to workspace analytics
events — routes such as `/api/workspaces/:id/event-listeners`,
`.../event-hooks`, `.../event-triggers`, `.../event-bindings`, and
`.../webhooks` do **not** exist (they return 404). Do not probe for one.

### Subscription lifecycle events → `subscription-events` (push)

Register an **enabled** server function named exactly `subscription-events`
whose code carries the opt-in marker `audos:subscription-events` (a comment on
the first line is enough), and the platform calls it whenever one of this
workspace's subscriptions is created, changed, or cancelled — including a
cancellation the customer makes on the provider's own hosted billing page with
nobody using the product at the time.

```javascript
// audos:subscription-events
const event = request.body;              // the provider's own event shape
const subscription = event.data.object;  // the subscription object

if (event.type === 'customer.subscription.deleted') {
  await db.update(
    'members',
    { stripe_subscription_id: subscription.id },
    { state: 'grace', grace_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() },
  );
}

respond(200, { handled: event.type });
```

**Payload** — the provider's own event, unchanged, so code already written
against that shape works as-is:

| Field | Description |
|-------|-------------|
| `id` | Provider event id (`evt_…`). Delivered at most once per workspace. |
| `type` | `customer.subscription.created`, `customer.subscription.updated`, or `customer.subscription.deleted`. |
| `created`, `livemode`, `api_version`, `account` | Straight from the event. `account` is `null` for workspaces selling through the platform's merchant account. |
| `data.object` | The full subscription object: `id`, `status`, `customer`, `items`, `cancel_at`, `cancel_at_period_end`, `metadata`, and billing periods (on subscription items in newer API versions) |
| `_audos` | The only platform addition: `{ signatureVerified: true, trigger: "stripe-subscription-event", stripeEnv, workspaceId }`. |

A future `data.object.cancel_at` schedules cancellation even when
`cancel_at_period_end` is false. Preserve both provider fields. Treat an
explicit cancellation date or the period-end flag as a scheduled cancellation
while the subscription is nonterminal, and suppress renewal notices. Read
period end from `current_period_end` with an
`items.data[0].current_period_end` fallback. Keep paid access until Stripe
reports termination; passing a local date alone is not a deletion event.
You usually do not need to mirror any of this yourself: the platform already
folds both forms into the customer's CRM record, and
`GET /api/space/:spaceId/subscription-status` reports them as `cancelAt`
(ISO or `null`), `cancellationScheduled` and `currentPeriodEnd` beside the
raw `cancelAtPeriodEnd` — cleared again when the customer reverses in the
Portal (see the stripe-payments docs).

**Rules**

- **Nomination is the opt-in, and the only access control.** No function with
  that exact name, not enabled, or missing the marker → nothing is delivered
  and nothing about the workspace changes. There is no flag to request.
- **Authenticity is already proven.** The platform verifies the provider's
  signature before calling you, so nothing external is ever pointed at your
  function. Do not re-verify, and do not trust a subscription "event" that
  arrives at your public execute URL from somewhere else.
- **Only this workspace's events.** The workspace is resolved from the
  subscription's own `metadata.workspaceId` (or, for a connected account, from
  that account). An event that names no workspace is delivered to nobody.
- **At most one call per event.** A repeat delivery of the same event id is
  dropped before your code runs.
- **It runs after the provider has been acknowledged**, with a 30-second
  ceiling. What you return is recorded but changes nothing upstream: a failure
  or a timeout never makes the provider retry, and there is no redelivery
  queue. Make the handler idempotent and check the run in the function's
  execution history — these appear with trigger `stripe-subscription-event`.
- Works for both platform-mode workspaces and workspaces with their own
  connected merchant account.

### Flutterwave payment events → `flutterwave-events` (push)

Register an **enabled** server function named exactly `flutterwave-events`
whose code carries the opt-in marker `audos:flutterwave-events` (a comment on
the first line is enough), and the platform calls it with this workspace's
Flutterwave events — including a payment that was **not started inside Audos**,
such as one taken from your own Flutterwave dashboard or a payment link you
generated yourself.

```javascript
// audos:flutterwave-events
const event = request.body;        // Flutterwave's own event shape
const tx = event.data;

if (event.event === 'charge.completed' && tx.status === 'successful') {
  await db.insert('payments', {
    tx_ref: tx.tx_ref,
    flw_id: String(tx.id),
    email: tx.customer?.email || null,
    amount: tx.amount,
    currency: tx.currency,
  });
}

respond(200, { handled: event.event });
```

#### One Flutterwave account can serve several workspaces

Flutterwave allows **exactly one webhook address per Flutterwave account**, so
Audos receives every workspace's Flutterwave traffic at **one shared address**:

```
https://<your Audos host>/api/payments/flutterwave/webhook
```

Wallet → Accept Payments prints the exact address for your host. It carries no
workspace id on purpose. Register it once in Flutterwave, connect each
workspace in Wallet with the same keys and the same secret hash, and Audos
attributes each delivery itself. **Do not build a router hook that forwards
payments between workspaces** — there is no cross-workspace write, and none is
needed: each workspace's own `flutterwave-events` function does its own writes.

Audos decides which workspace owns a delivery in this order:

1. **Checkout metadata** — the payment was started through the Audos checkout,
   subscription or payment-link APIs, which stamp the workspace on it.
2. **A marker you control in the payment reference** — put `audos_ws_<id>`
   anywhere in `tx_ref` (e.g. `INV-2031-audos_ws_847494`, using either the
   workspace UUID or the numeric workspace id) when you start a payment
   yourself. The marker may only name a workspace on the same Flutterwave
   account.
3. **The connected Flutterwave account** — when exactly one workspace is
   connected to the account the delivery authenticated against, that workspace
   owns it.
4. **The buyer's own history**, last and only within the account — when exactly
   one workspace on that account has already dealt with this customer's email.
   This is how lifecycle events (`subscription.cancelled`, refunds, renewal
   failures), which carry no reference of their own, find their way home.

If two workspaces on one account could equally own an event and nothing above
picks one, Audos **records it as unattributed and delivers it to nobody** rather
than guessing. Flutterwave is still acknowledged, so it does not retry forever.
Add the `audos_ws_<id>` marker to your reference to make such payments routable
— it is the only rule you control, and it beats every rule below it.

**Payload** — Flutterwave's own event, unchanged, so code already written
against that shape works as-is:

| Field | Description |
|-------|-------------|
| `event` | The Flutterwave event name, e.g. `charge.completed`, `subscription.cancelled`, `charge.refunded`. |
| `data` | The full Flutterwave object — `id`, `tx_ref`, `flw_ref`, `status`, `amount`, `currency`, `customer.email`, `meta`, … |
| `_audos` | The only platform addition: `{ signatureVerified: true, trigger: "flutterwave-payment-event", workspaceId, attributedVia, eventKey }`. `attributedVia` is `"checkout_metadata"`, `"reference_marker"`, `"connected_account"` or `"customer_history"` — which of the rules above matched. |

**Rules**

- **Nomination is the opt-in, and the only access control.** No function with
  that exact name, not enabled, or missing the marker → nothing is delivered
  and nothing about the workspace changes. There is no flag to request.
- **Authenticity is already proven.** The platform verifies Flutterwave's
  `verif-hash` before calling you, so nothing external is ever pointed at your
  function. Do not re-verify, and do not trust a Flutterwave "event" that
  arrives at your public execute URL from somewhere else.
- **Only this workspace's events.** An event Audos could not attribute to
  exactly one workspace is delivered to nobody.
- **At most one call per event.** A repeat delivery of the same event is
  dropped before your code runs.
- **It runs after Flutterwave has been acknowledged**, with a 30-second
  ceiling. What you return is recorded but changes nothing upstream: a failure
  or a timeout never makes Flutterwave retry, and there is no redelivery queue.
  Make the handler idempotent and check the run in the function's execution
  history — these appear with trigger `flutterwave-payment-event`.
- This delivery is Flutterwave-only. Stripe subscription lifecycle events go to
  `subscription-events` above; other providers have no push delivery yet.

### Everything else: scheduler + polling

For any other event type the supported pattern is **scheduler + polling**: a
scheduled hook reads recent events from the CRM events endpoint and a durable
WorkspaceDB ledger records what has already been handled.

### Reading recent events

```
GET /api/crm/events?workspaceId=:workspaceId&eventType=purchase&days=1&limit=100
```

Hook code has no page origin, so this `fetch` must use the platform's full
`https://...` address as shown — a bare `/api/crm/events` path fails before any
request is sent. This read needs no additional caller secret: pass the hook's
canonical `workspaceId` global in the query as shown.

**Query parameters:**
- `workspaceId` — Required. Any id format (configId, `workspace-{configId}`, UUID).
- `eventType` — Optional. Filter to one event type (e.g. `purchase`); omit or pass `all` for every type.
- `excludeType` — Optional. Comma-separated event types to exclude.
- `spaceId` / `appId` — Optional. Narrow to one space or app.
- `days` — Optional look-back window in days (default 30). `startDate`/`endDate` (YYYY-MM-DD, inclusive) take precedence when both are given.
- `limit` — Optional. Max events returned (default 100), newest first.
- `aggregation` — Optional. `by_type`, `by_space`, `by_app`, or `summary` return counts instead of raw events (as `{ success, aggregation, data }`).

**Response shape (raw events)** — the array is under `data`, not at the top level:

```json
{
  "success": true,
  "data": [
    { "id": "...", "eventType": "purchase", "spaceId": "...", "sessionId": "...", "visitorId": "...", "eventData": { }, "createdAt": "..." }
  ],
  "count": 1
}
```

The stable contract is the `{ success, data, count }` envelope; inspect a live
response before relying on per-event fields.

### Ledger table for deduplication

Create a WorkspaceDB table (e.g. `processed_events` with a unique `event_id`
text column) **before** deploying the hook, using the WorkspaceDB tooling.
Hooks cannot create tables — `db.rawQuery` is SELECT-only.

### Example: process new `purchase` events hourly

**Step 1 — the hook** (name: `process-purchase-events`):

```javascript
const res = await fetch(
  `https://audos.com/api/crm/events?workspaceId=${workspaceId}&eventType=purchase&days=1&limit=100`
);
const json = await res.json();
const events = json.data || [];

let processed = 0;
for (const event of events) {
  const seen = await db.query('processed_events', {
    where: { event_id: String(event.id) },
    limit: 1,
  });
  if (seen.rowCount > 0) continue; // already handled on a previous run

  // React to the purchase — keep this step IDEMPOTENT (safe to repeat).
  await platform.postAgentMessage({
    message: `New purchase event processed (id ${event.id}).`,
  });

  await db.insert('processed_events', {
    event_id: String(event.id),
    event_type: 'purchase',
    processed_at: new Date().toISOString(),
  });
  processed++;
}

respond(200, { checked: events.length, processed });
```

**Step 2 — schedule it hourly:**

```
POST /api/workspaces/:workspaceId/schedules
{
  "name": "Process purchase events",
  "frequency": "hourly",
  "timezone": "UTC",
  "actionType": "hook",
  "actionPayload": { "hookName": "process-purchase-events" }
}
```

### Delivery semantics (at-least-once)

Make the look-back window **overlap** the polling interval (hourly polling with
`days=1` is a safe overlap) so a late, skipped, or failed run never leaves a
gap — overlapping windows re-read events the ledger already covers, and the
ledger skips them.

This pattern is **at-least-once**, and the side effect must be idempotent:
if a run crashes between the side effect and the ledger insert, the next run
repeats the side effect for that event. It is **not** exactly-once delivery —
no polling recipe can promise that. Design the reaction so a repeat is harmless
(e.g. upsert by `event_id`, or make the message/action safe to duplicate)
rather than assuming each event is seen exactly once.

### After a publish succeeds → the function you name (push)

Publishing a workspace can run **one** server function of your choosing. Unlike
the three reserved names above, this trigger is not a reserved name: you
nominate any registered function by name in the workspace setting
`publish_completed_hook`. Nothing is nominated by default, so a workspace that
has not set it is unaffected.

Turn it on by writing the setting through the workspace settings API as the
workspace **owner** (collaborators and page-embedded keys are refused):

```
PUT /api/workspace-settings/<workspaceId>/publish_completed_hook
{ "value": "after-publish" }
```

The name must already be a registered server function in this workspace — a
name that is not registered is refused with a stated reason rather than saved
and silently skipped. Clear it (`""`, `null`, or `DELETE` on the same URL) to
turn the trigger off again.

**An agent can do the same three things.** The `workspace_server_functions`
tool carries `publish_trigger_get` (which function is nominated, plus the
trigger's last run, last skip and any self-pause), `publish_trigger_set` (with
`name`) and `publish_trigger_clear`. They route through the same setting, the
same "is this a function registered in this workspace" validation and the same
re-arming of a paused trigger as the owner's save above, so an agent cannot
reach a write the settings API would have refused. A session that is not
entitled to change what the platform runs on its own is refused with
`publish_trigger_not_permitted`; a name that is not registered here is refused
with `publish_trigger_invalid_function`. Neither is ever a silent no-op.

**This is the answer to "I want it to run more often than hourly."** The
platform's minimum schedule interval is **60 minutes** for every workspace, with
no per-workspace exemption and no cron-expression field — a schedule asking for
less is refused. If what you actually want is "re-sync right after I ship", the
post-publish trigger is the event-driven form of that and it fires within
seconds of the publish instead of waiting for the next tick.

```javascript
const publish = request.body;

if (publish.event === 'publish.completed') {
  await db.insert('publish_log', {
    published_at: publish.publishedAt,
    cause: publish.cause,
    publishes_folded_in: publish.publishCount,
  });
}

respond(200, { ok: true });
```

**Payload**

| Field | Description |
|-------|-------------|
| `event` | Always `"publish.completed"`. |
| `workspaceId` | The workspace that published. |
| `spaceId` | The space that was published, or `null` if it could not be named. |
| `publishedAt` | ISO 8601 timestamp of when the publish finished. |
| `cause` | `"founder_publish"` (an ordinary publish from the workspace) or `"coding_agent"` (a publish made by a coding-agent run). No other value is ever delivered. |
| `publishCount` | How many publishes this one run covers — greater than 1 when publishes were folded together by the minimum interval below. |
| `_audos` | `{ trigger: "publish-completed", publishTriggered: true, workspaceId }`. |

**Rules**

- **The trigger runs your function and nothing else. It does not re-register,
  redeploy, rebuild or change any server function by itself**, and it never
  decides which bytes are authoritative. A running server function still
  cannot write the function registry — `platform.serverFunctions` stays
  read-only, and the registry's web endpoints still answer `401` to a *running
  server function*. So the nominated function is the **detector, not the
  deployer**: it can read every function's `codeFingerprint` through
  `platform.serverFunctions.list()`, compare those against the fingerprints of
  the bytes your build produces, and report or notify on whatever differs
  (write a row, send yourself a message, fail loudly). The re-registering is
  done by a caller that lives outside the sandbox — your CI step, cron job or
  script holding a workspace API key with the `hooks:manage` scope, or an agent
  working in the workspace — which compares fingerprints and `PATCH`es only the
  functions that differ. **Never put a `hooks:manage` key in function code or
  in a workspace secret to get around the sandbox refusal.** That refusal is
  deliberate; a key placed there is a privileged credential sitting in a
  surface that is executed on request, and it buys nothing the external caller
  cannot already do.
- **Only successful publishes fire it.** A failed publish delivers nothing.
- **Only your own publishes fire it.** Platform-owned republishes — landing
  repair, workspace/product renames, crawler-snapshot minting, mailroom and
  directory seeding, startup maintenance, onboarding coordination and GitHub
  sync — are excluded, so platform maintenance can never surprise an opted-in
  workspace. That is why `cause` only ever reads `founder_publish` or
  `coding_agent`.
- **No loops.** A publish your publish-triggered run itself starts does not
  start another run. This is decided by where the publish came from, not by
  when it happened: an unrelated publish that merely overlaps a run is a real
  publish and is kept (see stacking, below), not discarded as a loop.
- **No stacking.** A publish arriving while a run is still going does not start
  a second run, and there is a **60-second minimum interval** between runs:
  publishes inside that window are coalesced into one later run, which is what
  `publishCount` reports. None of them are lost — the coalesced run happens
  even if the platform restarts before it was due. Do not assume one run per
  publish.
- **It self-pauses.** After **5 consecutive failed or refused runs** the trigger
  stops firing and records a stated reason instead of firing forever into an
  error. Re-arm it by saving the setting again (the same name is fine); reading
  `GET /api/workspace-settings/<workspaceId>/publish_completed_hook` returns the
  pause, the last run and the last skip with the rule that applied.
- **The publish never waits for you.** The run is detached with a 30-second
  ceiling. A missing, disabled, over-quota, slow or throwing function leaves the
  publish outcome completely unchanged; what you return is recorded and changes
  nothing about the publish. Check the run in the function's execution history —
  these appear with trigger `publish-completed`.
- **Do not assume the run is a fresh deploy.** Your function runs the code that
  was already registered, not the code that was just published. Make it
  idempotent.

---

## Use Cases

1. **Webhook Receivers** — Give Stripe, Mailgun, or any external service a URL to send events to
2. **Scheduled Automations** — Run daily/weekly tasks that send emails, post agent messages, or sync data (via Task Scheduler + hook action type + platform helpers)
3. **API Endpoints** — Create lightweight server-side endpoints for your space's frontend to call
4. **Data Processing** — Process form submissions, calculate analytics, transform data
5. **Email Handlers** — Process inbound emails forwarded by Mailgun
6. **AI Phone Agent Tools** — Provide live data to AI phone agents mid-call (see Phone Agent Integration below)
7. **Daily Agent Notifications** — Schedule a hook to post daily updates into the founder's own Otto chat using `platform.postAgentMessage({ ..., destination: 'founder_chat' })` (the default `'space_chat'` destination goes to a space visitor's conversation, which the desktop workspace does not render)
8. **External API Integration** — Call third-party APIs (weather, stock prices, news) and deliver results to the workspace
9. **Event-Driven Automations (via polling)** — React to workspace analytics events such as purchases with a scheduled hook that polls `/api/crm/events` (see Reacting to Workspace Events above — there is no direct event→hook trigger)

---

## Common Patterns

### Signed Webhook Receiver (verify before trusting)
```javascript
// Any provider that signs its deliveries: hash the EXACT transmitted text.
const provided = request.headers['x-hub-signature-256'] || '';
if (!request.rawBody) {
  respond(400, { error: 'no raw body — this function was not called over HTTP' });
} else {
  const expected = 'sha256=' + platform.crypto.hmac({
    secret: webhookSecret,
    payload: request.rawBody,
  });
  if (!platform.crypto.timingSafeEqual(expected, provided)) {
    respond(401, { error: 'invalid signature' });
  } else {
    const event = request.body; // parsed as usual, now trusted
    respond(200, { received: true, type: event.type });
  }
}
```

### Webhook Receiver
```javascript
const event = request.body;
console.log('Event type:', event.type);

if (event.type === 'payment_intent.succeeded') {
  console.log('Payment received:', event.data.object.amount);
  respond(200, { received: true, processed: 'payment' });
} else {
  respond(200, { received: true, processed: 'ignored' });
}
```

### Form Handler
```javascript
const { name, email, message } = request.body;

if (!name || !email) {
  respond(400, { error: 'Name and email are required' });
} else {
  console.log(`Contact form from ${name} (${email}): ${message}`);
  respond(200, { success: true, message: 'Thanks for reaching out!' });
}
```

### Scheduled Task Handler
```javascript
const { dryRun } = request.body;
const trigger = request.headers['x-trigger'];

console.log(`Running cleanup, trigger: ${trigger}, dryRun: ${dryRun}`);

if (!dryRun) {
  // Perform cleanup logic
  console.log('Cleanup completed');
}

respond(200, { cleaned: true, dryRun });
```

### Daily Agent Message (Scheduled + Platform)
Post a daily update into the **founder's own Otto chat** (My Plan). Combine with the Task Scheduler to run automatically:

**Step 1: Create the hook:**
```javascript
// Hook name: "daily-summary"
const contacts = await platform.getContacts({ limit: 100 });
const totalContacts = contacts.contacts?.length || 0;

const message = `Daily Summary (${new Date().toLocaleDateString()}):\n` +
  `Total contacts: ${totalContacts}\n` +
  `Check your dashboard for details!`;

// destination: 'founder_chat' puts this where the workspace owner reads.
// Every night appends to the same "Daily Summary" conversation, and a retried
// run of the same occurrence does not post twice.
const delivery = await platform.postAgentMessage({
  message,
  destination: 'founder_chat',
});
respond(200, { sent: true, contactCount: totalContacts, deliveredTo: delivery.deliveredTo });
```

> Omitting `destination` posts to the **space chat** instead — the visitor-facing
> surface the desktop workspace no longer renders — which is why a digest can run
> successfully every night and still be invisible to the founder.

**Step 2: Schedule it to run daily:**
```
POST /api/workspaces/:workspaceId/schedules
{
  "name": "Daily Summary to Agent",
  "frequency": "daily",
  "time": "09:00",
  "timezone": "America/New_York",
  "actionType": "hook",
  "actionPayload": {
    "hookName": "daily-summary"
  }
}
```

### External API Call
Fetch data from a third-party API and return it:
```javascript
const response = await fetch('https://api.weather.gov/gridpoints/TOP/31,80/forecast');
const data = await response.json();
const forecast = data.properties?.periods?.[0];

if (forecast) {
  respond(200, {
    temperature: forecast.temperature,
    description: forecast.shortForecast,
  });
} else {
  respond(200, { error: 'Could not fetch forecast' });
}
```

### Email Contacts with a Tag
Send a message to all contacts with a specific tag:
```javascript
const result = await platform.getContacts({ tag: 'newsletter' });
const contacts = result.contacts || [];

for (const contact of contacts) {
  await platform.sendEmail({
    to: contact.email,
    subject: 'Weekly Newsletter',
    html: '<h1>This week in our community</h1><p>Here are the highlights...</p>',
  });
}

respond(200, { sent: contacts.length });
```

### AI Phone Agent Tool
When used as a phone agent tool, `request.body` contains `args` (from the conversation) and `call` (call metadata):
```javascript
const { args, call } = request.body;
const productName = args.product || 'unknown';

const products = {
  'basic': { price: '$9/mo', features: 'Email support, 1 user' },
  'pro': { price: '$29/mo', features: 'Priority support, 5 users, API access' },
  'enterprise': { price: 'Custom', features: 'Dedicated support, unlimited users' }
};

const product = products[productName.toLowerCase()];
if (product) {
  respond(200, { result: `The ${productName} plan is ${product.price} and includes: ${product.features}.` });
} else {
  respond(200, { result: `We offer Basic ($9/mo), Pro ($29/mo), and Enterprise (custom pricing) plans.` });
}
```

To connect this hook to a phone agent, create the agent with a tool referencing this hook's name. See the AI Phone Calls integration docs for full details.

---

## Phone Agent Integration

Server Functions can be used as **mid-call tools** for AI phone agents. This allows phone agents to look up live data during conversations instead of hallucinating answers.

### How It Works

1. Create a Server Function (hook) that returns the data you need
2. When creating a phone agent via `POST /api/workspaces/:workspaceId/phone/agents`, include a `tools` array where each tool's `hookName` matches your hook's name
3. During a call, when the agent decides to use the tool, the platform executes the hook and feeds the result back to the agent to speak

### What the Hook Receives

When called by a phone agent mid-conversation, the hook's `request.body` has this structure:

```json
{
  "args": {
    "query": "value extracted from conversation by the agent"
  },
  "call": {
    "call_id": "call_abc123",
    "agent_id": "agent_xyz",
    "from_number": "+14155551234",
    "to_number": "+15551234567"
  }
}
```

- `request.body.args` — The arguments the agent extracted from the conversation, based on the tool's `parameters` schema
- `request.body.call` — Metadata about the current phone call

### Best Practices

- Return clear, speakable text in `respond(200, { result: "..." })` — the agent will read this to the caller
- Keep responses concise — long responses sound unnatural when spoken
- Handle missing/invalid args gracefully — return helpful fallback text
- Use `console.log()` for debugging — logs are captured but not spoken

### Scheduling an email for later

Pass `scheduledAt` — an ISO-8601 timestamp **in the future** — and the same
`platform.sendEmail` call registers a one-time scheduled task instead of
sending now. Nothing has to stay open and no app has to be running: the
platform's scheduler picks the task up when it comes due and sends it through
this workspace's own email domain, exactly like an immediate send.

This is the durable way to write a trial-expiry reminder, a follow-up a few
days after signup, or a "your booking is tomorrow" nudge — from server-side
code, without a browser.

```javascript
// Remind them three days before the trial ends.
const remindAt = new Date(trialEndsAt.getTime() - 3 * 24 * 60 * 60 * 1000);

const scheduled = await platform.sendEmail({
  to: customer.email,
  subject: 'Your trial ends in 3 days',
  html: '<p>Hi ' + customer.name + ' — your trial ends on ' +
        trialEndsAt.toDateString() + '.</p>',
  scheduledAt: remindAt.toISOString(),
});

if (!scheduled.success) {
  console.error('Could not schedule the reminder:', scheduled.error);
  return respond(500, { error: scheduled.error });
}

respond(200, { scheduledFor: remindAt.toISOString() });
```

**What it returns.** A scheduled call resolves to
`{ success: true, scheduled: true, schedule: { id, workspaceId, name, scheduledAt, status } }`.
`schedule.id` is the scheduled-task id, so you can store it if you later want
to look the task up. A refused schedule resolves to
`{ success: false, scheduled: false, error }` and never throws — **always check
`success`**, exactly as you would for an immediate send. Common refusals are a
`scheduledAt` that is not in the future, a malformed timestamp, and a missing
body (supply `text`, `html`, or both).

Notes and limits:

- `scheduledAt` must parse as a date and must be strictly in the future. A past
  or present timestamp is refused, not sent immediately.
- The send is one-time. For something recurring, create a **recurring schedule**
  that runs a server function on a cadence (see the `task-scheduler`
  integration) and let that function decide who to email each time.
- Attachments are immediate-send only — see the attachments section above.
- The email is delivered from the workspace's configured email domain, and
  suppression / unsubscribe handling applies exactly as it does for an
  immediate send. A suppressed recipient is skipped at send time, not at
  schedule time.
- Scheduling from inside a **dry run** intercepts the call and reports it as an
  action instead of creating a task.


---

# session-management

Source: integrations/session-management/docs.md

# Session Management Integration

User authentication and session handling with secure state management, including email verification via OTP.

## Category
Authentication

## Required API Keys
Email OTP requires no API keys. Optional Google Sign-In uses a workspace-owned
Google OAuth 2.0 Web application client ID and secret configured by a workspace
founder/admin in **Workspace → Integrations → Google Sign-In**. Do not use
generic BYOK/custom API keys for Google Sign-In.

## Optional Google Sign-In (Beta — published app end users only)

<!-- MANIFEST:INTRO -->
Generated Space apps support email OTP alongside optional **Google Sign-In
(Beta)** for end users of published founder-built workspace apps. Google
Sign-In never authenticates Audos founder/admin accounts; Audos founder/admin
login remains email OTP only.

Each workspace founder/admin supplies that workspace's own Google OAuth 2.0
client ID and client secret. Audos provides no shared platform Google client.
Generic BYOK/custom API keys are not the setup path. Create the credential in
Google Cloud as a **Web application**, then
open **Workspace → Integrations → Google Sign-In**.

Google's client form has two URI boxes. It shows **Authorized JavaScript
origins** first; this server-side flow does not use it, so leave that box
empty. Redirect URIs pasted there are rejected with `Invalid Origin: URIs must
not contain a path or end with "/"` — clear that box and use the **Authorized
redirect URIs** box below it instead.

The card displays every exact Authorized redirect URI for the platform host,
default workspace host,
and any verified custom/secondary-domain hosts. Copy **all** displayed URIs
into Google Cloud; every URI ends in
`/api/auth/social/google/callback`. The URI set is workspace/domain-specific,
not one global platform callback, and the card is the authoritative source for
the exact values.

Setup order is **save credentials → copy all displayed redirect URIs into
Google Cloud → enable → test**. Enabling injects the `google` provider into the
published EmailGate at serve time, so enabling/disabling does not require an app
republish. Separate security-template rollout or compatibility requirements,
when applicable, remain governed by their own rollout guidance.
<!-- MANIFEST:END -->

The stock EmailGate renders the Google button only when the platform injects
`window.__SOCIAL_PROVIDERS__ = ["google"]`. App code must not hardcode the
provider, invent callback URLs, implement the token exchange, or store the
client secret. The platform-owned flow starts at
`GET /api/auth/social/google?workspaceId=...&spaceId=...&returnUrl=...`.

Email OTP remains the default and fallback. Founders turn published-app email
OTP on or off under **Workspace → Integrations → Email OTP**. New workspaces
are enabled by default. Older workspaces with no setting stay off until a
founder/admin enables that card. Enabling does not require an app republish.
There is no generic password-login route. If a new app explicitly requires its
own non-Google credential system, use the reviewed Server Function seam below.

<!-- MANIFEST:NOTES — this section is emitted into APP_INTEGRATION_MANIFEST.md (headings nested) by scripts/generate-app-integration-manifest.ts. Keep it consistent with server-functions' "Credential Sign-In Hooks". -->
## Custom Credential Sign-In (NEW generated apps only)

Email OTP remains the default. When a new app explicitly requires its own
password or other credential, verify that credential inside a registered
Server Function and follow the `server-functions` integration's credential-hook
contract. Never implement credential verification in the browser.

The browser call must be a root-relative, same-origin `POST` and must include
`credentials: 'include'`. The hook must return an explicit failure for rejected
credentials and, after genuine server-side verification, a stable subject plus
email in its JSON success response. Treat that response only as app UI state.
The platform may separately establish a signed HttpOnly `hook_credential`
cookie that authorizes private WorkspaceDB identity for that workspace.
`hook_credential` is not OTP verification and does not grant founder,
delegation, mailroom, or other strict-email privileges.

Until a reviewed binding exists for that exact hook version — and by default
none does — a hook success creates NO platform session. Never treat a stored
"signed in" record that carries no platform session id as signed in: the
platform reads that browser as an anonymous visitor, so the person's private
rows stay invisible and every private write is refused with
`SESSION_VERIFICATION_REQUIRED`. Clear such a record and send the person back
through platform OTP.

A response shape alone is not authority: hook names, hook metadata, caller
headers, and `_meta.success` cannot activate this path. The platform-owned,
reviewed binding pins the workspace, immutable hook ID, exact code hash/version,
`POST` method, success predicate, and identity extractors. Changing the hook
source stops recognition until that exact version is reviewed again. If no
reviewed binding exists, use platform OTP rather than assuming the hook response
created a WorkspaceDB identity.

Never set `verified`, `sessionVerified`, `canonicalSessionId`,
`workspaceSessionId`, or `X-Session-Id` in page JavaScript for custom
credential auth. The cookie is HttpOnly; the WorkspaceDB transport sends it
without exposing it to the page. A paired, reviewed `POST` logout hook should
revoke that grant; clearing UI state alone is not server-side logout.

Existing deployed apps do not need to adopt this contract, change hooks, or
republish. Their recognition is handled separately by platform-owned fleet
review.

```typescript
async function signInWithCustomCredential(
  configId: string | number,
  hookName: string,
  credential: { email: string; password: string },
) {
  const response = await fetch(
    `/api/hooks/execute/workspace-${configId}/${encodeURIComponent(hookName)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
    },
  );
  const result = await response.json();
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'Sign-in failed');
  }

  // App UI state only. Do not manufacture platform verification/session fields.
  return result;
}
```
<!-- MANIFEST:END -->

## Quick Start

Register first. The response contains `workspaceId`,
`provisionalSessionToken`, and `workspaceSessionId: null`. Use the provisional
token only for OTP send and verify.

```typescript
/*
 * NEW generated apps only: custom credentials use a reviewed registered POST
 * hook called by same-origin fetch with credentials: 'include'.
 * A response shape alone is not authority; platform-owned exact-version
 * recognition may set a scoped HttpOnly WorkspaceDB cookie.
 * Never set verified, sessionVerified, canonicalSessionId, workspaceSessionId,
 * or X-Session-Id in page JavaScript for custom credential auth.
 * Existing deployed apps do not need to adopt this contract.
 */
// Email OTP remains supported alongside optional workspace-configured Google
// Sign-In for published app end users. The stock EmailGate owns Google provider
// rendering; do not hardcode provider buttons or OAuth callback URLs here.
const registrationResponse = await fetch(`/api/space/${spaceId}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
});
const registration = await registrationResponse.json();
if (
  !registrationResponse.ok ||
  !registration.workspaceId ||
  !registration.provisionalSessionToken ||
  registration.workspaceSessionId !== null
) {
  throw new Error(registration.error || 'Registration failed');
}

const { workspaceId, provisionalSessionToken } = registration;
const binding = {
  email,
  workspaceId,
  spaceId,
  sessionUuid: provisionalSessionToken,
};

const sendResponse = await fetch('/api/auth/otp/space/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(binding),
});
const sendData = await sendResponse.json();
if (sendResponse.status === 429) {
  throw new Error(`Try again in ${sendData.retryAfter} seconds`);
}
if (!sendResponse.ok) throw new Error(sendData.error || 'Failed to send code');

const verifyResponse = await fetch('/api/auth/otp/space/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...binding, code }),
});
const data = await verifyResponse.json();
if (
  !verifyResponse.ok ||
  data.success !== true ||
  data.sessionVerified !== true ||
  typeof data.canonicalSessionId !== 'string'
) {
  throw new Error(data.error || 'Verification failed');
}

const canonicalSessionId = data.canonicalSessionId;
const workspaceSessionId = data.workspaceSessionId;
const sessionKey = `space_session_${spaceId}`;
try {
  localStorage.setItem(sessionKey, JSON.stringify({
    id: canonicalSessionId,
    workspaceSessionId: canonicalSessionId,
    workspaceId,
    email,
    verified: true,
    timestamp: Date.now(),
  }));
} catch {
  // Verification still succeeded; keep the canonical ID in memory.
}

async function lookupSpaceSession(
  workspaceId: string,
  workspaceSessionId: string,
) {
  const query = new URLSearchParams({
    workspaceId,
    sessionUuid: workspaceSessionId,
  });
  const response = await fetch(`/api/auth/otp/space/check-session?${query}`);
  if (!response.ok) throw new Error('Session lookup failed');
  return response.json();
}

async function logoutSpaceSession(spaceId: string, sessionId?: string) {
  // The platform session cookie is HttpOnly, so page code cannot clear it.
  // POST the platform logout FIRST: it expires the cookie and invalidates the
  // session server-side, so a replayed cookie no longer signs the visitor in.
  // Send the session id this app is holding as well. One visitor routinely
  // has several valid sign-in records and the cookie names only one of them,
  // so without the id the record your app is actually using stays alive. The
  // platform ends a named record only when your own cookie proves the same
  // person in the same workspace, and the response reports per target what
  // was ended and what was not.
  try {
    const sharedSpacePath = `/space/${encodeURIComponent(spaceId)}`;
    const logoutUrl = window.location.pathname === sharedSpacePath
      ? `${sharedSpacePath}/logout`
      : `/api/space/${encodeURIComponent(spaceId)}/logout`;
    await fetch(logoutUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId ? { 'X-Session-Id': sessionId } : {})
      },
      body: JSON.stringify(sessionId ? { sessionId } : {})
    });
  } catch {}
  try {
    localStorage.removeItem(`space_session_${spaceId}`);
  } catch {}
}
```

Send and resend rate limits use this response envelope:

```json
{
  "success": false,
  "error": "Please wait before requesting another code",
  "retryAfter": 60
}
```

## Supported Session Routes

### Register a Provisional Session
```
POST /api/space/{spaceId}/register
```

### Send an OTP Code
```
POST /api/auth/otp/space/send
```

### Verify OTP and Return the Canonical Session
```
POST /api/auth/otp/space/verify
```

### Look Up an Exact Verified Session
```
GET /api/auth/otp/space/check-session?workspaceId={workspaceId}&sessionUuid={sessionUuid}
```

### Restore a Session on a Cold Start (no stored session id)
```
GET /api/auth/otp/space/check-session?workspaceId={workspaceId}
```
Send it with `credentials: 'include'`. The platform answers from its own
HttpOnly session cookie when the browser has no stored session id. See
"Session Lifetime, Multiple Devices, and Cold-Start Restore" below.

### Resend an OTP Code
```
POST /api/auth/otp/space/resend
```

### Resend an OTP Code (Backwards-Compatible Alias)
```
POST /api/otp/space/resend
```

Signing out means `POST /api/space/${spaceId}/logout` on a custom domain, or
`POST /space/${spaceId}/logout` when the app is served at that exact shared
platform path, with
`credentials: 'include'`, then removing `space_session_${spaceId}` and clearing
the app's in-memory session state. The platform call is required, not optional:
the session cookie is HttpOnly, so only the platform can expire it, and it also
invalidates the session server-side so a replayed cookie cannot sign the
visitor back in. Send the session id your app is holding with the call — the
`X-Session-Id` header or a `{ "sessionId": "..." }` body, the same identifier
you already send on every other session-bearing call. One visitor routinely
holds several valid sign-in records and the cookie names only one of them, so
without the id the record the app is actually using stays signed in. A named
record is ended only when your own cookie proves the same person in the same
workspace; anything else is refused with a stated reason. The canonical session
record remains so the user can prove the same email again later without losing
workspace data.

## Session Lifetime, Multiple Devices, and Cold-Start Restore

**The verified session does not expire on the server.** Once verify answers
`sessionVerified: true`, the canonical `wses_` session stays valid until the
visitor signs out. `check-session` keeps answering `verified: true` for it —
there is no server-side idle timeout or maximum age.

**The browser-side sign-in marker lasts 30 days and refreshes.** Alongside the
canonical session the platform sets its own signed, HttpOnly session cookie
with a 30-day lifetime, and every authorized `check-session` re-issues it. A
visitor who comes back within 30 days rolls forward indefinitely; a browser left
untouched for longer signs in again. Page code can neither read nor extend that
cookie — only the platform can.

**Several devices can be signed in at the same time.** Each device verifies
into its own session under the same email identity, and signing in on a phone
never signs the laptop out. Sessions are not capped or evicted per identity.

**Cold-start restore: ask with no session id.** Browsers — Safari/iOS in
particular — delete page-written `localStorage` for sites that go unvisited for
about a week, so a returning visitor can arrive with no
`space_session_<spaceId>` at all while the platform cookie is still valid. Call
check-session with only `workspaceId` and `credentials: 'include'`:

```typescript
const res = await fetch(
  `/api/auth/otp/space/check-session?workspaceId=${workspaceId}`,
  { credentials: 'include' },
);
const data = await res.json();
if (
  typeof data.canonicalSessionId === 'string' &&
  (data.verified === true ||
    (data.authorized === true && data.identityMode === 'legacy_registration'))
) {
  // Still signed in: adopt data.canonicalSessionId and enter the space.
}
```

The platform resolves the visitor from its cookie and applies exactly the same
checks as an id-bearing call. A missing, forged, expired, wrong-workspace, or
signed-out cookie gets the ordinary
`{ "verified": false, "authorized": false }` answer — never a distinct error or
message — so fall through to the normal register → send → verify flow. Make
this call once on a cold start, not on every render.

On the shared platform origin, the session cookie is deliberately scoped to
`/space/${spaceId}` so one workspace's cookie is never sent through another
workspace's route. Use
`GET /space/${spaceId}/check-session` there (with no client-supplied workspace
id). Keep using `/api/auth/otp/space/check-session` on custom domains, and send
both `workspaceId` and `spaceId`.

**Sign-out still wins.** Use the matching custom-domain or shared-path logout
endpoint described above; it records the sign-out server-side, so a replayed
cookie can no longer restore that session.

---

## Email Verification (OTP)

Verify user emails via one-time passcodes. This upgrades anonymous sessions to verified sessions with the user's email attached.

### CRITICAL: Registration Binding Must Exist Before OTP

All OTP send and verify calls require the `workspaceId` and
`provisionalSessionToken` returned by register. They also require the same
`spaceId` and email used for registration. A durable workspace session does
not exist until verification succeeds.

### Required Flow (All Cases)

```
1. Register session  →  POST /api/space/{spaceId}/register
                         Returns: workspaceId, provisionalSessionToken
                         
2. Send OTP          →  POST /api/auth/otp/space/send
                         Requires: email, workspaceId, spaceId,
                                   sessionUuid: provisionalSessionToken
                         
3. Verify OTP        →  POST /api/auth/otp/space/verify
                         Requires: email, code, workspaceId, spaceId,
                                   sessionUuid: provisionalSessionToken
                         Returns: canonicalSessionId when sessionVerified=true
```

### Returning Visitor Flow

Resume only a stored canonical session that the server confirms as verified:

```
1. Read a locally stored session with a workspaceSessionId and either
   verified=true or (authorized=true and identityMode="legacy_registration").
2. Check that exact session       →  GET /api/auth/otp/space/check-session
                                      Query: { workspaceId, sessionUuid }
3. If the server answers verified=true (or authorized=true with
   identityMode="legacy_registration") and the email matches, resume it.
4. Otherwise, use the full register → send → verify flow above.
```

An email-only lookup is not identity proof. Never replace a verified stored
session with a provisional token.

---

### Resume an Exact Verified Session

Use only a canonical session ID that this browser already stored after
successful verification. An email address alone cannot resume a session.

```
GET /api/auth/otp/space/check-session?workspaceId={workspaceId}&sessionUuid={sessionUuid}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "email": "user@example.com",
  "verifiedAt": "2025-01-15T12:00:00Z"
}
```

### Log Out

```
POST /api/space/{spaceId}/logout
```

Call the platform logout FIRST, then remove only the current Space's local
session record and reset the runtime state:

```typescript
// `sessionId` is the canonical session this app is holding — the same value
// you send as X-Session-Id everywhere else. Name it here, or the record the
// app is using stays signed in even though the cookie's record was ended.
try {
  const sharedSpacePath = `/space/${encodeURIComponent(spaceId)}`;
  const logoutUrl = window.location.pathname === sharedSpacePath
    ? `${sharedSpacePath}/logout`
    : `/api/space/${encodeURIComponent(spaceId)}/logout`;
  await fetch(logoutUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {})
    },
    body: JSON.stringify(sessionId ? { sessionId } : {})
  });
} catch {}
try {
  localStorage.removeItem(`space_session_${spaceId}`);
} catch {}
// Reset your component's in-memory session state here.
```

The endpoint always acts on the session in the caller's own cookie: it expires
that HttpOnly cookie and records the sign-out server-side, so the old cookie
stops authenticating everywhere. It also ends the session you NAME in the
`X-Session-Id` header or the `sessionId` body field, but only when your own
cookie proves the same person in the same workspace — a record belonging to
somebody else, one in another workspace, a header and body that disagree, and
an unknown id are each refused with their own reason. The response reports
`results`, one entry per target, saying what was ended and why anything was
not; `signedOut` stays true when any target was ended. A later sign-in issues a
new cookie and is unaffected, and a genuinely separate device stays signed in.
Skipping the call leaves the next person on a shared browser signed in as the
previous visitor.

Do not delete the CRM contact or canonical workspace session as a logout
substitute.

<!-- MANIFEST:NOTES — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Log Out" above. -->
Signing out is a PLATFORM call: the space session cookie is HttpOnly, so
page code cannot clear it. `POST /api/space/{spaceId}/logout` (or
`/space/{spaceId}/logout` when the page is served on the shared space path)
expires the cookie and invalidates the session server-side; clearing
`localStorage` alone leaves the next person on a shared browser signed in.
Send the session id the app is holding with the call — the `X-Session-Id`
header or a `{ "sessionId": "..." }` body — or the record the app is actually
using stays signed in, because the cookie names only one of a visitor's
several valid records. A named record is ended only when your own cookie
proves the same person in the same workspace; the response reports `results`,
one entry per target, saying what was ended and why anything was not.
<!-- MANIFEST:END -->

### Send OTP Code

```
POST /api/auth/otp/space/send
```

**Request:**
```json
{
  "email": "user@example.com",
  "workspaceId": "d915c389-2314-447f-bd96-f6acfcc6fb92",
  "spaceId": "workspace-123",
  "sessionUuid": "short-lived-token"
}
```

All four fields are required. `sessionUuid` is the provisional token returned
by register.

**Response:**
```json
{
  "success": true,
  "message": "Verification code sent to your email.",
  "expiresIn": 300,
  "resendCooldown": 60
}
```

### Verify OTP Code

```
POST /api/auth/otp/space/verify
```

**Request:**
```json
{
  "email": "user@example.com",
  "code": "1234",
  "workspaceId": "d915c389-2314-447f-bd96-f6acfcc6fb92",
  "spaceId": "workspace-123",
  "sessionUuid": "short-lived-token"
}
```

All five fields are required.

**Response (success):**
```json
{
  "success": true,
  "verified": true,
  "sessionVerified": true,
  "email": "user@example.com",
  "canonicalSessionId": "wses_907c886ac0ea4042a0d5ca35f47c0b66",
  "workspaceSessionId": "wses_907c886ac0ea4042a0d5ca35f47c0b66"
}
```

**Response (invalid code):**
```json
{
  "success": false,
  "error": "Invalid or expired code",
  "attemptsRemaining": 2
}
```

### Resend OTP Code

Preferred path:
```
POST /api/auth/otp/space/resend
```

Backwards-compatible path:
```
POST /api/otp/space/resend
```

**Request:**
```json
{
  "email": "user@example.com",
  "workspaceId": "d915c389-2314-447f-bd96-f6acfcc6fb92",
  "spaceId": "workspace-123",
  "sessionUuid": "short-lived-token"
}
```

All four fields are required. Use the same registration binding as the first
send. The response has the same shape as the send response.

---

## OTP Configuration

Configure email verification settings for your space. OTP is enabled by default
for new workspaces. Founders and admins should use **Workspace → Integrations →
Email OTP** (authenticated) rather than calling this route from app code.

### Get OTP Configuration

```
GET /api/auth/otp/space/config/{workspaceId}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "enabled": true,
    "trigger": "always",
    "triggerActions": [],
    "triggerRoutes": []
  }
}
```

### Update OTP Configuration

```
PUT /api/auth/otp/space/config/{workspaceId}
```

**Request (enable OTP for all pages):**
```json
{
  "enabled": true,
  "trigger": "always"
}
```

**Request (enable OTP for specific routes only):**
```json
{
  "enabled": true,
  "trigger": "on_route",
  "triggerRoutes": ["/checkout/*", "/account/*"]
}
```

**Request (enable OTP for specific actions only):**
```json
{
  "enabled": true,
  "trigger": "on_action",
  "triggerActions": ["checkout", "submit_order", "request_quote"]
}
```

**Request (disable OTP):**
```json
{
  "enabled": false
}
```

---

## Soft Verification (Checkpoint Triggers)

### Check if OTP is Required

```
POST /api/auth/otp/space/check-required
```

**Request:**
```json
{
  "workspaceId": "d915c389-2314-447f-bd96-f6acfcc6fb92",
  "sessionUuid": "wses_907c886ac0ea4042a0d5ca35f47c0b66",
  "action": "checkout",
  "route": "/checkout/confirm"
}
```

**Response:**
```json
{
  "success": true,
  "required": true,
  "reason": "Route matches checkpoint pattern"
}
```

### Trigger Types

| Trigger | Description | Use Case |
|---------|-------------|----------|
| `always` | Require verification on every page load | High-security apps, gated content |
| `on_action` | Require verification for specific actions | Checkout, form submissions |
| `on_route` | Require verification for specific routes | Account pages, checkout flow |

### Common Configuration Scenarios

| Entrepreneur Request | Config to Use |
|---------------------|---------------|
| "Require email to access the app" | `{ "enabled": true, "trigger": "always" }` |
| "Only require email at checkout" | `{ "enabled": true, "trigger": "on_route", "triggerRoutes": ["/checkout/*"] }` |
| "Require email for account pages" | `{ "enabled": true, "trigger": "on_route", "triggerRoutes": ["/account/*", "/profile/*"] }` |
| "Require email when submitting forms" | `{ "enabled": true, "trigger": "on_action", "triggerActions": ["submit_form", "request_quote"] }` |
| "Disable email verification" | `{ "enabled": false }` |

**Note:** OTP verification is enabled by default (`trigger: "always"`) for all new workspaces.

---

## Usage Example: Delayed OTP with Upfront Verification for Returning Visitors

This pattern lets new visitors enter the space freely (delayed OTP inside the experience), while returning visitors whose email was previously verified get OTP upfront.

```tsx
import { useState, useEffect } from 'react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';

function SmartEmailGate({ children, spaceId, workspaceId }: { 
  children: React.ReactNode;
  spaceId: string;
  workspaceId: string;
}) {
  const { setSessionId } = useSpaceRuntime();
  const [step, setStep] = useState<'checking' | 'otp' | 'code' | 'pass'>('checking');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pendingBinding, setPendingBinding] = useState<{
    token: string;
    workspaceId: string;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    checkReturningVisitor();
  }, []);

  const checkReturningVisitor = async () => {
    const sessionKey = `space_session_${spaceId}`;
    const stored = localStorage.getItem(sessionKey);
    
    if (!stored) {
      setStep('pass');
      return;
    }
    
    try {
      const session = JSON.parse(stored);
      if (
        session.verified !== true ||
        !session.email ||
        !session.workspaceSessionId
      ) {
        setStep('pass');
        return;
      }
      
      const query = new URLSearchParams({
        workspaceId,
        sessionUuid: session.workspaceSessionId,
      });
      const res = await fetch(`/api/auth/otp/space/check-session?${query}`);
      const data = await res.json();
      
      if (
        data.verified === true &&
        data.email?.toLowerCase() === session.email.toLowerCase()
      ) {
        setSessionId(session.workspaceSessionId);
        setStep('pass');
      } else {
        setEmail(session.email);
        localStorage.removeItem(sessionKey);
        setStep('pass');
      }
    } catch {
      setStep('pass');
    }
  };

  const sendOtp = async () => {
    setError('');
    
    const visitorId = getVisitorId();
    const regRes = await fetch(`/api/space/${spaceId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        sessionId: visitorId,
        visitorId,
        metadata: {},
      }),
    });
    const regData = await regRes.json();
    
    if (!regRes.ok) {
      setError(regData.error || 'Failed to register session');
      return;
    }
    
    const token = regData.provisionalSessionToken;
    const resolvedWorkspaceId = regData.workspaceId;
    if (!token || !resolvedWorkspaceId) {
      setError('Registration did not return an OTP binding');
      return;
    }
    setPendingBinding({ token, workspaceId: resolvedWorkspaceId });
    
    const otpRes = await fetch('/api/auth/otp/space/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        workspaceId: resolvedWorkspaceId,
        spaceId,
        sessionUuid: token,
      }),
    });
    
    if (otpRes.ok) {
      setStep('code');
    } else {
      const otpData = await otpRes.json();
      setError(otpData.error || 'Failed to send code');
    }
  };

  const verifyOtp = async () => {
    if (!pendingBinding) {
      setError('Session expired. Please try again.');
      setStep('otp');
      return;
    }
    
    const res = await fetch('/api/auth/otp/space/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        code,
        workspaceId: pendingBinding.workspaceId,
        spaceId,
        sessionUuid: pendingBinding.token,
      }),
    });
    const data = await res.json();
    
    const canonicalSessionId = data.canonicalSessionId;
    if (
      res.ok &&
      data.success === true &&
      data.sessionVerified === true &&
      typeof canonicalSessionId === 'string' &&
      canonicalSessionId.startsWith('wses_')
    ) {
      const sessionKey = `space_session_${spaceId}`;
      localStorage.setItem(sessionKey, JSON.stringify({
        id: canonicalSessionId,
        workspaceSessionId: canonicalSessionId,
        email,
        verified: true,
        timestamp: Date.now(),
      }));
      setSessionId(canonicalSessionId);
      setStep('pass');
    } else {
      setError(data.error || 'Invalid code');
    }
  };

  if (step === 'checking') return <div>Loading...</div>;
  if (step === 'pass') return <>{children}</>;

  if (step === 'otp') {
    return (
      <div>
        <h2>Welcome back!</h2>
        <p>We'll send a verification code to {email}</p>
        <button onClick={sendOtp}>Send Code</button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div>
        <h2>Enter verification code</h2>
        <p>We sent a 4-digit code to {email}</p>
        <input 
          type="text" 
          value={code} 
          onChange={e => setCode(e.target.value)} 
          maxLength={4}
        />
        <button onClick={verifyOtp}>Verify</button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  return null;
}
```

## Session Policies: OTP-Enabled vs Legacy Registration (OTP-Disabled)

Every workspace has an authoritative server-side OTP policy. The register
response tells your app which contract applies — read the flags, never guess:

| Register response field | OTP enabled | OTP disabled (legacy) |
|-------------------------|-------------|-----------------------|
| `otpRequired` | `true` | `false` |
| `legacyAuthorized` | `false` | `true` (or `false` when the server reused an already verified session) |
| `identityMode` | `"pending_verification"` | `"legacy_registration"` (or `"strict_verified"` when a verified session was reused) |
| `sessionVerified` | `false` until OTP verify succeeds | `false` (legacy sessions are authorized, not verified) |

### OTP-enabled workspaces (strict)

Follow the full register → send → verify flow above. Only a verify response
with `sessionVerified=true` and a `canonicalSessionId` creates usable identity.

### OTP-disabled workspaces (legacy registration)

When register answers `otpRequired: false`, `legacyAuthorized: true`, and
`identityMode: "legacy_registration"`, the server has already authorized the
returned `wses_` session for that registration email — no OTP step exists.
Store the session like this:

```json
{
  "workspaceSessionId": "wses_...",
  "email": "user@example.com",
  "verified": false,
  "authorized": true,
  "identityMode": "legacy_registration"
}
```

Rules for the legacy contract:

- **Never set `verified: true` client-side.** Verification only ever comes from
  a successful OTP verify. `authorized` and `identityMode` are server flags —
  copy them from the register or check-session response verbatim.
- **Treat the legacy session as usable identity.** Identity-bearing calls
  (chat history and threads, subscription status, saved cards, workspace data,
  tracking) accept an authorized legacy session at OTP-disabled workspaces.
  The server re-checks the policy on every request and still refuses email
  mismatches, forged ids, and cross-workspace sessions.
- **check-session covers both policies.** For a legacy session,
  `GET /api/auth/otp/space/check-session` answers
  `{ "verified": false, "authorized": true, "identityMode": "legacy_registration", "email": "..." }`.
  Resume the session when `verified === true` OR
  (`authorized === true` and `identityMode === "legacy_registration"`);
  refuse everything else.
- **Fall back gracefully.** If the workspace later enables OTP, legacy
  sessions start failing with `401 SESSION_VERIFICATION_REQUIRED` — send the
  user through the full register → send → verify flow.

---

## Key Rules

1. **Always register before OTP** — Register returns a short-lived provisional token, not a workspace session.
2. **Keep the binding intact** — Send and verify the same email, workspace, space, and provisional token.
3. **Trust only explicit success** — Store a canonical session only when verify returns `success=true`, `sessionVerified=true`, and a valid `canonicalSessionId`.
4. **Resume the exact session** — Check a stored canonical session by its `workspaceSessionId`. An email-only check is not authorization.
5. **Do not store provisional tokens as sessions** — Keep the provisional token in memory and replace it only after successful verification.
6. **Honor both session policies** — At OTP-disabled workspaces the server authorizes the registration session directly (`legacyAuthorized=true`, `identityMode="legacy_registration"`). Treat that as usable identity, but never mark it `verified` client-side.

## Route Aliases

The OTP endpoints are available at both paths:
- `/api/auth/otp/space/...` (preferred)
- `/api/otp/space/...` (backwards-compatible alias)

## Use Cases
- Email capture for lead generation
- Gated content access
- Checkout verification
- Account security
- User identification without passwords
- Returning visitor re-verification


---

# space-chat

Source: integrations/space-chat/docs.md

# Space Chat Threads Integration

Read, list, rename, and delete the conversation history between your customers and the space's AI assistant.

## Category
Conversations

## Required API Keys
None. Every call requires the visitor's canonical workspace session id (`wses_...`) —
a verified session (OTP flow), or at OTP-disabled workspaces a server-authorized
legacy registration session (see "Both session policies work" below).

## What this is

Every message a visitor exchanges with the space assistant is stored server-side against
their **workspace session** (`wses_...`), grouped into **threads** (conversations). The
threaded chat shell in the space uses exactly these endpoints, and so can your app —
this is how you build a conversation sidebar, a "my past chats" screen, a support
transcript view, or a "delete my data" control.

Key ids:

| Id | Looks like | Where it comes from |
|----|-----------|---------------------|
| `spaceId` | `workspace-12345` | The space's own id (`window.__SPACE_ID__`, or the id your app was mounted with) |
| `sessionId` | `wses_907c886ac0ea...` | The `workspaceSessionId` stored under `space_session_{spaceId}` — after successful OTP verification (`verified: true`), or at OTP-disabled workspaces straight from register (`authorized: true`, `identityMode: "legacy_registration"`; see the `session-management` integration) |
| `threadId` | `main`, `t_1739481…` | Any string you choose. `main` is the primary conversation and always exists |

**A `sessionId` that does not start with `wses_` is rejected** by the thread endpoints
(`400`). The session must prove identity under the workspace's session policy and belong
to **this space's workspace**. Unknown or unauthorized sessions are refused, so one
visitor cannot read, rename, or erase another visitor's conversations.

**Both session policies work.** At OTP-enabled workspaces only a verified session is
accepted. At OTP-disabled workspaces the server also accepts the authorized legacy
registration session (`verified: false`, `authorized: true`,
`identityMode: "legacy_registration"`) — the server resolves this policy itself on every
call; the client never claims verification.

`GET /chat/history` and `POST /chat/stream` enforce the same boundary: a session that
belongs to another workspace is refused — `403 session_workspace_mismatch` on the history
read, and an SSE `error` event carrying the same code on the stream. Still treat a `wses_`
id as a bearer credential: never render it into a shareable URL, never log it, and never
accept one from untrusted input as proof of who the visitor is.

## API Endpoints

### List conversations
```
GET /api/space/{spaceId}/chat/threads
```

`sessionId` is a **query parameter here** (`?sessionId=wses_...`). Required.

**Response:**
```json
{
  "threads": [
    {
      "threadId": "main",
      "title": "Order status",
      "messageCount": 12,
      "lastMessageAt": "2026-08-12T09:14:22.000Z",
      "createdAt": "2026-08-01T17:02:10.000Z",
      "isCustomName": false
    }
  ],
  "workspaceSessionId": "wses_907c886ac0ea..."
}
```

- Ordered newest activity first. `title` is the stored name when one was set
  (`isCustomName: true`), otherwise it is derived from the thread's first real user
  message.
- Pre-thread history rolls up into `main`, so an older session still lists one thread.
- An unknown session — or an unverified one that the workspace's OTP policy does not
  authorize — is refused with `401 { "code": "SESSION_VERIFICATION_REQUIRED" }`.
- A missing or non-`wses_` `sessionId` answers `400 { "error": "sessionId (wses_...) is required" }`.

### Read one conversation's messages
```
GET /api/space/{spaceId}/chat/history
```

Query parameters: `sessionId=wses_...` is required. `threadId=...` and `email=...` are
optional. When `email` is present, it must match the session's server-resolved identity
(the verified email, or the legacy registration email at OTP-disabled workspaces).
`sessionId` is **query-only here too**. Omit `threadId` to get every message in the
session across all threads.

**Response:**
```json
{
  "hasHistory": true,
  "summary": { "role": "system", "content": "..." },
  "messages": [{ "role": "user", "content": "Where is my order?" }],
  "messageCount": 12,
  "messagesInContext": 12,
  "workspaceSessionId": "wses_907c886ac0ea..."
}
```

Returns the most recent 100 messages. Internal booster/reminder messages are filtered
out. Unknown, unverified, mismatched-workspace, and mismatched-email sessions are
refused. `workspaceSessionId` is the same canonical verified id that the request sent.

### Create a conversation / send a message
```
POST /api/space/{spaceId}/chat/stream
```
<!-- MANIFEST:ENDPOINT POST /api/space/{spaceId}/chat/stream | Create a conversation / send a message (optional `toolScope` narrows the tools sent to the model for that turn) -->

There is no "create thread" endpoint. A thread comes into existence the moment the first
message is streamed with its `threadId`. `sessionId` and `threadId` travel in the
**request body** here.

**Request:**
```json
{
  "message": "Where is my order?",
  "sessionId": "wses_907c886ac0ea...",
  "threadId": "t_1739481000000",
  "threadTitle": "Order status",
  "toolScope": ["get_order_status", "list_recent_orders"]
}
```

The response is a Server-Sent Events stream (`text/event-stream`). `threadTitle` is
optional and applied **only if the conversation has no name yet** — it never overwrites
a name the visitor chose. Omit `threadId` to write into `main`.

#### `toolScope` — send only the tools this screen needs

Every registered customer tool's full definition is sent to the model on **every**
turn, before the visitor has typed anything. A large registry can therefore eat most
of the model's context window as a fixed cost: at ~200 tools the agent starts each
turn roughly half full, long conversations lose context to compaction, and a turn can
eventually be refused outright.

`toolScope` is the fix. Send the names of the tools the current screen or phase
actually needs and only those definitions go to the model for that one turn:

```js
await fetch(`/api/space/${spaceId}/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message,
    sessionId,
    threadId,
    // The checkout screen only ever needs these three.
    toolScope: ["get_cart", "list_shipping_options", "apply_promo_code"],
  }),
});
```

Rules — it is a **narrowing hint**, never a grant:

| Behaviour | What happens |
|-----------|--------------|
| Field omitted, `null`, or `[]` | The full registered list is sent. Identical to before this field existed — nothing changes for an app that never sends it |
| A name your workspace registered | That tool is offered this turn |
| A name your workspace never registered | Silently ignored. `toolScope` selects **from** your registry; it can never introduce a tool or grant access to anything |
| **Every** name unrecognised | Treated as no scope at all — the full list is sent. A typo can never leave the agent with no tools |
| Not an array, or non-string entries | Ignored / dropped. Max 500 names, 200 characters each |

It applies to that single request only; it is not saved, and it never changes your
registry. Nothing is removed from what you registered — a later turn with no
`toolScope` gets everything back.

Scope per screen, not per message: list the tools that screen's conversation could
plausibly need, so the agent is not blocked mid-task. See the `mcp-agent-tools`
integration docs for the registry itself.

<!-- MANIFEST:NOTES — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the `toolScope` section above. -->
The template runtime also forwards an optional `agent.toolScope` array from
the baked, file, or public space config on every stream turn (including an
automatic greeting). It is a narrowing hint only: omitted, empty, or
unknown-only scopes preserve the server's existing full-toolset behavior; the
browser never invents tool names.
<!-- MANIFEST:END -->

#### The final stream event (model + prompt-cache report)

Each SSE frame is `data: {json}`. The **last** frame of a successful turn is its
`result` event. It reports which model answered and how much of the prompt was served
from cache, so you can check cache behaviour yourself instead of asking support:

```json
{
  "type": "result",
  "data": {
    "response": "Your answer...",
    "answeredByModel": "claude-haiku-4-6",
    "cachedPromptTokens": 156320,
    "newPromptTokens": 1204,
    "durationMs": 4820
  },
  "timestamp": 1739481004820
}
```

| Field | Meaning |
|-------|---------|
| `answeredByModel` | The model that actually served this turn — the workspace's chosen chat model when one is set, otherwise the platform default |
| `cachedPromptTokens` | Prompt tokens **read from cache**. A large number here is a cache hit: that part of the prompt was not re-sent or re-billed at full rate |
| `newPromptTokens` | Prompt tokens **freshly written** to the cache on this turn (a cold or partially-cold prefix) |
| `durationMs` | Wall-clock duration of the turn, in milliseconds |

Read the cache ratio as `cachedPromptTokens / (cachedPromptTokens + newPromptTokens)`.
Steady turns on a warm prefix report a high ratio; a genuinely cold turn reports
`cachedPromptTokens: 0`. `answeredByModel` is the ground truth for "which model is my
visitor chat on?" — it is the model the turn was billed against.

These four fields are additive and stably named. Older frames also carry the raw
`model`, `usage` and `duration` fields they always had; a preceding `progress` frame
with `data.message: "Completed"` carries the same named report for progress consumers.
Prefer the named fields on the final `result` event above.
Every other event type (text chunks, tool progress, errors) is unchanged, and an app
that ignores this event keeps working exactly as before.

### Rename a conversation
```
PATCH /api/space/{spaceId}/chat/threads/{threadId}
```

`sessionId` is **body-only for this verb** — a query parameter is ignored and the call
answers `400`. The name field is **`title`** (not `name`).

**Request:**
```json
{
  "sessionId": "wses_907c886ac0ea...",
  "title": "Order status",
  "ifAbsent": false
}
```

**Response:**
```json
{ "success": true, "threadId": "t_1739481000000", "title": "Order status", "applied": true }
```

`ifAbsent: true` means "only name it if it has no stored name yet" — use it when your app
starts a conversation on the visitor's behalf. `applied: false` means an existing name was
kept. The stored name always wins over the title derived from the first message, and
renaming works on `main` too.

**Errors** (read the `code`, not the sentence):

| Status | `code` | Meaning |
|--------|--------|---------|
| 400 | – | `sessionId` missing or not a `wses_` id |
| 401 | `SESSION_VERIFICATION_REQUIRED` | Session is missing, unknown, or not authorized under the workspace's OTP policy |
| 404 | – | That session doesn't belong to this space |
| 400 | `invalid_name` | `title` was empty or whitespace |
| 400 | `invalid_thread` | Unknown conversation id |
| 400 | `thread_purged` | The conversation was erased through the platform's purge path, which reserves the id permanently |
| 404 | `session_not_found` | The session disappeared mid-write |

### Delete a conversation
```
DELETE /api/space/{spaceId}/chat/threads/{threadId}
```

`sessionId` goes in the **query string** (`?sessionId=wses_...`); a JSON body carrying
`sessionId` is accepted as a fallback for clients that can't send DELETE query params.

**This genuinely erases the conversation.** The thread's transcript rows are deleted from
platform chat storage along with its stored name — it is not a hide. That is what makes it
safe to wire to a "delete my chat history" control in a space that makes a data-deletion
promise to its end users.

**Response:**
```json
{
  "success": true,
  "threadId": "t_1739481000000",
  "clearedAt": "2026-08-12T09:20:00.000Z",
  "fallbackThreadId": "main",
  "purgedMessages": 12
}
```

`purgedMessages` is the number of messages actually erased. Send the visitor to
`fallbackThreadId` if the conversation they had open was the one removed.

Deleting does **not** reserve the id: streaming a message with the same `threadId` later
starts a brand-new, empty conversation. The old messages are still gone — nothing is
restored — but don't treat a deleted id as permanently retired.

**Errors:**

| Status | `code` | Meaning |
|--------|--------|---------|
| 400 | – | `sessionId` missing or not a `wses_` id |
| 404 | – | That session doesn't belong to this space |
| 400 | `primary_thread` | **`main` cannot be deleted** — rename it instead |
| 400 | `invalid_thread` | Nothing to remove under that id: no messages **and** no stored name. A renamed but empty conversation is still deletable |
| 404 | `session_not_found` | The session disappeared mid-write |

## Quick Start

```tsx
const spaceId = window.__SPACE_ID__; // e.g. "workspace-12345"

// The canonical session is stored only after successful OTP verification.
// Never use a provisional token or invent your own storage key.
function getWorkspaceSessionId(spaceId: string): string | null {
  try {
    const stored = localStorage.getItem(`space_session_${spaceId}`);
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (session.verified !== true) return null;
    const id = session.workspaceSessionId;
    return typeof id === 'string' && id.startsWith('wses_') ? id : null;
  } catch {
    return null;
  }
}

const sessionId = getWorkspaceSessionId(spaceId);
if (!sessionId) return; // Not signed in yet — there is nothing to read or change.

// 1. List the visitor's conversations — sessionId is a QUERY param.
const listRes = await fetch(
  `/api/space/${spaceId}/chat/threads?sessionId=${encodeURIComponent(sessionId)}`,
);
const { threads } = await listRes.json();

// 2. Rename one — sessionId and the "title" field go in the BODY.
await fetch(`/api/space/${spaceId}/chat/threads/${encodeURIComponent(threads[0].threadId)}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, title: 'Order status' }),
});

// 3. Delete one — sessionId is a QUERY param again. "main" can never be deleted.
const delRes = await fetch(
  `/api/space/${spaceId}/chat/threads/${encodeURIComponent('t_1739481000000')}` +
    `?sessionId=${encodeURIComponent(sessionId)}`,
  { method: 'DELETE' },
);
const { purgedMessages, fallbackThreadId } = await delRes.json();

// 4. Read a conversation's messages.
const histRes = await fetch(
  `/api/space/${spaceId}/chat/history?sessionId=${encodeURIComponent(sessionId)}` +
    `&threadId=main`,
);
const { messages, workspaceSessionId } = await histRes.json();
```

## Key Rules

1. **`sessionId` is not in the same place for every verb.** Query for
   `GET /chat/threads`, `GET /chat/history` and `DELETE /chat/threads/:id` (DELETE also
   accepts a body), body for `PATCH /chat/threads/:id` and `POST /chat/stream`.
2. **The rename field is `title`.** `name` is ignored and the call fails `invalid_name`.
3. **`main` is permanent.** Deleting it answers `400 primary_thread`; rename it instead.
4. **Delete is a real purge.** Messages are gone; don't offer an undo. The id itself is
   reusable — a later message on the same `threadId` starts an empty conversation.
5. **Always send the verified `wses_` id** stored under `space_session_{spaceId}` only
   after successful OTP verification. Never send a guest id, provisional token, or a
   storage key of your own making. If it is absent, send the visitor through the
   `session-management` flow first.
6. **Every endpoint enforces the space boundary.** A session from another workspace is
   refused (`403 session_workspace_mismatch` on reads, an SSE `error` event on the
   stream), so guard a `wses_` id like a password and never take one from user input.
7. **Require an exact canonical session.** `/chat/history` does not exchange or re-point
   identities. It returns the same verified session id that it accepted.
8. **Threads are created implicitly** by streaming a message with a new `threadId`.

## Use Cases
- A conversation sidebar with rename and delete
- "My past chats" for returning customers
- A support transcript view for one visitor
- A GDPR-style "delete this conversation" control
- Resuming a specific conversation after a page reload
- Starting a named conversation from an app ("Marcie · CRM")

## Related
- `session-management` — how to obtain the `wses_` session id in the first place
- `workspace-community` — social feeds and presence (different data, not chat history)


---

# space-platform-contract

Source: integrations/space-platform-contract/docs.md

# Space Platform Contract — Sessioning & the In-Space Agent

How a space participates in platform sessioning and how the in-space agent
works. These are **documented contracts a rebuild opts into deliberately** —
they are platform capabilities, not scaffold code the platform re-inserts.
Clean-slate rebuilds especially: the platform will NOT restore the old
AgentChat/Settings scaffold; if the product plan calls for these capabilities,
build against the contracts below.

## 1. Sessioning & the EmailGate

### What the platform provides (ambient — no opt-in required)
- **Visitor sessions.** Every space is served behind the platform session
  layer. In `customer` mode, visitors get a space session after they pass the
  sign-in gate; the session id is exposed to your code via
  `useSpaceRuntime().sessionId` (with `email`, `isBootstrappingSession`, and
  `trackEvent`). Sessions persist in `localStorage` under
  `space_session_<spaceId>` and are healed/linked to a contact at OTP verify.
- **EmailGate + OTP.** `components/EmailGate.tsx` is the standard sign-in /
  lead-capture surface: it collects an email, the platform sends a one-time
  code, and verification creates (or reconnects) the visitor's space session
  and a CRM contact. Every signed-in visitor becomes a captured lead.
  - If you keep/edit `components/EmailGate.tsx`, preserve the
    `export const EMAIL_GATE_VERSION = N;` marker near the top — removing it
    triggers a publish-time auto-restore that wipes your edits.
  - Gating is a **Desktop decision**: your shell decides when to render the
    gate (typically `mode === 'customer' && !sessionId && !isBootstrappingSession`).
    A space may also ship its own sign-in surface instead, but the platform
    OTP endpoints (used by EmailGate) are the supported way to create sessions.
- **Google Sign-In (Beta).** A workspace founder/admin may enable Google
  alongside OTP for end users of published founder-built apps. It never
  authenticates Audos founder/admin accounts; Audos founder/admin login remains
  email OTP only. The founder/admin saves that workspace's own Google OAuth 2.0
  **Web application** client ID/secret under **Workspace → Integrations →
  Google Sign-In**; Audos provides no shared platform Google client, and generic
  BYOK/custom API keys are not used. Google's client form shows **Authorized
  JavaScript origins** first; this server-side flow does not use it, so leave
  that box empty (redirect URIs pasted there are rejected with `Invalid Origin:
  URIs must not contain a path or end with "/"`). The card lists
  every exact Authorized redirect URI for the platform host, default workspace
  host, and verified custom/secondary-domain hosts. Copy **all** displayed URIs
  into Google Cloud; each ends in `/api/auth/social/google/callback`. Setup is
  save → copy all → enable → test. Enabled providers are injected at serve
  time, so this setting does not require an app republish.
- **Founder vs visitor.** The founder previewing their own space gets a
  founder-scoped session (entrepreneur mode / signed-in preview); public
  visitors get visitor sessions. `mode` (`'entrepreneur' | 'customer'`) is
  passed to your Desktop component.
- **Guest previews.** Template/genesis previews run `guest_` sessions with no
  workspace attached — DB-backed features must render a graceful error/empty
  state rather than assuming a workspace exists. A `?as=visitor` preview
  shadows reads but writes are real; treat preview traffic as production.
- **Public routes.** `config.json`'s `routes[]` with `target: "shell"` and
  `public: true` serve pathname pages that bypass the gate. Everything else in
  customer mode sits behind your gating decision.

### What the space must do
- Render the gate (or a custom sign-in) in its Desktop when appropriate.
- Never assume a session exists: handle `sessionId === null` (pre-gate) and
  guest preview states.
- Use `trackEvent` from `useSpaceRuntime()` for funnel/behavior events.

### Sessioning primitives (build your own gate from scratch)

The stock `EmailGate.tsx` is just a client over these platform endpoints. A
rebuild may replace its presentation entirely — or replace the whole
component — as long as it speaks this contract. All endpoints are same-origin
(`fetch('/api/...')` from space code); `workspaceId` comes from
`window.__WORKSPACE_ID__`.

- `GET /api/auth/otp/space/config/:workspaceId` → `{ otpEnabled: boolean }` —
  whether email entry requires code verification.
- `GET /api/auth/otp/space/check-session?workspaceId=...&sessionUuid=...` —
  validates a stored session id; on failure discard the stored session and
  show the gate. Called with `workspaceId` only and `credentials: 'include'`
  (no `sessionUuid`), it restores a cold start from the platform's HttpOnly
  session cookie and returns `canonicalSessionId` — Safari/iOS deletes page
  storage for sites unvisited for about a week, so make this one call before
  showing the gate. A verified session never expires server-side; the cookie
  lasts 30 days and is re-issued on every authorized check. Several devices may
  be signed in at once under one email, and logout invalidates a replayed
  cookie.
- `POST /api/space/:spaceId/register` with JSON
  `{ email, visitorId?, marketingConsent?, attribution? }` →
  `{ success, workspaceSessionId, contactId, isReturningUser, ... }` — the
  no-OTP path: creates/reconnects the visitor's space session AND the CRM
  contact in one call.
- `POST /api/auth/otp/space/send` `{ email, workspaceId }` →
  `{ success, resendCooldown?, expiresIn? }` — sends the 4-digit code.
- `POST /api/auth/otp/space/verify` `{ email, code, workspaceId, sessionUuid? }`
  — verifies; then call `register` to mint/heal the session.
- `GET /api/auth/social/google?workspaceId=...&spaceId=...&returnUrl=...` —
  full-page redirect for the platform-owned Google flow. Offer it only when
  `window.__SOCIAL_PROVIDERS__` contains `google`; never hardcode the provider,
  callback URL, client secret, or token exchange in space code.
- `POST /api/space/:spaceId/track` — funnel events; prefer
  `trackEvent` from `useSpaceRuntime()` which wraps it.

Session persistence contract: store the session as JSON in `localStorage`
under `space_session_<spaceId>` (shape:
`{ sessionId, email, verifiedAt?, guest? }` — keep fields you don't
understand), then hand it to the shell via
`useSpaceRuntime().setSessionId(sessionId)`. Honor `?as=visitor` (never adopt
a stored session) and guest previews (`window.__GUEST_MODE_ENABLED__` /
template spaces: offer "continue as guest" with a locally-minted `guest_`
session id). GDPR consent UI is required when `window.__GDPR_ENABLED__` is
set.

## 2. WorkspaceDB (per-workspace Postgres data)

- Tables are namespaced per workspace (`app_*` tables in a workspace schema).
  Create/inspect them via the bridge tools: `workspace_db_list_tables`,
  `workspace_db_describe_table`, `workspace_db_create_table`,
  `workspace_db_query` / `workspace_db_raw_query` (read-only).
- In space code, the runtime exposes a workspace-scoped token at
  `window.__workspaceDb.token`; platform data endpoints accept it as the
  `X-Workspace-DB-Token` header.
- **Row visibility layers** — a row is visible to a space app only when ALL
  agree: the read's session predicate, the caller's session (often absent for
  anonymous visitors), and the app's ownership/provenance filter. Server- or
  agent-written rows default to founder/NULL provenance; `_shared=1` is never
  a full bypass (the bundle-embedded token is public) — it exposes only
  NULL-provenance, caller-owned, and founder-session rows. Design your data
  model around who must read each row.

## 3. The In-Space Agent (customer-facing AI chat)

### What the platform provides
- **Agent runtime + capture.** When a space renders an agent chat surface,
  chat sessions and messages are captured server-side per visitor session and
  feed the workspace CRM/analytics. The founder's workspace side (Otto) can
  see and act on these conversations.
- **Agent config in `config.json`.** The `agent` block configures the
  customer-facing agent, e.g.:
  ```json
  "agent": { "welcomeMessage": "...", "greetingPrompt": "..." }
  ```
- **Prompt.** `agent/customer-prompt.md` (when present) is the customer-facing
  agent's prompt — it should describe the product's apps and how to use them.
  Keep it in sync when you add or reshape apps.
- **Customer chat tools.** Tools the agent can call mid-conversation are
  registered platform-side — see `get_integration_docs({ integrationName:
  "mcp-agent-tools" })`. Server functions and scheduled work have their own
  integrations (`server-functions`, `task-scheduler`).

### What the space must render (opt-in)
- The chat UI itself. Genesis ships it as
  `components/AgentChatView.tsx` + `components/AgentChat.tsx` +
  `components/useAgentChatRuntime.tsx`; a rebuild may recreate an equivalent
  surface (or skip the agent entirely if the plan is app-only). The platform
  provides the message transport + capture; the space owns look, feel, and
  where the chat lives in the shell (default front door vs one-tap-away).
- If the space ships **no** agent surface and **no** apps, the platform serves
  a graceful "nothing here yet" state — that is a valid intermediate state
  during a rebuild.

## 4. Landing page structure (proven high-level guidance)

The canonical Genesis landing shell converts well; a rebuilt landing page
should follow the same high-level structure unless the plan says otherwise:

1. **Fixed header/nav** — transparent over the hero, blurred/solid once
   scrolled; brand mark left, anchor links (`#features`, `#faq`), a primary
   CTA button right.
2. **Hero** — brand name/headline + tagline, palette-derived gradient (or
   brand video with a scrim), one dominant CTA.
3. **Features / benefits** (`id="features"`) — 3-6 value propositions.
4. **How it works** (`id="how-it-works"`) — 3-4 step process.
5. **Social proof** — testimonials / proof points.
6. **FAQ** (`id="faq"`).
7. **Final CTA** — full-width branded band repeating the primary CTA.
8. **Footer** — dark, brand + anchor links + copyright.

Conventions that matter:
- The landing container scrolls **internally** (full-height root with
  `overflow-y-auto`), not the window — scroll listeners must attach to that
  root element.
- Every CTA ("Get started" in header, hero, and final band) opens the SAME
  sign-in/email-capture action — never duplicate or re-implement auth per
  section; the OTP/registration flow stays platform-owned.
- Use lowercase semantic section ids (`hero`, `features`, `how-it-works`,
  `faq`) so nav anchors and analytics stay consistent.
- Pull colors/fonts/brand name from the workspace branding (runtime/config),
  never hardcode a palette.

## 5. CRM & funnel events (how tracking must fire)

Every audience behaviour flows into one funnel-event stream that powers the
workspace CRM, analytics, and automations. A rebuilt space must keep firing it:

- **Client API:** `trackEvent(eventType, metadata?)` from `useSpaceRuntime()`.
  It refuses to send without a session (fires only post-gate) and
  automatically attaches `sessionId`, the persistent visitor id, and URL
  attribution (`utm_*`, `fbclid`, `gclid`, `ref`) — never re-implement those.
- **Naming:** lowercase `snake_case`, action-oriented. Prefer the canonical
  names before inventing custom ones: `page_view`, `cta_click`,
  `email_submit`, `email_captured`, `space_entered`, `app_opened`,
  `app_action`, `agent_message`, `checkout_started`, `purchase`,
  `link_click`, `scroll_depth`. Custom names are allowed for
  product-specific moments (e.g. `quiz_completed`, `upgrade_intent`) — keep
  them stable, because CRM automations trigger on exact event names.
- **Metadata:** small JSON — common fields are `appId`, `action`, `label`,
  `value`, `path`, `buttonText`, `href`, `scrollDepth`, `orderId`,
  `currency`.
- **Minimum instrumentation for any rebuild:** `space_entered` on first load
  of a session, `app_opened` when an app/surface opens, `cta_click` on
  primary CTAs, `purchase` (with `orderId`/`currency`) on successful
  payment. Email capture (`lead`) is fired by the platform gate itself.
- Contact linkage (event → CRM contact) happens server-side from the session;
  the space never passes contact ids.

## 6. Draft vs published (applies to every capability above)

- All edits land in the **draft**; the live site keeps serving the last
  published bundle until an explicit founder publish. Never call `publish`
  unless the founder's instruction explicitly says to ship.
- `.published-source/*` is the rollback snapshot — read-only, never edit it.

## 7. Rebuild vs reuse — the primitives ledger (clean-slate rebuilds)

A clean-slate space tree still contains the pre-reset draft under
`.clean-slate-backup/` (the rollback snapshot) and the live site's source
under `.published-source/`. Both are READABLE reference material — but
"start over from scratch" draws a hard line through them:

**Protocol may travel. Pixels may not.**

Classify every old file you consider touching into one of three layers:

### RESTORE freely (non-rendering runtime plumbing)
Files with ZERO rendered output — stream/protocol handling, session wiring,
data hooks. Restoring these byte-identical is fine and encouraged; this is
solved plumbing, not product surface. Typical examples:
`components/useAgentChatRuntime.tsx`, runtime helpers in
`SpaceRuntimeContext.tsx`, pure data/util modules.

### REBUILD always (anything that renders)
If a backup component contains JSX that reaches a user's screen — composers,
chat bubbles, gates, docks, cards, empty states — its markup and styles must
NOT survive. Read it as documentation for the protocol it speaks, then build
a fresh surface to the approved plan's creative direction. The test: if the
founder screenshotted old and new side by side, no user-visible element
should be recognizably the same component. This includes "small" furniture:
input shapes, send buttons, keyboard hints, attach affordances.

### CONSULT only (schemas, prompts, data archaeology)
Old data models, hook implementations, customer prompts, and copy are
valuable evidence about what the business actually does. Mine them for
decisions (which tables to reuse, which hooks still matter) and record what
you learned — but the artifacts you ship are new.

### The reuse ledger (required)
Every clean-slate rebuild must include a `## Reuse ledger` section in
`REBUILD_PLAN.md`: one row per pre-existing file you restored, rebuilt from,
or consulted — file, layer (runtime / surface / reference), decision
(restored / rebuilt / consulted), and a one-line rationale. An empty ledger
on a rebuild that shipped a chat surface or sign-in screen is a red flag.

### Per-primitive design cues
Wherever the approved plan gives a creative direction for a primitive (the
composer, the gate screen, the dock), follow it. Where the plan is silent on
a user-visible primitive you are opting into, derive a direction from the
plan's overall creative concept — never default to the Genesis look because
it was nearest to hand.


---

# task-scheduler

Source: integrations/task-scheduler/docs.md

# Task Scheduler Integration (Cron Jobs)

Schedule recurring tasks and one-time automations scoped to a workspace.

## Category
Automation

## Required API Keys
None

## Concepts

- **Schedule** — A task definition scoped to a workspace. Can be recurring (using RRULE frequencies) or one-time (scheduled at a specific datetime). Each schedule has one of four accepted action types (`hook`, `webhook`, `email`, or `custom`) and an action payload.
- **Recurring Schedule** — Fires repeatedly at a given frequency (hourly, daily, weekly, monthly). The system automatically calculates the next run time after each execution.
- **One-time Schedule** — Fires once at a specific datetime and then completes.

---

## API Endpoints

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the authorization and caps paragraphs below. -->
Schedule management requires an authenticated principal: Otto, a task agent, or this workspace's own Server Function, whose calls to these routes the platform stamps automatically (no credential in function code, own workspace only). Browser-side app code is refused with `SCHEDULE_MANAGEMENT_UNAUTHENTICATED` (bare `X-Workspace-Id` header) or `SCHEDULE_MANAGEMENT_FORBIDDEN` (page credential) — have a Server Function do it. Caps: 100 active schedules per workspace, hourly is the fastest recurrence.
<!-- MANIFEST:END -->

All endpoints are scoped to a workspace via the URL path. Schedule
management (read, create, update, delete) requires an authenticated
management principal: a founder or workspace member, an admin, a task
agent — or **this workspace's own Server Function**, which the platform
stamps automatically, so no API key, workspace token, or other credential
belongs in function code. A stamped call may manage only the schedules of
the workspace it runs in; a call aimed at any other workspace is refused
with `SCHEDULE_WORKSPACE_MISMATCH`.

Browser-side space app code cannot manage schedules. A page-embedded app
credential is refused with `SCHEDULE_MANAGEMENT_FORBIDDEN`, and a request
carrying only an `x-workspace-id` header is refused with
`SCHEDULE_MANAGEMENT_UNAUTHENTICATED`. Both refusals name the supported
pattern: write the desired timing to the workspace database and let a
Server Function act on it — see Server-Side Alerts below.

The `/api/workspaces/:workspaceId/schedules*` routes documented here are the
canonical family. The older `/api/app-skills/scheduler/*` family reads and
writes the same scheduled-task storage and is authorized the same way, but
its request and response shapes differ, so use one family consistently.

Two platform caps apply to every schedule a Server Function mints: a
workspace holds at most 100 active schedules
(`SCHEDULE_ACTIVE_LIMIT_REACHED`), and a recurring schedule may not fire
more often than once an hour (`SCHEDULE_INTERVAL_TOO_FREQUENT`). Both are
named refusals, never a silent no-op.

### Create a Recurring Schedule
```
POST /api/workspaces/:workspaceId/schedules
```

**Request:**
```json
{
  "name": "Daily Digest",
  "description": "Sends a daily summary via webhook",
  "frequency": "daily",
  "time": "09:00",
  "timezone": "America/New_York",
  "actionType": "webhook",
  "actionPayload": {
    "url": "https://example.com/webhook",
    "method": "POST"
  }
}
```

- `frequency` — Required. One of: `hourly`, `daily`, `weekly`, `monthly`
- `time` — Optional. Time of day in `HH:MM` format. If the time has already passed today, the first run is pushed to the next interval.
- `timezone` — Optional. Defaults to `UTC`.
- `actionType` — Optional. One of: `hook`, `webhook`, `email`, `custom`. Defaults to `hook`.
- `actionPayload` — Optional at creation. Its shape depends on `actionType` (see Action Types below). A webhook is rejected at creation if neither `actionPayload` nor `webhookUrl` is present. Required hook and email fields are checked when the schedule runs.
- `webhookUrl` — Optional shorthand for `actionPayload` only. When `actionPayload` is absent, this sets it to `{ "url": webhookUrl, "method": "POST" }`. It does **not** change `actionType`; set `actionType: "webhook"` explicitly.

**Response:**
```json
{
  "success": true,
  "schedule": {
    "id": "uuid-abc-123",
    "workspaceId": "workspace-123",
    "name": "Daily Digest",
    "description": "Sends a daily summary via webhook",
    "actionType": "webhook",
    "scheduleType": "recurring",
    "rrule": "FREQ=DAILY;INTERVAL=1",
    "timezone": "America/New_York",
    "status": "pending",
    "nextRun": "2024-01-15T14:00:00.000Z",
    "createdAt": "2024-01-14T12:00:00.000Z"
  }
}
```

### Schedule a One-Time Email
```
POST /api/workspaces/:workspaceId/schedules/email
```

**Request:**
```json
{
  "name": "Welcome Email",
  "description": "Send onboarding email to new user",
  "scheduledAt": "2024-01-15T14:00:00Z",
  "timezone": "America/New_York",
  "email": {
    "to": "user@example.com",
    "subject": "Welcome!",
    "text": "Thanks for signing up.",
    "html": "<h1>Welcome!</h1><p>Thanks for signing up.</p>"
  }
}
```

**Response:**
```json
{
  "success": true,
  "schedule": {
    "id": "uuid-def-456",
    "workspaceId": "workspace-123",
    "name": "Welcome Email",
    "scheduledAt": "2024-01-15T14:00:00.000Z",
    "status": "pending"
  }
}
```

### List Schedules
```
GET /api/workspaces/:workspaceId/schedules
```

**Response:**
```json
{
  "success": true,
  "schedules": [
    {
      "id": "uuid-abc-123",
      "workspaceId": "workspace-123",
      "name": "Daily Digest",
      "actionType": "webhook",
      "scheduleType": "recurring",
      "rrule": "FREQ=DAILY;INTERVAL=1",
      "status": "pending",
      "nextRun": "2024-01-15T14:00:00.000Z",
      "lastRun": null,
      "runCount": 0,
      "createdAt": "2024-01-14T12:00:00.000Z"
    }
  ]
}
```

### Get a Schedule
```
GET /api/workspaces/:workspaceId/schedules/:scheduleId
```

Returns full details including `actionPayload`, `lastError`, and `updatedAt`.

### Update a Schedule
```
PATCH /api/workspaces/:workspaceId/schedules/:scheduleId
```

**Request (any fields to update):**
```json
{
  "name": "Weekly Digest",
  "frequency": "weekly",
  "status": "pending",
  "timezone": "America/Chicago"
}
```

Updatable fields: `name`, `description`, `frequency`, `timezone`, `status`, `actionPayload`.

### Delete a Schedule
```
DELETE /api/workspaces/:workspaceId/schedules/:scheduleId
```

**Response:**
```json
{
  "success": true,
  "deleted": true
}
```

Cannot delete a schedule that is currently processing.

---

## Action Types

The create schema accepts all four action types: `hook`, `webhook`, `email`,
and `custom`. The scheduler executes `hook`, `webhook`, and `email`. `custom`
is accepted for storage but is not executable.

### hook (run a Server Function)

Runs an enabled workspace Server Function internally, without a public URL
round-trip. Create the function through the `server-functions` integration,
then reference it by name:

```json
{
  "actionType": "hook",
  "actionPayload": {
    "hookName": "nightly-cleanup",
    "payload": { "dryRun": false }
  }
}
```

- `hookName` — Required at execution. It must name an existing, enabled Server
  Function in the same workspace.
- `payload` — Optional object. The scheduler delivers it directly as
  `request.body`; it is not wrapped in another `payload` property. If omitted,
  `request.body` is `{}`.

The scheduler calls the function internally, so no API key, workspace token,
or other secret is stored in the schedule.

Do **not** create a `webhook` action that points at a Server Function's public
`/api/hooks/execute/...` address. That public address needs a secret to
authorize the caller. Putting the secret in `actionPayload.headers` stores it
in the scheduled-task record, and the get-schedule endpoint returns
`actionPayload` in full. Use `actionType: "hook"` instead.

### webhook
```json
{
  "actionType": "webhook",
  "actionPayload": {
    "url": "https://example.com/hook",
    "method": "POST",
    "headers": { "Authorization": "Bearer token" },
    "body": { "key": "value" }
  }
}
```

### email
To send an email immediately, use
`POST /api/workspaces/:workspaceId/emails/send`; the `inbound-email`
integration docs describe that endpoint. The scheduler endpoints are only for
future delivery: use `/schedules/email` for a one-time scheduled email, or set
`actionType: "email"` on a recurring schedule:
```json
{
  "actionType": "email",
  "actionPayload": {
    "to": "user@example.com",
    "subject": "Daily Report",
    "text": "Here is your daily report.",
    "html": "<h1>Daily Report</h1>"
  }
}
```

### custom

The create schema accepts `custom`, but the public scheduler has no `custom`
execution handler. A `custom` schedule is accepted for storage but is not
executable; when it becomes due, it fails with an unknown-action-type error.
Do not use it until a runtime handler exists.

The following shape can be stored but cannot run:
```json
{
  "actionType": "custom",
  "actionPayload": {
    "type": "generate-report",
    "params": { "format": "pdf" }
  }
}
```

---

## Server-Side Alerts (no app open)

Everything above is an HTTP contract, so calling it needs an app open in
someone's browser. Most alerts are not like that: a trial-expiry reminder or a
"your booking is tomorrow" nudge has to fire whether or not anyone is looking
at the product.

Build those from **server-side code** in two pieces:

1. A recurring `hook` schedule wakes a Server Function on a cadence.
2. That function works out who is due and calls
   `platform.sendEmail({ ..., scheduledAt })` for each one-off future send.

No app needs to be open for either piece — the platform's scheduler runs both
server-side.

**Step 1 — the recurring job.** Create it once — from Otto, from a task
agent, or from a Server Function. A Server Function's own call to the
schedule routes is stamped by the platform, so a Server Function needs no
credential in its code to manage its own workspace's schedules. Browser-side
app code cannot create it:

```json
POST /api/workspaces/:workspaceId/schedules

{
  "name": "Trial expiry sweep",
  "frequency": "daily",
  "time": "09:00",
  "timezone": "America/New_York",
  "actionType": "hook",
  "actionPayload": { "hookName": "trial-expiry-sweep" }
}
```

**Step 2 — the Server Function it runs.** Inside hook code
`platform.sendEmail` takes an optional `scheduledAt` (an ISO-8601 timestamp in
the future) and registers a one-time scheduled email instead of sending now:

```javascript
// Server Function: trial-expiry-sweep
const expiring = await db.query(/* trials ending in the next 3 days */);

for (const trial of expiring) {
  const remindAt = new Date(new Date(trial.endsAt).getTime() - 24 * 60 * 60 * 1000);
  const scheduled = await platform.sendEmail({
    to: trial.email,
    subject: 'Your trial ends tomorrow',
    html: '<p>Your trial ends on ' + trial.endsAt + '.</p>',
    scheduledAt: remindAt.toISOString(),
  });
  if (!scheduled.success) {
    console.error('Could not schedule for ' + trial.email + ':', scheduled.error);
  }
}

respond(200, { swept: expiring.length });
```

A scheduled call resolves to `{ success: true, scheduled: true, schedule }`, and
a refused one to `{ success: false, scheduled: false, error }` — check
`success` rather than assuming it landed. Supply `text`, `html`, or both; an
HTML-only email is accepted. Attachments are immediate-send only. See the
`server-functions` integration docs for the full helper contract.

---

## Installation

Run the module below from **Server Function** code, where the platform stamps
the call. Pasted into browser-side app code the same fetches are refused with
`SCHEDULE_MANAGEMENT_UNAUTHENTICATED` (or `SCHEDULE_MANAGEMENT_FORBIDDEN` when
the page carries an app credential), because a page credential may not mint
schedules. Inside a Server Function, `workspaceId` is already the resolved
workspace UUID to pass in.

```javascript
export const taskScheduler = {
  async createSchedule(workspaceId, { name, frequency, timezone, actionType, actionPayload, webhookUrl, time, description }) {
    const response = await fetch(`/api/workspaces/${workspaceId}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        frequency,
        time,
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        actionType: actionType || 'hook',
        actionPayload,
        webhookUrl
      })
    });
    const data = await response.json();
    return data.schedule;
  },

  async scheduleEmail(workspaceId, { name, scheduledAt, email, timezone, description }) {
    const response = await fetch(`/api/workspaces/${workspaceId}/schedules/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, scheduledAt, email, timezone })
    });
    const data = await response.json();
    return data.schedule;
  },

  async listSchedules(workspaceId) {
    const response = await fetch(`/api/workspaces/${workspaceId}/schedules`);
    const data = await response.json();
    return data.schedules;
  },

  async getSchedule(workspaceId, scheduleId) {
    const response = await fetch(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`);
    const data = await response.json();
    return data.schedule;
  },

  async updateSchedule(workspaceId, scheduleId, updates) {
    const response = await fetch(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    return data.schedule;
  },

  async deleteSchedule(workspaceId, scheduleId) {
    await fetch(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`, { method: 'DELETE' });
  },

  async pauseSchedule(workspaceId, scheduleId) {
    return this.updateSchedule(workspaceId, scheduleId, { status: 'cancelled' });
  },

  async resumeSchedule(workspaceId, scheduleId) {
    return this.updateSchedule(workspaceId, scheduleId, { status: 'pending' });
  }
};
```

## Frequencies
- `hourly` — Every hour
- `daily` — Every day
- `weekly` — Every week
- `monthly` — Every month

The documented `frequency` and `time` creation fields expose no day-of-week
control. A newly created weekly schedule inherits its initial weekday from
its creation time; the optional `time` field controls only the time of day.
A later low-level update can replace the raw `rrule` (including `BYDAY`), but
that is separate from the weekly creation option.

## Schedule Statuses
- `pending` — Ready to fire at the next scheduled time
- `processing` — Currently executing
- `completed` — One-time schedule that has finished
- `failed` — Last execution failed (check `lastError`)
- `cancelled` — Manually paused/cancelled

## Use Cases
- Daily/weekly email digests
- Scheduled webhook calls
- Recurring data syncs
- Automated alerts and notifications
- One-time scheduled emails
- Batch processing jobs

## Documentation
- [RRULE Specification](https://datatracker.ietf.org/doc/html/rfc5545#section-3.8.5.3)


---

# workspace-community

Source: integrations/workspace-community/docs.md

# Workspace Community Integration

Create shared, social experiences in your mini-apps with feeds, posts, reactions, real-time updates, and user presence (who's online). Perfect for leaderboards, team collaboration, and multiplayer features.

## Category
Social

## Required API Keys
None

## Critical Distinction

**⚠️ IMPORTANT:**
- `sessionSave()` = INDIVIDUAL user data (private, personal, only they can see)
- `community.post()` = SHARED data (public, everyone in workspace can see)

Use `community.post()` when users should SEE EACH OTHER'S content (feeds, leaderboards, shared boards).  
Use `sessionSave()` only for private user preferences or settings.

## API Endpoints

All endpoints use `WORKSPACE_API_URL` to connect back to your AppSmith server.

**Initialize Space**
```
POST /api/community/spaces
```

**Request:**
```json
{
  "workspaceId": "workspace-123",
  "appId": "fitness-tracker",
  "name": "Workout Feed",
  "type": "feed",
  "metadata": {}
}
```

**List Spaces**
```
GET /api/community/spaces?workspaceId=workspace-123
```

**Create Post**
```
POST /api/community/spaces/:spaceId/posts
```

**Request:**
```json
{
  "userId": "user@example.com",
  "userName": "John Doe",
  "content": {
    "text": "Just completed 50 pushups!",
    "workout": {...}
  },
  "metadata": {}
}
```

**Get Posts**
```
GET /api/community/spaces/:spaceId/posts?limit=50
```

**Add Reaction**
```
POST /api/community/posts/:postId/reactions
```

**Connect WebSocket (Real-time)**
```
ws://WORKSPACE_API_URL/api/community/spaces/:spaceId/ws
```

## Installation

```javascript
export const community = {
  baseUrl: typeof WORKSPACE_API_URL !== 'undefined' 
    ? WORKSPACE_API_URL + '/api/community' 
    : '/api/community',
  
  async initSpace(workspaceId, appId, name, type = 'feed') {
    const response = await fetch(`${this.baseUrl}/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, appId, name, type, metadata: {} })
    });
    return response.json();
  },
  
  async listSpaces(workspaceId) {
    const response = await fetch(`${this.baseUrl}/spaces?workspaceId=${workspaceId}`);
    return response.json();
  },
  
  async getOrCreateSpace(workspaceId, appId, name, type = 'feed') {
    const { spaces } = await this.listSpaces(workspaceId);
    const existing = spaces.find(s => s.appId === appId && s.name === name);
    if (existing) return existing;
    return this.initSpace(workspaceId, appId, name, type);
  },
  
  async post(spaceId, userId, userName, content, metadata = {}) {
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName, content, metadata })
    });
    return response.json();
  },
  
  async getPosts(spaceId, limit = 50) {
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/posts?limit=${limit}`);
    return response.json();
  },
  
  async react(postId, userId, reactionType) {
    const response = await fetch(`${this.baseUrl}/posts/${postId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reactionType })
    });
    return response.json();
  },
  
  connectRealtime(spaceId, onMessage) {
    const wsUrl = this.baseUrl.replace('http', 'ws') + `/spaces/${spaceId}/ws`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    return ws;
  }
};
```

## Space Types
- `feed` - Social feed with posts and reactions
- `leaderboard` - Ranked list with scores
- `board` - Collaborative board (like Trello)
- `chat` - Real-time chat messages

## Use Cases
- Team workout feeds
- Leaderboards
- Collaborative boards
- Social feeds
- Multiplayer games
- Shared dashboards

---

## User Presence (Who's Online)

Track who's currently online in real-time. Uses efficient in-memory storage - no file writes, no rate limits.

**⚠️ IMPORTANT:**
- Call `presence.heartbeat()` every **60 seconds** (not faster!)
- Users are automatically marked offline after 2 minutes of no heartbeat
- Presence is ephemeral - resets on server restart (by design)

### Presence API Endpoints

**Join (mark user online)**
```
POST /api/presence/spaces/:spaceId/join
```
```json
{
  "userId": "user@example.com",
  "userName": "John Doe",
  "metadata": { "avatar": "🎮", "status": "playing" }
}
```

**Leave (mark user offline)**
```
POST /api/presence/spaces/:spaceId/leave
```
```json
{ "userId": "user@example.com" }
```

**Heartbeat (keep alive - call every 60 seconds)**
```
POST /api/presence/spaces/:spaceId/heartbeat
```
```json
{ "userId": "user@example.com" }
```

**Get Online Users**
```
GET /api/presence/spaces/:spaceId/online
```
Response:
```json
{
  "users": [
    { "userId": "user1@example.com", "userName": "Alice", "lastSeen": 1704067200000 }
  ],
  "count": 1
}
```

**WebSocket Events** (via community WebSocket):
- `presence.joined` - User came online
- `presence.left` - User went offline

### Presence Helper

```javascript
export const presence = {
  baseUrl: typeof WORKSPACE_API_URL !== 'undefined' 
    ? WORKSPACE_API_URL + '/api/presence' 
    : '/api/presence',
  
  heartbeatInterval: null,
  
  async join(spaceId, userId, userName, metadata = {}) {
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName, metadata })
    });
    return response.json();
  },
  
  async leave(spaceId, userId) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return response.json();
  },
  
  async heartbeat(spaceId, userId) {
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    return response.json();
  },
  
  async getOnline(spaceId) {
    const response = await fetch(`${this.baseUrl}/spaces/${spaceId}/online`);
    return response.json();
  },
  
  startPresence(spaceId, userId, userName, metadata = {}) {
    this.join(spaceId, userId, userName, metadata);
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat(spaceId, userId);
    }, 60000);
    const handleUnload = () => this.leave(spaceId, userId);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      this.leave(spaceId, userId);
    };
  }
};
```

### Presence Use Cases
- Multiplayer games - show who's in the lobby
- Collaborative tools - see who's editing
- Chat rooms - online indicator
- Live events - viewer count

## Documentation
- [Community API Docs](https://audogpts.com/docs/community-api)


---

# workspace-db

Source: integrations/workspace-db/docs.md

# WorkspaceDB Integration

Store and query structured data in isolated PostgreSQL tables. Every workspace gets its own database schema. The SDK is auto-injected into Space apps — no imports needed.

## Category
Data Persistence / Database

## Required API Keys
None — WorkspaceDB is built into the platform. No configuration needed.

---

## Client SDK — `useWorkspaceDB` Hook

Auto-injected into Space apps at compile time. No import needed.

```tsx
function MyComponent() {
  const { data, loading, error, total, refresh } = useWorkspaceDB('orders', {
    filters: [
      { column: 'status', operator: 'eq', value: 'active' }
    ],
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 50,
    offset: 0,
    shared: false
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <ul>{data.map(row => <li key={row.id}>{row.name}</li>)}</ul>;
}
```

### Hook Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filters` | `Array<{ column, operator, value }>` | `[]` | Filter rows |
| `orderBy` | `{ column, direction }` | — | Sort by column (`asc` or `desc`) |
| `limit` | `number` | `50` | Max rows to return |
| `offset` | `number` | `0` | Skip rows for pagination |
| `columns` | `string[]` | — | Column projection — return only these columns (sent as REST `_select`). Omit for every column |
| `shared` | `boolean` | `false` | If `true`, reads the workspace-shared scope: rows with `session_id = NULL`, rows written by the workspace founder, and the caller's own rows — never another visitor's session-owned rows |

### Filter Operators

`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`

### Return Value

`{ data: Row[], loading: boolean, error: Error | null, total: number, refresh: () => void }`

<!-- MANIFEST:APPENDIX — these paragraphs are emitted into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. -->
**A read result carries the rows and a total — and nothing that says the request succeeded.** There is no `success`, `ok`, or `status` field on it, so a success check such as `if (!result.success) throw ...` always fails on a read that worked. Branch on `loading` / `error` from the hook, or wrap the imperative client in `try`/`catch` — a failed read throws `WorkspaceDBError`, it never comes back as a falsy flag.

**Read through the injected client, not a hand-written address.** Use `useWorkspaceDB(...)` or `window.__workspaceDb.from(...)`. A `fetch` you compose yourself to a table URL can hit a path the data service does not publish (404), and it skips the `X-Workspace-DB-Token` and session headers the client sets for you.
<!-- MANIFEST:END -->


---

## Column Projection — returning fewer columns

Every read surface can ask for a subset of columns. The three forms are the
same feature and hit the same server behavior.

```tsx
// Hook
const { data } = useWorkspaceDB('players', {
  shared: true,
  columns: ['id', 'username', 'color'],
});
```

```ts
// Imperative client
const { data } = await window.__workspaceDb.from('players', { shared: true })
  .select('id', 'username', 'color')
  .get();
```

```
# REST
GET /api/workspaces/{workspaceId}/data/players?_shared=1&_select=id,username,color
```

### Behavior

- **Unknown columns are a hard error.** A name that is not a real column fails
  the whole request — it is never silently ignored and the response is never
  partially projected. Check the table schema before projecting.
- **Nothing is added for you.** Only the columns you list come back. `id`,
  `session_id`, `created_at`, and `updated_at` are NOT implicitly included, so
  list `id` yourself if your UI keys rows by it.
- **Rows are unaffected.** Projection picks columns, never rows: the same rows
  match, and `total` is exactly what it would be without `columns`.
- **Omitting it keeps the old behavior.** No `columns` (or an empty array)
  sends no `_select` and returns every column, exactly as before.

### Projection is payload reduction, NOT access control

`columns` only shapes the response of *that one request*. The workspace DB
token lives in the published app bundle, so any visitor who can make the read
can repeat it without `columns` and get every column the read scope allows.
Never use projection to hide a column from a visitor — keep the sensitive value
out of the readable rows instead (see "Shared rows are fully visitor-readable"
below).

---

## Client SDK — `window.__workspaceDb`

Lower-level client for imperative operations (inserts, updates, deletes, advanced queries).

### Query

```ts
const { data, total } = await window.__workspaceDb.from('orders')
  .eq('status', 'active')
  .orderBy('created_at', 'desc')
  .limit(50)
  .offset(0)
  .get();
```

### Select (column projection)

```ts
const { data } = await window.__workspaceDb.from('orders')
  .select('id', 'customer_name', 'total')
  .eq('status', 'active')
  .get();
```

`.select(...)` takes column names as arguments and serializes to the REST
`_select` parameter — the same feature as the hook's `columns` option. See
[Column Projection](#column-projection--returning-fewer-columns) for edge and
security behavior.

### Insert

```ts
await window.__workspaceDb.from('orders').insert({
  customer_name: 'Alice',
  total: 99.99
});
```

> **NOT NULL columns must be in the payload.** The server auto-injects
> `id`, `created_at`, `updated_at`, `session_id`, and (when the table
> has a `user_profile_id` FK to `user_profiles`) `user_profile_id` from
> the visitor session. Every OTHER NOT-NULL-no-default column must be
> present as a literal key in the object passed to `.insert({...})`. If
> you omit one, the publish-time lint will block the publish with a
> precise `file:line` error naming the missing column(s), and the
> runtime `POST /workspaces/:wsId/data/:table` endpoint will reject the
> request with `400 missing_required_columns` when the
> `WORKSPACE_DATA_PREFLIGHT` flag is in `enforce` mode.
>
> Spread (`{ ...row }`) and computed keys (`{ [k]: v }`) are reported
> as warnings, not errors — the lint cannot statically prove what
> they contain.

### Bulk Insert

```ts
await window.__workspaceDb.from('orders').bulkInsert([
  { customer_name: 'Alice', total: 99.99 },
  { customer_name: 'Bob', total: 49.99 },
  // up to 1000 rows
]);
```

### Update

```ts
await window.__workspaceDb.from('orders').update(rowId, {
  status: 'shipped'
});
```

### Delete

```ts
await window.__workspaceDb.from('orders').delete(rowId);
```

### Count

```ts
const total = await window.__workspaceDb.from('orders').count();
```

### Aggregate

```ts
const totalRevenue = await window.__workspaceDb.from('orders')
  .eq('status', 'completed')
  .aggregate('total', 'sum');
// Operations: count, sum, avg, min, max
```

### Get by ID

```ts
const { data } = await window.__workspaceDb.from('orders').getById(rowId);
```

### Filter Methods

| Method | Description |
|--------|-------------|
| `.eq(column, value)` | Equal |
| `.neq(column, value)` | Not equal |
| `.gt(column, value)` | Greater than |
| `.gte(column, value)` | Greater than or equal |
| `.lt(column, value)` | Less than |
| `.lte(column, value)` | Less than or equal |
| `.like(column, value)` | SQL LIKE pattern |
| `.ilike(column, value)` | Case-insensitive LIKE |
| `.where(column, op, value)` | Generic filter |

---

## Session Scoping — Shared vs Per-Visitor Data

By default, `useWorkspaceDB` auto-filters by the current visitor's `session_id`. Each visitor sees only their own rows.

Use `{ shared: true }` to read the **workspace-shared scope** instead. A shared
read returns:

- rows with `session_id = NULL` — workspace-shared data, which is how Otto/MCP
  tools and `{ shared: true }` writes store rows,
- rows written by the workspace founder, and
- the caller's own rows.

It does **not** return another visitor's session-owned rows. "Shared" means
"the rows everyone is meant to see", not "every row in the table".

### Shared-read behavior matrix

For an authenticated non-owner visitor, a shared read starts with the caller's
current session and adds any other verified sessions for the same email/account,
then widens that caller-owned scope to workspace-shared and founder-authored
rows:

| Row's `session_id` provenance | Default read | Shared read (`shared: true` / `_shared=1`) |
|---|---|---|
| SQL `NULL` (workspace-shared row) | Hidden | Returned |
| Caller's current session or another identifier for that same session | Returned | Returned |
| Another verified session for the caller's same email/account | Hidden | Returned |
| A verified founder session (for an ordinary non-founder visitor) | Hidden | Returned |
| An unrelated visitor's session | Hidden | Hidden |
| Empty string `''` | Hidden | Hidden |

Founder-authored rows are the one line in that table a workspace can switch
off. Whether a shared read adds the founder's own rows is a per-workspace
setting that is on by default, so the table above holds unless it has been
changed for that workspace. Switched off, shared reads simply stop
contributing founder-authored rows — except the generated-app runtime row
query, which applies no row-ownership scoping of its own and therefore refuses
a non-owner request outright rather than narrowing it, answering
`403 { code: "SHARED_READ_OWNERSHIP_SCOPE_REQUIRED" }`. Unowned (`NULL`),
own-session, and same-account rows resolve the same either way.

A token-only API read with no visitor session is a separate mode: `_shared=1`
can return SQL-`NULL` and founder-authored rows, while a visitor-level request
without a valid session returns an empty result.

The REST switch is exact: only the literal query value `_shared=1` enables the
shared scope. `_shared=true` is not equivalent and is currently ignored without
an error, so the request falls back to normal session scoping and may simply
return no rows.

`session_id = ''` is not shared data. It is neither SQL `NULL` nor a recognized
session ID, so normal visitor and shared reads exclude it. To make a row
workspace-shared, write SQL `NULL` through a trusted or owner-authorized path.
An unscoped owner/admin read may still inspect an empty-string row.

| Data Type | Example | Use `shared`? | Why |
|-----------|---------|---------------|-----|
| Per-visitor entries | Journals, trackers, personal logs | No (default) | Each visitor sees only their own data |
| Reference/catalog data | Articles, products, drill libraries | Yes | All visitors should see the same content |
| MCP-inserted data | Data seeded by Otto or MCP tools | **Yes** | MCP tools insert with `session_id=NULL` — invisible without `shared: true` |
| Collaborative data | Shared boards, team projects | Yes | Multiple visitors need to see the same data |

### IMPORTANT: MCP-Seeded Data

Data inserted via MCP/Otto tools has `session_id=NULL`. When an app reads with the default session-scoped behavior, it adds a `session_id=eq.<visitor_id>` filter. Rows with `session_id=NULL` do not match this filter and are **invisible** to app visitors.

**Fix:** Always use `{ shared: true }` when reading MCP-seeded data:

```tsx
// WRONG — returns [] even though table has rows (MCP data has session_id=NULL)
const { data } = useWorkspaceDB('articles');

// CORRECT — returns all rows including MCP-seeded data
const { data } = useWorkspaceDB('articles', { shared: true });
```

### Shared access with imperative API

```ts
const { data } = await window.__workspaceDb.from('articles', { shared: true }).get();
```

### Shared rows are fully visitor-readable

A shared read returns **every column** of every row in the shared scope. The
workspace DB token is embedded in the published app bundle, so any visitor can
replay that request from their browser with different filters, different
columns, or no projection at all. Treat everything stored in a workspace-shared
row as visible to every visitor.

Never put plaintext secrets, API keys, email addresses, phone numbers, or other
PII in a shared row. Column projection does not help here — a visitor can
always ask for the columns you left out.

**Recommended pattern for PII (an email address, say):**

1. Store a **digest** plus a **masked display value** in the shared table —
   never the real address.
2. Keep the real address in the workspace CRM contact record.
3. Resolve the digest back to the real value **server-side**, in a Server
   Function that applies its own authorization.

```ts
// Shared row: safe for every visitor to read
await window.__workspaceDb.from('players', { shared: true }).insert({
  username: 'ada',
  email_digest: digest,        // salted hash, computed in a Server Function
  email_masked: 'a**@e***.com', // what the UI displays
});
```

```javascript
// Server Function (see the server-functions integration): the real address
// lives in the CRM, and only server-side code ever sees or sends it.
await platform.createContact({ email: 'ada@example.com', name: 'ada' });

const { contacts } = await platform.getContacts({ limit: 100 });
const match = contacts.find(c => sha256(c.email + salt) === body.emailDigest);
if (!match) respond(404, { error: 'unknown player' });
await platform.sendEmail({ to: match.email, subject: 'Your turn', text: '...' });
respond(200, { sent: true });
```

The app calls that Server Function with the digest — it never handles the real
address:

```ts
await fetch(`/api/hooks/execute/workspace-{configId}/notify-player`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailDigest: digest }),
});
```


### Drop-box tables (`inbox_` prefix): safe anonymous lead capture

For email signups, contact forms, and waitlists you usually want the opposite
shape: **anyone can submit, nobody can read back**. Any table whose name starts
with `inbox_` is a **drop-box table**:

- **Anyone may INSERT** — no session required, no sign-in gate. An anonymous
  visitor's form submission just works.
- **Only the workspace owner (or a founder signed in inside the space) may
  READ.** Every other list/get/query/search/export returns a structured
  `403 { code: "DROPBOX_FOUNDER_ONLY_READ" }`. Captured emails and PII can
  never leak back out through the public bundle token.
- **Every read path is closed, not just the data API.** The public
  shared-search endpoint and the runtime query your app makes through the
  generated WorkspaceDB client both return the same
  `403 { code: "DROPBOX_FOUNDER_ONLY_READ" }` for a drop-box table, so there is
  no back door to build a visitor-facing "see your submission" screen on.
- **Visitors can never update or delete** rows (`dropbox_readonly` refusal).
- The server stamps `session_id` itself (a client-supplied value is ignored),
  caps anonymous submissions at 25 rows per request, and rate limits the open
  insert path (`429 { code: "DROPBOX_RATE_LIMIT", resetsAt }` — show a "try
  again later" state).

**Use a drop-box table by default for lead capture** instead of a `_shared`
table (visitor-readable — leaks PII) or a private table (requires a verified
session — anonymous visitors can't submit).

```ts
// Anonymous visitor submits a lead — no session needed:
await window.__workspaceDb.from('inbox_leads').insert({
  email: form.email,
  message: form.message,
});
// Confirm from the insert response — do NOT read the table back to confirm;
// reads are founder-only and will 403 for visitors.
```

The founder triages leads from the workspace Database Explorer, an export, or
app UI rendered under their own signed-in founder session.

### Diagnostic Hint

When the SDK gets an empty result but the table has rows, the API response includes a `_diagnostic` field: `table_has_rows_but_session_filter_excluded_all`. The SDK logs this to the browser console as a warning.

---

## Writes from the browser are UNTRUSTED

The workspace DB token is embedded in the published app bundle. It is
effectively **public** — anyone can pull it out of the bundle and replay any
write from curl. So a client-side write is a *request*, never a guarantee:

- Do not trust that a row was written by the visitor whose `session_id` it
  carries, unless the server enforced it.
- Do not keep money-, payment-, entitlement- or trust-sensitive state in
  columns the browser can set. Route those through a **Server Function**
  (see the server-functions integration), which runs server-side with the
  workspace's real credentials.

The server enforces a **per-table write policy** on every guarded write. Reads
are unchanged.

### What the server enforces

| Rule | What it blocks |
|---|---|
| `serverHooksOnly` | Every insert/update/delete except one performed by a registered workspace Server Function (hook). Owner credentials, Otto/MCP tools, and app runtimes are also blocked. |
| `ownerColumn` | Writing, editing or deleting a row that belongs to another app user. The caller's `session_id` is verified against the workspace's real sessions — a made-up id gets no ownership. |
| `protectedColumns` | A client setting a server-only column (e.g. `paid`, `amount_cents`, `verified`, `role`). Only a Server Function or Otto can set these. |
| `allowSharedWrites` | Writing unowned/shared rows (`{ shared: true }`) on tables where every row must belong to someone. |
| `untrustedOperations` | Whole operations, e.g. a table that clients may insert into but never update or delete. |

A refusal is a structured `403` naming the rule that blocked it:

```json
{
  "error": "Column \"paid\" is server-only on table \"app_splits\"...",
  "code": "WRITE_POLICY_DENIED",
  "rule": "protected_column",
  "column": "paid",
  "table": "app_splits"
}
```

### Declaring the policy

Ask Otto to declare it when the table is created (`db_create_table`), or to add
it to an existing table (`db_alter_table` → `changes.writePolicy`). For example:

> "On `app_splits`, make `paid` and `amount_cents` server-only, and don't allow
> shared writes."

```jsonc
{
  "serverHooksOnly": false,             // true = only a workspace Server Function may write
  "ownerColumn": "session_id",          // null = the table has no per-row owner
  "protectedColumns": ["paid", "amount_cents"],
  "allowSharedWrites": false,
  "requireVerifiedOwner": true,
  "untrustedOperations": ["insert", "update", "delete"]
}
```

For a table whose entire write surface is security-sensitive (session tokens,
payment ledger rows, entitlement grants), set `"serverHooksOnly": true`.
`untrustedOperations: []` blocks app users but still leaves owner and other
trusted server surfaces exempt; `serverHooksOnly` is the stronger boundary.
It also covers bulk/import, confirmed truncate, backup restore, customer/agent
tools, MCP, generated-app runtimes, inbound-email mirrors, and tenant-agent
product/runtime stores. Hook provenance requires a fresh lookup of the current
registered, enabled hook with matching id/workspace/name/code/revision; passing
a string such as `source: "hook"` or an in-memory hook object cannot grant it.
A malformed stored policy fails closed until an owner/admin repairs it.
Enforced workspaces read the shared policy row on every mutation (including
bulk and restore); process-local policy caching is report-mode telemetry only.

Tables created from now on get the safe default (`session_id` owner, no shared
writes, verified owner required). Tables that existed before the policy layer
keep behaving exactly as they did until someone declares a policy on them —
nothing breaks, but nothing is protected either, so migrate any table holding
sensitive state.

### Is the rule actually applied, or only watched?

"Saved" and "applied" are two different facts, so `workspace_db_create_table`
and `workspace_db_alter_table` answer both. When a call declares or tightens a
policy the success payload carries:

```jsonc
{
  "workspaceId": "…",
  "table": { /* … */ },
  "writePolicyEnforcement": {
    "enforced": true,
    "state": "enforce",          // "enforce" | "watch" | "off"
    "summary": "APPLIED: these rules are enforced. A write from the published app that breaks them is refused with 403 WRITE_POLICY_DENIED, not silently accepted."
  }
}
```

Read it and repeat it to the founder verbatim — do not tell them a rule is
protecting them when `enforced` is `false`.

- **`state: "enforce"`** — a write that breaks the rules is refused. Workspaces
  created recently start here.
- **`state: "watch"`** — the rules are stored and every write that breaks them
  is recorded, but the write still goes through. Workspaces that existed before
  this feature shipped start here on purpose, so an app already relying on those
  writes does not break. Switching one to enforce is an Audos support request.
- **`state: "watch"` right after declaring on an enforcing workspace** also
  happens when the policy you sent matches the platform's own standard shape —
  standard rules are only ever watched. Change at least one rule (add a
  `protectedColumns` entry, set `allowSharedWrites: false`, set
  `serverHooksOnly: true`) and it becomes enforced.
- **`state: "off"`** — write-rule checking is switched off for the workspace;
  nothing is measured against the rules at all.

Either way the rules are **stored**, so declaring them is never wasted: a
workspace switched to enforce later applies exactly what was declared.

Founder/owner-level access (Otto, the dashboard, MCP tools) and Server
Functions are exempt — they are already server-side and authenticated.

### The pattern for money- or trust-sensitive state

```ts
// WRONG — the browser decides who paid.
await window.__workspaceDb.from('app_splits').update(id, { paid: true });

// RIGHT — the server decides, after checking with the payment provider.
await fetch(`/api/hooks/execute/workspace-{configId}/mark-paid`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ splitId: id, paymentIntentId }),
});
```

With `paid` in `protectedColumns`, the first call is refused with
`WRITE_POLICY_DENIED` and only the Server Function can move the flag.

---

## Standard Columns

Every table automatically gets these columns (do not define them yourself):

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key (auto-increment) |
| `session_id` | text | For per-visitor data scoping |
| `created_at` | timestamp | Row creation time |
| `updated_at` | timestamp | Last update time |

---

## Schema changes & JSON columns

### Columns are fixed at creation (from app code)

A table's columns are defined when the table is created. **App code cannot
add, rename, or retype columns at runtime** — there is no ALTER operation on
the data API, and inserting a key that isn't a real column is rejected. The
schema is changed by an agent using the schema tools below, and then the app
code is updated to match.

The standard columns (`id`, `session_id`, `created_at`, `updated_at`)
are added automatically at creation and always exist — never declare them
yourself and never try to set them on insert.

### Evolve an existing table — do not create a replacement

An existing table can be extended in place. Do **not** create a `<name>_v2`
replacement table and migrate rows into it: creating a table that already
exists fails with `TABLE_EXISTS`, and a replacement leaves the original behind
as an orphan that keeps advertising itself as live.

| Goal | Editing agent (MCP bridge) | Otto |
|------|----------------------------|------|
| Add a nullable column, an index, or a foreign key to an existing table | `workspace_db_alter_table({ table, addColumns?, addIndexes?, addForeignKeys? })` — strictly additive; existing rows and columns are untouched | `db_alter_table` |
| Relabel a table — change its display name or description, e.g. to mark a superseded table deprecated | `workspace_db_update_table_metadata({ table, displayName?, description? })` — registry metadata only, no DDL and no row changes | `db_update_table_metadata` |
| Rename, drop, or retype a column; drop a table | Not available — say so and let the founder ask Otto | `db_alter_table` / `db_drop_table` (destructive-confirmation gated) |

Adding a column with `workspace_db_alter_table` is additive only: `unique` and
`primaryKey` are rejected on added columns (add a unique index instead), and
added columns must be nullable so existing rows stay valid.

### Re-creating an existing table changes nothing

Asking to create a table whose name already exists is **refused** with
`TABLE_EXISTS` and changes absolutely nothing — not the columns, not the rows,
not the `displayName` or `description`. It is **not** an idempotent "ensure
these columns exist" call: passing the existing columns plus a new one does not
add the new one. A re-call is harmless, but it is never a way to add a field —
use `workspace_db_alter_table` (Otto: `db_alter_table`) for that.

### `defaultValue` is raw SQL, passed through as written

A column's `defaultValue` is interpolated into the DDL **exactly as you type
it** — it is never quoted or escaped for you. A text default must carry its own
single quotes (`"'app'"`); an unquoted word (`"app"`) is read as a **column
name**, not as the string `app`. Numbers (`"0"`), booleans (`"false"`), and SQL
expressions (`"now()"`, `"gen_random_uuid()"`) are written through as-is.

### Raw SQL cannot change the schema

`workspace_db_raw_query`, `db.rawQuery`, and the `/db/sql` endpoint are
limited to one read-only `SELECT`, `WITH` (CTE), or `EXPLAIN` statement.
PostgreSQL double-quoted identifiers remain case-sensitive; unquoted names
fold to lower case. Each database call has a row limit and reports
`truncated` when more rows exist.

Workspace data relations must be base or partitioned tables. Normal views,
materialized views, foreign tables, sequences, and other relation kinds are
rejected before execution. Supported catalog relations remain available
through workspace-scoped catalog views. Table columns must use PostgreSQL
built-in data types from `pg_catalog`; workspace-defined types are rejected.

Functions are limited to `avg`, `count`, `current_schema`, `generate_series`,
`length`, `max`, `min`, `pg_size_pretty`, `pg_typeof`, `sum`, and `to_jsonb`. They resolve
from `pg_catalog` under a fixed search path. Workspace-defined functions are
not supported. Schema-qualified non-built-in functions, overload shadows,
security-definer functions, and functions granted after role setup are also
rejected.

**There is no per-call ceiling on the number of operations in a query.** One
query counts as **one** database operation no matter how many tables, UNION
branches, joins, or CTEs it touches, so batching work into a single statement
lowers your usage rather than risking a limit. The only two limits that apply
are:

- **Rows returned per read — 10,000.** A request for more is refused by name,
  never silently shortened. Check `truncated` and page the rest with `OFFSET`.
- **Database operations per hour, per workspace.** By default 5,000 for agent
  and dashboard queries and 25,000 for the published app's data API, counted
  per UTC hour. Going over returns a rate-limit error naming the ceiling and
  when it resets. Your current usage, ceiling and reset time are shown in the
  workspace's Developer window, which is also where you request more.

A data-changing CTE (`INSERT`, `UPDATE`, `DELETE`, or `MERGE` inside `WITH`,
including `EXPLAIN WITH`) is rejected with `RAW_QUERY_RESTRICTED`.
A `CREATE TABLE`, `ALTER TABLE`, `INSERT`, `UPDATE`, or
`DELETE` sent through them is **rejected with a loud `RAW_QUERY_RESTRICTED`
error** — it does not silently fail, and it never applies. Use the schema
tools above.

### Writing to `json` columns

A `json` column is stored as PostgreSQL JSONB. Pass a plain JS object or
array directly in `.insert({...})` / `.update(...)` — do **not**
`JSON.stringify` it first. (A string value is accepted only when it is
itself valid JSON text; a malformed JSON string makes the write fail.) Reads
return the parsed object/array, not a string.

```ts
await window.__workspaceDb.from('orders').insert({
  customer_name: 'Alice',
  total: 99.99,
  line_items: [{ sku: 'A1', qty: 2 }],  // json column: pass the object/array directly
});
```

---

## Error Handling

All SDK operations return structured errors:

```json
{ "error": "Table not found", "code": "TABLE_NOT_FOUND" }
```

The SDK throws `WorkspaceDBError` with `.message` and `.status` properties.

---

## REST API (for external integrations)

**Base URL:** `/api/workspaces/{workspaceId}/data`

**Authentication:** `X-Workspace-DB-Token` header or `Authorization: Bearer <token>`

### List Tables
```
GET /api/workspaces/{workspaceId}/db/tables
```

### Describe Table
```
GET /api/workspaces/{workspaceId}/db/tables/{tableName}?module={module}
```
`module` is optional. When omitted, searches across all modules.

### Query Rows
```
GET /api/workspaces/{workspaceId}/data/{table}?_limit=50&_offset=0&_sort=created_at&_order=desc&status=eq.active
```

### Insert Rows
```
POST /api/workspaces/{workspaceId}/data/{table}
Content-Type: application/json

{ "rows": [{ "name": "Alice", "email": "alice@example.com" }] }
```

### Update Row
```
PATCH /api/workspaces/{workspaceId}/data/{table}/{id}
Content-Type: application/json

{ "name": "Updated Name" }
```

### Delete Row
```
DELETE /api/workspaces/{workspaceId}/data/{table}/{id}
```

### Query Parameters

| Param | Description |
|-------|-------------|
| `_limit` | Max rows (default 50, max 10000). A larger value is rejected, not shortened — page with `_offset` when a table exceeds 10,000 rows. Responses include `truncated: true` when more rows matched than were returned. |
| `_offset` | Skip rows |
| `_sort` | Column to sort by |
| `_order` | `asc` or `desc` |
| `_select` | Comma-separated column names to return (projection). An unknown column name fails the request |
| `_shared` | Set to `1` to read the workspace-shared scope (see Session Scoping) |
| `{column}={op}.{value}` | Filter (e.g., `age=gt.21`, `name=like.%john%`) |


---

## Marketing/CRM/email

# apollo-leads

Source: integrations/apollo-leads/docs.md

# Apollo Leads Integration

Search, enrich, and manage leads using Apollo.io's comprehensive B2B contact database. Find potential customers, partners, or media contacts for outreach.

## How It Works

The Apollo integration connects your Space to Apollo.io's database of 275M+ business contacts. You can:

1. **Search Leads** - Find contacts by job title, industry, company size, location
2. **Enrich Contacts** - Get verified emails, photos, LinkedIn profiles
3. **Save Leads** - Store qualified leads in your Space for follow-up

## Quick Start

### 1. Search for Leads

```typescript
const response = await fetch('/api/leads/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'marketing automation',
    personTitles: ['VP Marketing', 'CMO', 'Director of Marketing'],
    personSeniorities: ['director', 'vp', 'c_suite'],
    includeSimilarTitles: true,
    limit: 25
  })
});

const { people, pagination } = await response.json();
// people[] contains name, title, company, email (if available), etc.
```

### 2. Enrich a Contact

```typescript
// Get additional data: photo, LinkedIn URL, verified email
const response = await fetch('/api/leads/enrich', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apolloPersonId: 'abc123def456...' // From search results
  })
});

const { photoUrl, linkedinUrl, email, emailStatus } = await response.json();
```

### 3. Save a Lead

```typescript
// Always send X-App-Id on /api/space-data/* calls: space pages are served
// with Referrer-Policy: no-referrer, so the server cannot resolve your
// space from the Referer header.
const appId = window.__APP_ID__ || window.__SPACE_ID__;

const response = await fetch('/api/space-data/leads.json', {
  headers: appId ? { 'X-App-Id': appId } : {}
});
const existingLeads = response.ok ? await response.json() : [];

const newLead = {
  id: crypto.randomUUID(),
  apolloPersonId: person.id,
  name: person.name,
  title: person.title,
  company: person.organization_name,
  email: person.email,
  linkedinUrl: person.linkedin_url,
  status: 'new',
  addedAt: new Date().toISOString()
};

await fetch('/api/space-data/leads.json', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(appId ? { 'X-App-Id': appId } : {})
  },
  body: JSON.stringify([...existingLeads, newLead])
});
```

## API Reference

### POST /api/leads/search

Search Apollo's database for contacts matching your criteria.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | No | Keyword search (e.g., "AI startup", "real estate") |
| `personTitles` | string[] | No | Job titles to match |
| `personLocations` | string[] | No | Locations (cities, states, countries) |
| `organizationIndustries` | string[] | No | Industry keywords |
| `organizationDomains` | string[] | No | Company domains (e.g., `["google.com"]`) |
| `personSeniorities` | string[] | No | Seniority levels (see below) |
| `emailStatus` | string[] | No | Filter by email status (e.g., `["verified"]`) |
| `employeeRanges` | string[] | No | Company size ranges (see below) |
| `includeSimilarTitles` | boolean | No | Include similar job titles (default true when personTitles set) |
| `limit` | number | No | Results per page (max 100, default 25) |
| `page` | number | No | Page number (default 1) |

**Seniority Values:**
- `entry` - Entry level
- `senior` - Senior individual contributor
- `manager` - Manager
- `director` - Director
- `vp` - Vice President
- `c_suite` - C-Level executives
- `owner` - Owner/Founder

**Employee Ranges:**
- `1,10` - 1-10 employees
- `11,50` - 11-50 employees
- `51,200` - 51-200 employees
- `201,500` - 201-500 employees
- `501,1000` - 501-1000 employees
- `1001,5000` - 1001-5000 employees
- `5001,10000` - 5001-10000 employees
- `10001` - 10000+ employees

**Response:**
```json
{
  "people": [
    {
      "id": "5f8a1234567890abcdef1234",
      "name": "Jane Smith",
      "first_name": "Jane",
      "last_name": "Smith",
      "title": "VP of Marketing",
      "headline": "Marketing Leader | B2B SaaS",
      "email": "jane@company.com",
      "email_status": "verified",
      "linkedin_url": "https://linkedin.com/in/janesmith",
      "photo_url": "https://...",
      "city": "San Francisco",
      "state": "California",
      "country": "United States",
      "organization_name": "TechCorp",
      "organization": {
        "name": "TechCorp",
        "website_url": "https://techcorp.com",
        "industry": "Software",
        "estimated_num_employees": 250
      },
      "seniority": "vp"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 25,
    "total_entries": 1542,
    "total_pages": 62
  }
}
```

### POST /api/leads/enrich

Enrich a contact with additional data (photo, LinkedIn, verified email).

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apolloPersonId` | string | Yes | Apollo person ID from search results |

**Response:**
```json
{
  "success": true,
  "photoUrl": "https://...",
  "linkedinUrl": "https://linkedin.com/in/...",
  "email": "verified@email.com",
  "emailStatus": "verified",
  "name": "Jane Smith",
  "firstName": "Jane",
  "lastName": "Smith",
  "headline": "VP of Marketing at TechCorp"
}
```

**Email Status Values:**
- `verified` - Email has been verified
- `unverified` - Email is guessed/unverified
- `pending` - Verification in progress
- `unavailable` - No email available

## Common Search Patterns

### Find Decision Makers in Your Industry

```typescript
const { people } = await fetch('/api/leads/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'software development',
    personTitles: ['CEO', 'CTO', 'VP Engineering', 'Director of Engineering'],
    personSeniorities: ['vp', 'c_suite', 'director'],
    employeeRanges: ['51,200', '201,500'], // SMB companies
    limit: 50
  })
}).then(r => r.json());
```

### Find Journalists and Media Contacts

```typescript
const { people } = await fetch('/api/leads/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'technology startups AI',
    personTitles: ['journalist', 'reporter', 'editor', 'writer'],
    limit: 50
  })
}).then(r => r.json());
```

### Find Potential Customers by Location

```typescript
const { people } = await fetch('/api/leads/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    personTitles: ['Real Estate Agent', 'Broker', 'Property Manager'],
    personLocations: ['Miami, Florida', 'Fort Lauderdale, Florida'],
    limit: 100
  })
}).then(r => r.json());
```

## Lead Data Storage

Store leads in your Space's data folder for persistence:

```typescript
// leads.json structure
interface Lead {
  id: string;              // Your internal ID
  apolloPersonId: string;  // Apollo's ID for enrichment
  name: string;
  title: string;
  company: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  location?: string;
  status: 'new' | 'contacted' | 'responded' | 'qualified' | 'unqualified';
  notes?: string;
  addedAt: string;
  contactedAt?: string;
}
```

## Use Cases

- **Sales Prospecting** - Find and qualify potential customers
- **Recruiting** - Source candidates by role and location
- **PR Outreach** - Find journalists covering your industry
- **Partnership Development** - Identify potential partners
- **Customer Research** - Understand your market landscape

## Rate Limits

Apollo enforces rate limits on API calls. The integration handles this automatically with:
- Automatic retry with backoff
- Rate limit header tracking
- Queueing of requests when limits are reached

## Error Handling

All endpoints return clear error responses:

- `400` — Invalid request body (missing required fields, bad types, malformed `apolloPersonId`)
- `500` — Enrichment returned a non-API failure (e.g., no person data found)
- `502` — Upstream Apollo API returned an error (e.g., rate limited, server error)
- `503` — `APOLLO_API_KEY` is not configured

**Example error response:**
```json
{
  "error": "Apollo API key is not configured. Please add APOLLO_API_KEY to your secrets."
}
```

**Validation error response (400):**
```json
{
  "error": "Invalid search criteria",
  "details": [
    { "code": "too_small", "path": ["limit"], "message": "Number must be greater than or equal to 1" }
  ]
}
```

## Notes

- Email enrichment may use Apollo credits - the integration tracks this
- Not all contacts have verified emails available
- Photo and LinkedIn URLs may not be available for all contacts
- Results are cached briefly to reduce API calls
- The `apolloPersonId` must be a valid 24-character hex string from Apollo search results


---

# connect-meta

Source: integrations/connect-meta/docs.md

# Connect Meta Integration

Form, read, and clear the workspace's Meta (Facebook/Instagram) connection from
inside your app — a dedicated "Connect your Meta account" button. This is the
**connect-only** surface: it establishes/reads the connection (page, Instagram
account, ad account IDs) and nothing else. There is **no campaign launch, no
publishing, and no wallet charge** here. Install this alone when your app just
needs to get a Meta account connected; install **Meta Ads** if you also need to
launch/read ads, or **Social Publishing** if you also need to post.

AppSmith holds the Meta tokens server-side; the app only ever sees the
connection status.

## Category
Marketing

## Required API Keys
None — the workspace's Meta connection is used server-side. The app only needs
the workspace DB token that the WorkspaceDB SDK already injects (see
Authentication below).

## Concepts

- **Connect flow** — The shared connect shape used across all marketing
  integrations: call `connect/init`, open the returned `authUrl` (popup or
  redirect), then poll `connect/status` until `connected` is true.
- **Scopes** — Optionally restrict what the connection grants:
  `messaging` | `content_publishing` | `ads`. Omit `scopes` to request all three.
- **Connection facts** — Once connected, status exposes `page`, `instagram`, and
  `adAccountIds`. These are read-only here; acting on them lives in the Meta Ads
  / Social Publishing integrations.

## Authentication

Every request is workspace-scoped and authenticated. Reference
`window.__workspaceDb` anywhere in your app so the SDK (and its token) is
injected, then attach the token on each call:

```ts
const ws = (window as any).__workspaceDb;        // { workspaceId, token }
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const headers = { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token };
```

---

## Quick Start

```tsx
const ws = (window as any).__workspaceDb;
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const auth = { 'X-Workspace-DB-Token': ws.token };

// 1. Is an account already connected?
const { connected } = await fetch(`${base}/connect/status`, { headers: auth }).then((r) => r.json());

// 2. If not, start the OAuth flow and open the returned URL, then poll status.
if (!connected) {
  const { authUrl } = await fetch(`${base}/connect/init`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // all scopes by default
  }).then((r) => r.json());
  window.open(authUrl, '_blank');
}
```

---

## API Endpoints

### Start the OAuth flow
```
POST /api/workspaces/:workspaceId/marketing/connect/init
```
**Request (all optional):**
```json
{ "scopes": ["content_publishing", "ads"], "parentWorkspaceId": "your-own-ref-id" }
```
- `scopes` — subset of `messaging` | `content_publishing` | `ads` (defaults to all three)
- `parentWorkspaceId` — your app's own reference ID (e.g. an end-user/business id).
  It is forwarded to the gateway and echoed back on the connection callback, so a
  multi-user app can attribute the connection to one of its own records.

**Response:** `{ success: true, authUrl: "https://www.facebook.com/..." }`

### Read connection status
```
GET /api/workspaces/:workspaceId/marketing/connect/status
```
**Response:**
```json
{
  "success": true,
  "connected": true,
  "status": "connected",
  "page": { "id": "123", "name": "My Page" },
  "instagram": { "id": "456", "username": "myhandle" },
  "adAccountIds": ["act_789"]
}
```
When nothing is connected: `{ success: true, connected: false, status: "not_connected" }`.

### Disconnect
```
POST /api/workspaces/:workspaceId/marketing/connect/disconnect
```
**Response:** `{ success: true }`

---

## Installation

```javascript
// Reference window.__workspaceDb so the SDK + token are injected.
// Connect-only: form / read / clear the Meta connection. No launch or publish.
export const connectMeta = {
  _ctx() {
    const ws = window.__workspaceDb;
    return {
      base: `/api/workspaces/${ws.workspaceId}/marketing`,
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token }
    };
  },

  async connectInit(opts = {}) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/connect/init`, {
      method: 'POST', headers, body: JSON.stringify(opts)
    });
    return res.json();   // { success, authUrl }
  },

  async connectStatus() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/status`, { headers })).json();
  },

  async disconnect() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/disconnect`, { method: 'POST', headers })).json();
  }
};
```

### Connect button example

```tsx
async function connectMetaAccount() {
  const { authUrl } = await connectMeta.connectInit(); // all scopes by default
  const popup = window.open(authUrl, 'meta-connect', 'width=600,height=800');
  // Poll for completion while the user authorizes in the popup.
  const timer = setInterval(async () => {
    const s = await connectMeta.connectStatus();
    if (s.connected) {
      clearInterval(timer);
      popup?.close();
      // refresh your UI — s.page / s.instagram / s.adAccountIds are now populated
    }
  }, 2000);
}
```

## Use Cases
- A standalone "Connect your Meta account" onboarding step
- Showing which page / Instagram / ad accounts the workspace has connected
- Letting an owner disconnect and reconnect a Meta account

## Notes
- Connect-only — no launch, publish, or wallet charges. Add **Meta Ads** to
  launch/read campaigns or **Social Publishing** to post.
- The connect flow shape (`connectInit` → open `authUrl` → poll `connectStatus`
  → `disconnect`) is identical across Connect Meta, Meta Ads, and Social
  Publishing, so you learn it once.


---

# crm-tags

Source: integrations/crm-tags/docs.md

# CRM Tags Integration

Manage contact and session tags for organizing and triggering automated boosters.

## Category
CRM

## Required API Keys
None (uses internal APIs)

## API Endpoints

Note: All entity-tags endpoints require `workspaceId` as a query parameter.

### Create a Tag

```
POST /api/workspace-tags/:workspaceId
```

**Request:**
```json
{
  "name": "vip-customer",
  "color": "#FF5733"
}
```

**Response:**
```json
{
  "tag": {
    "id": "wtag_abc123",
    "workspaceId": "ws_xyz",
    "name": "vip-customer",
    "color": "#FF5733"
  }
}
```

### List All Tags

```
GET /api/workspace-tags/:workspaceId
```

**Response:**
```json
{
  "tags": [
    {
      "id": "wtag_abc123",
      "workspaceId": "ws_xyz",
      "name": "vip-customer",
      "color": "#FF5733"
    }
  ]
}
```

### Apply Tag to Contact

Applying a tag to a contact automatically propagates it to any linked sessions.

```
POST /api/entity-tags/contacts/:contactId/tags?workspaceId=:workspaceId
```

**Request:**
```json
{
  "tagId": "wtag_abc123",
  "propagateToSessions": true
}
```

**Response:**
```json
{
  "entityTag": {
    "id": "etag_xyz",
    "entityType": "contact",
    "entityId": "contact_123",
    "tagId": "wtag_abc123",
    "sourceType": "direct"
  }
}
```

### Apply Tag to Session

```
POST /api/entity-tags/sessions/:sessionId/tags?workspaceId=:workspaceId
```

**Request:**
```json
{
  "tagId": "wtag_abc123",
  "propagateToContact": false
}
```

### Get Contact Tags

```
GET /api/entity-tags/contacts/:contactId/tags?workspaceId=:workspaceId
```

**Response:**
```json
{
  "tags": [
    {
      "id": "etag_xyz",
      "tagId": "wtag_abc123",
      "sourceType": "direct",
      "tag": {
        "id": "wtag_abc123",
        "name": "vip-customer",
        "color": "#FF5733"
      }
    }
  ],
  "count": 1
}
```

### Get Session Tags

```
GET /api/entity-tags/sessions/:sessionId/tags?workspaceId=:workspaceId&includeInherited=true
```

Optional query parameter `includeInherited` (default: true) controls whether tags inherited from linked contacts are included.

### Remove Tag from Contact

```
DELETE /api/entity-tags/contacts/:contactId/tags/:tagId?workspaceId=:workspaceId
```

### Remove Tag from Session

```
DELETE /api/entity-tags/sessions/:sessionId/tags/:tagId?workspaceId=:workspaceId
```

## Additional Endpoints (Advanced)

- `PUT /api/workspace-tags/:workspaceId/:tagId` - Update tag name/color
- `DELETE /api/workspace-tags/:workspaceId/:tagId` - Delete a tag
- `POST /api/entity-tags/bulk?workspaceId=:workspaceId` - Bulk tag multiple entities
- `GET /api/entity-tags/entities?workspaceId=:workspaceId&tagId=:tagId` - Find all entities with a tag

## Event-Triggered Boosters

When a tag is applied, it can trigger automated "boosters" (reminder templates). Create boosters with `timing_type: "on_tag"` in the CRM Boosters UI to automatically send messages when contacts or sessions receive specific tags.

## Use Cases
- Segment contacts into categories (VIP, lead, customer)
- Trigger automated follow-up messages when tags are applied
- Organize sessions by status or intent
- Build conditional workflows based on customer segments
- Track customer journey stages

## Notes
- Tags are workspace-scoped (tag IDs are prefixed with `wtag_`)
- Color must be a valid hex color (e.g., #FF5733)
- Tags propagate from contacts to linked sessions by default
- Boosters can be configured to trigger on specific tags


---

# email-sequences

Source: integrations/email-sequences/docs.md

# Email Sequences Integration

Create multi-step automated email campaigns triggered by events, schedules, or manual actions.

## Category
Marketing / Automation

## Required API Keys
- Mailgun API Key (already configured platform-wide)
- Workspace must have a verified email domain

## Concepts

- **Sequence** — A series of emails with defined delays between them, scoped to a workspace. Example: Day 0: Welcome, Day 3: Tips, Day 7: Special Offer.
- **Step** — A single email within a sequence, with a delay (in hours or days) from the previous step or trigger event.
- **Enrollment** — When a contact is added to a sequence. Each contact progresses through steps independently.
- **Trigger** — What starts the sequence: manual enrollment, form submission, webhook, or scheduled event.

---

## API Endpoints

All endpoints are scoped to a workspace via the URL path.

### Create a Sequence
```
POST /api/workspaces/:workspaceId/email-sequences
```

**Request:**
```json
{
  "name": "Welcome Series",
  "description": "Onboarding email sequence for new signups",
  "fromName": "Acme Team",
  "replyTo": "hello@yourdomain.com",
  "steps": [
    {
      "order": 1,
      "delayHours": 0,
      "subject": "Welcome to Acme!",
      "textBody": "Hi {{firstName}}, thanks for joining!",
      "htmlBody": "<h1>Welcome, {{firstName}}!</h1><p>Thanks for joining Acme.</p>"
    },
    {
      "order": 2,
      "delayHours": 72,
      "subject": "3 tips to get started",
      "textBody": "Here are 3 tips...",
      "htmlBody": "<h1>Getting Started</h1><ol><li>Tip 1</li><li>Tip 2</li><li>Tip 3</li></ol>"
    },
    {
      "order": 3,
      "delayHours": 168,
      "subject": "Special offer just for you",
      "textBody": "As a valued member, here's 20% off...",
      "htmlBody": "<h1>20% Off</h1><p>Use code WELCOME20 at checkout.</p>"
    }
  ]
}
```

- `name` — Required. Sequence name.
- `steps` — Required. Array of email steps.
- `steps[].order` — Step order (1-indexed).
- `steps[].delayHours` — Hours to wait after previous step (0 = send immediately).
- `steps[].subject` — Email subject. Supports `{{variable}}` template syntax.
- `steps[].textBody` / `steps[].htmlBody` — Email content. Supports `{{variable}}` template syntax.
- `fromName` — Optional. Sender display name.
- `replyTo` — Optional. Reply-to address.

**Response:**
```json
{
  "id": "seq-abc-123",
  "workspaceId": "workspace-123",
  "name": "Welcome Series",
  "status": "active",
  "stepsCount": 3,
  "enrollmentCount": 0,
  "createdAt": "2024-01-14T12:00:00.000Z"
}
```

### List Sequences
```
GET /api/workspaces/:workspaceId/email-sequences
```

### Get Sequence Details
```
GET /api/workspaces/:workspaceId/email-sequences/:sequenceId
```

Returns sequence metadata plus all steps and enrollment stats.

### Update a Sequence
```
PATCH /api/workspaces/:workspaceId/email-sequences/:sequenceId
```

### Delete a Sequence
```
DELETE /api/workspaces/:workspaceId/email-sequences/:sequenceId
```

### Pause / Resume a Sequence
```
POST /api/workspaces/:workspaceId/email-sequences/:sequenceId/pause
POST /api/workspaces/:workspaceId/email-sequences/:sequenceId/resume
```

### Enroll a Contact
```
POST /api/workspaces/:workspaceId/email-sequences/:sequenceId/enroll
```

**Request:**
```json
{
  "email": "john@example.com",
  "variables": {
    "firstName": "John",
    "company": "Acme Inc"
  }
}
```

### Enroll Multiple Contacts (Batch)
```
POST /api/workspaces/:workspaceId/email-sequences/:sequenceId/enroll/batch
```

**Request:**
```json
{
  "contacts": [
    { "email": "john@example.com", "variables": { "firstName": "John" } },
    { "email": "jane@example.com", "variables": { "firstName": "Jane" } }
  ]
}
```

### Unenroll a Contact
```
POST /api/workspaces/:workspaceId/email-sequences/:sequenceId/unenroll
```

```json
{
  "email": "john@example.com"
}
```

### Get Enrollment Status
```
GET /api/workspaces/:workspaceId/email-sequences/:sequenceId/enrollments
```

Returns per-contact progress through the sequence.

---

## Template Variables

Email subjects and bodies support `{{variable}}` template syntax. Variables are provided at enrollment time.

**Built-in variables:**
- `{{email}}` — Contact's email address
- `{{unsubscribeUrl}}` — One-click unsubscribe link

**Custom variables:** Any key-value pair passed in the `variables` object at enrollment.

---

## Sequence Execution

The system uses the Task Scheduler to process sequence steps:

1. When a contact is enrolled, the first step (delayHours = 0) sends immediately
2. After each step, the system schedules the next step using the delay
3. If a sequence is paused, no new steps are sent
4. If a contact unsubscribes, they are removed from all active sequences

---

## Use Cases

1. **Welcome/Onboarding** — Multi-day onboarding series for new signups
2. **Nurture Campaigns** — Gradually educate leads about your product
3. **Post-Purchase** — Follow-up emails after a purchase (tips, review requests, upsells)
4. **Re-engagement** — Win back inactive customers with escalating offers
5. **Event Follow-up** — Post-event recap, slides, and next steps
6. **Trial Conversion** — Guide trial users toward paid conversion

---

## Common Patterns

### Welcome Series
```json
{
  "name": "Welcome Series",
  "steps": [
    { "order": 1, "delayHours": 0, "subject": "Welcome, {{firstName}}!", "textBody": "..." },
    { "order": 2, "delayHours": 24, "subject": "Quick tip to get started", "textBody": "..." },
    { "order": 3, "delayHours": 72, "subject": "Have questions? We're here to help", "textBody": "..." },
    { "order": 4, "delayHours": 168, "subject": "Your first week recap", "textBody": "..." }
  ]
}
```

### Trigger from Server Function Hook
Enroll contacts when a form is submitted:

```javascript
const { email, firstName } = request.body;

// Enroll in welcome sequence
console.log('Enrolling ' + email + ' in welcome sequence');
respond(200, {
  action: 'enroll',
  sequenceId: 'seq-welcome',
  email,
  variables: { firstName }
});
```

### Conditional Steps
Use step metadata to indicate conditions (agent interprets):

```json
{
  "order": 3,
  "delayHours": 72,
  "subject": "Special offer just for you",
  "metadata": {
    "condition": "has_not_purchased",
    "skipIfPurchased": true
  }
}
```


---

# funnel-analytics

Source: integrations/funnel-analytics/docs.md

# Funnel Analytics & Event Tracking

Fire funnel events into Google Tag Manager with `window.trackFunnelEvent`, and standard browser conversions into the workspace’s Meta Pixel with `window.__audosTrackMetaEvent`.

## Category
Analytics & Tracking

## Required API Keys
None. Tracking is configured at the workspace level (Google Tag Manager container id, Meta Pixel id, custom head HTML). When nothing is configured the helper is a safe no-op — it never throws.

## How it works

Every compiled Space app has these globals injected into the page, with **no setup required**:

- `window.dataLayer` — the standard Google Tag Manager data layer array.
- `window.trackFunnelEvent(eventName, params?)` — pushes `{ event: eventName, ...params }` onto `window.dataLayer`. If the workspace has a GTM container configured, GTM (and the tags inside it) receive the event. If not, the push is harmless.
- `window.__audosTrackMetaEvent(eventName, params?, eventId?)` — when a workspace Meta Pixel is present and marketing consent allows it, queues a standard browser event with a stable Meta `eventID` and returns that ID. It returns `null` when Meta tracking is unavailable.

When the workspace has a Google Tag Manager container id set (`google_tag_manager_id`), the GTM head + body snippets are injected automatically, identical to the workspace's landing page. A Meta Pixel (`meta_pixel_id`) is injected by the serving layer and respects the workspace GDPR consent setting. Any `custom_head_html` configured for the workspace is also injected.

## Usage

```ts
// Always safe to call — no import, no setup.
window.trackFunnelEvent('lead_submitted', { plan: 'pro', value: 49 });
window.trackFunnelEvent('checkout_started');

const metaEventId = window.__audosTrackMetaEvent?.('Lead', {
  content_name: 'Signup form',
});
```

Pass an event name and an optional flat object of parameters. The parameters are merged into the dataLayer push alongside `event: <eventName>`, so GTM triggers and variables can read them.

## Notes

- The helper is defined before your app bundle runs, so it is safe to call during render or in effects.
- Do not assume a tag is present — design events to be useful for GTM but harmless when unconfigured.
- For typed access, copy the `Window` declaration from `example.tsx`; do not cast the helper to `any`.
- This helper is browser-pixel tracking, not Meta Conversions API. Meta only attributes conversions that match eligible ad traffic.


---

# google-ads

Source: integrations/google-ads/docs.md

# Google Ads Integration

Connect a founder's Google Ads account, link it to the Audos manager account, check whether it can run ads, build paused Search campaigns, read campaign performance, and pause or resume Google Ads campaigns through the platform's Google gateway.

## Category
Marketing / Advertising

## Required API Keys
None. The workspace's Google connection is used server-side through the
Audos gateway (Audos manager account, developer token and OAuth all live
there). The app only needs the workspace DB token that the WorkspaceDB SDK
already injects (see Authentication below).

## Concepts

- **One account per founder** — each workspace connects its own Google Ads
  client account, linked under the Audos manager account (MCC). Connecting
  never creates a Google Ads account.
- **Manager link** — after connecting, send the Audos invitation (`POST
  .../link`). The founder accepts it in Google Ads under Admin, then Access
  and security, then Managers, then you call `.../link` with `refresh`.
- **Readiness** — a connected account can still be blocked from running ads.
  `readiness.canLaunch` is `true` only when the token is healthy, the manager
  link is `ACTIVE`, the account is enabled and billing is `APPROVED`.
  `readiness.blockers` lists what is missing. Treat an unknown as blocked.
- **Founder messages** — responses carry `founderMessages` (status) or
  `founderMessage` (errors, link, launch): plain text to show the founder.
  Show those instead of raw codes.
- **Campaign ids** — the `campaigns` list returns this workspace's Google Ads
  campaigns. `:campaignId` in the paths below is that list's `id`; the server
  resolves the real Google campaign id itself.
- **Launch builds PAUSED.** `POST .../google-ads/launch` builds a Search
  campaign (budget, campaign, targeting, ad group, keywords, responsive
  search ad). Everything is created paused, so nothing spends until it is
  resumed. If it stops part-way, the result has `complete: false` and the
  campaign stays paused.
- **Pause is always allowed; resume needs readiness.** Resuming a campaign
  that cannot launch answers `409` with `error_code: "GOOGLE_NOT_READY"` and
  the `blockers`.

## Authentication

Every request is workspace-scoped and authenticated. Reference
`window.__workspaceDb` anywhere in your app so the SDK (and its token) is
injected, then attach the token on each call:

```ts
const ws = (window as any).__workspaceDb;        // { workspaceId, token }
const base = `/api/workspaces/${ws.workspaceId}/google-ads`;
const headers = { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token };
```

---

## Quick Start

```tsx
// Connect Google Ads in-app, then check whether the account can run ads.
const ws = (window as any).__workspaceDb;
const base = `/api/workspaces/${ws.workspaceId}/google-ads`;
const auth = { 'X-Workspace-DB-Token': ws.token };

// 1. Is an account connected, and can it run ads?
const status = await fetch(`${base}/connect/status`, { headers: auth }).then((r) => r.json());

// 2. If not connected, start Google sign-in, open the URL, then poll status.
if (!status.connected) {
  const { authUrl } = await fetch(`${base}/connect/init`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
  }).then((r) => r.json());
  window.open(authUrl, '_blank');
} else if (!status.readiness.canLaunch) {
  // Plain founder text for each blocker (never show the raw codes).
  status.founderMessages.forEach((m) => console.log(m.message));
}
```

---

## API Endpoints

### Connection Status
```
GET /api/workspaces/:workspaceId/google-ads/connect/status
```
**Response:**
```json
{
  "success": true,
  "connected": true,
  "status": "connected",
  "customerId": "1234567890",
  "accountMode": "linked",
  "linkStatus": "ACTIVE",
  "errorCode": null,
  "errorMessage": null,
  "readiness": {
    "available": true,
    "tokenHealth": "ok",
    "accountStatus": "ENABLED",
    "billingStatus": "APPROVED",
    "canLaunch": true,
    "blockers": []
  },
  "founderMessages": []
}
```
- `status` — `not_connected` | `pending` | `connected` | `failed`
- `accountMode` — `linked` (under the Audos manager) | `own` (link not active yet) | `created`
- `readiness.available: false` means the gateway could not be reached; show
  the connection but treat the account as blocked.
- `founderMessages` — `[{ code, message, action }]`, one per blocker (and a
  stored connect error). `action` is one of `connect`, `reconnect`,
  `create_account`, `choose_account`, `accept_invite`, `send_invite`,
  `set_up_billing`, `wait_and_retry`, `fix_request`, `none`.

### Start Connect
```
POST /api/workspaces/:workspaceId/google-ads/connect/init
```
**Response:** `{ success: true, authUrl: "https://accounts.google.com/..." }`
Open `authUrl` in a new tab, then poll Connection Status.

### Disconnect
```
POST /api/workspaces/:workspaceId/google-ads/connect/disconnect
```
**Response:** `{ success: true }`
Afterwards Connection Status reads `not_connected`; connect again with Start
Connect. Campaigns already on Google are left as they are.

### Manager Link Invite
```
POST /api/workspaces/:workspaceId/google-ads/link
```
**Request:**
```json
{ "action": "send" }
```
- `action` — `send` (default; does nothing if already `ACTIVE` or `PENDING`) |
  `resend` (replace a stale pending invite) | `refresh` (re-check after the
  founder accepted)

**Response:**
```json
{
  "success": true,
  "action": "send",
  "link_status": "PENDING",
  "nextStep": "FOUNDER_ACCEPT_IN_GOOGLE_ADS",
  "invited": true,
  "founderMessage": { "code": "FOUNDER_ACCEPT_IN_GOOGLE_ADS", "message": "Open Google Ads, go to Admin, then Access and security, then Managers, and accept the invitation from Audos. Then check again.", "action": "accept_invite" }
}
```
- `nextStep` — `NONE` | `FOUNDER_ACCEPT_IN_GOOGLE_ADS` | `RESEND_INVITE` |
  `SEND_INVITE` | `RETRY_REFRESH`

### Launch a Campaign (built PAUSED)
```
POST /api/workspaces/:workspaceId/google-ads/launch
```
**Request:**
```json
{
  "campaignName": "Search - Brand",
  "dailyBudget": 20,
  "finalUrl": "https://example.com",
  "headlines": ["Bella Bistro", "Fresh Pasta Daily", "Book A Table"],
  "descriptions": ["Handmade pasta in the heart of town.", "Open late, seven days a week."],
  "keywords": ["bella bistro", { "text": "pasta near me", "matchType": "EXACT" }],
  "geoTargetIds": ["2840"],
  "languageIds": ["1000"],
  "biddingStrategyType": "MAXIMIZE_CLICKS"
}
```
- `campaignName` (up to 255), `adGroupName?` (up to 255)
- `dailyBudget` — account currency units, e.g. `20`
- `biddingStrategyType?` — `MAXIMIZE_CLICKS` (default) | `MAXIMIZE_CONVERSIONS` | `TARGET_CPA` | `MANUAL_CPC`; `targetCpa?` (TARGET_CPA only), `cpcBid?` (required for MANUAL_CPC)
- `geoTargetIds?` (default `["2840"]`, United States), `languageIds?` (default `["1000"]`, English)
- `keywords` — 1 to 50, each a string or `{ text, matchType? }`; `matchType` `PHRASE` (default) | `EXACT` | `BROAD`
- `headlines` — 3 to 15, each up to 30 characters; `descriptions` — 2 to 4, each up to 90 characters
- `finalUrl` — absolute http(s) URL; `path1?` / `path2?` up to 15 characters (`path2` needs `path1`)

**Response:**
```json
{
  "success": true,
  "complete": true,
  "status": "PAUSED",
  "googleCampaignId": "20123456789",
  "googleAdGroupId": "30123",
  "failedStep": null,
  "founderMessage": null,
  "localCampaignId": 42
}
```
If the build stops part-way, `success` and `complete` are `false`, `failedStep`
says where (`budget` | `campaign` | `geo` | `ad_group` | `keywords` | `rsa`),
the objects already created stay paused, and `founderMessage` explains what
happened.

### List Campaigns
```
GET /api/workspaces/:workspaceId/google-ads/campaigns
```
**Response:**
```json
{
  "campaigns": [
    {
      "id": 42,
      "name": "Search - Brand",
      "provider": "google_ads",
      "googleCampaignId": "20123456789",
      "budgetCents": 2000,
      "status": "active",
      "launchStatus": "active",
      "createdAt": "2026-09-29T12:00:00.000Z",
      "targetUrl": "https://example.com",
      "launchErrorCode": null,
      "launchComplete": true,
      "failedStep": null
    }
  ]
}
```
- `launchComplete: false` — the launch stopped at `failedStep`; the campaign
  is paused and cannot be resumed.

### Pause / Resume a Campaign
<!-- MANIFEST:ENDPOINT PATCH /api/workspaces/:workspaceId/google-ads/campaigns/:campaignId/status | Pause / Resume a Campaign -->
```
PATCH /api/workspaces/:workspaceId/google-ads/campaigns/:campaignId/status
```
**Request:**
```json
{ "status": "PAUSED" }
```
- `status` — `PAUSED` | `ENABLED`

**Response:** `{ success: true, googleCampaignId: "...", status: "PAUSED", result: {...} }`

### Campaign Performance
```
GET /api/workspaces/:workspaceId/google-ads/campaigns/:campaignId/analytics?days=30
```
- `days` — trailing days, 1–365 (default 30); or pass `startDate` and
  `endDate` as `YYYY-MM-DD`

**Response:**
```json
{
  "success": true,
  "googleCampaignId": "20123456789",
  "dateRange": { "startDate": "2026-08-31", "endDate": "2026-09-29" },
  "totals": { "impressions": 1200, "clicks": 48, "spend": 31.5, "conversions": 3, "conversionsValue": 0, "ctr": 0.04, "cpc": 0.66 },
  "daily": [{ "date": "2026-09-28", "impressions": 40, "clicks": 2, "spend": 1.1, "conversions": 0 }]
}
```
`spend` and `cpc` are in the account currency. A campaign that has not been
created on Google yet answers `409` with `error_code: "GOOGLE_CAMPAIGN_NOT_LAUNCHED"`.

---

## Error Codes

| HTTP | error_code | Meaning |
|------|-----------|---------|
| 400 | `INVALID_LAUNCH_INPUT` | Launch details break a limit; see `errors: [{ field, error }]` |
| 400 | `INVALID_ACTION` | Link `action` is not send, resend or refresh |
| 403 | `CUSTOMER_NOT_OWNED`, `GOOGLE_RECONNECT_REQUIRED`, ... | Google ownership gate refused the call |
| 409 | `GOOGLE_CONNECTION_REQUIRED` | No connected Google Ads account for this workspace |
| 409 | `GOOGLE_NOT_READY` | Launch or resume refused; see `blockers` and `founderMessages` |
| 409 | `GOOGLE_CAMPAIGN_NOT_LAUNCHED` | The campaign has no Google campaign id yet |
| 409 | `GOOGLE_LAUNCH_INCOMPLETE` | Resume refused on an incomplete launch |
| 409 | `GOOGLE_LAUNCH_IN_PROGRESS` | A launch for this campaign is already running |
| 424 / 429 | Google codes | Google needs something fixed on the account / is rate limiting; see `founderMessage` |
| 502 | `GOOGLE_GATEWAY_UNREACHABLE` | The Google gateway did not answer; retry later |

Every error body carries `founderMessage` (plain text) and `founderAction`.

Connection failures are reported on Connection Status as `errorCode` with a
matching entry in `founderMessages`, for example `NOT_ADS_USER` ("create a
Google Ads account first"), `LINK_PENDING` (accept the Audos manager
invitation in Google Ads), `INELIGIBLE_MCC`, `DEVELOPER_TOKEN_NOT_APPROVED` or
`INVALID_GRANT` (reconnect).


---

# inbound-email

Source: integrations/inbound-email/docs.md

# Inbound Email Integration

Receive, process, and auto-respond to emails on behalf of workspace customers using Mailgun inbound routing and server functions.

## Category
Communication

## Required API Keys
- Mailgun API Key (already configured platform-wide)
- Workspace must have a verified email domain

## Concepts

- **Inbound Route** — A Mailgun route that forwards incoming emails to a workspace's server function hook for processing.
- **Email Thread** — Tracked using In-Reply-To and References headers to maintain conversation context.
- **Auto-Response** — The agent can analyze incoming emails and generate contextual replies using the workspace's AI agent and business context.
- **User-Key Tagging** — Every email (inbound and outbound) can be tagged with a `sessionId`, `contactId`, or `userId` so you can query all emails for a specific end customer.

---

## Architecture

```
Incoming Email → Mailgun → POST /api/mailgun/webhooks/inbound → Email Processor stores to workspace_email_messages → AI Chat Service auto-responds
```

1. Customer sends email to `support@yourdomain.com` (or any address on the workspace's verified domain)
2. Mailgun receives the email and forwards it to the platform's inbound webhook endpoint
3. The platform automatically resolves the recipient to the correct workspace
4. The email is stored in the `workspace_email_messages` table with direction `inbound`
5. The AI Chat Service automatically processes the email and generates a contextual reply using workspace context

This is **already fully built** — emails received by Mailgun are automatically processed, stored, and replied to by the workspace's AI agent.

**Receiving prerequisites (read this before debugging "my emails never arrive"):**

1. **Verified email domain** — the workspace's custom domain must be verified (SPF + DKIM). Verification alone enables *sending*.
2. **MX records must point at Mailgun** — inbound mail only reaches the platform when the domain's MX records are `mxa.mailgun.org` and `mxb.mailgun.org` (priority 10). A domain can be fully verified for sending and still receive **nothing** because no MX records exist or they point at another mail provider. Ask the platform to check/publish MX: for Audos-managed DNS zones this is automatic on request (the inbound "switch to Audos" action); for external DNS the founder adds the two MX records at their DNS host.
3. **Nothing else** — webhooks and inbound routing are registered programmatically for every custom domain; there is no manual Mailgun dashboard step.

---

## Workspace-Scoped Email API

All endpoints are scoped to a workspace via the URL path. Emails can be tagged with a **user key** (`sessionId`, `contactId`, or `userId`) to associate them with a specific end customer.

### Send an Email
```
POST /api/workspaces/:workspaceId/emails/send
```

**Request:**
```json
{
  "to": "john@example.com",
  "subject": "Your order has shipped!",
  "text": "Hi John, your order #12345 has shipped and will arrive by Friday.",
  "html": "<h1>Your order has shipped!</h1><p>Order #12345 will arrive by Friday.</p>",
  "sessionId": "session-abc-123",
  "contactId": "contact-xyz-456",
  "metadata": {
    "orderId": "12345",
    "type": "shipping-notification"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `to` | Yes | Recipient email address |
| `subject` | Yes | Email subject line |
| `text` | Yes | Plain text body |
| `html` | No | HTML body (for rich formatting) |
| `from` | No | Sender address (defaults to workspace's verified email) |
| `replyTo` | No | Reply-to address |
| `sessionId` | No | Workspace session ID to tag this email with (for per-customer querying) |
| `contactId` | No | Funnel contact ID to tag this email with |
| `userId` | No | Workspace user ID to tag this email with |
| `metadata` | No | Custom JSON metadata attached to the email record |
| `inReplyTo` | No | Message-Id of the email being replied to (for threading) |
| `references` | No | Thread reference chain (for threading) |

**Response:**
```json
{
  "success": true,
  "id": "wemail_abc123",
  "mailgunMessageId": "<msg-id@yourdomain.com>",
  "status": "sent"
}
```

### List Email Messages
```
GET /api/workspaces/:workspaceId/emails
```

Returns email messages for the workspace with filtering and pagination.

**Access Control:** A user key (`sessionId`, `contactId`, or `userId`) is **always required**. This prevents end-customer apps from accidentally fetching another customer's emails. Otto uses the internal `/api/mailgun/messages/:workspaceId` endpoint for full workspace-wide email access.

**Query Parameters:**

| Param | Description |
|-------|-------------|
| `sessionId` | Filter by workspace session ID (get all emails for a specific customer session) |
| `contactId` | Filter by funnel contact ID |
| `userId` | Filter by workspace user ID |
| `direction` | Filter by `inbound` or `outbound` |
| `status` | Filter by email status (`sent`, `delivered`, `opened`, `bounced`, `failed`, etc.) |
| `limit` | Max results per page (default 50, max 100) |
| `offset` | Pagination offset (default 0) |

**Response:**
```json
{
  "messages": [
    {
      "id": "wemail_abc123",
      "workspaceId": "workspace-123",
      "workspaceSessionId": "session-abc-123",
      "funnelContactId": "contact-xyz-456",
      "direction": "outbound",
      "from": "Acme <support@acme.com>",
      "fromEmail": "support@acme.com",
      "to": "john@example.com",
      "toEmail": "john@example.com",
      "subject": "Your order has shipped!",
      "bodyPlain": "Hi John, your order #12345 has shipped...",
      "bodyHtml": "<h1>Your order has shipped!</h1>...",
      "status": "delivered",
      "deliveredAt": "2025-01-14T12:01:00.000Z",
      "createdAt": "2025-01-14T12:00:00.000Z"
    },
    {
      "id": "wemail_def456",
      "workspaceId": "workspace-123",
      "workspaceSessionId": "session-abc-123",
      "direction": "inbound",
      "from": "John Doe <john@example.com>",
      "fromEmail": "john@example.com",
      "to": "support@acme.com",
      "toEmail": "support@acme.com",
      "subject": "Re: Your order has shipped!",
      "bodyPlain": "Thanks! What's the tracking number?",
      "strippedText": "Thanks! What's the tracking number?",
      "status": "delivered",
      "createdAt": "2025-01-14T14:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Get a Specific Email
```
GET /api/workspaces/:workspaceId/emails/:messageId
```

Returns full details of a single email message, ensuring it belongs to the workspace.

**Access Control:** Same as list — always requires a user key. Also verifies the message belongs to that user key (won't return another customer's email even if you have the message ID).

**Example:** `GET /api/workspaces/ws-123/emails/wemail_abc123?sessionId=session-abc-123`

### Get Email Thread by Customer Email
```
GET /api/workspaces/:workspaceId/emails/thread/:email
```

Returns all inbound and outbound emails for a specific email address within the workspace, in chronological order. This is the key endpoint for building a conversation view in a UI.

**Access Control:** Same as list — always requires a user key. The thread is scoped to only show emails tagged with that user key, so one customer can't see another customer's email threads.

**Example:** `GET /api/workspaces/ws-123/emails/thread/john@example.com?sessionId=session-abc-123`

**Response:**
```json
{
  "messages": [
    {
      "id": "wemail_001",
      "direction": "outbound",
      "subject": "Welcome to Acme!",
      "bodyPlain": "Thanks for signing up...",
      "status": "delivered",
      "createdAt": "2025-01-10T09:00:00.000Z"
    },
    {
      "id": "wemail_002",
      "direction": "inbound",
      "subject": "Re: Welcome to Acme!",
      "strippedText": "Thanks! How do I get started?",
      "status": "delivered",
      "createdAt": "2025-01-10T15:30:00.000Z"
    },
    {
      "id": "wemail_003",
      "direction": "outbound",
      "subject": "Re: Welcome to Acme!",
      "bodyPlain": "Great question! Here are 3 steps to get started...",
      "status": "delivered",
      "createdAt": "2025-01-10T15:31:00.000Z"
    }
  ]
}
```

---


## Per-User Plus Addresses (Routing Tokens)

Workspaces with a branded email domain can hand out **unique inbound addresses per end user** using plus-addressing:

```
<local>+<token>@yourdomain.com     e.g. coach+jane-doe@yourdomain.com
```

Where `<local>@yourdomain.com` is the workspace's verified sending address (its `defaultFromEmail`). The token is **opaque** — whatever the founder puts after the `+` works (letters, digits, dots, hyphens). Matching of the base address is case-insensitive. The forwarded `hello@`/`support@` local parts tolerate suffixes too, so `support+ticket123@yourdomain.com` doesn't bounce.

**How routing works:**

1. Email to `coach+jane@yourdomain.com` resolves to the workspace via the base address (`coach@yourdomain.com`).
2. When a token is present, the message ties to a **stable per-token session and contact** keyed on the full plus address — two emails with the same token land in the same session **even from different senders** (e.g. a coach forwarding Zoom summaries from work and personal accounts). The sender of each message is recorded on the message trail.
3. A token-less email to `coach@yourdomain.com` keeps the normal per-sender behavior exactly.
4. If the sender also has their own per-sender session, the **token session wins** for token-bearing mail; the per-sender session is untouched.

**What the agent sees:** token-bearing messages carry a context line with the full recipient address and the token, and the stored email row records `plusToken`, `recipientBaseEmail`, and `recipientFull` in `mailgunMetadata` — so a workspace agent can act on "which user's address was this sent to" (e.g. structuring forwarded notes into that user's session).

**Telling users about their address:** just mint any stable identifier per user and tell them, e.g. *"Forward your meeting notes to `coach+<your-id>@yourdomain.com` — everything you send there lands in your own thread."* No token registration or setup is needed.

**Existing domains:** routes provisioned before this feature are upgraded automatically shortly after each server boot (an idempotent in-process sweep rewrites non-catch-all forward routes to the plus-tolerant expression). No manual re-provisioning is required.

Hyphen-style addresses (`coach-token@`) are NOT routing tokens — hyphens are ordinary local-part characters.

## User-Key Tagging

Every email can be tagged with one or more user keys to associate it with a specific end customer:

| Key | Use Case |
|-----|----------|
| `sessionId` | Tag with the customer's workspace session (most common — aligns with session-based tracking) |
| `contactId` | Tag with a CRM contact record from the funnel_contacts table |
| `userId` | Tag with a workspace user record (for logged-in users) |

**How to use in practice:**

1. **Sending emails** — Pass `sessionId`, `contactId`, or `userId` in the send request body
2. **Querying emails** — Filter the list endpoint by the same key: `GET /emails?sessionId=session-abc-123`
3. **Thread view** — Use the thread endpoint to see all emails to/from a specific address: `GET /emails/thread/john@example.com`

**All three keys have database indexes** for fast filtering at scale.

---

## How It Works (Already Implemented)

### Inbound Webhook (Platform-Level)
The platform handles Mailgun inbound webhooks at:
```
POST /api/mailgun/webhooks/inbound
```
This endpoint verifies Mailgun signatures, stores the email, detects duplicates, and triggers AI processing. Workspace developers do **not** need to create this route — it exists.

### Email Storage
All inbound and outbound emails are stored in the `workspace_email_messages` table with fields:
- `direction` — `inbound` or `outbound`
- `from`, `to`, `subject`, `bodyPlain`, `bodyHtml`
- `strippedText` — Mailgun's cleaned reply text (no signatures/quoted text)
- `mailgunMessageId` — For deduplication
- `workspaceId` — Workspace scope
- `workspaceSessionId` — Session-based customer tracking
- `workspaceUserId` — User-based customer tracking
- `funnelContactId` — CRM contact linkage
- `status` — Delivery status: `pending`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`

### AI Auto-Response
The Email Chat Service automatically:
1. Identifies the workspace from the recipient domain
2. Loads workspace context and business information
3. Generates a contextual reply using the workspace's AI agent
4. Sends the reply via Mailgun with the workspace's domain

### Optional: Custom Processing via Server Functions Hook
For workspaces that want custom email processing logic beyond AI auto-response, create a server function hook.

Hook execute URLs accept `application/json`, `application/x-www-form-urlencoded`, **and `multipart/form-data`** — so you can also point third-party inbound-parse services (SendGrid Inbound Parse, a direct Mailgun route with a `store()`/`forward()` action) straight at a hook. Multipart text fields arrive as plain keys on `request.body`; attachments arrive under `request.body.files` (base64, capped — see `integrations/server-functions/` docs for field mapping and limits).

```
POST /api/workspaces/:workspaceId/hooks
```

```json
{
  "name": "inbound-email",
  "description": "Custom email processing",
  "code": "const email = request.body;\nconsole.log('From:', email.from);\nconsole.log('Subject:', email.subject);\nrespond(200, { received: true });",
  "secret": "mailgun-webhook-secret-123"
}
```

---

## Inbound Email Payload

When Mailgun forwards an email, your hook receives this in `request.body`:

```json
{
  "from": "John Doe <john@example.com>",
  "sender": "john@example.com",
  "to": "support@yourdomain.com",
  "subject": "Question about my order",
  "bodyPlain": "Hi, I have a question about order #12345...",
  "bodyHtml": "<p>Hi, I have a question about order #12345...</p>",
  "strippedText": "Hi, I have a question about order #12345...",
  "messageId": "<msg-id@example.com>",
  "inReplyTo": null,
  "references": null,
  "date": "2025-01-14T12:00:00Z",
  "attachments": [],
  "senderIdentity": {
    "recognized": true,
    "email": "john@example.com",
    "name": "John Doe",
    "workspaceUserId": "wu_9f3c...",
    "workspaceSessionUuid": "space-registration:...",
    "funnelContactId": "contact_4a71...",
    "emailVerified": true,
    "knownToWorkspace": true,
    "matchedOn": "workspace_user"
  }
}
```

### `senderIdentity` — who sent it

The platform resolves the sender against **your workspace's own records** before
your hook runs, so you do not have to rebuild sender recognition inside your app.
Anyone who holds an account, a registration (however they signed up — browser,
email, social) or a contact record in your workspace is recognised.

| Field | Meaning |
|-------|---------|
| `recognized` | `true` when this address holds a record in **your** workspace |
| `email` | The sender's address, lowercased |
| `name` | The name your workspace holds for them, falling back to the From header |
| `workspaceUserId` | Their `workspace_users` id, or `null` |
| `workspaceSessionUuid` | The registration/session that matched, or `null` |
| `funnelContactId` | Their contact record id, or `null` |
| `emailVerified` | `true` when your workspace has verified they own the address |
| `knownToWorkspace` | Mirrors `recognized`; reads naturally in handler code |
| `matchedOn` | `"workspace_user"`, `"workspace_session"`, `"funnel_contact"`, or `null` |

A stranger arrives with an **explicit** unrecognised block, never a blank one:

```json
"senderIdentity": {
  "recognized": false,
  "email": "cold-outreach@example.com",
  "name": "Cold Outreach",
  "workspaceUserId": null,
  "workspaceSessionUuid": null,
  "funnelContactId": null,
  "emailVerified": false,
  "knownToWorkspace": false,
  "matchedOn": null
}
```

Two things worth knowing:

- **Identity, not permission.** The platform reports *who* sent the message; whether
  they may do anything is your app's decision. Gate on `emailVerified` when the
  action matters — a From address alone is self-asserted and trivially forged.
- **Scoped to you.** Identities are only ever resolved within the workspace that
  received the mail. An account with the same address in another workspace is
  never borrowed, so these ids are always safe to join against your own data.

```javascript
const { sender, subject, senderIdentity } = request.body;

if (senderIdentity.recognized && senderIdentity.emailVerified) {
  await handleKnownCustomer(senderIdentity.workspaceUserId, subject);
} else {
  await handleStranger(sender, subject);
}
respond(200, { received: true });
```

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "`senderIdentity` — who sent it" above. -->
**Who sent it (`senderIdentity`):** the inbound-email hook payload carries a
`senderIdentity` object resolved against **this** workspace's own records — an
account, a registration (browser, email or social signup) or a contact record all
count, so you never have to rebuild sender recognition inside your app.

```javascript
const { sender, senderIdentity } = request.body;
// { recognized, email, name, workspaceUserId, workspaceSessionUuid,
//   funnelContactId, emailVerified, knownToWorkspace, matchedOn }
if (senderIdentity.recognized && senderIdentity.emailVerified) { /* known customer */ }
```

A stranger arrives with an explicit `recognized: false` block rather than a blank
one, so "unknown sender" is distinguishable from "not looked up". Identities are
scoped to the receiving workspace — an account with the same address elsewhere is
never borrowed. This reports identity only; whether the sender is *allowed* to do
anything stays your app's decision.
<!-- MANIFEST:END -->

---

## Building an Email Activity UI

To show email activity in a workspace app, use these endpoints:

### Show All Emails for a Customer Session
```javascript
const response = await fetch(`/api/workspaces/${workspaceId}/emails?sessionId=${sessionId}`);
const { messages, pagination } = await response.json();
```

### Show Conversation Thread with a Contact
```javascript
const response = await fetch(`/api/workspaces/${workspaceId}/emails/thread/${customerEmail}`);
const { messages } = await response.json();
```

### Send a Reply from the UI
```javascript
const response = await fetch(`/api/workspaces/${workspaceId}/emails/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: customerEmail,
    subject: `Re: ${originalSubject}`,
    text: replyText,
    sessionId: currentSessionId,
    contactId: contactId,
    inReplyTo: originalMessageId,
  })
});
```

---

## Common Patterns

### Log and Acknowledge
```javascript
const { from, subject, bodyPlain } = request.body;
console.log(`Email from ${from}: ${subject}`);
console.log(`Body: ${bodyPlain}`);
respond(200, { received: true });
```

### Categorize and Route
```javascript
const { from, subject, bodyPlain } = request.body;
const subjectLower = subject.toLowerCase();

let category = 'general';
if (subjectLower.includes('order') || subjectLower.includes('shipping')) {
  category = 'orders';
} else if (subjectLower.includes('refund') || subjectLower.includes('return')) {
  category = 'returns';
} else if (subjectLower.includes('billing') || subjectLower.includes('invoice')) {
  category = 'billing';
}

console.log(`Categorized as: ${category}`);
respond(200, { received: true, category });
```

---

## Use Cases

1. **Customer Support Inbox** — Show inbound/outbound email threads in a workspace app UI
2. **Lead Capture** — Process inquiry emails and add contacts to CRM
3. **Order Updates** — Send shipping/delivery notifications tagged to customer sessions
4. **Appointment Booking** — Process email-based booking requests
5. **Feedback Collection** — Receive and analyze customer feedback emails
6. **Per-Customer History** — Query all emails for a specific session or contact

---

## Security

- Always set a `secret` on your inbound-email hook to prevent unauthorized access
- Mailgun provides the secret in the `x-hook-secret` header when forwarding
- Validate the sender address if needed (check `request.body.sender`)
- Never expose internal workspace data in auto-replies
- Email messages are workspace-isolated — queries always require `workspaceId`


### App access: the `inbound_emails` WorkspaceDB table

Every branded inbound email (token-bearing or not) is also mirrored into the workspace's **WorkspaceDB** so space app code can map tokens to its own users — no platform API needed:

| Column | Meaning |
|--------|---------|
| `token` | The `+token` routing key, or `null` for token-less mail |
| `recipient` | Full raw recipient (`coach+sarah@yourdomain.com`) |
| `recipient_base` | Normalized base address (`coach@yourdomain.com`) |
| `sender_email` / `sender_name` | Who sent it |
| `subject` / `body_text` | Content (stripped plain text) |
| `session_uuid` | The platform chat session the email was tied to |
| `message_id` | Provider Message-Id (use for dedupe in app logic) |
| `received_at` | ISO timestamp |

Rows are server-written (NULL `session_id`), so read with `{ shared: true }`:

```tsx
const { data } = await db.from('inbound_emails')
  .select({ shared: true, orderBy: 'received_at', order: 'desc' });
// e.g. token = your app's user id:
const forUser = data.filter(r => r.token === myUserId);
```

**Pattern:** mint tokens equal to your own user keys (user id, slug, email hash). When mail arrives at `coach+<key>@`, join `inbound_emails.token` to your users table and attach the content (forwarded notes, Zoom summaries) to that user's record. Only branded-recipient mail is mirrored — platform `otto+`/`turbo+` addresses never appear here.

---


---

# meta-ads

Source: integrations/meta-ads/docs.md

# Meta Ads Integration

Read, control, and launch Meta (Facebook/Instagram) ad campaigns through the
platform's privileged Meta connection. A browser app cannot talk to the Meta
Marketing API directly — these endpoints proxy the workspace's connected ad
account, so the app gets insights, delivery status, object control, and paid
campaign launch without ever holding Meta credentials.

## Category
Marketing / Advertising

## Required API Keys
None — the workspace's Meta connection is used server-side. The app only needs
the workspace DB token that the WorkspaceDB SDK already injects (see
Authentication below).

## Concepts

- **Ad object hierarchy** — Meta organizes paid ads as Campaign → Ad Set → Ad.
  IDs returned by these endpoints (`metaCampaignId`, `metaAdSetId`, `metaAdIds`)
  are the real Meta object IDs.
- **Insights** — Performance metrics (spend, impressions, clicks, etc.) for any
  object level over a date range.
- **Object status** — Pause, activate, or archive a campaign/ad set/ad.
- **Launch** — Create and publish a brand-new paid campaign. This charges the
  workspace wallet up front; if the wallet is underfunded the call returns `402`
  and nothing is charged.
- **App owns its own records** — these endpoints do NOT persist campaigns or
  insights for you. Store whatever bookkeeping you need (campaign IDs, names,
  budgets) in your own WorkspaceDB tables.

## Authentication

Every request is workspace-scoped and authenticated. Reference
`window.__workspaceDb` anywhere in your app so the SDK (and its token) is
injected, then attach the token on each call:

```ts
const ws = (window as any).__workspaceDb;        // { workspaceId, token }
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const headers = { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token };
```

---

## Quick Start

```tsx
// Connect a Meta account in-app, then read campaign insights.
const ws = (window as any).__workspaceDb;
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const auth = { 'X-Workspace-DB-Token': ws.token };

// 1. Is an account already connected?
const { connected } = await fetch(`${base}/connect/status`, { headers: auth }).then((r) => r.json());

// 2. If not, start the OAuth flow and open the returned URL, then poll status.
if (!connected) {
  const { authUrl } = await fetch(`${base}/connect/init`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopes: ['ads'] }),
  }).then((r) => r.json());
  window.open(authUrl, '_blank');
}

// 3. Once connected, read performance.
const insights = await fetch(`${base}/ads/insights?level=campaign&objectId=CAMPAIGN_ID`, {
  headers: auth,
}).then((r) => r.json());
```

---

## API Endpoints

### Read Insights
```
GET /api/workspaces/:workspaceId/marketing/ads/insights?level=campaign&objectId={metaId}&datePreset=last_30d
```
- `level` — `campaign` | `adset` | `ad`
- `objectId` — the Meta object ID to report on
- `datePreset` — optional, e.g. `today`, `last_7d`, `last_30d`, `maximum`

**Response:** `{ success: true, insights: {...} }`

### Live Delivery Status (batch)
```
POST /api/workspaces/:workspaceId/marketing/ads/live-status
```
**Request:**
```json
{ "campaigns": [{ "metaCampaignId": "123", "metaAdSetId": "456", "metaAdIds": ["789"] }] }
```
**Response:** `{ success: true, statuses: [...] }`

### Pause / Activate / Archive an Object
```
POST /api/workspaces/:workspaceId/marketing/ads/object-status
```
**Request:**
```json
{ "level": "campaign", "objectId": "123", "status": "PAUSED" }
```
- `status` — `ACTIVE` | `PAUSED` | `ARCHIVED`

**Response:** `{ success: true, result: {...} }`

### List Ad Sets in a Campaign
```
GET /api/workspaces/:workspaceId/marketing/ads/campaigns/{metaCampaignId}/adsets
```
**Response:** `{ success: true, adsets: [...] }`

### List Ads in an Ad Set
```
GET /api/workspaces/:workspaceId/marketing/ads/adsets/{metaAdSetId}/ads
```
**Response:** `{ success: true, ads: [...] }`

### Launch a Paid Campaign
```
POST /api/workspaces/:workspaceId/marketing/ads/launch
```
Charges the workspace wallet. Returns `402` (no charge) if the wallet cannot
cover the budget.

**Request:**
```json
{
  "campaignName": "Summer Launch",
  "websiteUrl": "https://example.com",
  "budget": 50,
  "duration": 7,
  "budgetType": "lifetime",
  "objective": "OUTCOME_TRAFFIC",
  "creatives": [
    {
      "headline": "Try it free",
      "adCopyText": "The fastest way to do X.",
      "storyImageUrl": "https://.../story.jpg",
      "feedImageUrl": "https://.../feed.jpg",
      "videoUrl": "https://.../clip.mp4",
      "callToAction": "LEARN_MORE"
    }
  ]
}
```
- `budget` — in dollars
- `duration` — in days
- `budgetType` — optional, `lifetime` (default) or `daily`
- `objective`, `geoTargeting` — optional

**Response:**
```json
{
  "success": true,
  "metaCampaignId": "123",
  "metaAdSetId": "456",
  "metaAdIds": ["789"],
  "pixelId": "111",
  "attemptId": "uuid"
}
```

---

## Connecting a Meta Account (in-app)

The app can drive the Meta (Facebook/Instagram) OAuth flow itself — show a
"Connect your Meta account" button instead of sending the owner to the main
Audos UI. AppSmith holds the Meta tokens; the app only ever sees the connection
status. The flow is: call `connect/init`, open the returned `authUrl` (popup or
redirect), then poll `connect/status` until `connected` is true.

This is the **shared connect shape** (`connectInit` → open `authUrl` → poll
`connectStatus` → `disconnect`) used identically by the standalone **Connect
Meta** integration and by **Social Publishing** — learn it once and it applies
everywhere. If you only need to establish/read the Meta connection (no
ads/launch surface), install **Connect Meta** instead.

### Start the OAuth flow
```
POST /api/workspaces/:workspaceId/marketing/connect/init
```
**Request (all optional):**
```json
{ "scopes": ["content_publishing", "ads"], "parentWorkspaceId": "your-own-ref-id" }
```
- `scopes` — subset of `messaging` | `content_publishing` | `ads` (defaults to all three)
- `parentWorkspaceId` — your app's own reference ID (e.g. an end-user/business
  id). It is forwarded to the gateway and echoed back on the connection callback,
  so a multi-user app can attribute the connection to one of its own records.

**Response:** `{ success: true, authUrl: "https://www.facebook.com/..." }`

### Read connection status
```
GET /api/workspaces/:workspaceId/marketing/connect/status
```
**Response:**
```json
{
  "success": true,
  "connected": true,
  "status": "connected",
  "page": { "id": "123", "name": "My Page" },
  "instagram": { "id": "456", "username": "myhandle" },
  "adAccountIds": ["act_789"]
}
```
When nothing is connected: `{ success: true, connected: false, status: "not_connected" }`.

### Disconnect
```
POST /api/workspaces/:workspaceId/marketing/connect/disconnect
```
**Response:** `{ success: true }`

---

## Installation

```javascript
// Reference window.__workspaceDb so the SDK + token are injected.
export const metaAds = {
  _ctx() {
    const ws = window.__workspaceDb;
    return {
      base: `/api/workspaces/${ws.workspaceId}/marketing`,
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token }
    };
  },

  async getInsights(level, objectId, datePreset = 'last_30d') {
    const { base, headers } = this._ctx();
    const qs = new URLSearchParams({ level, objectId, datePreset });
    const res = await fetch(`${base}/ads/insights?${qs}`, { headers });
    return res.json();
  },

  async liveStatus(campaigns) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/ads/live-status`, {
      method: 'POST', headers, body: JSON.stringify({ campaigns })
    });
    return res.json();
  },

  async setStatus(level, objectId, status) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/ads/object-status`, {
      method: 'POST', headers, body: JSON.stringify({ level, objectId, status })
    });
    return res.json();
  },

  async listAdSets(metaCampaignId) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/ads/campaigns/${metaCampaignId}/adsets`, { headers });
    return res.json();
  },

  async listAds(metaAdSetId) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/ads/adsets/${metaAdSetId}/ads`, { headers });
    return res.json();
  },

  async launch(campaign) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/ads/launch`, {
      method: 'POST', headers, body: JSON.stringify(campaign)
    });
    if (res.status === 402) throw new Error('Wallet underfunded — top up to launch');
    return res.json();
  },

  // --- Connect a Meta account from inside the app ---
  async connectInit(opts = {}) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/connect/init`, {
      method: 'POST', headers, body: JSON.stringify(opts)
    });
    return res.json();   // { success, authUrl }
  },

  async connectStatus() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/status`, { headers })).json();
  },

  async disconnect() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/disconnect`, { method: 'POST', headers })).json();
  }
};
```

### Connect button example

```tsx
async function connectMeta() {
  const { authUrl } = await metaAds.connectInit({ scopes: ['content_publishing', 'ads'] });
  const popup = window.open(authUrl, 'meta-connect', 'width=600,height=800');
  // Poll for completion while the user authorizes in the popup.
  const timer = setInterval(async () => {
    const s = await metaAds.connectStatus();
    if (s.connected) {
      clearInterval(timer);
      popup?.close();
      // refresh your UI — s.page / s.instagram / s.adAccountIds are now populated
    }
  }, 2000);
}
```

## Use Cases
- A campaign dashboard that reports spend/clicks per campaign
- Pause/resume controls for live ads
- A "boost" button that launches a paid campaign from app content
- Reconciling live Meta delivery status against the app's own records

## Notes
- Launch charges the workspace wallet; surface the `402` underfunded case to users.
- Persist returned Meta IDs in your own WorkspaceDB tables — these endpoints are stateless.


---

# seo-social-previews

Source: integrations/seo-social-previews/docs.md

# SEO & Social Previews (Meta Tags)

Published space apps emit **no** `description`, `og:*`, or `twitter:*` meta tags by default. To get a search snippet and link previews (iMessage, WhatsApp, Slack, Facebook, X/Twitter), add the tags yourself through the workspace `custom_head_html` setting — this doc explains exactly what the platform emits on each surface and how to add what's missing.

## Category
Hosting & SEO

## Required API Keys
None. This is workspace configuration, not an external service.

## What each surface emits by default

| Surface | `<title>` | `description` | `og:*` | `twitter:*` |
|---|---|---|---|---|
| Published space app (the default) | space name | none | none | none |
| Space whose public entry is the platform's static landing shell | from the landing-shell SEO document | yes | `og:type/title/description` (+`og:image` when set, +`og:url`/canonical at serve time) | `twitter:card/title/description` (+`twitter:image` when set) |
| Workspace landing page / microsite on a custom domain | brand name | only when the brand profile has a tagline | `og:title` + `og:type` always; `og:description`/`og:image`/`og:url` only when brand tagline/logo/domain exist | none |

Details worth knowing:

- The default compiled space document contains only charset, viewport, theme-color, color-scheme, favicon, and `<title>{space name}</title>`. **No `description`, no `og:*`, no `twitter:*`.** A bare space URL pasted into a chat app renders with no description and no preview image. (Head generation lives in `server/services/unified-space-compiler.ts`; the landing-page equivalent is `server/services/hosting.ts`.)
- The static-landing-shell exception only holds while the landing-shell document still matches the space's `components/EmailGate.tsx` byte-for-byte (a content hash is checked at compile time). **Customizing `EmailGate.tsx` breaks the match**, and the space silently falls back to the bare default head — losing every SEO/social tag it had.
- React-rendered `<meta>` / `<title>` tags in app code do **not** work for link previews or SEO. Social scrapers and most crawlers read the initial HTML document and do not run JavaScript. Head tags must be present in the served document itself.

## Adding meta tags with `custom_head_html`

`custom_head_html` is a workspace setting (key `custom_head_html`). Whatever HTML it contains is injected verbatim into the `<head>` of:

- **every published space app** — baked in at compile/publish time, so the space must be re-published after the setting changes;
- **the workspace landing page and microsites** — injected at serve time (landing pages are cached for a few minutes, so changes appear shortly after).

It is a single value for the whole workspace, injected on every surface. Use it for site-wide tags; per-page meta tags are not possible through it.

### Read / write the setting

```
GET /api/workspace-settings/:workspaceId/custom_head_html
PUT /api/workspace-settings/:workspaceId/custom_head_html
```

Founders can also just ask their workspace agent (Otto) to set it — the agent reaches these endpoints through the internal API.

### Quick Start

```ts
// Read the current value first — ALWAYS merge, never blind-overwrite (see gotchas).
const current = await fetch(
  `/api/workspace-settings/${workspaceId}/custom_head_html?default=`,
).then((r) => r.json());

const tags = `
<meta name="description" content="Handmade dog collars, shipped in 48 hours." />
<meta property="og:title" content="Collar & Co" />
<meta property="og:description" content="Handmade dog collars, shipped in 48 hours." />
<meta property="og:image" content="https://cdn.example.com/og-preview.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
`.trim();

await fetch(`/api/workspace-settings/${workspaceId}/custom_head_html`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ value: [current.value, tags].filter(Boolean).join('\n') }),
});
// Then re-publish the space so the compiled bundle picks up the new head.
```

## Gotchas

- **Merge, don't overwrite.** The platform itself appends to `custom_head_html`: when a landing-page edit contains `<script>` tags meant for the `<head>` (analytics snippets etc.), they are extracted and merged into this setting automatically. Blind overwrites destroy those snippets. Read the current value, then append.
- **Re-publish required for spaces.** The setting is read at compile time for space apps. Changing it does nothing to an already-published bundle until the space is published again.
- **Don't double-tag the landing shell.** If the space's public entry is the platform's static landing shell (second table row), it already emits `og:*` and `twitter:*` tags. Adding the same properties via `custom_head_html` produces duplicate/conflicting tags — most scrapers take the first occurrence they see.
- **The value is injected verbatim.** No validation or escaping is applied. Malformed HTML here lands in the `<head>` of every published surface.
- The platform does **not** currently generate `description`/`og:*`/`twitter:*` tags automatically for space apps. `custom_head_html` is the supported way to add them.


---

# slack

Source: integrations/slack/docs.md

# Slack Integration

Post messages, manage channels, and track VA tasks through Slack.

## Category
Communication & Collaboration

## Required API Keys
- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-...)
- `SLACK_SIGNING_SECRET` - For webhook verification (optional)

## API Endpoints

### List Channels
```
GET /api/slack/channels?workspaceId=...
```

**Response:**
```json
{
  "channels": [
    {
      "id": "C01234567",
      "name": "general",
      "is_private": false,
      "member_count": 25,
      "topic": "Company announcements"
    }
  ]
}
```

### Post Message
```
POST /api/slack/messages
```

**Request:**
```json
{
  "workspaceId": "uuid",
  "channel": "C01234567",
  "text": "Hello from Otto!",
  "blocks": [],
  "attachments": []
}
```

**Response:**
```json
{
  "success": true,
  "ts": "1234567890.123456",
  "channel": "C01234567"
}
```

### Create VA Task
```
POST /api/slack/tasks
```

**Request:**
```json
{
  "workspaceId": "uuid",
  "channel": "C01234567",
  "title": "Research top 10 influencers in fitness niche",
  "description": "Find Instagram influencers with 10k-100k followers",
  "priority": "high",
  "dueDate": "2025-02-10"
}
```

**Response:**
```json
{
  "success": true,
  "taskId": "task_abc123",
  "messageTs": "1234567890.123456"
}
```

### List Tasks
```
GET /api/slack/tasks?workspaceId=...&status=pending
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "task_abc123",
      "title": "Research influencers",
      "status": "pending",
      "assignee": null,
      "channel": "C01234567",
      "createdAt": "2025-02-05T10:00:00Z"
    }
  ]
}
```

### Update Task Status
```
PATCH /api/slack/tasks/:taskId
```

**Request:**
```json
{
  "workspaceId": "uuid",
  "status": "in_progress",
  "assignee": "U01234567"
}
```

## Installation

```javascript
export const slackIntegration = {
  async listChannels() {
    const response = await fetch('/api/slack/channels?' + new URLSearchParams({
      workspaceId: window.__WORKSPACE_ID__
    }));
    const data = await response.json();
    return data.channels;
  },

  async postMessage(channel, text, options = {}) {
    const response = await fetch('/api/slack/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: window.__WORKSPACE_ID__,
        channel,
        text,
        ...options
      })
    });
    return response.json();
  },

  async createTask(channel, title, description, options = {}) {
    const response = await fetch('/api/slack/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: window.__WORKSPACE_ID__,
        channel,
        title,
        description,
        ...options
      })
    });
    return response.json();
  },

  async listTasks(status) {
    const params = new URLSearchParams({
      workspaceId: window.__WORKSPACE_ID__
    });
    if (status) params.set('status', status);
    
    const response = await fetch('/api/slack/tasks?' + params);
    return response.json();
  },

  async updateTask(taskId, updates) {
    const response = await fetch(`/api/slack/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: window.__WORKSPACE_ID__,
        ...updates
      })
    });
    return response.json();
  }
};
```

## Use Cases
- Post automated updates to Slack channels
- Create tasks for virtual assistants
- Track task completion and progress
- Send notifications on key business events
- Coordinate team work through Slack

## Documentation
- [Slack API Docs](https://api.slack.com/docs)
- [Slack Block Kit](https://api.slack.com/block-kit)


---

# social-publishing

Source: integrations/social-publishing/docs.md

# Social Publishing Integration

Connect and publish to the workspace's social accounts — LinkedIn organization
pages, Instagram (feed / reel / story) and the connected Facebook Page (text
with one optional image or video) — through the platform's privileged
connection. An app installed with **only** this integration can run the in-app
connect flow for both networks *and* post; it does not need the Meta Ads
integration. A browser app cannot talk to these networks directly; these
endpoints proxy the workspace's connected accounts so the app never holds social
credentials.

## Category
Marketing / Social Media

## Required API Keys
None — the workspace's LinkedIn/Meta connection is used server-side. The
app only needs the workspace DB token that the WorkspaceDB SDK already injects
(see Authentication below).

## Concepts

- **Connect, then act** — Both networks follow the same shared connect shape:
  call `init`, open the returned `authUrl` (popup or redirect), poll `status`
  until connected, then `disconnect` to clear. This is the identical shape used
  by the **Connect Meta** and **Meta Ads** integrations, so you learn it once.
- **LinkedIn org picker** — After LinkedIn connects you list the user's
  organization pages and select one as the posting author; posts publish as that
  org page.
- **Instagram and Facebook connect** — Instagram and the Facebook Page connect
  through the shared Meta connect flow with the `content_publishing` scope.
  `GET /connect/status` reports the connected Page.
- **LinkedIn post** — Publishes to the connected LinkedIn organization page,
  with optional single image.
- **Instagram video** — Publishes a video to the connected Instagram account as
  a feed post, a reel, or a story.
- **Facebook Page post** — Publishes an organic post (text, text + one image, or
  text + one video) to the Facebook Page shown by `GET /connect/status`. The app
  cannot choose a different Page.
- **App owns its own records** — these endpoints do NOT persist posts for you,
  and they do NOT schedule anything. Store post history in your own WorkspaceDB
  tables, and use the Task Scheduler integration if you need recurring posts.

## Authentication

Every request is workspace-scoped and authenticated. Reference
`window.__workspaceDb` anywhere in your app so the SDK (and its token) is
injected, then attach the token on each call:

```ts
const ws = (window as any).__workspaceDb;        // { workspaceId, token }
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const headers = { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token };
```

---

## Quick Start

```tsx
// Publish a text post to the workspace's connected LinkedIn page.
const ws = (window as any).__workspaceDb;
const base = `/api/workspaces/${ws.workspaceId}/marketing`;
const headers = { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token };

const result = await fetch(`${base}/posts/linkedin`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ content: 'Hello from our app!' }),
}).then((r) => r.json());

// Publish to the connected Facebook Page (check connect/status first).
const status = await fetch(`${base}/connect/status`, { headers }).then((r) => r.json());
if (status.connected && status.page) {
  const fb = await fetch(`${base}/posts/facebook`, {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ message: 'Hello from our app!' }),
  }).then((r) => r.json());
  // fb: { success: true, postId, page: { id, name } }
  //  or { success: false, error: { code, message, details? } }
}
```

---

## API Endpoints

### Publish to LinkedIn
```
POST /api/workspaces/:workspaceId/marketing/posts/linkedin
```
**Request:**
```json
{
  "content": "We just shipped a big update.",
  "photoUrl": "https://.../image.jpg",
  "photoTitle": "Release banner"
}
```
- `content` — required post text
- `photoUrl`, `photoTitle` — optional single image

**Response:** `{ success: true, postId: "...", organization: "..." }`

### Publish a Video to Instagram
```
POST /api/workspaces/:workspaceId/marketing/posts/video
```
**Request:**
```json
{
  "destination": "instagram_reel",
  "videoUrl": "https://.../clip.mp4",
  "caption": "Behind the scenes 🎬"
}
```
- `destination` — `instagram_feed` | `instagram_reel` | `instagram_story`
- `videoUrl` — an https URL or a base64 data URL
- `caption` — optional

**Response:** `{ success: true, destination: "instagram_reel", mediaId: "..." }`

### Publish to the Facebook Page
```
POST /api/workspaces/:workspaceId/marketing/posts/facebook
```
Publishes an organic post to the Facebook Page that `GET /connect/status`
reports for this workspace. Text only, text + one image, or text + one video.

**Headers:** `X-Workspace-DB-Token` (required), `Idempotency-Key` (optional,
recommended).

**Request:**
```json
{
  "message": "Our spring menu is live! 🌷",
  "imageUrl": "https://cdn.example.com/spring-menu.jpg"
}
```
- `message` — required post text, up to 10,000 characters. `content` and
  `caption` are accepted as aliases.
- `imageUrl` — optional public `https://` URL of one image.
- `videoUrl` — optional public `https://` URL of one video.
- Send at most one of `imageUrl` / `videoUrl`.
- `idempotencyKey` — optional; same as the `Idempotency-Key` header.
- `pageId` and `parentWorkspaceId` are rejected: posts always go to the
  workspace's own connected Page.

**Success (200):**
```json
{ "success": true, "postId": "114066751735815_123456789", "page": { "id": "114066751735815", "name": "Julia 105" } }
```

**Failure:** always `{ "success": false, "error": { "code", "message", "details"? } }`.

| HTTP | `error.code` | Meaning / what the app should do |
|------|--------------|----------------------------------|
| 401 | `NOT_AUTHENTICATED` | No credentials. Send `X-Workspace-DB-Token`. |
| 404 | `WORKSPACE_NOT_FOUND` | Unknown workspace, or the token belongs to another workspace. |
| 400 | `INVALID_REQUEST` | Missing/too-long text, both media fields sent, non-`https` URL, bad key, or `pageId` sent. `details.field` names the field. |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | The key was already used for a different post. Use a new key. |
| 409 | `META_NOT_CONNECTED` | No Meta connection, or `connect/status` says `connected: false`. Run the connect flow. |
| 409 | `FACEBOOK_PAGE_MISSING` | Connected, but no Facebook Page was chosen. Reconnect and pick a Page. |
| 403 | `PERMISSION_MISSING` | Meta refused: missing Page posting permission or expired token. Reconnect. `details.requiredPermissions` lists what is needed. |
| 422 | `INVALID_MEDIA` | Facebook could not fetch or use the image/video. |
| 429 | `RATE_LIMITED` | Too many posts. Wait `details.retryAfterSeconds` (also the `Retry-After` header). |
| 502/503 | `PUBLISH_FAILED` | A definite refusal: the request was rejected before anything was created (e.g. Facebook rejected the post with a 4xx, or publishing is not configured). Fix the cause, then retry. |
| 502/504 | `PUBLISH_UNCONFIRMED` | The publish timed out, the publishing service failed with a server error, or the answer was ambiguous. **The post may exist.** Do not retry blindly: check the Page, or retry with the same `Idempotency-Key` (it replays this result instead of posting again). |

#### Media rules and limits
- URLs must be public `https://` links that Facebook can download directly (no
  login, no redirects to an HTML page, no base64 data URLs). Upload the file
  first with File Storage if you only have bytes.
- One image (JPG, PNG, GIF, WebP) or one video (MP4 or MOV recommended) per post.
  Facebook's own size and length limits apply.
- Video posts are allowed up to about 2 minutes server-side to publish; text and
  image posts about 30 seconds. Longer waits return `PUBLISH_UNCONFIRMED`.
- Not supported here: multi-photo posts, link-preview posts, scheduled posts.

#### Meta permissions
The workspace must have connected Meta with the `content_publishing` scope and
picked a Facebook Page it manages. Posting needs the Page permissions
`pages_manage_posts`, `pages_read_engagement` and `pages_show_list`. If the
person who connected loses their Page role, or the token expires, the endpoint
returns `PERMISSION_MISSING`; run the connect flow again.

#### Token handling
The Meta token and the platform's gateway key stay on the server. The app only
sends its workspace DB token. Responses never contain Meta or gateway
credentials.

#### Rate limit and idempotency
- Up to **10 Facebook posts per workspace per 10 minutes**. Requests that are
  refused before publishing (validation, not connected) do not count.
- Send an `Idempotency-Key` (any 1–200 printable characters, e.g. a UUID you
  store with your draft) to make retries safe. Within 10 minutes, repeating the
  same key with the same post returns the original result (with header
  `Idempotent-Replayed: true`) instead of posting again; a concurrent duplicate
  waits for the first request. A definite failure is not remembered, so a
  corrected retry with the same key can proceed.
- Both limits are kept in server memory per host, so treat them as a safety net,
  not as a guarantee across hosts. Still store each `postId` in your own table.

---

## Connecting Accounts (in-app)

Both connect flows follow the shared shape: start the OAuth flow, open the
returned `authUrl`, poll status until connected, then disconnect when needed.

### LinkedIn

```
POST /api/workspaces/:workspaceId/marketing/connect/linkedin/init
```
**Response:** `{ success: true, authUrl: "https://www.linkedin.com/..." }` — open it
(popup or redirect); the OAuth callback completes the connection.

```
GET /api/workspaces/:workspaceId/marketing/connect/linkedin/status
```
**Response:** `{ success: true, connected: true, organization: { id, urn, name } | null }`

```
GET /api/workspaces/:workspaceId/marketing/connect/linkedin/organizations
```
**Response:** `{ success: true, organizations: [...] }` — the org pages the user
can post as.

```
POST /api/workspaces/:workspaceId/marketing/connect/linkedin/select-organization
```
**Request:** `{ "organizationalTarget": "urn:li:organization:123", "organizationId": "123", "name": "My Co" }`
Selects the org page that LinkedIn posts publish as. `organizationalTarget` is
required (the others are optional bookkeeping).

```
POST /api/workspaces/:workspaceId/marketing/connect/linkedin/disconnect
```
**Response:** `{ success: true }`

### Instagram and Facebook Page (Meta)

Instagram and the Facebook Page connect through the shared Meta connect flow
with the `content_publishing` scope:

```
POST /api/workspaces/:workspaceId/marketing/connect/init   { "scopes": ["content_publishing"] }
GET  /api/workspaces/:workspaceId/marketing/connect/status
POST /api/workspaces/:workspaceId/marketing/connect/disconnect
```
Status returns `{ success, connected, page, instagram, adAccountIds }`. `page`
(`{ id, name }`) is the Facebook Page that `posts/facebook` publishes to. (For
the full Meta connect surface, see the **Connect Meta** integration.)

---

## Installation

```javascript
// Reference window.__workspaceDb so the SDK + token are injected.
export const socialPublishing = {
  _ctx() {
    const ws = window.__workspaceDb;
    return {
      base: `/api/workspaces/${ws.workspaceId}/marketing`,
      headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': ws.token }
    };
  },

  // --- Posting (already-connected accounts) ---
  async postToLinkedIn(content, photoUrl, photoTitle) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/posts/linkedin`, {
      method: 'POST', headers, body: JSON.stringify({ content, photoUrl, photoTitle })
    });
    return res.json();
  },

  async postVideo(destination, videoUrl, caption) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/posts/video`, {
      method: 'POST', headers, body: JSON.stringify({ destination, videoUrl, caption })
    });
    return res.json();
  },

  // post: { message, imageUrl?, videoUrl? }; reuse idempotencyKey on retries.
  async postToFacebookPage(post, idempotencyKey) {
    const { base, headers } = this._ctx();
    const res = await fetch(`${base}/posts/facebook`, {
      method: 'POST',
      headers: idempotencyKey ? { ...headers, 'Idempotency-Key': idempotencyKey } : headers,
      body: JSON.stringify(post)
    });
    return res.json(); // { success, postId, page } | { success: false, error: { code, message } }
  },

  // --- Connect LinkedIn from inside the app ---
  async connectLinkedInInit() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/linkedin/init`, { method: 'POST', headers })).json(); // { success, authUrl }
  },
  async linkedInStatus() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/linkedin/status`, { headers })).json();
  },
  async linkedInOrganizations() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/linkedin/organizations`, { headers })).json();
  },
  async selectLinkedInOrganization(org) {
    const { base, headers } = this._ctx();
    // org: { organizationalTarget, organizationId?, name? }
    return (await fetch(`${base}/connect/linkedin/select-organization`, { method: 'POST', headers, body: JSON.stringify(org) })).json();
  },
  async disconnectLinkedIn() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/linkedin/disconnect`, { method: 'POST', headers })).json();
  },

  // --- Connect Instagram (Meta) from inside the app ---
  async connectInstagramInit() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/init`, { method: 'POST', headers, body: JSON.stringify({ scopes: ['content_publishing'] }) })).json(); // { success, authUrl }
  },
  async instagramStatus() { // also reports the connected Facebook Page
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/status`, { headers })).json();
  },
  async disconnectInstagram() {
    const { base, headers } = this._ctx();
    return (await fetch(`${base}/connect/disconnect`, { method: 'POST', headers })).json();
  }
};
```

### Connect button example (LinkedIn, with org picker)

```tsx
async function connectLinkedIn() {
  const { authUrl } = await socialPublishing.connectLinkedInInit();
  const popup = window.open(authUrl, 'li-connect', 'width=600,height=800');
  const timer = setInterval(async () => {
    const s = await socialPublishing.linkedInStatus();
    if (s.connected) {
      clearInterval(timer);
      popup?.close();
      // List org pages and let the user pick one as the posting author.
      const { organizations } = await socialPublishing.linkedInOrganizations();
      const chosen = organizations[0];
      await socialPublishing.selectLinkedInOrganization({
        organizationalTarget: chosen.organizationalTarget || chosen.urn,
        organizationId: chosen.id,
        name: chosen.name,
      });
      // now socialPublishing.postToLinkedIn(...) will publish as that page
    }
  }, 2000);
}
```

## Use Cases
- A "Connect LinkedIn / Instagram / Facebook" onboarding step inside the app
- A "share to LinkedIn" button on app-generated content
- Publishing a generated video as an Instagram reel or story
- Posting app-generated Facebook posts (with an image or video) to the
  business's own Facebook Page
- A simple cross-posting composer backed by the app's own WorkspaceDB history

## Notes
- These endpoints are stateless — persist post IDs/history in your own WorkspaceDB tables.
- On `PUBLISH_UNCONFIRMED`, mark the draft as "check Page" rather than retrying with a new key.
- For recurring/scheduled posts, combine with the Task Scheduler integration.


---

## Payments/commerce/web

# alibaba-suppliers

Source: integrations/alibaba-suppliers/docs.md

# Alibaba Suppliers Integration

Find products and suppliers on Alibaba for any product idea. Search returns the product listing title, price range, a thumbnail image, and a link out to the Alibaba product page — everything an app needs to surface real sourcing options for a product idea.

> **What the official Sourcing search returns:** the Alibaba.com Open Platform Sourcing search is a **product-offer** search — each result is a product listing, not a company record. Product-level fields (`name`/`productTitle`, `priceRange`, `productUrl`, `thumbnailUrl`, `id`) are populated; company-level fields (`location`, `moq`, `leadTimeDays`, `verified`, `rating`, `yearsActive`) are **not provided by this endpoint and come back `null`**. Render them defensively. The `filters` below that depend on those fields (`verifiedOnly`, `minMoq`, `maxMoq`, `country`) will therefore drop most/all results — they are kept for forward-compatibility with a future supplier-detail endpoint.

## Category
E-commerce / Sourcing

## How It Works

This integration proxies a product/supplier search against Alibaba and normalizes the results into a consistent shape. Your app sends a product query (use **simple manufacturing terms** for best results — e.g. `"stainless steel water bottle"`, not `"my premium eco hydration solution"`) and gets back a list of suppliers you can render, shortlist, or save into your own workspace data.

Provider credentials live server-side — your app never handles an Alibaba API key.

## API Endpoint

```
POST /api/suppliers/search
```

**Request Body:**
| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | ✅ | — | Product to source. Use simple manufacturing terms. |
| `pageSize` | number | — | `20` | Results per page (1–50). |
| `page` | number | — | `1` | Page number for pagination. |
| `filters` | object | — | — | Optional result filters (see below). |
| `filters.verifiedOnly` | boolean | — | — | Only return verified suppliers. |
| `filters.minMoq` | number | — | — | Drop suppliers whose MOQ is below this. |
| `filters.maxMoq` | number | — | — | Drop suppliers whose MOQ is above this. |
| `filters.country` | string | — | — | Match suppliers whose location contains this string. |
| `workspaceId` | string | — | — | Workspace to bill the search to. Also resolved from the `x-app-id` header. |

**Response:**
```json
{
  "suppliers": [
    {
      "id": "1601234567890",
      "name": "Shenzhen Acme Manufacturing Co., Ltd.",
      "location": "Guangdong, China",
      "verified": true,
      "priceRange": "$2.50 - $4.80",
      "moq": 500,
      "leadTimeDays": 25,
      "productUrl": "https://www.alibaba.com/product-detail/...",
      "thumbnailUrl": "https://s.alicdn.com/...jpg",
      "productTitle": "Custom Stainless Steel Water Bottle 500ml",
      "rating": 4.7,
      "yearsActive": 8
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalResults": 240,
    "totalPages": 12
  }
}
```

| Field | Description |
|---|---|
| `suppliers[].id` | Stable identifier for the supplier/product result |
| `suppliers[].name` | Supplier / company name |
| `suppliers[].location` | Supplier location (province, country) — may be `null` |
| `suppliers[].verified` | Whether the supplier is verified / gold / trade-assured |
| `suppliers[].priceRange` | Human-readable price range (e.g. `"$2.50 - $4.80"`) — may be `null` |
| `suppliers[].moq` | Minimum order quantity — may be `null` |
| `suppliers[].leadTimeDays` | Estimated production/lead time in days — may be `null` |
| `suppliers[].productUrl` | Link out to the Alibaba product/supplier page |
| `suppliers[].thumbnailUrl` | Product thumbnail image |
| `suppliers[].productTitle` | The matched product listing title |
| `suppliers[].rating` | Supplier rating (0–5) when available |
| `suppliers[].yearsActive` | Years the supplier has been on Alibaba |
| `pagination.totalResults` | Estimated total matches (may be `null`) |

## Pricing

Each supplier search costs **$0.01**, billed to the workspace wallet when a `workspaceId` (or `x-app-id` header) is supplied. Charges use the platform spending gate: if the provider call fails after the charge, the charge is **automatically refunded**. Searches without a workspace are not billed.

## Quick Start

```typescript
const response = await fetch('/api/suppliers/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'stainless steel water bottle',
    pageSize: 20,
    filters: { verifiedOnly: true, maxMoq: 1000 },
    workspaceId, // bills this workspace's wallet
  }),
});

const { suppliers, pagination } = await response.json();
suppliers.forEach((s) => {
  console.log(`${s.name} — ${s.priceRange} — MOQ ${s.moq} — ${s.productUrl}`);
});
```

## Helper Function

```typescript
interface Supplier {
  id: string;
  name: string;
  location: string | null;
  verified: boolean;
  priceRange: string | null;
  moq: number | null;
  leadTimeDays: number | null;
  productUrl: string | null;
  thumbnailUrl: string | null;
  productTitle: string | null;
  rating: number | null;
  yearsActive: number | null;
}

export const alibabaSuppliers = {
  async search(
    query: string,
    options: {
      pageSize?: number;
      page?: number;
      filters?: {
        verifiedOnly?: boolean;
        minMoq?: number;
        maxMoq?: number;
        country?: string;
      };
      workspaceId?: string;
    } = {},
  ): Promise<{ suppliers: Supplier[]; pagination: any }> {
    const response = await fetch('/api/suppliers/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options }),
    });
    const data = await response.json();
    if (!response.ok) {
      // 402 carries the canonical insufficient_funds shape
      throw new Error(data.message || data.error || 'Supplier search failed');
    }
    return data;
  },
};
```

## Error Handling

| Status | Meaning |
|---|---|
| `400` | Invalid request body (missing `query`, bad types). Body includes `details`. |
| `402` | Insufficient wallet balance. Body is the canonical `insufficient_funds` shape. |
| `429` | Rate limit exceeded (30 searches/min per workspace or IP). |
| `502` | Upstream Alibaba provider returned an error (the wallet charge was auto-refunded). |
| `503` | Alibaba credentials are not configured (`ALIBABA_APP_KEY` / `ALIBABA_APP_SECRET`). |

**Insufficient funds (402):**
```json
{
  "code": "insufficient_funds",
  "required": 0.01,
  "available": 0.00,
  "shortfall": 0.01,
  "headroomMultiplier": 1.0,
  "message": "Insufficient wallet balance for Alibaba supplier search. Required: $0.01. Available: $0.00. Add $0.01 to continue."
}
```

**Validation error (400):**
```json
{
  "error": "Invalid search criteria",
  "details": [
    { "code": "too_small", "path": ["query"], "message": "query is required" }
  ]
}
```

## Use Cases

- **Product sourcing** — find manufacturers for a product idea and compare MOQs/pricing.
- **Cost research** — surface price ranges before committing to a product line.
- **Supplier shortlisting** — let users save promising suppliers into workspace data for follow-up.
- **Product Lab flows** — pair with image/3D tooling to go from concept → sourcing.

## Operator Configuration

This integration calls the official **Alibaba.com Open Platform** Sourcing
Solution API (`https://openapi-api.alibaba.com/rest{api_path}`) with
HMAC-SHA256 request signing. Configure server-side:

| Variable | Type | Required | Description |
|---|---|---|---|
| `ALIBABA_APP_KEY` | secret | ✅ | Open Platform App Key |
| `ALIBABA_APP_SECRET` | secret | ✅ | Open Platform App Secret (signs requests) |
| `ALIBABA_ACCESS_TOKEN` | secret | ✅ | OAuth access token. The Sourcing search is a buyer/business API and **requires** a valid access token (obtained via the Open Platform OAuth `code → /auth/token/create` flow). |
| `ALIBABA_SEARCH_API_PATH` | env | — | API path for the Sourcing product search. Default `/eco/buyer/product/search` (the confirmed live Sourcing search API). |
| `ALIBABA_REQUIRE_TOKEN` | env | — | `true` when the search API requires `access_token` (forces `ALIBABA_ACCESS_TOKEN`). Default for the Sourcing search is `true`. |

> **Auth & request note:** The Sourcing search API
> (`/eco/buyer/product/search`) rejects requests without a valid
> `access_token` (`MissingParameter` / `IllegalAccessToken`). It takes a
> single object parameter `param0` — a JSON string `{ "keyword", "index",
> "size" }` where `index` is the 1-based page number and `size` is the page
> size (all three required). Access tokens are issued per the Open Platform
> OAuth flow (buyer authorizes the app → you receive a `code` → exchange it
> at `/auth/token/create`) and expire, so they must be refreshed
> periodically.

The service signs requests per the Open Platform spec (ASCII-sorted
name+value concatenation, prefixed with the API path, HMAC-SHA256 keyed by the
App Secret, hex uppercase) and normalizes the response defensively, so it
tolerates the common field-name variants (`snake_case`/`camelCase`) and the
`*_response.result` envelope without a code change.

## Notes

- **Use simple manufacturing terms** for best results — describe the physical product, not your brand.
- Some fields (`moq`, `priceRange`, `leadTimeDays`, `location`) may be `null` when the provider doesn't supply them — render defensively.
- This integration covers **search only**. RFQ/quote requests, direct supplier messaging, and shortlist/shipment management are out of scope — apps layer those on top using their own workspace data.
- Supplier **detail** (full contact info, certifications, product gallery) is a planned future addition (`GET /api/suppliers/:supplierId`) and is not yet available.
- Alibaba only — other marketplaces (Made-in-China, Global Sources) are not covered.


---

# printify-products

Source: integrations/printify-products/docs.md

# Printify Print-on-Demand Integration

Create and sell custom branded merchandise (t-shirts, hoodies, mugs, etc.) using Printify's print-on-demand platform with real-time mockup previews.

## Category
E-commerce / Print-on-Demand

## Required API Keys
- `PRINTIFY_API_KEY`

## API Endpoints

All endpoints are proxied through the backend for API key security. Never expose PRINTIFY_API_KEY to the browser.

### Get Shops
```
GET /api/printify/shops
```

**Response:**
```json
[
  {
    "id": 12345,
    "title": "My Shop",
    "sales_channel": "custom"
  }
]
```

### Get Product Catalog (Blueprints)
```
GET /api/printify/catalog/blueprints
```

**Response:**
```json
[
  {
    "id": 6,
    "title": "Unisex Staple T-Shirt",
    "brand": "Bella+Canvas",
    "model": "3001",
    "images": ["https://..."]
  }
]
```

### Get Print Providers for Blueprint
```
GET /api/printify/catalog/blueprints/:blueprintId/providers
```

**Response:**
```json
[
  {
    "id": 1,
    "title": "Printify Choice",
    "location": {
      "country": "US"
    }
  }
]
```

### Get Variants for Blueprint/Provider
```
GET /api/printify/catalog/blueprints/:blueprintId/providers/:providerId/variants
```

**Response:**
```json
{
  "variants": [
    {
      "id": 45740,
      "title": "Black / S",
      "options": { "color": "Black", "size": "S" },
      "placeholders": [
        { "position": "front", "width": 4500, "height": 5100 },
        { "position": "back", "width": 4500, "height": 5100 },
        { "position": "sleeve_left", "width": 1800, "height": 1800 },
        { "position": "sleeve_right", "width": 1800, "height": 1800 }
      ]
    }
  ]
}
```

### Upload Design Image
```
POST /api/printify/uploads
```

**Request:**
```json
{
  "imageData": "data:image/png;base64,...",
  "fileName": "my-logo.png"
}
```

**Response:**
```json
{
  "id": "5d15ca551163cde90d7b2203",
  "file_name": "my-logo.png",
  "width": 1200,
  "height": 1200,
  "preview_url": "https://..."
}
```

### Proxy External Images (CORS)
```
GET /api/proxy/image?url=<encoded-url>
```

Use this endpoint to fetch external images (like brand logos) that may have CORS restrictions.

**Response:** Binary image data with appropriate Content-Type header

### Create Product
```
POST /api/printify/shops/:shopId/products
```

**Request:**
```json
{
  "title": "My Custom T-Shirt",
  "description": "A premium quality custom tee",
  "blueprint_id": 6,
  "print_provider_id": 1,
  "variants": [
    { "id": 45740, "price": 2499, "is_enabled": true },
    { "id": 45742, "price": 2499, "is_enabled": true }
  ],
  "print_areas": [
    {
      "variant_ids": [45740, 45742],
      "placeholders": [
        {
          "position": "front",
          "images": [
            {
              "id": "5d15ca551163cde90d7b2203",
              "x": 0.5,
              "y": 0.5,
              "scale": 1,
              "angle": 0
            }
          ]
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "id": "5bfd0b66a342bcc9b5563216",
  "title": "My Custom T-Shirt",
  "description": "A premium quality custom tee",
  "images": [{ "src": "https://mockup.png" }]
}
```

### Update Product
```
PUT /api/printify/shops/:shopId/products/:productId
```

Use this to update an existing product. **Note:** PUT may fail when changing variant lists; fallback to POST (create new) if needed.

**Request:** Same format as Create Product

### Delete Product
```
DELETE /api/printify/shops/:shopId/products/:productId
```

**Response:**
```json
{ "success": true }
```

### Submit Order
```
POST /api/printify/shops/:shopId/orders
```

**IMPORTANT: Workspace Tagging Convention**

When creating orders, you **must** include the workspace ID in the `external_id` field using this format:

```
ws:<workspaceId>:<identifier>
```

This tagging is what allows orders to be filtered by workspace later. Without it, orders cannot be associated with a specific workspace.

**Request:**
```json
{
  "external_id": "ws:abc-123:swag-1706745600000",
  "line_items": [
    {
      "product_id": "5bfd0b66a342bcc9b5563216",
      "variant_id": 45740,
      "quantity": 1
    }
  ],
  "shipping_method": 1,
  "address_to": {
    "first_name": "John",
    "last_name": "Smith",
    "email": "john@example.com",
    "phone": "1234567890",
    "country": "US",
    "address1": "123 Main St",
    "city": "New York",
    "zip": "10001"
  }
}
```

**Response:**
```json
{
  "id": "order-abc123",
  "status": "pending",
  "total_price": 2499,
  "total_shipping": 500
}
```

---

## Workspace-Scoped Order Access

All order retrieval is scoped to a workspace to prevent cross-tenant data leaks. Orders are associated with workspaces via the `external_id` field using the convention `ws:<workspaceId>:<rest>`.

### How It Works

1. **Order Creation**: When creating an order, the `external_id` field is set to `ws:<workspaceId>:swag-<timestamp>` (or `ws:<workspaceId>:space:<spaceId>:swag-<timestamp>` for space-level scoping)
2. **Order Retrieval**: All order listing endpoints filter by matching the `external_id` prefix against the requesting workspace's ID
3. **Security**: Endpoints that don't receive a `workspaceId` return empty results rather than exposing all orders

### Get Workspace Orders (Recommended)
```
GET /api/workspace/:workspaceId/printify/orders
```

This is the **preferred endpoint** for dashboard use. It automatically resolves the shop, fetches orders from Printify, and filters them to only include orders belonging to the specified workspace.

**Query Parameters:**
- `page` (optional): Page number for pagination
- `status` (optional): Filter by order status

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": "5a96d5e2a3eda800097bca15",
      "external_id": "ws:abc-123:swag-1706745600000",
      "status": "fulfilled",
      "total_price": 2499,
      "total_shipping": 450
    }
  ],
  "current_page": 1,
  "last_page": 1
}
```

### Convenience Endpoints (also workspace-scoped)
```
GET /api/printify/orders?workspaceId=<workspaceId>
GET /api/printify/orders/enriched?workspaceId=<workspaceId>
```

These convenience endpoints auto-resolve the shop ID and **require** a `workspaceId` query parameter. Without it, they return empty results for security.

---

## Order Administration (Internal Tools)

These endpoints are designed for building **internal admin tools** to track and manage orders. Use them to build order dashboards, fulfillment tracking, and customer support tools.

### List All Orders (Shop-level with workspace filter)
```
GET /api/printify/shops/:shopId/orders?workspaceId=<workspaceId>&page=1&status=fulfilled
```

**Query Parameters:**
- `workspaceId` (**required**): Filter orders to this workspace only. Omitting this returns empty results.
- `spaceId` (optional): Further filter to a specific space within the workspace
- `page` (optional): Page number for pagination (default: 1)
- `status` (optional): Filter by order status

**Order Statuses:**
- `pending` - Order created, awaiting processing
- `on-hold` - Awaiting manual approval
- `sending-to-production` - Being sent to print provider
- `in-production` - Currently being printed
- `fulfilled` - Order shipped
- `canceled` - Order was canceled
- `payment-not-received` - Awaiting payment

**Response:**
```json
{
  "current_page": 1,
  "last_page": 5,
  "data": [
    {
      "id": "5a96d5e2a3eda800097bca15",
      "external_id": "order-12345",
      "status": "fulfilled",
      "created_at": "2025-01-06T10:30:00Z",
      "address_to": {
        "first_name": "John",
        "last_name": "Smith",
        "email": "john@example.com",
        "city": "New York",
        "country": "US"
      },
      "line_items": [
        {
          "product_id": "5bfd0b66a342bcc9b5563216",
          "variant_id": 45740,
          "quantity": 1,
          "cost": 1200,
          "shipping_cost": 450
        }
      ],
      "total_price": 2499,
      "total_shipping": 450,
      "shipments": [
        {
          "carrier": "USPS",
          "tracking_number": "9400111899223456789012",
          "tracking_url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
          "shipped_at": "2025-01-08T14:22:00Z"
        }
      ]
    }
  ]
}
```

### Get Order Details
```
GET /api/printify/shops/:shopId/orders/:orderId
```

**Response:**
```json
{
  "id": "5a96d5e2a3eda800097bca15",
  "external_id": "order-12345",
  "status": "fulfilled",
  "created_at": "2025-01-06T10:30:00Z",
  "updated_at": "2025-01-08T14:22:00Z",
  "address_to": {
    "first_name": "John",
    "last_name": "Smith",
    "email": "john@example.com",
    "phone": "1234567890",
    "country": "US",
    "region": "NY",
    "address1": "123 Main St",
    "address2": "Apt 4B",
    "city": "New York",
    "zip": "10001"
  },
  "line_items": [
    {
      "product_id": "5bfd0b66a342bcc9b5563216",
      "variant_id": 45740,
      "quantity": 1,
      "print_provider_id": 1,
      "cost": 1200,
      "shipping_cost": 450,
      "status": "fulfilled",
      "metadata": {
        "title": "Custom T-Shirt",
        "variant_label": "Black / M"
      }
    }
  ],
  "total_price": 2499,
  "total_shipping": 450,
  "total_tax": 0,
  "shipments": [
    {
      "carrier": "USPS",
      "tracking_number": "9400111899223456789012",
      "tracking_url": "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
      "shipped_at": "2025-01-08T14:22:00Z",
      "delivered_at": null
    }
  ]
}
```

### Send Order to Production
```
POST /api/printify/shops/:shopId/orders/:orderId/send-to-production
```

Use this to manually approve an order that is `on-hold` and send it to the print provider for fulfillment.

**Response:**
```json
{
  "success": true,
  "status": "sending-to-production"
}
```

### Cancel Order
```
POST /api/printify/shops/:shopId/orders/:orderId/cancel
```

**Note:** Can only cancel orders with status `on-hold` or `payment-not-received`. Orders already in production cannot be canceled.

**Response:**
```json
{
  "success": true,
  "status": "canceled"
}
```

### Calculate Shipping Cost
```
POST /api/printify/shops/:shopId/orders/shipping
```

Calculate shipping costs **before** creating an order. Useful for showing customers shipping prices at checkout.

**Request:**
```json
{
  "line_items": [
    {
      "product_id": "5bfd0b66a342bcc9b5563216",
      "variant_id": 45740,
      "quantity": 2
    }
  ],
  "address_to": {
    "first_name": "John",
    "last_name": "Smith",
    "country": "US",
    "region": "NY",
    "address1": "123 Main St",
    "city": "New York",
    "zip": "10001"
  }
}
```

**Response:**
```json
{
  "standard": 450,
  "express": 1295,
  "priority": 1895
}
```

Note: Shipping costs are in cents.

---

## Order Webhooks (Real-time Updates)

Printify can send real-time updates when order status changes. Set up webhooks to receive notifications for:

### Webhook Events

| Event | Description |
|-------|-------------|
| `order:created` | New order was submitted |
| `order:updated` | Order details changed |
| `order:sent-to-production` | Order sent to print provider |
| `order:shipment:created` | Items shipped (includes tracking) |
| `order:shipment:delivered` | Items delivered |

### Webhook Payload Example (order:shipment:created)
```json
{
  "event": "order:shipment:created",
  "resource": {
    "id": "5a96d5e2a3eda800097bca15",
    "type": "order",
    "data": {
      "order_id": "5a96d5e2a3eda800097bca15",
      "shipment": {
        "carrier": "USPS",
        "tracking_number": "9400111899223456789012",
        "tracking_url": "https://...",
        "shipped_at": "2025-01-08T14:22:00Z"
      }
    }
  }
}
```

### Setting Up Webhooks
Webhooks are configured at the platform level. Contact platform admin to set up webhook receivers.

---

## Admin Dashboard Helper Functions

```typescript
export const printifyAdmin = {
  // List orders for a workspace (RECOMMENDED - workspace-scoped)
  async listWorkspaceOrders(workspaceId: string, options?: { page?: number; status?: string }) {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.status) params.set('status', options.status);
    
    const response = await fetch(`/api/workspace/${workspaceId}/printify/orders?${params}`);
    return response.json();
  },

  // List orders with shop-level access (requires workspaceId for security)
  async listOrders(shopId: number, workspaceId: string, options?: { page?: number; status?: string }) {
    const params = new URLSearchParams();
    params.set('workspaceId', workspaceId);
    if (options?.page) params.set('page', String(options.page));
    if (options?.status) params.set('status', options.status);
    
    const response = await fetch(`/api/printify/shops/${shopId}/orders?${params}`);
    return response.json();
  },

  // Get detailed order info with tracking
  async getOrder(shopId: number, orderId: string) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders/${orderId}`);
    return response.json();
  },

  // Send held order to production
  async sendToProduction(shopId: number, orderId: string) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders/${orderId}/send-to-production`, {
      method: 'POST'
    });
    return response.json();
  },

  // Cancel an order (only works for on-hold orders)
  async cancelOrder(shopId: number, orderId: string) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders/${orderId}/cancel`, {
      method: 'POST'
    });
    return response.json();
  },

  // Calculate shipping before order
  async calculateShipping(shopId: number, lineItems: any[], addressTo: any) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders/shipping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_items: lineItems, address_to: addressTo })
    });
    return response.json();
  },

  // Create order with workspace tagging (REQUIRED for workspace filtering)
  async createOrder(shopId: number, workspaceId: string, orderData: any) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderData,
        external_id: `ws:${workspaceId}:swag-${Date.now()}`
      })
    });
    return response.json();
  },

  // Get order status summary (for dashboard widgets)
  async getOrderStats(workspaceId: string) {
    const result = await this.listWorkspaceOrders(workspaceId);
    const orders = result.orders || [];
    
    const stats: Record<string, number> = {
      pending: 0,
      'on-hold': 0,
      'in-production': 0,
      fulfilled: 0,
      canceled: 0
    };
    
    orders.forEach((order: any) => {
      if (stats[order.status] !== undefined) {
        stats[order.status]++;
      }
    });
    
    return stats;
  }
};
```

---

## Internal Tools Use Cases

Use these admin endpoints to build:

### Order Dashboard
- View workspace-scoped orders across statuses
- Filter by status (pending, in-production, fulfilled)
- Search by customer name or order ID
- Track fulfillment pipeline
- **Always use workspace-scoped endpoints to prevent cross-tenant data access**

### Fulfillment Manager
- List orders needing attention (on-hold, pending)
- One-click "Send to Production" action
- Bulk operations for order management

### Customer Support Tool
- Look up order by ID or customer email
- View full order history
- Access tracking information
- Cancel/refund orders when needed

### Analytics Dashboard
- Orders by status over time
- Revenue tracking (total_price - cost)
- Shipping cost analysis
- Popular products/variants

---

## Installation

```javascript
export const printify = {
  async getShops() {
    const response = await fetch('/api/printify/shops');
    return response.json();
  },

  async getCatalog() {
    const response = await fetch('/api/printify/catalog/blueprints');
    return response.json();
  },

  async getProviders(blueprintId) {
    const response = await fetch(`/api/printify/catalog/blueprints/${blueprintId}/providers`);
    return response.json();
  },

  async getVariants(blueprintId, providerId) {
    const response = await fetch(`/api/printify/catalog/blueprints/${blueprintId}/providers/${providerId}/variants`);
    return response.json();
  },

  async uploadDesign(imageData, fileName) {
    const response = await fetch('/api/printify/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, fileName })
    });
    return response.json();
  },

  async createProduct(shopId, productData) {
    const response = await fetch(`/api/printify/shops/${shopId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    return response.json();
  },

  async updateProduct(shopId, productId, productData) {
    const response = await fetch(`/api/printify/shops/${shopId}/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData)
    });
    return response.json();
  },

  async deleteProduct(shopId, productId) {
    const response = await fetch(`/api/printify/shops/${shopId}/products/${productId}`, {
      method: 'DELETE'
    });
    return response.json();
  },

  async submitOrder(shopId, orderData) {
    const response = await fetch(`/api/printify/shops/${shopId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    return response.json();
  },

  async proxyImage(externalUrl) {
    const response = await fetch(`/api/proxy/image?url=${encodeURIComponent(externalUrl)}`);
    return response.blob();
  }
};
```

## Print Positions

Each variant has available print positions (placeholders). Common positions include:
- `front` - Front of garment
- `back` - Back of garment  
- `sleeve_left` - Left sleeve
- `sleeve_right` - Right sleeve

These are returned in the variants endpoint:

```json
{
  "variants": [
    {
      "id": 45740,
      "placeholders": [
        { "position": "front", "width": 4500, "height": 5100 },
        { "position": "back", "width": 4500, "height": 5100 },
        { "position": "sleeve_left", "width": 1800, "height": 1800 },
        { "position": "sleeve_right", "width": 1800, "height": 1800 }
      ]
    }
  ]
}
```

## Per-Position Design Settings

Each print position should maintain independent settings for scale, x, and y coordinates. This allows users to customize each position differently (e.g., large centered logo on front, small logo on back).

```typescript
interface PositionSettings {
  scale: number;  // 0.25 to 2.0
  x: number;      // 0 to 1 (0.5 = center)
  y: number;      // 0 to 1 (0.5 = center)
}

type PositionSettingsMap = Record<string, PositionSettings>;

const defaultSettings: PositionSettingsMap = {
  front: { scale: 1.0, x: 0.5, y: 0.5 },
  back: { scale: 1.0, x: 0.5, y: 0.5 },
  sleeve_left: { scale: 0.5, x: 0.5, y: 0.5 },
  sleeve_right: { scale: 0.5, x: 0.5, y: 0.5 },
};
```

To print on multiple positions with different settings:

```json
{
  "print_areas": [{
    "variant_ids": [45740],
    "placeholders": [
      {
        "position": "front",
        "images": [{ "id": "image-id", "x": 0.5, "y": 0.4, "scale": 1.2, "angle": 0 }]
      },
      {
        "position": "back",
        "images": [{ "id": "image-id", "x": 0.5, "y": 0.3, "scale": 0.8, "angle": 0 }]
      }
    ]
  }]
}
```

## Design Positioning

- `x`: Horizontal position (0-1, 0.5 = center)
- `y`: Vertical position (0-1, 0.5 = center)
- `scale`: Size multiplier (0.25-2.0, 1.0 = 100%)
- `angle`: Rotation in degrees

## Color-Specific Mockup Generation

**Critical Insight:** Printify generates mockups based on the variants included when creating a product. To get mockups for a specific color:

1. Create a "preview product" with only ONE variant (the desired color)
2. Printify will generate mockups specifically for that color
3. Delete the preview product after getting the mockup

```typescript
async function generateColorMockup(
  shopId: string,
  blueprintId: number,
  providerId: number,
  variantId: number,  // Single variant for specific color
  imageId: string,
  position: string,
  settings: PositionSettings
) {
  const productData = {
    title: `Preview-${Date.now()}`,
    description: 'Preview product',
    blueprint_id: blueprintId,
    print_provider_id: providerId,
    variants: [{ id: variantId, price: 100, is_enabled: true }],
    print_areas: [{
      variant_ids: [variantId],
      placeholders: [{
        position,
        images: [{
          id: imageId,
          x: settings.x,
          y: settings.y,
          scale: settings.scale,
          angle: 0
        }]
      }]
    }]
  };

  const response = await fetch(`/api/printify/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData)
  });

  const product = await response.json();
  const mockupUrl = product.images?.[0]?.src;
  
  return { productId: product.id, mockupUrl };
}
```

## Automatic Preview on Customize

When users enter the customize step, automatically:
1. Select the first available brand logo
2. Generate a mockup with the default color
3. Display the preview immediately

This provides instant visual feedback without requiring user interaction.

```typescript
useEffect(() => {
  if (
    step === 'customize' &&
    !variantsLoading &&
    variants.length > 0 &&
    brandLogos.length > 0 &&
    !designImage &&
    !isGeneratingMockup &&
    shops?.length
  ) {
    handleSelectBrandLogo(brandLogos[0]);
  }
}, [step, variantsLoading, variants.length, brandLogos.length, designImage, isGeneratingMockup, shops?.length]);
```

## Best Practices

### Mockup Generation Strategy
Printify doesn't have a standalone mockup API - mockups are generated when creating products.

1. **Single-variant preview products** - Create products with one variant to get color-specific mockups
2. **Reuse preview products** - Store preview product ID and try PUT to update; fallback to POST if PUT fails
3. **Clean up** - Delete preview products when user exits or finalizes

### Variant Limits
- **Maximum 100 variants per product** - Printify enforces this limit
- When creating final products, batch variants if needed or limit color/size combinations

### PUT vs POST for Updates
PUT updates may fail when changing variant lists. Implement fallback logic:

```typescript
async function updateOrCreateProduct(shopId, productId, productData) {
  if (productId) {
    try {
      const response = await fetch(`/api/printify/shops/${shopId}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });
      if (response.ok) return response.json();
    } catch (error) {
      console.warn('PUT failed, falling back to POST');
    }
  }
  
  // Fallback to creating new product
  const response = await fetch(`/api/printify/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData)
  });
  return response.json();
}
```

### Handling External Images (CORS)
Use the image proxy endpoint for external URLs like brand logos:

```typescript
async function loadExternalImage(url: string): Promise<string> {
  const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  const blob = await response.blob();
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
```

### Color Selection UI
Display up to 12 colors from available variants for a clean UI:

```typescript
const availableColors = useMemo(() => {
  const colorMap = new Map<string, number>();
  variants.forEach(v => {
    if (v.options?.color && !colorMap.has(v.options.color)) {
      colorMap.set(v.options.color, v.id);
    }
  });
  return Array.from(colorMap.entries())
    .slice(0, 12)
    .map(([color, variantId]) => ({ color, variantId }));
}, [variants]);
```

## Use Cases
- Custom branded merchandise for businesses
- T-shirts, hoodies, hats with company logos
- Promotional items (mugs, phone cases, bags)
- Event merchandise
- Team uniforms and apparel
- Customer reward items
- Influencer merchandise

## Product Categories
- Apparel (T-shirts, Hoodies, Tank Tops, Long Sleeves)
- Accessories (Hats, Bags, Phone Cases)
- Home & Living (Mugs, Posters, Pillows)
- Kids & Baby (Onesies, Youth Tees)

## Dynamic Pricing

Printify provides variant-level pricing through the variants endpoint. Each variant includes:
- `cost` - What you pay Printify (in cents)
- `price` - Suggested retail price (in cents)

```typescript
interface Variant {
  id: number;
  title: string;
  options: { color: string; size: string };
  placeholders?: Placeholder[];
  cost: number;    // Your cost in cents (e.g., 1200 = $12.00)
  price: number;   // Suggested retail in cents (e.g., 2499 = $24.99)
}
```

### Pricing Strategy Example
Apply a 20% markup on the suggested retail price:

```typescript
const calculateSellingPrice = (suggestedRetailCents: number): number => {
  return Math.round(suggestedRetailCents * 1.20); // 20% markup
};

// Example: $24.99 suggested → $29.99 selling price
const sellingPriceCents = calculateSellingPrice(2499); // 2999
```

## Price Handling (Cents vs Dollars)

**Critical:** All prices are stored in the database as **integers in cents**. Convert when:
- Displaying to users: divide by 100
- Saving to database: multiply by 100

```typescript
// Frontend display (cents → dollars)
const displayPrice = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

// Before database insert (dollars → cents)
const unitPriceCents = Math.round(unitPriceDollars * 100);
const shippingPriceCents = Math.round(shippingPriceDollars * 100);
const totalPriceCents = Math.round(totalPriceDollars * 100);
```

## Workspace Order Flow

Orders are created within a workspace context with wallet-based payments:

### Save Product to Workspace
```
POST /api/workspaces/:configId/swag-products
```

**Request:**
```json
{
  "title": "Custom T-Shirt",
  "blueprintId": 6,
  "providerId": 1,
  "printifyProductId": "abc123",
  "selectedVariants": [45740, 45742],
  "designImageUrl": "https://...",
  "mockupImageUrl": "https://...",
  "basePrice": 1200,
  "sellingPrice": 2999,
  "positionSettings": {
    "front": { "scale": 1.0, "x": 0.5, "y": 0.5 },
    "back": { "scale": 0.8, "x": 0.5, "y": 0.3 }
  }
}
```

### Get Wallet Balance
```
GET /api/workspaces/:configId/wallet
```

**Response:**
```json
{
  "success": true,
  "balance": 15000
}
```
Note: Balance is returned in cents.

### Create Order (with Wallet Payment)
```
POST /api/workspaces/:configId/swag-orders
```

**Request:**
```json
{
  "swagProductId": "uuid-here",
  "variantId": 45740,
  "quantity": 2,
  "unitPrice": 29.99,
  "shippingPrice": 4.99,
  "totalPrice": 64.97,
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Smith",
    "email": "john@example.com",
    "phone": "1234567890",
    "country": "US",
    "address1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  }
}
```

Note: Prices in request are in dollars; they are converted to cents server-side before database storage.

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "order-uuid",
    "printifyOrderId": "printify-order-123",
    "status": "submitted"
  },
  "newWalletBalance": 8503
}
```

### Get Order History
```
GET /api/workspaces/:configId/swag-orders
```

### Reorder Saved Product
Use the same order endpoint with a saved product's `swagProductId`. The system will:
1. Look up the saved product details
2. Create a new Printify order

## Rate Limits
- 600 API calls per minute (global)
- 100 catalog requests per minute
- Product publishing: 200 requests per 30 minutes
- Error rate must not exceed 5% of total requests

## Documentation
- [Printify API Reference](https://developers.printify.com/)
- [Printify Help Center](https://help.printify.com/)


---

# razorpay-payments

Source: integrations/razorpay-payments/docs.md

# Razorpay Payments Integration

Accept payments and subscriptions in your Space with Razorpay, using your own Razorpay account keys. Built for founders in India who want customers to pay in INR through Razorpay's hosted checkout.

## How It Works

Razorpay runs in connect mode only: you bring your own Razorpay API keys, and every payment settles directly into your Razorpay account. There is no platform mode for Razorpay.

- You enter your Key ID, Key Secret, and Webhook Secret in the Wallet window.
- The Key Secret and Webhook Secret are encrypted at rest. They are never shown again after you save them; the Wallet only displays the last few characters so you can recognize which key is connected.
- Once connected, Razorpay becomes the active payment provider for your workspace. The same payment endpoints you already use (`/api/payments/checkout` and `/api/payments/subscribe`) automatically route through Razorpay.
- Customers pay on Razorpay's hosted checkout page. One-time purchases use Razorpay Payment Links; subscriptions use Razorpay's hosted subscription page.

## Step 1: Get Your Keys from the Razorpay Dashboard

You need three values from your Razorpay Dashboard (https://dashboard.razorpay.com):

### Key ID and Key Secret

1. Sign in to the Razorpay Dashboard.
2. Go to Account & Settings, then API Keys (under "Website and app settings").
3. Click "Generate Key" (or "Regenerate Key" if you already have one).
4. Copy both values right away:
   - Key ID starts with `rzp_test_` (test mode) or `rzp_live_` (live mode).
   - Key Secret is shown only once. If you lose it, regenerate the key pair.

Use live mode keys (`rzp_live_`) to accept real payments. Test mode keys work for trying things out, but customers cannot pay you with them.

### Webhook Secret

The webhook secret is a value you choose yourself when you create the webhook in Step 2. Pick a long random string (for example, from a password generator) and keep it handy; you will paste the same value into both the Razorpay Dashboard and the Wallet window.

## Step 2: Configure the Webhook in Razorpay

Webhooks are how Razorpay tells the platform that a payment succeeded, a subscription changed, or a refund happened. Without the webhook, customers can pay but your Space will not know about it.

1. In the Razorpay Dashboard, go to Account & Settings, then Webhooks.
2. Click "Add New Webhook".
3. Set the Webhook URL to:

```
https://app.audos.com/api/payments/razorpay/webhook
```

If your platform runs on a different domain, use `https://<your-platform-domain>/api/payments/razorpay/webhook`.

4. Enter your chosen Webhook Secret in the "Secret" field.
5. Select at least these Active Events:
   - `payment.captured`
   - `subscription.activated`
   - `subscription.cancelled`
   - `refund.processed`

You can safely enable more events. The platform also understands `payment.failed`, `subscription.charged`, `subscription.resumed`, `subscription.halted`, `subscription.pending`, `subscription.completed`, and `refund.created`. Any other events are acknowledged and ignored.

6. Save the webhook.

Every webhook delivery is verified two ways before it changes anything: the `X-Razorpay-Signature` header is checked against your Webhook Secret (HMAC-SHA256 of the raw request body), and captured payments are additionally re-verified against the Razorpay API with your keys before a customer is marked as paid.

## Step 3: Connect Razorpay in the Wallet

1. Open your Workspace dashboard.
2. Click "Wallet".
3. Click "Accept Payments".
4. Choose your country. Razorpay appears as an option for supported countries (India).
5. Enter your Key ID, Key Secret, and Webhook Secret.
6. Click Connect.

The platform validates your keys with a live Razorpay API call before saving. If the keys are wrong, you get an error and nothing is stored. On success, both secrets are encrypted at rest and Razorpay becomes your active payment provider.

## Quick Start

All payment requests should include `X-App-Id: window.__APP_ID__ || window.__SPACE_ID__` so hosted mini-apps and compiled spaces both resolve the workspace correctly, especially on custom domains.

Once Razorpay is connected, the standard payment endpoints route through it automatically. Requests and payment records are stamped with `paymentMode: 'razorpay'` so you can tell which provider handled them.

Amounts are always in the smallest currency unit. For INR that is paise: 49900 = Rs 499.00.

### 1. One-Time Payment

```typescript
// One-time purchase: Rs 499.00
const { checkoutUrl } = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    amount: 49900,            // paise (49900 = Rs 499.00)
    currency: 'INR',
    productName: 'My Product',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/success',
    cancelUrl: window.location.href,
    metadata: { paymentMode: 'razorpay' }
  })
}).then(r => r.json());

// Redirect to Razorpay's hosted payment page
window.location.href = checkoutUrl;
```

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://rzp.io/...",
  "sessionId": "plink_...",
  "mode": "connect"
}
```

### 2. Monthly Subscription

```typescript
// Subscription: Rs 999.00 per month
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    priceCents: 99900,        // paise (99900 = Rs 999.00)
    currency: 'INR',
    interval: 'month',        // 'month' (default), 'year', 'week', or 'day'
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome',
    cancelUrl: window.location.href,
    metadata: { paymentMode: 'razorpay' }
  })
}).then(r => r.json());

// Redirect to Razorpay's hosted subscription page
window.location.href = checkoutUrl;
```

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://rzp.io/...",
  "sessionId": "sub_...",
  "mode": "connect",
  "priceCents": 99900
}
```

### 3. Multi-Interval Subscription

Any cadence is `interval` times `intervalCount`. For example, billing every 3 months is `interval: 'month', intervalCount: 3`.

```typescript
// Quarterly: Rs 2,499.00 billed every 3 months
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    priceCents: 249900,
    currency: 'INR',
    interval: 'month',
    intervalCount: 3,
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome',
    metadata: { paymentMode: 'razorpay' }
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

Under the hood a subscription creates a Razorpay Plan and then a Subscription on that plan. Razorpay requires a total number of billing cycles up front, so subscriptions are created with a long horizon per interval: 120 cycles for monthly, 10 for yearly, 520 for weekly, and 365 for daily. Customers can cancel anytime.

## What Happens After a Payment

Webhook events drive everything automatically:

| Razorpay event | Effect |
|----------------|--------|
| `payment.captured` | Customer becomes a contact, gets tagged as a paying customer, and (for subscription charges) is marked active |
| `payment.failed` | A failed subscription renewal marks the subscriber past due; failed one-time payments are ignored (abandoned checkouts) |
| `subscription.activated` / `subscription.charged` / `subscription.resumed` | Subscriber marked active |
| `subscription.cancelled` / `subscription.completed` | Subscriber marked canceled |
| `subscription.halted` / `subscription.pending` | Subscriber marked past due |
| `refund.processed` / `refund.created` | Customer marked refunded |

Duplicate webhook deliveries are detected and processed only once.

## Limitations

Razorpay support is intentionally simpler than Stripe. These features are not available and requests that include them are rejected with a clear error:

- **No free trials.** `trialDays` is not supported. Charge from the first cycle, or offer a cheaper first period as a separate product.
- **No intro pricing.** `introPriceCents`, `introInterval`, `introIntervalCount`, `introIterations`, `regularPriceCents`, `regularInterval`, and `regularIntervalCount` are not supported. Use a flat `priceCents` plus `interval` / `intervalCount`.
- **No promo codes.** `promoCode` is not supported.
- **No Stripe price IDs.** `priceId` is Stripe-only; always pass `priceCents`.
- **No one-time add-ons on subscriptions.** `oneTimeLineItems` is not supported.
- **INR is the default currency.** If you omit `currency`, INR is used. Amounts are in paise.
- **Metadata is capped at 15 keys.** Razorpay notes allow at most 15 key/value pairs; extra keys are dropped.
- **No saved cards.** The saved payment methods (card on file) endpoints are Stripe-only.

## Disconnecting or Rotating Keys

### Disconnect

In Wallet, open Accept Payments and click Disconnect for Razorpay. This:

- Deletes your stored Key ID, Key Secret, and Webhook Secret from the platform.
- Switches the workspace's active payment provider back to Stripe.

Existing subscriptions in your Razorpay account are not touched; manage them from the Razorpay Dashboard.

### Rotate Keys

If a key leaks or you want to switch from test to live mode:

1. In the Razorpay Dashboard, regenerate your API keys (API Keys page) and, if needed, update the webhook secret on your webhook.
2. In Wallet, go to Accept Payments and connect Razorpay again with the new Key ID, Key Secret, and Webhook Secret. Saving overwrites the old values.

Note: regenerating keys in Razorpay immediately invalidates the old ones, so reconnect right away to avoid failed checkouts.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Country "XX" is not supported for Razorpay onboarding.` | The selected country is not in the Razorpay-supported list | Pick a supported country (India) |
| Key validation failed on connect | Wrong Key ID or Key Secret, or test/live mismatch | Copy the keys again from the Razorpay Dashboard |
| `Razorpay is not connected for this workspace.` | A payment endpoint was called before connecting | Complete the Wallet connection first |
| `Invalid webhook signature` (in logs) | Webhook Secret in Razorpay does not match the one saved in Wallet | Enter the same secret in both places |
| Subscription request rejected | The request included `trialDays`, intro pricing, `promoCode`, `priceId`, or `oneTimeLineItems` | Remove the unsupported field; see Limitations |


---

# stripe-payments

Source: integrations/stripe-payments/docs.md

# Native Payments Integration

Accept payments in your Space through the workspace's active native provider. The `/api/payments/checkout`, `/api/payments/subscribe`, `/api/payments/status/:sessionId`, and stable `/buy/<paymentLinkId>` surfaces resolve the provider selected under Wallet → Accept Payments; app code must not hardcode Stripe. Paystack is available for Nigeria, Ghana, South Africa, Kenya, and Côte d'Ivoire with an encrypted `sk_test_…` or `sk_live_…` secret key and the exact workspace-specific webhook URL displayed in Wallet. Moyasar is available for Saudi Arabia/SAR one-time hosted invoices; connected credentials do not mean mada is verified live. PayOS is available for Vietnam/VND one-time VietQR bank-transfer payments with the founder's own payment channel Client ID, API Key, and Checksum Key.

<!-- MANIFEST:INTRO — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "Subscription Lifecycle Events → Server Function" below. -->
Subscription cancellations, renewals and plan changes can be delivered to a server function registered under the reserved name `subscription-events` (see `server-functions`), including cancellations made on the provider's hosted billing page and workspaces selling through the platform's merchant account. One-time checkout can also run inline (`uiMode: "elements"`) on a connected Stripe account and deliver verified session events to a `checkout-events` server function; that function must re-verify via `GET /api/payments/status/:sessionId?verify=server` before granting. Moyasar is Saudi Arabia/SAR one-time-only: Wallet accepts only a secret key, registers the workspace-specific webhook, and reports mada verified live only after an API-re-fetched paid live transaction reports mada. PayOS is Vietnam/VND one-time-only: Wallet accepts a payment channel's Client ID, API Key, and Checksum Key, confirms the workspace-specific webhook with PayOS, and fulfills only after an API re-fetch reports the payment link PAID; amounts are VND × 100 (50,000 VND = `5000000`).

Flutterwave allows only ONE webhook address per Flutterwave account, so Audos receives every workspace's Flutterwave traffic at one shared address (`/api/payments/flutterwave/webhook`, printed in Wallet → Accept Payments) and attributes each delivery itself — checkout metadata, then an `audos_ws_<id>` marker in the payment reference, then the connected account when only one workspace could own it. One Flutterwave account can therefore serve several workspaces, and each workspace receives its own events by registering the reserved name `flutterwave-events` (see `server-functions`). No cross-workspace write is involved: each workspace's own function does its own writes.

Subscription pricing is server-authoritative: `/api/payments/subscribe` selects
the workspace-editable `data/payment-config.json` catalog by top-level
`billingPlanId`, or uses its configured default when omitted. Unknown IDs are
rejected. Browser price/trial/cadence/intro/renewal fields cannot override the
catalog, and `metadata.plan` is not a selector. There is no universal 7-day/$5
default; missing trial settings normalize to zero.

Creem: reuse a founder's Creem product by putting its `prod_…` ID in the catalog plan's `priceId` (subscriptions) or by sending `productId` (one-time `/api/payments/checkout`, or `/api/payments/subscribe` when the plan has no `priceId`). The product must belong to the workspace's Creem account and match the plan's price, cadence and `trialDays`; a mismatch, a foreign ID, or a recurring product sent to the one-time endpoint returns 400 with the reason instead of creating a product. Plan `trialDays` is Creem's native free trial (`trialing`, then `active`), and a same-cadence intro price becomes a pre-applied Creem percentage discount code, so it must be a whole-percent discount off the regular price.
<!-- MANIFEST:END -->

### How It Works

1. **Customer signs up** — Contact created in CRM with `trialStartDate` in metadata
2. **Customer completes checkout** — Stripe sends `checkout.session.completed` webhook
3. **Platform updates contact metadata** — Writes `subscriptionId`, `subscriptionStatus`, `stripeCustomerId`, `planTier` into the contact's metadata
4. **Subscription changes** — Stripe sends `customer.subscription.updated/deleted` webhooks
5. **Platform keeps metadata in sync** — Updates `subscriptionStatus` on every change
6. **All consumers read metadata** — App runtime, CRM dashboard, subscriber queries all derive state from the same metadata fields

### Two Payment Modes

1. **Platform Mode (Default)** - Payments work immediately
   - Uses the platform's Stripe account
   - No setup required - just start accepting payments
   - Perfect for getting started quickly

2. **Connect Mode (Upgrade)** - Your own Stripe merchant account
   - Go to Wallet → "Accept Payments" to set up Stripe Connect
   - Payments go directly to your bank account
   - Small platform fee applies (default 5%)
   - Full control over your payment processing

### Native Provider Inventory

Wallet supports Stripe Connect plus BYO Flutterwave, Paystack, Razorpay, Lemon Squeezy, Xendit, PayMongo, Moyasar, PayOS, Dodo Payments, Airwallex, Whop, Creem.io, and Paddle. App code uses the provider-neutral checkout, subscription, status, and stable `/buy/<paymentLinkId>` APIs; it must not hardcode Stripe.

### Paystack BYO Setup and Limits

In Wallet → Accept Payments, select Nigeria, Ghana, South Africa, Kenya, or Côte d'Ivoire and choose Paystack. In Paystack Dashboard → Settings → API Keys & Webhooks, copy the secret key for the environment you intend to use: `sk_test_…` creates test transactions and `sk_live_…` creates real transactions. Paste it only into Wallet; never put it in app code or chat. Wallet validates the key, stores it encrypted, masks it after save, and displays the exact workspace-specific webhook URL to register in Paystack. Paystack signs `x-paystack-signature` with that same secret key; there is no separate webhook secret.

Paystack checkout requires the buyer's email. Stable `/buy/<paymentLinkId>` URLs therefore collect the email on an Audos page and create a fresh Paystack transaction for each buyer. One-time payments and flat daily, weekly, monthly, or annual subscriptions are supported in the selected market's local currency; Paystack USD account capabilities are not exposed by this integration. Free trials, promo codes, phased/intro pricing, arbitrary multi-interval plans, manual capture, saved-card endpoints, and Audos-initiated refunds are not Paystack features in this integration. Failed or abandoned one-time transactions are reconciled through reference verification; Paystack only webhooks successful transactions, while subscription invoice failures and processed refunds are mirrored into CRM/subscriber state.

### Moyasar BYO Setup, mada Evidence, and Limits

In Wallet → Accept Payments, select Saudi Arabia and choose Moyasar. Paste only the complete `sk_test_…` or `sk_live_…` secret key from Moyasar Dashboard → Settings → API Keys; a publishable key is unnecessary for Audos-hosted invoice creation. Wallet validates the key, encrypts and masks it, detects Test versus Live, generates a webhook shared secret, and registers the exact workspace-specific `/api/payments/moyasar/webhook/<workspaceId>` endpoint. Live approval requires a valid Saudi commercial registration (CR) or freelance license, a matching Saudi commercial bank account, merchant approval, and mada activation by Moyasar.

Moyasar V1 supports one-time SAR hosted invoices only. Every buyer gets a fresh invoice, and 499.00 SAR is sent as the integer `49900` halalas. Audos persists a durable checkout-attempt claim because Moyasar does not document request idempotency for invoice creation. Before CRM tags, access, polling success, or return sign-in, Audos re-fetches the invoice and payment with the merchant secret and requires paid status, exact amount, SAR, matching workspace/link/attempt metadata, and the locally persisted invoice reference. The webhook `secret_token` is compared timing-safely as first-line authentication, but never replaces that API re-fetch.

“Connected” means the key validated and the webhook registered; it does not prove mada is active. `madaVerifiedLive` is recorded only after a paid live transaction is re-fetched and the authoritative payment source reports `company: "mada"`. Sandbox payments and ordinary Visa/Mastercard payments never set it. Subscriptions, trials, promo codes, saved cards/off-session charges, manual capture/escrow, provider price IDs, non-SAR pricing, automatic platform-fee splits, and Audos-initiated refunds are rejected. Issue refunds in the Moyasar dashboard; verified refund webhooks are mirrored into CRM.

### PayOS BYO Setup, VietQR Checkout, and Limits

In Wallet → Accept Payments, select Vietnam and choose PayOS. In my.payos.vn, verify the business or individual (CCCD) account, link a Vietnamese bank account, and create a payment channel (Kênh thanh toán) — one channel per workspace. Paste that channel's Client ID, API Key, and Checksum Key only into Wallet; never put them in app code or chat. Wallet encrypts them and calls PayOS `confirm-webhook` to point the channel at the exact workspace-specific `/api/payments/payos/webhook/<workspaceId>` endpoint. PayOS allows one webhook URL per payment channel, so connecting replaces any webhook URL the channel already had. PayOS has no sandbox: test with a small real transfer (for example 2,000 VND).

PayOS supports one-time VND payments only. Audos amounts stay in hundredths, so 50,000 VND is `amount: 5000000` for `/api/payments/checkout` or `priceCents: 5000000` on a payment link, and PayOS receives the integer `50000`; amounts that are not whole đồng are rejected. PayOS checkout does not collect an email, so stable `/buy/<paymentLinkId>` URLs collect the buyer's email on an Audos page first and SDK checkouts must pass `customerEmail`. Each buyer gets a fresh PayOS link whose `orderCode` is derived from a durable Audos checkout attempt, so retries never mint a second payable link. Webhooks are verified with HMAC-SHA256 over the key-sorted `data` fields using the Checksum Key, but CRM tags, access, polling success, and return sign-in happen only after Audos re-fetches the link with the channel credentials and it reports `PAID` for the exact amount. Partial (`UNDERPAID`) transfers stay open, and webhook replays are deduplicated per payment link.

Subscriptions, trials, promo codes, saved payment methods/off-session charges, manual capture/escrow, non-VND pricing, automatic platform-fee splits, and Audos-initiated refunds are rejected. PayOS has no refund API — refund buyers by bank transfer from your own bank account.

### Creem BYO Product IDs, Trials, and Intro Pricing

A Creem product carries its own price, billing period and trial, and every Creem checkout is created from a product ID. When the founder already has the product in Creem, reuse it instead of letting Audos create one per checkout:

- **Subscriptions:** set the catalog plan's `priceId` to the Creem product ID (`prod_…`) in `data/payment-config.json`, then call `POST /api/payments/subscribe` with that plan's `billingPlanId`. If the plan has no `priceId`, the request may send `productId` instead. Audos reads the product with the workspace's own Creem API key, so a product from another Creem account — or from the other mode (test vs live) — is a 400 and nothing is created. The product must be recurring and match the plan exactly (regular price, currency, cadence and free trial), because Creem charges what the product says. A mismatch is a 400 that names each difference; Audos never edits the founder's product. A plan with a `priceId` but no `priceCents` takes its price and cadence from the product. A Stripe `price_…` ID in `priceId` is rejected while Creem is active.
- **One-time:** send `productId` to `POST /api/payments/checkout` to sell a one-time Creem product at its Creem price (`amount` may be omitted; a different `amount` is ignored). A recurring product sent here is a 400 telling the app to subscribe instead — the one-time endpoint never turns a subscription product into a single charge.
- **No product ID:** Audos creates a Creem product from the request or plan terms, as before — a new product (and intro code) for every checkout, so prefer reusing one.

Trials and intro pricing map onto Creem's native features:

- **Free trial:** the plan's `trialDays` is the product's Creem trial period. The subscription is `trialing` (with `trialEndDate`) until Creem collects the first payment, then `active` — the same statuses Stripe subscriptions report.
- **Intro price:** an intro phase on the plan's own cadence (`hasIntroPricing`, `introPriceCents`, `introIterations`, `regularPriceCents`) becomes a Creem percentage discount code that Audos creates once per product and pre-applies at checkout. The product's price is the regular price. Creem applies the code to the first payment after any trial (`introIterations: 1`), or to the first N monthly payments (`introIterations: N` on a monthly plan). The intro price must be a whole-percent discount off the regular price — $22.22 → $11.11 is 50% off.
- **Not supported on Creem:** an intro period on a different cadence from the regular price, multi-period intros on non-monthly plans, intro prices that aren't a whole-percent discount, Creem paid trials, and a pre-applied `promoCode` (buyers can still type a Creem discount code on the checkout page). These fail with a 400 instead of charging something else.

Example — 14 days free, then $11.11 for the first month, then $22.22 every month:

```json
{
  "currency": "usd",
  "plans": [
    {
      "id": "monthly",
      "name": "Monthly",
      "priceId": "prod_YOUR_CREEM_PRODUCT",
      "priceCents": 2222,
      "interval": "month",
      "trialDays": 14,
      "hasIntroPricing": true,
      "introPriceCents": 1111,
      "introInterval": "month",
      "introIterations": 1,
      "regularPriceCents": 2222,
      "regularInterval": "month"
    }
  ]
}
```

`prod_YOUR_CREEM_PRODUCT` must be a $22.22 every-month Creem product with a 14-day free trial. Start the checkout with `POST /api/payments/subscribe` and `{ "billingPlanId": "monthly" }`.

## Server-Authoritative Subscription Pricing

`POST /api/payments/subscribe` never accepts a browser-chosen amount, currency,
cadence, trial, price ID, or intro/renewal phase. It resolves the workspace's
editable `data/payment-config.json` catalog. Send `billingPlanId` to select a
registered plan. An unknown non-empty ID is rejected; omitting the selector uses
the configured default offer (or the sole plan only when no default price is
configured). `metadata.plan`, `metadata.planTier`, display names, and other
metadata are not plan selectors. Browser pricing fields cannot override the
canonical offer. There is no universal 7-day/$5 default; missing trial settings
normalize to zero.

## Quick Start

All payment requests — including reads of `/api/space-data/payment-config.json` — should include `X-App-Id: window.__APP_ID__ || window.__SPACE_ID__` so hosted mini-apps and compiled spaces both resolve the workspace correctly. Space pages are served with `Referrer-Policy: no-referrer`, so the server cannot fall back to the Referer header.

### 1. Create a Subscription (Configured Default)

```typescript
// Omitting billingPlanId selects this workspace's configured default offer.
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome',
    cancelUrl: window.location.href
  })
}).then(r => r.json());

// Redirect to Stripe Checkout
window.location.href = checkoutUrl;
```

### 2. Select a Registered Plan

```typescript
// "pro-monthly" must exist in data/payment-config.json.
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'pro-monthly',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

### 2b. Configure Canonical Plans

Edit workspace-owned `data/payment-config.json`, not the browser payload:

```json
{
  "currency": "eur",
  "plans": [
    {
      "id": "annual",
      "name": "Annual",
      "priceCents": 19000,
      "interval": "year",
      "intervalCount": 1,
      "trialDays": 0,
      "planTier": "pro",
      "accessDurationDays": 365
    },
    {
      "billingPlanId": "founding-monthly",
      "name": "Founding Monthly",
      "currency": "eur",
      "priceCents": 900,
      "interval": "month",
      "intervalCount": 1,
      "trialDays": 0,
      "hasIntroPricing": true,
      "introPriceCents": 900,
      "introInterval": "month",
      "introIntervalCount": 1,
      "introIterations": 12,
      "regularPriceCents": 1900,
      "regularInterval": "month",
      "regularIntervalCount": 1
    }
  ]
}
```

`billingPlanId` or `id` supplies the ID. A plan requires that ID plus
`priceCents` (or `priceId`). The example shows every optional canonical
pricing/access field. Both phase prices must be positive. Workspace code may
edit this catalog; browser code cannot override it.

### 2b1. Semiannual / Quarterly Subscription

Configure the cadence in the catalog as `interval` × `intervalCount`, then
select that plan by ID.

```typescript
// "semiannual" has interval: "month", intervalCount: 6 in the catalog.
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'semiannual',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

### 2b2. Non-USD Subscription

```typescript
// Currency and amount come from the registered "eur-monthly" plan.
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'eur-monthly',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

### 2d. Select Intro Pricing

```typescript
// Both phases are defined by this registered catalog plan.
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'founding-monthly',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

> **How intro pricing works:** The server reads both phases from the selected
> catalog plan. Request-body phase fields are ignored.

### 2e. Multi-Plan Selector (from payment config)

When payment config includes a `plans` array, use `createSubscriptionFromPlan()` to handle both standard and intro pricing plans:

```typescript
// Load config and render plans
const config = await stripePayments.loadConfig();
if (config?.plans) {
  for (const plan of config.plans) {
    // The helper sends only plan.id; the server resolves canonical terms.
    const { checkoutUrl } = await stripePayments.createSubscriptionFromPlan(plan, {
      customerEmail: 'customer@example.com',
    });
    window.location.href = checkoutUrl;
  }
}
```

### 2c. Subscription with Pre-Applied Promo Code

```typescript
// Pre-apply a promo code so the discount shows automatically at checkout
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'pro-monthly',
    customerEmail: 'customer@example.com',
    promoCode: 'promo_abc123', // Stripe promotion code ID
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

> **Note:** If you don't pass `promoCode`, customers will see a "Add promotion code" field on the Stripe checkout page where they can enter their own code. If you pass a `promoCode`, the discount is pre-applied and the promo field is hidden.

### 3. One-Time Payment

`POST /api/payments/checkout` is the customer-sale endpoint for one-time
storefront purchases. The platform classifies the payment server-side; do not
put `purpose: "customer_sale"` in custom metadata. When Stripe is the active
provider and the workspace has a usable connected merchant account, Stripe
collects there. Otherwise Stripe collects through the platform account and
credits the payment's verified net proceeds (after Stripe processing fees) to
the selling workspace's Wallet. If another native provider is selected, that
provider's own merchant flow remains in control and Stripe Wallet mirroring
does not apply.
Portfolio funding and workspace funding use their own dedicated endpoints and
are never inferred from this checkout.

```typescript
const { checkoutUrl } = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    amount: 4999, // $49.99
    productName: 'Premium Course',
    productDescription: 'Full access to all course materials',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/thank-you'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

### 3b. Inline checkout (Payment Element)

Hosted checkout (omit `uiMode`, or send `uiMode: "hosted"`) still returns
`checkoutUrl` and is unchanged. To render Stripe's Payment Element or Express
Checkout on your own page, send `uiMode: "elements"` from a server function via
`platform.fetch`. Inline mode is Stripe Connect only: it never falls back to
the platform account and never drops the application fee. Only the exact
value `"elements"` selects inline mode; any other value keeps hosted checkout,
as before. Subscriptions cannot use `elements`.

The response has no `checkoutUrl`. Confirm in the browser with the returned
`clientSecret`, `publishableKey`, and `stripeAccount`. Send `returnUrl` (not
`successUrl` / `cancelUrl`). Only a server function may set `idempotencyKey`,
so a refresh reuses the same session instead of minting another.

```javascript
// Server function `create-checkout` — platform.fetch is stamped as server
// context, so the amount below is trusted and the browser cannot change it.
if (!session?.id || !session?.email) {
  respond(401, { error: 'A verified workspace session is required' });
  return;
}
// returnUrl comes from the page; the platform only accepts this workspace's own
// domain or its Audos preview host.
const { orderId, returnUrl } = request.body;
const res = await platform.fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uiMode: 'elements',
    amount: 5000, // look the price up server-side; never take it from the body
    currency: 'usd',
    productName: 'Digital download',
    customerEmail: session.email,
    returnUrl, // e.g. `${location.origin}${location.pathname}?session_id={CHECKOUT_SESSION_ID}`
    idempotencyKey: `order-${orderId}`,
    metadata: { orderId },
  }),
});
const checkout = await res.json();
if (!res.ok || !checkout.success) {
  respond(res.status, { error: checkout.error, code: checkout.code });
  return;
}
respond(200, {
  clientSecret: checkout.clientSecret,
  publishableKey: checkout.publishableKey,
  stripeAccount: checkout.stripeAccount,
  sessionId: checkout.sessionId,
});
```

In the app, import Stripe.js from full `https://esm.sh/` URLs. Bare
specifiers such as `import { loadStripe } from '@stripe/stripe-js'` are
blocked at publish because browsers cannot resolve them. Keep
`?external=react,react-dom` on the React package so it shares the app's
React.

```tsx
import { useMemo, useState } from 'react';
import { loadStripe } from 'https://esm.sh/@stripe/stripe-js@10.1.0';
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from 'https://esm.sh/@stripe/react-stripe-js@7.0.0/checkout?external=react,react-dom';

type InlineCheckout = { clientSecret: string; publishableKey: string; stripeAccount: string };

function PayForm() {
  const state = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (state.type === 'loading') return <p>Loading secure payment…</p>;
  if (state.type === 'error') return <p role="alert">{state.error.message}</p>;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    // On success Stripe navigates to returnUrl; only failures come back here.
    const result = await state.checkout.confirm();
    if (result.type === 'error') {
      setError(result.error.message || 'Payment could not be completed.');
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); confirm(); }}>
      <ExpressCheckoutElement onConfirm={confirm} onCancel={() => setBusy(false)} />
      <PaymentElement />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || !state.checkout.canConfirm}>
        {busy ? 'Processing…' : 'Pay'}
      </button>
    </form>
  );
}

// `checkout` is the create-checkout server function's response.
export function InlinePayment({ checkout }: { checkout: InlineCheckout }) {
  const stripePromise = useMemo(
    () => loadStripe(checkout.publishableKey, { stripeAccount: checkout.stripeAccount }),
    [checkout.publishableKey, checkout.stripeAccount],
  );
  return (
    <CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
      <PayForm />
    </CheckoutElementsProvider>
  );
}
```

Never hardcode a publishable key or connected account id; both come from the
checkout response and follow the workspace's test or live mode. Mount
`InlinePayment` once per session; creating it again for the same order reuses
the session because of `idempotencyKey`. A success message in the browser is
not proof of payment.

Register an enabled server function named exactly `checkout-events` whose code
carries the `audos:checkout-events` marker (see below). The payload is a
notification, not proof of payment: re-verify with
`GET /api/payments/status/:sessionId?verify=server` before granting. A failed delivery
releases its claim so a later retry can run. The return page should call the
same idempotent grant, so a closed tab still unlocks.

### 3a. One-Time Purchase That Unlocks App Access

When a one-time purchase should also unlock the app for a while (a 1:1
session that comes with a free month, a workshop, a 30-day pass), register the
offer as a catalog plan in `data/payment-config.json` with `accessDurationDays`
and send its `billingPlanId` to `POST /api/payments/checkout`. Price, name and
duration come from the catalog, never from the browser.

```json
{ "id": "session-plus-month", "name": "1:1 Session + 30 days of access", "priceCents": 3000, "trialDays": 0, "accessDurationDays": 30 }
```

```typescript
const { checkoutUrl } = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'session-plus-month',
    customerEmail: signedInEmail || undefined,
    successUrl: window.location.origin + '/?booked=1'
  })
}).then(r => r.json());
```

When Stripe confirms payment, the platform webhook grants the buyer's email a
time-limited `manual_override` lasting `accessDurationDays` from the moment of
payment. `GET /api/space/:spaceId/subscription-status` reports it (with
`manualOverride.expiresAt`) and stops reporting it when it expires. Nothing on
the success page is needed: the grant does not depend on the buyer returning
to the app, and a redelivered webhook does not extend it.

- Send `customerEmail` when the buyer is signed in, so the access lands on the
  email they log in with. Otherwise it lands on the email typed at checkout.
- Promotion codes are off by default: the charged amount must equal the plan's
  price. To accept Stripe promotion codes on a plan, add
  `"allowPromotionCodes": true` to it. Checkout then shows Stripe's promo box,
  and a discount counts only when Stripe attributes all of it to a promotion
  code on the full plan price.
- If the buyer already has longer access (a comp or a longer grant), the
  purchase keeps it instead of shortening it.
- While the window is open it takes precedence over a subscription on the same
  email, so do not send `billingPlanId` for a buyer who already pays monthly.
- Applies to Stripe workspaces collecting through their connected account.

### 4. Digital Asset Delivery (Book Funnels, PDFs, Downloads)

When selling digital products (eBooks, playbooks, courses), pass a `digitalAssetKey` in the checkout metadata so the buyer automatically receives a download link in their confirmation email.

```typescript
const { checkoutUrl } = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    amount: 2700, // $27.00
    productName: 'The KingsCode Playbook',
    productDescription: 'Your complete guide to building a personal brand',
    customerEmail: 'buyer@example.com',
    successUrl: window.location.origin + '/thank-you',
    metadata: {
      digitalAssetKey: 'workspaces/<workspaceId>/books/kingscode-playbook.pdf',
      digitalAssetLabel: 'Download The KingsCode Playbook'
    }
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

**Metadata Fields for Digital Delivery:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `digitalAssetKey` | string | Recommended | GCS object path relative to the bucket (e.g., `workspaces/<id>/books/my-ebook.pdf`). Resolved server-side to a trusted `https://storage.googleapis.com/` URL. |
| `digitalAssetUrl` | string | Fallback | Full HTTPS URL to the asset. Only used if `digitalAssetKey` is not provided. Must be hosted on `storage.googleapis.com` — other domains are rejected for security. |
| `digitalAssetLabel` | string | No | Custom button text in the email (default: "Download Your Purchase"). |

> **Important:** Always prefer `digitalAssetKey` over `digitalAssetUrl`. The key is resolved server-side to a validated storage URL, which is more secure and less error-prone. Upload your PDF to GCS first (via the file-storage integration or directly), then reference the object path in checkout metadata.

**How it works:**
1. Pass `digitalAssetKey` in the `metadata` object when creating a checkout session
2. After successful payment, the Stripe webhook fires `checkout.session.completed`
3. The confirmation email is sent with a prominent "Download" button linking to the PDF
4. If no digital asset metadata is present, the confirmation email is sent as usual (no regression)

### Saved Payment Methods (Card on File)

These endpoints let a returning customer pay again without re-entering a card
and without a subscription. See the full guide in
[Saved Payment Methods (Card on File)](#saved-payment-methods-card-on-file).
All accept `{ email, sessionId }` on the JSON body for server-side identity.
`sessionId` must be a canonical verified workspace session — or, at
OTP-disabled workspaces, the authorized legacy registration session (the
server resolves the workspace's OTP policy per call). Never pass a raw
`contactId`.

### Server-side identity rule (important)

Identity is **always resolved server-side** from a verified canonical
workspace session. The contact is identified by `email`, `sessionId` must be
the verified `wses_...` session for that email, and the workspace is bound by
the `:appId` in the URL. A browser-generated landing registration ID is not
identity proof. The client never passes a raw `contactId`.

> All saved-card endpoints accept `{ email, sessionId }` on the JSON body.
> Both fields are required, and `sessionId` must be a canonical verified
> workspace session returned by successful OTP verification.

> **Both session policies work.** At OTP-enabled workspaces `sessionId` must be
> the verified session returned by OTP verification. At OTP-disabled workspaces
> the server also accepts the authorized legacy registration session
> (`verified: false`, `authorized: true`, `identityMode: "legacy_registration"`)
> for its own registration email. The server resolves the workspace's OTP
> policy on every call — the client never claims verification, and email
> mismatches, forged ids, and cross-workspace sessions are always refused.


### Endpoint Summary

| Endpoint | Purpose |
|----------|---------|
| `POST /api/landing/:appId/checkout` (with `savePaymentMethod: true`) | First checkout — saves the card while charging |
| `POST /api/landing/:appId/saved-cards/setup-intent` | Add a card without charging (Stripe Elements) |
| `POST /api/landing/:appId/saved-cards/list` | List the contact's saved cards (brand, last4, exp) |
| `POST /api/landing/:appId/saved-cards/charge` | One-click off-session charge against a saved card |
| `POST /api/landing/:appId/saved-cards/delete` | Detach a saved card |

> **Why is `list` a POST?** So the body can carry `{ email, sessionId }`
> without leaking them in URL query strings or referer logs.

### Working Example (setup → list → charge)

```typescript
// Step 1a — save the card WHILE charging on the first purchase
const { checkoutUrl } = await fetch(`/api/landing/${appId}/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'parent@example.com',
    sessionId,                    // canonical verified wses_ session
    amount: 999,                  // cents
    productName: 'Coin Pack',
    savePaymentMethod: true,      // ← saves the card on first checkout
    successUrl: window.location.origin + '/thanks',
    cancelUrl: window.location.href,
  }),
}).then(r => r.json());
window.location.href = checkoutUrl;

// Step 1b (alternative) — save a card WITHOUT charging, using Stripe Elements
const { clientSecret } = await fetch(`/api/landing/${appId}/saved-cards/setup-intent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'parent@example.com', sessionId }),
}).then(r => r.json());
// then on the client: await stripe.confirmCardSetup(clientSecret, { payment_method: { card } })

// Step 2 — later, list the contact's saved cards
const { cards } = await fetch(`/api/landing/${appId}/saved-cards/list`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'parent@example.com', sessionId }),
}).then(r => r.json());
// cards: [{ id: 'pm_...', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 }]
// (Expired cards are filtered out server-side.)

// Step 3 — one-click repeat charge against the saved card
const res = await fetch(`/api/landing/${appId}/saved-cards/charge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'parent@example.com',
    sessionId,
    paymentMethodId: cards[0].id,
    amount: 499,
    description: 'Coin Pack refill',
    metadata: { orderId: 'order_123' },
  }),
}).then(r => r.json());

if (res.success) {
  // res.paymentIntentId, res.status ('succeeded'), res.amount, res.currency
  // charge captured — Stripe email receipt sent automatically
} else if (res.requiresAction || res.code === 'requires_action') {
  // SCA needed — re-prompt the customer ON-SESSION with Stripe.js, then retry:
  //   await stripe.confirmCardPayment(res.clientSecret)
  // then call /saved-cards/charge again with the same body.
} else {
  // hard failure — res.error / res.code (see Error Codes below)
}

// Step 4 (optional) — detach a saved card
await fetch(`/api/landing/${appId}/saved-cards/delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'parent@example.com', sessionId, paymentMethodId: cards[0].id }),
}).then(r => r.json());
```

> ⚠️ **Always check the requires-action branch before treating a non-success
> as a hard failure.** An SCA-triggered card (`requires_action`) is
> *recoverable*: re-prompt the customer on-session with the returned
> `clientSecret` via `stripe.confirmCardPayment()`, then retry the same
> charge call. Only `code` values other than `requires_action` are true
> failures.

### Error Codes

The `charge`, `setup-intent`, `list`, and `delete` endpoints return a
structured error envelope `{ error, code }` (HTTP 4xx/5xx) for hard
failures. The off-session SCA case is returned as a normal HTTP 200 with
`success: false, code: "requires_action"` so it can be branched on without
parsing an error body.

| `code` | Meaning |
|--------|---------|
| `requires_action` | Card needs SCA — recover on-session via `confirmCardPayment(clientSecret)` then retry (HTTP 200, `success: false`). |
| `no_customer` | The contact has no saved cards / no Stripe Customer yet. |
| `payment_method_not_owned` | The `paymentMethodId` does not belong to this contact's saved cards. |
| `rate_limited` | Too many repeated charge failures in the rolling window — back off. |
| `invalid_input` | Missing/invalid fields (e.g. non-positive `amount`, missing `paymentMethodId`). |
| `stripe_error` | Upstream Stripe error (declines, network, etc.). |

## API Reference

### POST /api/payments/subscribe

Create a subscription checkout session.

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `priceId` | string | No | ignored | Configure it on the catalog plan |
| `productId` | string | No | - | Creem only: the founder's Creem product (`prod_…`) to reuse when the plan has no `priceId`. Its price, cadence and trial must match the plan; other providers ignore it |
| `priceCents`, `currency`, `trialDays`, `interval`, `intervalCount` | mixed | No | ignored | Browser pricing cannot override the canonical offer |
| `customerEmail` | string | No | - | Pre-fill customer email |
| `successUrl` | string | No | current page | Redirect after successful payment |
| `cancelUrl` | string | No | current page | Redirect if customer cancels |
| `metadata` | object | No | - | Custom metadata for the subscription |
| `promoCode` | string | No | - | Stripe promotion code ID (promo_xxx) to pre-apply a discount. If not provided, customers can enter their own promo code at checkout |
| `introPriceCents`, `introInterval`, `introIntervalCount`, `introIterations` | mixed | No | ignored | Configure the intro phase on the catalog plan |
| `regularPriceCents`, `regularInterval`, `regularIntervalCount` | mixed | No | ignored | Configure the renewal phase on the catalog plan |
| `billingPlanId` | string | No | configured default | Canonical selector. Unknown IDs are rejected; omission selects the configured default |
| `billingPlanName` | string | No | ignored | Display text is not a selector |

**Response:**
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_...",
  "mode": "platform",
  "trialDays": 0,
  "priceCents": 1900
}
```

#### Billing cadence: interval × intervalCount

The billing cycle is **`interval` × `intervalCount`**, not a fixed list of
plans. `interval` is the base unit and `intervalCount` multiplies it, so you
can bill on any cadence — don't assume only monthly and annual exist.

| Cadence | `interval` | `intervalCount` |
|---------|------------|-----------------|
| Weekly | `'week'` | `1` (or omit) |
| Every 2 weeks | `'week'` | `2` |
| Monthly | `'month'` | `1` (or omit) |
| **Quarterly (every 3 months)** | `'month'` | `3` |
| **Semiannual (every 6 months)** | `'month'` | `6` |
| Annual | `'year'` | `1` (or omit) |
| Biannual (every 2 years) | `'year'` | `2` — ❌ rejected, exceeds Stripe's 1-year cap |

**Stripe limit:** a recurring billing cycle can't be longer than one year.
The maximum valid combinations are `month` × 12 or `year` × 1; anything longer
(e.g. `year` × 2 for a true biannual plan) is rejected by Stripe. Use a
1-year cycle instead.

**Example — semiannual subscription ($60 billed every 6 months):**
```typescript
const { checkoutUrl } = await fetch('/api/payments/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
  body: JSON.stringify({
    billingPlanId: 'semiannual',
    customerEmail: 'customer@example.com',
    successUrl: window.location.origin + '/welcome'
  })
}).then(r => r.json());

window.location.href = checkoutUrl;
```

### POST /api/payments/checkout

Create a one-time customer-sale checkout session. Customer-sale classification,
workspace ownership, collection mode, and wallet attribution are stamped by the
server; custom `metadata.purpose` values are ignored. Connected Stripe is
preferred, with verified net proceeds credited to the selling workspace Wallet
when collection falls back to the platform account. Other active native
providers retain their own merchant settlement behavior.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount in cents ($49.99 = 4999). Optional on Creem when `productId` is sent |
| `productName` | string | No | Name shown in checkout |
| `productDescription` | string | No | Description shown in checkout |
| `productId` | string | No | Creem only: sell this one-time Creem product (`prod_…`) at its Creem price. A recurring product is rejected with a 400 — use `/api/payments/subscribe`. Other providers ignore it |
| `currency` | string | No | Default: 'usd' |
| `customerEmail` | string | No | Pre-fill customer email |
| `successUrl` | string | No | Redirect after success (hosted only) |
| `cancelUrl` | string | No | Redirect if cancelled (hosted only) |
| `returnUrl` | string | When `uiMode` is `"elements"` | Stripe `return_url` after Payment Element confirm. Do not send `successUrl` / `cancelUrl` |
| `uiMode` | string | No | `"elements"` for inline checkout (one-time, Stripe Connect only). Omitted or any other value keeps hosted checkout |
| `idempotencyKey` | string | No | Server functions only. 8–200 characters of letters, digits, `_`, `-`, `:`, or `.`. Scoped to the workspace so a refresh reuses the session |
| `metadata` | object | No | Custom metadata |

**Response (hosted, default):**
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_...",
  "mode": "platform"
}
```

**Response (`uiMode: "elements"`):**
```json
{
  "success": true,
  "uiMode": "elements",
  "sessionId": "cs_...",
  "clientSecret": "cs_..._secret_...",
  "publishableKey": "pk_test_...",
  "stripeAccount": "acct_...",
  "livemode": false,
  "mode": "connect"
}
```

Inline checkout never falls back to the platform Stripe account and never
retries without the application fee. Load Stripe.js with `loadStripe(publishableKey, { stripeAccount })` and confirm with `clientSecret`. Do not embed a publishable key in the app.

### GET /api/payments/status/:sessionId

Check the status of a payment session. Send `X-App-Id: window.__APP_ID__ ||
window.__SPACE_ID__` (or `X-Workspace-Id`) on every poll — without a resolvable
workspace identity the endpoint returns **400** `missing_app_id` instead of a
misleading 500.

**Response:**
```json
{
  "status": "complete",
  "paymentStatus": "paid",
  "customerEmail": "customer@example.com",
  "amountTotal": 500,
  "currency": "usd",
  "mode": "subscription"
}
```

A server function that adds `?verify=server` (through `platform.fetch`) gets
an ownership-checked read: another workspace's session is a `404`, and the
response also has `sessionId`, `metadata`, `livemode`, `paymentIntentStatus`,
and `uiMode`. Without the flag the response is unchanged. The flag is refused
from a browser. The execute URL of
`checkout-events` is public, so treat the push as a notification and
re-verify here before granting.

### GET /api/payments/list

List payments filtered by workspace or space. Use for internal admin tools.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Conditional | Filter by workspace ID |
| `spaceId` | string | Conditional | Filter by space ID |
| `configId` | string | Conditional | Filter by config ID |
| `limit` | number | No | Max results (default 100) |

At least one of `workspaceId`, `spaceId`, or `configId` is required.

**Response:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "pi_abc123",
      "amount": 4999,
      "currency": "usd",
      "status": "succeeded",
      "customerEmail": "customer@example.com",
      "created": "2025-01-06T12:00:00.000Z",
      "paymentMode": "platform"
    }
  ],
  "total": 1
}
```

### GET /api/payments/subscriptions

List subscriptions filtered by workspace or space.

**Query Parameters:** Same as `/api/payments/list`

**Date semantics:** `created` is the original subscription creation/signup timestamp. `currentPeriodStart` is the current billing period start and advances on renewal; do not label it as a new signup date in dashboards. `currentPeriodEnd` is the period end/renewal boundary.

For Stripe Connect admin dashboards, prefer `/api/stripe-connect/subscriptions`: it returns `customerEmail`, `customerName`, `created_iso`, `current_period_start_iso`, `current_period_end_iso`, latest invoice fields, and cursor pagination so dashboards do not need to join subscriptions against a partial customers page.

Both lists preserve Stripe's raw `cancel_at_period_end` flag and expose
`cancel_at` (Unix seconds or null), `cancel_at_iso` (ISO timestamp or null),
and `cancellation_scheduled`. The native list also exposes `cancelAt` (ISO)
and `cancellationScheduled`, alongside its existing `cancelAtPeriodEnd`.

A subscription can have `cancel_at_period_end: false` and still be scheduled
to end through `cancel_at`. Use the derived schedule field for cancellation
banners and renewal notices; use `cancel_at` as the effective end date when
present. A cancellation date by itself does not revoke access. Wait for the
provider's terminal status; canceled or incomplete-expired subscriptions have
`cancellation_scheduled: false` even when historical dates remain.

**Response:**
```json
{
  "success": true,
  "subscriptions": [
    {
      "id": "sub_abc123",
      "status": "active",
      "currentPeriodStart": "2025-01-01T00:00:00.000Z",
      "currentPeriodEnd": "2025-02-01T00:00:00.000Z",
      "cancelAtPeriodEnd": false,
      "cancelAt": null,
      "cancellationScheduled": false,
      "cancel_at": null,
      "cancel_at_iso": null,
      "cancel_at_period_end": false,
      "cancellation_scheduled": false,
      "customerEmail": "customer@example.com",
      "created": "2025-01-01T00:00:00.000Z",
      "paymentMode": "connect"
    }
  ],
  "total": 1
}
```

### Saved Payment Methods (Card on File)

These endpoints let a returning customer pay again without re-entering a card
and without a subscription. See the full guide in
[Saved Payment Methods (Card on File)](#saved-payment-methods-card-on-file).
All accept `{ email, sessionId }` on the JSON body for server-side identity.
`sessionId` must be a canonical verified workspace session — or, at
OTP-disabled workspaces, the authorized legacy registration session (the
server resolves the workspace's OTP policy per call). Never pass a raw
`contactId`.

#### POST /api/landing/:appId/saved-cards/setup-intent

Create a SetupIntent so the client can attach a card with Stripe Elements
(no charge). Confirm the returned `clientSecret` with
`stripe.confirmCardSetup()`.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Contact email (identity) |
| `sessionId` | string | Yes | Canonical verified `wses_...` session |

**Response:**
```json
{
  "clientSecret": "seti_..._secret_...",
  "setupIntentId": "seti_...",
  "customerId": "cus_..."
}
```

#### POST /api/landing/:appId/saved-cards/list

List the contact's saved cards. Expired cards are filtered out server-side.

**Request Body:** `{ email, sessionId }` (both required)

**Response:**
```json
{
  "cards": [
    { "id": "pm_...", "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2028 }
  ]
}
```

#### POST /api/landing/:appId/saved-cards/charge

One-click off-session charge against a saved card. Funds settle on the
workspace's connected Stripe account.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Contact email (identity) |
| `sessionId` | string | Yes | Canonical verified `wses_...` session |
| `paymentMethodId` | string | Yes | A `pm_...` id from `/saved-cards/list` |
| `amount` | number | Yes | Amount in cents (positive integer) |
| `currency` | string | No | Defaults to the workspace currency |
| `description` | string | No | Statement / receipt description |
| `metadata` | object | No | Custom key/value metadata |
| `returnUrl` | string | No | URL Stripe uses for SCA redirects if required |

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "paymentIntentId": "pi_...",
  "status": "succeeded",
  "amount": 499,
  "currency": "usd"
}
```

**Requires-Action Response (HTTP 200 — recoverable, NOT a hard failure):**
```json
{
  "success": false,
  "code": "requires_action",
  "paymentIntentId": "pi_...",
  "clientSecret": "pi_..._secret_...",
  "status": "requires_action",
  "message": "Card requires customer authentication..."
}
```
Re-prompt the customer on-session with `stripe.confirmCardPayment(clientSecret)`,
then retry the same charge call. Hard failures return `{ error, code }` with a
4xx/5xx status (see [Error Codes](#error-codes)).

#### POST /api/landing/:appId/saved-cards/delete

Detach a saved card from the contact.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Contact email (identity) |
| `sessionId` | string | Yes | Canonical verified `wses_...` session |
| `paymentMethodId` | string | Yes | The `pm_...` id to detach |

**Response:**
```json
{ "success": true, "paymentMethodId": "pm_..." }
```

## Space-Level Payment Tracking

To track payments at the space level (for multi-space workspaces), pass `spaceId` when creating checkouts:

```typescript
// With spaceId for filtering
const { checkoutUrl } = await fetch('/api/payments/checkout?spaceId=my-space-id', {
  method: 'POST',
  body: JSON.stringify({ amount: 2999, productName: 'My Product' })
}).then(r => r.json());

// Or in metadata
const { checkoutUrl } = await fetch('/api/payments/checkout', {
  method: 'POST',
  body: JSON.stringify({
    amount: 2999,
    metadata: { spaceId: 'my-space-id' }
  })
}).then(r => r.json());
```

## Payment Configuration

The workspace's editable payment configuration is available at
`data/payment-config.json`. Values below are illustrative, not platform
defaults:

```json
{
  "enabled": true,
  "mode": "platform",
  "stripeAccountId": null,
  "platformFeeBps": 500,
  "currency": "USD",
  "businessName": "My Business",
  "supportEmail": "support@example.com",
  "defaultTrialDays": 0,
  "defaultPriceCents": 1900,
  "defaultInterval": "month",
  "defaultPriceId": null
}
```

### Config Fields

| Field | Description |
|-------|-------------|
| `enabled` | Always true - payments always available |
| `mode` | 'platform' (default) or 'connect' (after Stripe setup) |
| `stripeAccountId` | Connected Stripe account ID (null in platform mode) |
| `platformFeeBps` | Platform fee in basis points (500 = 5%) |
| `defaultTrialDays` | Default-offer trial period; missing means 0 |
| `defaultPriceCents` | Canonical default-offer amount; no universal amount |
| `defaultInterval` | Default billing interval: 'month' (default), 'year', 'week', or 'day' |

## Upgrading to Stripe Connect

To receive payments directly into your own Stripe account:

1. Go to your Workspace dashboard
2. Click on "Wallet"
3. Click "Accept Payments" or "Connect Stripe"
4. Complete the Stripe Connect onboarding
5. Once approved, your Space switches to Connect mode

**Benefits of Connect mode:**
- Payments deposited directly to your bank account
- Your brand on customer receipts
- Full access to Stripe Dashboard
- Manage refunds and disputes directly

## Installation Helper

```javascript
// Stripe Payments Helper
export const stripePayments = {
  config: null,

  async loadConfig() {
    if (this.config) return this.config;
    
    try {
      // Always send X-App-Id: space pages are served with
      // Referrer-Policy: no-referrer, so the server cannot resolve the
      // space from the Referer header.
      const appId = window.__APP_ID__ || window.__SPACE_ID__;
      const response = await fetch('/api/space-data/payment-config.json', {
        headers: appId ? { 'X-App-Id': appId } : {}
      });
      if (response.ok) {
        this.config = await response.json();
      }
    } catch (e) {
      console.warn('Payment config not found');
    }
    return this.config;
  },

  async isEnabled() {
    const config = await this.loadConfig();
    return config?.enabled === true;
  },

  async createSubscription(options = {}) {
    const response = await fetch('/api/payments/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
      body: JSON.stringify({
        billingPlanId: options.billingPlanId,
        promoCode: options.promoCode,
        successUrl: options.successUrl || window.location.origin + '/success',
        cancelUrl: options.cancelUrl || window.location.href,
        customerEmail: options.customerEmail,
        metadata: options.metadata
      })
    });
    return response.json();
  },

  async createCheckout(options) {
    const response = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__ },
      body: JSON.stringify({
        amount: options.amount,
        productName: options.productName,
        productDescription: options.productDescription,
        currency: options.currency || 'usd',
        successUrl: options.successUrl || window.location.origin + '/success',
        cancelUrl: options.cancelUrl || window.location.href,
        customerEmail: options.customerEmail,
        metadata: options.metadata
      })
    });
    return response.json();
  },

  async getPaymentStatus(sessionId) {
    const appId = window.__APP_ID__ || window.__SPACE_ID__;
    const response = await fetch(`/api/payments/status/${sessionId}`, {
      headers: appId ? { 'X-App-Id': appId } : {},
    });
    return response.json();
  },

  redirectToCheckout(checkoutUrl) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = checkoutUrl;
        return;
      }
    } catch (_) { /* cross-origin iframe */ }
    window.location.href = checkoutUrl;
  }
};
```

## Use Cases

- SaaS subscriptions with free trials
- Course or content access
- Membership sites
- Digital product sales
- Service booking payments
- Donation collection
- Event ticket sales
- **Repeat purchases without re-entering a card** — "Buy Now" flows,
  coin/credit top-ups, in-app purchases, one-click reorders. Use
  [Saved Payment Methods (Card on File)](#saved-payment-methods-card-on-file)
  instead of forcing a subscription or a full Checkout every time.

## Coupon & Promo Code Management (Connect Mode Only)

Create and manage discount coupons and promotional codes for your Stripe Connect account.

**Note:** These endpoints only work for workspaces with Stripe Connect set up (not platform mode).

### GET /api/stripe-connect/coupons

List all coupons and promo codes for your connected Stripe account.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Your workspace ID |
| `limit` | number | No | Max results (default 20) |

**Response:**
```json
{
  "coupons": [
    {
      "id": "SAVE20",
      "name": "20% Off",
      "percentOff": 20,
      "amountOff": null,
      "currency": null,
      "duration": "once",
      "durationInMonths": null,
      "valid": true
    }
  ],
  "promotionCodes": [
    {
      "id": "promo_abc123",
      "code": "SUMMER2026",
      "couponId": "SAVE20",
      "active": true,
      "maxRedemptions": 100,
      "timesRedeemed": 5,
      "expiresAt": "2026-08-31T23:59:59.000Z"
    }
  ]
}
```

### POST /api/stripe-connect/coupons

Create a new coupon.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspaceId` | string | Yes | Your workspace ID |
| `name` | string | Yes | Display name for the coupon |
| `percentOff` | number | Conditional | Percentage discount (1-100). Either percentOff or amountOff required |
| `amountOff` | number | Conditional | Fixed amount discount in cents. Either percentOff or amountOff required |
| `currency` | string | Conditional | Required if using amountOff (e.g., 'usd') |
| `duration` | string | Yes | 'once', 'repeating', or 'forever' |
| `durationInMonths` | number | Conditional | Required if duration is 'repeating' |
| `maxRedemptions` | number | No | Maximum number of times coupon can be used |
| `redeemBy` | string | No | ISO date after which coupon expires |

**Example - Percentage Discount:**
```typescript
const response = await fetch('/api/stripe-connect/coupons', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: 'your-workspace-id',
    name: '20% Off First Month',
    percentOff: 20,
    duration: 'once'
  })
});
const coupon = await response.json();
```

**Example - Fixed Amount Discount:**
```typescript
const response = await fetch('/api/stripe-connect/coupons', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: 'your-workspace-id',
    name: '$10 Off',
    amountOff: 1000, // $10.00 in cents
    currency: 'usd',
    duration: 'once'
  })
});
```

**Response:**
```json
{
  "id": "SAVE20",
  "name": "20% Off First Month",
  "percentOff": 20,
  "amountOff": null,
  "currency": null,
  "duration": "once",
  "durationInMonths": null,
  "valid": true
}
```

### POST /api/stripe-connect/promo-codes

Create a promotional code for an existing coupon. Promo codes are shareable codes that apply a coupon.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workspaceId` | string | Yes | Your workspace ID |
| `couponId` | string | Yes | ID of the coupon to attach |
| `code` | string | No | Custom code (auto-generated if not provided) |
| `maxRedemptions` | number | No | Maximum uses for this promo code |
| `firstTimeOnly` | boolean | No | Only valid for first-time customers |
| `minimumAmount` | number | No | Minimum order amount in cents |
| `expiresAt` | string | No | ISO date when promo code expires |

**Example:**
```typescript
const response = await fetch('/api/stripe-connect/promo-codes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspaceId: 'your-workspace-id',
    couponId: 'SAVE20',
    code: 'SUMMER2026',
    maxRedemptions: 100,
    expiresAt: '2026-08-31T23:59:59.000Z'
  })
});
```

**Response:**
```json
{
  "id": "promo_abc123",
  "code": "SUMMER2026",
  "couponId": "SAVE20",
  "active": true,
  "maxRedemptions": 100,
  "expiresAt": "2026-08-31T23:59:59.000Z"
}
```

### DELETE /api/stripe-connect/coupons/:couponId

Delete a coupon. This also invalidates any promo codes using this coupon.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Your workspace ID |

**Example:**
```typescript
await fetch('/api/stripe-connect/coupons/SAVE20?workspaceId=your-workspace-id', {
  method: 'DELETE'
});
```

**Response:**
```json
{
  "success": true,
  "deleted": "SAVE20"
}
```

## Server-Side Subscription Verification

The platform automatically tracks subscription status via Stripe webhooks. When a customer completes checkout, their subscription status is stored server-side in the CRM contact metadata.

### GET /api/space/:spaceId/subscription-status

Check a customer's subscription status by email. This is the **recommended way** to verify subscription access.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | Customer's email address |
| `sessionId` | string | Yes | Matching canonical `wses_...` session (verified, or legacy-authorized at OTP-disabled workspaces) |

**Response (contact found):**
```json
{
  "status": "registered",
  "planTier": null,
  "trialDaysRemaining": 4,
  "trialDays": 7,
  "trialExpired": false,
  "trialStartDate": "2026-08-02T13:43:02.740Z",
  "hasPaymentMethod": false,
  "subscriptionId": null,
  "subscriptionStatus": null,
  "cancelAtPeriodEnd": false,
  "cancelAt": null,
  "cancellationScheduled": false,
  "currentPeriodEnd": null,
  "manualOverride": null,
  "contactId": "contact-uuid"
}
```

**Scheduled cancellations** — three fields describe them, and access is NOT
affected by any of them (access ends only when `status` becomes `canceled`):

| Field | Meaning |
|-------|---------|
| `cancellationScheduled` | **Read this one.** `true` when a still-active subscription will end — set by EITHER a period-end cancellation OR a dated one. Always `false` once `status` is `canceled`. |
| `cancelAt` | ISO date when Stripe holds an explicit end date (`cancel_at`). Cancellations made on Stripe's hosted Customer Portal arrive this way, with `cancelAtPeriodEnd: false`. `null` otherwise. |
| `cancelAtPeriodEnd` | Stripe's raw period-end flag (self-service cancel, admin cancel). Kept for backward compatibility — do not use it alone to detect a scheduled cancellation. |
| `currentPeriodEnd` | ISO end of the current billing period — the paid-through date. Show `cancelAt ?? currentPeriodEnd` as the "ends on" date. |

A reversal clears `cancelAt` and flips `cancellationScheduled` back to `false`
on the next read. Which reversal applies depends on how it was scheduled:
`/api/payments/subscription/resume` undoes a period-end cancellation
(`cancelAtPeriodEnd: true`); a dated Portal cancellation (`cancelAt` set,
`cancelAtPeriodEnd: false`) is reported as already active by that endpoint and
must be undone by the customer in the Stripe Customer Portal — hand them a
portal link (`POST /api/payments/portal/request-link`) for that. Example of a Portal cancellation, still active
until Oct 3:

```json
{ "status": "active", "subscriptionStatus": "active", "cancelAtPeriodEnd": false,
  "cancelAt": "2026-10-03T21:25:44.000Z", "cancellationScheduled": true,
  "currentPeriodEnd": "2026-10-03T21:25:44.000Z" }
```

**Response (no contact for this email):** HTTP 200 with a short object — the
trial and subscription fields are **absent**, not null:
```json
{ "status": "not_registered", "message": "Customer not registered" }
```

Treat every field except `status` as possibly absent. `trialDaysRemaining` is
whole days left, **rounded up and clamped at 0** (a trial 3 days 17 hours from
its end reports `4`) — use this server value for countdowns instead of
recomputing locally.

> **`trialEndDate` is NOT part of this response** — for any status, including
> Stripe-backed `trialing`. It exists only as contact metadata (set when
> Stripe supplies `trial_end`; card-less trials never have it) and is consumed
> server-side. Read the server-computed `trialDaysRemaining` / `trialExpired`
> instead of parsing trial dates client-side.

**Status Values:**
| Status | Description |
|--------|-------------|
| `active` | Subscription is active and paid |
| `trialing` | Customer is in a Stripe trial (card on file) |
| `registered` | Customer registered WITHOUT a card — no Stripe subscription. A card-less trial returns this while its window is still running (`trialExpired: false`); once the window lapses the status becomes `trial_expired` |
| `trial_expired` | Trial ended, no active subscription |
| `canceled` | Subscription was canceled |
| `past_due` | Payment failed, subscription at risk |
| `incomplete` | Initial payment failed or pending |
| `not_registered` | No contact found for this email |
| `manual_override` | Access granted manually by the founder |

**Example Usage:**
```typescript
async function checkSubscriptionStatus(email: string, sessionId: string) {
  const spaceId = window.SPACE_ID; // Injected by platform
  const response = await fetch(
    `/api/space/${spaceId}/subscription-status?email=${encodeURIComponent(email)}&sessionId=${encodeURIComponent(sessionId)}`
  );
  const data = await response.json();
  
  switch (data.status) {
    case 'active':
      return { hasAccess: true, message: 'Full access' };
    case 'trialing':
      return { hasAccess: true, message: `${data.trialDaysRemaining} days left in trial` };
    case 'registered':
      // Card-less registration/trial. NOT a denial state — decide by trial flags,
      // or every no-card trial user gets locked out.
      if (!data.trialExpired) {
        return { hasAccess: true, message: `${data.trialDaysRemaining} days left in trial` };
      }
      return { hasAccess: false, message: 'Trial expired - please subscribe' };
    case 'trial_expired':
      return { hasAccess: false, message: 'Trial expired - please subscribe' };
    case 'canceled':
      return { hasAccess: false, message: 'Subscription canceled' };
    case 'past_due':
      return { hasAccess: false, message: 'Payment failed - please update payment method' };
    default:
      return { hasAccess: false, message: 'Please register' };
  }
}
```

### Example: useSubscription Hook

Here's an example React hook pattern for subscription state management (adapt to your needs):

```typescript
// hooks/useSubscription.ts (example implementation)
import { useState, useEffect, useCallback } from 'react';

export function useSubscription(email: string | null, sessionId: string | null) {
  const [status, setStatus] = useState<string>('loading');
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);
  // Scheduled cancellation (period-end OR Portal date) — informational only,
  // access stays granted until status becomes 'canceled'.
  const [cancellationScheduled, setCancellationScheduled] = useState(false);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!email || !sessionId) return;
    setIsLoading(true);
    try {
      const spaceId = (window as any).SPACE_ID;
      const res = await fetch(
        `/api/space/${spaceId}/subscription-status?email=${encodeURIComponent(email)}&sessionId=${encodeURIComponent(sessionId)}`
      );
      const data = await res.json();
      setStatus(data.status);
      setTrialDaysRemaining(data.trialDaysRemaining || 0);
      setTrialExpired(data.trialExpired === true);
      setCancellationScheduled(data.cancellationScheduled === true);
      setEndsOn(data.cancelAt || data.currentPeriodEnd || null);
    } finally {
      setIsLoading(false);
    }
  }, [email, sessionId]);

  useEffect(() => { refetch(); }, [refetch]);

  // 'registered' = card-less trial still inside its window (a lapsed one
  // comes back as 'trial_expired'); 'trialing' can be passed through stale
  // past its recorded end. Both therefore gate on trialExpired as well.
  const hasAccess =
    ['active', 'manual_override'].includes(status) ||
    (['trialing', 'registered'].includes(status) && !trialExpired);
  
  return { status, trialDaysRemaining, hasAccess, cancellationScheduled, endsOn, isLoading, refetch };
}

// Usage in component
function PremiumContent() {
  const { status, trialDaysRemaining, hasAccess, cancellationScheduled, endsOn, isLoading } =
    useSubscription(userEmail, canonicalSessionId);

  if (isLoading) return <div>Loading...</div>;

  // Still has access — just tell them when it ends.
  const cancelNotice = cancellationScheduled && endsOn
    ? <p>Your plan ends on {new Date(endsOn).toLocaleDateString()}.</p>
    : null;
  
  if (!hasAccess) {
    return (
      <div>
        <p>Subscribe to access premium content</p>
        <button onClick={() => startSubscription()}>Subscribe Now</button>
      </div>
    );
  }

  return <div>{cancelNotice}Premium content here...</div>;
}
```


## Subscription Lifecycle Events → Server Function

Cancellations, renewals and plan changes can be pushed to one of the
workspace's server functions, so grace periods, in-app banners and win-back
emails react the moment they happen instead of on a polling delay. This covers
a cancellation made on the provider's hosted billing page with nobody using the
product, and it works whether the workspace sells through the platform's
merchant account or its own connected account.

## Administrator subscription cancellation

### POST /api/payments/subscription/admin-cancel

<!-- MANIFEST:ENDPOINT POST /api/payments/subscription/admin-cancel | Server function cancels a workspace subscription after authenticating an app administrator -->

Call this endpoint from an enabled workspace server function after the function
has authenticated the caller's app session and verified their administrator
role against authoritative app data. The runner supplies signed workspace and
function scope for this native request. Browser requests, founder tokens, and
SDK tokens do not authorize it.

The `actor` object identifies the authenticated administrator for the audit
trail. It is not proof of authorization. Never forward a browser's claimed role
or actor without verifying the app session and role in your function first.

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `subscriptionId` | string | Yes | Stripe `sub_...` reference belonging to this workspace |
| `immediate` | boolean | No | Default false schedules cancellation at period end; true ends it immediately |
| `actor` | object | Yes | Verified administrator `email`, with optional app-user `id` |
| `requestId` | UUID string | No | Retain the same value when retrying the same action |
| `reason` | string | No | Audit note, at most 500 characters |

The body is strict: do not pass `workspaceId`, `customerEmail`, `sessionId`,
or `role`. Workspace scope comes from the signed server context. The platform
also checks the subscription's workspace metadata before any Stripe write.
Unknown subscriptions and subscriptions outside this workspace receive the
same refusal.

An existing cancellation schedule, including a date-only `cancel_at`, is a
successful no-op for the default mode. An explicit immediate cancellation can
still end a scheduled subscription.

```json
{
  "success": true,
  "requestId": "1c0b4d77-0c43-4595-8b8e-49d3febac730",
  "alreadyApplied": true,
  "message": "The subscription was already set to end on October 3, 2026.",
  "subscription": {
    "id": "sub_abc123",
    "status": "active",
    "cancelAtPeriodEnd": false,
    "cancelAt": "2026-10-03T21:25:44.000Z",
    "cancellationScheduled": true,
    "currentPeriodEnd": "2026-10-03T21:25:44.000Z",
    "canceledAt": null,
    "planLabel": null
  }
}
```

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `invalid_request` | Invalid or unexpected body fields |
| 403 | `server_context_required` | Missing valid workspace-function context |
| 404 | `workspace_not_found` | The signed workspace is unavailable |
| 404 | `subscription_not_available` | Subscription is unavailable in this workspace |
| 429 | `subscription_action_throttled` | Retry after the action limit expires |
| 503 | `subscription_audit_unavailable` | Audit intent could not persist; no provider write was attempted |
| 503 | `subscription_action_unavailable` | Re-read provider state and retry the same request ID if needed |

After a confirmed Stripe change, a mirror or audit-outcome failure does not
turn success into a failed action. Subscription events and reconciliation
refresh app state. Keep paid access while the provider reports a nonterminal
subscription; do not downgrade from a local cancellation date alone.

## Cancel / Un-cancel a Subscription (customer-initiated)

A signed-in customer can stop — and un-stop — their own subscription **inside
your app**. One confirm, no redirect to Stripe's hosted billing page, no "check
your email" hop. Use this for a "Cancel my subscription" button on an account
screen, or for a one-click link in a renewal-reminder email.

The hosted billing portal (`POST /api/payments/portal/request-link`) is
unchanged and stays as the fallback for callers who have **no** verified
session.

### Authentication — read this first

These are money-affecting writes on a public route, so both endpoints require a
**verified space session** — the same identity
`GET /api/space/:spaceId/subscription-status` uses. Present it in any one of
three ways:

- `sessionId` on the JSON body,
- the `X-Session-Id` header, or
- the signed space-session cookie (the browser sends it automatically).

`customerEmail` is optional and is only ever checked *against* the session — it
is never an identity on its own. After the session is resolved, the server
proves the subscription belongs to that exact customer in this workspace before
it touches Stripe. Always send `X-App-Id` so the workspace resolves.

### POST /api/payments/subscription/cancel

<!-- MANIFEST:ENDPOINT POST /api/payments/subscription/cancel | Customer cancels their own subscription (defaults to end of paid period) -->

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscriptionId` | string | Yes | The `sub_...` id from the subscription-status read |
| `sessionId` | string | Conditional | Verified session id (omit if sending `X-Session-Id` or relying on the cookie) |
| `customerEmail` | string | No | Checked against the session; never trusted alone |
| `immediate` | boolean | No | `true` ends the subscription right now. **Default is `false`** — the customer keeps access until the end of the period they already paid for |

**Response:**
```json
{
  "success": true,
  "alreadyApplied": false,
  "message": "The Reknew Monthly subscription stays active until September 24, 2026 and will not renew.",
  "subscription": {
    "id": "sub_abc123",
    "status": "active",
    "cancelAtPeriodEnd": true,
    "currentPeriodEnd": "2026-09-24T00:00:00.000Z",
    "canceledAt": null,
    "planLabel": "Reknew Monthly"
  }
}
```

Show `message` to the customer — it already names the paid-through date.

Cancelling twice is safe: the second call returns `alreadyApplied: true` with
the same subscription shape instead of an error.

### POST /api/payments/subscription/resume

<!-- MANIFEST:ENDPOINT POST /api/payments/subscription/resume | Customer undoes a scheduled cancellation -->

Undo a scheduled cancellation. Same body minus `immediate`.

```json
{
  "success": true,
  "alreadyApplied": false,
  "message": "The Reknew Monthly subscription is active again and will renew on September 24, 2026.",
  "subscription": {
    "id": "sub_abc123",
    "status": "active",
    "cancelAtPeriodEnd": false,
    "currentPeriodEnd": "2026-09-24T00:00:00.000Z",
    "planLabel": "Reknew Monthly"
  }
}
```

A subscription that has **already ended** cannot be resumed — that is a new
purchase. Send the customer back through `/api/payments/subscribe`.

### Working example

```tsx
async function subscriptionAction(
  action: 'cancel' | 'resume',
  subscriptionId: string,
  sessionId: string,
  immediate = false,
) {
  const res = await fetch(`/api/payments/subscription/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__,
      'X-Session-Id': sessionId,
    },
    credentials: 'include',
    body: JSON.stringify({ subscriptionId, ...(immediate ? { immediate: true } : {}) }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data;
}

function ManageSubscription({ subscriptionId, sessionId, refetchStatus }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const run = async (action: 'cancel' | 'resume') => {
    if (action === 'cancel' && !confirm('Cancel your subscription at the end of this billing period?')) return;
    setBusy(true);
    try {
      const { message } = await subscriptionAction(action, subscriptionId, sessionId);
      setNotice(message);
      await refetchStatus(); // the status read reflects the change immediately
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button disabled={busy} onClick={() => run('cancel')}>Cancel my subscription</button>
      <button disabled={busy} onClick={() => run('resume')}>Keep my subscription</button>
      {notice && <p>{notice}</p>}
    </div>
  );
}
```

The next `GET /api/space/:spaceId/subscription-status` call already reflects the
change — `cancelAtPeriodEnd` / `cancelAt` / `cancellationScheduled` flip
immediately, with no wait for a Stripe webhook. The webhook still arrives later
and remains the source of truth. (`/resume` only lifts a period-end
cancellation; a dated Portal cancellation is reversed in the Portal itself and
reaches the status read through the webhook.)


### Error codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `invalid_request` | No `subscriptionId` on the body |
| 400 | `workspace_not_resolved` | No `X-App-Id` / resolvable workspace on the request |
| 401 | `subscription_signin_required` | No verified session, or the session is not this subscriber. Fall back to `/api/payments/portal/request-link` |
| 404 | `subscription_not_available` | The subscription does not exist, is not this customer's, or belongs to another workspace. **All three answer identically** — do not try to tell them apart |
| 429 | `subscription_action_throttled` | Too many subscription changes from this customer. Ask them to retry in a few minutes |
| 503 | `subscription_action_unavailable` | Billing system unreachable; safe to retry |

Every attempt — successes and refusals — is written to a platform audit trail
with the verified customer, the origin, and the mode.

<!-- MANIFEST:APPENDIX — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with the cancel/resume sections above. -->
Administrator cancellation uses `POST /api/payments/subscription/admin-cancel`
from an enabled server function with
`{ subscriptionId, immediate?, actor: { email, id? }, requestId?, reason? }`.
Authenticate the app session and administrator role inside that function;
`actor` is audit data, not authorization. The runner signs workspace/function
scope. Direct browser calls and claimed roles do not authorize the endpoint.

For cancellation displays, inventory returns `cancel_at` (Unix seconds),
`cancel_at_iso`, and `cancellation_scheduled`. Native responses also expose
`cancelAt` (ISO) and `cancellationScheduled`. A date-only cancellation can
have a false raw `cancel_at_period_end`; preserve paid access until Stripe
reports termination, and suppress renewal notices for scheduled cancellations.
The per-customer `GET /api/space/:spaceId/subscription-status` read returns
the same `cancelAt` + `cancellationScheduled` fields next to its existing
`cancelAtPeriodEnd` / `currentPeriodEnd` — Customer-Portal cancellations show
up there as `cancellationScheduled: true` with `cancelAtPeriodEnd: false`, so
gate "cancels on …" banners on `cancellationScheduled`, never on the flag alone.

```typescript
// Customer-initiated cancel — requires the SAME verified space session the
// subscription-status read uses (body `sessionId`, `X-Session-Id`, or the
// signed space-session cookie). A caller-supplied email is never an identity.
const res = await fetch('/api/payments/subscription/cancel', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-App-Id': window.__APP_ID__ || window.__SPACE_ID__,
    'X-Session-Id': canonicalSessionId,
  },
  credentials: 'include',
  body: JSON.stringify({ subscriptionId }), // add `immediate: true` to stop now
}).then(r => r.json());

if (res.success) {
  // res.message already names the paid-through date; the next
  // /api/space/:spaceId/subscription-status call reflects it (no webhook wait).
  alert(res.message);
}
// POST /api/payments/subscription/resume (same body, no `immediate`) undoes it.
```
<!-- MANIFEST:END -->

## Subscription Data Architecture

Contact **metadata** is the single source of truth for all subscription state. Every endpoint — app runtime, CRM dashboard, agent queries — reads from the same metadata fields on the CRM contact. This ensures consistency across the entire platform.

### How It Works

1. **Customer signs up** — Contact created in CRM with `trialStartDate` in metadata
2. **Customer completes checkout** — Stripe sends `checkout.session.completed` webhook
3. **Platform updates contact metadata** — Writes `subscriptionId`, `subscriptionStatus`, `stripeCustomerId`, `planTier` into the contact's metadata
4. **Subscription changes** — Stripe sends `customer.subscription.updated/deleted` webhooks
5. **Platform keeps metadata in sync** — Updates `subscriptionStatus` on every change
6. **All consumers read metadata** — App runtime, CRM dashboard, subscriber queries all derive state from the same metadata fields

### Mirroring a founder-owned Stripe subscription

<!-- MANIFEST:ENDPOINT POST /api/crm/subscribers/:workspaceId/sync-external | Server function mirrors a provider-verified founder-owned Stripe subscription into CRM entitlement metadata -->

When a server function bills through a founder-owned Stripe key instead of the
platform payment endpoints, it must mirror each verified subscription snapshot
into CRM. The platform deliberately does not infer entitlement from arbitrary
WorkspaceDB table names or columns.

Call this only from the verified Stripe webhook/reconciliation server function,
after re-fetching the Stripe object. The hook runner supplies same-workspace
authentication; browser calls and cross-workspace callers are refused.
Reconcile all subscriptions for the customer first, then send the selected
authoritative row; do not forward an isolated event status that could ignore a
different active subscription.

```javascript
await fetch('/api/crm/subscribers/' + workspaceId + '/sync-external', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: customer.email,
    stripeCustomerId: customer.id,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    observedAt: new Date().toISOString(), // immediately after provider re-fetch
    planTier: subscription.metadata?.planTier || null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    cancelAt: subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : null
  })
});
```

Supported statuses are Stripe's canonical `active`, `trialing`, `past_due`,
`unpaid`, `paused`, `incomplete`, `incomplete_expired`, and `canceled` values
(`cancelled` is normalized to `canceled`). Re-sending the same snapshot is
idempotent, and a snapshot older than the last mirrored `observedAt` is ignored.
A non-granting event for a different subscription id cannot displace the
contact's current active subscription.

### Contact Metadata Fields (Source of Truth)

| Field | Description |
|-------|-------------|
| `subscriptionStatus` | Current Stripe status: `active`, `trialing`, `canceled`, `past_due`, `incomplete`, `unpaid` |
| `planTier` | Subscription tier (e.g., `companion`, `guide`) |
| `stripeCustomerId` | Stripe customer ID (`cus_xxx`) |
| `subscriptionId` | Stripe subscription ID (`sub_xxx`) |
| `subscriptionCreatedAt` | When subscription was created (ISO timestamp) |
| `subscriptionUpdatedAt` | Last status update time (ISO timestamp) |
| `trialStartDate` | When trial period began (ISO timestamp, set on registration) |
| `trialEndDate` | When a Stripe trial ends (ISO timestamp). Only set when Stripe supplies `trial_end` — **card-less trials never have it** and it is not included in the subscription-status response. Use `trialDaysRemaining` / `trialExpired` from the endpoint (computed from `trialStartDate` + `trialDays`) instead |
| `trialDays` | Length of trial in days (default 7) |
| `cancelAtPeriodEnd` | Stripe's raw `cancel_at_period_end` flag |
| `cancelAt` | ISO date of an explicit Stripe `cancel_at` (Customer-Portal cancellations use this with `cancelAtPeriodEnd: false`); `null` when none |
| `cancellationScheduled` | `true` while a non-terminal subscription will end by either mechanism; cleared on reversal |
| `currentPeriodEnd` | When current billing period ends |
| `manualSubscriptionOverride` | Object with `tier`, `grantedBy`, `reason`, `expiresAt` for manual access grants |

### Computed Status (Derived from Metadata)

All endpoints use a shared `computeSubscriptionState()` function that reads metadata and returns a normalized status:

| Status | Description |
|--------|-------------|
| `active` | Subscription is active and paid |
| `trialing` | Customer is in trial period |
| `trial_expired` | Trial ended, no active subscription |
| `canceled` | Subscription was canceled |
| `past_due` | Payment failed, subscription at risk |
| `incomplete` | Initial payment failed or pending |
| `registered` | Contact registered without a card (card-less trial) — no Stripe subscription; use `trialExpired` / `trialDaysRemaining` for access |
| `not_registered` | No subscription data found |
| `manual_override` | Access granted manually by entrepreneur |

## Querying Subscribers

### List Subscribers (Metadata-Based)

Query contacts by subscription metadata. No tags required — queries metadata directly using Postgres JSON operators.

**Authentication required.** This read returns customer emails and Stripe
customer ids, so it is workspace-authorized. It answers the workspace owner
(the in-workspace dashboards, which attach the owner's session automatically)
and server-side callers running for that same workspace. An anonymous request
gets `401`; a credential for a different workspace gets `404`. It is not
callable from a visitor's browser — put the read in a server function and
return only what the UI needs.

```
GET /api/crm/subscribers/:workspaceId
GET /api/crm/subscribers/:workspaceId?planTier=companion
GET /api/crm/subscribers/:workspaceId?planTier=companion,guide
GET /api/crm/subscribers/:workspaceId?status=active
GET /api/crm/subscribers/:workspaceId?planTier=guide&limit=50
```
<!-- MANIFEST:ENDPOINT GET /api/crm/subscribers/:workspaceId | List Subscribers (Metadata-Based) -->

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `planTier` | string | No | Filter by plan tier. Supports comma-separated values for multiple tiers (e.g., `companion`, `companion,guide`) |
| `status` | string | No | Filter by raw Stripe status (e.g., `active`, `trialing`) |
| `limit` | number | No | Max results (default 200, max 500) |

**Response:**
```json
{
  "success": true,
  "subscribers": [
    {
      "id": "contact-uuid",
      "email": "customer@example.com",
      "name": "Jane Doe",
      "planTier": "companion",
      "status": "active",
      "subscriptionId": "sub_xxx",
      "stripeCustomerId": "cus_xxx",
      "trialDaysRemaining": 0,
      "hasPaymentMethod": true,
      "manualOverride": null,
      "lastPaymentAmount": 8,
      "lastPaymentCurrency": "USD",
      "createdAt": "2025-01-15T00:00:00.000Z"
    }
  ],
  "total": 1,
  "activeCount": 1,
  "trialCount": 0,
  "overrideCount": 0,
  "expiredCount": 0
}
```

### Using in Server Functions (Hooks)

```javascript
// Call the platform path with the sandbox `fetch`. The runner recognises it,
// routes it to the platform and authenticates it for the workspace this
// function is executing for — you attach nothing. There is no
// `platform.callAPI` helper; a relative path or `https://audos.com/...`
// both work, and `workspaceId` is already bound in the sandbox.
const res = await fetch(`/api/crm/subscribers/${workspaceId}?planTier=companion`);
const subs = await res.json();

for (const sub of subs.subscribers) {
  await platform.sendEmail({
    to: sub.email,
    subject: 'Your weekly check-in',
    html: `<p>Hi ${sub.name || 'there'}!</p>`
  });
}
```

### CRM Tags (Derived, Not Required for Queries)

When payment events occur, the platform also applies CRM tags as a convenience. These are **derived from metadata** and can be used for visual filtering in the CRM dashboard, but are not the primary query mechanism.

| Tag | When Applied |
|-----|-------------|
| `subscriber` | Contact has an active or trialing subscription |
| `subscriber-{planTier}` | Contact has subscription at a specific tier |
| `subscriber-canceled` | Subscription was canceled |
| `subscriber-past-due` | Subscription payment is overdue |

### Backfill Existing Subscribers

If you had payments before this system was added, run a one-time backfill.
The same authentication rule applies as for the read above — call it from a
server function, or as the workspace owner:

```
POST /api/crm/subscribers/:workspaceId/backfill
POST /api/crm/subscribers/:workspaceId/backfill?dryRun=true  (preview only)
```
<!-- MANIFEST:ENDPOINT POST /api/crm/subscribers/:workspaceId/backfill | Backfill Existing Subscribers -->

This scans Stripe for paid invoices, matches them to CRM contacts by email, and updates their metadata with subscription details.

<!-- MANIFEST:NOTES — copied verbatim into APP_INTEGRATION_MANIFEST.md by scripts/generate-app-integration-manifest.ts. Keep in sync with "List Subscribers", "Backfill Existing Subscribers", and "Mirroring a founder-owned Stripe subscription". -->
> Subscriber reads/backfills are workspace-authorized: call them from a server
> function with the sandbox `fetch` (the runner authenticates them for your
> workspace — there is no `platform.callAPI` helper) or as the workspace
> owner. Anonymous requests get `401`. External subscription sync is stricter:
> it accepts only a same-workspace trusted server function.
<!-- MANIFEST:END -->

## Security Notes

- Customer payment info never touches your app
- Stripe handles all PCI compliance
- Platform fees automatically calculated
- Secure checkout via Stripe Hosted Page
- Subscription status verified server-side (cannot be faked by clients)

## Escrow-Style Holds & Refunds (Task #3151)

For trust flows — deal-splitting, marketplaces, "pay on delivery" — you can authorize a card **without charging it**, then capture or release the hold later, and issue full/partial refunds. No payouts to users' bank accounts are needed.

**The escrow recipe** (two people splitting a purchase):
1. Joiner commits → create a checkout with `captureMethod: 'manual'` — funds are **held**, not charged.
2. Joiner confirms receipt → **capture** the hold AND **refund** 50% of the buyer's original payment.
3. Deal falls through → **cancel** the hold; the joiner is never charged and the buyer keeps the item.

### Creating a hold (client-side, same as normal checkout)

```js
const { checkoutUrl, sessionId } = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: 2500,                    // cents
    productName: 'Half of: Espresso machine',
    captureMethod: 'manual',         // ← escrow hold: authorize only
    successUrl: window.location.origin + '/held',
    cancelUrl: window.location.origin + '/deal'
  })
}).then(r => r.json());
window.location.href = checkoutUrl;
```

### Capture / cancel / refund (server-side only — keyless)

These money-moving operations are **native and keyless**: call them from a **workspace hook / scheduled task** and auth is automatic — no SDK key, no secrets, no setup. They only work server-side; a visitor's browser calling these endpoints is rejected (so a visitor can never refund themselves):

| Endpoint | Body | Effect |
|----------|------|--------|
| `POST /api/payments/capture` | `{ sessionId \| paymentIntentId, amountCents? }` | Capture the hold (omit `amountCents` for full; partial releases the rest) |
| `POST /api/payments/cancel-hold` | `{ sessionId \| paymentIntentId }` | Release the hold — customer never charged |
| `POST /api/payments/refund` | `{ sessionId \| paymentIntentId, amountCents?, reason? }` | Full or partial refund of a captured payment |

All three only work on payments created by this workspace. Their path-only URLs are intentional: this endpoint family is one of the few exceptions the hook runner resolves and authenticates for the workspace. For any other platform endpoint, hook code has no page origin, so use the platform's full `https://...` address. From hook code, just:

```js
const res = await fetch('/api/payments/refund', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, amountCents: 2500 })
});
```

> **Audience note:** SDK API keys (`ak_live_`, `payments:write` scope, `/api/sdk/payments/*`) exist ONLY for external, off-platform merchant sites. Native space apps never need a key — do not instruct founders to obtain one.

### Refunding a subscription's first charge

A subscription's first payment **can be refunded from your own server code**, with **no key and no connected Stripe account**. Pass the subscription checkout's `sessionId` to `POST /api/payments/refund` exactly like a one-off purchase:

```js
// The same session id the subscription checkout returned.
const res = await fetch('/api/payments/refund', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId })   // omit amountCents for a full refund
});
```

A subscription checkout has no one-time PaymentIntent of its own — the money for the first period sits on the subscription's first invoice — so Audos follows that one checkout to its own first paid invoice and refunds the payment behind it. You may also pass that first invoice's `paymentIntentId` directly; a later invoice's payment id is refused as `"Payment not found"`.

- **Works in platform mode.** If you took the payment before connecting your own Stripe account, the charge sits on the Audos platform account and this route still refunds it. Platform-collected payments are **not** unrefundable.
- **First invoice only.** Only the invoice reachable from that one checkout is refunded. Later recurring invoices, partial-period proration and disputes are not covered here.
- **A refund does not cancel the subscription.** Cancel it separately if that is what you mean.
- **Repeating it is safe.** A second refund of an already-fully-refunded first charge returns `alreadyRefunded: true` and issues nothing.
- **Holds are unchanged.** `capture` and `cancel-hold` still refuse a subscription checkout with `"This session has no one-time PaymentIntent..."` — there is no authorize-and-capture hold to act on.
- **Someone else's payment is still invisible.** A checkout that cannot be tied back to your workspace returns HTTP 404 `"Payment not found"`, same as before.

`GET /api/payments/status/:sessionId` (and `audos.payments.getSessionStatus`) now also returns:
- `holdStatus`: `requires_capture` | `captured` | `canceled` | `expired`
- `amountCapturable`, `amountReceived`, `amountRefunded`, `refunded`

### Rules & caveats

- **~7-day expiry:** uncaptured card authorizations expire after about 7 days. Stripe then auto-cancels the hold (`holdStatus: 'expired'`) and it can no longer be captured — start a new checkout. Capture or cancel well before then.
- **Platform fee:** refunds do NOT refund the platform application fee; the merchant account bears the full refund amount.
- **Idempotency:** double-capture and double-full-refund are safe no-ops (`alreadyInState` / `alreadyRefunded: true`); partial refunds may repeat up to the remaining balance.
- Every operation runs on whichever Stripe account actually took the payment — the workspace's connected account when there is one, otherwise the Audos platform account — with the same fee behavior as normal checkout.

### Wrong-state responses

Hooks must branch on **HTTP status** plus `alreadyInState` / `alreadyRefunded` / `holdStatus`. Do **not** regex-match `error` strings — they are human-readable, not a stable contract.

**Success (HTTP 200)** — the payment is already in the requested final state (safe no-op; treat as success):

- Repeat capture of a succeeded PaymentIntent → `{ success: true, alreadyInState: true, holdStatus, ... }`
- Repeat cancel of a canceled or expired hold → `{ success: true, alreadyInState: true, ... }`
- Repeat full refund of an already-fully-refunded charge → `{ success: true, alreadyRefunded: true, ... }`

**Illegal transitions (HTTP 409)** via `PaymentStateError` → `{ success: false, error: <message>, holdStatus? }`:

- Capture of a canceled hold: `"This hold was canceled and can no longer be captured."`
- Capture of an expired hold: message mentioning ~7 days (authorizations lapse; create a new checkout)
- Cancel of a succeeded PaymentIntent: `"This payment was already captured and cannot be canceled — issue a refund instead."` (`holdStatus: "captured"`)
- Refund of an uncaptured hold: `"This payment is an uncaptured hold — cancel the hold to release the funds instead of refunding."`
- Refund of a non-succeeded payment: `"Payment is not refundable..."`

**Other:**

- Missing / not-yours: HTTP 404 `{ success: false, error: "Payment not found" }` (indistinguishable on purpose)
- Bad payload: HTTP 400
- Unexpected: HTTP 500 `{ success: false, error }`

### Subscription lifecycle events → `subscription-events` (push)

Register an **enabled** server function named exactly `subscription-events`
whose code carries the opt-in marker `audos:subscription-events` (a comment on
the first line is enough), and the platform calls it whenever one of this
workspace's subscriptions is created, changed, or cancelled — including a
cancellation the customer makes on the provider's own hosted billing page with
nobody using the product at the time.

```javascript
// audos:subscription-events
const event = request.body;              // the provider's own event shape
const subscription = event.data.object;  // the subscription object

if (event.type === 'customer.subscription.deleted') {
  await db.update(
    'members',
    { stripe_subscription_id: subscription.id },
    { state: 'grace', grace_ends_at: new Date(Date.now() + 30 * 86400000).toISOString() },
  );
}

respond(200, { handled: event.type });
```

**Payload** — the provider's own event, unchanged, so code already written
against that shape works as-is:

| Field | Description |
|-------|-------------|
| `id` | Provider event id (`evt_…`). Delivered at most once per workspace. |
| `type` | `customer.subscription.created`, `customer.subscription.updated`, or `customer.subscription.deleted`. |
| `created`, `livemode`, `api_version`, `account` | Straight from the event. `account` is `null` for workspaces selling through the platform's merchant account. |
| `data.object` | The full subscription object: `id`, `status`, `customer`, `items`, `cancel_at`, `cancel_at_period_end`, `metadata`, and billing periods (on subscription items in newer API versions) |
| `_audos` | The only platform addition: `{ signatureVerified: true, trigger: "stripe-subscription-event", stripeEnv, workspaceId }`. |

A future `data.object.cancel_at` schedules cancellation even when
`cancel_at_period_end` is false. Preserve both provider fields. Treat an
explicit cancellation date or the period-end flag as a scheduled cancellation
while the subscription is nonterminal, and suppress renewal notices. Read
period end from `current_period_end` with an
`items.data[0].current_period_end` fallback. Keep paid access until Stripe
reports termination; passing a local date alone is not a deletion event.

**Rules**

- **Nomination is the opt-in, and the only access control.** No function with
  that exact name, not enabled, or missing the marker → nothing is delivered
  and nothing about the workspace changes. There is no flag to request.
- **Authenticity is already proven.** The platform verifies the provider's
  signature before calling you, so nothing external is ever pointed at your
  function. Do not re-verify, and do not trust a subscription "event" that
  arrives at your public execute URL from somewhere else.
- **Only this workspace's events.** The workspace is resolved from the
  subscription's own `metadata.workspaceId` (or, for a connected account, from
  that account). An event that names no workspace is delivered to nobody.
- **At most one call per event.** A repeat delivery of the same event id is
  dropped before your code runs.
- **It runs after the provider has been acknowledged**, with a 30-second
  ceiling. What you return is recorded but changes nothing upstream: a failure
  or a timeout never makes the provider retry, and there is no redelivery
  queue. Make the handler idempotent and check the run in the function's
  execution history — these appear with trigger `stripe-subscription-event`.
- Works for both platform-mode workspaces and workspaces with their own
  connected merchant account.

Full contract: `integrations/server-functions/` → "Reacting to Workspace Events".

### One-time checkout events → `checkout-events` (push)

Register an **enabled** server function named exactly `checkout-events`
whose code carries the opt-in marker `audos:checkout-events` (a comment is
enough; `checkoutEvents: true` in hook metadata also works). The platform
calls it after it has verified and acknowledged a Checkout Session event for
this workspace — hosted or inline.

```javascript
// audos:checkout-events
const event = request.body;
const session = event.data.object;

if (event.type === 'checkout.session.completed') {
  const verified = await platform.fetch(
    '/api/payments/status/' + encodeURIComponent(session.id) + '?verify=server',
  ).then((r) => r.json());
  if (verified.paymentStatus !== 'paid') {
    respond(200, { ignored: true });
    return;
  }
  // Grant exactly once using your own idempotent write.
}

respond(200, { handled: event.type });
```

**Payload** — a notification, not proof of payment. The execute URL is
publicly reachable, so re-verify through
`GET /api/payments/status/:sessionId?verify=server` before granting.

| Field | Description |
|-------|-------------|
| `id` | Stripe event id (`evt_…`). Claimed once per workspace; a failed delivery releases the claim so a later retry can run. |
| `type` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, or `checkout.session.expired`. |
| `created`, `livemode`, `api_version`, `account` | Straight from the event. |
| `data.object` | The Checkout Session object. |
| `_audos` | `{ signatureVerified: true, trigger: "stripe-checkout-event", stripeEnv, workspaceId }`. |

**Rules**

- **Nomination is the opt-in.** No function with that exact name, not
  enabled, or missing the marker → nothing is delivered.
- **Only this workspace's events.** The connected account must map to this
  workspace, and the session's `metadata.workspaceId` must name it.
- **Re-verify before granting.** Unlike `subscription-events`, do not treat
  this payload as proof. Call status from the same server function.
- **Failed deliveries retry.** A 5xx or a runner failure releases the claim
  so `stripe events resend` (or a later webhook) can run the function again.
  A successful grant must be idempotent so a resend cannot unlock twice.
- The return-page retrieve path should run the same grant, covering a closed
  tab or a missed event.

---


---

# web-scraping

Source: integrations/web-scraping/docs.md

# Web Scraping & Automation Integration (Apify)

Run ANY Apify actor to scrape Instagram, LinkedIn, Amazon, Twitter, YouTube, or any website.

## Category
Data & Search

## Required API Keys
- `APIFY_API_TOKEN`

## API Endpoints

### POST /api/apify/run

Run any Apify actor with the given input configuration.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actorId` | string | Yes | Apify actor ID (e.g., `apify/instagram-scraper`) |
| `input` | object | Yes | Actor-specific input parameters |
| `timeout` | number | No | Timeout in minutes (1-60, default 5) |
| `memory` | number | No | Memory in MB (128-32768, default 512) |
| `build` | string | No | Specific build to use |
| `parseWithGPT` | boolean | No | Parse results with GPT (default true) |
| `dataDescription` | string | No | Description for GPT parsing (required if parseWithGPT) |
| `targetFormat` | string | No | Output format: `json`, `csv`, or `text` (default `json`) |
| `extractFields` | string[] | No | Specific fields to extract |
| `workspaceId` | string | No | Workspace ID for expense tracking |

The request does not return until the actor run finishes. From a server function, the call is allowed `timeout` minutes plus 15 seconds, but never more than what is left of the function's execution ceiling (300 seconds unless `metadata.timeout` raises it, up to 10 minutes). Keep `timeout` inside that: a request cut off early still leaves the actor running and billed, and its results are lost.

**Example Request:**
```json
{
  "actorId": "apify/instagram-scraper",
  "input": {
    "usernames": ["nike"],
    "resultsLimit": 20
  },
  "timeout": 5
}
```

**Response:**
```json
{
  "id": "apify_1234567890",
  "actorId": "apify/instagram-scraper",
  "status": "succeeded",
  "runId": "abc123",
  "results": [...],
  "parsedData": {...},
  "metadata": {
    "startedAt": 1234567890,
    "finishedAt": 1234567935,
    "duration": 45000,
    "cost": "$0.010",
    "itemCount": 20
  }
}
```

**Error Responses:**
- `400` — Invalid actor configuration (missing actorId, invalid input, etc.)
- `502` — Actor run completed with `failed` status (e.g., invalid input, actor error)
- `503` — `APIFY_API_TOKEN` is not configured
- `504` — Actor run timed out
- `500` — Unexpected error (thrown exception, actor not found)

**Example 503 response:**
```json
{
  "error": "Apify API token is not configured. Please add APIFY_API_TOKEN to your secrets."
}
```

### GET /api/apify/search-actors

Search the Apify Store for available actors.

**Query Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search keyword |
| `limit` | number | No | Max results (default 20, max 100) |

**Example:** `GET /api/apify/search-actors?query=instagram&limit=10`

**Response:**
```json
{
  "actors": [
    {
      "id": "abc123",
      "name": "Instagram Scraper",
      "description": "Scrape Instagram posts...",
      "username": "apify",
      "actorId": "apify/instagram-scraper",
      "stats": { "runs": 50000, "users": 1200 },
      "categories": ["social-media"],
      "pricing": "FREE"
    }
  ],
  "total": 42,
  "count": 10,
  "filteredRentalCount": 3
}
```

## Discovering & Testing Actors (Otto Workspace Agent)

Before implementing an Apify integration in your space, you can use Otto's built-in tools to discover and test actors:

### 1. Search for Actors
Use the **Apify Search** tool to find actors matching your needs:

```bash
# Search for actors by keyword (no API key required)
ts-node tools/apify-search-actors.ts "instagram scraper"
ts-node tools/apify-search-actors.ts "linkedin" 10
```

**Returns:**
- Actor ID (e.g., `apify/instagram-scraper`)
- Description and categories
- Stats (users, total runs)
- Pricing model (FREE/PAID)

### 2. Test Actor Input/Output
Use the **Apify Test** tool to run a test and understand the actor's structure:

```bash
# Test an actor with LLM-generated minimal input
ts-node tools/apify-test-actor.ts "apify/instagram-scraper"
ts-node tools/apify-test-actor.ts "apify/web-scraper" "Web Scraper" "Scrapes any website"
```

**Returns:**
- Input schema documentation
- Output schema documentation
- Ready-to-use TypeScript code with types
- Error handling examples

**Requirements:** `APIFY_API_TOKEN` and `OPENAI_API_KEY` environment variables

### Workflow for Adding Apify to a Space
1. **Search**: Ask Otto to search for relevant actors
2. **Test**: Ask Otto to test the actor and understand its input/output
3. **Implement**: Use the generated TypeScript code in your space app
4. **Deploy**: Actor runs server-side via `/api/apify/run` endpoint

## Popular Actors
- `apify/instagram-scraper` - Scrape Instagram posts, profiles, hashtags
- `apify/linkedin-scraper` - Extract LinkedIn profiles and company data
- `apify/amazon-product-scraper` - Get Amazon product details and reviews
- `apify/twitter-scraper` - Scrape tweets, profiles, trends
- `apify/youtube-scraper` - Extract video data, comments, channels
- `apify/web-scraper` - Generic website scraper with selectors

Find 1000+ actors at: https://apify.com/store

## Installation

```javascript
export const webScraping = {
  // Generic method - run ANY Apify actor
  async runActor(actorId, input, timeout = 5) {
    const response = await fetch('/api/apify/run', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-App-Id': window.__APP_ID__
      },
      body: JSON.stringify({
        actorId,
        input,
        timeout // minutes
      })
    });

    const data = await response.json();
    if (data.status === 'failed') {
      throw new Error(data.metadata?.errorMessage || 'Scraping failed');
    }
    return data.results;
  },

  // Platform-specific helpers
  async scrapeInstagram(username, maxPosts = 20) {
    return this.runActor('apify/instagram-scraper', {
      usernames: [username],
      resultsLimit: maxPosts
    });
  },

  async scrapeLinkedIn(profileUrl) {
    return this.runActor('apify/linkedin-scraper', {
      startUrls: [profileUrl],
      maxResults: 1
    });
  },

  async scrapeAmazon(searchTerm, maxResults = 20) {
    return this.runActor('apify/amazon-product-scraper', {
      search: searchTerm,
      maxResults
    });
  },

  async scrapeWebsite(url, selectors = {}) {
    return this.runActor('apify/web-scraper', {
      startUrls: [url],
      pageFunction: `() => ({ title: document.title, ...${JSON.stringify(selectors)} })`
    });
  }
};
```

## Use Cases
- Social media analytics
- Competitive intelligence
- Price monitoring
- Lead generation
- Market research
- Content aggregation

## Documentation
- [Apify Docs](https://apify.com/actors)


---

# web-search

Source: integrations/web-search/docs.md

# Web Search Integration (SerpAPI)

Search Google for real-time web results, news, images, shopping, and academic papers.

## Category
Data & Search

## Required Environment Variables
- `SERPAPI_API_KEY` — configured platform-wide, no setup needed

## API Endpoint

```
POST /api/search
```

**Request:**
```json
{
  "query": "AI trends 2025",
  "searchType": "web",
  "num": 10,
  "location": "United States",
  "language": "en",
  "dateRange": "week",
  "page": 1
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | ✅ | — | Search query |
| `searchType` | string | — | `"web"` | `web`, `news`, `images`, `shopping`, `scholar` |
| `num` | number | — | `10` | Results to return (1–100) |
| `location` | string | — | — | Free-text place, e.g. `"United States"`, `"Austin, Texas"`, `"London, United Kingdom"`. Resolved to a canonical location before the search; if it cannot be resolved (street-level strings, `lat,lng` pairs, typos) the search still succeeds without a location filter and `metadata.locationNotApplied: true` is set. |
| `language` | string | — | — | e.g. `"en"`, `"es"` |
| `dateRange` | string | — | — | `"day"`, `"week"`, `"month"`, `"year"` |
| `page` | number | — | `1` | Pagination — which page of results |

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "title": "AI Trends in 2025",
      "link": "https://example.com/article",
      "snippet": "Discover the latest AI trends...",
      "position": 1
    }
  ],
  "totalResults": 670000000,
  "searchTime": 1565
}
```

| Field | Description |
|---|---|
| `results[].title` | Page title |
| `results[].link` | URL |
| `results[].snippet` | Preview text |
| `results[].position` | Search ranking position |
| `totalResults` | Estimated total matches |
| `searchTime` | Query time in milliseconds |

---

## Helper Functions

```typescript
export const webSearch = {
  async search(query: string, options: {
    searchType?: 'web' | 'news' | 'images' | 'shopping' | 'scholar';
    num?: number;
    location?: string;
    language?: string;
    dateRange?: 'day' | 'week' | 'month' | 'year';
    page?: number;
  } = {}) {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        searchType: options.searchType || 'web',
        num: options.num || 10,
        location: options.location,
        language: options.language,
        dateRange: options.dateRange,
        page: options.page || 1,
      })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.results;
  },

  async searchWeb(query: string, num = 10) {
    return this.search(query, { searchType: 'web', num });
  },

  async searchNews(query: string, dateRange: 'day' | 'week' | 'month' | 'year' = 'week') {
    return this.search(query, { searchType: 'news', dateRange });
  },

  async searchImages(query: string, num = 20) {
    return this.search(query, { searchType: 'images', num });
  },

  async searchShopping(query: string, num = 10) {
    return this.search(query, { searchType: 'shopping', num });
  },

  async searchScholar(query: string, num = 10) {
    return this.search(query, { searchType: 'scholar', num });
  }
};
```

---

## Use Cases
- Research tools and knowledge bases
- News aggregators and content feeds
- Price comparison and shopping discovery
- Image discovery for galleries or inspiration boards
- Academic research assistants
- Market intelligence and competitor monitoring
- Real-time data for AI-powered apps

## Notes
1. **No API key needed in your app** — the key is configured server-side.
2. **Rate limits** — SerpAPI has monthly search quotas; avoid unbounded polling.
3. **`page` for pagination** — combine with a fixed `num` to page through results.
4. **`location` never fails a search** — unknown or unresolvable locations are ignored (check `metadata.locationNotApplied`), so never treat a missing location filter as an error. City/region/country names work best; street addresses and coordinates are not supported location filters.


---


