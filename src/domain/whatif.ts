/**
 * What might change if a factor changed: a qualitative estimate from the
 * claims on the map, with its reasons and assumptions in view.
 *
 * A change travels along claims. Each link passes on a direction: "raises"
 * keeps it (more A, more B), "lowers" turns it (more A, less B). Along a
 * route the turns multiply out (signed-graph reasoning); nothing is added up
 * or weighed. When several routes reach the same factor and disagree, the
 * answer is "it depends": the Atlas cannot tell which route is stronger, and
 * says so rather than averaging. Links that only make something possible or
 * limit it are gates, not amounts: they are marked. Delays along a route add
 * up to a window. Every claim used is an assumption, with its status.
 *
 * It is an estimate from the model as it stands, never a forecast of what
 * will happen, and it becomes something to learn from only when kept as an
 * expectation and checked.
 *
 * It is a question about changing something yourself, which is not the same
 * as seeing it change. A link seen in the record, but never changed on
 * purpose, may be two things moved together by something else: when you
 * change the cause yourself, that part does not follow. So every consequence
 * says what it rests on: links you tested; links seen but not tested; or
 * links with a known common cause not yet told apart, which may not follow at
 * all.
 */
import { claimStatus, evidenceProfile } from './claims';
import { isGate, lagRange, liveClaims, pushes } from './compare';
import { STATUS_META } from './constants';
import type { Lean } from './factors';
import type { AtlasData, Claim, ClaimStatus, ID } from './types';

/** What a change you make yourself can rely on along a route. */
export type IfYouChange = 'tested' | 'seen' | 'confounded';

export interface Route {
  claims: Claim[];
  lean: Lean;
  gated: boolean;
  window: [number, number];
  weakest: ClaimStatus;
  /** Every link tested by a deliberate change; or seen only; or with a common cause not yet told apart. */
  ifYouChange: IfYouChange;
}

export interface Consequence {
  id: ID;
  /** Which way it would go; "mixed" when routes disagree. */
  lean: Lean | 'mixed';
  routes: Route[];
  window: [number, number];
  /** The weakest claim across its routes. */
  weakest: ClaimStatus;
  /** Steps from the change: 1 is direct. */
  depth: number;
  /** The least a change you make yourself can rely on, across its routes. */
  ifYouChange: IfYouChange;
}

const IF_RANK: Record<IfYouChange, number> = { confounded: 0, seen: 1, tested: 2 };

/** What changing a link's cause yourself can rely on. */
function linkBasis(data: AtlasData, c: Claim): IfYouChange {
  const p = evidenceProfile(data, c);
  if (p.testsFor > 0) return 'tested';
  return p.needsTellingApart && !p.toldApart ? 'confounded' : 'seen';
}

const weaker = (a: ClaimStatus, b: ClaimStatus) => (STATUS_META[a].rank <= STATUS_META[b].rank ? a : b);

/** Claims a change can travel along: on the map, still holding, not outweighed by exceptions. */
const usable = (data: AtlasData) => liveClaims(data).filter((c) => claimStatus(data, c) !== 'weakened');

export function whatIf(data: AtlasData, start: ID, change: 'more' | 'less', maxDepth = 3): Consequence[] {
  const claims = usable(data);
  const bySource = new Map<ID, Claim[]>();
  for (const c of claims) bySource.set(c.from, [...(bySource.get(c.from) ?? []), c]);
  const routes = new Map<ID, Route[]>();

  const walk = (at: ID, lean: Lean, path: Claim[], seen: Set<ID>) => {
    if (path.length >= maxDepth) return;
    for (const c of bySource.get(at) ?? []) {
      if (seen.has(c.to) || c.to === start) continue;
      const next = pushes(c.effect, lean);
      const members = [...path, c];
      const window = members.reduce<[number, number]>(
        (w, m) => {
          const [lo, hi] = lagRange(m);
          return [w[0] + lo, w[1] + hi];
        },
        [0, 0],
      );
      const route: Route = {
        claims: members,
        lean: next,
        gated: members.some((m) => isGate(m.effect)),
        window,
        weakest: members.map((m) => claimStatus(data, m)).reduce(weaker),
        ifYouChange: members.map((m) => linkBasis(data, m)).reduce((a, b) => (IF_RANK[a] <= IF_RANK[b] ? a : b)),
      };
      routes.set(c.to, [...(routes.get(c.to) ?? []), route]);
      seen.add(c.to);
      walk(c.to, next, members, seen);
      seen.delete(c.to);
    }
  };
  walk(start, change, [], new Set([start]));

  const out: Consequence[] = [];
  for (const [id, rs] of routes) {
    const leans = new Set(rs.map((r) => r.lean));
    out.push({
      id,
      lean: leans.size > 1 ? 'mixed' : rs[0].lean,
      routes: rs.sort((a, b) => a.claims.length - b.claims.length),
      window: [Math.min(...rs.map((r) => r.window[0])), Math.max(...rs.map((r) => r.window[1]))],
      weakest: rs.map((r) => r.weakest).reduce(weaker),
      depth: Math.min(...rs.map((r) => r.claims.length)),
      ifYouChange: rs.map((r) => r.ifYouChange).reduce((a, b) => (IF_RANK[a] <= IF_RANK[b] ? a : b)),
    });
  }
  return out.sort((a, b) => a.depth - b.depth || STATUS_META[b.weakest].rank - STATUS_META[a.weakest].rank);
}

/** The claims a consequence rests on, for keeping it as an expectation. */
export const basisOf = (c: Consequence): ID[] => [...new Set(c.routes.flatMap((r) => r.claims.map((m) => m.id)))];
