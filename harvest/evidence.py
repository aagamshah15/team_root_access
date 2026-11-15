"""Evidence trail: what we saw in each room on each day (SPEC §7, docs/app-data.md `evidence.json`).

Owner: L03. For every room and day from planting to the day before harvest we publish the noon photo
(if one was selected for the app), its red-fruit index, whether the grow lamps were on at noon, the
canopy distance from the depth camera, the warmth so far (degree-days) and the latest crop sample known
on that day. These are raw observations, not model outputs, so the grower can check the forecast.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from .common import REPO, planted, ROOMS, Inputs, actual_harvest

PHOTOS_DIR = REPO / 'data' / 'published' / 'photos'
PHOTO_URL_PREFIX = 'data/photos/'      # photo paths are relative to web/index.html
PHOTO_FIRST = date(2024, 10, 15)       # first day the app shows photos for (lane brief L03)


def photo_name(room: str, day: date) -> str:
    """File name of a selected photo in data/published/photos/: `<room>_<YYYY-MM-DD>.jpg`."""
    return f'{room}_{day.isoformat()}.jpg'


def photo_dates(harvest: date, first: date = PHOTO_FIRST) -> list[date]:
    """Days whose noon photo we publish: `first` up to the day before harvest.

    The harvest-day photo shows empty tables (plants already removed), so it is never included.
    """
    n = (harvest - first).days
    return [first + timedelta(days=i) for i in range(max(n, 0))]


def _clean(v):
    """JSON-safe number: NaN/None -> None, numpy scalars -> plain float."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def _lamps(v) -> bool | None:
    """Lamp state at noon as True/False, or None when unknown (blank in the image table)."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, str):
        return v.strip().lower() == 'true'
    return bool(v)


def photo_usable(lamps_on: bool | None, red_index) -> bool:
    """Can we trust the photo's colours? Only when the lamps were known to be off and a red index exists.

    Lamp-lit photos are tinted purple, so their red-fruit index is unreliable (SPEC §3).
    """
    return lamps_on is False and _clean(red_index) is not None


def last_sample(ripeness: pd.DataFrame, room: str, day: date) -> dict:
    """Latest crop sample for `room` dated on or before `day`: date, mean % red by weight, mean fruit weight (g)."""
    r = ripeness[(ripeness.room == room) & (ripeness['date'] <= day)]
    if r.empty:
        return {'last_sample_date': None, 'last_sample_pct_red': None, 'last_sample_fw_g': None}
    s = r.sort_values('date').iloc[-1]
    return {'last_sample_date': s['date'].isoformat(), 'last_sample_pct_red': _clean(s['pct_red_weight']),
            'last_sample_fw_g': _clean(s['fw_total'])}


def room_evidence(inputs: Inputs, room: str, photos_dir: Path = PHOTOS_DIR) -> list[dict]:
    """Evidence rows for one room, planting day to the day before its harvest."""
    harvest = actual_harvest(inputs, room)
    daily = inputs.daily[inputs.daily.room == room].set_index('date')
    images = inputs.images[inputs.images.room == room].set_index('date')
    start = planted(room)   # D17: the room's own planting date
    rows = []
    for i in range((harvest - start).days):
        day = start + timedelta(days=i)
        img = images.loc[day] if day in images.index else None
        lamps = _lamps(img['lamps_on_noon']) if img is not None else None
        red = _clean(img['red_index']) if img is not None else None
        name = photo_name(room, day)
        rows.append({
            'room': room, 'date': day.isoformat(),
            'photo': PHOTO_URL_PREFIX + name if (photos_dir / name).exists() else None,
            'photo_usable': photo_usable(lamps, red),
            'lamps_on': lamps,
            'red_index': red,
            'green_pct': _clean(img['green_pct']) if img is not None else None,
            'canopy_distance_mm': _clean(img['canopy_distance_mm']) if img is not None else None,
            'gdd_cum': _clean(daily.loc[day, 'gdd_cum']) if day in daily.index else None,
            **last_sample(inputs.ripeness, room, day),
        })
    return rows


def evidence_rows(inputs: Inputs, photos_dir: Path = PHOTOS_DIR) -> list[dict]:
    """evidence.json rows for every room (docs/app-data.md §1)."""
    rooms = [r for r in ROOMS if r in set(inputs.daily.room)]
    return [row for room in rooms for row in room_evidence(inputs, room, photos_dir)]
