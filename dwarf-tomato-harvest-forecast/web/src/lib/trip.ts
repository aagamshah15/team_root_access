/* Plan any trip in the browser: a TypeScript port of app/trip.js, which mirrors harvest/shipping.py (ship_plan).
 * Same rules, same results (checked against every published shipping.json plan in trip.test.ts).
 *
 * Inputs come only from published files: the room's forecast rows for today (% red per day), the decision
 * card (curve steepness k, weight-complete day) and shipping.json meta.truck (settings).
 * Profit is not recalculated; preset destinations show it from shipping.json. */
import { addDays } from '../data/format';
import type { ISODate, Truck } from '../data/types';

const logit = (p: number) => {
  const x = Math.min(Math.max(p, 0.01), 99.99) / 100;
  return Math.log(x / (1 - x));
};
const pctOf = (x: number) => 100 / (1 + Math.exp(-x));

/** Whole days on the road. Same rule as logistics.transit_days, plus an optional second driver. */
export function transitDays(distanceKm: number, truck: Truck, drivers = 1): number {
  if (distanceKm <= truck.same_day_km) return 0;
  return Math.ceil(distanceKm / (truck.avg_speed_kmh * truck.driving_hours_per_day * Math.max(1, drivers)));
}

/** % red after `dd` more degree-days on a curve of steepness k (logistics.ripen). */
export const ripen = (p: number, k: number, dd: number) => pctOf(logit(p) + k * dd);

export interface Shelf { best_from: number; best_until: number | null; sell_until: number | null; best_days: number | null }
/** Shelf days after arrival (logistics.shelf). */
export function shelf(arrive: number, k: number, shopDD: number, truck: Truck): Shelf {
  const [lo, hi] = truck.best_band_pct_red;
  const step = k * shopDD;
  if (step <= 0) return { best_from: 0, best_until: null, sell_until: null, best_days: null };
  const to = (t: number) => (logit(t) - logit(arrive)) / step;
  const best_from = Math.max(0, Math.ceil(to(lo) - 1e-9));
  const best_until = Math.floor(to(hi));
  return { best_from, best_until, sell_until: Math.floor(to(truck.end_of_life_pct_red)), best_days: Math.max(0, best_until - best_from + 1) };
}

/** Share of pots sellable when the room as a whole is `p` % red (economics.plant_pct + sale rule).
 * `spreadSd`: the room's plant-to-plant spread (days.json card), else the shared setting in meta.truck. */
export function sellableShare(p: number, truck: Truck, spreadSd: number = truck.pot_spread_sd): number {
  const base = logit(p);
  const sd = (4 * spreadSd) / 100;
  const need = 100 * truck.sellable_red_share;
  let n = 0;
  for (const z of truck.pot_z) if (pctOf(base + sd * z) >= need) n += 1;
  return n / truck.pot_z.length;
}

export interface TripInput {
  distance_km?: number;
  transit_days?: number;
  transit_temp_c?: number;
  shop_temp_c?: number;
  drivers?: number;
  min_best_shelf_days?: number;
}
export interface TripCard { today: ISODate; k_x1000?: number | null; weight_complete_day?: ISODate | null; pot_spread_sd?: number | null }
export interface TripPlan {
  transit_days: number;
  transit_temp_c: number;
  shop_temp_c: number;
  min_best_shelf_days: number;
  weight_complete_day: ISODate | null;
  earliest_sellable_day: ISODate | null;
  ship_by_day: ISODate | null;
  too_long: boolean;
  chilling_risk: boolean;
  pluck_day: ISODate | null;
  pluck_reason: 'weight' | 'sellable' | 'today' | 'beyond_forecast';
  arrival_day?: ISODate;
  pct_at_pluck?: number;
  pct_on_arrival?: number;
  sellable_on_arrival?: number;
  best_from?: ISODate | null;
  best_until?: ISODate | null;
  sell_until?: ISODate | null;
  best_shelf_days?: number | null;
  late?: boolean;
}

/** The pluck plan for one trip. `fc`: forecast rows for the room's "today" (date, pct_red), oldest first. */
export function planTrip(fc: { date: ISODate; pct_red: number }[], card: TripCard, truck: Truck, trip: TripInput = {}): TripPlan {
  const k = Number(card.k_x1000) / 1000;
  const days = trip.transit_days != null ? Math.max(0, Math.round(Number(trip.transit_days)))
    : transitDays(Number(trip.distance_km || 0), truck, Number(trip.drivers || 1));
  const transitTemp = trip.transit_temp_c != null ? Number(trip.transit_temp_c) : truck.temp_c;
  const shopTemp = trip.shop_temp_c != null ? Number(trip.shop_temp_c) : truck.shop_temp_c;
  const need = trip.min_best_shelf_days != null ? Number(trip.min_best_shelf_days) : truck.min_best_shelf_days;
  const transitDD = days * Math.max(transitTemp - truck.base_temp_c, 0);
  const shopDD = Math.max(shopTemp - truck.base_temp_c, 0);
  const spread = card.pot_spread_sd ?? truck.pot_spread_sd;   // room-specific spread when published (L09)

  const rows = fc.map((r) => {
    const arrive = ripen(r.pct_red, k, transitDD);
    return { date: r.date, pct_at_pluck: r.pct_red, pct_on_arrival: arrive, sellable_on_arrival: sellableShare(arrive, truck, spread), ...shelf(arrive, k, shopDD, truck) };
  });
  const sellable = rows.find((r) => r.sellable_on_arrival >= truck.earliest_sellable_share);
  const shipBy = rows.filter((r) => r.best_days != null && r.best_days >= need && r.best_until != null && r.best_until >= r.best_from).pop();
  const base = {
    transit_days: days, transit_temp_c: transitTemp, shop_temp_c: shopTemp, min_best_shelf_days: need,
    weight_complete_day: card.weight_complete_day ?? null, earliest_sellable_day: sellable ? sellable.date : null,
    ship_by_day: shipBy ? shipBy.date : null, too_long: days > truck.max_transit_days, chilling_risk: transitTemp < 10,
  };
  if (!card.weight_complete_day || !sellable) return { ...base, pluck_day: null, pluck_reason: 'beyond_forecast' };
  const options: [TripPlan['pluck_reason'], ISODate][] = [['weight', card.weight_complete_day], ['sellable', sellable.date], ['today', card.today]];
  let [reason, pluck] = options[0];
  for (const [r, d] of options.slice(1)) if (d > pluck) { reason = r; pluck = d; }
  const at = rows.find((r) => r.date === pluck);
  if (!at) return { ...base, pluck_day: null, pluck_reason: 'beyond_forecast' };
  const arrival = addDays(pluck, days);
  const on = (n: number | null) => (n == null ? null : addDays(arrival, n));
  return {
    ...base, pluck_day: pluck, pluck_reason: reason, arrival_day: arrival, pct_at_pluck: at.pct_at_pluck,
    pct_on_arrival: at.pct_on_arrival, sellable_on_arrival: at.sellable_on_arrival,
    best_from: on(at.best_from), best_until: on(at.best_until), sell_until: on(at.sell_until),
    best_shelf_days: at.best_days, late: !!(base.ship_by_day && pluck > base.ship_by_day),
  };
}
