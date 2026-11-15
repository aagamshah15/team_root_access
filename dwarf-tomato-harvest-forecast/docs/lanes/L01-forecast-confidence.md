# L01 · Forecast, confidence & timing test

**Wave** 1 · **Spec** §4 · **Feeds** L02, publish

## Goal

For any room and any "today", an honest ripeness forecast for the next 21 days with a band, a confidence level a grower can understand, and a timing test that compares us fairly with simple baselines.

## Owns

- `harvest/forecast.py`, `harvest/confidence.py`, `harvest/backtest.py`
- `tests/test_forecast.py`, `tests/test_confidence.py`, `tests/test_backtest.py`

## Tasks

- [ ] `fit_params` / `forecast` per `contracts/app-data.md` §2. Start from `main`'s `forecast.py` (curve, leave-one-room-out fit, photo onset needing 3 days, 7-day warmth rate). Only data dated ≤ today; the room's own hand measurements never used to fit the shared curve.
- [ ] Crop-sample update: if the room has a measurement dated ≤ today, shift G50 so the curve moves toward it (weight from `config/crop.yaml`, `sample_weight`; default 0.7). Record `sample_used`.
- [ ] Band: low/high from the spread of G50 across the other rooms (±1.96 sd), as `main` does.
- [ ] `delta_c`: future degree-days per day change by `delta_c` (never below 0).
- [ ] `confidence`: three parts per SPEC §4 with thresholds from `config/crop.yaml` (`confidence:` block); level = worst of the three; reasons in plain English ("Camera and crop sample agree", "Last crop sample was 9 days ago").
- [ ] `timing_test`: for each room, forecast made on 2024-11-05 of the date it reaches the % red it actually had at harvest; error in days vs actual harvest. Baselines: same days-after-planting as other rooms' mean harvest; and for % red at harvest, the other rooms' mean final % red. Report all, including where a baseline wins.

## Tests

- Curve and inverse on hand-worked values (k=0.03, G50=750 → 50% at 750; 70% at 778.2).
- Leakage test: changing the held-out room's own hand measurements after `today` must not change its forecast.
- Onset needs 3 consecutive days and isn't known until the 3rd day.
- Fixture-based confidence cases for each level.
- Backtest numbers on `tests/fixtures/` with hand-worked expected values.

## Done when

- Functions match the contract signatures; `make test` green.
- `python -m harvest.backtest` prints the timing table on real inputs.

## Not this lane

- Profit, harvest window, what-if (L02); photos and alerts (L03); writing JSON (publish).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 2026-11-14 | done | Hand-off filled in. `make test` green (34 tests). `python -m harvest.backtest` runs on real inputs. |
| 2026-11-14 | in progress | forecast.py, confidence.py, backtest.py + tests committed (2c2264e). |

**Blocked** (needs integrator / L05; code works without them):
1. **Starting-guess curve keys for `config/crop.yaml` (L05).** Reading "only data up to today" strictly (other rooms' samples too), no room has a ripe crop sample before 5 Nov, so for "today" 20 Oct–4 Nov there is nothing to fit. The code then uses `ripeness.prior_k`, `prior_g50`, `prior_g50_sd` if present, else `main`'s starting values 0.03 / 750 / 60 (in `forecast._prior`), sets `prior_only: True`, and confidence is forced to `low` with the reason "No room has a ripe crop sample yet, so the forecast is a starting guess". Please add the three keys (with source) to crop.yaml and assumptions.md. **Decision for integrator:** keep the strict cut (what's built) or let other rooms' full history stand in for "past crops" (what `main` did). Strict is the honest one; it is what CLAUDE.md says.
2. **Confidence thresholds (G1).** With the PROPOSED thresholds, 160 of 166 real room-days come out `low` (6 `medium`, 0 `high`). Why: the 95% day range on real data is 6–12 days (thresholds: high ≤ 4, medium ≤ 8), and after ~12 Nov the last crop sample is > 7 days old. For scale, the actual timing error on 5 Nov averages 1.7 days. A fairer set might be day range high ≤ 7 / medium ≤ 12 and freshness high ≤ 7 / medium ≤ 14; that's a G1 call, not mine.
3. **Contract enum `model`** has no `warmth+sample`. If a room has a ripe sample but no photo onset yet, the sample is still applied and the label stays `warmth` (`sample_used` is set). Doesn't happen on real data (all onsets by 4 Nov, first ripe samples 5 Nov); happens on the fixture for agrifusion on 5–6 Nov.
4. **"Usable photo" for freshness** = noon photo with a red index, lamp-lit or not (mugrow is lamp-lit at noon every day; `main`'s index is lamp-corrected). L03 owns `photo_usable` in evidence.json; if L03 excludes lamp-lit frames, the two will disagree — integrator to pick one rule.

**Hand-off**
- Built:
  - `harvest/forecast.py`: `fit_params`, `forecast` per contract §2, plus helpers `curve`, `g_at`, `onset_dates`, `shared_models`, `date_reaching`. Leave-one-room-out shared slope and G50, all inputs cut at "today" (other rooms included). Camera layer: G50 = degree-days at photo onset (3 days running above the red-index setting, known only on the 3rd day) + offset learned on the other rooms. Crop-sample layer: G50 moves `sample_weight` of the way toward the room's newest ripe sample (1–99 % red). Band = G50 ± 1.96 sd of the other rooms' spread. `delta_c` adds to the 7-day warmth rate, floored at 0. `fit_params` returns extra keys (`gdd_today`, `prior_only`, `onset`, `g50_warmth`, `g50_camera`) that confidence and L03/L02 can use.
  - `harvest/confidence.py`: `confidence(...)` → level (worst of three parts), `day_range_days` = 2·1.96·sd ÷ degree-days per day, agreement across warmth / camera / sample estimates of today's % red, freshness = larger of days since sample and since photo; 3 plain-English reasons, worst first.
  - `harvest/backtest.py`: `timing_test` → summary rows (`test, method, value, unit, n, note`) + per-room rows (`room, test, method, predicted, actual, error`; `test` is an extra key). Methods: our forecast, warmth only, and the two SPEC baselines.
  - Publish tip: call `fit_params` once per room-day and pass `params=` to `forecast` and `confidence` (all 166 real room-days take 0.7 s).
- Checked: `make test` green, 34 tests: curve/inverse hand values (k 0.03, G50 750 → 50 % at 750, 70 % at 778.2), onset needs 3 consecutive days and isn't known until the 3rd, leakage (changing a room's own or another room's measurements after today leaves the forecast unchanged; the room's own samples never enter the shared curve), fixture fit recovers k 0.03 / G50 750, one fixture case per confidence level, backtest baseline errors hand-worked (−17, −9, −2, +4, +10, +14 days → 9.3). Real inputs, decision day 5 Nov:

  | Test | Our forecast | Warmth only | Baseline |
  |---|---|---|---|
  | Harvest date, average days off | **1.7** | 3.0 | 4.8 (days after planting) |
  | % red at harvest, average points off | **6.2** | 10.1 | 7.0 (other rooms' average) |

  The % red baseline is close (0.8 points behind us) and has zero average bias while we run 4.6 points low; we miss reference and trigger by ~15 points. Say so in the app. The days baseline also sees the other rooms' real harvest dates (after 5 Nov), so it is generous.
- Known limits: six rooms; each held-out fit has only five rooms' 5 Nov samples to place the curve, so k (~0.02 on real data vs 0.03 in `main` with full data) is loosely pinned. The band only reflects room-to-room spread, not sample noise or weather. The day range doesn't shrink after a crop sample (conservative). Freshness uses crop samples of any ripeness, including 0 % ones.
- Follow-ups: Blocked items 1–4. Optional: a "today" sweep version of the timing test (error vs days ahead) for the How-it-works screen.
