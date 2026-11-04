import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { DEFAULT_KONTO, readKontoRaw, type KontoSettings } from './settings';

/**
 * Last value read from the database. A component that mounts later (the sheet, the settings screen)
 * starts with it instead of DEFAULT_KONTO, so it never shows „einrichten“ for one frame while the tile
 * already shows the real status.
 */
let lastKnown: KontoSettings | null | undefined;

/**
 * Fixkostenkonto settings, live. `stored` = null: never touched (existing installation before the
 * update → invitation card); `undefined` while loading.
 */
export function useKonto(): { settings: KontoSettings; stored: KontoSettings | null | undefined } {
  const live = useLiveQuery(() => readKontoRaw(db), []);
  if (live !== undefined) lastKnown = live;
  const stored = live === undefined ? lastKnown : live;
  return { settings: stored ?? DEFAULT_KONTO, stored };
}
