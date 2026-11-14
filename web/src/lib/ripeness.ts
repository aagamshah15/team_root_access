/* The one shared map from % red (by fruit weight) to the six-step ripeness scale (DESIGN.md "Ripeness bar").
 * Stage names follow the USDA tomato colour classification. The USDA cut points are for the share of the
 * fruit *surface* that is red (breakers < 10%, turning 10–30%, pink 30–60%, light red 60–90%, red > 90%);
 * we apply them to % red by weight, so the app always says "approximate stage". */

export const STAGES = ['Green', 'Breakers', 'Turning', 'Pink', 'Light red', 'Red'] as const;
export type Stage = (typeof STAGES)[number];

/** Upper edges (exclusive) of stages 1–5; above the last is "Red". USDA classification, see header. */
const EDGES = [1, 10, 30, 60, 90];

/** 0-based stage index (0 = Green … 5 = Red), or null when % red is unknown. */
export function stageIndex(pctRed: number | null | undefined): number | null {
  if (pctRed == null || !Number.isFinite(pctRed)) return null;
  const i = EDGES.findIndex((e) => pctRed < e);
  return i === -1 ? 5 : i;
}

/** "Turning: about 29% of fruit weight is red (approximate stage)". */
export function ripenessWords(pctRed: number | null | undefined): string {
  const i = stageIndex(pctRed);
  if (i == null) return 'Ripeness not known for this day';
  return `${STAGES[i]}: about ${Math.round(pctRed as number)}% of fruit weight is red (approximate stage)`;
}
