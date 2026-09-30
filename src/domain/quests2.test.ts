import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { useAtlas } from '../state/atlasStore';
import { historyItems } from './history';
import { danglingReferences } from './integrity';
import { findLoops } from './loops';
import { ARMOR_STATUSES, armorCandidates, armorPlate, arsenal, bossArmor, canUpgrade, player, XP } from './quests';
import { patternStats } from './selectors';
import type { AtlasData } from './types';

const TODAY = '2026-09-30';
const atlas = () => useAtlas.getState();

describe('armor: what stands in a boss’s way', () => {
  const data = createSeedData(TODAY);
  const tied = data.paths[data.navigation!.pathId].patternIds[0];

  it('reads a repeat’s strength from the last eight weeks: the times it happened against the exceptions', () => {
    const p = data.patterns[tied];
    const plate = armorPlate(data, { kind: 'pattern', id: p.id }, TODAY)!;
    const recent = patternStats(data, p, TODAY).points.filter((x) => x.date >= '2026-08-05');
    const times = recent.filter((x) => x.stance === 'supports').length;
    const exceptions = recent.filter((x) => x.stance === 'counters').length;
    if (times + exceptions) expect(plate.integrity).toBeCloseTo(times / (times + exceptions));
    expect(plate.broken).toBe(plate.integrity < 0.25);
    const aside: AtlasData = { ...data, patterns: { ...data.patterns, [p.id]: { ...p, setAside: { at: TODAY } } } };
    expect(armorPlate(aside, { kind: 'pattern', id: p.id }, TODAY)).toMatchObject({ withdrawn: true, broken: false });
  });

  it('reads a cycle’s strength from its least sure step, and breaks when that step stops holding', () => {
    const loop = findLoops(data)[0];
    const plate = armorPlate(data, { kind: 'loop', id: loop.id }, TODAY)!;
    expect(plate.broken).toBe(false);
    const c = loop.claimIds[0];
    const retired: AtlasData = { ...data, claims: { ...data.claims, [c]: { ...data.claims[c], retired: { at: TODAY } } } };
    expect(findLoops(retired).some((l) => l.id === loop.id)).toBe(false);
    expect(findLoops(retired, ARMOR_STATUSES).some((l) => l.id === loop.id)).toBe(true);
    expect(armorPlate(retired, { kind: 'loop', id: loop.id }, TODAY)).toMatchObject({ broken: true, integrity: 0 });
  });

  it('offers only what still stands, the direction’s own repeats first', () => {
    const list = armorCandidates(data, 'milestone', TODAY);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => !p.broken && !p.withdrawn)).toBe(true);
    const firstUntied = list.findIndex((p) => !p.tied);
    if (firstUntied > 0) expect(list.slice(firstUntied).every((p) => !p.tied)).toBe(true);
  });

  it('counts a broken plate once for experience, however many bosses it stands before', () => {
    const loop = findLoops(data)[0];
    const c = loop.claimIds[0];
    const ref = { kind: 'loop' as const, id: loop.id };
    const broken: AtlasData = {
      ...data,
      claims: { ...data.claims, [c]: { ...data.claims[c], retired: { at: TODAY } } },
      quests: { armor: { milestone: [ref], 'target:t2': [ref] }, upgrades: [] },
    };
    const armor = player(broken, TODAY).sources.find((s) => s.kind === 'armor')!;
    expect(armor).toEqual({ kind: 'armor', count: 1, xp: XP.armor });
    const exceptions = Object.values(data.patterns).reduce((n, p) => n + p.evidence.filter((e) => e.stance === 'counters').length, 0);
    expect(player(data, TODAY).sources.find((s) => s.kind === 'exception')!.count).toBe(exceptions);
  });
});

describe('armor and skills, kept in the atlas', () => {
  beforeEach(() => atlas().replaceData(createSeedData(TODAY)));

  it('adds and removes plates, once each, and lets go of them when what they point at is gone', () => {
    const tied = atlas().data.paths[atlas().data.navigation!.pathId].patternIds[0];
    atlas().addArmor('target:t2', { kind: 'pattern', id: tied });
    atlas().addArmor('target:t2', { kind: 'pattern', id: tied });
    expect(bossArmor(atlas().data, 'target:t2', TODAY)).toHaveLength(1);
    atlas().deleteTarget('t2');
    expect(atlas().data.quests?.armor['target:t2']).toBeUndefined();
    atlas().addArmor('milestone', { kind: 'pattern', id: tied });
    atlas().removeArmor('milestone', { kind: 'pattern', id: tied });
    expect(atlas().data.quests?.armor.milestone).toBeUndefined();
    expect(danglingReferences(atlas().data)).toEqual([]);
  });

  it('raises a skill only with a point to spend and practice written about, and says so on Time', () => {
    const d = atlas().data;
    const a = arsenal(d);
    expect(a.points.earned).toBe(player(d).level - 1);
    const practised = a.items.find((i) => i.practice > 0 && i.next);
    const unpractised = a.items.find((i) => i.practice === 0 && i.next);
    if (unpractised) {
      expect(canUpgrade(a, unpractised)).toBe(a.points.left ? 'no-practice' : 'no-points');
      expect(atlas().upgradeSkill(unpractised.node.id)).toBeUndefined();
    }
    expect(practised).toBeDefined();
    const id = atlas().upgradeSkill(practised!.node.id)!;
    expect(id).toBeDefined();
    const after = atlas().data;
    expect(after.nodes[practised!.node.id].level).toBe(practised!.next);
    expect(arsenal(after).points.spent).toBe(1);
    // No more practice since the raise: it has to be practised again.
    expect(arsenal(after).items.find((i) => i.node.id === practised!.node.id)!.practice).toBe(0);
    const logged = historyItems(after, { quests: true }).find((h) => h.kind === 'levelup');
    expect(logged?.about).toEqual([practised!.node.id]);
    atlas().undoUpgrade(id);
    expect(atlas().data.nodes[practised!.node.id].level).toBe(practised!.level);
    expect(atlas().data.quests?.upgrades).toEqual([]);
  });

  it('knows which skills the direction asks for, and which are not on the map', () => {
    const d = atlas().data;
    const a = arsenal(d);
    const asked = d.paths[d.navigation!.pathId].skills;
    expect(a.power.total).toBe(asked.length);
    expect(a.items.filter((i) => i.asked).length + a.missing.length).toBe(asked.length);
  });
});
