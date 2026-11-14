"""Wave 2 (L09): planting date per room (D17), optimal zone and look day (D16)."""
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
