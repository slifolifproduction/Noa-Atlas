import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { findLoops } from './loops';

describe('loops', () => {
  it('finds reinforcing and balancing loops from claims alone', () => {
    const data = createSeedData('2026-09-28');
    const loops = findLoops(data);
    const cycle = loops.find((l) => l.name === 'Overcommitment cycle');
    const brake = loops.find((l) => l.name === 'The exhaustion brake');
    expect(cycle?.type).toBe('reinforcing');
    expect(brake?.type).toBe('balancing');
    for (const l of loops) {
      expect(l.leastCertain.length).toBeGreaterThan(0);
      expect(l.nodeIds.length).toBe(l.claimIds.length);
    }
  });

  it('opens when one of its claims stops holding', () => {
    const data = createSeedData('2026-09-28');
    const cycle = findLoops(data).find((l) => l.name === 'Overcommitment cycle')!;
    data.claims[cycle.claimIds[0]].retired = { at: '2026-09-28' };
    expect(findLoops(data).some((l) => l.id === cycle.id)).toBe(false);
  });
});
