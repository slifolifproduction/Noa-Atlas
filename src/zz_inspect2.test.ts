import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { createSeedData } from './data/seed';
import { claimStatus, evidenceProfile } from './domain/claims';
import { expectations, testCheck } from './domain/expect';
it('inspect', () => {
  const d = createSeedData('2026-09-28');
  const L: string[] = [];
  for (const e of expectations(d, '2026-09-30'))
    L.push(
      `${e.occurrence.id} ${e.factor} ${e.reads} ${e.from}..${e.until} basis=${e.basis.map((c) => c.id)} before=${e.writtenBefore} => ${e.verdict} by ${e.by} shown=${e.shownBy?.date}:${e.shownBy?.reads}`,
    );
  for (const x of Object.values(d.experiments)) {
    const c = testCheck(d, x, '2026-09-30');
    L.push(
      `${x.id} locked=${c.lockedBefore} extreme=${c.fromExtreme?.date}:${c.fromExtreme?.reads} window=${c.window.map((w) => `${w.factor}:${w.states.map((s) => s.reads).join('/')}`).join(' ')}`,
    );
  }
  for (const id of ['c09', 'c01', 'c13'])
    L.push(
      `${id} ${claimStatus(d, d.claims[id])} pred=${evidenceProfile(d, d.claims[id]).predictionsHeld}/${evidenceProfile(d, d.claims[id]).predictionsFailed}`,
    );
  writeFileSync('/tmp/claude-0/-home-user-slifolif-lab-03/f2a1ff21-8d39-57a7-8678-758ed33a363f/scratchpad/expect.txt', L.join('\n'));
});
