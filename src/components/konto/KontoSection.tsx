import { useKonto } from '../../db/useKonto';
import { shortPeriodLabel } from '../../lib/analytics';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import type { Dataset, Period } from '../../lib/types';
import { KontoSimulationView, useKontoState } from './KontoSheet';

/** Analysis section „Fixkosten einplanen“: the monthly amount, the chart and the month list of the next 12 months (mode on only, no setup progress). */
export function KontoSection({ ds, today }: { ds: Dataset; today: Period }) {
  const { settings } = useKonto();
  if (!settings.enabled) return null;
  return <KontoSectionOn ds={ds} today={today} />;
}

function KontoSectionOn({ ds, today }: { ds: Dataset; today: Period }) {
  const state = useKontoState(ds, today);
  const { overview } = state;
  const months = overview.simulation.months;
  return (
    <section aria-labelledby="konto-analyse-title" data-testid="konto-analyse" className="min-w-0">
      <h2 id="konto-analyse-title" className="section-title px-1">
        {t('settings.title')}
      </h2>
      <p className="num mb-3 px-1 text-[12px] text-ink-mute">
        {months[0] && months[months.length - 1] ? `${shortPeriodLabel(months[0].period)} – ${shortPeriodLabel(months[months.length - 1]!.period)}` : ''}
      </p>
      <div className="glass flex min-w-0 flex-col gap-4 p-4">
        <div className="mb-1 min-w-0">
          <p className="text-[13px] font-medium text-ink-mute">{t('tile.info.title')}</p>
          <p className="num truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid="konto-analyse-order">
            {formatEUR(state.next.amount)} / Monat
          </p>
        </div>
        <KontoSimulationView simulation={state.planSimulation} active={today} chartHeight={240} />
      </div>
    </section>
  );
}
