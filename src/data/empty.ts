import { DOMAINS } from '../domain/constants';
import type { AtlasData, Domain, DomainKey } from '../domain/types';
import { todayISO } from '../lib/dates';

/** A blank atlas: the ten domains exist, everything else is for the user to add. */
export function createEmptyData(name = ''): AtlasData {
  const now = new Date().toISOString();
  const domains = Object.fromEntries(
    DOMAINS.map((d) => [d.key, { key: d.key, statement: '', summary: '', updatedAt: now } satisfies Domain]),
  ) as Record<DomainKey, Domain>;
  return {
    profile: { name, since: todayISO() },
    domains,
    nodes: {},
    edges: {},
    entries: {},
    decisions: {},
    patterns: {},
    paths: {},
    experiments: {},
    currentState: { position: '', summary: '', constraints: [], assets: [], updatedAt: now },
    navigation: null,
    modelLog: [],
    counters: { entry: 0, decision: 0, pattern: 0, experiment: 0 },
  };
}
