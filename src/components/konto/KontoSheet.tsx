import { lazy, Suspense, useId, useMemo, useState, type ReactNode } from 'react';
import { useKonto } from '../../db/useKonto';
import { type KontoOverview } from '../../lib/fixkostenkonto';
import { formatAvg, formatEUR } from '../../lib/format';
import { kontoState, orderDay, reachedMilestones, type KontoState } from '../../lib/kontoBalance';
import { MILESTONE_TEXT, t } from '../../lib/kontoTexts';
import { periodLabel } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { BottomSheet } from '../BottomSheet';
import { InfoTip } from '../InfoTip';
import { Pea } from '../Pea';
import { causeText, Fold, KONTO_ASSUMPTION, KontoInputs, MonthBreakdown, MonthList, RisingHint } from './KontoParts';
import { CopyButton, KontoStatusLine, PlanList } from './KontoStatusView';

const KontoChart = lazy(() => import('./KontoChart'));

/** kontoState (the one truth: balance, standing order, gap, status, plan, series) – recomputed on every change of the data or the settings. */
export function useKontoState(ds: Dataset, active: Period): KontoState {
  const { settings } = useKonto();
  return useMemo(() => kontoState(ds, active, settings), [ds, active, settings]);
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
      <Fold summary={t('sheet.allMonths')} testId="konto-months">
        <MonthList overview={overview} active={active} selected={selected} onSelect={setSelected} />
      </Fold>
    </div>
  );
}

/**
 * Opened from the tile. The status first (same sentence as the tile; while the plan is open, its
 * checklist), then „Wie viel überweise ich monatlich?“ and „Reicht es das ganze Jahr?“ (chart).
 * Folded by default: „Alle Monate“, „Im Dauerauftrag“, „Kontostand und Rundung“.
 */
export function KontoSheet({ ds, active, onClose, returnFocusTo }: { ds: Dataset; active: Period; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  const { overview } = state;
  const day = orderDay(useMonthStart());
  const milestones = reachedMilestones(settings, state.status, state.streak);
  return (
    <BottomSheet title="Fixkostenkonto" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-6" data-testid="konto-sheet">
        <div className="flex flex-col gap-4">
          <KontoStatusLine state={state} testId="sheet-status" />
          {state.status === 'setup' && settings.setupDone && <PlanList state={state} day={day} testId="sheet-plan" />}
        </div>

        <Question title={t('sheet.q1')} testId="konto-q-order">
          <div data-testid="konto-order">
            <p className="num text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <span data-testid="konto-order-value">{formatEUR(state.order)}</span>
              <span className="text-[16px] font-medium text-ink-mute"> {day}</span>
            </p>
            <p className="mt-0.5 text-[14px] text-ink-soft" data-testid="konto-order-basis">
              {t('sheet.q1.cause', { n: overview.order.positions.length })}
            </p>
            {/* the largest reason why it differs from today's monthly shares (planned change, start, end, one-time) */}
            {overview.order.cause && (
              <p className="mt-0.5 text-[14px] text-ink-soft" data-testid="konto-order-cause">
                {causeText(overview.order.cause)}
              </p>
            )}
          </div>
          <CopyButton amount={state.order} testId="konto-copy" />
        </Question>

        <Question title={t('sheet.q3')} testId="konto-q-year">
          <KontoSimulationView overview={overview} active={active} />
        </Question>

        {milestones.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Meilensteine" data-testid="konto-milestones">
            {milestones.map((m) => (
              <li
                key={m}
                className="inline-flex items-center gap-1.5 rounded-full bg-paid-soft px-2.5 py-1 text-[12px] font-semibold text-paid-ink"
                data-testid="konto-milestone"
                data-milestone={m}
              >
                <Pea size={10} />
                {t(MILESTONE_TEXT[m])}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col">
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
              <p data-testid="konto-order-exact">
                Abbuchungen {periodLabel(overview.order.from)} bis {periodLabel(overview.order.to)} ÷ 12 ={' '}
                <span className="num">{formatAvg(overview.order.exact)}</span>, aufgerundet auf {formatEUR(overview.order.rounding)}
              </p>
              <InfoTip label="Erklärung: Im Dauerauftrag" title="Im Dauerauftrag" className="-my-3 -ml-1 shrink-0" testId="konto-positions-info">
                <p>Eine Position aufs Alltagskonto stellen: Positionen → Bearbeiten.</p>
              </InfoTip>
            </div>
          </Fold>
          <Fold summary={t('sheet.inputs')} testId="konto-settings-inline">
            <KontoInputs settings={settings} active={active} balance={state.balance} />
          </Fold>
        </div>
      </div>
    </BottomSheet>
  );
}

function Question({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id} data-testid={testId}>
      <h3 id={id} className="text-[17px] font-semibold leading-snug text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}
