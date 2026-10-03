/**
 * Noa's atlas, the first example, as the app last shipped it: needed only to bring an atlas saved by an early version
 * up to date (migrate.ts), so it is fetched only for such an atlas (see prepareToRead) and is not part of the app.
 */
import type { AtlasData } from '../domain/types';

let seed: typeof import('./seed') | undefined;

/** Fetch Noa's atlas, once. */
export async function loadNoa(): Promise<void> {
  seed ??= await import('./seed');
}

/** Noa's atlas built for today, or nothing while it has not been fetched. */
export const noaAtlas = (): AtlasData | undefined => seed?.createSeedData();
