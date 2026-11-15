"""Forecast ripe fruit by weight and compare harvest days under scenarios."""
from dataclasses import dataclass
from datetime import timedelta
from statistics import mean

import numpy as np


LOOKAHEAD = 21
GDD_BASE = 10.0
RED_ONSET = 0.1  # percent of pixels, in the source noon feature table
POT_COST = 0.75
MIN_SELLABLE_SHARE = 0.85
SELLABLE_RED_PROXY = 1 / 3  # weight share used as a proxy for the count rule
MIN_RED_GRAMS = 50
MAX_RED_GRAMS = 150
BASE_PRICE = 2.15
MIN_SCHEDULE_GAIN = 0.005  # EUR/m²/day, compare near-term versus later dates


@dataclass(frozen=True)
class Curve:
    slope: float
    midpoint: float

    def predict(self, heat):
        exponent = np.clip(-self.slope * (np.asarray(heat) - self.midpoint), -60, 60)
        return 1 / (1 + np.exp(exponent))

    def anchored(self, heat, measured, weight=0.65):
        bounded = np.clip(measured, 0.01, 0.99)
        observed_midpoint = heat - np.log(bounded / (1 - bounded)) / self.slope
        return Curve(self.slope, (1 - weight) * self.midpoint + weight * observed_midpoint)


def fit_curve(rows):
    """Least squares on observed fractions, using a deterministic grid."""
    heat, red = np.asarray(rows).T
    slopes = np.geomspace(0.004, 0.09, 140)[:, None]
    midpoints = np.arange(580, 901, 1)[None, :]
    prediction = 1 / (1 + np.exp(np.clip(-slopes * (heat[:, None, None] - midpoints), -60, 60)))
    error = np.mean((prediction - red[:, None, None]) ** 2, axis=0)
    i, j = np.unravel_index(np.argmin(error), error.shape)
    return Curve(float(slopes[i, 0]), float(midpoints[0, j]))


def confirmed_onset(frames, cutoff):
    """Return first day of a streak once three consecutive days are known."""
    streak = []
    for day, red in sorted(frames.items()):
        if day > cutoff:
            break
        if red <= RED_ONSET:
            streak.clear()
            continue
        if streak and day - streak[-1] != timedelta(days=1):
            streak.clear()
        streak.append(day)
        if len(streak) == 3:
            return streak[0]
    return None


def forecast_curves(room, cutoff, training, climate, images, use_camera):
    """Calibrate on the other five completed rooms and reveal held-out inputs as of cutoff."""
    room_curves = {key: fit_curve(rows) for key, rows in training.items()}
    warmth = fit_curve([row for rows in training.values() for row in rows])
    scenario_curves = list(room_curves.values())
    onset = confirmed_onset(images.get(room, {}), cutoff) if use_camera else None
    if onset is None:
        return warmth, scenario_curves, None
    adjusted = []
    for key, curve in room_curves.items():
        other_onset = confirmed_onset(images.get(key, {}), max(climate[key]))
        if other_onset in climate[key]:
            shift = climate[room][onset]["heat"] - climate[key][other_onset]["heat"]
            adjusted.append(Curve(curve.slope, curve.midpoint + shift))
    if not adjusted:
        return warmth, scenario_curves, None
    central = Curve(mean(c.slope for c in adjusted), mean(c.midpoint for c in adjusted))
    return central, adjusted, onset


def decision_inputs(day, history):
    today = history[day]
    past = [row for d, row in sorted(history.items()) if d <= day][-7:]
    return {
        "heat": today["heat"],
        "daily_heat": mean(row["daily_heat"] for row in past),
        "daily_cost": mean(row["daily_cost_per_pot"] for row in past),
        "cost": today["cost_per_pot"],
        "area": today["area_days"],
        "density": today["density"],
    }


def plan(curve, scenarios, day, inputs, fruit_weight):
    """Return conditional scenario ranges and actions for a grower at day's end."""
    daily_heat = inputs["daily_heat"]
    daily_cost_per_pot = inputs["daily_cost"]
    horizon = np.arange(LOOKAHEAD + 1)
    pot_offsets = np.linspace(-1.9, 1.9, 41) * 0.55
    cumulative_area = inputs["area"] + horizon / inputs["density"]

    def project(ripening_curve, heat_rate, future_cost, price):
        ripeness = ripening_curve.predict(inputs["heat"] + heat_rate * horizon)
        log_odds = ripening_curve.slope * (inputs["heat"] + heat_rate * horizon - ripening_curve.midpoint)
        red = 1 / (1 + np.exp(-np.clip(log_odds[:, None] + pot_offsets, -60, 60)))
        grams = fruit_weight * red
        sellable = (red >= SELLABLE_RED_PROXY) & (grams >= MIN_RED_GRAMS)
        revenue = (price * np.minimum(grams / MAX_RED_GRAMS, 1) * sellable).mean(axis=1)
        profit = (revenue - POT_COST - inputs["cost"] - horizon * future_cost) / cumulative_area
        return ripeness, sellable.mean(axis=1), profit

    central = project(curve, daily_heat, daily_cost_per_pot, BASE_PRICE)
    paths = [
        project(other, daily_heat * heat_factor, daily_cost_per_pot * cost_factor, price)
        for other in scenarios
        for heat_factor, cost_factor in ((0.9, 1.25), (1.0, 1.0), (1.1, 0.75))
        for price in (1.75, 2.15, 2.50)
    ]
    paths.append(central)

    def best_day(path):
        _, share, profit = path
        eligible = np.flatnonzero(share >= MIN_SELLABLE_SHARE)
        if not len(eligible):
            return None
        best = eligible[np.argmax(profit[eligible])]
        close = eligible[profit[eligible] >= profit[best] - MIN_SCHEDULE_GAIN]
        return int(close[0])

    choices = [best_day(path) for path in paths]
    available = [choice for choice in choices if choice is not None]
    near = choices.count(0)
    late = len(choices) - near
    action = "sample" if near and late else ("harvest" if near else "wait")
    selected = best_day(central)
    red_paths = np.asarray([path[0] for path in paths]) * 100
    share_paths = np.asarray([path[1] for path in paths]) * 100
    profit_paths = np.asarray([path[2] for path in paths])
    return {
        "action": action,
        "near": near,
        "later": late,
        "unready": len(choices) - len(available),
        "selected": selected,
        "window": [min(available), max(available)] if available else None,
        "dailyHeat": round(daily_heat, 2),
        "fruitGrams": round(fruit_weight),
        "points": [
            {
                "date": (day + timedelta(days=i)).isoformat(),
                "red": round(float(central[0][i]) * 100, 2),
                "low": round(float(red_paths[:, i].min()), 2),
                "high": round(float(red_paths[:, i].max()), 2),
                "sellable": round(float(central[1][i]) * 100, 1),
                "sellableLow": round(float(share_paths[:, i].min()), 1),
                "sellableHigh": round(float(share_paths[:, i].max()), 1),
                "profit": round(float(central[2][i]), 4),
                "profitLow": round(float(profit_paths[:, i].min()), 4),
                "profitHigh": round(float(profit_paths[:, i].max()), 4),
            }
            for i in range(len(horizon))
        ],
    }
