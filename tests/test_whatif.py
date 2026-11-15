"""Tests for harvest/whatif.py: heating cost per °C and the temperature what-if (SPEC §6)."""
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from harvest.common import known_by
from harvest.whatif import extra_energy_cost, heating_cost_per_degree, whatif

TODAY = date(2024, 11, 6)
ROOM = 'tomatonuts'


def stub_forecast(inputs, room, today, delta_c=0.0, horizon=21):
    """Stand-in for L01: the fixture curve (k=0.03, G50=750), future warmth = last-7-day rate + delta_c,
    band from G50 -/+ 40. Lets L02 test without L01."""
    d = known_by(inputs.daily[inputs.daily.room == room], today).sort_values('date')
    rate = max(d.gdd_cum.diff().tail(7).mean() + delta_c, 0.0)
    g = d.gdd_cum.iloc[-1] + rate * np.arange(horizon + 1)
    f = lambda g50: 100 / (1 + np.exp(-0.03 * (g - g50)))
    return pd.DataFrame(dict(date=[today + timedelta(days=int(h)) for h in range(horizon + 1)], gdd_cum=g,
                             pct_red=f(750), pct_red_low=f(790), pct_red_high=f(710)))


def stub_params(inputs, room, today):
    return dict(k=0.03, g50=750.0, g50_sd=20.0, model='warmth', gdd_rate=14.0, sample_used=False)


def test_heating_cost_per_degree_hand_worked(inputs):
    # fixture: cost = 0.20 + 0.01 i, heating MJ = 0.5 + 0.1 i -> cost = 0.15 + 0.10 * MJ, so heat costs €0.10/MJ.
    # heating cost = 0.05 + 0.01 i ; inside - outside = (20 + i) - 10 = 10 + i -> slope €0.01 per m² per day per °C, r² = 1
    h = heating_cost_per_degree(inputs)
    assert h['eur_per_mj'] == pytest.approx(0.10, abs=1e-9)
    assert h['eur_m2_day_per_c'] == pytest.approx(0.01, abs=1e-9)
    assert h['r2'] == pytest.approx(1.0)
    assert h['n'] == len(inputs.daily)
    assert 'weak' not in h['note']


def test_heating_fit_only_uses_data_known_by_today(inputs):
    h = heating_cost_per_degree(inputs, today=date(2024, 9, 10))
    assert h['n'] == 6 * 8   # 3..10 Sep = 8 days x 6 rooms


def test_weak_fit_is_said_in_the_note(inputs):
    noisy = inputs.daily.copy()
    rng = np.random.default_rng(0)
    noisy['heating_MJ'] = rng.uniform(0.1, 2.0, len(noisy))
    noisy['cost_eur_m2'] = 0.1 + 0.05 * noisy.heating_MJ
    from dataclasses import replace
    h = heating_cost_per_degree(replace(inputs, daily=noisy))
    assert h['r2'] < 0.3 and 'weak' in h['note']


def test_extra_energy_cost_sign_and_floor(inputs, settings):
    heat = dict(eur_m2_day_per_c=0.01, eur_per_mj=0.10, r2=1.0, n=1)
    assert extra_energy_cost(inputs, ROOM, TODAY, 1.0, heat, settings) == pytest.approx(0.01)
    assert extra_energy_cost(inputs, ROOM, TODAY, -1.0, heat, settings) == pytest.approx(-0.01)
    # tomatonuts heats 0.9 MJ/day * €0.10 = €0.09 a day, so cooling can never save more than that
    big = dict(heat, eur_m2_day_per_c=1.0)
    assert extra_energy_cost(inputs, ROOM, TODAY, -2.0, big, settings) == pytest.approx(-0.09)


def _wi(inputs, settings, delta):
    return whatif(inputs, ROOM, TODAY, delta, forecast_fn=stub_forecast, params_fn=stub_params, settings=settings)


def test_whatif_zero_is_no_change(inputs, settings):
    w = _wi(inputs, settings, 0.0)
    assert w['days_change'] == 0 and w['profit_change_m2_day'] == 0 and w['extra_energy_cost_m2_day'] == 0
    assert 'not tested in the greenhouse' in w['note']
    assert set(w) == {'delta_c', 'best_day', 'days_change', 'profit_best_m2_day', 'profit_change_m2_day',
                      'extra_energy_cost_m2_day', 'note'}


def test_whatif_warmer_never_slower_and_costs_more(inputs, settings):
    rows = {d: _wi(inputs, settings, d) for d in [-2, -1, -0.5, 0, 0.5, 1, 2]}
    for d in [0.5, 1, 2]:
        assert rows[d]['days_change'] <= 0
        assert rows[d]['extra_energy_cost_m2_day'] >= 0
    for d in [-2, -1, -0.5]:
        assert rows[d]['days_change'] >= 0
    # warmer -> best day no later, in order
    days = [rows[d]['best_day'] for d in sorted(rows)]
    assert days == sorted(days, reverse=True)
    # +1 °C costs 0.01 €/m²/day in the fixture (slope 0.01)
    assert rows[1]['extra_energy_cost_m2_day'] == pytest.approx(0.01)
