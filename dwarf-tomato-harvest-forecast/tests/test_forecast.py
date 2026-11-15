"""Tests for harvest/forecast.py. Fixture rooms share k = 0.03, G50 = 750; room i gains 10 + i degree-days a day."""
import copy
from datetime import date

import numpy as np
import pandas as pd
import pytest

from harvest.forecast import (curve, date_reaching, fit_params, forecast, g50_from_sample, g_at, gdd_rate,
                              onset_dates, shared_models)


def test_curve_and_inverse_hand_values():
    assert curve(750, 0.03, 750) == pytest.approx(50.0)
    # ln(70/30) = 0.8473; / 0.03 = 28.24 -> 750 + 28.24 = 778.24
    assert g_at(70, 0.03, 750) == pytest.approx(778.24, abs=0.01)
    assert curve(778.2, 0.03, 750) == pytest.approx(70.0, abs=0.05)


def test_g50_from_sample_hand_value():
    # 778.2 - ln(70/30)/0.03 = 778.2 - 28.24 = 749.96
    assert g50_from_sample(778.2, 70.0, 0.03) == pytest.approx(749.96, abs=0.01)


def test_date_reaching_hand_value():
    # G 700, 10 a day, target 70 % at 778.24 -> 7.8 days -> rounds to 8 -> 9 Nov
    p = dict(k=0.03, g50=750.0, gdd_today=700.0, gdd_rate=10.0)
    assert date_reaching(p, 70, date(2024, 11, 1)) == date(2024, 11, 9)


def _images(values, start=date(2024, 10, 10), skip=None):
    days = [start + pd.Timedelta(days=i) for i in range(len(values))]
    rows = [dict(room='x', date=d, red_index=v) for d, v in zip(days, values) if d != skip]
    return pd.DataFrame(rows)


def test_onset_needs_three_days_and_is_only_known_on_the_third(settings):
    # red on 11 Oct only, then 14, 15, 16 Oct (> 0.1) -> onset 14 Oct, known from 16 Oct
    img = _images([0.05, 0.2, 0.05, 0.05, 0.2, 0.3, 0.4])
    assert onset_dates(img, date(2024, 10, 15), settings) == {}
    assert onset_dates(img, date(2024, 10, 16), settings) == {'x': date(2024, 10, 14)}


def test_onset_run_broken_by_missing_photo(settings):
    # 14 Oct photo missing: 12, 13 | 15, 16, 17 -> onset 15 Oct
    img = _images([0.05, 0.05, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2], skip=date(2024, 10, 14))
    assert onset_dates(img, date(2024, 10, 17), settings) == {'x': date(2024, 10, 15)}


def test_fixture_onset_hand_value(inputs, settings):
    # trigger gains 15/day; photo index > 0.1 means % red > 3, i.e. G > 750 + ln(3/97)/0.03 = 634.1
    # 15 (d + 1) > 634.1 -> d = 42 -> 3 Sep + 42 = 15 Oct; known on 17 Oct
    assert 'trigger' not in onset_dates(inputs.images, date(2024, 10, 16), settings)
    assert onset_dates(inputs.images, date(2024, 10, 17), settings)['trigger'] == date(2024, 10, 15)


def test_gdd_rate_fixture(inputs):
    # mugrow (i = 2) gains exactly 12 degree-days a day
    assert gdd_rate(inputs.daily, 'mugrow', date(2024, 11, 1), 7) == pytest.approx(12.0)


def test_fit_recovers_fixture_curve(inputs, settings):
    # Other rooms' samples up to 5 Nov lie exactly on k 0.03, G50 750 (rounded to 0.01 %)
    p = fit_params(inputs, 'mugrow', date(2024, 11, 5), settings)
    assert p['k'] == pytest.approx(0.03, abs=0.001)
    assert p['g50'] == pytest.approx(750, abs=3)
    assert p['model'] == 'warmth+camera+sample' and p['sample_used'] == date(2024, 11, 5)
    assert not p['prior_only']


def test_sample_without_camera_keeps_warmth_label(inputs, settings):
    # agrifusion (10/day) shows red in photos only from 5 Nov (known 7 Nov) but has a ripe 5 Nov sample
    p = fit_params(inputs, 'agrifusion', date(2024, 11, 5), settings)
    assert p['onset'] is None and p['model'] == 'warmth' and p['sample_used'] == date(2024, 11, 5)


def test_prior_only_before_any_ripe_sample(inputs, settings):
    # On 21 Oct only the 7 Oct samples exist (G 350-525 -> ~0 % red), so nothing to fit
    p = fit_params(inputs, 'mugrow', date(2024, 10, 21), settings)
    assert p['prior_only'] and p['model'] == 'warmth'
    assert (p['k'], p['g50'], p['g50_sd']) == (0.03, 750.0, 60.0)


def test_sample_weight_moves_g50(inputs, settings):
    # weight 0 ignores the sample; weight 1 puts the curve through it
    s0, s1 = copy.deepcopy(settings), copy.deepcopy(settings)
    s0['ripeness']['sample_weight'], s1['ripeness']['sample_weight'] = 0.0, 1.0
    inp = copy.copy(inputs)
    rip = inputs.ripeness.copy()
    m = (rip.room == 'mugrow') & (rip['date'] == date(2024, 11, 5))
    g = float(rip.loc[m, 'gdd_cum'].iloc[0])        # 12 * 64 = 768
    rip.loc[m, 'pct_red_weight'] = 50.0             # sample says G50 = 768
    inp.ripeness = rip
    p0 = fit_params(inp, 'mugrow', date(2024, 11, 5), s0)
    p1 = fit_params(inp, 'mugrow', date(2024, 11, 5), s1)
    assert p1['g50'] == pytest.approx(g, abs=1e-6)
    assert p0['g50'] != pytest.approx(g, abs=1)


def test_forecast_shape_band_and_delta_c(inputs, settings):
    fc = forecast(inputs, 'mugrow', date(2024, 11, 5), settings=settings)
    assert len(fc) == 22 and fc['date'].iloc[0] == date(2024, 11, 5)
    assert list(fc.columns) == ['date', 'gdd_cum', 'pct_red', 'pct_red_low', 'pct_red_high']
    assert (fc.pct_red_low <= fc.pct_red + 1e-9).all() and (fc.pct_red <= fc.pct_red_high + 1e-9).all()
    assert np.diff(fc.gdd_cum) == pytest.approx(12.0)
    warm = forecast(inputs, 'mugrow', date(2024, 11, 5), delta_c=2.0, settings=settings)
    assert np.diff(warm.gdd_cum) == pytest.approx(14.0)               # +2 C -> 2 more degree-days a day
    cold = forecast(inputs, 'mugrow', date(2024, 11, 5), delta_c=-20.0, settings=settings)
    assert np.diff(cold.gdd_cum) == pytest.approx(0.0)                # never below the base temperature


def _altered(inputs, room, after):
    """Copy of inputs with `room`'s crop samples and photos after `after` replaced by nonsense."""
    inp = copy.copy(inputs)
    rip, img = inputs.ripeness.copy(), inputs.images.copy()
    rip.loc[(rip.room == room) & (rip['date'] > after), 'pct_red_weight'] = 3.0
    img.loc[(img.room == room) & (img['date'] > after), 'red_index'] = 9.9
    inp.ripeness, inp.images = rip, img
    return inp


def test_no_leakage_from_own_future_measurements(inputs, settings):
    today = date(2024, 10, 25)
    before = forecast(inputs, 'tomatonuts', today, settings=settings)
    after = forecast(_altered(inputs, 'tomatonuts', today), 'tomatonuts', today, settings=settings)
    pd.testing.assert_frame_equal(before, after)


def test_no_leakage_from_other_rooms_future(inputs, settings):
    today = date(2024, 10, 25)
    before = forecast(inputs, 'tomatonuts', today, settings=settings)
    after = forecast(_altered(inputs, 'trigger', today), 'tomatonuts', today, settings=settings)
    pd.testing.assert_frame_equal(before, after)


def test_shared_curve_ignores_own_measurements(inputs, settings):
    # Even samples dated before today must not enter the shared curve for that room
    today = date(2024, 11, 5)
    a = shared_models(inputs, 'mugrow', today, settings)
    b = shared_models(_altered(inputs, 'mugrow', date(2024, 9, 1)), 'mugrow', today, settings)
    assert a == b
