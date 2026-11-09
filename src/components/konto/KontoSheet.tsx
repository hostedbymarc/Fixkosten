import { lazy, Suspense, useMemo, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import type { KontoSimulation } from '../../lib/fixkostenkonto';
import { formatAvg, formatEUR } from '../../lib/format';
import { kontoState, type KontoState } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { periodLabel } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { BottomSheet } from '../BottomSheet';
import { InfoTip } from '../InfoTip';
import { chartInfo, Fold, lowestMonth, MonthBreakdown, MonthList, RisingHint } from './KontoParts';
import { ConfirmButton, PlanStatus, SwitchModeLink, WhyAmount } from './KontoStatusView';

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

/**
 * Opened from the tile, short: „Warum € X?“ (normal month, the extra and its bills, the sum), the
 * status („Mit diesem Plan nie im Minus.“ or the reason), „Verlauf mit Plan“. Folded under it: „Alle
 * Monate“, „Eingeplante Rechnungen“. Amount set aside and rounding live in the settings (a link).
 */
export function KontoSheet({ ds, active, onClose, returnFocusTo }: { ds: Dataset; active: Period; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const state = useKontoState(ds, active);
  const start = useMonthStart();
  const { overview } = state;
  return (
    <BottomSheet title={t('sheet.title')} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-6" data-testid="konto-sheet">
        <WhyAmount state={state} />
        <div className="flex flex-col gap-2">
          <PlanStatus state={state} start={start} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ConfirmButton state={state} active={active} testId="sheet-confirm" />
            <SwitchModeLink state={state} testId="sheet-switch" />
          </div>
        </div>
        <KontoSimulationView simulation={state.planSimulation} active={active} buffer={state.buffer} />

        <div className="flex flex-col">
          <Fold summary={t('sheet.positions', { n: overview.order.positions.length })} testId="konto-positions">
            <ul className="divide-y divide-line text-[14px]">
              {overview.order.positions.map(({ position, monthly }) => (
                <li key={position.id} className="flex min-h-11 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">{position.name}</span>
                  <span className="num shrink-0 text-ink-soft">{formatAvg(monthly)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center text-[13px] text-ink-mute">
              <p data-testid="konto-order-exact">
                Abbuchungen {periodLabel(overview.order.from)} bis {periodLabel(overview.order.to)} ÷ 12 ={' '}
                <span className="num">{formatAvg(overview.order.exact)}</span>
                {overview.order.rounding ? `, aufgerundet auf ${formatEUR(overview.order.rounding)}` : ', auf den Cent'}
              </p>
              <InfoTip label="Erklärung: Eingeplante Rechnungen" title="Eingeplante Rechnungen" className="-my-3 -ml-1 shrink-0" testId="konto-positions-info">
                <p>{t('sheet.positions.info')}</p>
              </InfoTip>
            </div>
          </Fold>
          <a
            href="#einstellungen"
            onClick={onClose}
            className="focus-ring -mx-2 mt-1 flex h-11 items-center rounded-xl border-t border-line px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
            data-testid="konto-settings-link"
          >
            {t('sheet.settings')}
          </a>
        </div>
      </div>
    </BottomSheet>
  );
}
