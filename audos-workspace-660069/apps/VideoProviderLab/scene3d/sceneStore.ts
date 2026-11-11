/**
 * 3D SCENE BUILDER — persistence.
 *
 * Scenes are rows in the visitor-owned `vpl_scenes` WorkspaceDB table, written
 * through the same SDK helpers the rest of the suite uses (lib/reelioStudio:
 * listRows / insertRow / deleteRow, which wait for the verified session before
 * a private write). A copy of the open scene is also kept in localStorage so a
 * reload restores it instantly and nothing is lost while signed out.
 */
import { deleteRow, insertRow, listRows, waitForDbSession } from '../../../lib/reelioStudio';
import { sanitizeDoc } from './sceneModel';
import type { SceneDoc } from './sceneModel';

export const SCENES_TABLE = 'vpl_scenes';
const DRAFT_KEY = 'vpl.scene3d.draft.v1';

export interface SavedScene {
  id: number;
  name: string;
  doc: SceneDoc;
  thumbnail: string | null;
  updatedAt: string;
}

interface Draft {
  doc: SceneDoc;
  sceneId: number | null;
}

/** Device-only blob: URLs die with the tab, so they are dropped from anything saved. */
export function persistableDoc(doc: SceneDoc): SceneDoc {
  return {
    ...doc,
    elements: doc.elements.map((element) => (
      element.assetUrl && !/^https:/i.test(element.assetUrl) ? { ...element, assetUrl: undefined } : element
    )),
  };
}

export function readDraft(): Draft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.doc) return null;
    const sceneId = Number(parsed.sceneId);
    return { doc: sanitizeDoc(parsed.doc), sceneId: Number.isFinite(sceneId) && sceneId > 0 ? sceneId : null };
  } catch {
    return null;
  }
}

export function writeDraft(doc: SceneDoc, sceneId: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc: persistableDoc(doc), sceneId }));
  } catch { /* storage full or disabled: the database copy still saves */ }
}

function client(): any {
  return typeof window === 'undefined' ? null : (window as any).__workspaceDb || null;
}

export function databaseAvailable(): boolean {
  const db = client();
  return Boolean(db && typeof db.from === 'function');
}

export async function listScenes(): Promise<SavedScene[]> {
  const rows = await listRows<any>(SCENES_TABLE);
  return rows
    .map((row: any) => ({
      id: Number(row?.id),
      name: String(row?.name || 'Untitled scene'),
      doc: sanitizeDoc(row?.doc),
      thumbnail: typeof row?.thumbnail === 'string' && row.thumbnail.startsWith('data:image/') ? row.thumbnail : null,
      updatedAt: String(row?.updated_at || row?.created_at || ''),
    }))
    .filter((scene: SavedScene) => Number.isFinite(scene.id) && scene.id > 0)
    .sort((a: SavedScene, b: SavedScene) => (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0));
}

/**
 * Insert the scene the first time, update the same row afterwards. Returns the
 * row id. Throws when the database refuses the write, so the caller can show
 * "saved on this device only" instead of pretending it synced.
 */
export async function saveScene(doc: SceneDoc, sceneId: number | null, thumbnail: string | null): Promise<number> {
  const db = client();
  if (!db || typeof db.from !== 'function') throw new Error('The workspace database is not available on this page.');
  const clean = persistableDoc(doc);
  const name = clean.name.trim() || 'Untitled scene';
  if (sceneId) {
    await waitForDbSession();
    await db.from(SCENES_TABLE).update(sceneId, { name, doc: clean, ...(thumbnail ? { thumbnail } : {}) });
    return sceneId;
  }
  const inserted = await insertRow(SCENES_TABLE, { name, doc: clean, thumbnail: thumbnail || null });
  const id = Number(inserted?.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('The database saved no row id.');
  return id;
}

export async function deleteScene(sceneId: number): Promise<void> {
  await deleteRow(SCENES_TABLE, sceneId);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  let timer = 0;
  let pending: A | null = null;
  const run = () => {
    timer = 0;
    if (!pending) return;
    const args = pending;
    pending = null;
    fn(...args);
  };
  return {
    call: (...args: A) => {
      pending = args;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(run, waitMs);
    },
    flush: () => {
      if (timer) window.clearTimeout(timer);
      run();
    },
    cancel: () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      pending = null;
    },
  };
}
