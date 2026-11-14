# What a grower sends us, and what they get back

One page for a greenhouse customer who wants the harvest forecast for their own rooms. Owners: lane L05 (wave 1), lane L10 (planting date and file checks, wave 2, D17). Based on SPEC §3; settings in [`config/crop.yaml`](../config/crop.yaml).

A **room** is one greenhouse compartment grown as one batch: planted on one day, harvested on one day.

## What you send

### Every room starts with its planting date (required)

| Field | Format | Rule | Why |
|---|---|---|---|
| **Room name** | text, up to 60 characters | required | How the room appears on your screens and in file `room` columns |
| **Growing area** | number, m² | required, more than 0 | Profit and costs are per m² |
| **Planting date** | date, `YYYY-MM-DD` (e.g. `2027-03-01`) | **required**; not in the future; on or before the first day of the climate log | Warmth (degree-days), days grown and costs all count from this day (D17). A log that starts more than a day after planting is accepted with a warning: warmth for the missing days is unknown, so the forecast is less sure |

The six demo rooms were all planted on 3 Sep 2024.

| Feed | How often | Fields we need | Units | Required? |
|---|---|---|---|---|
| **Climate log** per room | Every 5 min (hourly also works) | Air temperature | °C | **Yes.** Drives the ripening clock |
| | | Humidity, CO₂, light, lamp on/off | %, ppm, µmol/m²/s, 0/1 | Helpful (alerts, photo checks) |
| **Cost log** per room | Daily | Heating energy, lighting energy, total running cost | MJ/m², kWh/m², €/m² | **Yes.** For the profit by harvest day |
| **Crop plan** per room | When it changes | **Planting date (required, see above)**, plant density (pots per m²) and the date of each re-spacing, room area | date, pots/m², m² | **Yes** |
| **Crop samples** | A few per crop (we used 3 before harvest, 6 plants each) | Per plant: total fruit weight, red fruit weight (or % red) | g, % | **Yes, at least one** from the colour-turning stage. More samples make the forecast more sure |
| **Canopy photo** per room | Daily, around noon, fixed camera looking down | RGB image; depth image if you have one | JPG/PNG | Helpful. Gives early warning of ripening. Avoid photos taken under purple grow lamps |
| **Outside weather** | Hourly or daily | Outside temperature, sunlight | °C, W/m² | Optional (heating-cost estimate) |
| **Your prices** | Once per season | Price per pot (or per kg), plant cost, re-spacing cost, the "sellable" rule | € | **Yes.** Otherwise we use the challenge's rules |

**Format.** CSV files, one row per room per time stamp, with a `room` and a `timestamp` column (ISO 8601, local time with time zone), or a read-only link to your climate computer's data export. Photos named `room_YYYYMMDD_HHMM.jpg`.

**History needed.**
- Climate and cost logs from **planting day** to today, with no gap longer than a day.
- To learn how your crop ripens, we need **at least three finished crops** (rooms or cycles) of the same variety with their harvest-day measurements. The demo learned from five rooms at a time and tested on the sixth.
- For each room being forecast: the log up to today and its latest crop sample.

### Column names and what the app checks

The "Add a room" screen reads the files in your browser (nothing is uploaded) and checks them against this table before the room is saved as a draft. Column names are not case-sensitive; the names in brackets are also accepted. Files may use `,` or `;` between columns (with `;`, a decimal comma such as `21,5` is fine).

| File | Required columns | Checks (error blocks the room, warning doesn't) |
|---|---|---|
| **Climate log** (required) | `timestamp` (`date`, `datetime`, `time`); `air_temp_c` (`temperature_c`, `air_temperature`, `t_air`, `t_mean`, `temp`); optional `room` (`team`, `compartment`) | Error: a required column is missing; a date can't be read; rows go back in time (checked per room); temperatures look like °F (typical value above 50). Warning: readings outside −10 to 50 °C; a gap longer than one day; several rooms in one file and none named like this room |
| **Plant weighings** (required) | `date`; `fruit_weight_g` (`fw_total`, `total_fruit_g`); `red_fruit_weight_g` (`fw_red`, `red_fruit_g`) **or** `pct_red` (`pct_red_weight`, `percent_red`); optional `plant`, `room` | Error: a required column is missing; a date can't be read; a weighing is dated before planting; a weight or % red is negative or not a number; no row has both a total and a red figure; red fruit heavier than all fruit; % red outside 0–100. Warning: rows missing the total or the red figure (skipped for the share of red); a plant over 5,000 g of fruit or all weights under 5 (wrong units?); no plant shows red fruit yet (the forecast stays warmth-only until one does) |
| **Noon photos** (optional) | file names `room_YYYYMMDD_HHMM.jpg` (or `.jpeg`, `.png`) | Error: a name doesn't follow the pattern. Warning: photos from before planting (ignored); photos taken outside 10:00–14:00 (lamp-lit photos look purple) |
| **Planting date** | see above | Error: missing, not a date, in the future, or after the first climate-log day. Warning: log starts more than a day after planting |

These limits live in `web/src/lib/validate.ts` (`RULES`); change both together. The team's own derived tables (`out/dash/daily.csv`, `out/dash/plants.csv`) pass these checks as they are (the plants file with one warning: its final-harvest rows record red fruit weight only).

Passing these checks means the files are readable; it does not produce a forecast. The forecast for a new room is made by our pipeline, after you send the files.

## What you get back

For every room, every day:
- **Harvest window:** earliest day the pots are sellable, the best-profit day, and the day waiting starts to lose money.
- **How sure we are:** High / Medium / Low, with the three reasons (how wide the likely range is, whether camera, crop samples and the warmth model agree, and how fresh the evidence is).
- **Profit by harvest day** (€ per m² per day) with a low/high band.
- **Evidence:** today's photo, the latest crop sample, warmth so far.
- **Alerts:** room ripening ahead of or behind plan, sensor problems, a room drifting colder than the others.
- **What-if:** the estimated effect of running the room 1–2 °C warmer or cooler on the best day and the energy bill.

All of it as a web page, and the same numbers as small JSON files if you want them in your own systems.

## Another crop or variety

The method does not change; the settings do. For a new crop we change `config/crop.yaml`:
- base temperature for warmth (10 °C for tomato),
- the "sellable" rule and price curve (here: one-third red, up to 150 g red per pot),
- plant and re-spacing costs, room area,
- confidence and alert thresholds.

Then we re-learn the ripening curve from your own finished crops (at least three) and re-run the timing test on them before showing any forecast. Until that test is run, every number is labelled as untested.

## What we cannot do yet

- One harvest per room. Crops picked many times (high-wire tomatoes) need a different model.
- No disease or pest detection (no labelled examples in the data).
- The camera sees only the top of the canopy; fruit lower down is judged from crop samples and warmth.
