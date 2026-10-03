import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The built code as plain text: the replacement character (U+FFFD) that the local AI's tokenizer writes literally
 * in a few strings is written as its escape instead, which means the same and survives any text pipeline.
 */
const escapeReplacementChar = (): Plugin => ({
  name: 'escape-replacement-char',
  // After minifying, which writes the character back.
  generateBundle: {
    order: 'post',
    handler(_, bundle) {
      for (const chunk of Object.values(bundle))
        if (chunk.type === 'chunk' && chunk.code.includes('\uFFFD')) chunk.code = chunk.code.replaceAll('\uFFFD', '\\uFFFD');
    },
  },
});

/** Every file under a folder, by its path relative to it (with forward slashes). */
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name],
  );

/**
 * The service worker (src/pwa/sw.js), written into the build once it is complete: with the exact files of this version
 * to keep on the device, and a version that changes whenever any of them does. Left out: the local AI's files, kept
 * only once it is turned on (its worker, the 14 MB runtime, what it learns from), and the older font format no current
 * browser asks for.
 */
const serviceWorker = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'noa-service-worker',
    apply: 'build',
    configResolved: (config) => void (outDir = config.build.outDir),
    closeBundle() {
      const keep = filesIn(outDir)
        .map((f) => f.split(sep).join('/'))
        .filter((f) => !/^sw\.js$|\.wasm$|^assets\/worker-[\w-]+\.js$|^ml\/sample\.json$|\.woff$/.test(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of keep) hash.update(f).update(readFileSync(join(outDir, f)));
      const source = readFileSync('src/pwa/sw.js', 'utf8')
        .replace('self.__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('self.__FILES__', JSON.stringify(['./', ...keep]));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
};

export default defineConfig({
  // Relative base so the static build works from any path (GitHub Pages, file hosting).
  base: './',
  plugins: [react(), tailwindcss(), escapeReplacementChar(), serviceWorker()],
  worker: { plugins: () => [escapeReplacementChar()] },
  resolve: {
    // The local AI's language model runs on the CPU (WebAssembly) only: the runtime without WebGPU is half the size
    // and comes with the app (src/ml/worker.ts), instead of from a CDN.
    alias: [{ find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' }],
  },
  build: {
    // React and React Flow make up most of the entry chunk; pages and the Claude provider are split out.
    chunkSizeWarningLimit: 600,
    // Keep third-party licence notices (/*! … */) in the built files.
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  server: {
    proxy: {
      // Optional: forwards AI requests to the local Claude proxy (npm run proxy).
      '/api/analysis': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
