/**
 * Feedback loops, derived from claims.
 *
 * A loop is a closed path of influence claims. Its character follows from
 * the directions of its links: with an even number of opposite-direction
 * links it is reinforcing (it escalates, a vicious or virtuous circle); with
 * an odd number it is balancing (it self-corrects, or resists change).
 * Loops are never drawn by hand; they appear when the claims close a circle,
 * and they are only as supported as their weakest link.
 *
 * Two different places matter in a loop, and they are kept apart:
 *   least certain  the links with the weakest evidence: where to test;
 *   where to act   links whose cause is something the person does, with at
 *                  least a few times behind it: where a change can be made.
 * A loop with a link that only makes something possible or limits it is
 * gated: it turns only while that holds, and passes no amount through it.
 * Turns are the times the record shows the loop going all the way round, in
 * order, from recorded states (never mentions).
 */
import { claimSentence, claimStatus } from './claims';
import { isGate, lagWindow, pushes } from './compare';
import { EFFECT_META, STATUS_META } from './constants';
import { factorStates, isBackgroundLevel, type FactorState, type Lean } from './factors';
import { addDays, daysBetween } from '../lib/dates';
import type { AtlasData, Claim, ClaimStatus, ID, ISODate } from './types';
import { t } from '../i18n';

export interface Loop {
  /** Stable id: the member claim ids, sorted. */
  id: string;
  claimIds: ID[];
  /** Elements in loop order. */
  nodeIds: ID[];
  type: 'reinforcing' | 'balancing';
  /** The status of the weakest link. */
  weakest: ClaimStatus;
  /** Links with the weakest status: where the loop is least certain, and where a test would tell most. */
  leastCertain: ID[];
  /** Links whose cause is something the person does, seen at least a few times: where a change can be made. */
  leverage: ID[];
  /** A link only makes something possible or limits it: the loop turns only while it holds. */
  gated: boolean;
  name?: string;
}

const MAX_LENGTH = 6;

/**
 * Cycles are read only from claims your notes already show at least a few
 * times: a circle of hunches is a guess about a cycle, not a cycle. A claim
 * that is weakened or retired opens it.
 */
export const CYCLE_STATUSES = new Set<ClaimStatus>(['plausible', 'supported', 'tested']);

export function findLoops(data: AtlasData, statuses: Set<ClaimStatus> = CYCLE_STATUSES): Loop[] {
  const claims = Object.values(data.claims).filter((c) => c.state === 'adopted' && statuses.has(claimStatus(data, c)));
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
    leastCertain: statuses.filter((s) => STATUS_META[s.status].rank === low).map((s) => s.id),
    leverage: members
      .filter((m) => {
        const cause = data.nodes[m.from];
        return cause && cause.kind === 'behaviour' && !cause.external && STATUS_META[claimStatus(data, m)].rank >= STATUS_META.plausible.rank;
      })
      .map((m) => m.id),
    gated: members.some((m) => isGate(m.effect)),
    name: data.loopNames[id],
  };
}

export interface Turn {
  from: ISODate;
  to: ISODate;
  days: number;
  /** The recorded states, one per step, in order. */
  states: FactorState[];
}

/**
 * Times the record shows the loop going all the way round: a recorded state
 * of one element, then each next element going the way its link says, within
 * the link's delay, back to the first.
 */
export function loopTurns(data: AtlasData, loop: Loop): Turn[] {
  const members = loop.claimIds.map((id) => data.claims[id]).filter((c): c is Claim => Boolean(c));
  if (members.length !== loop.claimIds.length) return [];
  const turns: Turn[] = [];
  let busyUntil = '';
  for (let s = 0; s < members.length; s++) {
    for (const first of factorStates(data, members[s].from)) {
      if (first.lean === 'usual' || isBackgroundLevel(first) || first.date <= busyUntil) continue;
      const steps: FactorState[] = [first];
      let lean: Lean = first.lean;
      let at = first;
      for (let i = 0; i < members.length; i++) {
        const c = members[(s + i) % members.length];
        lean = pushes(c.effect, lean);
        const until = addDays(at.date, lagWindow(c));
        const next = factorStates(data, c.to).find(
          (x) => x.date >= at.date && x.date <= until && x.key !== at.key && x.item?.key !== at.item?.key && x.lean === lean && !isBackgroundLevel(x),
        );
        if (!next) break;
        steps.push(next);
        at = next;
      }
      if (steps.length === members.length + 1) {
        turns.push({ from: first.date, to: at.date, days: daysBetween(first.date, at.date), states: steps });
        busyUntil = at.date;
      }
    }
  }
  return turns.sort((a, b) => a.from.localeCompare(b.from));
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

/** A cycle's name: the one the person gave it, or what it does. */
export const loopName = (l: Loop) => l.name ?? (l.type === 'reinforcing' ? t('A cycle that feeds itself') : t('A cycle that holds itself back'));
