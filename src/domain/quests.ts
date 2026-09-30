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
import { STATUS_META } from './constants';
import { findLoops, loopName, type Loop } from './loops';
import { patternStats } from './selectors';
import type {
  ArmorRef,
  AtlasData,
  AtlasNode,
  ClaimStatus,
  EntityRef,
  ID,
  ISODate,
  NavAction,
  NavTarget,
  Pattern,
  SkillRequirement,
  SkillStatus,
  SkillUpgrade,
} from './types';
import { t, tn } from '../i18n';

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

export type XpKind = 'step' | 'target' | 'note' | 'test' | 'repeat' | 'decision' | 'exception' | 'armor';

/** What each kind of real progress is worth. */
export const XP: Record<XpKind, number> = { step: 10, target: 30, note: 5, test: 40, repeat: 10, decision: 10, exception: 15, armor: 50 };

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
  const count: Record<XpKind, number> = { step: 0, target: 0, note: 0, test: 0, repeat: 0, decision: 0, exception: 0, armor: 0 };
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
  // Times a repeat did not happen, written down: each one chips its armor.
  count.exception = Object.values(data.patterns).reduce((n, p) => n + p.evidence.filter((e) => e.stance === 'counters').length, 0);
  // Armor plates broken by evidence, each counted once however many bosses it stood in front of.
  const plates = new Map<string, ArmorRef>();
  for (const refs of Object.values(data.quests?.armor ?? {})) for (const r of refs) plates.set(`${r.kind}:${r.id}`, r);
  if (plates.size) {
    const cycles = [...plates.values()].some((r) => r.kind === 'loop') ? findLoops(data, ARMOR_STATUSES) : [];
    count.armor = [...plates.values()].filter((r) => armorPlate(data, r, today, cycles)?.broken).length;
  }
  const sources = (Object.keys(count) as XpKind[]).map((kind) => ({ kind, count: count[kind], xp: count[kind] * XP[kind] }));
  const xp = sources.reduce((s, x) => s + x.xp, 0);
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  return { xp, level, floor: levelFloor(level), next: levelFloor(level + 1), sources };
}

/* ------------------------------------------------------------------ armor */

/**
 * A boss's armor: the repeats (Repeats) and cycles (Causes) you say stand in
 * its way. Armor never shields it from real work (HP still only drops when
 * something is done); it is what keeps making the work hard, and it is
 * chipped the only way the atlas allows: a repeat by the times it did not
 * happen (exceptions), a cycle by testing its least sure step until that
 * step no longer holds. Its strength is read from the evidence each time.
 */
export interface ArmorPlate {
  ref: ArmorRef;
  title: string;
  /** 1 whole, 0 gone. */
  integrity: number;
  broken: boolean;
  /** No longer counted: you set the repeat aside or said it does not ring true. */
  withdrawn?: boolean;
  /** Why it stands at that, in plain words. */
  reading: string;
  /** What to open to work on it. */
  open?: EntityRef;
  /** Repeats: how much of the plan was finished in weeks it showed up, and in the others (side by side, not a finding). */
  split?: PaceSplit;
}

export interface PaceSplit {
  weeksWith: number;
  weeksWithout: number;
  paceWith: number;
  paceWithout: number;
}

/** Cycles that count as armor: any the record shows at least a few times, and those a test has since broken. */
export const ARMOR_STATUSES = new Set<ClaimStatus>(['plausible', 'supported', 'tested', 'weakened', 'retired']);
const CYCLE_HOLD: Record<ClaimStatus, number> = { tested: 1, supported: 0.85, plausible: 0.6, proposed: 0.4, weakened: 0.15, retired: 0 };
const BROKEN = 0.25;
const RECENT_DAYS = 56;

/** Finished steps and targets by week (Monday), from the week the plan was chosen to the last full week. */
function weeklyDone(data: AtlasData, today: ISODate): Map<ISODate, number> {
  const nav = data.navigation;
  const out = new Map<ISODate, number>();
  if (!nav) return out;
  const last = addDays(weekStart(today), -7);
  for (let w = weekStart(nav.committedAt); w <= last; w = addDays(w, 7)) out.set(w, 0);
  const add = (d?: ISODate) => {
    const w = d && weekStart(d);
    if (w && out.has(w)) out.set(w, out.get(w)! + 1);
  };
  nav.actions.filter((a) => a.status === 'done').forEach((a) => add(a.doneAt ?? a.week));
  nav.targets.filter((x) => x.done).forEach((x) => add(x.doneAt));
  return out;
}

/** The plan's pace in weeks a repeat showed up, and in the others; only when both have at least two weeks. */
export function paceSplit(data: AtlasData, pattern: Pattern, today: ISODate = todayISO()): PaceSplit | undefined {
  const weeks = weeklyDone(data, today);
  const shown = new Set(
    patternStats(data, pattern, today)
      .points.filter((p) => p.stance === 'supports')
      .map((p) => weekStart(p.date)),
  );
  const withIt = [...weeks].filter(([w]) => shown.has(w)).map(([, n]) => n);
  const without = [...weeks].filter(([w]) => !shown.has(w)).map(([, n]) => n);
  if (withIt.length < 2 || without.length < 2) return undefined;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { weeksWith: withIt.length, weeksWithout: without.length, paceWith: mean(withIt), paceWithout: mean(without) };
}

/** When a boss with this much HP would fall at a given pace. */
export function etaAt(hp: number, pace: number, today: ISODate = todayISO()): ISODate | undefined {
  return hp > 0 && pace > 0 ? addDays(today, Math.ceil((hp / pace) * 7)) : undefined;
}

export function armorPlate(data: AtlasData, ref: ArmorRef, today: ISODate = todayISO(), cycles?: Loop[]): ArmorPlate | null {
  if (ref.kind === 'pattern') {
    const p = data.patterns[ref.id];
    if (!p) return null;
    const open: EntityRef = { kind: 'pattern', id: p.id };
    if (p.setAside || p.userAssessment?.verdict === 'inaccurate') {
      return {
        ref,
        title: p.title,
        integrity: 0,
        broken: false,
        withdrawn: true,
        reading: t('Withdrawn: you set this repeat aside or said it does not ring true.'),
        open,
      };
    }
    const stats = patternStats(data, p, today);
    const from = addDays(today, -RECENT_DAYS);
    const recent = stats.points.filter((x) => x.date >= from && x.date <= today);
    const times = recent.filter((x) => x.stance === 'supports').length;
    const exceptions = recent.filter((x) => x.stance === 'counters').length;
    let integrity: number;
    let reading: string;
    if (times + exceptions > 0) {
      integrity = times / (times + exceptions);
      reading = t('In the last eight weeks: {times}, and {exceptions}.', {
        times: tn(times, 'it happened once', 'it happened {n} times'),
        exceptions: tn(exceptions, 'one exception', '{n} exceptions'),
      });
    } else if (stats.regularity === 'fading') {
      integrity = 0.2;
      reading = t('Fading: not seen for a while, or the exceptions took over.');
    } else {
      integrity = 0.5;
      reading = t('Quiet in the last eight weeks: nothing either way.');
    }
    return { ref, title: p.title, integrity, broken: integrity < BROKEN, reading, open, split: paceSplit(data, p, today) };
  }
  const loop = (cycles ?? findLoops(data, ARMOR_STATUSES)).find((l) => l.id === ref.id);
  if (!loop) return null;
  const integrity = CYCLE_HOLD[loop.weakest];
  return {
    ref,
    title: loopName(loop),
    integrity,
    broken: integrity < BROKEN,
    reading: t('Its least sure step: {status}.', { status: STATUS_META[loop.weakest].label.toLowerCase() }),
    open: integrity < BROKEN ? undefined : { kind: 'loop', id: loop.id },
  };
}

export function bossArmor(data: AtlasData, bossId: string, today: ISODate = todayISO()): ArmorPlate[] {
  const refs = data.quests?.armor[bossId] ?? [];
  if (!refs.length) return [];
  const cycles = refs.some((r) => r.kind === 'loop') ? findLoops(data, ARMOR_STATUSES) : [];
  return refs.map((r) => armorPlate(data, r, today, cycles)).filter((p): p is ArmorPlate => Boolean(p));
}

/** What could stand in a boss's way: repeats and cycles still standing, the ones tied to the chosen direction first. */
export function armorCandidates(data: AtlasData, bossId: string, today: ISODate = todayISO()): (ArmorPlate & { tied: boolean })[] {
  const taken = new Set((data.quests?.armor[bossId] ?? []).map((r) => `${r.kind}:${r.id}`));
  const path = data.navigation ? data.paths[data.navigation.pathId] : undefined;
  const tiedPatterns = new Set(path?.patternIds ?? []);
  const tiedClaims = new Set([...(path?.assumptionIds ?? []), ...[...tiedPatterns].flatMap((id) => data.patterns[id]?.explainedBy ?? [])]);
  const cycles = findLoops(data, ARMOR_STATUSES);
  const out: (ArmorPlate & { tied: boolean })[] = [];
  for (const p of Object.values(data.patterns)) {
    const plate = armorPlate(data, { kind: 'pattern', id: p.id }, today);
    if (plate && !plate.broken && !plate.withdrawn && !taken.has(`pattern:${p.id}`)) out.push({ ...plate, tied: tiedPatterns.has(p.id) });
  }
  for (const l of cycles) {
    const plate = armorPlate(data, { kind: 'loop', id: l.id }, today, cycles);
    if (plate && !plate.broken && !taken.has(`loop:${l.id}`)) out.push({ ...plate, tied: l.claimIds.some((c) => tiedClaims.has(c)) });
  }
  return out.sort((a, b) => Number(b.tied) - Number(a.tied) || b.integrity - a.integrity || a.title.localeCompare(b.title));
}

/* ------------------------------------------------------------------ skills */

export const SKILL_STEPS: SkillStatus[] = ['gap', 'developing', 'have'];
const nextStep = (s: SkillStatus) => SKILL_STEPS[SKILL_STEPS.indexOf(s) + 1];
const norm = (s: string) => s.trim().toLowerCase();
const matches = (a: string, b: string) => norm(a) === norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a));

export interface ArsenalItem {
  node: AtlasNode;
  level: SkillStatus;
  /** The next step up, if there is one. */
  next?: SkillStatus;
  /** Notes (and happenings) about it since it was last raised: the practice a raise needs. */
  practice: number;
  lastUpgrade?: SkillUpgrade;
  /** What the chosen direction asks for, when this is one of its skills. */
  asked?: string;
}

export interface Arsenal {
  items: ArsenalItem[];
  points: { earned: number; spent: number; left: number };
  /** Skills the chosen direction asks for that are not on the map yet. */
  missing: SkillRequirement[];
  /** How many of the skills the direction asks for are at "have". */
  power: { have: number; total: number };
}

export function arsenal(data: AtlasData, today: ISODate = todayISO()): Arsenal {
  const upgrades = data.quests?.upgrades ?? [];
  const path = data.navigation ? data.paths[data.navigation.pathId] : undefined;
  const asked = path?.skills ?? [];
  const skills = Object.values(data.nodes).filter((n) => n.kind === 'skill' && n.adopted);
  const items: ArsenalItem[] = skills.map((node) => {
    const level = node.level ?? 'gap';
    const lastUpgrade = [...upgrades].reverse().find((u) => u.nodeId === node.id);
    const since = lastUpgrade?.at ?? '';
    const practice =
      Object.values(data.entries).filter((e) => e.nodeIds.includes(node.id) && e.date > since && e.date <= today).length +
      Object.values(data.occurrences).filter((o) => o.mode === 'actual' && o.about.includes(node.id) && o.date > since && o.date <= today).length;
    return { node, level, next: nextStep(level), practice, lastUpgrade, asked: asked.find((r) => matches(r.label, node.label))?.label };
  });
  items.sort(
    (a, b) =>
      Number(Boolean(b.asked)) - Number(Boolean(a.asked)) ||
      SKILL_STEPS.indexOf(a.level) - SKILL_STEPS.indexOf(b.level) ||
      a.node.label.localeCompare(b.node.label),
  );
  const earned = player(data, today).level - 1;
  const spent = upgrades.length;
  const missing = asked.filter((r) => !skills.some((n) => matches(r.label, n.label)));
  const levelOf = (r: SkillRequirement) => items.find((i) => i.asked === r.label)?.level ?? r.status;
  return {
    items,
    points: { earned, spent, left: Math.max(0, earned - spent) },
    missing,
    power: { have: asked.filter((r) => levelOf(r) === 'have').length, total: asked.length },
  };
}

/** Whether a skill can be raised now: a point to spend, a step above, and practice written about since its last raise. */
export function canUpgrade(a: Arsenal, item: ArsenalItem): 'ok' | 'no-points' | 'top' | 'no-practice' {
  if (!item.next) return 'top';
  if (a.points.left < 1) return 'no-points';
  if (item.practice < 1) return 'no-practice';
  return 'ok';
}
