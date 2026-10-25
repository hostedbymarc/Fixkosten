// Golden fixtures from your live export of 25.10.2026 (Oktober and November 2026).
// The export is copied unchanged; the switch variant only exists here, never in your data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBackup, type BackupFile } from '../../src/db/backup';
import type { Dataset } from '../../src/lib/types';

export const LIVE_FILE = fileURLToPath(new URL('./live-2026-10-25.json', import.meta.url));
export const OKT = '2026-10';
export const NOV = '2026-11';
/** „Miete Nord“: one-time payment of € 1.060 in Investieren (Vermögensaufbau), 2.10.2026 */
export const MIETE_NORD = '818b1e26-d2ca-45b1-ae6e-47ad9143b7fc';

export function liveBackup(): BackupFile {
  return parseBackup(JSON.parse(readFileSync(LIVE_FILE, 'utf8')));
}

export function liveDataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = liveBackup().data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

/** Test-only: „Miete Nord“ with the switch „Von ‚Frei verfügbar' abziehen“ off. */
export function withMieteNotFromNet<T extends { positions: Dataset['positions'] }>(data: T): T {
  return { ...data, positions: data.positions.map((p) => (p.id === MIETE_NORD ? { ...p, fromNet: false } : p)) };
}
