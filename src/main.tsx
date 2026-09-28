import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
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
