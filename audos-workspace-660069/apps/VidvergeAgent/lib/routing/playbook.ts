export type RoutingAppId =
  | 'script-to-video'
  | 'faceless'
  | 'sceneforge'
  | 'video-provider-lab'
  | 'cineagent'
  | 'ugc-studio'
  | 'ads-studio'
  | 'video-enhancer'
  | 'brand-context';

export interface RoutingDecision {
  app: RoutingAppId;
  reason: string;
  confidence: number;
  brief: string;
  params: Record<string, unknown>;
  needs_clarification: boolean;
  clarification_question?: string;
}

export interface RoutingCorrection {
  input_summary: string;
  corrected_app: RoutingAppId;
  created_at?: string;
}

export const ROUTING_PLAYBOOK = [
  { app: 'script-to-video', intent: 'Scripted, voiceover, story-led or multi-scene video; every 30s ad; recurring series with consistent characters.', required: 'Idea or script; target length; aspect; language/accent. Brand Kit and references are reused when present.', defaults: '30s, 9:16 for social and 16:9 for web, saved Brand Kit, continuity on, planning before paid Start.' },
  { app: 'faceless', intent: 'Narration-first film with no presenter on camera.', required: 'Topic or script; voice/style; length and aspect.', defaults: 'Narrated editorial structure, 9:16 for social, saved Brand Kit.' },
  { app: 'sceneforge', intent: 'Avatar, spokesperson, talking-head, presenter-led explainer, product story or brand story.', required: 'Script/idea, presenter and voice, niche, style, music and B-roll amount.', defaults: 'HeyGen presenter, ElevenLabs voice, 16:9 master plus best-effort native 9:16.' },
  { app: 'video-provider-lab', intent: 'One quick continuous clip or explicit model comparison.', required: 'One self-contained shot prompt, 4–30s, aspect, audio and references.', defaults: '8s when no length is stated; one clip only; no script or multi-scene promise.' },
  { app: 'ugc-studio', intent: 'UGC product ad with a regional synthetic creator/actor.', required: 'Product image or URL, audience/region, language, format and claim-safe brief.', defaults: '15s actor-speaks product demo; regional actor; 9:16.' },
  { app: 'ads-studio', intent: 'Competitor research, winning-ad evidence, hooks, angles and concepts only.', required: 'Brand/competitor URL or query, platforms and campaign goal.', defaults: 'Research first; production is routed separately after a concept is accepted.' },
  { app: 'video-enhancer', intent: 'Hands-on edit or enhancement of an existing video.', required: 'Uploaded video plus requested cuts, captions, overlays, reframing or export.', defaults: 'Keep source footage; never generate unrelated scenes.' },
  { app: 'cineagent', intent: 'Autonomous post-production of raw footage when the user wants the editor to decide.', required: 'Uploaded footage; optional must-keep moments, tone and audience.', defaults: 'Autonomous 1080p edit with music/captions chosen by the editor.' },
  { app: 'brand-context', intent: 'Brand setup or website/social scan for reusable identity.', required: 'Public website or social reference.', defaults: 'Scan, show sourced fields, require review before save.' },
] as const;

export const WORKED_ROUTING_EXAMPLES: Array<{ user: string; app: RoutingAppId; reason: string; brief: string }> = [
  { user: 'Make a 30 second ad for my app', app: 'script-to-video', reason: 'Every 30s ad is multi-scene production.', brief: '30s app ad; build and review a scene plan before Start.' },
  { user: 'Use SceneForge instead', app: 'sceneforge', reason: 'Explicit app override wins.', brief: 'Preserve the current creative brief and send it to SceneForge.' },
  { user: 'https://example.com make a launch video', app: 'script-to-video', reason: 'Scrape the URL first, then produce a story-led launch film.', brief: 'Ground the film in scraped page evidence and the saved Brand Kit.' },
  { user: 'One 8 second macro shot of a watch', app: 'video-provider-lab', reason: 'One self-contained continuous clip.', brief: '8s macro product shot, no multi-scene script.' },
  { user: 'Compare the same prompt on two video models', app: 'video-provider-lab', reason: 'Direct model comparison belongs in Provider Lab.', brief: 'Keep prompt, aspect and duration identical between model runs.' },
  { user: 'Make an avatar explain our pricing', app: 'sceneforge', reason: 'On-camera avatar presenter requested.', brief: 'Presenter-led pricing explainer using verified Brand Kit facts.' },
  { user: 'Create a spokesperson brand story', app: 'sceneforge', reason: 'Spokesperson plus brand narrative.', brief: 'Talking-head brand story with motion graphics and supporting B-roll.' },
  { user: 'A faceless documentary about battery recycling', app: 'faceless', reason: 'Narration-first with no presenter.', brief: 'Editorial faceless documentary with sourced visual plan.' },
  { user: 'UGC ad with a Delhi creator speaking Hinglish', app: 'ugc-studio', reason: 'Regional creator-led UGC intent.', brief: '15s 9:16 Hinglish UGC demo with a Delhi synthetic actor.' },
  { user: 'Find winning Meta ads from my competitors', app: 'ads-studio', reason: 'Evidence and competitor research, not rendering.', brief: 'Research public Meta evidence and rank only observed signals.' },
  { user: 'Give me three ad concepts from this competitor URL', app: 'ads-studio', reason: 'Concept research requested without final production.', brief: 'Scrape public evidence, then write original claim-safe concepts.' },
  { user: 'Cut filler words and add captions to this upload', app: 'video-enhancer', reason: 'Hands-on changes to existing footage.', brief: 'Transcript-led cut, captions and export; preserve original footage.' },
  { user: 'Edit this raw vlog for me, you decide everything', app: 'cineagent', reason: 'Autonomous editing of uploaded footage.', brief: 'Direct and finish an autonomous 1080p vlog cut.' },
  { user: 'Scan my website and save my colors and tone', app: 'brand-context', reason: 'Reusable brand setup.', brief: 'Scan the public website, show sources and save after review.' },
  { user: 'Make a series with the same two characters every week', app: 'script-to-video', reason: 'Multi-scene continuity and reusable character references.', brief: 'Create a consistent character bible and reusable series plan.' },
  { user: 'I have exactly 60 credits; make the best ad you can', app: 'script-to-video', reason: 'Budgeted multi-scene ad.', brief: 'Keep total generated seconds at or below 60 and show authorization before Start.' },
  { user: 'Use Faceless instead of an avatar', app: 'faceless', reason: 'Explicit no-presenter override.', brief: 'Preserve the current script but route to narration-first Faceless.' },
  { user: 'Turn this voiceover script into a film', app: 'script-to-video', reason: 'Script plus voiceover requires timed multi-scene planning.', brief: 'Preserve script wording and map it to timed scenes.' },
  { user: 'Make one quick clip of waves at sunrise', app: 'video-provider-lab', reason: 'Quick one-shot request.', brief: 'Single continuous sunrise-wave clip.' },
  { user: 'Make a product demo with a creator holding the bottle', app: 'ugc-studio', reason: 'Creator-style product demonstration.', brief: 'Regional synthetic creator demonstrates the supplied product image.' },
  { user: 'Improve the lighting and reframe my existing reel', app: 'video-enhancer', reason: 'Enhancement of an existing video.', brief: 'Reframe and grade the uploaded reel without replacing its content.' },
  { user: 'Build our brand kit from our homepage and Instagram', app: 'brand-context', reason: 'Brand identity and social scan.', brief: 'Read public homepage/social evidence and keep every field inspectable.' },
  { user: 'Create a product launch video', app: 'script-to-video', reason: 'Product Video is not registered; scripted product launch is supported here.', brief: 'Multi-scene product launch grounded in Brand Kit and product evidence.' },
  { user: 'Research hooks, then make the winning one as a video', app: 'ads-studio', reason: 'Research is the first explicit task; production follows as a separate route.', brief: 'Collect public evidence and produce an original brief before asking to render.' },
  { user: 'Make a talking-head product story and also a portrait cut', app: 'sceneforge', reason: 'Talking head and dual-format output.', brief: 'Presenter-led product story, 16:9 plus best available 9:16.' },
  { user: 'No, use Script-to-Video for this', app: 'script-to-video', reason: 'User correction overrides the previous route.', brief: 'Carry the current brief and parameters unchanged into Script-to-Video.' },
];

const APP_NAMES: Record<RoutingAppId, string> = {
  'script-to-video': 'Script-to-Video', faceless: 'Faceless', sceneforge: 'SceneForge',
  'video-provider-lab': 'Video Provider Lab', cineagent: 'CineAgent', 'ugc-studio': 'UGC Studio',
  'ads-studio': 'Vergeye Ads Studio', 'video-enhancer': 'Video Enhancer', 'brand-context': 'Brand Kit',
};

const OVERRIDES: Array<[RegExp, RoutingAppId]> = [
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+script[- ]to[- ]video\b/i, 'script-to-video'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+sceneforge\b/i, 'sceneforge'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+faceless\b/i, 'faceless'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:provider lab|video provider lab)\b/i, 'video-provider-lab'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:ugc|ugc studio)\b/i, 'ugc-studio'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:video enhancer|enhancer)\b/i, 'video-enhancer'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:cineagent|studio)\b/i, 'cineagent'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:ads studio|vergeye)\b/i, 'ads-studio'],
  [/\b(?:use|send (?:it|this) to|route (?:it|this) to)\s+(?:brand kit|brand context)\b/i, 'brand-context'],
];

function duration(text: string): number {
  return Math.max(4, Math.min(600, Number(text.match(/\b(\d{1,3})\s*(?:seconds?|secs?|s)\b/i)?.[1]) || 30));
}
function budget(text: string): number | null {
  const value = Number(text.match(/\b(\d{1,5})\s*credits?\b/i)?.[1]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}
function aspect(text: string): '9:16' | '16:9' | '1:1' {
  return /\b(?:9:16|portrait|vertical|reels?|shorts?|tiktok)\b/i.test(text) ? '9:16' : /\b(?:1:1|square)\b/i.test(text) ? '1:1' : '16:9';
}
function summary(text: string): string { return text.replace(/\[SCRAPED REFERENCE[\s\S]*$/i, '').replace(/\[Attached file:[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 280); }
function make(app: RoutingAppId, reason: string, confidence: number, text: string, extra: Record<string, unknown> = {}): RoutingDecision {
  const seconds = duration(text);
  const maxAuthorizedCredits = budget(text);
  return { app, reason, confidence, brief: summary(text), params: { durationSeconds: seconds, aspectRatio: aspect(text), ...(maxAuthorizedCredits ? { maxAuthorizedCredits } : {}), ...extra }, needs_clarification: false };
}

export function routeRequest(text: string, corrections: RoutingCorrection[] = []): RoutingDecision {
  const clean = summary(text);
  const lower = clean.toLowerCase();
  for (const [pattern, app] of OVERRIDES) if (pattern.test(clean)) return make(app, `you explicitly asked to use ${APP_NAMES[app]}`, 1, clean, { explicitOverride: true });

  const url = clean.match(/https?:\/\/[^\s)\]}]+/i)?.[0] || null;
  if (/\b(?:brand kit|brand setup|save (?:my|our) brand|scan (?:my|our) (?:brand|website)|colors? and tone)\b/i.test(clean)) return make('brand-context', 'this is reusable brand setup rather than video production', .98, clean, { sourceUrl: url, scrapeFirst: Boolean(url) });
  if (/\b(?:competitor|winning ads?|ad research|ads? library|research hooks?|research angles?|concepts? only)\b/i.test(clean)) return make('ads-studio', 'you asked for public ad evidence, hooks or concepts rather than a final render', .97, clean, { sourceUrl: url, scrapeFirst: Boolean(url) });
  if (/\b(?:edit|enhance|reframe|caption|remove (?:filler|silence)|trim|colour grade|color grade)\b/i.test(clean) && /\b(?:existing|uploaded|upload|footage|video|reel|clip)\b/i.test(clean)) return make(/\b(?:you decide|autonomous|do everything|raw footage)\b/i.test(clean) ? 'cineagent' : 'video-enhancer', /\b(?:you decide|autonomous|do everything|raw footage)\b/i.test(clean) ? 'you want autonomous post-production of existing footage' : 'you want hands-on changes to existing footage', .96, clean);
  if (/\b(?:ugc|creator[- ]style|regional actor|unboxing|product demo with (?:a|an) creator)\b/i.test(clean)) return make('ugc-studio', 'this is a creator-led UGC product ad', .97, clean, { language: /\bhinglish\b/i.test(clean) ? 'Hinglish' : undefined });
  if (/\b(?:avatar|spokesperson|talking[- ]head|presenter|digital twin|on[- ]camera host)\b/i.test(clean)) return make('sceneforge', 'an on-camera presenter or avatar is central to the request', .98, clean);
  if (/\b(?:faceless|no presenter|narration[- ]first|documentary)\b/i.test(clean)) return make('faceless', 'the film is narration-led and does not need an on-camera presenter', .95, clean);
  if (/\b(?:single clip|one clip|one shot|one scene|quick clip|model comparison|compare models?)\b/i.test(clean) && !/\b(?:script|voiceover|story|ad|commercial|series|multi[- ]scene)\b/i.test(clean) && duration(clean) <= 30) return make('video-provider-lab', 'this is one self-contained continuous clip', .96, clean);
  if (/\b(?:30\s*(?:seconds?|secs?|s)|script|voiceover|story|ad|commercial|series|consistent characters?|multi[- ]scene|product launch)\b/i.test(clean) || url) return make('script-to-video', url ? 'the URL should be scraped first, then turned into a grounded multi-scene production' : 'this needs scripted multi-scene planning and continuity', .94, clean, { sourceUrl: url, scrapeFirst: Boolean(url) });

  const words = new Set(lower.split(/[^a-z0-9]+/).filter((word) => word.length > 3));
  const learned = corrections.find((item) => item.corrected_app && item.input_summary.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3).filter((word) => words.has(word)).length >= 2);
  if (learned) return make(learned.corrected_app, `this matches your recent preference for ${APP_NAMES[learned.corrected_app]}`, .84, clean, { learnedPreference: true });

  return { ...make('script-to-video', 'the request is broad and could be presenter-led or presenter-free', .48, clean), needs_clarification: true, clarification_question: 'Should this be presenter/avatar-led, faceless narration, or a cinematic multi-scene film?' };
}

export const PLAYBOOK_SUMMARY = 'Verger routes one-shot clips to Provider Lab; scripts, stories, series and every 30s ad to Script-to-Video; presenters to SceneForge; UGC creator ads to UGC Studio; narration-first work to Faceless; research to Vergeye; existing-footage edits to Video Enhancer or autonomous CineAgent; and brand scans to Brand Kit. URLs are scraped before routing, explicit “use X instead” requests win, and low confidence asks one question.';
