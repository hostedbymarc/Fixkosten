// Recharts lives in its own chunk: the month screen loads this file only when the sheet opens.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisPeriodLabel, shortPeriodLabel } from '../../lib/analytics';
import type { KontoOverview } from '../../lib/fixkostenkonto';
import { formatEUR } from '../../lib/format';
import { periodLabel, shortMonthName, monthOf } from '../../lib/period';
import type { Period } from '../../lib/types';
import { TooltipBox, TooltipRow } from '../analysis/ChartCard';
import { AXIS_TICK, COLORS, niceTicks, tooltipProps, xAxisProps, yAxisProps } from '../analysis/chartTheme';

interface Row {
  period: Period;
  end: number;
  deposit: number;
  debits: number;
  negative: boolean;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: Row;
}

/**
 * Month-end balance: a dot per month. Below 0: red, larger, with a „!“ inside (never colour only;
 * the amount in the tooltip and the list carries the minus sign).
 */
function BalanceDot({ cx, cy, payload, selected, onSelect }: DotProps & { selected: Period | null; onSelect: (p: Period) => void }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const isSelected = selected === payload.period;
  return (
    <g
      onClick={() => onSelect(payload.period)}
      style={{ cursor: 'pointer' }}
      data-testid="konto-dot"
      data-period={payload.period}
      data-negative={payload.negative || undefined}
    >
      {/* 44 px hit area */}
      <circle cx={cx} cy={cy} r={22} fill="transparent" />
      {payload.negative ? (
        <>
          <circle cx={cx} cy={cy} r={isSelected ? 9 : 8} fill={COLORS.over} stroke={COLORS.surface} strokeWidth={2} />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={COLORS.surface}>
            !
          </text>
        </>
      ) : (
        <circle cx={cx} cy={cy} r={isSelected ? 6 : 4} fill={COLORS.accent} stroke={COLORS.surface} strokeWidth={2} />
      )}
    </g>
  );
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
}

export default function KontoChart({
  overview,
  active,
  selected,
  onSelect,
  height = 220,
}: {
  overview: KontoOverview;
  active: Period;
  selected: Period | null;
  onSelect: (p: Period) => void;
  height?: number;
}) {
  const rows: Row[] = overview.simulation.months.map((m) => ({
    period: m.period,
    end: m.end,
    deposit: m.deposit,
    debits: m.debits,
    negative: Math.round(m.end * 100) < 0,
  }));
  const values = rows.map((r) => r.end);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0));
  const first = rows[0];
  const last = rows[rows.length - 1];
  const negatives = rows.filter((r) => r.negative).length;
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Liniendiagramm: Kontostand am Monatsende, ${first ? shortPeriodLabel(first.period) : ''} bis ${last ? shortPeriodLabel(last.period) : ''}${
        negatives ? `, ${negatives} ${negatives === 1 ? 'Monat' : 'Monate'} unter 0` : ', nie unter 0'
      }`}
      data-testid="konto-chart"
    >
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
        <LineChart data={rows} margin={{ top: 14, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis
            dataKey="period"
            {...xAxisProps}
            interval={0}
            tickFormatter={(p: Period) => (p === active ? axisPeriodLabel(p) : shortMonthName(monthOf(p)).slice(0, 1))}
            tick={{ ...AXIS_TICK }}
          />
          <YAxis {...yAxisProps} ticks={ticks} domain={[ticks[0]!, ticks[ticks.length - 1]!]} />
          <ReferenceLine y={0} stroke={COLORS.over} strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Tooltip
            {...tooltipProps}
            cursor={{ stroke: COLORS.grid }}
            content={(props: TipProps) => {
              const m = props.active && props.payload?.length ? (props.payload[0]!.payload ?? null) : null;
              if (!m) return null;
              return (
                <TooltipBox title={periodLabel(m.period)} badge={m.period === active ? 'aktiv' : undefined}>
                  <TooltipRow label="Einzahlung" value={`+${formatEUR(m.deposit)}`} />
                  <TooltipRow label="Abbuchungen" value={formatEUR(-m.debits)} />
                  <TooltipRow label={m.negative ? 'Stand (unter 0!)' : 'Stand'} value={formatEUR(m.end)} swatch={m.negative ? COLORS.over : COLORS.accent} />
                </TooltipBox>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="end"
            stroke={COLORS.accent}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: DotProps) => <BalanceDot key={p.payload?.period} {...p} selected={selected} onSelect={onSelect} />}
            activeDot={false}
            name="Kontostand"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
