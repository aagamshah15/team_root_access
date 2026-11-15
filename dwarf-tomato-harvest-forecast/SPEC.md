# Tomato Harvest POC — Build Spec

Version 0.1 (draft for approval at G1) · 14 Nov 2026 · Branch `tomato-harvest-poc` · Owner: Aagam

This file says **what** we build. `docs/development-plan.md` says **who builds what and when**. If a task conflicts with this file, stop and ask; don't silently diverge. Changes to locked decisions go in `docs/decisions.md`.

---

## 0. Decisions (locked for v1 once approved at G1)

| # | Decision | Choice |
|---|---|---|
| D1 | Product | A web app a greenhouse grower uses to decide **when to harvest each room**, with a confidence level and the evidence behind it |
| D2 | Users in the demo | Three fictional customer profiles ("demo customer" on screen), each owning two of the six real rooms. No real company names or logos |
| D3 | Data | The organizer dataset (4th Autonomous Greenhouse Challenge, CC BY 4.0) is the primary input. It is replayed as if live: the app's "today" defaults to **6 Nov 2024** and can be moved day by day. Outside datasets are secondary, documented in `docs/assumptions.md` |
| D4 | Stack | Python pipeline (pandas, numpy, scipy) writes small JSON files; the app is a static HTML/CSS/JS page reading those files, with d3 from cdnjs. No server. Published as a private claude.ai Artifact for the demo |
| D5 | Harvest-day logic | The challenge's economic scoring rules (§5), verified against Maree et al. 2025 (D10) |
| D6 | Honest testing | Every number shown for a room comes from models fitted **without that room's own hand measurements** (leave-one-room-out), using only data up to the app's "today" |
| D7 | Language | Plain, low-jargon English for an executive audience. Say "estimated", never "will". Every chart states its source and assumptions |
| D8 | Code reuse | Builds on `main` (ripening curve, photo onset, profit model). Ideas from `codex/harvestwindow-planner` (crop-sample check, mean baseline) are reused with credit, not copied wholesale |

---

## 1. Repo layout (new files only; `main`'s files stay as they are)

```
CLAUDE.md                 # conventions for agents (integrator)
SPEC.md                   # this file (integrator)
Makefile                  # setup / build / test / app (integrator)
requirements-poc.txt      # pinned deps (integrator)
contracts/
  app-data.md             # JSON files the app reads: names, fields, types (integrator)
  check.py                # contract checker used by tests (integrator)
config/
  crop.yaml               # crop settings: base temp, sellable rule, price, costs (L05)
  customers.yaml          # demo customer profiles → rooms (L04)
harvest/                  # Python package
  common.py               # load inputs, room names, replay date helpers (integrator)
  forecast.py             # ripening forecast per room per day (L01)
  confidence.py           # confidence level and its parts (L01)
  backtest.py             # how good the timing is vs simple baselines (L01)
  economics.py            # profit by harvest day, harvest window (L02)
  whatif.py               # temperature what-if (L02)
  evidence.py             # photo + measurement trail per room-day (L03)
  alerts.py               # behind-schedule and sensor alerts (L03)
  publish.py              # writes app/data/*.json per contract (integrator)
app/
  index.html, app.js, style.css   # the web app (L04)
  data/                   # published JSON + selected photos (publish.py, L03 photos)
  mock/                   # contract-shaped mock JSON for building the app early (L04)
tests/
  fixtures/               # tiny input tables with hand-checked values (integrator)
docs/
  development-plan.md     # lanes, waves, gates (integrator)
  decisions.md            # decision log (integrator)
  assumptions.md          # every assumption, its source and its effect (L05)
  input-contract.md       # what a customer must send us, for replication (L05)
  lanes/LNN-*.md          # lane briefs + status logs
  demo-script.md          # 2-minute video script (L06)
reports/
  launch-review.md        # fresh-eyes review (L06)
```

## 2. Environment

- Python 3.11+ in `.venv` (`make setup`). Raw zip at `../autonomous_greenhouse_challenge4_timeseries.zip` (override `ZIP=`).
- Inputs the pipeline reads (already produced by `main`'s scripts, all derived from the organizer data):
  `out/dash/{daily,ripeness,plants,images,weather}.csv`, `out/image_features.csv`, `out/thumbs/*.jpg` (gitignored; rebuild with `image_features.py`).
- `make test` = pytest + contract check on `app/data/` (or `app/mock/` before real data exists). Run before every commit.

## 3. Inputs (what a customer sends — POC version)

| Feed | Interval | Fields used |
|---|---|---|
| Climate, control, energy log per room | 5 min → daily | air temperature (mean/min/max), humidity, CO₂, light, lamp state, heating MJ, lighting kWh, cost €/m², plant density |
| Outside weather | 5 min → daily | outside temperature, sun |
| Plant measurements | a few times per crop | per plant: total fruit weight, red fruit weight, % red |
| Canopy RGB-D camera per room | 4 photos/day | noon photo: red-fruit index after lamp correction, green share; depth: canopy distance |

The 04:00 and 08:00 photos (and noon on dark days) are tinted purple by the grow lamps. v1 uses the noon photo and flags lamp-lit frames; the app says why.

## 4. Forecast and confidence (L01)

- **Ripening clock:** % red (by fruit weight) = `100 / (1 + exp(-k (G - G50)))`, G = degree-days above the crop base temperature (10 °C default). Fit on the other five rooms.
- **Camera anchor:** a room's G50 = degree-days on its photo onset day (first of 3 consecutive days with red index > threshold, known only once the 3rd day has passed) + offset learned from the other rooms. Before onset, warmth-only.
- **Crop-sample update:** when a plant measurement exists by "today", the room's curve is shifted to pass through it (partial update, weight in `config/crop.yaml`).
- **Future warmth:** degree-days per day = mean of the last 7 days (what-if changes this, §6).
- **Plant-to-plant spread:** pots in a room ripen at different times; spread = pooled sd of the 5 Nov weighings (12.5 points), used for "share of pots sellable".
- **Confidence level** (High / Medium / Low), shown with its three parts so a grower can see why:
  1. *Day range* — the likely range of the best day from the leave-one-room-out error (narrow = good).
  2. *Evidence agreement* — do the warmth model, the camera and the latest crop sample agree on how ripe the room is today (within set points)?
  3. *Freshness* — days since the last crop sample and since the last usable photo.
  Thresholds live in `config/crop.yaml` and are a G1 decision.
- **Timing test (backtest):** for each room, forecast made on the decision day of when the room reaches the ripeness it actually had at harvest, compared with its actual harvest date (days off). Baselines: (a) "same number of days after planting as the other rooms' average harvest", (b) "average final ripeness of the other rooms" for the ripeness endpoint. Report both, including where a baseline wins.

## 5. Economics and harvest window (L02)

Scoring rules (verified against Maree et al. 2025 by L05; decision D10):
- A pot sells only if at least one third of its fruit (by weight) is red.
- Revenue per pot follows the paper's gains curve in red fruit grams: €0 below 50 g, rising to €1.60 at 80 g and €1.80 at 150 g; above 150 g adds nothing. That is the main case (dry matter ≤ 7%); the high case (dry matter ≥ 8%) is €1.80 at 80 g and €2.00 at 150 g. Dry matter isn't in the data, so it is shown as a scenario.
- Costs: €0.75 per plant; €1.50/m² per year for each re-spacing step, as a fixed cost; energy and other fixed costs from the room's log; future daily cost = mean of the last 7 days.
- Ranked on net profit per m² **per day grown**.

Outputs per room and "today", over the next 21 days:
- **Earliest sellable day:** first day ≥ 95% of pots are sellable (setting).
- **Best profit day:** highest expected profit per m² per day.
- **Losses start:** first day after the best day when the extra day's cost exceeds its extra revenue.
- Profit curve with low/high band (scenarios: ripening early/late, price low/high).
- Gain vs the room's actual harvest date (replay only).

## 6. Temperature what-if (L02)

- Slider: change the room's average temperature by −2 to +2 °C from today.
- Effect on ripening: degree-days per day change by the same amount (bounded at the base temperature).
- Effect on cost: extra heating €/m²/day per °C, estimated from the logs (heating cost against inside−outside temperature difference across rooms). Stated as an estimate with its fit quality.
- Shows: new best day, change in days, change in profit per m² per day, and the extra energy cost.
- Wording: "model estimate, not tested in the greenhouse".

## 7. Evidence and alerts (L03)

- **Evidence trail per room-day:** the noon photo (thumbnail), its red index and whether lamps were on, canopy distance, last crop sample (date, % red, weight), degree-days today, and which model was used (warmth / camera / sample).
- **Alerts** (each with a reason in plain words and the numbers behind it):
  - *Behind or ahead of schedule:* camera or sample ripeness outside the forecast band.
  - *Sensor check:* missing data, flat-lined readings, out-of-range values.
  - *Room drifting:* warmth per day well below the other rooms.
  - Disease detection is **not** in v1 (no disease labels in the data); roadmap only.

## 8. The app (L04)

Screens:
1. **My greenhouses** (customer home): one card per room — status pill (Harvest now / Plan harvest / Keep growing / Check crop), best day, confidence, alerts count.
2. **Room detail:** harvest window chart (profit by day with the three markers), ripeness forecast with band, confidence and its three parts, evidence trail with photo for "today", temperature what-if slider.
3. **Alerts:** list across rooms.
4. **How it works & limits:** the logic in plain words, assumptions (from `docs/assumptions.md`), timing test results, data sources and credits.

Rules: works at phone width; every chart has a one-line finding, units, and source caption; no hard-coded numbers in the HTML — all figures come from `app/data/`; "Demo customer — replayed 2024 data" banner always visible; a date control moves "today".

## 9. Published data contract

Defined in `contracts/app-data.md` (integrator). Files are small JSON with `{"meta": {...}, "rows": [...]}`; `meta.as_of` is the replay date range and `meta.source` names the inputs. Mock files carry `"meta": {"mock": true}` and publish refuses them.

## 10. Gates and definition of done

| Gate | When | Check |
|---|---|---|
| G1 | after wave 0 | User approves this spec, the contract, confidence thresholds and lane briefs |
| G2 | after wave 1 | Every lane merged on fixtures/mocks; `make test` green |
| G3 | after real run | `make build` on real inputs; user reviews key numbers (best days, timing test, what-if) |
| G4 | after review | L06 review blockers fixed; app published as Artifact |
| G5 | submission | Demo script, submission text, video recorded by the team |

## 11. Known limits (shown in the app)

- Six rooms, one autumn, one site, one variety; four hand measurements per room. Patterns are associations, not proof.
- The camera sees the top of the canopy and part of one table; lamp-lit frames are unusable for colour.
- Fruit dry matter (part of the real price) is not in the data; harvest labour isn't costed.
- The what-if assumes ripening follows degree-days; it was not tested by changing a greenhouse.
- Profit on dates other than the actual harvest is a model estimate; each room was harvested once.
