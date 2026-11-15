# HarvestWindow

HarvestWindow helps a dwarf-tomato greenhouse manager decide whether to harvest a room today, wait for more ripening, or check a small crop sample before committing. Open [the dashboard](dashboard/index.html) in Chrome or Edge. It runs locally from the checked-in replay and camera thumbnails.

The [narrated demo](HarvestWindow-demo.mp4) runs for 1 minute 48 seconds and shows the original forecast workflow; it predates the economics, orders, operations, and task-log additions. [Submission copy](SUBMISSION.md) includes the project overview and remaining portal fields.

## Run the demo

1. Open the dashboard. It starts at the end of November 5, 2024 in MuGrow.
2. Show the split between scenarios that favor harvesting that day and scenarios that defer. Select **Reveal recorded crop sample**.
3. The six-plant sample changes the forecast and moves the central harvest day to November 6. Some scenarios still disagree, so the recommendation is to wait and reassess.
4. Open **Sellable pots** and **Profit** to compare candidate dates. Show **Backtest** for the six-room results and **Camera evidence** for four real captures of the same canopy.
5. Expand **Try a different crop sample** to enter a red-weight percentage and mean fruit weight per plant. The browser updates the selected room’s forecast at the replay cutoff.

## Rebuild

Requires Python 3.10+ with the packages in `requirements.txt`. Use the official time-series ZIP without extracting it.

```powershell
python -m pip install -r requirements.txt
python build_replay.py "C:/path/to/autonomous_greenhouse_challenge4_timeseries.zip"
python build_operations.py "C:/path/to/autonomous_greenhouse_challenge4_timeseries.zip"
python -m unittest discover -s tests -v
node tests/test_orders.cjs
```

The checked-in noon indices make the replay reproducible offline once the time-series ZIP is present. To refresh the four MuGrow camera thumbnails and their independently measured color indices, run `python camera_frames.py`. It reads only the selected RGB frames through HTTP range requests. An existing local canopy ZIP works with `--archive`.

## Results

### Operations and delivery workflow

- **Order planning:** enter quantity, deadline, daily harvest/packing capacity, and room area. A dynamic program searches the six-room subsets across candidate dates to maximize fulfilment. Each room is harvested at most once, packing happens that day, and packed pots are assumed to keep until delivery without losses. Surplus supply is not allocated to the order. Expected and lower-envelope schedules are optimized separately; neither is a probability guarantee. Export includes both schedules and inputs. This is a single-order planner, not a multi-order inventory system.
- **Recorded operations:** thirteen climate, drain, irrigation, energy, and cost summaries for the selected room over October 30–November 5. Numeric coverage and basic range checks are shown alongside raw values. Flags identify data requiring investigation, not confirmed crop problems.
- **All-channel explorer:** daily mean, minimum, maximum, coverage, and range flags across 129,095 rows and 366 source/channel combinations in six rooms and observed outside weather. Substrate, fluorescence, screen, ventilation, lighting, and CO₂ control channels are accessible. Source units and descriptions come from the supplied `channel_info.json`. These summaries support review; they are not all inputs to the ripening model. Harvest-date outcomes and observations after November 5 are excluded from the operational view.
- **Task and actual-outcome log:** assign a room, date, owner, and task; record actual pots, revenue, and costs; toggle completion. Entries persist in browser storage and support JSON backup/merge import. Monetary totals include completed entries only. There is no shared backend, role management, or live sensor integration.

The optimizer passed 100 deterministic randomized comparisons with an independent exhaustive enumerator, including room uniqueness, capacity, supply, and quantity constraints. Five Python tests cover forecast behavior and operation-data boundaries. `tests/browser.cjs` checks all rooms, exports, invalid inputs, task persistence, valid/invalid imports, and 390-pixel mobile layout with Playwright. Install Playwright separately to run that optional UI test; `CHROME_PATH` can override its Chrome executable.

See [DATA_COVERAGE.md](DATA_COVERAGE.md) for the data-use inventory and remaining gaps.

The added **Value of waiting** panel accepts greenhouse area, pot price, fruit weight, operating-cost multiplier, space opportunity cost, and sample size and labour cost. It calculates incremental sales and costs relative to harvesting today. It also finds the date minimizing maximum regret across the stated scenarios and estimates the value of a noisy crop sample using equal scenario priors. Sample costs include the entered labour cost and the maximum sale value of sacrificed pots. These monetary outputs are conditional modelling estimates.

The camera switch lets the grower exclude the camera anchor and use warmth-only curves in both the forecast and economic scenarios. The monetary panel always starts from the initial crop-state forecast, allowing the value of obtaining a sample to be examined before revealing it.

The external 2023 time-series archive was downloaded and inspected with `audit_pretrial.py`. The committed `data/pretrial-audit.json` records its 240 destructive measurements, 18,721 climate records, and available labels. It lacks a compatible red-fruit fresh-weight label in the combined sheet, so cross-season accuracy remains unverified. The ZIP is excluded from Git. Download it from the source DOI listed in the audit before rerunning that script.

The supplied weather-forecast CSV exposes one time column and forecast-variable channels. Establishing forecast issue time and target time remains necessary before using it in a historical cost-forecast evaluation. The current economics panel therefore uses the prior seven-day cost rate and explicit cost scenarios.

The replay predicts final-harvest ripeness from November 5 across six held-out rooms, 6–16 days ahead. Error is mean absolute error in percentage points of red fruit fresh weight.

| Approach | Samples revealed | Error |
|---|---:|---:|
| Mean final ripeness in the other five rooms | 0 | 7.01 pp |
| Last recorded ripeness in the held-out room | 0 | 84.37 pp |
| Warmth alone | 0 | 10.52 pp |
| Warmth and camera when available | 0 | 8.51 pp |
| Sample when scenarios disagree | 1 | 7.96 pp |
| Sample every room | 6 | 7.60 pp |

The mean wins on this single endpoint. The selective policy used one of six available samples and improved the daily model’s endpoint error by 0.55 points in this replay. The sample was revealed after the policy chose whether to ask. The underlying scenario and sampling rules are prototype settings evaluated on this same dataset.

## Methods and limits

- **Forecast.** A logistic ripening curve maps accumulated degree-days above 10 °C to the average of per-plant red fruit weight fractions. Training in each fold uses completed records from the other five rooms, as a proxy for historical crop cycles. The held-out room contributes only measurements and camera inputs available by the forecast cutoff. Future degree-days use the prior seven-day average. The first day in a streak of three consecutive images over the red-index threshold becomes the camera anchor only after the third day arrives. The Reference room falls back to warmth on November 5.
- **Decision.** Compare a 21-day horizon across training-room curves, temperature and cost scenarios, and three prices. Choose the earliest day within €0.005/m²/day of the highest profit among days that meet an assumed 85% sellable-pot target. The reported envelope is the minimum and maximum across the specified scenarios. It has no calibrated probability coverage.
- **Sample.** If the scenarios disagree about harvesting today, ask for a check. The sample partially updates the ripening curve and replaces the prior estimate of fruit weight. The November 5 measurements were collected by the study and withheld from the competition controllers. This prototype replays those measurements as a grower intervention. A commercial sampling protocol would need separate testing.
- **Economics.** The model uses per-pot operating costs in the logs, cumulative area-days, an assumed pot price, a minimum of 50 g of red fruit, and a 150 g cap. Red weight fraction substitutes for the published fruit-count condition. Future density and fruit weight are held constant and dry matter is unavailable to the planner. Estimated profit on alternate harvest dates is scenario output. The dataset observes one harvest per room.
- **Images.** Four November 5 captures from MuGrow show that the visible-red index varies within a day. The lamp setting was 100% in all four matching logs, so this demonstration alone cannot attribute the variation to lamp state. The forecast uses the published noon feature table and falls back if the signal is unconfirmed. The four newly extracted views are shown as evidence only.

## Attribution

Dataset and canopy captures by Maree, Zhang, van Marrewijk, de Zwart, Bijlaard, and Hemming, *4th Autonomous Greenhouse Challenge: Dwarf Tomato Timeseries and Images* (2025), Wageningen University & Research and 4TU.ResearchData, CC BY 4.0. Dashboard thumbnails are resized and converted to JPEG. The replay data are derived from the time-series archive and [Prathamesh Mulay’s noon feature table](https://github.com/PrathameshMulay/dwarf-tomato-harvest-forecast/blob/main/out/dash/images.csv). The degree-day and image-onset approach is based on that [forecast project](https://github.com/PrathameshMulay/dwarf-tomato-harvest-forecast). The dashboard and sampling policy were implemented for HarvestWindow.

- [Dataset DOI](https://doi.org/10.4121/fa102772-32db-4b30-bace-12f2016722ce.v1)
- [Original study and scoring method](https://www.mdpi.com/1424-8220/25/14/4321)
