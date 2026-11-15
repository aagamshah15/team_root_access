"""Climate-only ripening model: % red fruit (by count) as a logistic function of cumulative crop drivers.

    %red = 100 / (1 + exp(-(b0 + b1*x1 + b2*x2 ...)))      x = standardised running totals

Labels: compartment means from daily_features.csv on 22 Oct, 5 Nov and the final harvest (18 points),
plus 7 Oct set to 0% red (no breakdown was recorded that day, but every compartment was still 0%
red two weeks later on 22 Oct, so 0 is safe) -> 24 points.

Validation: leave-one-compartment-out (LOCO). Each compartment's curve is predicted by a model
that never saw that compartment. Uncertainty: bootstrap over compartments.

Outputs: ripening_model_results.csv, ripeness_predictions.csv, ripening_model.png
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
RNG = np.random.default_rng(7)
N_BOOT = 300

d = pd.read_csv(ROOT / "daily_features.csv", dtype={"compartment": str}, parse_dates=["date"])
d = d.sort_values(["compartment", "date"]).reset_index(drop=True)
# temperature sum with base 0 C (= running total of daily mean temperature). Base temperature was
# tuned by nested LOCO over 0-14 C (and -10/-5): 0 C won in every outer fold; base 10 C was clearly worse.
d["temp_sum"] = d.groupby("compartment")["T_mean"].transform(lambda s: s.clip(lower=0).fillna(0).cumsum())
lab = d[d["label_event"].notna()].copy()
lab["y"] = lab["label_pct_red_count"]
lab.loc[lab["date"] == "2024-10-07", "y"] = 0.0
lab = lab[lab["y"].notna()]

MODELS = {
    "calendar days (naive)": ["day"],
    "degree-days base 10 (baseline)": ["degree_days"],
    "light sum only": ["light_sum"],
    "temp sum base 0": ["temp_sum"],
    "temp sum + light sum": ["temp_sum", "light_sum"],
    "temp sum + light per plant": ["temp_sum", "light_per_plant"],
    "temp sum + light sum + CO2": ["temp_sum", "light_sum", "co2_ppm_days"],
}


def fit(train, cols):
    mu, sd = train[cols].mean(), train[cols].std().replace(0, 1)
    X = ((train[cols] - mu) / sd).to_numpy()
    yv = train["y"].to_numpy()

    def resid(b):
        z = b[0] + X @ b[1:]
        return 100 / (1 + np.exp(-z)) - yv

    b0 = np.r_[-2.0, np.full(len(cols), 2.0)]
    sol = least_squares(resid, b0, loss="soft_l1", f_scale=10)
    return sol.x, mu, sd


def predict(model, df, cols):
    b, mu, sd = model
    z = b[0] + ((df[cols] - mu) / sd).to_numpy() @ b[1:]
    return 100 / (1 + np.exp(-z))


def loco(cols):
    out = pd.Series(index=d.index, dtype=float)
    for c in d["compartment"].unique():
        m = fit(lab[lab.compartment != c], cols)
        idx = d.index[d.compartment == c]
        out[idx] = predict(m, d.loc[idx], cols)
    return out


rows, preds = [], {}
for name, cols in MODELS.items():
    p = loco(cols)
    preds[name] = p
    e = p[lab.index] - lab["y"]
    late = lab["date"] >= "2024-11-01"  # the part of the curve that matters for picking a harvest day
    rows.append({"model": name, "n_params": len(cols) + 1,
                 "LOCO MAE all (pts % red)": e.abs().mean(),
                 "LOCO MAE Nov+final": e[late].abs().mean(),
                 "LOCO RMSE": np.sqrt((e ** 2).mean()),
                 "worst compartment error": e.abs().groupby(lab["team"]).mean().max()})
res = pd.DataFrame(rows)
res.round(2).to_csv(ROOT / "ripening_model_results.csv", index=False)
print(res.round(2).to_string(index=False))

print("\nLOCO predictions at labelled dates (pts % red):")
show = lab[["team", "date", "y"]].copy()
for name in ["degree-days base 10 (baseline)", "temp sum base 0", "temp sum + light sum"]:
    show[name.split(" (")[0]] = preds[name][lab.index].round(1)
print(show[show.date >= "2024-10-22"].to_string(index=False))

# pick the model to carry forward: best late-season LOCO error
best = res.sort_values("LOCO MAE Nov+final").iloc[0]["model"]
base = "degree-days base 10 (baseline)"
print(f"\nBest late-season LOCO model: {best}")

# bootstrap over compartments for the LOCO-held-out curve band of the best model
cols = MODELS[best]
band = {}
for c in d["compartment"].unique():
    others = [k for k in d["compartment"].unique() if k != c]
    idx = d.index[d.compartment == c]
    sims = []
    for _ in range(N_BOOT):
        pick = RNG.choice(others, size=len(others), replace=True)
        tr = pd.concat([lab[lab.compartment == k] for k in pick])
        if tr["y"].max() < 1:
            continue
        sims.append(predict(fit(tr, cols), d.loc[idx], cols))
    sims = np.array(sims)
    # The compartment bootstrap only captures parameter uncertainty. Widen it by the held-out
    # residuals of the OTHER compartments (leave-one-out conformal style), scaled by 4p(1-p) so the
    # extra width is largest mid-ripening and vanishes near 0% / 100%.
    pl = preds[best][lab.index] / 100
    r = ((lab["y"] - preds[best][lab.index]).abs() / (4 * pl * (1 - pl)).clip(lower=0.05))
    q = np.quantile(r[(lab.compartment != c) & (lab.date >= "2024-10-22")], 0.8)
    p = preds[best][idx].to_numpy() / 100
    extra = q * 4 * p * (1 - p)
    band[c] = (np.clip(np.percentile(sims, 10, axis=0) - extra, 0, 100),
               np.clip(np.percentile(sims, 90, axis=0) + extra, 0, 100))

out = d[["team", "compartment", "date", "day", "degree_days", "temp_sum", "light_sum", "cost_m2_cum"]].copy()
out["pred_baseline"] = preds[base]
out["pred_best"] = preds[best]
out["pred_best_p10"] = np.nan
out["pred_best_p90"] = np.nan
for c, (lo, hi) in band.items():
    idx = out.index[out.compartment == c]
    out.loc[idx, "pred_best_p10"], out.loc[idx, "pred_best_p90"] = lo, hi
out["label_pct_red"] = np.nan
out.loc[lab.index, "label_pct_red"] = lab["y"]
out["model_best"] = best
o = out.copy()
o["date"] = o["date"].dt.strftime("%Y-%m-%d")
o.round(3).to_csv(ROOT / "ripeness_predictions.csv", index=False)

colors = {"Tomatonuts": "#2a78d6", "MuGrow": "#eb6834", "Agrifusion": "#1baf7a",
          "Reference": "#eda100", "IDEAS": "#e87ba4", "Trigger": "#008300"}
fig, axes = plt.subplots(2, 3, figsize=(13, 6.8), sharex=True, sharey=True)
for ax, (team, g) in zip(axes.flat, out.groupby("team", sort=False)):
    g = g[g.date >= "2024-10-01"]
    col = colors[team]
    ax.fill_between(g.date, g.pred_best_p10, g.pred_best_p90, color=col, alpha=.18, lw=0, label="80% band (bootstrap + held-out residuals)")
    ax.plot(g.date, g.pred_best, color=col, lw=2.2, label=best)
    ax.plot(g.date, g.pred_baseline, color="#666", lw=1.3, ls="--", label="degree-days base 10 (baseline)")
    l = g[g.label_pct_red.notna()]
    ax.scatter(l.date, l.label_pct_red, s=55, color="black", marker="D", zorder=4, label="hand-measured")
    ax.set_title(f"{team} (held out)", fontsize=11, loc="left")
    ax.grid(alpha=.25)
    ax.set_ylim(-3, 103)
for ax in axes[:, 0]:
    ax.set_ylabel("% fruit red")
axes.flat[0].legend(fontsize=7.5, loc="upper left", frameon=False)
fig.autofmt_xdate()
fig.suptitle("Leave-one-compartment-out ripening forecasts: each panel's curve comes from a model that never saw that compartment", fontsize=10)
fig.tight_layout()
fig.savefig(ROOT / "ripening_model.png", dpi=130)
print("wrote ripening_model.png, ripeness_predictions.csv, ripening_model_results.csv")
