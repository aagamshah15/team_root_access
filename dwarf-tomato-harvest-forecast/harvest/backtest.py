"""Timing test: how good is the harvest timing, compared with simple rules of thumb (SPEC §4, lane L01).

Decision day: 5 Nov 2024 (the last crop sample before any room was harvested). For each room:

  Test 1, harvest date (days off). Target = the % red the room actually had at harvest.
    * Our forecast: date the room's curve (fitted without its own measurements after 5 Nov, and
      without anything dated after 5 Nov) reaches that % red at the last-7-day warmth rate.
    * Warmth only: same, with the shared warmth curve (no camera, no crop sample).
    * Baseline "days after planting": the other rooms' average days from planting to harvest.
      Note: this baseline sees the other rooms' real harvest dates, which come after 5 Nov; a grower
      would only know that from past crops. It is a generous baseline.
  Test 2, % red at harvest (points off), forecast on 5 Nov for the actual harvest day.
    * Our forecast and warmth only, as above (degree-days on harvest day projected at the 7-day rate).
    * Baseline "other rooms' average": mean final % red of the other rooms.

Run: python -m harvest.backtest     (prints the summary and per-room tables)
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from harvest.common import ROOMS, planted, Inputs, actual_harvest, load_inputs
from harvest.forecast import curve, date_reaching, fit_params

DECISION_DAY = date(2024, 11, 5)
OURS, WARMTH, BASE_DAYS, BASE_PCT = 'Our forecast', 'Warmth only', 'Baseline: days after planting', \
    "Baseline: other rooms' average"


def final_pct(inputs: Inputs, room: str) -> float:
    """% red by weight measured on the room's harvest day."""
    r = inputs.ripeness
    return float(r[(r.room == room) & (r['sample'] == 'final')].pct_red_weight.iloc[0])


def per_room_rows(inputs: Inputs, settings: dict | None = None, decision_day: date = DECISION_DAY) -> list[dict]:
    """One row per room x method: {room, test, method, predicted, actual, error}.

    Error = predicted - actual: days (positive = forecast later than the real harvest) or % red points.
    """
    rows = []
    rooms = [r for r in ROOMS if r in set(inputs.ripeness.room)]
    harvest = {r: actual_harvest(inputs, r) for r in rooms}
    finals = {r: final_pct(inputs, r) for r in rooms}
    for room in rooms:
        p = fit_params(inputs, room, decision_day, settings)
        warm = dict(p, g50=p['g50_warmth'])
        target, h = finals[room], harvest[room]
        others = [r for r in rooms if r != room]
        for method, pp in [(OURS, p), (WARMTH, warm)]:
            d = date_reaching(pp, target, decision_day)
            rows.append(dict(room=room, test='harvest_date', method=method, predicted=d.isoformat(),
                             actual=h.isoformat(), error=(d - h).days))
            g_h = pp['gdd_today'] + pp['gdd_rate'] * (h - decision_day).days
            pct = float(curve(g_h, pp['k'], pp['g50']))
            rows.append(dict(room=room, test='pct_red_at_harvest', method=method, predicted=round(pct, 1),
                             actual=target, error=round(pct - target, 1)))
        mean_days = np.mean([(harvest[r] - planted(r)).days for r in others])   # D17: each room's own planting date
        d = planted(room) + timedelta(days=int(round(mean_days)))
        rows.append(dict(room=room, test='harvest_date', method=BASE_DAYS, predicted=d.isoformat(),
                         actual=h.isoformat(), error=(d - h).days))
        base = float(np.mean([finals[r] for r in others]))
        rows.append(dict(room=room, test='pct_red_at_harvest', method=BASE_PCT, predicted=round(base, 1),
                         actual=target, error=round(base - target, 1)))
    return rows


def summarise(per_room: list[dict]) -> pd.DataFrame:
    """Average size of the error per test x method (mean absolute error), with a plain-English note.

    Hand check: errors [-2, 1, 3] -> (2 + 1 + 3) / 3 = 2.0.
    """
    df = pd.DataFrame(per_room)
    labels = {'harvest_date': ('When the room reaches the ripeness it was picked at, forecast on 5 Nov: average days off', 'days'),
              'pct_red_at_harvest': ('% red at harvest, forecast on 5 Nov: average points off', '% red points')}
    out = []
    for test, g in df.groupby('test', sort=False):
        mae = g.assign(a=g.error.abs()).groupby('method', sort=False).a.mean()
        best = mae.idxmin()
        for method, v in mae.items():
            bias = g[g.method == method].error.mean()
            if method == best:
                note = 'Best on this test. '
            elif v - mae[best] < 0.05:
                note = f'Same as {best}. '
            else:
                note = f'{v - mae[best]:.1f} {labels[test][1]} worse than {best}. '
            note += f'On average {abs(bias):.1f} {labels[test][1]} {"late" if bias > 0 else "early"}' \
                if test == 'harvest_date' else f'On average {abs(bias):.1f} points {"high" if bias > 0 else "low"}'
            if method == BASE_DAYS:
                note += "; uses the other rooms' real harvest dates (after 5 Nov), so it is generous"
            out.append(dict(test=labels[test][0], method=method, value=round(float(v), 1), unit=labels[test][1],
                            n=int((g.method == method).sum()), note=note + '.'))
    return pd.DataFrame(out)


def timing_test(inputs: Inputs, settings: dict | None = None) -> tuple[pd.DataFrame, list[dict]]:
    """(summary rows for backtest.json, per-room rows for its meta.per_room) per contract §2."""
    per = per_room_rows(inputs, settings)
    return summarise(per), per


def main():
    """Print the timing table on the inputs in $HARVEST_INPUTS (default: out/)."""
    summary, per = timing_test(load_inputs())
    pd.set_option('display.width', 200)
    pd.set_option('display.max_colwidth', 120)
    print('TIMING TEST (decision day 2024-11-05, leave-one-room-out, data up to that day only)\n')
    print(summary.to_string(index=False))
    print('\nPer room')
    print(pd.DataFrame(per).to_string(index=False))


if __name__ == '__main__':
    main()
