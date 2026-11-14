"""Wave 2 (L09): planting date per room (D17), optimal zone and look day (D16)."""
import json
from datetime import date, timedelta

import pytest

import harvest.common as common
from harvest.common import planted, room_config, today_range

TODAY = date(2024, 11, 6)


# ---------------------------------------------------------------- D17: planting date per room

def test_every_demo_room_planted_3_sep_2024():
    # config/customers.yaml lists all six rooms with 2024-09-03 (Maree et al. 2025 §2.1)
    cfg = room_config()
    assert sorted(cfg) == common.ROOMS
    assert {planted(r) for r in common.ROOMS} == {date(2024, 9, 3)}


def test_unknown_room_falls_back_to_default():
    assert planted('not-a-room') == date(2024, 9, 3)


def _yaml(tmp_path, when):
    p = tmp_path / 'customers.yaml'
    p.write_text('customers:\n  - customer_id: c9\n    rooms:\n'
                 f'      - room: tomatonuts\n        area_m2: 96.0\n        planted: {when}\n')
    return p


def test_planted_read_from_config(tmp_path):
    assert planted('tomatonuts', _yaml(tmp_path, '2024-10-25')) == date(2024, 10, 25)


def test_later_planting_moves_days_grown(inputs, settings, forecast_fixture, tmp_path, monkeypatch):
    """Planted 10 days later -> every forecast day has 10 fewer days grown, so profit per day differs.

    Hand check: 6 Nov is day (6 Nov - 3 Sep) + 1 = 65 when planted 3 Sep; planted 13 Sep -> day 55.
    """
    import harvest.economics as econ
    base = econ.profit_by_day(inputs, 'tomatonuts', TODAY, forecast_fixture, {}, settings=settings)
    assert base.days_grown.iloc[0] == 65
    p = _yaml(tmp_path, '2024-09-13')
    monkeypatch.setattr(econ, 'room_planted', lambda room: planted(room, p))
    late = econ.profit_by_day(inputs, 'tomatonuts', TODAY, forecast_fixture, {}, settings=settings)
    assert late.days_grown.iloc[0] == 55
    # same euros per m², fewer days: (profit per day) x days is unchanged
    assert (late.profit_m2_day * late.days_grown).tolist() == pytest.approx(
        (base.profit_m2_day * base.days_grown).tolist())


def test_today_range_starts_no_earlier_than_planting(inputs, monkeypatch):
    # planted 1 Nov (after FIRST_TODAY 20 Oct) -> first "today" is 1 Nov
    monkeypatch.setattr(common, 'planted', lambda room: date(2024, 11, 1))
    days = today_range(inputs, 'tomatonuts')
    assert days[0] == date(2024, 11, 1)
    assert days[-1] == common.actual_harvest(inputs, 'tomatonuts') - timedelta(days=1)


# ---------------------------------------------------------------- D16: optimal zone and look day

def _curve(profits, start=TODAY):
    import pandas as pd
    return pd.DataFrame(dict(date=[start + timedelta(days=i) for i in range(len(profits))],
                             profit_m2_day=profits))


def test_optimal_zone_hand_worked():
    from harvest.economics import optimal_zone
    # best 0.10 on day 3, share 0.9 -> threshold 0.09: days 2 (0.095), 3, 4 (0.092) qualify; 1 (0.05), 5 (0.08) don't
    c = _curve([0.02, 0.05, 0.095, 0.10, 0.092, 0.08])
    z = optimal_zone(c, TODAY + timedelta(days=3), 0.9)
    assert (z['optimal_from'], z['optimal_to']) == (TODAY + timedelta(days=2), TODAY + timedelta(days=4))


def test_optimal_zone_is_contiguous_around_best():
    from harvest.economics import optimal_zone
    # day 0 (0.099) is within 10 % of the best but day 1 (0.05) breaks the run, so the zone starts on day 2
    c = _curve([0.099, 0.05, 0.095, 0.10, 0.06])
    z = optimal_zone(c, TODAY + timedelta(days=3), 0.9)
    assert (z['optimal_from'], z['optimal_to']) == (TODAY + timedelta(days=2), TODAY + timedelta(days=3))


def test_optimal_zone_loss_making_room():
    from harvest.economics import optimal_zone
    # best -0.10 -> threshold -0.10 - 0.1 x 0.10 = -0.11: day 1 (-0.105) in, day 0 (-0.12) and day 3 (-0.115) out
    c = _curve([-0.12, -0.105, -0.10, -0.115])
    z = optimal_zone(c, TODAY + timedelta(days=2), 0.9)
    assert (z['optimal_from'], z['optimal_to']) == (TODAY + timedelta(days=1), TODAY + timedelta(days=2))


def test_look_day_hand_worked():
    import pandas as pd
    from harvest.economics import look_day
    fc = pd.DataFrame(dict(date=[TODAY + timedelta(days=i) for i in range(5)], pct_red=[55, 63, 69.9, 70.0, 76]))
    assert look_day(fc, 70) == TODAY + timedelta(days=3)      # first day at or above 70 %
    assert look_day(fc, 50) == TODAY                           # already past the band edge -> today
    assert look_day(fc, 80) is None                            # not reached within the forecast


def test_published_cards_have_d16_fields():
    """On the real build every card has the zone around its best day and a look day consistent with its forecast."""
    import json
    days = json.loads((common.REPO / 'app' / 'data' / 'days.json').read_text())['rows']
    if 'optimal_from' not in days[0]:
        pytest.skip('app/data not rebuilt with D16 fields yet')
    for r in days:
        assert r['optimal_from'] <= r['best_day'] <= r['optimal_to']
        assert r['look_day'] is None or r['look_day'] >= r['today']


# ---------------------------------------------------------------- D19: leave-one-room-out steepness and spread

def _rip(rows):
    import pandas as pd
    return pd.DataFrame([dict(room=r, date=d, sample=s, plants=n, pct_red_weight=m, pct_red_weight_sd=sd)
                         for r, d, s, n, m, sd in rows])


def test_plant_spread_pooled_on_other_rooms_only():
    from types import SimpleNamespace
    from harvest.economics import plant_spread
    st = {'ripeness': dict(plant_spread_sd=12.5, spread_mid_pct=[5, 95], spread_min_rooms=3)}
    d5 = date(2024, 11, 5)
    rip = _rip([('own', d5, 'destructive', 6, 40.0, 30.0),           # the room itself: left out
                ('a', d5, 'destructive', 6, 30.0, 6.0), ('b', d5, 'destructive', 6, 50.0, 8.0),
                ('c', d5, 'destructive', 11, 20.0, 10.0),
                ('d', d5, 'destructive', 6, 2.0, 40.0),               # not mid-ripening (2 % red): left out
                ('e', d5, 'final', 50, 60.0, 40.0),                   # harvest-day count: left out
                ('f', date(2024, 11, 7), 'destructive', 6, 50.0, 40.0)])   # after today: left out
    inp = SimpleNamespace(ripeness=rip)
    got = plant_spread(inp, 'own', date(2024, 11, 6), st)
    # pooled: (5 x 36 + 5 x 64 + 10 x 100) / (5 + 5 + 10) = (180 + 320 + 1000) / 20 = 75 -> sqrt 8.660
    assert got['fitted'] and got['rooms'] == 3 and got['sd'] == pytest.approx(8.660, abs=1e-3)
    # only two usable other rooms before 5 Nov data is in -> fall back to the setting
    few = plant_spread(SimpleNamespace(ripeness=rip[rip.room.isin(['own', 'a', 'b'])]), 'own', date(2024, 11, 6), st)
    assert not few['fitted'] and few['sd'] == 12.5


def test_plant_spread_real_ideas_6_nov():
    """Real data: ideas on 6 Nov uses the other five rooms' 5 Nov sds 7.80, 11.55, 12.97, 9.34, 10.83 ->
    mean variance (60.84 + 133.40 + 168.22 + 87.24 + 117.29) / 5 = 113.40 -> 10.65 points."""
    days = json.loads((common.REPO / 'app' / 'data' / 'days.json').read_text())['rows']
    r = [x for x in days if x['room'] == 'ideas' and x['today'] == '2024-11-06']
    if not r or 'pot_spread_sd' not in r[0]:
        pytest.skip('app/data not rebuilt with D19 yet')
    assert r[0]['pot_spread_sd'] == pytest.approx(10.65, abs=0.01)


GROWTH_FREE = {'growth': dict(complete_share=0.98, prior_steepness=0.0148, prior_half_gdd=474.0, min_rooms=3,
                              fit_steepness=True, steepness_bounds=[0.003, 0.1])}


def _weighings(a, g_half, rooms=('a', 'b', 'c', 'd'), g=(350, 500, 650, 900)):
    import pandas as pd
    from harvest.growth import weight_curve
    return pd.DataFrame([dict(room=r, gdd_cum=float(x), fw_total=float(weight_curve(x, 280 + 20 * i, a, g_half)))
                         for i, r in enumerate(rooms) for x in g])


def test_free_steepness_is_recovered():
    from harvest.growth import complete_gdd, fit_growth
    # weighings made with a 0.012 and g_half 500 -> both recovered; finished growing at
    # 500 + ln(49) / 0.012 = 500 + 324.3 = 824.3 dd (against 737 dd with the old fixed 0.0148)
    fit = fit_growth(_weighings(0.012, 500), GROWTH_FREE)
    assert fit['steepness_fitted'] and fit['a'] == pytest.approx(0.012, rel=1e-3)
    assert fit['g_half'] == pytest.approx(500, abs=0.5)
    assert complete_gdd(fit['a'], fit['g_half'], 0.98) == pytest.approx(824.3, abs=1)


def test_free_steepness_on_bound_falls_back_to_setting():
    from harvest.growth import fit_growth
    # flat weighings (no growth at all) push the steepness to a bound -> not trusted, setting used
    import pandas as pd
    flat = pd.DataFrame([dict(room=r, gdd_cum=float(x), fw_total=300.0) for r in 'abcd' for x in (350, 500, 650, 900)])
    fit = fit_growth(flat, GROWTH_FREE)
    assert not fit['steepness_fitted'] and fit['a'] == 0.0148
