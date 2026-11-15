"""Tests for harvest/confidence.py on the synthetic fixtures (thresholds from tests/fixtures/crop.yaml)."""
import copy
from datetime import date

import pytest

from harvest.confidence import agreement, confidence, day_range_days, freshness, rate_low_is_good
from harvest.forecast import fit_params


def test_rate_low_is_good():
    assert [rate_low_is_good(v, 4, 8) for v in (4, 5, 8, 9)] == ['high', 'medium', 'medium', 'low']


def test_day_range_hand_value():
    # 2 * 1.96 * 20 / 10 = 7.84 -> 8 days
    assert day_range_days(20.0, 10.0) == 8


@pytest.mark.parametrize('est, expected', [
    ({'warmth': 40, 'camera': 48, 'sample': 45}, ('agree', 3.0)),      # D13: camera vs sample, gap 3 <= 10
    ({'warmth': 40, 'camera': 48, 'sample': 52}, ('agree', 4.0)),      # D13: camera vs sample only, gap 4
    ({'warmth': 20, 'camera': 48, 'sample': 60}, ('mixed', 12.0)),     # D13: warmth ignored; 10 < 12 <= 20
    ({'warmth': 40, 'sample': 55}, ('mixed', 15.0)),                   # no camera yet: warmth vs sample
    ({'warmth': 40, 'camera': 65}, ('conflict', 25.0)),                # 25 > 20
    ({'warmth': 40}, ('mixed', 0.0)),                                  # one source can't be cross-checked
])
def test_agreement(est, expected):
    assert agreement(est, 10, 20) == expected


def test_freshness_hand_value(inputs):
    # agrifusion on 8 Nov: last sample 5 Nov (3 days), photo every day (0) -> larger = 3
    assert freshness(inputs, 'agrifusion', date(2024, 11, 8)) == (3, 3, 0)


def test_high_when_everything_lines_up(inputs, settings):
    # Noise-free fixture: rooms' G50s differ only by photo-day rounding (sd ~4) -> 2*1.96*4.1/14 = 1.1 -> 1 day
    c = confidence(inputs, 'tomatonuts', date(2024, 11, 6), settings)
    assert c['level'] == 'high' and c['day_range_days'] == 1
    assert c['agreement'] == 'agree' and c['freshness_days'] == 1
    assert c['reasons'][-1] == 'Last crop sample 1 day ago, last photo today'


def test_medium_when_sample_is_getting_old(inputs, settings):
    # Same room/day, but "fresh" now means 0 days -> 1 day old is medium (and the reason comes first)
    s = copy.deepcopy(settings)
    s['confidence']['fresh_high_max'] = 0
    c = confidence(inputs, 'tomatonuts', date(2024, 11, 6), s)
    assert c['level'] == 'medium' and c['reasons'][0].startswith('Last crop sample 1 day ago')


def test_low_when_camera_conflicts(inputs, settings):
    # Camera anchor 100 degree-days early -> camera says ~100 % red vs the others' lower value
    p = fit_params(inputs, 'mugrow', date(2024, 11, 5), settings)
    p['g50_camera'] = p['g50_warmth'] - 100
    c = confidence(inputs, 'mugrow', date(2024, 11, 5), settings, params=p)
    assert c['level'] == 'low' and c['agreement'] == 'conflict'
    assert 'disagree by' in c['reasons'][0]   # D13 wording names the compared sources


def test_low_before_any_ripe_sample(inputs, settings):
    # 21 Oct: starting-guess curve, last sample 7 Oct (14 days), camera not started
    c = confidence(inputs, 'mugrow', date(2024, 10, 21), settings)
    assert c['level'] == 'low' and c['freshness_days'] == 14 and c['agreement'] == 'mixed'
    assert c['reasons'][0] == 'No room has a ripe crop sample yet, so the forecast is a starting guess'
    assert len(c['reasons']) == 3
