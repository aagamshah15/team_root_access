# Data use and readiness

This is an offline decision-support replay at the end of November 5, 2024. It is not a live greenhouse controller. Data are used according to what they can support; adding a channel to the explorer does not establish predictive benefit.

| Source | Implemented use | Boundary |
|---|---|---|
| Six greenhouse CSVs | Degree-days, density, costs, 13 weekly operational summaries; all non-harvest channels have daily history and numeric coverage | Operational data stop at replay cutoff. Daily means of cumulative counters are descriptive, not totals. |
| Channel metadata | Explorer units, descriptions, measurement/control distinction | Missing documentation remains explicitly unknown. |
| Harvest workbook | Curve fitting, held-out room labels, hidden sample intervention, six-room evaluation | Other rooms' completed cycles proxy historical training. This is not a strictly chronological live backtest. |
| Published noon image features | Three-day confirmed canopy onset, warmth-only fallback | Not direct fruit counting; image color depends on visibility and capture conditions. |
| 31 GB image ZIP | HTTP range extraction and four real MuGrow captures; independently measured visible-red index | The full archive has not been processed into a trained vision model. Four captures are evidence, not comprehensive vision validation. |
| Outside weather CSV | All 11 channels in daily explorer through cutoff | Context only; not a proven forecast improvement. |
| Weather-forecast CSV | Examined but not consumed by planner | Issue time versus valid time is unresolved; prevent retrospective forecast leakage. |
| Public 2023 pretrial | Downloaded, audited, label compatibility documented | No validated cross-season transfer; weight-fraction target compatibility remains unresolved. |
| Business inputs | Price, area, costs, space value, sampling cost, order and packing constraints | User assumptions, not observed market prices or confirmed orders. |
| Management journal | User-entered tasks and actual outcomes, local persistence and backup | Not automatically used as training labels; no multi-user synchronization. |

## Reproducible operational coverage

| Source | Rows through cutoff | Channels (excluding time and harvest outcome) |
|---|---:|---:|
| Tomatonuts | 18,444 | 59 |
| MuGrow | 18,444 | 63 |
| Agrifusion | 18,444 | 63 |
| Reference | 18,444 | 50 |
| IDEAS | 18,444 | 58 |
| Trigger | 18,444 | 62 |
| Outside weather | 18,431 | 11 |
| Total | 129,095 | 366 |

No future records are exposed in the operational explorer. The final-harvest backtest intentionally uses future outcomes for scoring, in its separate section.

## Before production use

Validate on independent crop cycles with a locked, chronological evaluation protocol. The simple mean currently beats the daily model on final-harvest ripeness error. Check fruit-count eligibility and actual economic outcomes rather than relying on weight-share proxies. Resolve drain sensor sentinels/calibration and weather issue-time semantics. Evaluate a full image pipeline with room/cycle separation. Add live ingestion, authenticated shared storage, audit history, backups, monitoring, and grower-reviewed operating thresholds before any control-system integration. The present app issues no actuator commands.
