# L10 · Add-a-room form & input checks

**Wave** 2 · **Spec** §3, D17 · **Design** `docs/DESIGN.md` → Add-a-room form

## Goal

A grower can register a new room: name, area, **planting date (required)**, and the data files, each checked in the browser against the input contract with plain error messages, ending with a clear note that the forecast runs in our pipeline.

## Owns

- `web/src/screens/AddRoom*.tsx`, `web/src/lib/validate*.ts`, their tests
- `docs/input-contract.md` (add the planting date as required, with format and why)

## Tasks

- [x] Form fields and rules: room name (required), area m² (> 0), planting date (required, not in the future, before the first log date), climate log CSV, plant weighings CSV, optional photo set. Parse CSVs in the browser (no upload anywhere), check required columns, units and date ranges per `docs/input-contract.md`; show what passed and what to fix.
- [x] On submit: a summary card ("Room North · planted 1 Mar 2027 · 3 files OK") and the note that the forecast is produced by our pipeline; nothing is sent anywhere in v1. Keep the entered room in browser storage only, labelled as a draft.
- [x] Update `docs/input-contract.md` so the planting date is a required field.
- [~] Use the design tokens and components from L07 (import from `web/src/components/`); if they aren't merged yet, build with plain elements and the tokens, then swap.

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
| 14 Nov 2026 | done | Form, checks, draft storage and contract update committed; 38 Vitest tests, `make test` green; checked at 390 px (dark) and 1280 px (light) |
| 14 Nov 2026 | started | L07 scaffold not on any branch yet, so a minimal one was created (see Blocked) |

**Blocked:** integrator to reconcile with L07. `web/package.json` didn't exist, so L10 created a minimal scaffold, files outside the Owns list:
- `web/package.json`, `web/package-lock.json`: React 18.3.1, Vite 5.4.10, TypeScript 5.6.3, Vitest 2.1.4, @vitejs/plugin-react 4.3.3, jsdom 25.0.1, @testing-library/react 16.0.1 + @testing-library/dom 10.4.0, @types/react 18.3.12, @types/react-dom 18.3.1. Scripts: `dev`, `build`, `typecheck`, `test`. **L10 needs from L07's version:** vitest + jsdom + @testing-library/react (dev deps) and `test.environment: "jsdom"` in the Vite config.
- `web/vite.config.ts` (base `./`, react plugin, vitest jsdom env), `web/tsconfig.json` (strict, `jsx: react-jsx`, Bundler resolution), `web/index.html` (Google Fonts per DESIGN.md), `web/.gitignore` (`node_modules/`, `dist/`)
- `web/src/main.tsx`: dev harness that mounts only `<AddRoom />`. Replace with L07's shell.
- `web/src/styles/tokens.css`: copy of DESIGN.md Quick start (dark values filled in for `[data-theme="dark"]`) + `body` base. Replace with L07's file; AddRoom.css only uses token names from it.
Keep L07's files wherever they differ. Nothing else outside Owns was touched (a local `.claude/launch.json` for preview is not committed).

**Hand-off**
- Built:
  - `web/src/lib/validate.ts`: pure, browser-only checks. CSV parser (quotes, CRLF, BOM, `;` files with decimal comma); room name, area > 0, planting date (required, not after today, on or before the first climate-log day, warning if the log starts > 1 day after planting); climate log (columns + aliases, readable dates, time order per room, °F detection, −10…50 °C range, gaps > 1 day, rows dated after today, picks the matching room in multi-room files); plant weighings (columns + aliases, dates, before-planting error, junk/negative/red > total/% outside 0–100 errors, blank weights = warning, kg-vs-g and "no red fruit yet" warnings); photo names `room_YYYYMMDD_HHMM.jpg` (bad name error, before-planting and far-from-noon warnings). `checkRoom` / `isReady` combine them. Limits in one `RULES` object.
  - `web/src/screens/AddRoom.tsx` (default export, optional `today` prop only), `AddRoom.css` (tokens only, no shadows/gradients), `AddRoomStore.ts` (localStorage draft, try/catch, stores fields + check summaries, never file contents). Form → per-field findings with ✓ passed lines and ! notes; submit → crate-tag summary "Room North 2 · planted 1 Sep 2026 · 3 files OK", day count, DRAFT stamp, and "the forecast for this room is made by our team’s pipeline, not in this browser. Nothing has been sent anywhere". Edit and Remove draft.
  - `docs/input-contract.md`: room fields table with planting date required (format, rules, why) and a table of accepted column names and every check.
- Checked: `npm test` (38 tests: every rule, with tiny CSV fixtures for good / missing column / wrong date order / planting after first log / multi-room / °F / gaps / future rows / blank weights, plus 7 screen tests with jsdom file uploads, draft save/restore/remove, nothing but summaries in storage); `npm run typecheck` and `npm run build` clean; `make test` green. Ran the checks on the real `out/dash/daily.csv` and `plants.csv` for all six rooms: climate passes clean; plants pass with one warning (final-harvest rows have red weight but no total), which is why blank weights became a warning, not an error. Browser: 390 px dark and 1280 px light, errors, focus to first invalid field, summary, remove draft; no sideways scroll, no console errors.
- Known limits:
  - Uses plain elements + tokens, not L07's components (not merged yet). Natural swaps: summary tag → `CrateTag`, DRAFT → `Stamp`, banner/dataset credit come from L07's shell.
  - Check limits (`RULES`: −10…50 °C, 1-day gap, 5,000 g, 10:00–14:00 noon window) live in `validate.ts`, not `config/crop.yaml`; they mirror `docs/input-contract.md`.
  - Only the date part of timestamps is used for gaps; order is compared on the timestamp text, so mixed time-zone offsets in one file could be misjudged. Photos: only names are checked, not image contents or lamp tint.
  - Only one draft room is kept; files must be re-added after "Edit room" (browsers can't restore file inputs). Draft rooms don't appear on My greenhouses.
  - "Today" is the browser's real date, not the replay date (a 2024-replay planting date is fine; a 2027 one is "in the future"). L07 can pass `today` if it wants the replay date.
- Follow-ups:
  - L07/integrator: reconcile the scaffold above, mount `AddRoom` at the "Add a room" route, swap in shared components.
  - Optionally publish the check limits from `config/crop.yaml` so the app and contract share one source.
  - Roadmap (not v1): send checked files to the pipeline and show the draft room on My greenhouses as "waiting for first forecast".
