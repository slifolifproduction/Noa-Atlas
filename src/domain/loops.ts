/**
 * Feedback loops, derived from claims.
 *
 * A loop is a closed path of influence claims. Its character follows from
 * the directions of its links: with an even number of opposite-direction
 * links it is reinforcing (it escalates, a vicious or virtuous circle); with
 * an odd number it is balancing (it self-corrects, or resists change).
 * Loops are never drawn by hand; they appear when the claims close a circle,
 * and they are only as supported as their weakest link.
 */
import { claimSentence, claimStatus } from './claims';
import { EFFECT_META, STATUS_META } from './constants';
import type { AtlasData, Claim, ClaimStatus, ID } from './types';

export interface Loop {
  /** Stable id: the member claim ids, sorted. */
  id: string;
  claimIds: ID[];
  /** Elements in loop order. */
  nodeIds: ID[];
  type: 'reinforcing' | 'balancing';
  /** The status of the weakest link. */
  weakest: ClaimStatus;
  /** Links with the weakest status: where a loop is least certain, and often where to intervene. */
  breakpoints: ID[];
  name?: string;
}

const MAX_LENGTH = 6;

export function findLoops(data: AtlasData): Loop[] {
  const claims = Object.values(data.claims).filter((c) => c.state === 'adopted' && !c.retired);
  const out = new Map<string, Loop>();
  const bySource = new Map<ID, Claim[]>();
  for (const c of claims) bySource.set(c.from, [...(bySource.get(c.from) ?? []), c]);

  const visit = (start: ID, at: ID, path: Claim[], seen: Set<ID>) => {
    if (path.length >= MAX_LENGTH) return;
    for (const c of bySource.get(at) ?? []) {
      if (c.to === start) {
        const members = [...path, c];
        const id = members
          .map((m) => m.id)
          .sort()
          .join('|');
        if (!out.has(id)) out.set(id, describe(data, members, id));
      } else if (!seen.has(c.to) && c.to > start) {
        // Only walk through nodes "after" the start so each cycle is found once, from its smallest node.
        seen.add(c.to);
        visit(start, c.to, [...path, c], seen);
        seen.delete(c.to);
      }
    }
  };
  for (const id of [...bySource.keys()].sort()) visit(id, id, [], new Set([id]));
  return [...out.values()].sort((a, b) => b.claimIds.length - a.claimIds.length || a.id.localeCompare(b.id));
}

function describe(data: AtlasData, members: Claim[], id: string): Loop {
  const negatives = members.filter((m) => EFFECT_META[m.effect].polarity < 0).length;
  const statuses = members.map((m) => ({ id: m.id, status: claimStatus(data, m) }));
  const low = Math.min(...statuses.map((s) => STATUS_META[s.status].rank));
  const weakest = statuses.find((s) => STATUS_META[s.status].rank === low)!.status;
  return {
    id,
    claimIds: members.map((m) => m.id),
    nodeIds: members.map((m) => m.from),
    type: negatives % 2 === 0 ? 'reinforcing' : 'balancing',
    weakest,
    breakpoints: statuses.filter((s) => STATUS_META[s.status].rank === low).map((s) => s.id),
    name: data.loopNames[id],
  };
}

export function loopsThrough(data: AtlasData, nodeId: ID): Loop[] {
  return findLoops(data).filter((l) => l.nodeIds.includes(nodeId));
}

export function loopsWithClaim(data: AtlasData, claimId: ID): Loop[] {
  return findLoops(data).filter((l) => l.claimIds.includes(claimId));
}

export function loopById(data: AtlasData, id: string): Loop | undefined {
  return findLoops(data).find((l) => l.id === id);
}

/** The loop told as a chain of sentences, for reading. */
export function loopSentences(data: AtlasData, loop: Loop): string[] {
  return loop.claimIds.map((id) => claimSentence(data, data.claims[id]!));
}
