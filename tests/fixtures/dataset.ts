// Test-only access to the seed fixture (same content as the private seed.local.json,
// schema v2 – exactly what is imported on other devices).
// Never import this from src/ – real amounts must not end up in the app bundle.
import { parseBackup, type BackupFile } from '../../src/db/backup';
import type { Dataset } from '../../src/lib/types';
import seed from './seed.json';

/** Raw file content as stored (schema v2). */
export function fixtureRaw(): typeof seed {
  return structuredClone(seed);
}

/** Fixture migrated to the current schema (same path as the import). */
export function fixtureBackup(): BackupFile {
  return parseBackup(fixtureRaw());
}

export function fixtureDataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = fixtureBackup().data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}
