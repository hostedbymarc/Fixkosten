import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisPeriodLabel,
  burdenTrend,
  categoryDistribution,
  distributionHeadline,
  forecastHeadline,
  monthCloseHeadline,
  monthCloseSeries,
  optimizationTimeline,
  type OptimizationEntry,
  planVsActual,
  planVsActualHeadline,
  shortPeriodLabel,
  trendHeadline,
  trendTooShortText,
  yearForecast,
} from '../../lib/analytics';
import { formatCompactEUR, formatDelta, formatEUR, formatPercent, formatPercentShort } from '../../lib/format';
import { periodLabel, shortMonthName, monthOf } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { ChevronRight } from '../Icons';
import { formatIsoDate, planDescription } from '../Chips';
import { ChartCard, EmptyCard, TooltipBox, TooltipRow } from './ChartCard';
import {
  AXIS_TICK,
  CHART_MARGIN,
  COLORS,
  GroupLabels,
  tooltipProps,
  xAxisProps,
  yAxisProps,
} from './chartTheme';

// Recharts passes these to custom tooltip content
interface TipProps<T> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: T }>;
}
function tipRow<T>(props: TipProps<T>): T | null {
  return props.active && props.payload?.length ? (props.payload[0]!.payload ?? null) : null;
}

const money = (v: number | null) => (v === null ? '–' : formatEUR(v));
/** '+€ 7,40' → compact for labels above bars: '+€ 7', '−€ 147', '+€ 1,2k' */
const deltaCompact = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCompactEUR(Math.abs(v))}`;

// ---------------------------------------------------------------------------
// 1 · Year forecast
// ---------------------------------------------------------------------------

export function ForecastSection({ ds, today }: { ds: Dataset; today: Period }) {
  const f = yearForecast(ds, today);
  const rows = f.months.map((m) => ({ ...m, label: shortMonthName(monthOf(m.period)) }));
  return (
    <ChartCard
      id="forecast"
      title="Jahresvorschau"
      headline={forecastHeadline(f)}
      table={{
        caption: 'Fällige Ausgaben der nächsten 12 Monate',
        head: ['Monat', 'Fällig', 'davon nicht monatlich'],
        rows: f.months.map((m) => [
          periodLabel(m.period),
          formatEUR(m.due),
          m.items.map((i) => `${i.name} ${formatEUR(i.amount)}`).join(', ') || '–',
        ]),
      }}
    >
      <div className="h-[230px] w-full" role="img" aria-label={`Balkendiagramm: fällige Ausgaben pro Monat, ${shortPeriodLabel(f.months[0]!.period)} bis ${shortPeriodLabel(f.months[f.months.length - 1]!.period)}, Ø ${formatEUR(f.average)} pro Monat`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <BarChart data={rows} margin={CHART_MARGIN} accessibilityLayer barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              {...tooltipProps}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const m = tipRow(props);
                if (!m) return null;
                return (
                  <TooltipBox title={`${periodLabel(m.period)}: ${formatEUR(m.due)}`}>
                    {m.items.length === 0 ? (
                      <p>Nur monatliche Posten</p>
                    ) : (
                      m.items.map((i) => <TooltipRow key={i.name} label={i.name} value={formatEUR(i.amount)} />)
                    )}
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="due" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} name="Fällig">
              {rows.map((m) => (
                <Cell key={m.period} fill={m.aboveAverage ? COLORS.accent : COLORS.neutral} />
              ))}
            </Bar>
            <ReferenceLine
              y={f.average}
              stroke={COLORS.inkSoft}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: `Ø ${formatEUR(Math.round(f.average))}`,
                position: 'insideBottomLeft',
                fill: COLORS.inkSoft,
                fontSize: 11,
                fontWeight: 600,
                stroke: '#ffffff',
                strokeWidth: 3,
                paintOrder: 'stroke',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-mute">
        <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
        über dem Schnitt
        <span className="ml-2 h-0 w-4 border-t-2 border-dashed border-ink-soft" aria-hidden="true" />
        Ø pro Monat (umgelegt)
      </p>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 2 · Distribution (horizontal bars, tap to expand)
// ---------------------------------------------------------------------------

export function DistributionSection({ ds, today }: { ds: Dataset; today: Period }) {
  const d = categoryDistribution(ds, today);
  const [open, setOpen] = useState<string | null>(null);
  if (d.rows.length === 0) {
    return <EmptyCard id="distribution" title="Verteilung nach Kategorie" text="Noch keine Ausgaben erfasst." />;
  }
  const max = d.rows[0]!.monthly;
  return (
    <ChartCard
      id="distribution"
      title="Verteilung nach Kategorie"
      headline={distributionHeadline(d)}
      table={{
        caption: 'Umgelegte Ausgaben pro Monat nach Kategorie',
        head: ['Kategorie', 'Ø pro Monat', 'Anteil'],
        rows: d.rows.map((r) => [r.category.name, formatEUR(r.monthly), formatPercent(r.share)]),
      }}
    >
      <ul className="-mx-2 flex flex-col">
        {d.rows.map((r) => {
          const expanded = open === r.category.id;
          return (
            <li key={r.category.id} data-category={r.category.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : r.category.id)}
                className="focus-ring flex min-h-[52px] w-full flex-col justify-center gap-1.5 rounded-xl px-2 py-2 text-left hover:bg-zinc-50"
              >
                <span className="flex w-full items-baseline gap-2">
                  <ChevronRight
                    size={14}
                    className={`shrink-0 self-center text-ink-faint transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{r.category.name}</span>
                  <span className="num shrink-0 text-[15px] font-semibold text-ink">{formatEUR(r.monthly)}</span>
                  <span className="num w-[52px] shrink-0 text-right text-[13px] text-ink-mute">{formatPercent(r.share)}</span>
                </span>
                <span className="ml-[22px] block h-2 rounded-full bg-zinc-100" aria-hidden="true">
                  <span
                    className="block h-2 rounded-full"
                    style={{ width: `${(r.monthly / max) * 100}%`, background: r.category.color }}
                  />
                </span>
              </button>
              {expanded && (
                <ul className="mb-2 ml-[30px] mr-2 flex flex-col gap-2 border-l border-line py-1 pl-3" data-testid="distribution-positions">
                  {r.positions.map((p) => (
                    <li key={p.position.id} className="flex flex-col gap-1">
                      <span className="flex items-baseline gap-2 text-[14px]">
                        <span className="min-w-0 flex-1 truncate text-ink-soft">{p.position.name}</span>
                        <span className="num shrink-0 text-ink">{formatEUR(p.monthly)}</span>
                        <span className="num w-[52px] shrink-0 text-right text-[12px] text-ink-mute">{formatPercent(p.share)}</span>
                      </span>
                      <span className="block h-1.5 rounded-full bg-zinc-100" aria-hidden="true">
                        <span
                          className="block h-1.5 rounded-full opacity-70"
                          style={{ width: `${(p.monthly / max) * 100}%`, background: r.category.color }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 text-[13px] text-ink-mute">
        Summe <span className="num font-medium text-ink">{formatEUR(d.total)}</span> Ø pro Monat (umgelegt)
      </p>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 3 · Month close
// ---------------------------------------------------------------------------

export function MonthCloseSection({ ds, periods }: { ds: Dataset; periods: Period[] }) {
  const series = monthCloseSeries(ds, periods);
  const headline = monthCloseHeadline(series);
  if (headline === null) {
    return (
      <EmptyCard
        id="monthclose"
        title="Frei verfügbar & Sparquote"
        text="Noch kein Monatsabschluss im Zeitraum. Trag im Monat unter „Frei verfügbar“ Netto-Gehalt und den tatsächlichen Betrag ein."
      />
    );
  }
  const rows = series.map((r) => ({ ...r, label: axisPeriodLabel(r.period) }));
  const hasRate = rows.some((r) => r.savingsRate !== null);
  return (
    <ChartCard
      id="monthclose"
      title="Frei verfügbar & Sparquote"
      headline={headline}
      table={{
        caption: 'Frei verfügbar rechnerisch und tatsächlich, Sparquote',
        head: ['Monat', 'Rechnerisch', 'Tatsächlich', 'Differenz', 'Sparquote'],
        rows: series.map((r) => [
          periodLabel(r.period),
          money(r.calculated),
          money(r.actual),
          r.gap === null ? '–' : formatDelta(r.gap),
          r.savingsRate === null ? '–' : formatPercent(r.savingsRate),
        ]),
      }}
    >
      <div className="h-[230px] w-full" role="img" aria-label="Balkendiagramm: frei verfügbar, rechnerisch und tatsächlich pro Monat">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <BarChart data={rows} margin={CHART_MARGIN} accessibilityLayer barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <ReferenceLine y={0} stroke={COLORS.grid} />
            <Tooltip
              {...tooltipProps}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const r = tipRow(props);
                if (!r) return null;
                return (
                  <TooltipBox title={periodLabel(r.period)}>
                    {r.calculated === null && r.actual === null ? (
                      <p>Kein Monatsabschluss</p>
                    ) : (
                      <>
                        <TooltipRow label="Rechnerisch" value={money(r.calculated)} swatch={COLORS.neutral} />
                        <TooltipRow label="Tatsächlich" value={money(r.actual)} swatch={COLORS.accent} />
                        {r.gap !== null && <TooltipRow label="Differenz" value={formatDelta(r.gap)} />}
                      </>
                    )}
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="calculated" fill={COLORS.neutral} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} name="Rechnerisch" />
            <Bar dataKey="actual" fill={COLORS.accent} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} name="Tatsächlich" />
            <GroupLabels
              categories={rows.map((r) => r.label)}
              labels={rows
                .filter((r) => r.gap !== null)
                .map((r) => ({
                  key: r.period,
                  x: r.label,
                  y: Math.max(r.calculated ?? 0, r.actual ?? 0),
                  text: deltaCompact(r.gap!),
                  color: r.gap! < 0 ? COLORS.over : r.gap! > 0 ? COLORS.paid : COLORS.inkSoft,
                }))}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-300" aria-hidden="true" />
          rechnerisch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
          tatsächlich
        </span>
        <span>darüber: Differenz</span>
      </p>
      {hasRate && (
        <div className="mt-4 border-t border-line pt-3" data-testid="savings-rate">
          <p className="text-[13px] font-medium text-ink-soft">Sparquote</p>
          <div className="h-[120px] w-full" role="img" aria-label="Liniendiagramm: Sparquote pro Monat in Prozent">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 120 }}>
              <LineChart data={rows} margin={{ ...CHART_MARGIN, top: 10 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" {...xAxisProps} />
                <YAxis
                  tickFormatter={formatPercentShort}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  domain={[0, (max: number) => Math.max(0.05, Math.ceil(max * 20) / 20)]}
                  tickCount={3}
                />
                <Tooltip
                  {...tooltipProps}
                  cursor={{ stroke: COLORS.grid }}
                  content={(props: TipProps<(typeof rows)[number]>) => {
                    const r = tipRow(props);
                    if (!r) return null;
                    return (
                      <TooltipBox title={periodLabel(r.period)}>
                        <TooltipRow label="Sparquote" value={r.savingsRate === null ? '–' : formatPercent(r.savingsRate)} />
                      </TooltipBox>
                    );
                  }}
                />
                <Line
                  dataKey="savingsRate"
                  stroke={COLORS.accent}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS.accent, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  name="Sparquote"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 4 · Trend of the spread burden
// ---------------------------------------------------------------------------

export function TrendSection({ ds, periods, today, months }: { ds: Dataset; periods: Period[]; today: Period; months: number }) {
  if (months < 3) {
    return <EmptyCard id="trend" title="Entwicklung der Fixkosten" text={trendTooShortText(ds, today)} />;
  }
  const t = burdenTrend(ds, periods);
  const rows = t.points.map((p) => ({
    period: p.period,
    label: axisPeriodLabel(p.period),
    total: p.total,
    ...Object.fromEntries(t.categories.map((c) => [`c_${c.id}`, p.byCategory[c.id] ?? 0])),
  }));
  const last = t.points[t.points.length - 1]!;
  return (
    <ChartCard
      id="trend"
      title="Entwicklung der Fixkosten"
      headline={trendHeadline(t)}
      table={{
        caption: 'Ø pro Monat (umgelegt) nach Kategorie',
        head: ['Monat', ...t.categories.map((c) => c.name), 'Gesamt'],
        rows: t.points.map((p) => [
          periodLabel(p.period),
          ...t.categories.map((c) => formatEUR(p.byCategory[c.id] ?? 0)),
          formatEUR(p.total),
        ]),
      }}
    >
      <div className="h-[230px] w-full" role="img" aria-label="Gestapeltes Flächendiagramm: Ø pro Monat nach Kategorie">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <AreaChart data={rows} margin={{ ...CHART_MARGIN, right: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              {...tooltipProps}
              cursor={{ stroke: COLORS.inkSoft, strokeDasharray: '3 3' }}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const r = tipRow(props);
                if (!r) return null;
                const point = t.points.find((p) => p.period === r.period)!;
                return (
                  <TooltipBox title={`${periodLabel(r.period)}: ${formatEUR(point.total)}`}>
                    {[...t.categories].reverse().map((c) => (
                      <TooltipRow key={c.id} label={c.name} value={formatEUR(point.byCategory[c.id] ?? 0)} swatch={c.color} />
                    ))}
                  </TooltipBox>
                );
              }}
            />
            {t.categories.map((c) => (
              <Area
                key={c.id}
                dataKey={`c_${c.id}`}
                name={c.name}
                stackId="burden"
                type="linear"
                stroke="#ffffff"
                strokeWidth={1}
                fill={c.color}
                fillOpacity={1}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft" aria-label="Kategorien">
        {[...t.categories].reverse().map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden="true" />
            {c.name}
            <span className="num text-ink">{formatEUR(last.byCategory[c.id] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 5 · Plan vs. actual
// ---------------------------------------------------------------------------

export function PlanActualSection({ ds, periods, today }: { ds: Dataset; periods: Period[]; today: Period }) {
  const p = planVsActual(ds, periods, today);
  if (p.closedMonths === 0) {
    const running = p.rows[p.rows.length - 1];
    return (
      <EmptyCard
        id="planactual"
        title="Plan vs. Ist"
        text={`${running ? `${periodLabel(running.period)} läuft noch: ${formatEUR(running.actual)} von ${formatEUR(running.planned)} abgebucht. ` : ''}Der Vergleich startet, sobald der erste Monat abgeschlossen ist.`}
      />
    );
  }
  const rows = p.rows.map((r) => ({ ...r, label: axisPeriodLabel(r.period) }));
  return (
    <ChartCard
      id="planactual"
      title="Plan vs. Ist"
      headline={planVsActualHeadline(p)}
      table={{
        caption: 'Geplante und tatsächlich abgebuchte Ausgaben pro Monat',
        head: ['Monat', 'Plan', 'Ist', 'Differenz'],
        rows: p.rows.map((r) => [
          periodLabel(r.period),
          formatEUR(r.planned),
          formatEUR(r.actual),
          r.running ? 'läuft' : formatDelta(r.delta!),
        ]),
      }}
    >
      <div className="h-[230px] w-full" role="img" aria-label="Balkendiagramm: Plan und Ist pro Monat">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <BarChart data={rows} margin={CHART_MARGIN} accessibilityLayer barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              {...tooltipProps}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const r = tipRow(props);
                if (!r) return null;
                return (
                  <TooltipBox title={`${periodLabel(r.period)}${r.running ? ' (läuft)' : ''}`}>
                    <TooltipRow label="Plan" value={formatEUR(r.planned)} swatch={COLORS.neutral} />
                    <TooltipRow label="Ist" value={formatEUR(r.actual)} swatch={COLORS.accent} />
                    {!r.running && <TooltipRow label={r.delta! > 0 ? 'teurer' : 'günstiger'} value={formatDelta(r.delta!)} />}
                  </TooltipBox>
                );
              }}
            />
            <Bar dataKey="planned" fill={COLORS.neutral} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} name="Plan" />
            <Bar dataKey="actual" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} name="Ist">
              {rows.map((r) => (
                <Cell key={r.period} fill={r.running ? COLORS.accentLight : COLORS.accent} />
              ))}
            </Bar>
            <GroupLabels
              categories={rows.map((r) => r.label)}
              labels={rows.map((r) => ({
                key: r.period,
                x: r.label,
                y: Math.max(r.planned, r.actual),
                text: r.running ? 'läuft' : deltaCompact(r.delta!),
                keepText: r.running,
                color: r.running ? COLORS.axis : r.delta! > 0 ? COLORS.over : r.delta! < 0 ? COLORS.paid : COLORS.inkSoft,
              }))}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-zinc-300" aria-hidden="true" />
          Plan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
          Ist
        </span>
        <span>
          <span className="text-over">teurer</span> / <span className="text-paid">günstiger</span>
        </span>
      </p>
      {p.topDeviations.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-[13px] font-medium text-ink-soft">Größte Abweichungen im Zeitraum</h3>
          <ol className="mt-1 divide-y divide-line" data-testid="top-deviations">
            {p.topDeviations.map((d) => (
              <li key={`${d.positionName}-${d.period}-${d.label ?? ''}`} className="flex items-baseline gap-3 py-2 text-[14px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{d.positionName}</span>
                  <span className="block truncate text-[12px] text-ink-mute">
                    {shortPeriodLabel(d.period)}
                    {d.label ? ` · ${d.label}` : ''}
                  </span>
                </span>
                <span className={`num shrink-0 font-semibold ${d.delta > 0 ? 'text-over' : 'text-paid'}`}>{formatDelta(d.delta)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 6 · Optimisations
// ---------------------------------------------------------------------------

export function OptimizationSection({ ds, today }: { ds: Dataset; today: Period }) {
  const t = optimizationTimeline(ds, today);
  if (t.entries.length === 0) {
    return (
      <EmptyCard
        id="optimizations"
        title="Optimierungen"
        text="Noch keine Änderungen. Wenn du einen Vertrag günstiger machst, siehst du hier, was es bringt."
      />
    );
  }
  const planned = t.entries.filter((e) => e.planned);
  const implemented = t.entries.filter((e) => !e.planned);
  return (
    <section aria-labelledby="optimizations-title" data-testid="optimizations">
      <h2 id="optimizations-title" className="section-title mb-2 px-1">
        Optimierungen
      </h2>
      <div className="card p-4">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[15px] font-medium text-ink" data-testid="optimizations-headline">
          {implemented.length > 0 && (
            <span>
              Umgesetzt: <DeltaPerYear value={t.implementedAnnual} />
            </span>
          )}
          {implemented.length > 0 && planned.length > 0 && <span aria-hidden="true">·</span>}
          {planned.length > 0 && (
            <span>
              Geplant: <DeltaPerYear value={t.plannedAnnual} />
            </span>
          )}
        </p>
        {planned.length > 0 && <OptimizationList title="Geplant" entries={planned} testId="optimizations-planned" />}
        {implemented.length > 0 && <OptimizationList title="Umgesetzt" entries={implemented} testId="optimizations-list" />}
      </div>
    </section>
  );
}

function DeltaPerYear({ value }: { value: number }) {
  const c = Math.round(value * 100);
  return <span className={`num font-semibold ${c < 0 ? 'text-paid' : c > 0 ? 'text-over' : 'text-ink'}`}>{formatDelta(value)} / Jahr</span>;
}

function OptimizationList({ title, entries, testId }: { title: string; entries: OptimizationEntry[]; testId: string }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-[13px] font-medium text-ink-soft">{title}</h3>
      <ol className="flex flex-col" data-testid={testId}>
        {entries.map((e) => {
          const saves = e.annualDelta < 0;
          const sameSchedule = planDescription(e.from) === planDescription(e.to);
          return (
            <li key={e.id} className="relative flex gap-3 pb-4 pl-5 last:pb-0">
              <span
                className={`absolute left-0 top-[7px] h-2.5 w-2.5 rounded-full ${
                  e.planned ? 'border-2 bg-white ' + (saves ? 'border-paid' : 'border-over') : saves ? 'bg-paid' : e.annualDelta > 0 ? 'bg-over' : 'bg-zinc-300'
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">
                  <span className="font-medium">{e.position.name}</span>{' '}
                  <span className="num">
                    {formatEUR(e.from.amount)} → {formatEUR(e.to.amount)}
                  </span>
                  {e.planned && (
                    <span className="ml-2 inline-flex h-[20px] items-center rounded-md bg-accent-soft px-1.5 align-middle text-[12px] font-medium text-accent-strong">
                      geplant
                    </span>
                  )}
                </span>
                <span className="block text-[13px] text-ink-mute">
                  ab {formatIsoDate(e.changedOn)}
                  {e.reason && ` · ${e.reason}`}
                  {!sameSchedule && ` · ${planDescription(e.from)} → ${planDescription(e.to)}`}
                </span>
              </span>
              <span className={`num shrink-0 text-[14px] font-semibold ${saves ? 'text-paid' : e.annualDelta > 0 ? 'text-over' : 'text-ink-mute'}`}>
                {saves ? `spart ${formatEUR(-e.annualDelta)}/Jahr` : `${formatDelta(e.annualDelta)}/Jahr`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
