"""Write contract-shaped MOCK files to app/mock/ so the web app can be built before real data exists.

Owner: L04. Run: python app/mock/make_mock.py   (reads $HARVEST_INPUTS or <repo>/out)

What and why: the app needs every file in contracts/app-data.md. These numbers are NOT the
pipeline's model. They use the real daily degree-days, photos and hand measurements from `out/dash/`
with a crude ripening curve, so the shapes and ranges look like the real thing. Every file carries
"mock": true and publish.py refuses them. Do not quote any number from these files.
"""
from __future__ import annotations

import json
import math
import os
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import yaml

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
INPUTS = Path(os.environ.get('HARVEST_INPUTS') or REPO / 'out')
PLANTED = date(2024, 9, 3)
FIRST_TODAY = date(2024, 10, 20)
K = 0.03            # mock ripening steepness (per degree-day)
BASE_T = 10.0
SPREAD = 12.5       # plant-to-plant sd in % red
PRICE, PRICE_LO, PRICE_HI = 2.15, 1.75, 2.50
DELTAS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]
HEAT_PER_C = 0.045  # mock extra heating € per m² per day per °C


def d(s) -> date:
    return pd.to_datetime(s).date()


def iso(x: date | None) -> str | None:
    return x.isoformat() if x else None


def phi(z: float) -> float:
    """Standard normal CDF."""
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def logistic(g: float, g50: float) -> float:
    return 100 / (1 + math.exp(-K * (g - g50)))


def load():
    dash = INPUTS / 'dash'
    daily = pd.read_csv(dash / 'daily.csv').rename(columns={'team': 'room'})
    rip = pd.read_csv(dash / 'ripeness.csv').rename(columns={'team': 'room'})
    img = pd.read_csv(dash / 'images.csv').rename(columns={'team': 'room'})
    for df in (daily, rip, img):
        df['date'] = pd.to_datetime(df['date']).dt.date
    daily['density'] = daily.groupby('room')['density'].transform(lambda s: s.ffill().fillna(56.0))
    return daily, rip, img


def room_model(daily, rip, room):
    """Per-room mock inputs: degree-day series, true G50 from the 5 Nov sample, harvest date."""
    dr = daily[daily.room == room].set_index('date')
    rr = rip[rip.room == room]
    s = rr[rr.date == date(2024, 11, 5)].iloc[0]
    p = min(max(s.pct_red_weight, 1.0), 99.0)
    g50 = s.gdd_cum + math.log(100 / p - 1) / K
    harvest = rr[rr['sample'] == 'final'].date.iloc[0]
    return dr, g50, harvest, rr


def gdd_path(dr, today, horizon, delta=0.0):
    """Cumulative degree-days for today..today+horizon: observed to today, then last-7-day mean (+delta)."""
    known = dr.loc[:today]
    g = known.gdd_cum.iloc[-1]
    rate = max(known.T_mean.iloc[-7:].mean() + delta - BASE_T, 0.0)
    return [g + rate * i for i in range(horizon + 1)], rate


def g50_estimate(g50, room, today):
    """Mock estimate: biased before the 5 Nov sample is known, close after it."""
    bias = 25 * math.sin(sum(map(ord, room)))
    if today >= date(2024, 11, 5):
        return g50 + bias * 0.15, 18.0
    return g50 + bias, 38.0


def curve(dr, rr, g50e, sd, today, delta=0.0, horizon=21):
    """Forecast rows (mock): % red with band, sellable share, profit per m² per day with band."""
    gs, _ = gdd_path(dr, today, horizon, delta)
    known = dr.loc[:today]
    density = known.density.iloc[-1]
    spent = known.cost_eur_m2.sum() + 0.75 * density + 1.5 * (known.density.diff().fillna(0) != 0).sum()
    daily_cost = known.cost_eur_m2.iloc[-7:].mean() + HEAT_PER_C * max(delta, 0) - 0.6 * HEAT_PER_C * max(-delta, 0)
    fw = rr.fw_total.max()
    rows = []
    for i, g in enumerate(gs):
        day = today + timedelta(days=i)
        grown = (day - PLANTED).days
        cost = spent + daily_cost * i

        def prof(g50x, price):
            pct = logistic(g, g50x)
            share = phi((pct - 33.33) / SPREAD)
            red = min(fw * pct / 100, 150.0)
            return (density * share * price * red / 150 - cost) / grown, pct, share
        p, pct, share = prof(g50e, PRICE)
        plo, _, _ = prof(g50e + sd, PRICE_LO)
        phi_, _, _ = prof(g50e - sd, PRICE_HI)
        rows.append(dict(date=iso(day), pct_red=round(pct, 1),
                         pct_red_low=round(logistic(g, g50e + sd), 1), pct_red_high=round(logistic(g, g50e - sd), 1),
                         sellable_share=round(share, 3), profit_m2_day=round(p, 3),
                         profit_low=round(min(plo, p), 3), profit_high=round(max(phi_, p), 3),
                         cost_to_date_m2=round(cost, 3)))
    return rows


def best_of(rows, key='profit_m2_day'):
    i = max(range(len(rows)), key=lambda j: rows[j][key])
    return d(rows[i]['date']), rows[i][key]


def window(rows):
    earliest = next((d(r['date']) for r in rows if r['sellable_share'] >= 0.95), None)
    best, pbest = best_of(rows)
    bi = [r['date'] for r in rows].index(iso(best))
    losses = None
    for j in range(bi + 1, len(rows)):
        tot = lambda r: r['profit_m2_day'] * (d(r['date']) - PLANTED).days  # noqa: E731
        if tot(rows[j]) < tot(rows[j - 1]):
            losses = d(rows[j]['date'])
            break
    return earliest, best, losses, pbest


def main():
    daily, rip, img = load()
    cfg = yaml.safe_load(open(REPO / 'config' / 'customers.yaml'))
    built = datetime.now(timezone.utc).isoformat(timespec='seconds')
    src = 'MOCK built by app/mock/make_mock.py from out/dash (not the pipeline model)'
    customers, rooms = [], []
    days, fc, wi, ev, al, per_room = [], [], [], [], [], []
    last_today = FIRST_TODAY
    (HERE / 'photos').mkdir(exist_ok=True)

    for c in cfg['customers']:
        customers.append(dict(customer_id=c['customer_id'], name=c['name'], tagline=c['tagline'],
                              rooms=[r['room'] for r in c['rooms']]))
        for r in c['rooms']:
            room = r['room']
            dr, g50, harvest, rr = room_model(daily, rip, room)
            rooms.append(dict(room=room, display_name=r['display_name'], customer_id=c['customer_id'],
                              area_m2=r['area_m2'], planted=iso(PLANTED), actual_harvest=iso(harvest)))
            im = img[img.room == room].set_index('date')
            usable = im[(im.lamps_on_noon == False) & im.red_index.notna()]  # noqa: E712
            samples = rr[rr['sample'] == 'destructive']
            today = FIRST_TODAY
            while today < harvest:
                last_today = max(last_today, today)
                g50e, sd = g50_estimate(g50, room, today)
                rows = curve(dr, rr, g50e, sd, today)
                lo_rows = curve(dr, rr, g50e + sd * 0.6, sd, today)
                hi_rows = curve(dr, rr, g50e - sd * 0.6, sd, today)
                earliest, best, losses, pbest = window(rows)
                b1, b2 = sorted([best_of(lo_rows)[0], best_of(hi_rows)[0], best])[::2]
                for x in rows:
                    fc.append(dict(room=room, today=iso(today), **x))
                # confidence parts
                known_s = samples[samples.date <= today]
                last_s = known_s.date.max() if len(known_s) else None
                last_p = usable[usable.index <= today].index.max()
                fresh = max((today - last_s).days if last_s else 99, (today - last_p).days)
                fresh = min(fresh, 30)
                rng = (b2 - b1).days
                agree = 'agree' if today >= date(2024, 11, 5) else ('mixed' if today >= date(2024, 10, 28) else 'agree')
                if room == 'trigger' and date(2024, 11, 1) <= today < date(2024, 11, 5):
                    agree = 'conflict'
                lv = lambda v, a, b: 0 if v <= a else (1 if v <= b else 2)  # noqa: E731
                level = max(lv(rng, 4, 8), lv(fresh, 3, 7), {'agree': 0, 'mixed': 1, 'conflict': 2}[agree])
                conf = ['high', 'medium', 'low'][level]
                reasons = []
                reasons.append(f'Best day likely within a {rng}-day range' + (' (narrow).' if rng <= 4 else '.'))
                reasons.append({'agree': 'Warmth model, photo and crop sample tell the same story.',
                                'mixed': 'Photo shows a little more red than the warmth model expects.',
                                'conflict': 'Photo and warmth model disagree on how ripe the room is.'}[agree])
                if last_s:
                    n_ago = (today - last_s).days
                    reasons.append(f'Last crop sample {n_ago} day{"" if n_ago == 1 else "s"} ago.')
                pct_now = rows[0]['pct_red']
                share_now = rows[0]['sellable_share']
                if conf == 'low' or agree == 'conflict':
                    status = 'check_crop'
                elif b1 <= today <= b2 and share_now >= 0.9:
                    status = 'harvest_now'
                elif best <= today + timedelta(days=7):
                    status = 'plan_harvest'
                else:
                    status = 'keep_growing'
                model = 'warmth' if today < date(2024, 10, 28) else ('warmth+camera' if last_s is None or known_s.pct_red_weight.max() == 0 and today < date(2024, 11, 5) else 'warmth+camera+sample')
                days.append(dict(room=room, today=iso(today), status=status, pct_red_now=pct_now,
                                 pct_red_low=rows[0]['pct_red_low'], pct_red_high=rows[0]['pct_red_high'],
                                 sellable_share_now=share_now, model=model,
                                 earliest_sellable_day=iso(earliest), best_day=iso(best), losses_start_day=iso(losses),
                                 best_day_low=iso(b1), best_day_high=iso(b2), profit_best_m2_day=pbest,
                                 profit_today_m2_day=rows[0]['profit_m2_day'], confidence=conf,
                                 conf_day_range_days=rng, conf_agreement=agree, conf_freshness_days=fresh,
                                 conf_reasons=reasons[:3]))
                for dc in DELTAS:
                    wr = curve(dr, rr, g50e, sd, today, delta=dc)
                    _, wb, _, wp = window(wr)
                    wi.append(dict(room=room, today=iso(today), delta_c=dc, best_day=iso(wb),
                                   days_change=(wb - best).days, profit_best_m2_day=wp,
                                   profit_change_m2_day=round(wp - pbest, 3),
                                   extra_energy_cost_m2_day=round(HEAT_PER_C * dc if dc > 0 else 0.6 * HEAT_PER_C * dc, 3),
                                   note='Model estimate, not tested in the greenhouse.'))
                today += timedelta(days=1)
            # evidence: planting to day before harvest
            day = PLANTED
            while day < harvest:
                row = im.loc[day] if day in im.index else None
                ks = rr[(rr.date <= day) & (rr['sample'] == 'destructive')]
                ls = ks.iloc[-1] if len(ks) else None
                photo = None
                if day == date(2024, 11, 6):
                    thumb = INPUTS / 'thumbs' / f'{room}_{day.isoformat()}_12.jpg'
                    if not thumb.exists():
                        thumb = REPO.parent.parent.parent / 'out' / 'thumbs' / thumb.name
                    if thumb.exists():
                        shutil.copy(thumb, HERE / 'photos' / thumb.name)
                        photo = f'photos/{thumb.name}'
                lamps = None if row is None or pd.isna(row.lamps_on_noon) else bool(row.lamps_on_noon)
                num = lambda v, n=3: None if v is None or pd.isna(v) else round(float(v), n)  # noqa: E731
                ev.append(dict(room=room, date=iso(day), photo=photo,
                               photo_usable=bool(row is not None and lamps is False and not pd.isna(row.red_index)),
                               lamps_on=lamps, red_index=num(row.red_index if row is not None else None),
                               green_pct=num(row.green_pct if row is not None else None, 1),
                               canopy_distance_mm=num(row.canopy_distance_mm if row is not None else None, 0),
                               gdd_cum=num(dr.gdd_cum.get(day), 1),
                               last_sample_date=iso(ls.date) if ls is not None else None,
                               last_sample_pct_red=num(ls.pct_red_weight, 1) if ls is not None else None,
                               last_sample_fw_g=num(ls.fw_total, 1) if ls is not None else None))
                day += timedelta(days=1)
            mock_pred = harvest + timedelta(days=int(round(2 * math.sin(len(room)))))
            per_room.append(dict(room=room, method='our model', predicted=iso(mock_pred), actual=iso(harvest),
                                 error=(mock_pred - harvest).days))
            per_room.append(dict(room=room, method='days after planting (baseline)', predicted='2024-11-17',
                                 actual=iso(harvest), error=(date(2024, 11, 17) - harvest).days))

    # alerts (a handful, mock)
    al = [
        dict(room='trigger', date='2024-11-02', kind='behind_schedule', severity='warning',
             title='Ripening behind schedule',
             message='The photo shows less red fruit than the forecast band expects for this date.',
             numbers={'camera_pct_red_est': 4.0, 'forecast_low': 12.0, 'forecast_high': 26.0}),
        dict(room='trigger', date='2024-10-29', kind='room_drift', severity='info',
             title='Room running cooler than the others',
             message='Warmth gained per day over the last week is well below the other rooms.',
             numbers={'gdd_per_day': 6.9, 'others_median': 8.6, 'share_below': 0.2}),
        dict(room='mugrow', date='2024-11-03', kind='ahead_of_schedule', severity='info',
             title='Ripening ahead of schedule',
             message='The photo shows more red fruit than the forecast band expects.',
             numbers={'camera_pct_red_est': 48.0, 'forecast_low': 25.0, 'forecast_high': 40.0}),
        dict(room='agrifusion', date='2024-10-24', kind='sensor_check', severity='warning',
             title='Temperature sensor looks flat',
             message='Air temperature barely changed for 3 days; please check the sensor.',
             numbers={'days_flat': 3, 'range_c': 0.1}),
        dict(room='reference', date='2024-11-04', kind='sensor_check', severity='info',
             title='Noon photo missing',
             message='No usable noon photo today (lamps on). Using the last usable one.',
             numbers={'days_since_usable_photo': 1}),
    ]
    backtest = [
        dict(test='timing', method='our model', value=2.0, unit='days off (average)', n=6,
             note='Forecast made on 6 Nov of the day each room reaches its harvest ripeness.'),
        dict(test='timing', method='days after planting (baseline)', value=3.3, unit='days off (average)', n=6,
             note='Same number of days after planting as the other rooms\' average harvest.'),
        dict(test='ripeness', method='our model', value=7.5, unit='points of % red (average)', n=6,
             note='Estimated % red on harvest day vs measured.'),
        dict(test='ripeness', method='average of other rooms (baseline)', value=6.1, unit='points of % red (average)',
             n=6, note='Baseline wins here: the average final ripeness of the other rooms.'),
    ]
    crop = yaml.safe_load(open(REPO / 'tests' / 'fixtures' / 'crop.yaml'))
    ec = crop['economics']
    assumptions = [
        dict(name='Base temperature for degree-days', value=crop['base_temp_c'], unit='°C',
             source='Common tomato value (mock source)', if_wrong='Ripening dates shift a little; ranking of rooms holds.'),
        dict(name='Pot sells if this share of fruit is red', value=round(ec['sellable_red_share'] * 100, 1), unit='%',
             source='Challenge scoring rules (assumed, to be verified)', if_wrong='Earliest sellable day moves.'),
        dict(name='Price per pot at full value', value=ec['price_eur_per_pot'], unit='€',
             source='Backed out from published profits (assumed)', if_wrong='Profit level changes; best day moves little.'),
        dict(name='Red fruit cap per pot', value=ec['red_cap_g'], unit='g',
             source='Challenge scoring rules (assumed)', if_wrong='Late harvests look better or worse.'),
        dict(name='Plant-to-plant spread', value=crop['ripeness']['plant_spread_sd'], unit='points of % red',
             source='5 Nov hand weighings', if_wrong='Share of pots ready changes faster or slower.'),
    ]
    as_of = {'from': iso(FIRST_TODAY), 'to': iso(last_today)}

    def write(name, rows, **extra):
        meta = dict(source=src, built_at=built, as_of=as_of, mock=True, **extra)
        (HERE / f'{name}.json').write_text(json.dumps({'meta': meta, 'rows': rows}, separators=(',', ':')))

    write('customers', customers)
    write('rooms', rooms)
    write('days', days)
    write('forecast', fc)
    write('whatif', wi, heating_fit={'eur_m2_day_per_c': HEAT_PER_C, 'r2': 0.62, 'n': 6})
    write('evidence', ev)
    write('alerts', al)
    write('backtest', backtest, per_room=per_room)
    write('assumptions', assumptions)
    print('mock written:', {p.name: p.stat().st_size for p in HERE.glob('*.json')})


if __name__ == '__main__':
    main()
