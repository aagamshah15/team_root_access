# CLAUDE.md

Tomato Harvest POC: a web app that tells a greenhouse grower when to harvest each room, how sure we are, and why. Built for the UIUC CDA Precision & Digital Agriculture Hackathon (Track 1, Challenge 2) on the 4th Autonomous Greenhouse Challenge dwarf-tomato dataset. Judges are company executives: practical value and clear logic matter more than code.

**Read `SPEC.md` before any task**, then `docs/development-plan.md` §1. If a task conflicts with SPEC.md, stop and ask; don't silently diverge.

## Commands

- `make setup`: create `.venv` and install `requirements-poc.txt`
- `make build`: run the pipeline on real inputs and write `app/data/`
- `make test`: pytest + contract check (run before every commit)
- `make app`: serve `app/` locally on port 8766

## Rules

**Evidence**
- Every number in the app comes from a pipeline output in `app/data/`. No hard-coded figures in HTML or JS.
- Every forecast for a room uses models fitted without that room's own hand measurements, and only data up to the app's "today".
- Report baselines honestly, including where a simple baseline beats us.
- Every assumption goes in `docs/assumptions.md` with its source and what changes if it is wrong.

**Data**
- Never commit the raw zips. Inputs are `main`'s derived tables in `out/`. Only small published files go in `app/data/` (keep the whole folder under 5 MB).
- Mock data carries `"mock": true` in `meta` and never ships.

**Code**
- Small, readable functions with docstrings that say what and why. No notebooks in the pipeline.
- Every calculation that reaches the app has a test with a hand-worked expected value in a comment.
- Settings (thresholds, prices, base temperature) live in `config/crop.yaml`, not in code.

**Language (app, docs, slides)**
- Plain words for an executive: "harvest window", "share of pots ready to sell", "how sure we are". Define any technical term the first time.
- "Estimated" / "model estimate", never "will" or "caused".
- No real company names or logos for demo customers; keep the "Demo customer — replayed 2024 data" banner.
- Credit the dataset (Maree et al., 4TU.ResearchData, CC BY 4.0) and teammates' work we build on.

## Gotchas

- Room names in the data: tomatonuts, mugrow, agrifusion, reference, ideas, trigger.
- The photo taken on harvest day shows empty tables; drop it.
- Lamp-lit photos are purple; colour indices from them are unreliable.
- `density` in the daily log is blank between re-spacings; forward-fill it.
- Planting date is 3 Sep 2024 for every room.

## Working style

- Lanes write only the files their brief lists under "Owns". Anything else goes under "Blocked" in the lane's status log.
- Small commits, one step at a time. When a lane's "Done when" list is met, fill in its hand-off.
- Record any change to a locked decision in `docs/decisions.md`.
