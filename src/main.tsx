import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hideSplash } from './lib/entrance';
import { initNebel } from './lib/nebel';
import { initTheme } from './lib/theme';

initTheme();
initNebel();
// failsafe: the splash never stays longer than 6 s, whatever happens while loading
window.setTimeout(() => void hideSplash(), 6000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
