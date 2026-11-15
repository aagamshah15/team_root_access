/* State of each tile in the harvest day strip (DESIGN.md "Harvest day strip"), read straight from the decision
 * card's dates: earliest sellable day, optimal zone (D16), best day and losses-start day. No profit is
 * recalculated here; the pipeline already decided which day is which. */
import type { DayCard, ForecastRow, ISODate } from '../data/types';

export type TileState = 'plain' | 'gain' | 'zone' | 'best' | 'loss';
export interface Tile { date: ISODate; state: TileState; today: boolean; pins: PinId[] }
export type PinId = 'ship' | 'profit' | 'look';
export interface Pin { id: PinId; label: string; date: ISODate | null; index: number | null }

/** Which band a day falls in. Order matters: best beats zone beats loss beats gain. */
export function tileState(date: ISODate, d: Pick<DayCard, 'earliest_sellable_day' | 'best_day' | 'losses_start_day' | 'optimal_from' | 'optimal_to'>): TileState {
  if (d.best_day && date === d.best_day) return 'best';
  if (d.optimal_from && d.optimal_to && date >= d.optimal_from && date <= d.optimal_to) return 'zone';
  if (d.losses_start_day && date >= d.losses_start_day) return 'loss';
  if (d.earliest_sellable_day && date >= d.earliest_sellable_day) return 'gain';
  return 'plain';
}

/** One tile per forecast day, with today and the three harvest points marked. */
export function buildStrip(
  fc: Pick<ForecastRow, 'date'>[],
  d: DayCard,
  today: ISODate,
  shipDay: ISODate | null,
): { tiles: Tile[]; pins: Pin[] } {
  const points: [PinId, string, ISODate | null | undefined][] = [
    ['ship', 'Ship', shipDay],
    ['profit', 'Profit', d.best_day],
    ['look', 'Look', d.look_day],
  ];
  const tiles: Tile[] = fc.map((r) => ({
    date: r.date,
    state: tileState(r.date, d),
    today: r.date === today,
    pins: points.filter(([, , pd]) => pd === r.date).map(([id]) => id),
  }));
  const pins: Pin[] = points.map(([id, label, pd]) => {
    const i = pd ? tiles.findIndex((t) => t.date === pd) : -1;
    return { id, label, date: pd ?? null, index: i >= 0 ? i : null };
  });
  return { tiles, pins };
}

/** Plain-words key for a state, used in the strip key and tile titles. */
export const STATE_WORDS: Record<TileState, string> = {
  plain: 'not enough pots ready to sell yet',
  gain: 'sellable, worth waiting',
  zone: 'optimal zone (close to the best profit)',
  best: 'most profit',
  loss: 'losing money',
};
