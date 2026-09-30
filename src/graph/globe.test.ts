import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildOrbit } from './build';
import { areaMeridian, GLOBE_DESKTOP, globeLayout, type GlobeMember } from './globe';

const TODAY = '2026-09-30';
const member = (id: string, lon = 0): GlobeMember => ({ id, strand: 0, key: id, lon });

describe('the Causes globe', () => {
  it('reads from north to south: each element sits south of what may lead to it', () => {
    const arrows: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
      ['x', 'c'],
    ];
    const { seats, spec } = globeLayout(
      ['a', 'b', 'c', 'x'].map((id) => member(id)),
      arrows,
      GLOBE_DESKTOP,
    );
    for (const [from, to] of arrows) expect(seats.get(from)!.slot).toBeLessThan(seats.get(to)!.slot);
    expect(spec.kind).toBe('globe');
    // Each step's parallel lies south of the one before.
    spec.bands!.forEach((lat, i) => i && expect(lat).toBeLessThan(spec.bands![i - 1]));
  });

  it('puts each element on its area’s meridian when there is room, and never outside the globe', () => {
    const { seats } = globeLayout([member('a', 1), member('b', -2), member('c', 2.5)], [], GLOBE_DESKTOP);
    expect(seats.get('a')!.phase).toBeCloseTo(1, 1);
    expect(seats.get('b')!.phase).toBeCloseTo(-2, 1);
    for (const s of seats.values()) expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(GLOBE_DESKTOP.R * 1.05);
  });

  it('keeps neighbours on a crowded parallel apart', () => {
    const { seats } = globeLayout(
      Array.from({ length: 6 }, (_, i) => member(`n${i}`, 0.5)),
      [],
      GLOBE_DESKTOP,
    );
    const phases = [...seats.values()].map((s) => s.phase).sort((a, b) => a - b);
    for (let i = 1; i < phases.length; i++) expect(phases[i] - phases[i - 1]).toBeGreaterThan(0.2);
  });

  it('turns at rest to face what is chosen, areas and all', () => {
    const members = [member('a', 1.2), member('b', -0.4)];
    const meridians = [areaMeridian(0, 7), areaMeridian(3, 7)];
    const still = globeLayout(members, [], GLOBE_DESKTOP, meridians);
    const faced = globeLayout(members, [], GLOBE_DESKTOP, meridians, 'a');
    expect(faced.seats.get('a')!.phase).toBeCloseTo(0, 6);
    expect(faced.seats.get('a')!.x).toBeCloseTo(0, 6);
    const turn = faced.spec.facing!;
    expect(turn).toBeCloseTo(-still.seats.get('a')!.phase, 6);
    const same = (a: number, b: number) => expect(Math.cos(a - b)).toBeCloseTo(1, 6);
    same(faced.seats.get('b')!.phase, still.seats.get('b')!.phase + turn);
    same(faced.spec.meridians![1], meridians[1] + turn);
  });

  it('shows the same elements and reasons as the helix, only placed differently', () => {
    const data = createSeedData(TODAY);
    const opts = {
      lens: 'causes' as const,
      stored: {},
      collapsed: new Set<never>(),
      hiddenLayers: new Set<never>(),
      showClaims: false,
      focus: false,
      query: '',
      today: TODAY,
    };
    const base = { hiddenStatuses: ['retired' as const], hiddenAreas: [], showSuggested: true, focusDepth: 0 as const };
    const helix = buildOrbit(data, { ...opts, causes: base });
    const globe = buildOrbit(data, { ...opts, causes: { ...base, shape: 'globe' } });
    const ids = (g: typeof helix) => g.nodes.map((n) => n.id).sort();
    expect(ids(globe)).toEqual(ids(helix));
    expect(globe.edges.map((e) => e.id).sort()).toEqual(helix.edges.map((e) => e.id).sort());
    const backbone = globe.nodes.find((n) => n.type === 'helix')!;
    expect(backbone.type === 'helix' && backbone.data.spec.kind).toBe('globe');
    for (const n of globe.nodes) if (n.type === 'item') expect(n.data.helix?.r).toBeGreaterThan(0);
  });
});
