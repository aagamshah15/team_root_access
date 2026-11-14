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
| 14 Nov 2026 | done | Leave-one-room-out steepness and spread (D19 proposed). Published numbers moved: see hand-off. All checks green. |
| 14 Nov 2026 | done | `explain.json` written in a compact form (text once in meta) to stay under 5 MB: 71 KB. |
| 14 Nov 2026 | done | D16 `optimal_from`, `optimal_to`, `look_day` on every card; existing fields unchanged (row-by-row diff). |
| 14 Nov 2026 | done | D17 planting date per room from `config/customers.yaml`; rebuilt `app/data/` identical to HEAD apart from `built_at`. |

**Blocked** (for the integrator; I did not edit these files):
1. **D19 decision note to record** in `docs/decisions.md`: *"Honest testing, no exceptions. The fruit-weight curve steepness and the plant-to-plant ripeness spread are now fitted per room and per today on the other five rooms' crop weighings dated on or before today (`growth.fit_steepness`, `ripeness.spread_mid_pct`, `ripeness.spread_min_rooms`). The settings `growth.prior_steepness` (0.0148) and `ripeness.plant_spread_sd` (12.5) are now only fallbacks, used before 5 Nov 2024 when fewer than three other rooms have enough weighings; in production they would come from the grower's previous crop. This closes the D14 exception. Effect: the estimated finished-growing day moves 1 to 13 days later on 70 of 166 room-days, and pluck days move 0 to 13 days later on 290 of 791 shipping plans. Best days move by at most 1 day (7 of 166), and no status changes."* Note for the decision: the later finished-growing days look too late against the data. Rooms' fruit weight did not grow after 5 Nov (agrifusion 314 g on 5 Nov, 279 g on 20 Nov), yet with only three weighings a room the fit puts the end of growth at 778–864 degree-days, against 737 before. So being strict here costs some accuracy on the pluck day. The user should confirm they accept that.
2. **Contract `explain.json`** (`contracts/app-data.md`): written in a compact form to stay inside the 5 MB budget (full text on every row would add about 1.5 MB; the folder is at 4.92 MB). The shape is: `meta.kpis[kpi] = {title, meaning, steps (templates with {key}), inputs [{name, key, unit, kind, source}], caveats}`, `meta.constants`, `meta.spread_sources`, `meta.how_to_read`; `rows` = one per room × today `{room, today, values}`. A key is looked up in `values`, then the room's days.json card for the same today, then `meta.constants`. `harvest/explain.py expand()` gives the contract rows exactly, and `display()` is the formatting rule the app should copy. Writing one file per room would not help, because the budget is for the whole folder.
3. **Contract `days.json`**: add `pot_spread_sd` (number, points of % red; D19: the plant spread used for this room-day). `contracts/check.py` FIELDS should add `optimal_from`, `optimal_to`, `look_day`, `pot_spread_sd` and an `explain` entry (`room, today, values`).
4. **`app/trip.js`** (L07/L08 or integrator): `sellableShare` should use `card.pot_spread_sd ?? truck.pot_spread_sd`. `meta.truck.pot_spread_sd` is still the 12.5 fallback. `node tests/test_trip.cjs` passes today, because the spread rarely moves the 95%-sellable day, but it can drift apart.
5. **D17 in files outside this lane**: `harvest/evidence.py` (evidence trail starts at `PLANTED`) and `harvest/backtest.py` (the "days after planting" baseline uses `PLANTED`) should use `common.planted(room)`. No numbers change for the demo rooms.
6. **`docs/assumptions.md`** (L05): add rows for `economics.optimal_zone_share` (0.90, D16), `ripeness.spread_mid_pct` [5, 95], `ripeness.spread_min_rooms` 3, `growth.fit_steepness` and `growth.steepness_bounds` [0.003, 0.1]. They are already in the `config/crop.yaml` assumptions list (zone) and comments. The two fallback entries there are reworded.

**Hand-off**
- Built: per-room planting date (`common.planted`, `common.room_config`, `planted:` per room in `config/customers.yaml`; `today_range` starts no earlier than planting). `economics.optimal_zone` and `economics.look_day`, giving `optimal_from`, `optimal_to` and `look_day` on every card. `harvest/explain.py` writes `explain.json` (six KPIs: best day, pots ready, profit, confidence, look day, ship day for the default destination). `economics.plant_spread` and free steepness in `growth.fit_growth`, both leave-one-room-out and known-by-today, giving `pot_spread_sd` on every card.
- Checked: `make build`, `make test` (110 pytest tests, contract and app checks), `node tests/test_trip.cjs` (791 plans) all green. Row-by-row diffs: D17 left everything identical; D16 and explain added fields only. Hand-worked tests for the zone (incl. contiguity and loss-making rooms), look day, spread pooling (8.66 toy, 10.65 for ideas on 6 Nov), steepness recovery (0.012 / 500 dd → 824 dd) and the bound fallback. `app/data/` is 4.92 MB.
- How far D19 moved published numbers (before → after the leave-one-room-out fits):
  - finished-growing day: 0 days on 96 of 166 cards (the 12.5 / 0.0148 fallbacks before 5 Nov); later by 2–13 days on 68, and by ±1 day on 2
  - pluck day: later by 1–13 days on 290 of 791 plans; pluck reason "weight" goes from 248 to 405
  - best day: ±1 day on 7 of 166; best-day range edges ±1 on up to 16; optimal zone edges ±1 on up to 8
  - profit on the best day: changed on 16 of 166, by at most €0.005 per m² per day; share of pots ready today changed on 7, by at most 5 points
  - statuses: none changed; what-if best day: ±1 day on 81 of 1,494
  - spread used: 10.65–13.24 points from 5 Nov (12.5 before)
- Known limits: the fallbacks (0.0148, 12.5) still come from this season's six rooms, but they are now only used before 5 Nov. The free steepness from three weighings a room probably overstates how long fruit keeps growing (see Blocked 1). Explain text is in English only; the `ship_day` KPI covers the default destination only.
- Follow-ups: the integrator records D19 and updates the contract and checker (Blocked 1–3); app lanes read `explain.json` through `expand()` / `display()` ported to TypeScript, and switch trip.js to `card.pot_spread_sd` (Blocked 4). Consider a steadier leave-one-room-out growth fit (for example, require a weighing past the plateau) if the later pluck days are judged unrealistic.
