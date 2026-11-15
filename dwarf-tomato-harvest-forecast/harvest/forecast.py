"""Ripening forecast per room per "today" (SPEC §4, lane L01).

Builds on `main`'s forecast.py (Maree et al. dataset, 4TU.ResearchData, CC BY 4.0):

  % red by fruit weight = 100 / (1 + exp(-k (G - G50)))      G = degree-days above the base temperature

Honesty rules (CLAUDE.md, SPEC D6):
  * The shared curve for a room is fitted on the OTHER five rooms only (leave-one-room-out).
  * Everything is cut at "today": other rooms' crop samples, photos and the room's own logs dated
    after today are never read. Before any room has a ripe crop sample there is nothing to fit, so
    the curve falls back to a starting guess from settings and the result says so (`prior_only`).

Three layers, each switched on only once its evidence exists by today:
  1. warmth:  one shared G50 for every room (the other rooms' crop samples).
  2. camera:  G50 = degree-days on the room's photo onset day + offset learned on the other rooms.
  3. sample:  if the room has its own ripe crop sample, G50 moves toward the value that sample implies.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from harvest.common import Inputs, known_by, load_settings

ONSET_SEARCH_FROM = date(2024, 10, 1)   # main's choice: early-season photos have noise, not fruit
MIN_INFORMATIVE = 3                     # ripe samples (1-99 % red) needed across other rooms to fit a curve
Z95 = 1.96                              # band = G50 +/- 1.96 sd of the room-to-room spread


# ---------------------------------------------------------------- curve maths

def curve(g, k: float, g50: float):
    """% red by weight at degree-days `g` (scalar or array)."""
    return 100.0 / (1.0 + np.exp(-k * (np.asarray(g, dtype=float) - g50)))


def g_at(pct: float, k: float, g50: float) -> float:
    """Degree-days at which the curve reaches `pct` % red (inverse of `curve`)."""
    return g50 + np.log(pct / (100.0 - pct)) / k


def informative(df: pd.DataFrame) -> pd.DataFrame:
    """Samples strictly between 1 and 99 % red: the only ones that pin down where the curve sits.

    A 0 % sample says "not yet", which a curve with any late G50 satisfies, so it can't be inverted.
    """
    return df[(df.pct_red_weight > 1) & (df.pct_red_weight < 99)]


def _settings(settings: dict | None) -> dict:
    return settings if settings is not None else load_settings()


def _prior(settings: dict) -> tuple[float, float, float]:
    """Starting-guess curve used before any room has a ripe crop sample.

    Values come from config/crop.yaml `ripeness.prior_*` when present; the fallbacks are `main`'s
    starting values (k 0.03, G50 750) and a wide spread (60 degree-days). See status log "Blocked".
    """
    r = settings.get('ripeness', {})
    return float(r.get('prior_k', 0.03)), float(r.get('prior_g50', 750.0)), float(r.get('prior_g50_sd', 60.0))


# ---------------------------------------------------------------- fitting

def fit_shared(train: pd.DataFrame) -> tuple[float, float]:
    """Least-squares fit of one shared slope k and one shared G50 to the given crop samples.

    `train` has columns gdd_cum and pct_red_weight (room means, 0 % samples included: they keep G50
    from sliding too early).
    """
    def res(p):
        return curve(train.gdd_cum, p[0], p[1]) - train.pct_red_weight
    p = least_squares(res, [0.03, 750.0], bounds=([0.005, 300.0], [0.2, 1500.0])).x
    return float(p[0]), float(p[1])


def g50_from_sample(g: float, pct: float, k: float) -> float:
    """G50 that puts a curve of slope k through one sample (g degree-days, pct % red).

    Hand check: k = 0.03, G = 778.2, 70 % red -> 778.2 - ln(70/30)/0.03 = 778.2 - 28.24 = 749.96.
    """
    return float(g - np.log(pct / (100.0 - pct)) / k)


def room_g50(samples: pd.DataFrame, k: float) -> float | None:
    """A room's own G50 with the slope held at k: mean of g50_from_sample over its ripe samples."""
    s = informative(samples)
    if s.empty:
        return None
    return float(np.mean([g50_from_sample(g, p, k) for g, p in zip(s.gdd_cum, s.pct_red_weight)]))


def onset_dates(images: pd.DataFrame, today: date, settings: dict | None = None) -> dict[str, date]:
    """Photo onset per room, as known at the end of `today`.

    Onset = first of `onset_days` consecutive noon photos with red index above `onset_red_index`.
    It is only known once the last of those days has passed, so photos after today are never read.
    The red index is `main`'s lamp-corrected index; lamp-lit frames are kept (one room is lamp-lit
    at noon every day) and flagged in the evidence trail instead.
    """
    rs = _settings(settings)['ripeness']
    need, thr = int(rs['onset_days']), float(rs['onset_red_index'])
    img = known_by(images, today)
    img = img[(img['date'] >= ONSET_SEARCH_FROM) & img.red_index.notna()].sort_values('date')
    out = {}
    for room, g in img.groupby('room'):
        run: list[date] = []                      # dates of the current run of red photos
        for d, v in zip(g['date'], g.red_index):
            if v > thr:
                run = run + [d] if run and (d - run[-1]).days == 1 else [d]
            else:
                run = []
            if len(run) >= need:
                out[room] = run[0]
                break
    return out


def gdd_on(daily: pd.DataFrame, room: str, day: date) -> float:
    """Cumulative degree-days for `room` at the end of `day`."""
    return float(daily[(daily.room == room) & (daily['date'] == day)].gdd_cum.iloc[0])


def gdd_rate(daily: pd.DataFrame, room: str, today: date, days: int) -> float:
    """Degree-days per day over the last `days` days up to today: (G_today - G_{today-days}) / days.

    Uses fewer days if the log is shorter. This is the "future warmth" assumption (SPEC §4).
    """
    g = known_by(daily[daily.room == room], today).sort_values('date').gdd_cum.values
    n = min(days, len(g) - 1)
    return float((g[-1] - g[-1 - n]) / n) if n > 0 else 0.0


def shared_models(inputs: Inputs, room: str, today: date, settings: dict | None = None) -> dict:
    """Fit the warmth and camera models on every room except `room`, with data dated <= today.

    Returns k, g50_warmth, sd_warmth (spread of the other rooms' own G50s), delta and sd_camera
    (G50 minus degree-days at photo onset, mean and spread over the other rooms), prior_only.
    """
    st = _settings(settings)
    rip = known_by(inputs.ripeness, today)
    train = rip[rip.room != room]
    k0, g0, sd0 = _prior(st)
    out = dict(k=k0, g50_warmth=g0, sd_warmth=sd0, delta=None, sd_camera=sd0, prior_only=True)
    if len(informative(train)) < MIN_INFORMATIVE:
        return out
    k, g50 = fit_shared(train)
    per_room = {r: room_g50(s, k) for r, s in train.groupby('room')}
    per_room = {r: g for r, g in per_room.items() if g is not None}
    onset = onset_dates(inputs.images, today, st)
    deltas = [g - gdd_on(inputs.daily, r, onset[r]) for r, g in per_room.items() if r in onset]
    out.update(k=k, g50_warmth=g50, prior_only=False,
               sd_warmth=float(np.std(list(per_room.values()), ddof=1)) if len(per_room) >= 2 else sd0)
    if deltas:
        out.update(delta=float(np.mean(deltas)), sd_camera=float(np.std(deltas, ddof=1)) if len(deltas) >= 2 else sd0)
    return out


def latest_sample(inputs: Inputs, room: str, today: date) -> pd.Series | None:
    """The room's newest crop sample dated <= today that is ripe enough to place the curve, or None."""
    own = informative(known_by(inputs.ripeness[inputs.ripeness.room == room], today))
    return None if own.empty else own.sort_values('date').iloc[-1]


def fit_params(inputs: Inputs, room: str, today: date, settings: dict | None = None) -> dict:
    """Curve settings for `room` as known at the end of `today` (contract §2).

    Keys: k, g50, g50_sd, model ('warmth' | 'warmth+camera' | 'warmth+camera+sample'), gdd_rate,
    sample_used (date or None), plus gdd_today, prior_only, onset, g50_warmth, g50_camera for the
    evidence trail and confidence.
    """
    st = _settings(settings)
    rs = st['ripeness']
    m = shared_models(inputs, room, today, st)
    k, g50, sd, model = m['k'], m['g50_warmth'], m['sd_warmth'], 'warmth'
    onset = onset_dates(inputs.images, today, st).get(room)
    g50_camera = None
    if onset is not None and m['delta'] is not None:
        g50_camera = gdd_on(inputs.daily, room, onset) + m['delta']
        g50, sd, model = g50_camera, m['sd_camera'], 'warmth+camera'
    sample = latest_sample(inputs, room, today)
    sample_used = None
    if sample is not None:
        w = float(rs['sample_weight'])
        g50 = g50 + w * (g50_from_sample(sample.gdd_cum, sample.pct_red_weight, k) - g50)
        sample_used = sample['date']
        if model == 'warmth+camera':
            model = 'warmth+camera+sample'
    return dict(k=k, g50=float(g50), g50_sd=float(sd), model=model,
                gdd_rate=gdd_rate(inputs.daily, room, today, int(rs['rate_days'])), sample_used=sample_used,
                gdd_today=gdd_on(inputs.daily, room, today), prior_only=m['prior_only'], onset=onset,
                g50_warmth=m['g50_warmth'], g50_camera=g50_camera)


def forecast(inputs: Inputs, room: str, today: date, delta_c: float = 0.0, horizon: int = 21,
             settings: dict | None = None, params: dict | None = None) -> pd.DataFrame:
    """% red for today and the next `horizon` days, with a low/high band (contract §2).

    Future degree-days per day = the last-7-day rate + delta_c (a +1 C warmer room gains one more
    degree-day a day), never below 0. Band: the curve with G50 shifted by +/- 1.96 sd.
    Pass `params` (from fit_params) to skip refitting.
    """
    p = params or fit_params(inputs, room, today, settings)
    rate = max(p['gdd_rate'] + delta_c, 0.0)
    h = np.arange(horizon + 1)
    g = p['gdd_today'] + rate * h
    half = Z95 * p['g50_sd']
    return pd.DataFrame({
        'date': [today + timedelta(days=int(i)) for i in h],
        'gdd_cum': g,
        'pct_red': curve(g, p['k'], p['g50']),
        'pct_red_low': curve(g, p['k'], p['g50'] + half),
        'pct_red_high': curve(g, p['k'], p['g50'] - half),
    })


def date_reaching(params: dict, pct: float, today: date, delta_c: float = 0.0) -> date:
    """Day the room is estimated to reach `pct` % red, at the future warmth rate (may be before today).

    Hand check: G_today 700, rate 10/day, k 0.03, G50 750, pct 70 -> G 778.2, (778.2-700)/10 = 7.8 -> 8 days.
    """
    pct = min(max(pct, 0.5), 99.5)
    rate = max(params['gdd_rate'] + delta_c, 1e-6)
    days = (g_at(pct, params['k'], params['g50']) - params['gdd_today']) / rate
    return today + timedelta(days=int(round(days)))
