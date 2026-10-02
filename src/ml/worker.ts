/// <reference lib="webworker" />
/**
 * The local AI's language model, off the main thread so typing never waits for it. It downloads a pretrained
 * multilingual sentence model once (the browser keeps it in its cache after that), turns sentences into
 * embeddings (vectors of meaning: sentences that mean the same in Indonesian or English land close together),
 * and trains the reading heads (src/ml/nn.ts) on those embeddings, here on the device, from the sample of the
 * dataset the app ships. Nothing leaves the device but the one download of the model.
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { classWeights, evaluate, Net, type Input } from './nn';
import { HEAD_NAMES, HEADS, unpack, type Packed } from './tasks';

export type ToWorker =
  { type: 'load'; model: string; host?: string } | { type: 'embed'; id: number; texts: string[] } | { type: 'learn'; id: number; sample: Packed[] };

export type FromWorker =
  | { type: 'progress'; stage: 'download' | 'learn'; fraction: number; loaded?: number; total?: number }
  | { type: 'ready'; dims: number; device: string }
  | { type: 'error'; message: string; id?: number }
  | { type: 'embedded'; id: number; dims: number; vectors: Float32Array }
  | { type: 'learned'; id: number; saved: ReturnType<Net['save']>; scores: { accuracy: number; macroF1: number }[] };

// The runtime comes with the app, next to this worker (see vite.config.ts), not from the CDN transformers.js points at.
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) onnx.wasm.wasmPaths = undefined;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

let extractor: FeatureExtractionPipeline | null = null;
let dims = 0;

async function embed(texts: string[]): Promise<Float32Array> {
  if (!extractor) throw new Error('model not loaded');
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  dims = out.dims[out.dims.length - 1];
  return out.data as Float32Array;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      env.allowLocalModels = false;
      if (msg.host) env.remoteHost = msg.host;
      extractor = await pipeline('feature-extraction', msg.model, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress_total') post({ type: 'progress', stage: 'download', fraction: p.progress / 100, loaded: p.loaded, total: p.total });
        },
      });
      await embed(['ok']);
      post({ type: 'ready', dims, device: 'wasm' });
      return;
    }
    if (msg.type === 'embed') {
      const vectors = await embed(msg.texts);
      post({ type: 'embedded', id: msg.id, dims, vectors }, [vectors.buffer]);
      return;
    }
    if (msg.type === 'learn') {
      // Embed the sample a batch at a time, saying how far it got.
      const rows = msg.sample.map(unpack);
      const xs: Input[] = [];
      for (let i = 0; i < rows.length; i += 32) {
        const flat = await embed(rows.slice(i, i + 32).map((r) => r.text));
        for (let j = 0; j * dims < flat.length; j++) xs.push(flat.slice(j * dims, (j + 1) * dims));
        post({ type: 'progress', stage: 'learn', fraction: (0.85 * Math.min(rows.length, i + 32)) / rows.length });
      }
      const ys = rows.map((r) => HEAD_NAMES.map((h) => (HEADS[h] as readonly string[]).indexOf(r.labels[h])));
      // A tenth kept aside, to stop at the best and to say honestly how well it reads.
      const val = { xs: xs.filter((_, i) => i % 10 === 0), ys: ys.filter((_, i) => i % 10 === 0) };
      const train = { xs: xs.filter((_, i) => i % 10 !== 0), ys: ys.filter((_, i) => i % 10 !== 0) };
      const heads = HEAD_NAMES.map((h) => HEADS[h].length);
      const net = new Net({ input: dims, sparse: false, hidden: 128, heads, seed: 5 });
      const score = (n: Net, x: Input[], y: number[][]) => evaluate(n, x, y).reduce((s, h) => s + h.macroF1, 0) / heads.length;
      net.train(
        train.xs,
        train.ys,
        val,
        {
          epochs: 30,
          batch: 32,
          lr: 0.003,
          dropout: 0.2,
          weightDecay: 1e-5,
          patience: 4,
          classWeights: classWeights(train.ys, heads),
          onEpoch: (epoch) => post({ type: 'progress', stage: 'learn', fraction: 0.85 + (0.15 * (epoch + 1)) / 30 }),
        },
        score,
      );
      const scores = evaluate(net, val.xs, val.ys).map(({ accuracy, macroF1 }) => ({ accuracy, macroF1 }));
      post({ type: 'learned', id: msg.id, saved: net.save({ model: 'embeddings', dims }), scores });
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error), id: 'id' in msg ? msg.id : undefined });
  }
};
