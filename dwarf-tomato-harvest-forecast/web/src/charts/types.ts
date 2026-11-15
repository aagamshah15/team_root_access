/**
 * Data shapes the charts read. They mirror `contracts/app-data.md` but only the
 * fields the charts use, so L07's fuller data layer can pass its own rows in
 * (structural typing) without conversion.
 */

/** ISO date string "YYYY-MM-DD", as in every app/data file. */
export type IsoDate = string;

/** One `forecast.json` row: one room, one "today", one day ahead (0–21). */
export interface ForecastRow {
  room: string;
  today: IsoDate;
  date: IsoDate;
  pct_red: number;
  pct_red_low: number;
  pct_red_high: number;
  sellable_share: number;
  profit_m2_day: number;
  profit_low: number;
  profit_high: number;
}

/** The D16 fields L09 adds to `days.json` (null when not reached in the horizon). */
export interface D16Fields {
  optimal_from: IsoDate | null;
  optimal_to: IsoDate | null;
  look_day: IsoDate | null;
}

/** The `days.json` card fields the charts use. D16 fields are optional until L09 lands. */
export interface DayCard extends Partial<D16Fields> {
  room: string;
  today: IsoDate;
  pct_red_now: number;
  sellable_share_now: number;
  earliest_sellable_day: IsoDate | null;
  best_day: IsoDate | null;
  losses_start_day: IsoDate | null;
  profit_best_m2_day: number;
}

/** A crop sample (hand measurement) to plot on the ripeness chart. */
export interface CropSample {
  date: IsoDate;
  pct_red: number;
}

/** A past estimate: the % red the model gave on an earlier "today" (from days.json). */
export interface PastEstimate {
  date: IsoDate;
  pct_red: number;
}

/** The three harvest points (D16). Any may be missing. */
export interface HarvestPoints {
  /** Pluck day for the chosen destination (shipping.json). */
  ship: IsoDate | null;
  /** Most-profit day (days.best_day). */
  profit: IsoDate | null;
  /** First day at the "best shelf look" ripeness (days.look_day). */
  look: IsoDate | null;
}

/** Colour band a day falls in on the profit chart. */
export type DayBand = 'none' | 'gain' | 'zone' | 'loss';
