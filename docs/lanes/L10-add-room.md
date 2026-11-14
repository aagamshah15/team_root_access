# L10 · Add-a-room form & input checks

**Wave** 2 · **Spec** §3, D17 · **Design** `docs/DESIGN.md` → Add-a-room form

## Goal

A grower can register a new room: name, area, **planting date (required)**, and the data files, each checked in the browser against the input contract with plain error messages, ending with a clear note that the forecast runs in our pipeline.

## Owns

- `web/src/screens/AddRoom*.tsx`, `web/src/lib/validate*.ts`, their tests
- `docs/input-contract.md` (add the planting date as required, with format and why)

## Tasks

- [ ] Form fields and rules: room name (required), area m² (> 0), planting date (required, not in the future, before the first log date), climate log CSV, plant weighings CSV, optional photo set. Parse CSVs in the browser (no upload anywhere), check required columns, units and date ranges per `docs/input-contract.md`; show what passed and what to fix.
- [ ] On submit: a summary card ("Room North · planted 1 Mar 2027 · 3 files OK") and the note that the forecast is produced by our pipeline; nothing is sent anywhere in v1. Keep the entered room in browser storage only, labelled as a draft.
- [ ] Update `docs/input-contract.md` so the planting date is a required field.
- [ ] Use the design tokens and components from L07 (import from `web/src/components/`); if they aren't merged yet, build with plain elements and the tokens, then swap.

## Tests

- Vitest for every validation rule with small CSV fixtures (good, missing column, wrong date order, planting date after first log).

## Done when

- Form works at 390 px and 1280 px, all validation tests pass, input contract updated.

## Not this lane

- Running forecasts on uploaded data (roadmap), pipeline changes (L09).

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
