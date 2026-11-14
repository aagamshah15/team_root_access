/* Harvest day strip: one tile per day from today to the forecast horizon, coloured by what the decision card
 * says about that day, with pins for the three harvest points (Ship, Profit, Look). DESIGN.md → Harvest day strip. */
import type { DayCard, ForecastRow, ISODate } from '../data/types';
import { buildStrip, STATE_WORDS, type PinId } from '../lib/dayStrip';
import { day, dayOfMonth, short, weekdayLetter } from '../data/format';

export interface HarvestDayStripProps {
  rows: Pick<ForecastRow, 'date'>[];
  day: DayCard;
  today: ISODate;
  shipDay: ISODate | null;
  shipLabel: string | null;
  /** Click a pin label to open its explainer. */
  onPin?: (id: PinId) => void;
  /** Optimal-zone share from the data (0.9 → "within 10% of the best profit"); null keeps the generic words. */
  zoneShare?: number | null;
}

const PIN_WORDS: Record<PinId, string> = { ship: 'pluck day for shipping', profit: 'most profit', look: 'first day at best shelf colour' };

export function HarvestDayStrip({ rows, day: d, today, shipDay, shipLabel, onPin, zoneShare }: HarvestDayStripProps) {
  const { tiles, pins } = buildStrip(rows, d, today, shipDay);
  if (!tiles.length) return <p className="caption">No forecast days for this date.</p>;
  const cols = { gridTemplateColumns: `repeat(${tiles.length}, var(--tile-w))` };
  return (
    <div className="strip-wrap">
      <div className="strip-scroll" tabIndex={0} aria-label="Harvest day strip, one tile per day">
        <ol className="strip" style={cols}>
          {tiles.map((t) => (
            <li
              key={t.date}
              className={`tile tile-${t.state}${t.today ? ' tile-today' : ''}`}
              title={`${day(t.date)}: ${STATE_WORDS[t.state]}${t.today ? ' (today)' : ''}`}
            >
              <span className="tile-wd">{weekdayLetter(t.date)}</span>
              <b className="tile-d">{dayOfMonth(t.date)}</b>
              <span className="sr-only">{day(t.date)}: {STATE_WORDS[t.state]}{t.today ? ', today' : ''}{t.pins.length ? `, ${t.pins.join(', ')}` : ''}</span>
            </li>
          ))}
        </ol>
        <div className="pins" style={cols} aria-hidden="true">
          {pins.filter((p) => p.index != null).map((p) => (
            <span key={p.id} className={`pin pin-${p.id}`} style={{ gridColumn: (p.index as number) + 1 }}>{p.label}</span>
          ))}
        </div>
      </div>
      <ul className="pin-list">
        {pins.map((p) => (
          <li key={p.id}>
            <button type="button" className={`pin-chip pin-${p.id}`} onClick={() => onPin?.(p.id)}>
              <b>{p.label}</b> {p.date ? short(p.date) : '—'}
            </button>
            <span className="caption">
              {PIN_WORDS[p.id]}{p.id === 'ship' && shipLabel ? ` to ${shipLabel}` : ''}
              {p.date == null ? ' · not within the forecast yet' : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="strip-key" aria-label="Key">
        <span><i className="k k-plain" />not ready to sell</span>
        <span><i className="k k-gain" />{STATE_WORDS.gain}</span>
        <span><i className="k k-zone" />{zoneShare ? `optimal zone (within ${Math.round((1 - zoneShare) * 100)}% of the best profit)` : STATE_WORDS.zone}</span>
        <span><i className="k k-best" />{STATE_WORDS.best}</span>
        <span><i className="k k-loss" />{STATE_WORDS.loss}</span>
        <span><i className="k k-today" />today</span>
      </div>
    </div>
  );
}
