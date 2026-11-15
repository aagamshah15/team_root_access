# L03 · Evidence trail, photos & alerts

**Wave** 1 · **Spec** §3, §7 · **Feeds** publish, L04

## Goal

For every room and day, show the grower what we saw (the noon photo and the numbers from it, the last crop sample, the warmth so far), and raise plain-English alerts when something looks off.

## Owns

- `harvest/evidence.py`, `harvest/alerts.py`
- `scripts/select_photos.py`, `app/data/photos/` (selected, resized JPEGs)
- `tests/test_evidence.py`, `tests/test_alerts.py`

## Tasks

- [ ] `select_photos.py`: from `out/thumbs/` copy noon photos for 2024-10-15 → harvest (not the harvest day itself) into `app/data/photos/<room>_<date>.jpg`, resized to 320 px wide, quality 70. Keep the folder under 3 MB; if over, keep every other day before 25 Oct.
- [ ] `evidence_rows` per contract. `photo_usable` false when lamps were on at noon or the red index is missing; `canopy_distance_mm` from depth. Last crop sample = latest measurement dated ≤ that date (mean % red and mean fruit weight).
- [ ] `alerts` per SPEC §7: behind/ahead of schedule (camera red index or sample vs the forecast band — call L01's `forecast` if merged, else use `tests/fixtures/forecast_fixture.csv`); sensor checks on the daily table (missing days, flat lines ≥ 3 days, out-of-range values); room drift (7-day degree-day rate more than 15% below the other rooms' median). Thresholds in `config/crop.yaml` (`alerts:` block; fixture copy until L05 lands).
- [ ] Every alert has a short `title`, a one-sentence `message` a non-specialist understands, and the `numbers` behind it.

## Tests

- Harvest-day photo is never selected.
- Lamp-lit frame → `photo_usable` false.
- Each alert kind fires on a crafted fixture and stays quiet on a clean one.

## Done when

- `make test` green; photos folder ≤ 3 MB; alert counts on real inputs listed in the hand-off (so the integrator can sanity-check they aren't noise).

## Not this lane

- Forecast maths (L01), economics (L02), app display (L04). No disease detection (not in v1).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 2026-11-14 | done | evidence.py, alerts.py, select_photos.py, 165 photos (2.9 MB), 22 tests green. Hand-off below. |

**Blocked:**
- L05 / `config/crop.yaml`: please add `alerts.ranges` (plausible daily-mean min/max per reading). Until then `harvest/alerts.py` uses `DEFAULT_RANGES`: T_mean 5–40 °C, RH_mean 20–100 %, CO2_mean 200–2000 ppm, DLI 0–40 mol/m². Format: `ranges: {T_mean: {min: 5, max: 40}, ...}` (labels/units are filled in from the defaults).
- L05 / `docs/assumptions.md`: add (1) the ranges above, (2) "camera check is behind-only: the red index is a share of the photo, not % red by weight", (3) "photos with unknown lamp state are treated as unusable".
- Integrator / Makefile: `make PY="/Users/aagam/CDA Hack/.../.venv/bin/python" test` fails because the path has spaces (`$(PY)` is unquoted). I ran the same two commands directly (`pytest -q` and `contracts/check.py`).

**Hand-off**
- Built:
  - `harvest/evidence.py` — `evidence_rows(inputs)` per contract, one row per room × day from planting to the day before harvest (448 rows on real inputs). `photo` = `data/photos/<room>_<date>.jpg` (relative to `app/index.html`) when the file was selected, else null. `photo_usable` = lamps known off at noon and a red index exists. Last sample = latest ripeness row dated ≤ that day (`fw_total` = mean fruit weight per plant).
  - `harvest/alerts.py` — `alerts(inputs, settings=None, forecast_for=None)`; the extra arguments are optional so the contract call `alerts(inputs)` works. Uses L01's `forecast` if `harvest/forecast.py` exists, else skips the two schedule checks. Kinds: sample vs band forecast the day before (warning, behind/ahead beyond `schedule_points`); camera behind (info: last `onset_days` usable photos below `onset_red_index` while the band's late edge is above `schedule_points` % red); sensor checks (missing days, flat lines ≥ `flatline_days`, out of range); room drift (7-day degree-day rate > `drift_share` below the other rooms' median).
  - A condition lasting several days gives **one** alert dated on its first day; `numbers.until` is the last day. Suggest L04 shows an alert as active when `date ≤ today ≤ numbers.until`, and lists all alerts dated ≤ today on the Alerts screen.
  - `scripts/select_photos.py` → `app/data/photos/`: 165 JPEGs, 320 px wide, q70, 2,984 KB. The first pass was over 3 MB, so every other day before 25 Oct was dropped. `tomatonuts_2024-10-30` has no noon thumbnail.
- Checked: `pytest -q` 22 passed (evidence 8, alerts 14, each with hand-worked values in comments); `contracts/check.py` ok (still checking app/mock). On real inputs: **5 alerts** without a forecast (all `room_drift`: trigger ×4 runs, reference ×1; no sensor problems in the log). With L01's in-progress `forecast.py` (uncommitted, tried in a scratch copy) **6 alerts**: same 5 + trigger `behind_schedule` (camera) on 10 Nov. No sample-based schedule alerts fired on real data.
- Known limits: camera can only say "behind", not "ahead". Drift threshold 15% sits right at trigger's typical gap, so its alert runs flicker on and off (4 separate runs); raising `drift_share` to 0.2 would leave about 1. Photos and the app's `app/data/` must stay under 5 MB together: photos take 2.9 MB of that.
- Follow-ups: re-run the alert counts once L01 is merged; L05 to add `alerts.ranges`; integrator to call `scripts/select_photos.py` in `make build` (it needs `$HARVEST_INPUTS/thumbs/`).
