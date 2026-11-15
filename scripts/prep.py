"""Clean the 4th Autonomous Greenhouse Challenge time-series zip into two tables.

Usage: python3 prep.py path/to/autonomous_greenhouse_challenge4_timeseries.zip
Writes to ./out/:
  ripeness_plants.csv  one row per harvested plant (destructive samples + final harvest)
  ripeness.csv         one row per compartment x sampling date (means + % red)
  daily.csv            one row per compartment x day (climate, light, energy, degree-days)
"""
import io, sys, zipfile
from pathlib import Path
import numpy as np
import pandas as pd

TEAM = {'301': 'tomatonuts', '302': 'mugrow', '303': 'agrifusion',
        '306': 'reference', '307': 'ideas', '308': 'trigger'}
START = pd.Timestamp('2024-09-03', tz='Europe/Amsterdam')  # first log day
T_BASE = 10.0  # shortcut: textbook tomato base temp for degree-days; tune with domain lead
ROOT = 'autonomous_greenhouse_challenge4_timeseries/'

# harvest-sheet column names vary per sheet -> one vocabulary
COLS = {'fw': 'fw_total', 'fw tot': 'fw_total', '# tom': 'n_total', '# tot': 'n_total', '#tot': 'n_total',
        '# tom green': 'n_green', 'fw green': 'fw_green',
        '#tom coloured': 'n_coloured', 'fw tom coloured': 'fw_coloured', 'fw coloured': 'fw_coloured',
        '#tom red': 'n_red', 'fw tom red': 'fw_red', 'fw red': 'fw_red', '# <6': 'n_small', '<6gr': 'n_small'}


def harvest(z):
    x = pd.ExcelFile(io.BytesIO(z.read(ROOT + 'Harvest.xlsx')))
    out = []
    for s in x.sheet_names:
        if s == 'Information':
            continue
        d = x.parse(s)
        d.columns = [str(c).strip().lower() for c in d.columns]
        d = d[d['plant'].astype(str).str.match(r'^\d{3}-\d+$')]  # drop average / blank rows
        d = d.rename(columns=COLS)[[c for c in set(COLS.values()) if c in d.rename(columns=COLS)]].assign(plant=d['plant'].astype(str))
        d['gh'] = d.plant.str[:3]
        d['sample'] = 'final' if s.startswith('Final') else 'destructive'
        d['date'] = None if s.startswith('Final') else pd.to_datetime(s.split()[-1], format='%d-%m-%y').date()
        out.append(d)
    p = pd.concat(out, ignore_index=True)
    p['team'] = p.gh.map(TEAM)
    num = [c for c in p.columns if c.startswith(('n_', 'fw_'))]
    p[num] = p[num].apply(pd.to_numeric, errors='coerce')
    first = p['date'].astype(str) == '2024-10-07'  # first sample: no colour split, all fruit still green
    p.loc[first, ['n_green', 'fw_green']] = p.loc[first, ['n_total', 'fw_total']].values
    p.loc[first, ['n_red', 'fw_red', 'n_coloured', 'fw_coloured']] = 0
    p[['n_coloured', 'fw_coloured']] = p[['n_coloured', 'fw_coloured']].fillna(0)
    dest = p['sample'] == 'destructive'  # blank red cells in destructive sheets = none red (sheet convention)
    p.loc[dest, ['n_red', 'fw_red']] = p.loc[dest, ['n_red', 'fw_red']].fillna(0)
    return p


def daily(z):
    rows = []
    for gh, team in TEAM.items():
        d = pd.read_csv(io.BytesIO(z.read(f'{ROOT}timeseries/{team}.csv')))
        t = pd.to_datetime(d.pop('time'), utc=True).dt.tz_convert('Europe/Amsterdam')  # handles CEST->CET
        d.columns = [c.split('/')[-1] for c in d.columns]
        d['day'] = t.dt.date
        g = d.groupby('day')
        cost = [c for c in d.columns if c.endswith('.per_m2')]
        r = pd.DataFrame({
            'T_mean': g.air_temperature.mean(), 'T_min': g.air_temperature.min(), 'T_max': g.air_temperature.max(),
            'RH_mean': g.relative_humidity.mean(), 'CO2_mean': g.co2_concentration.mean(),
            # PAR umol/m2/s sampled every 5 min -> daily light integral mol/m2/day
            'DLI': g.par.sum() * 300 / 1e6,
            'lamps_on_frac': g.lamps_activation_percentage.apply(lambda s: (s.fillna(0) > 0).mean()),
            'density': g.plant_density.last(),
            'heating_MJ': g['energy_use.heating'].sum(), 'lighting_kWh': g['electricity_use.lighting'].sum(),
            'cost_eur_m2': g[cost].sum().sum(axis=1),  # costs are per 5-min step, so sum
            'n_records': g.size(),
        })
        r['gh'], r['team'] = gh, team
        rows.append(r.reset_index())
    out = pd.concat(rows, ignore_index=True)
    out['dap'] = (pd.to_datetime(out.day) - START.tz_localize(None)).dt.days  # days after start
    out['gdd'] = (out.T_mean - T_BASE).clip(lower=0)
    out = out.sort_values(['gh', 'day'])
    out['gdd_cum'] = out.groupby('gh').gdd.cumsum()
    out['light_cum'] = out.groupby('gh').DLI.cumsum()
    return out


def main(zpath):
    z = zipfile.ZipFile(zpath)
    p, dd = harvest(z), daily(z)
    last = dd.groupby('gh').day.max()  # final harvest = last logged day (matches harvest_date day-of-year)
    p.loc[p['sample'] == 'final', 'date'] = p.loc[p['sample'] == 'final', 'gh'].map(last)
    p['date'] = pd.to_datetime(p['date']).dt.date
    # final-harvest plants 31-50 only have red weight recorded; % red uses fully measured plants only
    p['full'] = p.fw_total.notna()
    p['pct_red_weight'] = (100 * p.fw_red / p.fw_total).where(p.full)
    p['pct_red_count'] = (100 * p.n_red / p.n_total).where(p.full & (p.n_total > 0))
    agg = p.groupby(['gh', 'team', 'date', 'sample']).agg(
        plants=('plant', 'size'), plants_full=('full', 'sum'), fw_total=('fw_total', 'mean'),
        fw_red=('fw_red', 'mean'), fw_red_sd=('fw_red', 'std'), n_red=('n_red', 'mean'),
        pct_red_weight=('pct_red_weight', 'mean'), pct_red_weight_sd=('pct_red_weight', 'std'),
        pct_red_count=('pct_red_count', 'mean')).reset_index()
    agg = agg.merge(dd[['gh', 'day', 'dap', 'gdd_cum', 'light_cum']], left_on=['gh', 'date'], right_on=['gh', 'day']).drop(columns='day')
    # self-checks: every plant has a compartment, red never exceeds total, every sample date found in the log
    assert p.team.notna().all() and (p.fw_red <= p.fw_total + 1e-6)[p.full].all()
    assert len(agg) == p.groupby(['gh', 'date']).ngroups
    out = Path('out'); out.mkdir(exist_ok=True)
    p.to_csv(out / 'ripeness_plants.csv', index=False)
    agg.round(2).to_csv(out / 'ripeness.csv', index=False)
    dd.round(3).to_csv(out / 'daily.csv', index=False)
    print(f'plants={len(p)} ripeness_rows={len(agg)} daily_rows={len(dd)}')


if __name__ == '__main__':
    main(sys.argv[1])
