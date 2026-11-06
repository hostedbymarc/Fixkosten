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
// reference image of e2e/splash-blur.spec.ts (test build only): the app starts without the splash
if (testFlag('noSplash')) {
  document.getElementById('splash')?.remove();
  delete document.documentElement.dataset.splash;
}
// tests: this build has the Lade-Animation (older builds in the upgrade tests do not)
document.documentElement.dataset.entrance = '';
/**
 * The app's stylesheet is preloaded without blocking the first paint (vite.config.ts): the app only
 * renders once it applies, so nothing ever shows unstyled (under the start screen or after it).
 */
function appStyles(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[data-app-css]');
  const ready = () => !link || (link.rel === 'stylesheet' && !!link.sheet);
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready()) return;
      link!.removeEventListener('load', check);
      resolve();
    };
    link!.addEventListener('load', check);
    // a failed load: start anyway (the start screen's layout is inline)
    link!.addEventListener('error', () => resolve(), { once: true });
  });
}

void appStyles().then(() => {
  // background layers read their colours from the tokens of the app's stylesheet
  initNebel();
  initAurora();
  // the app has started: the logo of the static start screen starts its wave in place (index.css)
  document.getElementById('splash')?.classList.add('splash-live');
  // failsafe: once the app runs, the splash never stays longer than 6 s, whatever happens while loading
  window.setTimeout(() => void hideSplash(), 6000);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
});
