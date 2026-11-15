"""Build the small CSVs behind the ripening dashboard from prep.py / image_features.py outputs.

Usage: python3 dashboard_data.py path/to/autonomous_greenhouse_challenge4_timeseries.zip
Reads out/daily.csv, out/ripeness.csv, out/ripeness_plants.csv, out/image_features.csv, out/thumbs/
Writes out/dash/{daily,weather,ripeness,plants,images}.csv
"""
import io, os, sys, zipfile
import numpy as np
import pandas as pd
from PIL import Image

OUT = 'out/dash'
ROOT = 'autonomous_greenhouse_challenge4_timeseries/timeseries/'
TEAMS = ['tomatonuts', 'mugrow', 'agrifusion', 'reference', 'ideas', 'trigger']


def red_index(path):
    """% of the image that is ripe-red fruit, after white-balancing out the grow-lamp tint."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    ref = np.percentile(a.reshape(-1, 3), 99, axis=0)          # white patch: brightest 1% per channel
    a = np.clip(a * 255 / np.maximum(ref, 1), 0, 255).astype('uint8')
    h, s, v = np.moveaxis(np.asarray(Image.fromarray(a).convert('HSV')), -1, 0).astype(int)
    vivid = (s > 140) & (v > 80)                                 # s>140 drops pink lamp-lit leaves
    return 100 * (vivid & ((h < 17) | (h > 234))).mean(), 100 * (vivid & (h >= 17) & (h < 30)).mean()


def noon_lamps(z):
    rows = []
    for t in TEAMS:
        d = pd.read_csv(io.BytesIO(z.read(f'{ROOT}{t}.csv')), usecols=['time', 'compartment/lamps_activation_percentage'])
        d['time'] = pd.to_datetime(d.time, utc=True).dt.tz_convert('Europe/Amsterdam')
        n = d[(d.time.dt.hour == 12) & (d.time.dt.minute <= 5)]
        g = n.groupby(n.time.dt.strftime('%Y-%m-%d'))['compartment/lamps_activation_percentage'].max()
        rows.append(pd.DataFrame({'team': t, 'date': g.index, 'lamps_on_noon': (g.fillna(0) > 0).values}))
    return pd.concat(rows)


def main(zpath):
    os.makedirs(OUT, exist_ok=True)
    z = zipfile.ZipFile(zpath)
    rip = pd.read_csv('out/ripeness.csv')
    harvest = rip[rip['sample'] == 'final'].set_index('team').date

    d = pd.read_csv('out/daily.csv')
    d['lamp_hours'] = d.lamps_on_frac * 24
    d = d.rename(columns={'day': 'date'})
    d = d[d.n_records >= 280]  # drop the half-logged harvest day
    d[['team', 'date', 'dap', 'T_mean', 'T_min', 'T_max', 'RH_mean', 'CO2_mean', 'DLI', 'lamp_hours', 'density',
       'gdd_cum', 'heating_MJ', 'lighting_kWh', 'cost_eur_m2']].round(3).to_csv(f'{OUT}/daily.csv', index=False)

    w = pd.read_csv(io.BytesIO(z.read(ROOT + 'weather.csv')))
    w['time'] = pd.to_datetime(w.time, utc=True).dt.tz_convert('Europe/Amsterdam')
    wd = w.groupby(w.time.dt.strftime('%Y-%m-%d')).agg(
        T_out=('weather/air_temperature.outside', 'mean'),
        sun_MJ_m2=('weather/radiation_global', lambda s: s.sum() * 300 / 1e6)).reset_index(names='date')
    wd[wd.date <= '2024-11-21'].round(2).to_csv(f'{OUT}/weather.csv', index=False)

    rip.drop(columns=['gh']).round(2).to_csv(f'{OUT}/ripeness.csv', index=False)

    p = pd.read_csv('out/ripeness_plants.csv')
    p[['team', 'sample', 'date', 'plant', 'fw_total', 'fw_red', 'pct_red_weight']].round(2).to_csv(f'{OUT}/plants.csv', index=False)

    f = pd.read_csv('out/image_features.csv')
    idx = [red_index(f'out/thumbs/{r.team}_{r.date}_12.jpg') if os.path.exists(f'out/thumbs/{r.team}_{r.date}_12.jpg')
           else (np.nan, np.nan) for r in f.itertuples()]
    f['red_index'], f['orange_index'] = zip(*idx)
    f = f.merge(noon_lamps(z), on=['team', 'date'], how='left')
    f['before_harvest'] = f.date < f.team.map(harvest)  # harvest-day photo already shows an empty table
    f = f.rename(columns={'depth_p50_mm': 'canopy_distance_mm'})
    f = f[f.before_harvest][['team', 'date', 'red_index', 'orange_index', 'green_pct', 'canopy_distance_mm', 'lamps_on_noon']]
    assert f.red_index.notna().all() and f.groupby(['team', 'date']).size().max() == 1
    f.round(3).sort_values(['team', 'date']).to_csv(f'{OUT}/images.csv', index=False)
    print({n: len(pd.read_csv(f'{OUT}/{n}.csv')) for n in ['daily', 'weather', 'ripeness', 'plants', 'images']})


if __name__ == '__main__':
    main(sys.argv[1])
