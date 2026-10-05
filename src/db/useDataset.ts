import { useLiveQuery } from 'dexie-react-hooks';
import type { Dataset } from '../lib/types';
import { db } from './db';
import { loadDataset } from './repo';

/** Live snapshot of the whole dataset; undefined while loading. */
export function useDataset(): Dataset | undefined {
  return useLiveQuery(() => loadDataset(db), []);
}
