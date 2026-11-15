"""Tests for harvest/backtest.py on the synthetic fixtures.

Fixture harvest days after planting (room i gains 10 + i a day; harvest = ceil(796.2 / rate) + 10):
agrifusion 90, ideas 83, mugrow 77, reference 72, tomatonuts 67, trigger 64.
"""
from datetime import date

import pytest

from harvest.backtest import BASE_DAYS, BASE_PCT, OURS, WARMTH, summarise, timing_test


@pytest.fixture(scope='module')
def result(inputs, settings):
    return timing_test(inputs, settings)


def _rows(per, test, method):
    return {r['room']: r for r in per if r['test'] == test and r['method'] == method}


def test_baseline_days_hand_values(result):
    _, per = result
    b = _rows(per, 'harvest_date', BASE_DAYS)
    # agrifusion: mean(83, 77, 72, 67, 64) = 72.6 -> 73 days -> 15 Nov; actual 2 Dec -> -17
    assert b['agrifusion']['predicted'] == '2024-11-15' and b['agrifusion']['error'] == -17
    # trigger: mean(90, 83, 77, 72, 67) = 77.8 -> 78 days -> 20 Nov; actual 6 Nov -> +14
    assert b['trigger']['predicted'] == '2024-11-20' and b['trigger']['error'] == 14
    # all six: -17, -9, -2, +4, +10, +14
    assert sorted(r['error'] for r in b.values()) == [-17, -9, -2, 4, 10, 14]


def test_summary_mae_hand_value(result):
    summary, _ = result
    row = summary[(summary.method == BASE_DAYS)].iloc[0]
    # (17 + 9 + 2 + 4 + 10 + 14) / 6 = 9.33
    assert row.value == pytest.approx(9.3) and row.unit == 'days' and row.n == 6
    assert set(summary.columns) == {'test', 'method', 'value', 'unit', 'n', 'note'}


def test_our_forecast_close_on_noise_free_fixture(result):
    _, per = result
    ours = _rows(per, 'harvest_date', OURS)
    # agrifusion: target 99.18 % at 750 + ln(99.18/0.82)/0.03 = 909.8 degree-days = day 91 -> 2 Dec exactly
    assert ours['agrifusion']['predicted'] == '2024-12-02'
    # flat top of the curve (targets near 99.5 %) costs up to 3 days; still far better than the baseline
    assert all(abs(r['error']) <= 3 for r in ours.values())


def test_baseline_pct_hand_value(result):
    _, per = result
    b = _rows(per, 'pct_red_at_harvest', BASE_PCT)
    # agrifusion: others' finals 99.46, 99.62, 99.75, 99.77, 99.88 -> mean 99.696 -> 99.7
    assert b['agrifusion']['predicted'] == pytest.approx(99.7)
    assert len(_rows(per, 'pct_red_at_harvest', WARMTH)) == 6


def test_summarise_hand_values():
    per = [dict(room=r, test='harvest_date', method=m, error=e)
           for r, m, e in [('a', 'X', -2), ('b', 'X', 1), ('c', 'X', 3), ('a', 'Y', 4), ('b', 'Y', 4), ('c', 'Y', -4)]]
    s = summarise(per).set_index('method')
    # X: (2 + 1 + 3) / 3 = 2.0, bias +0.67 late; Y: 4.0, worse by 2.0
    assert s.loc['X', 'value'] == 2.0 and s.loc['X', 'note'].startswith('Best on this test')
    assert s.loc['Y', 'value'] == 4.0 and s.loc['Y', 'note'].startswith('2.0 days worse than X')
