import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { createSeedData } from './data/seed';
import { claimStatus, evidenceProfile } from './domain/claims';
import { caseRows, commonCauses } from './domain/compare';
import { findLoops } from './domain/loops';
import { usualLevel, coverage, episodes } from './domain/factors';
it('inspect', () => {
  const d = createSeedData('2026-09-28');
  const L: string[] = [];
  L.push(`episodes ${episodes(d).length}`);
  for (const f of ['n_energy', 'n_load', 'n_nf_progress', 'n_fragment', 'n_yes', 'n_afternoons'])
    L.push(`${f} usual=${JSON.stringify(usualLevel(d, f))} coverage=${coverage(d, f)}`);
  for (const c of Object.values(d.claims)) {
    const p = evidenceProfile(d, c);
    L.push(
      `\n${c.id} ${c.from} ${c.effect} ${c.to} => ${claimStatus(d, c)} | ep=${p.episodes} con=${p.contrast} ctr=${p.counter} mech=${p.mechanism} rec=${JSON.stringify(p.fromRecord)} conflicts=${p.conflicts} base=${JSON.stringify(p.baseRate)} anyway=${p.happensAnyway} needs=${p.needsTellingApart} told=${p.toldApart} pred=${p.predictionsHeld}/${p.predictionsFailed} commons=${commonCauses(d, c).map((x) => x.factor)}`,
    );
    for (const r of caseRows(d, c))
      L.push(
        `   ${r.verdict.padEnd(9)} ${r.cause.date} ${r.cause.factor}:${r.cause.reads}(${r.cause.basis}${r.cause.level ?? ''}) -> ${r.outcome.date} ${r.outcome.reads}(${r.outcome.basis}) ep=${r.episode} told=${r.toldApart} others=${r.others.map((o) => `${o.kind}:${o.factor}:${o.state?.reads ?? '?'}${o.explains ? '!' : ''}`).join(',')}`,
      );
  }
  L.push(
    '\nloops ' +
      findLoops(d)
        .map((l) => l.claimIds.join('>'))
        .join(' | '),
  );
  writeFileSync('/tmp/claude-0/-home-user-slifolif-lab-03/f2a1ff21-8d39-57a7-8678-758ed33a363f/scratchpad/rows.txt', L.join('\n'));
});
