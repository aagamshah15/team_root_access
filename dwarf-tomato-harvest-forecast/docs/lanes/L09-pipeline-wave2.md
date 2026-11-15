# L09 · Pipeline: optimal zone, look day, planting date per room, explanations

**Wave** 2 · **Spec** §3, §5, D16, D17 · **Contract** `contracts/app-data.md` (D16 fields, `explain.json`)

## Goal

The pipeline publishes everything the redesign needs: the optimal zone and look day on each card, each room's own planting date used throughout, and a plain-English explanation for every KPI.

## Owns

- `harvest/explain.py` (new), `tests/test_explain.py`, `tests/test_wave2_fields.py`
- For this wave, also: `harvest/growth.py` and `harvest/economics.py` (leave-one-room-out fits for steepness and spread), `harvest/common.py` (per-room planting date), `harvest/publish.py` (new fields and file), `config/crop.yaml` (`economics.optimal_zone_share: 0.90`, an assumptions entry for it), `config/customers.yaml` (`planted:` per room, all 2024-09-03), `tests/fixtures/` (keep fixtures in step)

## Tasks

- [x] D17: replace the fixed `PLANTED` with each room's planting date from `config/customers.yaml` everywhere it is used (degree-day origin is already in the logs; days grown, costs, evidence start, today ranges). Default rooms keep 3 Sep 2024, so published numbers must not change; prove it with a before/after diff of `app/data/` (do this step before the leave-one-room-out change, which is expected to move some numbers).
- [x] D16: `optimal_from`, `optimal_to` (days with profit ≥ `optimal_zone_share` × best, contiguous around the best day) and `look_day` (first forecast day at the lower edge of `logistics.best_band_pct_red`) on every `days.json` card.
- [x] `explain.json` per contract for kpis best_day, pots_ready, profit_best, confidence, look_day, ship_day (default destination): meaning, steps, inputs with values and sources, caveats. Generated from the same objects publish already holds; no new maths.
- [x] Honest testing, no exceptions (user request, closes the D14 exception): fit the fruit-weight curve steepness (`growth.prior_steepness` today) and the plant-to-plant ripeness spread (`ripeness.plant_spread_sd`, 12.5 today) on the **other five rooms only**, using data dated ≤ today, for every room-day (fall back to the settings value only when too little data exists, and say so). Report how much published numbers move, and add a decision note under "Blocked" for the integrator to record (D19).
- [x] Keep `app/data/` within the size budget; if `explain.json` pushes it over, write it as one file per room (`explain/<room>.json`) and say so under "Blocked" so the integrator updates the contract.
- [x] `make build`, `make test`, `node tests/test_trip.cjs` all green.

## Done when

- New fields and file published on real data, numbers for existing fields unchanged, tests with hand-worked values for the zone and look day.

## Not this lane

- Any React code (L07, L08, L10).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 14 Nov 2026 | done | L08 fix: no optimal zone (`optimal_from`/`optimal_to` null) when the best day's profit is ≤ 0. 16 of 166 cards affected; the explain step says why. Nothing else changed. |
| 14 Nov 2026 | done | D19 switched to the user's "five rooms, full season": steepness and spread fitted per room on the other five rooms' complete-season weighings (previous-crop stand-in). Pluck days move −1 to +3 days on 304 of 787 plans; best days ±1 on 11 of 166. |
| 14 Nov 2026 | done | Integrator-approved edits: trip.js per-card spread, evidence.py and backtest.py per-room planting date. `app/data/` unchanged. |
| 14 Nov 2026 | done | Leave-one-room-out steepness and spread (D19 proposed). Published numbers moved: see hand-off. All checks green. |
| 14 Nov 2026 | done | `explain.json` written in a compact form (text once in meta) to stay under 5 MB: 71 KB. |
| 14 Nov 2026 | done | D16 `optimal_from`, `optimal_to`, `look_day` on every card; existing fields unchanged (row-by-row diff). |
| 14 Nov 2026 | done | D17 planting date per room from `config/customers.yaml`; rebuilt `app/data/` identical to HEAD apart from `built_at`. |

**Blocked** (for the integrator; I did not edit these files):
1. **D19 decision note to record** in `docs/decisions.md` (user decision "five rooms, full season", 14 Nov 2026): *"Honest testing for the two remaining shared fits. For each room, the fruit-weight curve steepness and the plant-to-plant ripeness spread are fitted on the other five rooms' complete-season crop weighings. The held-out room never contributes. They stand in for the grower's previous crop (`growth.steepness_from: other_rooms_full_season`, `ripeness.spread_mid_pct`, `ripeness.spread_min_rooms`). Caveat: these two fits use other rooms' weighings dated after "today", as the timing test does; in production they would be last season's crop. The weight curve's timing is still refitted every day on the other rooms' weighings known by today, with that steepness held. The settings `growth.prior_steepness` (0.0148) and `ripeness.plant_spread_sd` (12.5) are fallbacks used only if a fit fails; on the real data no fit fails. This closes the D14 exception. Effect compared with before D19: steepness per room 0.0137–0.0157 and spread 10.65–13.24 points. The finished-growing day moves on 104 of 166 room-days (−2 to +3 days). The pluck day moves on 304 of 787 shipping plans (−1 to +3 days), and 4 plans drop out because their pluck day is now beyond the 21-day forecast. The best day moves by 1 day on 11 of 166 room-days. No card status changes."* An earlier variant fitted these on weighings dated ≤ today only. It moved pluck days up to 13 days later and was implausible against the data, so the user chose this one.
2. **Contract `explain.json`** (`contracts/app-data.md`): written in a compact form to stay inside the 5 MB budget (full text on every row would add about 1.5 MB; the folder is at 4.92 MB). The shape is: `meta.kpis[kpi] = {title, meaning, steps (templates with {key}), inputs [{name, key, unit, kind, source}], caveats}`, `meta.constants`, `meta.spread_sources`, `meta.how_to_read`; `rows` = one per room × today `{room, today, values}`. A key is looked up in `values`, then the room's days.json card for the same today, then `meta.constants`. `harvest/explain.py expand()` gives the contract rows exactly, and `display()` is the formatting rule the app should copy. Writing one file per room would not help, because the budget is for the whole folder.
3. **Contract `days.json`** (integrator adds at merge): new field **`pot_spread_sd`**: number, points of % red. It is the plant-to-plant ripeness spread used for this room-day (D19: fitted on the other five rooms' crop weighings known by today, or the 12.5 fallback before 5 Nov). `app/trip.js` reads it. `contracts/check.py` FIELDS should add `optimal_from`, `optimal_to`, `look_day`, `pot_spread_sd` and an `explain` entry (`room, today, values`).
4. ~~`app/trip.js` per-card spread~~ Done with the integrator's approval (see hand-off). L07's TypeScript port should read `card.pot_spread_sd` too.
5. ~~D17 in `harvest/evidence.py` and `harvest/backtest.py`~~ Done with the integrator's approval (see hand-off).
6. **`docs/assumptions.md`** (L05): add rows for `economics.optimal_zone_share` (0.90, D16), `ripeness.spread_mid_pct` [5, 95], `ripeness.spread_min_rooms` 3, `growth.steepness_from` (other_rooms_full_season) and `growth.steepness_bounds` [0.003, 0.1]. They are already in the `config/crop.yaml` assumptions list (zone) and comments. The two fallback entries there are reworded.

**Hand-off**
- Built: per-room planting date (`common.planted`, `common.room_config`, `planted:` per room in `config/customers.yaml`; `today_range` starts no earlier than planting). `economics.optimal_zone` and `economics.look_day`, giving `optimal_from`, `optimal_to` and `look_day` on every card. `optimal_from` and `optimal_to` are null when the best day's profit is ≤ 0 (16 of 166 cards, early dates in each room); the explain step then says there is no zone and why. `harvest/explain.py` writes `explain.json` (six KPIs: best day, pots ready, profit, confidence, look day, ship day for the default destination). `economics.plant_spread` and `growth.fit_steepness` / `previous_crop_steepness`, both fitted on the other five rooms' full season (D19). Every card gets `pot_spread_sd`.
- Edits outside Owns, approved by the integrator on 14 Nov 2026, each minimal: (1) `app/trip.js`: `sellableShare` takes the spread, and `planTrip` passes `card.pot_spread_sd ?? truck.pot_spread_sd`. (2) `harvest/evidence.py`: the evidence trail starts at `planted(room)` instead of `PLANTED`. (3) `harvest/backtest.py`: the days-after-planting baseline uses each room's `planted(r)`. A rebuild after these three left `app/data/` identical, and all checks are green.
- Checked: `make build`, `make test` (111 pytest tests, contract and app checks), `node tests/test_trip.cjs` (787 plans) all green. Row-by-row diffs: D17 left everything identical; D16 and explain added fields only. Hand-worked tests for the zone (incl. contiguity and loss-making rooms), look day, spread pooling (8.66 toy, 10.65 for ideas), previous-crop steepness recovery (0.012 / 500 dd → 824 dd), the bound fallback, and the held-out room left out of its own steepness fit. `app/data/` is 4.92 MB.
- How far D19 ("five rooms, full season") moved published numbers, compared with before D19 (commit dcc5cba):
  - finished-growing day: moved on 104 of 166 cards, −2 to +3 days (steepness per room 0.0137–0.0157, against 0.0148)
  - pluck day: moved on 304 of 787 plans (81 one day earlier, 138 one day later, 52 two later, 33 three later). 4 plans drop out because the pluck day is beyond the forecast (791 → 787 rows). Pluck reason "weight": 248 → 331
  - best day: ±1 day on 11 of 166 (4 earlier, 7 later). Optimal zone edges ±1 on up to 17
  - profit on the best day: changed on 59 of 166, by at most €0.007 per m² per day. Share of pots ready today: changed on 13, by at most 5 points
  - statuses: none changed. What-if best day: ±1 day on 115 of 1,494
  - spread used: 10.65–13.24 points on every day (12.5 before)
- Known limits: the steepness and spread use other rooms' weighings dated after "today" (previous-crop stand-in, like the timing test). The fallbacks 0.0148 and 12.5 still come from all six rooms, but no fit fails on the real data, so they are unused. Explain text is in English only; the `ship_day` KPI covers the default destination only.
- Follow-ups: the integrator records D19 and updates the contract and checker (Blocked 1–3); app lanes read `explain.json` through `expand()` / `display()` ported to TypeScript, and the TypeScript port of trip.js reads `card.pot_spread_sd`. 
