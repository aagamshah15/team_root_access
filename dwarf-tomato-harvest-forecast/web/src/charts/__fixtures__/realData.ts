// Loads the real published files from app/data/ for tests and the demo page.
// (Not a fixture: these are pipeline outputs. Only d16.fixture.ts is a fixture.)
import days from '../../../../app/data/days.json';
import forecast from '../../../../app/data/forecast.json';
import evidence from '../../../../app/data/evidence.json';
import shipping from '../../../../app/data/shipping.json';
import rooms from '../../../../app/data/rooms.json';
import assumptions from '../../../../app/data/assumptions.json';
import type { DayCard, ForecastRow } from '../types';
import type { EvidenceSampleRow, ShippingPluckRow } from '../select';

export const realDays = days.rows as unknown as DayCard[];
export const realForecast = forecast.rows as unknown as ForecastRow[];
export const realEvidence = evidence.rows as unknown as EvidenceSampleRow[];
export const realShipping = shipping.rows as unknown as ShippingPluckRow[];
export const shippingMeta = shipping.meta as unknown as {
  destinations: { id: string; name: string }[];
  truck: { earliest_sellable_share: number; best_band_pct_red: [number, number]; default_destination: string };
};
export const realRooms = rooms.rows as unknown as { room: string; display_name: string; actual_harvest: string }[];
export const dataSource = days.meta.source as string;

/** D16 zone share (0–1) from assumptions.json, e.g. 0.9 → "within 10% of the best profit". */
export const zoneShare = (assumptions.rows as { name: string; value: unknown }[]).find((r) =>
  r.name.startsWith('Optimal harvest zone'),
)?.value as number | undefined;
