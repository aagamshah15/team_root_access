# Where to find the work

For the MuGrow example in the README, start with the November 5 measurements, follow the estimated ripeness into the daily profit calculation, then compare the November 7 recommendation with the chart in the grower interface.

| File | What it contributes |
| --- | --- |
| [daily.csv](../data/inputs/daily.csv) | Room temperature, accumulated warmth, plant density and operating costs by day. |
| [plants.csv](../data/inputs/plants.csv) | Individual pot weights behind the crop evidence panel. |
| [ripeness.csv](../data/inputs/ripeness.csv) | Measured red share and fruit weight for each room and sampling date. |
| [images.csv](../data/inputs/images.csv) | Colour, lamp and canopy measurements used to detect the onset of ripening. |
| [weather.csv](../data/inputs/weather.csv) | Outside temperature and sunlight used in the energy scenarios. |
| [crop.yaml](../config/crop.yaml) | Ripening settings, sale thresholds, pricing assumptions and transport parameters. |
| [customers.yaml](../config/customers.yaml) | The six trial compartments, planting dates and areas. |
| [forecast.py](../harvest/forecast.py) | Fits the ripening curve and projects red fruit by weight for each candidate date. |
| [economics.py](../harvest/economics.py) | Prices the pots, subtracts growing costs and selects the harvest day and near-peak window. |
| [backtest.py](../harvest/backtest.py) | Replays the forecast for each held-out room and compares it with two baselines. |
| [growth.py](../harvest/growth.py) | Estimates when pots finish gaining fruit weight. |
| [shipping.py](../harvest/shipping.py) | Computes trial shipment scenarios using transit conditions and expected display life. |
| [publish.py](../harvest/publish.py) | Writes the model outputs and evidence records to the published data directory. |
| [model.ts](../web/src/grower/model.ts) | Loads the trial replay, projects custom rooms, and checks candidate dates against a buyer's order. |
| [Harvest.tsx](../web/src/grower/Harvest.tsx) | Displays the recommended date alongside profit, ripeness, canopy images and pot weighings. |
| [Shipment.tsx](../web/src/grower/Shipment.tsx) | Renders the order planner and the **How it works** calculation for the chosen trip. |
| [RoomForm.tsx](../web/src/grower/RoomForm.tsx) | Accepts the grower's temperature file, weighed sample and commercial assumptions. |

Run `make build` from the repository root to republish the forecasts from the included input tables and photos. The app copies the published data into its static build when you run `npm run dev` or `npm run build` in `web/`. The [data dictionary](app-data.md) describes the outputs. The [assumptions](assumptions.md) explain the trial scoring rules.

To prepare the inputs again from the original dataset, run [prep.py](../scripts/prep.py) with the time-series ZIP, then [image_features.py](../scripts/image_features.py) with `out` as its output folder. The camera extractor also requires the Python package `remotezip`. Run [dashboard_data.py](../scripts/dashboard_data.py) with the same ZIP to produce the five CSVs. Run these scripts from the repository root. [select_photos.py](../scripts/select_photos.py) prepares the small evidence images from the extracted thumbnails.
