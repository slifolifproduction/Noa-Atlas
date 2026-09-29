import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { rememberView, useRoute, type RouteKey } from './app/router';
import { useGlobalShortcuts } from './app/useGlobalShortcuts';
import { CaptureModal } from './components/capture/CaptureModal';
import { CommandPalette } from './components/command/CommandPalette';
import { Inspector } from './components/inspector/Inspector';
import { Guide } from './components/shell/Guide';
import { ShortcutsDialog } from './components/shell/ShortcutsDialog';
import { MobileTabBar, SubNav, TopBar } from './components/shell/TopBar';
import { Toasts } from './components/ui/Toasts';
import { StartFreshModal } from './components/versions/StartFreshModal';
import { VersionsModal } from './components/versions/VersionsModal';
import { VIEWS } from './domain/constants';
import { useInspectorWidth } from './hooks/useMediaQuery';
import { cn } from './lib/cn';
import { OrbitPage } from './pages/orbit/OrbitPage';
import { useUI } from './state/uiStore';

const DecisionsPage = lazy(() => import('./pages/decisions/DecisionsPage').then((m) => ({ default: m.DecisionsPage })));
const JournalPage = lazy(() => import('./pages/journal/JournalPage').then((m) => ({ default: m.JournalPage })));
const MindPage = lazy(() => import('./pages/mind/MindPage').then((m) => ({ default: m.MindPage })));
const NavigationPage = lazy(() => import('./pages/navigation/NavigationPage').then((m) => ({ default: m.NavigationPage })));
const PathsPage = lazy(() => import('./pages/paths/PathsPage').then((m) => ({ default: m.PathsPage })));
const PatternsPage = lazy(() => import('./pages/patterns/PatternsPage').then((m) => ({ default: m.PatternsPage })));
const QuestionsPage = lazy(() => import('./pages/questions/QuestionsPage').then((m) => ({ default: m.QuestionsPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const GRAPH_ROUTES = new Set<RouteKey>(['orbit', 'mind']);

function Page({ route }: { route: ReturnType<typeof useRoute> }): ReactNode {
  switch (route.key) {
    case 'orbit':
      return <OrbitPage />;
    case 'mind':
      return <MindPage />;
    case 'patterns':
      return <PatternsPage patternId={route.param} />;
    case 'paths':
      return <PathsPage />;
    case 'navigation':
      return <NavigationPage />;
    case 'journal':
      return <JournalPage />;
    case 'decisions':
      return <DecisionsPage />;
    case 'questions':
      return <QuestionsPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

export function App() {
  const route = useRoute();
  const inspectorOpen = useUI((s) => s.inspector.length > 0);
  const panelWidth = useInspectorWidth();
  useGlobalShortcuts();

  useEffect(() => {
    document.title = `${VIEWS[route.key].label} · Cognitive Atlas`;
    rememberView(route.key);
  }, [route.key]);

  const isGraph = GRAPH_ROUTES.has(route.key);
  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-overlay focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <TopBar active={route.key} />
      <SubNav active={route.key} />
      <main id="main" className="relative min-h-0 flex-1">
        <div
          className={cn('h-full transition-[padding] duration-200', isGraph ? 'overflow-hidden' : 'overflow-y-auto')}
          style={{ paddingRight: !isGraph && inspectorOpen ? panelWidth : 0 }}
        >
          <Suspense fallback={<div className="p-6 text-[13px] text-ink-3">Loading…</div>}>
            <Page route={route} />
          </Suspense>
        </div>
        <Inspector />
      </main>
      <MobileTabBar active={route.key} />
      <CaptureModal />
      <CommandPalette />
      <Guide />
      <VersionsModal />
      <StartFreshModal />
      <ShortcutsDialog />
      <Toasts />
    </div>
  );
}
