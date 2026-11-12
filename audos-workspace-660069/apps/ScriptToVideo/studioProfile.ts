/**
 * Saved cast & brand for Script-to-Video.
 *
 * After a film finishes, its approved cast sheets are written to the
 * customer's character store (s2v_references, the same @name store the studio
 * reads) and a studio profile — model, frame, length, look, cast, voice,
 * caption style, logo and colours — is kept on the customer's Brand Kit
 * document (brand-kit-store, one document per verified email) with a local
 * copy for signed-out sessions. The next new video offers "Use the same
 * cast?" and skips everything already answered.
 *
 * "Make another like this" turns a finished film into a one-shot series
 * preset: same settings, look and cast, so the next episode needs only one
 * line of input.
 */
import { callHook } from '../../lib/workspace';
import { getDefaultBrand, parseBrandKitDocument, rememberBrandKit } from '../../components/brandKitStore';
import { db, referenceSlug } from './api';
import type { Film, FilmScene, StoredReference } from './api';
import type { StudioCharacter, StudioReference } from './studioAgent';

export interface StudioProfile {
  version: 1;
  saved_at: string;
  source_film_id: number;
  source_title: string;
  model_id: string;
  aspect: '16:9' | '9:16' | '1:1';
  target_seconds: number;
  tone: string;
  audience: string;
  narration: boolean;
  visual_style: string;
  world: string;
  cast: StudioCharacter[];
  project_refs: StudioReference[];
  voice: { source: string; openai_voice?: string; voice_id?: string; voice_name?: string };
  captions: boolean;
  caption_style: string;
  transition: string;
  brand: { name: string; logo_url: string; colors: string[] };
}

export interface SeriesInfo { id: string; title: string; episode: number }

export interface SeriesPreset {
  series: SeriesInfo;
  profile: StudioProfile;
}

const LOCAL_KEY = 's2v:studio:profile:v1';
const PRESET_KEY = 's2v:studio:series-preset:v1';
const ASPECTS = ['16:9', '9:16', '1:1'];

function str(value: unknown, max = 1500): string {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function validProfile(value: unknown): StudioProfile | null {
  const p = value as StudioProfile | null;
  if (!p || p.version !== 1 || !Array.isArray(p.cast)) return null;
  return p;
}

export function readLocalProfile(): StudioProfile | null {
  try { return validProfile(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')); } catch { return null; }
}

function writeLocalProfile(profile: StudioProfile) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(profile)); } catch { /* storage full or private mode */ }
}

/** The signed-in customer's saved profile (Brand Kit document), else this browser's copy. */
export async function loadStudioProfile(): Promise<StudioProfile | null> {
  const local = readLocalProfile();
  try {
    const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
    const remote = validProfile(loaded?.document?.studio?.s2v);
    if (remote && (!local || Date.parse(remote.saved_at) >= Date.parse(local.saved_at))) {
      writeLocalProfile(remote);
      return remote;
    }
  } catch { /* signed out or offline: this browser's copy is used */ }
  return local;
}

export async function saveStudioProfile(profile: StudioProfile): Promise<void> {
  writeLocalProfile(profile);
  try {
    const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
    if (loaded?.ok !== true) return;
    // A legacy plain-text Brand Context row is left untouched; only a real
    // Brand Kit document (or none yet) carries the studio profile.
    if (!loaded.document && loaded.legacyText) return;
    const document = parseBrandKitDocument(loaded.document) || { kind: 'vidverge-brand-kit' as const, version: 1 as const, defaultBrandId: null, brands: [], updatedAt: new Date(0).toISOString() };
    const remote = validProfile((document as any).studio?.s2v);
    // The profile always follows the newest finished film, on every device.
    if (remote && Number(remote.source_film_id) > Number(profile.source_film_id)) { writeLocalProfile(remote); return; }
    const next = { ...document, studio: { ...((document as any).studio || {}), s2v: profile }, updatedAt: new Date().toISOString() };
    const saved = await callHook<any>('brand-kit-store', { op: 'save', document: next });
    const stored = parseBrandKitDocument(saved?.document);
    if (stored) rememberBrandKit(stored);
  } catch { /* the local copy still drives the next video in this browser */ }
}

function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || `character-${Date.now().toString(36)}`;
  if (!taken.has(root)) return root;
  for (let n = 2; n < 50; n += 1) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
  return `${root}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Write every approved, imaged cast member of a film to the character store so
 * they can be summoned with @name in any later script. A sheet already stored
 * (same image) is reused; nothing is ever overwritten.
 */
export async function persistCastToCharacterStore(film: Film): Promise<StudioCharacter[]> {
  const cast = (Array.isArray(film.character_refs) ? film.character_refs : [])
    .filter((c) => c && c.url && c.kind !== 'narrator' && c.sheet_required !== false && c.approved !== false);
  if (!cast.length) return [];
  let stored: StoredReference[] = [];
  try { stored = await db.listReferences(); } catch { stored = []; }
  const taken = new Set(stored.map((r) => String(r.name || '').toLowerCase()));
  const out: StudioCharacter[] = [];
  for (const character of cast) {
    const url = String(character.url);
    let ref = stored.find((r) => r.url === url)
      || (character.source_reference_id != null ? stored.find((r) => r.id === character.source_reference_id) : undefined);
    if (!ref) {
      const fromFilm = (film.at_references || []).find((r) => r.url === url);
      const slug = uniqueSlug(referenceSlug(fromFilm?.name || character.name || character.id), taken);
      try {
        ref = await db.addReference({
          name: slug,
          display_name: character.name || slug,
          url,
          type: 'character',
          description: [character.appearance, character.wardrobe].filter(Boolean).join(' · ').slice(0, 800),
        });
        taken.add(slug);
        stored = [ref, ...stored];
      } catch { ref = undefined; }
    }
    out.push({
      id: character.id,
      name: character.name,
      appearance: character.appearance || '',
      wardrobe: character.wardrobe || '',
      voice: character.personality_voice || character.voice?.tone || '',
      mention: ref ? ref.name : referenceSlug(character.name || character.id),
      imageUrl: url,
    });
  }
  return out;
}

async function brandFor(film: Film): Promise<StudioProfile['brand']> {
  const fromFilm = (film.brand && typeof film.brand === 'object') ? film.brand as Record<string, unknown> : {};
  const filmLogo = str(fromFilm.logoUrl || fromFilm.logo_url || fromFilm.logo, 600);
  const filmColors = Array.isArray(fromFilm.colors) ? (fromFilm.colors as unknown[]).map((c) => str(c, 16)).filter(Boolean).slice(0, 6) : [];
  let name = str(fromFilm.name || fromFilm.businessName, 120);
  let logo = /^https?:\/\//i.test(filmLogo) ? filmLogo : '';
  let colors = filmColors;
  try {
    const loaded = await callHook<any>('brand-kit-store', { op: 'load' });
    const document = parseBrandKitDocument(loaded?.document);
    const brand = document ? getDefaultBrand(document) : null;
    // Only a brand the customer confirmed in the Brand Kit is carried forward.
    if (brand && brand.confirmedAt) {
      name = name || str(brand.identity.businessName, 120);
      logo = logo || str(brand.visuals.logoUrl, 600);
      if (!colors.length) colors = (brand.visuals.colors || []).map((c) => str(c, 16)).filter(Boolean).slice(0, 6);
    }
  } catch { /* brand stays as recorded on the film */ }
  return { name, logo_url: logo, colors };
}

export async function buildProfileFromFilm(
  film: Film,
  scenes: FilmScene[],
  cast: StudioCharacter[],
  finish: { captions: boolean; captionStyle?: string; transition?: string; voiceSource: string; openaiVoice?: string },
): Promise<StudioProfile> {
  const plan = (film.plan || {}) as Record<string, any>;
  const studio = (plan.studio || {}) as Record<string, any>;
  const done = scenes.filter((s) => s.status === 'completed');
  const seconds = Math.round(done.reduce((sum, s) => sum + (Number(s.duration_s) || 0), 0) || Number(plan.target_duration_sec) || Number(studio.target_seconds) || 30);
  const voicePlan = film.audio?.voice_plan || null;
  const projectRefs: StudioReference[] = (film.at_references || [])
    .filter((r) => r && r.type !== 'character' && /^https?:\/\//i.test(String(r.url || '')))
    .slice(0, 6)
    .map((r) => ({ url: String(r.url), label: String(r.description || r.name || 'Reference') }));
  return {
    version: 1,
    saved_at: new Date().toISOString(),
    source_film_id: film.id,
    source_title: str(film.title, 160) || 'Your last video',
    model_id: String(film.video_model || studio.model_id || 'omni-1.1-flash'),
    aspect: (ASPECTS.includes(String(film.aspect_ratio)) ? film.aspect_ratio : '16:9') as StudioProfile['aspect'],
    target_seconds: Math.max(8, Math.min(180, seconds)),
    tone: str(studio.tone, 200),
    audience: str(studio.audience, 200),
    narration: plan.narration_enabled !== false,
    visual_style: str(plan.visual_style || plan.style_direction || film.style_lock_description, 1500),
    world: str(plan.world, 800),
    cast,
    project_refs: projectRefs,
    voice: {
      source: String(film.audio?.voice_source || finish.voiceSource || 'none'),
      openai_voice: film.audio?.openai_voice || finish.openaiVoice,
      voice_id: voicePlan?.voiceId,
      voice_name: voicePlan?.voiceName,
    },
    captions: finish.captions === true,
    caption_style: finish.captionStyle || 'clean',
    transition: finish.transition || 'cut',
    brand: await brandFor(film),
  };
}

/** Series identity a film belongs to, if it was made as part of one. */
export function seriesOf(film: Film | null | undefined): (SeriesInfo & { autopilot?: boolean }) | null {
  const series = (film?.plan as any)?.studio?.series;
  if (!series || !series.id) return null;
  return { id: String(series.id), title: String(series.title || film?.title || 'Series'), episode: Math.max(1, Number(series.episode) || 1), autopilot: series.autopilot === true };
}

/** Next episode of the series this film is in (or starts), counted over the library. */
export function nextEpisodeFrom(film: Film, library: Film[]): SeriesInfo {
  const existing = seriesOf(film);
  const id = existing?.id || `film-${film.id}`;
  const title = existing?.title || str(film.title, 120) || 'My series';
  const episodes = library.map((f) => (seriesOf(f)?.id === id ? seriesOf(f)!.episode : f.id === film.id ? 1 : 0));
  const highest = Math.max(existing?.episode || 1, ...episodes, 1);
  return { id, title, episode: highest + 1 };
}

export function stashSeriesPreset(preset: SeriesPreset): void {
  try { sessionStorage.setItem(PRESET_KEY, JSON.stringify(preset)); } catch { /* the studio then opens empty */ }
}

export function peekSeriesPreset(): SeriesPreset | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PRESET_KEY) || 'null') as SeriesPreset | null;
    return parsed && parsed.series && validProfile(parsed.profile) ? parsed : null;
  } catch { return null; }
}

export function clearSeriesPreset(): void {
  try { sessionStorage.removeItem(PRESET_KEY); } catch { /* nothing to clear */ }
}

/** Locked look for the planner: the saved visual style plus confirmed brand colours. */
export function lockedStyleFor(profile: StudioProfile): string {
  const colours = profile.brand.colors.length ? ` Brand colours to favour in wardrobe, props and grade: ${profile.brand.colors.join(', ')}.` : '';
  return `${profile.visual_style}${colours}`.trim();
}
