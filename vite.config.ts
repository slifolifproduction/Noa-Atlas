import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the static build works from any path (GitHub Pages, file hosting).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // React and React Flow make up most of the entry chunk; pages and the Claude provider are split out.
    chunkSizeWarningLimit: 600,
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
