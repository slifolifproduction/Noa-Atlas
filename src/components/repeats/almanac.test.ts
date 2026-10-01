import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { patternStats, sortedPatterns } from '../../domain/selectors';
import { addDays } from '../../lib/dates';
import { almanacOf, angleOf, dateAt, monthsOf, windowOf } from './almanac';

const today = '2026-10-01';

describe('the Repeats almanac', () => {
  it('sets out at least the last year, from the first of a month, ending today', () => {
    const w = windowOf([], today);
    expect(w.start.endsWith('-01')).toBe(true);
    expect(w.start <= addDays(today, -364)).toBe(true);
    expect(w.end).toBe(today);
    expect(angleOf(today, w)! > 359).toBe(true);
    expect(angleOf(w.start, w)! < 1).toBe(true);
    expect(angleOf(addDays(w.start, -1), w)).toBeUndefined();
    expect(angleOf(addDays(today, 1), w)).toBeUndefined();
  });

  it('reaches back to the first time anything repeated, but never more than three years', () => {
    expect(windowOf(['2025-02-14'], today).start).toBe('2025-02-01');
    expect(windowOf(['2019-01-01'], today).start <= addDays(today, -364)).toBe(true);
    expect(windowOf(['2019-01-01'], today).start > '2023-01-01').toBe(true);
  });

  it('reads clockwise, one day after another, and back again from an angle', () => {
    const w = windowOf([], today);
    let prev = -1;
    for (let d = w.start; d <= today; d = addDays(d, 9)) {
      const a = angleOf(d, w)!;
      expect(a).toBeGreaterThan(prev);
      expect(dateAt(a, w)).toBe(d);
      prev = a;
    }
  });

  it('lays the months end to end round the whole wheel', () => {
    const w = windowOf([], today);
    const months = monthsOf(w);
    expect(months[0].from).toBeCloseTo(0, 6);
    expect(months.at(-1)!.to).toBeCloseTo(360, 6);
    for (let i = 1; i < months.length; i++) expect(months[i].from).toBeCloseTo(months[i - 1].to, 6);
  });

  it('gives every repeat a ring with each time and exception, the span it was seen over, and a tail when fading', () => {
    const data = createSeedData();
    const patterns = sortedPatterns(data);
    const al = almanacOf(data, patterns, today);
    expect(al.rings.map((r) => r.patternId)).toEqual(patterns.map((p) => p.id));
    for (let i = 1; i < al.rings.length; i++) expect(al.rings[i].radius).toBeGreaterThan(al.rings[i - 1].radius);
    for (const r of al.rings) {
      const p = data.patterns[r.patternId];
      const s = patternStats(data, p, today);
      expect(r.marks.filter((m) => m.stance === 'supports')).toHaveLength(s.instances);
      expect(r.marks.filter((m) => m.stance === 'counters')).toHaveLength(s.counter);
      expect(r.span![0]).toBe(angleOf(s.firstObserved!, al.window));
      expect(r.span![1]).toBe(angleOf(s.lastObserved!, al.window));
      expect(Boolean(r.since)).toBe(s.regularity === 'fading');
    }
  });
});
