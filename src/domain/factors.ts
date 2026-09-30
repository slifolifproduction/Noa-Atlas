/**
 * What changed, and the episodes it happened in.
 *
 * The rest of the reasoning (evidence, explanations, predictions) works on
 * two things read from history, never typed in:
 *
 *   EPISODES       Coherent stretches of experience. Records about the same
 *                  thing within a few days, a note and what was read from it,
 *                  and spans that overlap are one episode; everything is
 *                  counted per episode, so five notes about one bad week are
 *                  one piece of evidence, not five. The person can keep a
 *                  happening apart, or group it, and that wins.
 *
 *   FACTOR STATES  What the record says a factor did at a time: went up or
 *                  down, was high or low, happened or did not. They come from
 *                  what changed as written with a happening, from readings
 *                  (read against the person's own usual level), from
 *                  instances of a behaviour, and from lifespans (how many
 *                  commitments were running). A mention is not a state: that
 *                  a note is about Energy says nothing about whether energy
 *                  was low. What nothing records stays unknown, never absent.
 *
 * Coverage says how far absence of a record can be read: a factor recorded
 * with every note (a reading) or counted from lifespans is tracked; one that
 * only shows up when it is notable is not, and weeks without it are unknown.
 * It is read per period too: a stretch with no records at all is silent,
 * and nothing is known about anything in it.
 *
 * Every state keeps how it came to be known, apart from what really happened
 * (which the Atlas never sees): felt, noticed or counted (its channel), when
 * it was written down (days after the fact, so an order reconstructed later
 * can be told from one written as it happened), and whether its reading is
 * the person's or the Atlas's (a level read against the usual one, a count
 * of what was running).
 *
 * Levels are read against the person's usual level for that period: when the
 * usual level itself shifted (a phase), a reading is high or low for then,
 * not for another time.
 */
import { isDraft } from 'immer';
import { addDays, dateOf, todayISO, weekStart } from '../lib/dates';
import { activeCommitmentsByWeek, historyItems, type HistoryItem } from './history';
import type { AtlasData, Channel, FactorReading, ID, ISODate, SourceRef } from './types';

/* ---------------- memo ---------------- */

const memo = new WeakMap<object, Map<string, unknown>>();
const draftMemo = new WeakMap<object, { print: string; map: Map<string, unknown> }>();

/**
 * A cheap stamp of an atlas being edited: how many records of each kind
 * there are, and how many claims still hold. Within one edit, derived
 * structures are re-read when records are added or removed; an edit that
 * changes a record in place and needs fresh derivations in the same step
 * calls `forgetDerived`.
 */
function fingerprint(d: AtlasData): string {
  const n = (o: object) => Object.keys(o).length;
  let results = 0;
  for (const x of Object.values(d.experiments)) if (x.result) results++;
  let live = 0;
  for (const c of Object.values(d.claims)) if (c.state === 'adopted' && !c.retired) live++;
  return [n(d.occurrences), n(d.entries), n(d.decisions), n(d.experiments), results, n(d.nodes), n(d.claims), live].join('|');
}

/** Drop what was derived from an atlas being edited, after changing a record in place. */
export function forgetDerived(data: AtlasData) {
  draftMemo.delete(data);
}

/**
 * Derived structures are computed once per version of the atlas (every
 * change makes a new one). An atlas being edited is cached for as long as
 * nothing they read has changed.
 */
export function cached<T>(data: AtlasData, key: string, fn: () => T): T {
  let m: Map<string, unknown>;
  if (isDraft(data)) {
    const print = fingerprint(data);
    const entry = draftMemo.get(data);
    if (!entry || entry.print !== print) draftMemo.set(data, { print, map: new Map() });
    m = draftMemo.get(data)!.map;
  } else {
    m = memo.get(data) ?? new Map();
    memo.set(data, m);
  }
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

const perObject = new WeakMap<object, WeakMap<object, Map<string, unknown>>>();

/** A value derived from one record of a finished (not edited) atlas, such as a claim's status. */
export function cachedOn<T>(data: AtlasData, record: object, key: string, fn: () => T): T {
  if (isDraft(data) || isDraft(record)) return fn();
  let byRecord = perObject.get(data);
  if (!byRecord) perObject.set(data, (byRecord = new WeakMap()));
  let m = byRecord.get(record);
  if (!m) byRecord.set(record, (m = new Map()));
  if (m.has(key)) return m.get(key) as T;
  const v = fn();
  m.set(key, v);
  return v;
}

/** History that actually happened, including notes as records. */
export const actualItems = (data: AtlasData): HistoryItem[] =>
  cached(data, 'items', () => historyItems(data, { records: true }).filter((h) => h.mode === 'actual' && h.kind !== 'step'));

const dayNumbers = new Map<string, number>();
/** Days since the epoch, for comparing dates quickly. */
export function dayOf(date: ISODate): number {
  let n = dayNumbers.get(date);
  if (n === undefined) {
    n = Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);
    dayNumbers.set(date, n);
  }
  return n;
}

/* ---------------- readings and leans ---------------- */

/** Which way a record points: more of the factor, less of it, or its usual level. */
export type Lean = 'more' | 'less' | 'usual';

export const leanOf = (r: FactorReading | 'usual'): Lean => (r === 'usual' ? 'usual' : r === 'up' || r === 'high' || r === 'present' ? 'more' : 'less');

export const oppositeLean = (l: Lean): Lean => (l === 'more' ? 'less' : l === 'less' ? 'more' : 'usual');

/** The readings that say something changed (rather than a level). */
export const CHANGE_READINGS: FactorReading[] = ['up', 'down', 'high', 'low', 'present', 'absent'];

/* ---------------- episodes ---------------- */

export interface Episode {
  key: string;
  from: ISODate;
  until: ISODate;
  items: HistoryItem[];
  /** The person grouped or separated it. */
  explicit: boolean;
}

/** How long an episode read from dates can stretch (a single long happening can make it longer). */
const MAX_SPAN = 14;
/** Records about the same thing this close together are one episode. */
const NEAR = 3;
/** A note and what was read from it stay together when this close in time. */
const SAME_RECORD = 7;

const spanOf = (h: HistoryItem): [ISODate, ISODate] => [h.date, h.until && h.until > h.date ? h.until : h.date];
const gapBetween = (a: [ISODate, ISODate], b: [ISODate, ISODate]) => (a[1] < b[0] ? dayOf(b[0]) - dayOf(a[1]) : b[1] < a[0] ? dayOf(a[0]) - dayOf(b[1]) : 0);
const spanDays = (from: ISODate, until: ISODate) => dayOf(until) - dayOf(from);

/** The record a history item was read from. */
function recordKey(h: HistoryItem): string | undefined {
  if (h.key.startsWith('ent:') || h.key.startsWith('energy:')) return `entry:${h.ref.id}`;
  if (h.source) return `${h.source.kind}:${h.source.id}`;
  return undefined;
}

/** The elements an item is about, for grouping. Readings taken from every note's context don't group anything. */
const groupingElements = (h: HistoryItem): ID[] => (h.key.startsWith('energy:') ? [] : [...h.about, ...(h.instanceOf ? [h.instanceOf] : [])]);

/** Episodes, oldest first. */
export function episodes(data: AtlasData): Episode[] {
  return cached(data, 'episodes', () => {
    const items = [...actualItems(data)].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    const explicitKey = (h: HistoryItem) => (h.ref.kind === 'occurrence' ? data.occurrences[h.ref.id]?.episode : undefined);

    const parent = items.map((_, i) => i);
    const span = items.map(spanOf);
    const longest = items.map((h) => spanDays(...spanOf(h)));
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const union = (a: number, b: number, capped: boolean) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      const from = span[ra][0] < span[rb][0] ? span[ra][0] : span[rb][0];
      const until = span[ra][1] > span[rb][1] ? span[ra][1] : span[rb][1];
      if (capped && spanDays(from, until) > Math.max(MAX_SPAN, longest[ra], longest[rb])) return;
      parent[rb] = ra;
      span[ra] = [from, until];
      longest[ra] = Math.max(longest[ra], longest[rb]);
    };

    // 1. The person's grouping.
    const byKey = new Map<string, number>();
    items.forEach((h, i) => {
      const k = explicitKey(h);
      if (!k) return;
      if (byKey.has(k)) union(byKey.get(k)!, i, false);
      else byKey.set(k, i);
    });
    const free = (i: number) => !explicitKey(items[i]);

    // 2. A note and what was read from it.
    const byRecord = new Map<string, number[]>();
    items.forEach((h, i) => {
      const r = recordKey(h);
      if (r && free(i)) byRecord.set(r, [...(byRecord.get(r) ?? []), i]);
    });
    for (const group of byRecord.values())
      for (let a = 0; a < group.length; a++)
        for (let b = a + 1; b < group.length; b++)
          if (gapBetween(spanOf(items[group[a]]), spanOf(items[group[b]])) <= SAME_RECORD) union(group[a], group[b], false);

    // 3. Records about the same thing, close together.
    for (let i = 0; i < items.length; i++) {
      if (!free(i)) continue;
      const mine = new Set(groupingElements(items[i]));
      if (!mine.size) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (dayOf(items[j].date) - dayOf(spanOf(items[i])[1]) > NEAR) break;
        if (!free(j) || gapBetween(spanOf(items[i]), spanOf(items[j])) > NEAR) continue;
        if (groupingElements(items[j]).some((x) => mine.has(x))) union(i, j, true);
      }
    }

    const groups = new Map<number, number[]>();
    items.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
    const out: Episode[] = [];
    for (const [root, members] of groups) {
      const list = members.map((i) => items[i]);
      const explicit = list.map(explicitKey).find(Boolean);
      out.push({ key: explicit ?? `ep:${list[0].key}`, from: span[root][0], until: span[root][1], items: list, explicit: Boolean(explicit) });
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
  });
}

function episodeIndex(data: AtlasData): Map<string, Episode> {
  return cached(data, 'episodeIndex', () => {
    const m = new Map<string, Episode>();
    for (const e of episodes(data)) for (const h of e.items) m.set(h.key, e);
    return m;
  });
}

/** The episode a history item belongs to. */
export const episodeOfItem = (data: AtlasData, itemKey: string): Episode | undefined => episodeIndex(data).get(itemKey);

const itemKeyOf = (ref: SourceRef) =>
  ref.kind === 'entry' ? `ent:${ref.id}` : ref.kind === 'decision' ? `dec:${ref.id}` : ref.kind === 'occurrence' ? `occ:${ref.id}` : `test:${ref.id}`;

/**
 * The episode a record belongs to, as a key for counting. A record that is
 * not in history (a test not started) falls back to its week.
 */
export function episodeKeyOf(data: AtlasData, ref: SourceRef, date?: ISODate): string {
  const e = episodeIndex(data).get(itemKeyOf(ref));
  if (e) return e.key;
  return date ? `wk:${weekStart(date)}` : `ref:${ref.kind}:${ref.id}`;
}

/** The date of a record, without formatting anything. */
export function sourceDate(data: AtlasData, ref: SourceRef): ISODate | undefined {
  if (ref.kind === 'entry') return data.entries[ref.id]?.date;
  if (ref.kind === 'decision') return data.decisions[ref.id]?.date;
  if (ref.kind === 'occurrence') return data.occurrences[ref.id]?.date;
  const x = data.experiments[ref.id];
  return x ? (x.result ? dateOf(x.result.recordedAt) : x.startDate) : undefined;
}

/** The episode around a date that includes a record about any of these elements, if there is one. */
export function episodeAround(data: AtlasData, date: ISODate): Episode | undefined {
  return episodes(data).find((e) => e.from <= date && e.until >= date);
}

/* ---------------- factor states ---------------- */

export interface FactorState {
  factor: ID;
  date: ISODate;
  lean: Lean;
  /** What the record says, or how a level reads against the usual level. */
  reads: FactorReading | 'usual';
  level?: number;
  /** Where it comes from. */
  basis: 'change' | 'reading' | 'instance' | 'lifespan';
  /** The moment in history that shows it (none for a count from lifespans). */
  item?: HistoryItem;
  key: string;
  /** How it was known. */
  channel: Channel;
  /** When it was written down (the record's date), if not the same day. */
  written?: ISODate;
  /** The Atlas's reading of it rather than the person's words: a level against the usual one, or a count of what was running. */
  readAs?: 'against_usual' | 'running';
}

/** A state element whose level is counted from commitments' lifespans rather than recorded. */
export const isLifespanCount = (data: AtlasData, id: ID) => Boolean(data.nodes[id]?.tags.includes('commitments-count'));

function commitmentsActive(data: AtlasData, date: ISODate): number {
  return Object.values(data.nodes).filter((n) => n.kind === 'commitment' && n.adopted && n.since && n.since <= date && (!n.until || n.until >= date)).length;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Every recorded level of a factor, oldest first: its readings, levels written with what changed, or weekly counts. */
function levelsOf(data: AtlasData, id: ID): { date: ISODate; value: number }[] {
  return cached(data, `levels:${id}`, () => {
    if (isLifespanCount(data, id)) return activeCommitmentsByWeek(data, todayISO()).map((w) => ({ date: w.week, value: w.count }));
    const out = [
      ...actualItems(data)
        .filter((h) => h.kind === 'reading' && h.instanceOf === id && h.value !== undefined)
        .map((h) => ({ date: h.date, value: h.value! })),
      ...Object.values(data.occurrences)
        .filter((o) => o.mode === 'actual')
        .flatMap((o) => (o.changes ?? []).filter((c) => c.factor === id && c.level !== undefined).map((c) => ({ date: o.date, value: c.level! }))),
    ];
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });
}

/**
 * The person's usual level of a factor: the middle of their own readings (at
 * least three), or of the weekly counts for a count from lifespans. High and
 * low are always relative to this, never to a norm.
 */
export function usualLevel(data: AtlasData, id: ID): { value: number; from: number } | undefined {
  return cached(data, `usual:${id}`, () => {
    const levels = levelsOf(data, id);
    return levels.length >= 3 ? { value: median(levels.map((l) => l.value)), from: levels.length } : undefined;
  });
}

/* ---------------- phases ---------------- */

/** A stretch of time with its own usual level. */
export interface Phase {
  from: ISODate;
  /** The day before the next phase began; open for the latest. */
  until?: ISODate;
  usual: number;
  /** How many levels it rests on. */
  levels: number;
}

/** Each side of a shift needs this many levels, so a few odd weeks never make a phase. */
const PHASE_MIN = 6;

/**
 * Where the usual level itself moved and stayed: the one split of the levels
 * that most separates the middle before from the middle after, kept when
 * each side has enough levels and the two are at least a quarter of the
 * scale apart (one point on a 1–5 scale), then looked for again within each
 * side. Qualitative: a shift is named, never measured as a trend.
 */
export function phasesOf(data: AtlasData, id: ID): Phase[] {
  return cached(data, `phases:${id}`, () => {
    const levels = levelsOf(data, id);
    const scale = data.nodes[id]?.scale;
    const values = levels.map((l) => l.value);
    const span = scale ? scale.max - scale.min : values.length ? Math.max(...values) - Math.min(...values) : 0;
    const shift = Math.max(1, span / 4);
    const split = (xs: typeof levels, depth: number): Phase[] => {
      const whole: Phase = { from: xs[0].date, until: undefined, usual: median(xs.map((x) => x.value)), levels: xs.length };
      if (depth >= 2 || xs.length < 2 * PHASE_MIN) return [whole];
      let best: { at: number; gap: number } | undefined;
      for (let i = PHASE_MIN; i <= xs.length - PHASE_MIN; i++) {
        if (xs[i].date === xs[i - 1].date) continue;
        const before = xs.slice(0, i).map((x) => x.value);
        const after = xs.slice(i).map((x) => x.value);
        const [m1, m2] = [median(before), median(after)];
        const gap = Math.abs(m1 - m2);
        // It stayed moved: most levels after sit past the old usual level, and most before sit short of the new one.
        const up = m2 > m1;
        const heldAfter = after.filter((v) => (up ? v > m1 : v < m1)).length * 3 >= after.length * 2;
        const heldBefore = before.filter((v) => (up ? v < m2 : v > m2)).length * 3 >= before.length * 2;
        if (heldAfter && heldBefore && (!best || gap > best.gap)) best = { at: i, gap };
      }
      if (!best || best.gap < shift) return [whole];
      return [...split(xs.slice(0, best.at), depth + 1), ...split(xs.slice(best.at), depth + 1)];
    };
    if (levels.length < 2 * PHASE_MIN) return levels.length >= 3 ? [{ from: levels[0].date, usual: median(values), levels: levels.length }] : [];
    const out = split(levels, 0);
    return out.map((p, i) => ({ ...p, until: out[i + 1] ? addDays(out[i + 1].from, -1) : undefined }));
  });
}

/** The usual level for the period a date falls in: the phase's own, or the overall one. */
export function usualAt(data: AtlasData, id: ID, date: ISODate): number | undefined {
  const phases = phasesOf(data, id);
  if (phases.length > 1) {
    const p = phases.find((x) => x.from <= date && (!x.until || x.until >= date)) ?? (date < phases[0].from ? phases[0] : phases[phases.length - 1]);
    return p.usual;
  }
  return usualLevel(data, id)?.value;
}

/* ---------------- trajectories ---------------- */

export type Trajectory = 'rising' | 'falling' | 'steady' | 'unsettled' | 'unknown';

/**
 * Where a factor's level has been heading lately: the middle of the earlier
 * half of its recent levels against the later half. Needs four levels in the
 * last eight weeks; a direction in words, never a rate.
 */
export function trajectory(data: AtlasData, id: ID, today: ISODate = todayISO()): { direction: Trajectory; levels: number; since?: ISODate } {
  const recent = levelsOf(data, id).filter((l) => l.date <= today && l.date >= addDays(today, -56));
  if (recent.length < 4) return { direction: 'unknown', levels: recent.length };
  const half = Math.floor(recent.length / 2);
  const a = median(recent.slice(0, half).map((l) => l.value));
  const b = median(recent.slice(half).map((l) => l.value));
  const values = recent.map((l) => l.value);
  const scale = data.nodes[id]?.scale;
  const span = scale ? scale.max - scale.min : Math.max(...values) - Math.min(...values) || 1;
  const moved = Math.abs(b - a) >= Math.max(0.5, span / 8);
  const direction: Trajectory = moved
    ? b > a
      ? 'rising'
      : 'falling'
    : Math.max(...values) - Math.min(...values) >= Math.max(2, span / 2)
      ? 'unsettled'
      : 'steady';
  return { direction, levels: recent.length, since: recent[0].date };
}

const levelReads = (level: number, usual: number): FactorReading | 'usual' => (level > usual ? 'high' : level < usual ? 'low' : 'usual');

/* ---------------- channels ---------------- */

/** States of inner life, felt rather than seen: energy, mood, what defines you, health. */
function feltFactor(data: AtlasData, id: ID): boolean {
  const n = data.nodes[id];
  if (!n) return false;
  if (n.tags.includes('measured') || n.tags.includes('counted')) return false;
  return n.kind === 'state' && (n.tags.includes('energy') || n.tags.includes('mood') || n.tags.includes('felt') || n.area === 'self' || n.area === 'health');
}

/**
 * The day a history item was written down, when later than the day it is
 * about: the note or decision it was read from, or, for a happening entered
 * on its own, the day it was entered.
 */
function writtenOn(data: AtlasData, h: HistoryItem): ISODate | undefined {
  const o = h.ref.kind === 'occurrence' ? data.occurrences[h.ref.id] : undefined;
  const record = h.source && h.source.kind !== 'occurrence' && h.source.kind !== 'experiment' ? sourceDate(data, h.source) : undefined;
  const written = record ?? (o ? dateOf(o.createdAt) : undefined);
  return written && written > h.date ? written : undefined;
}

/**
 * Everything the record says a factor did, oldest first. Mentions are not
 * included. Levels are read against the usual level of their period, or,
 * for what builds over a long time, against the usual level over the whole
 * record (`overall`).
 */
export function factorStates(data: AtlasData, id: ID, against: 'phase' | 'overall' = 'phase'): FactorState[] {
  return cached(data, `states:${id}:${against}`, () => {
    const out: FactorState[] = [];
    const overall = usualLevel(data, id)?.value;
    const known = overall !== undefined;
    const usualAt_ = (date: ISODate) => (against === 'overall' ? overall : usualAt(data, id, date));
    const felt = feltFactor(data, id);
    const items = actualItems(data);
    const explicit = new Set<string>();
    for (const h of items) {
      if (h.ref.kind !== 'occurrence' || !h.key.startsWith('occ:')) continue;
      const o = data.occurrences[h.ref.id];
      for (const [i, c] of (o?.changes ?? []).entries()) {
        if (c.factor !== id) continue;
        explicit.add(h.key);
        out.push({
          factor: id,
          date: h.date,
          lean: leanOf(c.reads),
          reads: c.reads,
          level: c.level,
          basis: 'change',
          item: h,
          key: `${h.key}#${i}`,
          channel: c.channel ?? (felt || o?.kind === 'experience' ? 'felt' : 'noticed'),
          written: writtenOn(data, h),
        });
      }
    }
    for (const h of items) {
      if (explicit.has(h.key) || h.instanceOf !== id) continue;
      if (h.kind === 'reading') {
        const usual = known && h.value !== undefined ? usualAt_(h.date) : undefined;
        if (h.value === undefined || usual === undefined) continue;
        const reads = levelReads(h.value, usual);
        out.push({
          factor: id,
          date: h.date,
          lean: leanOf(reads),
          reads,
          level: h.value,
          basis: 'reading',
          item: h,
          key: h.key,
          channel: data.nodes[id]?.tags.includes('measured') ? 'counted' : 'felt',
          written: writtenOn(data, h),
          readAs: 'against_usual',
        });
      } else if (data.nodes[id]?.kind === 'behaviour' && (h.kind === 'action' || h.kind === 'event' || h.kind === 'experience')) {
        out.push({
          factor: id,
          date: h.date,
          lean: 'more',
          reads: 'present',
          basis: 'instance',
          item: h,
          key: h.key,
          channel: 'noticed',
          written: writtenOn(data, h),
        });
      }
    }
    if (isLifespanCount(data, id)) {
      // When a commitment starts or ends, the count moves; at each episode, the count is a level.
      for (const n of Object.values(data.nodes)) {
        if (n.kind !== 'commitment' || !n.adopted || !n.since) continue;
        out.push({
          factor: id,
          date: n.since,
          lean: 'more',
          reads: 'up',
          level: commitmentsActive(data, n.since),
          basis: 'lifespan',
          key: `life:${n.id}:start`,
          channel: 'counted',
        });
        if (n.until && n.until < todayISO()) {
          const after = addDays(n.until, 1);
          out.push({
            factor: id,
            date: after,
            lean: 'less',
            reads: 'down',
            level: commitmentsActive(data, after),
            basis: 'lifespan',
            key: `life:${n.id}:end`,
            channel: 'counted',
          });
        }
      }
      // The level coming into each episode (what was already running the day before).
      if (known)
        for (const e of episodes(data)) {
          const level = commitmentsActive(data, addDays(e.from, -1));
          const reads = levelReads(level, usualAt_(e.from)!);
          out.push({
            factor: id,
            date: e.from,
            lean: leanOf(reads),
            reads,
            level,
            basis: 'lifespan',
            key: `life:${e.key}`,
            channel: 'counted',
            readAs: 'running',
          });
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  });
}

/** How telling a state is, when several fall on the same day: what was written beats a count, a move beats a usual level. */
const weight = (s: FactorState) =>
  (s.basis === 'change' || s.basis === 'instance' ? 3 : s.basis === 'reading' || s.reads === 'up' || s.reads === 'down' ? 2 : 1) * 2 +
  (s.lean === 'usual' ? 0 : 1);

/** A level read from lifespans at an episode: what was already running, not a move. */
export const isBackgroundLevel = (s: FactorState) => s.basis === 'lifespan' && s.reads !== 'up' && s.reads !== 'down';

/**
 * The latest state at or before a date, within `days`. With `strictly`, only
 * what came before that day: a state recorded the same day has no known order,
 * except a level of what was already running.
 */
export function stateBefore(data: AtlasData, id: ID, date: ISODate, days: number, notKey?: string, strictly = false): FactorState | undefined {
  const from = addDays(date, -days);
  let best: FactorState | undefined;
  for (const s of factorStates(data, id)) {
    if (s.date > date) break;
    if (s.date < from || s.key === notKey) continue;
    if (strictly && s.date === date && !isBackgroundLevel(s)) continue;
    if (!best || s.date > best.date || weight(s) >= weight(best)) best = s;
  }
  return best;
}

/** States of a factor in a window. */
export function statesIn(data: AtlasData, id: ID, from: ISODate, until: ISODate): FactorState[] {
  return factorStates(data, id).filter((s) => s.date >= from && s.date <= until);
}

/** The state of a factor in an episode, if the record says. */
export function stateInEpisode(data: AtlasData, id: ID, e: Episode): FactorState | undefined {
  return statesIn(data, id, e.from, e.until).reduce<FactorState | undefined>((best, s) => (!best || weight(s) > weight(best) ? s : best), undefined);
}

/* ---------------- coverage ---------------- */

/**
 * How well a factor is recorded:
 *   tracked    recorded regularly (a reading with most notes) or counted from lifespans:
 *              a level is known for most episodes
 *   recorded   what it did is written down sometimes, when it was notable
 *   mentioned  it comes up, but nothing says which way it went
 *   none       nothing about it in history
 */
export type Coverage = 'tracked' | 'recorded' | 'mentioned' | 'none';

export function coverage(data: AtlasData, id: ID): Coverage {
  return cached(data, `coverage:${id}`, () => {
    if (isLifespanCount(data, id) && usualLevel(data, id)) return 'tracked';
    const states = factorStates(data, id);
    const noteWeeks = new Set(Object.values(data.entries).map((e) => weekStart(e.date)));
    const readingWeeks = new Set(states.filter((s) => s.basis === 'reading').map((s) => weekStart(s.date)));
    if (noteWeeks.size >= 4 && readingWeeks.size >= noteWeeks.size / 2) return 'tracked';
    if (states.length) return 'recorded';
    const mentioned = actualItems(data).some((h) => h.about.includes(id) || h.instanceOf === id);
    return mentioned ? 'mentioned' : 'none';
  });
}

/* ---------------- observation windows ---------------- */

/** Records of any kind: the days anything at all was written down. */
function recordDays(data: AtlasData): ISODate[] {
  return cached(data, 'recordDays', () =>
    [
      ...new Set([
        ...Object.values(data.entries).map((e) => e.date),
        ...Object.values(data.decisions).map((d) => d.date),
        ...Object.values(data.occurrences)
          .filter((o) => o.mode === 'actual')
          .map((o) => o.date),
      ]),
    ].sort(),
  );
}

/** Stretches of at least `days` days with nothing written down at all: nothing is known about anything in them. */
export function silentSpans(data: AtlasData, days = 14, today: ISODate = todayISO()): { from: ISODate; until: ISODate }[] {
  const all = recordDays(data);
  const out: { from: ISODate; until: ISODate }[] = [];
  for (let i = 1; i < all.length; i++) if (dayOf(all[i]) - dayOf(all[i - 1]) > days) out.push({ from: addDays(all[i - 1], 1), until: addDays(all[i], -1) });
  if (all.length && dayOf(today) - dayOf(all[all.length - 1]) > days) out.push({ from: addDays(all[all.length - 1], 1), until: today });
  return out;
}

/**
 * How well a factor was observed in a stretch of time. Absence can be read
 * only where it was tracked; elsewhere a factor nothing mentions is unknown.
 *
 *   silent     nothing at all was written down then
 *   tracked    its level is known for most of the weeks anything was written
 *   recorded   what it did was written down at least once
 *   mentioned  it came up, with no word on which way it went
 *   none       nothing about it, though other things were written down
 */
export type Observed = 'silent' | 'tracked' | 'recorded' | 'mentioned' | 'none';

export function observedIn(data: AtlasData, id: ID, from: ISODate, until: ISODate): Observed {
  const days = recordDays(data).filter((d) => d >= from && d <= until);
  if (!days.length) return 'silent';
  const states = statesIn(data, id, from, until);
  if (isLifespanCount(data, id) && usualLevel(data, id)) return 'tracked';
  const weeks = new Set(days.map((d) => weekStart(d)));
  const levelWeeks = new Set(states.filter((s) => s.basis === 'reading' || s.level !== undefined).map((s) => weekStart(s.date)));
  if (levelWeeks.size >= Math.max(1, weeks.size / 2)) return 'tracked';
  if (states.length) return 'recorded';
  const mentioned = actualItems(data).some((h) => h.date >= from && h.date <= until && (h.about.includes(id) || h.instanceOf === id));
  return mentioned ? 'mentioned' : 'none';
}

/** Whether both directions have been recorded, so that "it went this way" can be compared with "it didn't". */
export function recordedBothWays(data: AtlasData, id: ID): boolean {
  const states = factorStates(data, id);
  return states.some((s) => s.lean === 'more') && states.some((s) => s.lean !== 'more');
}

/** How a state reads, in words. */
export const READS_ORDER: FactorReading[] = ['up', 'down', 'high', 'low', 'present', 'absent'];
