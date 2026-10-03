/**
 * Telling an example atlas from the person's own, without the examples themselves: these are read on every screen,
 * while Noa's atlas (seed.ts) and the people's (examples/) are fetched only when needed.
 */
import type { AtlasData } from '../domain/types';

export const SEED_PROFILE_NAME = 'Noa Varela';

/** Whether an atlas is the first example, Noa's around Night Ferry (still kept by those who opened it before). */
export const isNoaExample = (data: Pick<AtlasData, 'profile' | 'claims' | 'entries'>) =>
  data.profile?.name === SEED_PROFILE_NAME && Boolean(data.claims?.c01) && Boolean(data.entries?.ent_01);

/**
 * Whether an atlas is an example (one of the people in data/examples, or
 * Noa's): there to learn how the Atlas works, never the person's own. Notes
 * the person adds while exploring it do not make it theirs.
 */
export const isExampleAtlas = (data: Pick<AtlasData, 'profile' | 'claims' | 'entries'>) => Boolean(data.profile?.example) || isNoaExample(data);
