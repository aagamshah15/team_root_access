"""Pick Day: harvest-day decision dashboard for single-harvest dwarf tomatoes.

Run:  streamlit run app.py
Needs the outputs of build_daily_features.py, ripening_model.py and harvest_day.py.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import waste_audit as WA

ROOT = Path(__file__).resolve().parent
POT_COST = 0.75
COLORS = {"Tomatonuts": "#2a78d6", "MuGrow": "#eb6834", "Agrifusion": "#1baf7a",
          "Reference": "#eda100", "IDEAS": "#e87ba4", "Trigger": "#008300"}
INK, MUTED, RED, GRID = "#8f9b94", "#7f8a84", "#d9534f", "rgba(120,130,125,0.18)"  # mid-tones: readable on light and dark themes

st.set_page_config(page_title="Pick Day", page_icon="🍅", layout="wide")


# ---------------- data ----------------
@st.cache_data
def load(file_versions):  # file mtimes as the cache key: re-running the scripts refreshes the dashboard
    pc = pd.read_csv(ROOT / "profit_curves.csv", dtype={"compartment": str}, parse_dates=["date"])
    rp = pd.read_csv(ROOT / "ripeness_predictions.csv", dtype={"compartment": str}, parse_dates=["date"])
    df = pd.read_csv(ROOT / "daily_features.csv", dtype={"compartment": str}, parse_dates=["date"])
    recs = pd.read_csv(ROOT / "harvest_recommendations.csv", parse_dates=["actual_harvest", "recommended_day", "hindsight_best_day"])
    res = pd.read_csv(ROOT / "ripening_model_results.csv")
    params = json.load(open(ROOT / "model_params.json"))
    pc = pc.merge(rp[["compartment", "date", "pred_baseline", "label_pct_red"]], on=["compartment", "date"], how="left")
    pc = pc.merge(df[["compartment", "date", "T_mean", "DLI", "label_fw_red", "label_event"]], on=["compartment", "date"], how="left")
    return pc, recs, res, params


def price(fw, dm):
    lo = np.interp(fw, [0, 50, 80, 150, 1e9], [0, 0, 1.60, 1.80, 1.80])
    hi = np.interp(fw, [0, 50, 80, 150, 1e9], [0, 0, 1.80, 2.00, 2.00])
    return lo + np.clip(dm - 7.0, 0, 1) * (hi - lo)


def logit(p):
    p = np.clip(p, 0.5, 99.5)
    return np.log(p / (100 - p))


@st.cache_data
def simulate(comp, dm, file_versions, n=4000, seed=11):
    """Monte Carlo over the held-out forecast error for every candidate harvest day."""
    g = PC[PC.compartment == comp].sort_values("date").reset_index(drop=True)
    p = PARAMS[comp]
    rng = np.random.default_rng(seed)
    z, zf = rng.standard_normal(n), rng.standard_normal(n)
    out = []
    for r in g.itertuples():
        red = 100 / (1 + np.exp(-(logit(r.pred_best) + z * p["sd_logit"])))
        fw = np.clip(p["fw_a"] * red + p["fw_b"] * red ** 2 + zf * p["sd_fw"], 0, None)
        prof = (np.where(red >= 33, price(fw, dm), 0.0) - POT_COST - r.cost_pot_cum) / r.area_pot_cum
        out.append((prof.mean(), np.percentile(prof, 10), np.percentile(prof, 90), (red >= 33).mean(),
                    np.percentile(red, 10), np.percentile(red, 90), np.percentile(fw, 10), np.percentile(fw, 90)))
    s = pd.DataFrame(out, columns=["exp", "p10", "p90", "p_sell", "red_lo", "red_hi", "fw_lo", "fw_hi"])
    g = pd.concat([g, s], axis=1)
    g["np_measured_dm"] = (np.where(g.red_measured >= 33, price(g.fw_measured.fillna(0), dm), 0) - POT_COST - g.cost_pot_cum) / g.area_pot_cum
    return g


DATA_FILES = ["profit_curves.csv", "ripeness_predictions.csv", "daily_features.csv", "harvest_recommendations.csv",
              "ripening_model_results.csv", "model_params.json"]
PC, RECS, RES, PARAMS = load(tuple((ROOT / f).stat().st_mtime for f in DATA_FILES))
teams = RECS.team.tolist()

# ---------------- sidebar ----------------
with st.sidebar:
    st.markdown("### Pick Day")
    team = st.selectbox("Greenhouse compartment", teams, index=teams.index("Agrifusion"),
                        format_func=lambda t: f"{t} ({PC.loc[PC.team == t, 'compartment'].iloc[0]})")
    comp = PC.loc[PC.team == team, "compartment"].iloc[0]
    dm_meas = PARAMS[comp]["dry_matter_measured"]
    dm = st.slider("Expected fruit dry matter (%)", 5.5, 8.5, float(round(dm_meas, 1)), 0.1,
                   help="Sets the price tier: 7% or lower pays the low price, 8% or higher the high price. "
                        f"Default is this compartment's measured value ({dm_meas:.1f}%).")
    risk = st.select_slider("Minimum chance the pot is sellable", options=["best average", "90%", "95%", "99%"],
                            value="best average",
                            help="'Best average' maximises expected profit. A percentage only allows days where the "
                                 "forecast gives at least that chance of 33% or more red fruit.")
    show_measured = st.toggle("Show measured profit (hindsight)", value=True,
                              help="Built from the hand-harvested samples, interpolated between sampling dates. "
                                   "A grower would not have this; it is here to score the forecast.")
    st.caption("Data: 4th Autonomous Greenhouse Challenge, WUR 2024 (CC BY 4.0). "
               "Each compartment's forecast comes from a model trained on the other five.")

sim = simulate(comp, dm, tuple((ROOT / f).stat().st_mtime for f in DATA_FILES))
win = sim[sim.date >= "2024-10-25"].copy()
thr = {"best average": 0.0, "90%": 0.90, "95%": 0.95, "99%": 0.99}[risk]
ok = win[win.p_sell >= thr]
rec_row = (ok if len(ok) else win).loc[(ok if len(ok) else win)["exp"].idxmax()]
actual_row = sim.iloc[-1]
rec_day, act_day = rec_row.date, actual_row.date
nxt = sim[sim.date == rec_day + pd.Timedelta(days=1)]
wait_cost = (nxt["exp"].iloc[0] - rec_row["exp"]) if len(nxt) else np.nan
col = COLORS[team]

# ---------------- header ----------------
st.markdown(f"## Pick Day · {team}")
st.markdown("Dwarf tomatoes are harvested once. Pick too early and the pots are unsellable; pick too late and "
            "lamps, heat and greenhouse space keep costing money. This forecasts ripeness and red fruit weight "
            "from the climate the crop has received, and finds the day with the best expected profit.")

k1, k2, k3, k4 = st.columns(4)
k1.metric("Recommended harvest day", f"{rec_day:%a %d %b}",
          f"{(act_day - rec_day).days} days before the team's pick" if act_day > rec_day else "same day as the team's pick",
          delta_color="off")
gain = rec_row["exp"] - actual_row["exp"]
k2.metric("Expected profit (€/m²/day)", f"€{rec_row['exp']:.3f}",
          f"{gain / abs(actual_row['exp']) * 100:+.0f}% vs harvesting {act_day:%d %b}" if gain > 1e-9 else f"same as harvesting {act_day:%d %b}")
k3.metric("Chance the pot is sellable", f"{rec_row['p_sell'] * 100:.0f}%",
          f"forecast {rec_row['pred_best']:.0f}% red, {rec_row['fw_pred']:.0f} g red/pot", delta_color="off")
k4.metric("Waiting one more day", f"{wait_cost / abs(rec_row['exp']) * 100:+.1f}%" if np.isfinite(wait_cost) else "n/a",
          f"€{wait_cost:+.4f}/m²/day of expected profit" if np.isfinite(wait_cost) else "last day of data", delta_color="off")

if rec_row["p_sell"] < 0.95:
    st.warning(f"Low confidence: only a {rec_row['p_sell'] * 100:.0f}% chance that a third of the fruit is red on "
               f"{rec_day:%d %b}. Consider a quick destructive check of a few pots before harvesting.")
if rec_day == act_day:
    st.info("The forecast does not see enough evidence to harvest earlier than the team did."
            + (" This is a known miss: the model under-predicts how fast this compartment ripened "
               "(58% red forecast vs 70% measured at harvest)." if team == "Reference" else ""))


def style(fig, ytitle, h=330):
    fig.update_layout(height=h, margin=dict(l=10, r=10, t=30, b=10), hovermode="x unified",
                      legend=dict(orientation="h", y=1.12, x=0, font=dict(size=11)),
                      yaxis_title=ytitle, xaxis=dict(showgrid=True, gridcolor=GRID), yaxis=dict(showgrid=True, gridcolor=GRID))
    return fig


def mark_days(fig, y_rec, y_act):
    fig.add_trace(go.Scatter(x=[rec_day], y=[y_rec], mode="markers", name="Recommended day",
                             marker=dict(symbol="star", size=17, color=col, line=dict(color=INK, width=1))))
    fig.add_trace(go.Scatter(x=[act_day], y=[y_act], mode="markers", name="Team's actual harvest",
                             marker=dict(symbol="circle-open", size=12, color=INK, line=dict(width=2))))


tab1, tab_w, tab2, tab3, tab4 = st.tabs(["Harvest decision", "Waste audit", "What drives the forecast",
                                         "Season replay (all teams)", "How it works"])

# ---------------- tab 1 ----------------
with tab1:
    fig = go.Figure()
    w = win[win.date >= "2024-11-01"]
    fig.add_trace(go.Scatter(x=w.date, y=w["exp"], name="Expected profit (forecast)", line=dict(color=col, width=3),
                             hovertemplate="€%{y:.3f}/m²/day"))
    if show_measured:
        fig.add_trace(go.Scatter(x=w.date, y=w.np_measured_dm, name="Measured (hindsight)",
                                 line=dict(color=INK, width=1.5, dash="dash"), hovertemplate="€%{y:.3f}"))
    fig.add_hline(y=0, line=dict(color=MUTED, width=1))
    mark_days(fig, rec_row["exp"], actual_row["np_measured_dm"] if show_measured else actual_row["exp"])
    style(fig, "net profit (€/m²/day)", 380)
    fig.update_yaxes(range=[-0.45, max(w["exp"].max(), w.np_measured_dm.max()) + 0.08])
    st.markdown("**Net profit if you harvest on each day**")
    st.plotly_chart(fig, width="stretch", theme="streamlit")
    st.caption("Profit is the challenge's own formula: price per pot minus plant and running costs, per m² per day of "
               "cultivation. The cliff on the left is the 33%-red rule: below it the pots earn nothing.")

    w = win  # ripeness charts: show the run-up from 25 Oct
    c1, c2 = st.columns(2)
    with c1:
        f2 = go.Figure()
        f2.add_trace(go.Scatter(x=pd.concat([w.date, w.date[::-1]]), y=pd.concat([w.red_hi, w.red_lo[::-1]]), fill="toself",
                                fillcolor=col, opacity=0.18, line=dict(width=0), name="80% range", hoverinfo="skip"))
        f2.add_trace(go.Scatter(x=w.date, y=w.pred_best, name="Forecast", line=dict(color=col, width=3), hovertemplate="%{y:.0f}%"))
        f2.add_trace(go.Scatter(x=w.date, y=w.pred_baseline, name="Textbook degree-days", line=dict(color=MUTED, width=1.5, dash="dot"),
                                hovertemplate="%{y:.0f}%"))
        lab = sim[sim.label_pct_red.notna() & (sim.date >= "2024-10-20")]
        f2.add_trace(go.Scatter(x=lab.date, y=lab.label_pct_red, mode="markers", name="Hand-measured",
                                marker=dict(symbol="diamond", size=10, color=INK)))
        f2.add_hline(y=33, line=dict(color=RED, width=1, dash="dash"), annotation_text="33%: sellable",
                     annotation_position="top left", annotation_font_color=RED)
        st.markdown("**Share of fruit that is red**")
        st.plotly_chart(style(f2, "% of fruits red"), width="stretch", theme="streamlit")
    with c2:
        f3 = go.Figure()
        f3.add_trace(go.Scatter(x=pd.concat([w.date, w.date[::-1]]), y=pd.concat([w.fw_hi, w.fw_lo[::-1]]), fill="toself",
                                fillcolor=col, opacity=0.18, line=dict(width=0), name="80% range", hoverinfo="skip"))
        f3.add_trace(go.Scatter(x=w.date, y=w.fw_pred, name="Forecast", line=dict(color=col, width=3), hovertemplate="%{y:.0f} g"))
        lab = sim[sim.label_fw_red.notna() & (sim.date >= "2024-10-20")]
        f3.add_trace(go.Scatter(x=lab.date, y=lab.label_fw_red, mode="markers", name="Hand-measured",
                                marker=dict(symbol="diamond", size=10, color=INK)))
        f3.add_hline(y=150, line=dict(color=MUTED, width=1, dash="dash"), annotation_text="150 g: full price",
                     annotation_position="top left")
        f3.add_hline(y=50, line=dict(color=RED, width=1, dash="dash"), annotation_text="50 g: minimum",
                     annotation_position="top left", annotation_font_color=RED)
        st.markdown("**Red fruit per pot**")
        st.plotly_chart(style(f3, "grams per pot"), width="stretch", theme="streamlit")

# ---------------- waste audit ----------------
RULE_COLORS = {"lamps_sun": "#eda100", "co2_vent": "#2a78d6", "heat_vent": "#d9534f", "screen_night": "#8e6bd1"}
RULE_CTX = {"lamps_sun": {"lamp": "Lamp level (%)", "sun_par_in": "Sun-only light inside (µmol/m²/s)"},
            "co2_vent": {"vent": "Window opening (%)", "co2": "CO₂ (ppm)"},
            "heat_vent": {"vent": "Window opening (%)", "rh": "Humidity (%)"},
            "screen_night": {"screen": "Screen closed (%)", "t_out": "Outside temp (°C)"}}
SPEND_OF = {"light_eur": "spend_light", "co2_eur": "spend_co2", "heat_eur": "spend_heat"}


@st.cache_resource
def wa_data():
    return WA.load()


@st.cache_data
def wa_run(params_items):
    data = wa_data()
    aud = {t: WA.audit(d, dict(params_items)) for t, d in data.items()}
    keep = [c for r in WA.RULES for c in (r, r + "_eur")] + [c for m in RULE_CTX.values() for c in m]
    return {t: a[list(dict.fromkeys(keep))] for t, a in aud.items()}, WA.summary(aud), WA.sensor_health(data)


with tab_w:
    st.markdown("Every 5 minutes the greenhouse logs what it spent on lamps, CO₂ and heat. This audit flags spending "
                "that the conditions say was probably not needed, and prices it with the dataset's own cost columns. "
                "Treat flags as **worth a look**, not proven waste: a grower can have good reasons.")
    with st.expander("Rule thresholds"):
        a1, a2, a3 = st.columns(3)
        p = dict(WA.DEFAULTS)
        p["sun_par"] = a1.slider("Lamps: flag when sun alone gives at least (µmol/m²/s inside)", 150, 600, int(p["sun_par"]), 25,
                                 help="The lamps give about 190 µmol/m²/s at full power. Sun-only light inside = outside PAR "
                                      "× this compartment's measured light transmission.")
        p["vent_co2"] = a2.slider("CO₂: flag dosing when windows open more than (%)", 5, 80, int(p["vent_co2"]), 5)
        p["vent_heat"] = a3.slider("Heating: flag when windows open more than (%)", 5, 80, int(p["vent_heat"]), 5)
        b1, b2, b3 = st.columns(3)
        p["rh_heat"] = b1.slider("...and humidity below (%)", 60, 95, int(p["rh_heat"]), 1,
                                 help="Heating with the windows open is a normal way to dry out humid air. Only flagged when the air is not humid.")
        p["night_tout"] = b2.slider("Screen: cold night = outside below (°C)", 0, 15, int(p["night_tout"]), 1)
        p["screen_saving"] = b3.slider("Heat an energy screen would save (%)", 10, 45, int(p["screen_saving"] * 100), 5,
                                       help="Assumption. Energy screens typically cut night heat loss by roughly a quarter to a third.") / 100
    AUD, SUM, HEALTH = wa_run(tuple(sorted(p.items())))
    me = SUM.set_index("team").loc[team]
    a = AUD[team]
    per_rule = pd.DataFrame([{
        "rule": r, "Rule": name, "Hours flagged": me[r + "_hours"], "€/m² this crop": me[r + "_eur"],
        "€ per hectare": me[r + "_eur"] * 1e4,
        "Share of that cost": me[r + "_eur"] / me[SPEND_OF[cost]] if me[SPEND_OF[cost]] > 0 else np.nan}
        for r, (name, cost) in WA.RULES.items()])
    top = per_rule.loc[per_rule["€/m² this crop"].idxmax()]
    n_issues = int((HEALTH.team == team).sum())

    w1, w2, w3, w4 = st.columns(4)
    w1.metric("Flagged spend this crop", f"€{me.flagged_total_eur:.2f}/m²",
              f"{me.flagged_total_eur / me.variable_spend_eur * 100:.0f}% of lamp + CO₂ + heat spend", delta_color="off")
    w2.metric("Scaled to one hectare", f"€{me.flagged_total_eur * 1e4:,.0f}", "per 80-day crop", delta_color="off")
    w3.metric("Biggest item", top.Rule if top["€/m² this crop"] > 0 else "none",
              f"€{top['€/m² this crop']:.2f}/m² over {top['Hours flagged']:.0f} h" if top["€/m² this crop"] > 0 else "", delta_color="off")
    w4.metric("Sensor problems", f"{n_issues}", "see the sensor check below", delta_color="off")

    st.markdown("**Flagged spend, all six compartments** (€/m² over the crop)")
    order = SUM.sort_values("flagged_total_eur").team.tolist()
    fb = go.Figure()
    for r, (name, _) in WA.RULES.items():
        s = SUM.set_index("team").loc[order]
        fb.add_trace(go.Bar(y=[f"<b>{t}</b>" if t == team else t for t in order], x=s[r + "_eur"], name=name,
                            orientation="h", marker_color=RULE_COLORS[r], hovertemplate="€%{x:.2f}/m²"))
    fb.update_layout(barmode="stack")
    st.plotly_chart(style(fb, "", 300), width="stretch", theme="streamlit")
    st.caption("Same rules, same thresholds for every compartment. Change the thresholds above to see how sensitive each flag is.")

    c1, c2 = st.columns([3, 2])
    with c1:
        st.markdown(f"**{team}: flagged spend per day**")
        daily = a[[r + "_eur" for r in WA.RULES]].tz_convert("Europe/Amsterdam").resample("D").sum()
        fd = go.Figure()
        for r, (name, _) in WA.RULES.items():
            fd.add_trace(go.Bar(x=daily.index, y=daily[r + "_eur"], name=name, marker_color=RULE_COLORS[r],
                                hovertemplate="€%{y:.3f}/m²"))
        fd.update_layout(barmode="stack", showlegend=False)
        st.plotly_chart(style(fd, "€/m² per day", 300), width="stretch", theme="streamlit")
    with c2:
        st.markdown(f"**{team}: by rule**")
        st.dataframe(per_rule.drop(columns="rule"), hide_index=True, width="stretch",
                     column_config={"Hours flagged": st.column_config.NumberColumn(format="%.0f"),
                                    "€/m² this crop": st.column_config.NumberColumn(format="€%.3f"),
                                    "€ per hectare": st.column_config.NumberColumn(format="€%.0f"),
                                    "Share of that cost": st.column_config.NumberColumn(format="percent")})
        st.caption("'Share of that cost' compares each flag with what the compartment spent on that resource in total.")

    st.markdown(f"**{team}: largest flagged episodes**")
    rule_pick = st.radio("Rule", list(WA.RULES), horizontal=True, format_func=lambda r: WA.RULES[r][0], label_visibility="collapsed")
    ep = WA.episodes(a, rule_pick)
    if ep.empty:
        st.info("Nothing flagged for this rule at the current thresholds.")
    else:
        loc = lambda s: s.dt.tz_convert("Europe/Amsterdam")
        ep_tbl = pd.DataFrame({"When": loc(ep.start).dt.strftime("%a %d %b %H:%M") + "–" + loc(ep.end).dt.strftime("%H:%M"),
                               "Hours": ep.hours.round(1), "€/m²": ep.eur.round(4)})
        for c, label in RULE_CTX[rule_pick].items():
            ep_tbl[label] = ep[c].round(1)
        st.dataframe(ep_tbl, hide_index=True, width="stretch")

    st.markdown("**Sensor check** (all compartments)")
    if HEALTH.empty:
        st.success("No sensor problems found.")
    else:
        st.dataframe(HEALTH.assign(team=HEALTH.team.where(HEALTH.team != team, "▶ " + team))
                     .rename(columns={"team": "Compartment", "sensor": "Sensor", "issue": "Problem", "detail": "Detail"})
                     .drop(columns="share"), hide_index=True, width="stretch")
        st.caption("Drain EC and pH tell the grower whether the roots get the right nutrients. Four of six compartments "
                   "had no usable drain readings all season, and nobody's controller flagged it.")

    with st.expander("What each rule checks, and its limits"):
        st.markdown("""
- **Lamps on in strong sun:** lamps running while the sun alone was giving more light inside than the lamps can add.
  Uses outside PAR × the compartment's measured light transmission (median inside/outside ratio with lamps off).
- **CO₂ dosed with windows open:** CO₂ paid for while a window side was wide open, so much of it leaves the greenhouse.
  Dosing at a small opening is normal practice, hence the threshold.
- **Heating while venting (air not humid):** heat paid for while windows were open and humidity was below the threshold.
  Heat plus vents is a legitimate way to remove moisture, so humid periods are excluded.
- **Energy screen open on cold nights:** heating on a dark, cold night with the energy screen mostly open.
  Priced as the share of that heat a closed screen would have saved (an assumption you can change).

Limits: rules see one compartment's logs, not the grower's intent; costs are the challenge's own cost model;
one season of six compartments. A deployment would run these checks live and alert the grower the same day.
""")

# ---------------- tab 2 ----------------
with tab2:
    st.markdown("The forecast uses two running totals the greenhouse already logs: **warmth** (sum of daily mean "
                "temperature) and **light** (sum of daily PAR). Below, this compartment against the other five. "
                "These are associations across six compartments, not proven causes.")
    allc = PC[PC.date <= "2024-11-05"].groupby("team").agg(temp_sum=("T_mean", "sum"), light_sum=("DLI", "sum"))
    me = allc.loc[team]
    others = allc.drop(index=team).mean()
    m1, m2 = st.columns(2)
    m1.metric("Warmth received by 5 Nov", f"{me.temp_sum:,.0f} °C·days", f"{(me.temp_sum / others.temp_sum - 1) * 100:+.1f}% vs other compartments", delta_color="off")
    m2.metric("Light received by 5 Nov", f"{me.light_sum:,.0f} mol/m²", f"{(me.light_sum / others.light_sum - 1) * 100:+.1f}% vs other compartments", delta_color="off")
    c1, c2 = st.columns(2)
    for cc, var, title, unit in [(c1, "T_mean", "Daily mean temperature", "°C"), (c2, "DLI", "Daily light (PAR)", "mol/m²/day")]:
        f = go.Figure()
        for t, g in PC.groupby("team"):
            if t == team:
                continue
            f.add_trace(go.Scatter(x=g.date, y=g[var].rolling(7, min_periods=1).mean(), name=t, line=dict(color="rgba(140,150,145,0.45)", width=1),
                                   showlegend=False, hovertemplate=f"{t}: %{{y:.1f}}"))
        g = PC[PC.team == team]
        f.add_trace(go.Scatter(x=g.date, y=g[var].rolling(7, min_periods=1).mean(), name=team, line=dict(color=col, width=3),
                               hovertemplate=f"{team}: %{{y:.1f}}"))
        cc.markdown(f"**{title}** (7-day average; grey = other compartments)")
        cc.plotly_chart(style(f, unit, 300), width="stretch", theme="streamlit")
    st.markdown("**Which predictors held up** (each compartment predicted by a model trained on the other five)")
    st.dataframe(RES.rename(columns={"model": "Predictors"}), hide_index=True, width="stretch")
    st.caption("The textbook 10 °C base temperature exaggerates differences between warm and cool rooms; a base of 0 °C "
               "halves the error. Light helps only on top of warmth. CO₂ and spacing did not improve the forecast.")

# ---------------- tab 3 ----------------
with tab3:
    a, m, h = RECS.actual_np.mean(), RECS.measured_np_at_rec.mean(), RECS.hindsight_best_np.mean()
    s1, s2, s3 = st.columns(3)
    s1.metric("Average profit gain", f"{(m / a - 1) * 100:+.0f}%", "vs the day each team actually harvested", delta_color="off")
    s2.metric("Share of the possible gain captured", f"{(m - a) / (h - a) * 100:.0f}%", "best possible = perfect hindsight", delta_color="off")
    s3.metric("Harvested earlier on average", f"{RECS.days_earlier.mean():.1f} days", f"hindsight best: {RECS.hindsight_days_earlier.mean():.1f} days", delta_color="off")
    tbl = RECS.assign(
        **{"Team": RECS.team, "Actual harvest": RECS.actual_harvest.dt.strftime("%d %b"),
           "Pick Day": RECS.recommended_day.dt.strftime("%d %b"), "Days earlier": RECS.days_earlier,
           "Profit actual (€/m²/day)": RECS.actual_np.round(3), "Profit on Pick Day": RECS.measured_np_at_rec.round(3),
           "Gain": RECS.gain_vs_actual_pct.round(0).astype(int).astype(str) + "%",
           "Hindsight best": RECS.hindsight_best_day.dt.strftime("%d %b"), "Hindsight profit": RECS.hindsight_best_np.round(3)}
    )[["Team", "Actual harvest", "Pick Day", "Days earlier", "Profit actual (€/m²/day)", "Profit on Pick Day", "Gain", "Hindsight best", "Hindsight profit"]]
    st.dataframe(tbl, hide_index=True, width="stretch")
    st.caption("Replay of the 2024 season with each team's measured dry matter and the default 'best average' rule. "
               "Profits on Pick Day are scored on the measured (hand-harvested) curve, not on the forecast. "
               "In the competition all six teams harvested 5–11 days later than the profit-maximising day.")

# ---------------- tab 4 ----------------
with tab4:
    st.markdown("""
**Pipeline**
1. 5-minute climate, control and cost logs → one row per compartment per day, with running totals (warmth, light, CO₂, cost).
2. Ripeness model: % red fruit = logistic curve of warmth sum (base 0 °C) + light sum. Fitted on 24 hand-measured points.
3. Red fruit weight ≈ 4.8 g per percentage point of red fruit (slightly curved), from the measured pairs.
4. 3,000 simulated outcomes per day from the model's held-out error → expected profit and chance of being sellable.
5. Recommended day = highest expected profit (or the highest that meets your minimum sellable chance).

**Validation:** leave-one-compartment-out. Every number for a compartment comes from a model that never saw it.
The profit formula reproduces the paper's Table 1 exactly for all six teams.

**Limits, stated plainly**
- Six compartments, one season, 24 labels. Treat results as a proof of concept with wide uncertainty.
- The strategies changed light, CO₂, temperature and spacing together, so effects are associations, not causes.
- Future climate is taken as it actually happened (a perfect weather forecast). A deployment would use the forecast.
- Dry matter cannot be known before harvest; the slider lets you test the price tier.
- The 33% rule is applied to fruit count, which is stricter than the weight-based figure in the paper.
- Top-down cameras miss the lower trusses; the image signal is being added as a separate check.

**Source:** Maree et al. (2025) *Sensors* 25(14):4321; dataset doi:10.4121/fa102772-32db-4b30-bace-12f2016722ce (CC BY 4.0).
""")
