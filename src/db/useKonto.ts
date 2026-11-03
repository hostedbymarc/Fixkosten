import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_KONTO, readKontoRaw, type KontoSettings } from './settings';

/**
 * Fixkostenkonto settings, live. `stored` = null: never touched (existing installation before the
 * update → invitation card); `undefined` while loading.
 */
export function useKonto(): { settings: KontoSettings; stored: KontoSettings | null | undefined } {
  const stored = useLiveQuery(() => readKontoRaw(db), []);
  return { settings: stored ?? DEFAULT_KONTO, stored };
}
