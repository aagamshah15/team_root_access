# Demo script: 2-minute video

Draft by L06 for the team to edit. About 260 spoken words, roughly 2 minutes at a calm pace. Every number below appears in `app/data/` (built 14 Nov 2026). If the data is rebuilt, recheck the bracketed numbers.

**Setup:** start at `#view=home&c=c1&t=2024-11-06`, 1280 px, light mode. Product name: "Harvest Window" is a placeholder. Swap in the final name (see `reports/launch-review.md` S8).

**Do not say:** "predicts the harvest date within 1.7 days". The timing test checks *when a room reaches the ripeness it was picked at*, not our best-profit day (review B3).

---

| # | Screen and action | Spoken (≈ words) |
|---|---|---|
| 1 · Problem | Home, Willowmere Greenhouses, 6 Nov. Point to the banner. | "Pick tomatoes too early and pots don't sell. Pick too late and every extra day costs heat and space. This app tells a grower which day to harvest each room, how sure we are, and why. Here it replays a real 2024 greenhouse trial as if it were live." (50) |
| 2 · Data | Hover the two room cards. | "It reads what a greenhouse already records: daily climate and energy logs, a canopy camera, and a few hand-weighed plants." (21) |
| 3 · Model | Open **House 1 · North** → ripeness chart. | "Tomatoes ripen with warmth. We learn a ripening curve from the other rooms, time it with the camera, and nudge it to the latest crop sample." (25) |
| 4 · Output | Top cards and harvest-window chart. | "Output: best day, an estimated Thursday 7 November [best_day]. 98% of pots would sell today [sellable_share_now]. Profit per square metre per day peaks there, and from Friday each extra day costs more than it earns. How sure are we? Medium, and it shows why: the likely range is 11 days wide." (50) |
| 5 · Decision | Back → **House 2 · South** → move slider to +2 °C. | "House 2 is behind: best day 18 November. Should the grower heat it? Two degrees warmer brings the best day forward two days, for an estimated gain of about a cent per square metre per day. It's a model estimate, not tested in a greenhouse." (44) |
| 6 · Feedback | Press the date arrow to 10 Nov → Alerts. | "Each new day updates the call. On 10 November the daylight photos still show little red in House 2, so the app says: check the crop before planning." (28) |
| 7 · Proof and limit | How it works → Timing test. | "Is it any good? Forecasting from 5 November without each room's own harvest data, we were 1.7 days off on average for when rooms reached harvest ripeness, versus 3.0 for warmth alone and 4.8 for a days-after-planting rule. The limit: six rooms, one season. It's a proof of concept, not proof." (52) |

**Total ≈ 270 words.** To cut, shorten beat 1.

## Numbers used and where they come from

| Number | File · field |
|---|---|
| Thu 7 Nov, 98%, Medium, 11-day range (House 1, 6 Nov) | `days.json` mugrow/2024-11-06: `best_day`, `sellable_share_now` 0.975, `confidence`, `conf_day_range_days` |
| 18 Nov (House 2, 6 Nov) | `days.json` trigger/2024-11-06 `best_day` |
| +2 °C → 16 Nov, −2 days, +€0.012/m²/day, heating €0.004/m²/day | `whatif.json` trigger/2024-11-06/delta_c 2 |
| House 2 alert on 10 Nov | `alerts.json` trigger/2024-11-10 `behind_schedule` |
| 1.7 / 3.0 / 4.8 days, 6 rooms, forecast on 5 Nov | `backtest.json` rows 0–2 |

## Recording notes

- Before recording, step to 6 Nov or later. Before 5 Nov every room says "Check crop / Low" by design (no ripe crop sample exists yet).
- Avoid lingering on the "How sure we are → Why" list until review B2 is fixed (its "camera" and "crop sample" numbers look like they contradict the evidence card).
- Keep the "Demo customer — replayed 2024 data" banner in frame in the first shot.
