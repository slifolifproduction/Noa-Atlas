import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { createEmptyData } from '../data/empty';
import { historyItems } from './history';
import { player, quests, recentPace, XP, levelFloor } from './quests';
import type { AtlasData } from './types';

const TODAY = '2026-09-30';

describe('quests: the plan as bosses', () => {
  const data = createSeedData(TODAY);
  const nav = data.navigation!;
  const q = quests(data, TODAY);

  it('makes the milestone a boss and every dated target one of its own', () => {
    expect(q.bosses.find((b) => b.kind === 'milestone')?.title).toBe(nav.milestone.title);
    expect(q.bosses.filter((b) => b.kind === 'target')).toHaveLength(nav.targets.length);
  });

  it('has exactly as much HP as is still open, skipped steps left out', () => {
    for (const b of q.bosses) {
      expect(b.maxHp).toBe(b.parts.length);
      expect(b.hp).toBe(b.parts.filter((p) => !p.done).length);
      expect(b.parts.some((p) => nav.actions.find((a) => a.id === p.id)?.status === 'skipped')).toBe(false);
    }
    const target = q.bosses.find((b) => b.targetId === 't2')!;
    const open = nav.actions.filter((a) => a.targetId === 't2' && a.status === 'todo').length;
    expect(target.hp).toBe(open + 1);
  });

  it('knows which bosses fell, which still stand and which got away', () => {
    expect(q.bosses.find((b) => b.targetId === 't1')!.state).toBe('defeated');
    expect(q.bosses.find((b) => b.targetId === 't2')!.state).toBe('active');
    const late = quests(data, '2026-10-20');
    expect(late.bosses.find((b) => b.targetId === 't2')!.state).toBe('escaped');
    expect(late.bosses.find((b) => b.targetId === 't2')!.daysLeft).toBeLessThan(0);
  });

  it('faces the nearest date first, and this week’s open steps are the minions', () => {
    const standing = q.bosses.filter((b) => b.state === 'active').map((b) => b.due);
    expect(q.current!.due).toBe([...standing].sort()[0]);
    expect(q.minions.every((m) => nav.actions.find((a) => a.id === m.id)!.status === 'todo')).toBe(true);
  });

  it('forecasts from the pace of the last four weeks, and says nothing without one', () => {
    const pace = recentPace(data, TODAY);
    expect(pace).toBeGreaterThan(0);
    const b = q.current!;
    expect(b.forecast.eta! >= TODAY).toBe(true);
    expect(b.forecast.inTime).toBe(b.forecast.eta! <= b.due);
    const idle: AtlasData = {
      ...data,
      navigation: { ...nav, actions: nav.actions.map((a) => ({ ...a, status: a.status === 'done' ? ('todo' as const) : a.status })) },
    };
    expect(quests(idle, TODAY).current!.forecast.eta).toBeUndefined();
  });

  it('has no bosses without a plan', () => {
    expect(quests(createEmptyData(), TODAY).bosses).toEqual([]);
  });
});

describe('experience from what really happened', () => {
  const data = createSeedData(TODAY);
  const me = player(data, TODAY);

  it('adds up what the atlas already holds, each kind at its worth', () => {
    const steps = data.navigation!.actions.filter((a) => a.status === 'done').length;
    expect(me.sources.find((s) => s.kind === 'step')).toEqual({ kind: 'step', count: steps, xp: steps * XP.step });
    const days = new Set(Object.values(data.entries).map((e) => e.date)).size;
    expect(me.sources.find((s) => s.kind === 'note')!.count).toBe(days);
    expect(me.xp).toBe(me.sources.reduce((s, x) => s + x.xp, 0));
  });

  it('sits between the floor of its level and the next', () => {
    expect(me.xp).toBeGreaterThanOrEqual(me.floor);
    expect(me.xp).toBeLessThan(me.next);
    expect(levelFloor(1)).toBe(0);
    expect(player(createEmptyData(), TODAY)).toMatchObject({ xp: 0, level: 1 });
  });

  it('grows when a step is finished, and only then', () => {
    const nav = data.navigation!;
    const open = nav.actions.find((a) => a.status === 'todo')!;
    const after: AtlasData = { ...data, navigation: { ...nav, actions: nav.actions.map((a) => (a.id === open.id ? { ...a, status: 'done' as const } : a)) } };
    expect(player(after, TODAY).xp - me.xp).toBe(XP.step);
    const skipped: AtlasData = {
      ...data,
      navigation: { ...nav, actions: nav.actions.map((a) => (a.id === open.id ? { ...a, status: 'skipped' as const } : a)) },
    };
    expect(player(skipped, TODAY).xp).toBe(me.xp);
  });
});

describe('a boss that got away, on Time', () => {
  const data = createSeedData(TODAY);
  const nav = data.navigation!;

  it('is not there while its date is still ahead', () => {
    expect(historyItems(data, { quests: true, today: TODAY }).some((h) => h.kind === 'deadline')).toBe(false);
  });

  it('appears once the date passes with something open, with how far it had got', () => {
    const later = historyItems(data, { quests: true, today: '2026-10-20' }).filter((h) => h.kind === 'deadline');
    const t2 = quests(data, '2026-10-20').bosses.find((b) => b.targetId === 't2')!;
    const item = later.find((h) => h.key === 'deadline:target:t2')!;
    expect(item.date).toBe(t2.due);
    expect(item.label).toContain(`${t2.maxHp - t2.hp}`);
    // Never evidence: only asked for on Time.
    expect(historyItems(data, { today: '2026-10-20' }).some((h) => h.kind === 'deadline')).toBe(false);
  });

  it('keeps the date that passed when a new one is set', () => {
    const t2 = nav.targets.find((x) => x.id === 't2')!;
    const moved: AtlasData = {
      ...data,
      navigation: { ...nav, targets: nav.targets.map((x) => (x.id === 't2' ? { ...x, due: '2026-11-15', missed: [{ due: t2.due, done: 1, total: 4 }] } : x)) },
    };
    const items = historyItems(moved, { quests: true, today: '2026-10-20' }).filter((h) => h.kind === 'deadline');
    expect(items.some((h) => h.date === t2.due && h.label.includes('1') && h.label.includes('4'))).toBe(true);
    expect(quests(moved, '2026-10-20').bosses.find((b) => b.targetId === 't2')!.state).toBe('active');
  });
});
