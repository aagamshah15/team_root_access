# L07 · React shell, design system & screens

**Wave** 2 · **Spec** §8, D15, D18 · **Design** `docs/DESIGN.md` · **Reads** `contracts/app-data.md`

## Goal

The app rebuilt in Vite + React + TypeScript in the locked design: crate-tag home, room page with the harvest day strip, big KPI tiles with explainer drawers, field-log evidence, alerts, how-it-works, all at phone and desktop width, light and dark.

## Owns

- `web/` (new): `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/` **except** `src/charts/` (L08) and `src/screens/AddRoom*` + `src/lib/validate*` (L10)
- `src/styles/tokens.css` built exactly from DESIGN.md's Quick start

## Tasks

- [x] Scaffold Vite + React 18 + TypeScript (pin exact versions). `npm run build` writes static files to `web/dist/` with relative paths; `npm run dev` serves on a free port. A `scripts/sync-data` step copies `../app/data/` into `web/public/data/` (don't edit `app/`).
- [x] Typed data layer `src/data/` mirroring the contract (incl. D16 `optimal_from/optimal_to/look_day`, `explain.json`, `shipping.json`); missing new fields render "—", never crash.
- [x] Components per DESIGN.md: Banner, CrateTag, HarvestDayStrip (with Ship/Profit/Look pins), KpiTile, ExplainerDrawer (bottom sheet on phones), RipenessBar, FieldLogEntry, StatusPill, Stamp, DestinationPicker.
- [x] Screens: My greenhouses (tags), Room (hero strip → KPIs → charts slot → shipping section → evidence → what-if), Alerts, How it works & limits, plus a route placeholder for Add a room (L10 fills it). Customer switcher + replay date control as in the current app.
- [x] Chart slots import from `src/charts/` (L08); until L08 lands, render a labelled placeholder.
- [x] Shipping section and trip planner: port the logic by importing `app/trip.js` behaviour into `src/lib/trip.ts` with the same results (keep `tests/test_trip.cjs` passing against it or add an equivalent test). The AI assistant: keep it behind a feature flag (off unless running as a Claude artifact).
- [x] No hard-coded figures; every number from data.

## Tests

- `npm run build` clean, `npm run typecheck` clean; a small Vitest suite for the data layer and the day-strip state logic; screenshot check at 390 px and 1280 px, light and dark.

## Done when

- Every current app feature works in the React app on real `app/data/`; no console errors; hand-off lists anything not ported.

## Not this lane

- Charts (L08), pipeline changes (L09), Add-a-room form and file checks (L10).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 14 Nov 2026 | update | Merged L09 (`dcc5cba`): compact `explain.json` read via `lib/explainCompact.ts` (mirror of `harvest/explain.py`), real zone/look day on the strip, zone share in the key; `trip.ts` uses card `pot_spread_sd`; assistant switched off (TODO flag). 27 Vitest tests, build, `make test` green. Commit `986463c`. |
| 14 Nov 2026 | done | Shell, design system, all screens on real `app/data/`; typecheck, 23 Vitest tests, build and `make test` green; checked in the browser at 390 and 1280 px, light and dark. Commit `4b97b44` + this hand-off. |
| 14 Nov 2026 | started | Read SPEC, DESIGN, contract, D14–D18; slot interface note for L08/L10 left in the shared notes folder. |

**Blocked** (outside this lane's files; for the integrator):
1. `Makefile`: add `web` targets (`npm --prefix web ci`, `npm --prefix web run typecheck`, `npm --prefix web test`, `npm --prefix web run build`) and run the web tests from `make test`. Today `make test` does not run them.
2. `docs/assumptions.md` (L05/integrator): add the ripeness-stage rule. The ripeness bar maps % red **by weight** to the six USDA colour stages with the USDA *surface* cut points (breakers < 10, turning 10–30, pink 30–60, light red 60–90, red > 90; green < 1). If wrong: the outlined stage on the bar shifts by one step; no forecast number changes. Code: `web/src/lib/ripeness.ts`.
3. ~~Publish the optimal-zone share~~ resolved: read from `explain.json` `meta.constants.zone_share` (L09). Was: publish the optimal-zone share (`economics.optimal_zone_share`, 0.90) in `assumptions.json` or `days.json` meta (L09). The strip key now says "close to the best profit" because the "within 10%" figure is not in `app/data/` and may not be hard-coded.

**Hand-off**
- Built:
  - `web/`: Vite 6.3.5 + React 18.3.1 + TypeScript 5.8.3, exact versions. `npm run dev` / `npm run build` first copy `../app/data/` to `web/public/data/` (`scripts/sync-data.mjs`, gitignored). `dist/` uses relative paths (`base: './'`), fonts from Google Fonts only.
  - Data layer `src/data/`: `types.ts` (contract incl. D16 `optimal_from/optimal_to/look_day`, D14 shipping, `explain.json`, all optional where new), `load.ts` (required vs optional files; a broken file becomes an empty doc), `store.ts` (look-ups only), `format.ts` (UTC dates, "—" for missing).
  - Components (`src/components/`, re-exported from `index.ts`): Banner, StatusPill, Stamp, RipenessBar, NumbersTable, CrateTag, HarvestDayStrip (Ship/Profit/Look pins; 12 tiles visible on phones, scroll for more; all tiles from 760 px), KpiTile, ExplainerDrawer (bottom sheet < 760 px, side panel above; Esc closes, focus returns), FieldLogEntry, DestinationPicker, ShippingAssistant. Tokens: `src/styles/tokens.css` = DESIGN.md Quick start plus the table values it omits (wash text, zone text, edges).
  - Screens: My greenhouses (crate tags, harvested and no-forecast states), Room (hero date + verdict + stamp + strip → 3 KPI tiles → charts → shipping → confidence, evidence, what-if; two columns from 1000 px), Alerts, How it works & limits, Add a room route.
  - Explainer: uses `explain.json` when it has the row; otherwise assembles the four parts from the day card, shipping plan and `assumptions.json` (labelled as such). All six KPIs reachable (hero, three tiles, three pins, shipping link).
  - Slots: `src/slots.tsx` defines the chart props (`ProfitChart`, `SellableProfitStack`, `RipenessChart`) and `AddRoomProps`; it picks up `src/charts/index.ts` (L08) and `src/screens/AddRoom.tsx` (L10) automatically with `import.meta.glob`, so neither lane edits L07 files. Until then: labelled placeholders, with the finding line and "Show the numbers" table under them.
  - `src/lib/trip.ts`: port of `app/trip.js`; `trip.test.ts` checks it against all 791 published plans (same tolerances as `tests/test_trip.cjs`).
  - Shipping assistant: same tools and rules as wave 1, behind a flag (`window.claude.use` must exist), so it is hidden outside a Claude artifact.
  - URL hash keeps view, room, customer and replay day (same scheme as wave 1); theme toggle with try/catch storage.
- Checked:
  - `npm run typecheck`, `npx vitest run` (23 tests: day-strip states and pins with hand-worked dates, format, ripeness stages, Store on real data, explainer fallback, trip parity, component rendering), `npm run build`; `make PY=… test` green (93 pytest, contract, app check, trip.js).
  - Browser (Vite dev server): home, room (several rooms and days incl. 20 Oct `check_crop`, 15 Nov harvested), alerts, how, add, explainer drawer, trip form, at 390 px and 1280 px, light and dark. No console errors; no page-level horizontal scroll at 390 px (fixed one: screen-reader labels in tiles escaped the strip's scroll box).
- Known limits:
  - Charts are placeholders until L08 merges; profit and ripeness numbers tables stand in.
  - L09 merged: zone, Look pin and `explain.json` text now show on real data. The Ship explainer uses `explain.json` only for the default destination (its text names that destination); other destinations use the built-in fallback.
  - AI shipping assistant is switched off (`ASSISTANT_ENABLED = false` in `ShippingSection.tsx`, TODO) per the integrator's priority call.
  - The assistant could not be exercised here (no artifact runtime); its code is a direct port of the wave-1 one.
  - Not ported: the wave-1 fallback to `app/mock/` when `data/` is missing (the banner still flags `"mock": true`).
  - Fonts load from Google Fonts; offline they fall back to Arial Narrow / system fonts.
- Follow-ups:
  - Integrator: Blocked items 1–3; decide whether `make artifact` should publish `web/dist/` instead of `app/`.
  - L08: export the three charts from `web/src/charts/index.ts` with the props in `web/src/slots.tsx`; L10: default-export `web/src/screens/AddRoom.tsx` with `AddRoomProps`.
  - After L09 lands, re-check the strip's zone colours and the Look pin on real data at 390 px.
