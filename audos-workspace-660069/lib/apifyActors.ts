export type ResearchPlatform = 'meta' | 'tiktok' | 'linkedin' | 'instagram' | 'youtube' | 'reddit' | 'web';

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

function isUrl(value: string): boolean {
  try { new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return /\./.test(value); } catch { return false; }
}

function cleanHandle(value: string): string {
  return value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?[^/]+\//i, '').split(/[/?#]/)[0];
}

export function actorInput(actorId: string, topic: string, limit = 18): Record<string, unknown> {
  if (!APPROVED_APIFY_ACTORS.has(actorId)) throw new Error(`Actor ${actorId} is not approved for this workspace.`);
  const query = topic.trim();
  const url = isUrl(query) ? (/^https?:\/\//i.test(query) ? query : `https://${query}`) : '';
  const handle = cleanHandle(query);
  if (actorId === 'apify/website-content-crawler') return { startUrls: [{ url }], maxCrawlPages: Math.min(limit, 12), crawlerType: 'playwright:firefox' };
  if (actorId === 'apify/cheerio-scraper') return { startUrls: [{ url }], maxRequestsPerCrawl: Math.min(limit, 12) };
  if (actorId === 'apify/web-scraper' || actorId === 'apify/puppeteer-scraper' || actorId === 'apify/playwright-scraper') return { startUrls: [{ url }], maxRequestsPerCrawl: Math.min(limit, 12) };
  if (actorId === 'apify/facebook-ads-scraper') return { searchTerms: [query], maxAds: limit, activeStatus: 'all' };
  if (actorId.includes('facebook-ads-library') || actorId.includes('meta-ads-library') || actorId.includes('vigia-ads-library')) return { searchQuery: query, searchTerms: [query], maxResults: limit };
  if (actorId.includes('tiktok-ad-library')) return { searchQuery: query, searchTerms: [query], maxResults: limit, resultsLimit: limit };
  if (actorId.includes('linkedin-ad-library') || actorId.includes('linkedin-ad-scraper')) return { searchQuery: query, query, maxResults: limit };
  if (actorId === 'apify/instagram-scraper') return url || query.startsWith('@') ? { usernames: [handle], resultsLimit: limit } : { hashtags: [query.replace(/\s+/g, '')], resultsLimit: limit };
  if (actorId === 'apify/instagram-profile-scraper') return { usernames: [handle] };
  if (actorId === 'apify/instagram-post-scraper') return { directUrls: url ? [url] : [], resultsLimit: limit };
  if (actorId === 'streamers/youtube-scraper') return { searchKeywords: [query], maxResults: limit };
  if (actorId === 'trudax/reddit-scraper-lite') return { searches: [query], maxItems: limit };
  if (actorId === 'apify/google-search-scraper') return { queries: query, maxPagesPerQuery: 1, resultsPerPage: limit };
  return { query, maxResults: limit };
}

function errorText(data: any, status: number): string {
  return String(data?.error?.message || data?.error || data?.message || `Apify request failed (HTTP ${status}).`);
}

export async function runApprovedActor(actorId: string, input: Record<string, unknown>) {
  if (!APPROVED_APIFY_ACTORS.has(actorId)) throw new Error(`Actor ${actorId} is not approved for this workspace.`);
  const response = await fetch('/api/apify/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': String((window as any).__APP_ID__ || (window as any).__SPACE_ID__ || ''),
    },
    body: JSON.stringify({ actorId, input, timeout: 4, memory: 1024, parseWithGPT: false, targetFormat: 'json' }),
  });
  const data = await response.json().catch(() => null);
  const detail = errorText(data, response.status);
  if (response.status === 401 || response.status === 403 || /access|permission|rental|not authorized|subscription/i.test(detail)) {
    throw new ActorAccessError(actorId, detail);
  }
  if (!response.ok || data?.status === 'failed') throw new Error(detail);
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data?.parsedData) ? data.parsedData : [];
  return { results, metadata: data?.metadata || {}, runId: data?.runId || '', actorId };
}

export async function runPlatformActors(platform: ResearchPlatform, topic: string, onAttempt?: (actorId: string, attempt: number) => void) {
  const actors = platform === 'web' && !isUrl(topic) ? APIFY_ACTORS.discovery.slice(0, 1) : PLATFORM_ACTORS[platform];
  const failures: Array<{ actorId: string; error: string; accessDenied: boolean }> = [];
  for (let index = 0; index < actors.length; index += 1) {
    const actorId = actors[index];
    onAttempt?.(actorId, index + 1);
    try {
      const result = await runApprovedActor(actorId, actorInput(actorId, topic));
      if (result.results.length) return { ...result, failures };
      failures.push({ actorId, error: 'Actor completed but returned no items.', accessDenied: false });
    } catch (error) {
      failures.push({ actorId, error: error instanceof Error ? error.message : String(error), accessDenied: error instanceof ActorAccessError });
    }
  }
  const denied = failures.some((failure) => failure.accessDenied);
  const detail = failures.map((failure) => `${failure.actorId}: ${failure.error}`).join(' | ');
  if (denied) throw new ActorAccessError(String(actors[0]), detail);
  throw new Error(detail || `No ${platform} actor returned results.`);
}
