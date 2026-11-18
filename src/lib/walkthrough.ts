// „So funktioniert Erbse“: the five cards of the walkthrough, as data. Every number comes from
// kontoState (no own arithmetic); without a setup of „Fixkosten einplanen“ the cards show fixed example
// numbers and say so („Beispiel“). The texts live in kontoTexts.ts (Du-Form, at most 12 words).
import type { MonthStart } from './activeMonth';
import { formatEUR } from './format';
import type { KontoState } from './kontoBalance';
import { t } from './kontoTexts';
import { dayLabel, deadlinePassed, reasonText } from './kontoWords';
import { addPeriods, monthName } from './period';
import { isActiveInPeriod } from './calc';
import { accountOf } from './fixkostenkonto';
import type { Dataset, Period } from './types';

export const WALK_CARDS = 5;

export interface WalkBar {
  period: Period;
  /** every bill of the month on the Fixkostenkonto (KontoMonth.bills) */
  amount: number;
}

export interface Walkthrough {
  /** example numbers (not set up): the cards carry the chip „Beispiel“ */
  example: boolean;
  /** card 1 and 2: the bills of the 12 months from the active one on */
  bars: WalkBar[];
  /** the dearest and the cheapest month (the first one on a tie) */
  maxIndex: number;
  minIndex: number;
  /** card 2: the base amount (Grundbetrag), the line across the bars */
  base: number;
  /** the text of each card (card 3 is the same for everyone) */
  card1: string;
  /** card 1: „{n} Posten zahlst du direkt.“ (positions on Gehalt or Spielgeld); null when there are none */
  card1Direct: string | null;
  card2: string;
  /** card 4: one paragraph per sentence group; without a gap only „Bei dir reicht es schon. …“ */
  card4: string[];
  card5: string;
}

/**
 * Example numbers (no setup): fixed, never the user's. 12 months of bills, € 180 every month and three
 * big ones; base = Σ ÷ 12 to the cent (€ 298,34); a gap in the third month, spread on three deposits.
 */
export const EXAMPLE = {
  bills: [180, 180, 900, 180, 180, 420, 180, 180, 180, 640, 180, 180],
  base: 298.34,
  gapIndex: 2,
  gapBills: ['Kfz-Versicherung', 'Haushaltsversicherung'],
  extra: 121.66,
} as const;

const firstIndex = (values: number[], pick: (a: number, b: number) => boolean) =>
  values.reduce((best, v, i) => (pick(v, values[best]!) ? i : best), 0);

/** The day of the monthly question: „1.“, „25.“, „Monatsletzten“ (from „Neuer Monat beginnt am“). */
export function askDay(start: MonthStart): string {
  return start === 'last' ? 'Monatsletzten' : `${start}.`;
}

/**
 * The cards from the stored state (`state` null or not set up: the example). `active` names the months
 * of the example; `today` only for the date of a one-time amount („bis 31. Jänner“).
 */
export function walkthrough(state: KontoState | null, active: Period, start: MonthStart, today?: Date, direct = 0): Walkthrough {
  const example = !state || !state.setupDone;
  const bars: WalkBar[] = example
    ? EXAMPLE.bills.map((amount, i) => ({ period: addPeriods(active, i), amount }))
    : state.overview.simulation.months.map((m) => ({ period: m.period, amount: m.bills }));
  const amounts = bars.map((b) => b.amount);
  const maxIndex = firstIndex(amounts, (a, b) => a > b);
  const minIndex = firstIndex(amounts, (a, b) => a < b);
  const base = example ? EXAMPLE.base : state.order;
  const card1 = t('walk.1.text', {
    teuer: monthName(bars[maxIndex]!.period),
    max: formatEUR(amounts[maxIndex]!),
    guenstig: monthName(bars[minIndex]!.period),
    min: formatEUR(amounts[minIndex]!),
  });
  const card2 = t('walk.2.text', { betrag: formatEUR(base) });
  const card4 = example ? exampleGap(active) : gapCard(state, start, today);
  const card5 = t('walk.5.text', { tag: askDay(start) });
  const card1Direct = !example && direct > 0 ? t('walk.1.direct', { n: direct }) : null;
  return { example, bars, maxIndex, minIndex, base, card1, card1Direct, card2, card4, card5 };
}

function exampleGap(active: Period): string[] {
  const [a, b] = EXAMPLE.gapBills;
  return [
    `${t('reason.bills', { monat: monthName(addPeriods(active, EXAMPLE.gapIndex)), rechnungen: `${a} und ${b}` })} ${t('walk.4.notFull')}`,
    `${t('walk.4.spread', { betrag: formatEUR(EXAMPLE.extra) })} ${t('walk.4.once')}`,
  ];
}

/** Card 4 from kontoState: the reason (as on tile and sheet), then how the gap is closed. */
function gapCard(state: KontoState, start: MonthStart, today?: Date): string[] {
  if (state.gap <= 0 || !state.mode) return [t('walk.4.none')];
  const reason = reasonText(state, start, today);
  // „Diesen Monat reicht das Geld nicht.“: there is no „bis dahin“
  const now = state.gapFrom === state.months[0]?.period;
  const plan =
    state.mode === 'spread'
      ? t('walk.4.spread', { betrag: formatEUR(state.extra) })
      : deadlinePassed(state.gapBy, today)
        ? t('walk.4.lump.now', { betrag: formatEUR(state.lump) })
        : t('walk.4.lump', { betrag: formatEUR(state.lump), datum: dayLabel(state.gapBy!, today) });
  return [now ? reason : `${reason} ${t('walk.4.notFull')}`, `${plan} ${t('walk.4.once')}`];
}

/** Positions paid straight from the salary or from the Spielgeld (active in `active`, Fixkosten only): „{n} Posten zahlst du direkt.“ */
export function directCount(ds: Dataset, active: Period): number {
  return ds.positions.filter((p) => {
    const kind = ds.categories.find((c) => c.id === p.categoryId)?.kind;
    return kind === 'expense' && isActiveInPeriod(p, active) && accountOf(ds, p) !== 'fixkostenkonto';
  }).length;
}
