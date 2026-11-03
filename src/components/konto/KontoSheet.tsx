import { lazy, Suspense, useMemo, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import { kontoOverview, type KontoOverview } from '../../lib/fixkostenkonto';
import { formatAvg, formatEUR } from '../../lib/format';
import type { Dataset, Period } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
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
        <p className="text-[13px] font-medium text-ink-mute">Kontostand am Monatsende</p>
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
      <p className="text-[12px] leading-snug text-ink-mute" data-testid="konto-assumption">
        {KONTO_ASSUMPTION}
      </p>
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
    <BottomSheet title="Fixkostenkonto" subtitle="Dauerauftrag, Startlücke und die nächsten 12 Monate" onClose={onClose} returnFocusTo={returnFocusTo}>
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
          <p className="mt-2 text-[13px] text-ink-mute">
            Summe <span className="num">{formatAvg(overview.order.exact)}</span> → aufgerundet{' '}
            <span className="num font-semibold text-ink">{formatEUR(overview.order.amount)}</span>. Eine Position aufs Girokonto stellen: Positionen → Bearbeiten.
          </p>
        </Fold>
      </div>
    </BottomSheet>
  );
}
