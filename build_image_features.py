"""Daily image features from the 12:00 canopy frames -> image_features.csv, plus
daily_features_img.csv (daily_features.csv with the image columns joined on).

Ripeness proxy `ripe_px` (lamp-robust):
  chromaticity r = R/(R+G+B) per pixel; the frame median is dominated by leaves, so it acts as
  an in-frame reference for whatever the lighting is (sun, red/blue LEDs, or a mix).
  ripe_px = % of pixels with r - median(r) > 0.16.
  Chosen on a 10-frame sample: same plants at 04/08/12/16h (LED vs sun) varied +-17%;
  across six cameras at 12:00 on 5 Nov it tracked destructive % red with Pearson 0.93.
  Known flaws: LED frames count fruit edges, not blown-out centres; bright pink leaves add noise.

Canopy from depth (16-bit PNG, millimetres from camera, 0 = no reading):
  canopy_top_mm = 10th percentile distance, canopy_med_mm = median distance (smaller = taller).

Run after fetch_noon_images.py:  python3 build_image_features.py
"""
import re
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parent
IMG = ROOT / "data" / "agc4" / "images_noon"
TS = ROOT / "autonomous_greenhouse_challenge4_timeseries" / "timeseries"
CAMS = {"camir_27": ("tomatonuts", "Tomatonuts", "3.01"), "cam_21": ("mugrow", "MuGrow", "3.02"),
        "cam_20": ("agrifusion", "Agrifusion", "3.03"), "cam_1": ("reference", "Reference", "3.06"),
        "cam_19": ("ideas", "IDEAS", "3.07"), "cam_18": ("trigger", "Trigger", "3.08")}
PAT = re.compile(r"(cam\w*?_\d+)_(\d{4}_\d\d_\d\d_\d\d_\d\d_\d\d)_(rgb|depth)")
R_MARGIN = 0.16
LAMP_CAST = 0.15  # frame median (R-G)/(R+G+B) above this = LED-dominated colour


def rgb_feats(path):
    a = np.asarray(Image.open(path).convert("RGB").resize((960, 540)), dtype=np.float32) / 255 + 1e-3
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    S = R + G + B
    r, g = R / S, G / S
    rm = float(np.median(r))
    rg_med = float(np.median((R - G) / S))
    return {
        "ripe_px": float(((r - rm) > R_MARGIN).mean() * 100),
        "ripe_px_strict": float(((r - rm) > R_MARGIN + 0.04).mean() * 100),
        "cast_rg": rg_med,
        "chroma_r_med": rm,
        "chroma_g_med": float(np.median(g)),
        "brightness": float(S.mean() / 3),
        "led_dominated": rg_med > LAMP_CAST,
    }


def depth_feats(path):
    d = np.asarray(Image.open(path)).astype(np.float32)
    v = d[(d > 300) & (d < 3000)]
    if v.size < 1000:
        return {"canopy_top_mm": np.nan, "canopy_med_mm": np.nan, "depth_valid": v.size / d.size}
    return {"canopy_top_mm": float(np.percentile(v, 10)), "canopy_med_mm": float(np.median(v)),
            "depth_valid": float(v.size / d.size)}


def one(path):
    m = PAT.search(path.name)
    cam, stamp, kind = m.groups()
    ts = pd.to_datetime(stamp, format="%Y_%m_%d_%H_%M_%S")
    f = rgb_feats(path) if kind == "rgb" else depth_feats(path)
    return {"cam": cam, "time": ts, "kind": kind, **f}


def lamp_at_frames(df):
    """Lamp % and PAR in the compartment at each frame's timestamp (nearest 5-min reading)."""
    out = []
    for cam, g in df.groupby("cam"):
        key = CAMS[cam][0]
        ts = pd.read_csv(TS / f"{key}.csv", usecols=["time", "compartment/par", "compartment/lamps_activation_percentage"])
        ts["time"] = pd.to_datetime(ts["time"], utc=True).dt.tz_convert("Europe/Amsterdam").dt.tz_localize(None)
        ts = ts.replace(1e-10, 0).sort_values("time")
        g = g.sort_values("time")
        m = pd.merge_asof(g[["cam", "time"]], ts, on="time", direction="nearest", tolerance=pd.Timedelta("10min"))
        out.append(m.rename(columns={"compartment/par": "frame_par", "compartment/lamps_activation_percentage": "frame_lamp_pct"}))
    return pd.concat(out)


def main():
    files = sorted(IMG.glob("rgb/*/*.jpg")) + sorted(IMG.glob("depth/*/*.png"))
    with ProcessPoolExecutor() as ex:
        rows = list(ex.map(one, files, chunksize=8))
    df = pd.DataFrame(rows)
    df["date"] = df["time"].dt.normalize()
    rgb = df[df.kind == "rgb"].drop(columns=["kind"]).dropna(axis=1, how="all")
    dep = df[df.kind == "depth"][["cam", "date", "canopy_top_mm", "canopy_med_mm", "depth_valid"]]
    img = rgb.merge(dep, on=["cam", "date"], how="outer")
    img = img.merge(lamp_at_frames(img.dropna(subset=["time"])), on=["cam", "time"], how="left")
    img["team"] = img["cam"].map(lambda c: CAMS[c][1])
    img["compartment"] = img["cam"].map(lambda c: CAMS[c][2])
    img = img.sort_values(["compartment", "date"])
    # The 12:00 frame on harvest day shows cleared tables (canopy distance jumps ~400 mm, red ~0):
    # plants were harvested that morning. Drop frames from the harvest day onward.
    hd = pd.read_csv(ROOT / "daily_features.csv", dtype={"compartment": str}, parse_dates=["date"]).groupby("compartment")["date"].max()
    after = img["date"] >= img["compartment"].map(hd)
    feat_cols = ["ripe_px", "ripe_px_strict", "cast_rg", "chroma_r_med", "chroma_g_med", "brightness", "canopy_top_mm", "canopy_med_mm", "depth_valid"]
    img.loc[after, feat_cols] = np.nan
    img["led_dominated"] = img["led_dominated"].astype("boolean").mask(after)
    # 3-day centred rolling median: damps day-to-day lighting noise without using future days far ahead
    img["ripe_px_med3"] = img.groupby("compartment")["ripe_px"].transform(lambda s: s.rolling(3, center=True, min_periods=1).median())
    # causal version for leakage-safe forecasting (uses today and the two previous frames only)
    img["ripe_px_trail3"] = img.groupby("compartment")["ripe_px"].transform(lambda s: s.rolling(3, min_periods=1).median())
    img["canopy_top_trail3"] = img.groupby("compartment")["canopy_top_mm"].transform(lambda s: s.rolling(3, min_periods=1).median())
    cols = ["team", "compartment", "cam", "date", "time", "ripe_px", "ripe_px_strict", "ripe_px_med3", "ripe_px_trail3",
            "led_dominated", "cast_rg", "chroma_r_med", "chroma_g_med", "brightness", "frame_lamp_pct", "frame_par",
            "canopy_top_mm", "canopy_med_mm", "canopy_top_trail3", "depth_valid"]
    img = img[cols]
    out = img.copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out.round(4).to_csv(ROOT / "image_features.csv", index=False)

    daily = pd.read_csv(ROOT / "daily_features.csv", dtype={"compartment": str})
    j = out.drop(columns=["team", "cam", "time"]).rename(columns={c: "img_" + c for c in cols if c not in ("team", "compartment", "cam", "date", "time")})
    daily = daily.merge(j, on=["compartment", "date"], how="left")
    daily.to_csv(ROOT / "daily_features_img.csv", index=False)
    print(f"image_features.csv: {len(out)} frames-days; daily_features_img.csv: {daily.shape}, "
          f"{daily['img_ripe_px'].notna().sum()} days with an image")


if __name__ == "__main__":
    main()
