# Contract: published app data and pipeline functions

Owner: integrator. Change only through the integrator (lane → "Blocked").

## 1. Files in `app/data/`

Every file is JSON: `{"meta": {...}, "rows": [...]}`.
`meta` always has `source` (string: which inputs), `built_at` (UTC ISO), `as_of` (`{"from": date, "to": date}` = range of "today" values covered). Mock files add `"mock": true`.
Dates are `"YYYY-MM-DD"` strings. Numbers are plain JSON numbers (no NaN; use `null`). Percentages are 0–100. Money is € with up to 3 decimals.

"today" values: every date from **2024-10-20** to the day before each room's actual harvest.

### `customers.json`
| field | type | note |
|---|---|---|
| customer_id | str | `c1`… |
| name | str | fictional, e.g. "Willowmere Greenhouses" |
| tagline | str | one line |
| rooms | list[str] | room ids |

### `rooms.json`
| field | type | note |
|---|---|---|
| room | str | data id (`tomatonuts`…) |
| display_name | str | what the customer sees, e.g. "House 1" |
| customer_id | str | |
| area_m2 | number | room area used for € totals |
| planted | date | the room's planting date (D17: required per room; all demo rooms 2024-09-03) |
| actual_harvest | date | replay only; shown as "what the grower actually did" |

### `days.json` — one row per room × today (the decision card)
| field | type | note |
|---|---|---|
| room, today | str, date | key |
| status | str | `harvest_now` · `plan_harvest` · `keep_growing` · `check_crop` |
| pct_red_now, pct_red_low, pct_red_high | number | estimated % red by weight today and its band |
| sellable_share_now | number | 0–1 share of pots that would sell today |
| model | str | `warmth` · `warmth+sample` · `warmth+camera` · `warmth+camera+sample` |
| earliest_sellable_day, best_day, losses_start_day | date\|null | the harvest window (SPEC §5) |
| best_day_low, best_day_high | date | likely range of the best day |
| profit_best_m2_day, profit_today_m2_day | number | € per m² per day |
| confidence | str | `high` · `medium` · `low` |
| conf_day_range_days | int | width of best-day range |
| conf_agreement | str | `agree` · `mixed` · `conflict` |
| conf_freshness_days | int | days since newest crop sample or usable photo (larger of the two) |
| conf_reasons | list[str] | plain-English reasons, 1–3 |
| conf_day_range_level, conf_agreement_level, conf_freshness_level | str | `high` · `medium` · `low` for each part (added at G2) |
| optimal_from, optimal_to | date\|null | D16: first and last day of the optimal zone (profit within `economics.optimal_zone_share` of the best day) |
| look_day | date\|null | D16: first day the room's forecast reaches the lower edge of `logistics.best_band_pct_red` (70% red); null if beyond the horizon |
| pot_spread_sd | number | D19: plant-to-plant spread in % red points used for this room-day (fitted on the other five rooms' full-season weighings; 12.5 fallback). Read by `app/trip.js` and the React trip port |
| weight_complete_day | date\|null | shipping extension (D14): day the fruit reaches 98% of its final weight |
| k_x1000 | number | shipping extension: steepness of the room's ripening curve per 1,000 degree-days, so the app can plan any trip |

### `forecast.json` — one row per room × today × day ahead (0–21)
`room, today, date, pct_red, pct_red_low, pct_red_high, sellable_share, profit_m2_day, profit_low, profit_high, cost_to_date_m2`

### `whatif.json` — one row per room × today × delta_c
`delta_c` ∈ {−2, −1.5, −1, −0.5, 0, 0.5, 1, 1.5, 2}.
`room, today, delta_c, best_day, days_change, profit_best_m2_day, profit_change_m2_day, extra_energy_cost_m2_day, note`

### `evidence.json` — one row per room × date (from planting to day before harvest)
`room, date, photo (path relative to `app/index.html`, e.g. `data/photos/x.jpg`, or null), photo_usable (bool), lamps_on (bool|null), red_index, green_pct, canopy_distance_mm, gdd_cum, last_sample_date, last_sample_pct_red, last_sample_fw_g`

`meta.note` = the what-if caveat shared by every row; each row's `note` holds only its own extra text (may be empty). `meta.heating_fit` = `{eur_m2_day_per_c, r2, n, note}` from `heating_cost_per_degree` (added at G2).

### `alerts.json`
`room, date, kind (behind_schedule|ahead_of_schedule|sensor_check|room_drift), severity (info|warning), title, message, numbers (object of the values behind it)`

### `backtest.json`
`rows`: `test, method, value, unit, n, note` (summary). `meta.per_room`: list of `{room, method, predicted, actual, error}`.

### `shipping.json` — one row per room × today × destination (shipping extension, D14)
Rows only where the pluck day is within the 21-day forecast.
`room, today, destination (id), pluck_day, pluck_reason (weight|sellable|today), ship_by_day (date|null), pct_at_pluck, pct_on_arrival, sellable_on_arrival (0–1), best_from, best_until, sell_until (int: days after arrival), profit_m2_day, best_profit_day, profit_best_m2_day`
`meta.destinations` = `[{id, name, distance_km, transit_days}]`; `meta.truck` = the logistics settings used (temperatures, hours, speed, band, end of life, minimum best days, default destination) plus what `app/trip.js` needs to plan a trip in the browser: `base_temp_c`, `pot_spread_sd`, `sellable_red_share`, `earliest_sellable_share`, `pot_z` (the 40 pot quantiles).

### `explain.json` — compact, one row per room × today (wave 2, L09)
To stay inside the 5 MB budget the texts are stored once. `meta.kpis[kpi] = {title, meaning, steps (templates with {key}), inputs [{name, key, unit, kind, source}], caveats}` for kpis best_day, pots_ready, profit_best, confidence, look_day, ship_day; `meta.constants`, `meta.spread_sources`, `meta.how_to_read`. `rows` = `{room, today, values}`. A `{key}` is looked up in `values`, then the same room-day card in `days.json`, then `meta.constants`. `harvest/explain.py` `expand()` turns it into full rows (meaning, steps, inputs with values, caveats) and `display()` is the formatting rule; the React app mirrors both in `web/src/lib/explainCompact.ts`. Drives the "How is this worked out?" panel.

### `assumptions.json`
`name, value, unit, source, if_wrong` — built from `config/crop.yaml`.

## 2. Pipeline functions (fixed signatures)

```python
# harvest/common.py (integrator)
load_inputs(path: str | None = None) -> Inputs        # dataclass: daily, ripeness, plants, images, weather, image_features (DataFrames)
load_settings() -> dict                               # config/crop.yaml
ROOMS: list[str]; PLANTED: date; actual_harvest(inputs, room) -> date
today_range(inputs, room) -> list[date]

# harvest/forecast.py (L01)
fit_params(inputs, room, today) -> dict   # {k, g50, g50_sd, model, gdd_rate, sample_used}
forecast(inputs, room, today, delta_c: float = 0.0, horizon: int = 21) -> pd.DataFrame
    # columns: date, gdd_cum, pct_red, pct_red_low, pct_red_high

# harvest/confidence.py (L01)
confidence(inputs, room, today) -> dict   # {level, day_range_days, agreement, freshness_days, reasons}

# harvest/backtest.py (L01)
timing_test(inputs) -> tuple[pd.DataFrame, list[dict]]   # (summary rows, per-room rows)

# harvest/economics.py (L02)
profit_by_day(inputs, room, today, fc: pd.DataFrame, params: dict) -> pd.DataFrame
    # adds: sellable_share, profit_m2_day, profit_low, profit_high, cost_to_date_m2
harvest_window(curve: pd.DataFrame, settings: dict) -> dict
    # {earliest_sellable_day, best_day, losses_start_day, best_day_low, best_day_high, profit_best_m2_day}

# harvest/whatif.py (L02)
heating_cost_per_degree(inputs) -> dict    # {eur_m2_day_per_c, r2, n}
whatif(inputs, room, today, delta_c) -> dict   # fields of whatif.json minus room/today

# harvest/evidence.py (L03)
evidence_rows(inputs) -> list[dict]       # evidence.json rows

# harvest/alerts.py (L03)
alerts(inputs) -> list[dict]              # alerts.json rows, all dates
```

`publish.py` (integrator) calls these and writes the files. Status rule (integrator, in publish): `check_crop` if confidence is `low` or agreement is `conflict`; else `harvest_now` if today is within [best_day_low, best_day_high] and sellable_share_now ≥ setting; else `plan_harvest` if best_day ≤ today + 7; else `keep_growing`.
