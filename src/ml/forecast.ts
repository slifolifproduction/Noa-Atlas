/**
 * When a repeat may come next: read from the gaps between the times it happened so far, nothing else.
 *
 * The usual gap is the middle half of those gaps (from the first quartile to the third), so one long holiday or two
 * days in a row do not move it much. The next time would fall that far after the last, if it keeps to it. It is a
 * forecast, and is drawn and said as one: a possibility, never a time it happened, and never evidence of anything.
 * With fewer than three gaps there is no usual to speak of, so it says nothing; when the longer of the usual gaps
 * is more than four times the shorter, it says they vary too much to tell.
 */
import type { ISODate } from '../domain/types';
import { addDays, daysBetween } from '../lib/dates';

export interface RepeatForecast {
  /** The gaps it is read from. */
  gaps: number;
  last: ISODate;
  /** The usual gap in days: the middle half of the gaps so far, and the middle one. */
  usual: [number, number];
  median: number;
  /** When the next time would fall if it keeps its usual gap. */
  from: ISODate;
  to: ISODate;
  /**
   * Today against that window: still ahead, inside it, or past it (longer than usual since the last time); or no
   * window at all, when the gaps so far vary too much for one to mean anything.
   */
  state: 'ahead' | 'due' | 'late' | 'irregular';
}

/** The q-quantile of sorted numbers, between the two nearest when it falls between them. */
function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

export const MIN_GAPS = 3;
/** Usual gaps further apart than this many times are no usual at all. */
const IRREGULAR = 4;

export function forecastRepeat(dates: ISODate[], today: ISODate): RepeatForecast | undefined {
  const days = [...new Set(dates.filter((d) => d <= today))].sort();
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
  if (gaps.length < MIN_GAPS) return undefined;
  const sorted = [...gaps].sort((a, b) => a - b);
  const usual: [number, number] = [Math.round(quantile(sorted, 0.25)), Math.round(quantile(sorted, 0.75))];
  const last = days[days.length - 1];
  const from = addDays(last, usual[0]);
  const to = addDays(last, usual[1]);
  return {
    gaps: gaps.length,
    last,
    usual,
    median: Math.round(quantile(sorted, 0.5)),
    from,
    to,
    state: usual[1] > IRREGULAR * Math.max(1, usual[0]) ? 'irregular' : today < from ? 'ahead' : today <= to ? 'due' : 'late',
  };
}
