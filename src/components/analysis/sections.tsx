import { useState } from 'react';
import { categoryColor } from '../../lib/categoryColors';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisPeriodLabel,
  burdenTrend,
  categoryDistribution,
  distributionSummary,
  optimizationTimeline,
  type OptimizationEntry,
  planVsActual,
  planActualSummary,
  shortPeriodLabel,
  trendSummary,
  trendTooShortText,
  type TrendChange,
} from '../../lib/analytics';
import { formatCompactEUR, formatDelta, formatAvg, formatEUR, formatPercent } from '../../lib/format';
import { periodLabel } from '../../lib/period';
import type { Dataset, Period } from '../../lib/types';
import { Disclosure } from '../Disclosure';
import { formatIsoDate, planDescription } from '../Chips';
import { ChartCard, EmptyCard, TooltipBox, TooltipRow } from './ChartCard';
import {
  CHART_MARGIN,
  COLORS,
  ChangeMarkers,
  niceTicks,
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

/** '+€ 7,40' → compact for labels above bars: '+€ 7', '−€ 147', '+€ 1,2k' */
const deltaCompact = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCompactEUR(Math.abs(v))}`;

// ---------------------------------------------------------------------------
// 1 · Year forecast
// ---------------------------------------------------------------------------

export { ForecastSection } from './Forecast';

// ---------------------------------------------------------------------------
// 2 · Distribution (horizontal bars, tap to expand)
// ---------------------------------------------------------------------------

export function DistributionSection({ ds, today }: { ds: Dataset; today: Period }) {
  const d = categoryDistribution(ds, today);
  const [open, setOpen] = useState<string | null>(null);
  if (d.rows.length === 0) {
    return <EmptyCard id="distribution" title="Verteilung nach Kategorie" text="Noch keine Ausgaben erfasst." />;
  }
  return (
    <ChartCard id="distribution" title="Verteilung nach Kategorie" headline={distributionSummary(d)}>
      {/* the list says it all; screen readers additionally get the numbers as a table */}
      <div className="sr-only">
      <table>
        <caption>Umgelegte Ausgaben pro Monat nach Kategorie</caption>
        <thead>
          <tr>
            <th scope="col">Kategorie</th>
            <th scope="col">Ø pro Monat</th>
            <th scope="col">Anteil</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.category.id}>
              <th scope="row">{r.category.name}</th>
              <td>{formatAvg(r.monthly)}</td>
              <td>{formatPercent(r.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="flex flex-col" data-testid="distribution-list">
        {d.rows.map((r) => {
          const expanded = open === r.category.id;
          return (
            <li key={r.category.id} data-category={r.category.id} className="-mx-2">
              <Disclosure
                expanded={expanded}
                onToggle={() => setOpen(expanded ? null : r.category.id)}
                buttonClassName="flex-wrap rounded-xl px-2 py-2 hover:bg-zinc-50"
                header={
                  <>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{r.category.name}</span>
                    <span className="num shrink-0 whitespace-nowrap text-[15px] font-semibold text-ink">{formatAvg(r.monthly)}</span>
                    <span className="num w-[52px] shrink-0 whitespace-nowrap text-right text-[13px] text-ink-mute" data-testid="share">
                      {formatPercent(r.share)}
                    </span>
                    {/* bar length = the percentage shown: share of the total */}
                    <span className="block h-2 rounded-full bg-zinc-100" aria-hidden="true" style={{ marginLeft: 24, width: 'calc(100% - 24px)' }}>
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${r.share * 100}%`, background: categoryColor(r.category.color) }}
                        data-testid="share-bar"
                      />
                    </span>
                  </>
                }
              >
                <div className="mb-2 ml-[30px] mr-2 border-l border-line py-1 pl-3" data-testid="distribution-positions">
                  <p className="mb-1.5 text-[12px] text-ink-mute">Anteil an {r.category.name}</p>
                  <ul className="flex flex-col gap-2">
                    {r.positions.map((p) => {
                      const within = r.monthly > 0 ? p.monthly / r.monthly : 0;
                      return (
                        <li key={p.position.id} className="flex flex-col gap-1">
                          <span className="flex items-baseline gap-2 text-[14px]">
                            <span className="min-w-0 flex-1 truncate text-ink-soft">{p.position.name}</span>
                            <span className="num shrink-0 whitespace-nowrap text-ink">{formatAvg(p.monthly)}</span>
                            <span className="num w-[52px] shrink-0 whitespace-nowrap text-right text-[12px] text-ink-mute" data-testid="share">
                              {formatPercent(within)}
                            </span>
                          </span>
                          {/* bar length = share of the category, like the percentage next to it */}
                          <span className="block h-1.5 rounded-full bg-zinc-100" aria-hidden="true">
                            <span
                              className="block h-1.5 rounded-full opacity-70"
                              style={{ width: `${within * 100}%`, background: categoryColor(r.category.color) }}
                              data-testid="share-bar"
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Disclosure>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[13px] text-ink-mute" data-testid="distribution-total">
        Summe <span className="num font-medium text-ink">{formatAvg(d.total)}</span> Ø pro Monat (heute)
      </p>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 4 · Trend of the spread burden
// ---------------------------------------------------------------------------

/** 'Miete +€ 42/Monat · Indexanpassung' */
function changeText(c: TrendChange): string {
  return `${c.positionName} ${formatDelta(c.monthlyDelta)}/Monat${c.reason ? ` · ${c.reason}` : ''}`;
}

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
      headline={trendSummary(t)}
      table={{
        caption: 'Ø pro Monat (umgelegt) nach Kategorie',
        head: ['Monat', ...t.categories.map((c) => c.name), 'Gesamt'],
        rows: t.points.map((p) => [
          periodLabel(p.period),
          ...t.categories.map((c) => formatAvg(p.byCategory[c.id] ?? 0)),
          formatAvg(p.total),
        ]),
      }}
    >
      <div className="h-[230px] w-full" role="img" aria-label="Gestapeltes Flächendiagramm: Ø pro Monat nach Kategorie">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
          <AreaChart data={rows} margin={{ ...CHART_MARGIN, right: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={COLORS.grid} />
            <XAxis dataKey="label" {...xAxisProps} tickMargin={12} height={40} />
            <YAxis {...yAxisProps} />
            <Tooltip
              {...tooltipProps}
              cursor={{ stroke: COLORS.inkSoft, strokeDasharray: '3 3' }}
              content={(props: TipProps<(typeof rows)[number]>) => {
                const r = tipRow(props);
                if (!r) return null;
                const point = t.points.find((p) => p.period === r.period)!;
                return (
                  <TooltipBox title={`${periodLabel(r.period)}: ${formatAvg(point.total)}`}>
                    {[...t.categories].reverse().map((c) => (
                      <TooltipRow key={c.id} label={c.name} value={formatAvg(point.byCategory[c.id] ?? 0)} swatch={categoryColor(c.color)} />
                    ))}
                    {(t.changes[r.period] ?? []).map((c) => (
                      <p key={c.positionName} className="mt-1 border-t border-line pt-1 text-ink" data-testid="trend-change">
                        ▲ {changeText(c)}
                      </p>
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
                stroke={COLORS.surface}
                strokeWidth={1}
                fill={categoryColor(c.color)}
                fillOpacity={1}
                isAnimationActive={false}
              />
            ))}
            <ChangeMarkers categories={rows.map((r) => r.label)} marked={rows.filter((r) => t.changes[r.period]).map((r) => r.label)} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft" aria-label="Kategorien">
        {[...t.categories].reverse().map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: categoryColor(c.color) }} aria-hidden="true" />
            {c.name}
            <span className="num text-ink">{formatAvg(last.byCategory[c.id] ?? 0)}</span>
          </li>
        ))}
        {Object.keys(t.changes).length > 0 && (
          <li className="flex items-center gap-1.5 text-ink-mute">
            <span aria-hidden="true">▲</span> Betragsänderung
          </li>
        )}
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
  const ticks = niceTicks(0, Math.max(...rows.flatMap((r) => [r.planned, r.actual])));
  return (
    <ChartCard
      id="planactual"
      title="Plan vs. Ist"
      headline={planActualSummary(p)}
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
            <YAxis {...yAxisProps} ticks={ticks} domain={[0, ticks[ticks.length - 1]!]} interval={0} />
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
                color: r.running ? COLORS.axis : r.delta! > 0 ? COLORS.over : r.delta! < 0 ? COLORS.paidText : COLORS.inkSoft,
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
          <span className="text-over">teurer</span> / <span className="text-paid-ink">günstiger</span>
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
                <span className={`num shrink-0 font-semibold ${d.delta > 0 ? 'text-over' : 'text-paid-ink'}`}>{formatDelta(d.delta)}</span>
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
      <div className="glass flex flex-col gap-5 p-4">
        {planned.length > 0 && <OptimizationList title="Geplant" total={t.plannedAnnual} entries={planned} testId="optimizations-planned" />}
        {implemented.length > 0 && (
          <OptimizationList title="Umgesetzt" total={t.implementedAnnual} entries={implemented} testId="optimizations-list" />
        )}
      </div>
    </section>
  );
}

/** '+€ 27,80/Jahr' red for a rise, brand for a saving, always signed. */
function deltaClass(value: number): string {
  const c = Math.round(value * 100);
  return c > 0 ? 'text-over' : c < 0 ? 'text-accent-ink' : 'text-ink-mute';
}

function OptimizationList({ title, total, entries, testId }: { title: string; total: number; entries: OptimizationEntry[]; testId: string }) {
  return (
    <div>
      <h3 className="mb-1 text-[13px] font-medium text-ink-mute" data-testid={`${testId}-head`}>
        {title} · <span className={`num whitespace-nowrap font-semibold ${deltaClass(total)}`}>{formatDelta(total)} / Jahr</span>
      </h3>
      <ol className="flex flex-col divide-y divide-line" data-testid={testId}>
        {entries.map((e) => {
          const sameSchedule = planDescription(e.from) === planDescription(e.to);
          return (
            <li key={e.id} className="flex items-start gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">
                  <span className="font-medium">{e.position.name}</span>{' '}
                  <span className="num whitespace-nowrap">
                    {formatEUR(e.from.amount)} → {formatEUR(e.to.amount)}
                  </span>
                </span>
                <span className="block text-[13px] text-ink-mute">
                  ab {formatIsoDate(e.changedOn)}
                  {e.reason && ` · ${e.reason}`}
                  {!sameSchedule && ` · ${planDescription(e.from)} → ${planDescription(e.to)}`}
                </span>
              </span>
              <span className={`num shrink-0 whitespace-nowrap text-[14px] font-semibold ${deltaClass(e.annualDelta)}`}>
                {formatDelta(e.annualDelta)}/Jahr
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
