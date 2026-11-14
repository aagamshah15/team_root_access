import { useId, useMemo } from 'react';
import { area, line, scaleLinear } from 'd3';
import type { DayCard, ForecastRow, IsoDate } from './types';
import { bandRuns, dayBand, harvestPoints, layoutPills, profitFinding } from './chartMath';
import { euro, pctShare, shortDate } from './format';
import { useWidth } from './useWidth';
import { useActiveDay, Tooltip } from './Hover';
import { XAxis, YAxis } from './Axes';
import { ChartFrame } from './ChartFrame';

export interface ProfitChartProps {
  /** forecast.json rows for one room and one "today" (days 0–21), any order. */
  rows: ForecastRow[];
  /** days.json card for the same room and "today" (with D16 fields, or merged from the fixture). */
  card: DayCard;
  /** Pluck day for the chosen destination (shipping.json `pluck_day`); null hides the Ship marker. */
  shipDay?: IsoDate | null;
  /** Destination name for the finding and key, e.g. "Munich". */
  shipName?: string;
  /** D16 zone share as a percent (90 → "within 10% of the best profit"); omit to say "close to". */
  zoneSharePct?: number;
  /** % red that defines the Look day (lower edge of best_band_pct_red), for the key. */
  lookPct?: number;
  /** Opens the explainer for a day ("details ›" in the tooltip). */
  onDetails?: (date: IsoDate) => void;
  /** Source caption under the chart. */
  caption?: string;
  title?: string;
}

const BAND_WORDS = { gain: 'worth waiting', zone: 'optimal', loss: 'losing money', none: 'not sellable yet' } as const;
const PILL_H = 18;

/**
 * Harvest-window profit chart (DESIGN.md → Profit chart): profit per m² per
 * day by harvest date, gain / optimal zone / loss areas, a dashed €0 line and
 * the three harvest points (Ship, Profit, Look) as markers with pills.
 */
export function ProfitChart(props: ProfitChartProps) {
  const { card, shipDay, shipName, zoneSharePct, lookPct, onDetails, title } = props;
  const rows = useMemo(() => [...props.rows].sort((a, b) => a.date.localeCompare(b.date)), [props.rows]);
  const [ref, width] = useWidth<HTMLDivElement>();
  const clipBase = useId().replace(/:/g, '');

  const narrow = width < 520;
  const points = harvestPoints(card, shipDay);
  const dates = rows.map((r) => r.date);
  const idx = new Map(dates.map((d, i) => [d, i]));

  const m = { left: 46, right: 12, bottom: 24 };
  const plotLeft = m.left;
  const plotRight = Math.max(plotLeft + 50, width - m.right);
  const step = rows.length > 1 ? (plotRight - plotLeft) / (rows.length - 1) : 0;
  const xOf = (i: number) => plotLeft + i * step;
  const xs = rows.map((_, i) => xOf(i));

  // Pills for the harvest points, laid out in rows above the plot.
  const pillDefs = (
    [
      ['ship', points.ship, 'Ship'],
      ['profit', points.profit, 'Profit'],
      ['look', points.look, 'Look'],
    ] as const
  )
    .filter(([, d]) => d && idx.has(d))
    .map(([key, d, word]) => {
      const label = `${word} · ${shortDate(d as string)}`;
      return { key, date: d as string, label, x: xOf(idx.get(d as string)!), width: label.length * 6.6 + 16 };
    });
  const pills = layoutPills(pillDefs, 0, width, 4);
  const pillRows = pills.length ? Math.max(...pills.map((p) => p.row)) + 1 : 0;
  const plotTop = 6 + pillRows * (PILL_H + 4);
  const plotBottom = plotTop + (narrow ? 160 : 200);
  const height = plotBottom + m.bottom;

  const values = rows.flatMap((r) => [r.profit_m2_day]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const y = scaleLinear()
    .domain([lo, hi === lo ? lo + 0.1 : hi])
    .nice(4)
    .range([plotBottom, plotTop]);

  const lineD = line<ForecastRow>()
    .x((_, i) => xOf(i))
    .y((r) => y(r.profit_m2_day))(rows);
  const areaD = area<ForecastRow>()
    .x((_, i) => xOf(i))
    .y0(plotBottom)
    .y1((r) => y(r.profit_m2_day))(rows);

  const runs = bandRuns(dates, card);
  const runX = (from: string, to: string) => {
    const a = Math.max(plotLeft, xOf(idx.get(from)!) - step / 2);
    const b = Math.min(plotRight, xOf(idx.get(to)!) + step / 2);
    return [a, b] as const;
  };

  const { active, handlers } = useActiveDay(xs, onDetails ? (i) => onDetails(rows[i].date) : undefined);
  const finding = profitFinding(points, {
    shipName,
    zoneSharePct,
    zoneFrom: card.optimal_from ?? null,
    zoneTo: card.optimal_to ?? null,
    bestProfit: card.profit_best_m2_day,
  });

  const markerTop = (key: string) => {
    const p = pills.find((q) => q.key === key);
    return p ? 6 + p.row * (PILL_H + 4) + PILL_H : plotTop;
  };

  return (
    <ChartFrame
      className="hc-profit"
      title={title}
      finding={finding}
      caption={
        props.caption ??
        'Model estimate of profit per m² per day if the whole room is picked that day. Data: 4th Autonomous Greenhouse Challenge (Maree et al., 4TU.ResearchData, CC BY 4.0).'
      }
      rows={rows}
      rowKey={(r) => r.date}
      columns={[
        { label: 'Date', value: (r) => shortDate(r.date) },
        { label: 'Profit € /m² /day', value: (r) => euro(r.profit_m2_day) },
        { label: 'Likely range', value: (r) => `${euro(r.profit_low)} to ${euro(r.profit_high)}` },
        { label: 'Pots ready', value: (r) => pctShare(r.sellable_share) },
        { label: 'Window', value: (r) => BAND_WORDS[dayBand(r.date, card)] },
      ]}
    >
      <div
        ref={ref}
        className="hc-plot"
        tabIndex={0}
        aria-label="Profit by harvest day. Use arrow keys to read each day."
        {...handlers}
      >
        <svg width={width} height={height} role="img" aria-label={finding} data-testid="profit-svg">
          <defs>
            {runs.map((r, i) => {
              const [a, b] = runX(r.from, r.to);
              return (
                <clipPath key={i} id={`${clipBase}-run${i}`}>
                  <rect x={a} y={plotTop} width={Math.max(0, b - a)} height={plotBottom - plotTop} />
                </clipPath>
              );
            })}
          </defs>
          <YAxis y={y} left={plotLeft} right={plotRight} ticks={4} format={(v) => euro(v).replace(/0+$/, '').replace(/\.$/, '')} />

          {runs.map((r, i) => {
            const [a, b] = runX(r.from, r.to);
            if (r.band === 'zone')
              return (
                <rect
                  key={i}
                  className="hc-zone"
                  data-band="zone"
                  data-from={r.from}
                  data-to={r.to}
                  x={a}
                  y={plotTop}
                  width={b - a}
                  height={plotBottom - plotTop}
                />
              );
            return (
              <path
                key={i}
                className={`hc-area hc-area-${r.band}`}
                data-band={r.band}
                data-from={r.from}
                data-to={r.to}
                d={areaD ?? ''}
                clipPath={`url(#${clipBase}-run${i})`}
              />
            );
          })}

          {/* Band words, only where the run is wide enough to hold them. */}
          {runs.map((r, i) => {
            const [a, b] = runX(r.from, r.to);
            const word = BAND_WORDS[r.band];
            if (b - a < word.length * 6.2 + 8) return null;
            return (
              <text key={`w${i}`} className="hc-band-word" x={(a + b) / 2} y={plotBottom - 8} textAnchor="middle">
                {word}
              </text>
            );
          })}

          {y.domain()[0] < 0 && (
            <g data-testid="zero-line">
              <line className="hc-zero" x1={plotLeft} x2={plotRight} y1={y(0)} y2={y(0)} />
            </g>
          )}

          <path className="hc-line" d={lineD ?? ''} />

          {pills.map((p) => {
            const x = p.x;
            const top = markerTop(p.key);
            return <line key={`m-${p.key}`} className={`hc-marker hc-marker-${p.key}`} data-marker={p.key} data-date={pillDefs.find((q) => q.key === p.key)!.date} x1={x} x2={x} y1={top} y2={plotBottom} />;
          })}
          {points.profit && idx.has(points.profit) && (
            <circle
              className="hc-best-dot"
              cx={xOf(idx.get(points.profit)!)}
              cy={y(rows[idx.get(points.profit)!].profit_m2_day)}
              r={6}
            />
          )}
          {pills.map((p) => (
            <g key={`p-${p.key}`} className={`hc-pill hc-pill-${p.key}`} data-pill={p.key}>
              <rect x={p.left} y={6 + p.row * (PILL_H + 4)} width={p.width} height={PILL_H} rx={PILL_H / 2} />
              <text x={p.left + p.width / 2} y={6 + p.row * (PILL_H + 4) + PILL_H / 2} dy="0.35em" textAnchor="middle">
                {pillDefs.find((q) => q.key === p.key)!.label}
              </text>
            </g>
          ))}

          {active !== null && (
            <g className="hc-active" pointerEvents="none">
              <line className="hc-guide" x1={xs[active]} x2={xs[active]} y1={plotTop} y2={plotBottom} />
              <circle className="hc-active-dot" cx={xs[active]} cy={y(rows[active].profit_m2_day)} r={4.5} />
            </g>
          )}

          <XAxis dates={dates} xs={xs} y={plotBottom} left={plotLeft} right={plotRight} />
        </svg>
        {active !== null && (
          <Tooltip
            x={xs[active]}
            y={Math.min(y(rows[active].profit_m2_day), plotBottom - 40) - 36}
            width={width}
            text={`${shortDate(rows[active].date)} · ${euro(rows[active].profit_m2_day)}`}
            onDetails={onDetails ? () => onDetails(rows[active].date) : undefined}
          />
        )}
      </div>
      <p className="hc-key">
        <span>€ per m² per day</span>
        {points.ship && (
          <span>
            <i className="hc-key-ship" aria-hidden="true" />
            Ship: pluck day{shipName ? ` for ${shipName}` : ''} (sellable on arrival)
          </span>
        )}
        <span>
          <i className="hc-key-profit" aria-hidden="true" />
          Profit: most profit per m² per day
        </span>
        <span>
          <i className="hc-key-look" aria-hidden="true" />
          {points.look
            ? `Look: first day ${lookPct !== undefined ? `${lookPct}% ` : 'at best-look '}red (best on shelf)`
            : 'Look: not reached in this forecast'}
        </span>
      </p>
    </ChartFrame>
  );
}
