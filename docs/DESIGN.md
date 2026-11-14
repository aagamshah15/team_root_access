# Harvest Window — Style Reference
> a grower's working tool: crate tags on a console grid, read at arm's length in a bright greenhouse

**Theme:** light by default, matching dark mode · **Decision:** D15 (theme), D16 (optimal zone, three harvest points) · **Research:** `docs/design/directions.html`

Harvest Window borrows from things growers, packers and buyers already read every day. Room cards are **crate tags** (after plant tags and GS1 pallet labels: who and what, then one big fact, then the evidence). Each room page opens on a **harvest day strip**, a row of day tiles that reads like a calendar. Ripeness is always the **six-step scale** from tomato colour grading (green, breakers, turning, pink, light red, red). The evidence trail is a **field log** (dated entries, the photo taped in, ticks and flags). Everything sits on the quiet ruled grid of a **grower's console** (climate-computer screens: readings, targets, deviations).

The system is mostly ink on paper. Colour is spent only where it means something: blue for the brand and for "today", green and red for gain and loss, light blue for the optimal harvest zone, amber for "check the crop", gold for the most-profit day, and the six ripeness colours only inside the ripeness bar. Numbers are big, condensed and aligned. Words are plain.

---

## Tokens — Colors

| Name | Light | Dark | Token | Role |
|---|---|---|---|---|
| Canvas | `#f4f4f1` | `#121417` | `--canvas` | Page background; carries the faint console grid |
| Grid rule | `#dcded9` | `#22262b` | `--grid` | 1px console grid lines on the canvas (32px cells) |
| Paper | `#fffdf8` | `#1a1d21` | `--paper` | Crate tags, cards, tiles: the surface you read from |
| Ink | `#15181b` | `#eceae4` | `--ink` | Headlines, big numbers, tag borders, chart lines |
| Muted ink | `#5f646b` | `#a5a9b0` | `--ink-muted` | Labels, captions, axis text |
| Hairline | `#d6d8d4` | `#2c3036` | `--hairline` | 1px dividers inside cards and tables |
| Brand blue | `#2a5bd7` | `#7aa2ff` | `--brand` | Links, "How is this worked out?", focus rings, the today marker. Never gain or loss |
| Gain | `#1f8a3c` | `#4cc26b` | `--gain` | "Worth waiting", positive profit, ticks in the log |
| Gain wash | `#e3f3e6` | `#173322` | `--gain-wash` | Green day tiles and chart areas (text on it: `#145c29` / `#b9ebc6`) |
| Loss | `#d23a2a` | `#ff7a6b` | `--loss` | "Losing money", negative profit, flags |
| Loss wash | `#fbe4e1` | `#3a1d1a` | `--loss-wash` | Red day tiles and chart areas (text on it: `#8f2318` / `#ffc3bb`) |
| Optimal zone | `#dcebfb` | `#1b2c44` | `--zone` | Light-blue optimal harvest zone (within 10% of best profit). Border `#8db8ea` / `#3d6aa8`, text `#123f73` / `#bcd6ff` |
| Best day gold | `#ffd166` | `#ffd166` | `--best` | The most-profit day tile and chart marker. Always with an ink outline |
| Watch amber | `#b06a00` | `#f0a540` | `--watch` | "Check the crop" status, sensor and schedule warnings |
| Night band | `#12243f` | `#0c1a2e` | `--night` | Optional dark band behind a hero headline (not required) |

### Ripeness scale (inside the ripeness bar only)

| Stage | Colour | Token |
|---|---|---|
| Green | `#5f8a3a` | `--ripe-1` |
| Breakers | `#a7b04a` | `--ripe-2` |
| Turning | `#e0a33a` | `--ripe-3` |
| Pink | `#e7835e` | `--ripe-4` |
| Light red | `#d9573f` | `--ripe-5` |
| Red | `#b3271f` | `--ripe-6` |

Stage names follow the USDA tomato colour classification. The hex values approximate the grading photos; they are not official values. Map % red by fruit weight to a stage in one shared function (see Components → Ripeness bar) and say "approximate stage".

## Tokens — Typography

### Barlow Condensed — big numbers and tag headlines · `--font-num`
- **Weights:** 500, 700
- **Sizes:** 22, 34, 46, 50, 64px
- **Use for:** KPI values, the best-day date, day-tile numerals, room names on tags, stamps. Upper case for dates on tags ("MON 11 NOV")
- **Why:** condensed numerals fit big dates in narrow phone tiles and read like a gauge or a label, without heavy weight

### IBM Plex Sans — words · `--font-sans`
- **Weights:** 400, 500, 600
- **Sizes:** 13, 14, 16, 18, 22, 26px
- **Use for:** body text, findings, labels, buttons, section headings

### IBM Plex Mono — readings and log entries · `--font-mono`
- **Weights:** 400, 500
- **Sizes:** 11, 12, 13px
- **Use for:** the field log, small tabular readings, axis ticks, timestamps, upper-case micro labels

### Type scale

| Role | Family | Weight | Size | Line height | Tracking | Token |
|---|---|---|---|---|---|---|
| micro label | Plex Sans | 500 | 11px | 1.4 | +0.07em, upper case | `--t-micro` |
| caption | Plex Sans | 400 | 13px | 1.5 | 0 | `--t-caption` |
| body | Plex Sans | 400 | 16px | 1.55 | 0 | `--t-body` |
| finding | Plex Sans | 500 | 16px | 1.5 | 0 | `--t-finding` |
| section | Plex Sans | 600 | 18px | 1.35 | 0 | `--t-section` |
| page title | Plex Sans | 600 | 26px | 1.2 | −0.01em | `--t-title` |
| KPI value | Barlow Condensed | 700 | 34px | 1.05 | 0 | `--t-kpi` |
| hero date | Barlow Condensed | 700 | 50px (46 on phones) | 1.0 | 0 | `--t-hero` |
| tag date | Barlow Condensed | 700 | 46px | 0.95 | 0 | `--t-tag` |

Rules: never below 11px; numbers use `font-variant-numeric: tabular-nums`; headings `text-wrap: balance`.

## Tokens — Spacing & Shapes

**Density:** comfortable on phones, dense but quiet on desktop.

| Spacing | Value | Token |
|---|---|---|
| 1 | 4px | `--s-1` |
| 2 | 8px | `--s-2` |
| 3 | 12px | `--s-3` |
| 4 | 16px | `--s-4` |
| 5 | 20px | `--s-5` |
| 6 | 24px | `--s-6` |
| 8 | 32px | `--s-8` |
| 12 | 48px | `--s-12` |

| Element | Radius | Border |
|---|---|---|
| Crate tag | 10px 10px 4px 4px (tag shape) | 2.5px solid `--ink` |
| Screen / card | 14px | 1.5px solid `--ink` (cards in a list: 1px `--hairline`) |
| Day tile | 6px | 1.5px; 2px for today and the best day |
| KPI tile | 0 inside a ruled row | 1px `--hairline` between tiles |
| Pill / status | 999px | none or 1px |
| Stamp | 0 | 2px solid currentColor, rotated −2° |
| Tooltip | 6px | none, `--ink` fill, white text |

Shadows: none. Depth comes from the grid, ink borders and paper on canvas.

### Layout
- Max content width 1200px; side gutter `max(16px, env(safe-area-inset-*))`.
- Phone first: one column under 760px; home shows tags stacked; room page stacks hero → KPIs → charts → evidence.
- Desktop: home tags in a 2–3 column grid; room page two columns (charts left, evidence and what-if right).
- Section gap 32–48px; element gap 8–16px.

## Components

### Crate tag (room card)
Paper, ink tag border with a punched hole (top right). Blocks separated by ink rules, top to bottom:
1. micro label: room name and crop; status headline in tag type ("PLAN HARVEST")
2. "Best harvest day" + the date in tag type + "likely 7–16 Nov · how sure: medium"
3. the small ripeness bar + a stamp with the timing ("IN 5 DAYS")
Tapping the tag opens the room. Status colours: harvest now = gain, plan = brand, keep growing = muted ink, check crop = watch. No other decoration.

### Harvest day strip (room hero)
One tile per day from today to the horizon (12 visible on phones, scroll for more). Tile = weekday letter (mono 10px) over the date (num 20px).
- plain paper: pots not yet sellable
- gain wash: sellable and worth waiting
- zone (light blue): within 10% of the best profit (D16)
- best gold with ink outline: the most-profit day (sits inside the zone)
- loss wash: losing money
- today: brand outline + inset underline
Under the strip: **pins** marking the three harvest points ("Ship", "Profit", "Look"), then a one-line key. The hero headline above shows the most-profit date in hero type and a plain verdict ("Book labour and transport for early next week").

### KPI tile
Micro label → value in KPI type → a brand link "How is this worked out? ›". Three or four tiles in a ruled row. The link opens an **explainer panel** (see below). Values come from `app/data/` only.

### Explainer panel ("How is this worked out?")
A drawer (bottom sheet on phones, side panel on desktop) with four parts, always in this order: **What it means** (one sentence), **How we worked it out** (numbered plain steps), **The numbers used today** (a small table of inputs with their values and sources), **What could make it wrong** (assumptions from `assumptions.json`). No formulas without words.

### Profit chart (harvest window)
Single line of profit per m² per day against harvest date. Areas under the line: gain wash from the earliest sellable day to the zone, zone band (light blue, full height) for the optimal days, loss wash after. Three harvest points as vertical markers with labelled pills on top:
- **Ship** (dashed ink line, ink pill): pluck day for the chosen destination
- **Profit** (solid ink line, gold dot and gold pill): most-profit day
- **Look** (dotted ripeness-red line, loss-wash pill): first day at 70% red
A dashed €0 line, a one-line finding above ("Three good days for three goals: …"), a source caption below. Tooltip: one line ("13 Nov · €0.058 · details ›"); "details" opens the explainer for that day.

### Sellable vs profit view
Two small charts stacked on the same date axis (never a dual axis): top = share of pots sellable with the 95% line; bottom = profit per m² per day. A shared vertical band marks the days where both hold (sellable ≥ 95% and inside the optimal zone).

### Ripeness bar
Six equal segments in the ripeness colours, the current stage outlined in ink with a 1–2px offset. Small version (120px) on tags, full width on the room page with stage names under it. Always paired with the % red number in words ("Turning: about a third of fruit weight is red").

### Field log entry (evidence)
Grey-tinted paper with faint 22px ruling and an orange-red margin line on the left. Mono text. Photo "taped in" (3px white border, rotated 2°). Lines start with a gain tick ✓ or a loss flag !. Date first ("06 NOV · evidence").

### Stamp
Upper-case tag type in a 2px currentColor box, rotated −2°. Used once per tag or hero for the decision or timing.

### Status pill
999px radius, wash background with matching dark text: Harvest now (gain), Plan harvest (brand), Keep growing (muted), Check crop (watch). Icon optional; never colour alone (the word is always there).

### Add-a-room form (D17)
Fields: room name, area (m²), **planting date (required)**, data files (climate log, plant weighings, noon photos). Each file is checked against `docs/input-contract.md` with plain error messages next to the field. On submit: a clear note that the forecast runs in our pipeline and when to expect it. The planting date is also shown on every room page ("planted 3 Sep 2024 · day 64").

### Banner
Always visible at the top: "Demo customer · replayed 2024 data". Muted, small, not alarming.

## Charts — rules
- One y-axis per chart. Two quantities with different units → two charts on a shared axis.
- Ink line 2.5px, round joins; areas at 15–20% opacity; markers ≥ 8px.
- Gridlines hairline; no vertical gridlines on time axes except event markers.
- Every chart: one-line finding above, units on axes, source caption below, "Show the numbers" table.
- Tooltips: one line plus "details ›". Details live in the explainer panel, never in the tooltip.
- Colour follows meaning (gain, loss, zone, best, today); text stays in ink tokens.

## Do's and Don'ts

### Do
- Use green and red only for gain and loss, light blue only for the optimal zone, amber only for "check the crop", gold only for the most-profit day.
- Put the decision first: the date, in big condensed type, with a plain verdict next to it.
- Show the three harvest points together whenever a room's dates are shown.
- Pair every number with its meaning in words and a way to see how it was worked out.
- Keep the demo banner and the dataset credit on every screen.
- Test at 390px wide in light and dark before handing off.

### Don't
- Don't use a gauge or dial for the harvest decision (dropped in D15).
- Don't use the ripeness colours outside the ripeness bar.
- Don't use dual-axis charts or gradients on charts, cards or buttons.
- Don't put explanations in tooltips; link to the explainer.
- Don't use shadows for depth; use ink borders and the grid.
- Don't copy any climate-computer vendor's or equipment brand's look; we borrow ideas, not trade dress.
- Don't write "will" for forecasts; write "estimated".

## Surfaces

| Level | Name | Purpose |
|---|---|---|
| 0 | Canvas + grid | Page background |
| 1 | Paper | Tags, cards, tiles |
| 2 | Field-log paper (`#e9eae7` / `#202327`) | Evidence entries |
| 3 | Ink fill | Tooltips, primary button, pills on charts |

## Imagery
Only the real noon canopy photos, shown "taped in" inside the field log or as evidence thumbnails, with a lamp-lit warning when relevant. No stock photography, illustrations or 3D. Icons: simple 1.5px line icons, monochrome, 16–20px, never alone without a word.

## Agent prompt guide

**Quick colour reference:** text `--ink`, labels `--ink-muted`, surfaces `--canvas` + `--paper`, link/today `--brand`, gain `--gain`, loss `--loss`, optimal zone `--zone`, best day `--best`, warnings `--watch`.

**Example prompts**
1. *Crate tag:* paper, 2.5px ink border, radius 10/10/4/4, punched hole top right; three ink-ruled blocks: micro label + status in Barlow 22/700 upper case; "Best harvest day" + "MON 11 NOV" in Barlow 46/700; small ripeness bar + stamp "IN 5 DAYS".
2. *Harvest day strip:* 12 tiles in a grid, 6px radius; weekday letter in Plex Mono 10 over date in Barlow 20/700; colour each tile by state (plain, gain wash, zone, best gold with ink outline, loss wash); today with brand outline; pins row for Ship / Profit / Look.
3. *KPI tile:* micro label, value in Barlow 34/700 tabular, brand link "How is this worked out? ›" opening the explainer drawer.

## Quick start

```css
:root {
  --canvas:#f4f4f1; --grid:#dcded9; --paper:#fffdf8; --ink:#15181b; --ink-muted:#5f646b; --hairline:#d6d8d4;
  --brand:#2a5bd7; --gain:#1f8a3c; --gain-wash:#e3f3e6; --loss:#d23a2a; --loss-wash:#fbe4e1;
  --zone:#dcebfb; --zone-border:#8db8ea; --best:#ffd166; --watch:#b06a00; --night:#12243f; --log-paper:#e9eae7;
  --ripe-1:#5f8a3a; --ripe-2:#a7b04a; --ripe-3:#e0a33a; --ripe-4:#e7835e; --ripe-5:#d9573f; --ripe-6:#b3271f;
  --font-num:'Barlow Condensed', 'Arial Narrow', sans-serif;
  --font-sans:'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono:'IBM Plex Mono', ui-monospace, Menlo, monospace;
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px; --s-12:48px;
  --r-tag:10px 10px 4px 4px; --r-card:14px; --r-tile:6px; --r-pill:999px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --canvas:#121417; --grid:#22262b; --paper:#1a1d21; --ink:#eceae4; --ink-muted:#a5a9b0; --hairline:#2c3036;
  --brand:#7aa2ff; --gain:#4cc26b; --gain-wash:#173322; --loss:#ff7a6b; --loss-wash:#3a1d1a;
  --zone:#1b2c44; --zone-border:#3d6aa8; --watch:#f0a540; --night:#0c1a2e; --log-paper:#202327; color-scheme:dark } }
:root[data-theme="dark"] { /* same dark values as above */ }
body { background: var(--canvas); color: var(--ink); font-family: var(--font-sans); }
```

Fonts load from Google Fonts: `Barlow Condensed:wght@500;700`, `IBM Plex Sans:wght@400;500;600`, `IBM Plex Mono:wght@400;500`, each with the fallbacks above.
