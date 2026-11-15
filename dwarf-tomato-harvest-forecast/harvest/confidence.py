"""How sure we are about a room's forecast, and why (SPEC §4, lane L01).

Three parts a grower can check, each rated high / medium / low; the overall level is the worst one.
  1. Day range:  how many days wide the likely harvest range is. The band shifts the curve's G50 by
                 +/- 1.96 sd, so every ripeness target moves by the same number of days:
                 width = 2 * 1.96 * sd / degree-days per day.
  2. Agreement:  do the warmth model, the camera and the latest crop sample put today's % red within a
                 few points of each other?
  3. Freshness:  days since the newest crop sample and since the newest photo (the larger of the two).
Thresholds come from config/crop.yaml `confidence:`.
"""
from __future__ import annotations

from datetime import date

from harvest.common import Inputs, known_by, load_settings
from harvest.forecast import Z95, curve, fit_params, g50_from_sample, latest_sample

RANK = {'high': 0, 'medium': 1, 'low': 2}


def rate_low_is_good(value: float, high_max: float, medium_max: float) -> str:
    """'high' if value <= high_max, 'medium' if <= medium_max, else 'low'."""
    return 'high' if value <= high_max else ('medium' if value <= medium_max else 'low')


def day_range_days(g50_sd: float, gdd_per_day: float) -> int:
    """Width in days of the likely harvest range.

    Hand check: sd 20 degree-days, 10 degree-days a day -> 2 * 1.96 * 20 / 10 = 7.84 -> 8 days.
    """
    return int(round(2 * Z95 * g50_sd / max(gdd_per_day, 1e-6)))


def estimates_today(inputs: Inputs, room: str, today: date, params: dict) -> dict[str, float]:
    """Today's % red according to each source that has something to say by today.

    warmth: the shared warmth-only curve. camera: the curve anchored on the photo onset (once known).
    sample: the newest ripe crop sample, carried forward to today along the shared slope.
    """
    g, k = params['gdd_today'], params['k']
    out = {'warmth': float(curve(g, k, params['g50_warmth']))}
    if params.get('g50_camera') is not None:
        out['camera'] = float(curve(g, k, params['g50_camera']))
    s = latest_sample(inputs, room, today)
    if s is not None:
        out['sample'] = float(curve(g, k, g50_from_sample(s.gdd_cum, s.pct_red_weight, k)))
    return out


def agreement(est: dict[str, float], agree_points: float, conflict_points: float) -> tuple[str, float]:
    """('agree' | 'mixed' | 'conflict', gap in points) between the sources that are compared.

    D13: once both the photo-timed estimate and a crop sample exist, they are compared with each other
    and the warmth-only model (our weakest method in the timing test) is context only. Before that,
    the warmth model is compared with whichever of the two exists. One source alone counts as 'mixed'.
    Hand checks: {warmth 40, camera 48, sample 52} -> camera vs sample, gap 4 -> 'agree';
    {warmth 40, camera 65} -> gap 25 -> 'conflict'.
    """
    if len(est) < 2:
        return 'mixed', 0.0
    used = {k: est[k] for k in ('camera', 'sample')} if {'camera', 'sample'} <= est.keys() else est
    gap = max(used.values()) - min(used.values())
    return ('agree' if gap <= agree_points else 'conflict' if gap > conflict_points else 'mixed'), float(gap)


def freshness(inputs: Inputs, room: str, today: date) -> tuple[int, int | None, int | None]:
    """(larger of the two, days since newest crop sample, days since newest photo) as of today.

    A photo counts if it has a red index (main's lamp-corrected index; lamp-lit noon frames count,
    since one room is lamp-lit at noon every day). Missing source -> None, and the larger is then
    measured from planting.
    """
    samples = known_by(inputs.ripeness[inputs.ripeness.room == room], today)
    photos = known_by(inputs.images[(inputs.images.room == room) & inputs.images.red_index.notna()], today)
    s = (today - samples['date'].max()).days if len(samples) else None
    p = (today - photos['date'].max()).days if len(photos) else None
    since_planting = (today - inputs.daily[inputs.daily.room == room]['date'].min()).days
    return max(x if x is not None else since_planting for x in (s, p)), s, p


def _plural(n: int, word: str) -> str:
    return f'{n} {word}' + ('' if n == 1 else 's')


def _ago(n: int) -> str:
    """'today', '1 day ago', '9 days ago'."""
    return 'today' if n == 0 else f'{_plural(n, "day")} ago'


def confidence(inputs: Inputs, room: str, today: date, settings: dict | None = None,
               params: dict | None = None) -> dict:
    """Confidence level and its three parts for `room` at the end of `today` (contract §2).

    Returns {level, day_range_days, agreement, freshness_days, reasons}; reasons are plain English,
    worst part first. Pass `params` (from fit_params) to skip refitting.
    """
    st = settings if settings is not None else load_settings()
    c = st['confidence']
    p = params or fit_params(inputs, room, today, st)

    width = day_range_days(p['g50_sd'], p['gdd_rate'])
    lvl_range = rate_low_is_good(width, c['day_range_high_max'], c['day_range_medium_max'])
    if p['prior_only']:
        lvl_range = 'low'
        why_range = 'No room has a ripe crop sample yet, so the forecast is a starting guess'
    else:
        why_range = f'Likely harvest range is {_plural(width, "day")} wide'

    est = estimates_today(inputs, room, today, p)
    agree, gap = agreement(est, c['agree_points'], c['conflict_points'])
    lvl_agree = {'agree': 'high', 'mixed': 'medium', 'conflict': 'low'}[agree]
    names = {'warmth': 'warmth model', 'camera': 'photo-timed estimate', 'sample': 'latest crop sample carried to today'}
    listed = ', '.join(f'{names[s]} {v:.0f}%' for s, v in est.items())
    if len(est) < 2:
        why_agree = 'Only the warmth model so far; camera has not seen ripening and no ripe crop sample yet'
    else:
        both = {'camera', 'sample'} <= est.keys()   # D13: then only these two are compared
        who = 'Photo-timed estimate and crop sample' if both else 'Sources'
        verb = 'agree' if agree == 'agree' else 'disagree' if agree == 'conflict' else 'differ'
        why_agree = (f'{who} agree on ripeness today ({listed})' if agree == 'agree'
                     else f'{who} {verb} by {gap:.0f} points on ripeness today ({listed})')

    fresh, s_days, p_days = freshness(inputs, room, today)
    lvl_fresh = rate_low_is_good(fresh, c['fresh_high_max'], c['fresh_medium_max'])
    parts = []
    if s_days is not None:
        parts.append(f'last crop sample {_ago(s_days)}')
    if p_days is not None:
        parts.append(f'last photo {_ago(p_days)}')
    why_fresh = (', '.join(parts) or 'no crop sample or photo yet')
    why_fresh = why_fresh[0].upper() + why_fresh[1:]

    graded = sorted([(lvl_range, why_range), (lvl_agree, why_agree), (lvl_fresh, why_fresh)],
                    key=lambda x: -RANK[x[0]])
    return dict(level=graded[0][0], day_range_days=width, agreement=agree, freshness_days=int(fresh),
                reasons=[why for _, why in graded],
                part_levels=dict(day_range=lvl_range, agreement=lvl_agree, freshness=lvl_fresh))  # D12: per-part levels for the app
