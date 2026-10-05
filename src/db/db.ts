import Dexie, { type EntityTable } from 'dexie';
import type {
  Category,
  ChangeLog,
  IncomeEntry,
  MetaEntry,
  OneOff,
  Payment,
  Position,
  Reminder,
} from '../lib/types';

/** Bump together with a new db.version(n) block (and an export migration). */
export const SCHEMA_VERSION = 1;

export class FixkostenDB extends Dexie {
  categories!: EntityTable<Category, 'id'>;
  positions!: EntityTable<Position, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  oneOffs!: EntityTable<OneOff, 'id'>;
  income!: EntityTable<IncomeEntry, 'validFrom'>;
  changeLog!: EntityTable<ChangeLog, 'id'>;
  reminders!: EntityTable<Reminder, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'fixkosten') {
    super(name);
    // Only indexed fields are listed; all other fields are stored as-is.
    this.version(1).stores({
      categories: 'id, sortOrder',
      positions: 'id, categoryId, sortOrder, archivedAt',
      // one tick per position and month
      payments: 'id, &[positionId+period], period, positionId',
      oneOffs: 'id, period, positionId',
      income: 'validFrom',
      changeLog: 'id, at, positionId',
      reminders: 'id, month',
      meta: 'key',
    });
  }
}

export const db = new FixkostenDB();
