# Decisions log

Changes to SPEC.md's locked decisions (D1–D8) and fills for gaps in it. Each entry: date, decision, reason, SPEC sections touched. Newest last.

```
## Dn · Short title
Date · SPEC §x · Lanes affected
Decision. Reason.
```

---

## D9 · Scoring rules unverified until L05 checks the paper

14 Nov 2026 · SPEC §5 · L02, L05

The economic rules come from `main`'s code comments citing Maree et al. 2025 (*Sensors* 25:4321). An automated fetch of the paper was refused (HTTP 403), so they are unverified. L05 checks them in a browser. Until then the app labels them "assumed from the challenge rules".

## D10 · Use the scoring rules as verified in the paper

14 Nov 2026 · SPEC §0 D5, §5 · L02, L05 (also changes `main`'s €2.15 example figures)

L05 read Maree et al. 2025. Confirmed: one-third red by weight, 150 g cap, €0.75 per plant, ranking on profit per m² per day, 96 m² rooms. Corrected: (1) revenue per pot follows the paper's gains curve (€0 below 50 g red, €1.60 at 80 g, €1.80 at 150 g for dry matter ≤ 7%; €1.80 and €2.00 for ≥ 8%), not a flat €2.15 scaled linearly; (2) re-spacing is €1.50/m² per year per step as a fixed cost, not a one-off €1.50/m². Dry matter isn't measured, so the ≤ 7% curve is the main case and ≥ 8% is the high scenario. The user approved the switch. Reason: the project claims to be evidence-based; D9 is resolved.

## D11 · Confidence thresholds loosened

14 Nov 2026 · SPEC §4, `config/crop.yaml` confidence · L01, L04

Day range: High ≤ 7 days, Medium ≤ 12 (was 4 / 8). Freshness: High ≤ 7 days, Medium ≤ 14 (was 3 / 7). Agreement unchanged. With the old values 160 of 166 real room-days were Low and none High, while the forecast's actual timing error on 5 Nov averages 1.7 days. Approved by the user at G2.

## D12 · Integration rules from the wave-1 hand-offs

14 Nov 2026 · SPEC §4, §7, contract · L01, L03, L04

1. Strict "known by today": other rooms' crop samples count only once dated ≤ today. Before any room has a ripe sample (before 5 Nov) the forecast uses a starting guess from settings (`ripeness.prior_*`) and confidence is Low with that reason. This is stricter than `main`, which used other rooms' full history.
2. Model label `warmth+sample` added for a room with a crop sample but no camera onset yet.
3. Two photo rules, named apart: evidence `photo_usable` = lamps known off at noon (colour reliable to the eye); confidence freshness counts any noon photo with a lamp-corrected red index. MuGrow is lamp-lit at noon every day, so the stricter rule would make its camera evidence always stale.
4. Contract additions: per-part confidence levels, `whatif.meta.heating_fit`, photo paths relative to `app/index.html`.
5. Sensor plausibility ranges moved into `config/crop.yaml` (`alerts.ranges`).

## D13 · Agreement compares camera with crop sample once both exist

14 Nov 2026 · SPEC §4, `harvest/confidence.py` · L01, L04

Once a room has both a photo-timed estimate and a crop sample, the agreement check compares those two; the warmth-only model is shown as context. Before that, warmth is compared with whichever exists. Reason (L06 S5): warmth-only is our weakest method in the timing test (3.0 days off vs 1.7), yet it alone kept Bay A (IDEAS) at "Check crop / Low" every day from 5 Nov to harvest. Approved by the user. Also from the L06 review: reason labels now say "photo-timed estimate" and "latest crop sample carried to today"; the timing test is labelled as the date a room reaches the ripeness it was picked at.

## D14 · Pluck day for shipping: fruit finished growing, judged on arrival

14 Nov 2026 · `harvest/growth.py`, `harvest/logistics.py`, `harvest/shipping.py`, `shipping.json` · shipping extension (Prathamesh)

The grower asked for a pick date that loses no fruit weight and leaves the pots in best condition on the shelf after a truck trip. Pluck day = the latest of (1) the weight-complete day, when fruit reaches 98% of its final weight on a weight-vs-warmth S-curve fitted on the other rooms' weighings known by today (steepness held at the setting, timing fitted); (2) the first day at least 95% of pots would sell **on arrival**, after ripening in a 13 °C truck (pots are judged by the buyer on delivery); (3) today. The ship-by day is the last pluck day that still leaves 5+ days at 70–90% red in a 20 °C shop. Truck: one driver, 8 h a day at 70 km/h (560 km/day), same day up to 300 km; over 4 days is flagged for potted plants. Destinations are approximate road distances from Bleiswijk. The best-profit day and its profit are shown next to the pluck day so the cost of plucking earlier is visible. The days.json card gains `weight_complete_day` and `k_x1000`; `shipping.json` is added.

Status: approved by the user on 14 Nov 2026 and live on `tomato-harvest-poc` (commit `61015a7`, also on `tomato-harvest-poc-shipping`). Known exception, accepted with it: the fruit-weight curve steepness (`growth.prior_steepness`) was fitted on all six rooms' full-season weighings, including the room being forecast and data after "today", and is used for every weight-complete date. That is outside the honest-testing rule (D6, D12); only the curve's timing is refitted on the other rooms' weighings known by today. Stated as a limit; a leave-one-room-out fit is a follow-up. Shipping profit excludes freight cost, and ripening in the truck and shop follows the greenhouse warmth clock (assumptions in `docs/assumptions.md`).

## D15 · Design theme locked: the "mix"

14 Nov 2026 · SPEC §8, `docs/DESIGN.md` · wave 2 (UI/UX)

Crate-tag room cards, a harvest day strip as each room's hero (the dial was dropped), the six-step ripeness scale wherever ripeness appears, a field-log evidence trail, all on a quiet ruled console grid. Blue is the brand; green and red mean gain and loss only; amber means "check the crop"; the ripeness colours appear only inside the ripeness bar. Research and mockups: `docs/design/directions.html`. Approved by the user.

## D16 · Optimal harvest zone and three harvest points

14 Nov 2026 · SPEC §5, contract (to extend) · wave 2

The light-blue optimal zone covers the days whose profit per m² per day is within 10% of the best day's (setting `economics.optimal_zone_share: 0.90`). Three harvest points are shown together: most profit (existing best day), best shelf look (first day the room reaches the 70% red lower edge of `logistics.best_band_pct_red`), and best for shipping (D14 pluck day for the chosen destination). Approved by the user.

## D17 · Each room has its own planting date

14 Nov 2026 · SPEC §3, `docs/input-contract.md`, pipeline · wave 2

Planting date becomes a required input per room (degree-days, days grown and costs all count from it). The pipeline reads it per room instead of the fixed `PLANTED` of 3 Sep 2024 (all six demo rooms keep 3 Sep). The app gets an "Add a room" form: room name, area, planting date (required) and data files checked against the input contract; the forecast itself runs in the pipeline, as the app says. Approved by the user.

## D18 · App rebuilt in React + TypeScript

14 Nov 2026 · SPEC §0 D4, §8 · wave 2

The redesign is built with Vite, React and TypeScript and still compiles to static files that read the same `app/data/` JSON, so it can be published as an artifact or hosted anywhere and later made installable on phones. The Python pipeline and data contract are unchanged except for D16/D17 additions. Approved by the user.
