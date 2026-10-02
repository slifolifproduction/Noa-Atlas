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
import { useStorageHealth } from './health';
import { safeLocalStorage, STORAGE_KEYS } from './local';
import { refreshExample, replaceUntouchedNoa, toCurrentShape } from './migrate';

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

/**
 * How the atlas is saved: as JSON through `safeLocalStorage`. Reading it, an atlas that cannot be read is never
 * silently replaced: it is put aside first (see keepAside), and the Atlas opens without it.
 */
export const atlasStorage: PersistStorage<{ data: AtlasData }> = {
  getItem(name) {
    const raw = safeLocalStorage.getItem(name) as string | null;
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
  setItem: (name, value) => void safeLocalStorage.setItem(name, JSON.stringify(value)),
  removeItem: (name) => void safeLocalStorage.removeItem(name),
};

export function exportPayload(data: AtlasData): string {
  return JSON.stringify({ app: 'noa-atlas', version: DATA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}
