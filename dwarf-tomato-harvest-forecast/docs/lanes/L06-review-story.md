# L06 · Fresh-eyes review, demo script & submission text

**Wave** 3 · **Spec** all · **Starts** after G3 (real data in the app)

## Goal

Look at the finished app as an executive judge would, find what's wrong or unclear before they do, and write the 2-minute demo script and the submission text.

## Owns

- `reports/launch-review.md`
- `docs/demo-script.md`, `docs/submission.md`

## Tasks

- [x] Review the running app (`make app`) and the docs against SPEC and CLAUDE.md: wrong or unsupported numbers, jargon, claims stronger than the evidence, missing sources, broken screens at phone width, anything that contradicts the timing test. Classify each finding as blocker / should-fix / nit, naming the owning lane and the file.
- [x] Check five numbers end to end: pick them in the app, trace each to `app/data/` and to the code that made it.
- [x] `docs/demo-script.md`: ≤ 2 minutes spoken (~260 words), screen-by-screen, following Data → model → output → decision → feedback, with the honest limits in one line.
- [x] `docs/submission.md`: project title, problem statement, solution, technical approach (baseline + ours), results, limits, data credits — ready to paste into iKompete.

## Done when

- Review written with owners; script and submission text drafted for the team to edit.

## Not this lane

- Fixing code (owning lanes do that).

---

## Status log

_Only this lane writes here. Newest first._

| Date | State | Note |
|---|---|---|
| 14 Nov 2026 | done | Review (3 blockers, 10 should-fix, nits), demo script, submission draft written; `make test` green. |

**Blocked:** none.

**Hand-off**
- Built: `reports/launch-review.md` (blockers B1–B3, should-fix S1–S10, nits, five numbers traced); `docs/demo-script.md` (7 beats, ~270 words, House 1 → House 2 what-if → 10 Nov alert → timing test); `docs/submission.md` (title, problem, solution, approach, results table, limits, credits).
- Checked: app served from this worktree on f1778a4 data at 390 px and 1280 px, light and dark; home, room, alerts, how screens; timing-test averages recomputed by hand from `backtest.json` per-room errors; every number in the script and submission looked up in `app/data/`.
- Known limits: light mode at 390 px seen on How page only; no accessibility pass; script and submission keep the placeholder name "Harvest Window" and must be rechecked if data is rebuilt.
- Follow-ups: owning lanes fix B1 (L04 `app/app.js:597`), B2 (L01 `harvest/confidence.py` reason labels, L03 `harvest/alerts.py` wording, L04 freshness caption), B3 (L01 `harvest/backtest.py` test label/note, L04 how page); integrator decides the product name (S8) and the per-today heating fit (S1, `harvest/publish.py:142`).
