import { usePlotArea, useYAxisScale } from 'recharts';
import { formatCompactEUR } from '../../lib/format';

// CSS variables from index.css: charts follow light / dark without re-rendering.
export const COLORS = {
  accent: 'var(--chart-accent)',
  accentLight: 'var(--chart-accent-light)',
  neutral: 'var(--chart-neutral)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  ink: 'var(--chart-ink)',
  inkSoft: 'var(--chart-ink-soft)',
  over: 'var(--chart-over)',
  paid: 'var(--chart-paid)',
  surface: 'var(--chart-surface)',
};

export const AXIS_TICK = { fill: COLORS.axis, fontSize: 11 };

export const yAxisProps = {
  tickFormatter: formatCompactEUR,
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
  width: 52,
} as const;

export const xAxisProps = {
  tick: AXIS_TICK,
  axisLine: { stroke: COLORS.grid },
  tickLine: false,
  minTickGap: 6,
} as const;

export const CHART_MARGIN = { top: 22, right: 4, bottom: 0, left: 0 };

/** Fixed at the top of the plot so the finger never covers it. */
export const tooltipProps = {
  position: { y: 0 },
  isAnimationActive: false,
  allowEscapeViewBox: { x: false, y: true },
  cursor: { fill: 'var(--chart-cursor)' },
  wrapperStyle: { zIndex: 10, outline: 'none' },
} as const;

export interface GroupLabel {
  key: string;
  /** category value on the x axis */
  x: string;
  /** top of the group in data units */
  y: number;
  text: string;
  color?: string;
  /** always shown as text, even in narrow bands (right-aligned) */
  keepText?: boolean;
}

/**
 * Text centred above each bar group (e.g. the difference of two bars). When a
 * band is too narrow for the number, a coloured dot keeps the signal; the exact
 * value is in the tooltip and the table.
 */
export function GroupLabels({
  labels,
  categories,
  minBand = 40,
}: {
  labels: GroupLabel[];
  /** all x values of the chart in order (one band each) */
  categories: string[];
  minBand?: number;
}) {
  const plot = usePlotArea();
  const yScale = useYAxisScale() as ((v: number) => number | undefined) | undefined;
  if (!plot || !yScale || categories.length === 0) return null;
  // category axis without padding: every value owns an equal band of the plot width
  const band = plot.width / categories.length;
  const wide = band >= minBand;
  return (
    <g data-testid="group-labels" data-mode={wide ? 'text' : 'dot'}>
      {labels.map((l) => {
        const index = categories.indexOf(l.x);
        const y = yScale(Math.max(l.y, 0));
        if (index < 0 || y === undefined) return null;
        const x = plot.x + index * band;
        const fill = l.color ?? COLORS.inkSoft;
        if (!wide && !l.keepText) return <circle key={l.key} cx={x + band / 2} cy={y - 7} r={3} fill={fill} />;
        return (
          <text
            key={l.key}
            x={wide ? x + band / 2 : x + band}
            y={y - 6}
            textAnchor={wide ? 'middle' : 'end'}
            fontSize={11}
            fontWeight={600}
            fill={fill}
            className="num"
          >
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Small markers on the time axis of a point chart (area/line) for the months
 * in `marked`; the tooltip of that month names the change.
 */
export function ChangeMarkers({ categories, marked }: { categories: string[]; marked: string[] }) {
  const plot = usePlotArea();
  if (!plot || categories.length === 0 || marked.length === 0) return null;
  const step = categories.length > 1 ? plot.width / (categories.length - 1) : 0;
  // just below the axis line, in the gap the x axis leaves above its labels (tickMargin)
  const y = plot.y + plot.height + 2;
  return (
    <g data-testid="change-markers" aria-hidden="true">
      {marked.map((label) => {
        const i = categories.indexOf(label);
        if (i < 0) return null;
        const x = plot.x + i * step;
        return <path key={label} d={`M${x} ${y} L${x + 5} ${y + 8} L${x - 5} ${y + 8} Z`} fill={COLORS.ink} />;
      })}
    </g>
  );
}
