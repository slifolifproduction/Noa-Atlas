import { AREA_KEYS } from '../domain/constants';
import type { Area, AreaKey, AtlasData } from '../domain/types';
import { todayISO } from '../lib/dates';

/** A blank atlas: the life areas exist, everything else is for the person to add. */
export function createEmptyData(name = ''): AtlasData {
  const now = new Date().toISOString();
  const areas = Object.fromEntries(AREA_KEYS.map((key) => [key, { key, statement: '', summary: '', updatedAt: now } satisfies Area])) as Record<AreaKey, Area>;
  return {
    profile: { name, since: todayISO() },
    areas,
    nodes: {},
    edges: {},
    claims: {},
    occurrences: {},
    entries: {},
    decisions: {},
    patterns: {},
    paths: {},
    experiments: {},
    currentState: { position: '', summary: '', constraints: [], assets: [], updatedAt: now },
    navigation: null,
    modelLog: [],
    counters: { entry: 0, decision: 0, pattern: 0, experiment: 0, claim: 0 },
    loopNames: {},
    causesLogic: 3,
  };
}
