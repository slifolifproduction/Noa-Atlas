import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The examples and Noa's atlas as the app has them: only the first example with it, the rest fetched when needed. */
const fresh = async () => {
  vi.resetModules();
  const [examples, migrate, noa, atlas] = await Promise.all([
    import('./index'),
    import('../../persistence/migrate'),
    import('../noa'),
    import('../exampleAtlas'),
  ]);
  return { ...examples, ...migrate, ...noa, ...atlas };
};

describe('examples fetched when needed', () => {
  beforeEach(() => vi.resetModules());

  it('comes with the first example only, in both languages', async () => {
    const m = await fresh();
    for (const lang of ['id', 'en'] as const) {
      expect(m.exampleLoaded('designer', lang)).toBe(true);
      expect(m.createExample('designer', '2026-10-02', lang).profile.example).toBe('designer');
      for (const e of m.EXAMPLES.filter((x) => x.key !== 'designer')) expect(m.exampleLoaded(e.key, lang)).toBe(false);
    }
    expect(m.noaAtlas()).toBeUndefined();
    expect(() => m.createExample('accountant', '2026-10-02', 'en')).toThrow(/loadExample/);
  });

  it('builds one once it is fetched, and names it as the chooser does', async () => {
    const m = await fresh();
    for (const e of m.EXAMPLES)
      for (const lang of ['id', 'en'] as const) {
        const spec = await m.loadExample(e.key, lang);
        expect(spec.name).toBe(e.name);
        expect(m.createExample(e.key, '2026-10-02', lang).profile).toMatchObject({ name: e.name, example: e.key, exampleLang: lang });
      }
  });

  it('knows what reading a stored atlas needs, and fetches it', async () => {
    const m = await fresh();
    const accountant = { profile: { name: 'Daniel Reed', example: 'accountant', exampleLang: 'en' } };
    const noa = { profile: { name: m.SEED_PROFILE_NAME } };
    expect(m.canReadNow(undefined)).toBe(true);
    expect(m.canReadNow({ profile: { name: 'Mine' } })).toBe(true);
    expect(m.canReadNow({ profile: { name: 'Emma Collins', example: 'designer', exampleLang: 'id' } })).toBe(true);
    expect(m.canReadNow(accountant)).toBe(false);
    expect(m.canReadNow(noa)).toBe(false);
    await m.prepareToRead(accountant);
    await m.prepareToRead(noa);
    expect(m.canReadNow(accountant)).toBe(true);
    expect(m.canReadNow(noa)).toBe(true);
    expect(m.noaAtlas()?.profile.name).toBe(m.SEED_PROFILE_NAME);
  });

  it('leaves an older atlas as it is while what it needs is not here, and never throws', async () => {
    const m = await fresh();
    const old = { profile: { name: 'Daniel Reed', since: '2026-05-01', example: 'accountant', exampleLang: 'en' as const } };
    const data = old as unknown as Parameters<typeof m.refreshExample>[0];
    expect(m.refreshExample(data)).toBe(data);
    // Noa's, untouched: replaced by the first example only once her atlas is here to compare with.
    await import('../noa').then((n) => n.loadNoa());
    const seed = await import('../seed');
    const noa = seed.createSeedData('2026-10-02');
    const ready = await fresh();
    expect(ready.replaceUntouchedNoa(noa)).toBe(noa);
    await ready.loadNoa();
    expect(ready.replaceUntouchedNoa(noa).profile.example).toBe('designer');
  });
});
