"""Write app/data/*.json from the lane modules (contracts/app-data.md).

Owner: integrator. Run: python -m harvest.publish   (or `make build`, which also selects photos and checks the output)

For every room and every "today" it fits the forecast once, then derives the profit curve, harvest window,
confidence, status and the temperature what-ifs from that one fit, so all numbers for a room-day agree.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import yaml

from harvest.common import REPO, ROOMS, Inputs, planted, actual_harvest, load_inputs, load_settings, today_range
from harvest.confidence import confidence
from harvest.economics import harvest_window, look_day, optimal_zone, profit_by_day
from harvest.evidence import evidence_rows
from harvest.alerts import alerts
from harvest.backtest import timing_test
from harvest.forecast import fit_params, forecast
from harvest.growth import weight_complete_day
from harvest.explain import meta_block as explain_meta, room_day_values
from harvest.shipping import ship_plan
from harvest.logistics import transit_days
from harvest.economics import Z
from harvest.whatif import NOTE as WHATIF_NOTE, heating_cost_per_degree, whatif

OUT = REPO / 'app' / 'data'
DELTAS = [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0]
SOURCE = ('4th Autonomous Greenhouse Challenge: Dwarf Tomato Timeseries and Images (Maree et al., 4TU.ResearchData, '
          'CC BY 4.0), via the derived tables in out/dash/. Scoring rules: Maree et al. 2025, Sensors 25:4321.')


def _iso(v):
    """JSON-safe value: dates to ISO strings, numpy scalars to Python, NaN/inf to None."""
    if isinstance(v, (date, datetime)):
        return v.isoformat()[:10]
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return None if not np.isfinite(v) else round(float(v), 4)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, dict):
        return {k: _iso(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_iso(x) for x in v]
    return v


def status_for(today: date, win: dict, sellable_now: float, conf: dict, settings: dict) -> str:
    """Card status (contract §2 rule): check the crop when unsure, else harvest now / plan / keep growing."""
    if conf['level'] == 'low' or conf['agreement'] == 'conflict':
        return 'check_crop'
    if win['best_day_low'] <= today <= win['best_day_high'] and sellable_now >= settings['economics']['harvest_now_share']:
        return 'harvest_now'
    if (win['best_day'] - today).days <= 7:
        return 'plan_harvest'
    return 'keep_growing'


def compact_ship(room: str, today: date, r: dict) -> dict | None:
    """shipping.json row (contract §1): shelf dates as days after arrival, distance and days on the road in
    meta.destinations, and no row when the pluck day is beyond the forecast (keeps app/data under 5 MB)."""
    if r['pluck_day'] is None:
        return None
    after = lambda d: (d - r['arrival_day']).days
    return dict(room=room, today=today, destination=r['destination'], pluck_day=r['pluck_day'],
                pluck_reason=r['pluck_reason'], ship_by_day=r['ship_by_day'],
                pct_at_pluck=round(r['pct_at_pluck'], 1), pct_on_arrival=round(r['pct_on_arrival'], 1),
                sellable_on_arrival=round(r['sellable_share_on_arrival'], 2), best_from=after(r['best_from']),
                best_until=after(r['best_until']), sell_until=after(r['sell_until']),
                profit_m2_day=round(r['profit_m2_day'], 3), best_profit_day=r['best_profit_day'],
                profit_best_m2_day=round(r['profit_best_m2_day'], 3))


def room_day(inputs: Inputs, room: str, today: date, settings: dict, heat: dict
             ) -> tuple[dict, list[dict], list[dict], list[dict], dict]:
    """One decision card, its 22-day forecast rows, what-if rows, shipping rows and explain.json row, all
    from one fit."""
    horizon = int(settings['ripeness']['horizon_days'])
    p = fit_params(inputs, room, today, settings)
    fc = forecast(inputs, room, today, horizon=horizon, settings=settings, params=p)
    curve = profit_by_day(inputs, room, today, fc, p, settings=settings)
    win = harvest_window(curve, settings)
    conf = confidence(inputs, room, today, settings, params=p)
    now = curve.iloc[0]
    levels = conf.get('part_levels', {})
    card = dict(room=room, today=today, status=status_for(today, win, float(now.sellable_share), conf, settings),
                pct_red_now=float(fc.pct_red.iloc[0]), pct_red_low=float(fc.pct_red_low.iloc[0]),
                pct_red_high=float(fc.pct_red_high.iloc[0]), sellable_share_now=float(now.sellable_share),
                model=p['model'] if p['model'] != 'warmth' or p['sample_used'] is None else 'warmth+sample',
                earliest_sellable_day=win['earliest_sellable_day'], best_day=win['best_day'],
                losses_start_day=win['losses_start_day'], best_day_low=win['best_day_low'],
                best_day_high=win['best_day_high'], profit_best_m2_day=win['profit_best_m2_day'],
                profit_today_m2_day=float(now.profit_m2_day), confidence=conf['level'],
                conf_day_range_days=int(round(conf['day_range_days'])), conf_agreement=conf['agreement'],
                conf_freshness_days=int(conf['freshness_days']), conf_reasons=conf['reasons'],
                conf_day_range_level=levels.get('day_range'), conf_agreement_level=levels.get('agreement'),
                conf_freshness_level=levels.get('freshness'))
    card.update(optimal_zone(curve, win['best_day'], float(settings['economics']['optimal_zone_share'])))  # D16
    card['look_day'] = look_day(fc, float(settings['logistics']['best_band_pct_red'][0]))                 # D16
    weight = weight_complete_day(inputs, room, today, p['gdd_today'], p['gdd_rate'], settings)
    card['weight_complete_day'] = weight['day']   # shipping extension: fruit stops gaining weight
    card['k_x1000'] = p['k'] * 1000               # curve steepness per 1000 dd (keeps precision after 4-dp rounding) for app/trip.js
    plans = {dest['id']: ship_plan(inputs, room, today, settings, p, fc, dest, weight)
             for dest in settings['logistics']['destinations']}
    ships = [compact_ship(room, today, plan) for plan in plans.values()]
    ships = [r for r in ships if r is not None]
    spread = dict(sd=float(settings['ripeness']['plant_spread_sd']), fitted=False)
    explain = dict(room=room, today=today, values=room_day_values(
        card, curve, p, plans[settings['logistics']['default_destination']], settings, spread))
    rows = [dict(room=room, today=today, date=r.date, pct_red=r.pct_red, pct_red_low=r.pct_red_low,
                 pct_red_high=r.pct_red_high, sellable_share=r.sellable_share, profit_m2_day=r.profit_m2_day,
                 profit_low=r.profit_low, profit_high=r.profit_high, cost_to_date_m2=r.cost_to_date_m2)
            for r in curve.itertuples()]
    fixed = lambda *a, **k: p   # reuse this fit for every what-if (same "today", same evidence)
    fc_fn = lambda inp, rm, td, delta_c=0.0, horizon=horizon: forecast(inp, rm, td, delta_c=delta_c, horizon=horizon,
                                                                        settings=settings, params=p)
    wi = [dict(room=room, today=today, **whatif(inputs, room, today, d, forecast_fn=fc_fn, params_fn=fixed,
                                                  settings=settings, heat=heat)) for d in DELTAS]
    return card, rows, wi, ships, explain


def customers_and_rooms(inputs: Inputs) -> tuple[list[dict], list[dict]]:
    with open(REPO / 'config' / 'customers.yaml') as f:
        cfg = yaml.safe_load(f)['customers']
    customers = [dict(customer_id=c['customer_id'], name=c['name'], tagline=c['tagline'],
                      rooms=[r['room'] for r in c['rooms']]) for c in cfg]
    rooms = [dict(room=r['room'], display_name=r['display_name'], customer_id=c['customer_id'], area_m2=r['area_m2'],
                  planted=planted(r['room']), actual_harvest=actual_harvest(inputs, r['room'])) for c in cfg for r in c['rooms']]
    assert sorted(r['room'] for r in rooms) == ROOMS, 'every room must belong to exactly one demo customer'
    return customers, rooms


def assumptions_rows(settings: dict) -> list[dict]:
    def get(key):
        v = settings
        for part in key.split('.'):
            v = v[part]
        return v
    return [dict(name=a['name'], value=get(a['key']) if 'key' in a else a.get('value'), unit=a.get('unit', ''),
                 source=a['source'], if_wrong=a['if_wrong']) for a in settings.get('assumptions', [])]


# Decimal places per published field: enough for what the app shows and for app/trip.js to reproduce the
# shipping plans, no more (pct_red stays at 4 places: app/trip.js recomputes ship-by days from it) (keeps app/data under the 5 MB budget in CLAUDE.md). Fields not listed keep 4.
DECIMALS = {'pct_red_low': 1, 'pct_red_high': 1, 'pct_red_now': 1, 'pct_at_pluck': 1, 'pct_on_arrival': 1,
            'sellable_share': 3, 'sellable_share_now': 3, 'profit_m2_day': 3, 'profit_low': 3, 'profit_high': 3,
            'cost_to_date_m2': 2, 'profit_best_m2_day': 3, 'profit_today_m2_day': 3, 'profit_change_m2_day': 3,
            'red_index': 2, 'green_pct': 1, 'canopy_distance_mm': 0, 'gdd_cum': 1}


def _rounded(row: dict) -> dict:
    return {k: (round(float(v), DECIMALS[k]) if k in DECIMALS and isinstance(v, (float, np.floating)) and np.isfinite(v)
                else v) for k, v in row.items()}


def write(name: str, rows: list[dict], as_of: tuple[date, date], **meta) -> None:
    doc = {'meta': _iso(dict(source=SOURCE, built_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                             as_of={'from': as_of[0], 'to': as_of[1]}, **meta)),
           'rows': _iso([_rounded(r) for r in rows])}
    (OUT / f'{name}.json').write_text(json.dumps(doc, separators=(',', ':'), allow_nan=False))


def main() -> int:
    inputs, settings = load_inputs(), load_settings()
    OUT.mkdir(parents=True, exist_ok=True)
    customers, rooms = customers_and_rooms(inputs)
    todays = sorted({t for r in ROOMS for t in today_range(inputs, r)})
    as_of = (todays[0], todays[-1])
    heat_by_day = {t: heating_cost_per_degree(inputs, t) for t in todays}

    cards, fc_rows, wi_rows, ship_rows, explain_rows = [], [], [], [], []
    for room in ROOMS:
        for t in today_range(inputs, room):
            c, f, w, sh, ex = room_day(inputs, room, t, settings, heat_by_day[t])
            cards.append(c); fc_rows += f; wi_rows += w; ship_rows += sh; explain_rows.append(ex)
    summary, per_room = timing_test(inputs, settings)

    write('customers', customers, as_of)
    write('rooms', rooms, as_of)
    write('days', cards, as_of)
    write('forecast', fc_rows, as_of)
    for r in wi_rows:   # the fixed opening sentence goes in meta.note once instead of on 1,494 rows;
        r['note'] = r['note'].removeprefix(WHATIF_NOTE).replace(' Heating-cost fit is weak (r² below 0.3).', '').strip()
    write('whatif', wi_rows, as_of, note=WHATIF_NOTE, heating_fit=heat_by_day[todays[-1]],
          heating_fit_by_today={t.isoformat(): h for t, h in heat_by_day.items()})   # L06 S1: caption matches the day's numbers
    write('evidence', evidence_rows(inputs), as_of)
    write('alerts', alerts(inputs, settings), as_of)
    write('backtest', summary.to_dict('records'), as_of, per_room=per_room)
    write('assumptions', assumptions_rows(settings), as_of)
    lg = settings['logistics']
    dests = [dict(id=d['id'], name=d['name'], distance_km=d['distance_km'], transit_days=transit_days(d['distance_km'], lg))
             for d in lg['destinations']]
    write('shipping', ship_rows, as_of, destinations=dests, truck=dict(
        temp_c=lg['transit_temp_c'], driving_hours_per_day=lg['driving_hours_per_day'], avg_speed_kmh=lg['avg_speed_kmh'],
        same_day_km=lg['same_day_km'], max_transit_days=lg['max_transit_days'], shop_temp_c=lg['shop_temp_c'],
        best_band_pct_red=lg['best_band_pct_red'], end_of_life_pct_red=lg['end_of_life_pct_red'],
        min_best_shelf_days=lg['min_best_shelf_days'], default_destination=lg['default_destination'],
        base_temp_c=settings['base_temp_c'], pot_spread_sd=settings['ripeness']['plant_spread_sd'],
        sellable_red_share=settings['economics']['sellable_red_share'],
        earliest_sellable_share=settings['economics']['earliest_sellable_share'],
        pot_z=[round(float(z), 5) for z in Z]))
    write('explain', explain_rows, as_of, **explain_meta(settings))   # compact form: see harvest/explain.py
    size = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) / 1e6
    print(f'publish: {len(cards)} decision cards, {len(fc_rows)} forecast rows, {len(wi_rows)} what-if rows; '
          f'app/data is {size:.1f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
