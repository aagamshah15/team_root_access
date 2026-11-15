# Assumptions

Every setting the forecast and the harvest window use, where it comes from, and what changes if it is wrong. The values live in [`config/crop.yaml`](../config/crop.yaml); this page explains them. Owner: lane L05. Last checked 14 Nov 2026.

**"The paper"** below means: Maree, S. C., Zhang, P., van Marrewijk, B. M., de Zwart, F., Bijlaard, M., Hemming, S. (2025). *Autonomous Greenhouse Cultivation of Dwarf Tomato: Performance Evaluation of Intelligent Algorithms for Multiple-Sensor Feedback.* Sensors 25(14):4321. doi:10.3390/s25144321 (open access, CC BY 4.0). Read in full in a web browser on 14 Nov 2026, including Table 1 and Figure 3.

**The dataset** is: Maree et al., *4th Autonomous Greenhouse Challenge* data, 4TU.ResearchData, doi:10.4121/fa102772-32db-4b30-bace-12f2016722ce.v1, CC BY 4.0.

---

## 1. Scoring rules checked against the paper

SPEC §5 took the challenge's money rules from comments in `main`'s code. This is the check, rule by rule. Quotes are short extracts from the paper.

| # | SPEC §5 rule | In the paper? | Where | Short quote | Verdict |
|---|---|---|---|---|---|
| 1 | A pot sells only if at least one third of its fruit is red | Yes | §2.5 "Cultivation Objective"; §3.1 | "If less than one third of the fruits was red" | **Confirmed.** Measured by weight: Table 1's "Red Fruits %" equals red grams ÷ total grams in our data (e.g. Trigger 268 ÷ 264 g ≈ 101%). |
| 2 | Revenue rises with red fruit weight up to 150 g; more adds nothing | Cap yes; shape no | §3.1; Figure 3 | "over the upper limit of 150 g per pot" | **Cap confirmed, shape differs.** Figure 3 is not a straight line from zero: no money below 50 g red, a steep rise to 80 g, then a gentle rise to 150 g, flat after (see §2). |
| 3 | €2.15 per pot at full value (backed out from published profits) | No | Figure 3; Table 1 | Fig. 3 caption: "When the dry matter percentage is 7% or lower, the low prices are paid" | **Differs.** Full-value price is **€1.80** (fruit dry matter 7% or lower) to **€2.00** (8% or higher). Table 1's gains per pot (€1.05–1.11) equal price minus the €0.75 plant cost for every room, exactly. €2.15 is about €0.35 per pot too high. |
| 4 | €0.75 per plant | Yes | §2.5 | "were set to EUR 0.75 per piece" | **Confirmed.** Taken off the pot's price ("gains" in Table 1 are after this cost). |
| 5 | €1.50 per m² per re-spacing | Different unit | §2.5, fixed costs | "Each step costs was assumed to EUR 1.50 per m2 per year" | **Differs.** It is a yearly charge per spacing step inside the daily fixed costs (about €0.004 per m² per day per step), not a one-off €1.50. Over a 75-day crop a step costs about €0.31/m², not €1.50. |
| 6 | Energy and fixed costs from the room's log | Partly | §2.5 | — | **Close.** The paper also charges €18.125/m²/year fixed costs and €0.07 per µmol/(m² s) of lamps per year. Summing our room logs to each harvest day gives totals 4–7% below the paper's costs (Table 1 cost per pot × average density). Gap not fully explained. |
| 7 | Ranked on net profit per m² per day grown | Yes | §2.5, Eq. (1); Table 1 | "maximize the average daily Net Profit per m2 of greenhouse" | **Confirmed.** Table 1 is reproduced for all six rooms by (gains − costs per pot) × average density ÷ days, e.g. IDEAS (1.05 − 0.44) × 39.7 ÷ 70 = 0.35 (paper 0.34). "Average density" is the harmonic mean (average floor area per pot); our daily log reproduces all six to 0.1 pots/m². |
| — | *Not in SPEC:* at least 50 g red fruit per pot | Yes | §3.1; Figure 3 | "minimum fresh weight of ripe fruits should be at least 50 grams per plant" | **New rule.** Rarely matters here: a pot that is one-third red already carries more than 80 g of red fruit (pots weigh 250–340 g of fruit at the end). |
| — | *Not in SPEC:* room area 96 m² | Yes | §2.2 | "six equal greenhouse compartments of 96 m2" | Confirms `area_m2`. |
| — | *Not in SPEC:* €0.10 per pot penalty per intervention | Yes | §2.6 | — | Charged in the challenge, left out of the paper's results. We leave it out too. |

**What we could not confirm.** The price chart (Figure 3) has no table of numbers; values were read off the image and are good to about ±€0.02. They fit Table 1 to the cent, which is strong support. Fruit dry matter sets the price but is not in the dataset, so we use the lower (7%) line; four of six rooms were below 7% (Table 1). Equations (1)–(5) did not render as text in the browser; the formulas above were rebuilt from Table 1, not read from the equations.

**Status.** The user approved switching to the paper's rules (decision D10, 14 Nov 2026; resolves D9). `crop.yaml` now uses the gains curve (`gains_curve_low` / `gains_curve_high`), €1.80 per pot at full value (€2.00 high scenario) and `respacing_cost_eur_m2_year`.

**Price curve as data points** (red fruit grams per pot → € per pot before the €0.75 plant cost; straight lines between points, flat after 150 g):

| Red fruit per pot | 0 g | 50 g | 80 g | 150 g and more |
|---|---|---|---|---|
| Dry matter 7% or lower (main case) | €0 | €0 | €1.60 | €1.80 |
| Dry matter 8% or higher (high scenario) | €0 | €0 | €1.80 | €2.00 |

## 2. What the D10 corrections change (expected direction; L02 re-runs the numbers)

- **Lower price (€1.80 vs €2.15):** profit per m² per day falls for every harvest day. The best day hardly moves: `main` showed the best day does not shift between €1.75 and €2.50.
- **Price curve shape:** the real curve pays most of the price as soon as a pot has 80 g of red fruit and little extra after. Waiting for more red fruit earns less than our straight-line version assumed, so the best day would be estimated the same or a little **earlier**.
- **Re-spacing as a yearly charge:** costs fall by about €1.20/m² per step. All re-spacing happened by 21 Oct, before any harvest decision we show, so it shifts profit level, not the best day.

## 3. All settings

"Team choice" = set by us, no outside source. "Proposed" = awaiting G1 approval.

| Name | Value | Source | If it is wrong |
|---|---|---|---|
| Planting date | 3 Sep 2024 | Paper §2.1; dataset | All "days grown" shift; nothing else. |
| Base temperature for warmth (degree-days) | 10 °C | Common convention for tomato; matches our derived tables (day 1: 22.7 °C mean → 12.7 degree-days). We did not read a primary source in the time box (see §4) | Ripening speed per warm day shifts. The temperature what-if is most affected: with a lower base, +1 °C speeds ripening proportionally less. |
| Share of fruit that must be red to sell | 1/3 by weight | Paper §2.5 (verified) | Earliest sellable day moves, and the best day with it. |
| Red fruit counted up to | 150 g per pot | Paper §3.1, Fig. 3 (verified) | A higher cap rewards waiting; best day would move later. |
| Price per pot by red fruit weight | €0 up to 50 g, €1.60 at 80 g, €1.80 from 150 g | Paper Fig. 3 (verified, D10) | Profit level changes; best day barely moves. |
| Price scenarios | €1.80 main, €2.00 high (dry matter 8% or more) | Paper Fig. 3 (D10). No lower scenario: €1.80 is already the rules' lowest full-value price | Only the width of the profit band. A real customer's market price could be lower. |
| Plant cost | €0.75 per pot | Paper §2.5 (verified) | Profit shifts by the same amount per pot; best day unchanged. |
| Re-spacing cost | €1.50 per m² per year, per step | Paper §2.5 (verified, D10) | Profit level only (spacing happens before harvest decisions). |
| Future daily cost | Mean of last 7 days of the room log | Team choice | A cold spell ahead raises heating cost; best day could move a day earlier. |
| Future warmth per day | Mean of last 7 days | Team choice | Warmer or colder days ahead move ripening by a day or two. |
| Plant-to-plant spread in ripeness | 12.5 points of % red | Dataset: 5 Nov hand weighings, 6 plants per room, pooled sd | A wider spread delays the day 95% of pots are sellable. |
| Crop-sample pull on the curve | 0.7 | Team choice | Higher trusts the last weighing of 6 plants more; one odd sample moves the forecast further. |
| Ripening-started photo rule | red fruit > 0.1% of photo, 3 days running | `main`'s `forecast.py` | Too low: lamp tint or noise starts the clock early. Too high: the camera helps later. |
| Days the harvest window looks ahead | 21 | Team choice | Too short could miss a late best day; none in the replay. |
| Earliest sellable day | 95% of pots sellable | Proposed | A lower bar shows an earlier date. |
| "Harvest now" status | 90% of pots sellable today | Proposed | Changes which card shows "Harvest now". |
| Room area | 96 m² | Paper §2.2 (verified) | Only euro totals per room. |
| Confidence thresholds | best-day range ≤4 / ≤8 days; agree within 10 points, conflict beyond 20; fresh ≤3 / ≤7 days | Proposed | Changes the High/Medium/Low label, not the dates. |
| Alert thresholds | 15 points off schedule; 3 flat days; warmth 15% below other rooms | Proposed | More or fewer alerts. |

## 4. Outside data

Outside data is secondary (SPEC D3) and is **not** a model input.

| Topic | What we did | Result | Role |
|---|---|---|---|
| Price per pot | Checked the challenge's own price chart (paper Fig. 3) instead of a market price series | €1.80–2.00 at full value; better than any market proxy because it is the rule the rooms were scored on | Replaced the backed-out €2.15 (D10) |
| Market price of potted / vine tomatoes (EU) | Not done in the time box; the paper's chart made it less useful | — | Roadmap: compare with a customer's real sales price |
| Base temperature 10 °C | Web search, 14 Nov 2026. Two candidate sources found (a review and a 2024 *HortTechnology* study of compact container tomatoes reporting minimum temperatures near 9–11 °C by variety) but neither could be opened (403 / unreadable PDF), so they are **not cited as verified** | 10 °C stays as a convention | Assumption; flagged as unverified |

No scripts or files were added under `scripts/outside_data/`, because nothing outside was downloaded.

## 5. Known limits

- Six rooms, one autumn, one site, one variety; four hand measurements per room.
- Fruit dry matter (part of the real price) and harvest labour are not in the data.
- Profit on days other than the actual harvest is a model estimate; each room was harvested once.

## Shipping extension (D14)

| Assumption | Value | Source | If it is wrong |
|---|---|---|---|
| Fruit counts as finished growing at | 98% of final fruit weight | Team choice; S-curve fitted on the crop weighings | A higher share moves the earliest pluck day later |
| Fruit-weight curve steepness | 0.0148 per degree-day (timing refitted daily) | Fitted on all six rooms' weighings this season; in production, the grower's previous crop | A flatter curve finishes growing later |
| Truck temperature | 13 °C (ripening 3 degree-days/day) | Common practice for partly ripe tomato, 12–15 °C; below ~10 °C causes chilling damage. Not from the dataset | A warmer truck ripens pots on the road: they arrive riper with fewer shelf days |
| Driving per day | 8 h at 70 km/h, one driver (560 km/day); same day up to 300 km | Team choice | Two drivers halve the days on the road for far destinations |
| Longest trip for potted plants | 4 days | General guidance: plants yellow and drop fruit in a dark truck after ~3–4 days | Longer trips may lose quality the model does not see |
| Shop temperature | 20 °C (10 degree-days/day) | Typical retail / home temperature | A warmer shop shortens the days in best condition |
| Best condition on the shelf | 70–90% of fruit weight red; off the shelf at 94% | Team assumption, general post-harvest practice | Shifts the best-on-shelf dates, sell-by date and ship-by day |
| Ship-by rule | at least 5 days in best condition after arrival | Team choice | A longer requirement moves the ship-by day earlier |
| Destinations | Rotterdam 30, Paris 500, Munich 850, Barcelona 1,500, Madrid 1,750 km | Approximate road distances from Bleiswijk (NL), not route-planned | Days on the road can change by one for borderline distances |
| Ripening after picking | follows the same warmth clock as on the plant | Tomatoes ripen after picking; the clock is fitted on greenhouse data only | Real ripening off the plant may be slower or faster, especially in the cold |
