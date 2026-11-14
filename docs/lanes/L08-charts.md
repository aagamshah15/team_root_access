# L08 · Charts

**Wave** 2 · **Spec** §5, D15, D16 · **Design** `docs/DESIGN.md` → Profit chart, Sellable vs profit view, Charts rules

## Goal

Simple, farmer-readable charts: the harvest-window profit chart with gain / optimal zone / loss areas and the three harvest points; the stacked sellable-vs-profit view; the ripeness forecast with the ripeness scale.

## Owns

- `web/src/charts/` (React components + their tests)

## Tasks

- [ ] `ProfitChart`: line of profit per m² per day; gain wash from earliest sellable to the zone; full-height light-blue zone `optimal_from..optimal_to`; loss wash after; €0 dashed line; markers + pills for Ship (pluck day for the chosen destination), Profit (best_day, gold), Look (look_day); one-line tooltip with "details ›" callback; finding line + source caption + "Show the numbers" table.
- [ ] `SellableProfitStack`: two charts on one date axis (sellable share with 95% line; profit), shared band where both hold. Never a dual axis.
- [ ] `RipenessChart`: % red forecast with band, crop samples, today and actual-harvest markers; the six-step ripeness bar alongside.
- [ ] Width from the container (ResizeObserver), works at 390 px; colours from `tokens.css` variables only.
- [ ] Build against the real `app/data/` files; until L09 adds `optimal_from/optimal_to/look_day`, read them from a typed fixture in `src/charts/__fixtures__/` (marked fixture) so the components are finished.

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

**Blocked:** none.

**Hand-off**
- Built:
- Checked:
- Known limits:
- Follow-ups:
