import { useState } from 'react';

// Appearance is a per-device preference, not part of the dataset or backups.
// index.html applies it before first paint (same key and attribute).

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'fixkosten-theme';
const THEME_COLORS = { light: '#F6F6F9', dark: '#0B0B10' } as const;

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolveTheme(pref)]);
}

/** Once at startup: apply the stored preference and follow device switches for "System". */
export function initTheme() {
  applyTheme(readThemePref());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readThemePref() === 'system') applyTheme('system');
  });
}

export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  const update = (next: ThemePref) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // private mode: still applies for this session
    }
    applyTheme(next);
    setPref(next);
  };

  return [pref, update];
}
