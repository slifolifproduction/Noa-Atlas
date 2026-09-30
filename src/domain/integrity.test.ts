import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildOrbit, type CanvasLens } from '../graph/build';
import { useAtlas } from '../state/atlasStore';
import { followAtlas } from '../state/follow';
import { useUI } from '../state/uiStore';
import { areaHubId, isAreaHubId, YOU_ID } from './constants';
import { danglingReferences, repairReferences } from './integrity';
import { findLoops } from './loops';
import type { AtlasData } from './types';

const TODAY = '2026-09-28';
const atlas = () => useAtlas.getState();
const data = () => atlas().data;

/** Both lenses of the one canvas, with everything shown. */
function canvas(d: AtlasData, lens: CanvasLens) {
  return buildOrbit(d, {
    lens,
    stored: {},
    collapsed: new Set(),
    hiddenLayers: new Set(),
    showClaims: true,
    focus: false,
    query: '',
    today: TODAY,
  });
}

/** Every line on the canvas ends at something that exists, and every claim line is a claim that exists. */
function expectCanvasWhole(d: AtlasData) {
  for (const lens of ['map', 'causes'] as const) {
    const g = canvas(d, lens);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const n of g.nodes) if (n.type === 'item') expect(d.nodes[n.id], `${lens}: element ${n.id}`).toBeDefined();
    for (const e of g.edges) {
      expect(ids.has(e.source) && ids.has(e.target), `${lens}: line ${e.id}`).toBe(true);
      if (e.data?.claimId) expect(d.claims[e.data.claimId], `${lens}: claim ${e.data.claimId}`).toBeDefined();
      for (const c of e.data?.claimIds ?? []) expect(d.claims[c], `${lens}: claim ${c}`).toBeDefined();
      for (const l of e.data?.linkIds ?? []) expect(d.edges[l], `${lens}: link ${l}`).toBeDefined();
    }
  }
}

describe('referential integrity', () => {
  beforeEach(() => atlas().replaceData(createSeedData(TODAY)));

  it('the sample atlas is whole', () => {
    expect(danglingReferences(createSeedData(TODAY))).toEqual([]);
  });

  it('repairing a whole atlas changes nothing, not even references', () => {
    const seed = createSeedData(TODAY);
    const after = produce(seed, (d) => void repairReferences(d));
    expect(after).toBe(seed);
  });

  it('deleting any element removes it from every lens and leaves nothing pointing at it', () => {
    for (const id of Object.keys(createSeedData(TODAY).nodes)) {
      atlas().replaceData(createSeedData(TODAY));
      const touching = Object.values(data().claims)
        .filter((c) => c.from === id || c.to === id)
        .map((c) => c.id);
      atlas().deleteNode(id);
      const d = data();
      expect(danglingReferences(d), `after deleting ${id}`).toEqual([]);
      // Map and Causes agree: neither draws it, nor any claim about it.
      for (const lens of ['map', 'causes'] as const) {
        const g = canvas(d, lens);
        expect(g.nodes.some((n) => n.id === id)).toBe(false);
        expect(g.edges.some((e) => e.source === id || e.target === id || touching.includes(e.data?.claimId ?? ''))).toBe(false);
      }
      for (const c of touching) expect(d.claims[c]).toBeUndefined();
      expectCanvasWhole(d);
    }
  }, 30_000);

  it('deleting any claim lets go of it everywhere', () => {
    for (const id of Object.keys(createSeedData(TODAY).claims)) {
      atlas().replaceData(createSeedData(TODAY));
      atlas().deleteClaim(id);
      expect(danglingReferences(data()), `after deleting ${id}`).toEqual([]);
      expect(findLoops(data()).some((l) => l.claimIds.includes(id))).toBe(false);
      expectCanvasWhole(data());
    }
  }, 30_000);

  it('deleting any note, decision, happening, test or option leaves the atlas whole', () => {
    const seed = createSeedData(TODAY);
    const cases: [string, (id: string) => void, string[]][] = [
      ['note', (id) => atlas().deleteEntry(id), Object.keys(seed.entries)],
      ['decision', (id) => atlas().deleteDecision(id), Object.keys(seed.decisions)],
      ['happening', (id) => atlas().deleteOccurrence(id), Object.keys(seed.occurrences)],
      ['test', (id) => atlas().deleteExperiment(id), Object.keys(seed.experiments)],
      ['option', (id) => atlas().deletePath(id), Object.keys(seed.paths)],
      ['link', (id) => atlas().deleteLink(id), Object.keys(seed.edges)],
    ];
    for (const [what, remove, ids] of cases) {
      for (const id of ids) {
        atlas().replaceData(createSeedData(TODAY));
        remove(id);
        expect(danglingReferences(data()), `after deleting ${what} ${id}`).toEqual([]);
      }
    }
  }, 30_000);

  it('a note’s happenings and the evidence they gave go with the note', () => {
    const entry = Object.values(data().entries).find((e) => Object.values(data().occurrences).some((o) => o.source?.id === e.id))!;
    atlas().deleteEntry(entry.id);
    expect(Object.values(data().occurrences).some((o) => o.source?.id === entry.id)).toBe(false);
    for (const c of Object.values(data().claims)) expect(c.evidence.some((e) => e.source.id === entry.id)).toBe(false);
    for (const p of Object.values(data().patterns)) expect(p.evidence.some((e) => e.source.id === entry.id)).toBe(false);
  });

  it('a suggestion about a deleted element can no longer be accepted', () => {
    const node = Object.values(data().nodes).find((n) => n.adopted)!;
    const entry = Object.values(data().entries)[0];
    atlas().setEntryAnalysis(entry.id, {
      generatedAt: `${TODAY}T09:00:00Z`,
      provider: 'Local heuristics',
      observations: [],
      suggestions: [{ id: 's1', type: 'link_node', nodeId: node.id, reason: '', state: 'pending' }],
    });
    atlas().deleteNode(node.id);
    expect(data().entries[entry.id].analysis!.suggestions).toHaveLength(0);
  });

  it('a cycle’s name goes with its steps, and the plan with its direction', () => {
    const loop = findLoops(data())[0];
    atlas().nameLoop(loop.id, 'Mine');
    atlas().deleteClaim(loop.claimIds[0]);
    expect(data().loopNames[loop.id]).toBeUndefined();

    const plan = data().navigation!;
    atlas().deletePath(plan.pathId);
    expect(data().navigation).toBeNull();
  });

  it('renaming an element renames the pattern steps that stand for it', () => {
    const p = Object.values(data().patterns).find((x) => x.steps.some((s) => s.elementId && data().nodes[s.elementId]))!;
    const step = p.steps.find((s) => s.elementId && data().nodes[s.elementId])!;
    atlas().updateNode(step.elementId!, { label: 'Renamed thing' });
    expect(data().patterns[p.id].steps.some((s) => s.elementId === step.elementId && s.label === 'Renamed thing')).toBe(true);
  });

  it('an imported atlas with broken references is made whole on the way in', () => {
    const broken = createSeedData(TODAY);
    const claim = Object.values(broken.claims)[0];
    const path = Object.values(broken.paths)[0];
    broken.claims[claim.id] = { ...claim, from: 'gone' };
    broken.paths[path.id] = { ...path, assumptionIds: [...path.assumptionIds, 'missing'] };
    broken.entries[Object.keys(broken.entries)[0]].nodeIds.push('gone');
    expect(danglingReferences(broken).length).toBeGreaterThan(0);
    atlas().replaceData(broken);
    expect(danglingReferences(data())).toEqual([]);
    expect(data().claims[claim.id]).toBeUndefined();
  });

  it('the interface lets go of what was deleted: panel, focus, cycle, positions', () => {
    const node = Object.values(data().nodes).find((n) => n.adopted && Object.values(data().claims).some((c) => c.from === n.id))!;
    const loop = findLoops(data()).find((l) => l.nodeIds.includes(node.id));
    const keepHub = areaHubId('work');
    useUI.setState({
      inspector: [
        { kind: 'area', id: 'work' },
        { kind: 'node', id: node.id },
      ],
      focus: { kind: 'node', id: node.id },
      networkView: { ...useUI.getState().networkView, loopId: loop?.id },
      layouts: { orbit: { positions: { [node.id]: { x: 1, y: 1 }, [keepHub]: { x: 2, y: 2 }, [YOU_ID]: { x: 0, y: 0 } } }, network: { positions: {} } },
    });
    atlas().deleteNode(node.id);
    followAtlas(data());
    const ui = useUI.getState();
    expect(ui.inspector).toEqual([{ kind: 'area', id: 'work' }]);
    expect(ui.focus).toBeNull();
    expect(ui.networkView.loopId).toBeUndefined();
    expect(Object.keys(ui.layouts.orbit.positions).every((id) => id === YOU_ID || isAreaHubId(id))).toBe(true);
  });
});
