import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { todayISO, addDays } from '../lib/dates';
import { useAtlas } from '../state/atlasStore';
import { historyItems } from './history';
import { danglingReferences } from './integrity';
import { player, quests, XP } from './quests';

const atlas = () => useAtlas.getState();
const today = todayISO();

describe('quests of your own', () => {
  describe('with a plan', () => {
    beforeEach(() => atlas().replaceData(createSeedData(today)));

    it('goes into the plan as a target with its steps, and fights as a boss', () => {
      const due = addDays(today, 10);
      const id = atlas().createQuest({ title: 'Pitch deck for Marta', due, steps: ['Outline', ' ', 'Draft slides'], inPlan: true });
      const nav = atlas().data.navigation!;
      expect(nav.targets.find((x) => x.id === id)).toMatchObject({ title: 'Pitch deck for Marta', due, done: false });
      expect(nav.actions.filter((a) => a.targetId === id).map((a) => a.title)).toEqual(['Outline', 'Draft slides']);
      const boss = quests(atlas().data, today).bosses.find((b) => b.targetId === id)!;
      expect(boss).toMatchObject({ source: 'plan', hp: 3, maxHp: 3, state: 'active' });
      // Due before the milestone: it is part of the milestone's fight too.
      expect(
        quests(atlas().data, today)
          .bosses.find((b) => b.kind === 'milestone')!
          .parts.some((p) => p.id === id),
      ).toBe(true);
    });

    it('can be kept apart from the plan', () => {
      const id = atlas().createQuest({ title: 'Renew passport', due: addDays(today, 20), steps: ['Photos'], inPlan: false });
      expect(atlas().data.navigation!.targets.some((x) => x.id === id)).toBe(false);
      expect(atlas().data.quests?.own?.targets.map((x) => x.id)).toEqual([id]);
      expect(quests(atlas().data, today).bosses.find((b) => b.targetId === id)!.source).toBe('own');
    });
  });

  describe('without a plan', () => {
    beforeEach(() => atlas().replaceData(createEmptyData()));

    it('is still a boss, brought down by its steps, and counts for experience', () => {
      const id = atlas().createQuest({ title: 'Tax return', due: addDays(today, 5), steps: ['Gather receipts', 'File'], inPlan: true });
      const q = quests(atlas().data, today);
      expect(q.bosses.map((b) => b.targetId)).toEqual([id]);
      expect(q.current?.targetId).toBe(id);
      expect(q.minions).toHaveLength(2);
      const [a, b] = atlas().data.quests!.own!.actions;
      atlas().setActionStatus(a.id, 'done');
      expect(quests(atlas().data, today).current!.hp).toBe(2);
      atlas().setActionStatus(b.id, 'done');
      atlas().toggleTarget(id);
      expect(quests(atlas().data, today).bosses[0].state).toBe('defeated');
      const xp = player(atlas().data, today);
      expect(xp.sources.find((s) => s.kind === 'step')!.xp).toBe(2 * XP.step);
      expect(xp.sources.find((s) => s.kind === 'target')!.xp).toBe(XP.target);
    });

    it('shows its steps as planned on Time, and a date that passed, kept when taken on again', () => {
      const id = atlas().createQuest({ title: 'Tax return', due: addDays(today, 3), steps: ['Gather receipts'], inPlan: false });
      const planned = historyItems(atlas().data, { planned: true, today }).filter((h) => h.kind === 'step');
      expect(planned.map((h) => h.label)).toEqual(['Gather receipts']);
      expect(planned[0].route).toBe('quests');
      const later = addDays(today, 7);
      expect(historyItems(atlas().data, { quests: true, today: later }).some((h) => h.kind === 'deadline' && h.route === 'quests')).toBe(true);
      expect(quests(atlas().data, later).bosses[0].state).toBe('escaped');
      // Taken on again: the date that passed stays.
      atlas().retryDeadline(id, addDays(today, 30));
      const own = atlas().data.quests!.own!.targets[0];
      expect(own.due).toBe(addDays(today, 30));
    });

    it('goes with its steps when deleted, leaving nothing behind', () => {
      const id = atlas().createQuest({ title: 'Tax return', due: addDays(today, 3), steps: ['A', 'B'], inPlan: false });
      atlas().deleteTarget(id);
      expect(atlas().data.quests!.own).toEqual({ targets: [], actions: [] });
      expect(danglingReferences(atlas().data)).toEqual([]);
    });
  });
});
