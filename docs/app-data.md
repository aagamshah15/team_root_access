# Published forecast data

The Python publisher writes one JSON document per table in [data/published](../data/published). Each document has a `meta` object with source, build time and replay date range, and a `rows` array. A room and a forecast issue date (`today`) identify a decision. A future `date` identifies one of its candidate harvest days.

| File | What a row represents |
| --- | --- |
| [days.json](../data/published/days.json) | A room's recommendation on the issue date, including the best day, near-peak dates and uncertainty. |
| [forecast.json](../data/published/forecast.json) | Ripeness, saleable pot share and expected profit per square metre per growing day for one candidate harvest date. |
| [evidence.json](../data/published/evidence.json) | The day's canopy image, camera quality, accumulated warmth and most recent crop sample. |
| [shipping.json](../data/published/shipping.json) | A modelled shipment to a preset destination. The document metadata also supplies truck settings for the interactive planner. |
| [backtest.json](../data/published/backtest.json) | Error for each evaluation method, with individual room results in the metadata. |
| [rooms.json](../data/published/rooms.json) | Trial compartment, planting date, area and recorded harvest date. |
| [customers.json](../data/published/customers.json) | Grouping of the trial rooms for the replay dataset. |
| [whatif.json](../data/published/whatif.json) | The estimated change in harvest date, profit and energy cost under a temperature adjustment. |
| [alerts.json](../data/published/alerts.json) | A dated crop or sensor observation with its trigger values. |
| [assumptions.json](../data/published/assumptions.json) | A published crop setting, units, source and sensitivity. |
| [explain.json](../data/published/explain.json) | Intermediate model values for the room's decision, with shared definitions in the metadata. |

The [schema check](../scripts/check_published.py) lists required fields. The [join check](../scripts/check_joins.py) verifies that each daily decision has matching forecast, evidence and temperature scenario rows.
