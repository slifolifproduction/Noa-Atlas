import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests (e2e/): the built app, served as it is published, in Chromium (a desktop and a phone), Firefox and
 * WebKit, Safari's engine (a desktop and an iPhone). `npm run e2e` builds, serves and runs them all; `--project`
 * picks some (`npm run e2e -- --project=desktop --project=phone`). The browsers come with `npx playwright install`;
 * a Chromium already on the machine can be used instead by setting PLAYWRIGHT_CHROMIUM_PATH.
 */
const chromium = { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined } };
const desk = { width: 1440, height: 900 };

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
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: desk, ...chromium } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...chromium } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: desk } },
    { name: 'safari', use: { ...devices['Desktop Safari'], viewport: desk } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
