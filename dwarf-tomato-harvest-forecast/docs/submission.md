# Submission text (draft for iKompete)

Draft by L06 for the team to edit. Every number comes from `app/data/` (built 14 Nov 2026) or the docs. Recheck the numbers if the data is rebuilt.

---

## Title

**Harvest Window: when to pick each greenhouse room, how sure we are, and why**
*(Placeholder name; it's close to a teammate's separate "HarvestWindow" project. Alternatives: PickPoint, RipeRoom, Pick Day.)*

## Problem

A pot-tomato grower must choose one harvest day per room. Too early, and too few pots meet the sale rule (at least one third of the fruit red by weight). Too late, and every extra day adds heating, lighting and space costs. Today that call is made by eye. Greenhouses already collect climate logs, camera images and a few hand-weighed plants, but none of it is turned into a dated, explained recommendation.

## Solution

A web app for the grower. For each room it shows:

- **Best harvest day** (an estimate), with the **harvest window**: the first day 95% of pots would sell, the most profitable day, and the day extra growing starts to lose money.
- **How sure we are** (High / Medium / Low), with three plain checks behind it: how wide the likely range of the best day is, whether the evidence sources agree, and how fresh the latest photo and crop sample are.
- **The evidence**: today's noon photo, warmth since planting, the latest crop sample, and alerts such as "room warming slower than the others".
- **A temperature what-if**: run the room up to 2 °C warmer or cooler and see the estimated change in best day, profit and heating cost.

The demo replays the 4th Autonomous Greenhouse Challenge (autumn 2024, six rooms) day by day as if it were live, for three fictional demo customers with two rooms each.

## Technical approach

- **Data:** daily climate and energy logs, outside weather, noon canopy photos (lamp-lit photos come out purple; they are flagged and their colour is lamp-corrected or treated as unreliable) and destructive crop samples (6 plants per room, three times before harvest).
- **Ripening clock:** % of fruit weight that is red follows an S-curve in degree-days (warmth above 10 °C). The curve is fitted **on the other five rooms** (leave-one-room-out) using only data known by the app's "today".
- **Camera timing:** the day red first shows on three noon photos in a row anchors the curve for this room.
- **Crop-sample update:** once a room has a ripe crop sample by "today", the curve is nudged toward it.
- **Economics:** the challenge's scoring rules as published in Maree et al. 2025 (*Sensors* 25:4321): a pot sells only if at least a third of its fruit weight is red; revenue follows the paper's price curve (up to €1.80 per pot at 150 g of red fruit); €0.75 per plant; €1.50 per m² per year per re-spacing step. Energy and fixed costs come from each room's own log. Days are ranked on net profit per m² per day grown. Plant-to-plant spread (12.5 points of % red, from the 5 Nov weighings) turns room ripeness into a share of pots that would sell.
- **Baselines:** (a) "harvest after the same number of days as the other rooms did", (b) "the other rooms' average ripeness at harvest", and (c) our warmth-only model without camera or crop sample.
- **Stack:** Python pipeline (pandas, numpy, scipy) writes small JSON files; a static HTML/JS page with d3 reads them. No server.

## Results

Timing test: forecast made on 5 Nov for each room without its own harvest measurements, compared with what happened (6 rooms; lower is better).

| Question | Our forecast | Warmth only | Simple baseline |
|---|---|---|---|
| When does the room reach the ripeness it was picked at? Average days off | **1.7** | 3.0 | 4.8 (days after planting) |
| % red at harvest: average points off | **6.2** | 10.1 | 7.0 (other rooms' average) |

- Our forecast was exactly right on the date for 3 of 6 rooms. Its worst room (House 2 in the demo) was 6 days late.
- On % red the simple baseline is close (7.0 vs 6.2 points), and it is unbiased on average, while ours runs 4.6 points low. We report it as a near-tie.
- The days-after-planting baseline uses the other rooms' real harvest dates, which were not known on 5 Nov, so it is generous to the baseline.
- The app's **best profit day** is a separate recommendation. On 5 Nov it was earlier than the growers' actual harvest in 5 of 6 rooms (same day in 1). Whether that would have paid more is a model estimate, because each room was harvested only once.
- Temperature what-if: ±2 °C moves the best day by 0–4 days. Temperature is a small lever compared with picking on the right day.

## Limits

- Six rooms, one autumn, one site, one variety, and only a few hand measurements per room. Patterns are associations, not proof.
- 5 Nov is the most favourable test day: every room had a fresh crop sample that day. Before the first ripe sample (5 Nov) the app says "Check crop / Low" for every room.
- The camera sees only the top of the canopy, and lamp-lit photos can't be read for colour.
- Fruit dry matter (part of the real price) isn't in the data; harvest labour isn't costed.
- The heating cost per °C comes from a weak fit (fit quality r² 0.24), so the what-if's cost side is rough. The what-if assumes ripening follows warmth and was not tested by changing a greenhouse.
- Customer names are fictional; each "customer" is two rooms of the same research trial.

## Credits

- **Dataset:** 4th Autonomous Greenhouse Challenge, dwarf tomato time series and images. Maree et al., 4TU.ResearchData, licence CC BY 4.0.
- **Scoring rules:** Maree et al. 2025, *Sensors* 25:4321 (rules checked against the paper by our team).
- **Forecast approach** (ripening curve on degree-days, photo onset, profit model): `main` branch, Prathamesh Mulay.
- **Ideas reused with credit** (crop-sample check, mean baseline): `codex/harvestwindow-planner` branch, Chaitanya Nirantar.
- Built for the UIUC CDA Precision & Digital Agriculture Hackathon, Track 1, Challenge 2.
