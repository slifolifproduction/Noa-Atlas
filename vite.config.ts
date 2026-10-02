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

export default defineConfig({
  // Relative base so the static build works from any path (GitHub Pages, file hosting).
  base: './',
  plugins: [react(), tailwindcss(), escapeReplacementChar()],
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
  },
});
