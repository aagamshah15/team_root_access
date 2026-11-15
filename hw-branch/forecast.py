"""Ripeness forecaster for the dwarf tomato rooms.

Idea
  % red fruit (by weight) follows an S-curve in accumulated warmth (degree-days, base 10 C):
      pct_red(G) = 100 / (1 + exp(-k * (G - G50)))
  G50 = degree-days at which half the fruit weight is red.
  Model A (warmth only): one G50 for every room.
  Model B (warmth + photos): each room's G50 = degree-days on the day red first shows in its
      noon photos + an offset learned from the other rooms. Photos tell us when ripening started;
      warmth tells us how fast it moves from there.
  Every forecast for a room is made with curves fitted on the other 5 rooms only (leave-one-room-out),
  so no room's own hand measurements are used to forecast it.

Usage: python3 forecast.py [TARGET_PCT]      (default 70)
Reads out/dash/{ripeness,daily,images}.csv; writes out/forecast/{evaluation,daily_forecast,windows}.csv
"""
import json, os, sys
import numpy as np
import pandas as pd
from scipy.optimize import least_squares

TARGET = float(sys.argv[1]) if len(sys.argv) > 1 else 70.0
RATE_DAYS = 7          # degree-day rate for the future = mean of the last 7 days
ONSET_MIN = 0.1        # % of photo that must be red, 3 days running, to call ripening started
DECIDE = '2024-11-06'  # decision day for the harvest-window table: every room's photos show red by then
OUT = 'out/forecast'


def curve(G, k, g50):
    return 100 / (1 + np.exp(-k * (np.asarray(G, float) - g50)))


def g_at(pct, k, g50):
    return g50 + np.log(pct / (100 - pct)) / k


def fit(r, per_room):
    """Shared slope k; one G50 overall (per_room=False) or one per room (True)."""
    rooms = sorted(r.team.unique())
    idx = r.team.map({t: i for i, t in enumerate(rooms)}).values
    def res(p):
        k, g = p[0], (p[1:][idx] if per_room else p[1])
        return curve(r.gdd_cum, k, g) - r.pct_red_weight
    p0 = [0.03] + [750.0] * (len(rooms) if per_room else 1)
    p = least_squares(res, p0, bounds=([0.001] + [300] * (len(p0) - 1), [0.5] + [1500] * (len(p0) - 1))).x
    return p[0], (dict(zip(rooms, p[1:])) if per_room else p[1])


def onset_dates(img):
    out = {}
    for t, g in img[img.date >= '2024-10-01'].sort_values('date').groupby('team'):
        v, d = g.red_index.values, g.date.values
        for i in range(2, len(v)):
            if (v[i - 2:i + 1] > ONSET_MIN).all():
                out[t] = d[i - 2]
                break
    return out


def models_without(test, r, gdd_on_onset):
    """Fit both models on every room except `test`."""
    tr = r[r.team != test]
    kA, gA = fit(tr, per_room=False)
    kB, g_room = fit(tr, per_room=True)
    sdA = np.std(list(g_room.values()), ddof=1)                      # how much G50 varies between rooms
    deltas = [g_room[t] - gdd_on_onset[t] for t in g_room if t in gdd_on_onset]
    return dict(kA=kA, gA=gA, sdA=sdA, kB=kB, delta=np.mean(deltas), sdB=np.std(deltas, ddof=1))


# ---------------- profit by harvest day ----------------
# Challenge scoring (Maree et al. 2025, Sensors 25:4321): a pot sells only if >= 1/3 of its fruit is red,
# red fruit above 150 g earns nothing extra, each plant costs EUR 0.75, each re-spacing EUR 1.50/m2,
# and growers are ranked on average net profit per m2 per day of cultivation.
PRICE = 2.15        # EUR per pot at >= 150 g red; backed out from the paper's published profits (EUR 1.97-2.31 across rooms)
PRICES = [1.75, 2.15, 2.50]
PLANT_COST, SPACING_COST, RED_CAP, MIN_RED = 0.75, 1.50, 150.0, 100 / 3
START = pd.Timestamp('2024-09-03')
HORIZON = 21        # candidate harvest days looked at after the decision day
PLANT_SD = 12.5     # plant-to-plant spread in % red within a room on 5 Nov (pooled sd of the hand weighings)
Z = __import__('scipy.stats', fromlist=['norm']).norm.ppf(np.linspace(0.0125, 0.9875, 40))  # plants as normal quantiles


def profit_tables(daily, d, r):
    d = d.copy()
    d['density'] = d.groupby('team').density.transform(lambda s: s.ffill().fillna(56))
    d['spacings'] = d.groupby('team').density.transform(lambda s: (s.diff().fillna(0) != 0).cumsum())
    d['cost_to_date'] = d.groupby('team').cost_eur_m2.cumsum() + SPACING_COST * d.spacings
    samples = r[r['sample'] == 'destructive']
    rows = []
    for x in daily[daily.date >= '2024-11-05'].itertuples():
        dt = d[(d.team == x.team) & (d.date <= x.date)]
        cost_rate = dt.cost_eur_m2.tail(RATE_DAYS).mean()
        dens = dt.density.iloc[-1]
        fw = samples[(samples.team == x.team) & (samples.date <= x.date)].sort_values('date').fw_total.iloc[-1]  # latest weighing
        for h in range(HORIZON + 1):
            H = pd.Timestamp(x.date) + pd.Timedelta(days=h)
            G = x.gdd_cum + x.gdd_per_day * h
            days = (H - START).days + 1
            cost = dt.cost_to_date.iloc[-1] + cost_rate * h
            row = dict(team=x.team, decided_on=x.date, harvest_on=H.strftime('%Y-%m-%d'), days_grown=days,
                       pct_red=curve(G, x.k, x.g50), red_g=curve(G, x.k, x.g50) / 100 * fw, cost_m2=cost, pots_m2=dens)
            for tag, g50 in [('', x.g50), ('_early', x.g50 - 1.96 * x.sd), ('_late', x.g50 + 1.96 * x.sd)]:
                # plants in a room ripen at different times: spread each plant's G50 so % red varies by PLANT_SD
                # points mid-ripening (the 5 Nov weighings); the S-curve narrows that spread near 0% and 100%
                sd_g = PLANT_SD / (100 * x.k / 4)
                pct_p = curve(G, x.k, g50 + sd_g * Z)
                sold = pct_p >= MIN_RED
                row['sellable_share' + tag] = sold.mean()
                for price in PRICES:
                    rev = (price * np.minimum(pct_p / 100 * fw, RED_CAP) / RED_CAP * sold).mean()
                    sfx = tag + ('' if price == PRICE else f'_p{price:.2f}'.replace('.', ''))
                    row['profit_m2_day' + sfx] = (dens * (rev - PLANT_COST) - cost) / days
            rows.append(row)
    p = pd.DataFrame(rows)
    pick = lambda g, col: g.loc[g[col].idxmax(), 'harvest_on']
    best = []
    for (t, dec), g in p.groupby(['team', 'decided_on']):
        fin = r[(r.team == t) & (r['sample'] == 'final')].iloc[0]
        b = g.loc[g.profit_m2_day.idxmax()]
        at_actual = g[g.harvest_on == fin.date]
        best.append(dict(team=t, decided_on=dec, best_day=b.harvest_on, best_pct_red=b.pct_red, best_red_g=b.red_g,
                         best_sellable_share=b.sellable_share,
                         best_profit_m2_day=b.profit_m2_day,
                         best_day_early=min(pick(g, 'profit_m2_day_early'), pick(g, 'profit_m2_day_late')),
                         best_day_late=max(pick(g, 'profit_m2_day_early'), pick(g, 'profit_m2_day_late')),
                         best_day_low_price=pick(g, 'profit_m2_day_p175'), best_day_high_price=pick(g, 'profit_m2_day_p250'),
                         actual_harvest=fin.date,
                         profit_at_actual=at_actual.profit_m2_day.iloc[0] if len(at_actual) else np.nan,
                         days_early_vs_actual=(pd.Timestamp(fin.date) - pd.Timestamp(b.harvest_on)).days))
    best = pd.DataFrame(best)
    best['gain_pct'] = 100 * (best.best_profit_m2_day / best.profit_at_actual - 1)
    return p, best


def main():
    os.makedirs(OUT, exist_ok=True)
    r = pd.read_csv('out/dash/ripeness.csv')
    d = pd.read_csv('out/dash/daily.csv').sort_values(['team', 'date'])
    img = pd.read_csv('out/dash/images.csv')
    onset = onset_dates(img)
    gdd = d.set_index(['team', 'date']).gdd_cum
    g_on = {t: gdd[(t, day)] for t, day in onset.items()}
    rooms = sorted(r.team.unique())
    M = {t: models_without(t, r, g_on) for t in rooms}

    # ---- evaluation 1: % red on measured days, as known that day (nowcast) ----
    ev = []
    for t in rooms:
        m = M[t]
        for row in r[r.team == t].itertuples():
            b_ok = t in onset and onset[t] <= row.date
            ev.append(dict(team=t, date=row.date, sample=row.sample, measured=row.pct_red_weight,
                           A=curve(row.gdd_cum, m['kA'], m['gA']),
                           B=curve(row.gdd_cum, m['kB'], g_on[t] + m['delta']) if b_ok else np.nan))
    ev = pd.DataFrame(ev)

    # ---- evaluation 2: forecast made on 5 Nov of % red on the room's harvest day ----
    fc = []
    for t in rooms:
        m, dt = M[t], d[d.team == t]
        known = dt[dt.date <= '2024-11-05']
        rate = known.gdd_cum.diff().tail(RATE_DAYS).mean()
        fin = r[(r.team == t) & (r['sample'] == 'final')].iloc[0]
        days = (pd.Timestamp(fin.date) - pd.Timestamp('2024-11-05')).days
        g_future = known.gdd_cum.iloc[-1] + rate * days
        fc.append(dict(team=t, harvest=fin.date, days_ahead=days, measured=fin.pct_red_weight,
                       gdd_forecast=g_future, gdd_actual=fin.gdd_cum,
                       A=curve(g_future, m['kA'], m['gA']), B=curve(g_future, m['kB'], g_on[t] + m['delta'])))
    fc = pd.DataFrame(fc)

    def mae(df, col, mask=None):
        x = df if mask is None else df[mask]
        x = x.dropna(subset=[col])
        return np.mean(np.abs(x[col] - x.measured)), len(x)
    ripe = ev.measured > 1
    summ = pd.DataFrame([
        dict(test='% red on measured days with red fruit (nowcast)', model='A warmth only', mae=mae(ev, 'A', ripe)[0], n=mae(ev, 'A', ripe)[1]),
        dict(test='% red on measured days with red fruit (nowcast)', model='B warmth + photos', mae=mae(ev, 'B', ripe)[0], n=mae(ev, 'B', ripe)[1]),
        dict(test='% red at harvest, forecast on 5 Nov', model='A warmth only', mae=mae(fc, 'A')[0], n=len(fc)),
        dict(test='% red at harvest, forecast on 5 Nov', model='B warmth + photos', mae=mae(fc, 'B')[0], n=len(fc)),
        dict(test='room-to-room spread in G50 (degree-days, 1 sd)', model='A warmth only', mae=np.mean([M[t]['sdA'] for t in rooms]), n=len(rooms)),
        dict(test='room-to-room spread in G50 (degree-days, 1 sd)', model='B warmth + photos', mae=np.mean([M[t]['sdB'] for t in rooms]), n=len(rooms)),
    ])

    # ---- daily forecasts and harvest window, each room with its own leave-out model ----
    rows, win = [], []
    for t in rooms:
        m, dt = M[t], d[d.team == t].reset_index(drop=True)
        fin = r[(r.team == t) & (r['sample'] == 'final')].iloc[0]
        for i, day in dt.iterrows():
            if day.date < '2024-10-15' or day.date >= fin.date:
                continue
            rate = dt.gdd_cum.iloc[max(0, i - RATE_DAYS):i + 1].diff().mean()
            use_b = t in onset and pd.Timestamp(onset[t]) + pd.Timedelta(days=2) <= pd.Timestamp(day.date)
            k, g50, sd = (m['kB'], g_on[t] + m['delta'], m['sdB']) if use_b else (m['kA'], m['gA'], m['sdA'])
            gt = g_at(TARGET, k, g50)
            # a date before `day` means the target was already passed
            when = lambda g: (pd.Timestamp(day.date) + pd.Timedelta(days=round(float((g - day.gdd_cum) / rate)))).strftime('%Y-%m-%d')
            rows.append(dict(team=t, date=day.date, model='B' if use_b else 'A', k=k, g50=g50, sd=sd,
                             gdd_cum=day.gdd_cum, gdd_per_day=rate,
                             pct_red_now=curve(day.gdd_cum, k, g50), pct_red_low=curve(day.gdd_cum, k, g50 + 1.96 * sd),
                             pct_red_high=curve(day.gdd_cum, k, g50 - 1.96 * sd),
                             target_date=when(gt), target_early=when(gt - 1.96 * sd), target_late=when(gt + 1.96 * sd)))
        mine = [x for x in rows if x['team'] == t]
        early = next(x for x in mine if x['date'] == DECIDE)   # forecast made on the decision day
        late = mine[-1]                                       # best estimate, the day before the real harvest
        win.append(dict(team=t, decided_on=DECIDE, model=early['model'], target_pct=TARGET,
                        forecast_date=early['target_date'], window_start=early['target_early'], window_end=early['target_late'],
                        best_estimate_date=late['target_date'], actual_harvest=fin.date,
                        measured_pct_at_harvest=fin.pct_red_weight,
                        days_late_vs_forecast=(pd.Timestamp(fin.date) - pd.Timestamp(early['target_date'])).days,
                        photo_onset=onset.get(t)))
    daily = pd.DataFrame(rows)
    windows = pd.DataFrame(win)
    profit, best = profit_tables(daily, d, r)

    # self-checks: curve is monotone and inverts; probabilities stay in range; every room forecast
    assert abs(curve(g_at(TARGET, 0.03, 750), 0.03, 750) - TARGET) < 1e-6
    assert daily[['pct_red_now', 'pct_red_low', 'pct_red_high']].stack().between(0, 100).all()
    assert (daily.pct_red_low <= daily.pct_red_now + 1e-9).all() and (daily.pct_red_now <= daily.pct_red_high + 1e-9).all()
    assert set(daily.team) == set(rooms)
    assert (profit.groupby(['team', 'decided_on']).size() == HORIZON + 1).all()
    assert (profit.loc[profit.pct_red < MIN_RED, 'profit_m2_day'] < profit.profit_m2_day.max()).all()  # unsellable pots never best
    profit.round(4).to_csv(f'{OUT}/profit_by_day.csv', index=False)
    best.to_csv(f'{OUT}/best_harvest.csv', index=False)

    summ.round(2).to_csv(f'{OUT}/evaluation.csv', index=False)
    ev.round(2).to_csv(f'{OUT}/eval_nowcast.csv', index=False)
    fc.round(2).to_csv(f'{OUT}/eval_forecast_5nov.csv', index=False)
    daily.round(3).to_csv(f'{OUT}/daily_forecast.csv', index=False)
    windows.to_csv(f'{OUT}/windows.csv', index=False)
    # JSON copies for the dashboard, carrying this script so readers can check and rerun it
    meta = [{'label': 'forecast.py', 'value': open(__file__).read(), 'type': 'code', 'lang': 'python'},
            {'label': 'Input', 'value': 'ripeness.csv, daily.csv, images.csv (this dashboard)'},
            {'label': 'Target', 'value': f'{TARGET:.0f}% red by weight'}]
    def dump(df, name):
        recs = json.loads(df.to_json(orient='records'))  # NaN -> null
        json.dump({'rows': recs, 'meta': meta}, open(f'{OUT}/{name}.json', 'w'))
    dump(daily.round({'pct_red_now': 1, 'pct_red_low': 1, 'pct_red_high': 1, 'gdd_cum': 1, 'gdd_per_day': 2}), 'daily_forecast')
    dump(windows.round(1), 'windows')
    dump(summ.round(1), 'evaluation')
    meta.append({'label': 'Price', 'value': f'EUR {PRICE:.2f} per pot at >= 150 g red fruit (backed out from the published profits); also tested at EUR 1.75 and 2.50'})
    pr = profit[['team', 'decided_on', 'harvest_on', 'pct_red', 'red_g', 'sellable_share', 'cost_m2', 'profit_m2_day',
                 'profit_m2_day_early', 'profit_m2_day_late']].copy()
    pr[['pct_red', 'red_g']] = pr[['pct_red', 'red_g']].round(1)
    pr[['sellable_share']] = pr[['sellable_share']].round(2)
    pr[['cost_m2', 'profit_m2_day', 'profit_m2_day_early', 'profit_m2_day_late']] = pr[['cost_m2', 'profit_m2_day', 'profit_m2_day_early', 'profit_m2_day_late']].round(3)
    dump(pr, 'profit_by_day')
    bb = best.copy()
    bb[['best_pct_red', 'best_red_g', 'gain_pct']] = bb[['best_pct_red', 'best_red_g', 'gain_pct']].round(1)
    bb[['best_profit_m2_day', 'profit_at_actual']] = bb[['best_profit_m2_day', 'profit_at_actual']].round(3)
    bb['best_sellable_share'] = bb.best_sellable_share.round(2)
    dump(bb, 'best_harvest')
    pd.set_option('display.width', 220)
    print('onset (first red in photos):', onset)
    print('\nleave-one-room-out models:'); print(pd.DataFrame(M).T.round(4))
    print('\nEVALUATION'); print(summ.round(2).to_string(index=False))
    print('\nnowcast detail'); print(ev[ev.measured > 1].round(1).to_string(index=False))
    print('\nforecast on 5 Nov for harvest day'); print(fc.round(1).to_string(index=False))
    print(f'\nHARVEST WINDOW for {TARGET:.0f}% red (forecast made on {DECIDE})'); print(windows.to_string(index=False))


if __name__ == '__main__':
    main()
