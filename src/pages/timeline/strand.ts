/**
 * What the timeline strand on Time is drawn from, week by week: how many
 * commitments were active (counted from their lifespans), the energy readings
 * recorded with notes, how many notes were written, and the decisions made,
 * each with the options not taken. Counted, never inferred: the strand shows
 * these side by side and says nothing about what affects what.
 */
import { activeCommitmentsByWeek, contextStates, readingsOf } from '../../domain/history';
import type { AtlasData, ID, ISODate } from '../../domain/types';
import { addDays, weekStart } from '../../lib/dates';

/** The strand reaches back at most this many weeks. */
export const MAX_WEEKS = 78;

export interface StrandDecision {
  id: ID;
  date: ISODate;
  title: string;
  taken: string;
  notTaken: string[];
}

export interface StrandWeek {
  week: ISODate;
  load: number;
  notes: number;
  /** The mean of the energy readings that week, if any. */
  energy?: number;
  decisions: StrandDecision[];
}

export interface StrandModel {
  /** Monday of the first week shown. */
  start: ISODate;
  today: ISODate;
  weeks: StrandWeek[];
  maxLoad: number;
  energy: { date: ISODate; value: number }[];
  notes: ISODate[];
  decisions: StrandDecision[];
}

export function strandModel(data: AtlasData, today: ISODate): StrandModel | null {
  const firsts = [
    ...Object.values(data.nodes)
      .filter((n) => n.kind === 'commitment' && n.adopted && n.since)
      .map((n) => n.since!),
    ...Object.values(data.entries).map((e) => e.date),
    ...Object.values(data.decisions).map((d) => d.date),
  ].filter((d) => d <= today);
  if (!firsts.length) return null;
  const earliest = weekStart([...firsts].sort()[0]);
  const floor = addDays(weekStart(today), -7 * (MAX_WEEKS - 1));
  const start = earliest < floor ? floor : earliest;
  const inRange = (d: ISODate) => d >= start && d <= today;

  const counts = activeCommitmentsByWeek(data, today, start);
  const energyId = contextStates(data).energy;
  const energy = (energyId ? readingsOf(data, energyId) : []).filter((r) => inRange(r.date));
  const notes = Object.values(data.entries)
    .map((e) => e.date)
    .filter(inRange)
    .sort();
  const decisions: StrandDecision[] = Object.values(data.decisions)
    .filter((d) => inRange(d.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((d) => ({
      id: d.id,
      date: d.date,
      title: d.title,
      taken: d.options.find((o) => o.id === d.chosenOptionId)?.label || d.chosenAction,
      notTaken: d.options.filter((o) => o.id !== d.chosenOptionId && o.label.trim()).map((o) => o.label),
    }));

  const weeks: StrandWeek[] = counts.map(({ week, count }) => {
    const inWeek = (d: ISODate) => weekStart(d) === week;
    const readings = energy.filter((r) => inWeek(r.date));
    return {
      week,
      load: count,
      notes: notes.filter(inWeek).length,
      energy: readings.length ? readings.reduce((s, r) => s + r.value, 0) / readings.length : undefined,
      decisions: decisions.filter((d) => inWeek(d.date)),
    };
  });
  if (weeks.length < 3) return null;
  return { start, today, weeks, maxLoad: Math.max(1, ...weeks.map((w) => w.load)), energy, notes, decisions };
}
