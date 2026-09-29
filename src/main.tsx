import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/index.css';
import { App } from './App';
import { safeLocalStorage, STORAGE_KEYS } from './persistence/storage';
import { useAtlas } from './state/atlasStore';

// Persist the sample atlas on first visit, so what the user sees is what is saved.
if (!safeLocalStorage.getItem(STORAGE_KEYS.data)) useAtlas.setState((s) => ({ data: s.data }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
