/**
 * Saved versions of the whole atlas: named save points you can go back to.
 *
 * Stored in IndexedDB (a browser database with far more room than
 * localStorage, so many versions fit), with an in-memory fallback where
 * IndexedDB is unavailable (private windows in some browsers, tests).
 */
import type { AtlasData, GraphLayer } from '../domain/types';
import { t } from '../i18n';

export type VersionReason = 'manual' | 'restart' | 'import' | 'restore';

export interface VersionMeta {
  id: string;
  name: string;
  createdAt: string;
  reason: VersionReason;
  profile: string;
  counts: { records: number; points: number; patterns: number };
}

/** Saved graph arrangements, so a restored atlas also looks the way it did. */
export type SavedLayouts = Partial<Record<GraphLayer, { positions: Record<string, { x: number; y: number }> }>>;

export interface AtlasVersion extends VersionMeta {
  data: AtlasData;
  layouts?: SavedLayouts;
}

/** Old automatic versions are pruned beyond this; versions you saved yourself are kept first. */
export const MAX_VERSIONS = 30;

interface Backend {
  all(): Promise<AtlasVersion[]>;
  put(v: AtlasVersion): Promise<void>;
  remove(id: string): Promise<void>;
}

function memoryBackend(): Backend {
  const rows = new Map<string, AtlasVersion>();
  return {
    all: async () => [...rows.values()].map((v) => structuredClone(v)),
    put: async (v) => void rows.set(v.id, structuredClone(v)),
    remove: async (id) => void rows.delete(id),
  };
}

function indexedDbBackend(): Backend | null {
  if (typeof indexedDB === 'undefined') return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('cognitive-atlas', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('versions', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) => {
    db ??= open();
    const d = await db;
    return new Promise<T>((resolve, reject) => {
      const req = fn(d.transaction('versions', mode).objectStore('versions'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    all: () => run<AtlasVersion[]>('readonly', (s) => s.getAll() as IDBRequest<AtlasVersion[]>),
    put: async (v) => void (await run('readwrite', (s) => s.put(v))),
    remove: async (id) => void (await run('readwrite', (s) => s.delete(id))),
  };
}

let backend: Backend | null = null;
const store = (): Backend => (backend ??= indexedDbBackend() ?? memoryBackend());

/** Tests use the in-memory store. */
export function setMemoryVersionStore() {
  backend = memoryBackend();
}

const listeners = new Set<() => void>();
export function onVersionsChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

const meta = ({ data: _data, layouts: _layouts, ...m }: AtlasVersion): VersionMeta => m;

export function countsOf(data: AtlasData): VersionMeta['counts'] {
  return {
    records: Object.keys(data.entries).length + Object.keys(data.decisions).length,
    points: Object.keys(data.nodes).length,
    patterns: Object.values(data.patterns).filter((p) => !p.setAside).length,
  };
}

/** Newest first, without the (large) data. */
export async function listVersions(): Promise<VersionMeta[]> {
  const all = await store().all();
  return all.map(meta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getVersion(id: string): Promise<AtlasVersion | undefined> {
  return (await store().all()).find((v) => v.id === id);
}

export async function putVersion(input: { name: string; reason: VersionReason; data: AtlasData; layouts?: SavedLayouts }): Promise<VersionMeta> {
  const version: AtlasVersion = {
    id: `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim() || t('Untitled version'),
    createdAt: new Date().toISOString(),
    reason: input.reason,
    profile: input.data.profile.name,
    counts: countsOf(input.data),
    data: structuredClone(input.data),
    layouts: input.layouts ? structuredClone(input.layouts) : undefined,
  };
  await store().put(version);
  await prune();
  changed();
  return meta(version);
}

async function prune() {
  const all = (await store().all()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let extra = all.length - MAX_VERSIONS;
  if (extra <= 0) return;
  // Oldest automatic versions go first; your own named versions only if there is no other room.
  for (const v of [...all.filter((x) => x.reason !== 'manual'), ...all.filter((x) => x.reason === 'manual')]) {
    if (extra-- <= 0) break;
    await store().remove(v.id);
  }
}

export async function renameVersion(id: string, name: string) {
  const v = await getVersion(id);
  if (!v) return;
  await store().put({ ...v, name: name.trim() || v.name });
  changed();
}

export async function deleteVersion(id: string) {
  await store().remove(id);
  changed();
}
