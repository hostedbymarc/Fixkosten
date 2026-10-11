import { useCallback, useEffect, useState } from 'react';

/** Collapsed category ids of the month screen; kept across month changes and reloads. */
export const COLLAPSED_KEY = 'erbse.month.collapsed';

function read(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set(); // private mode, blocked storage, broken JSON: everything expanded
  }
}

function write(key: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable: the state just isn't remembered */
  }
}

/** Per-id collapsed state in localStorage (default: expanded). */
export function useCollapsed(key = COLLAPSED_KEY) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => read(key));
  useEffect(() => write(key, collapsed), [key, collapsed]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[], value: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  return { isCollapsed: (id: string) => collapsed.has(id), toggle, setAll };
}
