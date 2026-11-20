import { lazy, Suspense, useMemo, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import type { KontoSimulation } from '../../lib/fixkostenkonto';
import { kontoState, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { periodLabel } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { InfoTip } from '../InfoTip';
import { chartInfo, Fold, lowestMonth, MonthBreakdown, MonthList, RisingHint } from './KontoParts';

const KontoChart = lazy(() => import('./KontoChart'));

/** kontoState (the one truth: balance, standing order, gap, status, plan, series) – recomputed on every change of the data or the settings. */
export function useKontoState(ds: Dataset, active: Period): KontoState {
  const { settings } = useKonto();
  const start = useMonthStart();
  return useMemo(() => kontoState(ds, active, settings, start), [ds, active, settings, start]);
}


/**
 * „Verlauf mit Plan“: chart and ONE month card under it (no popup over the chart). Without a tap the
 * card shows the month with the lowest balance (the earlier one on a tie); a tap on a point or a row
 * of „Alle Monate“ shows that month. A small line above the card says which month it is.
 */
export function KontoSimulationView({ simulation, active, buffer = 0, chartHeight }: { simulation: KontoSimulation; active: Period; buffer?: number; chartHeight?: number }) {
  const [picked, setPicked] = useState<Period | null>(null);
  const start = useMonthStart();
  const lowest = lowestMonth(simulation);
  const month = simulation.months.find((m) => m.period === picked) ?? lowest;
  const select = (p: Period | null) => setPicked(p);
  return (
    <div className="flex flex-col gap-3" data-testid="konto-simulation">
      <div>
        <div className="flex items-center">
          <p className="text-[13px] font-medium text-ink-mute">{t('sheet.chart')}</p>
          <InfoTip label={`Erklärung: ${t('sheet.chart')}`} title={t('sheet.chart')} className="-my-3 -ml-1.5" testId="konto-assumption">
            <p>{chartInfo(start)}</p>
          </InfoTip>
        </div>
        <Suspense fallback={<div style={{ height: chartHeight ?? 220 }} />}>
          <KontoChart simulation={simulation} active={active} buffer={buffer} selected={month?.period ?? null} onSelect={(p) => select(p)} height={chartHeight} />
        </Suspense>
      </div>
      {month && (
        <div className="flex flex-col gap-1.5">
          <p className="px-1 text-[12px] leading-snug text-ink-mute" data-testid="konto-selected-hint" data-default={picked ? 'false' : 'true'} aria-live="polite">
            {picked ? t('sheet.month.picked', { monat: periodLabel(month.period) }) : t('sheet.month.lowest', { monat: periodLabel(month.period) })}
          </p>
          <div className="rounded-2xl border border-edge bg-field p-3" data-testid="konto-selected" data-period={month.period}>
            <MonthBreakdown month={month} active={active} />
          </div>
        </div>
      )}
      <RisingHint simulation={simulation} />
      <Fold summary={t('sheet.allMonths')} testId="konto-months">
        <MonthList simulation={simulation} active={active} selected={picked} onSelect={select} />
      </Fold>
    </div>
  );
}
