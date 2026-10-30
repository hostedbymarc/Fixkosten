import { useEffect, useState } from 'react';
import { DeferredChart } from './DeferredChart';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { forecastRange, forecastSummary, shortPeriodLabel, yearForecast, type ForecastItem, type ForecastMonth, type YearForecast } from '../../lib/analytics';
import { formatCompactEUR, formatEUR } from '../../lib/format';
import { monthOf, periodLabel, shortMonthName } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { NoteIcon } from '../Icons';
import { ChartCard, TooltipBox, TooltipRow } from './ChartCard';
import { AXIS_TICK, CHART_MARGIN, COLORS, tooltipProps, xAxisProps, yAxisProps } from './chartTheme';

interface TipProps<T> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: T }>;
}

/** Room right of the plot for the Ø chip at the end of the line (never on a bar). */
const CHIP_ROOM = 48;

const NARROW = '(max-width: 429px)';

/** Phones narrower than 430 px: every pixel of plot width goes to the 12 month labels (one letter each). */
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
      className="inline-block shrink-0 -translate-y-px self-center rounded-full"
      style={{ width: size, height: size, background: COLORS.accentLight }}
      aria-hidden="true"
      data-testid="once-dot"
    />
  );
}

function itemLabel(i: ForecastItem): string {
  return `${i.name}${i.once ? ' (einmalig)' : ''} ${formatEUR(i.amount)}`;
}

/** Name … amount: the name wraps (at most 2 lines, never cut off mid-line), the amount never wraps. */
function ItemInline({ item }: { item: ForecastItem }) {
  return (
    <span className="flex min-w-0 max-w-full items-baseline gap-1" data-testid="forecast-item" data-once={item.once || undefined}>
      {item.once && <OnceDot />}
      <span className="line-clamp-2 min-w-0 break-words" data-testid="forecast-item-name">
        {item.name}
      </span>
      <span className="num shrink-0 whitespace-nowrap">{formatEUR(item.amount)}</span>
    </span>
  );
}

function ItemLines({ items }: { items: ForecastItem[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <li key={i.name} className="flex items-baseline justify-between gap-3" data-testid="forecast-item" data-once={i.once || undefined}>
          <span className="flex min-w-0 items-baseline gap-1.5">
            {i.once && <OnceDot />}
            <span className="line-clamp-2 min-w-0 break-words" data-testid="forecast-item-name">
              {i.name}
            </span>
          </span>
          <span className="num shrink-0 whitespace-nowrap">{formatEUR(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

const VISIBLE_ITEMS = 2;

const NOTE_LABEL = 'Monat hat eine Notiz';

/** iPhone / iPad portrait: one row per month, tap shows all non-monthly items. */
function MonthRow({
  m,
  note,
  open,
  selected,
  onToggle,
}: {
  m: ForecastMonth;
  note?: string;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const shown = m.items.slice(0, VISIBLE_ITEMS);
  const more = m.items.length - shown.length;
  const label = `${periodLabel(m.period)}: ${formatEUR(m.due)} fällig${m.aboveAverage ? ', über dem Schnitt' : ''}${
    m.items.length ? `, nicht monatlich: ${m.items.map(itemLabel).join(', ')}` : ''
  }${note ? `, ${NOTE_LABEL}` : ''}`;
  const expandable = m.items.length > 0 || !!note;
  const head = (
    <>
      <span className="flex items-center gap-3">
        <span className="whitespace-nowrap text-[15px] text-ink" data-testid="forecast-month">
          {shortPeriodLabel(m.period)}
        </span>
        {note && (
          <span className="text-ink-mute" title={NOTE_LABEL} aria-hidden="true" data-testid="forecast-note-icon">
            <NoteIcon size={14} />
          </span>
        )}
        <span className="num ml-auto whitespace-nowrap text-[15px] font-semibold text-ink" data-testid="forecast-due">
          {formatEUR(m.due)}
        </span>
      </span>
      {m.items.length > 0 && !open && (
        // each entry starts with 14 px room for its „·“; the inner row is shifted left by that much and
        // clipped, so an entry that wraps to the start of a line shows no stray separator
        <span className="mt-1 block min-w-0 overflow-hidden text-[13px] text-ink-mute" data-testid="forecast-preview">
          <span className="-ml-3.5 flex flex-wrap items-baseline gap-y-0.5">
            {shown.map((i, n) => (
              <span key={i.name} className="relative flex min-w-0 max-w-full items-baseline pl-3.5">
                {n > 0 && (
                  <span className="absolute left-[4px]" aria-hidden="true">
                    ·
                  </span>
                )}
                <ItemInline item={i} />
              </span>
            ))}
            {/* part of the row button: tapping it expands the month */}
            {more > 0 && (
              <span className="shrink-0 whitespace-nowrap pl-3.5 font-medium text-accent-ink underline-offset-2 hover:underline" data-testid="forecast-more">
                +{more} weitere
              </span>
            )}
          </span>
        </span>
      )}
    </>
  );
  return (
    <li
      className={`-mx-2 rounded-lg border-t border-line px-2 first:border-t-0 ${selected ? 'bg-accent-soft' : ''}`}
      data-testid="forecast-row"
      data-period={m.period}
      data-selected={selected || undefined}
    >
      {expandable ? (
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
        <div className="pb-3 text-[13px] text-ink-mute" data-testid="forecast-expanded">
          {m.items.length > 0 && <ItemLines items={m.items} />}
          {note && (
            <p
              className={`flex gap-1.5 whitespace-pre-line break-words text-ink-soft ${m.items.length > 0 ? 'mt-1.5 border-t border-line pt-1.5' : ''}`}
              data-testid="forecast-note"
            >
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                <NoteIcon size={13} />
              </span>
              <span className="min-w-0">{note}</span>
            </p>
          )}
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

function MonthList({ f, notes, selected }: { f: YearForecast; notes: Map<Period, string>; selected: Period | null }) {
  const [open, setOpen] = useState<Period | null>(null);
  return (
    <ul role="list" aria-label="Fällige Ausgaben der nächsten 12 Monate" className="lg:hidden" data-testid="forecast-list">
      {f.months.map((m) => (
        <MonthRow
          key={m.period}
          m={m}
          note={notes.get(m.period)}
          open={open === m.period}
          selected={selected === m.period}
          onToggle={() => setOpen((p) => (p === m.period ? null : m.period))}
        />
      ))}
    </ul>
  );
}

/** From iPad landscape: a real table, items as a list in the third column. */
function MonthTable({ f, notes, selected }: { f: YearForecast; notes: Map<Period, string>; selected: Period | null }) {
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
          <tr
            key={m.period}
            className={`border-t border-line align-top ${selected === m.period ? 'bg-accent-soft' : ''}`}
            data-period={m.period}
            data-selected={selected === m.period || undefined}
          >
            <th scope="row" className="whitespace-nowrap py-2 pl-2 font-normal text-ink">
              <span className="flex items-center gap-2">
                {shortPeriodLabel(m.period)}
                {notes.has(m.period) && (
                  <span className="text-ink-mute" role="img" aria-label={NOTE_LABEL} title={NOTE_LABEL} data-testid="forecast-note-icon">
                    <NoteIcon size={13} />
                  </span>
                )}
              </span>
            </th>
            <td className="num whitespace-nowrap py-2 pr-4 text-right font-semibold text-ink">{formatEUR(m.due)}</td>
            <td className="py-2 pr-2 text-ink-soft">
              {m.items.length === 0 && !notes.has(m.period) ? <span className="text-ink-faint">–</span> : <ItemLines items={m.items} />}
              {notes.has(m.period) && (
                <p className={`whitespace-pre-line break-words text-ink-mute ${m.items.length > 0 ? 'mt-1' : ''}`} data-testid="forecast-note">
                  {notes.get(m.period)}
                </p>
              )}
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

/**
 * Month label of the x axis. The active month (the first one) is marked here only – brand colour,
 * bold – its bars look like all others (no outline on any bar).
 */
function MonthTick({ x, y, payload, narrow, active }: { x?: number | string; y?: number | string; payload?: { value: Period }; narrow: boolean; active?: Period }) {
  if (!payload) return null;
  const name = shortMonthName(monthOf(payload.value));
  const isActive = payload.value === active;
  return (
    <text
      x={x}
      y={y}
      dy="0.71em"
      textAnchor="middle"
      fontSize={AXIS_TICK.fontSize}
      fill={isActive ? COLORS.activeTick : AXIS_TICK.fill}
      fontWeight={isActive ? 700 : undefined}
      data-testid="forecast-tick"
      data-active={isActive || undefined}
    >
      {/* below 430 px one letter (O N D J …), from there three letters (Okt Nov Dez …) */}
      {narrow ? name.charAt(0) : name}
    </text>
  );
}

export function ForecastSection({ ds, today }: { ds: Dataset; today: Period }) {
  const f = yearForecast(ds, today);
  const summary = forecastSummary(f);
  const narrow = useNarrow();
  // tapped bar: its row in „Details“ is highlighted
  const [selected, setSelected] = useState<Period | null>(null);
  const active = f.months[0]?.period;
  // the bar itself, not the chart: the chart's click state still holds the previous hover
  const selectBar = (bar: { payload?: { period?: Period } }) => {
    if (bar.payload?.period) setSelected(bar.payload.period);
  };
  const notes = new Map(ds.monthClose.filter((c) => c.note).map((c) => [c.period, c.note!] as const));
  const rows = f.months.map((m) => ({
    ...m,
    // stacked: regular fixed costs below (their mean is the Ø line), one-time payments and one-offs on top
    recurring: m.regular,
  }));
  const hasOnce = f.months.some((m) => m.extra !== 0);
  const avgText = `Ø ${formatEUR(Math.round(f.average)).replace(/^€\s/, '')}`;
  return (
    <ChartCard
      id="forecast"
      title="Jahresvorschau"
      period={forecastRange(f)}
      headline={summary}
      details={
        <>
          <MonthList f={f} notes={notes} selected={selected} />
          <MonthTable f={f} notes={notes} selected={selected} />
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
        className="h-[230px] max-[429px]:-mx-2"
        role="img"
        aria-label={`Balkendiagramm: fällige Ausgaben pro Monat, ${shortPeriodLabel(f.months[0]!.period)} bis ${shortPeriodLabel(f.months[f.months.length - 1]!.period)}, Ø pro Monat (aktiver Monat) ${formatEUR(f.average)}`}
      >
        <DeferredChart>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <BarChart
            data={rows}
            margin={{ ...CHART_MARGIN, right: CHIP_ROOM }}
            accessibilityLayer
            barCategoryGap="22%"
          >
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis
              dataKey="period"
              {...xAxisProps}
              interval={0}
              tick={(props: { x?: number | string; y?: number | string; payload?: { value: Period } }) => <MonthTick {...props} narrow={narrow} active={active} />}
            />
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
                  <TooltipBox title={periodLabel(m.period)} badge={m.period === active ? 'aktiv' : undefined}>
                    <TooltipRow label="Summe" value={formatEUR(m.due)} />
                    <TooltipRow label="davon einmalig" value={formatEUR(m.once)} swatch={COLORS.accentLight} />
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
              onClick={selectBar}
            >
              {/* regular part: one colour; the Ø line shows which months lie above */}
              {rows.map((m) => (
                <Cell key={m.period} fill={COLORS.accent} />
              ))}
            </Bar>
            {hasOnce && (
              <Bar
                dataKey="extra"
                stackId="due"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
                name="Einmalig"
                fill={COLORS.accentLight}
                className="bar-once"
                onClick={selectBar}
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
        </DeferredChart>
      </div>
      <p
        className="mt-2 flex items-center justify-center gap-x-3 whitespace-nowrap text-[12px] text-ink-mute"
        data-testid="forecast-legend"
      >
        <span className="flex items-center gap-1.5" data-testid="legend-regular">
          <span className="h-2 w-2 rounded-full" style={{ background: COLORS.accent }} aria-hidden="true" />
          regulär
        </span>
        {hasOnce && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS.accentLight }} aria-hidden="true" />
            einmalig
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.avg }} aria-hidden="true" />
          Ø pro Monat (aktiver Monat)
        </span>
      </p>
    </ChartCard>
  );
}
