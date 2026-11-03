import { useKonto } from '../../db/useKonto';
import { shortPeriodLabel } from '../../lib/analytics';
import { formatEUR } from '../../lib/format';
import type { Dataset, Period } from '../../lib/types';
import { GapMessage } from './KontoParts';
import { KontoSimulationView, useKontoOverview } from './KontoSheet';

/** Analysis section „Fixkostenkonto“: the balance simulation of the next 12 months (mode on only). */
export function KontoSection({ ds, today }: { ds: Dataset; today: Period }) {
  const { settings } = useKonto();
  if (!settings.enabled) return null;
  return <KontoSectionOn ds={ds} today={today} />;
}

function KontoSectionOn({ ds, today }: { ds: Dataset; today: Period }) {
  const overview = useKontoOverview(ds, today);
  const months = overview.simulation.months;
  return (
    <section aria-labelledby="konto-analyse-title" data-testid="konto-analyse" className="min-w-0">
      <h2 id="konto-analyse-title" className="section-title px-1">
        Fixkostenkonto
      </h2>
      <p className="num mb-3 px-1 text-[12px] text-ink-mute">
        {months[0] && months[months.length - 1] ? `${shortPeriodLabel(months[0].period)} – ${shortPeriodLabel(months[months.length - 1]!.period)}` : ''}
      </p>
      <div className="glass flex min-w-0 flex-col gap-4 p-4">
        <div className="mb-1 min-w-0">
          <p className="text-[13px] font-medium text-ink-mute">Dauerauftrag</p>
          <p className="num truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid="konto-analyse-order">
            {formatEUR(overview.order.amount)} / Monat
          </p>
        </div>
        <GapMessage overview={overview} active={today} />
        <KontoSimulationView overview={overview} active={today} chartHeight={240} />
      </div>
    </section>
  );
}
