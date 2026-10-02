import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { featurise } from './features';
import { dequantise, evaluate, Net, quantise, type SavedNet } from './nn';
import { HEAD_NAMES, HEADS } from './tasks';

describe('the neural network', () => {
  it('learns what no straight line can (XOR) with a hidden layer, and only then', () => {
    const xs = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ].map((v) => Float32Array.from(v));
    const ys = [[0], [1], [1], [0]];
    const all = { xs: [...xs, ...xs, ...xs, ...xs], ys: [...ys, ...ys, ...ys, ...ys] };
    const score = (n: Net) => evaluate(n, xs, ys)[0].accuracy;
    const deep = new Net({ input: 2, sparse: false, hidden: 16, heads: [2], seed: 3 });
    deep.train(all.xs, all.ys, null, { epochs: 400, batch: 4, lr: 0.03, dropout: 0, weightDecay: 0, patience: 1000 }, () => 0);
    expect(score(deep)).toBe(1);
    const flat = new Net({ input: 2, sparse: false, hidden: 0, heads: [2], seed: 3 });
    flat.train(all.xs, all.ys, null, { epochs: 400, batch: 4, lr: 0.03, dropout: 0, weightDecay: 0, patience: 1000 }, () => 0);
    expect(score(flat)).toBeLessThan(1);
  });

  it('keeps its weights within a hundred-and-twenty-seventh of the largest in each row when saved in 8 bits', () => {
    const w = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i) * (1 + (i % 7)));
    const back = dequantise(quantise(w, 8));
    for (let r = 0; r < 8; r++) {
      const row = w.slice(r * 8, r * 8 + 8);
      const max = Math.max(...row.map(Math.abs));
      for (let i = 0; i < 8; i++) expect(Math.abs(back[r * 8 + i] - row[i])).toBeLessThanOrEqual(max / 127 / 2 + 1e-6);
    }
  });
});

describe('the built-in model the app ships', () => {
  const saved = JSON.parse(readFileSync(join(__dirname, '../../public/ml/lite.json'), 'utf8')) as SavedNet;
  const net = Net.load(saved);
  const read = (text: string) => {
    const p = net.predict(featurise(text));
    return Object.fromEntries(HEAD_NAMES.map((h, i) => [h, HEADS[h][p[i].indexOf(Math.max(...p[i]))]]));
  };

  it('reads what a sentence reports, in Indonesian and English', () => {
    expect(read('Akhirnya laporan udah kukirim ke klien.').act).toBe('done');
    expect(read('Finally sent the invoice to Marta.').act).toBe('done');
    expect(read('Besok harus siapin presentasi.').act).toBe('planned');
    expect(read('I decided to turn down the agency job.').act).toBe('decided');
    expect(read('Energi turun drastis minggu ini.').direction).toBe('down');
    expect(read('Capek banget karena lembur terus.').cause).toBe('yes');
    expect(read('Capek banget karena lembur terus.').mood).toBe('low');
  });

  it('says how well it read the hand-written gold set when it was trained', () => {
    const gold = saved.meta.gold as { macroF1: number }[];
    expect(gold).toHaveLength(5);
    for (const g of gold) expect(g.macroF1).toBeGreaterThan(0.6);
  });
});
