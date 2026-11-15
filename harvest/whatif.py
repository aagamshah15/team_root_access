"""Temperature what-if (SPEC §6). Lane L02.

"What if we ran this room 1 °C warmer (or cooler) from today?"
- Ripening: L01's forecast handles it (degree-days per day change by `delta_c`, bounded at the base).
- Cost: extra heating per m² per day per °C, estimated from the logs (`heating_cost_per_degree`).
The answer is a model estimate; nobody changed a greenhouse to test it.
"""
from __future__ import annotations

from datetime import date
from typing import Callable

import numpy as np
import pandas as pd

from harvest.common import Inputs, known_by, load_settings
from harvest.economics import harvest_window, profit_by_day

NOTE = 'Model estimate, not tested in the greenhouse.'
MIN_R2 = 0.3   # below this the heating-cost fit is called weak in the note (lane brief)


def _fit(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """Least squares y ≈ x @ coef (x includes an intercept column); returns (coef, r²)."""
    coef, *_ = np.linalg.lstsq(x, y, rcond=None)
    resid = y - x @ coef
    ss = float(((y - y.mean()) ** 2).sum())
    return coef, (1 - float((resid ** 2).sum()) / ss) if ss > 0 else 0.0


def heating_cost_per_degree(inputs: Inputs, today: date | None = None) -> dict:
    """Extra € per m² per day for each °C the room is kept warmer, from the rooms' own logs.

    The log has total cost per m² but no separate heating cost, so two steps:
    1. Price of heat: fit daily cost/m² = a + b·heating MJ + c·lighting kWh over all room-days; b is € per MJ.
    2. Heating cost/m² = b·heating MJ. On days with heating on, fit it against (inside − outside mean
       temperature) across rooms and days; the slope is € per m² per day per °C.
    `today` limits the data to what was known then (None = all days). Slope is floored at 0.
    Returns {eur_m2_day_per_c, r2, n, eur_per_mj, note}.
    """
    d = inputs.daily if today is None else known_by(inputs.daily, today)
    x = d.merge(inputs.weather[['date', 'T_out']], on='date').dropna(
        subset=['cost_eur_m2', 'heating_MJ', 'lighting_kWh', 'T_mean', 'T_out'])
    a = np.c_[np.ones(len(x)), x.heating_MJ, x.lighting_kWh]
    (_, eur_per_mj, _), _ = _fit(a, x.cost_eur_m2.to_numpy(float))
    h = x[x.heating_MJ > 0]
    if len(h) < 3:
        return dict(eur_m2_day_per_c=0.0, r2=0.0, n=int(len(h)), eur_per_mj=float(eur_per_mj),
                    note='Too few heated days to estimate the cost of a warmer room; extra cost set to 0.')
    dt = (h.T_mean - h.T_out).to_numpy(float)
    (_, slope), r2 = _fit(np.c_[np.ones(len(h)), dt], eur_per_mj * h.heating_MJ.to_numpy(float))
    slope = max(float(slope), 0.0)
    note = (f'Heating cost per °C estimated from {len(h)} heated room-days (fit quality r² = {r2:.2f}).')
    if r2 < MIN_R2:
        note += ' The fit is weak: inside−outside temperature explains little of the heating bill, so treat the cost as rough.'
    return dict(eur_m2_day_per_c=slope, r2=float(r2), n=int(len(h)), eur_per_mj=float(eur_per_mj), note=note)


def extra_energy_cost(inputs: Inputs, room: str, today: date, delta_c: float, heat: dict, settings: dict) -> float:
    """Extra € per m² per day for running `delta_c` °C warmer.

    Positive delta: slope × delta. Negative delta saves money, but never more than the room's recent
    heating bill (you cannot save heating you are not using).
    """
    extra = heat['eur_m2_day_per_c'] * delta_c
    if extra >= 0:
        return float(extra)
    d = known_by(inputs.daily[inputs.daily.room == room], today).sort_values('date')
    recent_heat = heat['eur_per_mj'] * d.heating_MJ.tail(int(settings['economics']['cost_rate_days'])).mean()
    return float(max(extra, -max(recent_heat, 0.0)))


def _l01():
    """L01's forecast functions, imported late so this module loads before L01 lands."""
    from harvest.forecast import fit_params, forecast
    return forecast, fit_params


def whatif(inputs: Inputs, room: str, today: date, delta_c: float, *,
           forecast_fn: Callable[..., pd.DataFrame] | None = None, params_fn: Callable[..., dict] | None = None,
           settings: dict | None = None, heat: dict | None = None) -> dict:
    """New best day and profit if the room runs `delta_c` °C warmer from today (fields of whatif.json).

    `forecast_fn` / `params_fn` default to L01's `forecast` / `fit_params` (tests pass stand-ins).
    `heat` can be passed in so a batch of what-ifs fits the heating cost once.
    """
    s = settings or load_settings()
    if forecast_fn is None or params_fn is None:
        forecast_fn, params_fn = _l01()
    heat = heat or heating_cost_per_degree(inputs, today)
    horizon = int(s['ripeness']['horizon_days'])
    params = params_fn(inputs, room, today)

    base = profit_by_day(inputs, room, today, forecast_fn(inputs, room, today, delta_c=0.0, horizon=horizon),
                         params, settings=s)
    extra = extra_energy_cost(inputs, room, today, delta_c, heat, s) if delta_c else 0.0
    new = profit_by_day(inputs, room, today, forecast_fn(inputs, room, today, delta_c=delta_c, horizon=horizon),
                        params, settings=s, extra_cost_m2_day=extra)
    w0, w1 = harvest_window(base, s), harvest_window(new, s)

    note = NOTE
    if delta_c:
        note += (f' Ripening follows warmth (degree-days); extra heating {extra:+.3f} € per m² per day.'
                 + (' Heating-cost fit is weak (r² below 0.3).' if heat['r2'] < MIN_R2 else ''))
    return dict(delta_c=float(delta_c), best_day=w1['best_day'], days_change=int((w1['best_day'] - w0['best_day']).days),
                profit_best_m2_day=round(w1['profit_best_m2_day'], 3),
                profit_change_m2_day=round(w1['profit_best_m2_day'] - w0['profit_best_m2_day'], 3),
                extra_energy_cost_m2_day=round(extra, 3), note=note)
