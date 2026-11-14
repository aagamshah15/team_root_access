/* Content for the "How is this worked out?" panel. explain.json (L09) is the source when it has a row for
 * this room, day and KPI. If a build does not have it yet, a fallback is assembled from the same day's
 * decision card, the shipping plan and assumptions.json, so every value shown still comes from app/data. */
import type { Assumption, DayCard, ExplainInput, ExplainRow, KpiId, ShippingRow } from '../data/types';
import { day, euro, pct, plural, share, span } from '../data/format';
import { AGREE, LEVEL, modelWords, PLUCK_WHY } from './words';

export interface Explainer {
  kpi: KpiId;
  title: string;
  meaning: string;
  steps: string[];
  inputs: ExplainInput[];
  caveats: string[];
  /** True when built here because explain.json had no row (shown as a small note). */
  fallback: boolean;
}

export const KPI_TITLE: Record<KpiId, string> = {
  best_day: 'Best harvest day',
  pots_ready: 'Pots ready to sell now',
  profit_best: 'Profit at the best day',
  confidence: 'How sure we are',
  look_day: 'Best shelf look (Look)',
  ship_day: 'Pluck day for shipping (Ship)',
};

/** Which assumptions matter for each KPI, matched on their names in assumptions.json. */
const ASSUMPTION_MATCH: Record<KpiId, RegExp> = {
  best_day: /base temperature|future warmth|price|plant cost|re-spacing|share of pots/i,
  pots_ready: /sells only|spread|share of pots/i,
  profit_best: /price|plant cost|re-spacing|red fruit counted|room area|future warmth/i,
  confidence: /spread|base temperature|future warmth/i,
  look_day: /base temperature|future warmth|shelf/i,
  ship_day: /truck|shop|driving|finished growing|steepness|shelf|share of pots/i,
};

export function caveatsFor(kpi: KpiId, assumptions: Assumption[]): string[] {
  return assumptions.filter((a) => ASSUMPTION_MATCH[kpi].test(a.name)).map((a) => `${a.name}: ${a.if_wrong}`);
}

const src = (name: string, value: string, source = 'days.json'): ExplainInput => ({ name, value, unit: null, source });

const MEANING: Record<KpiId, string> = {
  best_day: 'The day picking is estimated to earn the most per square metre for each day the crop has grown.',
  pots_ready: 'The share of pots in the room that would sell if picked today.',
  profit_best: 'The estimated profit per square metre for each day grown, if the room is picked on its best day.',
  confidence: 'How much to trust the best day: the weakest of three checks on the forecast.',
  look_day: 'The first day the room is estimated to reach the colour shoppers like best on the shelf.',
  ship_day: 'The day to pick so the fruit has finished growing and enough pots are ready to sell when the truck arrives.',
};
const STEPS: Record<KpiId, string[]> = {
  best_day: [
    'Count the warmth the room has had since planting (degree-days above the base temperature).',
    'Turn warmth into ripeness with a curve learned on the other rooms, corrected by this room\'s photos and crop samples.',
    'For each of the coming days in the forecast, estimate the pots that would sell, the money they bring and the costs so far.',
    'Divide by the days grown and pick the day with the highest result.',
  ],
  pots_ready: [
    'Estimate how ripe the room is today from warmth, photos and crop samples.',
    'Pots ripen at different speeds; spread the room\'s ripeness over its pots using the plant-to-plant spread.',
    'Count the pots with enough red fruit to sell under the challenge rules.',
  ],
  profit_best: [
    'Money in: pots that sell, priced by their red fruit weight (challenge rules).',
    'Money out: plants, re-spacing, energy and fixed costs from the room\'s log; future days use the last week\'s average.',
    'Profit divided by the days grown since planting, on the best day.',
  ],
  confidence: [
    'Day range: how wide the likely range of the best day is.',
    'Evidence agreement: do warmth, photo and the latest crop sample agree on ripeness today?',
    'Freshness: days since the last crop sample or usable photo.',
    'The overall level is the weakest of the three.',
  ],
  look_day: [
    'Follow the room\'s ripeness forecast day by day.',
    'Find the first day it reaches the lower edge of the best shelf colour band.',
  ],
  ship_day: [
    'Find the day the fruit has nearly finished gaining weight (share set in the assumptions).',
    'Ripen the pots through the truck trip and check enough of them sell on arrival.',
    'Pick the later of those two days (or today, if both have passed).',
  ],
};

/** Inputs from the decision card (and shipping plan) for the fallback panel. */
function inputsFor(kpi: KpiId, d: DayCard, ship: ShippingRow | undefined, shipLabel: string | null): ExplainInput[] {
  switch (kpi) {
    case 'best_day':
      return [src('Best day', day(d.best_day)), src('Likely range', span(d.best_day_low, d.best_day_high)),
        src('Earliest sellable day', day(d.earliest_sellable_day)), src('Losses start', day(d.losses_start_day)),
        src('Model used today', modelWords(d.model))];
    case 'pots_ready':
      return [src('Pots ready to sell today', share(d.sellable_share_now)), src('Fruit red today (estimate)', pct(d.pct_red_now)),
        src('Likely range of % red', `${pct(d.pct_red_low)}–${pct(d.pct_red_high)}`)];
    case 'profit_best':
      return [src('Profit at the best day', `${euro(d.profit_best_m2_day, 3)} per m² per day`),
        src('Profit if picked today', `${euro(d.profit_today_m2_day, 3)} per m² per day`), src('Best day', day(d.best_day))];
    case 'confidence':
      return [src('Overall', LEVEL[d.confidence] ?? '—'),
        src('Day range', `${plural(d.conf_day_range_days, 'day')}${d.conf_day_range_level ? ` (${LEVEL[d.conf_day_range_level]})` : ''}`),
        src('Evidence agreement', `${AGREE[d.conf_agreement]?.[0] ?? '—'}${d.conf_agreement_level ? ` (${LEVEL[d.conf_agreement_level]})` : ''}`),
        src('Freshness', `${plural(d.conf_freshness_days, 'day')}${d.conf_freshness_level ? ` (${LEVEL[d.conf_freshness_level]})` : ''}`)];
    case 'look_day':
      return [src('Look day', day(d.look_day)), src('Fruit red today (estimate)', pct(d.pct_red_now))];
    case 'ship_day':
      return [src('Destination', shipLabel ?? '—', 'shipping.json'), src('Pluck day', day(ship?.pluck_day), 'shipping.json'),
        src('Why that day', ship ? PLUCK_WHY[ship.pluck_reason] ?? ship.pluck_reason : '—', 'shipping.json'),
        src('Fruit stops growing', day(d.weight_complete_day)),
        src('Red on arrival', pct(ship?.pct_on_arrival), 'shipping.json'),
        src('Pots ready on arrival', share(ship?.sellable_on_arrival), 'shipping.json')];
  }
}

/** The panel content: explain.json when present, else the fallback. */
export function buildExplainer(
  kpi: KpiId,
  row: (ExplainRow & { title?: string }) | undefined,
  d: DayCard,
  assumptions: Assumption[],
  ship?: ShippingRow,
  shipLabel: string | null = null,
): Explainer {
  if (row) {
    return { kpi, title: row.title ?? KPI_TITLE[kpi], meaning: row.meaning, steps: row.steps ?? [], inputs: row.inputs ?? [], caveats: row.caveats ?? [], fallback: false };
  }
  const caveats = kpi === 'confidence' ? [...(d.conf_reasons ?? []), ...caveatsFor(kpi, assumptions)] : caveatsFor(kpi, assumptions);
  return { kpi, title: KPI_TITLE[kpi], meaning: MEANING[kpi], steps: STEPS[kpi], inputs: inputsFor(kpi, d, ship, shipLabel), caveats, fallback: true };
}
