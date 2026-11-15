# Launch review (L06, fresh eyes)

14 Nov 2026 · Reviewed: `app/` served from the L06 worktree on `app/data/` built at 2026-11-14T18:36Z (commit f1778a4). Screens: home, room (House 1, House 2, Room East), Alerts, How it works. Widths 390 px and 1280 px, light and dark. Starting link `#view=home&c=c1&t=2024-11-06`.

I read it the way an executive judge would: is every number supported, is the claim no stronger than the evidence, can I follow it without jargon?

**Verdict.** The app is clean, readable and honest in tone. It works at phone width (no sideways scrolling, tables scroll inside their cards), dark mode is fine, and every chart has a finding line and a source. Three things should be fixed before the video, because a careful judge would catch them on the screens we plan to show: (B1) stale "assumed until verified" wording, (B2) the camera and crop-sample numbers contradict each other on the same room page, and (B3) the timing test's "harvest date, 1.7 days off" reads as something it isn't. All three are wording fixes.

Severity: **blocker** = fix before recording or publishing · **should-fix** = fix if time allows; a judge may notice · **nit** = polish.

---

## Blockers

### B1 · "Scoring rules (assumed until verified)" is out of date
- **Where:** How it works → step 5 "Harvest window". `app/app.js:597`. Owner **L04**.
- **What:** D10 says L05 verified the rules in the paper, and the Assumptions table on the same page says "(verified)" five times. The step still says "assumed until verified".
- **Fix:** "Using the challenge's scoring rules (checked against Maree et al. 2025), …".

### B2 · Camera and crop-sample numbers contradict each other on the room page
- **Where:** Room page → "How sure we are → Why" next to "Today's evidence"; Alerts. Owners **L01** (`harvest/confidence.py`, reason strings ~l.109–125), **L03** (`harvest/alerts.py` ~l.128, alert wording), **L04** (`app/app.js:330`, freshness caption).
- **What a judge sees (House 1, 6 Nov):** "Why" says *camera 58%, crop sample 60%*. Right beside it, the evidence card says the noon photo is "not usable · lamps on, not used for ripeness" and *Last crop sample 5 Nov: 55% red*. The 60% isn't a measurement. It's the 5 Nov sample carried forward along the curve. The "camera 58%" isn't today's photo either. It's the curve anchored on the photo onset date (`estimates_today`, confidence.py l.35–44).
- **Worse on House 2 (trigger):** on 10 Nov the alert says *"The last 3 usable noon photos show almost no red fruit"*, while the confidence reasons for the same day say *camera 42%* (higher than the warmth model's 22%). Both are "correct" under D12's two photo rules, but a reader sees "the camera says almost none" and "the camera says 42%" on the same day.
- **Fix (strings only):** in the reasons, call them *"photo-timed estimate 58%"* and *"5 Nov crop sample (55%), carried to today: 60%"*. In the alert, say *"the last 3 daylight noon photos"*. Freshness caption: *"Days since the last crop sample or last photo, whichever is longer ago"*. The current text, "newest … whichever is older", is hard to parse.

### B3 · The timing test answers a different question from the one the app's headline asks
- **Where:** How it works → Timing test; `harvest/backtest.py` (test label and notes), owner **L01**; page intro `app/app.js` (how view), owner **L04**. Also this lane's demo script and submission (done: see below).
- **What:** The table title "Harvest date, forecast on 5 Nov: average days off — 1.7" reads as "we predicted the harvest date within 1.7 days". What it actually measures: *the date each room reaches the ripeness it was actually picked at*. The app's headline is a different date, the **best profit day**, and on 5 Nov that was **earlier than the grower's actual harvest in 5 of 6 rooms** (same day in Room East). Per room: 7 vs 11 Nov, 18 vs 21, 9 vs 12, 14 vs 20, 15 vs 15, 11 vs 21 Nov, an average of 4.3 days earlier (`days.json` best_day at today=2024-11-05 vs `rooms.json` actual_harvest). A judge who sees the "Grower harvested" line sitting days after "Best day" on the chart, then reads "1.7 days off", will think one of them is wrong.
- **Fix:** rename the test *"When the room reaches its harvest ripeness, forecast on 5 Nov: average days off"*, and add one line under the table: *"This checks the ripeness clock. The best profit day is a separate recommendation; it was earlier than the growers' own harvest in 5 of 6 rooms."*
- **Also say:** the test runs on 5 Nov, the day of each room's last pre-harvest crop sample, which the forecast uses (SPEC §4 allows this; it is known by end of day). That is the most favourable day to test. Worth one clause in the note.

---

## Should-fix

| # | Finding | Where · owner | Suggested fix |
|---|---|---|---|
| S1 | **Heating-fit caption (known #1, confirmed and refined).** Says "375 rooms" (they are room-days), shows R² 0.2407 unrounded, and repeats what `whatif.note` already says ("Heating-cost fit is weak (r² below 0.3)"), so the line states fit quality twice in two formats. New: the caption shows the fit from the **last** replay day (`publish.py:142` passes `heat_by_day[todays[-1]]`, slope €0.0036/°C), but the slider values use each day's own fit (+2 °C → €0.004/m²/day on 6 Nov, i.e. about €0.002/°C). So the caption uses days after "today" and doesn't match the numbers above it. | `app/app.js:413` · L04; `harvest/publish.py:142` · integrator | Publish the fit per today (or say "fit on all days to 20 Nov"). Caption: "Heating cost per °C: rough estimate from 375 heated room-days (fit quality 0.24, weak)". Drop the duplicate from either note or caption. |
| S2 | **Heating looks almost free.** +2 °C costs €0.004/m²/day, which is €0.38 a day for a 96 m² room in November. With fit quality 0.24 that is a weak number, and it makes "warmer" look like free money (profit +€0.012 vs heating €0.004 on House 2). | `harvest/whatif.py` note · L02; `docs/assumptions.md` · L05 | Call it "a rough, probably low, estimate of heating cost" in the note and add an assumptions row: source = this fit; if wrong = warming pays off less than shown. |
| S3 | **Unrounded evidence numbers (known #1, confirmed).** "Red fruit in photo 6.434% of image", "Green leaf in photo 14.616%" (House 1, 6 Nov). | `app/app.js:389–390` · L04 | One decimal. |
| S4 | **Deep link drops to the wrong customer (known #5, refined).** The dropdown itself stays in sync. The real problem: `readHash` (`app/app.js:137`) sends you to the **home page of customer c1** whenever the room isn't one of `c`'s rooms or `c` is missing. `#view=room&room=reference&t=2024-11-06` opens Willowmere's home, not Room East. With the matching `c=c3` it works. | `app/app.js:133–137` · L04 | When `room` is given and known, set `S.customer` from `rooms.json` `customer_id` before the check. |
| S5 | **"Check crop / Low" for Bay A all week.** Bay A (ideas, customer c2) is "Check crop · Low" every day from 5 Nov to its harvest on 12 Nov, because the warmth-only model disagrees by 23–35 points. Yet the timing test shows warmth-only is our *weakest* method (3.0 days vs 1.7). The confidence check punishes a room for disagreeing with the model we trust least. Customer c2 never sees a harvest call. | `harvest/confidence.py` agreement · L01; decision for integrator (`docs/decisions.md`) | Option: judge agreement on camera vs crop sample once both exist, and show warmth as context. Not needed for the demo (use c1). |
| S6 | **"Without that room's own hand measurements" is too strong.** The How page intro says so, but the crop-sample step moves the curve to the room's **own** latest sample (`forecast.py:185–190`, allowed by SPEC §4). A judge who reads "crop sample 60%" in the room's reasons will spot it. | `app/app.js` how intro · L04 | "The ripening curve is learned on the other rooms; once this room has a crop sample by 'today', the curve is nudged toward it." |
| S7 | **Credits lack names and the paper.** "main branch" and "harvest-window planner branch" are named, but not the people, and the scoring-rules paper isn't in the credits block (only in the small source line). | `app/app.js:621` · L04 | "Forecast approach from `main` (Prathamesh Mulay); crop-sample check and mean-baseline ideas from the HarvestWindow planner (Chaitanya Nirantar). Scoring rules: Maree et al. 2025, *Sensors* 25:4321." |
| S8 | **Name clash (known #4).** "Harvest Window" is very close to the teammate's separate project "HarvestWindow", and "harvest window" is also our term for the earliest-sellable → losses-start range, so the name is overloaded. | `app/index.html` title/header · L04; docs | Suggestions: **PickPoint** (recommended: short, says "the day to pick"), **RipeRoom**, **Pick Day**, **Redline**. Keep "harvest window" as the term for the date range. |
| S9 | **What-if effect is small (known #3, refined).** On 6 Nov, ±2 °C moves the best day 0 days for House 1 and Bay A, 1–3 days elsewhere. Across all 166 room-days, +2 °C moves it 0 to 3 days earlier (0 days in 62 cases) and −2 °C moves it 0 to 4 days later. Profit change is at most €0.017/m²/day. Not a bug: the honest message is "temperature buys a day or two". | demo (this lane) | Demo the slider on **House 2 · South, 6 Nov**: +2 °C → best day 16 Nov (2 days earlier), +€0.012/m²/day profit, €0.004 heating. |
| S10 | **Before 5 Nov everything is "Check crop / Low" (known #2, confirmed).** All 96 room-days before 5 Nov have this status (115 of 166 overall). D12 makes this the intended behaviour. The app's default "today" is already 6 Nov (`app.js:11`). | demo (this lane) | Start the demo on 6 Nov; don't step backwards into October on camera. One spoken line covers it ("before the first ripe sample it says so"). |

## Nits

- "Willowmere Greenhouses**'s** rooms" on Alerts. Use "rooms at Willowmere Greenhouses". `app/app.js` alerts view · L04.
- Alert "numbers" line shows raw keys and ISO dates: "max red index: 0 · onset red index: 0.1 · until: 2024-11-20". Friendlier labels or hide `until`. `app/app.js` ~l.568 · L04 (or L03 key names).
- The trigger "Camera sees little red fruit" alert is a `behind_schedule` kind but shows as "For information". If it tells the grower to "check the crop", it reads like a warning. `harvest/alerts.py` · L03.
- Assumptions table: "0.3333 share of fruit weight" → "one third"; "EUR"/"m2" → "€"/"m²". `config/crop.yaml` labels · L05, or formatting in `app/app.js` · L04.
- The negative heating note uses a hyphen ("-0.004 €") where the cards use a proper minus ("−€0.004"). `harvest/whatif.py` note · L02.
- The footer shows the raw build timestamp "2026-11-14T18:36:32+00:00". Use "Built 14 Nov 2026". `app/app.js:198` · L04.
- At 390 px the third tab reads "How it works & lim…" and only scrolls sideways; there's no hint. Shorten it to "How it works". `app/index.html` · L04.
- Home card: "window 6 Nov – 8 Nov" next to "Likely 6 Nov–12 Nov" is two ranges in one line. Consider "sell from 6 Nov · losses from 8 Nov". `app/app.js` home card · L04.
- `app/data/` is 4.8 MB against the 5 MB cap (photos 3.2 MB). Any more photos will break the rule. Integrator / L03.

---

## Five numbers traced end to end

| # | Number on screen | Screen | `app/data/` | Made by | Check |
|---|---|---|---|---|---|
| 1 | Best harvest day **Thu 7 Nov**, **€0.13** per m² per day | House 1, 6 Nov | `days.json` mugrow/2024-11-06: `best_day` 2024-11-07, `profit_best_m2_day` 0.1309 | `economics.harvest_window` via `publish.py` | Matches `forecast.json` max `profit_m2_day` for that today. ✓ |
| 2 | **98%** of pots ready to sell, fruit **59%** red | House 1, 6 Nov | `days.json` `sellable_share_now` 0.975, `pct_red_now` 59.5 | `economics.plant_pct` (40 pots, spread 12.5 points) | 39 of 40 pots above one-third red = 97.5% → "98%". A plain normal gives P(>33.3) = 98.2%. ✓ |
| 3 | Timing test **1.7 days** (ours), **3.0** (warmth only), **4.8** (days-after-planting baseline) | How it works | `backtest.json` rows 0–2; `meta.per_room` | `backtest.timing_test` | By hand from per-room errors: ours 0,0,−1,3,0,6 → 10/6 = 1.67; warmth 0,−3,2,4,−1,8 → 18/6 = 3.0; baseline −4,6,7,2,−5,−5 → 29/6 = 4.83, mean signed +0.17 ("0.2 days late"). % red: ours 37.4/6 = 6.2, baseline 41.9/6 = 7.0. ✓ |
| 4 | Last crop sample **5 Nov: 55% red, 342 g** | House 1 evidence | `evidence.json` mugrow/2024-11-06 | `evidence.evidence_rows` from `out/dash/ripeness.csv` | ripeness.csv mugrow 2024-11-05: pct_red_weight 55.3, fw_total 341.59. ✓ |
| 5 | Heating fit **R² 0.2407, 375** | House 1 what-if caption | `whatif.json` `meta.heating_fit` | `whatif.heating_cost_per_degree(inputs, 2024-11-20)` in `publish.py:142` | Traces correctly, but it is the **20 Nov** fit, not the fit used for the 6 Nov slider values (see S1). ✗ (labelling) |

Also checked: "748 degree-days" (House 1, 6 Nov) = ripeness.csv 737.6 on 5 Nov + about one day's warmth ✓. Alert "9.0 degree-days a day, 15% below the median of 10.6" (House 2, 5 Nov) agrees with its numbers (8.99 vs 10.63 → 15.4%) ✓.

## Not checked

- Light mode at 390 px was checked on the How page only. Dark mode at 390 px was checked on home and room.
- Customer c3 rooms only at the room-page header level. I didn't recheck pre-5 Nov screens beyond the counts in `days.json`.
- No keyboard or screen-reader pass.
