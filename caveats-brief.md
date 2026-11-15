# Pre-Kickoff Caveat Brief — CDA Precision & Digital Ag Hackathon (Nov 2026)

Researched 2026-11-13, before challenges were announced. Midwest/Illinois-weighted. Each caveat is a hard rule, deadline or threshold with a $ consequence and a visible tooling gap. Items marked **(verify)** came from search snippets or secondary sources — confirm before putting on a slide.

## The pattern across all four tracks

Almost every strong gap has the same shape: **a legal/financial clock or threshold + data the farm already generates + nobody joins the two.** Sprayers log GPS but nobody checks the label; barns log temperature but nobody files the LIP evidence; yield monitors log loads but nobody checks crop-insurance commingling rules. A reusable build pattern:

> **event detector (from organizer data) → rules engine (cited regulation) → countdown + go/no-go → auto-filled evidence/record**

This scores well on ag relevance (real rule, real $), usability (one-tap verdict), and feasibility (mostly logic + UI on top of whatever dataset we're handed).

---

## Dataset → caveat lookup (use right after kickoff)

| If the organizer dataset is… | Go-to caveat | Track |
|---|---|---|
| Greenhouse climate time series (temp, RH, vents, energy) | T1-A Condensation/Botrytis vs. energy | 1 |
| Greenhouse fan/vent/CO2 logs + spray logs | T1-C WPS re-entry ventilation proof | 1 |
| Corn leaf / drone imagery, disease images | T1-B Tar spot photo → $ spray decision | 1 |
| Weather + soil moisture + field IDs | T1-alt RMA planting/prevented-plant value curve | 1 |
| Treatment / health / milk records, EID/RFID | T2-A Drug-withdrawal ship gate | 2 |
| Pen video, accelerometers, mortality logs | T2-B Mortality clock + LIP evidence pack | 2 |
| Barn temp/RH + milk/activity/rumination | T2-C Heat-load index w/ night recovery | 2 |
| Feed delivery / bin logs | T2-alt VFD expiry cross-check | 2 |
| Sprayer CAN/telemetry, GPS tracks, as-applied maps | T3-A Dicamba spray-log compliance | 3 |
| Drone flight logs (flow, speed, swath) | T3-B Spray-drone label (GPA) compliance | 3 |
| GNSS/NMEA logs with fix quality, as-planted maps | T3-C RTK outage cost auditor | 3 |
| UAV soybean imagery | T3-alt Drift-damage evidence before 30-day window | 3 |
| Yield monitor / load / bin records | T4-A ClaimGuard (crop-insurance evidence) | 4 |
| Contracts, scale tickets, shipments | T4-B Elevator counterparty exposure | 4 |
| Grain moisture/quality sensors + bids | T4-C Net Bushel shrink/drying optimizer | 4 |
| Barge rates, river stage, basis | T4-alt River-to-basis early warning | 4 |

---

## Track 1 — Plant & Controlled Environment Systems

### T1-A. Condensation (not RH) drives Botrytis — and growers overspend on energy fighting it
- **Rule/fact:** Botrytis needs free water on the leaf, which forms when leaf temp < dew point. At 95% RH / 60°F, a leaf only 1°F colder than air gets condensation (UMass Extension). Humidity control by venting raised heating cost up to 40%; heat-pump dehumidification cut total energy ~30% (ISHS 691_15).
- **Who / cost:** Midwest greenhouse ornamentals, tomatoes, cut flowers in fall–spring; crop loss + "vent-and-heat" energy.
- **Gap:** Most controllers act on an air-RH setpoint; few estimate leaf temp (radiative cooling on clear nights) or show the $ tradeoff.
- **Data:** Greenhouse climate time series (air T, RH, outside weather, heat/vent status, energy), leaf/IR temp if available.
- **24h build:** Dew point + leaf-temp estimate → hours below condensation margin per zone → risk score; what-if comparing vent-heat vs. heat-pump vs. setpoint shift in kWh/$ vs. risk-hours.
- **Pitch:** "Stop heating the sky to fight mold — dry only the hours that matter."
- **Confidence:** High real / Medium underserved.
- Sources: umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/reducing-humidity-in-greenhouse · ishs.org/ishs-article/691_15

### T1-B. Tar spot: risk forecast exists, $ spray decision doesn't
- **Rule/fact:** Tar spot cost ~231M bu US corn in 2021 (~$1.25B), the #1 corn disease that year (Crop Protection Network). Each 1% ear-leaf severity = 0.48 bu/ac (early hybrids) to 0.83 bu/ac (late). IL 2024 loss ≈ 3% ≈ $29.75/ac (farmdoc daily).
- **Who / cost:** N/central IL, IN, WI corn; a fungicide pass is ~$25–40/ac **(verify)**.
- **Gap:** Tarspotter (UW–Madison) gives weather risk per point; doesn't see actual infection, hybrid, growth stage, or break-even $.
- **Data:** Leaf/drone imagery, weather, hybrid maturity, prices.
- **24h build:** Segmentation → % severity → bu loss curve → price × bu − fungicide cost → spray/skip per field, with weather-risk overlay.
- **Pitch:** "Tarspotter says 'risky.' We say '$31/acre: spray the north 80, skip the south.'"
- **Confidence:** High facts / Med-High gap.
- Sources: cropprotectionnetwork.org (2021 corn disease loss estimates) · farmdocdaily.illinois.edu/wp-content/uploads/2025/07/fdd071425.pdf

### T1-C. Greenhouse pesticide re-entry: WPS ventilation criteria nobody proves from sensor logs
- **Rule/fact:** WPS (40 CFR 170.405) enclosed-space rules: after certain applications, no entry until a ventilation criterion is met — e.g., 10 air exchanges, or 2 h mechanical, or 4 h passive ventilation **(verify exact table)** — then the label REI still applies; with tank mixes the longest REI/PHI wins.
- **Who / cost:** Greenhouses/vertical farms with hourly crews: idle labor or early-entry violations.
- **Gap:** Spray-record software handles REI/PHI; nothing uses the facility's own fan/vent/CO2 logs to prove ventilation or predict when each zone opens.
- **Data:** Actuator logs, CO2 time series (decay = air-exchange tracer), spray logs.
- **24h build:** Estimate air exchanges from CO2 decay → per-zone countdown (ventilation → REI → PHI) → compliance log export.
- **Pitch:** "Your fans already know when it's safe to go back in."
- **Confidence:** Medium (rule real; table values need CFR check).

**Backup — RMA planting windows:** IL final planting dates June 5 corn (May 31 southernmost counties) / June 20 soy; guarantee drops 1%/day over a 25-day late period; prevented planting pays 55% (corn) / 60% (soy); notice within 72 h after final planting date. farmdoc/ISU spreadsheets exist, so novelty is lower — only use if dataset is weather + soil moisture.

---

## Track 2 — Livestock & Animal Systems

### T2-A. Drug-withdrawal "ship gate" for cull cows and milk tankers
- **Rule/fact:** FSIS residue testing at slaughter; >1 violation in 12 months → Repeat Residue Violator list (buyers avoid you). FDA warning letters under 21 CFR 530.11 — e.g., June 2026 Tex Stein Dairy shipped a cow 20 days post-meloxicam on a 21-day withdrawal. FDA has cited "no system in place to review treatment records prior to offering an animal for slaughter." Milk: the farm causing a positive tanker pays for the whole commingled load (state PMO rules).
- **Who / cost:** Dairies; a positive load can exceed $10,000 **(single source)**; cull dairy cows are the highest-violation slaughter class (~170 confirmed in FY2024 **(verify)**).
- **Gap:** DairyComp/PCDART have withdrawal fields, but failures are blank records, vet-set extralabel withdrawals never entered, and no hard check at load-out.
- **Data:** Treatment/health records, EID/RFID, milk records.
- **24h build:** Scan ID → RED/GREEN "safe to ship / safe to tank" using longest active withdrawal; flag inconsistencies (treatment without withdrawal, dumped milk but "clean"); timestamped audit log. Fold in VFD expiry check (21 CFR 558.6: VFD ≤6 months, 2-yr record retention).
- **Pitch:** "One missed day cost a dairy an FDA warning letter. We built the gate that stops the truck."
- **Confidence:** High rule / Med-High underserved.
- Sources: fda.gov warning letters (Tex Stein Dairy 06/16/2026; Golden Dakota Farms 05/20/2026; Finnerty Dairy 2017) · fsis.usda.gov residue sampling reports

### T2-B. Every death starts two clocks: IL 24-hour disposal + USDA LIP 30-day notice
- **Rule/fact:** 225 ILCS 610/17 — carcass disposed within 24 h of death; 8 IAC 90.110 — no visible carcasses, no open burning, well setbacks. USDA LIP: report loss to FSA within 30 days of it becoming apparent; pays 75% of fair market value; excessive heat is eligible; needs weather evidence + verifiable beginning/ending inventory.
- **Who / cost:** Hog finishers, feedlots in heat events (Kansas June 2022: 2,000–10,000 cattle lost). Missed notice or weak evidence = lose 75%-of-value payment.
- **Gap:** No tool ties automatic death detection to the disposal clock and an LIP evidence packet; producers reassemble photos/inventory/weather months later.
- **Data:** Pen video, accelerometers (no motion), barn T/RH, mortality/inventory logs, weather.
- **24h build:** Down/dead-animal detector → timestamped event + snapshot → 24 h and 30-day countdowns → one-click LIP evidence PDF (THI during event, inventory delta).
- **Pitch:** "Every dead animal starts two legal clocks. We start them for you — and file the evidence."
- **Confidence:** High rules / Med-High underserved. Verify current 2026 LIP deadlines.
- Sources: ilga.gov 225 ILCS 610/17 · fsa.usda.gov LIP releases

### T2-C. Heat load is cumulative — forecasts and collars miss the "no night recovery" signal
- **Rule/fact:** US heat-stress losses ≈ $2.4B/yr without abatement, $1.7B with current cooling (dairy $897M, beef $369M; St-Pierre 2003); dairy THI threshold ~68–70. Losses lag: milk and conception drop days later.
- **Gap:** Regional forecasts (USDA MARC) or pricey per-cow collars; not in-barn THI + hours since last cool night + herd response.
- **Data:** Barn T/RH, weather, milk yield, activity/rumination.
- **24h build:** Cumulative THI-hours >68 minus night recovery → next-day milk-drop prediction → fan/soaker trigger; feeds T2-B as LIP evidence.
- **Pitch:** "The weather app says 85°F. Your cows have had three nights without cooling off — here's what that costs tomorrow."
- **Confidence:** High facts / Medium underserved.
- Source: ohioline.osu.edu/factsheet/AEX-151

**Backup — IL frozen-ground manure ban** (35 IAC 502.630): no surface application on frozen/snow-covered ground without conditions incl. ¼-mile setback. Use if dataset is soil temp + pit levels.

---

## Track 3 — Automation, Robotics & Intelligent Machines

### T3-A. Dicamba label + Illinois rules vs. the sprayer's own log (2026 season)
- **Rule/fact:** 2026–27 OTT dicamba label (EPA, Feb 6 2026): wind 3–10 mph, no inversions, not within 1 h after sunrise / 2 h before sunset, no rain within 48 h, boom ≤2 ft, coarse+ droplets, 240 ft downwind buffer, no aerial, VRA + DRA, 3 runoff points (6 in PULA). **Illinois adds:** no spraying after June 20, or if field temp or NWS forecast high >85°F; no wind toward residential areas / Nature Preserves; FieldWatch check; 22-question record — incomplete = **$750 fine**.
- **Who / cost:** Applicators (fines, licenses), neighbors (~780 IL complaints Apr 2022–Jul 2025, only 85 fined, no compensation path).
- **Gap:** Records are filled by hand after the fact; the sprayer already logs GPS/speed/boom height/time but nothing checks it against label + state rules.
- **Data:** Sprayer CAN/telematics, GPS track, as-applied map, weather, parcel layers.
- **24h build:** Join sprayer log to hourly weather and sunrise/sunset → flag every violation by polygon → auto-fill IDOA 22-question sheet → "spray in next 6 h?" go/no-go.
- **Pitch:** "Your sprayer already knows if you broke the label. We make it tell you before the $750 fine — and prove it when you didn't."
- **Confidence:** High / High. Note: registration under legal challenge.
- Sources: epa.gov/node/298907 · agrinews-pubs.com 2026/03/30 "tighter restrictions for over-the-top dicamba" · investigatemidwest.org 2025/11/04

### T3-B. Spray drones under labels written for manned aircraft
- **Rule/fact:** Drones may apply only products whose labels allow aerial application, at the label's aerial minimum volume; drones typically run 2–5 GPA while some labels require 2, 5 or 10 GPA **(verify specific labels)**. OTT dicamba prohibits aerial. Part 137 operators keep customer, date, material, quantity per job for 12 months (14 CFR 137.71); RUP records within 14 days, kept 2 years. FCC put foreign-made drones on the Covered List Dec 22 2025; US spray-drone sales reportedly −59% in 2025.
- **Who / cost:** Custom drone operators; farmers paying for failed jobs (incomplete overlap).
- **Gap:** UAPASTF drone label language unfinished; flight logs not mapped to label checks or Part 137 records; brand-neutral tool helps operators leaving DJI.
- **Data:** Drone flight logs (flow, swath, altitude, speed), GPS, label PDFs.
- **24h build:** Delivered GPA per pass = flow ÷ (speed × swath) → coverage/overlap heatmap → LLM-extracted label minimums/prohibitions → off-label pass flags → auto 137.71/RUP record.
- **Pitch:** "A drone that sprayed 1.8 GPA on a 2-GPA label just made an illegal application. We catch it from the flight log."
- **Confidence:** High / High (label numbers medium).
- Sources: law.cornell.edu/cfr/text/14/137.71 · ams.usda.gov/rules-regulations/pesticide-records · Purdue PPP-154

### T3-C. RTK/GNSS outages: cost nobody audits across brands
- **Rule/fact:** May 2024 geomagnetic storm compromised Deere StarFire accuracy; dealers told customers to turn RTK off; some stopped planting. Modeled: up to 18,040 IL precision farms vulnerable, ~$16k/farm expected loss **(verify — model, from snippet)**. We are near solar maximum.
- **Gap:** Vendor-specific mitigation (Trimble IonoGuard) and live monitors exist; no fleet-agnostic post-hoc audit of fix degradation → skipped/overlapped rows → $.
- **Data:** NMEA/GNSS logs with fix quality/HDOP, as-planted/as-applied maps, NOAA SWPC Kp.
- **24h build:** Parse fix quality along path → map sub-RTK segments → skip/overlap acres from swath geometry × seed/chem $ → Kp-forecast "don't start this field" alert.
- **Pitch:** "When the sun knocks out your RTK, we show exactly which rows to re-check and what it cost."
- **Confidence:** High events / Med $ / Med-High gap.

**Backup — Drift evidence within IL's 30-day complaint window:** UIUC research (Hager, Kerr, Williams) detected dicamba injury by drone 8 days after exposure, even at 1/10,000 label rate. No tool packages imagery + wind into a time-stamped complaint before 30 days. Strong UIUC tie-in if we get UAV soybean imagery.

---

## Track 4 — Food, Supply Chain & Agricultural Systems

### T4-A. ClaimGuard: crop-insurance claims lost to paperwork, not weather
- **Rule/fact:** Notice of loss within 72 h of discovery (no later than 15 days after insurance period). Mycotoxin quality adjustment requires adjuster/disinterested-party samples **before** grain goes into storage; farmer samples don't count; storage-period aflatoxin increases aren't covered. Commingling production between optional units collapses them into one; multi-year grain in an unmeasured bin is treated as commingled; insurer must measure prior-year grain before new crop goes in.
- **Who / cost:** Any insured corn/soy grower with a loss; indemnities of tens–hundreds $/ac cut or denied.
- **Gap:** FMIS (FieldView, Granular) log loads but don't check them against policy rules; agents remind by phone.
- **Data:** Yield monitor / load logs (field, unit, bin, time), bin inventory, weather/hail events, mycotoxin tests.
- **24h build:** Rules engine + harvest/bin ledger → flag commingling, start 72 h timer on weather event/yield drop, warn "get adjuster sample first" before storage, generate evidence packet.
- **Pitch:** "Farmers lose valid claims on paperwork, not weather. ClaimGuard catches it before the auger turns."
- **Confidence:** High rules / Med-High underserved.
- Sources: rma.usda.gov Basic Provisions (17-BR) · rma.usda.gov FAD-026 · RMA aflatoxin fact sheet

### T4-B. Who insures you against your elevator going bankrupt?
- **Rule/fact:** Illinois Grain Insurance Fund pays only **85% of price-later claims, capped at $250k**, and only if delivery/pricing is within 160 days of failure and execution/delivery within 365 days (240 ILCS 40/25-10); $1M max per claimant. Hansen-Mueller (Omaha) filed Ch. 11 Nov 17 2025 — Iowa pays 90%/$400k; Kansas sellers had no state coverage; Wisconsin sellers ineligible (not licensed there).
- **Who / cost:** Farmers holding unpriced/deferred grain at a failing buyer: lose 15%, everything over the cap, or everything outside the windows.
- **Gap:** Contracts live in spreadsheets/elevator portals; no view of uninsured exposure by buyer by day, or alerts before the 160/365-day cliffs.
- **Data:** Contracts, scale tickets, shipments, state license lists.
- **24h build:** Upload contracts → covered vs. uncovered $ per buyer under each state's rules → countdown to coverage cliffs → "what if this buyer fails today" stress test.
- **Pitch:** "Crop insurance covers hail. Who covers your elevator?"
- **Confidence:** High / High.
- Sources: farmdocdaily.illinois.edu 2022/05 price-later contracts · agr.illinois.gov Illinois Grain Code · rfdtv.com Hansen-Mueller

### T4-C. Net Bushel: the shrink you don't see
- **Rule/fact:** Central IL elevators commonly shrink 1.4%/point above 15% moisture vs. ~1.176% true water loss; drying ~3.5¢/point/bu (farmdoc 2016 **(rates vary — verify current)**). Aflatoxin action level 20 ppb (corn, unknown use); blending to dilute generally prohibited.
- **Who / cost:** 200 bu/ac at 20% moisture → ~2.2 bu/ac excess shrink (~$9/ac) + ~$35/ac drying ≈ $44k per 1,000 ac per season.
- **Gap:** Each elevator posts its own schedule; no tool compares net $/bu across elevators combined with field dry-down forecast and on-farm drying.
- **Data:** Grain moisture/quality sensors, weather, bids, discount schedules.
- **24h build:** Dry-down model + discount schedules + bids → best (harvest date, destination, dry on-farm?) by net $/bu; mycotoxin routing flag.
- **Pitch:** "Elevators shrink corn 1.4% a point; water only weighs 1.18%. We find the cheapest way to sell wet grain."
- **Confidence:** High mechanics / Medium novelty.
- Sources: farmdoc.illinois.edu fefo_09_16 · corn.agronomy.wisc.edu L033 · fda.gov mycotoxins

**Backup — River-to-basis early warning:** ~48% of US corn/soy exports first move by barge; freight spikes pass ~60–71% into corn basis in exposed counties (Zhang et al. 2026 **(verify units)**). Public data: USDA AMS Grain Transportation Report, USACE gauges. **Skip FSMA 204** unless given produce data — compliance pushed to July 20, 2028; corn/soy not on the Food Traceability List; crowded vendor space.

---

## Top pick per track (if forced to choose now)

| Track | Pick | Why |
|---|---|---|
| 1 | T1-A Botrytis/energy | Most likely CEA dataset match; physics + $ story |
| 2 | T2-A Withdrawal ship gate | 2026 FDA letters, FDA literally names the missing "system" |
| 3 | T3-A Dicamba spray-log compliance | Hard numeric rules, $750 fine, any telemetry dataset |
| 4 | T4-B Elevator exposure | Most novel; fresh Hansen-Mueller story; IL statute backbone |

## Verify before pitching
WPS ventilation table values · 8 bu/ac corn replant factor · fungicide $/ac · 2026 LIP deadlines · IL SB1656 status · FY2024 FSIS dairy violation counts · drone label GPA minimums · $16k/farm RTK model · FSMA 204 final compliance-date rule · Zhang barge-rate units · current elevator shrink/drying rates · dicamba registration litigation status.
