// Test-only: 24 months of synthetic history (scripts/make-history-fixture.mjs).
// Never import this from src/ – it must not end up in the app bundle.
import { parseBackup } from '../../src/db/backup';
import type { Dataset } from '../../src/lib/types';
import history from './history-24m.json';

export function historyDataset(): Dataset {
  const { categories, positions, payments, oneOffs, monthClose, reminders, changeLog } = parseBackup(structuredClone(history)).data;
  return { categories, positions, payments, oneOffs, monthClose, reminders, changeLog };
}
