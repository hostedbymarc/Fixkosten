import { useState } from 'react';
import { monthStatus } from '../lib/calc';
import { monthName, periodLabel, shortMonthName, yearOf } from '../lib/period';
import type { Dataset, Period } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { ChevronLeft, ChevronRight } from './Icons';

/** Month grid (12 months, year switchable): status per month, the active month marked. */
export function MonthPicker({
  ds,
  shown,
  active,
  onPick,
  onClose,
  returnFocusTo,
}: {
  ds: Dataset;
  shown: Period;
  active: Period;
  onPick: (p: Period) => void;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const [year, setYear] = useState(yearOf(shown));
  const yearButton = 'focus-ring flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-zinc-100';
  return (
    <BottomSheet title="Monat wählen" subtitle={`Aktiver Monat: ${periodLabel(active)}`} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div className="flex items-center justify-between pb-3">
        <button type="button" className={yearButton} onClick={() => setYear((y) => y - 1)} aria-label="Vorheriges Jahr">
          <ChevronLeft size={20} />
        </button>
        <span className="num text-[17px] font-semibold text-ink" data-testid="picker-year" aria-live="polite">
          {year}
        </span>
        <button type="button" className={yearButton} onClick={() => setYear((y) => y + 1)} aria-label="Nächstes Jahr">
          <ChevronRight size={20} />
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4" data-testid="month-grid">
        {Array.from({ length: 12 }, (_, i) => {
          const period = `${year}-${String(i + 1).padStart(2, '0')}`;
          const status = monthStatus(ds, period, active);
          const isShown = period === shown;
          const isActive = period === active;
          const statusText = status.kind === 'paid' ? '✓' : status.kind === 'open' ? `${status.count} offen` : '';
          const statusLabel = status.kind === 'paid' ? 'alles bezahlt' : status.kind === 'open' ? `${status.count} offen` : '';
          return (
            <li key={period}>
              <button
                type="button"
                onClick={() => onPick(period)}
                aria-current={isShown ? 'date' : undefined}
                aria-label={[`${monthName(period)} ${year}`, statusLabel, isActive ? 'aktiver Monat' : ''].filter(Boolean).join(', ')}
                data-testid="month-cell"
                data-period={period}
                data-status={status.kind}
                data-active={isActive || undefined}
                className={`focus-ring flex min-h-[64px] w-full flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-2 text-center ${
                  isShown ? 'border-accent bg-accent-soft' : isActive ? 'border-accent-ink/60 bg-field' : 'border-edge bg-field'
                }`}
              >
                <span className={`text-[15px] ${isShown || isActive ? 'font-semibold text-ink' : 'font-medium text-ink-soft'}`}>{shortMonthName(i + 1)}</span>
                <span
                  className={`num min-h-[18px] text-[12px] leading-[18px] ${status.kind === 'paid' ? 'font-semibold text-paid-ink' : 'text-ink-mute'}`}
                  data-testid="month-cell-status"
                >
                  {statusText}
                </span>
                {isActive && (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-accent-ink" data-testid="month-cell-active">
                    aktiv
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
