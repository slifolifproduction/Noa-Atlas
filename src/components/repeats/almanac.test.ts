import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { patternStats, sortedPatterns } from '../../domain/selectors';
import { addDays } from '../../lib/dates';
import { almanacOf, angleOf, dateAt, monthsOf, windowOf } from './almanac';
import { pathwaysOf, sourceElements } from './pathways';

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

describe('the Repeats pathways', () => {
  const data = createSeedData();
  const patterns = sortedPatterns(data);
  const al = almanacOf(data, patterns, today);
  const pw = pathwaysOf(data, al, patterns);

  it('starts every strand of a repeat from what sets it off, one fan for each time, read from the record', () => {
    for (const p of patterns) {
      const anchor = pw.anchors[p.id];
      expect(anchor).toBe(p.steps.find((s) => s.elementId)?.elementId ?? p.nodeIds[0]);
      const own = pw.strands.filter((s) => s.patternId === p.id);
      expect(own.every((s) => s.from === anchor && s.to !== anchor)).toBe(true);
      const marks = new Set(al.rings.find((r) => r.patternId === p.id)!.marks.map((m) => m.key));
      expect(own.every((s) => marks.has(s.mark.key))).toBe(true);
      // An exception never runs through the repeat's own steps: it did not happen.
      const steps = new Set(p.steps.map((s) => s.elementId));
      for (const s of own.filter((x) => x.exception)) expect(s.exception && s.mark.stance === 'counters').toBe(true);
      for (const s of own.filter((x) => x.exception)) expect(steps.has(s.to) ? sourceElements(data, s.mark.source).includes(s.to) : true).toBe(true);
    }
  });

  it('puts every element in its area round the ring, larger the more strands end at it, the areas apart', () => {
    for (const d of pw.dots) {
      expect(d.area).toBe(data.nodes[d.id].area);
      expect(d.count).toBe(pw.strands.filter((s) => s.from === d.id || s.to === d.id).length);
      const s = pw.sectors.find((x) => x.area === d.area)!;
      expect(d.angle).toBeGreaterThan(s.from);
      expect(d.angle).toBeLessThan(s.to);
    }
    for (let i = 1; i < pw.sectors.length; i++) expect(pw.sectors[i].from).toBeGreaterThan(pw.sectors[i - 1].to);
    expect(pw.sectors.at(-1)!.to).toBeLessThan(360);
    const sizes = [...pw.dots].sort((a, b) => a.count - b.count);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i].size).toBeGreaterThanOrEqual(sizes[i - 1].size);
  });
});
