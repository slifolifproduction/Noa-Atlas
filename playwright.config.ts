import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests (e2e/): the built app, served as it is published, in Chromium on a desktop and on a phone.
 * `npm run e2e` builds, serves and runs them. A Chromium already on the machine can be used instead of Playwright's
 * own (`npx playwright install chromium`) by setting PLAYWRIGHT_CHROMIUM_PATH.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  // A test that passes only on its second try is reported as flaky, never hidden.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    // Each test meets the app as served; the offline tests (pwa.spec.ts) let its service worker in.
    serviceWorkers: 'block',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
