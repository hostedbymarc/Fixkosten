import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hideSplash } from './lib/entrance';
import { testFlag } from './lib/importTrace';
import { initAurora } from './lib/aurora';
import { initNebel } from './lib/nebel';
import { initTheme } from './lib/theme';

initTheme();
initNebel();
initAurora();
// reference image of e2e/splash-blur.spec.ts (test build only): the app starts without the splash
if (testFlag('noSplash')) {
  document.getElementById('splash')?.remove();
  delete document.documentElement.dataset.splash;
}
// tests: this build has the Lade-Animation (older builds in the upgrade tests do not)
document.documentElement.dataset.entrance = '';
// failsafe: the splash never stays longer than 6 s, whatever happens while loading
window.setTimeout(() => void hideSplash(), 6000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
