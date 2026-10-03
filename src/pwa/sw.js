/*
 * Noa Atlas's service worker: it keeps this version of the app on the device, so the app opens at once, and offline.
 *
 * Written into the build by vite.config.ts (serviceWorker), which fills in the version and the exact files of this
 * version to keep. The atlas itself is not here: it lives in the browser's storage, as always.
 *
 * - The app's files are fetched once, when this version is installed, and served from here from then on.
 * - The local AI's files (its worker, its runtime, what it learns from) are kept the first time they are fetched,
 *   since it is only fetched when turned on.
 * - A new version installs in the background and waits: the page offers to reload into it (see register.ts), or it
 *   takes over once every tab of this one is closed. Two versions are never mixed in one page.
 */
const VERSION = self.__VERSION__;
const FILES = self.__FILES__;
const CACHE = `noa-atlas-${VERSION}`;
const RUNTIME = 'noa-atlas-runtime';
const PAGE = new URL('index.html', self.location).href;
// Fetched only when the local AI is turned on.
const LATER = /\/(assets\/worker-[\w-]+\.js|assets\/[\w-]+\.wasm|ml\/sample\.json)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new URL(f, self.location).href))));
});

self.addEventListener('message', (event) => {
  if (event.data === 'take-over') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('noa-atlas-') && key !== CACHE && key !== RUNTIME) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The app's page, as this version has it: it opens at once and offline, and only ever with its own files.
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(PAGE, { cacheName: CACHE, ignoreVary: true }).then((kept) => kept || fetch(request)));
    return;
  }
  event.respondWith(
    (async () => {
      // By address alone: a server may vary its answer on the Origin a module script is asked with, but these are
      // the same files of the same site either way.
      const kept = await caches.match(request, { ignoreVary: true });
      if (kept) return kept;
      const response = await fetch(request);
      if (response.ok && LATER.test(url.pathname)) (await caches.open(RUNTIME)).put(request, response.clone());
      return response;
    })(),
  );
});
