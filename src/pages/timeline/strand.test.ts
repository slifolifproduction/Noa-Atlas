import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { activeCommitmentsByWeek } from '../../domain/history';
import { createEmptyData } from '../../data/empty';
import { addDays, weekStart } from '../../lib/dates';
import { MAX_WEEKS, strandModel } from './strand';

const TODAY = '2026-09-30';

describe('the timeline strand on Time', () => {
  const data = createSeedData(TODAY);
  const m = strandModel(data, TODAY)!;

  it('runs week by week from the first commitment, note or decision to this week', () => {
    expect(m.weeks[0].week).toBe(m.start);
    expect(m.weeks.at(-1)!.week).toBe(weekStart(TODAY));
    m.weeks.forEach((w, i) => i && expect(w.week).toBe(addDays(m.weeks[i - 1].week, 7)));
  });

  it('counts the same commitments as the old chart, week for week', () => {
    const counted = new Map(activeCommitmentsByWeek(data, TODAY).map((w) => [w.week, w.count]));
    for (const w of m.weeks) if (counted.has(w.week)) expect(w.load).toBe(counted.get(w.week));
    expect(m.maxLoad).toBe(Math.max(...m.weeks.map((w) => w.load)));
  });

  it('places every note, energy reading and decision of the period in its week', () => {
    const notes = Object.values(data.entries).filter((e) => e.date >= m.start && e.date <= TODAY);
    expect(m.weeks.reduce((s, w) => s + w.notes, 0)).toBe(notes.length);
    expect(m.weeks.flatMap((w) => w.decisions)).toHaveLength(m.decisions.length);
    for (const w of m.weeks) if (w.energy !== undefined) expect(w.energy).toBeGreaterThanOrEqual(1);
  });

  it('keeps the options not taken of each decision', () => {
    for (const d of m.decisions) {
      const src = data.decisions[d.id];
      expect(d.notTaken).toEqual(src.options.filter((o) => o.id !== src.chosenOptionId && o.label.trim()).map((o) => o.label));
    }
  });

  it('reaches back at most a year and a half, and shows nothing on an empty atlas', () => {
    expect(m.weeks.length).toBeLessThanOrEqual(MAX_WEEKS);
    expect(strandModel(createEmptyData(), TODAY)).toBeNull();
  });
});
