/* Plain-English labels for the codes in the data files (status, agreement, model, pluck reason).
 * Words only; no figures. */
import type { Agreement, Level, Status } from '../data/types';

export const STATUS: Record<Status, { label: string; why: string; verdict: string }> = {
  harvest_now: {
    label: 'Harvest now',
    why: 'Today is inside the likely best-day range and enough pots are ready to sell.',
    verdict: 'Start picking: today is inside the likely best days.',
  },
  plan_harvest: {
    label: 'Plan harvest',
    why: 'The best day is within the next week: book labour and transport now.',
    verdict: 'Book labour and transport for the best day.',
  },
  keep_growing: {
    label: 'Keep growing',
    why: 'The best day is more than a week away. Extra days still add value.',
    verdict: 'Waiting still adds value; check again in a few days.',
  },
  check_crop: {
    label: 'Check crop',
    why: 'We are not sure enough to call a date. Walk the room or take a crop sample before deciding.',
    verdict: 'Walk the room or weigh a few pots before booking anything.',
  },
};

export const LEVEL: Record<Level, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const AGREE: Record<Agreement, [string, string]> = {
  agree: ['Agree', 'Warmth model, photo and crop sample tell the same story.'],
  mixed: ['Partly agree', 'The signals differ a little on how ripe the room is.'],
  conflict: ['Disagree', 'The signals point to different ripeness. Check the crop.'],
};

export const MODEL: Record<string, string> = {
  warmth: 'Warmth only (degree-days since planting)',
  'warmth+sample': 'Warmth, corrected by the latest crop sample',
  'warmth+camera': 'Warmth, anchored by the canopy photos',
  'warmth+camera+sample': 'Warmth + photos + the latest crop sample',
};
export const modelWords = (m: string | null | undefined) => (m ? MODEL[m] ?? m : '—');

export const PLUCK_WHY: Record<string, string> = {
  weight: 'the fruit is estimated to stop gaining weight on this day, so picking from then on costs no weight; it only turns red after that',
  sellable: 'it is the first day enough pots are ready to sell when they arrive (the fruit had already stopped growing)',
  today: 'both conditions are already met: the fruit has stopped growing and enough pots sell on arrival',
  beyond_forecast: 'no day within the forecast meets both conditions yet',
};
