// Golden fixtures: nachgebaute Beispieldaten in Export-Form (Stand 25.10. und 29.10.2026, Oktober und
// November 2026). Fiktive Namen und IDs; keine echten Daten (echte Exporte sind per .gitignore ausgeschlossen).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBackup, type BackupFile } from '../../src/db/backup';
import type { Dataset } from '../../src/lib/types';

export const LIVE_FILE = fileURLToPath(new URL('./beispiel-2026-10-25.json', import.meta.url));
export const OKT = '2026-10';
export const NOV = '2026-11';
/** „Miete Nord“: one-time payment of € 1.060 in Investieren (Vermögensaufbau), 2.10.2026 */
export const MIETE_NORD = '818b1e26-d2ca-45b1-ae6e-47ad9143b7fc';

export function liveBackup(): BackupFile {
  return parseBackup(JSON.parse(readFileSync(LIVE_FILE, 'utf8')));
}

/** Beispiel im Stand vom 29.10.2026 (golden „aktiver Monat“), ohne die Einstellung. */
export const LIVE_FILE_29 = fileURLToPath(new URL('./beispiel-2026-10-29.json', import.meta.url));

export function live29Backup(): BackupFile {
  return parseBackup(JSON.parse(readFileSync(LIVE_FILE_29, 'utf8')));
}

export function live29Dataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = live29Backup().data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

export function liveDataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = liveBackup().data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}

/** Test-only: „Miete Nord“ with the switch „Von ‚Frei verfügbar' abziehen“ off. */
export function withMieteNotFromNet<T extends { positions: Dataset['positions'] }>(data: T): T {
  return { ...data, positions: data.positions.map((p) => (p.id === MIETE_NORD ? { ...p, fromNet: false } : p)) };
}
