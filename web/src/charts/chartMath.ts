/**
 * Pure helpers behind the charts: which colour band a day is in, where the
 * three harvest points sit, how pills avoid each other, and the one-line
 * findings. No numbers are computed here beyond picking and comparing values
 * that already come from app/data (the pipeline does the maths, L09).
 */
import type { DayBand, DayCard, D16Fields, ForecastRow, HarvestPoints, IsoDate } from './types';
import { shortDate } from './format';

/**
 * Band for one day on the profit chart (DESIGN.md → Profit chart):
 * zone   = optimal_from..optimal_to (within the zone share of the best profit)
 * gain   = sellable (≥ earliest_sellable_day) but before the zone: waiting pays
 * loss   = after the zone: each extra day lowers profit per m² per day
 * none   = not yet sellable.
 * Without D16 fields (undefined), falls back to best_day as a one-day zone.
 * With no zone (null, e.g. every day loses money), losses_start_day starts loss.
 */
export function dayBand(date: IsoDate, card: DayCard): DayBand {
  // undefined = field not published yet (fall back to best_day); null = no zone.
  const from = card.optimal_from === undefined ? card.best_day : card.optimal_from;
  const to = card.optimal_to === undefined ? card.best_day : card.optimal_to;
  if (from && to && date >= from && date <= to) return 'zone';
  if (to && date > to) return 'loss';
  if (!to && card.losses_start_day && date >= card.losses_start_day) return 'loss';
  if (card.earliest_sellable_day && date >= card.earliest_sellable_day) return 'gain';
  return 'none';
}

/** A contiguous run of days sharing one band. */
export interface BandRun<B extends string = DayBand> {
  band: B;
  from: IsoDate;
  to: IsoDate;
}

/** Group consecutive dates with the same key into runs (dates must be sorted). */
export function runs<B extends string>(dates: IsoDate[], keyOf: (d: IsoDate) => B): BandRun<B>[] {
  const out: BandRun<B>[] = [];
  for (const d of dates) {
    const b = keyOf(d);
    const last = out[out.length - 1];
    if (last && last.band === b) last.to = d;
    else out.push({ band: b, from: d, to: d });
  }
  return out;
}

/** Runs of gain / zone / loss days for the profit chart (empty 'none' runs dropped). */
export function bandRuns(dates: IsoDate[], card: DayCard): BandRun[] {
  return runs(dates, (d) => dayBand(d, card)).filter((r) => r.band !== 'none');
}

/**
 * Days where both hold (sellable vs profit view): share of pots sellable at
 * least `target` AND inside the optimal zone. Returned as runs.
 */
export function bothHoldRuns(rows: ForecastRow[], card: DayCard, target: number): BandRun<'both'>[] {
  const ok = new Set(
    rows.filter((r) => r.sellable_share >= target && dayBand(r.date, card) === 'zone').map((r) => r.date),
  );
  return runs(
    rows.map((r) => r.date),
    (d) => (ok.has(d) ? 'both' : 'no') as 'both' | 'no',
  ).filter((r): r is BandRun<'both'> => r.band === 'both');
}

/** The three harvest points from the day card and the chosen destination's pluck day. */
export function harvestPoints(card: DayCard, shipDay: IsoDate | null | undefined): HarvestPoints {
  return { ship: shipDay ?? null, profit: card.best_day, look: card.look_day ?? null };
}

/**
 * Merge D16 fields into a day card: real fields win; the fixture fills only
 * fields the card does not have yet (undefined), never ones that are null.
 */
export function withD16(card: DayCard, fixture: D16Fields | undefined): DayCard {
  if (!fixture) return card;
  return {
    ...card,
    optimal_from: card.optimal_from !== undefined ? card.optimal_from : fixture.optimal_from,
    optimal_to: card.optimal_to !== undefined ? card.optimal_to : fixture.optimal_to,
    look_day: card.look_day !== undefined ? card.look_day : fixture.look_day,
  };
}

/** A pill to place above the chart. `x` is its anchor (the marker's x). */
export interface PillIn {
  key: string;
  x: number;
  width: number;
}
export interface PillOut extends PillIn {
  left: number;
  row: number;
}

/**
 * Place pills left to right, centred on their marker and kept inside
 * [minX, maxX]. A pill that would overlap the previous pill in a row drops to
 * the next row, so three pills stay readable on a 390 px phone.
 */
export function layoutPills(pills: PillIn[], minX: number, maxX: number, gap = 4, maxRows = 3): PillOut[] {
  const rowEnds: number[] = [];
  return [...pills]
    .sort((a, b) => a.x - b.x)
    .map((p) => {
      const left = Math.max(minX, Math.min(maxX - p.width, p.x - p.width / 2));
      let row = rowEnds.findIndex((end) => left >= end + gap);
      if (row === -1) row = Math.min(rowEnds.length, maxRows - 1);
      rowEnds[row] = left + p.width;
      return { ...p, left, row };
    });
}

/** Index of the date nearest to a pixel x, given the x of each date. */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  return best;
}

/**
 * One-line finding above the profit chart, in plain words.
 * e.g. "Three good days for three goals: ship to Munich on 9 Nov, most profit
 * on 11 Nov, best shelf look from 13 Nov."
 */
export function profitFinding(
  points: HarvestPoints,
  opts: {
    shipName?: string;
    zoneSharePct?: number;
    zoneFrom?: IsoDate | null;
    zoneTo?: IsoDate | null;
    /** days.profit_best_m2_day: below zero, no day is "good", so the finding says so. */
    bestProfit?: number;
  } = {},
): string {
  if (opts.bestProfit !== undefined && opts.bestProfit < 0 && points.profit) {
    return `Every harvest day in this forecast loses money; the smallest loss is on ${shortDate(points.profit)}.`;
  }
  const parts: string[] = [];
  if (points.ship) parts.push(`ship${opts.shipName ? ` to ${opts.shipName}` : ''} on ${shortDate(points.ship)}`);
  if (points.profit) parts.push(`most profit on ${shortDate(points.profit)}`);
  if (points.look) parts.push(`best shelf look from ${shortDate(points.look)}`);
  const words = ['', 'One good day', 'Two good days for two goals', 'Three good days for three goals'];
  let s = parts.length ? `${words[parts.length]}: ${parts.join(', ')}.` : 'No harvest day in the next three weeks.';
  if (opts.zoneFrom && opts.zoneTo) {
    const close = opts.zoneSharePct !== undefined ? `within ${100 - opts.zoneSharePct}% of` : 'close to';
    s += ` Any day in blue is ${close} the best profit.`;
  }
  return s;
}

/** One-line finding above the sellable vs profit view. */
export function bothFinding(both: BandRun<'both'>[], targetPct: number): string {
  if (!both.length) return `No day in this forecast has both ${targetPct}% of pots ready to sell and profit in the blue zone.`;
  const r = both[0];
  const when = r.from === r.to ? `on ${shortDate(r.from)}` : `from ${shortDate(r.from)} to ${shortDate(r.to)}`;
  return `Both hold ${when}: ${targetPct}% of pots ready to sell and profit in the blue zone.`;
}
