import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hideSplash } from './lib/entrance';
import { initNebel } from './lib/nebel';
import { initTheme } from './lib/theme';

declare const __GLASS_DIAGNOSE__: boolean;

initTheme();
initNebel();

// Diagnose-Seite /#diagnose-glas (deploy previews only, vite.config.ts): replaces the app, nothing is stored
const diagnose = __GLASS_DIAGNOSE__ && window.location.hash === '#diagnose-glas';
if (__GLASS_DIAGNOSE__) window.addEventListener('hashchange', () => (window.location.hash === '#diagnose-glas') !== diagnose && window.location.reload());
// tests: this build has the Lade-Animation (older builds in the upgrade tests do not)
document.documentElement.dataset.entrance = '';
// failsafe: the splash never stays longer than 6 s, whatever happens while loading
window.setTimeout(() => void hideSplash(), 6000);

if (diagnose) {
  void import('./diagnose/GlassDiagnose').then(({ GlassDiagnose }) => {
    createRoot(document.getElementById('root')!).render(<GlassDiagnose />);
    void hideSplash();
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
