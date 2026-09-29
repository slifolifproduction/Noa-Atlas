import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/index.css';
import { App } from './App';
import { loadLanguage, useLang } from './i18n';
import { safeLocalStorage, STORAGE_KEYS } from './persistence/storage';
import { useAtlas } from './state/atlasStore';
import { startFollowingAtlas } from './state/follow';

// Persist the sample atlas on first visit, so what the user sees is what is saved.
if (!safeLocalStorage.getItem(STORAGE_KEYS.data)) useAtlas.setState((s) => ({ data: s.data }));
// The panel, the focus and the map's saved positions let go of anything the atlas no longer has.
startFollowingAtlas();

/** The whole interface is rebuilt in the new language when it changes; the atlas and UI state live in the stores and stay. */
function Root() {
  const lang = useLang();
  return <App key={lang} />;
}

// Start once the interface language is ready (Indonesian is fetched on demand).
void loadLanguage().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  ),
);
