import { callHook } from './workspace';

export type ResearchGroup = 'web' | 'meta' | 'tiktok' | 'linkedin' | 'social' | 'discovery';
export type ResearchPlatform = ResearchGroup | 'instagram' | 'youtube' | 'reddit';

export type ApifyActorDefinition = {
  slug: string;
  group: ResearchGroup | 'disabled';
  purpose: string;
  inputBuilder: (topic: string, limit?: number) => Record<string, unknown>;
  outputNormalizer: (item: unknown) => Record<string, unknown>;
  disabled?: boolean;
  reason?: string;
};

export const APIFY_ACTORS = {
  web: [
    'apify/website-content-crawler',
    'apify/cheerio-scraper',
    'apify/web-scraper',
    'apify/puppeteer-scraper',
    'apify/playwright-scraper',
  ],
  meta: [
    'apify/facebook-ads-scraper',
    'om_kh/facebook-ads-library-scraper',
    'valev-lab/facebook-ads-library',
    's-r/meta-ads-library',
    'om_kh/vigia-ads-library-monitor',
  ],
  tiktok: [
    'scrapesage/tiktok-ad-library-scraper',
    'topapi/tiktok-ads-library-scraper',
    'getdataforu/tiktok-ad-library-scraper',
    'hgservices/tiktok-ads-library-scraper',
    'jaybird/tiktok-ad-library-scraper',
    'themineworks/tiktok-ad-library-scraper',
  ],
  linkedin: [
    'alexmorain/linkedin-ad-library-scraper',
    'jaybird/linkedin-ad-library-scraper',
    'ivanvs/linkedin-ad-library-scraper',
    'apt_marble/ultimate-linkedin-ad-scraper',
  ],
  social: [
    'apify/instagram-scraper',
    'apify/instagram-profile-scraper',
    'apify/instagram-post-scraper',
    'clockworks/tiktok-scraper',
    'apidojo/tweet-scraper',
    'apify/facebook-posts-scraper',
    'apify/facebook-pages-scraper',
    'apify/facebook-groups-scraper',
    'streamers/youtube-scraper',
    'trudax/reddit-scraper-lite',
  ],
  discovery: [
    'apify/google-search-scraper',
    'apify/contact-details-scraper',
    'compass/crawler-google-places',
  ],
} as const;

export const APPROVED_APIFY_ACTORS = new Set<string>(Object.values(APIFY_ACTORS).flat());

export const PLATFORM_ACTORS: Record<ResearchPlatform, readonly string[]> = {
  social: APIFY_ACTORS.social,
  discovery: APIFY_ACTORS.discovery,
  meta: APIFY_ACTORS.meta,
  tiktok: APIFY_ACTORS.tiktok,
  linkedin: APIFY_ACTORS.linkedin,
  instagram: APIFY_ACTORS.social.slice(0, 3),
  youtube: [APIFY_ACTORS.social[8]],
  reddit: [APIFY_ACTORS.social[9]],
  web: APIFY_ACTORS.web,
};

export class ActorAccessError extends Error {
  code = 'actor_access_not_granted';
  actorId: string;
  constructor(actorId: string, detail = '') {
    super(`Actor access not granted for ${actorId}.${detail ? ` ${detail}` : ''}`);
    this.name = 'ActorAccessError';
    this.actorId = actorId;
  }
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function normalizePublicUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error('Enter a complete public http:// or https:// URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only public http:// and https:// URLs can be scraped.');
  if (parsed.username || parsed.password) throw new Error('URLs containing credentials are not allowed.');
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || privateIpv4(host)
    || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) throw new Error('Local and private network addresses cannot be scraped.');
  parsed.hash = '';
  return parsed.toString();
}

function isUrl(value: string): boolean {
  try { normalizePublicUrl(value); return true; } catch { return false; }
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?[^/]+\//i, '').split(/[/?#]/)[0];
}

export function actorInput(actorId: string, topic: string, limit = 18): Record<string, unknown> {
  if (!APPROVED_APIFY_ACTORS.has(actorId)) throw new Error(`Actor ${actorId} is not approved for this workspace.`);
  const query = topic.trim();
  const url = isUrl(query) ? normalizePublicUrl(query) : '';
  const handle = cleanHandle(query);
  if (APIFY_ACTORS.web.includes(actorId as any) && !url) throw new Error('Website actors require a complete public URL.');
  if (actorId === 'apify/website-content-crawler') return { startUrls: [{ url }], maxCrawlPages: Math.min(limit, 5), crawlerType: 'playwright:firefox' };
  if (actorId === 'apify/cheerio-scraper') return { startUrls: [{ url }], maxRequestsPerCrawl: Math.min(limit, 5) };
  if (actorId === 'apify/web-scraper' || actorId === 'apify/puppeteer-scraper' || actorId === 'apify/playwright-scraper') return { startUrls: [{ url }], maxRequestsPerCrawl: Math.min(limit, 5) };
  if (actorId === 'apify/facebook-ads-scraper') return { searchTerms: [query], maxAds: limit, activeStatus: 'all' };
  if (actorId.includes('facebook-ads-library') || actorId.includes('meta-ads-library') || actorId.includes('vigia-ads-library')) return { searchQuery: query, searchTerms: [query], maxResults: limit };
  if (actorId.includes('tiktok-ad-library')) return { searchQuery: query, searchTerms: [query], maxResults: limit, resultsLimit: limit };
  if (actorId.includes('linkedin-ad-library') || actorId.includes('linkedin-ad-scraper')) return { searchQuery: query, query, maxResults: limit };
  if (actorId === 'apify/instagram-scraper') return url || query.startsWith('@') ? { usernames: [handle], resultsLimit: limit } : { hashtags: [query.replace(/\s+/g, '')], resultsLimit: limit };
  if (actorId === 'apify/instagram-profile-scraper') return { usernames: [handle] };
  if (actorId === 'apify/instagram-post-scraper') return { directUrls: url ? [url] : [], resultsLimit: limit };
  if (actorId === 'clockworks/tiktok-scraper') return { profiles: url ? [url] : [handle], searchQueries: [query], resultsPerPage: limit };
  if (actorId === 'apidojo/tweet-scraper') return { ...(url ? { startUrls: [url] } : {}), searchTerms: [query], maxItems: limit };
  if (actorId === 'apify/facebook-posts-scraper' || actorId === 'apify/facebook-pages-scraper' || actorId === 'apify/facebook-groups-scraper') return { startUrls: url ? [{ url }] : [], searchQueries: [query], resultsLimit: limit };
  if (actorId === 'streamers/youtube-scraper') return { ...(url ? { startUrls: [{ url }] } : {}), searchKeywords: [query], maxResults: limit };
  if (actorId === 'trudax/reddit-scraper-lite') return { ...(url ? { startUrls: [url] } : {}), searches: [query], maxItems: limit };
  if (actorId === 'apify/google-search-scraper') return { queries: query, maxPagesPerQuery: 1, resultsPerPage: limit };
  if (actorId === 'apify/contact-details-scraper') return { startUrls: url ? [{ url }] : [], searchQueries: [query], maxRequestsPerStartUrl: Math.min(5, limit) };
  if (actorId === 'compass/crawler-google-places') return { searchStringsArray: [query], maxCrawledPlacesPerSearch: limit };
  return { query, maxResults: limit };
}

function stripMarkup(value: unknown, limit = 24000): string {
  return typeof value === 'string' ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}
function normalizeActorItem(item: unknown, depth = 0): any {
  if (typeof item === 'string') return stripMarkup(item);
  if (item == null || typeof item === 'number' || typeof item === 'boolean') return item;
  if (depth >= 4) return stripMarkup(JSON.stringify(item), 4000);
  if (Array.isArray(item)) return item.slice(0, 20).map((value) => normalizeActorItem(value, depth + 1));
  if (typeof item === 'object') return Object.fromEntries(Object.entries(item as Record<string, unknown>).slice(0, 80).map(([key, value]) => [key, normalizeActorItem(value, depth + 1)]));
  return String(item);
}

const disabledActors: ApifyActorDefinition[] = [
  'blueskyscraper/linkedin-scraper', 'get-leads/linkedin-scraper', 'harvestapi/linkedin-company-employees',
  'harvestapi/linkedin-company-posts', 'b2bsearch/company-employees', 'worldunboxer/rapid-linkedin-scraper',
  'bebity/linkedin-premium-actor', 'indiamart/indiamart-scraper', 'tenders/gem-tenders-scraper',
].map((slug) => ({ slug, group: 'disabled', purpose: 'Actor retained for audit only.', inputBuilder: () => ({}), outputNormalizer: (item) => normalizeActorItem(item), disabled: true, reason: 'not used by a video app' }));

/** One typed catalog; group-array exports above remain compatibility views for existing callers. */
export const APIFY_ACTOR_CATALOG: readonly ApifyActorDefinition[] = [
  ...Object.entries(APIFY_ACTORS).flatMap(([group, slugs]) => (slugs as readonly string[]).map((slug) => ({
    slug,
    group: group as ResearchGroup,
    purpose: `Public ${group} research for video briefs and creative evidence.`,
    inputBuilder: (topic: string, limit = 18) => actorInput(slug, topic, limit),
    outputNormalizer: (item: unknown) => {
      const normalized = normalizeActorItem(item);
      return normalized && typeof normalized === 'object' && !Array.isArray(normalized) ? normalized : { text: String(normalized || '') };
    },
    ...(slug === 'om_kh/vigia-ads-library-monitor' ? { disabled: true, reason: 'Actor is not currently available in the Apify store.' } : {}),
    ...(slug === 'apify/web-scraper' ? { disabled: true, reason: 'Live server-side test requires one-time full-account permission approval; skip silently to the next approved fallback.' } : {}),
  }))),
  ...disabledActors,
];

function errorText(data: any, status: number): string {
  return String(data?.error?.message || data?.error || data?.message || `Apify request failed (HTTP ${status}).`);
}

export async function runApprovedActor(actorId: string, input: Record<string, unknown>) {
  if (!APPROVED_APIFY_ACTORS.has(actorId)) throw new Error(`Actor ${actorId} is not approved for this workspace.`);
  const definition = APIFY_ACTOR_CATALOG.find((entry) => entry.slug === actorId);
  if (!definition || definition.disabled) throw new Error(`${actorId} is unavailable${definition?.reason ? `: ${definition.reason}` : '.'}`);
  const token = (window as any).__workspaceDb?.token;
  if (!token) throw new Error('The workspace session is still loading.');
  const browserActor = definition.group === 'web' && actorId !== 'apify/cheerio-scraper';
  const response = await fetch('/api/apify/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': String((window as any).__APP_ID__ || (window as any).__SPACE_ID__ || ''),
      'X-Workspace-DB-Token': token,
    },
    body: JSON.stringify({ actorId, input, timeout: definition.group === 'web' ? 2 : 3, memory: browserActor ? 4096 : 1024, parseWithGPT: false, targetFormat: 'json' }),
  });
  const data = await response.json().catch(() => null);
  const detail = errorText(data, response.status);
  if (response.status === 401 || response.status === 403 || /access|permission|rental|not authorized|subscription/i.test(detail)) {
    throw new ActorAccessError(actorId, detail);
  }
  if (response.status === 504 || /timed out/i.test(detail)) throw new Error('Taking longer than expected. Try again or use Refresh.');
  if (!response.ok || data?.status === 'failed') throw new Error(detail);
  const raw = Array.isArray(data?.results) ? data.results : Array.isArray(data?.parsedData) ? data.parsedData : [];
  const results = raw.slice(0, 20).map((item: unknown) => definition.outputNormalizer(item));
  return { results, metadata: data?.metadata || {}, runId: data?.runId || '', actorId };
}

export async function runPlatformActors(platform: ResearchPlatform, topic: string, onAttempt?: (actorId: string, attempt: number) => void) {
  const resolvedPlatform: ResearchPlatform = platform === 'web' && !isUrl(topic) ? 'discovery' : platform;
  onAttempt?.(`vidverge-research:${resolvedPlatform}`, 1);
  const result = await callHook<{
    success: boolean;
    results?: Record<string, unknown>[];
    actorId?: string;
    fallbackIndex?: number;
    failures?: Array<{ actorId: string; error: string; accessDenied: boolean }>;
    status?: 'success' | 'empty' | 'failed';
    message?: string;
    costUsd?: number;
  }>('vidverge-research', { op: 'run_chain', platform: resolvedPlatform, topic, limit: 18 });
  const failures = Array.isArray(result.failures) ? result.failures : [];
  // Every per-actor failure is logged so a failed import is diagnosable from the console, not just "all failed".
  if (failures.length) console.warn(`[vidverge-research] ${resolvedPlatform} scrape of "${topic}" — per-step failures:`, failures);
  if (result.status === 'success' && Array.isArray(result.results) && result.results.length) {
    return {
      results: result.results,
      metadata: { costUsd: Number(result.costUsd || 0) },
      runId: '',
      actorId: String(result.actorId || 'vidverge-research'),
      fallbackIndex: Number(result.fallbackIndex || 0),
      failures,
    };
  }
  const allDenied = failures.length > 0 && failures.every((failure) => failure.accessDenied);
  const lastFailure = failures[failures.length - 1];
  const detail = result.message
    || (result.status === 'empty'
      ? 'The scrapers ran but found no public data at this address.'
      : `The scrape failed${failures.length ? ` after ${failures.length} step${failures.length === 1 ? '' : 's'} (last: ${lastFailure.error})` : ''}.`);
  if (allDenied) throw new ActorAccessError(String(failures[0]?.actorId || resolvedPlatform), detail);
  const error = new Error(detail);
  (error as any).failures = failures;
  throw error;
}
