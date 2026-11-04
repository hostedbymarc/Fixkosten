import { lazy, Suspense, useMemo, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import { kontoOverview, type KontoOverview } from '../../lib/fixkostenkonto';
import { formatAvg, formatEUR } from '../../lib/format';
import type { Dataset, Period } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { InfoTip } from '../InfoTip';
import { Fold, GapMessage, KONTO_ASSUMPTION, KontoInputs, MonthBreakdown, MonthList, RisingHint, StandingOrderHeadline } from './KontoParts';

const KontoChart = lazy(() => import('./KontoChart'));

export function useKontoOverview(ds: Dataset, active: Period): KontoOverview {
  const { settings } = useKonto();
  return useMemo(
    () => kontoOverview(ds, active, settings),
    [ds, active, settings.balance, settings.receivedFor, settings.rounding], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** Chart + tap detail + month list: the simulation of the next 12 months (sheet and analysis). */
export function KontoSimulationView({ overview, active, chartHeight }: { overview: KontoOverview; active: Period; chartHeight?: number }) {
  const [selected, setSelected] = useState<Period | null>(null);
  const month = overview.simulation.months.find((m) => m.period === selected);
  return (
    <div className="flex flex-col gap-3" data-testid="konto-simulation">
      <div>
        <div className="flex items-center">
          <p className="text-[13px] font-medium text-ink-mute">Kontostand am Monatsende</p>
          <InfoTip label="Erklärung: Kontostand am Monatsende" title="Kontostand am Monatsende" className="-my-3 -ml-1.5" testId="konto-assumption">
            <p>{KONTO_ASSUMPTION}</p>
          </InfoTip>
        </div>
        <Suspense fallback={<div style={{ height: chartHeight ?? 220 }} />}>
          <KontoChart overview={overview} active={active} selected={selected} onSelect={(p) => setSelected(p === selected ? null : p)} height={chartHeight} />
        </Suspense>
      </div>
      {month && (
        <div className="rounded-2xl border border-edge bg-field p-3" data-testid="konto-selected">
          <MonthBreakdown month={month} active={active} />
        </div>
      )}
      <RisingHint overview={overview} />
      <Fold summary="Alle Monate" testId="konto-months">
        <MonthList overview={overview} active={active} selected={selected} onSelect={setSelected} />
      </Fold>
    </div>
  );
}

/** Opened from the tile: standing order (F1), Startlücke (F2), simulation (F3). */
export function KontoSheet({ ds, active, onClose, returnFocusTo }: { ds: Dataset; active: Period; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const { settings } = useKonto();
  const overview = useKontoOverview(ds, active);
  return (
    <BottomSheet title="Fixkostenkonto" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-5" data-testid="konto-sheet">
        <StandingOrderHeadline overview={overview} />
        <GapMessage overview={overview} active={active} />
        <KontoSimulationView overview={overview} active={active} />
        <Fold summary="Kontostand und Rundung" testId="konto-settings-inline">
          <KontoInputs settings={settings} active={active} />
        </Fold>
        <Fold summary={`Im Dauerauftrag (${overview.order.positions.length})`} testId="konto-positions">
          <ul className="divide-y divide-line text-[14px]">
            {overview.order.positions.map(({ position, monthly }) => (
              <li key={position.id} className="flex min-h-11 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink">{position.name}</span>
                <span className="num shrink-0 text-ink-soft">{formatAvg(monthly)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center text-[13px] text-ink-mute">
            <p>
              Summe <span className="num">{formatAvg(overview.order.exact)}</span> → aufgerundet{' '}
              <span className="num font-semibold text-ink">{formatEUR(overview.order.amount)}</span>
            </p>
            <InfoTip label="Erklärung: Im Dauerauftrag" title="Im Dauerauftrag" className="-my-3 -ml-1 shrink-0" testId="konto-positions-info">
              <p>Eine Position aufs Alltagskonto stellen: Positionen → Bearbeiten.</p>
            </InfoTip>
          </div>
        </Fold>
      </div>
    </BottomSheet>
  );
}
