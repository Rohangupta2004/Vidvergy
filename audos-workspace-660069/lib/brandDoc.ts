/**
 * The Brand doc: one editable document per signed-in customer, edited from the
 * Verge home and read by Verger and every studio.
 *
 * Storage is the existing Brand Kit document (`brand-kit-store` server
 * function → WorkspaceDB `brand_context_settings`), so every brand saved by
 * the old Brand Kit app is already a Brand doc. The doc-only sections (voice,
 * products, characters, do/don't, extra logos) live on `BrandRecord.doc`.
 */
import { callHook } from './workspace';
import {
  emptyBrandKit, getDefaultBrand, makeBrandRecord, normalizeBrandUrl, parseBrandKitDocument,
  readCachedBrandKit, rememberBrandKit,
  type BrandDocNotes, type BrandKitDocument, type BrandRecord,
} from '../components/brandKitStore';

export const BRAND_DOC_OPEN_EVENT = 'vidverge:open-brand-doc';
/** Every auto-filled brief starts with this, so a brief is never filled twice. */
export const BRAND_DOC_MARKER = 'BRAND DOC —';
const OPEN_FLAG = '__vvBrandDocRequested';

export interface BrandDocFields {
  name: string;
  tagline: string;
  website: string;
  voice: string;
  tone: string;
  audience: string;
  products: string;
  colors: string[];
  fonts: string[];
  logoUrls: string[];
  characters: string;
  dos: string[];
  donts: string[];
}

/** Ask the Verge home to open its Brand panel (works before or after Verge mounts). */
export function requestBrandDocPanel(): void {
  if (typeof window === 'undefined') return;
  (window as any)[OPEN_FLAG] = true;
  window.dispatchEvent(new CustomEvent(BRAND_DOC_OPEN_EVENT));
}

export function consumeBrandDocRequest(): boolean {
  if (typeof window === 'undefined') return false;
  const requested = (window as any)[OPEN_FLAG] === true;
  (window as any)[OPEN_FLAG] = false;
  return requested;
}

function clean(value: unknown): string { return String(value ?? '').trim(); }
function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    if (!value || seen.has(value.toLowerCase())) return false;
    seen.add(value.toLowerCase());
    return true;
  });
}
export function splitList(value: string): string[] {
  return uniq(String(value || '').split(/\n|;|,(?![^(]*\))/));
}
function isUrl(value: string): boolean { return /^https?:\/\/\S+$/i.test(value.trim()); }
function isColor(value: string): boolean { return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value.trim()); }

export function emptyBrandDocNotes(): BrandDocNotes {
  return { voice: '', products: '', characters: '', dos: [], donts: [], logoUrls: [] };
}

export function brandDocFields(brand: BrandRecord | null): BrandDocFields {
  const notes = { ...emptyBrandDocNotes(), ...(brand?.doc || {}) };
  const products = clean(notes.products) || [clean(brand?.offer.summary), ...(brand?.offer.features || []).map(clean)].filter(Boolean).join('\n');
  return {
    name: clean(brand?.identity.businessName),
    tagline: clean(brand?.identity.tagline),
    website: clean(brand?.websiteUrl),
    voice: clean(notes.voice),
    tone: clean(brand?.audienceTone.tone),
    audience: clean(brand?.audienceTone.audience),
    products,
    colors: uniq(brand?.visuals.colors || []),
    fonts: uniq(brand?.visuals.fonts || []),
    logoUrls: uniq([brand?.visuals.logoUrl || '', ...(notes.logoUrls || [])]),
    characters: clean(notes.characters),
    dos: uniq(notes.dos || []),
    donts: uniq(notes.donts || []),
  };
}

export function blankBrandRecord(): BrandRecord {
  return makeBrandRecord({
    websiteUrl: '',
    identity: { businessName: '', tagline: '' },
    offer: { summary: '', features: [], benefits: [], pricing: [], offersCtas: [] },
    audienceTone: { audience: '', tone: '' },
    visuals: { logoUrl: '', colors: [], fonts: [], images: [], socialLinks: [], clips: [] },
    pages: [],
    gaps: [],
    sources: { brandDoc: 'Written in the Verge Brand doc' },
    fetchedAt: '',
    limited: false,
  });
}

/** Write the doc fields back onto a record, keeping everything the doc does not edit (pages, clips, social profiles, sources). */
export function applyBrandDoc(brand: BrandRecord | null, fields: BrandDocFields): BrandRecord {
  const base = brand || blankBrandRecord();
  const logos = uniq(fields.logoUrls).filter(isUrl);
  const timestamp = new Date().toISOString();
  return {
    ...base,
    websiteUrl: clean(fields.website),
    identity: { ...base.identity, businessName: clean(fields.name), tagline: clean(fields.tagline) },
    offer: { ...base.offer, summary: clean(fields.products) },
    audienceTone: { audience: clean(fields.audience), tone: clean(fields.tone) },
    visuals: { ...base.visuals, logoUrl: logos[0] || '', colors: uniq(fields.colors).filter(isColor).map((color) => color.toUpperCase()), fonts: uniq(fields.fonts) },
    doc: {
      voice: clean(fields.voice),
      products: clean(fields.products),
      characters: clean(fields.characters),
      dos: uniq(fields.dos),
      donts: uniq(fields.donts),
      logoUrls: logos.slice(1),
    },
    confirmedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertBrand(document: BrandKitDocument, brand: BrandRecord, makeDefault = false): BrandKitDocument {
  const exists = document.brands.some((item) => item.id === brand.id);
  return {
    ...document,
    brands: exists ? document.brands.map((item) => (item.id === brand.id ? brand : item)) : [...document.brands, brand],
    defaultBrandId: makeDefault || !document.defaultBrandId ? brand.id : document.defaultBrandId,
    updatedAt: new Date().toISOString(),
  };
}

export function isBrandDocEmpty(brand: BrandRecord | null): boolean {
  if (!brand) return true;
  const fields = brandDocFields(brand);
  return !fields.name && !fields.products && !fields.audience && !fields.tone && !fields.colors.length && !fields.logoUrls.length;
}

// --------------------------------------------------------------- requests --

const BRAND_REQUEST = /\b(?:(?:for|with|in|using|match(?:ing)?|fit(?:ting)?)\s+(?:my|our)\s+(?:own\s+)?(?:brand|company|business|startup|product|app|store|shop|channel|label)|(?:my|our)\s+brand(?:'s)?|on[- ]brand|brand(?:ed)?\s+(?:video|ad|advert|reel|short|film|kit|doc|colou?rs?|style|look|voice|guidelines?))\b/i;

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** True when the text asks for the customer's own brand ("for my brand", "on-brand", "our company"). */
export function mentionsBrand(text: string): boolean {
  return BRAND_REQUEST.test(String(text || ''));
}

/**
 * The saved brand a request is about: a brand named in the text (by name or
 * website), else the default brand when the text says "my brand" etc.
 */
export function resolveBrandForRequest(document: BrandKitDocument | null | undefined, text: string): BrandRecord | null {
  const source = String(text || '');
  if (!document?.brands?.length || !source.trim()) return null;
  const named = document.brands.find((brand) => {
    const name = clean(brand.identity.businessName);
    if (name.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(source)) return true;
    const host = brand.websiteUrl ? normalizeBrandUrl(brand.websiteUrl) : '';
    return host.length >= 4 && source.toLowerCase().includes(host);
  });
  if (named) return named;
  return mentionsBrand(source) ? getDefaultBrand(document) : null;
}

// ---------------------------------------------------------------- consent --

const CONSENT_KEY = 'vidverge_brand_consent_v1';
export const BRAND_CONSENT_EVENT = 'vidverge:brand-consent-change';

interface BrandConsent { source: 'saved' | 'lookup'; brandId: string; record?: BrandRecord; confirmedAt: number }

function readConsent(): BrandConsent | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CONSENT_KEY) || 'null');
    if (!parsed || (parsed.source !== 'saved' && parsed.source !== 'lookup') || !parsed.brandId) return null;
    return parsed as BrandConsent;
  } catch { return null; }
}

/** The brand the user chose and confirmed in this browser session (saved Brand Kit, or details they confirmed from a website lookup). Nothing is applied before this. */
export function confirmedBrandChoice(): { source: 'saved' | 'lookup'; brandId: string } | null {
  const consent = readConsent();
  return consent ? { source: consent.source, brandId: consent.brandId } : null;
}

export function confirmBrandUse(brand: BrandRecord, source: 'saved' | 'lookup' = 'saved'): void {
  if (typeof window === 'undefined') return;
  const consent: BrandConsent = { source, brandId: brand.id, record: source === 'lookup' ? brand : undefined, confirmedAt: Date.now() };
  try { window.sessionStorage.setItem(CONSENT_KEY, JSON.stringify(consent)); } catch { /* session storage unavailable: the choice then lasts only until reload */ }
  window.dispatchEvent(new CustomEvent(BRAND_CONSENT_EVENT, { detail: { brandId: brand.id, source } }));
}

export function revokeBrandUse(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(CONSENT_KEY); } catch { /* nothing to remove */ }
  window.dispatchEvent(new CustomEvent(BRAND_CONSENT_EVENT, { detail: null }));
}

/** The user picked "Use my saved Brand Kit" in a chat question: confirm the default saved brand. */
export function confirmDefaultSavedBrand(): BrandRecord | null {
  const brand = getDefaultBrand(currentBrandDocument());
  if (brand) confirmBrandUse(brand, 'saved');
  return brand;
}

export function confirmedBrandRecord(document: BrandKitDocument | null | undefined = currentBrandDocument()): BrandRecord | null {
  const consent = readConsent();
  if (!consent) return null;
  if (consent.source === 'lookup') return consent.record || null;
  return document?.brands?.find((brand) => brand.id === consent.brandId) || null;
}

/** Like resolveBrandForRequest, but only ever returns the brand the user confirmed. Without a confirmation nothing is returned. */
export function resolveConfirmedBrand(document: BrandKitDocument | null | undefined, text: string): BrandRecord | null {
  const brand = confirmedBrandRecord(document);
  if (!brand) return null;
  return resolveBrandForRequest({ ...emptyBrandKit(), brands: [brand], defaultBrandId: brand.id }, text);
}

/** A self-contained brand block for a brief or prompt. */
export function brandBriefBlock(brand: BrandRecord): string {
  const fields = brandDocFields(brand);
  const lines = [
    `${BRAND_DOC_MARKER} ${fields.name || 'saved brand'} (details the user chose to use and confirmed; use only these and never invent a logo, name, colour or fact)`,
    fields.tagline ? `Tagline: ${fields.tagline}` : '',
    fields.website ? `Website: ${fields.website}` : '',
    fields.products ? `Products: ${fields.products.replace(/\s*\n\s*/g, '; ')}` : '',
    fields.audience ? `Audience: ${fields.audience}` : '',
    fields.voice ? `Voice: ${fields.voice}` : '',
    fields.tone ? `Tone: ${fields.tone}` : '',
    fields.colors.length ? `Brand colours: ${fields.colors.join(', ')}` : '',
    fields.fonts.length ? `Fonts: ${fields.fonts.join(', ')}` : '',
    fields.logoUrls.length ? `Logo: ${fields.logoUrls[0]}${fields.logoUrls.length > 1 ? ` (alternates: ${fields.logoUrls.slice(1).join(', ')})` : ''}` : '',
    fields.characters ? `Characters / mascots: ${fields.characters.replace(/\s*\n\s*/g, '; ')}` : '',
    fields.dos.length ? `Do: ${fields.dos.join('; ')}` : '',
    fields.donts.length ? `Don't: ${fields.donts.join('; ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Structured brand facts for the agent's read_brand_kit tool. */
export function brandDocFacts(brand: BrandRecord) {
  const fields = brandDocFields(brand);
  return {
    saved: true,
    brandId: brand.id,
    businessName: fields.name,
    tagline: fields.tagline,
    website: fields.website,
    audience: fields.audience,
    tone: fields.tone,
    voice: fields.voice,
    products: fields.products,
    summary: brand.offer.summary,
    colors: fields.colors.slice(0, 8),
    fonts: fields.fonts.slice(0, 4),
    logoUrl: fields.logoUrls[0] || '',
    otherLogos: fields.logoUrls.slice(1, 4),
    characters: fields.characters,
    dos: fields.dos,
    donts: fields.donts,
    briefBlock: brandBriefBlock(brand),
  };
}

/** The cached Brand doc for this session (no network). */
export function currentBrandDocument(): BrandKitDocument {
  return readCachedBrandKit();
}

export function rememberBrandDocument(document: BrandKitDocument): void {
  rememberBrandKit(document);
}

/** Load the Brand doc from storage and refresh the local cache. */
export async function loadBrandDocument(): Promise<BrandKitDocument> {
  try {
    const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
    const document = parseBrandKitDocument(loaded?.document);
    if (document) { rememberBrandKit(document); return document; }
  } catch {
    // Signed-out or offline: fall back to this session's cached copy.
  }
  const cached = readCachedBrandKit();
  return cached.brands.length ? cached : emptyBrandKit();
}

let primed: Promise<BrandKitDocument> | null = null;
/** Load once per page so synchronous readers (handoffs, the prompt bridge) see the latest doc. */
export function primeBrandDocument(): Promise<BrandKitDocument> {
  if (!primed) primed = loadBrandDocument().finally(() => { window.setTimeout(() => { primed = null; }, 60_000); });
  return primed;
}

/** Append the brand block to a brief, but only for a brand the user chose and confirmed (see confirmBrandUse). */
export function withBrandBrief(text: string, document: BrandKitDocument | null = currentBrandDocument()): string {
  const source = String(text || '');
  if (!source.trim() || source.includes(BRAND_DOC_MARKER)) return source;
  const brand = resolveConfirmedBrand(document, source);
  return brand ? `${source.trim()}\n\n${brandBriefBlock(brand)}` : source;
}

const BRIEF_KEYS = ['idea', 'prompt', 'brief', 'description', 'productDescription', 'goal', 'topic'];

/** Brand-fill the free-text brief fields of a studio fill payload (never a verbatim script). */
export function withBrandValues(values: Record<string, unknown>, request: string, document: BrandKitDocument | null = currentBrandDocument()): Record<string, unknown> {
  const haystack = [request, ...BRIEF_KEYS.map((key) => (typeof values[key] === 'string' ? String(values[key]) : ''))].join('\n');
  const brand = resolveConfirmedBrand(document, haystack);
  if (!brand) return values;
  const block = brandBriefBlock(brand);
  const next: Record<string, unknown> = { ...values };
  let filled = false;
  for (const key of BRIEF_KEYS) {
    const value = next[key];
    if (typeof value === 'string' && value.trim() && !value.includes(BRAND_DOC_MARKER)) {
      next[key] = `${value.trim()}\n\n${block}`;
      filled = true;
      break;
    }
  }
  const fields = brandDocFields(brand);
  if (typeof next.look === 'string' && fields.colors.length && !String(next.look).includes(fields.colors[0])) {
    next.look = `${String(next.look).trim()} — ${fields.name || 'brand'} colours ${fields.colors.join(', ')}${fields.tone ? `, ${fields.tone} tone` : ''}`;
  }
  if (!filled && typeof next.references === 'string' && fields.logoUrls[0] && !String(next.references).includes(fields.logoUrls[0])) {
    next.references = [String(next.references).trim(), fields.logoUrls[0]].filter(Boolean).join('\n');
  }
  return next;
}
