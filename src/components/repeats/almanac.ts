import { patternStats, resolveSource } from '../../domain/selectors';
import type { AtlasData, ISODate, Pattern, Regularity, SourceRef } from '../../domain/types';
import { addDays, daysBetween } from '../../lib/dates';

/*
 * Repeats as a mechanism, drawn the way an engineer draws one: a wheel of
 * the year, with the workings of a repeat inside it, that runs like a machine.
 *
 * Angle is time: the year read clockwise from the top, ending today, so the
 * oldest day and today meet at the top. The year's circle is graduated in
 * days, weeks and months; outside it, an arc of beads for every repeat: a bar
 * from the first time it was seen to the last, a bead at every time it
 * happened and a hollow one at every exception. Inside it, over empty space,
 * the workings of the repeat being read: a gear for each of its phases (what
 * sets it off, what you do, what follows), each driving the next. The year
 * moves on a week at a time under a comb that stays put, like a music box, so
 * it plays the year forward, again and again: a repeat, repeating.
 *
 * Everything here is in degrees clockwise from the top, and in the dial's own
 * units (its radius is `DIAL`).
 */

export const DIAL = 470;
/** The radii of its parts, from the middle out. */
/** The year's circle, graduated between these radii; the arcs of beads; the toothed rim. */
export const MAIN = 330;
export const BAND: [number, number] = [330, 352];
export const RINGS: [number, number] = [380, 448];
export const RIM: [number, number] = [458, 470];

/** The stretch of time on the wheel: at least the last year, and back to the first time any repeat was seen. */
export interface Window {
  start: ISODate;
  end: ISODate;
  /** Days on the wheel, today included. */
  days: number;
}
export function windowOf(dates: ISODate[], today: ISODate): Window {
  const yearAgo = addDays(today, -364);
  // Never more than three years round, so a year still reads as a good share of the wheel.
  const earliest = dates.filter((d) => d < yearAgo && d >= addDays(today, -3 * 365)).sort()[0];
  const from = earliest ?? yearAgo;
  const start = `${from.slice(0, 8)}01`;
  return { start, end: today, days: daysBetween(start, today) + 1 };
}
/** Where a day sits on the wheel; days outside it, undefined. */
export function angleOf(date: ISODate, w: Window): number | undefined {
  const d = daysBetween(w.start, date);
  if (d < 0 || d >= w.days) return undefined;
  return ((d + 0.5) / w.days) * 360;
}
/** The day at an angle. */
export function dateAt(angle: number, w: Window): ISODate {
  const a = ((angle % 360) + 360) % 360;
  return addDays(w.start, Math.min(w.days - 1, Math.floor((a / 360) * w.days)));
}

/** The months on the wheel, each from its first day (or the wheel's) to the next. */
export interface Month {
  first: ISODate;
  from: number;
  to: number;
}
export function monthsOf(w: Window): Month[] {
  const out: Month[] = [];
  let first = w.start;
  while (first <= w.end) {
    const [y, m] = first.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const from = angleOf(first, w)! - (0.5 / w.days) * 360;
    const last = next > w.end ? w.end : addDays(next, -1);
    const to = angleOf(last, w)! + (0.5 / w.days) * 360;
    out.push({ first, from, to });
    first = next;
  }
  return out;
}

/** A time a repeat happened, or an exception to it. */
export interface Mark {
  key: string;
  patternId: string;
  date: ISODate;
  angle: number;
  stance: 'supports' | 'counters';
  source: SourceRef;
}
/** A repeat's ring: where it lies, the span it has been seen over, and its marks. */
export interface Ring {
  patternId: string;
  code: number;
  radius: number;
  regularity: Regularity;
  /** From the first time it was seen to the last (degrees), when seen at all on the wheel. */
  span?: [number, number];
  /** From the last time to today, for one that is fading. */
  since?: [number, number];
  marks: Mark[];
}
export interface Almanac {
  window: Window;
  months: Month[];
  rings: Ring[];
  /** Where today is. */
  today: number;
}

/** The almanac for these repeats, in the order given (the first innermost). */
export function almanacOf(data: AtlasData, patterns: Pattern[], today: ISODate): Almanac {
  const stats = new Map(patterns.map((p) => [p.id, patternStats(data, p, today)]));
  const window = windowOf(
    patterns.flatMap((p) => stats.get(p.id)!.points.map((x) => x.date)),
    today,
  );
  const n = Math.max(1, patterns.length);
  const step = Math.min(22, (RINGS[1] - RINGS[0]) / n);
  const rings: Ring[] = patterns.map((p, i) => {
    const s = stats.get(p.id)!;
    const marks: Mark[] = [];
    for (const e of p.evidence) {
      if (e.stance === 'neutral') continue;
      const date = resolveSource(data, e.source).date;
      const angle = date ? angleOf(date, window) : undefined;
      if (date && angle !== undefined) marks.push({ key: `${p.id}:${e.id}`, patternId: p.id, date, angle, stance: e.stance, source: e.source });
    }
    marks.sort((a, b) => a.angle - b.angle);
    const seen = marks.filter((m) => m.stance === 'supports');
    const span: [number, number] | undefined = seen.length ? [seen[0].angle, seen[seen.length - 1].angle] : undefined;
    const since: [number, number] | undefined = span && s.regularity === 'fading' ? [span[1], angleOf(today, window)!] : undefined;
    return { patternId: p.id, code: p.code, radius: RINGS[0] + step * (i + 0.5), regularity: s.regularity, span, since, marks };
  });
  return { window, months: monthsOf(window), rings, today: angleOf(today, window)! };
}

/** A point on the dial at an angle (degrees clockwise from the top) and a radius. */
export const polar = (angle: number, r: number): [number, number] => {
  const a = ((angle - 90) * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r];
};
/** An arc along the dial, clockwise from one angle to another, as SVG path data. */
export function arc(from: number, to: number, r: number): string {
  const sweep = (((to - from) % 360) + 360) % 360 || (to !== from ? 360 : 0);
  if (sweep >= 359.99) {
    const [x0, y0] = polar(from, r);
    const [x1, y1] = polar(from + 180, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 1 1 ${x0.toFixed(2)} ${y0.toFixed(2)}`;
  }
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(from + sweep, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
