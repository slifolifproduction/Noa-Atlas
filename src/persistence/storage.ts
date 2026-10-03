/**
 * Local persistence for the prototype.
 *
 * Everything the store persists goes through `safeLocalStorage`, a
 * StateStorage-compatible adapter. Replacing it with a backend means providing
 * another adapter with the same three methods; the store and UI do not change.
 */
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { AtlasData } from '../domain/types';
import { t } from '../i18n';
import { mergeAtlas } from '../sync/merge';
import { useStorageHealth } from './health';
import { safeLocalStorage, STORAGE_KEYS } from './local';
import { prepareToRead, refreshExample, replaceUntouchedNoa, toCurrentShape } from './migrate';

export { safeLocalStorage, STORAGE_KEYS } from './local';

/** Bump when AtlasData changes shape, and add a step to `migrateData`. */
export const DATA_VERSION = 7;

/** Step-wise migrations from older persisted versions. */
export function migrateData(persisted: unknown, fromVersion: number): unknown {
  const state = persisted as { data?: unknown } | undefined;
  if (!state?.data || fromVersion >= 7) return persisted;
  // v1 → v2: the layered model (areas × layers, links vs claims, history).
  // v2 → v3: the logic of causes (a stored sample gets its corrected claims).
  // v3 → v4: what changed, episodes, expectations (a stored sample gets what it now records).
  // v4 → v5: only additions (scopes, channels, the belief ledger, declined inquiries), all optional:
  // an atlas saved at v4 is already in shape, and its first belief ledger is taken on first use.
  const data = fromVersion >= 4 ? (state.data as AtlasData) : toCurrentShape(state.data);
  // v5 → v6: the example became people in eight kinds of work. Noa's example, never written in, gives way to the
  // first of them; one the person wrote in stays as it is (its note offers the new ones).
  const v6 = fromVersion < 6 ? replaceUntouchedNoa(data) : data;
  // v6 → v7: the examples' people got globally common names. An example the person added nothing to is reopened
  // with them; one they added to stays as it is.
  return { ...state, data: fromVersion < 7 ? refreshExample(v6) : v6 };
}

const REQUIRED_RECORDS = ['nodes', 'edges', 'entries', 'decisions', 'patterns', 'paths', 'experiments'] as const;

/** Read an imported export file, with what an older one needs fetched first (see prepareToRead). */
export async function readImport(text: string): Promise<{ data: AtlasData } | { error: string }> {
  try {
    const parsed = JSON.parse(text) as { data?: unknown };
    await prepareToRead(parsed?.data ?? parsed);
  } catch {
    // Not JSON: parseImport says so.
  }
  return parseImport(text);
}

/** Validate an imported export file. Returns the data or a human-readable error. */
export function parseImport(text: string): { data: AtlasData } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: t('The file is not valid JSON.') };
  }
  const candidate = (raw && typeof raw === 'object' && 'data' in raw ? (raw as { data: unknown }).data : raw) as Record<string, unknown>;
  if (!candidate || typeof candidate !== 'object') return { error: t('The file does not contain atlas data.') };
  for (const key of REQUIRED_RECORDS) {
    if (!candidate[key] || typeof candidate[key] !== 'object') return { error: t('Missing “{key}” in the imported file.', { key }) };
  }
  if (!Array.isArray(candidate.modelLog) || !candidate.counters || !candidate.currentState) {
    return { error: t('The file is missing the model log, counters or current state.') };
  }
  // Files exported before the layered model are converted on the way in.
  return { data: toCurrentShape(candidate) };
}

/** Where an atlas found unreadable on load is put aside, untouched (one, the latest). */
export const UNREADABLE_KEY = `${STORAGE_KEYS.data}:unreadable`;

/**
 * Whether what is stored can be read as a saved atlas: valid JSON, and, from the shape this version keeps (4 on), the
 * records an atlas cannot be without. An older shape is left to the migrations. Nothing stored yet is not unreadable.
 */
function readable(value: unknown): value is StorageValue<{ data?: AtlasData }> {
  if (!value || typeof value !== 'object') return false;
  const { state, version } = value as { state?: unknown; version?: unknown };
  if (!state || typeof state !== 'object') return false;
  const data = (state as { data?: unknown }).data;
  if (data === undefined) return true;
  if (!data || typeof data !== 'object') return false;
  if (typeof version === 'number' && version < 4) return true;
  return REQUIRED_RECORDS.every((k) => {
    const r = (data as Record<string, unknown>)[k];
    return Boolean(r) && typeof r === 'object';
  });
}

/** Put an unreadable atlas aside, exactly as it was, and say so, before anything can write over it. */
function keepAside(key: string, raw: string) {
  const at = new Date().toISOString();
  safeLocalStorage.setItem(UNREADABLE_KEY, JSON.stringify({ key, at, raw }));
  useStorageHealth.getState().setUnreadable({ key, at, raw });
  console.warn('[atlas] the saved atlas could not be read; it is kept aside under', UNREADABLE_KEY);
}

/** What this tab last read or wrote, by key: the common past when another tab has saved since (see setItem). */
const seen = new Map<string, string | null>();
let combined: (() => void) | undefined;

/** Run after a save that took in another tab's changes, for the store to read the combined atlas back. */
export const whenCombined = (fn: () => void) => void (combined = fn);

/** A saved atlas as stored, if it is one this version can put together with another. */
function savedAtlas(raw: string | null | undefined, version?: number): AtlasData | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!readable(value) || value.version !== version) return null;
    return value.state.data ?? null;
  } catch {
    return null;
  }
}

/**
 * How the atlas is saved: as JSON through `safeLocalStorage`. Reading it, an atlas that cannot be read is never
 * silently replaced: it is put aside first (see keepAside), and the Atlas opens without it.
 *
 * Two tabs: each reads what the other saved as soon as the browser says so (atlasStore), but that word can arrive
 * after this tab has saved again (Firefox, under load). So a save first looks at what is stored: when another tab
 * saved since this one last read or wrote, the two are put together, from what this tab last saw, as two devices'
 * edits are (mergeAtlas), instead of one writing over what the other added. A browser too full to write keeps this
 * tab's copy and reads it back, so nothing is put together then.
 */
export const atlasStorage: PersistStorage<{ data: AtlasData }> = {
  getItem(name) {
    const raw = safeLocalStorage.getItem(name) as string | null;
    seen.set(name, raw);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (readable(value)) return value as StorageValue<{ data: AtlasData }>;
    } catch {
      /* unreadable: below */
    }
    keepAside(name, raw);
    return null;
  },
  setItem(name, value) {
    const now = safeLocalStorage.getItem(name) as string | null;
    if (seen.has(name) && now !== null && now !== seen.get(name)) {
      const theirs = savedAtlas(now, value.version);
      if (theirs && value.state.data) {
        const data = mergeAtlas(savedAtlas(seen.get(name), value.version), value.state.data, theirs).data;
        safeLocalStorage.setItem(name, JSON.stringify({ ...value, state: { ...value.state, data } }));
        // This tab still holds its own atlas until it reads the combined one back, and a save can come before that (two
        // in one go): so what it last saw stays the common past, and such a save is put together again, not written over.
        queueMicrotask(() => combined?.());
        return;
      }
    }
    const raw = JSON.stringify(value);
    safeLocalStorage.setItem(name, raw);
    seen.set(name, raw);
  },
  removeItem(name) {
    safeLocalStorage.removeItem(name);
    seen.delete(name);
  },
};

export function exportPayload(data: AtlasData): string {
  return JSON.stringify({ app: 'noa-atlas', version: DATA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}
