/**
 * Putting two edits of the same atlas together.
 *
 * When two devices change the same account's atlas before either has seen
 * the other's change, both started from the same saved state (the base).
 * Each record is then read three ways: as it was, as it is here, as it is
 * there. What only one side changed is taken from that side, deletions
 * included; what both changed the same way is kept once. Only a record both
 * sides changed differently is a real conflict: the later edit wins when the
 * record says when it was edited, and this device's otherwise, and the
 * conflict is counted. The history (the model log) is kept from both sides.
 * Counters only ever go up, so codes stay unique. The result is repaired
 * like any other change.
 */
import { repairReferences } from '../domain/integrity';
import type { AtlasData } from '../domain/types';

type Json = unknown;
type Obj = Record<string, Json>;

const same = (a: Json, b: Json) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An object whose every value is a record carrying its own key as `id`. */
const isRecordMap = (v: Json): v is Record<string, Obj> => isObj(v) && Object.entries(v).every(([k, r]) => isObj(r) && (r.id === undefined || r.id === k));

/** An array whose every item has an id (the model log). */
const isIdList = (v: Json): v is Obj[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

const stamp = (r: Json) => (isObj(r) && typeof r.updatedAt === 'string' ? r.updatedAt : '');

export interface MergeResult {
  data: AtlasData;
  /** Records both sides changed differently. */
  conflicts: number;
}

export function mergeAtlas(base: AtlasData | null, local: AtlasData, remote: AtlasData): MergeResult {
  let conflicts = 0;

  const pick = (b: Json, l: Json, r: Json): Json => {
    if (same(l, r)) return l;
    // New on one side only.
    if (b === undefined && l === undefined) return r;
    if (b === undefined && r === undefined) return l;
    if (b !== undefined && same(l, b)) return r;
    if (b !== undefined && same(r, b)) return l;
    // Both changed, or there is no common past.
    if (isRecordMap(l) && isRecordMap(r)) return records(isRecordMap(b) ? b : {}, l, r);
    if (isIdList(l) && isIdList(r)) return list(isIdList(b) ? b : [], l, r);
    if (isObj(l) && isObj(r) && !('id' in l)) return fields(isObj(b) ? b : {}, l, r);
    conflicts++;
    return stamp(r) > stamp(l) ? r : l;
  };

  const records = (b: Record<string, Obj>, l: Record<string, Obj>, r: Record<string, Obj>) => {
    const out: Obj = {};
    for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
      const v = pick(b[key], l[key], r[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  };

  const fields = (b: Obj, l: Obj, r: Obj) => {
    const out: Obj = {};
    for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
      const v = pick(b[key], l[key], r[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  };

  // Items from both sides, each read three ways, minus what either side removed since the base.
  // Kept in the other side's order with this side's new items after; the log is put in time order.
  const list = (b: Obj[], l: Obj[], r: Obj[]) => {
    const by = (xs: Obj[]) => new Map(xs.map((x) => [x.id, x]));
    const [bBy, lBy, rBy] = [by(b), by(l), by(r)];
    const out: Obj[] = [];
    for (const id of new Set([...rBy.keys(), ...lBy.keys()])) {
      if (bBy.has(id) && (!lBy.has(id) || !rBy.has(id))) continue;
      const v = pick(bBy.get(id), lBy.get(id), rBy.get(id));
      if (isObj(v)) out.push(v);
    }
    return out.every((x) => typeof x.at === 'string') ? out.sort((x, y) => String(x.at).localeCompare(String(y.at))) : out;
  };

  const out = pick(base ?? undefined, local, remote) as AtlasData;
  const data = structuredClone(out);
  // Sequence counters only go up, so a code is never given twice.
  const counters = { ...local.counters };
  for (const k of Object.keys(counters) as (keyof typeof counters)[]) counters[k] = Math.max(counters[k] ?? 0, remote.counters?.[k] ?? 0);
  data.counters = counters;
  repairReferences(data);
  return { data, conflicts };
}
