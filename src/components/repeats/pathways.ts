import { AREAS } from '../../domain/constants';
import type { AreaKey, AtlasData, ID, Pattern, SourceRef } from '../../domain/types';
import { polar, type Almanac, type Mark } from './almanac';
import type { Ctrl } from './sway';

/*
 * The pathways a repeat runs through your life, drawn the way contact networks are (a ring of groups, a dot for
 * each member, a strand for each contact, bundled through the middle).
 *
 * The groups round the ring are the areas of your life; the dots in them, the elements that took part when
 * something repeated, larger the more often they did. Every time a repeat happened is a fan of strands, from what
 * sets it off (its first step) to everything else that was part of that time: the rest of its steps, and what the
 * note about it is about. An exception (a time it did not happen) is a fan too, to what its note is about, drawn
 * in gray. Every strand is one time, read from the record (the almanac's marks); nothing here is inferred.
 */

export const R = 330;

/**
 * One hue per repeat, in a fixed order (validated for the dark canvas, adjacent pairs; see the dataviz method):
 * olive, blue, rose, green, violet, teal. Never the signal orange, which marks only what is live or chosen.
 * Past six, a repeat is drawn in the neutral ink, as "other".
 */
export const REPEAT_COLORS = ['#968c1c', '#3a7fd0', '#c4567f', '#4f9a3a', '#8a6fd6', '#1f9a8f'];
export const OTHER = '#8e8b84';
export const repeatColor = (i: number) => REPEAT_COLORS[i] ?? OTHER;

export interface Sector {
  area: AreaKey;
  from: number;
  to: number;
  mid: number;
}
export interface Dot {
  id: ID;
  area: AreaKey;
  angle: number;
  /** How many strands end at it. */
  count: number;
  size: number;
  /** The repeats it took part in. */
  repeats: ID[];
}
export interface Strand {
  key: string;
  patternId: ID;
  mark: Mark;
  from: ID;
  to: ID;
  exception: boolean;
  d: string;
  /** The points it is bundled through, and what each is (see sway.ts): how it sways as a living cable. */
  pts: [number, number][];
  ctrl: Ctrl[];
}
export interface Pathways {
  sectors: Sector[];
  dots: Dot[];
  strands: Strand[];
  /** What sets each repeat off: where its strands start. */
  anchors: Record<ID, ID>;
}

/** The elements a record is about. */
export function sourceElements(data: AtlasData, ref: SourceRef): ID[] {
  if (ref.kind === 'entry') return data.entries[ref.id]?.nodeIds ?? [];
  if (ref.kind === 'decision') return data.decisions[ref.id]?.nodeIds ?? [];
  if (ref.kind === 'occurrence') {
    const o = data.occurrences[ref.id];
    return o ? [...o.about, ...(o.instanceOf ? [o.instanceOf] : [])] : [];
  }
  const x = data.experiments[ref.id];
  const c = x?.claimId ? data.claims[x.claimId] : undefined;
  return c ? [c.from, c.to] : [];
}

/** A repeat's steps, as elements on the map, in order. */
const stepElements = (data: AtlasData, p: Pattern) => p.steps.map((s) => s.elementId).filter((id): id is ID => Boolean(id && data.nodes[id]));

/**
 * A curve through control points as a uniform cubic B-spline (the curve "basis" of d3), as SVG path data, after
 * pulling the points towards the straight line between its ends by `1 - beta`: how bundled strands are drawn.
 */
export function bundle(points: [number, number][], beta = 0.85): string {
  const n = points.length - 1;
  const [x0, y0] = points[0];
  const [xn, yn] = points[n];
  const p = points.map(([x, y], i) => [beta * x + (1 - beta) * (x0 + ((xn - x0) * i) / n), beta * y + (1 - beta) * (y0 + ((yn - y0) * i) / n)] as const);
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  if (p.length < 3) return `${d}L${f(p[n][0])} ${f(p[n][1])}`;
  d += `L${f((5 * p[0][0] + p[1][0]) / 6)} ${f((5 * p[0][1] + p[1][1]) / 6)}`;
  for (let i = 2; i <= n; i++) {
    const [ax, ay] = p[i - 2];
    const [bx, by] = p[i - 1];
    const [cx, cy] = p[i];
    d += `C${f((2 * ax + bx) / 3)} ${f((2 * ay + by) / 3)} ${f((ax + 2 * bx) / 3)} ${f((ay + 2 * by) / 3)} ${f((ax + 4 * bx + cx) / 6)} ${f((ay + 4 * by + cy) / 6)}`;
  }
  const [ax, ay] = p[n - 1];
  const [bx, by] = p[n];
  d += `C${f((2 * ax + bx) / 3)} ${f((2 * ay + by) / 3)} ${f((ax + 2 * bx) / 3)} ${f((ay + 2 * by) / 3)} ${f(bx)} ${f(by)}`;
  return d;
}

/** The gap between areas round the ring, and the least room an area takes. */
const GAP = 5;
const MIN_SPAN = 14;

export function pathwaysOf(data: AtlasData, al: Almanac, patterns: Pattern[]): Pathways {
  const anchors: Record<ID, ID> = {};
  const raw: Omit<Strand, 'd' | 'pts' | 'ctrl'>[] = [];
  for (const ring of al.rings) {
    const p = patterns.find((x) => x.id === ring.patternId);
    if (!p) continue;
    const steps = stepElements(data, p);
    const anchor = steps[0] ?? p.nodeIds.find((id) => data.nodes[id]);
    if (!anchor) continue;
    anchors[p.id] = anchor;
    for (const mark of ring.marks) {
      const exception = mark.stance === 'counters';
      // A time it happened runs through its steps and what the note is about; an exception, only what the note is about.
      const about = sourceElements(data, mark.source).filter((id) => data.nodes[id]);
      const reach = [...new Set([...(exception ? [] : steps), ...about])].filter((id) => id !== anchor);
      for (const to of reach) raw.push({ key: `${mark.key}>${to}`, patternId: p.id, mark, from: anchor, to, exception });
    }
  }

  // The dots: every element a strand ends at, with how many do, in the area it sits in.
  const counts = new Map<ID, number>();
  const repeats = new Map<ID, Set<ID>>();
  for (const s of raw)
    for (const id of [s.from, s.to]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (!repeats.has(id)) repeats.set(id, new Set());
      repeats.get(id)!.add(s.patternId);
    }
  const byArea = new Map<AreaKey, ID[]>();
  for (const id of counts.keys()) {
    const area = data.nodes[id]?.area;
    if (!area) continue;
    byArea.set(area, [...(byArea.get(area) ?? []), id]);
  }
  const areas = AREAS.map((a) => a.key).filter((k) => byArea.has(k));

  // Round the ring: each area takes room by how many dots it has (never too little), with a gap between them.
  const room = 360 - GAP * areas.length;
  const want = areas.map((a) => byArea.get(a)!.length);
  const total = want.reduce((s, n) => s + n, 0) || 1;
  let spans = want.map((n) => Math.max(MIN_SPAN, (n / total) * room));
  const scale = room / spans.reduce((s, x) => s + x, 0);
  spans = spans.map((x) => x * scale);
  const sectors: Sector[] = [];
  const dots: Dot[] = [];
  let at = GAP / 2;
  areas.forEach((area, i) => {
    const from = at;
    const to = at + spans[i];
    sectors.push({ area, from, to, mid: (from + to) / 2 });
    // The least involved first, the most at the far end, as a group's members are ranked round the ring.
    const ids = byArea.get(area)!.sort((a, b) => counts.get(a)! - counts.get(b)! || (data.nodes[a]?.label ?? '').localeCompare(data.nodes[b]?.label ?? ''));
    const step = (to - from) / ids.length;
    ids.forEach((id, k) => {
      const count = counts.get(id)!;
      dots.push({ id, area, angle: from + step * (k + 0.5), count, size: 2.4 + 1.7 * Math.sqrt(count), repeats: [...repeats.get(id)!] });
    });
    at = to + GAP;
  });

  // The strands, bundled: out of a dot towards the middle, through its area's hub, across, and back out.
  const dotOf = new Map(dots.map((d) => [d.id, d]));
  const sectorOf = new Map(sectors.map((s) => [s.area, s]));
  const strands: Strand[] = [];
  for (const s of raw) {
    const a = dotOf.get(s.from);
    const b = dotOf.get(s.to);
    if (!a || !b) continue;
    const sa = sectorOf.get(a.area)!;
    const sb = sectorOf.get(b.area)!;
    const ctrl: Ctrl[] =
      sa === sb
        ? ['end', `near:${a.id}`, `hub:${sa.area}`, `near:${b.id}`, 'end']
        : ['end', `near:${a.id}`, `hub:${sa.area}`, `hub:${sb.area}`, `near:${b.id}`, 'end'];
    const pts: [number, number][] =
      sa === sb
        ? [polar(a.angle, R - a.size - 2), polar(a.angle, R * 0.8), polar(sa.mid, R * 0.5), polar(b.angle, R * 0.8), polar(b.angle, R - b.size - 2)]
        : [
            polar(a.angle, R - a.size - 2),
            polar(a.angle, R * 0.78),
            polar(sa.mid, R * 0.42),
            polar(sb.mid, R * 0.42),
            polar(b.angle, R * 0.78),
            polar(b.angle, R - b.size - 2),
          ];
    strands.push({ ...s, d: bundle(pts, 0.86), pts, ctrl });
  }
  return { sectors, dots, strands, anchors };
}
