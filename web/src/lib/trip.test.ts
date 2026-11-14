/* lib/trip.ts must give the same pluck plan as harvest/shipping.py for every published room, day and preset
 * destination (shipping.json), exactly as tests/test_trip.cjs checks app/trip.js. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planTrip, transitDays } from './trip';
import { addDays } from '../data/format';
import type { DayCard, ForecastRow, ShippingMeta, ShippingRow } from '../data/types';

const DATA = resolve(__dirname, '..', '..', '..', 'app', 'data');
const load = (f: string) => JSON.parse(readFileSync(resolve(DATA, `${f}.json`), 'utf8'));
const ship = load('shipping') as { meta: ShippingMeta; rows: ShippingRow[] };
const days = load('days') as { rows: DayCard[] };
const fcDoc = load('forecast') as { rows: ForecastRow[] };
const truck = ship.meta.truck!;
const cards = new Map(days.rows.map((r) => [`${r.room}|${r.today}`, r]));
const fc = new Map<string, ForecastRow[]>();
for (const r of fcDoc.rows) {
  const k = `${r.room}|${r.today}`;
  if (!fc.has(k)) fc.set(k, []);
  fc.get(k)!.push(r);
}
fc.forEach((v) => v.sort((a, b) => (a.date < b.date ? -1 : 1)));
const dest = new Map(ship.meta.destinations!.map((d) => [d.id, d]));

describe('transitDays', () => {
  it('560 km a day for one driver; 1,120 for two', () => {
    expect(transitDays(30, truck)).toBe(0);      // within same-day distance
    expect(transitDays(850, truck)).toBe(2);     // 850 / 560 = 1.52 -> 2
    expect(transitDays(1750, truck)).toBe(4);    // 1750 / 560 = 3.13 -> 4
    expect(transitDays(1750, truck, 2)).toBe(2); // 1750 / 1120 = 1.56 -> 2
  });
});

describe('planTrip matches shipping.json', () => {
  it(`every published plan (${ship.rows.length})`, () => {
    for (const r of ship.rows) {
      const d = dest.get(r.destination)!;
      const key = `${r.room} ${r.today} ${r.destination}`;
      const plan = planTrip(fc.get(`${r.room}|${r.today}`)!, cards.get(`${r.room}|${r.today}`)!, truck, { distance_km: d.distance_km });
      expect(plan.transit_days, key).toBe(d.transit_days);
      expect(plan.pluck_day, key).toBe(r.pluck_day);
      expect(plan.pluck_reason, key).toBe(r.pluck_reason);
      expect(plan.ship_by_day, key).toBe(r.ship_by_day);
      expect(Math.abs(plan.pct_on_arrival! - r.pct_on_arrival), key).toBeLessThan(0.06);
      expect(Math.abs(plan.sellable_on_arrival! - r.sellable_on_arrival), key).toBeLessThan(0.006);
      expect(plan.best_from, key).toBe(r.best_from == null ? null : addDays(plan.arrival_day!, r.best_from));
      expect(plan.sell_until, key).toBe(r.sell_until == null ? null : addDays(plan.arrival_day!, r.sell_until));
    }
  });
  it('a warmer truck ripens pots on the road; a cold one flags chilling', () => {
    const any = ship.rows.find((r) => r.destination === 'madrid')!;
    const c = cards.get(`${any.room}|${any.today}`)!, f = fc.get(`${any.room}|${any.today}`)!;
    const cold = planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 12 });
    const warm = planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 18 });
    expect(warm.pct_on_arrival!).toBeGreaterThanOrEqual(cold.pct_on_arrival!);
    expect(planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 8 }).chilling_risk).toBe(true);
  });
});
