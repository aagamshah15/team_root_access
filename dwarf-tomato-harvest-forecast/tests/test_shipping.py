"""Shipping extension: growth stop, truck and shelf, and the pluck day. Hand-worked values in comments."""
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from harvest.common import Inputs
from harvest.economics import profit_by_day
from harvest.forecast import fit_params, forecast
from harvest.growth import complete_gdd, fit_growth, weight_complete_day, weight_curve
from harvest.logistics import ripen, ripening_per_day, shelf, transit_days
from harvest.shipping import ship_plan

LG = dict(same_day_km=300, avg_speed_kmh=70, driving_hours_per_day=8, best_band_pct_red=[70, 90], end_of_life_pct_red=94)


# ---------------------------------------------------------------- logistics

@pytest.mark.parametrize('km, days', [(30, 0), (300, 0), (500, 1), (560, 1), (850, 2), (1500, 3), (1750, 4)])
def test_transit_days(km, days):
    # 70 km/h x 8 h = 560 km a day; 1500 / 560 = 2.68 -> 3; 1750 / 560 = 3.125 -> 4
    assert transit_days(km, LG) == days


def test_ripening_per_day():
    assert ripening_per_day(13, 10) == 3      # refrigerated truck
    assert ripening_per_day(20, 10) == 10     # shop
    assert ripening_per_day(8, 10) == 0       # below base: no ripening


def test_ripen():
    # logit(60 %) = 0.405; + 0.026 x 9 = 0.639 -> 100 / (1 + e^-0.639) = 65.5 %
    assert ripen(60, 0.026, 9) == pytest.approx(65.45, abs=0.05)
    assert ripen(60, 0.026, 0) == pytest.approx(60)


def test_shelf():
    # arrival 66 %, step 0.026 x 10 = 0.26 per day: to 70 % 0.71 d -> day 1; to 90 % 5.9 d -> day 5;
    # to 94 % 8.03 d -> day 8 (floor); best days 1..5 = 5
    s = shelf(66, 0.026, 10, LG)
    assert (s['best_from'], s['best_until'], s['sell_until'], s['best_days']) == (1, 5, 8, 5)
    # already in the band on arrival
    assert shelf(75, 0.026, 10, LG)['best_from'] == 0


# ---------------------------------------------------------------- growth

def test_weight_curve_and_complete_gdd():
    assert weight_curve(500, 300, 0.02, 500) == pytest.approx(150)
    # 474 + ln(0.98 / 0.02) / 0.0148 = 474 + 3.892 / 0.0148 = 474 + 262.96 = 736.96
    assert complete_gdd(0.0148, 474, 0.98) == pytest.approx(736.96, abs=0.05)


GROWTH = {'growth': dict(complete_share=0.98, prior_steepness=0.0148, prior_half_gdd=474.0, min_rooms=3)}


def _samples(g_half, rooms=('a', 'b', 'c', 'd'), g=(350, 500, 650, 900)):
    rows = []
    for i, r in enumerate(rooms):
        w_max = 280 + 20 * i
        for x in g:
            rows.append(dict(room=r, gdd_cum=float(x), fw_total=float(weight_curve(x, w_max, 0.0148, g_half))))
    return pd.DataFrame(rows)


def test_fit_growth_recovers_timing_and_falls_back():
    fit = fit_growth(_samples(490), GROWTH)
    assert fit['fitted'] and fit['g_half'] == pytest.approx(490, abs=1)
    assert fit['a'] == 0.0148                                   # steepness is held at the setting
    few = fit_growth(_samples(490, rooms=('a', 'b')), GROWTH)   # 2 rooms < min_rooms 3 -> starting guess
    assert not few['fitted'] and few['g_half'] == 474.0


def _inputs(gdd_per_day=10.0):
    days = [date(2024, 9, 3) + timedelta(days=i) for i in range(70)]
    daily = pd.DataFrame([dict(room=r, date=d, gdd_cum=gdd_per_day * (i + 1)) for r in ('x', 'a', 'b', 'c', 'd')
                          for i, d in enumerate(days)])
    s = _samples(474)
    s['date'] = date(2024, 10, 1)        # known well before the test "today"
    s['sample'] = 'destructive'
    return Inputs(daily=daily, ripeness=s, plants=None, images=None, weather=None, folder=None)


def test_weight_complete_day_future_and_past():
    inp = _inputs()
    # fit on rooms a-d gives g_half 474 -> complete at 737 dd; today 2024-11-01 is day 60 -> 600 dd, 10 dd/day
    # -> ceil((737 - 600) / 10) = ceil(13.7) = 14 days -> 2024-11-15
    w = weight_complete_day(inp, 'x', date(2024, 11, 1), 600.0, 10.0, GROWTH)
    assert w['day'] == date(2024, 11, 15) and w['gdd'] == pytest.approx(737, abs=1)
    # already past: first logged day with gdd_cum >= 737 is day index 73.7 -> beyond 70 days, so use a later today
    inp2 = _inputs(gdd_per_day=12.0)      # 12 dd/day: 737 / 12 = 61.4 -> 62nd day = 2024-11-03
    w2 = weight_complete_day(inp2, 'x', date(2024, 11, 8), 12.0 * 67, 12.0, GROWTH)
    assert w2['day'] == date(2024, 11, 3)


# ---------------------------------------------------------------- arrival judging and pluck day

def test_arrival_judging_sells_more_pots(inputs, settings):
    p = fit_params(inputs, 'mugrow', date(2024, 11, 6), settings)
    fc = forecast(inputs, 'mugrow', date(2024, 11, 6), settings=settings, params=p)
    at_harvest = profit_by_day(inputs, 'mugrow', date(2024, 11, 6), fc, p, settings=settings)
    on_arrival = profit_by_day(inputs, 'mugrow', date(2024, 11, 6), fc, p, settings=settings, transit_dd=12)
    # ripening in the truck can only add red, so the share of sellable pots never falls
    assert (on_arrival.sellable_share.values >= at_harvest.sellable_share.values - 1e-12).all()


def test_pluck_day_rules(inputs, settings):
    today = date(2024, 11, 6)
    room = 'agrifusion'
    p = fit_params(inputs, room, today, settings)
    fc = forecast(inputs, room, today, settings=settings, params=p)
    plans = {d['id']: ship_plan(inputs, room, today, settings, p, fc, d) for d in settings['logistics']['destinations']}
    for r in plans.values():
        if r['pluck_day'] is None:
            continue
        assert r['pluck_day'] >= today
        assert r['weight_complete_day'] is None or r['pluck_day'] >= r['weight_complete_day']
        assert r['sellable_share_on_arrival'] >= settings['economics']['earliest_sellable_share'] - 1e-9
        assert r['arrival_day'] == r['pluck_day'] + timedelta(days=r['transit_days'])
        assert r['pct_on_arrival'] >= r['pct_at_pluck']
    # a longer trip ripens pots on the road, so the pluck day is never later than for the local market
    days = [plans[k]['pluck_day'] for k in ('local', 'paris', 'munich', 'barcelona', 'madrid') if plans[k]['pluck_day']]
    assert all(a >= b for a, b in zip(days, days[1:]))
