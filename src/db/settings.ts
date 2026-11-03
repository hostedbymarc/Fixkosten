// Fixkostenkonto settings and the country: meta entries (key-value), no schema change. They
// travel with the backup under `settings` (src/db/backup.ts) only once they were set.

import { COUNTRY_KEY, isCountry, toCountry, type Country } from '../lib/country';
import { DEFAULT_ROUNDING, toRounding, type Rounding } from '../lib/fixkostenkonto';
import { isPeriod } from '../lib/period';
import type { Period } from '../lib/types';
import type { FixkostenDB } from './db';

export const KONTO_KEY = 'fixkostenkonto';

export interface KontoSettings {
  /** mode on: tile on the month screen, sheet, analysis section */
  enabled: boolean;
  /** „Später“ on the invitation card: the card does not come back (settings only) */
  inviteDismissed: boolean;
  /** „Kontostand heute“ */
  balance: number;
  /** month for which the standing order already arrived; another month = not yet */
  receivedFor: Period | null;
  rounding: Rounding;
}

export const DEFAULT_KONTO: KontoSettings = {
  enabled: false,
  inviteDismissed: false,
  balance: 0,
  receivedFor: null,
  rounding: DEFAULT_ROUNDING,
};

/** Any stored value → valid settings (unknown parts fall back to the defaults). */
export function toKontoSettings(value: unknown): KontoSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ...DEFAULT_KONTO };
  const v = value as Record<string, unknown>;
  const balance = typeof v.balance === 'number' && Number.isFinite(v.balance) ? Math.round(v.balance * 100) / 100 : 0;
  return {
    enabled: v.enabled === true,
    inviteDismissed: v.inviteDismissed === true,
    balance,
    receivedFor: typeof v.receivedFor === 'string' && isPeriod(v.receivedFor) ? v.receivedFor : null,
    rounding: toRounding(v.rounding),
  };
}

/** Stored settings, or null when the Fixkostenkonto was never touched (existing installation → invitation). */
export async function readKontoRaw(db: FixkostenDB): Promise<KontoSettings | null> {
  const entry = await db.meta.get(KONTO_KEY);
  return entry ? toKontoSettings(entry.value) : null;
}

export async function readKonto(db: FixkostenDB): Promise<KontoSettings> {
  return (await readKontoRaw(db)) ?? { ...DEFAULT_KONTO };
}

export async function writeKonto(db: FixkostenDB, patch: Partial<KontoSettings>): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const current = await readKonto(db);
    await db.meta.put({ key: KONTO_KEY, value: toKontoSettings({ ...current, ...patch }) });
  });
}

/** Stored country, or null when none was chosen (→ AT, the format the app always had). */
export async function readCountryRaw(db: FixkostenDB): Promise<Country | null> {
  const value = (await db.meta.get(COUNTRY_KEY))?.value;
  return isCountry(value) ? value : null;
}

export async function writeCountry(db: FixkostenDB, country: Country): Promise<void> {
  await db.meta.put({ key: COUNTRY_KEY, value: toCountry(country) });
}
