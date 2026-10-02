import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { useStorageHealth } from './health';
import { safeLocalStorage } from './local';
import { atlasStorage, DATA_VERSION, UNREADABLE_KEY } from './storage';

/** A browser storage that holds what it is given, or refuses every write (full), as asked. */
function fakeBrowser(full = false) {
  const kept = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        kept.set(k, v);
      },
      removeItem: (k: string) => void kept.delete(k),
    },
  };
  return kept;
}

describe('keeping the atlas safe in the browser', () => {
  beforeEach(() => useStorageHealth.setState({ failing: false, unreadable: undefined }));
  afterEach(() => delete (globalThis as { window?: unknown }).window);

  it('reads a saved atlas as it was saved', () => {
    const kept = fakeBrowser();
    const saved = { state: { data: createSeedData() }, version: DATA_VERSION };
    kept.set('atlas', JSON.stringify(saved));
    expect(atlasStorage.getItem('atlas')).toEqual(saved);
    expect(useStorageHealth.getState().unreadable).toBeUndefined();
  });

  it('puts an atlas it cannot read aside, untouched, and says so, before anything writes over it', () => {
    const kept = fakeBrowser();
    for (const raw of ['{"state":{"data":{"entries":', JSON.stringify({ state: { data: { entries: 5, nodes: null } }, version: DATA_VERSION })]) {
      kept.set('atlas', raw);
      expect(atlasStorage.getItem('atlas')).toBeNull();
      expect(useStorageHealth.getState().unreadable?.raw).toBe(raw);
      expect(JSON.parse(kept.get(UNREADABLE_KEY)!).raw).toBe(raw);
    }
  });

  it('leaves an older shape to the migrations, and nothing stored is nothing to put aside', () => {
    const kept = fakeBrowser();
    kept.set('old', JSON.stringify({ state: { data: { domains: {}, nodes: {} } }, version: 2 }));
    expect(atlasStorage.getItem('old')).not.toBeNull();
    expect(atlasStorage.getItem('never')).toBeNull();
    expect(useStorageHealth.getState().unreadable).toBeUndefined();
  });

  it('says so when a write does not go through, and keeps the newer copy until one does', () => {
    const kept = fakeBrowser(true);
    kept.set('atlas', 'OLDER');
    safeLocalStorage.setItem('atlas', 'NEWER');
    expect(useStorageHealth.getState().failing).toBe(true);
    // The browser still holds the older copy; what is read back is the newer one this tab could not write.
    expect(safeLocalStorage.getItem('atlas')).toBe('NEWER');
    // Room again: the next write goes through, and the warning goes.
    const room = fakeBrowser();
    safeLocalStorage.setItem('atlas', 'NEWEST');
    expect(room.get('atlas')).toBe('NEWEST');
    expect(useStorageHealth.getState().failing).toBe(false);
  });
});
