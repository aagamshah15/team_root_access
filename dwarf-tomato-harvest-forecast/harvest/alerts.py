"""Plain-English alerts: something in a room looks off (SPEC §7, contracts/app-data.md `alerts.json`).

Owner: L03. Four kinds:
- behind_schedule / ahead_of_schedule: a crop sample, or the noon camera, disagrees with the forecast band
  the model made the day before (so the alert uses only what was known before the observation).
- sensor_check: missing climate days, readings stuck at one value, readings outside a plausible range.
- room_drift: the room's warmth per day over the last week is well below the other rooms'.

A condition that holds for several days in a row gives ONE alert, dated on its first day, with the last
day in `numbers.until`. The app can show an alert as active when `date <= today <= numbers.until`.
Thresholds come from the `alerts:` block of config/crop.yaml.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Callable

import pandas as pd

from .common import FIRST_TODAY, ROOMS, Inputs, actual_harvest, load_settings

# Plausible daily-mean ranges. Used only until config/crop.yaml has `alerts.ranges` (requested from L05).
DEFAULT_RANGES = {
    'T_mean': {'min': 5.0, 'max': 40.0, 'label': 'average air temperature', 'unit': '°C'},
    'RH_mean': {'min': 20.0, 'max': 100.0, 'label': 'average humidity', 'unit': '%'},
    'CO2_mean': {'min': 200.0, 'max': 2000.0, 'label': 'average CO₂', 'unit': 'ppm'},
    'DLI': {'min': 0.0, 'max': 40.0, 'label': 'daily light', 'unit': 'mol/m²'},
}
FLATLINE_COLUMNS = ['T_mean', 'RH_mean', 'CO2_mean', 'DLI']   # lamp hours can legitimately repeat

ForecastFn = Callable[[str, date], pd.DataFrame]


# ---------- helpers ----------

def _fmt(d: date) -> str:
    """Short date for messages, e.g. '5 Nov'."""
    return f'{d.day} {d.strftime("%b")}'


def _r(x, n: int = 1):
    """Round for display in `numbers` (plain float, or None)."""
    return None if x is None or pd.isna(x) else round(float(x), n)


def runs(flags: dict[date, bool]) -> list[tuple[date, date]]:
    """Consecutive-day stretches where the flag is True, as (first day, last day).

    Days missing from `flags` break a stretch.
    """
    out, start, prev = [], None, None
    for d in sorted(flags):
        if flags[d] and start is not None and prev == d - timedelta(days=1):
            prev = d
        elif flags[d]:
            if start is not None:
                out.append((start, prev))
            start = prev = d
        else:
            if start is not None:
                out.append((start, prev))
            start = prev = None
    if start is not None:
        out.append((start, prev))
    return out


def _alert(room, day, kind, severity, title, message, numbers) -> dict:
    return {'room': room, 'date': day.isoformat(), 'kind': kind, 'severity': severity,
            'title': title, 'message': message, 'numbers': numbers}


def _band_on(fc: pd.DataFrame, day: date):
    """The forecast row for `day` as (pct_red, low, high), or None if the forecast doesn't cover it."""
    row = fc[fc['date'] == day]
    if row.empty:
        return None
    r = row.iloc[0]
    return float(r['pct_red']), float(r['pct_red_low']), float(r['pct_red_high'])


# ---------- behind / ahead of schedule ----------

def sample_schedule_alerts(room: str, samples: pd.DataFrame, forecast_for: ForecastFn, settings: dict) -> list[dict]:
    """Compare each crop sample with the band forecast the day before it.

    Behind: sample % red is more than `schedule_points` below the band's low edge.
    Ahead: more than `schedule_points` above the band's high edge.
    """
    pts = settings['alerts']['schedule_points']
    out = []
    for _, s in samples.sort_values('date').iterrows():
        day = s['date']
        try:
            band = _band_on(forecast_for(room, day - timedelta(days=1)), day)
        except Exception:      # forecast not available for that day (e.g. too early)
            band = None
        if band is None:
            continue
        mid, low, high = band
        obs = float(s['pct_red_weight'])
        nums = {'sample_pct_red': _r(obs), 'forecast_pct_red': _r(mid), 'forecast_low': _r(low),
                'forecast_high': _r(high), 'margin_points': pts, 'until': day.isoformat()}
        if obs < low - pts:
            out.append(_alert(room, day, 'behind_schedule', 'warning', 'Ripening behind forecast',
                              f'The crop sample on {_fmt(day)} found {obs:.0f}% of fruit weight red, well below the '
                              f'{low:.0f}–{high:.0f}% the model estimated; the harvest window may come later than shown.',
                              nums))
        elif obs > high + pts:
            out.append(_alert(room, day, 'ahead_of_schedule', 'warning', 'Ripening ahead of forecast',
                              f'The crop sample on {_fmt(day)} found {obs:.0f}% of fruit weight red, well above the '
                              f'{low:.0f}–{high:.0f}% the model estimated; the harvest window may come earlier than shown.',
                              nums))
    return out


def camera_schedule_alerts(room: str, images: pd.DataFrame, days: list[date], forecast_for: ForecastFn,
                           settings: dict) -> list[dict]:
    """Camera check: the noon photos still show no red fruit while the forecast says there should be some.

    On each day, take the last `onset_days` usable photos (lamps off). If every one has a red index below
    the onset threshold, but even the late edge of the band forecast the day before is above
    `schedule_points` % red, the camera disagrees with the model. Only 'behind' is checked: the red index
    is a share of the photo, not % red by weight, so the camera can't tell us a room is far ahead.
    """
    rp, ap = settings['ripeness'], settings['alerts']
    thr, n, pts = rp['onset_red_index'], rp['onset_days'], ap['schedule_points']
    usable = images[(images['lamps_on_noon'].astype(str).str.lower() == 'false') & images['red_index'].notna()]
    flags, info = {}, {}
    for day in days:
        recent = usable[usable['date'] <= day].sort_values('date').tail(n)
        flags[day] = False
        if len(recent) < n or (recent['red_index'] >= thr).any():
            continue
        try:
            band = _band_on(forecast_for(room, day - timedelta(days=1)), day)
        except Exception:
            band = None
        if band is not None and band[1] > pts:
            flags[day] = True
            info[day] = (band, float(recent['red_index'].max()))
    out = []
    for start, end in runs(flags):
        (mid, low, high), red = info[start]
        out.append(_alert(room, start, 'behind_schedule', 'info', 'Camera sees little red fruit',
                          f'The last {n} daylight noon photos show almost no red fruit, while the model estimated at '
                          f'least {low:.0f}% red by {_fmt(start)}; check the crop before planning the harvest.',
                          {'max_red_index': _r(red, 3), 'onset_red_index': thr, 'forecast_low': _r(low),
                           'forecast_pct_red': _r(mid), 'photos_checked': n, 'until': end.isoformat()}))
    return out


# ---------- sensor checks ----------

def missing_day_alerts(room: str, daily: pd.DataFrame) -> list[dict]:
    """One alert per gap in the room's daily climate log (between its first and last day)."""
    have = set(daily['date'])
    if not have:
        return []
    first, last = min(have), max(have)
    flags = {first + timedelta(days=i): (first + timedelta(days=i)) not in have
             for i in range((last - first).days + 1)}
    out = []
    for start, end in runs(flags):
        n = (end - start).days + 1
        out.append(_alert(room, start, 'sensor_check', 'warning', 'Climate data missing',
                          f'No climate log was received for {n} day{"s" if n > 1 else ""} from {_fmt(start)}; '
                          f'the warmth count for those days is uncertain.',
                          {'missing_days': n, 'until': end.isoformat()}))
    return out


def flatline_alerts(room: str, daily: pd.DataFrame, settings: dict, ranges: dict) -> list[dict]:
    """Readings that stay at exactly the same value for `flatline_days` or more days in a row (stuck sensor)."""
    min_days = settings['alerts']['flatline_days']
    d = daily.sort_values('date')
    out = []
    for col in FLATLINE_COLUMNS:
        if col not in d.columns:
            continue
        vals = dict(zip(d['date'], d[col]))
        # flag day t if its value equals the previous day's (and the previous day exists)
        same = {t: (t - timedelta(days=1)) in vals and pd.notna(v) and v == vals[t - timedelta(days=1)]
                for t, v in vals.items()}
        for start, end in runs(same):
            first = start - timedelta(days=1)               # the stuck stretch begins the day before
            n = (end - first).days + 1
            if n < min_days:
                continue
            meta = ranges.get(col, {'label': col, 'unit': ''})
            v = vals[first]
            out.append(_alert(room, first, 'sensor_check', 'warning', 'Sensor reading not changing',
                              f'The {meta["label"]} stayed at exactly {v:g} {meta["unit"]} for {n} days in a row '
                              f'from {_fmt(first)}; the sensor may be stuck.',
                              {'reading': col, 'value': _r(v, 3), 'days': n, 'until': end.isoformat()}))
    return out


def range_alerts(room: str, daily: pd.DataFrame, ranges: dict) -> list[dict]:
    """Readings outside the plausible range for a daily mean (likely a sensor or logging fault)."""
    d = daily.sort_values('date')
    out = []
    for col, lim in ranges.items():
        if col not in d.columns:
            continue
        vals = dict(zip(d['date'], d[col]))
        flags = {t: pd.notna(v) and (v < lim['min'] or v > lim['max']) for t, v in vals.items()}
        for start, end in runs(flags):
            stretch = [vals[start + timedelta(days=i)] for i in range((end - start).days + 1)]
            worst = max(stretch, key=lambda v: max(lim['min'] - v, v - lim['max']))
            out.append(_alert(room, start, 'sensor_check', 'warning', 'Reading outside normal range',
                              f'The {lim["label"]} was {worst:g} {lim["unit"]} on {_fmt(start)}, outside the expected '
                              f'{lim["min"]:g}–{lim["max"]:g} {lim["unit"]}; check the sensor.',
                              {'reading': col, 'value': _r(worst, 3), 'min': lim['min'], 'max': lim['max'],
                               'days': len(stretch), 'until': end.isoformat()}))
    return out


def sensor_alerts(room: str, daily: pd.DataFrame, settings: dict) -> list[dict]:
    """All sensor checks for one room's daily climate log."""
    ranges = settings['alerts'].get('ranges') or DEFAULT_RANGES
    ranges = {k: {**DEFAULT_RANGES.get(k, {'label': k, 'unit': ''}), **v} for k, v in ranges.items()}
    return missing_day_alerts(room, daily) + flatline_alerts(room, daily, settings, ranges) + \
        range_alerts(room, daily, ranges)


# ---------- room drift ----------

def warmth_rates(daily: pd.DataFrame, days: int = 7) -> pd.DataFrame:
    """Degree-days gained per day over the last `days` days, per room and date (wide: date x room).

    rate(t) = (gdd_cum(t) - gdd_cum(t - days)) / days. Needs both days present; else blank.
    """
    wide = daily.pivot(index='date', columns='room', values='gdd_cum')
    wide.index = pd.to_datetime(wide.index)
    wide = wide.asfreq('D')
    rate = (wide - wide.shift(days)) / days
    rate.index = rate.index.date
    return rate


def drift_alerts(daily: pd.DataFrame, settings: dict) -> list[dict]:
    """Room warming slower than the rest: 7-day rate more than `drift_share` below the other rooms' median."""
    share = settings['alerts']['drift_share']
    rate = warmth_rates(daily, settings['ripeness'].get('rate_days', 7))
    out = []
    for room in rate.columns:
        flags, info = {}, {}
        for day, row in rate.iterrows():
            own, others = row[room], row.drop(room).dropna()
            flags[day] = False
            if pd.isna(own) or len(others) < 2:
                continue
            med = float(others.median())
            if med > 0 and own < (1 - share) * med:
                flags[day] = True
                info[day] = (float(own), med)
        for start, end in runs(flags):
            own, med = info[start]
            below = 100 * (1 - own / med)
            out.append(_alert(room, start, 'room_drift', 'warning', 'Room warming slower than the others',
                              f'Over the 7 days to {_fmt(start)} this room gained {own:.1f} degree-days a day '
                              f'(warmth above {settings.get("base_temp_c", 10):g} °C), {below:.0f}% below the other '
                              f'rooms\' median of {med:.1f}; ripening may lag.',
                              {'room_rate': _r(own, 2), 'others_median_rate': _r(med, 2),
                               'pct_below': _r(below), 'threshold_pct': _r(100 * share), 'until': end.isoformat()}))
    return out


# ---------- entry point ----------

def default_forecast_fn(inputs: Inputs) -> ForecastFn | None:
    """L01's `forecast(inputs, room, today)` wrapped with a cache, or None if L01 isn't merged yet."""
    try:
        from .forecast import forecast
    except ImportError:
        return None
    cache: dict = {}

    def fn(room: str, today: date) -> pd.DataFrame:
        if (room, today) not in cache:
            cache[(room, today)] = forecast(inputs, room, today)
        return cache[(room, today)]
    return fn


def room_days(inputs: Inputs, room: str) -> list[date]:
    """Days we run the camera check on: the app's "today" values (FIRST_TODAY to the day before harvest)."""
    h = actual_harvest(inputs, room)
    return [FIRST_TODAY + timedelta(days=i) for i in range(max((h - FIRST_TODAY).days, 0))]


def alerts(inputs: Inputs, settings: dict | None = None, forecast_for: ForecastFn | None = None) -> list[dict]:
    """alerts.json rows for every room and date (contracts/app-data.md §1), sorted by date then room.

    Schedule alerts need a forecast; without L01's `forecast` (and none passed in) they are skipped.
    """
    settings = settings or load_settings()
    forecast_for = forecast_for or default_forecast_fn(inputs)
    rooms = [r for r in ROOMS if r in set(inputs.daily.room)]
    out = []
    for room in rooms:
        h = actual_harvest(inputs, room)
        daily = inputs.daily[(inputs.daily.room == room) & (inputs.daily['date'] < h)]
        out += sensor_alerts(room, daily, settings)
        if forecast_for is not None:
            rip = inputs.ripeness
            samples = rip[(rip.room == room) & (rip['date'] < h)]
            out += sample_schedule_alerts(room, samples, forecast_for, settings)
            imgs = inputs.images[inputs.images.room == room]
            out += camera_schedule_alerts(room, imgs, room_days(inputs, room), forecast_for, settings)
    pre = inputs.daily.merge(pd.DataFrame([(r, actual_harvest(inputs, r)) for r in rooms], columns=['room', 'h']))
    out += drift_alerts(pre[pre['date'] < pre['h']].drop(columns='h'), settings)
    return sorted(out, key=lambda a: (a['date'], a['room'], a['kind']))
