import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { forecastSummary, shortPeriodLabel, yearForecast, type ForecastItem, type ForecastMonth, type YearForecast } from '../../lib/analytics';
import { formatCompactEUR, formatEUR } from '../../lib/format';
import { monthOf, periodLabel, shortMonthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { ChartCard, TooltipBox, TooltipRow } from './ChartCard';
import { AXIS_TICK, CHART_MARGIN, COLORS, tooltipProps, xAxisProps, yAxisProps } from './chartTheme';

interface TipProps<T> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: T }>;
}

/** Room right of the plot for the Ø chip at the end of the line (never on a bar). */
const CHIP_ROOM = 48;

const NARROW = '(max-width: 419px)';

/** Phones narrower than the iPhone Pro Max: every pixel of plot width goes to the 12 month labels. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const update = () => setNarrow(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** One-time payments: small dot in the colour of their bar part, no „(einmalig)“ text. */
function OnceDot({ size = 6 }: { size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: COLORS.accentLight }}
      aria-hidden="true"
    />
  );
}

function itemLabel(i: ForecastItem): string {
  return `${i.name}${i.once ? ' (einmalig)' : ''} ${formatEUR(i.amount)}`;
}

/** Name … amount, the name truncates, the amount never wraps. */
function ItemInline({ item }: { item: ForecastItem }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {item.once && <OnceDot />}
      <span className="min-w-0 truncate">{item.name}</span>
      <span className="num shrink-0 whitespace-nowrap">{formatEUR(item.amount)}</span>
    </span>
  );
}

function ItemLines({ items }: { items: ForecastItem[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <li key={i.name} className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            {i.once && <OnceDot />}
            <span className="min-w-0 truncate">{i.name}</span>
          </span>
          <span className="num shrink-0 whitespace-nowrap">{formatEUR(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

const VISIBLE_ITEMS = 2;

/** iPhone / iPad portrait: one row per month, tap shows all non-monthly items. */
function MonthRow({ m, open, onToggle }: { m: ForecastMonth; open: boolean; onToggle: () => void }) {
  const shown = m.items.slice(0, VISIBLE_ITEMS);
  const more = m.items.length - shown.length;
  const label = `${periodLabel(m.period)}: ${formatEUR(m.due)} fällig${m.aboveAverage ? ', über dem Schnitt' : ''}${
    m.items.length ? `, nicht monatlich: ${m.items.map(itemLabel).join(', ')}` : ''
  }`;
  const head = (
    <>
      <span className="flex items-center gap-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: m.aboveAverage ? COLORS.accent : 'transparent' }}
          aria-hidden="true"
          data-testid={m.aboveAverage ? 'above-dot' : undefined}
        />
        <span className="whitespace-nowrap text-[15px] text-ink" data-testid="forecast-month">
          {shortPeriodLabel(m.period)}
        </span>
        <span className="num ml-auto whitespace-nowrap text-[15px] font-semibold text-ink" data-testid="forecast-due">
          {formatEUR(m.due)}
        </span>
      </span>
      {m.items.length > 0 && !open && (
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-5 text-[13px] text-ink-mute" data-testid="forecast-preview">
          {shown.map((i, n) => (
            <span key={i.name} className="flex min-w-0 items-center gap-1.5">
              {n > 0 && <span aria-hidden="true">·</span>}
              <ItemInline item={i} />
            </span>
          ))}
          {more > 0 && <span className="shrink-0 whitespace-nowrap">+{more} weitere</span>}
        </span>
      )}
    </>
  );
  return (
    <li className="border-t border-line first:border-t-0" data-testid="forecast-row" data-period={m.period}>
      {m.items.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={label}
          onClick={onToggle}
          className="focus-ring flex min-h-11 w-full flex-col justify-center rounded-lg py-2.5 text-left"
        >
          {head}
        </button>
      ) : (
        <div className="flex min-h-11 flex-col justify-center py-2.5" aria-label={label} role="group">
          {head}
        </div>
      )}
      {open && (
        <div className="pb-2.5 pl-5 text-[13px] text-ink-mute" data-testid="forecast-expanded">
          <ItemLines items={m.items} />
          {m.once > 0 && (
            <p className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-medium text-ink-soft" data-testid="forecast-once-sum">
              <span>davon einmalig</span>
              <span className="num whitespace-nowrap">{formatEUR(m.once)}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function MonthList({ f }: { f: YearForecast }) {
  const [open, setOpen] = useState<Period | null>(null);
  return (
    <ul role="list" aria-label="Fällige Ausgaben der nächsten 12 Monate" className="lg:hidden" data-testid="forecast-list">
      {f.months.map((m) => (
        <MonthRow key={m.period} m={m} open={open === m.period} onToggle={() => setOpen((p) => (p === m.period ? null : m.period))} />
      ))}
    </ul>
  );
}

/** From iPad landscape: a real table, items as a list in the third column. */
function MonthTable({ f }: { f: YearForecast }) {
  return (
    <table className="hidden w-full table-fixed text-left text-[13px] lg:table" data-testid="forecast-table">
      <caption className="sr-only">Fällige Ausgaben der nächsten 12 Monate</caption>
      <colgroup>
        <col style={{ width: 120 }} />
        <col style={{ width: 110 }} />
        <col />
      </colgroup>
      <thead>
        <tr className="text-ink-mute">
          <th scope="col" className="py-1.5 font-medium">Monat</th>
          <th scope="col" className="py-1.5 pr-4 text-right font-medium">Fällig</th>
          <th scope="col" className="py-1.5 font-medium">Nicht monatlich</th>
        </tr>
      </thead>
      <tbody>
        {f.months.map((m) => (
          <tr key={m.period} className="border-t border-line align-top">
            <th scope="row" className="whitespace-nowrap py-2 font-normal text-ink">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: m.aboveAverage ? COLORS.accent : 'transparent' }}
                  aria-hidden="true"
                />
                {shortPeriodLabel(m.period)}
              </span>
            </th>
            <td className="num whitespace-nowrap py-2 pr-4 text-right font-semibold text-ink">{formatEUR(m.due)}</td>
            <td className="py-2 text-ink-soft">
              {m.items.length === 0 ? <span className="text-ink-faint">–</span> : <ItemLines items={m.items} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ø chip right of the line end, with an opaque background: never on top of a bar. */
function AvgChip({ viewBox, text }: { viewBox?: { x?: number; y?: number; width?: number }; text: string }) {
  if (!viewBox || viewBox.x === undefined || viewBox.y === undefined || viewBox.width === undefined) return null;
  const width = CHIP_ROOM - 6;
  const x = viewBox.x + viewBox.width + 4;
  return (
    <g data-testid="avg-chip">
      <rect x={x} y={viewBox.y - 9} width={width} height={18} rx={9} fill={COLORS.surface} stroke={COLORS.avg} strokeWidth={1} />
      <text x={x + width / 2} y={viewBox.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={COLORS.inkSoft} className="num">
        {text}
      </text>
    </g>
  );
}

export function ForecastSection({ ds, today }: { ds: Dataset; today: Period }) {
  const f = yearForecast(ds, today);
  const summary = forecastSummary(f);
  const narrow = useNarrow();
  const rows = f.months.map((m) => ({
    ...m,
    label: shortMonthName(monthOf(m.period)),
    // stacked: recurring part below, one-time payments as a lighter part on top
    recurring: Math.round((m.due - m.once) * 100) / 100,
  }));
  const hasOnce = f.onceTotal !== 0;
  const avgText = `Ø ${formatEUR(Math.round(f.average)).replace(/^€\s/, '')}`;
  return (
    <ChartCard
      id="forecast"
      title="Jahresvorschau"
      headline={
        <div className="mb-3" data-testid="forecast-headline">
          <p className="text-[13px] font-medium text-ink-mute" data-testid="forecast-headline-label">{summary.label}</p>
          <p className="num text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink" data-testid="forecast-headline-value">
            {summary.value}
          </p>
          <p className="num text-[13px] text-ink-mute" data-testid="forecast-headline-sub">{summary.sub}</p>
        </div>
      }
      details={
        <>
          <MonthList f={f} />
          <MonthTable f={f} />
          <p className="mt-2 border-t border-line pt-2 text-[13px] text-ink-mute" data-testid="forecast-footer">
            12 Monate <span className="num whitespace-nowrap font-semibold text-ink">{formatEUR(f.total)}</span>
            {f.onceTotal > 0 && (
              <>
                {' · '}davon einmalig <span className="num whitespace-nowrap font-medium text-ink-soft">{formatEUR(f.onceTotal)}</span>
              </>
            )}
          </p>
        </>
      }
    >
      <div
        // narrow phones: the chart uses half of the card padding, the month labels need it
        className="h-[230px] max-[419px]:-mx-2"
        role="img"
        aria-label={`Balkendiagramm: fällige Ausgaben pro Monat, ${shortPeriodLabel(f.months[0]!.period)} bis ${shortPeriodLabel(f.months[f.months.length - 1]!.period)}, Ø ${formatEUR(f.average)} pro Monat`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <BarChart data={rows} margin={{ ...CHART_MARGIN, right: CHIP_ROOM }} accessibilityLayer barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} interval={0} tick={{ ...AXIS_TICK, fontSize: narrow ? 10 : 11 }} />
            <YAxis
              {...yAxisProps}
              // the card is about euros: narrow phones drop the '€ ' of the scale ('8k')
              tickFormatter={narrow ? (v: number) => formatCompactEUR(v).replace(/€\s/, '') : yAxisProps.tickFormatter}
              tick={{ ...AXIS_TICK, fontSize: narrow ? 10 : 11 }}
              width={narrow ? 30 : 44}
            />
            <Tooltip
              {...tooltipProps}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const m = props.active && props.payload?.length ? (props.payload[0]!.payload ?? null) : null;
                if (!m) return null;
                return (
                  <TooltipBox title={`${periodLabel(m.period)}: ${formatEUR(m.due)}`}>
                    {m.items.length === 0 ? (
                      <p>Nur monatliche Posten</p>
                    ) : (
                      m.items.map((i) => (
                        <TooltipRow key={i.name} label={i.name} value={formatEUR(i.amount)} swatch={i.once ? COLORS.accentLight : undefined} />
                      ))
                    )}
                  </TooltipBox>
                );
              }}
            />
            <Bar
              dataKey="recurring"
              stackId="due"
              radius={hasOnce ? 0 : [4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
              name="Fällig"
              className="bar-recurring"
            >
              {rows.map((m) => (
                <Cell key={m.period} fill={m.aboveAverage ? COLORS.accent : COLORS.neutral} />
              ))}
            </Bar>
            {hasOnce && (
              <Bar
                dataKey="once"
                stackId="due"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
                name="Einmalig"
                fill={COLORS.accentLight}
                stroke={COLORS.surface}
                strokeWidth={1}
                className="bar-once"
              />
            )}
            <ReferenceLine
              y={f.average}
              stroke={COLORS.avg}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={(props: { viewBox?: { x?: number; y?: number; width?: number } }) => <AvgChip viewBox={props.viewBox} text={avgText} />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p
        className="mt-2 flex items-center justify-center gap-x-3 whitespace-nowrap text-[12px] text-ink-mute"
        data-testid="forecast-legend"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLORS.accent }} aria-hidden="true" />
          über Ø
        </span>
        {hasOnce && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS.accentLight }} aria-hidden="true" />
            einmalig
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.avg }} aria-hidden="true" />
          Ø pro Monat
        </span>
      </p>
    </ChartCard>
  );
}
