"""Pluck date for a destination: fruit finished growing, sellable on arrival, best on the shelf.

The grower's question: "When should I pluck so that I lose no weight, the pots are ready to sell when
they arrive, and they stay in best condition on the shelf as long as possible?"

pluck day = the latest of
  1. the weight-complete day (growth.py): from then on the fruit only turns red, it gains no weight;
  2. the first day enough pots (`economics.earliest_sellable_share`) would sell **on arrival**, after
     ripening in the truck (pots are judged by the buyer on delivery);
  3. today.
Picking any later only uses up shelf life. The ship-by day is the last pluck day that still leaves
`logistics.min_best_shelf_days` days in best condition after arrival; a pluck day after it is flagged.
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from harvest.common import Inputs
from harvest.economics import harvest_window, profit_by_day
from harvest.growth import weight_complete_day
from harvest.logistics import ripen, ripening_per_day, shelf, transit_days


def _shelf_rows(fc: pd.DataFrame, k: float, transit_dd: float, shop_dd: float, logistics: dict) -> list[dict]:
    """For every possible pluck day: % red on arrival and the shelf days that leaves."""
    out = []
    for x in fc.itertuples(index=False):
        arrive = ripen(x.pct_red, k, transit_dd)
        out.append(dict(date=x.date, pct_at_pluck=float(x.pct_red), pct_on_arrival=arrive,
                        **shelf(arrive, k, shop_dd, logistics)))
    return out


def ship_plan(inputs: Inputs, room: str, today: date, settings: dict, params: dict, fc: pd.DataFrame,
              destination: dict, weight: dict | None = None) -> dict:
    """One shipping.json row: pluck day, arrival, ripeness, shelf window and profit for one destination."""
    lg = settings['logistics']
    base = float(settings['base_temp_c'])
    days_on_road = transit_days(float(destination['distance_km']), lg)
    transit_dd = days_on_road * ripening_per_day(float(lg['transit_temp_c']), base)
    shop_dd = ripening_per_day(float(lg['shop_temp_c']), base)
    k = float(params['k'])

    curve = profit_by_day(inputs, room, today, fc, params, settings=settings, transit_dd=transit_dd)
    win = harvest_window(curve, settings)
    weight = weight or weight_complete_day(inputs, room, today, params['gdd_today'], params['gdd_rate'], settings)
    shelf_by_day = _shelf_rows(fc, k, transit_dd, shop_dd, lg)
    need = int(lg['min_best_shelf_days'])
    ok = [r['date'] for r in shelf_by_day if r['best_days'] is not None and r['best_days'] >= need
          and r['best_until'] >= r['best_from']]
    ship_by = ok[-1] if ok else None

    candidates = {'weight': weight['day'], 'sellable': win['earliest_sellable_day'], 'today': today}
    last = fc.date.iloc[-1]
    if candidates['weight'] is None or candidates['sellable'] is None:
        pluck, reason = None, 'beyond_forecast'
    else:
        reason, pluck = max(candidates.items(), key=lambda kv: (kv[1], kv[0] == 'weight'))
        if pluck > last:
            pluck, reason = None, 'beyond_forecast'

    row = dict(destination=destination['id'], distance_km=float(destination['distance_km']),
               transit_days=days_on_road, weight_complete_day=weight['day'], pluck_day=pluck, pluck_reason=reason,
               ship_by_day=ship_by, late=bool(pluck and ship_by and pluck > ship_by),
               best_profit_day=win['best_day'], profit_best_m2_day=win['profit_best_m2_day'],
               arrival_day=None, pct_at_pluck=None, pct_on_arrival=None, sellable_share_on_arrival=None,
               best_from=None, best_until=None, sell_until=None, best_shelf_days=None, profit_m2_day=None,
               too_long=days_on_road > int(lg['max_transit_days']))
    if pluck is not None:
        s = next(r for r in shelf_by_day if r['date'] == pluck)
        c = curve[curve.date == pluck].iloc[0]
        arrive = pluck + timedelta(days=days_on_road)
        at = lambda n: None if n is None else arrive + timedelta(days=int(n))
        row.update(arrival_day=arrive, pct_at_pluck=s['pct_at_pluck'], pct_on_arrival=s['pct_on_arrival'],
                   sellable_share_on_arrival=float(c.sellable_share), best_from=at(s['best_from']),
                   best_until=at(s['best_until']), sell_until=at(s['sell_until']), best_shelf_days=s['best_days'],
                   profit_m2_day=float(c.profit_m2_day))
    return row
