# L04 · Web app & demo customers

**Wave** 1 · **Spec** §8 · **Reads** `contracts/app-data.md`

## Goal

A v1 web app that feels like a real product for a grower with several greenhouse rooms: open it, see which rooms to harvest and when, how sure we are and why, and try a warmer or cooler room. Clear enough for an executive in a 2-minute video.

## Owns

- `app/index.html`, `app/app.js`, `app/style.css`, `app/mock/*.json`
- `config/customers.yaml` (three fictional customers, two rooms each, with display names and room areas)

## Tasks

- [ ] Mock data in `app/mock/` exactly matching `contracts/app-data.md` (with `"mock": true`), realistic values, so the app works before real data exists. The app reads `data/` if present, else `mock/`.
- [ ] Customer switcher (three demo customers) and a date control for "today" (default 2024-11-06).
- [ ] **My greenhouses:** a card per room — status pill, best day, harvest window, confidence, alerts count.
- [ ] **Room detail:** profit-by-harvest-day chart with the three markers and band; ripeness forecast chart with band; confidence level with its three parts and reasons; today's photo and evidence; temperature what-if slider (−2 to +2 °C, step 0.5) reading `whatif.json`; "what the grower actually did" marker.
- [ ] **Alerts** list and **How it works & limits** page (logic in plain words, assumptions from `assumptions.json`, timing test from `backtest.json`, credits).
- [ ] Always-visible banner: "Demo customer — replayed 2024 data". Phone width works (no sideways scroll). Light and dark themes. d3 v7 from cdnjs pinned; no other network calls.
- [ ] No numbers hard-coded in HTML/JS; every chart has a one-line finding, units and a source caption.

## Tests

- A small script (`app/check.mjs` or Python) that loads each mock file and asserts the fields the app reads exist. Manual check at 390 px and 1280 px wide, screenshot in hand-off.

## Done when

- App runs from `make app` on mock data with no console errors; every screen works at phone width; hand-off lists any contract field that was awkward.

## Not this lane

- Computing any number (pipeline lanes). Names must be clearly fictional, no logos, no real companies.

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 2026-11-14 | done | App v1 on mock data: 4 screens, customer switcher, replay-date control, what-if slider, light/dark, phone width. `make test` green. |
| 2026-11-14 | started | Read SPEC, plan §1–4, contract, brief. |

**Blocked:** none (all edits inside "Owns"). Note for the integrator: this brief file is also edited here (status log + hand-off), as the brief asks.

**Hand-off**
- Built:
  - `app/index.html`, `app/style.css`, `app/app.js`: static page, d3 v7.9.0 pinned from cdnjs, no other network calls, relative paths only. Reads `data/*.json`; if `data/customers.json` is missing it loads `mock/` and the banner adds "Mock numbers, not results". State lives in the URL hash (`#view=room&room=ideas&c=c2&t=2024-11-06`) so demo links reopen the same screen.
  - Screens: **My greenhouses** (one card per room: status pill with icon, best day, likely range, harvest window, how sure we are, share of pots ready today, % red, alerts in the last 7 days; rooms already harvested show the grower's actual date). **Room detail** (plain-English verdict, 4 headline tiles, profit-by-harvest-day chart with band, likely-best-day range, earliest sellable / best day / losses start / grower's actual harvest / what-if best markers; ripeness chart with earlier estimates, forecast band, crop samples, today and actual harvest; confidence with its three parts and reasons; today's photo and evidence with lamp-lit warning; temperature what-if slider −2…+2 °C reading `whatif.json`). **Alerts** (customer's rooms up to "today", newest first, numbers behind each). **How it works & limits** (logic in six plain steps, timing test with baselines and "better" tag on the lower error, per-room table, assumptions table, limits, credits).
  - Every chart has a one-line finding, units, source caption, hover tooltip and a "Show the numbers" table.
  - `config/customers.yaml`: three fictional customers (Willowmere Greenhouses, Bramblecote Growers, Fennick Hollow Produce), two rooms each, display names, area 96 m² (matches the fixture `economics.area_m2`; L05 to confirm). Rooms paired so each customer has an early and a late room on 6 Nov.
  - `app/mock/*.json` (+ 6 noon photos for 6 Nov, 1.7 MB in all) written by `app/mock/make_mock.py` from `out/dash` with a crude curve; every file has `"mock": true`. Regenerate: `python app/mock/make_mock.py`.
  - `app/check_app.py`: checks every field app.js reads, the joins it relies on (each `days` row has a forecast curve, a 0 °C what-if row and an evidence row), evenly spaced what-if steps, relative photo paths, < 5 MB, and that the page loads only pinned d3 and keeps the demo banner. Run `python app/check_app.py [folder]`.
- Checked: `make test` green (pytest + contract check on `app/mock`); `app/check_app.py` ok. Browser preview at 390 px and 1280 px, light and dark: no sideways scroll on any screen (scrollWidth = viewport), chart labels don't collide. Scripted a sweep of 6 rooms × 6 dates × 3 what-if values: no render errors. Screenshots were taken in the session preview (not saved as files).
- Known limits:
  - With no `data/` folder the probe of `data/customers.json` logs one 404 in the console. Goes away once `make build` writes `app/data/`.
  - Confidence parts show raw values (days, agree/mixed/conflict) without a per-part High/Medium/Low, because the thresholds are not in any published file.
  - The display rule "alerts in the last 7 days" is a UI constant in app.js (`ALERT_DAYS`).
  - Totals per room = per-m² value × `rooms.area_m2` (used only for the extra heating € per day).
- Awkward contract fields (for the integrator):
  - `evidence.photo` "relative path": relative to what? The app treats it as relative to the data folder (`photos/x.jpg` → `data/photos/x.jpg`); a path starting with `data/` is used as-is. Please fix the convention in the contract.
  - Per-part confidence levels (e.g. `conf_day_range_level`, `conf_freshness_level`) would let the app colour each part; today only the overall level is known.
  - `whatif.meta.heating_fit` (`{eur_m2_day_per_c, r2, n}`) is used if present to show the fit quality SPEC §6 asks for; it's not in the contract yet.
  - `backtest.rows.value` direction: the app assumes lower is better (errors). If a row is ever a "higher is better" score, add a field.
  - The sellable-pot threshold (33%) is only in `assumptions.json` by name, so the ripeness chart doesn't draw it.
- Follow-ups: switch to real `app/data/` after `make build` and re-check wording against real numbers; confirm room area with L05; wire `app/check_app.py` into `make test` (integrator owns the Makefile).
