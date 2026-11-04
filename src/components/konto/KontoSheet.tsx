import { lazy, Suspense, useId, useMemo, useState, type ReactNode } from 'react';
import { db } from '../../db/db';
import { setAnchor, setPlan } from '../../db/kontoActions';
import { localToday } from '../../lib/activeMonth';
import { amountToInput } from '../../lib/format';
import { reachedMilestones } from '../../lib/kontoBalance';
import { orderDay } from '../../lib/schote';
import { MILESTONE_TEXT, t } from '../../lib/schoteTexts';
import { useMonthStart } from '../../lib/useToday';
import { AlertIcon } from '../Icons';
import { Pea } from '../Pea';
import { PeaPod, PodAnswer } from './PeaPod';
import { useKonto } from '../../db/useKonto';
import { type KontoOverview } from '../../lib/fixkostenkonto';
import { kontoState, type KontoState } from '../../lib/kontoBalance';
import { formatAvg, formatEUR } from '../../lib/format';
import type { Dataset, Period } from '../../lib/types';
import { BottomSheet } from '../BottomSheet';
import { InfoTip } from '../InfoTip';
import { causeText, Fold, KONTO_ASSUMPTION, KontoInputs, MonthBreakdown, MonthList, RisingHint } from './KontoParts';
import { periodLabel } from '../../lib/period';

const KontoChart = lazy(() => import('./KontoChart'));

/** Expected balance, simulation, pod, tile state and series – recomputed on every change of the data or the settings. */
export function useKontoState(ds: Dataset, active: Period): KontoState {
  const { settings } = useKonto();
  return useMemo(() => kontoState(ds, active, settings), [ds, active, settings]);
}

export function useKontoOverview(ds: Dataset, active: Period): KontoOverview {
  return useKontoState(ds, active).overview;
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
 * Opened from the tile. Three questions, in this order:
 * 1 „Wie viel überweise ich monatlich?“ – the standing order, why, copy
 * 2 „Muss ich jetzt etwas tun?“ – exactly one action, or „Nein, alles gedeckt.“
 * 3 „Reicht es das ganze Jahr?“ – the big pod, then the chart (zero line, red below 0)
 * Folded below: „Alle Monate“ and „Einstellungen zum Konto“; the milestones as small badges.
 */
export function KontoSheet({ ds, active, onClose, returnFocusTo }: { ds: Dataset; active: Period; onClose: () => void; returnFocusTo?: HTMLElement | null }) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  const { overview } = state;
  const start = useMonthStart();
  const milestones = reachedMilestones(settings, state.pod, state.streak);
  return (
    <BottomSheet title="Fixkostenkonto" onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex flex-col gap-6" data-testid="konto-sheet">
        <Question title={t('sheet.q1')} testId="konto-q-order">
          <div data-testid="konto-order">
            <p className="num text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <span data-testid="konto-order-value">{formatEUR(overview.order.amount)}</span>
              <span className="text-[16px] font-medium text-ink-mute"> {orderDay(start)}</span>
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
          <CopyButton amount={overview.order.amount} />
        </Question>

        <Question title={t('sheet.q2')} testId="konto-q-action">
          <NextAction ds={ds} active={active} />
        </Question>

        <Question title={t('sheet.q3')} testId="konto-q-year">
          {/* answer first; the button for the one-time transfer is the one in „Muss ich jetzt etwas tun?“ */}
          <PodAnswer pod={state.pod} gap={state.gap} testId="sheet-answer" />
          <PeaPod pod={state.pod} size="large" testId="sheet-pod" />
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

        <Fold summary={t('sheet.settings')} testId="konto-settings-inline">
          <div className="flex flex-col gap-5">
            <KontoInputs settings={settings} active={active} balance={state.balance} />
          </div>
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
            <p data-testid="konto-order-exact">
              Abbuchungen {periodLabel(overview.order.from)} bis {periodLabel(overview.order.to)} ÷ 12 ={' '}
              <span className="num">{formatAvg(overview.order.exact)}</span>, aufgerundet auf {formatEUR(overview.order.rounding)}
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

/** „Muss ich jetzt etwas tun?“: exactly one action – the gap, else the standing order of the plan – or nothing. */
function NextAction({ ds, active }: { ds: Dataset; active: Period }) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  const gap = Math.round(state.gap * 100) > 0;
  const order = state.overview.order.amount;
  if (gap)
    return (
      <div className="rounded-2xl bg-warn-soft p-3" data-testid="konto-gap" data-gap="" role="status">
        <p className="flex items-start gap-2 text-[15px] font-semibold leading-snug text-ink">
          <AlertIcon size={18} className="mt-0.5 shrink-0 text-warn-icon" aria-hidden="true" />
          <span>
            Ja. Zahl einmalig{' '}
            <span className="num whitespace-nowrap" data-testid="konto-gap-value">
              {formatEUR(state.gap)}
            </span>{' '}
            ein.
          </span>
        </p>
        <button
          type="button"
          onClick={() => void setAnchor(db, state.balance + state.gap, localToday())}
          className="focus-ring mt-3 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
          data-testid="konto-gap-paid"
        >
          {t('tile.gap.action')}
        </button>
      </div>
    );
  if (settings.setupDone && settings.plan.orderDone === false && settings.anchor !== null && settings.hasAccount !== null)
    return (
      <div className="rounded-2xl bg-field p-3" data-testid="konto-gap" role="status">
        <p className="text-[15px] font-semibold leading-snug text-ink" data-testid="konto-action-order">
          Ja. Stell den Dauerauftrag auf <span className="num whitespace-nowrap">{formatEUR(order)}</span>.
        </p>
        <button
          type="button"
          onClick={() => void setPlan(db, { orderDone: true })}
          className="focus-ring mt-3 h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover sm:w-auto"
          data-testid="konto-order-done"
        >
          {t('plan.done')}
        </button>
      </div>
    );
  return (
    <div className="rounded-2xl bg-paid-soft p-3" data-testid="konto-gap" role="status">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink" data-testid="konto-covered">
        <Pea size={18} state="checked" />
        {t('sheet.q2.none')}
      </p>
    </div>
  );
}

function CopyButton({ amount }: { amount: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(amountToInput(amount));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* no clipboard: the amount stays visible */
        }
      }}
      className="focus-ring glass-inset flex h-11 items-center self-start rounded-xl bg-surface px-3 text-[15px] font-semibold text-accent-ink"
      data-testid="konto-copy"
    >
      {copied ? t('plan.copied') : t('plan.copy')}
    </button>
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
