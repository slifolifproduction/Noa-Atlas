import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { useStorageHealth } from './health';
import { safeLocalStorage } from './local';
import type { AtlasData } from '../domain/types';
import { atlasStorage, DATA_VERSION, UNREADABLE_KEY, whenCombined } from './storage';

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

describe('two tabs saving the same atlas', () => {
  afterEach(() => delete (globalThis as { window?: unknown }).window);

  /** A note, as a tab would add it. */
  const note = (d: AtlasData, id: string, content: string) => {
    const e = Object.values(d.entries)[0];
    d.entries[id] = { ...e, id, title: content, content };
  };
  const saved = (kept: Map<string, string>) => JSON.parse(kept.get('atlas')!) as { state: { data: AtlasData }; version: number };
  /** The atlas as stored, this tab having read it. */
  const opened = (kept: Map<string, string>, data: AtlasData) => {
    kept.set('atlas', JSON.stringify({ state: { data }, version: DATA_VERSION }));
    atlasStorage.getItem('atlas');
  };

  it('a save made before word of the other tab’s arrives takes in what that tab added, and is read back', async () => {
    const kept = fakeBrowser();
    const base = createSeedData();
    opened(kept, base);
    // The other tab adds a note and saves; word of it has not reached this tab.
    const theirs = structuredClone(base);
    note(theirs, 'e_b', 'NOTE B');
    kept.set('atlas', JSON.stringify({ state: { data: theirs }, version: DATA_VERSION }));
    // This tab adds its own and saves.
    const mine = structuredClone(base);
    note(mine, 'e_a', 'NOTE A');
    let readBack = 0;
    whenCombined(() => readBack++);
    atlasStorage.setItem('atlas', { state: { data: mine }, version: DATA_VERSION });
    const after = saved(kept).state.data;
    expect(after.entries.e_a?.content).toBe('NOTE A');
    expect(after.entries.e_b?.content).toBe('NOTE B');
    await Promise.resolve();
    expect(readBack).toBe(1);
  });

  it('what this tab deleted stays deleted, and what the other tab changed is kept', () => {
    const kept = fakeBrowser();
    const base = createSeedData();
    const [first, second] = Object.keys(base.entries);
    opened(kept, base);
    const theirs = structuredClone(base);
    theirs.entries[second] = { ...theirs.entries[second], content: 'EDITED THERE' };
    kept.set('atlas', JSON.stringify({ state: { data: theirs }, version: DATA_VERSION }));
    const mine = structuredClone(base);
    delete mine.entries[first];
    atlasStorage.setItem('atlas', { state: { data: mine }, version: DATA_VERSION });
    const after = saved(kept).state.data;
    expect(after.entries[first]).toBeUndefined();
    expect(after.entries[second]?.content).toBe('EDITED THERE');
  });

  it('with nothing saved meanwhile, a save is written as it is', () => {
    const kept = fakeBrowser();
    const base = createSeedData();
    opened(kept, base);
    const mine = structuredClone(base);
    note(mine, 'e_a', 'NOTE A');
    atlasStorage.setItem('atlas', { state: { data: mine }, version: DATA_VERSION });
    expect(saved(kept).state.data).toEqual(mine);
    // And again, from what it wrote: still nothing to put together.
    note(mine, 'e_c', 'NOTE C');
    atlasStorage.setItem('atlas', { state: { data: mine }, version: DATA_VERSION });
    expect(saved(kept).state.data).toEqual(mine);
  });

  it('a save by another version of the app is not put together with', () => {
    const kept = fakeBrowser();
    const base = createSeedData();
    opened(kept, base);
    kept.set('atlas', JSON.stringify({ state: { data: base }, version: DATA_VERSION + 1 }));
    const mine = structuredClone(base);
    note(mine, 'e_a', 'NOTE A');
    atlasStorage.setItem('atlas', { state: { data: mine }, version: DATA_VERSION });
    expect(saved(kept)).toEqual({ state: { data: mine }, version: DATA_VERSION });
  });
});
