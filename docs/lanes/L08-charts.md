# L08 · Charts

**Wave** 2 · **Spec** §5, D15, D16 · **Design** `docs/DESIGN.md` → Profit chart, Sellable vs profit view, Charts rules

## Goal

Simple, farmer-readable charts: the harvest-window profit chart with gain / optimal zone / loss areas and the three harvest points; the stacked sellable-vs-profit view; the ripeness forecast with the ripeness scale.

## Owns

- `web/src/charts/` (React components + their tests)

## Tasks

- [x] `ProfitChart`: line of profit per m² per day; gain wash from earliest sellable to the zone; full-height light-blue zone `optimal_from..optimal_to`; loss wash after; €0 dashed line; markers + pills for Ship (pluck day for the chosen destination), Profit (best_day, gold), Look (look_day); one-line tooltip with "details ›" callback; finding line + source caption + "Show the numbers" table.
- [x] `SellableProfitStack`: two charts on one date axis (sellable share with 95% line; profit), shared band where both hold. Never a dual axis.
- [x] `RipenessChart`: % red forecast with band, crop samples, today and actual-harvest markers; the six-step ripeness bar alongside.
- [x] Width from the container (ResizeObserver), works at 390 px; colours from `tokens.css` variables only.
- [x] Build against the real `app/data/` files; until L09 adds `optimal_from/optimal_to/look_day`, read them from a typed fixture in `src/charts/__fixtures__/` (marked fixture) so the components are finished.

## Tests

- Vitest + Testing Library: markers render at the right dates for a fixture; zone covers the right days; no dual axis; tooltip shows one line.

## Done when

- The three charts render on real data for every room-day without errors; exported with clear props for L07 to drop in.

## Not this lane

- Page layout (L07), computing any number (L09).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 14 Nov 2026 | done | Three charts + ripeness bar in `web/src/charts/`, 25 Vitest tests, demo route, checked at 390 / 1280 px light and dark. |

**Blocked** (for the integrator; nothing stops L07 from dropping the charts in):
1. **Scaffold files outside `web/src/charts/`.** L07's `web/` didn't exist yet, so I made a minimal one only so the charts could be built and tested: `web/package.json`, `web/package-lock.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/.gitignore`. Pinned to React 18.3.1, react-dom 18.3.1, Vite 5.4.11, @vitejs/plugin-react 4.3.3, TypeScript 5.6.3, Vitest 2.1.5, jsdom 25.0.1, @testing-library/react 16.0.1, @testing-library/jest-dom 6.6.3, d3 7.9.0, @types/d3 7.4.3. **Keep L07's versions of these files.** From mine, bring over only: the `d3` + `@types/d3` deps (if L07 lacks them), Vitest's `test` block (`environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/charts/test-setup.ts']`), `server.fs.allow: ['..']` (the tests and demo import `../app/data/*.json` directly), and `"types": ["vitest/globals", "@testing-library/jest-dom"]` in tsconfig.
2. **Ripeness stage edges need to become a setting.** `ripeness.ts` maps % red by fruit weight to the six stages at 10 / 20 / 35 / 60 / 90. I picked these so "a third red" reads "Turning", as in the approved mockup. USDA grades single fruit by surface colour, so this is an approximation and the chart says "Approximate stage". Ask L09/L05 to add them to `config/crop.yaml` and publish them (e.g. in `assumptions.json`); the components already accept `edges`.
3. **The D16 rule when every day loses money.** My fixture draws no zone when the best profit is ≤ €0, because a blue "optimal" band over losses reads as good. L09 should decide this and publish `optimal_from/optimal_to = null` in that case. The chart already handles null as "no zone" (undefined still falls back to `best_day`).
4. **One ripeness bar component.** L07's brief also lists a `RipenessBar`. Mine is `RipenessScale` (exported from `src/charts`, sizes `small` and `full`, built on the shared `stageIndex`). Suggest L07 reuses it rather than keeping two.
5. **Zone share isn't published.** The "within 10% of the best profit" wording needs `economics.optimal_zone_share`. ProfitChart takes `zoneSharePct` as a prop and says "close to the best profit" if it's missing. L09 should publish the value (e.g. in `assumptions.json` or `days.meta`).

**Hand-off**
- Built: `web/src/charts/` exports `ProfitChart`, `SellableProfitStack`, `RipenessChart` and `RipenessScale`, plus selectors (`forecastFor`, `pastEstimatesFor`, `cropSamplesFor`, `shipDayFor`), `withD16`, `ripenessSentence` and types, all through `src/charts/index.ts`. Styles are in `src/charts/charts.css` (classes prefixed `hc-`). It reads only DESIGN.md Quick-start variables; the ripeness colours appear only inside the ripeness bar and the Look marker (as DESIGN.md's Profit chart section says). Every chart has: a one-line finding written from the data, units, a source caption, a folded "Show the numbers" table, a one-line ink tooltip with "details ›" (`onDetails(date)`), arrow-key and tap support, and width from a ResizeObserver. ProfitChart shows gain / zone / loss areas, a dashed €0 line, and Ship / Profit / Look markers whose pills drop to a new row instead of overlapping. SellableProfitStack is two panels on one date axis, each with one y-axis, with the "both hold" band in each panel. RipenessChart shows the band, the earlier estimates (each day's own estimate, faint), crop samples known by today, and markers for today and the actual pick. **D16 fixture:** `src/charts/__fixtures__/d16.fixture.ts` is generated by `make-d16-fixture.mjs` from the real `forecast.json`/`days.json` and is clearly marked as a fixture. The demo and tests merge it with `withD16`, where real fields always win. Delete both once L09 lands.
- Checked: `npm test` in `web/` passes 25 tests. They cover hand-worked bands, runs, pill layout, findings and stage edges; markers at the right dates and the zone on the right days for tomatonuts on 6 Nov (zone 11–12 Nov, Look 13 Nov, Profit 11 Nov, Ship = Munich pluck day); no dual axis; a one-line tooltip whose details link calls back; and all three charts rendering for all 166 room-days with no console errors and no NaN. `npx tsc --noEmit` is clean. `make test` is green. Visual check on the demo route (`npm run dev`, open `/src/charts/demo/?room=…&today=…&theme=light|dark`) at 390 px and 1280 px, light and dark, for tomatonuts 6 Nov, ideas 12 Nov and agrifusion 20 Oct (every day a loss).
- Known limits: the Look marker's dotted `--ripe-6` line is faint on dark paper. The profit chart has no low/high band; the range is in the numbers table. Pills can take three rows on a phone when all three dates are close together. The demo's `demo-tokens.css` is a copy of the Quick start for the demo page only, and the app must use L07's `tokens.css`. The demo's dev-only HMR shows a React "createRoot twice" warning after hot reloads (it doesn't happen on a fresh load).
- Follow-ups: when L09 lands, drop the fixture and pass `zoneSharePct` / `lookPct` from published data. L07 wires it up as `<ProfitChart rows card shipDay shipName zoneSharePct lookPct onDetails={openExplainer} />` (see `demo/main.tsx` for all three).
