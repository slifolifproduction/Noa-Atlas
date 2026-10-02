/**
 * What the agent would add, as a preview the person applies, and takes back as a whole if they want.
 *
 * A change set is drafted in the person's words (element names, never ids) and checked against the atlas before
 * it is shown and again when it is applied: an element of that name already there is used, not made twice; a
 * link or reason between names that mean nothing is shown with what is wrong and left out. Applying makes
 * everything through the same store actions as the rest of the app (so the atlas stays whole), saves a version
 * first, and keeps what it made, so "Undo all" takes back exactly that. A note is applied last, so the weave can
 * connect it to what the same set just added.
 *
 * Reasons go in as what they are: a hunch, with no evidence. Saying so is not evidence (domain/claims).
 */
import { AREA_META, EFFECT_META, KIND_META, LINK_META, effectPhrase } from '../domain/constants';
import type { AtlasData, ID } from '../domain/types';
import { formatDate } from '../lib/dates';
import { createId } from '../lib/ids';
import { t, tn } from '../i18n';
import { useAtlas } from '../state/atlasStore';
import { readAndWeave } from '../state/operations';
import { saveCurrentVersion } from '../state/versionOps';
import { findElement, fold } from './refs';
import type { Change, ChangeSet, DraftChange, Lens, Made } from './types';

export const LENS_OF: Record<Change['kind'], Lens> = {
  element: 'map',
  link: 'map',
  note: 'time',
  reason: 'causes',
  repeat: 'repeats',
  option: 'ahead',
  quest: 'quests',
};
export const LENS_ORDER: Lens[] = ['map', 'time', 'causes', 'repeats', 'ahead', 'quests'];

/** A new change set, checked against the atlas. */
export function draftChanges(data: AtlasData, changes: Change[]): ChangeSet {
  return {
    id: createId('cs'),
    state: 'draft',
    items: check(
      data,
      changes.map((change) => ({ key: createId('ch'), change, include: true })),
    ),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Each part checked against the atlas and the rest of the set: what it refers to must exist (or be added by the
 * same set), and what is already there is marked as such.
 */
export function check(data: AtlasData, items: DraftChange[]): DraftChange[] {
  const adding = new Set(
    items.filter((i) => i.include && i.change.kind === 'element' && !findElement(data, i.change.label)).map((i) => fold((i.change as { label: string }).label)),
  );
  const known = (name: string) => Boolean(findElement(data, name)) || adding.has(fold(name));
  const seen = new Set<string>();
  return items.map((item) => {
    const c = item.change;
    let problem: string | undefined;
    let exists = false;
    const missing = (names: string[]) => names.filter((n) => !known(n));
    switch (c.kind) {
      case 'element': {
        if (!c.label.trim()) problem = t('It has no name.');
        else if (!KIND_META[c.element]) problem = t('“{name}” has no kind the Map knows.', { name: c.label });
        else if (!AREA_META[c.area]) problem = t('“{name}” has no area the Map knows.', { name: c.label });
        exists = Boolean(findElement(data, c.label));
        const key = `e:${fold(c.label)}`;
        if (!problem && seen.has(key)) problem = t('“{name}” is in this set twice.', { name: c.label });
        seen.add(key);
        break;
      }
      case 'link':
      case 'reason': {
        const gone = missing([c.from, c.to]);
        if (gone.length) problem = t('Nothing on your Map is called {names}.', { names: gone.map((n) => `“${n}”`).join(', ') });
        else if (fold(c.from) === fold(c.to)) problem = t('It joins “{name}” to itself.', { name: c.from });
        else if (c.kind === 'link' && !LINK_META[c.link]) problem = t('That kind of link is not one the Map draws.');
        else if (c.kind === 'reason' && !EFFECT_META[c.effect]) problem = t('That kind of effect is not one Causes knows.');
        if (!problem) {
          const a = findElement(data, c.from);
          const b = findElement(data, c.to);
          if (a && b)
            exists =
              c.kind === 'link'
                ? Object.values(data.edges).some(
                    (e) => e.type === c.link && ((e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)),
                  )
                : Object.values(data.claims).some((x) => x.from === a.id && x.to === b.id && x.effect === c.effect && x.state !== 'set_aside');
        }
        break;
      }
      case 'note':
        if (!c.content.trim()) problem = t('The note is empty.');
        else if (!ISO.test(c.date)) problem = t('The note has no date.');
        break;
      case 'repeat':
        if (c.steps.filter((s) => s.trim()).length < 2) problem = t('A repeat needs at least two steps.');
        else if (!c.observation.trim()) problem = t('Say what keeps happening.');
        break;
      case 'option':
        if (!c.title.trim()) problem = t('The option has no name.');
        exists = Object.values(data.paths).some((p) => fold(p.title) === fold(c.title));
        break;
      case 'quest':
        if (!c.title.trim()) problem = t('The quest has no name.');
        else if (!ISO.test(c.due)) problem = t('The quest has no date.');
        break;
    }
    return { ...item, problem, exists };
  });
}

/** How a part is shown in the preview: its lens, what it adds, and a detail line. */
export function describe(c: Change): { lens: Lens; title: string; detail?: string } {
  switch (c.kind) {
    case 'element':
      return {
        lens: 'map',
        title: c.label,
        detail: `${KIND_META[c.element]?.label ?? c.element} · ${AREA_META[c.area]?.label ?? c.area}${c.summary ? ` · ${c.summary}` : ''}`,
      };
    case 'link':
      return { lens: 'map', title: `${c.from} ${LINK_META[c.link]?.verb ?? '→'} ${c.to}` };
    case 'note':
      return { lens: 'time', title: c.title?.trim() || c.content.split(/(?<=[.!?])\s/)[0].slice(0, 90), detail: formatDate(c.date) };
    case 'reason':
      return {
        lens: 'causes',
        title: `${c.from} ${effectPhrase(c.effect, 'proposed')} ${c.to}`,
        detail: c.how ? `${t('How')}: ${c.how}` : t('A hunch to check, not evidence'),
      };
    case 'repeat':
      return { lens: 'repeats', title: c.steps.join(' → '), detail: c.observation };
    case 'option':
      return { lens: 'ahead', title: c.title, detail: c.objective };
    case 'quest':
      return {
        lens: 'quests',
        title: c.title,
        detail: [t('by {date}', { date: formatDate(c.due) }), c.steps.length ? tn(c.steps.length, 'one step', '{n} steps') : ''].filter(Boolean).join(' · '),
      };
  }
}

/** The parts that will be applied: included, and with nothing wrong. */
export const applicable = (set: ChangeSet) => set.items.filter((i) => i.include && !i.problem && !(i.exists && i.change.kind !== 'note'));

/**
 * Apply a change set: a version is saved first, everything is made through the store, and what was made is kept.
 * Elements first (so the rest can refer to them), the note last (so the weave can connect it to them).
 */
export async function applyChanges(set: ChangeSet): Promise<ChangeSet> {
  const atlas = useAtlas.getState;
  const items = check(atlas().data, set.items);
  const todo = applicable({ ...set, items });
  if (!todo.length) return { ...set, items };
  try {
    await saveCurrentVersion(t('Before the agent’s changes'), 'agent');
  } catch {
    // Without version storage the changes can still be taken back one by one (Undo all).
  }
  const made: Made[] = [];
  const idOf = (name: string): ID | undefined => findElement(atlas().data, name)?.id;
  const order: Change['kind'][] = ['element', 'link', 'reason', 'repeat', 'option', 'quest', 'note'];
  for (const kind of order)
    for (const { change: c } of todo.filter((i) => i.change.kind === kind)) {
      if (c.kind === 'element') {
        made.push({ kind: 'node', id: atlas().addNode({ label: c.label.trim(), kind: c.element, area: c.area, summary: c.summary?.trim() ?? '' }) });
      } else if (c.kind === 'link') {
        const [a, b] = [idOf(c.from), idOf(c.to)];
        const id = a && b ? atlas().addLink(a, b, c.link) : null;
        if (id) made.push({ kind: 'link', id });
      } else if (c.kind === 'reason') {
        const [a, b] = [idOf(c.from), idOf(c.to)];
        if (!a || !b) continue;
        const before = new Set(Object.keys(atlas().data.claims));
        const id = atlas().addClaim({ from: a, to: b, effect: c.effect, via: c.how?.trim() || undefined, author: 'inferred', state: 'adopted' });
        if (!before.has(id)) made.push({ kind: 'claim', id });
      } else if (c.kind === 'repeat') {
        const steps = c.steps.map((s) => s.trim()).filter(Boolean);
        made.push({
          kind: 'pattern',
          id: atlas().addPattern({
            kind: 'behavioral',
            steps: steps.map((label) => ({ label, elementId: idOf(label) })),
            observation: c.observation.trim(),
            triggers: steps.slice(0, 1),
            behaviors: steps.slice(1, -1),
            consequences: steps.length > 1 ? steps.slice(-1) : [],
            cues: { supports: [], counters: [] },
            areas: c.area ? [c.area] : [],
          }),
        });
      } else if (c.kind === 'option') {
        const id = atlas().addPath();
        atlas().updatePath(id, { title: c.title.trim(), objective: c.objective.trim(), summary: c.summary?.trim() ?? '' });
        made.push({ kind: 'path', id });
      } else if (c.kind === 'quest') {
        made.push({ kind: 'target', id: atlas().createQuest({ title: c.title, due: c.due, steps: c.steps, inPlan: false }) });
      } else if (c.kind === 'note') {
        const entry = atlas().addEntry({
          kind: 'journal',
          title: c.title?.trim() ?? '',
          content: c.content.trim(),
          date: c.date,
          areas: [],
          tags: [],
          nodeIds: [],
        });
        made.push({ kind: 'entry', id: entry.id });
        try {
          await readAndWeave(entry.id);
        } catch {
          // The note is kept even if it could not be read now; "Read it" in its panel tries again.
        }
      }
    }
  return { ...set, items, made, state: 'applied', appliedAt: new Date().toISOString() };
}

/** Take back everything a change set made, newest first, and what its notes connected on their own. */
export function undoChanges(set: ChangeSet): ChangeSet {
  const atlas = useAtlas.getState;
  for (const m of [...(set.made ?? [])].reverse()) {
    const d = atlas().data;
    if (m.kind === 'entry') {
      const e = d.entries[m.id];
      if (!e) continue;
      for (const part of e.woven?.parts ?? []) atlas().untie(m.id, { kind: 'part', id: part });
      if (e.woven?.decision) atlas().untie(m.id, { kind: 'decision' });
      for (const s of e.analysis?.suggestions ?? []) if (s.state === 'accepted') atlas().untie(m.id, { kind: 'suggestion', id: s.id });
      atlas().deleteEntry(m.id);
    } else if (m.kind === 'target') atlas().deleteTarget(m.id);
    else if (m.kind === 'path' && d.paths[m.id]) atlas().deletePath(m.id);
    else if (m.kind === 'pattern' && d.patterns[m.id]) atlas().deletePattern(m.id);
    else if (m.kind === 'claim' && d.claims[m.id]) atlas().deleteClaim(m.id);
    else if (m.kind === 'link' && d.edges[m.id]) atlas().deleteLink(m.id);
    else if (m.kind === 'node' && d.nodes[m.id]) atlas().deleteNode(m.id);
  }
  return { ...set, state: 'undone' };
}

/** "3 elements on the Map · 1 note on Time …": what a set adds, lens by lens. */
export function summary(set: ChangeSet): string {
  const counts = new Map<Lens, number>();
  for (const i of applicable(set)) counts.set(LENS_OF[i.change.kind], (counts.get(LENS_OF[i.change.kind]) ?? 0) + 1);
  return LENS_ORDER.filter((l) => counts.has(l))
    .map((l) => `${LENS_LABEL[l]()} ${counts.get(l)}`)
    .join(' · ');
}

export const LENS_LABEL: Record<Lens, () => string> = {
  map: () => t('Map'),
  time: () => t('Time'),
  causes: () => t('Causes'),
  repeats: () => t('Repeats'),
  ahead: () => t('Ahead'),
  quests: () => t('Quests'),
};
