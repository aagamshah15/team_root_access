# L09 · Pipeline: optimal zone, look day, planting date per room, explanations

**Wave** 2 · **Spec** §3, §5, D16, D17 · **Contract** `contracts/app-data.md` (D16 fields, `explain.json`)

## Goal

The pipeline publishes everything the redesign needs: the optimal zone and look day on each card, each room's own planting date used throughout, and a plain-English explanation for every KPI.

## Owns

- `harvest/explain.py` (new), `tests/test_explain.py`, `tests/test_wave2_fields.py`
- For this wave, also: `harvest/growth.py` and `harvest/economics.py` (leave-one-room-out fits for steepness and spread), `harvest/common.py` (per-room planting date), `harvest/publish.py` (new fields and file), `config/crop.yaml` (`economics.optimal_zone_share: 0.90`, an assumptions entry for it), `config/customers.yaml` (`planted:` per room, all 2024-09-03), `tests/fixtures/` (keep fixtures in step)

## Tasks

- [ ] D17: replace the fixed `PLANTED` with each room's planting date from `config/customers.yaml` everywhere it is used (degree-day origin is already in the logs; days grown, costs, evidence start, today ranges). Default rooms keep 3 Sep 2024, so published numbers must not change; prove it with a before/after diff of `app/data/` (do this step before the leave-one-room-out change, which is expected to move some numbers).
- [ ] D16: `optimal_from`, `optimal_to` (days with profit ≥ `optimal_zone_share` × best, contiguous around the best day) and `look_day` (first forecast day at the lower edge of `logistics.best_band_pct_red`) on every `days.json` card.
- [ ] `explain.json` per contract for kpis best_day, pots_ready, profit_best, confidence, look_day, ship_day (default destination): meaning, steps, inputs with values and sources, caveats. Generated from the same objects publish already holds; no new maths.
- [ ] Honest testing, no exceptions (user request, closes the D14 exception): fit the fruit-weight curve steepness (`growth.prior_steepness` today) and the plant-to-plant ripeness spread (`ripeness.plant_spread_sd`, 12.5 today) on the **other five rooms only**, using data dated ≤ today, for every room-day (fall back to the settings value only when too little data exists, and say so). Report how much published numbers move, and add a decision note under "Blocked" for the integrator to record (D19).
- [ ] Keep `app/data/` within the size budget; if `explain.json` pushes it over, write it as one file per room (`explain/<room>.json`) and say so under "Blocked" so the integrator updates the contract.
- [ ] `make build`, `make test`, `node tests/test_trip.cjs` all green.

## Done when

- New fields and file published on real data, numbers for existing fields unchanged, tests with hand-worked values for the zone and look day.

## Not this lane

- Any React code (L07, L08, L10).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|

**Blocked:** none.

**Hand-off**
- Built:
- Checked:
- Known limits:
- Follow-ups:
