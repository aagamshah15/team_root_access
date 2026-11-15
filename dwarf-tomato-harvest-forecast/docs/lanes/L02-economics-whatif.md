# L02 · Harvest window, profit & temperature what-if

**Wave** 1 · **Spec** §5, §6 · **Feeds** publish, L04

## Goal

Turn a ripeness forecast into the three dates a grower acts on (earliest sellable, best profit, losses start) with a profit curve and band, and answer "what if we run the room 1 °C warmer or cooler?" in days and euros.

## Owns

- `harvest/economics.py`, `harvest/whatif.py`
- `tests/test_economics.py`, `tests/test_whatif.py`

## Tasks

- [x] `profit_by_day` per contract. Port `main`'s `profit_tables` logic: pots ripen at different times (plant spread from settings), a pot sells only if ≥ 1/3 red, revenue capped at 150 g red, plant and re-spacing costs, costs to date from the log plus the 7-day cost rate, profit per m² per day grown. Fruit weight = latest crop sample dated ≤ today (else the other rooms' mean at that age).
- [x] Band: scenarios early/late ripening (forecast band) × price low/high from settings; `profit_low/high` = min/max.
- [x] `harvest_window` per SPEC §5. `best_day_low/high` = best day under the early and late scenarios.
- [x] `heating_cost_per_degree`: regress daily heating cost per m² on (inside − outside mean temperature) across rooms and days with heating on; return slope, r², n. If r² < 0.3, say so in `note`.
- [x] `whatif`: re-run forecast with `delta_c`, recompute window, add extra energy cost to the cost rate for future days. Fill `note` with plain wording ("model estimate, not tested in the greenhouse").
- [x] All settings from `config/crop.yaml` (use `tests/fixtures/crop.yaml` until L05 lands).

## Tests

- A tiny hand-worked profit day (2 plants, known % red, costs) → expected €/m²/day.
- Unsellable pots (<1/3 red) earn nothing; the best day never has a sellable share below the setting.
- Window ordering: earliest sellable ≤ best ≤ losses start.
- What-if sign: +1 °C never makes ripening slower; extra cost ≥ 0 for positive delta.
- Use the fixture forecast in `tests/fixtures/forecast_fixture.csv`, so you don't wait for L01.

## Done when

- Functions match the contract; `make test` green.
- On real inputs, Tomatonuts as of 2024-11-06 gives a best day within a day of `main`'s 11 Nov (or the difference is explained in the hand-off).

## Not this lane

- The ripeness forecast itself (L01); JSON writing (publish); app charts (L04).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 2026-11-14 | done (D10) | Merged tomato-harvest-poc (D10). Revenue now follows the gains curves, price band = low/high curve, re-spacing = €1.50/m²/year per step as a daily fixed cost. 21 tests green. Tomatonuts 6 Nov best day moves 11 → 10 Nov (explained in hand-off). |
| 2026-11-14 | done | economics.py + whatif.py + 20 tests green; Tomatonuts 6 Nov best day = 11 Nov, same as `main`. Hand-off filled. |

**Blocked:** none.

**Hand-off**
- Built:
  - `harvest/economics.py`: `profit_by_day(inputs, room, today, fc, params, *, settings=None, extra_cost_m2_day=0.0)` and `harvest_window(curve, settings)` per contract. Pot-to-pot spread is done on the log-odds scale from % red alone (sd = 4 × `plant_spread_sd` / 100 = 0.5), which is algebraically the same as `main`'s per-plant G50 spread, so `params` is accepted but not needed and the forecast's own % red (with sample update / what-if) is respected. Small pure helpers `plant_pct`, `pot_revenue`, `profit_m2_day`, `fruit_weight`, `costs_so_far`.
  - Extra curve columns beyond the contract (publish can ignore): `revenue_m2`, `sellable_share_early/late`, `profit_m2_day_early/late`, `days_grown`, `fruit_weight_g`, `density`. `cost_to_date_m2` includes plants (pots/m² × €0.75), re-spacings and logged costs, plus the 7-day rate for future days.
  - **D10 scoring (current):** revenue per pot = `gains_curve_low` (main case) interpolated linearly on red grams, capped at `red_cap_g`, €0 for pots under `sellable_red_share`; settings are read by key (`gains_curve_low`, `gains_curve_high`, `respacing_cost_eur_m2_year`), so L05 can change curve points without code changes. `price_eur_per_pot`, `price_low`, `price_high` are no longer read.
  - Re-spacing: each spacing step (a change in density) is charged `respacing_cost_eur_m2_year` / 365 per m² per day **from the day of the step**; the future daily cost rate includes the steps taken so far. (Interpretation of "per year per step as a fixed cost"; if it should instead run from planting, costs rise by at most ~€0.25/m² and best days don't move.)
  - Band `profit_low/high` = min/max over ripening {early, expected, late} × gains curve {main (low DM), high DM}. The main curve is the lower curve, so with ripening fixed the expected line sits on the low edge.
  - `best_day` is the highest profit/m²/day **among days with ≥ `earliest_sellable_share` of pots sellable**; if no day in the horizon reaches it, the best day overall and `earliest_sellable_day` = null. This guarantees earliest ≤ best ≤ losses start. On real data at 6 Nov it never binds (the unconstrained best already had ≥ 95 % sellable for all six rooms).
  - `losses_start_day` = first day after the best day when total net profit per m² falls (extra day's cost > extra revenue); null if beyond the horizon.
  - `harvest/whatif.py`: `heating_cost_per_degree(inputs, today=None)` → `{eur_m2_day_per_c, r2, n, eur_per_mj, note}`. The log has no separate heating cost, so step 1 fits cost/m² = a + b·heating MJ + c·lighting kWh (b = € per MJ; real data ≈ €0.024/MJ), step 2 fits b·heating MJ on (inside − outside) across heated room-days. Real data: **€0.0036 per m² per day per °C, r² = 0.24, n = 375 → note says the fit is weak.** `whatif(inputs, room, today, delta_c, *, forecast_fn=None, params_fn=None, settings=None, heat=None)` returns the whatif.json fields; defaults import L01's `forecast` / `fit_params` lazily. Cooling saves at most the room's recent heating bill. Pass `heat=` to fit the heating cost once per today in publish.
- Checked:
  - `make test` green (20 tests; 17 in L02). Hand-worked: 2-pot profit day (−0.29375 €/m²/day), all-red room day 0/1 (0.34 / 0.331212), price band, costs to date (17.1 €/m²), plant spread (62.246 %), heating slope 0.01 on fixtures, window on a hand-built 5-day curve, never-sellable room, what-if sign (+°C never later, extra cost ≥ 0), 0 °C = no change.
  - **Before D10** (old linear €2.15 rule), real inputs, 6 Nov, using `main`'s own fitted curves (`out/forecast/daily_forecast.csv`) as the forecast: best day matched `main` for 5 of 6 rooms (tomatonuts 11 Nov, €0.148); trigger 14 vs 13 Nov was a rounding near-tie (€0.0014/m²/day). So the port itself is faithful.
  - **After D10**, same forecast, best day / profit per m² per day: tomatonuts **10 Nov** (€0.073), mugrow 6 Nov (€0.140), agrifusion 13 Nov (€0.071), reference 15 Nov (€0.055), ideas 10 Nov (€0.212), trigger 14 Nov (€0.136). The 95 %-sellable rule still never binds (every unconstrained best day has 100 % of pots sellable).
  - **Why Tomatonuts moves 11 → 10 Nov:** the paper's gains curve is nearly flat above 80 g red (€1.60 → €1.80 from 80 to 150 g, vs €1.00 extra on the old linear rule). On 10 Nov the average pot already has ~189 g red and all pots are sellable, so an extra day adds almost no revenue but still adds a day to the per-day divisor and a day of cost. Ideas and agrifusion move a day earlier for the same reason. Profits are roughly half of `main`'s because the top price is €1.80, not €2.15, and partial-red pots earn less.
- Known limits:
  - Fruit weight per pot is the latest crop sample ≤ today, held flat for future days (as in `main`). For todays before 5 Nov that is the 22 Oct (~220 g) or 7 Oct (~70 g) sample, which understates harvest weight and so revenue; early-October/late-October best days will lean late/low. Worth showing confidence as low there.
  - Heating-cost fit is weak (r² 0.24); what-if euros are rough. Ripening response to °C is entirely L01's degree-day assumption.
  - Heat price is implied from the log by regression, not a tariff; L05 may want to record it in `docs/assumptions.md` (value ≈ €0.024/MJ, if wrong the what-if extra cost scales with it).
- Follow-ups:
  - Integrator/publish: call `whatif(..., heat=heating_cost_per_degree(inputs, today))` once per today; round dates to strings; `profit_today_m2_day` = curve row 0 `profit_m2_day`, `sellable_share_now` = row 0 `sellable_share`.
  - L05: add `heat_eur_per_mj` (implied), the "best day must meet earliest_sellable_share" rule and the re-spacing "charged from the day of the step" reading to assumptions. Settings keys used: `economics.{sellable_red_share, red_cap_g, gains_curve_low, gains_curve_high, plant_cost_eur, respacing_cost_eur_m2_year, cost_rate_days, earliest_sellable_share}`, `ripeness.{plant_spread_sd, horizon_days}`, `planted`.
