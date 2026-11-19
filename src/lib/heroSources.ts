// „Woraus du bezahlst“ in the hero: the Fixkosten of the month by what pays them (calc.costSources).
import type { CostSources } from './calc';
import { t } from './kontoTexts';

export const SOURCE_KEYS = ['reserve', 'salary'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export interface SourceRow {
  key: SourceKey;
  label: string;
  value: number;
}

/** Only sources > 0 (to the cent), in the order Rücklage, Direkt bezahlt; they add up to the Fixkosten. */
export function heroSourceRows(sources: CostSources): SourceRow[] {
  return SOURCE_KEYS.map((key) => ({ key, label: t(`hero.src.${key}`), value: sources[key] })).filter((r) => Math.round(r.value * 100) > 0);
}
