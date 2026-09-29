/**
 * Dates and the clock.
 *
 * Everything that depends on "now" asks this module, so one setting (the time
 * zone) moves the whole atlas together: what counts as today, the date a note
 * is filed under, week starts, experiment day counts, "3 days ago", the T+
 * clock, version times and the live clock in the top bar.
 *
 * Calendar dates (YYYY-MM-DD) are zone-free once recorded; only "now" is read
 * in the chosen zone. Calendar arithmetic runs on UTC noon so neither daylight
 * saving nor the device's own zone can shift a day.
 */
import { useSyncExternalStore } from 'react';
import type { ISODate } from '../domain/types';
import { locale, t, tn } from '../i18n';
import { safeLocalStorage, STORAGE_KEYS } from '../persistence/local';

const DAY = 86_400_000;

/* ------------------------------------------------------------------ time zone */

/** The countries offered, one zone each (the capital's or the main business zone). */
export const TIME_ZONES = [
  { id: 'Asia/Jakarta', country: 'Indonesia', city: 'Jakarta', abbr: 'WIB' },
  { id: 'Asia/Singapore', country: 'Singapore', city: 'Singapore', abbr: 'SGT' },
  { id: 'Asia/Tokyo', country: 'Japan', city: 'Tokyo', abbr: 'JST' },
  { id: 'Australia/Sydney', country: 'Australia', city: 'Sydney', abbr: null },
  { id: 'Europe/London', country: 'United Kingdom', city: 'London', abbr: null },
  { id: 'America/New_York', country: 'United States', city: 'New York', abbr: null },
] as const;

/** 'auto' follows the device; otherwise one of TIME_ZONES. */
export type ZoneSetting = 'auto' | (typeof TIME_ZONES)[number]['id'];

export const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

function initialZone(): ZoneSetting {
  const saved = safeLocalStorage.getItem(STORAGE_KEYS.zone) as string | null;
  return saved && TIME_ZONES.some((z) => z.id === saved) ? (saved as ZoneSetting) : 'auto';
}

let zone: ZoneSetting = initialZone();
const zoneListeners = new Set<() => void>();

export const zoneSetting = () => zone;
/** The IANA zone everything is read in. */
export const timeZone = () => (zone === 'auto' ? deviceZone() : zone);

export function setZone(next: ZoneSetting) {
  if (next === zone) return;
  zone = next;
  safeLocalStorage.setItem(STORAGE_KEYS.zone, next);
  formatters.clear();
  zoneListeners.forEach((fn) => fn());
}

export function useZone(): ZoneSetting {
  return useSyncExternalStore((fn) => (zoneListeners.add(fn), () => void zoneListeners.delete(fn)), zoneSetting, zoneSetting);
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, make: () => Intl.DateTimeFormat) {
  let f = formatters.get(key);
  if (!f) formatters.set(key, (f = make()));
  return f;
}

/** Short name of a zone right now: WIB, JST, BST/GMT, EDT/EST, AEST/AEDT… */
export function zoneAbbr(id: string, now = new Date()): string {
  const known = TIME_ZONES.find((z) => z.id === id);
  if (known?.abbr) return known.abbr;
  const loc = id === 'Europe/London' ? 'en-GB' : id === 'Australia/Sydney' ? 'en-AU' : 'en-US';
  const part = fmt(`abbr:${id}:${loc}`, () => new Intl.DateTimeFormat(loc, { timeZone: id, timeZoneName: 'short' }))
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? id;
}

/** "UTC+7", "UTC+10", "UTC−4". */
export function zoneOffset(id: string, now = new Date()): string {
  const part = fmt(`off:${id}`, () => new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' }))
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value;
  if (!part || part === 'GMT') return 'UTC';
  return part.replace('GMT', 'UTC').replace('-', '−');
}

/** The zone's place, as the interface names it ("Jakarta, Indonesia"); the device's zone for 'auto'. */
export function zoneLabel(setting: ZoneSetting = zone): string {
  if (setting === 'auto') return t('This device ({zone})', { zone: deviceZone().replace(/_/g, ' ') });
  const z = TIME_ZONES.find((x) => x.id === setting)!;
  // A city-state is named once ("Singapore", not "Singapore, Singapore").
  return z.city === z.country ? t(z.city) : `${t(z.city)}, ${t(z.country)}`;
}

/* ------------------------------------------------------------------ now */

/** Today, as a calendar date in the chosen zone. */
export function todayISO(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return fmt(`day:${timeZone()}`, () => new Intl.DateTimeFormat('en-CA', { timeZone: timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' })).format(
    now,
  );
}

/** The calendar date of a moment (ISO timestamp) in the chosen zone; a plain date passes through. */
export function dateOf(when: string): ISODate {
  if (when.length <= 10) return when;
  const d = new Date(when);
  return Number.isNaN(d.getTime()) ? when.slice(0, 10) : todayISO(d);
}

/** Hours, minutes and seconds of a moment in a zone, on a 24-hour clock. */
export function clockParts(when: Date = new Date(), id: string = timeZone()): { h: string; m: string; s: string } {
  const parts = fmt(
    `clock:${id}`,
    () => new Intl.DateTimeFormat('en-GB', { timeZone: id, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  ).formatToParts(when);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { h: get('hour'), m: get('minute'), s: get('second') };
}

/** "14:05" (or "14:05:09") in the chosen zone, on a 24-hour clock like the rest of the instrument. */
export function formatTime(when: Date | string = new Date(), opts: { seconds?: boolean; zone?: string } = {}): string {
  const c = clockParts(typeof when === 'string' ? new Date(when) : when, opts.zone ?? timeZone());
  return opts.seconds ? `${c.h}:${c.m}:${c.s}` : `${c.h}:${c.m}`;
}

/** A moment (ISO timestamp) as "Sep 29, 14:05" in the chosen zone. */
export function formatMoment(iso: string): string {
  return `${formatDate(dateOf(iso))}, ${formatTime(iso)}`;
}

// One shared ticker for everything that follows the clock.
const tickListeners = new Set<() => void>();
let ticker = 0;
let nowMs = Date.now();
function subscribeTick(fn: () => void) {
  tickListeners.add(fn);
  if (!ticker) {
    nowMs = Date.now();
    ticker = window.setInterval(() => {
      nowMs = Date.now();
      tickListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    tickListeners.delete(fn);
    if (!tickListeners.size) {
      clearInterval(ticker);
      ticker = 0;
    }
  };
}

/** The current moment, updated every second (for clocks). */
export function useNow(): Date {
  const ms = useSyncExternalStore(
    subscribeTick,
    () => nowMs,
    () => nowMs,
  );
  return new Date(ms);
}

/** Today in the chosen zone; components re-render only when the date changes (at midnight there). */
export function useToday(): ISODate {
  useZone();
  return useSyncExternalStore(
    subscribeTick,
    () => todayISO(),
    () => todayISO(),
  );
}

/* ------------------------------------------------------------------ calendar arithmetic */

/** A calendar date as a Date at UTC noon. */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const isoOf = (d: Date): ISODate => d.toISOString().slice(0, 10);

export function addDays(date: ISODate, days: number): ISODate {
  return isoOf(new Date(parseISODate(date).getTime() + days * DAY));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / DAY);
}

/** Monday of the week containing `date`. */
export function weekStart(date: ISODate): ISODate {
  const offset = (parseISODate(date).getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

/* ------------------------------------------------------------------ display */

/** "Sep 29" (English) / "29 Sep" (Indonesian); with the year when asked or when not this year. */
export function formatDate(date: ISODate | undefined, opts: { year?: boolean } = {}): string {
  if (!date) return '—';
  const d = dateOf(date);
  const withYear = opts.year || d.slice(0, 4) !== todayISO().slice(0, 4);
  return fmt(
    `date:${locale()}:${withYear}`,
    () => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined }),
  ).format(parseISODate(d));
}

/** "Sep 2026". */
export function formatMonth(date: ISODate): string {
  return fmt(`month:${locale()}`, () => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'short', year: 'numeric' })).format(parseISODate(date));
}

/** "Tuesday, 29 September" in the interface language. */
export function formatLongDate(date: ISODate): string {
  return fmt(`long:${locale()}`, () => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })).format(
    parseISODate(date),
  );
}

/** "today", "3 days ago", "in 12 days". */
export function relativeDays(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  if (diff === -1) return t('yesterday');
  if (diff > 0) return t('in {n} days', { n: diff });
  const ago = -diff;
  if (ago < 45) return t('{n} days ago', { n: ago });
  const months = Math.round(ago / 30);
  return tn(months, '{n} month ago', '{n} months ago');
}

/** Span between two dates as "7 months" / "5 weeks" / "12 days". */
export function formatSpan(from: ISODate, to: ISODate): string {
  const days = Math.max(1, daysBetween(from, to));
  if (days >= 60) return t('{n} months', { n: Math.round(days / 30) });
  if (days >= 14) return t('{n} weeks', { n: Math.round(days / 7) });
  return tn(days, '{n} day', '{n} days');
}
