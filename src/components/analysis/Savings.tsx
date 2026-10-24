import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import { saveMonthClose } from '../../db/repo';
import { savingsAverage, savingsCard, savingsHistory, shortPeriodLabel, type SavingsCard, type SavingsPoint } from '../../lib/analytics';
import { categoryColor } from '../../lib/categoryColors';
import { formatEUR, formatEURSet, formatPercent } from '../../lib/format';
import { monthOf, periodLabel, shortMonthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { Disclosure } from '../Disclosure';
import { MonthCloseSheet } from '../MonthCloseSheet';
import { ChartCard } from './ChartCard';
import { COLORS } from './chartTheme';

/** Every month column is at least this wide: the whole column is the tap target. */
const COLUMN_MIN = 44;
const MAX_MONTHS = 12;
/** History chart: room for the value label, bar area, month labels (px). */
const TOP = 22;
const PLOT = 96;
const LABEL = 22;

const tipText = (p: SavingsPoint) => {
  const [wealth, net] = formatEURSet(p.wealth!, p.netSalary!);
  return `${shortPeriodLabel(p.period)} · ${formatPercent(p.rate!)} · ${wealth} von ${net}`;
};

/** Months that fit the width with ≥ 44 px each, never more than 12. */
function useColumns(shown: boolean): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(MAX_MONTHS);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setColumns(Math.max(3, Math.min(MAX_MONTHS, Math.floor(width / COLUMN_MIN))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);
  return [ref, columns];
}

/** One bar: full width = net salary, filled part = Vermögensaufbau (= the Sparquote, capped at 100 %). */
function SavingsBar({ card }: { card: SavingsCard }) {
  const fill = Math.min(Math.max(card.rate, 0), 1);
  const [wealth, net] = formatEURSet(card.wealth, card.netSalary);
  return (
    <div>
      <div
        role="img"
        aria-label={`Sparquote ${formatPercent(card.rate)}: ${wealth} von ${net} Netto-Gehalt fließen in Vermögensaufbau`}
        className="flex h-[14px] w-full overflow-hidden"
        data-testid="savings-bar"
      >
        {fill > 0 && (
          <span className="h-full shrink-0 rounded-[4px]" style={{ width: `${fill * 100}%`, background: COLORS.accent }} data-testid="savings-fill" />
        )}
        {fill < 1 && <span className="h-full min-w-0 flex-1 rounded-[4px] bg-zinc-100" style={{ marginLeft: fill > 0 ? 2 : 0 }} />}
      </div>
      <p className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px] text-ink-mute">
        <span className="whitespace-nowrap" data-testid="savings-saved">
          <span className="num font-semibold text-ink">{wealth}</span> gespart
        </span>
        <span className="whitespace-nowrap" data-testid="savings-net">
          Netto <span className="num font-semibold text-ink">{net}</span>
        </span>
      </p>
    </div>
  );
}

/** „Zusammensetzung · € 1.860“: savings categories (or the positions of the only one), collapsed by default. */
function Composition({ card }: { card: SavingsCard }) {
  const [open, setOpen] = useState(false);
  if (card.parts.length === 0) return null;
  return (
    <div className="-mx-2 mt-3 border-t border-line pt-1" data-testid="savings-composition">
      <Disclosure
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        buttonClassName="rounded-xl px-2 py-2 hover:bg-zinc-50"
        buttonTestId="savings-parts-toggle"
        header={
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
            Zusammensetzung · <span className="num whitespace-nowrap">{formatEUR(card.wealth)}</span>
          </span>
        }
      >
        <div className="mb-2 ml-[30px] mr-2 border-l border-line py-1 pl-3" data-testid="savings-parts">
          <p className="mb-1.5 text-[12px] text-ink-mute">Anteil am Vermögensaufbau</p>
          <ul className="flex flex-col gap-2">
            {card.parts.map((p) => (
              <li key={p.id} className="flex flex-col gap-1" data-testid="savings-part">
                <span className="flex items-baseline gap-2 text-[14px]">
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{p.name}</span>
                  <span className="num shrink-0 whitespace-nowrap text-ink">{formatEUR(p.amount)}</span>
                  <span className="num w-[52px] shrink-0 whitespace-nowrap text-right text-[12px] text-ink-mute" data-testid="share">
                    {formatPercent(p.share)}
                  </span>
                </span>
                {/* bar length = the percentage next to it */}
                <span className="block h-1.5 rounded-full bg-zinc-100" aria-hidden="true">
                  <span
                    className="block h-1.5 rounded-full opacity-70"
                    style={{ width: `${Math.min(Math.max(p.share, 0), 1) * 100}%`, background: categoryColor(p.color) }}
                    data-testid="share-bar"
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Disclosure>
    </div>
  );
}

/**
 * Mini column chart „Sparquote je Monat“: the shown month in brand, the others muted,
 * dashed Ø line, value only above the shown month. Months without Netto stay empty.
 * Every month is a button (≥ 44 px): tap, hover or keyboard focus shows its tooltip.
 */
function History({ points, average, current }: { points: SavingsPoint[]; average: number; current: Period }) {
  const [active, setActive] = useState<Period | null>(null);
  const pointer = useRef<string>('mouse');
  const root = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [tipLeft, setTipLeft] = useState(0);
  const scale = Math.max(average, ...points.map((p) => p.rate ?? 0), 0.0001);
  const height = (rate: number) => (Math.min(Math.max(rate, 0), scale) / scale) * PLOT;
  const activeIndex = points.findIndex((p) => p.period === active);

  // a tap elsewhere closes the tooltip
  useEffect(() => {
    if (!active) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [active]);

  // centred above its column, kept inside the chart
  useLayoutEffect(() => {
    if (activeIndex < 0 || !root.current || !tip.current) return;
    const width = root.current.clientWidth;
    const centre = ((activeIndex + 0.5) / points.length) * width;
    const w = tip.current.offsetWidth;
    setTipLeft(Math.min(Math.max(centre - w / 2, 0), Math.max(width - w, 0)));
  }, [activeIndex, points.length]);

  return (
    <div className="mt-4" data-testid="savings-history">
      <p className="mb-1 text-[13px] font-medium text-ink-mute">Sparquote je Monat</p>
      <div ref={root} className="relative" style={{ height: TOP + PLOT + LABEL }} role="group" aria-label="Sparquote je Monat">
        {/* Ø line across the bar area */}
        <div
          className="pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed"
          style={{ bottom: LABEL + height(average), borderColor: COLORS.avg }}
          aria-hidden="true"
          data-testid="savings-avg-line"
        />
        <div className="absolute inset-0 flex">
          {points.map((p) => {
            const isCurrent = p.period === current;
            const label = shortMonthName(monthOf(p.period));
            if (p.rate === null) {
              return (
                <div key={p.period} className="flex min-w-0 flex-1 flex-col justify-end" data-testid="savings-gap" data-period={p.period}>
                  <span className="sr-only">{shortPeriodLabel(p.period)}: kein Netto erfasst</span>
                  <span className="flex items-center justify-center text-[11px] text-ink-faint" style={{ height: LABEL }} aria-hidden="true">
                    {label}
                  </span>
                </div>
              );
            }
            const h = height(p.rate);
            return (
              <button
                key={p.period}
                type="button"
                aria-label={tipText(p)}
                aria-describedby={active === p.period ? 'savings-tip' : undefined}
                className="focus-ring flex min-w-0 flex-1 flex-col justify-end rounded-lg"
                style={{ background: active === p.period ? 'var(--chart-cursor)' : undefined }}
                data-testid="savings-column"
                data-period={p.period}
                data-current={isCurrent || undefined}
                onPointerDown={(e) => (pointer.current = e.pointerType)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(p.period)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setActive((a) => (a === p.period ? null : a))}
                onFocus={(e) => e.currentTarget.matches(':focus-visible') && setActive(p.period)}
                onBlur={() => setActive((a) => (a === p.period ? null : a))}
                onClick={(e) => {
                  // touch and keyboard toggle, a mouse already shows it on hover
                  if (e.detail === 0 || pointer.current !== 'mouse') setActive((a) => (a === p.period ? null : p.period));
                }}
              >
                <span className="relative flex w-full justify-center" style={{ height: PLOT }} aria-hidden="true">
                  {isCurrent && (
                    <span
                      // opaque: the Ø line never runs through the number
                      className="num absolute z-[2] whitespace-nowrap rounded px-1 text-[11px] font-semibold"
                      style={{ bottom: h + 3, color: COLORS.paidText, background: COLORS.surface }}
                      data-testid="savings-value"
                    >
                      {formatPercent(p.rate)}
                    </span>
                  )}
                  <span
                    className="absolute bottom-0 w-[60%] max-w-[28px] rounded-t-[4px]"
                    style={{ height: h, background: isCurrent ? COLORS.accent : COLORS.accentMuted }}
                    data-testid="savings-column-bar"
                  />
                </span>
                <span
                  className={`flex w-full items-center justify-center text-[11px] ${isCurrent ? 'font-semibold text-ink' : 'text-ink-mute'}`}
                  style={{ height: LABEL }}
                  aria-hidden="true"
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        {activeIndex >= 0 && (
          <div
            ref={tip}
            id="savings-tip"
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 max-w-full rounded-xl border border-edge bg-surface px-3 py-1.5 text-[13px] text-ink shadow-sheet"
            style={{ left: tipLeft }}
            data-testid="savings-tooltip"
          >
            <span className="num">{tipText(points[activeIndex]!)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Analyse → „Sparquote“: share of the net salary that goes into Vermögensaufbau (values from calc.ts). */
export function SavingsSection({ ds, today }: { ds: Dataset; today: Period }) {
  const card = savingsCard(ds, today);
  const [ref, columns] = useColumns(card !== null);
  const [closeOpen, setCloseOpen] = useState(false);
  const link = useRef<HTMLButtonElement>(null);

  if (!card) {
    return (
      <section aria-labelledby="savings-title" data-testid="savings">
        <h2 id="savings-title" className="section-title mb-2 px-1">
          Sparquote
        </h2>
        <div className="rounded-card border border-dashed border-zinc-300 px-4 py-4 text-[14px] text-ink-mute" data-testid="savings-empty">
          <p>Trag dein Netto-Gehalt im Monat ein, dann siehst du hier deine Sparquote.</p>
          <button
            ref={link}
            type="button"
            onClick={() => setCloseOpen(true)}
            className="focus-ring -mx-2 mt-1 h-11 rounded-xl px-2 text-[14px] font-medium text-accent-ink hover:bg-accent-soft"
          >
            Netto eintragen
          </button>
        </div>
        {closeOpen && (
          <MonthCloseSheet
            ds={ds}
            period={today}
            returnFocusTo={link.current}
            onClose={() => setCloseOpen(false)}
            onSave={(input) => void saveMonthClose(db, today, input).then(() => setCloseOpen(false))}
          />
        )}
      </section>
    );
  }

  const points = savingsHistory(ds, today).slice(-columns);
  const avg = savingsAverage(points);
  const withChart = avg !== null && avg.months >= 3;
  return (
    <ChartCard
      id="savings"
      title="Sparquote"
      headline={{
        label: periodLabel(card.period),
        value: (
          <>
            {formatPercent(card.rate)}
            <span className="text-ink-mute"> · {formatEUR(card.wealth)}</span>
          </>
        ),
        sub: withChart
          ? `Ø ${formatPercent(avg.average)} der letzten ${avg.months} Monate`
          : 'deines Netto-Gehalts fließt in Vermögensaufbau',
      }}
    >
      <div ref={ref}>
        <SavingsBar card={card} />
        <Composition card={card} />
        {withChart ? (
          <History points={points} average={avg.average} current={card.period} />
        ) : (
          <p className="mt-3 text-[13px] text-ink-mute" data-testid="savings-history-hint">
            Verlauf ab 3 Monaten
          </p>
        )}
      </div>
    </ChartCard>
  );
}
