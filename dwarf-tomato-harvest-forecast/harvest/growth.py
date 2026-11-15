"""When the fruit stops gaining weight: the "weight complete" day (shipping extension).

Fruit weight per plant follows an S-curve in warmth since planting (degree-days, G):
    weight(G) = W_max / (1 + exp(-a (G - G_half)))
`a` and `G_half` are shared by all rooms; W_max (final fruit weight) differs per room. After the
"weight complete" warmth (the share `growth.complete_share` of W_max, 98% by default) the fruit no
longer gets heavier: picking from then on costs no weight and the fruit only turns red.

Honest testing (SPEC D6, D19 "five rooms, full season"):
- Steepness `a` stands in for "the grower's previous crop": for each room it is fitted on the *other five*
  rooms' complete-season weighings. The held-out room never contributes. Caveat: those weighings include
  dates after "today", as in the timing test; in production they would be last season's crop.
- Timing (`G_half`) is refitted every day on the other rooms' weighings dated on or before today, with that
  steepness held. Before enough weighings exist the starting guess `growth.prior_half_gdd` is used.
`growth.prior_steepness` is only a fallback, used if the previous-crop fit fails.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
from scipy.optimize import least_squares

from harvest.common import Inputs, known_by


def weight_curve(g, w_max: float, a: float, g_half: float):
    """Fruit weight (g per plant) at warmth g. Hand check: w_max 300, a 0.02, g_half 500, g 500 -> 150."""
    return w_max / (1 + np.exp(-a * (np.asarray(g, dtype=float) - g_half)))


def complete_gdd(a: float, g_half: float, share: float) -> float:
    """Warmth at which fruit reaches `share` of its final weight.

    Hand check: a 0.0148, g_half 474, share 0.98 -> 474 + ln(49)/0.0148 = 474 + 263.0 = 737.0.
    """
    return g_half + math.log(share / (1 - share)) / a


def _ready(samples, g_half_guess: float):
    """Weighings usable for a curve fit: rooms with 3+ weighings whose latest is past the half-weight guess."""
    s = samples.dropna(subset=['fw_total', 'gdd_cum'])
    s = s[s.groupby('room').gdd_cum.transform('count') >= 3]
    return s[s.groupby('room').gdd_cum.transform('max') > g_half_guess]


def _design(s, g_half_guess: float):
    rooms = sorted(s.room.unique())
    idx = s.room.map({r: i for i, r in enumerate(rooms)}).to_numpy()
    p0 = [g_half_guess] + [float(s[s.room == r].fw_total.max()) for r in rooms]
    lo, hi = [200.0] + [10.0] * len(rooms), [1200.0] + [5000.0] * len(rooms)
    return rooms, idx, s.gdd_cum.to_numpy(float), s.fw_total.to_numpy(float), p0, lo, hi


def fit_steepness(samples, settings: dict) -> dict:
    """Previous-crop steepness (D19): fit steepness, half-weight warmth and each room's final weight together.

    Called with the other five rooms' complete-season weighings, standing in for the grower's previous crop.
    The steepness must land inside `growth.steepness_bounds`; a fit that ends on a bound, or fewer than
    `growth.min_rooms` usable rooms, falls back to `growth.prior_steepness`. Returns {a, fitted, rooms}.
    Hand check: weighings generated with a 0.012 and g_half 500 give a = 0.012 (tests/test_wave2_fields.py).
    """
    gs = settings['growth']
    prior = dict(a=float(gs['prior_steepness']), fitted=False, rooms=0)
    s = _ready(samples, float(gs['prior_half_gdd']))
    if s.room.nunique() < int(gs['min_rooms']):
        return prior
    rooms, idx, g, w, p0, lo, hi = _design(s, float(gs['prior_half_gdd']))
    a_lo, a_hi = (float(x) for x in gs['steepness_bounds'])

    def resid(p):
        return (weight_curve(g, np.asarray(p[2:])[idx], p[0], p[1]) - w) / np.sqrt(np.maximum(w, 30.0))

    p = least_squares(resid, [prior['a']] + p0, bounds=([a_lo] + lo, [a_hi] + hi)).x
    if min(p[0] - a_lo, a_hi - p[0]) < 1e-3 * (a_hi - a_lo):
        return prior
    return dict(a=float(p[0]), fitted=True, rooms=len(rooms))


_STEEPNESS: dict = {}


def previous_crop_steepness(inputs: Inputs, room: str, settings: dict) -> dict:
    """Steepness for `room` from the other five rooms' complete-season weighings (D19), or the setting.

    With `growth.steepness_from` other than 'other_rooms_full_season' the setting is used. Cached per
    inputs object and room, since it does not depend on "today".
    """
    gs = settings['growth']
    if gs.get('steepness_from') != 'other_rooms_full_season':
        return dict(a=float(gs['prior_steepness']), fitted=False, rooms=0)
    key = (id(inputs), room, float(gs['prior_steepness']), tuple(gs['steepness_bounds']))
    if key not in _STEEPNESS:
        _STEEPNESS[key] = fit_steepness(inputs.ripeness[inputs.ripeness.room != room], settings)
    return _STEEPNESS[key]


def fit_growth(samples, settings: dict, a: float | None = None) -> dict:
    """Half-weight warmth from crop weighings (room, gdd_cum, fw_total), with the steepness held at `a`.

    `a` defaults to `growth.prior_steepness`; publish passes the previous-crop steepness (D19). Three
    weighings per room cannot show where the curve flattens, so the steepness is not refitted here.
    Fits only when at least `growth.min_rooms` rooms each have 3+ weighings, the latest past the starting
    half-weight point. Returns {a, g_half, fitted (bool), rooms (n)}.
    """
    gs = settings['growth']
    a = float(gs['prior_steepness']) if a is None else float(a)
    prior = dict(a=a, g_half=float(gs['prior_half_gdd']), fitted=False, rooms=0)
    s = _ready(samples, prior['g_half'])
    if s.room.nunique() < int(gs['min_rooms']):
        return prior
    rooms, idx, g, w, p0, lo, hi = _design(s, prior['g_half'])

    def resid(p):
        return (weight_curve(g, np.asarray(p[1:])[idx], a, p[0]) - w) / np.sqrt(np.maximum(w, 30.0))

    p = least_squares(resid, p0, bounds=(lo, hi)).x
    return dict(a=a, g_half=float(p[0]), fitted=True, rooms=len(rooms))


def weight_complete_day(inputs: Inputs, room: str, today: date, gdd_today: float, gdd_rate: float,
                        settings: dict) -> dict:
    """The first day the room's fruit is at `complete_share` of its final weight, as known by today.

    Steepness: the previous-crop stand-in (other five rooms, full season, D19). Timing: the other rooms'
    weighings up to today (D6). Past days come from the room's warmth log; future
    days from today's warmth rate. Returns {day, gdd, fitted, steepness_fitted, a}; day is None if warmth
    has stopped.
    Hand check: complete at 737 dd, today 700 dd at 10 dd/day -> ceil(3.7) = 4 days after today.
    """
    rip = known_by(inputs.ripeness, today)
    steep = previous_crop_steepness(inputs, room, settings)
    fit = fit_growth(rip[rip.room != room], settings, a=steep['a'])
    target = complete_gdd(fit['a'], fit['g_half'], float(settings['growth']['complete_share']))
    if gdd_today >= target:
        log = known_by(inputs.daily[inputs.daily.room == room], today).sort_values('date')
        day = log[log.gdd_cum >= target]['date'].iloc[0]
    elif gdd_rate > 0:
        day = today + timedelta(days=math.ceil((target - gdd_today) / gdd_rate))
    else:
        day = None
    return dict(day=day, gdd=target, fitted=fit['fitted'], steepness_fitted=steep['fitted'], a=fit['a'])
