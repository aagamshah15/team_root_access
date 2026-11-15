"""Inspect the external season's labels before attempting cross-season transfer."""
import io
import json
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

ROOT = Path(__file__).resolve().parent


def main():
    with ZipFile(ROOT / "data/pretrial.zip") as archive:
        measurements = pd.read_excel(io.BytesIO(archive.read("DestructiveHarvest.xlsx")),
                                     sheet_name="All Data", header=4)
        climate = pd.read_excel(io.BytesIO(archive.read("ClimateTimeseries.xlsx")),
                               sheet_name="weather_climate")
    dates = pd.to_datetime(measurements["Date"], errors="coerce")
    measurements = measurements[dates.notna()]
    report = {
        "source": "https://doi.org/10.4121/e1ee9de9-6ce9-4502-a37c-34b5b1372bed.v1",
        "plant_records": len(measurements),
        "climate_records": len(climate),
        "measurement_dates": sorted(dates.dropna().dt.strftime("%Y-%m-%d").unique().tolist()),
        "varieties": sorted(measurements["Variety"].dropna().unique().tolist()),
        "labels": [str(column).strip() for column in measurements.columns],
        "transfer_status": "The combined destructive sheet records red-fruit count and total fruit-cluster weight, but lacks a separate red-fruit fresh-weight label. Direct evaluation against the planner's weight-fraction target requires another compatible label source.",
    }
    (ROOT / "data/pretrial-audit.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
