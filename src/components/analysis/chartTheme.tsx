import { usePlotArea, useYAxisScale } from 'recharts';
import { formatCompactEUR } from '../../lib/format';

export const COLORS = {
  accent: '#5B5BD6',
  accentLight: '#C7C7F2',
  neutral: '#D4D4D8',
  grid: '#EDEDED',
  axis: '#71717A',
  ink: '#18181B',
  inkSoft: '#52525B',
  over: '#DC2626',
  paid: '#16A34A',
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
  cursor: { fill: 'rgba(24,24,27,0.05)' },
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
