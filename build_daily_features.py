"""Build daily_features.csv (one row per compartment per day) and harvest_labels_plants.csv.

Source: 4th Autonomous Greenhouse Challenge timeseries (WUR, 2024), CC BY 4.0,
doi:10.4121/fa102772-32db-4b30-bace-12f2016722ce

Run:  python3 build_daily_features.py [path/to/autonomous_greenhouse_challenge4_timeseries]

Leakage note: every feature on a row uses data up to the END of that row's date
(local time, Europe/Amsterdam). Harvest labels are joined onto the row of the day
they were measured. For a forecast made at a cutoff date, use the row of the day
BEFORE the cutoff as the feature row.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "autonomous_greenhouse_challenge4_timeseries"
TZ = "Europe/Amsterdam"
START = pd.Timestamp("2024-09-03")  # transplant / start of trial (day 0)
T_BASE = 10.0  # base temperature for degree-days (tomato)
CO2_OUTSIDE = 420.0  # ppm, reference for the CO2 enrichment integral
PAR_LIT = 5.0  # umol/m2/s; above this the canopy counts as "lit" (sun or lamps)

TEAMS = [  # key, name, compartment
    ("tomatonuts", "Tomatonuts", "3.01"),
    ("mugrow", "MuGrow", "3.02"),
    ("agrifusion", "Agrifusion", "3.03"),
    ("reference", "Reference", "3.06"),
    ("ideas", "IDEAS", "3.07"),
    ("trigger", "Trigger", "3.08"),
]


def load(csv: Path) -> pd.DataFrame:
    df = pd.read_csv(csv)
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert(TZ)
    df = df.replace(1e-10, 0.0)  # zeros are stored as 1e-10
    df["date"] = df["time"].dt.tz_localize(None).dt.normalize()
    return df


def col(df, name):
    return df[name] if name in df else pd.Series(np.nan, index=df.index)


def daily_team(key, name, comp, weather_daily):
    df = load(DATA / "timeseries" / f"{key}.csv")
    df = df.iloc[1:]  # first row is an almost-empty 00:00 stub
    par = col(df, "compartment/par")
    df = df.assign(
        _par=par,
        _lit=(par > PAR_LIT).astype(float).where(par.notna()),
        _co2_lit=col(df, "compartment/co2_concentration").where(par > PAR_LIT),
        _T_lit=col(df, "compartment/air_temperature").where(par > PAR_LIT),
        _T_dark=col(df, "compartment/air_temperature").where(par <= PAR_LIT),
        _lamp=col(df, "compartment/lamps_activation_percentage") / 100.0,
    )
    g = df.groupby("date")
    # seconds in each local day (23h/25h on DST days); used to turn means into sums
    days = g.size().index
    day_s = pd.Series(86400.0, index=days)
    day_s[days == pd.Timestamp("2024-10-27")] = 90000.0  # clocks go back: 25-hour day

    out = pd.DataFrame(index=g.size().index)
    out["n_obs"] = g.size()
    out["T_mean"] = g["compartment/air_temperature"].mean()
    out["T_min"] = g["compartment/air_temperature"].min()
    out["T_max"] = g["compartment/air_temperature"].max()
    out["T_lit_mean"] = g["_T_lit"].mean()
    out["T_dark_mean"] = g["_T_dark"].mean()
    out["RH_mean"] = g["compartment/relative_humidity"].mean()
    out["RH_max"] = g["compartment/relative_humidity"].max()
    out["HD_mean"] = col(df, "compartment/humidity_deficit").groupby(df["date"]).mean()
    out["hours_RH_over_90"] = (col(df, "compartment/relative_humidity") > 90).groupby(df["date"]).sum() * 5 / 60
    out["CO2_mean"] = g["compartment/co2_concentration"].mean()
    out["CO2_lit_mean"] = g["_co2_lit"].mean()
    # DLI: mean PPFD over the day x seconds in the day -> mol/m2/day (robust to a few missing readings)
    out["DLI"] = g["_par"].mean() * day_s / 1e6
    out["lit_hours"] = g["_lit"].mean() * day_s / 3600
    out["lamp_hours"] = g["_lamp"].mean() * day_s / 3600  # full-power-equivalent hours
    out["screen_energy_mean"] = col(df, "compartment/screen_energy/screen_position").groupby(df["date"]).mean()
    out["screen_blackout_mean"] = col(df, "compartment/screen_blackout/screen_position").groupby(df["date"]).mean()
    out["window_lee_mean"] = col(df, "compartment/window_position_lee_side").groupby(df["date"]).mean()
    out["pipe_T_mean"] = col(df, "compartment/heating_lower_circuit/pipe_temperature").groupby(df["date"]).mean()
    out["water_flow_min"] = col(df, "compartment/water_supply/water_flow_duration").groupby(df["date"]).sum()
    out["drain_volume_l_m2"] = col(df, "compartment/water_drain/water_volume").groupby(df["date"]).max()
    out["drain_EC"] = col(df, "compartment/water_drain/ec").groupby(df["date"]).mean()
    out["drain_pH"] = col(df, "compartment/water_drain/ph").groupby(df["date"]).mean()
    out["density"] = col(df, "dwarf_tomato/plant_density").groupby(df["date"]).last()
    out["planned_harvest_doy"] = col(df, "dwarf_tomato/harvest_date").groupby(df["date"]).last()

    # per-5-minute increments -> daily sums
    for src, dst in [
        ("energy/energy_use.heating", "heat_MJ"),
        ("energy/electricity_use.lighting", "light_kWh"),
        ("energy/co2_dosage", "co2_kg_m2"),
        ("economics/fixed_costs.per_m2", "cost_fixed_m2"),
        ("economics/heating_costs.per_m2", "cost_heating_m2"),
        ("economics/co2_costs.per_m2", "cost_co2_m2"),
        ("economics/lighting_costs.per_m2", "cost_lighting_m2"),
    ]:
        out[dst] = col(df, src).groupby(df["date"]).sum(min_count=1).fillna(0.0)
    out["cost_m2"] = out[["cost_fixed_m2", "cost_heating_m2", "cost_co2_m2", "cost_lighting_m2"]].sum(axis=1)

    out[["density", "planned_harvest_doy"]] = out[["density", "planned_harvest_doy"]].ffill().bfill()

    # cumulative crop drivers (through end of day)
    out["light_sum"] = out["DLI"].fillna(0).cumsum()
    out["light_per_plant"] = (out["DLI"] / out["density"]).fillna(0).cumsum()  # mol per plant
    out["degree_days"] = (out["T_mean"] - T_BASE).clip(lower=0).fillna(0).cumsum()
    out["co2_ppm_days"] = (out["CO2_mean"] - CO2_OUTSIDE).clip(lower=0).fillna(0).cumsum()
    out["lamp_hours_sum"] = out["lamp_hours"].fillna(0).cumsum()
    out["hours_RH_over_90_sum"] = out["hours_RH_over_90"].fillna(0).cumsum()
    for c in ["heat_MJ", "light_kWh", "co2_kg_m2", "cost_m2"]:
        out[c + "_cum"] = out[c].cumsum()

    out = out.join(weather_daily, how="left")
    out = out.reset_index().rename(columns={"index": "date"})
    out.insert(0, "team", name)
    out.insert(1, "compartment", comp)
    out.insert(3, "day", (out["date"] - START).dt.days)
    out["planned_harvest_date"] = pd.Timestamp("2024-01-01") + pd.to_timedelta(out["planned_harvest_doy"] - 1, unit="D")
    out["days_to_planned_harvest"] = (out["planned_harvest_date"] - out["date"]).dt.days
    out["full_day"] = out["n_obs"] >= 280
    return out


def weather():
    w = load(DATA / "timeseries" / "weather.csv")
    g = w.groupby("date")
    return pd.DataFrame({
        "out_T_mean": g["weather/air_temperature.outside"].mean(),
        "out_RH_mean": g["weather/relative_humidity.outside"].mean(),
        # global radiation W/m2 mean x 86400 s -> MJ/m2/day
        "out_radiation_MJ_m2": g["weather/radiation_global"].mean() * 86400 / 1e6,
        "out_wind_mean": g["weather/wind_speed"].mean(),
    })


def plant_labels():
    """One row per measured plant across all 9 harvest sheets."""
    x = pd.ExcelFile(DATA / "Harvest.xlsx")
    rows = []
    is_plant = lambda s: s.astype(str).str.fullmatch(r"\d{3}-\d+")
    num = lambda s: pd.to_numeric(s, errors="coerce")

    d = x.parse("Destructive harvest 7-10-24", header=None).iloc[1:]
    p = d[is_plant(d[0])]
    rows.append(pd.DataFrame({"plant": p[0], "date": "2024-10-07", "event": "interim",
                              "fw_total": num(p[1]), "n_total": num(p[3])}))

    for sheet, date in [("Destructive harvest 22-10-24", "2024-10-22"), ("Destructive harvest 05-11-24", "2024-11-05")]:
        d = x.parse(sheet, header=None).iloc[1:]
        p = d[is_plant(d[1])]
        rows.append(pd.DataFrame({
            "plant": p[1], "date": date, "event": "interim",
            "fw_total": num(p[2]), "n_total": num(p[3]),
            "n_green": num(p[4]).fillna(0), "fw_green": num(p[5]).fillna(0),
            "n_coloured": num(p[6]).fillna(0), "fw_coloured": num(p[7]).fillna(0),
            "n_red": num(p[8]).fillna(0), "fw_red": num(p[9]).fillna(0),
        }))

    finals = {}
    for sheet in x.sheet_names:
        if not sheet.startswith("Final Harvest"):
            continue
        d = x.parse(sheet, header=None)
        p = d.iloc[1:][is_plant(d.iloc[1:][1])]
        full = num(p[4]).notna()  # rows with the green/red breakdown
        comp = p[1].iloc[0][:3]
        # dry matter block: row labelled "drying", DW% two rows below (col 5 green, col 7 red)
        dm = {}
        hit = d.index[d[0].astype(str).str.strip().str.lower() == "drying"]
        if len(hit):
            r = hit[0] + 2
            dm = {"dw_pct_green": num(pd.Series([d.iat[r, 5]])).iat[0], "dw_pct_red": num(pd.Series([d.iat[r, 7]])).iat[0]}
        finals[comp] = dm
        rows.append(pd.DataFrame({
            "plant": p[1], "date": None, "event": "final", "full_breakdown": full.values,
            "fw_total": num(p[2]), "n_total": num(p[3]),
            "n_green": num(p[4]), "fw_green": num(p[5]),
            "n_red": num(p[6]), "fw_red": num(p[7]), "n_under_6g": num(p[8]),
        }))
    lab = pd.concat(rows, ignore_index=True)
    lab["compartment"] = lab["plant"].str[:1] + "." + lab["plant"].str[1:3]
    lab["full_breakdown"] = lab["full_breakdown"].fillna(lab["n_total"].notna() & (lab["date"] != "2024-10-07"))
    lab["pct_red_count"] = 100 * lab["n_red"] / lab["n_total"]
    lab["pct_red_fw"] = 100 * lab["fw_red"] / lab["fw_total"]
    return lab, finals


def main():
    wd = weather()
    daily = pd.concat([daily_team(k, n, c, wd) for k, n, c in TEAMS], ignore_index=True)

    lab, finals = plant_labels()
    # final harvest date = each team's planned harvest day (last value of harvest_date)
    hdate = daily.groupby("compartment")["planned_harvest_date"].last()
    lab.loc[lab["event"] == "final", "date"] = lab.loc[lab["event"] == "final", "compartment"].map(hdate).dt.strftime("%Y-%m-%d")
    lab["date"] = pd.to_datetime(lab["date"])
    lab = lab.merge(daily[["compartment", "team"]].drop_duplicates(), on="compartment")
    lab.insert(0, "team", lab.pop("team"))
    lab.insert(1, "compartment", lab.pop("compartment"))

    # compartment-level labels per sampling date
    full = lab[lab["full_breakdown"] | (lab["event"] == "interim")]
    agg = lab.groupby(["compartment", "date", "event"]).agg(
        label_n_plants=("plant", "size"),
        label_fw_total=("fw_total", "mean"),
        label_n_total=("n_total", "mean"),
        label_fw_red=("fw_red", "mean"),
    )
    ripe = full[full["n_red"].notna()].groupby(["compartment", "date"]).agg(
        label_n_plants_breakdown=("plant", "size"),
        label_pct_red_count=("pct_red_count", "mean"),
        label_pct_red_fw=("pct_red_fw", "mean"),
    )
    agg = agg.reset_index().merge(ripe.reset_index(), on=["compartment", "date"], how="left")
    agg["label_dw_pct_red"] = agg.apply(lambda r: finals.get(r["compartment"].replace(".", ""), {}).get("dw_pct_red") if r["event"] == "final" else np.nan, axis=1)
    agg = agg.rename(columns={"event": "label_event"})

    daily = daily.merge(agg, on=["compartment", "date"], how="left")
    daily["is_labelled"] = daily["label_event"].notna()
    daily = daily[daily["date"] <= daily["compartment"].map(hdate)]  # nothing after the final harvest

    num_cols = daily.select_dtypes("number").columns
    daily[num_cols] = daily[num_cols].round(4)
    daily["date"] = daily["date"].dt.strftime("%Y-%m-%d")
    daily["planned_harvest_date"] = daily["planned_harvest_date"].dt.strftime("%Y-%m-%d")
    daily.to_csv(ROOT / "daily_features.csv", index=False)

    lab["date"] = lab["date"].dt.strftime("%Y-%m-%d")
    lab.round(3).to_csv(ROOT / "harvest_labels_plants.csv", index=False)
    print(f"daily_features.csv: {daily.shape[0]} rows x {daily.shape[1]} cols, {int(daily['is_labelled'].sum())} labelled rows")
    print(f"harvest_labels_plants.csv: {lab.shape[0]} plants")


if __name__ == "__main__":
    main()
