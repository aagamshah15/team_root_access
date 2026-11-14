/* Plan any trip in the browser: the same rules as harvest/shipping.py (ship_plan), for a destination,
 * truck temperature or driver count the grower types in or the AI assistant chooses.
 *
 * Inputs come only from the published files: the room's forecast rows for today (% red per day),
 * the decision card (curve steepness k, weight-complete day) and shipping.json meta.truck (settings).
 * Profit is not recalculated here; preset destinations show it from shipping.json.
 */
(function (root) {
  'use strict';

  const logit = (p) => { const x = Math.min(Math.max(p, 0.01), 99.99) / 100; return Math.log(x / (1 - x)); };
  const pct = (x) => 100 / (1 + Math.exp(-x));
  const addDays = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  /** Whole days on the road. Same rule as logistics.transit_days, plus an optional second driver. */
  function transitDays(distanceKm, truck, drivers = 1) {
    if (distanceKm <= truck.same_day_km) return 0;
    return Math.ceil(distanceKm / (truck.avg_speed_kmh * truck.driving_hours_per_day * Math.max(1, drivers)));
  }

  /** % red after `dd` more degree-days on a curve of steepness k (logistics.ripen). */
  const ripen = (p, k, dd) => pct(logit(p) + k * dd);

  /** Shelf days after arrival (logistics.shelf): best_from, best_until, sell_until, best_days. */
  function shelf(arrive, k, shopDD, truck) {
    const [lo, hi] = truck.best_band_pct_red;
    const step = k * shopDD;
    if (step <= 0) return { best_from: 0, best_until: null, sell_until: null, best_days: null };
    const to = (t) => (logit(t) - logit(arrive)) / step;
    const best_from = Math.max(0, Math.ceil(to(lo) - 1e-9));
    const best_until = Math.floor(to(hi));
    return { best_from, best_until, sell_until: Math.floor(to(truck.end_of_life_pct_red)),
      best_days: Math.max(0, best_until - best_from + 1) };
  }

  /** Share of pots sellable when the room as a whole is `p` % red (economics.plant_pct + sale rule). */
  function sellableShare(p, truck, spreadSd = truck.pot_spread_sd) {
    const base = logit(p);
    const sd = 4 * spreadSd / 100;
    const need = 100 * truck.sellable_red_share;
    let n = 0;
    for (const z of truck.pot_z) if (pct(base + sd * z) >= need) n += 1;
    return n / truck.pot_z.length;
  }

  /**
   * The pluck plan for one trip. `fc`: forecast rows for the room's "today" (date, pct_red), oldest first.
   * `card`: the room's days.json row (today, k_x1000, weight_complete_day). `trip`: {distance_km | transit_days,
   * transit_temp_c, shop_temp_c, drivers, min_best_shelf_days} (missing values use meta.truck).
   */
  function planTrip(fc, card, truck, trip = {}) {
    const k = Number(card.k_x1000) / 1000;
    const days = trip.transit_days != null ? Math.max(0, Math.round(Number(trip.transit_days)))
      : transitDays(Number(trip.distance_km || 0), truck, Number(trip.drivers || 1));
    const transitTemp = trip.transit_temp_c != null ? Number(trip.transit_temp_c) : truck.temp_c;
    const shopTemp = trip.shop_temp_c != null ? Number(trip.shop_temp_c) : truck.shop_temp_c;
    const need = trip.min_best_shelf_days != null ? Number(trip.min_best_shelf_days) : truck.min_best_shelf_days;
    const transitDD = days * Math.max(transitTemp - truck.base_temp_c, 0);
    const shopDD = Math.max(shopTemp - truck.base_temp_c, 0);

    const rows = fc.map((r) => {
      const arrive = ripen(r.pct_red, k, transitDD);
      return { date: r.date, pct_at_pluck: r.pct_red, pct_on_arrival: arrive,
        sellable_on_arrival: sellableShare(arrive, truck, card.pot_spread_sd ?? truck.pot_spread_sd), ...shelf(arrive, k, shopDD, truck) };
    });
    const sellable = rows.find((r) => r.sellable_on_arrival >= truck.earliest_sellable_share);
    const shipBy = rows.filter((r) => r.best_days != null && r.best_days >= need && r.best_until >= r.best_from).pop();
    const base = { transit_days: days, transit_temp_c: transitTemp, shop_temp_c: shopTemp, min_best_shelf_days: need,
      weight_complete_day: card.weight_complete_day, earliest_sellable_day: sellable ? sellable.date : null,
      ship_by_day: shipBy ? shipBy.date : null, too_long: days > truck.max_transit_days,
      chilling_risk: transitTemp < 10 };
    if (!card.weight_complete_day || !sellable) return { ...base, pluck_day: null, pluck_reason: 'beyond_forecast' };
    const options = [['weight', card.weight_complete_day], ['sellable', sellable.date], ['today', card.today]];
    let [reason, pluck] = options[0];
    for (const [r, d] of options.slice(1)) if (d > pluck) { reason = r; pluck = d; }
    const at = rows.find((r) => r.date === pluck);
    if (!at) return { ...base, pluck_day: null, pluck_reason: 'beyond_forecast' };
    const arrival = addDays(pluck, days);
    const on = (n) => (n == null ? null : addDays(arrival, n));
    return { ...base, pluck_day: pluck, pluck_reason: reason, arrival_day: arrival, pct_at_pluck: at.pct_at_pluck,
      pct_on_arrival: at.pct_on_arrival, sellable_on_arrival: at.sellable_on_arrival,
      best_from: on(at.best_from), best_until: on(at.best_until), sell_until: on(at.sell_until),
      best_shelf_days: at.best_days, late: !!(base.ship_by_day && pluck > base.ship_by_day) };
  }

  const api = { planTrip, transitDays, ripen, shelf, sellableShare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Trip = api;
})(typeof window !== 'undefined' ? window : globalThis);
