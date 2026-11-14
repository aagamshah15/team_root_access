/* "When to pluck for shipping" (D14): preset destination plans from shipping.json, all destinations in a table,
 * a plan-your-own-trip form computed in the browser with lib/trip.ts, and the AI assistant behind a flag. */
import { useState, type FormEvent } from 'react';
import { useApp } from '../App';
import type { DayCard, Destination, ForecastRow, ShippingRow, Truck } from '../data/types';
import { addDays, day, euro, km, pct, plural, rel, share, short, signedEuro, span } from '../data/format';
import { PLUCK_WHY } from '../lib/words';
import { planTrip, type TripPlan } from '../lib/trip';
import { DestinationPicker, roadWords } from '../components/DestinationPicker';
import { ShippingAssistant, assistantAvailable } from '../components/ShippingAssistant';

interface Props { room: string; d: DayCard; fc: ForecastRow[]; dest: string | null; setDest: (id: string) => void; onExplain: () => void }

/** Arrival and shelf dates for a published plan (offsets in shipping.json are days after arrival). */
export function shipDates(r: ShippingRow, dest: Destination) {
  const arrive = addDays(r.pluck_day, dest.transit_days);
  const at = (n: number | null) => (n == null ? null : addDays(arrive, n));
  return { arrive, from: at(r.best_from), until: at(r.best_until), sell: at(r.sell_until) };
}

export function ShippingSection({ room, d, fc, dest, setDest, onExplain }: Props) {
  const { store, route } = useApp();
  const truck = store.truck as Truck;
  const dests = store.destinations;
  const destination = dests.find((x) => x.id === dest) ?? dests[0];
  const r = store.ship(room, route.t, destination.id);
  const [trip, setTrip] = useState<{ plan: TripPlan; label: string } | null>(null);
  return (
    <section className="card section" id="ship">
      <h2>When to pluck for shipping</h2>
      <p className="caption">Pick where the pots go. The pluck day is the earliest day the fruit has stopped gaining weight and enough pots are ready to sell when they arrive; picking later only uses up shelf life.</p>
      <DestinationPicker destinations={dests} value={destination.id} onChange={setDest} />
      <div aria-live="polite">
        {!r ? (
          <>
            <p className="finding">No pluck day within the forecast yet.</p>
            <p className="caption">The fruit is estimated to stop gaining weight on {day(d.weight_complete_day)}. Check again closer to that day.</p>
          </>
        ) : <PresetPlan r={r} dest={destination} d={d} truck={truck} today={route.t} />}
        <button type="button" className="link" onClick={onExplain}>How is this worked out? ›</button>
      </div>

      <h3>All destinations</h3>
      <div className="table-wrap">
        <table className="nowrap">
          <thead><tr><th>Destination</th><th className="r">Truck</th><th>Pluck</th><th>Arrives</th><th className="r">Red on arrival</th><th>Best on shelf</th><th>Sell by</th></tr></thead>
          <tbody>
            {dests.map((x) => {
              const row = store.ship(room, route.t, x.id);
              if (!row) return <tr key={x.id}><td>{x.name}</td><td className="r">{roadWords(x.transit_days)}</td><td colSpan={5} className="muted">beyond the forecast</td></tr>;
              const L = shipDates(row, x);
              return (
                <tr key={x.id} className={x.id === destination.id ? 'win' : ''}>
                  <td>{x.name}</td><td className="r">{roadWords(x.transit_days)}</td><td>{short(row.pluck_day)}</td><td>{short(L.arrive)}</td>
                  <td className="r num">{pct(row.pct_on_arrival)}</td><td>{span(L.from, L.until)}</td><td>{short(L.sell)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="caption">
        Model estimate. Refrigerated truck at {truck.temp_c} °C, one driver {truck.driving_hours_per_day} h a day at {truck.avg_speed_kmh} km/h (same day up to {truck.same_day_km} km); shop {truck.shop_temp_c} °C.
        Best condition = {truck.best_band_pct_red[0]}–{truck.best_band_pct_red[1]}% of fruit weight red; off the shelf at {truck.end_of_life_pct_red}%. Pots are judged when they arrive.
        Distances are approximate road distances from the greenhouse (Bleiswijk, NL). Freight cost is not included. Source: shipping.json, days.json.
      </p>

      <h3>Plan your own trip</h3>
      <TripForm truck={truck} onPlan={(label, input) => setTrip({ label, plan: planTrip(fc, d, truck, input) })} />
      <div aria-live="polite">{trip && <TripResult plan={trip.plan} label={trip.label} truck={truck} today={route.t} />}</div>

      {assistantAvailable() && (
        <>
          <h3>Ask the shipping assistant</h3>
          <ShippingAssistant key={`${room}|${route.t}`} room={room} roomName={store.roomName(room)} today={route.t} d={d} fc={fc}
            truck={truck} dests={dests} onPlan={(plan, label) => setTrip({ plan, label })} />
        </>
      )}
    </section>
  );
}

function PresetPlan({ r, dest, d, truck, today }: { r: ShippingRow; dest: Destination; d: DayCard; truck: Truck; today: string }) {
  const L = shipDates(r, dest);
  const late = !!(r.ship_by_day && r.pluck_day > r.ship_by_day);
  const tooLong = dest.transit_days > truck.max_transit_days;
  const gap = r.profit_m2_day != null && r.profit_best_m2_day != null ? r.profit_m2_day - r.profit_best_m2_day : null;
  const bestDays = r.best_until != null && r.best_from != null ? r.best_until - r.best_from + 1 : null;
  return (
    <>
      <p className="finding">Pluck on {day(r.pluck_day)} ({rel(today, r.pluck_day)}): {PLUCK_WHY[r.pluck_reason] ?? r.pluck_reason}.</p>
      <div className="parts">
        <div className="part"><div className="micro">Fruit stops growing</div><div className="part-v">{short(d.weight_complete_day)}</div><div className="caption">nearly all final fruit weight (estimate)</div></div>
        <div className="part"><div className="micro">Pluck day</div><div className="part-v">{short(r.pluck_day)}</div><div className="caption">fruit {pct(r.pct_at_pluck)} red when picked</div></div>
        <div className="part"><div className="micro">Arrives in {dest.name}</div><div className="part-v">{short(L.arrive)}</div><div className="caption">{pct(r.pct_on_arrival)} red · {share(r.sellable_on_arrival)} of pots ready to sell</div></div>
        <div className="part"><div className="micro">Best on the shelf</div><div className="part-v">{span(L.from, L.until)}</div><div className="caption">{plural(bestDays, 'day')} · sell by {short(L.sell)}</div></div>
        <div className="part"><div className="micro">Profit at pluck day</div><div className="part-v">{euro(r.profit_m2_day, 3)}</div>
          <div className="caption">per m² per day; best-profit day {short(r.best_profit_day)} gives {euro(r.profit_best_m2_day, 3)} ({signedEuro(gap, 3)})</div></div>
      </div>
      <p className="note">{late
        ? `Plucking this late leaves fewer than ${truck.min_best_shelf_days} days in best condition: the last day that still does is ${day(r.ship_by_day)}.`
        : `Latest pluck day that still leaves ${truck.min_best_shelf_days}+ days in best condition: ${day(r.ship_by_day)}.`}</p>
      {tooLong && <p className="note warn">{plural(dest.transit_days, 'day')} on the road is more than {truck.max_transit_days}: potted plants may yellow and drop fruit in a dark truck.</p>}
    </>
  );
}

function TripForm({ truck, onPlan }: { truck: Truck; onPlan: (label: string, input: Parameters<typeof planTrip>[3]) => void }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const f = new FormData(form);
    const distance = Number(f.get('distance_km'));
    onPlan(`${String(f.get('name') || 'Your trip')} (${km(distance)} km)`, {
      distance_km: distance, drivers: Number(f.get('drivers')), transit_temp_c: Number(f.get('transit_temp_c')),
      shop_temp_c: Number(f.get('shop_temp_c')), min_best_shelf_days: Number(f.get('min_best_shelf_days')),
    });
  };
  return (
    <form className="trip-form" onSubmit={submit}>
      <label className="field"><span className="micro">Where to</span><input name="name" maxLength={60} defaultValue="My buyer" /></label>
      <label className="field"><span className="micro">Road distance (km)</span><input name="distance_km" type="number" min={0} max={5000} step={10} required defaultValue={1200} /></label>
      <label className="field"><span className="micro">Drivers</span>
        <select name="drivers" defaultValue="1"><option value="1">1 ({truck.driving_hours_per_day} h a day)</option><option value="2">2 ({truck.driving_hours_per_day * 2} h a day)</option></select></label>
      <label className="field"><span className="micro">Truck temperature (°C)</span><input name="transit_temp_c" type="number" min={0} max={30} step={0.5} required defaultValue={truck.temp_c} /></label>
      <label className="field"><span className="micro">Shop temperature (°C)</span><input name="shop_temp_c" type="number" min={5} max={35} step={0.5} required defaultValue={truck.shop_temp_c} /></label>
      <label className="field"><span className="micro">Best days wanted on the shelf</span><input name="min_best_shelf_days" type="number" min={1} max={14} step={1} required defaultValue={truck.min_best_shelf_days} /></label>
      <button className="btn" type="submit">Work out the pluck day</button>
    </form>
  );
}

export function TripResult({ plan, label, truck, today }: { plan: TripPlan; label: string; truck: Truck; today: string }) {
  if (!plan.pluck_day) {
    return <p className="finding">{label}: no pluck day within the forecast yet (fruit estimated to stop growing {day(plan.weight_complete_day)}).</p>;
  }
  const warn: string[] = [];
  if (plan.chilling_risk) warn.push('A truck below 10 °C risks chilling damage (poor colour, soft spots).');
  if (plan.too_long) warn.push(`${plural(plan.transit_days, 'day')} on the road is more than ${truck.max_transit_days}: potted plants may yellow and drop fruit in a dark truck.`);
  if (plan.late) warn.push(`Plucking this late leaves fewer than ${plan.min_best_shelf_days} best days on the shelf.`);
  return (
    <div className="trip-out">
      <p className="finding">{label}: pluck on {day(plan.pluck_day)} ({rel(today, plan.pluck_day)}), {PLUCK_WHY[plan.pluck_reason]}.</p>
      <div className="parts">
        <div className="part"><div className="micro">On the road</div><div className="part-v">{roadWords(plan.transit_days)}</div><div className="caption">truck {plan.transit_temp_c} °C</div></div>
        <div className="part"><div className="micro">Arrives</div><div className="part-v">{short(plan.arrival_day)}</div><div className="caption">{pct(plan.pct_on_arrival)} red · {share(plan.sellable_on_arrival)} of pots ready to sell</div></div>
        <div className="part"><div className="micro">Best on the shelf</div><div className="part-v">{plan.best_shelf_days ? span(plan.best_from, plan.best_until) : '—'}</div>
          <div className="caption">{plan.best_shelf_days ? `${plural(plan.best_shelf_days, 'day')} · ` : ''}sell by {short(plan.sell_until)}</div></div>
        <div className="part"><div className="micro">Latest pluck day</div><div className="part-v">{short(plan.ship_by_day)}</div><div className="caption">still {plan.min_best_shelf_days}+ best days</div></div>
      </div>
      {warn.map((w, i) => <p key={i} className="note warn">{w}</p>)}
    </div>
  );
}
