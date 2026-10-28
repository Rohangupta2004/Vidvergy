# Vidverge video model health and wiring — 28 Oct 2026

Prompt used for every generative-model check:

> An 8 second shot of a basketball player performing a crossover dribble on an outdoor court, smooth realistic motion, consistent character, stable ball.

Settings: one clip per model, 16:9, lowest available tier/resolution, audio off. Kling cannot render 8 seconds, so 10 seconds (the nearest supported length) was used. Hailuo disclosed that it accepts only 6 or 10 seconds; its refunded 8-second validation failure was retried once at 6 seconds. Image-to-video-only models used the existing durable UGC creator image solely to satisfy their required image input. No Remotion generation was used.

## Live model results

| Model id | Requested length | Result | Latency | Charge/cost evidence | Output URL / raw terminal response |
|---|---:|---|---:|---|---|
| `gemini-omni-1.1-flash` | 8s | **PASS** | 32,177 ms | Provider returned `Google Omni metered`; numeric USD was not exposed | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793160551378_wutst0.mp4` |
| `openrouter/bytedance/seedance-2.5` | 8s | **FAIL** | 51 ms | No charge | Server test: `401 {"error":"Authentication required","code":"no_credentials"}`. Founder Scene 2 persisted: `The Seedance provider spending limit has been reached. No render was started, and the scene credit authorization was refunded.` The shared OpenRouter provider response is the key-limit text quoted below. |
| `openrouter/bytedance/seedance-2.0-fast` | 8s | **FAIL** | 159 ms on the one valid retry | No charge | `502` wrapping provider `403`: `Key limit exceeded (total limit)... $254.45 of $250.00 used; does not reset.` |
| `openrouter/google/veo-3.1` | 8s | **FAIL** | 173 ms | No charge | Same OpenRouter key-limit failure. |
| `openrouter/google/veo-3.1-fast` | 8s | **FAIL** | 143 ms | No charge | Same OpenRouter key-limit failure. |
| `openrouter/google/veo-3.1-lite` | 8s | **FAIL** | 77 ms | No charge | Same OpenRouter key-limit failure. |
| `kling-2.5-turbo` (`std`) | 10s | **FAIL** | 145 ms | No charge | `401 {"error":"Authentication required","code":"no_credentials"}` |
| `kling-2.6` (`std`) | 10s | **FAIL** | 108 ms | No charge | Same `401 no_credentials`. |
| `kling-3.0` (`std`) | 10s | **FAIL** | 84 ms | No charge | Same `401 no_credentials`. |
| `kling-3.0-omni` (`std`) | 10s | **FAIL** | 39 ms | No charge | Same `401 no_credentials`. |
| `gen4.5` | 8s | **FAIL** | 113 ms | Free quote: $0.96; generation not charged | Catalog and quote passed; submit returned `401 {"error":"Authentication required","code":"no_credentials"}`. |
| `gen4_turbo` | 8s | **FAIL** | 56 ms | Free quote: $0.40; generation not charged | Catalog and quote passed; submit returned the same `401 no_credentials`. |
| `minimax-hailuo-02` | 8s, then 6s | **INCONCLUSIVE / disabled** | 4,703 ms for 8s rejection; retry terminal latency unavailable | 8s attempt explicitly `refunded:true`; 6s retry may have charged up to the documented $1.00 | 8s raw response: `Higgsfield API error (400): duration: 8 is not one of [6, 10]`. The single 6s retry became execution-uncertain; it was not retried. |
| `dop-turbo` | model-defined | **INCONCLUSIVE / disabled** | terminal latency unavailable | May have charged up to documented $1.00 | Execution became uncertain after dispatch; no provider terminal body or operation id returned, so it was not retried. |
| `dop-standard` | model-defined | **INCONCLUSIVE / disabled** | terminal latency unavailable | May have charged up to documented $1.00 | Same execution-uncertain outcome; not retried. |
| `dop-lite` | model-defined | **INCONCLUSIVE / disabled** | terminal latency unavailable | May have charged up to documented $1.00 | Same execution-uncertain outcome; not retried. |

Exact OpenRouter raw provider error captured during this sweep:

```text
OpenRouter video request failed: 403 Forbidden {"error":{"message":"Key limit exceeded (total limit). Manage it using https://openrouter.ai/workspaces/audos/keys/... $254.45 of $250.00 used; does not reset.","code":403,"metadata":{"limit_source":"openrouter_key_limit","remedy_hint":"Raise or remove this API key's usage limit at https://openrouter.ai/settings/keys, or use a key without a limit.","scope":"key_limit","limit_usd":250,"spend_usd":254.453571504,"resets_at":null}}}
```

The provider-key URL identifier is intentionally elided from this report; the complete response was captured by the task execution. The running exposure did not look abnormal: five successful 8-second Gemini Omni jobs returned only `Google Omni metered` (no USD amount); one Hailuo request was explicitly refunded; at most four execution-uncertain Higgsfield calls could total $4.00 at documented pricing. Runway quotes were not charged, and every OpenRouter/Kling rejection occurred before a render.

## Aliases, retired ids, and non-model workflows

| Id/workflow | Result and wiring |
|---|---|
| `gemini-omni-flash-preview` | Retired alias served by `gemini-omni-1.1-flash`; hidden from pickers and migrated to the canonical id. |
| `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` | Retired aliases served by Gemini Omni; not separate paid models, hidden/migrated. |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001`, `sora-2`, `sora-2-pro` | Legacy accepted ids documented as served by Gemini Omni; removed from selectable lists, so no duplicate paid alias tests were run. |
| `kling-v1`, `kling-v1-5`, `kling-v1-6`, `kling-v2-master` | Retired legacy ids found in old types/preferences. Hidden and migrated; not tested as distinct models. |
| `platform-veo-3.1-managed` | Convenience alias, not a distinct model. Canonical default is Gemini Omni. |
| Runway recipes (`product_ugc`, `product_ad`, etc.) | Workflows, not base models. UGC Studio still obtains the exact live recipe quote, then auto-falls back to Gemini Omni only when Runway rejects before render start for credentials, availability, or provider spending. |
| HeyGen avatars / HyperFrames | Provider workflows without a generic selectable 8-second text-to-video model id; not part of this model sweep. |

## Rewiring outcome

The shared health snapshot marks only `gemini-omni-1.1-flash` working for customer workflows. Customer-app selectors disable failed models, and cross-app routing, defaults, saved-selection migration, Script-to-Video planning/recovery, Faceless, Video Enhancer, SceneForge B-roll, Create, Model Lab and shared generation fallbacks resolve to the canonical id. **Provider Lab is the deliberate exception:** every catalogued model remains selectable so the founder can test with their real browser workspace credential and see the provider’s exact response. Provider-key, `no_credentials`, unavailable-provider and key-spending-limit rejections in customer workflows fall back once to Gemini Omni and surface a plain-language notice. Customer/workspace insufficient-funds and uncertain jobs are never silently resubmitted.

`S2V_KLING_WORKSPACE_TOKEN` was confirmed missing (`unknown_secret`). It is no longer required: new and stale Script-to-Video model selections normalize to Gemini Omni and durable work uses platform service identity. No personal provider key is requested or exposed.

## Post-rewire end-to-end evidence

| App/path | Result | Output |
|---|---|---|
| Shared model health canonical target | PASS, 8s Gemini Omni | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793160551378_wutst0.mp4` |
| Video Enhancer actual `veh-broll-generate` hook (submitted with stale Seedance request to prove normalization) | PASS, normalized to Gemini Omni | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793161932972_y7s5zz.mp4` |
| Faceless actual `faceless-assets` submit + status path | PASS; status transport was fixed after the first poll exposed HTTP 500 | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793161930680_6key5c.mp4` |
| SceneForge actual B-roll submit/poll functions | PASS, 30,670 ms | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793162108474_2qmb3c.mp4` |
| Script-to-Video actual `stv-scene-generate` submit/status functions | PASS, 31,887 ms | `https://storage.googleapis.com/audos-images/generated-videos/omni-omni_1793162208142_qut22r.mp4` |

Browser-token-only flows could not be honestly called end-to-end from this server-function execution surface: UGC Studio, Ads Studio, the browser Provider Lab UI, and Verger’s signed-in customer billing path. Provider Lab remains fully selectable for the founder’s own tests; no server-side verdict disables it. The other source/hook routing was updated and syntax-validated, but no separate output is claimed for those browser-only paths. UGC’s live contract check also refused the tool simulator with `401 A validated workspace session is required`; that is recorded as an unverified browser-session path, not a generation pass. Product Videos and CineAgent do not expose a distinct selectable generative-video model path in the active source inventory.

## Files changed

- `lib/videoEngines.ts`
- `lib/videoEngineClient.ts`
- `lib/videoIntegrations.ts`
- `lib/omniFallback.ts`
- `lib/videoErrors.ts`
- `components/EngineSelector.tsx`
- `apps/VideoProviderLab/labModels.ts`
- `apps/ModelLab/mediaModels.ts`
- `apps/Create/videoTypes.ts`
- `apps/ScriptToVideo/modelPicker.ts`
- `apps/ScriptToVideo/pipeline/videoModelService.ts`
- `apps/ScriptToVideo/friendlyErrors.ts`
- `apps/Faceless/hooks/generateVideo.ts`
- `apps/Faceless/hooks/generateDepthBackground.ts`
- `apps/VideoEnhancer/aiClipsPanel.tsx`
- `apps/UGCStudio/App.tsx`
- `agent/customer-prompt.md`
- `docs/video-model-health-2026-10-28.md`

## Registered server functions changed

- `stv-scene-generate`
- `s2v-recovery-sweeper`
- `faceless-assets`
- `veh-broll-generate`
- `sceneforge-pipeline`
- `ugc-studio-runway`
- `vergeye-ops`
- `generate-video`
- `check-video-status`
- `video-model-health-run` (temporary audit runner, now disabled)

A documentation follow-up was filed for `higgsfield-media` because its published 1–15-second wording did not disclose Hailuo's actual discrete 6/10-second constraint.
