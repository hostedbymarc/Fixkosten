import { useState } from 'react';

// Appearance is a per-device preference, not part of the dataset or backups.
// The key keeps its old name on purpose: renaming it would reset the choice.
// index.html applies it before first paint (same key and attribute).

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'fixkosten-theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

/** Once at startup: apply the stored preference ("System" follows the device via CSS). */
export function initTheme() {
  applyTheme(readThemePref());
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
