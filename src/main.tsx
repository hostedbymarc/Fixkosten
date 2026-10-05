import '@fontsource-variable/inter';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { db } from './db/db';
import { ensureSeeded } from './db/repo';

async function start() {
  try {
    await ensureSeeded(db);
  } catch (err) {
    console.error('Seed import failed', err);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
