"""Truck and shop: how far, how long, and how ripe the pots are when they arrive (shipping extension).

Pots keep ripening after they are picked; they no longer gain weight (see growth.py). Ripening speed
follows the same warmth clock as in the greenhouse: degree-days per day = temperature - base
temperature. A refrigerated truck at 13 °C gives 3 dd/day, a 20 °C shop 10 dd/day (base 10 °C).
Ripeness on the room's S-curve moves by k x degree-days on the log-odds scale.
All settings live under `logistics:` in config/crop.yaml.
"""
from __future__ import annotations

import math


def transit_days(distance_km: float, logistics: dict) -> int:
    """Whole days on the road: 0 within `same_day_km`, else distance / (speed x driving hours), rounded up.

    Hand check (70 km/h x 8 h = 560 km/day): 30 km -> 0; 500 -> 1; 850 -> 2; 1500 -> ceil(2.68) = 3.
    """
    if distance_km <= logistics['same_day_km']:
        return 0
    per_day = logistics['avg_speed_kmh'] * logistics['driving_hours_per_day']
    return math.ceil(distance_km / per_day)


def ripening_per_day(temp_c: float, base_c: float) -> float:
    """Degree-days of ripening per day at a steady temperature. Hand check: 13 °C, base 10 -> 3."""
    return max(temp_c - base_c, 0.0)


def _logit(pct: float) -> float:
    p = min(max(pct, 0.01), 99.99) / 100
    return math.log(p / (1 - p))


def _pct(x: float) -> float:
    return 100 / (1 + math.exp(-x))


def ripen(pct: float, k: float, degree_days: float) -> float:
    """% red after `degree_days` more warmth on a curve of steepness k.

    Hand check: 60 % red, k 0.026, 9 dd (3 days at 13 °C) -> logit 0.405 + 0.234 = 0.639 -> 65.5 %.
    """
    return _pct(_logit(pct) + k * degree_days)


def shelf(pct_on_arrival: float, k: float, shop_dd: float, logistics: dict) -> dict:
    """Days after arrival when the pots are at their best and when they should be off the shelf.

    best_from / best_until: first and last day (0 = arrival day) inside the best-condition band of % red.
    sell_until: last day before the end-of-life % red. best_days: number of days in the band.
    Hand check: arrival 66 %, k 0.026, 10 dd/day, band 70-90, end 94:
      to 70 %: (0.847 - 0.663) / 0.26 = 0.71 -> day 1; to 90 %: (2.197 - 0.663) / 0.26 = 5.9 -> day 5;
      to 94 %: (2.752 - 0.663) / 0.26 = 8.03 -> day 8; best_days = 5.
    """
    lo, hi = logistics['best_band_pct_red']
    end = logistics['end_of_life_pct_red']
    step = k * shop_dd
    if step <= 0:
        return dict(best_from=0, best_until=None, sell_until=None, best_days=None)
    days_to = lambda target: (_logit(target) - _logit(pct_on_arrival)) / step
    best_from = max(0, math.ceil(days_to(lo) - 1e-9))
    best_until = math.floor(days_to(hi))
    sell_until = math.floor(days_to(end))
    return dict(best_from=best_from, best_until=best_until, sell_until=sell_until,
                best_days=max(0, best_until - best_from + 1))
