/**
 * History: what happened, when.
 *
 * Stored occurrences (read from notes), decisions, test starts and results,
 * and state readings taken from the energy and mood recorded with each note,
 * merged into one timeline. Plan steps appear as planned, never as history.
 * Every item keeps a trail back to the record it came from.
 */
import { addDays, dateOf, daysBetween, todayISO, weekStart } from '../lib/dates';
import { SKILL_STATUS_LABEL } from './constants';
import { experimentCode } from './selectors';
import type { AtlasData, EntityRef, ID, ISODate, Mode, OccurrenceKind, SourceRef } from './types';
import { t } from '../i18n';

export type HistoryKind = OccurrenceKind | 'decision' | 'record' | 'test' | 'step' | 'deadline' | 'levelup';

export interface HistoryItem {
  key: string;
  kind: HistoryKind;
  date: ISODate;
  until?: ISODate;
  approx?: boolean;
  label: string;
  mode: Mode;
  about: ID[];
  instanceOf?: ID;
  value?: number;
  external?: boolean;
  landmark?: boolean;
  /** What opens when the item is chosen. */
  ref: EntityRef;
  /** The record it traces back to. */
  source?: SourceRef;
}

/** The state elements that the energy and mood fields of notes are readings of. */
export function contextStates(data: AtlasData): { energy?: ID; mood?: ID } {
  const find = (tag: string) => Object.values(data.nodes).find((n) => n.kind === 'state' && n.tags.includes(tag))?.id;
  return { energy: find('energy'), mood: find('mood') };
}

/**
 * `quests` adds what Quests keeps: dates in the plan that passed with work
 * still open, and skills raised with level points. Only Time asks for them;
 * they are never evidence about causes.
 */
export function historyItems(data: AtlasData, opts: { records?: boolean; planned?: boolean; quests?: boolean; today?: ISODate } = {}): HistoryItem[] {
  const today = opts.today ?? todayISO();
  const out: HistoryItem[] = [];

  for (const o of Object.values(data.occurrences)) {
    out.push({
      key: `occ:${o.id}`,
      kind: o.kind,
      date: o.date,
      until: o.until,
      approx: o.approx,
      label: o.label,
      mode: o.mode,
      about: o.about,
      instanceOf: o.instanceOf,
      value: o.value,
      external: o.external,
      landmark: o.landmark,
      ref: { kind: 'occurrence', id: o.id },
      source: o.source,
    });
  }

  for (const d of Object.values(data.decisions)) {
    out.push({
      key: `dec:${d.id}`,
      kind: 'decision',
      date: d.date,
      label: d.title,
      mode: 'actual',
      about: d.nodeIds,
      ref: { kind: 'decision', id: d.id },
      source: { kind: 'decision', id: d.id },
    });
  }

  const states = contextStates(data);
  for (const e of Object.values(data.entries)) {
    if (opts.records) {
      out.push({ key: `ent:${e.id}`, kind: 'record', date: e.date, label: e.title, mode: 'actual', about: e.nodeIds, ref: { kind: 'entry', id: e.id } });
    }
    if (states.energy && e.context?.energy !== undefined) {
      out.push({
        key: `energy:${e.id}`,
        kind: 'reading',
        date: e.date,
        label: t('Energy {n}/5', { n: e.context.energy }),
        mode: 'actual',
        about: [states.energy],
        instanceOf: states.energy,
        value: e.context.energy,
        ref: { kind: 'entry', id: e.id },
        source: { kind: 'entry', id: e.id },
      });
    }
  }

  for (const x of Object.values(data.experiments)) {
    if (x.startDate && x.status !== 'proposed') {
      out.push({
        key: `test:${x.id}`,
        kind: 'test',
        date: x.startDate,
        until: x.result ? dateOf(x.result.recordedAt) : undefined,
        label: t('{code} started: {title}', { code: experimentCode(x.code), title: x.title }),
        mode: 'actual',
        about: x.claimId && data.claims[x.claimId] ? [data.claims[x.claimId]!.from] : [],
        ref: { kind: 'experiment', id: x.id },
        source: { kind: 'experiment', id: x.id },
      });
    }
  }

  if (opts.planned && data.navigation) {
    const week = weekStart(today);
    for (const a of data.navigation.actions) {
      if (a.status !== 'todo' || a.week < week) continue;
      out.push({
        key: `step:${a.id}`,
        kind: 'step',
        date: a.week,
        label: a.title,
        mode: 'planned',
        about: [],
        ref: { kind: 'path', id: data.navigation.pathId },
      });
    }
  }

  // Deadlines in the plan that passed with something still open (a boss that got away, on Quests):
  // what was done by then is kept with it. Shown on Time only; never evidence about causes.
  if (opts.quests && data.navigation) {
    const nav = data.navigation;
    const stepsOf = (id?: ID) => nav.actions.filter((a) => a.status !== 'skipped' && (id ? a.targetId === id : true));
    const passed: { key: string; title: string; due: ISODate; done: number; total: number }[] = nav.targets
      .filter((x) => x.due < today && !x.done)
      .map((x) => {
        const steps = stepsOf(x.id);
        return { key: `target:${x.id}`, title: x.title, due: x.due, done: steps.filter((a) => a.status === 'done').length, total: steps.length + 1 };
      });
    if (nav.milestone.title.trim() && nav.milestone.due < today) {
      const targets = nav.targets.filter((x) => x.due <= nav.milestone.due);
      const ids = new Set(targets.map((x) => x.id));
      const steps = nav.actions.filter((a) => a.status !== 'skipped' && (!a.targetId || ids.has(a.targetId)));
      const done = targets.filter((x) => x.done).length + steps.filter((a) => a.status === 'done').length;
      const total = targets.length + steps.length;
      if (done < total) passed.push({ key: 'milestone', title: nav.milestone.title, due: nav.milestone.due, done, total });
    }
    // Dates that passed before a new one was set keep how far things had got.
    const again = (key: string, title: string, list: { due: ISODate; done: number; total: number }[] = []) =>
      list.forEach((m, i) => passed.push({ key: `${key}:${i}`, title, due: m.due, done: m.done, total: m.total }));
    again('milestone-was', nav.milestone.title, nav.milestone.missed);
    for (const x of nav.targets) again(`target-was:${x.id}`, x.title, x.missed);
    for (const p of passed) {
      out.push({
        key: `deadline:${p.key}`,
        kind: 'deadline',
        date: p.due,
        label: t('Date passed: {title} ({done} of {total} done)', { title: p.title, done: p.done, total: p.total }),
        mode: 'actual',
        about: [],
        ref: { kind: 'path', id: nav.pathId },
      });
    }
  }

  if (opts.quests) {
    for (const u of data.quests?.upgrades ?? []) {
      const node = data.nodes[u.nodeId];
      if (!node || u.at > today) continue;
      out.push({
        key: `levelup:${u.id}`,
        kind: 'levelup',
        date: u.at,
        label: t('Skill raised: {skill} ({from} → {to})', { skill: node.label, from: SKILL_STATUS_LABEL[u.from], to: SKILL_STATUS_LABEL[u.to] }),
        mode: 'actual',
        about: [node.id],
        ref: { kind: 'node', id: node.id },
      });
    }
  }

  return out.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
}

/** Everything in history that concerns one element. */
export function historyOf(data: AtlasData, id: ID): HistoryItem[] {
  return historyItems(data).filter((h) => h.about.includes(id) || h.instanceOf === id);
}

/** What happened in the weeks before a date (candidates when asking "why?"). */
export function windowBefore(data: AtlasData, date: ISODate, days = 56): HistoryItem[] {
  const from = addDays(date, -days);
  return historyItems(data).filter((h) => h.mode === 'actual' && h.date >= from && h.date <= date);
}

/** What happened in the weeks after a date (what followed a decision). */
export function windowAfter(data: AtlasData, date: ISODate, days = 56): HistoryItem[] {
  const to = addDays(date, days);
  return historyItems(data)
    .filter((h) => h.mode === 'actual' && h.date > date && h.date <= to)
    .reverse();
}

/** A state's readings over time: stored readings and the ones taken from notes. */
export function readingsOf(data: AtlasData, stateId: ID): { date: ISODate; value: number }[] {
  return historyItems(data)
    .filter((h) => h.kind === 'reading' && h.instanceOf === stateId && h.value !== undefined)
    .map((h) => ({ date: h.date, value: h.value! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * A computed observation: how many commitments were active each week, from
 * their lifespans. Nothing is typed in; it is counted. From the first
 * commitment's week, or from `from` (weeks before any commitment count 0).
 */
export function activeCommitmentsByWeek(data: AtlasData, today: ISODate = todayISO(), from?: ISODate): { week: ISODate; count: number }[] {
  const commitments = Object.values(data.nodes).filter((n) => n.kind === 'commitment' && n.adopted && n.since);
  if (!commitments.length && !from) return [];
  const first = weekStart(from ?? commitments.map((n) => n.since!).sort()[0]);
  const last = weekStart(today);
  const out: { week: ISODate; count: number }[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    out.push({ week: w, count: commitments.filter((n) => n.since! <= end && (!n.until || n.until >= w)).length });
  }
  return out;
}

/** Weeks since the last note, and weeks with no notes at all (gaps in the record). */
export function recordGaps(data: AtlasData, today: ISODate = todayISO()): { quietWeeks: number; sinceLast?: number } {
  const dates = Object.values(data.entries)
    .map((e) => e.date)
    .sort();
  if (!dates.length) return { quietWeeks: 0 };
  const weeks = new Set(dates.map((d) => weekStart(d)));
  let quiet = 0;
  for (let w = weekStart(dates[0]); w <= weekStart(today); w = addDays(w, 7)) if (!weeks.has(w)) quiet++;
  return { quietWeeks: quiet, sinceLast: daysBetween(dates[dates.length - 1], today) };
}
