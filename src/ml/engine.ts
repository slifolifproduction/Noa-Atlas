/**
 * The local AI on this device: the state of its language model (downloading, learning, ready), the reading heads,
 * and the two things the rest of the app asks of it: read sentences (the five heads in tasks.ts), and say how
 * close in meaning two texts are.
 *
 * Two models read, and the better one available is used:
 *
 *   built in   the network trained by npm run ml:train on hashed words and letters (public/ml/lite.json):
 *              under a megabyte, nothing to download, reads phrasing but not meaning
 *   language   a pretrained multilingual sentence model (downloaded once, kept by the browser), with heads
 *   model      trained on its embeddings here on the device; it reads meaning, in either language, and it is
 *              what makes "close in meaning" possible at all
 *
 * Your corrections (what you said a sentence really reports) tune a copy of the heads, so the model reads more the
 * way you write. Thresholds for "close in meaning" are measured on your own atlas: the notes you linked to things
 * are what close looks like.
 */
import { create } from 'zustand';
import { featurise } from './features';
import { Net, type SavedNet } from './nn';
import { HEAD_NAMES, HEADS, type Labels, type Packed } from './tasks';
import type { FromWorker, ToWorker } from './worker';

export const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
/** What the download is, for saying so before it starts. */
export const MODEL_INFO = { id: MODEL, megabytes: 118, dims: 384 };

export type AIStatus = 'off' | 'downloading' | 'learning' | 'ready' | 'error';

export interface LocalAIState {
  status: AIStatus;
  /** 0–1 through the current stage. */
  fraction: number;
  loaded?: number;
  total?: number;
  error?: string;
  /** How the heads read the part of the sample kept aside, per head, when they were trained on the device. */
  scores?: { accuracy: number; macroF1: number }[];
  /** "Close in meaning" from here up, measured on your atlas (or the default before there is enough to measure). */
  threshold: number;
  calibratedOn?: number;
}

const DEFAULT_THRESHOLD = 0.55;
export const useLocalAI = create<LocalAIState>(() => ({ status: 'off', fraction: 0, threshold: DEFAULT_THRESHOLD }));

/* ---------------- what reads ---------------- */

interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}
let embedder: Embedder | null = null;
let heads: Net | null = null;
let lite: Net | null = null;
let litePromise: Promise<Net | null> | null = null;

/** For tests: read with a stand-in embedder and heads, or the built-in model from a file. */
export function useBackendForTests(e: Embedder | null, h: Net | null, l?: Net | null) {
  embedder = e;
  heads = h;
  if (l !== undefined) {
    lite = l;
    litePromise = Promise.resolve(l);
  }
  cache.clear();
  personal = null;
  useLocalAI.setState({ status: e ? 'ready' : 'off' });
}

async function liteNet(): Promise<Net | null> {
  if (lite) return lite;
  litePromise ??= fetch(new URL('ml/lite.json', document.baseURI))
    .then((r) => (r.ok ? r.json() : null))
    .then((saved: SavedNet | null) => (lite = saved ? Net.load(saved) : null))
    .catch(() => null);
  return litePromise;
}

/** The built-in model, and how well it read the sentences written by hand when it was trained (per head). */
export async function builtInModel(): Promise<{ trained?: string; gold?: { accuracy: number; macroF1: number }[] } | null> {
  const net = await liteNet();
  return net ? (net.meta as { trained?: string; gold?: { accuracy: number; macroF1: number }[] }) : null;
}

/** Whether "close in meaning" can be asked: only with the language model. */
export const canCompare = () => Boolean(embedder && heads);

/* ---------------- the language model, in its worker ---------------- */

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
const HEADS_KEY = `cognitive-atlas:ml-heads:${MODEL}`;

function ask<T>(msg: ToWorker & { id: number }, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    waiting.set(msg.id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage(msg, transfer);
  });
}

/**
 * Download the language model (once; the browser keeps it), then train the reading heads on its embeddings here,
 * unless they were trained before. Safe to call again: it only starts once.
 */
export function startLocalAI(opts: { host?: string } = {}) {
  const s = useLocalAI.getState();
  if (worker || s.status === 'ready') return;
  useLocalAI.setState({ status: 'downloading', fraction: 0, error: undefined });
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    useLocalAI.setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    return;
  }
  worker.onmessage = async (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'progress')
      useLocalAI.setState({ fraction: m.fraction, loaded: m.loaded, total: m.total, status: m.stage === 'learn' ? 'learning' : 'downloading' });
    else if (m.type === 'error') {
      if (m.id !== undefined && waiting.has(m.id)) {
        waiting.get(m.id)!.reject(new Error(m.message));
        waiting.delete(m.id);
      } else stopLocalAI(m.message);
    } else if (m.type === 'embedded' || m.type === 'learned') {
      waiting.get(m.id)?.resolve(m);
      waiting.delete(m.id);
    } else if (m.type === 'ready') {
      embedder = {
        embed: async (texts) => {
          const r = await ask<Extract<FromWorker, { type: 'embedded' }>>({ type: 'embed', id: nextId++, texts });
          return texts.map((_, i) => r.vectors.slice(i * r.dims, (i + 1) * r.dims));
        },
      };
      try {
        await ensureHeads();
        useLocalAI.setState({ status: 'ready', fraction: 1 });
      } catch (error) {
        stopLocalAI(error instanceof Error ? error.message : String(error));
      }
    }
  };
  worker.onerror = (e) => stopLocalAI(e.message || 'The language model could not start here.');
  worker.postMessage({ type: 'load', model: MODEL, host: opts.host } satisfies ToWorker);
}

/** Stop using the language model (the built-in one still reads). */
export function stopLocalAI(error?: string) {
  worker?.terminate();
  worker = null;
  embedder = null;
  heads = null;
  personal = null;
  for (const w of waiting.values()) w.reject(new Error(error ?? 'stopped'));
  waiting.clear();
  useLocalAI.setState({ status: error ? 'error' : 'off', error, fraction: 0 });
}

/** The heads for the language model: kept from before, or trained now on the sample the app ships. */
async function ensureHeads() {
  try {
    const kept = localStorage.getItem(HEADS_KEY);
    if (kept) {
      const { saved, scores } = JSON.parse(kept) as { saved: SavedNet; scores: LocalAIState['scores'] };
      heads = Net.load(saved);
      useLocalAI.setState({ scores });
      return;
    }
  } catch {
    // Unreadable or no storage: train again.
  }
  useLocalAI.setState({ status: 'learning', fraction: 0 });
  const sample = (await fetch(new URL('ml/sample.json', document.baseURI)).then((r) => r.json())) as Packed[];
  const r = await ask<Extract<FromWorker, { type: 'learned' }>>({ type: 'learn', id: nextId++, sample });
  heads = Net.load(r.saved);
  useLocalAI.setState({ scores: r.scores });
  try {
    localStorage.setItem(HEADS_KEY, JSON.stringify({ saved: r.saved, scores: r.scores }));
  } catch {
    // Without storage it trains again next time.
  }
}

/** Stop, and remove the download and the heads trained on this device (both come back if it is started again). */
export async function removeLocalAI() {
  stopLocalAI();
  forgetDeviceHeads();
  try {
    await caches.delete('transformers-cache');
  } catch {
    // No cache storage here: nothing was kept.
  }
}

/** Whether the language model was set up on this device before (its heads are kept). */
export function hasDeviceHeads() {
  try {
    return localStorage.getItem(HEADS_KEY) !== null;
  } catch {
    return false;
  }
}

/** Forget the heads trained on this device (they are trained again next time the model starts). */
export function forgetDeviceHeads() {
  try {
    localStorage.removeItem(HEADS_KEY);
  } catch {
    // nothing kept
  }
}

/* ---------------- embeddings ---------------- */

const cache = new Map<string, Float32Array>();
export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (!embedder) throw new Error('The language model is not ready.');
  const todo = [...new Set(texts.filter((t) => !cache.has(t)))];
  for (let i = 0; i < todo.length; i += 32) {
    const batch = todo.slice(i, i + 32);
    const vs = await embedder.embed(batch);
    batch.forEach((t, j) => cache.set(t, vs[j]));
  }
  if (cache.size > 6000) for (const k of [...cache.keys()].slice(0, 2000)) cache.delete(k);
  return texts.map((t) => cache.get(t)!);
}

/** An element as the model reads it: its name, and its summary when it has one. */
export const elementText = (label: string, summary?: string) => (summary ? `${label}: ${summary}` : label);

/** Cosine similarity (the model's vectors are normalised, but tests' may not be). */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
export function mean(vs: Float32Array[]): Float32Array {
  const out = new Float32Array(vs[0]?.length ?? 0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i] / vs.length;
  return out;
}

/* ---------------- reading ---------------- */

export interface Reading {
  text: string;
  labels: Labels;
  /** How sure it is of each head's answer (the answer's probability). */
  sure: Record<keyof Labels, number>;
  /** Which model read it. */
  by: 'lite' | 'model';
  /** The questions you corrected it on. */
  taught?: string[];
}

/** Corrections you made: [sentence, head index, class index]. */
export type Correction = [string, number, number];
let personal: { key: string; from: Net | null; lite: Net | null; model: Net | null } | null = null;

/** A copy of a model's heads tuned on your corrections (made again only when they change). */
async function tuned(corrections: Correction[]): Promise<{ lite: Net | null; model: Net | null }> {
  const base = { lite: await liteNet(), model: heads };
  if (!corrections.length) return base;
  const key = JSON.stringify(corrections);
  if (personal?.key === key && personal.from === heads) return personal;
  const ys = corrections.map(([, h, c]) => HEAD_NAMES.map((_, i) => (i === h ? c : -1)));
  const copy = (n: Net | null) => (n ? Net.load(n.save()) : null);
  const l = copy(base.lite);
  l?.tuneHeads(
    corrections.map(([text]) => featurise(text)),
    ys,
  );
  const m = copy(heads);
  if (m && embedder) m.tuneHeads(await embed(corrections.map(([text]) => text)), ys);
  personal = { key, from: heads, lite: l, model: m };
  return personal;
}

/** Read sentences: what each reports, with how sure it is of every answer. */
export async function readSentences(texts: string[], corrections: Correction[] = []): Promise<Reading[]> {
  if (!texts.length) return [];
  const nets = await tuned(corrections);
  const useModel = Boolean(nets.model && embedder);
  const vectors = useModel ? await embed(texts) : null;
  return texts.map((text, i) => {
    const net = useModel ? nets.model! : nets.lite;
    if (!net) throw new Error('No model to read with.');
    const probs = net.predict(vectors ? vectors[i] : featurise(text));
    const labels = {} as Labels;
    const sure = {} as Reading['sure'];
    HEAD_NAMES.forEach((h, k) => {
      const p = probs[k];
      let best = 0;
      for (let c = 1; c < p.length; c++) if (p[c] > p[best]) best = c;
      (labels as Record<string, string>)[h] = HEADS[h][best];
      sure[h] = p[best];
    });
    // A sentence you corrected reads as you said, whatever the model makes of it now.
    const taught: string[] = [];
    for (const [said, k, c] of corrections)
      if (said === text && HEAD_NAMES[k] && HEADS[HEAD_NAMES[k]][c] !== undefined) {
        (labels as Record<string, string>)[HEAD_NAMES[k]] = HEADS[HEAD_NAMES[k]][c];
        sure[HEAD_NAMES[k]] = 1;
        taught.push(HEAD_NAMES[k]);
      }
    return { text, labels, sure, by: useModel ? 'model' : 'lite', ...(taught.length ? { taught } : {}) };
  });
}

/* ---------------- "close in meaning", measured on your atlas ---------------- */

/**
 * The threshold above which a sentence is close in meaning to an element: the one that best separates, in your own
 * notes, the elements you linked a note to from those you did not (best F1 over a grid; the middle one, when several
 * separate as well). Before there are enough links to measure (8), the default.
 */
export async function calibrate(pairs: { sentences: string[]; label: string; linked: boolean }[]) {
  if (!canCompare() || pairs.filter((p) => p.linked).length < 8) return;
  const scores: { s: number; linked: boolean }[] = [];
  for (const p of pairs) {
    const [lv, ...sv] = await embed([p.label, ...p.sentences]);
    scores.push({ s: Math.max(...sv.map((v) => cosine(v, lv))), linked: p.linked });
  }
  const grid = Array.from({ length: 56 }, (_, i) => 0.3 + i / 100).map((t) => {
    const tp = scores.filter((x) => x.linked && x.s >= t).length;
    const fp = scores.filter((x) => !x.linked && x.s >= t).length;
    const fn = scores.filter((x) => x.linked && x.s < t).length;
    return { t, f1: tp ? (2 * tp) / (2 * tp + fp + fn) : 0 };
  });
  // Of the thresholds that separate best, the one in the middle: furthest from both kinds of mistake.
  const top = Math.max(...grid.map((g) => g.f1));
  const best = grid.filter((g) => g.f1 >= top - 1e-9);
  useLocalAI.setState({ threshold: Number(best[Math.floor(best.length / 2)].t.toFixed(2)), calibratedOn: scores.filter((x) => x.linked).length });
}
