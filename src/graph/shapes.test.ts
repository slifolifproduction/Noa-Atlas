import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { areaHubId, ORBIT_DESKTOP, ORBIT_PORTRAIT, SECTOR_KEYS, YOU_ID } from '../domain/constants';
import { mapElements } from '../domain/selectors';
import { buildOrbit } from './build';
import { FIGURES, ZODIAC } from './constellations';
import { constellationLayout } from './shapes';

const TODAY = '2026-09-30';
const data = createSeedData(TODAY);
const hubs = [YOU_ID, ...SECTOR_KEYS.map(areaHubId)];
const opts = {
  stored: {},
  collapsed: new Set<never>(),
  hiddenLayers: new Set<never>(),
  showClaims: false,
  focus: false,
  query: '',
  today: TODAY,
};

describe('the Map as a constellation', () => {
  it('has twelve figures, each with stars inside the unit square and lines between real stars', () => {
    expect(ZODIAC).toHaveLength(12);
    for (const key of ZODIAC) {
      const f = FIGURES[key];
      expect(f.stars.length).toBeGreaterThanOrEqual(4);
      expect(f.mags).toHaveLength(f.stars.length);
      for (const [x, y] of f.stars) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(1.0001);
      for (const l of f.lines) for (const k of l) expect(f.stars[k]).toBeDefined();
    }
  });

  it.each(ZODIAC)('%s: you in the middle, each area on its own star, every element around its area', (key) => {
    const placed = constellationLayout(data, key, ORBIT_DESKTOP);
    expect(placed.positions[YOU_ID]).toEqual({ x: 0, y: 0 });
    const seats = new Set(hubs.map((id) => `${Math.round(placed.positions[id].x)},${Math.round(placed.positions[id].y)}`));
    expect(seats.size).toBe(hubs.length);
    // Every seat is a point of the figure, and has an orbit.
    for (const id of hubs) {
      const at = placed.positions[id];
      expect(placed.figure.points.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 0.01)).toBe(true);
      expect(placed.figure.orbits.some((o) => Math.hypot(o.at.x - at.x, o.at.y - at.y) < 0.01)).toBe(true);
    }
    for (const n of mapElements(data)) {
      const hub = n.area === 'self' ? YOU_ID : areaHubId(n.area);
      expect(placed.hubOf[n.id]).toBe(hub);
      const orbit = placed.figure.orbits.find((o) => o.at === placed.positions[hub])!;
      const at = placed.positions[n.id];
      expect(Math.hypot(at.x - orbit.at.x, at.y - orbit.at.y)).toBeLessThanOrEqual(orbit.r + 0.01);
    }
  });

  it('keeps areas on roughly their side of the round map', () => {
    // Over all twelve figures, most areas land within a quarter turn of where the orbit puts them.
    let near = 0;
    let all = 0;
    for (const key of ZODIAC) {
      const round = buildOrbit(data, { ...opts, shape: 'orbit' }).nodes;
      const shaped = constellationLayout(data, key, ORBIT_DESKTOP).positions;
      for (const area of SECTOR_KEYS) {
        const r = round.find((n) => n.id === areaHubId(area))!.position;
        const s = shaped[areaHubId(area)];
        const turn = Math.abs(((Math.atan2(r.y, r.x) - Math.atan2(s.y, s.x)) * 180) / Math.PI);
        if (Math.min(turn, 360 - turn) <= 90) near++;
        all++;
      }
    }
    expect(near / all).toBeGreaterThan(0.75);
  });

  it('changes where things sit and nothing else', () => {
    const before = JSON.stringify(data);
    const round = buildOrbit(data, { ...opts, essentials: false });
    const leo = buildOrbit(data, { ...opts, essentials: false, shape: 'leo' });
    expect(JSON.stringify(data)).toBe(before);
    const ids = (g: typeof round) =>
      g.nodes
        .filter((n) => n.type !== 'rings' && n.type !== 'figure')
        .map((n) => n.id)
        .sort();
    expect(ids(leo)).toEqual(ids(round));
    expect(leo.edges.map((e) => e.id).sort()).toEqual(round.edges.map((e) => e.id).sort());
    expect(leo.nodes.find((n) => n.id === '__rings')?.type).toBe('figure');
  });

  it('keeps what you dragged on a shape', () => {
    const moved = { [areaHubId('work')]: { x: 1234, y: -56 } };
    const leo = buildOrbit(data, { ...opts, shape: 'leo', stored: moved });
    expect(leo.nodes.find((n) => n.id === areaHubId('work'))!.position).toEqual({ x: 1234, y: -56 });
  });

  it('scales with the phone layout', () => {
    const wide = constellationLayout(data, 'scorpio', ORBIT_DESKTOP).positions[areaHubId('work')];
    const narrow = constellationLayout(data, 'scorpio', ORBIT_PORTRAIT).positions[areaHubId('work')];
    expect(narrow.x).toBeCloseTo(wide.x * ORBIT_PORTRAIT.scale, 5);
    expect(narrow.y).toBeCloseTo(wide.y * ORBIT_PORTRAIT.scale, 5);
  });
});
