"""Build the portable dashboard from the official timeseries ZIP and camera features."""
import argparse
import csv
from dataclasses import asdict
from datetime import date, datetime
import io
import json
from pathlib import Path
from statistics import mean
from zipfile import ZipFile

import pandas as pd

from model import GDD_BASE, decision_inputs, forecast_curves, plan


ROOT = Path(__file__).resolve().parent
PREFIX = "autonomous_greenhouse_challenge4_timeseries/"
ROOMS = {"301": "Tomatonuts", "302": "MuGrow", "303": "Agrifusion",
         "306": "Reference", "307": "IDEAS", "308": "Trigger"}
REPLAY_DAY = date(2024, 11, 5)
SAMPLE_DAYS = {"7-10-24": date(2024, 10, 7), "22-10-24": date(2024, 10, 22),
               "05-11-24": REPLAY_DAY}
COSTS = [f"economics/{part}_costs.per_pot" for part in ("fixed", "heating", "lighting", "co2")]
DENSITY = "dwarf_tomato/plant_density"
HARVEST = "dwarf_tomato/harvest_date"
TEMPERATURE = "compartment/air_temperature"


def load_climate(archive):
    climate, harvest = {}, {}
    for room in ROOMS.values():
        member = f"{PREFIX}timeseries/{room.lower()}.csv"
        with archive.open(member) as stream:
            data = pd.read_csv(stream, usecols=["time", TEMPERATURE, DENSITY, HARVEST, *COSTS])
        # Logs contain local wall time and the offset in effect for that record.
        data["date"] = data["time"].str.slice(0, 10)
        harvest[room] = date.fromisoformat(data.loc[data[HARVEST].notna(), "date"].iloc[0])
        data[DENSITY] = data[DENSITY].ffill().fillna(56)
        data["cost"] = data[COSTS].sum(axis=1, min_count=1)
        daily = data.groupby("date", sort=True).agg(
            temperature=(TEMPERATURE, "mean"), density=(DENSITY, "last"),
            cost=("cost", "sum"), area=(DENSITY, lambda values: (1 / values).mean()))
        daily["daily_heat"] = (daily.temperature - GDD_BASE).clip(lower=0)
        daily["heat"] = daily.daily_heat.cumsum()
        daily["area_days"] = daily.area.cumsum()
        daily["cost_per_pot"] = daily.cost.cumsum()
        daily["daily_cost_per_pot"] = daily.cost
        climate[room] = {date.fromisoformat(day): row for day, row in daily.to_dict("index").items()}
    return climate, harvest


def load_measurements(archive, harvest):
    workbook = pd.read_excel(io.BytesIO(archive.read(f"{PREFIX}Harvest.xlsx")), sheet_name=None)
    observations = {room: {} for room in ROOMS.values()}
    for sheet, frame in workbook.items():
        if sheet == "Information":
            continue
        final = sheet.startswith("Final")
        when = None if final else SAMPLE_DAYS[sheet.split()[-1]]
        frame.columns = [str(column).strip().lower() for column in frame.columns]
        frame = frame.rename(columns={"fw tot": "total", "fw": "total",
                                      "fw tom red": "red", "fw red": "red"})
        frame = frame[frame.plant.astype(str).str.fullmatch(r"\d{3}-\d+")]
        frame = frame.assign(room=frame.plant.str[:3].map(ROOMS))
        for room, plants in frame.groupby("room"):
            total = pd.to_numeric(plants.total, errors="coerce")
            red = pd.to_numeric(plants["red"], errors="coerce") if "red" in plants else total * 0
            if not final:
                red = red.fillna(0)  # blank red cells in destructive samples indicate zero
            complete = total.gt(0) & red.notna()
            fractions = (red[complete] / total[complete]).clip(0, 1)
            observations[room][harvest[room] if final else when] = {
                "red": float(fractions.mean()), "weight": float(total[complete].mean()),
                "n": int(complete.sum()),
            }
    return observations


def load_images(path):
    images = {}
    with path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            images.setdefault(row["team"].lower(), {})[date.fromisoformat(row["date"])] = float(row["red_index"])
    return {room: images.get(room.lower(), {}) for room in ROOMS.values()}


def create_replay(raw_zip, feature_file):
    with ZipFile(raw_zip) as archive:
        climate, harvest = load_climate(archive)
        obs = load_measurements(archive, harvest)
    images = load_images(feature_file)
    rooms = {}
    evaluation = []
    for room, final in harvest.items():
        other = {key: [(climate[key][day]["heat"], sample["red"])
                       for day, sample in obs[key].items()]
                 for key in obs if key != room}
        cut = REPLAY_DAY
        known = obs[room][cut]
        label = obs[room][final]["red"]
        # A November 5 sample is held behind the intervention in this replay.
        earlier = max(day for day in obs[room] if day < cut)
        weights = [obs[key][cut]["weight"] for key in other]
        default_weight = mean(weights)
        warmth, warm_paths, _ = forecast_curves(room, cut, other, climate, images, False)
        fused, fused_paths, onset = forecast_curves(room, cut, other, climate, images, True)
        current_heat = climate[room][cut]["heat"]
        anchored = fused.anchored(current_heat, known["red"])
        anchored_paths = [curve.anchored(current_heat, known["red"]) for curve in fused_paths]
        inputs = decision_inputs(cut, climate[room])
        warm_plan = plan(warmth, warm_paths, cut, inputs, default_weight)
        prior = plan(fused, fused_paths, cut, inputs, default_weight)
        after = plan(anchored, anchored_paths, cut, inputs, known["weight"])
        requested = prior["action"] == "sample"
        i = (final - cut).days
        predictions = {
            "mean": 100 * mean(obs[key][harvest[key]]["red"] for key in other),
            "persistence": 100 * obs[room][earlier]["red"],
            "warmth": warm_plan["points"][i]["red"],
            "never": prior["points"][i]["red"],
            "selective": (after if requested else prior)["points"][i]["red"],
            "always": after["points"][i]["red"],
        }
        evaluation.append({
            "room": room, "date": final.isoformat(), "horizon": i,
            "actual": round(100 * label, 2), "requested": requested,
            "changed": prior["selected"] != after["selected"],
            "predictions": {key: round(value, 2) for key, value in predictions.items()},
        })
        rooms[room] = {
            "cutoff": cut.isoformat(), "finalDate": final.isoformat(),
            "cameraOnset": onset.isoformat() if onset else None,
            "sample": {"red": round(100 * known["red"], 2), "grams": round(known["weight"]), "n": known["n"]},
            "forecastInputs": inputs,
            "centralCurve": asdict(fused),
            "scenarioCurves": [asdict(curve) for curve in fused_paths],
            "warmthCurves": [asdict(curve) for curve in warm_paths],
            "warmth": warm_plan, "prior": prior, "after": after,
            "images": [{"date": day.isoformat(), "red": red} for day, red in sorted(images[room].items())
                       if earlier <= day <= cut],
        }
    metrics = {name: round(mean(abs(row["predictions"][name] - row["actual"])
                                for row in evaluation), 2)
               for name in evaluation[0]["predictions"]}
    return {"rooms": rooms, "evaluation": evaluation, "metrics": metrics}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--features", type=Path, default=ROOT / "data/noon_red_index.csv")
    parser.add_argument("--output", type=Path, default=ROOT / "dashboard/replay-data.js")
    args = parser.parse_args()
    replay = create_replay(args.zip, args.features)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("window.harvestReplay = " + json.dumps(replay, separators=(",", ":"),
                                                                  allow_nan=False) + ";\n",
                           encoding="utf-8")
    print(json.dumps({"mae_pp": replay["metrics"],
                      "sample_requests": sum(row["requested"] for row in replay["evaluation"]),
                      "rooms": len(replay["evaluation"])}, indent=2))


if __name__ == "__main__":
    main()
