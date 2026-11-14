import type { ScaleLinear } from 'd3';
import { shortDate } from './format';

/**
 * Horizontal gridlines and tick labels for one y-axis (one per chart: never a
 * dual axis). Labels sit left of the plot in mono 11px muted ink.
 */
export function YAxis(props: {
  y: ScaleLinear<number, number>;
  left: number;
  right: number;
  ticks: number;
  format: (v: number) => string;
}) {
  const { y, left, right, ticks, format } = props;
  return (
    <g className="hc-yaxis" data-axis="y">
      {y.ticks(ticks).map((t) => (
        <g key={t}>
          <line className="hc-grid" x1={left} x2={right} y1={y(t)} y2={y(t)} />
          <text className="hc-tick" x={left - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Date labels under a time axis, thinned so labels stay at least `minGap` px
 * apart (no vertical gridlines on time axes; DESIGN.md).
 */
export function XAxis(props: { dates: string[]; xs: number[]; y: number; left: number; right: number; minGap?: number }) {
  const { dates, xs, y, left, right, minGap = 56 } = props;
  const step = xs.length > 1 ? Math.max(1, Math.ceil(minGap / Math.max(1, xs[1] - xs[0]))) : 1;
  return (
    <g className="hc-xaxis" data-axis="x">
      <line className="hc-baseline" x1={left} x2={right} y1={y} y2={y} />
      {dates.map((d, i) =>
        // Centred labels; skip one that would run past the plot's right edge.
        i % step === 0 && xs[i] + 22 <= right + 12 ? (
          <text key={d} className="hc-tick" x={xs[i]} y={y + 16} textAnchor="middle">
            {shortDate(d)}
          </text>
        ) : null,
      )}
    </g>
  );
}
