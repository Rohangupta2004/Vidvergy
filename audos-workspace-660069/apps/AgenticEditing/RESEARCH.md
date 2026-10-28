# Agentic Editing — Phase 0 research

Date: 2026-10-25

## Source-spec status

The required PRD could not be read in this run. The supplied path is a private chat attachment, not a workspace source file. `read_file` reports that path does not exist in the workspace tree, and both direct HTTP and browser reads return `401 Authentication required`. Therefore the numbered eight prerequisite fixes, exact milestones, data shapes, and acceptance criteria are **unverified**. No implementation should infer them from the short task summary.

Fallback: copy the full PRD into a workspace-readable text/Markdown file (for example `docs/agentic-editing-prd.md`) and resume from that exact source.

The recent compile-fix appears to have landed before this research: snapshot v586 was created at 07:21 UTC as a one-file Cursor edit, and `apps/VideoProviderLab/labClient.ts` is now dated 07:12 UTC. This is evidence of current source state, not a substitute for a compile run.

## 1. Deepgram nova-3 transcript with word timings from a video URL

**Answer: there is no documented Audos route that accepts a remote video URL and returns Deepgram word timings.**

The managed route is:

`POST /api/workspaces/:workspaceId/audio/transcribe-timestamped`

It requires `multipart/form-data` with an `audio` file and `X-Workspace-DB-Token`. It returns `transcript`, `words[]` (`word`, `start`, `end`, `confidence`), `duration`, `confidence`, model `nova-3`, and provider `deepgram`. Audio recordings up to 500 MB are documented.

Evidence:
- `integrations/deepgram-transcription/docs.md`
- registered server function `veh-transcribe`, which explicitly returns `server_url_transcription_unsupported` for a video URL and says the managed Deepgram and Whisper routes require multipart audio bytes

Fallback: preserve the original browser `File`, extract/demux its audio before calling the managed route, then pass the returned managed result to the persistence function. No documented server-side video-URL-to-audio route exists. If audio extraction is unavailable, Gemini can produce a transcript-like result but not verified nova-3 word timings; any estimated timings must be labelled degraded and must not masquerade as Deepgram output.

## 2. Gemini whole-video route and maximum length

Use:

`POST /api/generate/video-analysis`

Request: `multipart/form-data` with `file` and `prompt`. It accepts MP4, WebM, MOV, AVI, MKV, and 3GP. The documented upload maximum is 2 GB and the maximum duration is approximately one hour, resolution-dependent. Frame sampling is approximately 1 FPS and audio is processed with the video.

For files under 20 MB, `/api/generate/video-inline` accepts base64 video. `/api/generate/video-youtube` accepts a YouTube URL, but there is no documented arbitrary-video-URL analysis route.

Evidence: `integrations/gemini-video-understanding/docs.md`.

Fallback for longer material: split into bounded chapters, analyze each chapter, retain absolute timestamp offsets, then synthesize one storyboard. This fallback is **unverified** against the absent PRD and should require explicit chapter-boundary provenance.

## 3. Lyria music route and use in client videos

Use either neutral alias:

- `POST /api/workspaces/:workspaceId/audio/music/custom`
- `POST /api/workspaces/:workspaceId/audio/music/preset`

Send the workspace token and set `provider: "gemini"`. The custom route takes a prompt, `lengthMs`, and `instrumental`. Lyria returns a permanent public MP3 URL. Requests up to 30 seconds produce an approximately 30-second `lyria-3-clip-preview` result; longer requests use `lyria-3.5` and are clamped to 240 seconds. The response reports measured duration and whether the request was clamped.

**Yes, the documented output is intended for background music in client videos.** The integration explicitly describes use in Remotion videos and video/presentation experiences. No silent provider fallback occurs.

Evidence: `integrations/elevenlabs-audio/docs.md`.

## 4. Background jobs, hook-to-hook AI calls, and the 50,000-token allowance

Platform AI calls use a durable rolling budget. Defaults are 50,000 accounted tokens per verified workspace session per 24 hours and 500,000 per workspace per 24 hours. The platform reserves an estimate before a provider call and replaces it with actual usage after success; failed provider calls release the reservation. Exceeding either budget returns HTTP 429 `HOOK_AI_BUDGET_EXCEEDED` before provider spend.

A hook-to-hook call does not authenticate automatically. When it forwards the canonical `X-Session-Id`, the downstream function validates that same visitor and its AI calls count against the verified session budget as well as the workspace budget. A scheduled/background function with no visitor session cannot be assigned to a verified session bucket, but its AI use still counts against the workspace budget. Persisting work in job rows does not create a separate or free AI allowance.

Evidence: `integrations/server-functions/docs.md`, sections on `platform.generateText`, durable rolling spend budgets, validated sessions, hook-to-hook calls, and long-running work.

## 5. Large-file upload path and size limit

Current upload paths:

1. `POST /api/upload/file` — multipart binary, maximum 50 MB, returns a durable public GCS URL (or a private reference when explicitly requested).
2. `POST /api/upload/signed-url` — intended for files above 50 MB and up to 500 MB, followed by a direct create-only GCS `PUT` using the exact byte count/content type.

Important limitation: the signed-upload grant resolves an app from the request Host. The docs state that a normal published Space commonly receives `404 app_context_not_found`; custom headers do not supply the missing app context. Until the host is mapped to a hosted `app_…` registry entity, **50 MiB is the real durable-upload ceiling for Space app code**.

Evidence: `integrations/file-storage/docs.md`.

Fallback: feature-detect the signed grant before upload. If unavailable, allow up to 50 MB for durable storage and state the limit before file selection. The Gemini analysis route can accept an original file up to 2 GB directly, but that does not create the durable public source URL required by the editor/render pipeline. “One video of any length” is therefore unverified and not implementable as stated on the documented normal Space upload path without a working signed-upload host grant or a new platform storage route.

## 6. ElevenLabs Dubbing support and server-function URL start

**The current `elevenlabs-audio` integration does not document ElevenLabs Dubbing.** It provides multilingual TTS, segmented TTS, voice cloning, speech-to-speech voice changing, and music. Speech-to-speech accepts one multipart audio file, is limited to 25 MB / 5 minutes, and preserves words/timing while changing the voice; it does not translate a video.

A server function cannot start a documented dub from a video URL because no Dubbing endpoint exists in this integration, and the existing media routes that need audio require multipart bytes.

Evidence: `integrations/elevenlabs-audio/docs.md`; registered function `veh-transcribe` documents the same multipart limitation for managed audio routes.

Fallback: translate approved transcript segments, synthesize target-language segments with multilingual ElevenLabs TTS, align them to the approved timeline, and mix them during render. This is synthetic translated narration, not ElevenLabs Dubbing, and must be labelled accordingly. Timing expansion, speaker identity, and lip-sync need explicit acceptance rules from the PRD.

## Phase 1 — portrait renderer finding

The documented Remotion service is fixed at 30 fps and 1920×1080. When `fps`, `width`, or `height` are supplied, they must match that geometry. Therefore native `1080×1920` submission is not accepted by the renderer contract.

Existing production code confirms the supported path:

- `integrations/remotion-rendering/docs.md`: fixed 1920×1080 geometry
- `vv-render-job`: renders a real portrait design stage centered inside 1920×1080, then calls `/api/workspaces/:id/videos/overlay` with no overlays to finish a true 1080×1920 MP4
- `verger-edit-video`: probes source geometry, submits Remotion at 1920×1080, and applies the same 1080×1920 overlay finisher for vertical sources
- `vv-motion-engine`: advertises 9:16 native export through the `video-overlay` finisher, not through a native portrait Remotion frame

Recorded result: **native portrait is unsupported; use the landscape render plus portrait finishing path.** This run did not submit a paid/redundant render because the current integration contract and the registered production hooks already encode the tested result.

## Short prerequisite check possible without the PRD

The numbered mapping is unavailable, so the following is a presence check only and does not claim that “Fix 1” through “Fix 8” match these items:

- `vv-motion-engine` exists and exposes authenticated create/analyze/plan/generate/edit/revise/render/status/cancel/retry/version/export operations.
- `vv-motion-worker` exists as the durable DAG worker and delegates rendering/QA.
- `vv-render-job` exists with persisted retries, QA, repair, and portrait finishing.
- `verger-edit-video` is session-authenticated, uses optimistic video-version checks, saves recoverable versions, and performs server-side edits.
- `veh-transcribe` is session-authenticated and persists real managed Deepgram timed words, while rejecting unsupported URL-only requests.
- `vv-workspace-videos` is session-authenticated and returns only the validated caller’s history.
- `vv-credits` is the sole wallet writer and provides idempotent quote/charge/refund operations; its existing locked rule is one credit per generated video second.
- The compile-fix source change appears present before this task.

Missing/unverified: the exact eight PRD fixes and their acceptance tests. Those cannot be honestly confirmed by number until the PRD text is readable.
