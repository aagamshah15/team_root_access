"""Summarize recorded climate, irrigation, energy and costs through the replay cutoff."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

ROOT = Path(__file__).resolve().parent
CHANNELS = {
    "Temperature °C": ("compartment/air_temperature", "mean"),
    "Relative humidity %": ("compartment/relative_humidity", "mean"),
    "CO₂ ppm": ("compartment/co2_concentration", "mean"),
    "PAR µmol/m²/s": ("compartment/par", "mean"),
    "Drain EC dS/m": ("compartment/water_drain/ec", "mean"),
    "Drain pH": ("compartment/water_drain/ph", "mean"),
    "Irrigation minutes per observation": ("compartment/water_supply/water_flow_duration", "mean"),
    "Heating MJ/m²": ("energy/energy_use.heating", "sum"),
    "Lighting kWh/m²": ("energy/electricity_use.lighting", "sum"),
    "Fixed costs €/m²": ("economics/fixed_costs.per_m2", "sum"),
    "Heating costs €/m²": ("economics/heating_costs.per_m2", "sum"),
    "Lighting costs €/m²": ("economics/lighting_costs.per_m2", "sum"),
    "CO₂ costs €/m²": ("economics/co2_costs.per_m2", "sum"),
}

BOUNDS = {"compartment/water_drain/ph": (0.1, 14),
          "compartment/relative_humidity": (0, 100),
          "compartment/air_temperature": (-10, 60),
          "compartment/par": (0, 4000), "compartment/co2_concentration": (0, 10000)}


def describe(values, channel):
    numeric = pd.to_numeric(values, errors="coerce").replace([float("inf"), -float("inf")], float("nan"))
    valid = numeric.dropna()
    bounds = BOUNDS.get(channel)
    suspect = 0 if bounds is None else int(((valid < bounds[0]) | (valid > bounds[1])).sum())
    return {"count": int(valid.size), "coverage": round(100 * valid.size / len(values), 1),
            "mean": None if valid.empty else round(float(valid.mean()), 4),
            "min": None if valid.empty else round(float(valid.min()), 4),
            "max": None if valid.empty else round(float(valid.max()), 4), "suspect": suspect}


def channel_metadata(root, channel):
    parts = channel.split("/")
    for part in parts[:-1]:
        root = root.get("components", {}).get(part, {})
    return root.get("datastreams", {}).get(parts[-1], {})


def build(path):
    result = {}
    with ZipFile(path) as archive:
        metadata = json.loads(archive.read("autonomous_greenhouse_challenge4_timeseries/channel_info.json"))
        for room in ("tomatonuts", "mugrow", "agrifusion", "reference", "ideas", "trigger", "weather"):
            with archive.open(f"autonomous_greenhouse_challenge4_timeseries/timeseries/{room}.csv") as stream:
                frame = pd.read_csv(stream, low_memory=False)
            history = frame[frame.time.str[:10] <= "2024-11-05"].copy()
            channels = []
            for channel in history.columns.drop("time"):
                # Harvest-date labels are outcomes, not decision-time sensor signals.
                if channel == "dwarf_tomato/harvest_date":
                    continue
                info = channel_metadata(metadata.get("components", {}).get(room, {}), channel)
                stats = describe(history[channel], channel)
                daily = []
                for day, group in history.groupby(history.time.str[:10]):
                    daily.append({"date": day, **describe(group[channel], channel)})
                channels.append({"channel": channel, "unit": info.get("unit", "not documented"),
                                 "description": info.get("description", ""), "kind": info.get("type", "unknown"),
                                 **stats, "daily": daily})
            frame = frame[(frame.time.str[:10] >= "2024-10-30") & (frame.time.str[:10] <= "2024-11-05")]
            rows = []
            for label, (channel, operation) in CHANNELS.items():
                if channel not in frame:
                    continue
                values = pd.to_numeric(frame[channel], errors="coerce")
                valid = values.dropna()
                value = None if valid.empty else float(valid.sum() if operation == "sum" else valid.mean())
                rows.append({"label": label, "value": None if value is None else round(value, 3),
                             "coverage": round(100 * values.notna().mean(), 1), "aggregation": operation,
                             "suspect": describe(values, channel)["suspect"]})
            result[room] = {"records": len(frame), "historyRecords": len(history),
                            "start": history.time.str[:10].min(), "end": history.time.str[:10].max(),
                            "rows": rows, "channels": channels}
    (ROOT / "dashboard/operations-data.js").write_text(
        "window.operationsData = " + json.dumps(result, allow_nan=False) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip")
    build(parser.parse_args().zip)
