import { pricingRuleText } from '../../../lib/pricing';

/**
 * VERGER CAPABILITY MANIFEST — the explicit, always-current record of what
 * every Vidverge app can and cannot do. Verger's system prompt embeds this
 * text so it never promises anything outside it.
 *
 * Grounded in the REAL registry: ids match config.json `apps[].id` byte for
 * byte (see lib/appIds.ts). `routable` mirrors TARGET_APPS in ../types.ts —
 * only those studios consume a Verger brief via the shared handoff; the rest
 * can be OPENED but a brief would be dropped on their floor.
 */

export type ToolCost = 'free' | 'video_seconds' | 'render_compute';

export interface VergerToolCapability {
  id: string;
  name: string;
  kind: 'studio' | 'media' | 'ai';
  input: string;
  output: string;
  cost: ToolCost;
  approvalRequired: boolean;
  execution: string;
  limits: string[];
}

export interface AppCapability {
  /** config.json app id. */
  id: string;
  name: string;
  does: string;
  inputs: string;
  output: string;
  /** True when saveVidvergeHandoff carries a brief into it. */
  routable: boolean;
  limits: string[];
}

export const CAPABILITIES: AppCapability[] = [
  {
    id: 'video-provider-lab',
    name: 'Video Provider Lab',
    does: 'Generates one quick clip directly with a selected live video model.',
    inputs: 'One self-contained shot prompt, duration, aspect ratio, optional audio and references.',
    output: 'One finished MP4 clip saved to the shared Library.',
    routable: true,
    limits: ['Use only for one continuous clip. Scripted, voiceover, story-led, multi-scene, and 30-second ads belong in Script-to-Video.', 'The exact duration is the credit estimate and generation never starts above the Autopilot budget.'],
  },
  {
    id: 'sceneforge',
    name: 'SceneForge',
    does: 'Presenter-led avatar video: HeyGen presenter, ElevenLabs voice, agent-planned motion graphics and B-roll.',
    inputs: 'Script or idea; presenter + voice choices; style/niche/music choices.',
    output: 'One 16:9 master AND a native 9:16 portrait layout, MP4.',
    routable: true,
    limits: ['Credits charged once per video before the avatar render: HeyGen avatar seconds, ElevenLabs narration, word timing and the Remotion drafts/finals, at real engine cost + 30%.', 'Long scripts are chunked; drafts come as four 5s style previews to pick from.'],
  },
  {
    id: 'script-to-video',
    name: 'Script-to-Video',
    does: 'Turns an idea or preserved script into an editable screenplay, timed cinematic master blocks, cast/reference packs, capability-based model routing, continuity, audio post-production and final assembly.',
    inputs: 'Script or idea; optional @name character references and brand details the user has confirmed.',
    output: 'A reviewable V2 production plan and finished MP4 film up to 10 minutes, with editable scenes, audio layers and export history.',
    routable: true,
    limits: ['Maximum assembled duration 10 minutes. Per-clip caps: Gemini Omni 8s (720p, up to 10 refs), Seedance 2.5 4–30s, Seedance 2.0 Fast 4–8s measured, Kling 5s/10s silent, Runway 2–10s when live.', 'The user\u2019s own script wording is never replaced without acceptance.', 'Natural-language handoff is saved through s2v-agent-handoff before the studio opens. Planning spends no credits.', 'Kling, Seedance and Runway may require the signed-in tab to remain open; one provider task id is saved and polling never resubmits.'],
  },
  {
    id: 'faceless',
    name: 'Faceless',
    does: 'Narration-first faceless film timed to the spoken words, with editorial QA.',
    inputs: 'Topic or script; voice and style choices.',
    output: 'Finished narration-led MP4.',
    routable: true,
    limits: ['No on-camera presenter — use SceneForge for that.'],
  },
  {
    id: 'ugc-studio',
    name: 'UGC Studio',
    does: 'Creates original UGC product ads with regional synthetic actors through the existing Runway product_ugc workflow.',
    inputs: 'Product image or URL, audience/region, language, creator format, duration and claim-safe script direction.',
    output: 'Creator-led product-ad MP4 with durable saved history.',
    routable: true,
    limits: ['A product reference is required before generation.', 'Default is 15s vertical; explicit actor, language and regional choices are preserved.', 'Public competitor evidence may inform structure, but footage, branding, names and exact wording are never copied.'],
  },
  {
    id: 'video-enhancer',
    name: 'Video Enhancer',
    does: 'Hands-on editing of footage the user already has: transcript cuts, silence/filler removal, captions, overlays, reframing, multi-format export.',
    inputs: 'Uploaded footage.',
    output: 'Edited MP4 in chosen aspect ratios.',
    routable: true,
    limits: ['Edits existing footage; it does not generate new scenes from text.'],
  },
  {
    id: 'ads-studio',
    name: 'Vergeye Ads Studio',
    does: 'Brand and competitor research, saved public evidence, ranked creative angles and original ad concepts.',
    inputs: 'Brand website or profile; research question or campaign goal.',
    output: 'Evidence-backed findings, angles and planning briefs that can be handed to a production app.',
    routable: true,
    limits: ['Research and concept planning only — it is never the final renderer for a short ad or video request.', 'Never fabricates testimonials or unsubstantiated competitor claims.'],
  },
  {
    id: 'cineagent',
    name: 'Studio (CineAgent)',
    does: 'Fully autonomous editor: upload raw footage, receive a directed, scored, reviewed 1080p cut.',
    inputs: 'Uploaded raw footage.',
    output: 'Autonomous 1080p MP4 cut.',
    routable: false,
    limits: ['No scene/prompt/timeline controls — use Video Enhancer for hands-on edits.', 'Open it directly; a Verger brief is not carried in.'],
  },
  {
    id: 'brand-context',
    name: 'Brand Kit',
    does: 'Reads a public website and saves verified brand context (identity, offer, audience, visuals). Studios use it only when the user picks "Use my saved Brand Kit" and confirms it.',
    inputs: 'Public website URL.',
    output: 'Saved reusable brand profile.',
    routable: false,
    limits: ['A setup surface, not a generator.', 'Open it directly; a Verger brief is not carried in.'],
  },
];

/**
 * The only tool registry the planner may promise. Studio entries delegate to
 * the existing product surfaces/server functions; media entries are called by
 * Verger directly. Adding a tool anywhere else does not make it available.
 */
export const TOOL_REGISTRY: VergerToolCapability[] = [
  ...CAPABILITIES.map((app): VergerToolCapability => ({
    id: `studio.${app.id}`,
    name: app.name,
    kind: 'studio',
    input: app.inputs,
    output: app.output,
    cost: app.id === 'brand-context' || app.id === 'video-enhancer' || app.id === 'script-to-video' || app.id === 'ads-studio' ? 'free' : 'video_seconds',
    approvalRequired: !['brand-context', 'video-enhancer', 'script-to-video', 'ads-studio'].includes(app.id),
    execution: app.id === 'script-to-video'
      ? 'Session-owned s2v-agent-handoff server function saves the intake; Script-to-Video consumes it and asks approval before any paid generation.'
      : app.id === 'video-provider-lab'
        ? 'Native app bridge fills the live Provider Lab request, starts one approved model run and emits real progress, failure or finished-video events.'
        : app.routable ? `Prefilled handoff to existing app ${app.id}; its registered worker owns the durable job.` : `Open existing app ${app.id}; no brief handoff contract is available.`,
    limits: app.limits,
  })),
  {
    id: 'motion.engine',
    name: 'Unified Agentic Motion Engine',
    kind: 'ai',
    input: 'Natural-language objective, an http(s) website URL or existing video/screenshots, verified transcript timing, user-confirmed brand details and optional canonical project id.',
    output: 'A versioned canonical motion project plus a durable planning, composition, render, visual-QA and targeted-repair job. Website URLs use mode saas-launch with sourceUrl preserved.',
    cost: 'render_compute',
    approvalRequired: true,
    execution: 'Authenticated vv-motion-engine v1 API; durable stages run in vv-motion-worker and vv-render-job.',
    limits: ['A website URL is sufficient input for the video itself: infer 30s and 9:16/16:9 when omitted. Brand name, logo and colours are confirmed with the user in one grouped question, never assumed from the saved Brand Kit.', 'Planning and analysis are free. Paid media generation requires explicit approval.', 'Native exports are 16:9 and 9:16. A 1:1 design stage is preserved but native square MP4 export is disabled until the platform renderer supports it.'],
  },
  {
    id: 'research.ads-library',
    name: 'Research ad libraries',
    kind: 'ai',
    input: 'Competitor, brand, niche or keyword plus Meta, TikTok or LinkedIn.',
    output: 'Saved public ads ranked only from observed longevity, engagement and variant signals, with source actor and honest empty/failure state.',
    cost: 'free',
    approvalRequired: false,
    execution: 'vidverge-research server function → shared approved actor registry and fallback chain → research_topics/research_items.',
    limits: ['At most 12 results per live platform lookup.', '24-hour session-owned cache.', 'Never invents missing ad copy, metrics or performance.'],
  },
  {
    id: 'research.social-profile',
    name: 'Research social profiles and posts',
    kind: 'ai',
    input: 'Public Instagram, TikTok, X, Facebook, YouTube or Reddit handle, query or URL.',
    output: 'Saved public profile/post evidence, source actor, observed metrics and real no-data/all-failed status.',
    cost: 'free',
    approvalRequired: false,
    execution: 'Same vidverge-research server actor chain and cache as Ads Studio.',
    limits: ['Public evidence only.', 'No LinkedIn employee scraper.', 'No viewer, commenter or private-account data.'],
  },
  {
    id: 'research.web-page',
    name: 'Research a public web page',
    kind: 'ai',
    input: 'One validated public http(s) URL.',
    output: 'Up to five cached pages of factual product/brand/page evidence with answering actor named.',
    cost: 'free',
    approvalRequired: false,
    execution: 'vidverge-research web fallback chain; local/private/credential-bearing URLs are refused before an actor runs.',
    limits: ['No localhost or private-network addresses.', 'At most five pages and 12 saved results.', '24-hour cache.'],
  },
  {
    id: 'research.discover',
    name: 'Discover public sources',
    kind: 'ai',
    input: 'Google-search, public contact-detail or Google Places discovery query.',
    output: 'Saved discovery evidence with exact actor provenance.',
    cost: 'free',
    approvalRequired: false,
    execution: 'vidverge-research discovery fallback chain.',
    limits: ['No GeM/tender or IndiaMART sources.', 'At most 12 results.', 'Missing data stays missing.'],
  },
  {
    id: 'research.saved-library',
    name: 'Read saved Research library',
    kind: 'ai',
    input: 'List saved topics or read one topic id.',
    output: 'The same session-owned topics and evidence visible in Vergeye Ads Studio and Verger.',
    cost: 'free',
    approvalRequired: false,
    execution: 'research_topics/research_items filtered by the validated workspace session.',
    limits: ['Read-only.', 'Never exposes another session or buyer.'],
  },
  {
    id: 'research.recreate-top-performer',
    name: 'Recreate top performer as an original brief',
    kind: 'ai',
    input: 'One saved evidence item plus the customer product/brand context.',
    output: 'Original hook, script, CTA and scene brief preserving only observed structure, pacing and format.',
    cost: 'free',
    approvalRequired: false,
    execution: 'Shared researchLibrary creative analysis and original UGC brief builder; production is a separate routed action.',
    limits: ['Never copies footage, logos, names, exact wording or unsupported claims.', 'Video generation still requires its normal credit approval.'],
  },
  {
    id: 'media.trim',
    name: 'Server video trim',
    kind: 'media',
    input: 'Public source video URL and floating-point start/end seconds.',
    output: 'Permanent MP4 clip.',
    cost: 'free',
    approvalRequired: false,
    execution: 'POST /api/video/clip',
    limits: ['Maximum 10 minutes per call; Verger visual edits always trim at most 8 seconds.'],
  },
  {
    id: 'media.frames',
    name: 'Server frame sampler',
    kind: 'media',
    input: 'Public video URL and 1–20 timestamps.',
    output: 'Permanent PNG frame URLs.',
    cost: 'free',
    approvalRequired: false,
    execution: 'POST /api/video/frames',
    limits: ['At most 20 timestamps per request.'],
  },
  {
    id: 'ai.vision-edit-prompt',
    name: 'Vision edit prompt director',
    kind: 'ai',
    input: 'Sampled frame URLs, exact timestamp and plain-language edit request.',
    output: 'Detailed preserve/change/timing instruction.',
    cost: 'free',
    approvalRequired: false,
    execution: 'Authenticated gpt-6.1-sol image-input call through /proxy/openai/v1/chat/completions.',
    limits: ['Interactive tier: reasoning_effort medium and max_completion_tokens 6000.'],
  },
  {
    id: 'video.omni-flash-edit',
    name: 'Omni Flash source-video edit',
    kind: 'media',
    input: 'Public <=8s MP4/WebM/QuickTime/MPEG/FLV/WMV/3GPP clip, detailed prompt and source timestamp.',
    output: 'Edited MP4 clip, later spliced into the source.',
    cost: 'video_seconds',
    approvalRequired: true,
    execution: 'Authenticated POST /api/veo/generate/video with model gemini-omni-1.1-flash, videoData and videoMimeType.',
    limits: ['Maximum 8 seconds, 16:9 or 9:16, 720p.', 'One submit only; never automatically retry a paid edit.', 'UI estimates 8 credits before submission.'],
  },
  {
    id: 'media.splice',
    name: 'Server video splice',
    kind: 'media',
    input: 'Ordered permanent MP4 URLs (original prefix, edited clip, original suffix).',
    output: 'Verified permanent MP4 and catalog record.',
    cost: 'render_compute',
    approvalRequired: false,
    execution: 'POST /api/workspaces/:workspaceId/videos/stitch',
    limits: ['Plain concatenation; trim every segment first.', 'Failure is automatically wallet-refunded by the platform.'],
  },
];

/** Hard platform limits that apply to EVERYTHING Verger plans. */
export const GLOBAL_LIMITS: string[] = [
  `Pricing meter: ${pricingRuleText()}`,
  'ALWAYS state the credit cost and get an explicit yes BEFORE any step that spends credits.',
  'Output is MP4 only (no transparent WebM); server renders are 1920×1080 @ 30fps and native portrait is finished at 1080×1920. The engine preserves 1:1 project design but must not promise native square MP4 until the platform renderer supports it. No engine delivers 4K. SceneForge and Faceless can use ElevenLabs premade voices without Voice Studio.',
  'Script-to-Video picker engines: Gemini Omni 1.1 Flash, Seedance 2.5, Seedance 2.0 Fast, Kling 3.0 Omni/3.0/2.6/2.5 Turbo, and live Runway Gen-4.5/Turbo. Never call a picker-listed model unavailable from memory; carry the exact request into the studio, which reads live capability status.',
  'Omni Flash source-video editing accepts videoData plus videoMimeType, at most 8 seconds, 16:9/9:16 and 720p. Visual edits trim first, analyse sampled frames, ask approval, submit once, then splice server-side.',
  'Every browser provider call sends X-Workspace-DB-Token. Long-running work persists its operation id before polling so refresh/reopen never resubmits or re-spends; when the selected provider requires browser authentication, tell the customer to keep the signed-in tab open.',
  'Never overwrite work the user is actively editing; propose, then let them accept.',
];

export function appCapability(id: unknown): AppCapability | null {
  if (typeof id !== 'string') return null;
  return CAPABILITIES.find((c) => c.id === id) || null;
}

/** Ids Verger may open with a prefilled brief. */
export function routableAppIds(): string[] {
  return CAPABILITIES.filter((c) => c.routable).map((c) => c.id);
}

/** Every retained production app Verger may open, including open-only tools. */
export function openableAppIds(): string[] {
  return CAPABILITIES.map((c) => c.id);
}

/** The manifest rendered for the system prompt. */
export function toolRegistryText(): string {
  return TOOL_REGISTRY.map((tool) =>
    `• ${tool.id} — ${tool.name}\n  input: ${tool.input}\n  output: ${tool.output}\n  execution: ${tool.execution}\n  cost: ${tool.cost}; approval: ${tool.approvalRequired ? 'required' : 'not required'}\n  limits: ${tool.limits.join(' ')}`,
  ).join('\n');
}

export function capabilityManifestText(): string {
  const apps = CAPABILITIES.map((c) => {
    const route = c.routable ? 'routable: Verger can open it with a prefilled brief' : 'open only: a brief is NOT carried in';
    return `• ${c.name} (id ${c.id}) — ${c.does}\n  inputs: ${c.inputs}\n  output: ${c.output}\n  ${route}\n  limits: ${c.limits.join(' ')}`;
  }).join('\n');
  return `APPS:\n${apps}\n\nHARD PLATFORM LIMITS:\n${GLOBAL_LIMITS.map((l) => `• ${l}`).join('\n')}`;
}
