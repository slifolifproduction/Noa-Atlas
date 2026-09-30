/**
 * Keeping one account's atlas the same on every device.
 *
 * Stored with the account, in the viewer's private part of the store:
 *   data/users/<id>/atlas               the manifest: revision, part hashes, who saved, when
 *   data/users/<id>/atlas/parts/p<i>    the atlas itself, compressed and cut into parts
 *
 * Writing: a change here is saved a moment after the last edit. The writer
 * takes a short lease on the manifest so two devices never write at once,
 * reads the manifest, and when another device saved in between, first puts
 * both edits together (sync/merge). Only parts that changed are written; the
 * manifest goes last, so a reader never sees a revision whose parts are not
 * there yet.
 * Reading: the manifest is watched. A newer revision from another device is
 * read, checked against its hashes, and put together with anything not yet
 * saved here.
 * The last revision this device saw (the base of any later merge) is kept on
 * the device in its compressed form. What the Atlas believes (the belief
 * ledger) is derived, so it stays on each device and is not synced.
 */
import { DATA_VERSION, migrateData } from '../persistence/storage';
import type { AtlasData } from '../domain/types';
import type { Db, DocRef } from '../runtime/claude';
import { decodeAtlas, encodeAtlas, fnv1a, type Encoding } from './codec';
import { mergeAtlas } from './merge';

export interface Manifest {
  rev: number;
  hash: string;
  hashes: string[];
  encoding: Encoding;
  parts: number;
  bytes: number;
  dataVersion: number;
  device: string;
  savedAt: string;
}

/** The revision this device last saw, compressed as stored. */
export interface Base {
  rev: number;
  encoding: Encoding;
  parts: string[];
  hash: string;
  dataVersion: number;
}

/** The store the atlas lives in on this device. */
export interface WorldPort {
  get(): AtlasData;
  /** Replace the atlas with one from the account; not a change of this device's to save. */
  load(data: AtlasData): void;
  /** Called on every change made here. */
  subscribe(onChange: () => void): () => void;
}

export interface BaseStore {
  read(): Base | null;
  write(base: Base | null): void;
}

export type SyncState = 'saved' | 'saving' | 'offline' | 'error' | 'newer';

export interface SyncStatus {
  state: SyncState;
  /** When this device last saved or received a revision. */
  at?: string;
  /** Records both devices had changed differently at the last merge. */
  conflicts?: number;
  code?: string;
}

export const EMPTY_MANIFEST: Manifest = {
  rev: 0,
  hash: '',
  hashes: [],
  encoding: 'json',
  parts: 0,
  bytes: 0,
  dataVersion: DATA_VERSION,
  device: '',
  savedAt: '',
};

/** The atlas as it travels: without the per-device belief ledger. */
export function syncable(data: AtlasData): AtlasData {
  const { beliefs: _beliefs, ...rest } = data;
  return rest as AtlasData;
}

const same = (a: AtlasData, b: AtlasData) => JSON.stringify(syncable(a)) === JSON.stringify(syncable(b));

const errorCode = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'unknown');

export class AccountSync {
  readonly manifest: DocRef;
  private base: Base | null;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;
  private loading = false;
  private stopped = false;
  private offs: (() => void)[] = [];

  constructor(
    db: Db,
    readonly uid: string,
    private readonly device: string,
    private readonly world: WorldPort,
    private readonly bases: BaseStore,
    private readonly report: (s: SyncStatus) => void,
    private readonly debounceMs = 1500,
  ) {
    this.manifest = db.doc(`data/users/${uid}/atlas`);
    this.base = bases.read();
  }

  /** The last revision this device saved or read (0: none yet). */
  get revision() {
    return this.base?.rev ?? 0;
  }

  private part(i: number) {
    return this.manifest.collection('parts').doc(`p${i}`);
  }

  /** One operation at a time: saves and reads never interleave. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private setBase(base: Base | null) {
    this.base = base;
    this.bases.write(base);
  }

  private apply(data: AtlasData) {
    this.loading = true;
    try {
      this.world.load(data);
    } finally {
      this.loading = false;
    }
  }

  async readManifest(): Promise<Manifest | null> {
    const snap = await this.manifest.get();
    return snap.exists ? ({ ...EMPTY_MANIFEST, ...snap.data() } as Manifest) : null;
  }

  /** The atlas a manifest describes, read and checked part by part (null when it holds none yet). */
  async fetch(m: Manifest): Promise<{ data: AtlasData; base: Base } | null> {
    if (!m.rev || !m.parts) return null;
    for (let attempt = 0; ; attempt++) {
      const parts: string[] = [];
      let whole = true;
      for (let i = 0; i < m.parts; i++) {
        const text = String((await this.part(i).get()).data()?.data ?? '');
        if (fnv1a(text) !== m.hashes[i]) whole = false;
        parts.push(text);
      }
      if (whole) {
        let data = await decodeAtlas(m.encoding, parts);
        if (m.dataVersion < DATA_VERSION) data = (migrateData({ data }, m.dataVersion) as { data: AtlasData }).data;
        return { data, base: { rev: m.rev, encoding: m.encoding, parts, hash: m.hash, dataVersion: m.dataVersion } };
      }
      // Caught between a writer's parts and its manifest: the next look finds them whole.
      if (attempt >= 3) throw { code: 'incomplete', message: 'The saved parts do not match their manifest yet.' };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  private async baseData(): Promise<AtlasData | null> {
    if (!this.base) return null;
    const data = await decodeAtlas(this.base.encoding, this.base.parts);
    return this.base.dataVersion < DATA_VERSION ? (migrateData({ data }, this.base.dataVersion) as { data: AtlasData }).data : data;
  }

  /** Take in a newer revision, keeping anything not yet saved here. Resolves whether this device still has something to save. */
  private async takeIn(m: Manifest): Promise<boolean> {
    const got = await this.fetch(m);
    if (!got) return false;
    const local = this.world.get();
    const base = await this.baseData();
    let next = got.data;
    let conflicts = 0;
    if (!base || !same(local, base)) {
      // Something changed here since the last revision this device saw (or it has none): put both together.
      const merged = mergeAtlas(base, local, got.data);
      next = merged.data;
      conflicts = merged.conflicts;
    }
    if (!same(next, local)) this.apply(next);
    this.setBase(got.base);
    this.report({ state: 'saved', at: new Date().toISOString(), conflicts });
    return !same(next, got.data);
  }

  /** Start keeping this device and the account the same. */
  start() {
    this.offs.push(
      this.world.subscribe(() => {
        if (!this.loading) this.schedule();
      }),
      this.manifest.onSnapshot(
        (snap) => {
          const m = snap.exists ? ({ ...EMPTY_MANIFEST, ...snap.data() } as Manifest) : null;
          if (!m || this.stopped || (this.base && m.rev <= this.base.rev)) return;
          if (m.dataVersion > DATA_VERSION) return this.report({ state: 'newer' });
          void this.run(async () => {
            if (await this.takeIn(m)) this.schedule();
          }).catch((e) => this.failed(e));
        },
        (e) => this.report({ state: e.code === 'revoked' ? 'error' : 'offline', code: e.code }),
      ),
    );
    // Anything saved here while the account could not be reached goes up now.
    void this.run(async () => {
      const m = await this.readManifest();
      if (m && this.base && m.rev > this.base.rev) await this.takeIn(m);
      const base = await this.baseData();
      if (!base || !same(this.world.get(), base)) this.schedule(0);
    }).catch((e) => this.failed(e));
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const off of this.offs.splice(0)) off();
  }

  schedule(ms = this.debounceMs) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(() => this.save()).catch((e) => this.failed(e));
    }, ms);
  }

  private failed(e: unknown) {
    const code = errorCode(e);
    const offline = code === 'unavailable' || code === 'resource_exhausted' || code === 'incomplete' || code === 'unknown';
    this.report({ state: offline ? 'offline' : 'error', code });
    if (!offline || this.stopped) return;
    // Try again later, less often each time.
    this.retry = Math.min(this.retry + 1, 5);
    this.schedule(Math.min(60_000, 2_000 * 2 ** this.retry));
  }

  /** Save what is here to the account (after putting in anything newer there). */
  async save(): Promise<void> {
    this.report({ state: 'saving' });
    const lease = await this.manifest.acquire({ holder: this.device, ttlMs: 20_000 });
    if (!lease.acquired) {
      // Another device is saving: look again when its lease runs out.
      const wait = lease.expiresAt ? Date.parse(lease.expiresAt) - Date.now() : 2_000;
      this.schedule(Math.max(500, Math.min(20_000, wait)));
      return;
    }
    const m = (await this.readManifest()) ?? EMPTY_MANIFEST;
    if (m.dataVersion > DATA_VERSION) return this.report({ state: 'newer' });
    if (m.rev && m.rev !== this.base?.rev) await this.takeIn(m);
    const enc = await encodeAtlas(syncable(this.world.get()));
    if (enc.hash === m.hash) {
      this.retry = 0;
      return this.report({ state: 'saved', at: new Date().toISOString() });
    }
    for (let i = 0; i < enc.parts.length; i++) {
      if (m.hashes[i] !== enc.hashes[i] || m.encoding !== enc.encoding) await this.part(i).set({ data: enc.parts[i], hash: enc.hashes[i] });
    }
    for (let i = enc.parts.length; i < m.parts; i++) await this.part(i).delete();
    const next: Manifest = {
      rev: m.rev + 1,
      hash: enc.hash,
      hashes: enc.hashes,
      encoding: enc.encoding,
      parts: enc.parts.length,
      bytes: enc.bytes,
      dataVersion: DATA_VERSION,
      device: this.device,
      savedAt: new Date().toISOString(),
    };
    await this.manifest.set({ ...next });
    this.setBase({ rev: next.rev, encoding: enc.encoding, parts: enc.parts, hash: enc.hash, dataVersion: DATA_VERSION });
    // There is no release: renewing with the shortest lease lets another device save a second from now.
    await this.manifest.acquire({ holder: this.device, ttlMs: 1_000 }).catch(() => undefined);
    this.retry = 0;
    this.report({ state: 'saved', at: next.savedAt });
  }

  /** Read the account's atlas now (used when this device has no copy yet). */
  pull(): Promise<AtlasData | null> {
    return this.run(async () => {
      const m = await this.readManifest();
      if (!m || !m.rev) return null;
      if (m.dataVersion > DATA_VERSION) {
        this.report({ state: 'newer' });
        return null;
      }
      const got = await this.fetch(m);
      if (!got) return null;
      this.setBase(got.base);
      return got.data;
    });
  }
}
