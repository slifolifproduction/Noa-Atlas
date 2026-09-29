import { beforeEach, describe, expect, it } from 'vitest';
import { listVersions, MAX_VERSIONS, setMemoryVersionStore } from '../persistence/versions';
import { useAtlas } from './atlasStore';
import { useUI } from './uiStore';
import { importWithBackup, restoreVersion, saveCurrentVersion, startFresh } from './versionOps';
import { createSeedData } from '../data/seed';

describe('versions', () => {
  beforeEach(() => {
    setMemoryVersionStore();
    useAtlas.getState().replaceData(createSeedData('2026-09-28'));
    useUI.setState({ layouts: { orbit: { positions: { n_x: { x: 1, y: 2 } } }, mind: { positions: {} } } });
  });

  it('saves the current atlas with its counts and arrangement', async () => {
    const v = await saveCurrentVersion('Before the new job');
    expect(v.name).toBe('Before the new job');
    expect(v.counts.records).toBeGreaterThan(0);
    expect(await listVersions()).toHaveLength(1);
  });

  it('starts fresh, and the saved version brings everything back', async () => {
    const before = useAtlas.getState().data;
    const saved = await startFresh({ save: true, name: 'Before restart', mode: 'empty', profileName: 'Sam' });
    expect(Object.keys(useAtlas.getState().data.entries)).toHaveLength(0);
    expect(useAtlas.getState().data.profile.name).toBe('Sam');
    expect(useUI.getState().layouts.orbit.positions).toEqual({});

    await restoreVersion(saved!.id);
    expect(useAtlas.getState().data).toEqual(before);
    expect(useUI.getState().layouts.orbit.positions).toEqual({ n_x: { x: 1, y: 2 } });
    // Restoring saved the fresh atlas first, so that one is not lost either.
    const reasons = (await listVersions()).map((v) => v.reason);
    expect(reasons).toEqual(['restore', 'restart']);
  });

  it('can restore without a backup (undo right after starting fresh)', async () => {
    const saved = await startFresh({ save: true, name: 'x', mode: 'sample' });
    await restoreVersion(saved!.id, { backup: false });
    expect(await listVersions()).toHaveLength(1);
  });

  it('saves before importing', async () => {
    await importWithBackup(createSeedData('2026-01-05'));
    expect((await listVersions())[0].reason).toBe('import');
  });

  it('keeps named versions when pruning old automatic ones', async () => {
    await saveCurrentVersion('Mine');
    for (let i = 0; i < MAX_VERSIONS + 3; i++) await saveCurrentVersion(`auto ${i}`, 'restart');
    const all = await listVersions();
    expect(all).toHaveLength(MAX_VERSIONS);
    expect(all.some((v) => v.name === 'Mine')).toBe(true);
  });
});
