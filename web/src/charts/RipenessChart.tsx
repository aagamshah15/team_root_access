import { useMemo } from 'react';
import { area, line, scaleLinear } from 'd3';
import type { CropSample, ForecastRow, IsoDate, PastEstimate } from './types';
import { daysBetween, parseDate, pct, shortDate } from './format';
import { useWidth } from './useWidth';
import { useActiveDay, Tooltip } from './Hover';
import { XAxis, YAxis } from './Axes';
import { ChartFrame } from './ChartFrame';
import { RipenessScale } from './RipenessScale';
import { ripenessSentence } from './ripeness';

export interface RipenessChartProps {
  /** forecast.json rows for one room and one "today" (day 0 = today). */
  rows: ForecastRow[];
  /** The app's "today". */
  today: IsoDate;
  /** Estimated % red now (days.pct_red_now), shown on the six-step bar. */
  pctRedNow: number;
  /** Estimates made on earlier days (days.json pct_red_now for each earlier "today"); drawn faint. */
  past?: PastEstimate[];
  /** Crop samples; only those dated on or before today are drawn (known by today). */
  samples?: CropSample[];
  /** The room's actual harvest date (replay only); drawn if inside the chart. */
  actualHarvest?: IsoDate | null;
  onDetails?: (date: IsoDate) => void;
  caption?: string;
  title?: string;
}

interface Pt {
  date: IsoDate;
  pct: number;
  lo?: number;
  hi?: number;
  kind: 'past' | 'forecast';
}

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Ripeness forecast (% of fruit weight red) with its likely range, earlier
 * estimates, crop samples, a today marker and the actual harvest, paired with
 * the six-step ripeness bar for today.
 */
export function RipenessChart(props: RipenessChartProps) {
  const { today, pctRedNow, actualHarvest, onDetails, title } = props;
  const rows = useMemo(() => [...props.rows].sort((a, b) => a.date.localeCompare(b.date)), [props.rows]);
  const past = useMemo(
    () => (props.past ?? []).filter((p) => p.date < today).sort((a, b) => a.date.localeCompare(b.date)),
    [props.past, today],
  );
  const [ref, width] = useWidth<HTMLDivElement>();
  const narrow = width < 520;

  const start = past.length ? past[0].date : rows.length ? rows[0].date : today;
  const end = rows.length ? rows[rows.length - 1].date : today;
  const n = Math.max(1, daysBetween(start, end) + 1);
  const dates = Array.from({ length: n }, (_, i) => addDays(start, i));

  const pts: Pt[] = [
    ...past.map((p) => ({ date: p.date, pct: p.pct_red, kind: 'past' as const })),
    ...rows.map((r) => ({ date: r.date, pct: r.pct_red, lo: r.pct_red_low, hi: r.pct_red_high, kind: 'forecast' as const })),
  ];
  const byDate = new Map(pts.map((p) => [p.date, p]));
  const samples = (props.samples ?? []).filter((s) => s.date <= today && s.date >= start);

  const left = 40;
  const right = Math.max(left + 50, width - 12);
  const top = 22;
  const bottom = top + (narrow ? 160 : 200);
  const height = bottom + 24;
  const step = n > 1 ? (right - left) / (n - 1) : 0;
  const xd = (d: string) => left + daysBetween(start, d) * step;
  const xs = dates.map((d) => xd(d));
  const y = scaleLinear().domain([0, 100]).range([bottom, top]);

  const fc = pts.filter((p) => p.kind === 'forecast');
  const bandD = area<Pt>()
    .x((p) => xd(p.date))
    .y0((p) => y(p.lo ?? p.pct))
    .y1((p) => y(p.hi ?? p.pct))(fc);
  const fcD = line<Pt>()
    .x((p) => xd(p.date))
    .y((p) => y(p.pct))(fc);
  const pastD = line<Pt>()
    .x((p) => xd(p.date))
    .y((p) => y(p.pct))(pts.filter((p) => p.kind === 'past').concat(fc.slice(0, 1)));

  const { active, handlers } = useActiveDay(xs, onDetails ? (i) => onDetails(dates[i]) : undefined);
  const activePt = active !== null ? byDate.get(dates[active]) : undefined;
  const showHarvest = actualHarvest && actualHarvest >= start && actualHarvest <= end;
  const finding = `${ripenessSentence(pctRedNow)} Approximate stage.`;

  return (
    <ChartFrame
      className="hc-ripeness"
      title={title}
      finding={finding}
      caption={
        props.caption ??
        'Model estimate of the share of fruit weight that is red, with its likely range; dots are hand-weighed crop samples. Data: 4th Autonomous Greenhouse Challenge (Maree et al., 4TU.ResearchData, CC BY 4.0).'
      }
      rows={rows}
      rowKey={(r) => r.date}
      columns={[
        { label: 'Date', value: (r) => shortDate(r.date) },
        { label: '% red (estimate)', value: (r) => pct(r.pct_red) },
        { label: 'Likely range', value: (r) => `${pct(r.pct_red_low)}–${pct(r.pct_red_high)}` },
      ]}
    >
      <RipenessScale pctRed={pctRedNow} />
      <div ref={ref} className="hc-plot" tabIndex={0} aria-label="Ripeness by day. Use arrow keys to read each day." {...handlers}>
        <svg width={width} height={height} role="img" aria-label={finding} data-testid="ripeness-svg">
          <text className="hc-panel-label" x={left} y={top - 8}>
            Fruit weight that is red (%)
          </text>
          <YAxis y={y} left={left} right={right} ticks={4} format={(v) => `${v}%`} />
          <path className="hc-band" d={bandD ?? ''} />
          {pastD && past.length > 0 && <path className="hc-line-past" d={pastD} />}
          <path className="hc-line" d={fcD ?? ''} />

          <line className="hc-today" data-marker="today" data-date={today} x1={xd(today)} x2={xd(today)} y1={top} y2={bottom} />
          <text className="hc-marker-label hc-today-label" x={xd(today) + 4} y={top + 10}>
            Today
          </text>
          {showHarvest && (
            <g data-marker="harvest" data-date={actualHarvest}>
              <line className="hc-marker hc-marker-ship" x1={xd(actualHarvest)} x2={xd(actualHarvest)} y1={top} y2={bottom} />
              <text
                className="hc-marker-label"
                x={xd(actualHarvest) + (xd(actualHarvest) > right - 110 ? -4 : 4)}
                y={bottom - 8}
                textAnchor={xd(actualHarvest) > right - 110 ? 'end' : 'start'}
              >
                Picked {shortDate(actualHarvest)}
              </text>
            </g>
          )}
          {samples.map((s) => (
            <circle key={s.date} className="hc-sample" data-sample={s.date} cx={xd(s.date)} cy={y(s.pct_red)} r={5} />
          ))}

          {active !== null && (
            <g className="hc-active" pointerEvents="none">
              <line className="hc-guide" x1={xs[active]} x2={xs[active]} y1={top} y2={bottom} />
              {activePt && <circle className="hc-active-dot" cx={xs[active]} cy={y(activePt.pct)} r={4.5} />}
            </g>
          )}
          <XAxis dates={dates} xs={xs} y={bottom} left={left} right={right} />
        </svg>
        {active !== null && activePt && (
          <Tooltip
            x={xs[active]}
            y={y(activePt.pct) - 40}
            width={width}
            text={`${shortDate(activePt.date)} · ${pct(activePt.pct)} red${activePt.kind === 'past' ? ' (estimated then)' : ''}`}
            onDetails={onDetails ? () => onDetails(activePt.date) : undefined}
          />
        )}
      </div>
      <p className="hc-key">
        <span>
          <i className="hc-key-line" aria-hidden="true" />
          estimate
        </span>
        <span>
          <i className="hc-key-band" aria-hidden="true" />
          likely range
        </span>
        {past.length > 0 && (
          <span>
            <i className="hc-key-past" aria-hidden="true" />
            earlier estimates
          </span>
        )}
        {samples.length > 0 && (
          <span>
            <i className="hc-key-sample" aria-hidden="true" />
            crop sample
          </span>
        )}
        {showHarvest && <span>Picked: what the grower actually did (replay)</span>}
      </p>
    </ChartFrame>
  );
}
