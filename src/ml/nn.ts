/**
 * A small neural network library for the local AI, in plain TypeScript with no dependencies, so the very same
 * code trains in Node (npm run ml:train) and in the browser (on the device, from your own yes and no).
 *
 * One network reads every head at once (multi-task): an input, an optional hidden layer, and a softmax output
 * for each head. The input is either dense (a sentence embedding from the language model) or sparse (hashed
 * word and letter n-grams, read as a bag of learned feature vectors, as fastText does). With no hidden layer it
 * is multinomial logistic regression, the classical machine-learning baseline; with one, it is a neural network.
 *
 * Trained with Adam on mini-batches, dropout on the hidden layer, class weights against imbalance, and early
 * stopping on a validation set. Saved with its weights quantised to 8 bits (per row), which is about a quarter
 * of the size and makes no measurable difference to what it reads.
 */

export interface NetConfig {
  /** Size of the input: the embedding's dimension, or the number of hash buckets. */
  input: number;
  sparse: boolean;
  /** Units in the hidden layer; 0 for none (logistic regression). */
  hidden: number;
  /** Number of classes in each head. */
  heads: number[];
  seed?: number;
}

/** A dense vector, or the indices of the features present (repeats count twice). */
export type Input = Float32Array | Int32Array;

export interface TrainOptions {
  epochs: number;
  batch: number;
  lr: number;
  dropout: number;
  weightDecay: number;
  /** Stop when the validation score has not improved for this many epochs, and keep the best. */
  patience: number;
  /** Per head, a weight per class (e.g. inverse frequency); 1 when missing. */
  classWeights?: number[][];
  /** Reports each epoch: return false to stop. */
  onEpoch?(epoch: number, loss: number, score: number): boolean | void;
}

const relu = (x: number) => (x > 0 ? x : 0);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(r: () => number) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Adam's moments for one tensor. */
class Moments {
  m: Float32Array;
  v: Float32Array;
  constructor(n: number) {
    this.m = new Float32Array(n);
    this.v = new Float32Array(n);
  }
}

export class Net {
  cfg: NetConfig;
  /** Input → hidden (input × hidden, row-major), and its bias. */
  W1: Float32Array;
  b1: Float32Array;
  /** Hidden (or input) → each head (inner × classes, row-major), and their biases. */
  Wh: Float32Array[];
  bh: Float32Array[];
  /** What it was saved with: how it was trained, and how well it read then. */
  meta: Record<string, unknown> = {};

  constructor(cfg: NetConfig) {
    this.cfg = cfg;
    const r = rng(cfg.seed ?? 7);
    const inner = cfg.hidden || cfg.input;
    this.W1 = new Float32Array(cfg.hidden ? cfg.input * cfg.hidden : 0);
    this.b1 = new Float32Array(cfg.hidden);
    // He initialisation for the ReLU layer; sparse rows start small, as embeddings do.
    const s1 = cfg.sparse ? 0.1 : Math.sqrt(2 / cfg.input);
    for (let i = 0; i < this.W1.length; i++) this.W1[i] = gaussian(r) * s1;
    this.Wh = cfg.heads.map((k) => {
      const w = new Float32Array(inner * k);
      const s = cfg.sparse && !cfg.hidden ? 0.01 : Math.sqrt(1 / inner);
      for (let i = 0; i < w.length; i++) w[i] = gaussian(r) * s;
      return w;
    });
    this.bh = cfg.heads.map((k) => new Float32Array(k));
  }

  get inner() {
    return this.cfg.hidden || this.cfg.input;
  }

  /** The hidden layer's pre-activations for an input (or, with no hidden layer, nothing). */
  private hiddenOf(x: Input): Float32Array {
    const { hidden, input, sparse } = this.cfg;
    const z = new Float32Array(hidden);
    z.set(this.b1);
    if (sparse) {
      const idx = x as Int32Array;
      const norm = 1 / Math.sqrt(Math.max(1, idx.length));
      for (const f of idx) {
        const row = f * hidden;
        for (let j = 0; j < hidden; j++) z[j] += this.W1[row + j] * norm;
      }
    } else {
      const v = x as Float32Array;
      for (let i = 0; i < input; i++) {
        const xi = v[i];
        if (xi === 0) continue;
        const row = i * hidden;
        for (let j = 0; j < hidden; j++) z[j] += this.W1[row + j] * xi;
      }
    }
    return z;
  }

  /** Each head's logits, from what feeds the heads (the hidden activations, or the input itself). */
  private logits(a: Input, head: number, sparseInput: boolean): Float32Array {
    const k = this.cfg.heads[head];
    const W = this.Wh[head];
    const out = new Float32Array(k);
    out.set(this.bh[head]);
    if (sparseInput) {
      const idx = a as Int32Array;
      const norm = 1 / Math.sqrt(Math.max(1, idx.length));
      for (const f of idx) for (let c = 0; c < k; c++) out[c] += W[f * k + c] * norm;
    } else {
      const v = a as Float32Array;
      for (let i = 0; i < v.length; i++) {
        const ai = v[i];
        if (ai === 0) continue;
        for (let c = 0; c < k; c++) out[c] += W[i * k + c] * ai;
      }
    }
    return out;
  }

  /** The probability of every class of every head. */
  predict(x: Input): Float32Array[] {
    const direct = !this.cfg.hidden;
    const a = direct ? x : this.hiddenOf(x).map(relu);
    return this.cfg.heads.map((_, h) => softmax(this.logits(a, h, direct && this.cfg.sparse)));
  }

  /**
   * Train on examples (inputs and, per example, the class of each head; -1 to leave a head out), checking a
   * validation set after every epoch with `score` and keeping the best weights.
   */
  train(xs: Input[], ys: number[][], val: { xs: Input[]; ys: number[][] } | null, opt: TrainOptions, score: (net: Net, xs: Input[], ys: number[][]) => number) {
    const { hidden, input, sparse, heads } = this.cfg;
    const direct = !hidden;
    const inner = this.inner;
    const r = rng((this.cfg.seed ?? 7) + 1);
    const mW1 = new Moments(this.W1.length);
    const mb1 = new Moments(this.b1.length);
    const mWh = this.Wh.map((w) => new Moments(w.length));
    const mbh = this.bh.map((b) => new Moments(b.length));
    const gW1 = new Float32Array(this.W1.length);
    const gb1 = new Float32Array(this.b1.length);
    const gWh = this.Wh.map((w) => new Float32Array(w.length));
    const gbh = this.bh.map((b) => new Float32Array(b.length));
    const b1 = 0.9;
    const b2 = 0.999;
    let step = 0;
    let best = -Infinity;
    let bestState = this.snapshot();
    let since = 0;
    const order = xs.map((_, i) => i);

    // Rows of a sparse matrix touched in this batch: only those are stepped.
    const touchedIn = new Set<number>();
    const touchedHead = heads.map(() => new Set<number>());

    const adam = (w: Float32Array, g: Float32Array, m: Moments, from: number, to: number, lr: number, decay: number) => {
      const c1 = 1 - b1 ** step;
      const c2 = 1 - b2 ** step;
      for (let i = from; i < to; i++) {
        const gi = g[i];
        m.m[i] = b1 * m.m[i] + (1 - b1) * gi;
        m.v[i] = b2 * m.v[i] + (1 - b2) * gi * gi;
        w[i] -= lr * (m.m[i] / c1 / (Math.sqrt(m.v[i] / c2) + 1e-8) + decay * w[i]);
        g[i] = 0;
      }
    };

    for (let epoch = 0; epoch < opt.epochs; epoch++) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let lossSum = 0;
      for (let start = 0; start < order.length; start += opt.batch) {
        const batch = order.slice(start, start + opt.batch);
        for (const n of batch) {
          const x = xs[n];
          const y = ys[n];
          let a: Input;
          let z: Float32Array | null = null;
          let mask: Float32Array | null = null;
          if (direct) a = x;
          else {
            z = this.hiddenOf(x);
            mask = new Float32Array(hidden);
            const keep = 1 - opt.dropout;
            for (let j = 0; j < hidden; j++) mask[j] = r() < keep ? 1 / keep : 0;
            a = z.map((v, j) => relu(v) * mask![j]);
          }
          const da = direct ? null : new Float32Array(hidden);
          heads.forEach((k, h) => {
            const target = y[h];
            if (target < 0) return;
            const p = softmax(this.logits(a, h, direct && sparse));
            const w = opt.classWeights?.[h]?.[target] ?? 1;
            lossSum += -Math.log(Math.max(1e-9, p[target])) * w;
            const d = p.map((pc, c) => (pc - (c === target ? 1 : 0)) * w);
            for (let c = 0; c < k; c++) gbh[h][c] += d[c];
            const W = this.Wh[h];
            if (direct && sparse) {
              const idx = a as Int32Array;
              const norm = 1 / Math.sqrt(Math.max(1, idx.length));
              for (const f of idx) {
                touchedHead[h].add(f);
                for (let c = 0; c < k; c++) gWh[h][f * k + c] += d[c] * norm;
              }
            } else {
              const v = a as Float32Array;
              for (let i = 0; i < inner; i++) {
                const ai = v[i];
                if (ai !== 0) for (let c = 0; c < k; c++) gWh[h][i * k + c] += ai * d[c];
                if (da) {
                  let s = 0;
                  for (let c = 0; c < k; c++) s += W[i * k + c] * d[c];
                  da[i] += s;
                }
              }
            }
          });
          if (!direct && z && mask && da) {
            const dz = da.map((g, j) => (z![j] > 0 ? g * mask![j] : 0));
            for (let j = 0; j < hidden; j++) gb1[j] += dz[j];
            if (sparse) {
              const idx = x as Int32Array;
              const norm = 1 / Math.sqrt(Math.max(1, idx.length));
              for (const f of idx) {
                touchedIn.add(f);
                const row = f * hidden;
                for (let j = 0; j < hidden; j++) gW1[row + j] += dz[j] * norm;
              }
            } else {
              const v = x as Float32Array;
              for (let i = 0; i < input; i++) {
                const xi = v[i];
                if (xi === 0) continue;
                const row = i * hidden;
                for (let j = 0; j < hidden; j++) gW1[row + j] += xi * dz[j];
              }
            }
          }
        }
        // The step: average the batch's gradients, and move only what the batch touched.
        step++;
        const scale = 1 / batch.length;
        const lr = opt.lr;
        const scaleAll = (g: Float32Array) => {
          for (let i = 0; i < g.length; i++) g[i] *= scale;
        };
        if (!direct) {
          scaleAll(gb1);
          adam(this.b1, gb1, mb1, 0, hidden, lr, 0);
          if (sparse) {
            for (const f of touchedIn) {
              for (let j = 0; j < hidden; j++) gW1[f * hidden + j] *= scale;
              adam(this.W1, gW1, mW1, f * hidden, (f + 1) * hidden, lr, opt.weightDecay);
            }
            touchedIn.clear();
          } else {
            scaleAll(gW1);
            adam(this.W1, gW1, mW1, 0, gW1.length, lr, opt.weightDecay);
          }
        }
        heads.forEach((k, h) => {
          scaleAll(gbh[h]);
          adam(this.bh[h], gbh[h], mbh[h], 0, k, lr, 0);
          if (direct && sparse) {
            for (const f of touchedHead[h]) {
              for (let c = 0; c < k; c++) gWh[h][f * k + c] *= scale;
              adam(this.Wh[h], gWh[h], mWh[h], f * k, (f + 1) * k, lr, opt.weightDecay);
            }
            touchedHead[h].clear();
          } else {
            scaleAll(gWh[h]);
            adam(this.Wh[h], gWh[h], mWh[h], 0, gWh[h].length, lr, opt.weightDecay);
          }
        });
      }
      const s = val ? score(this, val.xs, val.ys) : -lossSum;
      const stop = opt.onEpoch?.(epoch, lossSum / Math.max(1, xs.length), s) === false;
      if (s > best) {
        best = s;
        bestState = this.snapshot();
        since = 0;
      } else if (++since >= opt.patience) break;
      if (stop) break;
    }
    this.restore(bestState);
    return best;
  }

  /**
   * Fine-tune only the heads on a few examples (what you said yes or no to), keeping what the network has learned
   * underneath: a handful of plain gradient steps with a small learning rate.
   */
  tuneHeads(xs: Input[], ys: number[][], lr = 0.05, epochs = 8) {
    const direct = !this.cfg.hidden;
    for (let e = 0; e < epochs; e++)
      xs.forEach((x, n) => {
        const a = direct ? x : this.hiddenOf(x).map(relu);
        this.cfg.heads.forEach((k, h) => {
          const target = ys[n][h];
          if (target < 0) return;
          const p = softmax(this.logits(a, h, direct && this.cfg.sparse));
          const W = this.Wh[h];
          for (let c = 0; c < k; c++) {
            const d = p[c] - (c === target ? 1 : 0);
            this.bh[h][c] -= lr * d;
            if (direct && this.cfg.sparse) {
              const idx = a as Int32Array;
              const norm = 1 / Math.sqrt(Math.max(1, idx.length));
              for (const f of idx) W[f * k + c] -= lr * d * norm;
            } else {
              const v = a as Float32Array;
              for (let i = 0; i < v.length; i++) if (v[i] !== 0) W[i * k + c] -= lr * d * v[i];
            }
          }
        });
      });
  }

  private snapshot() {
    return { W1: this.W1.slice(), b1: this.b1.slice(), Wh: this.Wh.map((w) => w.slice()), bh: this.bh.map((b) => b.slice()) };
  }
  private restore(s: ReturnType<Net['snapshot']>) {
    this.W1 = s.W1;
    this.b1 = s.b1;
    this.Wh = s.Wh;
    this.bh = s.bh;
  }

  /* ---------------- saving and loading, 8-bit ---------------- */

  save(meta: Record<string, unknown> = this.meta): SavedNet {
    const rows = this.cfg.hidden || 1;
    return {
      cfg: this.cfg,
      meta,
      W1: quantise(this.W1, this.cfg.hidden ? rows : this.W1.length || 1),
      b1: Array.from(this.b1),
      Wh: this.Wh.map((w, h) => quantise(w, this.cfg.heads[h])),
      bh: this.bh.map((b) => Array.from(b)),
    };
  }

  static load(s: SavedNet): Net {
    const net = new Net({ ...s.cfg, seed: 1 });
    net.W1 = dequantise(s.W1);
    net.b1 = Float32Array.from(s.b1);
    net.Wh = s.Wh.map(dequantise);
    net.bh = s.bh.map((b) => Float32Array.from(b));
    net.meta = s.meta ?? {};
    return net;
  }
}

export function softmax(z: Float32Array): Float32Array {
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let sum = 0;
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) sum += out[i] = Math.exp(z[i] - max);
  for (let i = 0; i < z.length; i++) out[i] /= sum;
  return out;
}

/* ---------------- 8-bit tensors ---------------- */

export interface Quantised {
  /** Values per row; each row has its own scale. */
  row: number;
  scale: number[];
  /** int8 values, base64. */
  data: string;
}
export interface SavedNet {
  cfg: NetConfig;
  meta: Record<string, unknown>;
  W1: Quantised;
  b1: number[];
  Wh: Quantised[];
  bh: number[][];
}

const toBase64 = (bytes: Uint8Array): string => {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string): Uint8Array => {
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (B) return new Uint8Array(B.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

export function quantise(w: Float32Array, row: number): Quantised {
  const rows = Math.max(1, Math.ceil(w.length / row));
  const scale: number[] = [];
  const q = new Int8Array(w.length);
  for (let r = 0; r < rows; r++) {
    let max = 0;
    for (let i = r * row; i < Math.min(w.length, (r + 1) * row); i++) max = Math.max(max, Math.abs(w[i]));
    const s = max / 127 || 1;
    scale.push(Number(s.toPrecision(6)));
    for (let i = r * row; i < Math.min(w.length, (r + 1) * row); i++) q[i] = Math.round(w[i] / s);
  }
  return { row, scale, data: toBase64(new Uint8Array(q.buffer)) };
}
export function dequantise(q: Quantised): Float32Array {
  const bytes = new Int8Array(fromBase64(q.data).buffer);
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] * q.scale[Math.floor(i / q.row)];
  return out;
}

/* ---------------- how well it reads ---------------- */

export interface HeadScore {
  accuracy: number;
  macroF1: number;
  /** confusion[true][predicted] */
  confusion: number[][];
}

export function evaluate(net: Net, xs: Input[], ys: number[][]): HeadScore[] {
  return net.cfg.heads.map((k, h) => {
    const confusion = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    xs.forEach((x, n) => {
      const y = ys[n][h];
      if (y < 0) return;
      const p = net.predict(x)[h];
      let best = 0;
      for (let c = 1; c < k; c++) if (p[c] > p[best]) best = c;
      confusion[y][best]++;
    });
    return scoreOf(confusion);
  });
}

export function scoreOf(confusion: number[][]): HeadScore {
  const k = confusion.length;
  let right = 0;
  let total = 0;
  const f1s: number[] = [];
  for (let c = 0; c < k; c++) {
    const tp = confusion[c][c];
    const fn = confusion[c].reduce((s, v) => s + v, 0) - tp;
    const fp = confusion.reduce((s, row) => s + row[c], 0) - tp;
    right += tp;
    total += tp + fn;
    // A class with no examples and no predictions does not count either way.
    if (tp + fn + fp === 0) continue;
    f1s.push(tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn));
  }
  return { accuracy: total ? right / total : 0, macroF1: f1s.length ? f1s.reduce((s, v) => s + v, 0) / f1s.length : 0, confusion };
}

/** Class weights against imbalance: rarer classes count for more (inverse square root of frequency, mean 1). */
export function classWeights(ys: number[][], heads: number[]): number[][] {
  return heads.map((k, h) => {
    const counts = new Array<number>(k).fill(0);
    for (const y of ys) if (y[h] >= 0) counts[y[h]]++;
    const raw = counts.map((c) => (c ? 1 / Math.sqrt(c) : 0));
    const mean = raw.reduce((s, v) => s + v, 0) / Math.max(1, raw.filter(Boolean).length);
    return raw.map((v) => (v ? v / mean : 1));
  });
}
