import { ActorAccessError, runPlatformActors, type ResearchPlatform } from './apifyActors';

export type ResearchTopic = {
  id: number; normalized_topic_key: string; label: string; platforms: ResearchPlatform[];
  status: 'pending' | 'scraping' | 'complete' | 'partial' | 'failed';
  scraped_at?: string | null; item_count: number; platform_status?: PlatformResearchStatus[] | null;
  created_at?: string; updated_at?: string;
};

export type ResearchItem = {
  id: number; topic_id: number; platform: ResearchPlatform; advertiser?: string | null;
  creative_url?: string | null; thumbnail_url?: string | null; copy_transcript?: string | null;
  format?: string | null; run_days?: number | null; first_seen?: string | null;
  engagement?: Record<string, number> | null; longevity_signal?: number | null;
  variant_count?: number | null; performance_score: number; raw_json: any; source_actor: string;
};

export type PlatformResearchStatus = {
  platform: ResearchPlatform; status: 'waiting' | 'running' | 'success' | 'empty' | 'failed' | 'access_denied';
  actorId?: string; itemCount?: number; message?: string;
};

export type CreativeBreakdown = {
  hook: string; angle: string; offer: string; cta: string; format: string;
  structure: string[]; evidenceNote: string;
};

export type UgcRecreation = {
  title: string; hook: string; script: string; cta: string; format: string; length: number;
  pacing: string; sourceStructure: string[];
  scenes: Array<{ role: 'hook' | 'demo' | 'proof' | 'cta'; duration: number; line: string; action: string }>;
};

const PLATFORMS: ResearchPlatform[] = ['meta', 'tiktok', 'linkedin', 'instagram', 'youtube', 'reddit', 'web'];

function db(): any {
  const client = (window as any).__workspaceDb;
  if (!client) throw new Error('Saved research is unavailable until your workspace session finishes loading.');
  return client;
}

function rows(result: any): any[] { return Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : result?.data ? [result.data] : []; }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function finite(value: unknown): number | null { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function dateValue(value: unknown): string | null { const valueText = text(value); if (!valueText) return null; const date = new Date(valueText); return Number.isFinite(date.getTime()) ? date.toISOString() : null; }
function pick(source: any, keys: string[]): any { for (const key of keys) { const value = key.split('.').reduce((current, part) => current?.[part], source); if (value !== undefined && value !== null && value !== '') return value; } return null; }

export function normalizeTopicKey(topic: string, _platforms: ResearchPlatform[]): string {
  return topic.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').replace(/[^a-z0-9@._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function engagementFrom(raw: any): Record<string, number> | null {
  const candidates: Record<string, string[]> = {
    views: ['views', 'viewCount', 'videoViews', 'reach', 'impressions'],
    likes: ['likes', 'likesCount', 'likeCount', 'diggCount'],
    comments: ['comments', 'commentsCount', 'commentCount'],
    shares: ['shares', 'sharesCount', 'shareCount'],
    saves: ['saves', 'savesCount', 'bookmarkCount'],
  };
  const output: Record<string, number> = {};
  for (const [label, keys] of Object.entries(candidates)) {
    const value = finite(pick(raw, keys));
    if (value !== null) output[label] = value;
  }
  return Object.keys(output).length ? output : null;
}

function runDaysFrom(raw: any, firstSeen: string | null): number | null {
  const direct = finite(pick(raw, ['runDays', 'run_days', 'durationDays', 'activeDays', 'longevityDays']));
  if (direct !== null) return Math.round(direct);
  const lastSeen = dateValue(pick(raw, ['lastSeen', 'last_seen', 'endDate', 'end_date', 'adDeliveryStopTime']));
  if (!firstSeen) return null;
  const end = lastSeen ? new Date(lastSeen).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(firstSeen).getTime()) / 86400000));
}

export function estimatePerformanceScore(signals: { runDays: number | null; engagement: Record<string, number> | null; variantCount: number | null }): number {
  let score = 0;
  if (signals.runDays !== null) score += Math.min(35, (signals.runDays / 90) * 35);
  if (signals.engagement) {
    const total = Object.values(signals.engagement).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total > 0) score += Math.min(50, (Math.log10(total + 1) / 7) * 50);
  }
  if (signals.variantCount !== null) score += Math.min(15, (signals.variantCount / 10) * 15);
  return Math.round(Math.min(100, score) * 10) / 10;
}

function inferFormat(raw: any, platform: ResearchPlatform): string {
  const explicit = text(pick(raw, ['format', 'mediaType', 'type', 'adFormat', 'creativeType']));
  if (explicit) return explicit.replace(/_/g, ' ');
  const video = pick(raw, ['videoUrl', 'video_url', 'video.url', 'media.videoUrl']);
  const image = pick(raw, ['imageUrl', 'image_url', 'thumbnailUrl', 'thumbnail_url']);
  if (video) return platform === 'youtube' ? 'video' : 'short-form video';
  if (image) return 'image';
  return 'format not reported';
}

export function normalizeResearchItem(raw: any, platform: ResearchPlatform, topicId: number, sourceActor: string): Omit<ResearchItem, 'id'> {
  const firstSeen = dateValue(pick(raw, ['firstSeen', 'first_seen', 'startDate', 'start_date', 'publishedAt', 'timestamp', 'adDeliveryStartTime', 'date']));
  const runDays = runDaysFrom(raw, firstSeen);
  const engagement = engagementFrom(raw);
  const variantCount = finite(pick(raw, ['variantCount', 'variant_count', 'variantsCount', 'creativeCount', 'adsCount']));
  const creativeUrl = text(pick(raw, ['creativeUrl', 'creative_url', 'url', 'postUrl', 'post_url', 'adLibraryUrl', 'link', 'videoUrl', 'video_url']));
  const thumbnailUrl = text(pick(raw, ['thumbnailUrl', 'thumbnail_url', 'imageUrl', 'image_url', 'displayUrl', 'picture', 'video.thumbnailUrl']));
  const copy = text(pick(raw, ['copy', 'caption', 'text', 'body', 'description', 'transcript', 'adText', 'title']));
  const advertiser = text(pick(raw, ['advertiser', 'advertiserName', 'pageName', 'accountName', 'channelName', 'username', 'author', 'ownerUsername']));
  const score = estimatePerformanceScore({ runDays, engagement, variantCount: variantCount === null ? null : Math.round(variantCount) });
  return {
    topic_id: topicId,
    platform,
    advertiser: advertiser || null,
    creative_url: creativeUrl || null,
    thumbnail_url: thumbnailUrl || null,
    copy_transcript: copy || null,
    format: inferFormat(raw, platform),
    run_days: runDays,
    first_seen: firstSeen,
    engagement,
    longevity_signal: runDays === null ? null : Math.round(Math.min(1, runDays / 90) * 1000) / 1000,
    variant_count: variantCount === null ? null : Math.round(variantCount),
    performance_score: score,
    raw_json: raw,
    source_actor: sourceActor,
  };
}

export async function listSavedResearchTopics(): Promise<ResearchTopic[]> {
  const result = await db().from('research_topics').orderBy('updated_at', 'desc').limit(100).get();
  return rows(result) as ResearchTopic[];
}

export async function loadResearchItems(topicId: number): Promise<ResearchItem[]> {
  const result = await db().from('research_items').eq('topic_id', topicId).orderBy('performance_score', 'desc').limit(200).get();
  return (rows(result) as ResearchItem[]).map((item) => ({ ...item, performance_score: Number(item.performance_score || 0), longevity_signal: item.longevity_signal == null ? null : Number(item.longevity_signal) }));
}

async function loadTopicByKey(key: string): Promise<ResearchTopic | null> {
  const result = await db().from('research_topics').eq('normalized_topic_key', key).orderBy('updated_at', 'desc').limit(1).get();
  return (rows(result)[0] as ResearchTopic) || null;
}

async function createTopic(label: string, platforms: ResearchPlatform[], key: string): Promise<ResearchTopic> {
  try {
    await db().from('research_topics').insert({
      normalized_topic_key: key,
      label,
      platforms,
      status: 'pending',
      scraped_at: null,
      item_count: 0,
      platform_status: platforms.map((platform) => ({ platform, status: 'waiting' })),
    });
  } catch (error) {
    const existing = await loadTopicByKey(key);
    if (existing) return existing;
    throw error;
  }
  const created = await loadTopicByKey(key);
  if (!created) throw new Error('The saved research topic could not be created.');
  return created;
}

export async function getSavedResearch(topic: string, platforms: ResearchPlatform[]) {
  const key = normalizeTopicKey(topic, platforms);
  const saved = await loadTopicByKey(key);
  return saved ? { topic: saved, items: await loadResearchItems(saved.id) } : null;
}

export async function researchTopic(
  label: string,
  platforms: ResearchPlatform[],
  options: { refresh?: boolean; onProgress?: (statuses: PlatformResearchStatus[], message: string) => void } = {},
) {
  const cleaned = label.trim();
  if (!cleaned) throw new Error('Enter a topic, niche, competitor, handle, or URL.');
  const selected = PLATFORMS.filter((platform) => platforms.includes(platform));
  if (!selected.length) throw new Error('Choose at least one platform.');
  const key = normalizeTopicKey(cleaned, selected);
  let topic = await loadTopicByKey(key);
  if (topic && !options.refresh) return { topic, items: await loadResearchItems(topic.id), fromCache: true };
  if (!topic) topic = await createTopic(cleaned, selected, key);
  const previous = await loadResearchItems(topic.id);
  let statuses: PlatformResearchStatus[] = selected.map((platform) => ({ platform, status: 'waiting' }));
  const report = (message: string) => options.onProgress?.(statuses.map((status) => ({ ...status })), message);
  await db().from('research_topics').update(topic.id, { status: 'scraping', platform_status: statuses });
  const normalized: Array<Omit<ResearchItem, 'id'>> = [];
  for (const platform of selected) {
    statuses = statuses.map((status) => status.platform === platform ? { ...status, status: 'running', message: 'Starting primary actor…' } : status);
    report(`Researching ${platform}…`);
    try {
      const result = await runPlatformActors(platform, cleaned, (actorId, attempt) => {
        statuses = statuses.map((status) => status.platform === platform ? { ...status, actorId, message: attempt === 1 ? 'Running primary actor…' : `Trying fallback ${attempt - 1}…` } : status);
        report(`Researching ${platform} with ${actorId}…`);
      });
      const items = result.results.slice(0, 24).map((raw: any) => normalizeResearchItem(raw, platform, topic!.id, result.actorId));
      normalized.push(...items);
      statuses = statuses.map((status) => status.platform === platform ? { platform, status: items.length ? 'success' : 'empty', actorId: result.actorId, itemCount: items.length, message: items.length ? undefined : 'No public items were returned.' } : status);
    } catch (error) {
      const accessDenied = error instanceof ActorAccessError;
      statuses = statuses.map((status) => status.platform === platform ? { ...status, status: accessDenied ? 'access_denied' : 'failed', message: error instanceof Error ? error.message : String(error) } : status);
    }
    report(`${platform} finished.`);
  }
  if (normalized.length) {
    for (const item of previous) await db().from('research_items').delete(item.id);
    await db().from('research_items').bulkInsert(normalized.map((item) => ({
      topic_id: item.topic_id,
      platform: item.platform,
      advertiser: item.advertiser,
      creative_url: item.creative_url,
      thumbnail_url: item.thumbnail_url,
      copy_transcript: item.copy_transcript,
      format: item.format,
      run_days: item.run_days,
      first_seen: item.first_seen,
      engagement: item.engagement,
      longevity_signal: item.longevity_signal,
      variant_count: item.variant_count,
      performance_score: item.performance_score,
      raw_json: item.raw_json,
      source_actor: item.source_actor,
    })));
  }
  const successCount = statuses.filter((status) => status.status === 'success').length;
  const finalStatus: ResearchTopic['status'] = successCount === selected.length ? 'complete' : successCount > 0 ? 'partial' : 'failed';
  const itemCount = normalized.length || previous.length;
  await db().from('research_topics').update(topic.id, {
    label: cleaned,
    platforms: selected,
    status: finalStatus,
    scraped_at: new Date().toISOString(),
    item_count: itemCount,
    platform_status: statuses,
  });
  topic = (await loadTopicByKey(key)) || { ...topic, status: finalStatus, item_count: itemCount, platform_status: statuses };
  return { topic, items: await loadResearchItems(topic.id), fromCache: false };
}

function jsonFromText(value: string): any {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

async function aiJson(system: string, user: string): Promise<any> {
  const token = (window as any).__workspaceDb?.token;
  if (!token) throw new Error('The workspace token is not ready for AI analysis.');
  const response = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': token },
    body: JSON.stringify({
      model: 'gpt-6.1-sol',
      reasoning_effort: 'medium',
      max_completion_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      stream: false,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || `AI analysis failed (HTTP ${response.status}).`));
  return jsonFromText(String(data?.choices?.[0]?.message?.content || '{}'));
}

function sourceForAi(item: ResearchItem): string {
  const raw = JSON.stringify(item.raw_json || {}).slice(0, 12000);
  return JSON.stringify({ platform: item.platform, advertiser: item.advertiser, copy: item.copy_transcript, format: item.format, runDays: item.run_days, engagement: item.engagement, variantCount: item.variant_count, source: raw });
}

export async function analyzeResearchItem(item: ResearchItem): Promise<CreativeBreakdown> {
  const result = await aiJson(
    'Analyze only the supplied public creative evidence. Return JSON with hook, angle, offer, cta, format, structure (string array), evidenceNote. If a detail is not observable, write "Not observable". Never invent performance metrics, claims, or offer details.',
    sourceForAi(item),
  );
  return {
    hook: text(result.hook) || 'Not observable',
    angle: text(result.angle) || 'Not observable',
    offer: text(result.offer) || 'Not observable',
    cta: text(result.cta) || 'Not observable',
    format: text(result.format) || item.format || 'Not observable',
    structure: Array.isArray(result.structure) ? result.structure.map(String).slice(0, 8) : [],
    evidenceNote: text(result.evidenceNote) || 'Analysis is limited to the saved source evidence.',
  };
}

export async function buildOriginalUgcRecreation(item: ResearchItem, brandContext: string, product: string, length = 15): Promise<UgcRecreation> {
  const result = await aiJson(
    'Create an original editable UGC brief inspired only by the source structure and angle. Never copy footage, brand names, logos, proprietary phrases, exact wording, testimonials, or unsupported claims. Adapt it to the supplied brand/product. Return JSON with title, hook, script, cta, format, length, pacing, sourceStructure (string array), scenes (array of role hook|demo|proof|cta, duration integer, line, action). Scene durations must total the requested length and all copy must be original.',
    JSON.stringify({ requestedLength: length, brandContext, product, sourceEvidence: JSON.parse(sourceForAi(item)) }),
  );
  const scenes = Array.isArray(result.scenes) ? result.scenes.map((scene: any, index: number) => ({
    role: ['hook', 'demo', 'proof', 'cta'].includes(scene.role) ? scene.role : index === 0 ? 'hook' : index === result.scenes.length - 1 ? 'cta' : 'demo',
    duration: Math.max(4, Math.min(15, Math.round(Number(scene.duration) || 5))),
    line: text(scene.line),
    action: text(scene.action) || 'Show the product naturally.',
  })) : [];
  return {
    title: text(result.title) || 'Original structure adaptation',
    hook: text(result.hook),
    script: text(result.script),
    cta: text(result.cta),
    format: text(result.format) || 'talking-camera',
    length: Math.max(4, Math.min(30, Math.round(Number(result.length) || length))),
    pacing: text(result.pacing) || 'Natural creator pacing',
    sourceStructure: Array.isArray(result.sourceStructure) ? result.sourceStructure.map(String).slice(0, 8) : [],
    scenes,
  };
}

export async function generateThreeUgcVariants(item: ResearchItem, brief: UgcRecreation, brandContext: string, product: string): Promise<UgcRecreation[]> {
  const result = await aiJson(
    'Generate exactly three original UGC variants with different hooks, while preserving the editable brief structure, product truth, total length, CTA intent, and scene roles. Do not copy the competitor brand, footage, names, or exact wording. Return JSON { variants: [...] }; each variant has title, hook, script, cta, format, length, pacing, sourceStructure, scenes.',
    JSON.stringify({ brandContext, product, sourceEvidence: JSON.parse(sourceForAi(item)), editableBrief: brief }),
  );
  const variants = Array.isArray(result.variants) ? result.variants.slice(0, 3) : [];
  return variants.map((variant: any, index: number) => ({
    title: text(variant.title) || `Hook variant ${index + 1}`,
    hook: text(variant.hook),
    script: text(variant.script),
    cta: text(variant.cta),
    format: text(variant.format) || brief.format,
    length: Math.max(4, Math.min(30, Math.round(Number(variant.length) || brief.length))),
    pacing: text(variant.pacing) || brief.pacing,
    sourceStructure: Array.isArray(variant.sourceStructure) ? variant.sourceStructure.map(String).slice(0, 8) : brief.sourceStructure,
    scenes: Array.isArray(variant.scenes) ? variant.scenes.map((scene: any, sceneIndex: number) => ({ role: ['hook', 'demo', 'proof', 'cta'].includes(scene.role) ? scene.role : sceneIndex === 0 ? 'hook' : 'demo', duration: Math.max(4, Math.min(15, Math.round(Number(scene.duration) || 5))), line: text(scene.line), action: text(scene.action) || 'Show the product naturally.' })) : brief.scenes,
  }));
}
