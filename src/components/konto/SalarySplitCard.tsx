import { forwardRef, useMemo, useState } from 'react';
import { useKonto } from '../../db/useKonto';
import { formatEUR } from '../../lib/format';
import { periodStartDate } from '../../lib/kontoBalance';
import { t } from '../../lib/kontoTexts';
import { dayLabel } from '../../lib/kontoWords';
import { nextSalarySplit, salarySplit } from '../../lib/salarySplit';
import { monthName } from '../../lib/period';
import { Segmented } from '../form';
import type { Dataset, Period } from '../../lib/types';
import { useMonthStart } from '../../lib/useToday';
import { useKontoState } from './KontoSheet';

interface Props {
  ds: Dataset;
  /** the month shown */
  period: Period;
  /** the active month (kontoState) */
  active: Period;
  /** no salary yet: open the month close to enter it */
  onOpenSalary: () => void;
}

/**
 * „So teilt sich dein Gehalt“ (instead of „Frei verfügbar“ while „Fixkosten einplanen“ is on):
 * Gehalt am {Tag} − Zur Seite legen − Direkt vom Gehalt − Vermögensaufbau − Spielgeld (− Spielgeld-Überzug)
 * = Überschuss („Bleibt dir“ without a Spielgeld). Numbers: salarySplit over kontoState.
 * A switch „Nächstes Gehalt | Aktuelles Gehalt“, default the next one (planned, with the amount of the
 * Zur-Seite-Kachel); the current one shows the actual values and the Spielgeld-Überzug.
 */
export const SalarySplitCard = forwardRef<HTMLButtonElement, Props>(function SalarySplitCard({ ds, period, active, onOpenSalary }, ref) {
  const { settings } = useKonto();
  const start = useMonthStart();
  const state = useKontoState(ds, active);
  const [view, setView] = useState<'next' | 'current'>('next');
  const split = useMemo(
    () => (view === 'next' ? nextSalarySplit(ds, period, state, settings, period === active ? state.next.amount : undefined) : salarySplit(ds, period, state, settings)),
    [view, ds, period, active, state, settings],
  );
  const names = split.directItems.length > 0 && split.directItems.length <= 2 ? split.directItems.map((i) => i.name).join(', ') : null;
  const rows: { key: string; label: string; note?: string | null; value: number }[] = [
    { key: 'reserve', label: t('split.reserve'), value: split.reserve },
    { key: 'direct', label: t('split.direct'), note: names, value: split.direct },
    { key: 'wealth', label: t('split.wealth'), value: split.wealth },
    ...(split.spielgeld !== null || split.spent > 0 ? [{ key: 'spielgeld', label: t('split.spielgeld'), value: split.spielgeld ?? split.spent }] : []),
    ...(split.overflowCounted > 0 ? [{ key: 'overflow', label: t('split.overflow'), value: split.overflowCounted }] : []),
  ].filter((r) => r.key === 'reserve' || Math.round(r.value * 100) > 0);
  return (
    <section
      className="glass glass-tile tone-pea surface col-span-full min-w-0 p-4 md:p-5 xl:p-6"
      data-testid="salary-split"
      data-view={view}
      aria-labelledby="salary-split-title"
    >
      <h2 id="salary-split-title" className="text-[13px] font-medium leading-5 text-ink-mute">
        {t('split.title')}
      </h2>
      <div className="mt-2 max-w-[420px]" data-testid="salary-split-view">
        <Segmented<'next' | 'current'>
          label={t('split.view')}
          hideLabel
          value={view}
          onChange={setView}
          options={[
            { value: 'next', label: t('split.view.next') },
            { value: 'current', label: t('split.view.current') },
          ]}
        />
      </div>
      {split.salary === null ? (
        <div className="mt-2 flex flex-col items-start gap-2">
          <p className="text-[15px] leading-snug text-ink-soft" data-testid="salary-split-empty">
            {t('split.noSalary')}
          </p>
          <button
            ref={ref}
            type="button"
            onClick={onOpenSalary}
            className="focus-ring h-11 rounded-xl border border-control-edge bg-control px-4 text-[15px] font-semibold text-accent-ink hover:bg-control-track"
            data-testid="salary-split-enter"
          >
            {t('split.noSalary.action')}
          </button>
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[15px] leading-snug">
          <dt className="font-semibold text-ink" data-testid="split-salary-label">
            {t('split.salary', { datum: dayLabel(periodStartDate(split.period, start)) })}
            {split.salaryFrom && (
              <span className="font-normal text-ink-mute" data-testid="split-salary-like">
                {' '}
                ({t('split.salary.like', { monat: monthName(split.salaryFrom) })})
              </span>
            )}
          </dt>
          <dd className="num text-right font-semibold text-ink" data-testid="split-salary">
            {formatEUR(split.salary, { fixed: true })}
          </dd>
          {rows.map((r) => (
            <div key={r.key} className="contents" data-testid={`split-${r.key}`}>
              <dt className="min-w-0 text-ink-soft">
                − {r.label}
                {r.note && <span className="text-ink-mute"> ({r.note})</span>}
              </dt>
              <dd className="num text-right text-ink-soft" data-testid={`split-${r.key}-value`}>
                {formatEUR(r.value, { fixed: true })}
              </dd>
            </div>
          ))}
          <div className="col-span-2 mt-1 border-t border-line" aria-hidden="true" />
          <dt className="pt-1 font-semibold text-ink">= {t(split.spielgeld !== null ? 'split.rest' : 'split.rest.plain')}</dt>
          <dd
            className={`num pt-1 text-right text-[17px] font-semibold ${split.rest! < 0 ? 'text-over' : 'text-ink'}`}
            data-testid="split-rest"
            data-negative={split.rest! < 0}
          >
            {formatEUR(split.rest!, { fixed: true })}
          </dd>
        </dl>
      )}
    </section>
  );
});
