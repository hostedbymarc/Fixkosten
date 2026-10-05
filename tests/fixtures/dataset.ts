// Test-only access to the seed fixture (same content as the private seed.local.json).
// Never import this from src/ – real amounts must not end up in the app bundle.
import type { BackupFile } from '../../src/db/backup';
import type { Dataset } from '../../src/lib/types';
import seed from './seed.json';

export function fixtureBackup(): BackupFile {
  return structuredClone(seed) as unknown as BackupFile;
}

export function fixtureDataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders } = fixtureBackup().data;
  return { categories, positions, payments, oneOffs, monthClose, reminders };
}
