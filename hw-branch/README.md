# Dwarf tomato harvest forecast

When should a greenhouse grower harvest a dwarf tomato crop to earn the most?

Built for the Precision & Digital Agriculture Hackathon (University of Illinois Urbana-Champaign, Nov 2026),
Track 1 — Plant & Controlled Environment Systems, Challenge 2: forecast greenhouse crop performance.

## Problem

Dwarf tomatoes are harvested once, as whole potted plants, so the grower picks one harvest day.
Too early and too many pots are still green and can't be sold; too late and the crop keeps paying for
lamps, heating and greenhouse space while earning nothing more. Growers judge this by eye. In the
4th Autonomous Greenhouse Challenge, all six growers (five AI controllers and one expert team)
harvested later than the economic optimum.

This project forecasts, for each greenhouse room and each day:

- how ripe the crop is now (% of fruit weight that is red), with a likely range
- when it will reach a target ripeness (default 70% red)
- which harvest day gives the highest expected profit per m² per day

## Data

[4th Autonomous Greenhouse Challenge: Dwarf Tomato Timeseries and Images](https://doi.org/10.4121/fa102772-32db-4b30-bace-12f2016722ce)
(Maree, Zhang, van Marrewijk, de Zwart, Bijlaard & Hemming, 4TU.ResearchData, CC BY 4.0).
Six identical compartments at WUR Bleiswijk (NL), Sep–Nov 2024, each run by a different grower.

| Source | Used for |
|---|---|
| Climate, control and energy log, every 5 min, per room | Temperature (degree-days), light, lamp state, costs, plant density |
| Outside weather | Context |
| Hand harvest sheet (7 Oct, 22 Oct, 5 Nov, final) | Ground-truth % red, fruit weight, plant-to-plant spread |
| Overhead RGB-D camera, 12:00 photo per room per day (464 photos) | Day red fruit first appears, red-fruit index, canopy height |

The raw data is not in this repo; the scripts read the time-series zip you download and stream
only the needed photos straight out of the 31 GB image zip.
Derived tables are in `out/`. This repo's tables are derived from the dataset above and are shared under the same CC BY 4.0 licence.

## Method

1. **Ripening clock.** % red follows an S-curve in accumulated warmth (degree-days above 10 °C):
   `pct_red = 100 / (1 + exp(-k (G - G50)))`.
2. **Photos.** Each noon photo is white-balanced (the purple grow lamps tint it) and the share of strongly
   saturated red pixels is measured. The first of three days in a row with red fruit visible marks when
   ripening started in that room. Each room's curve is anchored on that day.
3. **Honest testing.** Every room is forecast with curves fitted on the other five rooms only.
4. **Profit.** Uses the challenge's own scoring (Maree et al. 2025, *Sensors* 25:4321): a pot sells only if
   at least a third of its fruit is red, red fruit above 150 g per pot adds nothing, each plant costs €0.75,
   each re-spacing €1.50/m², ranked on net profit per m² per day. Costs come from the log. Plants in a room
   are spread as much as the 5 Nov weighings showed (±12.5 points of red). The price, €2.15 per pot,
   is backed out from the paper's published profits (implied €1.97–2.31 across rooms).

## Results

Forecast error, each room left out of the fit (percentage points of red):

| Test | Warmth only | Warmth + photos |
|---|---|---|
| % red on measured days (12 points) | 9.6 | 8.7 |
| % red at harvest, forecast on 5 Nov (6–16 days ahead) | 10.6 | 8.9 |

Most profitable harvest day, as forecast on 6 Nov:

| Room | Best day (likely range) | % red then | €/m²/day at best | Actual harvest | €/m²/day at actual | Gain |
|---|---|---|---|---|---|---|
| Tomatonuts | 11 Nov (7–14) | 72 | 0.15 | 21 Nov | 0.09 | +59% |
| Agrifusion | 14 Nov (10–18) | 68 | 0.11 | 20 Nov | 0.085 | +28% |
| Trigger | 13 Nov (9–18) | 61 | 0.24 | 21 Nov | 0.195 | +25% |
| MuGrow | 6 Nov | 77 | 0.28 | 11 Nov | 0.235 | +20% |
| IDEAS | 11 Nov (8–14) | 69 | 0.31 | 12 Nov | 0.31 | +1% |
| Reference | 15 Nov (12–18) | 63 | 0.10 | 15 Nov | 0.10 | 0% |

The best day comes when nearly every pot has passed one-third red, at roughly 60–72% red on average,
and does not move for prices between €1.75 and €2.50. Profit computed at each room's actual harvest
ranks the rooms almost as the published results do (rank correlation 0.93).

## Limits

- Six rooms, four hand-measured days each, one autumn at one site: patterns are associations, not proof.
- The camera sees only the top of the canopy and part of one table; the photo index shows when ripening
  starts and how fast it moves, not a room's exact % red.
- Fruit dry matter, which also set the price, is not in the data. Harvest labour is not in the cost model.
- Fruit weight per plant comes from the latest 6-plant weighing, so the profit forecast starts on 5 Nov.
- The 10 °C degree-day base and the 70% target are adjustable assumptions.

## Run it

```bash
pip install -r requirements.txt
python3 prep.py path/to/autonomous_greenhouse_challenge4_timeseries.zip     # clean tables -> out/
python3 image_features.py out 12                                             # stream 464 noon photos (~25 min)
python3 dashboard_data.py path/to/autonomous_greenhouse_challenge4_timeseries.zip   # tables for the dashboard -> out/dash/
python3 forecast.py 70                                                       # forecasts, validation, profit -> out/forecast/
```

`tomato_images_colab.ipynb` pulls selected photos into Google Colab without downloading the whole image zip.

## Files

| Path | What it is |
|---|---|
| `prep.py` | Cleans the harvest sheet and builds daily climate and degree-day tables |
| `image_features.py` | Streams photos from the remote zip and measures colour and depth features |
| `dashboard_data.py` | Lamp-corrected red index per room and day; small CSVs for the dashboard |
| `forecast.py` | Ripening curves, leave-one-room-out validation, harvest windows and profit by harvest day |
| `tomato_images_colab.ipynb` | Colab notebook for exploring the canopy images |
| `dashboard/index.html` | Source of the interactive dashboard page (runs inside a Claude dashboard artifact, which supplies `dash` and `d3`) |
| `out/` | Derived tables: daily climate, ripeness, per-plant harvest, image features, forecasts, profit |

## Credits

Dataset: S. C. Maree, P. Zhang, B. M. van Marrewijk, F. de Zwart, M. Bijlaard, S. Hemming.
4th International Autonomous Greenhouse Challenge, Wageningen University & Research, 4TU.ResearchData,
doi:10.4121/fa102772-32db-4b30-bace-12f2016722ce, CC BY 4.0.
Scoring rules and published results: Maree et al. (2025), *Autonomous Greenhouse Cultivation of Dwarf Tomato*,
Sensors 25(14), 4321, doi:10.3390/s25144321.
