/**
 * Installable and offline. The service worker (src/pwa/sw.js, written into the build as sw.js) keeps this version of
 * the app on the device, so it opens at once and without a connection. It is registered only in a build, and never
 * inside claude.ai, which serves the page itself. A new version waits until the person chooses to reload into it
 * (QuietNotices), so one page never mixes two versions.
 */
import { create } from 'zustand';
import { insideClaude } from '../runtime/claude';

/** What the browser offers before installing (Chrome, Edge, Android): kept, to be shown when the person asks. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Pwa {
  /** A new version, installed and waiting. */
  waiting: ServiceWorker | null;
  /** The browser's own offer to install the app, when it makes one. */
  installable: InstallPrompt | null;
  /** Opened as an installed app (from the home screen, or as its own window). */
  installed: boolean;
  online: boolean;
}

const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const usePwa = create<Pwa>(() => ({
  waiting: null,
  installable: null,
  installed: standalone(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}));

let reloadAsked = false;

export function registerServiceWorker() {
  window.addEventListener('online', () => usePwa.setState({ online: true }));
  window.addEventListener('offline', () => usePwa.setState({ online: false }));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installable: e as InstallPrompt });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installable: null, installed: true }));
  // Installed, the browser is asked once to keep what the app stores (see persistence/protect).
  if (standalone()) void navigator.storage?.persist?.().catch(() => false);

  if (!import.meta.env.PROD || insideClaude() || !('serviceWorker' in navigator)) return;
  // The new version took over because the person asked: start again in it.
  navigator.serviceWorker.addEventListener('controllerchange', () => reloadAsked && location.reload());
  void keepOnDevice();
}

async function keepOnDevice() {
  try {
    // A browser (or a policy) that refuses service workers may answer with nothing at all.
    const registration: ServiceWorkerRegistration | undefined = await navigator.serviceWorker.register('./sw.js');
    if (!registration) return;
    const ready = (worker: ServiceWorker | null) => {
      // Only an update waits for a reload; the very first version simply starts keeping the app.
      if (worker && navigator.serviceWorker.controller) usePwa.setState({ waiting: worker });
    };
    ready(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => worker.state === 'installed' && ready(worker));
    });
    // Left open for long, it looks for a newer version now and then.
    window.setInterval(() => void registration.update().catch(() => undefined), 3_600_000);
  } catch (error) {
    console.warn('[atlas] could not keep the app on this device for offline use', error);
  }
}

/** Reload into the new version that is waiting. */
export function reloadIntoNewVersion() {
  const worker = usePwa.getState().waiting;
  if (!worker) return;
  reloadAsked = true;
  worker.postMessage('take-over');
}

/** Show the browser's own install dialog, when it has offered one. */
export async function installApp() {
  const offer = usePwa.getState().installable;
  if (!offer) return;
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  usePwa.setState({ installable: null, installed: outcome === 'accepted' || usePwa.getState().installed });
}
