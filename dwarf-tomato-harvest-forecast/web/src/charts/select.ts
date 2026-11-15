/**
 * Selectors that pick a chart's inputs out of the published app/data rows.
 * They only filter and reshape; no new numbers are made (L09 owns the maths).
 */
import type { CropSample, DayCard, ForecastRow, IsoDate, PastEstimate } from './types';

/** forecast.json rows for one room and "today", sorted by date. */
export function forecastFor(rows: ForecastRow[], room: string, today: IsoDate): ForecastRow[] {
  return rows.filter((r) => r.room === room && r.today === today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Earlier estimates of % red for a room: days.json pct_red_now for each "today" before this one. */
export function pastEstimatesFor(days: DayCard[], room: string, today: IsoDate): PastEstimate[] {
  return days
    .filter((d) => d.room === room && d.today < today)
    .map((d) => ({ date: d.today, pct_red: d.pct_red_now }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Minimal evidence.json row shape for crop samples. */
export interface EvidenceSampleRow {
  room: string;
  last_sample_date: IsoDate | null;
  last_sample_pct_red: number | null;
}

/** Distinct crop samples for a room from evidence.json (each row carries the latest sample). */
export function cropSamplesFor(evidence: EvidenceSampleRow[], room: string): CropSample[] {
  const seen = new Map<string, number>();
  for (const e of evidence) {
    if (e.room === room && e.last_sample_date && e.last_sample_pct_red !== null && !seen.has(e.last_sample_date)) {
      seen.set(e.last_sample_date, e.last_sample_pct_red);
    }
  }
  return [...seen].map(([date, pct_red]) => ({ date, pct_red })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Minimal shipping.json row shape. */
export interface ShippingPluckRow {
  room: string;
  today: IsoDate;
  destination: string;
  pluck_day: IsoDate;
}

/** Pluck day for a destination, or null when it is beyond the forecast (no row). */
export function shipDayFor(rows: ShippingPluckRow[], room: string, today: IsoDate, destination: string): IsoDate | null {
  return rows.find((r) => r.room === room && r.today === today && r.destination === destination)?.pluck_day ?? null;
}
