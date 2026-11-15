"""Tests for harvest/common.py on the synthetic fixtures."""
from datetime import date

from harvest.common import FIRST_TODAY, ROOMS, actual_harvest, known_by, today_range


def test_all_rooms_load(inputs):
    assert sorted(inputs.daily.room.unique()) == ROOMS
    assert inputs.daily.density.notna().all()          # forward-filled between re-spacings


def test_actual_harvest_and_today_range(inputs):
    # agrifusion gains 10 degree-days a day; 80% red at 750 + ln(4)/0.03 = 796.2 -> day 80 (ceil 79.6),
    # final = 3 Sep + 80 + 10 days = 2 Dec 2024
    assert actual_harvest(inputs, 'agrifusion') == date(2024, 12, 2)
    days = today_range(inputs, 'agrifusion')
    assert days[0] == FIRST_TODAY and days[-1] == date(2024, 12, 1)


def test_known_by_excludes_future(inputs):
    k = known_by(inputs.ripeness, date(2024, 10, 22))
    assert k['date'].max() == date(2024, 10, 22)
