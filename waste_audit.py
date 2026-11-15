"""Resource-waste audit for the AGC4 greenhouse compartments.

Flags 5-minute intervals where money was spent on lamps, CO2 or heat that the conditions say was
probably not needed, and prices each flag with the dataset's own `economics/*` cost columns.
Also runs basic sensor-health checks.

Run:  python waste_audit.py      (writes waste_audit_summary.csv, sensor_health.csv)
Used by app.py (imported, cached).
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
TS = ROOT / "data/agc4/autonomous_greenhouse_challenge4_timeseries/timeseries"
TEAMS = {"tomatonuts": "Tomatonuts", "mugrow": "MuGrow", "agrifusion": "Agrifusion",
         "reference": "Reference", "ideas": "IDEAS", "trigger": "Trigger"}
STEP_H = 5 / 60

DEFAULTS = dict(
    sun_par=300.0,       # lamps flagged when the sun alone gives at least this inside PAR (µmol/m²/s); lamps give ~190 at 100%
    vent_co2=30.0,       # CO2 dosing flagged when either window side is open more than this (%)
    vent_heat=30.0,      # heating flagged when windows open more than this (%) ...
    rh_heat=85.0,        # ... and humidity is below this (%), i.e. no dehumidifying reason
    night_tout=8.0,      # energy screen check: outside colder than this (°C) and dark
    screen_open=50.0,    # ... with the energy screen less than this closed (%)
    screen_saving=0.25,  # share of heating cost an energy screen would have saved (assumption)
)

RULES = {
    "lamps_sun": ("Lamps on in strong sun", "light_eur"),
    "co2_vent": ("CO₂ dosed with windows open", "co2_eur"),
    "heat_vent": ("Heating while venting (air not humid)", "heat_eur"),
    "screen_night": ("Energy screen open on cold nights", "heat_eur"),
}


def _col(d, name):
    return d[name] if name in d.columns else pd.Series(np.nan, index=d.index)


def load():
    """One tidy 5-minute frame per team with the columns the audit needs."""
    w = pd.read_csv(TS / "weather.csv")
    w["time"] = pd.to_datetime(w.time, utc=True)
    w = w.set_index("time")
    out = {}
    for key, team in TEAMS.items():
        raw = pd.read_csv(TS / f"{key}.csv")
        raw["time"] = pd.to_datetime(raw.time, utc=True)
        raw = raw.set_index("time").replace(1e-10, 0.0).join(w, how="left")
        c = lambda k: _col(raw, "compartment/" + k)
        d = pd.DataFrame(index=raw.index)
        d["lamp"] = c("lamps_activation_percentage").fillna(0)
        d["par_in"] = c("par")
        d["par_out"] = raw["weather/par.outside"]
        d["rad_out"] = raw["weather/radiation_global"]
        d["t_out"] = raw["weather/air_temperature.outside"]
        d["t_in"] = c("air_temperature")
        d["rh"] = c("relative_humidity")
        d["co2"] = c("co2_concentration")
        d["vent"] = np.fmax(c("window_position_lee_side").fillna(0), c("window_position_wind_side").fillna(0))
        d["screen"] = c("screen_energy/screen_position").fillna(0)
        for k in ["heating", "co2", "lighting", "fixed"]:
            d[k.replace("heating", "heat").replace("lighting", "light") + "_eur"] = raw[f"economics/{k}_costs.per_m2"].fillna(0)
        d["drain_ec"] = c("water_drain/ec")
        d["drain_ph"] = c("water_drain/ph")
        # greenhouse light transmission: inside / outside PAR in daylight with lamps off
        day = (d.lamp == 0) & (d.par_out > 200) & (d.par_in > 0)
        d.attrs["transmission"] = float((d.par_in[day] / d.par_out[day]).median())
        d.attrs["team"] = team
        out[team] = d
    return out


def audit(d, p=None):
    """Add boolean flag columns and € columns (per m²) for each rule."""
    p = {**DEFAULTS, **(p or {})}
    a = d.copy()
    a["sun_par_in"] = a.par_out * d.attrs["transmission"]
    dark = a.rad_out < 5
    a["lamps_sun"] = (a.lamp > 0) & (a.sun_par_in >= p["sun_par"])
    a["co2_vent"] = (a.co2_eur > 0) & (a.vent > p["vent_co2"])
    a["heat_vent"] = (a.heat_eur > 0) & (a.vent > p["vent_heat"]) & (a.rh < p["rh_heat"])
    a["screen_night"] = (a.heat_eur > 0) & dark & (a.t_out < p["night_tout"]) & (a.screen < p["screen_open"]) & (a.rh < 90)
    for r, (_, cost) in RULES.items():
        share = p["screen_saving"] if r == "screen_night" else 1.0
        a[r + "_eur"] = np.where(a[r], a[cost] * share, 0.0)
    return a


def summary(audited):
    """Season totals per team and rule (€/m²) plus each team's total spend per cost category."""
    rows = []
    for team, a in audited.items():
        r = {"team": team, "transmission": round(a.attrs["transmission"], 3)}
        for k in ["light_eur", "co2_eur", "heat_eur", "fixed_eur"]:
            r["spend_" + k.split("_")[0]] = a[k].sum()
        for rule in RULES:
            r[rule + "_eur"] = a[rule + "_eur"].sum()
            r[rule + "_hours"] = a[rule].sum() * STEP_H
        r["flagged_total_eur"] = sum(r[x + "_eur"] for x in RULES)
        r["variable_spend_eur"] = r["spend_light"] + r["spend_co2"] + r["spend_heat"]
        rows.append(r)
    return pd.DataFrame(rows)


def episodes(a, rule, top=8):
    """Group consecutive flagged intervals into episodes, largest € first."""
    f = a[rule]
    if not f.any():
        return pd.DataFrame(columns=["start", "end", "hours", "eur"])
    grp = (f != f.shift()).cumsum()
    g = a[f].groupby(grp[f])
    ep = pd.DataFrame({"start": g.apply(lambda x: x.index[0]), "end": g.apply(lambda x: x.index[-1] + pd.Timedelta(minutes=5)),
                       "eur": g[rule + "_eur"].sum(), "hours": g.size() * STEP_H})
    ctx = {"lamps_sun": ("lamp", "sun_par_in"), "co2_vent": ("vent", "co2"), "heat_vent": ("vent", "rh"),
           "screen_night": ("screen", "t_out")}[rule]
    for c in ctx:
        ep[c] = g[c].mean()
    return ep.sort_values("eur", ascending=False).head(top).reset_index(drop=True)


def sensor_health(data):
    """Impossible values, flat-lined sensors and channels that were never logged."""
    checks = {"drain_ph": (3, 9.5), "drain_ec": (0.1, 12), "rh": (1, 100), "co2": (250, 3000), "t_in": (5, 40)}
    names = {"drain_ph": "Drain pH", "drain_ec": "Drain EC", "rh": "Air humidity", "co2": "CO₂", "t_in": "Air temperature"}
    rows = []
    for team, d in data.items():
        for k, (lo, hi) in checks.items():
            s = d[k]
            logged = s.notna() & (s != 0)
            if logged.mean() < 0.05:
                rows.append(dict(team=team, sensor=names[k], issue="not logged", share=1 - logged.mean(), detail="no usable readings"))
                continue
            if s[logged].quantile(0.95) < 0.5:
                rows.append(dict(team=team, sensor=names[k], issue="reads ~0 all season", share=1.0,
                                 detail=f"stuck around {s[logged].median():.2f}: disconnected or not wired"))
                continue
            bad = logged & ((s < lo) | (s > hi))
            if bad.mean() > 0.001:
                rows.append(dict(team=team, sensor=names[k], issue="impossible values", share=bad.mean(),
                                 detail=f"median of bad readings {s[bad].median():.1f}, valid range {lo}–{hi}"))
            run = (s.diff() != 0).cumsum()
            longest = s.groupby(run).size().max() * STEP_H
            if longest >= 6 and k in ("rh", "co2", "t_in"):
                rows.append(dict(team=team, sensor=names[k], issue="flat-lined", share=np.nan,
                                 detail=f"same value for {longest:.0f} h in a row"))
    return pd.DataFrame(rows, columns=["team", "sensor", "issue", "share", "detail"])


if __name__ == "__main__":
    data = load()
    aud = {t: audit(d) for t, d in data.items()}
    s = summary(aud)
    s.to_csv(ROOT / "waste_audit_summary.csv", index=False)
    pd.set_option("display.width", 220)
    print(s.round(3).set_index("team").T)
    h = sensor_health(data)
    h.to_csv(ROOT / "sensor_health.csv", index=False)
    print(h.to_string())
    print(episodes(aud["MuGrow"], "lamps_sun").head(3))
