import { useMemo } from 'react';
import { db } from '../../db/db';
import { setSpielgeldOverflow } from '../../db/kontoActions';
import type { OverflowSource } from '../../db/settings';
import { useKonto } from '../../db/useKonto';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { monthName } from '../../lib/period';
import { salarySplit } from '../../lib/salarySplit';
import type { Dataset, Period } from '../../lib/types';
import { Segmented } from '../form';
import { useKontoState } from './KontoSheet';

const money = (v: number) => formatEUR(v, { fixed: true });

/**
 * „Spielgeld {Monat}“ (only with a Spielgeld set): limit, spent (everything due on the Spielgeld this month),
 * a bar and the list. Above the limit: „€ X über dem Spielgeld“ and „Woher kommt der Rest?“ – „Aus dem
 * Überschuss“ (default until answered) / „Andere Quelle“, stored per month, changeable at any time.
 */
export function SpielgeldCard({ ds, period, active }: { ds: Dataset; period: Period; active: Period }) {
  const { settings } = useKonto();
  const state = useKontoState(ds, active);
  const split = useMemo(() => salarySplit(ds, period, state, settings), [ds, period, state, settings]);
  if (split.spielgeld === null) return null;
  const limit = split.spielgeld;
  const share = limit > 0 ? Math.min(split.spent / limit, 1) : 1;
  const over = split.overflow > 0;
  return (
    <section className="glass glass-tile surface min-w-0 p-4 md:p-5 xl:p-6" data-testid="spielgeld-card" data-over={over} aria-labelledby="spielgeld-title">
      <h2 id="spielgeld-title" className="text-[13px] font-medium leading-5 text-ink-mute">
        {t('spiel.title', { monat: monthName(period) })}
      </h2>
      <div className="num mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] text-ink-soft">
          {t('spiel.spent')}{' '}
          <span className={`text-[22px] font-semibold tracking-[-0.01em] ${over ? 'text-over' : 'text-ink'}`} data-testid="spielgeld-spent">
            {money(split.spent)}
          </span>
        </p>
        <p className="text-[15px] text-ink-soft">
          {t('spiel.limit')} <span className="font-semibold text-ink" data-testid="spielgeld-limit">{money(limit)}</span>
        </p>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-control-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        aria-label={`${t('spiel.spent')} ${money(split.spent)} von ${money(limit)}`}
        data-testid="spielgeld-bar"
      >
        <div className={`h-full rounded-full ${over ? 'bg-over' : 'bg-accent'}`} style={{ width: `${share * 100}%` }} />
      </div>
      {!over && (
        <p className="num mt-1.5 text-[13px] text-ink-mute" data-testid="spielgeld-left">
          {t('spiel.left', { betrag: money(limit - split.spent) })}
        </p>
      )}
      {split.spentItems.length > 0 ? (
        <ul className="num mt-3 flex flex-col gap-1 text-[14px]" data-testid="spielgeld-items">
          {split.spentItems.map((i, n) => (
            <li key={`${i.name}-${n}`} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-ink-soft">{i.name}</span>
              <span className="shrink-0 text-ink">{money(i.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] text-ink-mute" data-testid="spielgeld-empty">
          {t('spiel.empty')}
        </p>
      )}
      {over && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3" data-testid="spielgeld-over">
          <p className="num text-[15px] font-semibold text-over" data-testid="spielgeld-over-text">
            {t('spiel.over', { betrag: money(split.overflow) })}
          </p>
          <div data-testid="spielgeld-overflow">
            <Segmented<OverflowSource>
              label={t('spiel.question')}
              value={split.overflowSource}
              onChange={(v) => void setSpielgeldOverflow(db, period, v)}
              options={[
                { value: 'surplus', label: t('spiel.surplus') },
                { value: 'other', label: t('spiel.other') },
              ]}
            />
          </div>
        </div>
      )}
    </section>
  );
}
