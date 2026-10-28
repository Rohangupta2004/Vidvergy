import { useCallback, useEffect, useMemo, useState } from 'react';
import { callHook, getSessionId, getWorkspaceToken, WORKSPACE_ID } from '../lib/workspace';

export type BrandPageStatus = 'read' | 'limited' | 'not found';
export interface BrandPage { url: string; label: string; status: BrandPageStatus; title?: string; note?: string; durationMs?: number; readableChars?: number }
export interface BrandImage { url: string; alt: string; sourceUrl: string }
export interface BrandClip { id: string; url: string; key?: string; name: string; type: string; bytes?: number; createdAt: string }
export interface BrandRecord {
  id: string;
  websiteUrl: string;
  identity: { businessName: string; tagline: string };
  offer: { summary: string; features: string[]; benefits: string[]; pricing: string[]; offersCtas: string[] };
  audienceTone: { audience: string; tone: string };
  visuals: { logoUrl: string; colors: string[]; fonts: string[]; images: BrandImage[]; socialLinks: string[]; clips?: BrandClip[] };
  pages: BrandPage[];
  gaps: string[];
  sources: Record<string, string>;
  fetchedAt: string;
  confirmedAt: string;
  updatedAt: string;
  limited: boolean;
}
export interface BrandKitDocument {
  kind: 'vidverge-brand-kit';
  version: 1;
  defaultBrandId: string | null;
  brands: BrandRecord[];
  updatedAt: string;
}

const BRAND_KIT_EVENT = 'vidverge:brand-kit-change';
const BRAND_CONTEXT_EVENT = 'vidverge:brand-context-change';
let activeDocument: BrandKitDocument = emptyBrandKit();

export function emptyBrandKit(): BrandKitDocument {
  return { kind: 'vidverge-brand-kit', version: 1, defaultBrandId: null, brands: [], updatedAt: new Date(0).toISOString() };
}

function cacheKey(): string | null {
  const sessionId = getSessionId();
  return sessionId ? `vidverge_brand_kit_v1_${sessionId}` : null;
}
function readCache(): BrandKitDocument | null {
  try { const key = cacheKey(); return key ? parseBrandKitDocument(window.localStorage.getItem(key) || '') : null; } catch { return null; }
}
function cache(document: BrandKitDocument): void {
  activeDocument = document;
  try { const key = cacheKey(); if (key) window.localStorage.setItem(key, JSON.stringify(document)); } catch { /* authenticated server storage remains canonical */ }
}
function publish(document: BrandKitDocument): void {
  cache(document);
  window.dispatchEvent(new CustomEvent(BRAND_KIT_EVENT, { detail: document }));
  const active = getDefaultBrand(document);
  if (active) window.dispatchEvent(new CustomEvent(BRAND_CONTEXT_EVENT, { detail: { ownerKey: getSessionId(), text: brandToContextText(active) } }));
}

export function parseBrandKitDocument(value: unknown): BrandKitDocument | null {
  try {
    const parsed: any = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || parsed.kind !== 'vidverge-brand-kit' || parsed.version !== 1 || !Array.isArray(parsed.brands)) return null;
    return parsed as BrandKitDocument;
  } catch { return null; }
}
export function getDefaultBrand(document: BrandKitDocument): BrandRecord | null {
  return document.brands.find((brand) => brand.id === document.defaultBrandId) || document.brands[0] || null;
}
export function readActiveBrandKit(): BrandKitDocument { return activeDocument; }
export function normalizeBrandUrl(value: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '').toLowerCase();
  } catch { return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]; }
}
export function matchSavedBrand(document: BrandKitDocument, value: string): BrandRecord | null {
  const query = value.trim().toLowerCase();
  if (!query) return getDefaultBrand(document);
  const host = normalizeBrandUrl(value);
  return document.brands.find((brand) => normalizeBrandUrl(brand.websiteUrl) === host)
    || document.brands.find((brand) => brand.identity.businessName.trim().toLowerCase() === query)
    || document.brands.find((brand) => Boolean(brand.identity.businessName.trim()) && query.includes(brand.identity.businessName.trim().toLowerCase()))
    || null;
}
export function brandToContextText(brand: BrandRecord): string {
  const lines = [
    `Brand Name: ${brand.identity.businessName}`,
    `Website: ${brand.websiteUrl}`,
    `Tagline: ${brand.identity.tagline}`,
    `What it offers: ${brand.offer.summary}`,
    `Features: ${brand.offer.features.join('; ')}`,
    `Benefits: ${brand.offer.benefits.join('; ')}`,
    `Audience: ${brand.audienceTone.audience}`,
    `Tone: ${brand.audienceTone.tone}`,
    `Pricing: ${brand.offer.pricing.join('; ')}`,
    `Offers / CTA: ${brand.offer.offersCtas.join('; ')}`,
    `Logo: ${brand.visuals.logoUrl}`,
    `Colors: ${brand.visuals.colors.join(', ')}`,
    `Fonts: ${brand.visuals.fonts.join(', ')}`,
    `Founder clips: ${(brand.visuals.clips || []).map((clip) => `${clip.name} (${clip.url})`).join('; ')}`,
  ];
  return lines.filter((line) => !/:\s*$/.test(line)).join('\n');
}
export function makeBrandRecord(input: Omit<BrandRecord, 'id' | 'confirmedAt' | 'updatedAt'> & { id?: string; confirmedAt?: string; updatedAt?: string }): BrandRecord {
  const timestamp = new Date().toISOString();
  return { ...input, visuals: { ...input.visuals, clips: input.visuals.clips || [] }, id: input.id || `brand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, confirmedAt: input.confirmedAt || '', updatedAt: input.updatedAt || timestamp };
}

export async function uploadBrandClip(file: File): Promise<BrandClip> {
  if (!file.type.startsWith('video/')) throw new Error('Choose a video clip.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Brand clips must be 50 MB or smaller.');
  const token = await getWorkspaceToken();
  if (!token) throw new Error('Your workspace session is still loading.');
  const form = new FormData();
  form.append('file', file);
  form.append('workspaceId', WORKSPACE_ID);
  form.append('folder', 'brand-kit-clips');
  const response = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { 'X-Workspace-DB-Token': token },
    body: form,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) throw new Error(String(result?.error || `Clip upload failed (HTTP ${response.status}).`));
  return {
    id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    url: String(result.url),
    key: result.key ? String(result.key) : undefined,
    name: String(result.originalName || file.name),
    type: String(result.contentType || file.type || 'video/mp4'),
    bytes: Number(result.bytes) || file.size,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteBrandClip(clip: BrandClip): Promise<void> {
  const token = await getWorkspaceToken();
  const appId = String((window as any).__APP_ID__ || (window as any).__SPACE_ID__ || 'workspace-660069');
  const response = await fetch('/api/upload/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': appId,
      ...(token ? { 'X-Workspace-DB-Token': token } : {}),
    },
    body: JSON.stringify(clip.key ? { key: clip.key } : { url: clip.url }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) throw new Error(String(result?.error || `Clip delete failed (HTTP ${response.status}).`));
}

function legacyTextToDocument(text: string): BrandKitDocument | null {
  const source = String(text || '').trim();
  if (!source) return null;
  const field = (name: string) => source.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1]?.trim() || '';
  const nameLine = field('Brand Name');
  const websiteMatch = nameLine.match(/\(([^)]+\.[a-z]{2,})\)/i) || source.match(/https?:\/\/[^\s)]+/i);
  const websiteUrl = websiteMatch ? String(websiteMatch[1] || websiteMatch[0]).replace(/^\(/, '').replace(/\)$/, '') : '';
  const colors = Array.from(new Set((source.match(/#[0-9a-f]{6}\b/gi) || []).map((color) => color.toUpperCase())));
  const fonts = field('Fonts').split(/[,;]/).map((value) => value.trim()).filter(Boolean);
  const timestamp = new Date().toISOString();
  const brand = makeBrandRecord({
    websiteUrl,
    identity: { businessName: nameLine.replace(/\s*\([^)]+\)\s*$/, '').trim(), tagline: field('Tagline') },
    offer: { summary: field('Products') || source, features: field('Products') ? [field('Products')] : [], benefits: [], pricing: [], offersCtas: field('Call to action') ? [field('Call to action')] : [] },
    audienceTone: { audience: field('Audience'), tone: field('Tone') },
    visuals: { logoUrl: /^https?:\/\//i.test(field('Logo')) ? field('Logo') : '', colors, fonts, images: [], socialLinks: [], clips: [] },
    pages: [],
    gaps: ['Imported from the existing saved Brand Context. Website sources and any missing visual files still need confirmation.'],
    sources: { legacyText: 'Saved Brand Context row' },
    fetchedAt: '',
    limited: true,
  });
  return { kind: 'vidverge-brand-kit', version: 1, defaultBrandId: brand.id, brands: [brand], updatedAt: timestamp };
}

async function loadRemote(): Promise<BrandKitDocument | null> {
  const response = await callHook<{ ok: boolean; document: BrandKitDocument | null; legacyText?: string }>('brand-kit-store', { op: 'load' });
  return response.document ? parseBrandKitDocument(response.document) : legacyTextToDocument(response.legacyText || '');
}
export async function fetchBrandFromWebsite(url: string): Promise<BrandRecord> {
  let lastMessage = 'The website could not be read.';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await callHook<any>('brand-kit-fetch', { url });
      if (response?.ok && response.brand) return makeBrandRecord(response.brand);
      lastMessage = String(response?.error || lastMessage);
    } catch (error) { lastMessage = error instanceof Error ? error.message : lastMessage; }
  }
  throw new Error(lastMessage);
}

export function useBrandKit() {
  const [document, setDocument] = useState<BrandKitDocument>(() => readCache() || emptyBrandKit());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadRemote().then((remote) => {
      if (cancelled) return;
      const next = remote || readCache() || emptyBrandKit();
      setDocument(next); publish(next); setError('');
    }).catch(() => {
      if (!cancelled) setError('Cloud sync is unavailable. Changes remain on this device until you retry.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    const sync = (event: Event) => {
      const next = (event as CustomEvent<BrandKitDocument>).detail;
      if (next?.kind === 'vidverge-brand-kit') setDocument(next);
    };
    window.addEventListener(BRAND_KIT_EVENT, sync);
    return () => { cancelled = true; window.removeEventListener(BRAND_KIT_EVENT, sync); };
  }, []);

  const save = useCallback(async (next: BrandKitDocument) => {
    const prepared = { ...next, updatedAt: new Date().toISOString() };
    setSaving(true); setDocument(prepared); publish(prepared);
    try {
      const response = await callHook<{ ok: boolean; document: BrandKitDocument }>('brand-kit-store', { op: 'save', document: prepared });
      const stored = parseBrandKitDocument(response.document) || prepared;
      setDocument(stored); publish(stored); setError('');
      return stored;
    } catch (caught) {
      setError('Cloud sync is unavailable. Changes remain on this device until you retry.');
      throw caught;
    } finally { setSaving(false); }
  }, []);

  return useMemo(() => ({ document, loading, saving, error, save }), [document, loading, saving, error, save]);
}
