"""Profit curve and harvest-day recommendation ("Pick Day").

Net profit, exactly as the challenge defines it (Maree et al. 2025, eq. 1; reproduces Table 1 to the cent):
    NP(D) [EUR/m2/day] = (P(D) - 0.75 - sum_{d<=D} cost_per_pot_d) / sum_{d<=D} area_per_pot_d
Price per pot P (paper Fig. 3, read off the chart; caps confirmed against Table 1 gains):
    0 if <33% of fruits red or red fruit < 50 g/pot;
    50->80 g: linear 0 -> 1.60 (dry matter <=7%) / 1.80 (>=8%)
    80->150 g: linear -> 1.80 / 2.00, flat above 150 g; dry matter 7-8% interpolated.

Forecasts (leave-one-compartment-out, so each compartment is forecast by a model that never saw it):
    % red (count)          from ripeness_predictions.csv (temp sum + light sum logistic)
    red fruit g per pot    fitted here: K / (1 + exp(-(b0 + b1*temp_sum + b2*light_sum)))
Uncertainty: Monte Carlo over the forecast bands. Recommended day = highest EXPECTED net profit,
which automatically penalises days where the pot might still be unsellable (<33% red).

Check against reality: the paper's method (linear interpolation of the hand measurements between
sampling dates) gives a "measured" profit curve for each team, used to score our recommended day.

Assumptions: dry matter = each team's measured final value (unknowable before harvest, as in the
paper); future climate is taken as it actually happened (perfect weather forecast); 33% rule applied
to fruit COUNT (stricter than the weight-based % in Table 1).

Outputs: profit_curves.csv, harvest_recommendations.csv, harvest_day.png
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
TS = ROOT / "autonomous_greenhouse_challenge4_timeseries" / "timeseries"
RNG = np.random.default_rng(11)
N_MC = 4000
POT_COST = 0.75
TEAMS = {"tomatonuts": "Tomatonuts", "mugrow": "MuGrow", "agrifusion": "Agrifusion",
         "reference": "Reference", "ideas": "IDEAS", "trigger": "Trigger"}
COLORS = {"Tomatonuts": "#2a78d6", "MuGrow": "#eb6834", "Agrifusion": "#1baf7a",
          "Reference": "#eda100", "IDEAS": "#e87ba4", "Trigger": "#008300"}


def price(fw_red, dm_pct):
    fw = np.asarray(fw_red, dtype=float)
    lo = np.interp(fw, [0, 50, 80, 150, 1e9], [0, 0, 1.60, 1.80, 1.80])
    hi = np.interp(fw, [0, 50, 80, 150, 1e9], [0, 0, 1.80, 2.00, 2.00])
    w = np.clip(dm_pct - 7.0, 0, 1)
    return lo + w * (hi - lo)


# ---------- daily cost per pot and area per pot, straight from the timeseries ----------
def daily_costs():
    rows = []
    for key, name in TEAMS.items():
        df = pd.read_csv(TS / f"{key}.csv").replace(1e-10, 0)
        df["date"] = pd.to_datetime(df["time"], utc=True).dt.tz_convert("Europe/Amsterdam").dt.tz_localize(None).dt.normalize()
        g = df.groupby("date")
        c = sum(g[f"economics/{k}.per_pot"].sum() for k in ["fixed_costs", "heating_costs", "co2_costs", "lighting_costs"])
        dens = g["dwarf_tomato/plant_density"].last().ffill().bfill()
        rows.append(pd.DataFrame({"team": name, "date": c.index, "cost_pot": c.values, "area_pot": 1 / dens.values}))
    out = pd.concat(rows)
    out["cost_pot_cum"] = out.groupby("team")["cost_pot"].cumsum()
    out["area_pot_cum"] = out.groupby("team")["area_pot"].cumsum()
    return out


# ---------- red fruit weight forecast (LOCO) ----------
d = pd.read_csv(ROOT / "daily_features.csv", dtype={"compartment": str}, parse_dates=["date"]).sort_values(["compartment", "date"]).reset_index(drop=True)
d["temp_sum"] = d.groupby("compartment")["T_mean"].transform(lambda s: s.clip(lower=0).fillna(0).cumsum())
lab = d[d["label_event"].notna()].copy()
lab["fw"] = lab["label_fw_red"]
lab.loc[lab["date"] == "2024-10-07", "fw"] = 0.0  # no breakdown that day; still 0 g red two weeks later
COLS = ["temp_sum", "light_sum"]


def fit_fw(tr):
    mu, sd = tr[COLS].mean(), tr[COLS].std()
    X = ((tr[COLS] - mu) / sd).to_numpy()
    yv = tr["fw"].to_numpy()

    def res(b):
        return b[0] / (1 + np.exp(-(b[1] + X @ b[2:]))) - yv

    sol = least_squares(res, np.r_[280, -1, 2, 1], bounds=([150, -20, -20, -20], [450, 20, 20, 20]), loss="soft_l1", f_scale=20)
    b = sol.x
    return lambda df: b[0] / (1 + np.exp(-(b[1] + ((df[COLS] - mu) / sd).to_numpy() @ b[2:])))


rp = pd.read_csv(ROOT / "ripeness_predictions.csv", dtype={"compartment": str}, parse_dates=["date"])
d = d.merge(rp[["compartment", "date", "pred_best"]], on=["compartment", "date"])
lab = lab.merge(rp[["compartment", "date", "pred_best"]], on=["compartment", "date"])


def logit(p):
    p = np.clip(p, 0.5, 99.5)
    return np.log(p / (100 - p))


# Red fruit weight follows ripeness: fw = a*red + b*red^2 (fit on the measured pairs, LOCO).
# Held-out error from TRUE % red is 13 g, far better than a separate weight-vs-climate curve (31 g).
# Ripeness uncertainty: held-out residuals in log-odds space, which are roughly constant in size
# (unlike % residuals, which shrink near 0 and 100). Both are leave-one-compartment-out.
pairs = lab[lab.date >= "2024-10-22"]
late = lab[lab.date >= "2024-11-01"]
coef, sd_logit, sd_fw = {}, {}, {}
for c in d.compartment.unique():
    tr = pairs[pairs.compartment != c]
    A = np.c_[tr.label_pct_red_count, tr.label_pct_red_count ** 2]
    coef[c], *_ = np.linalg.lstsq(A, tr.fw, rcond=None)
    sd_fw[c] = float(np.std(A @ coef[c] - tr.fw, ddof=2))
    lt = late[late.compartment != c]
    sd_logit[c] = float(np.sqrt(np.mean((logit(lt.pred_best) - logit(lt.label_pct_red_count)) ** 2)))
d["fw_pred"] = [coef[c] @ [r, r * r] for c, r in zip(d.compartment, d.pred_best)]
e = [coef[c] @ [r, r * r] - f for c, r, f in zip(lab.compartment, lab.pred_best, lab.fw)]
lm = (lab.date >= "2024-11-01").to_numpy()
print(f"Red fruit weight (from forecast % red) LOCO MAE: Nov+final {np.mean(np.abs(np.array(e)[lm])):.1f} g")
print("ripeness sd (log-odds) by held-out compartment:", {k: round(v, 2) for k, v in sd_logit.items()})
dm = lab[lab.label_event == "final"].set_index("team")["label_dw_pct_red"]
costs = daily_costs()
d = d.merge(costs, on=["team", "date"], how="left")


# ---------- measured ("truth") curve: paper's method, linear interpolation between samplings ----------
def measured_curve(g):
    L = lab[lab.team == g.team.iloc[0]].sort_values("date")
    L = L[L.date >= "2024-10-22"]
    t = (g.date - g.date.min()).dt.days.to_numpy()
    tl = (L.date - g.date.min()).dt.days.to_numpy()
    red = np.interp(t, tl, L.label_pct_red_count.to_numpy(), left=0, right=np.nan)
    fw = np.interp(t, tl, L.fw.to_numpy(), left=0, right=np.nan)
    return red, fw


rows, recs = [], []
for team, g in d.groupby("team", sort=False):
    g = g.sort_values("date").reset_index(drop=True)
    g = g[g.date <= g.date.max()]  # up to the team's actual harvest day
    dmp = float(dm[team])
    c = g.compartment.iloc[0]
    rng = np.random.default_rng(11)  # same draws per compartment as the dashboard (app.py)
    z = rng.standard_normal(N_MC)   # ripeness error, persistent across days (a curve that is early stays early)
    zf = rng.standard_normal(N_MC)  # weight-given-ripeness error
    exp_np, p_sell, np10, np90 = [], [], [], []
    for _, r in g.iterrows():
        red = 100 / (1 + np.exp(-(logit(r.pred_best) + z * sd_logit[c])))
        fw = np.clip(coef[c][0] * red + coef[c][1] * red ** 2 + zf * sd_fw[c], 0, None)
        P = np.where(red >= 33, price(fw, dmp), 0.0)
        npv = (P - POT_COST - r.cost_pot_cum) / r.area_pot_cum
        exp_np.append(npv.mean()); p_sell.append((red >= 33).mean())
        np10.append(np.percentile(npv, 10)); np90.append(np.percentile(npv, 90))
    g["np_expected"], g["p_sellable"], g["np_p10"], g["np_p90"] = exp_np, p_sell, np10, np90
    g["np_point"] = np.where(g.pred_best >= 33, price(g.fw_pred, dmp), 0) - POT_COST - g.cost_pot_cum
    g["np_point"] = g["np_point"] / g["area_pot_cum"]
    mr, mf = measured_curve(g)
    g["red_measured"], g["fw_measured"] = mr, mf
    g["np_measured"] = (np.where(mr >= 33, price(mf, dmp), 0) - POT_COST - g.cost_pot_cum) / g.area_pot_cum
    g["cost_of_waiting_day"] = g["np_expected"].shift(-1) - g["np_expected"]
    rows.append(g)

    window = g[g.date >= "2024-10-20"]
    rec = window.loc[window.np_expected.idxmax()]
    meas_opt = window.loc[window.np_measured.idxmax()]
    actual = g.iloc[-1]
    recs.append({
        "team": team, "dry_matter_pct": dmp,
        "actual_harvest": actual.date.date(), "actual_np": actual.np_measured,
        "recommended_day": rec.date.date(), "days_earlier": (actual.date - rec.date).days,
        "p_sellable_at_rec": rec.p_sellable, "forecast_red_pct_at_rec": rec.pred_best, "forecast_red_g_at_rec": rec.fw_pred,
        "expected_np_at_rec": rec.np_expected,
        "measured_np_at_rec": rec.np_measured,
        "gain_vs_actual_pct": 100 * (rec.np_measured - actual.np_measured) / actual.np_measured,
        "hindsight_best_day": meas_opt.date.date(), "hindsight_days_earlier": (actual.date - meas_opt.date).days,
        "hindsight_best_np": meas_opt.np_measured,
    })

curves = pd.concat(rows)
recs = pd.DataFrame(recs)
out = curves[["team", "compartment", "date", "pred_best", "fw_pred", "p_sellable", "np_expected",
              "np_p10", "np_p90", "np_point", "red_measured", "fw_measured", "np_measured", "cost_pot_cum",
              "area_pot_cum", "cost_of_waiting_day"]].copy()
out["date"] = out["date"].dt.strftime("%Y-%m-%d")
out.round(4).to_csv(ROOT / "profit_curves.csv", index=False)
recs.round(3).to_csv(ROOT / "harvest_recommendations.csv", index=False)
import json
json.dump({c: {"sd_logit": sd_logit[c], "fw_a": float(coef[c][0]), "fw_b": float(coef[c][1]), "sd_fw": sd_fw[c],
               "dry_matter_measured": float(dm[d.loc[d.compartment == c, "team"].iloc[0]])} for c in coef},
          open(ROOT / "model_params.json", "w"), indent=1)
pd.set_option("display.width", 250)
print(recs.round(3).to_string(index=False))
print(f"\nCheck: actual NP from measured curve vs Table 1 -> " + ", ".join(f"{r.team} {r.actual_np:.3f}" for r in recs.itertuples()))

# ---------- plot ----------
fig, axes = plt.subplots(2, 3, figsize=(13.5, 7), sharex=True, sharey=True)
for ax, (team, g) in zip(axes.flat, curves.groupby("team", sort=False)):
    g = g[g.date >= "2024-10-25"]
    col = COLORS[team]
    r = recs[recs.team == team].iloc[0]
    ax.fill_between(g.date, g.np_p10, g.np_p90, color=col, alpha=.15, lw=0, label="forecast 80% band")
    ax.plot(g.date, g.np_expected, color=col, lw=2.2, label="forecast (expected)")
    ax.plot(g.date, g.np_measured, color="black", lw=1.2, ls="--", label="measured (interpolated)")
    ax.axhline(0, color="#999", lw=.8)
    rd = pd.Timestamp(r.recommended_day)
    ax.scatter([rd], [g.loc[g.date == rd, "np_expected"].iloc[0]], s=110, marker="*", color=col, edgecolor="black", zorder=5, label="recommended day")
    ax.scatter([g.date.iloc[-1]], [g.np_measured.iloc[-1]], s=45, color="white", edgecolor="black", zorder=5, label="team's actual harvest")
    ax.set_title(f"{team}: pick {rd:%d %b} ({r.days_earlier} d earlier, {r.gain_vs_actual_pct:+.0f}%)", fontsize=10, loc="left")
    ax.grid(alpha=.25)
    ax.set_ylim(-0.4, 0.5)
for ax in axes[:, 0]:
    ax.set_ylabel("net profit (EUR/m²/day)")
axes.flat[0].legend(fontsize=7.5, loc="lower right", frameon=False)
fig.autofmt_xdate()
fig.suptitle("Net profit if harvested on each day. Forecast is leave-one-compartment-out; % gain is scored on the measured curve.", fontsize=10)
fig.tight_layout()
fig.savefig(ROOT / "harvest_day.png", dpi=130)
print("wrote harvest_day.png, profit_curves.csv, harvest_recommendations.csv")
