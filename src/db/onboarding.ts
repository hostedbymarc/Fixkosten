// First start on an empty database without a backup: country, templates, Fixkostenkonto on.
// Everything in ONE transaction, so the setup dialog only closes once all of it is there.

import { DEFAULT_COLOR_KEY, CATEGORY_SLOTS } from '../lib/categoryColors';
import { defaultDueMonths } from '../lib/calc';
import { COUNTRY_KEY, type Country } from '../lib/country';
import { TEMPLATE_CATEGORIES, type Template } from '../lib/templates';
import type { Period } from '../lib/types';
import { SCHEMA_VERSION, type FixkostenDB } from './db';
import { createCategory, createPosition } from './repo';
import { DEFAULT_KONTO, KONTO_KEY } from './settings';

export interface ChosenTemplate {
  template: Template;
  /** entered by the user, > 0 */
  amount: number;
  /** month 1–12 of the next due date; the rhythm's other due months follow from it */
  dueMonth: number;
}

export interface OnboardingInput {
  /** null: not chosen („Leer starten“) – the format stays AT */
  country: Country | null;
  templates: ChosenTemplate[];
  /** month the positions start in (the active month) */
  startPeriod: Period;
}

/** Creates categories and positions for the templates and turns the Fixkostenkonto on. */
export async function completeOnboarding(db: FixkostenDB, input: OnboardingInput): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    const categoryIds = new Map<string, string>();
    let color = 1;
    for (const chosen of input.templates) {
      const name = TEMPLATE_CATEGORIES[chosen.template.category];
      if (!categoryIds.has(name)) {
        const key = CATEGORY_SLOTS[color % CATEGORY_SLOTS.length]?.key ?? DEFAULT_COLOR_KEY;
        color += 1;
        categoryIds.set(name, await createCategory(db, { name, color: key, kind: 'expense' }));
      }
    }
    for (const chosen of input.templates) {
      const { template } = chosen;
      await createPosition(
        db,
        {
          name: template.name,
          categoryId: categoryIds.get(TEMPLATE_CATEGORIES[template.category])!,
          plan: { amount: chosen.amount, frequency: template.frequency, dueMonths: defaultDueMonths(template.frequency, chosen.dueMonth) },
          account: 'fixkostenkonto',
        },
        input.startPeriod,
      );
    }
    const now = new Date().toISOString();
    await db.meta.bulkPut([
      { key: 'schemaVersion', value: SCHEMA_VERSION },
      { key: 'setupCompletedAt', value: now },
      { key: KONTO_KEY, value: { ...DEFAULT_KONTO, enabled: true } },
      ...(input.country ? [{ key: COUNTRY_KEY, value: input.country }] : []),
    ]);
  });
}
