import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { rememberView, useRoute, type RouteKey } from './app/router';
import { useGlobalShortcuts } from './app/useGlobalShortcuts';
import { CaptureModal } from './components/capture/CaptureModal';
import { CommandPalette } from './components/command/CommandPalette';
import { AccountStrip } from './components/shell/AccountControls';
import { ExampleNote } from './components/shell/ExampleNote';
import { Guide } from './components/shell/Guide';
import { MobileTabBar, SubNav, TopBar } from './components/shell/TopBar';
import { Toasts } from './components/ui/Toasts';
import { ErrorBoundary } from './components/shell/ErrorBoundary';
import { QuietNotices } from './components/shell/QuietNotices';
import { StorageNotice } from './components/shell/StorageNotice';
import { VIEWS } from './domain/constants';
import { useInspectorWidth } from './hooks/useMediaQuery';
import { useLocalAIBoot } from './ml/boot';
import { useToday } from './lib/dates';
import { cn } from './lib/cn';
import { OrbitPage } from './pages/orbit/OrbitPage';
import { useAgentPanel } from './agent/panel';
import { useUI } from './state/uiStore';
import { exampleFollowsLanguage } from './state/versionOps';
import { t, useLang, type Lang } from './i18n';

const TimelinePage = lazy(() => import('./pages/timeline/TimelinePage').then((m) => ({ default: m.TimelinePage })));
const NavigationPage = lazy(() => import('./pages/navigation/NavigationPage').then((m) => ({ default: m.NavigationPage })));
const PathsPage = lazy(() => import('./pages/paths/PathsPage').then((m) => ({ default: m.PathsPage })));
const PatternsPage = lazy(() => import('./pages/patterns/PatternsPage').then((m) => ({ default: m.PatternsPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const QuestsPage = lazy(() => import('./pages/quests/QuestsPage').then((m) => ({ default: m.QuestsPage })));
// Not needed to start, so fetched the first time each is opened: the panel (fetched early, once the page is idle, so
// it opens at once), the agent and the dialogs.
const loadInspector = () => import('./components/inspector/Inspector');
const Inspector = lazy(() => loadInspector().then((m) => ({ default: m.Inspector })));
const AgentPanel = lazy(() => import('./components/agent/AgentPanel').then((m) => ({ default: m.AgentPanel })));
const VersionsModal = lazy(() => import('./components/versions/VersionsModal').then((m) => ({ default: m.VersionsModal })));
const StartFreshModal = lazy(() => import('./components/versions/StartFreshModal').then((m) => ({ default: m.StartFreshModal })));
const ReviewDialog = lazy(() => import('./components/review/ReviewDialog').then((m) => ({ default: m.ReviewDialog })));
const ShortcutsDialog = lazy(() => import('./components/shell/ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })));

/** Fetched and drawn the first time it is opened, then kept as before (a finished review is still there when reopened). */
function WhenOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null;
}

const GRAPH_ROUTES = new Set<RouteKey>(['orbit', 'network']);

function Page({ route }: { route: ReturnType<typeof useRoute> }): ReactNode {
  switch (route.key) {
    // Map and Causes are two lenses on one canvas: the map by area and layer, the causes as a helix.
    case 'orbit':
      return <OrbitPage lens="map" />;
    case 'network':
      return <OrbitPage lens="causes" />;
    case 'timeline':
      return <TimelinePage preset={route.param} />;
    case 'patterns':
      return <PatternsPage patternId={route.param} />;
    case 'paths':
      return <PathsPage />;
    case 'navigation':
      return <NavigationPage />;
    case 'quests':
      return <QuestsPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

/** The language the interface was last shown in (the app is rebuilt when it changes, so it is kept outside it). */
let shownIn: Lang | undefined;

/** An example atlas follows the interface language (see exampleFollowsLanguage); on load it is only ever reopened, never offered. */
function useExampleLanguage() {
  const lang = useLang();
  useEffect(() => {
    void exampleFollowsLanguage(lang, shownIn !== undefined && shownIn !== lang);
    shownIn = lang;
  }, [lang]);
}

export function App() {
  const route = useRoute();
  // Re-render everything when the date turns over in the chosen zone, or the zone itself changes.
  useToday();
  const inspectorOpen = useUI((s) => s.inspector.length > 0);
  const agentOpen = useAgentPanel((s) => s.open);
  const versionsOpen = useUI((s) => s.versionsOpen);
  const startFreshOpen = useUI((s) => s.startFreshOpen);
  const reviewOpen = useUI((s) => s.reviewOpen);
  const shortcutsOpen = useUI((s) => s.shortcutsOpen);
  // The panel is what is opened most: fetched as soon as the page is idle.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500));
    idle(() => void loadInspector());
  }, []);
  // What the panel shows: drawn again, if it once failed, when it shows something else.
  const panelKey = useUI((s) => JSON.stringify(s.inspector.at(-1) ?? null));
  const panelWidth = useInspectorWidth();
  useGlobalShortcuts();
  useLocalAIBoot();
  useExampleLanguage();

  useEffect(() => {
    document.title = `${VIEWS[route.key].label} · Noa Atlas`;
    rememberView(route.key);
  }, [route.key]);

  const isGraph = GRAPH_ROUTES.has(route.key);
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[2px] focus:bg-overlay focus:px-3 focus:py-2"
      >
        {t('Skip to content')}
      </a>
      <TopBar active={route.key} />
      <SubNav active={route.key} />
      <ExampleNote />
      <AccountStrip />
      <StorageNotice />
      <QuietNotices />
      <main id="main" className="relative min-h-0 flex-1">
        <div
          className={cn('h-full transition-[padding] duration-200', isGraph ? 'overflow-hidden' : 'overflow-y-auto')}
          style={{ paddingRight: !isGraph && inspectorOpen ? panelWidth : 0 }}
        >
          <ErrorBoundary where="page" resetKey={`${route.key}:${route.param ?? ''}`}>
            <Suspense fallback={<div className="p-6 text-[13px] text-ink-3">{t('Loading…')}</div>}>
              <Page route={route} />
            </Suspense>
          </ErrorBoundary>
        </div>
        <ErrorBoundary where="panel" resetKey={panelKey}>
          <WhenOpen open={inspectorOpen}>
            <Inspector />
          </WhenOpen>
        </ErrorBoundary>
      </main>
      <MobileTabBar active={route.key} />
      <CaptureModal />
      <CommandPalette />
      <Guide />
      <WhenOpen open={versionsOpen}>
        <VersionsModal />
      </WhenOpen>
      <WhenOpen open={startFreshOpen}>
        <StartFreshModal />
      </WhenOpen>
      <WhenOpen open={reviewOpen}>
        <ReviewDialog />
      </WhenOpen>
      <WhenOpen open={agentOpen}>
        <AgentPanel />
      </WhenOpen>
      <WhenOpen open={shortcutsOpen}>
        <ShortcutsDialog />
      </WhenOpen>
      <Toasts />
    </div>
  );
}
