"""Check the image ripeness proxy against the destructive % red labels.

- Labels with a ripeness breakdown: 22 Oct, 5 Nov, final harvest -> 6 compartments x 3 = 18 points.
- Leave-one-compartment-out (LOCO): fit % red = a + b*x on 5 compartments, predict the 6th.
- Compares x = image proxy, x = degree-days (climate-only reference), and both together.
- Writes image_validation.png: per-compartment daily calibrated image curve vs the labels.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
d = pd.read_csv(ROOT / "daily_features_img.csv", dtype={"compartment": str}, parse_dates=["date"])
d = d.sort_values(["compartment", "date"]).reset_index(drop=True)
d["temp_sum"] = d.groupby("compartment")["T_mean"].transform(lambda s: s.clip(lower=0).fillna(0).cumsum())
lab = d[d["label_pct_red_count"].notna()].copy()
y = "label_pct_red_count"


def loco(cols):
    preds = pd.Series(index=lab.index, dtype=float)
    for c in lab["compartment"].unique():
        tr, te = lab[lab.compartment != c], lab[lab.compartment == c]
        X = np.column_stack([np.ones(len(tr))] + [tr[k] for k in cols])
        beta, *_ = np.linalg.lstsq(X, tr[y], rcond=None)
        Xt = np.column_stack([np.ones(len(te))] + [te[k] for k in cols])
        preds[te.index] = np.clip(Xt @ beta, 0, 100)
    err = preds - lab[y]
    return preds, float(err.abs().mean()), float(np.corrcoef(preds, lab[y])[0, 1])


rows = []
for name, cols in [("degree-days base 10 only", ["degree_days"]),
                   ("temp sum + light sum (climate model)", ["temp_sum", "light_sum"]),
                   ("image ripe_px (raw)", ["img_ripe_px"]),
                   ("image ripe_px (3-day trailing median)", ["img_ripe_px_trail3"]),
                   ("image canopy top (trailing)", ["img_canopy_top_trail3"]),
                   ("temp sum + image", ["temp_sum", "img_ripe_px_trail3"]),
                   ("temp sum + light sum + image", ["temp_sum", "light_sum", "img_ripe_px_trail3"])]:
    ok = lab[cols].notna().all(axis=1)
    if not ok.all():
        print(f"{name}: {(~ok).sum()} label rows missing a feature -> skipped")
        continue
    _, mae, r = loco(cols)
    rows.append((name, mae, r))
res = pd.DataFrame(rows, columns=["predictor", "LOCO MAE (% red points)", "LOCO r"])
print(res.round(2).to_string(index=False))
print("\nPer label row:")
print(lab[["team", "date", y, "img_ripe_px", "img_ripe_px_trail3", "img_led_dominated", "degree_days"]].round(2).to_string(index=False))

# calibration on all 18 for the plot (descriptive only)
X = np.column_stack([np.ones(len(lab)), lab["img_ripe_px_trail3"]])
beta, *_ = np.linalg.lstsq(X, lab[y], rcond=None)
d["img_pct_red_cal"] = np.clip(beta[0] + beta[1] * d["img_ripe_px_trail3"], 0, 100)

colors = {"Tomatonuts": "#2a78d6", "MuGrow": "#eb6834", "Agrifusion": "#1baf7a",
          "Reference": "#eda100", "IDEAS": "#e87ba4", "Trigger": "#008300"}
fig, axes = plt.subplots(2, 3, figsize=(13, 6.5), sharex=True, sharey=True)
for ax, (team, g) in zip(axes.flat, d.groupby("team", sort=False)):
    g = g[g.date >= "2024-10-01"]
    led = g["img_led_dominated"] == True
    ax.plot(g.date, g.img_pct_red_cal, color=colors[team], lw=2, label="image (calibrated)")
    ax.scatter(g.date[led], g.img_pct_red_cal[led], s=14, facecolor="white", edgecolor=colors[team], zorder=3, label="LED-lit frame")
    l = g[g[y].notna()]
    ax.scatter(l.date, l[y], s=60, color="black", marker="D", zorder=4, label="hand-measured % red")
    ax.set_title(team, fontsize=11, loc="left")
    ax.grid(alpha=.25)
    ax.set_ylim(-3, 100)
for ax in axes[:, 0]:
    ax.set_ylabel("% fruit red")
axes.flat[0].legend(fontsize=8, loc="upper left", frameon=False)
fig.autofmt_xdate()
fig.suptitle(f"Image ripeness proxy vs destructive labels (calibration: %red = {beta[0]:.1f} + {beta[1]:.2f} x ripe_px, fit on all 18 points)", fontsize=10)
fig.tight_layout()
fig.savefig(ROOT / "image_validation.png", dpi=130)
print("\nwrote image_validation.png")
