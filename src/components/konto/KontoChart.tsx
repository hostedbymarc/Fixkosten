// Recharts lives in its own chunk: the month screen loads this file only when the sheet opens.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { axisPeriodLabel, shortPeriodLabel } from '../../lib/analytics';
import type { KontoSimulation } from '../../lib/fixkostenkonto';
import { formatEUR } from '../../lib/format';
import { t } from '../../lib/kontoTexts';
import { shortMonthName, monthOf } from '../../lib/period';
import type { Period } from '../../lib/types';
import { AXIS_TICK, COLORS, niceTicks, xAxisProps, yAxisProps } from '../analysis/chartTheme';

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

/** Month-end balance with the plan: a green dot per month (the plan never goes below 0, no warning marks). */
function BalanceDot({ cx, cy, payload, selected, onSelect }: DotProps & { selected: Period | null; onSelect: (p: Period) => void }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const isSelected = selected === payload.period;
  return (
    <g onClick={() => onSelect(payload.period)} style={{ cursor: 'pointer' }} data-testid="konto-dot" data-period={payload.period}>
      {/* 44 px hit area */}
      <circle cx={cx} cy={cy} r={22} fill="transparent" />
      <circle cx={cx} cy={cy} r={isSelected ? 6 : 4} fill={COLORS.accent} stroke={COLORS.surface} strokeWidth={2} />
    </g>
  );
}

export default function KontoChart({
  simulation,
  active,
  buffer = 0,
  selected,
  onSelect,
  height = 220,
}: {
  simulation: KontoSimulation;
  active: Period;
  /** Sicherheitspuffer: dashed line „Puffer € 100“ (none at 0) */
  buffer?: number;
  selected: Period | null;
  onSelect: (p: Period) => void;
  height?: number;
}) {
  const rows: Row[] = simulation.months.map((m) => ({
    period: m.period,
    end: m.end,
    deposit: m.deposit,
    debits: m.debits,
    negative: Math.round(m.end * 100) < 0,
  }));
  const values = rows.map((r) => r.end);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, buffer, 0));
  const first = rows[0];
  const last = rows[rows.length - 1];
  const negatives = rows.filter((r) => r.negative).length;
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Liniendiagramm: Verlauf mit Plan, Stand am Monatsende, ${first ? shortPeriodLabel(first.period) : ''} bis ${last ? shortPeriodLabel(last.period) : ''}${
        negatives ? `, ${negatives} ${negatives === 1 ? 'Monat' : 'Monate'} unter 0` : buffer > 0 ? `, nie unter ${formatEUR(buffer)}` : ', nie unter 0'
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
          <ReferenceLine y={0} stroke={COLORS.ink} strokeWidth={1.5} ifOverflow="extendDomain" data-testid="konto-zero-line" />
          {buffer > 0 && (
            <ReferenceLine
              y={buffer}
              stroke={COLORS.inkSoft}
              strokeDasharray="4 4"
              strokeWidth={1.25}
              ifOverflow="extendDomain"
              label={{ value: t('sheet.buffer', { betrag: formatEUR(buffer) }), position: 'insideBottomRight', fill: COLORS.inkSoft, fontSize: 11 }}
              data-testid="konto-buffer-line"
            />
          )}
          <Line
            type="linear"
            dataKey="end"
            stroke={COLORS.accent}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: DotProps) => <BalanceDot key={p.payload?.period} {...p} selected={selected} onSelect={onSelect} />}
            activeDot={false}
            name="Stand"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
