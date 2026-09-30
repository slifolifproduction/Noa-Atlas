import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildOrbit } from './build';
import { chainOrder, HELIX_DESKTOP, helixDrawing, helixLayout, type HelixMember } from './helix';

const member = (id: string, strand: 0 | 1 = 0): HelixMember => ({ id, strand, key: id });

describe('the Causes helix', () => {
  it('reads down a chain: each element below what may lead to it', () => {
    const { seats } = helixLayout(
      [member('c', 1), member('a'), member('b', 1)],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
      HELIX_DESKTOP,
    );
    expect(seats.get('a')!.slot).toBeLessThan(seats.get('b')!.slot);
    expect(seats.get('b')!.slot).toBeLessThan(seats.get('c')!.slot);
  });

  it('enters a cycle at its most cause-like member, so only the closing step rises', () => {
    const arrows: [string, string][] = [
      ['x', 'a'],
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ];
    expect(
      chainOrder(
        ['a', 'b', 'c', 'x'].map((id) => member(id)),
        arrows,
      )[0],
    ).toBe('x');
    const { seats } = helixLayout(
      ['a', 'b', 'c', 'x'].map((id) => member(id)),
      arrows,
      HELIX_DESKTOP,
    );
    const rising = arrows.filter(([s, t]) => seats.get(s)!.slot >= seats.get(t)!.slot);
    expect(rising).toEqual([['c', 'a']]);
  });

  it('pairs the two strands on a step only where nothing joins them', () => {
    const { seats, spec } = helixLayout([member('a'), member('b', 1), member('c')], [['a', 'c']], HELIX_DESKTOP);
    expect(seats.get('a')!.slot).toBe(seats.get('b')!.slot);
    expect(seats.get('a')!.side).not.toBe(seats.get('b')!.side);
    expect(spec.pairs).toBe(2);
  });

  it('places the example so that no two elements meet and every step but a cycle’s last goes down', () => {
    const data = createSeedData('2026-09-30');
    const built = buildOrbit(data, {
      lens: 'causes',
      stored: {},
      collapsed: new Set(),
      hiddenLayers: new Set(),
      showClaims: false,
      focus: false,
      query: '',
      today: '2026-09-30',
    });
    expect(built.nodes.filter((n) => n.type === 'hub' || n.type === 'rings')).toEqual([]);
    const items = built.nodes.filter((n) => n.type === 'item');
    expect(items.length).toBeGreaterThan(10);
    for (const a of items) for (const b of items) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThan(40);
    const slot = new Map(items.map((n) => [n.id, n.type === 'item' ? n.data.helix!.slot : 0]));
    const rising = built.edges.filter((e) => slot.get(e.source)! >= slot.get(e.target)!);
    // Rising steps close cycles, and arc outward instead of crossing the helix.
    for (const e of rising) expect(e.data!.arc).toBeTruthy();
    expect(rising.length).toBeLessThan(built.edges.length / 3);
    // The map's own arrangement is not touched: nothing on the helix is draggable.
    expect(items.every((n) => n.draggable === false)).toBe(true);
  });

  it('draws both strands and a rung per step, flat or turned', () => {
    const { spec } = helixLayout([member('a'), member('b', 1)], [], HELIX_DESKTOP);
    for (const d of [helixDrawing(spec), helixDrawing(spec, 0.3)]) {
      expect(d.front[0].length + d.back[0].length).toBeGreaterThan(0);
      expect(d.front[1].length + d.back[1].length).toBeGreaterThan(0);
      expect(d.rungs.match(/L/g)?.length).toBe(spec.pairs);
    }
  });
});
