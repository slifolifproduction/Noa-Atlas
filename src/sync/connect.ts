/**
 * Choosing where the atlas is kept, once at start-up.
 *
 * Inside claude.ai with a signed-in viewer who may save to their private
 * part of the store, the atlas is the account's: one world per account, the
 * same on every device. It is cached on the device under a key of its own,
 * so the device's own atlas (kept under the usual key) is never mixed in,
 * and it opens at once, even offline. Anywhere else, or for a viewer who
 * cannot save there, it stays on this device, exactly as before.
 *
 * An account with no atlas yet is not filled on its own: the interface offers
 * to move this device's atlas in (`moveIntoAccount`), or to leave it for now.
 */
import type { AtlasData } from '../domain/types';
import { createId } from '../lib/ids';
import { todayISO, addDays } from '../lib/dates';
import { prepareToRead } from '../persistence/migrate';
import { DATA_VERSION, migrateData, safeLocalStorage } from '../persistence/storage';
import { capability, insideClaude } from '../runtime/claude';
import { useAccount, type DeviceReason } from '../state/accountStore';
import { useAtlas } from '../state/atlasStore';
import { AccountSync, EMPTY_MANIFEST, type Base, type BaseStore, type WorldPort } from './accountSync';

const KEYS = {
  device: 'cognitive-atlas:device',
  world: (uid: string) => `cognitive-atlas:acct:${uid}`,
  base: (uid: string) => `cognitive-atlas:acct:${uid}:base`,
  /** A viewer found unable to save to their account; asked again after a week. */
  readOnly: (uid: string) => `cognitive-atlas:acct:${uid}:read-only`,
  /** "Not now" to moving this atlas in; offered again after a week. */
  offer: (uid: string) => `cognitive-atlas:acct:${uid}:offer`,
};

let engine: AccountSync | null = null;

function deviceId(): string {
  let id = safeLocalStorage.getItem(KEYS.device) as string | null;
  if (!id) {
    id = createId('dev');
    safeLocalStorage.setItem(KEYS.device, id);
  }
  return id;
}

const world: WorldPort = {
  get: () => useAtlas.getState().data,
  load: (data) => useAtlas.getState().loadWorld(data),
  subscribe: (onChange) => useAtlas.subscribe((s, prev) => void (s.data !== prev.data && onChange())),
};

function baseStore(uid: string): BaseStore {
  return {
    read() {
      try {
        const raw = safeLocalStorage.getItem(KEYS.base(uid)) as string | null;
        return raw ? (JSON.parse(raw) as Base) : null;
      } catch {
        return null;
      }
    },
    write(base) {
      if (base) safeLocalStorage.setItem(KEYS.base(uid), JSON.stringify(base));
      else safeLocalStorage.removeItem(KEYS.base(uid));
    },
  };
}

const recently = (key: string) => {
  const day = safeLocalStorage.getItem(key) as string | null;
  return Boolean(day) && addDays(day!, 7) > todayISO();
};

/** The account's atlas as this device last cached it. */
async function cached(uid: string): Promise<AtlasData | null> {
  try {
    const raw = safeLocalStorage.getItem(KEYS.world(uid)) as string | null;
    if (!raw) return null;
    const stored = JSON.parse(raw) as { state?: { data?: AtlasData }; version?: number };
    if (!stored.state?.data) return null;
    const version = stored.version ?? DATA_VERSION;
    if (version >= DATA_VERSION) return stored.state.data;
    await prepareToRead(stored.state.data);
    return (migrateData(stored.state, version) as { data: AtlasData }).data;
  } catch {
    return null;
  }
}

function onDevice(reason: DeviceReason, offer = false) {
  useAccount.setState({ mode: 'device', reason, offer });
}

/** From now on this device keeps the account's atlas under the account's own key. */
function enter(uid: string, data: AtlasData) {
  useAtlas.persist.setOptions({ name: KEYS.world(uid) });
  world.load(data);
  engine!.start();
  useAccount.setState({ mode: 'account', reason: undefined, offer: false });
}

export async function connectAccount(): Promise<void> {
  // Claude on the viewer's account is independent of where the atlas is kept.
  void capability('sample').then((sample) => useAccount.setState({ claude: sample ? 'available' : 'unavailable' }));
  if (!insideClaude()) return onDevice('outside');
  const [db, user] = await Promise.all([capability('db'), capability('user')]);
  if (!db || !user) return onDevice('signed-out');
  const uid = await user.id().catch(() => null);
  if (!uid) return onDevice('signed-out');
  engine = new AccountSync(db, uid, deviceId(), world, baseStore(uid), (sync) => useAccount.setState({ sync }));

  // A cached copy opens at once; the account is asked in the background.
  const copy = await cached(uid);
  if (copy && engine.revision) return enter(uid, copy);

  let manifest;
  try {
    manifest = await engine.readManifest();
  } catch {
    return onDevice('unreachable');
  }
  if (!manifest) {
    if (recently(KEYS.readOnly(uid))) return onDevice('read-only');
    try {
      // Also the test of whether this viewer may save here at all.
      await engine.manifest.set({ ...EMPTY_MANIFEST });
      manifest = EMPTY_MANIFEST;
    } catch {
      safeLocalStorage.setItem(KEYS.readOnly(uid), todayISO());
      return onDevice('read-only');
    }
  }
  if (!manifest.rev) {
    // The account can hold an atlas and has none yet.
    useAccount.setState({ mode: 'device', reason: undefined, offer: !recently(KEYS.offer(uid)) });
    return;
  }
  try {
    const data = await engine.pull();
    if (!data) return onDevice('unreachable');
    enter(uid, data);
  } catch {
    onDevice('unreachable');
  }
}

/** Move this device's atlas into the viewer's account (it stays on the device too, as it was). */
export async function moveIntoAccount(): Promise<void> {
  if (!engine) throw new Error('No account');
  await engine.save();
  if (!engine.revision) throw { code: 'busy', message: 'Another device is saving; try again in a moment.' };
  enter(engine.uid, useAtlas.getState().data);
}

/** Leave this atlas on the device for now; asked again in a week. */
export function notNow() {
  if (engine) safeLocalStorage.setItem(KEYS.offer(engine.uid), todayISO());
  useAccount.setState({ offer: false });
}
