/**
 * The one shared mapping from % red (by fruit weight) to the six-step
 * ripeness scale (DESIGN.md → Ripeness bar). Stage names follow the USDA
 * tomato colour classes; USDA grades single fruit by surface colour, so this
 * mapping of a room's red share is an approximation and is shown as
 * "approximate stage".
 *
 * Boundaries (% red by weight, lower edge of each stage after Green):
 * Breakers 10, Turning 20, Pink 35, Light red 60, Red 90. Chosen by the team
 * so a third red reads "Turning" as in the approved mockup; they should move to
 * config/crop.yaml and be published by the pipeline (see L08 "Blocked").
 */

export const STAGES = ['Green', 'Breakers', 'Turning', 'Pink', 'Light red', 'Red'] as const;
export type StageName = (typeof STAGES)[number];

/** Lower edge of stages 2..6 in % red by weight (see file comment). */
export const DEFAULT_STAGE_EDGES = [10, 20, 35, 60, 90];

/** Stage index 0–5 for a % red (0–100). */
export function stageIndex(pctRed: number, edges: number[] = DEFAULT_STAGE_EDGES): number {
  let i = 0;
  while (i < edges.length && pctRed >= edges[i]) i++;
  return i;
}

/** Stage name for a % red. */
export function stageName(pctRed: number, edges?: number[]): StageName {
  return STAGES[stageIndex(pctRed, edges)];
}

/** Fractions a grower says out loud, with their words. */
const FRACTIONS: [number, string][] = [
  [0, 'almost none'],
  [10, 'about a tenth'],
  [20, 'about a fifth'],
  [25, 'about a quarter'],
  [33.3, 'about a third'],
  [50, 'about half'],
  [66.7, 'about two thirds'],
  [75, 'about three quarters'],
  [90, 'nearly all'],
  [100, 'all'],
];

/** % red in words: 34.2 → "about a third". */
export function shareInWords(pctRed: number): string {
  if (pctRed < 5) return 'almost none';
  if (pctRed >= 97) return 'nearly all';
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - pctRed) < Math.abs(best[0] - pctRed)) best = f;
  return best[1];
}

/** The sentence paired with every ripeness bar: "Turning: about a third of fruit weight is red." */
export function ripenessSentence(pctRed: number, edges?: number[]): string {
  return `${stageName(pctRed, edges)}: ${shareInWords(pctRed)} of fruit weight is red.`;
}
