/**
 * What claude.ai offers a page it hosts.
 *
 * Opened inside claude.ai, the app finds `window.claude` and can ask for a
 * capability by name: `db` (a store kept with the account), `user` (who is
 * looking) and `sample` (asking Claude, on the viewer's own account). Opened
 * anywhere else (a local build, a download) there is no such object and every
 * capability is absent: the app then keeps everything on the device and reads
 * notes with its own rules. A capability can also be absent inside claude.ai
 * (signed out, or not allowed for this viewer); the app is built for that.
 *
 * Only the few calls the app makes are typed here; the platform's own type
 * definitions are the authority.
 */

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DocRef {
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  acquire(options: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean; expiresAt?: string }>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: { code: string; message: string }) => void): () => void;
  collection(path: string): { doc(id: string): DocRef };
}

export interface Db {
  doc(path: string): DocRef;
}

export interface UserCapability {
  id(): Promise<string | null>;
  isOwner(): Promise<boolean>;
}

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
}

export interface SampleOptions {
  onText?: (update: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  tools?: SampleTool[];
  modelTier?: 'quick' | 'default' | 'complex';
  cache?: boolean | { gcTime?: number; refresh?: boolean };
}

export interface Sample {
  (input: string, options?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>;
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number } }>;
}

/** A failed `sample` call: branch on the code, never on the message. */
export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

interface Capabilities {
  db: Db;
  user: UserCapability;
  sample: Sample;
}

interface Runtime {
  use(name: string): Promise<unknown>;
}

const runtime = (): Runtime | null => {
  const c = (globalThis as { claude?: Runtime }).claude;
  return c && typeof c.use === 'function' ? c : null;
};

/** Whether the page runs inside claude.ai at all (capabilities may still be absent). */
export const insideClaude = () => runtime() !== null;

const asked = new Map<string, Promise<unknown>>();

/** A capability, or null when this view cannot use it. Asked once per page load. */
export function capability<K extends keyof Capabilities>(name: K): Promise<Capabilities[K] | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  if (!asked.has(name))
    asked.set(
      name,
      rt.use(name).catch(() => null),
    );
  return asked.get(name) as Promise<Capabilities[K] | null>;
}
