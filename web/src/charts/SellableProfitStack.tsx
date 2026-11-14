import { useMemo } from 'react';
import { line, scaleLinear } from 'd3';
import type { DayCard, ForecastRow, IsoDate } from './types';
import { bothFinding, bothHoldRuns, dayBand } from './chartMath';
import { euro, pctShare, shortDate } from './format';
import { useWidth } from './useWidth';
import { useActiveDay, Tooltip } from './Hover';
import { XAxis, YAxis } from './Axes';
import { ChartFrame } from './ChartFrame';

export interface SellableProfitStackProps {
  /** forecast.json rows for one room and one "today". */
  rows: ForecastRow[];
  /** days.json card (with D16 optimal_from / optimal_to, or merged from the fixture). */
  card: DayCard;
  /** Share of pots that must be sellable, 0–1 (shipping.meta.truck.earliest_sellable_share). */
  sellableTarget: number;
  onDetails?: (date: IsoDate) => void;
  caption?: string;
  title?: string;
}

/**
 * Sellable vs profit view (DESIGN.md): two small charts stacked on one date
 * axis — share of pots ready to sell (with the target line) on top, profit per
 * m² per day below — and one shared band over the days where both hold. Each
 * chart has its own y-axis; there is never a second axis on one chart.
 */
export function SellableProfitStack(props: SellableProfitStackProps) {
  const { card, sellableTarget, onDetails, title } = props;
  const rows = useMemo(() => [...props.rows].sort((a, b) => a.date.localeCompare(b.date)), [props.rows]);
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width < 520;
  const targetPct = Math.round(sellableTarget * 100);

  const dates = rows.map((r) => r.date);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const left = 46;
  const right = Math.max(left + 50, width - 12);
  const step = rows.length > 1 ? (right - left) / (rows.length - 1) : 0;
  const xOf = (i: number) => left + i * step;
  const xs = rows.map((_, i) => xOf(i));

  const panelH = narrow ? 96 : 120;
  const gap = 28;
  const topA = 22;
  const botA = topA + panelH;
  const topB = botA + gap;
  const botB = topB + panelH;
  const height = botB + 24;

  const yA = scaleLinear().domain([0, 100]).range([botA, topA]);
  const profits = rows.map((r) => r.profit_m2_day);
  const lo = Math.min(0, ...profits);
  const hi = Math.max(0, ...profits);
  const yB = scaleLinear()
    .domain([lo, hi === lo ? lo + 0.1 : hi])
    .nice(3)
    .range([botB, topB]);

  const lineA = line<ForecastRow>()
    .x((_, i) => xOf(i))
    .y((r) => yA(r.sellable_share * 100))(rows);
  const lineB = line<ForecastRow>()
    .x((_, i) => xOf(i))
    .y((r) => yB(r.profit_m2_day))(rows);

  const both = bothHoldRuns(rows, card, sellableTarget);
  const { active, handlers } = useActiveDay(xs, onDetails ? (i) => onDetails(rows[i].date) : undefined);
  const finding = bothFinding(both, targetPct);
  const fmtEuro = (v: number) => euro(v).replace(/0+$/, '').replace(/\.$/, '');

  return (
    <ChartFrame
      className="hc-stack"
      title={title}
      finding={finding}
      caption={
        props.caption ??
        'Model estimates for each possible harvest day. Data: 4th Autonomous Greenhouse Challenge (Maree et al., 4TU.ResearchData, CC BY 4.0).'
      }
      rows={rows}
      rowKey={(r) => r.date}
      columns={[
        { label: 'Date', value: (r) => shortDate(r.date) },
        { label: 'Pots ready', value: (r) => pctShare(r.sellable_share) },
        { label: 'Profit € /m² /day', value: (r) => euro(r.profit_m2_day) },
        {
          label: 'Both hold',
          value: (r) => (r.sellable_share >= sellableTarget && dayBand(r.date, card) === 'zone' ? 'yes' : '—'),
        },
      ]}
    >
      <div ref={ref} className="hc-plot" tabIndex={0} aria-label="Pots ready and profit by harvest day. Use arrow keys to read each day." {...handlers}>
        <svg width={width} height={height} role="img" aria-label={finding} data-testid="stack-svg">
          {both.map((r) => {
            const a = Math.max(left, xOf(idx.get(r.from)!) - step / 2);
            const b = Math.min(right, xOf(idx.get(r.to)!) + step / 2);
            return (
              // One band per panel, same days, so the panel labels stay clear.
              <g key={r.from} data-band="both" data-from={r.from} data-to={r.to}>
                <rect className="hc-zone" x={a} y={topA} width={b - a} height={botA - topA} />
                <rect className="hc-zone" x={a} y={topB} width={b - a} height={botB - topB} />
              </g>
            );
          })}

          <g data-panel="sellable">
            <text className="hc-panel-label" x={left} y={topA - 8}>
              Share of pots ready to sell (%)
            </text>
            <YAxis y={yA} left={left} right={right} ticks={narrow ? 2 : 4} format={(v) => `${v}%`} />
            <line className="hc-target" x1={left} x2={right} y1={yA(targetPct)} y2={yA(targetPct)} />
            <text className="hc-target-label" x={right} y={yA(targetPct) + 13} textAnchor="end">
              {targetPct}% ready
            </text>
            <path className="hc-line" d={lineA ?? ''} />
            <line className="hc-baseline" x1={left} x2={right} y1={botA} y2={botA} />
          </g>

          <g data-panel="profit">
            <text className="hc-panel-label" x={left} y={topB - 8}>
              Profit (€ per m² per day)
            </text>
            <YAxis y={yB} left={left} right={right} ticks={3} format={fmtEuro} />
            {yB.domain()[0] < 0 && <line className="hc-zero" x1={left} x2={right} y1={yB(0)} y2={yB(0)} />}
            <path className="hc-line" d={lineB ?? ''} />
          </g>

          {both.length > 0 && (
            <text
              className="hc-band-word"
              x={(Math.max(left, xOf(idx.get(both[0].from)!) - step / 2) + Math.min(right, xOf(idx.get(both[0].to)!) + step / 2)) / 2}
              y={botA - 6}
              textAnchor="middle"
            >
              both hold
            </text>
          )}

          {active !== null && (
            <g className="hc-active" pointerEvents="none">
              <line className="hc-guide" x1={xs[active]} x2={xs[active]} y1={topA} y2={botB} />
              <circle className="hc-active-dot" cx={xs[active]} cy={yA(rows[active].sellable_share * 100)} r={4.5} />
              <circle className="hc-active-dot" cx={xs[active]} cy={yB(rows[active].profit_m2_day)} r={4.5} />
            </g>
          )}
          <XAxis dates={dates} xs={xs} y={botB} left={left} right={right} />
        </svg>
        {active !== null && (
          <Tooltip
            x={xs[active]}
            y={botA - 6}
            width={width}
            text={`${shortDate(rows[active].date)} · ${pctShare(rows[active].sellable_share)} ready · ${euro(rows[active].profit_m2_day)}`}
            onDetails={onDetails ? () => onDetails(rows[active].date) : undefined}
          />
        )}
      </div>
    </ChartFrame>
  );
}
