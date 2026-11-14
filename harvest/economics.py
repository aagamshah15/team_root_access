"""Profit by harvest day and the harvest window (SPEC §5). Lane L02.

Ported from `main`'s `forecast.py::profit_tables`, with every number taken from `config/crop.yaml`.

The rules (challenge scoring, Maree et al. 2025):
- a pot sells only if at least a third of its fruit weight is red;
- revenue per pot follows the paper's gains curve in red grams (€0 below 50 g, capped at 150 g), with the
  low-dry-matter curve as the main case and the high-dry-matter curve as the high price scenario (D10);
- costs are plants (per pot), re-spacings (€ per m² per year per step, a daily fixed cost) and the
  room's own daily energy + fixed costs;
- rooms are ranked on net profit per m² per day grown.

Rules verified against Maree et al. 2025 by L05 (decision D10).

Pots in a room ripen at different times, so on any day some pots are sellable and some are not. We
spread each pot's ripeness around the room's forecast % red (see `plant_pct`).
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from scipy.stats import norm

from harvest.common import Inputs, known_by, load_settings, planted as room_planted
from harvest.logistics import ripen

# 40 pots placed at evenly spaced normal quantiles: a smooth, repeatable stand-in for "a room of pots".
# This is a numerical grid, not a crop setting, so it stays in code.
Z = norm.ppf(np.linspace(0.0125, 0.9875, 40))

# Scenario columns of the forecast: ripening early = high % red band, late = low band.
SCENARIOS = {'mid': 'pct_red', 'early': 'pct_red_high', 'late': 'pct_red_low'}
# Price scenarios: settings key of each gains curve. 'mid' is the main case (dry matter <= 7 %).
CURVES = {'mid': 'gains_curve_low', 'high': 'gains_curve_high'}
DAYS_PER_YEAR = 365


# ---------------------------------------------------------------- small pure pieces (unit-tested)

def plant_pct(pct_red: float, spread_sd: float, z: np.ndarray = Z) -> np.ndarray:
    """% red of each pot when the room as a whole is `pct_red` % red.

    `main` gives every pot its own ripening midpoint, spread so pots differ by `spread_sd` points
    mid-ripening; the S-curve squeezes that spread near 0 % and 100 %. On the log-odds scale that is a
    fixed shift of 4 * spread_sd / 100 per standard deviation, whatever the curve's steepness, so we
    can do it from % red alone. Example: room 50 % red, spread 12.5 → log-odds sd 0.5 → a pot one sd
    ahead is 100 / (1 + e^-0.5) = 62.2 % red.
    """
    p = np.clip(float(pct_red), 1e-9, 100 - 1e-9) / 100
    x = np.log(p / (1 - p)) + (4 * spread_sd / 100) * np.asarray(z)
    return 100 / (1 + np.exp(-x))


def gains(red_g: np.ndarray, curve: list) -> np.ndarray:
    """Euros per pot for its red fruit grams: linear between the gains-curve points [red_g, eur].

    Flat beyond the last point, so the 150 g cap is in the curve itself. Example with
    [[0,0],[50,0],[80,1.60],[150,1.80]]: 115 g -> 1.60 + (115-80)/(150-80) * 0.20 = 1.70.
    """
    pts = np.asarray(curve, dtype=float)
    return np.interp(np.asarray(red_g, dtype=float), pts[:, 0], pts[:, 1])


def pot_revenue(pct_pots: np.ndarray, fw_g: float, curve: list, econ: dict) -> np.ndarray:
    """Euros per pot from the gains curve on red grams (capped), and nothing for pots under the sellable share."""
    pct_pots = np.asarray(pct_pots, dtype=float)
    sold = pct_pots >= 100 * econ['sellable_red_share']
    red_g = np.minimum(pct_pots / 100 * fw_g, econ['red_cap_g'])
    return gains(red_g, curve) * sold


def profit_m2_day(revenue_per_pot: float, density: float, running_cost_m2: float, days_grown: int,
                  plant_cost: float) -> float:
    """Net profit per m² per day grown = (pots/m² × (revenue per pot − plant cost) − other costs/m²) / days."""
    return (density * (revenue_per_pot - plant_cost) - running_cost_m2) / days_grown


# ---------------------------------------------------------------- inputs a room's curve needs

def plant_spread(inputs: Inputs, room: str, today: date, settings: dict) -> dict:
    """Plant-to-plant spread in % red (points), standing in for "the grower's previous crop" (D19).

    Fitted on the *other five* rooms' complete-season crop weighings; the held-out room never contributes.
    Caveat: this uses weighings dated after "today", as in the timing test; in production it would be last
    season's crop. `today` is kept for the signature but not used.
    Spread = pooled sd of % red across plants, over the regular crop samples (not the harvest-day count)
    taken while a room was mid-ripening (mean % red inside `ripeness.spread_mid_pct`), pooled as
    sqrt(sum((n - 1) sd^2) / sum(n - 1)). With fewer than `ripeness.spread_min_rooms` such rooms the
    setting `ripeness.plant_spread_sd` is used, and `fitted` says so.
    Hand check, ideas: the other five rooms' 5 Nov sds 7.80, 11.55, 12.97, 9.34, 10.83 (6 plants each) ->
    variances 60.84, 133.40, 168.22, 87.24, 117.29 -> mean 113.40 -> sqrt = 10.65 points.
    Returns {sd, fitted, rooms}.
    """
    rs = settings['ripeness']
    lo, hi = rs.get('spread_mid_pct', [5, 95])
    r = inputs.ripeness
    r = r[(r.room != room) & (r['sample'] != 'final') & r.pct_red_weight.between(lo, hi)]
    r = r.dropna(subset=['pct_red_weight_sd', 'plants'])
    r = r[r.plants >= 2]
    rooms = int(r.room.nunique())
    if rooms < int(rs.get('spread_min_rooms', 3)):
        return dict(sd=float(rs['plant_spread_sd']), fitted=False, rooms=rooms)
    dof = r.plants - 1
    return dict(sd=float(np.sqrt((dof * r.pct_red_weight_sd ** 2).sum() / dof.sum())), fitted=True, rooms=rooms)


def fruit_weight(inputs: Inputs, room: str, today: date) -> float:
    """Fruit weight per pot (g): the room's latest crop sample dated on or before today.

    If the room has none yet, the other rooms' mean on their latest sample day on or before today
    (all rooms were sampled on the same days, so that is the same crop age).
    """
    r = known_by(inputs.ripeness[inputs.ripeness['sample'] != 'final'], today)
    own = r[r.room == room].sort_values('date')
    if len(own):
        return float(own.fw_total.iloc[-1])
    other = r[r.room != room]
    if not len(other):
        raise ValueError(f'no crop sample on or before {today} for any room')
    return float(other[other.date == other.date.max()].fw_total.mean())


def costs_so_far(inputs: Inputs, room: str, today: date, econ: dict) -> dict:
    """What the room has cost per m² up to today, its pots per m², and its recent daily cost rate.

    Re-spacing (D10) is a fixed cost of `respacing_cost_eur_m2_year` per m² per year for each spacing
    step taken (a change in density), charged per day from the day of the step.
    running_m2 = energy + fixed costs from the log + re-spacing charges so far.
    rate_m2_day = mean daily log cost over the last `cost_rate_days` days + today's daily re-spacing
    charge (used for future days).
    """
    d = known_by(inputs.daily[inputs.daily.room == room], today).sort_values('date')
    if not len(d):
        raise ValueError(f'no daily log for room {room!r} on or before {today}')
    steps = (d.density.diff().fillna(0) != 0).cumsum()          # spacing steps taken by each day
    per_step_day = econ['respacing_cost_eur_m2_year'] / DAYS_PER_YEAR
    return dict(running_m2=float(d.cost_eur_m2.sum() + per_step_day * steps.sum()),
                rate_m2_day=float(d.cost_eur_m2.tail(int(econ['cost_rate_days'])).mean() + per_step_day * steps.iloc[-1]),
                density=float(d.density.iloc[-1]), spacings=int(steps.iloc[-1]))


# ---------------------------------------------------------------- contract functions

def profit_by_day(inputs: Inputs, room: str, today: date, fc: pd.DataFrame, params: dict, *,
                  settings: dict | None = None, extra_cost_m2_day: float = 0.0,
                  transit_dd: float = 0.0) -> pd.DataFrame:
    """Expected profit per m² per day if the room were harvested on each forecast date.

    `fc` is L01's forecast (date, pct_red, pct_red_low, pct_red_high). `params` is accepted for the
    contract but not needed: the pot spread works from % red alone (see `plant_pct`).
    `extra_cost_m2_day` is added to the cost rate for future days (the temperature what-if).
    The pot spread comes from the other five rooms' full-season weighings (`plant_spread`, D19).
    `transit_dd` > 0 judges and pays the pots on arrival: each pot ripens by that many degree-days on
    the room's curve (steepness params['k']) before the sale rule and price apply (shipping extension).

    Adds: sellable_share, profit_m2_day, profit_low, profit_high, cost_to_date_m2 (contract), plus
    revenue_m2 and the early/late scenario columns that `harvest_window` needs.
    The band is the min/max over ripening {early, expected, late} × gains curve {main, high} (D10).
    """
    s = settings or load_settings()
    econ = s['economics']
    spread = plant_spread(inputs, room, today, s)['sd']   # D19: other five rooms, full season (previous-crop stand-in)
    planted = room_planted(room)   # D17: days grown count from the room's own planting date
    fw = fruit_weight(inputs, room, today)
    c = costs_so_far(inputs, room, today, econ)
    plants_m2 = c['density'] * econ['plant_cost_eur']
    curves = {tag: econ[key] for tag, key in CURVES.items()}

    out = fc.copy().reset_index(drop=True)
    rows = []
    for x in out.itertuples(index=False):
        ahead = (x.date - today).days
        days = (x.date - planted).days + 1
        cost = c['running_m2'] + (c['rate_m2_day'] + extra_cost_m2_day) * ahead + plants_m2
        row = dict(cost_to_date_m2=cost)
        profits = []
        for scen, col in SCENARIOS.items():
            room_pct = getattr(x, col)
            if transit_dd > 0:
                room_pct = ripen(room_pct, params['k'], transit_dd)
            pots = plant_pct(room_pct, spread)
            sfx = '' if scen == 'mid' else f'_{scen}'
            row['sellable_share' + sfx] = float((pots >= 100 * econ['sellable_red_share']).mean())
            for tag, curve in curves.items():
                rev = float(pot_revenue(pots, fw, curve, econ).mean())
                p = profit_m2_day(rev, c['density'], cost - plants_m2, days, econ['plant_cost_eur'])
                profits.append(p)
                if tag == 'mid':
                    row['profit_m2_day' + sfx] = p
                    if scen == 'mid':
                        row['revenue_m2'] = c['density'] * rev
        row['profit_low'], row['profit_high'] = min(profits), max(profits)
        rows.append(row)
    out = pd.concat([out, pd.DataFrame(rows)], axis=1)
    out['days_grown'] = [(d - planted).days + 1 for d in out.date]
    out['fruit_weight_g'], out['density'] = fw, c['density']
    return out


def _best(curve: pd.DataFrame, profit_col: str, share_col: str, min_share: float) -> int:
    """Row index of the highest profit among days with enough sellable pots (any day if none has)."""
    ok = curve[curve[share_col] >= min_share]
    pool = ok if len(ok) else curve
    return int(pool[profit_col].idxmax())


def harvest_window(curve: pd.DataFrame, settings: dict) -> dict:
    """The three dates a grower acts on, from a `profit_by_day` curve (SPEC §5).

    - earliest_sellable_day: first day with at least `earliest_sellable_share` of pots sellable.
    - best_day: highest profit per m² per day, among days that meet that share (if none does, the
      best day overall and earliest_sellable_day is null). So the best day is never one where a
      grower would be throwing away unsellable pots beyond the setting.
    - losses_start_day: first day after the best day when one more day's cost is larger than the
      extra revenue it brings (total profit starts to fall). Null if that is beyond the horizon.
    - best_day_low/high: best days under the early and late ripening scenarios, widened to include
      best_day.
    """
    econ = settings['economics']
    need = econ['earliest_sellable_share']
    c = curve.reset_index(drop=True)
    ok = c.index[c.sellable_share >= need]
    earliest = c.date[ok[0]] if len(ok) else None
    i = _best(c, 'profit_m2_day', 'sellable_share', need)
    best = c.date[i]

    total = c.revenue_m2 - c.cost_to_date_m2   # net profit per m², not per day
    gain = total.diff()
    later = [j for j in range(i + 1, len(c)) if gain[j] < 0]
    losses = c.date[later[0]] if later else None

    scen = [c.date[_best(c, f'profit_m2_day_{s}', f'sellable_share_{s}', need)] for s in ('early', 'late')]
    return dict(earliest_sellable_day=earliest, best_day=best, losses_start_day=losses,
                best_day_low=min(scen + [best]), best_day_high=max(scen + [best]),
                profit_best_m2_day=float(c.profit_m2_day[i]))


def optimal_zone(curve: pd.DataFrame, best_day: date, share: float) -> dict:
    """The optimal harvest zone (D16): days around the best day whose profit is within (1 - share) of it.

    Starting at the best day, the zone grows one day at a time in each direction while the profit per m²
    per day stays at or above the threshold, so it is always one unbroken run of days that contains the
    best day. Threshold = best - (1 - share) x |best|: with share 0.90 that is 90 % of a positive best
    profit, and for a loss-making room (negative best) a loss at most 10 % bigger.
    Hand check, share 0.9, profits [0.02, 0.05, 0.095, 0.10, 0.092, 0.08] with the best on day 3:
    threshold 0.09 -> days 2..4 (0.095, 0.10, 0.092); day 5 (0.08) and day 1 (0.05) fall outside.
    Returns {optimal_from, optimal_to}.
    """
    c = curve.reset_index(drop=True)
    i = int(c.index[c.date == best_day][0])
    best = float(c.profit_m2_day[i])
    floor = best - (1 - share) * abs(best)
    lo = hi = i
    while lo - 1 >= 0 and c.profit_m2_day[lo - 1] >= floor:
        lo -= 1
    while hi + 1 < len(c) and c.profit_m2_day[hi + 1] >= floor:
        hi += 1
    return dict(optimal_from=c.date[lo], optimal_to=c.date[hi])


def look_day(fc: pd.DataFrame, band_low_pct: float) -> date | None:
    """Best shelf look (D16): the first forecast day the room reaches `band_low_pct` % red (70 % by default).

    Today itself if the room is already there; None if the forecast never gets there within the horizon.
    Hand check, band 70: % red [55, 63, 69.9, 70.0, 76] for days 0..4 -> day 3.
    """
    hit = fc[fc.pct_red >= band_low_pct]
    return hit.date.iloc[0] if len(hit) else None
