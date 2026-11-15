# HarvestWindow

**Track 1, Challenge 2.** Forecast greenhouse crop performance from plant, environmental, and management data.

## Project overview for the submission form

Growers of whole-pot dwarf tomatoes must commit a greenhouse room to one harvest date. Harvesting too early can leave pots below the sellability threshold. Waiting incurs cultivation costs and occupies greenhouse space. HarvestWindow helps the greenhouse manager decide whether to harvest today, wait, or take a crop sample before committing.

The prototype uses the organizer’s greenhouse climate, plant measurements, operating costs, and canopy images. It fits an interpretable degree-day ripening curve, adjusts the curve after a confirmed camera signal, and compares candidate harvest dates under plausible cost and ripening scenarios. When scenarios disagree about harvesting today, the app requests a sample and updates the harvest outlook. In a six-room replay, it requested one sample and lowered final-harvest ripeness error from 8.51 to 7.96 percentage points relative to the same planner without sampling. Sampling every room gave 7.60 points. A simple mean baseline scored 7.01 on the single final-harvest endpoint. The planner provides a daily trajectory for the harvest decision. Profit and alternate harvest dates are scenario estimates.

## Demo narration

**Current build additions.** The app also compares the economic value of waiting and sampling, schedules a single order across six rooms under packing constraints, exposes recorded climate/resource summaries and all-channel daily history, flags suspect sensor values, and saves local tasks and actual outcomes with backup import/export. The existing video predates these additions; record a refreshed walkthrough before submitting if these features are part of the pitch. Data coverage and limits are listed in `DATA_COVERAGE.md`.

**Opening.** A dwarf tomato grower sells the whole pot. Pick too early and some pots are still too green. Wait too long and the crop keeps using energy and greenhouse space. HarvestWindow helps the grower decide when it is worth checking the crop before committing the room.

**Forecast.** This is the MuGrow greenhouse at the end of November fifth. We forecast ripeness from accumulated warmth and use camera evidence once it persists across three days. The chart shows the range across ripening and cost scenarios. Today those scenarios disagree, so the planner asks for a crop sample.

**Intervention.** We reveal the six-plant sample from that day. It measured fifty-five percent red by weight. The model updates its trajectory, the central harvest date moves to November sixth, and the planner recommends waiting and reassessing tomorrow.

**Camera evidence.** Here are four real views of the same canopy on the same day. The visible-red index varies from about four to eight percent. We use it as evidence of ripening onset, and the forecast falls back to warmth when the signal is unconfirmed.

**Backtest.** Across six held-out rooms, the planner asked for one sample. Error fell from eight point five one to seven point nine six percentage points. Sampling all six gave seven point six. The simple mean scored best at the known harvest dates. Our prototype adds a daily forecast and a decision about when to check. Earlier-harvest profits remain scenarios.

## Portal fields to complete

Enter the team’s domain and technical leads. Upload the demo video to YouTube or MediaSpace with public or unlisted visibility, verify playback, and paste the video URL into the iKompete form.
