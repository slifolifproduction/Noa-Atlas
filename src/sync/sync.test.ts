import { describe, expect, it, vi } from 'vitest';
import { createSeedData } from '../data/seed';
import type { AtlasData } from '../domain/types';
import type { Db, DocRef, DocSnapshot } from '../runtime/claude';
import { AccountSync, type Base, type SyncStatus, type WorldPort } from './accountSync';
import { decodeAtlas, encodeAtlas } from './codec';
import { mergeAtlas } from './merge';

const TODAY = '2026-09-30';

/** An in-memory stand-in for the account store: documents, leases, live snapshots. */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, Set<(s: DocSnapshot) => void>>();
  const leases = new Map<string, { holder: string; until: number }>();
  const snap = (path: string): DocSnapshot => {
    const body = docs.get(path);
    return { id: path.split('/').pop()!, exists: Boolean(body), data: () => (body ? structuredClone(body) : undefined) };
  };
  const ref = (path: string): DocRef => ({
    path,
    get: async () => snap(path),
    set: async (d) => {
      docs.set(path, structuredClone(d));
      for (const fn of listeners.get(path) ?? []) queueMicrotask(() => fn(snap(path)));
    },
    delete: async () => void docs.delete(path),
    acquire: async ({ holder, ttlMs = 30_000 }) => {
      const l = leases.get(path);
      if (l && l.until > Date.now() && l.holder !== holder) return { acquired: false, expiresAt: new Date(l.until).toISOString() };
      leases.set(path, { holder, until: Date.now() + ttlMs });
      return { acquired: true };
    },
    onSnapshot: (next) => {
      const set = listeners.get(path) ?? new Set();
      listeners.set(path, set);
      set.add(next);
      queueMicrotask(() => next(snap(path)));
      return () => set.delete(next);
    },
    collection: (sub) => ({ doc: (id) => ref(`${path}/${sub}/${id}`) }),
  });
  const db: Db = { doc: ref };
  return { db, docs, leases };
}

/** A device: its own copy of the atlas, and its own saved base. */
function device(data: AtlasData) {
  let current = structuredClone(data);
  const subs = new Set<() => void>();
  let base: Base | null = null;
  const world: WorldPort = {
    get: () => current,
    load: (d) => {
      current = structuredClone(d);
      for (const fn of subs) fn();
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  const statuses: SyncStatus[] = [];
  return {
    world,
    statuses,
    bases: { read: () => base, write: (b: Base | null) => void (base = b) },
    edit(fn: (d: AtlasData) => void) {
      current = structuredClone(current);
      fn(current);
      for (const f of subs) f();
    },
    get data() {
      return current;
    },
  };
}

const entryIds = (d: AtlasData) => Object.keys(d.entries).sort();

describe('codec', () => {
  it('round-trips an atlas through compressed parts', async () => {
    const data = createSeedData(TODAY);
    const enc = await encodeAtlas(data, 5_000);
    expect(enc.parts.length).toBeGreaterThan(1);
    expect(enc.hashes).toHaveLength(enc.parts.length);
    expect(await decodeAtlas(enc.encoding, enc.parts)).toEqual(JSON.parse(JSON.stringify(data)));
    // The same atlas gives the same parts, so unchanged parts are never rewritten.
    expect((await encodeAtlas(data, 5_000)).hashes).toEqual(enc.hashes);
  });
});

describe('merging two edits of one atlas', () => {
  const base = createSeedData(TODAY);
  const [e1, e2] = Object.keys(base.entries);
  const node = Object.keys(base.nodes)[0];

  it('keeps what each side changed, deletions included', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.entries[e1].title = 'Changed here';
    remote.entries[e2].title = 'Changed there';
    delete local.entries[e2 === e1 ? '' : Object.keys(base.entries)[2]];
    const { data, conflicts } = mergeAtlas(base, local, remote);
    expect(data.entries[e1].title).toBe('Changed here');
    expect(data.entries[e2].title).toBe('Changed there');
    expect(data.entries[Object.keys(base.entries)[2]]).toBeUndefined();
    expect(conflicts).toBe(0);
  });

  it('keeps records added on either side', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.entries.e_here = { ...structuredClone(base.entries[e1]), id: 'e_here', title: 'Written here' };
    remote.entries.e_there = { ...structuredClone(base.entries[e1]), id: 'e_there', title: 'Written there' };
    const { data, conflicts } = mergeAtlas(base, local, remote);
    expect(data.entries.e_here?.title).toBe('Written here');
    expect(data.entries.e_there?.title).toBe('Written there');
    expect(conflicts).toBe(0);
  });

  it('lets the later edit win when both changed the same record, and counts it', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.nodes[node].label = 'Here';
    local.nodes[node].updatedAt = '2026-09-30T10:00:00.000Z';
    remote.nodes[node].label = 'There';
    remote.nodes[node].updatedAt = '2026-09-30T11:00:00.000Z';
    const { data, conflicts } = mergeAtlas(base, local, remote);
    expect(data.nodes[node].label).toBe('There');
    expect(conflicts).toBe(1);
  });

  it('keeps the history of both sides, and counters only go up', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.modelLog.push({ id: 'log_here', at: '2026-09-30T09:00:00.000Z', kind: 'claim_view', summary: 'here' });
    remote.modelLog.push({ id: 'log_there', at: '2026-09-30T08:00:00.000Z', kind: 'claim_view', summary: 'there' });
    local.counters.entry += 1;
    remote.counters.entry += 3;
    const { data } = mergeAtlas(base, local, remote);
    const ids = data.modelLog.map((u) => u.id);
    expect(ids).toContain('log_here');
    expect(ids).toContain('log_there');
    expect(ids.indexOf('log_there')).toBeLessThan(ids.indexOf('log_here'));
    expect(data.counters.entry).toBe(base.counters.entry + 3);
  });
});

describe('keeping an account the same on two devices', () => {
  it('saves from one device, reads on another, and brings later changes across', async () => {
    const { db } = fakeDb();
    const a = device(createSeedData(TODAY));
    const b = device(createSeedData(TODAY));
    b.edit((d) => {
      d.entries = {};
    });
    const syncA = new AccountSync(db, 'u1', 'dev-a', a.world, a.bases, (s) => a.statuses.push(s), 60_000);
    await syncA.save();
    expect(a.statuses.at(-1)?.state).toBe('saved');

    const syncB = new AccountSync(db, 'u1', 'dev-b', b.world, b.bases, (s) => b.statuses.push(s), 60_000);
    const pulled = await syncB.pull();
    b.world.load(pulled!);
    expect(entryIds(b.data)).toEqual(entryIds(a.data));
    syncB.start();

    a.edit((d) => {
      d.profile.name = 'From A';
    });
    await syncA.save();
    await vi.waitFor(() => expect(b.data.profile.name).toBe('From A'));
    syncB.stop();
  });

  it('puts together edits two devices made before seeing each other’s', async () => {
    const { db, leases } = fakeDb();
    const seed = createSeedData(TODAY);
    const a = device(seed);
    const b = device(seed);
    const syncA = new AccountSync(db, 'u1', 'dev-a', a.world, a.bases, () => {}, 60_000);
    await syncA.save();
    const syncB = new AccountSync(db, 'u1', 'dev-b', b.world, b.bases, () => {}, 60_000);
    b.world.load((await syncB.pull())!);

    const [e1, e2] = Object.keys(seed.entries);
    a.edit((d) => void (d.entries[e1].title = 'Edited on A'));
    b.edit((d) => void (d.entries[e2].title = 'Edited on B'));
    await syncA.save();
    leases.clear(); // A's short lease has run out.
    await syncB.save(); // B finds A's revision first, and merges before saving.
    leases.clear();
    await syncA.save(); // A takes in B's revision.
    for (const d of [a.data, b.data]) {
      expect(d.entries[e1].title).toBe('Edited on A');
      expect(d.entries[e2].title).toBe('Edited on B');
    }
  });

  it('waits while another device holds the lease', async () => {
    const { db, leases } = fakeDb();
    const a = device(createSeedData(TODAY));
    const statuses: SyncStatus[] = [];
    const syncA = new AccountSync(db, 'u1', 'dev-a', a.world, a.bases, (s) => statuses.push(s), 60_000);
    leases.set('data/users/u1/atlas', { holder: 'dev-b', until: Date.now() + 10_000 });
    await syncA.save();
    expect(a.bases.read()).toBeNull();
    expect(statuses.at(-1)?.state).toBe('saving');
    syncA.stop();
  });
});
