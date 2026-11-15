# T1 C2: Problem statement and build plan

**Challenge:** Forecast greenhouse crop performance from plant, environmental and management data.
**Dataset:** 4th Autonomous Greenhouse Challenge, dwarf tomato (WUR, 2024). License CC BY 4.0. Cite DOI 10.4121/fa102772-32db-4b30-bace-12f2016722ce.v1 and Maree et al. 2025, *Sensors* 25(14):4321.
**Deadline:** Sun Nov 15, 12:00 PM. Video max 2 minutes.
**Data on disk:** `data/agc4/autonomous_greenhouse_challenge4_timeseries/` (the 6 MB timeseries download, unzipped). The 31 GB image zip has **not** been downloaded.

---

## Problem statement (draft)

Dwarf tomatoes are grown for a **single harvest**. The grower has to pick one day, and that day sets the year's profit.

- **Too early:** too few fruits are red, and below 33% red the pot earns nothing.
- **Too late:** lamps, heat and fixed costs keep adding up every day, fruit starts dropping, and the space can't be replanted.

In the 2024 Autonomous Greenhouse Challenge, **all six teams harvested too late**, including five AI teams and the WUR reference. By the paper's own analysis, harvesting **5 to 11 days earlier would have raised net profit by 17 to 50%**. The teams' top-down cameras couldn't judge ripeness on the lower trusses.

Getting harvest timing right matters in commercial greenhouses too:
- Manual weekly yield estimates are typically off by 17 to 33%.
- Labor is the largest cost in Canadian greenhouses.
- Energy drove a 23% jump in Dutch tomato growers' costs in 2022, and Dutch greenhouse tomato output fell 12.5% the following year.

**User:** the greenhouse grower or crop manager.
**Decision:** which day to harvest and book the crew for, and whether one more day of lights pays for itself.

**Pitch line:** "Even the world's best AI greenhouse teams harvested a week late. We tell you the day to pick, how sure we are, and what waiting costs."

## Solution: "Pick Day"

A tool that forecasts ripeness and yield and recommends the harvest day.

1. **Inputs**
   - The 5-minute climate and control data, rolled up into cumulative crop drivers: light sum (PAR mol/m²), degree-days, CO₂ integral, irrigation, and plant density history.
   - The energy and cost columns from the dataset.
   - Optionally, one top-down RGB frame per day for an image-based ripeness signal.
2. **Ripeness and yield model.** Predicts the red share and red-fruit fresh weight per pot as a function of the cumulative drivers. It is trained on the destructive harvest samples (4 dates × 6 compartments).
   - **Baseline:** a temperature-sum model, i.e. % red against degree-days since transplant, as used in the ISHS colour model.
   - **Ours:** the baseline plus light sum and CO₂, using a simple monotonic or logistic growth curve per compartment. This is deliberately low on parameters because the labels are few.
3. **Profit curve.** For each candidate day:
   - Revenue: the challenge's price rules. Zero below 33% red or below 50 g; the price rises up to 150 g per pot and is higher above 8% dry matter.
   - Costs: cumulative costs from the dataset's `economics/*` columns.
   - The result is net €/m²/day, with an uncertainty band.
4. **Output dashboard (Streamlit)**
   - The forecast ripening curve with its confidence band.
   - The profit-by-day curve with the recommended day marked.
   - The "cost of waiting one more day" in €.
   - What drove the forecast: light, temperature and CO₂ contributions.
   - A low-confidence warning when the data is thin.
5. **Validation, which we can also demo:** replay each team's season. For every compartment, our recommended day is compared with the day the team actually picked, and we report the profit gap.

## Mapping to what the challenge asks for

| Challenge asks | We deliver |
|---|---|
| Forecast fruit count / weight / ripeness | % red and red FW per pot vs. day |
| Baseline + approach | Degree-day baseline vs. degree-day + light + CO₂ |
| Compare time-series / image / combined | Climate-only vs. climate + top-down red-pixel fraction (stretch goal) |
| Leakage-safe split | Leave-one-compartment-out (6 folds) and forward-chaining by harvest date; features use only data before each cutoff |
| Uncertainty, missing inputs | Bootstrap over compartments; falls back to degree-days only if light or CO₂ data is missing |
| Dashboard, no unsupported causal claims | Driver attribution labelled as "associated with", not "caused" |

## Build timeline to Sunday noon

| When | Task | Owner |
|---|---|---|
| Fri night | Load data, check timestamps (DST, `1e-10` zeros), reproduce the paper's Table 1 net profit from the `economics` columns plus `Harvest.xlsx`. This sanity check proves our pipeline is correct. | Tech |
| Fri night | Write up the price rules, the user story, and the problem slide with sources | Domain |
| Sat AM | Daily feature table; baseline and our model; leave-one-compartment-out results | Tech |
| Sat PM | Profit curve, recommended day, the replay of all 6 teams; Streamlit dashboard | Tech + Domain |
| Sat PM (stretch) | Download one camera's 12:00 RGB frames only (about 80 images); compute an HSV red-pixel fraction; compare image vs. climate | Tech |
| Sat night | Limitations section; record the demo; script under 2 minutes | All |
| Sun AM | Buffer; submit before noon | All |

## Limitations to state up front (judges will ask)

- **Only 6 compartments, one climate each**, giving about 24 labels at compartment level. Results come with wide uncertainty and are a proof of concept.
- **The strategies differ in light, CO₂, density and irrigation all at once**, so effects can't be separated cleanly. We report associations, not causes.
- **Part of the price curve is inferred.** The €1.80 cap for low dry matter is from press coverage. The €2.00 cap for high dry matter is back-calculated from Table 1, and the shape of the curve between 50 and 150 g is approximated.
- **Two teams changed their harvest date by hand**, and fruit dropped before the final harvest, which lowers the final fresh weights.
- **A top-down camera misses ripeness on the lower trusses.** That is the same blind spot the AI teams had, so the image signal needs calibrating against the destructive % red.
- Deploying this would need weekly non-destructive counts, or side-view cameras, and more than one season.

## Data quirks

- Parse timestamps with `utc=True`; the offset changes at the 27 Oct DST switch.
- Zeros are stored as `1e-10`, and the first row is mostly NaN.
- Energy and cost columns are **increments per 5 minutes**, not running totals, so sum them.
- `harvest_date` is a day of year. The column sets differ by team.
- 7 Oct interim harvest: fresh weight and count only, with no ripeness breakdown.
- Final harvest: red FW for 50 plants; the full breakdown for 30 plants (21 for Reference).
