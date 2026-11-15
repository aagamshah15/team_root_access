"""Tests for harvest/alerts.py: each alert kind fires on a crafted case and stays quiet on a clean one."""
import json
from datetime import date, timedelta

import pandas as pd
import pytest

from harvest.alerts import (alerts, camera_schedule_alerts, drift_alerts, flatline_alerts, missing_day_alerts,
                            range_alerts, runs, sample_schedule_alerts, sensor_alerts, warmth_rates, DEFAULT_RANGES)

D = date(2024, 10, 1)
KINDS = {'behind_schedule', 'ahead_of_schedule', 'sensor_check', 'room_drift'}
FIELDS = ['room', 'date', 'kind', 'severity', 'title', 'message', 'numbers']


def day(i):
    return D + timedelta(days=i)


def clean_daily(n=10, room='r1'):
    """A healthy climate log: every reading moves a little each day and stays in range."""
    return pd.DataFrame([dict(room=room, date=day(i), T_mean=20 + 0.1 * i, RH_mean=80 + 0.2 * i,
                              CO2_mean=600 + i, DLI=10 + 0.1 * i, gdd_cum=10.0 * (i + 1)) for i in range(n)])


@pytest.fixture
def fc_for(forecast_fixture):
    """Fixture forecast (made 6 Nov) served for any room and 'today'."""
    return lambda room, today: forecast_fixture


def test_runs_groups_consecutive_days():
    flags = {day(0): True, day(1): True, day(2): True, day(3): False, day(4): True, day(6): True}
    # 0-2 is one stretch; 4 alone; 6 alone (day 5 missing breaks it)
    assert runs(flags) == [(day(0), day(2)), (day(4), day(4)), (day(6), day(6))]


# ---- behind / ahead from a crop sample ----

def _samples(pct):
    return pd.DataFrame([dict(room='fixture', date=date(2024, 11, 7), pct_red_weight=pct)])


def test_sample_ahead_behind_and_quiet(fc_for, settings):
    # fixture band on 7 Nov: low 21.991, mid 44.369, high 69.292; margin 15 points
    ahead = sample_schedule_alerts('fixture', _samples(90.0), fc_for, settings)   # 90 > 69.292 + 15 = 84.3
    assert [a['kind'] for a in ahead] == ['ahead_of_schedule']
    assert ahead[0]['numbers']['forecast_high'] == 69.3 and ahead[0]['date'] == '2024-11-07'
    behind = sample_schedule_alerts('fixture', _samples(5.0), fc_for, settings)   # 5 < 21.991 - 15 = 7.0
    assert [a['kind'] for a in behind] == ['behind_schedule']
    assert sample_schedule_alerts('fixture', _samples(44.0), fc_for, settings) == []
    assert sample_schedule_alerts('fixture', _samples(80.0), fc_for, settings) == []   # inside band + margin


# ---- behind from the camera ----

def _images(reds, lamps=None):
    lamps = lamps or [False] * len(reds)
    return pd.DataFrame([dict(room='fixture', date=date(2024, 11, 5) + timedelta(days=i), red_index=r,
                              lamps_on_noon=l) for i, (r, l) in enumerate(zip(reds, lamps))])


def test_camera_behind_fires_and_quiet(fc_for, settings):
    days = [date(2024, 11, 7)]
    # 3 usable photos (5-7 Nov) all below the 0.1 onset index, while the band forecast on 6 Nov puts
    # even the late case at 21.99% red on 7 Nov (> 15) -> behind
    a = camera_schedule_alerts('fixture', _images([0.0, 0.02, 0.05]), days, fc_for, settings)
    assert len(a) == 1 and a[0]['kind'] == 'behind_schedule' and a[0]['numbers']['max_red_index'] == 0.05
    # one usable photo shows red fruit -> quiet
    assert camera_schedule_alerts('fixture', _images([0.0, 0.5, 0.0]), days, fc_for, settings) == []
    # only 2 usable photos (one lamp-lit) -> not enough evidence -> quiet
    assert camera_schedule_alerts('fixture', _images([0.0, 0.0, 0.0], [False, True, False]), days,
                                  fc_for, settings) == []


def test_camera_quiet_when_forecast_expects_little_red(forecast_fixture, settings):
    # 6 Nov's low edge is 17.4; a forecast whose low edge is 10% (< 15) shouldn't flag a red-free camera
    fc = forecast_fixture.assign(pct_red_low=10.0)
    a = camera_schedule_alerts('fixture', _images([0.0, 0.0, 0.0]), [date(2024, 11, 7)], lambda r, t: fc, settings)
    assert a == []


# ---- sensor checks ----

def test_clean_log_has_no_sensor_alerts(settings):
    assert sensor_alerts('r1', clean_daily(), settings) == []


def test_missing_days(settings):
    d = clean_daily(6).drop(index=[2, 3])      # 3 and 4 Oct missing
    a = missing_day_alerts('r1', d)
    assert len(a) == 1 and a[0]['date'] == '2024-10-03' and a[0]['numbers'] == {'missing_days': 2,
                                                                                'until': '2024-10-04'}


def test_flatline(settings):
    d = clean_daily()
    d.loc[3:5, 'CO2_mean'] = 600.0            # 4, 5, 6 Oct identical: 3 days = flatline_days -> fires
    a = flatline_alerts('r1', d, settings, DEFAULT_RANGES)
    assert len(a) == 1 and a[0]['date'] == '2024-10-04' and a[0]['numbers']['days'] == 3
    d2 = clean_daily()
    d2.loc[3:4, 'CO2_mean'] = 600.0           # only 2 identical days -> quiet
    assert flatline_alerts('r1', d2, settings, DEFAULT_RANGES) == []


def test_out_of_range():
    d = clean_daily()
    d.loc[4, 'T_mean'] = 45.0                 # above the 40 C plausible max
    a = range_alerts('r1', d, DEFAULT_RANGES)
    assert len(a) == 1 and a[0]['date'] == '2024-10-05' and a[0]['numbers']['value'] == 45.0


# ---- room drift ----

def _drift_daily(slow_rate):
    rooms = {'a': 10.0, 'b': 10.0, 'c': 10.0, 'd': slow_rate}
    return pd.concat([clean_daily(10, room=r).assign(gdd_cum=[rate * (i + 1) for i in range(10)])
                      for r, rate in rooms.items()])


def test_warmth_rate():
    # room d gains 8/day: rate on day 7 = (gdd(7) - gdd(0)) / 7 = (64 - 8) / 7 = 8.0; first 7 days blank
    rate = warmth_rates(_drift_daily(8.0))
    assert rate.loc[day(7), 'd'] == pytest.approx(8.0) and pd.isna(rate.loc[day(6), 'd'])


def test_drift_fires_and_quiet(settings):
    # 8 vs others' median 10 -> 20% below > 15% -> one alert covering 8..10 Oct
    a = drift_alerts(_drift_daily(8.0), settings)
    assert len(a) == 1 and a[0]['room'] == 'd' and a[0]['date'] == '2024-10-08'
    assert a[0]['numbers']['pct_below'] == 20.0 and a[0]['numbers']['until'] == '2024-10-10'
    assert drift_alerts(_drift_daily(9.0), settings) == []     # 10% below -> quiet


# ---- end to end on the six-room fixture ----

def test_alerts_contract_shape(inputs, settings, fc_for):
    rows = alerts(inputs, settings, forecast_for=fc_for)
    assert rows, 'fixture rooms have constant readings, so flatline alerts should fire'
    for r in rows:
        assert list(r) == FIELDS and r['kind'] in KINDS and r['severity'] in {'info', 'warning'}
        assert r['title'] and r['message'].endswith('.') and isinstance(r['numbers'], dict)
    json.dumps(rows, allow_nan=False)
