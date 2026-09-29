/**
 * Local persistence for the prototype.
 *
 * Everything the store persists goes through `safeLocalStorage`, a
 * StateStorage-compatible adapter. Replacing it with a backend means providing
 * another adapter with the same three methods; the store and UI do not change.
 */
import type { AtlasData } from '../domain/types';
import { t } from '../i18n';

export { safeLocalStorage, STORAGE_KEYS } from './local';

/** Bump when AtlasData changes shape, and add a step to `migrateData`. */
export const DATA_VERSION = 1;

/** Step-wise migrations from older persisted versions. */
export function migrateData(persisted: unknown, fromVersion: number): unknown {
  // v1 is the first persisted shape; future versions transform `persisted` here.
  void fromVersion;
  return persisted;
}

const REQUIRED_RECORDS = ['domains', 'nodes', 'edges', 'entries', 'decisions', 'patterns', 'paths', 'experiments'] as const;

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
  return { data: candidate as unknown as AtlasData };
}

export function exportPayload(data: AtlasData): string {
  return JSON.stringify({ app: 'cognitive-atlas', version: DATA_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}
