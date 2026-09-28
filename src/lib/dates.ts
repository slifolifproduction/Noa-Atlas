import type { ISODate } from '../domain/types';

const DAY = 86_400_000;

/** Today as a local calendar date. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a calendar date at local noon so DST shifts never change the day. */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(date: ISODate, days: number): ISODate {
  const dt = parseISODate(date);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY);
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const dt = parseISODate(date);
  const offset = (dt.getDay() + 6) % 7;
  return addDays(date, -offset);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 9" or "Mar 9, 2025" when not in the current year. */
export function formatDate(date: ISODate | undefined, opts: { year?: boolean } = {}): string {
  if (!date) return '—';
  const dt = parseISODate(date.slice(0, 10));
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  const base = `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
  return opts.year || !sameYear ? `${base}, ${dt.getFullYear()}` : base;
}

export function formatMonth(date: ISODate): string {
  const dt = parseISODate(date);
  return `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "today", "3 days ago", "in 12 days". */
export function relativeDays(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return `in ${diff} days`;
  const ago = -diff;
  if (ago < 45) return `${ago} days ago`;
  const months = Math.round(ago / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

/** Span between two dates as "7 months" / "5 weeks" / "12 days". */
export function formatSpan(from: ISODate, to: ISODate): string {
  const days = Math.max(1, daysBetween(from, to));
  if (days >= 60) return `${Math.round(days / 30)} months`;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${days} day${days === 1 ? '' : 's'}`;
}
