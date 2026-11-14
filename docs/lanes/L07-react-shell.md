# L07 · React shell, design system & screens

**Wave** 2 · **Spec** §8, D15, D18 · **Design** `docs/DESIGN.md` · **Reads** `contracts/app-data.md`

## Goal

The app rebuilt in Vite + React + TypeScript in the locked design: crate-tag home, room page with the harvest day strip, big KPI tiles with explainer drawers, field-log evidence, alerts, how-it-works, all at phone and desktop width, light and dark.

## Owns

- `web/` (new): `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/` **except** `src/charts/` (L08) and `src/screens/AddRoom*` + `src/lib/validate*` (L10)
- `src/styles/tokens.css` built exactly from DESIGN.md's Quick start

## Tasks

- [ ] Scaffold Vite + React 18 + TypeScript (pin exact versions). `npm run build` writes static files to `web/dist/` with relative paths; `npm run dev` serves on a free port. A `scripts/sync-data` step copies `../app/data/` into `web/public/data/` (don't edit `app/`).
- [ ] Typed data layer `src/data/` mirroring the contract (incl. D16 `optimal_from/optimal_to/look_day`, `explain.json`, `shipping.json`); missing new fields render "—", never crash.
- [ ] Components per DESIGN.md: Banner, CrateTag, HarvestDayStrip (with Ship/Profit/Look pins), KpiTile, ExplainerDrawer (bottom sheet on phones), RipenessBar, FieldLogEntry, StatusPill, Stamp, DestinationPicker.
- [ ] Screens: My greenhouses (tags), Room (hero strip → KPIs → charts slot → shipping section → evidence → what-if), Alerts, How it works & limits, plus a route placeholder for Add a room (L10 fills it). Customer switcher + replay date control as in the current app.
- [ ] Chart slots import from `src/charts/` (L08); until L08 lands, render a labelled placeholder.
- [ ] Shipping section and trip planner: port the logic by importing `app/trip.js` behaviour into `src/lib/trip.ts` with the same results (keep `tests/test_trip.cjs` passing against it or add an equivalent test). The AI assistant: keep it behind a feature flag (off unless running as a Claude artifact).
- [ ] No hard-coded figures; every number from data.

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

**Blocked:** none.

**Hand-off**
- Built:
- Checked:
- Known limits:
- Follow-ups:
