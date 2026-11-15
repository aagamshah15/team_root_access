// app/trip.js must give the same pluck plan as harvest/shipping.py for every published room, day and
// preset destination (shipping.json), so trips typed in the app or chosen by the assistant match.
// Run: node tests/test_trip.cjs   (part of `make test`)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planTrip, transitDays } = require('../app/trip.js');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', f + '.json'), 'utf8'));
const ship = load('shipping'), days = load('days'), fcDoc = load('forecast');
const truck = ship.meta.truck;
const cards = new Map(days.rows.map((r) => [r.room + '|' + r.today, r]));
const fc = new Map();
for (const r of fcDoc.rows) {
  const key = r.room + '|' + r.today;
  if (!fc.has(key)) fc.set(key, []);
  fc.get(key).push(r);
}
fc.forEach((v) => v.sort((a, b) => (a.date < b.date ? -1 : 1)));
const dest = new Map(ship.meta.destinations.map((d) => [d.id, d]));

// hand checks: 560 km a day for one driver; 1,120 for two
assert.equal(transitDays(30, truck), 0);
assert.equal(transitDays(850, truck), 2);
assert.equal(transitDays(1750, truck), 4);
assert.equal(transitDays(1750, truck, 2), 2);   // 1750 / 1120 = 1.56 -> 2

let n = 0;
for (const r of ship.rows) {
  const d = dest.get(r.destination);
  const plan = planTrip(fc.get(r.room + '|' + r.today), cards.get(r.room + '|' + r.today), truck,
    { distance_km: d.distance_km });
  const key = `${r.room} ${r.today} ${r.destination}`;
  assert.equal(plan.transit_days, d.transit_days, key);
  assert.equal(plan.pluck_day, r.pluck_day, key + ' pluck');
  assert.equal(plan.pluck_reason, r.pluck_reason, key + ' reason');
  assert.equal(plan.ship_by_day, r.ship_by_day, key + ' ship-by');
  assert(Math.abs(plan.pct_on_arrival - r.pct_on_arrival) < 0.06, key + ' arrival %');
  assert(Math.abs(plan.sellable_on_arrival - r.sellable_on_arrival) < 0.006, key + ' sellable');
  assert.equal(plan.best_from, r.best_from == null ? null : addDays(plan.arrival_day, r.best_from), key + ' best from');
  assert.equal(plan.sell_until, addDays(plan.arrival_day, r.sell_until), key + ' sell by');
  n += 1;
}
function addDays(iso, k) { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); }

// a warmer truck ripens pots on the road: they arrive riper, never less ripe
const any = ship.rows.find((r) => r.destination === 'madrid');
const c = cards.get(any.room + '|' + any.today), f = fc.get(any.room + '|' + any.today);
const cold = planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 12 });
const warm = planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 18 });
assert(warm.pct_on_arrival >= cold.pct_on_arrival);
assert(planTrip(f, c, truck, { distance_km: 1750, transit_temp_c: 8 }).chilling_risk);
console.log(`trip.js matches shipping.py on ${n} published plans; truck-temperature checks passed.`);
