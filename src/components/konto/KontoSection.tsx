import { useKonto } from '../../db/useKonto';
import { shortPeriodLabel } from '../../lib/analytics';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { useMonthPlan } from './DeinMonatCard';
import { KontoSimulationView } from './KontoSheet';

/** Analysis section „Fixkosten einplanen“: the monthly amount, the chart and the month list of the next 12 months (mode on only, no setup progress). */
export function KontoSection({ ds, today }: { ds: Dataset; today: Period }) {
  const { settings } = useKonto();
  if (!settings.enabled) return null;
  return <KontoSectionOn ds={ds} today={today} />;
}

/**
 * The balance of the Rücklage with the chosen plan („Bei Fälligkeit“, „Gleichmäßig“, „Eigener Plan“):
 * monthPlan's simulation, the same numbers as „Dein Monat“ and „Dein Plan“.
 */
function KontoSectionOn({ ds, today }: { ds: Dataset; today: Period }) {
  const plan = useMonthPlan(ds, today);
  const state = plan.state;
  const months = plan.simulation.months;
  // „Gleichmäßig“ while an extra runs: „€ X bis {Monat}, danach € Grundbetrag“ (the last month with an extra)
  const lastExtra = plan.mode === 'even' && state.next.extra > 0 ? [...state.months].reverse().find((m) => m.extra > 0) : undefined;
  const mode = plan.mode === 'due' ? t('plan2.mode.due') : plan.mode === 'even' ? t('plan2.mode.even') : t('plan2.custom');
  return (
    <section aria-labelledby="konto-analyse-title" data-testid="konto-analyse" data-mode={plan.mode} className="min-w-0">
      <h2 id="konto-analyse-title" className="section-title px-1">
        {t('settings.title')}
      </h2>
      <p className="num mb-3 px-1 text-[12px] text-ink-mute">
        {months[0] && months[months.length - 1] ? `${shortPeriodLabel(months[0].period)} – ${shortPeriodLabel(months[months.length - 1]!.period)}` : ''}
      </p>
      <div className="glass flex min-w-0 flex-col gap-4 p-4">
        <div className="mb-1 min-w-0">
          <p className="text-[13px] font-medium text-ink-mute" data-testid="konto-analyse-mode">
            {t('plan2.title')}: {mode}
          </p>
          <p className="num text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid="konto-analyse-order">
            {lastExtra
              ? t('analyse.order.until', { betrag: formatEUR(state.next.amount), monat: monthName(lastExtra.period), basis: formatEUR(state.order) })
              : `${formatEUR(plan.first.transfer)} · ${monthName(plan.first.period)}`}
          </p>
        </div>
        <KontoSimulationView simulation={plan.simulation} active={today} buffer={plan.mode === 'even' ? state.buffer : 0} chartHeight={240} />
      </div>
    </section>
  );
}
