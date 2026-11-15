"""Write small synthetic input tables with known answers to tests/fixtures/inputs/dash/.

Owner: integrator. Run: python tests/fixtures/make_fixtures.py

Six rooms share one ripening curve, k = 0.03 and G50 = 750 degree-days, so a leave-one-room-out fit
should recover it. Each room runs at a constant 20 + i degrees C, so it gains (10 + i) degree-days a day
(base 10 C) and reaches G50 on a day you can work out by hand: day = 750 / (10 + i) after planting.
Hand measurements on 7 Oct, 22 Oct, 5 Nov and a final day 10 days after the room reaches 80% red.
"""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).parent / 'inputs' / 'dash'
ROOMS = ['agrifusion', 'ideas', 'mugrow', 'reference', 'tomatonuts', 'trigger']
START, K, G50 = date(2024, 9, 3), 0.03, 750.0


def pct(g):
    return 100 / (1 + np.exp(-K * (g - G50)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    daily, rip, plants, img = [], [], [], []
    for i, room in enumerate(ROOMS):
        rate = 10.0 + i
        g80 = G50 + np.log(80 / 20) / K                  # degree-days at 80% red
        final = START + timedelta(days=int(np.ceil(g80 / rate)) + 10)
        for d in range((final - START).days + 1):
            day = START + timedelta(days=d)
            g = rate * (d + 1)
            daily.append(dict(team=room, date=day, dap=d, T_mean=20.0 + i, T_min=18.0 + i, T_max=24.0 + i, RH_mean=80.0,
                              CO2_mean=600.0, DLI=8.0, lamp_hours=6.0, density=56.0 if d == 0 else (28.0 if d == 30 else None),
                              gdd_cum=g, heating_MJ=0.5 + 0.1 * i, lighting_kWh=0.4, cost_eur_m2=0.20 + 0.01 * i))
            red = max(pct(g) - 2.0, 0.0) / 10                   # photo index: a tenth of % red, lagging a little
            img.append(dict(team=room, date=day, red_index=round(red, 3), orange_index=0.1, green_pct=5.0,
                            canopy_distance_mm=1400.0 - d, lamps_on_noon=bool(d % 5 == 0)))
        for day, sample in [(date(2024, 10, 7), 'destructive'), (date(2024, 10, 22), 'destructive'),
                            (date(2024, 11, 5), 'destructive'), (final, 'final')]:
            g = rate * ((day - START).days + 1)
            p = round(float(pct(g)), 2)
            fw = 300.0
            # L09: plant-to-plant sd 12.5 points (the setting), so a spread fitted on other rooms matches it
            rip.append(dict(team=room, date=day, sample=sample, plants=6, plants_full=6, fw_total=fw,
                            fw_red=round(fw * p / 100, 2), fw_red_sd=0.0, n_red=0, pct_red_weight=p,
                            pct_red_weight_sd=12.5, pct_red_count=p, dap=(day - START).days, gdd_cum=g, light_cum=0.0))
            for j in range(6):
                plants.append(dict(team=room, sample=sample, date=day, plant=f'{i}-{j}', fw_total=fw,
                                   fw_red=round(fw * p / 100, 2), pct_red_weight=p))
    days = sorted({r['date'] for r in daily})
    weather = [dict(date=d, T_out=10.0, sun_MJ_m2=5.0) for d in days]
    for name, rows in [('daily', daily), ('ripeness', rip), ('plants', plants), ('images', img), ('weather', weather)]:
        pd.DataFrame(rows).to_csv(OUT / f'{name}.csv', index=False)

    # A fixture forecast so L02/L03 can build before L01 lands: room 'fixture', today 2024-11-06,
    # gdd 726.6 rising 11.2 a day, k = 0.026, G50 = 746.5, band from G50 -/+ 40.
    fc = []
    for h in range(22):
        g = 726.6 + 11.2 * h
        f = lambda g50: round(float(100 / (1 + np.exp(-0.026 * (g - g50)))), 3)
        fc.append(dict(room='fixture', today='2024-11-06', date=str(date(2024, 11, 6) + timedelta(days=h)),
                       gdd_cum=round(g, 1), pct_red=f(746.5), pct_red_low=f(786.5), pct_red_high=f(706.5)))
    pd.DataFrame(fc).to_csv(OUT.parent.parent / 'forecast_fixture.csv', index=False)


if __name__ == '__main__':
    main()
