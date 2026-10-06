import { useState } from 'react';
import {
  DistributionSection,
  ForecastSection,
  MonthCloseSection,
  OptimizationSection,
  PlanActualSection,
  TrendSection,
} from '../components/analysis/sections';
import { dataMonths, historyPeriods, type Range } from '../lib/analytics';
import { useToday } from '../lib/useToday';
import type { Dataset } from '../lib/types';

const RANGES: { value: Range; label: string; aria: string }[] = [
  { value: '6m', label: '6M', aria: 'Letzte 6 Monate' },
  { value: '12m', label: '12M', aria: 'Letzte 12 Monate' },
  { value: 'all', label: 'Alles', aria: 'Gesamter Zeitraum' },
];

/** Loaded lazily: Recharts only ships when the analysis tab is opened. */
export default function AnalyseScreen({ ds }: { ds: Dataset }) {
  const today = useToday();
  const [range, setRange] = useState<Range>('12m');
  const periods = historyPeriods(ds, today, range);
  const months = dataMonths(ds, today);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-8 lg:px-8" data-testid="analyse">
      <header className="py-3 lg:py-6">
        <h1 className="flex h-11 items-center text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]">Analyse</h1>
      </header>

      <div className="flex flex-col gap-6">
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
          <ForecastSection ds={ds} today={today} />
          <DistributionSection ds={ds} today={today} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-5">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Verlauf</h2>
            <p className="text-[13px] text-ink-mute">
              {months === 1 ? 'Bisher 1 Monat Daten' : `Bisher ${months} Monate Daten`}
            </p>
          </div>
          <div role="radiogroup" aria-label="Zeitraum" className="flex rounded-xl bg-zinc-100 p-1" data-testid="range">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={range === r.value}
                aria-label={r.aria}
                onClick={() => setRange(r.value)}
                className={`focus-ring h-11 min-w-[56px] rounded-lg px-3 text-[14px] font-semibold ${
                  range === r.value ? 'bg-white text-ink shadow-card' : 'text-ink-mute hover:text-ink'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6">
          <MonthCloseSection ds={ds} periods={periods} />
          <TrendSection ds={ds} periods={periods} today={today} months={months} />
          <PlanActualSection ds={ds} periods={periods} today={today} />
          <OptimizationSection ds={ds} today={today} />
        </div>
      </div>
    </div>
  );
}
