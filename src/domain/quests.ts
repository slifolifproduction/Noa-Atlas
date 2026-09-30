/**
 * Quests: the plan you chose, as bosses to beat.
 *
 * Nothing here is stored. Every boss is read from the plan in Ahead: the
 * milestone is the boss, each target with a date is a boss of its own, and
 * this week's steps are its minions. A boss's HP is exactly what is still
 * open (steps not done, targets not met), so it only drops when something is
 * really finished, and finishing it here finishes the same step in Ahead.
 * When a date passes before the boss falls, it gets away: that is recorded,
 * with what was done, and it can be taken on again with a new date. There is
 * no penalty.
 *
 * Experience is counted from what the atlas already holds (steps done,
 * targets met, days you wrote, tests finished, repeats reviewed, decisions
 * looked back on), so it is recomputed every time and cannot drift apart
 * between devices. The forecast reads the pace of the last four weeks; it is
 * a forecast, and says so.
 */
import { addDays, dateOf, daysBetween, todayISO, weekStart } from '../lib/dates';
import type { AtlasData, ID, ISODate, NavAction, NavTarget } from './types';

export type BossKind = 'milestone' | 'target';
export type BossState = 'active' | 'defeated' | 'escaped';

/** One piece of a boss: a step (worth one hit) or a target (the finishing blow on its own boss). */
export interface BossPart {
  id: ID;
  kind: 'action' | 'target';
  title: string;
  done: boolean;
  /** The week a step belongs to; the date a target is due. */
  week?: ISODate;
  due?: ISODate;
  targetId?: ID;
  doneAt?: ISODate;
}

export interface Forecast {
  /** Steps and targets finished a week, over the last four weeks. */
  pace: number;
  /** When the boss would fall at that pace; missing when nothing was finished lately. */
  eta?: ISODate;
  /** Whether that is before its date. */
  inTime?: boolean;
}

export interface Boss {
  /** 'milestone', or 'target:<id>'. */
  id: string;
  kind: BossKind;
  title: string;
  due: ISODate;
  /** Days until the date (negative once it has passed). */
  daysLeft: number;
  state: BossState;
  hp: number;
  maxHp: number;
  parts: BossPart[];
  forecast: Forecast;
  /** The target behind a target boss. */
  targetId?: ID;
}

export interface Quests {
  bosses: Boss[];
  /** This week's open steps: the minions. */
  minions: BossPart[];
  /** The boss to face first: the nearest date among those still standing. */
  current?: Boss;
}

const actionPart = (a: NavAction): BossPart => ({
  id: a.id,
  kind: 'action',
  title: a.title,
  done: a.status === 'done',
  week: a.week,
  targetId: a.targetId,
  doneAt: a.doneAt,
});
const targetPart = (x: NavTarget): BossPart => ({ id: x.id, kind: 'target', title: x.title, done: x.done, due: x.due, doneAt: x.doneAt });

/** Steps and targets finished a week, over the four weeks up to this one. */
export function recentPace(data: AtlasData, today: ISODate = todayISO()): number {
  const nav = data.navigation;
  if (!nav) return 0;
  const from = addDays(weekStart(today), -21);
  const doneSteps = nav.actions.filter((a) => a.status === 'done' && (a.doneAt ?? a.week) >= from && (a.doneAt ?? a.week) <= today).length;
  const doneTargets = nav.targets.filter((x) => x.done && x.doneAt && x.doneAt >= from && x.doneAt <= today).length;
  return (doneSteps + doneTargets) / 4;
}

function forecastFor(hp: number, due: ISODate, pace: number, today: ISODate): Forecast {
  if (hp === 0) return { pace };
  if (pace <= 0) return { pace };
  const eta = addDays(today, Math.ceil((hp / pace) * 7));
  return { pace, eta, inTime: eta <= due };
}

function makeBoss(kind: BossKind, id: string, title: string, due: ISODate, parts: BossPart[], pace: number, today: ISODate, targetId?: ID): Boss {
  const maxHp = parts.length;
  const hp = parts.filter((p) => !p.done).length;
  const daysLeft = daysBetween(today, due);
  const state: BossState = hp === 0 && maxHp > 0 ? 'defeated' : daysLeft < 0 ? 'escaped' : 'active';
  return { id, kind, title, due, daysLeft, state, hp, maxHp, parts, forecast: forecastFor(hp, due, pace, today), targetId };
}

export function quests(data: AtlasData, today: ISODate = todayISO()): Quests {
  const nav = data.navigation;
  if (!nav) return { bosses: [], minions: [] };
  const pace = recentPace(data, today);
  // Skipped steps are out of the fight: they neither hurt the boss nor count against you.
  const steps = nav.actions.filter((a) => a.status !== 'skipped');
  const bosses: Boss[] = [];

  // The milestone: its targets (those due by then) and every step toward them, plus the steps that serve no target.
  const due = nav.milestone.due;
  const mine = nav.targets.filter((x) => x.due <= due);
  const ids = new Set(mine.map((x) => x.id));
  const parts = [...mine.map(targetPart), ...steps.filter((a) => !a.targetId || ids.has(a.targetId)).map(actionPart)];
  if (nav.milestone.title.trim()) bosses.push(makeBoss('milestone', 'milestone', nav.milestone.title, due, parts, pace, today));

  // Each dated target is a boss of its own: its steps, then the target itself as the finishing blow.
  for (const x of nav.targets) {
    const own = steps.filter((a) => a.targetId === x.id).map(actionPart);
    bosses.push(makeBoss('target', `target:${x.id}`, x.title, x.due, [...own, targetPart(x)], pace, today, x.id));
  }

  const week = weekStart(today);
  const minions = steps.filter((a) => a.status === 'todo' && a.week <= week).map(actionPart);
  const standing = bosses.filter((b) => b.state === 'active').sort((a, b) => a.due.localeCompare(b.due) || (a.kind === 'milestone' ? 1 : -1));
  return { bosses, minions, current: standing[0] };
}

/* ------------------------------------------------------------------ experience */

export type XpKind = 'step' | 'target' | 'note' | 'test' | 'repeat' | 'decision';

/** What each kind of real progress is worth. */
export const XP: Record<XpKind, number> = { step: 10, target: 30, note: 5, test: 40, repeat: 10, decision: 10 };

export interface XpSource {
  kind: XpKind;
  /** How many times it happened, and what that came to. */
  count: number;
  xp: number;
}

export interface Player {
  xp: number;
  level: number;
  /** Experience at the start of this level and at the next. */
  floor: number;
  next: number;
  sources: XpSource[];
}

/** Experience needed to reach a level (level 1 starts at 0). */
export const levelFloor = (level: number) => 40 * (level - 1) ** 2;

export function player(data: AtlasData, today: ISODate = todayISO()): Player {
  const count: Record<XpKind, number> = { step: 0, target: 0, note: 0, test: 0, repeat: 0, decision: 0 };
  const nav = data.navigation;
  if (nav) {
    count.step = nav.actions.filter((a) => a.status === 'done').length;
    count.target = nav.targets.filter((x) => x.done).length;
  }
  // Days you wrote, not notes: writing ten notes in one day is still one day.
  count.note = new Set(
    Object.values(data.entries)
      .map((e) => e.date)
      .filter((d) => d <= today),
  ).size;
  count.test = Object.values(data.experiments).filter((x) => x.result && dateOf(x.result.recordedAt) <= today).length;
  count.repeat = Object.values(data.patterns).filter((p) => p.userAssessment).length;
  count.decision = Object.values(data.decisions).filter((d) => d.outcomeRating).length;
  const sources = (Object.keys(count) as XpKind[]).map((kind) => ({ kind, count: count[kind], xp: count[kind] * XP[kind] }));
  const xp = sources.reduce((s, x) => s + x.xp, 0);
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  return { xp, level, floor: levelFloor(level), next: levelFloor(level + 1), sources };
}
