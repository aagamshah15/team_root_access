import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ProfitChart } from './ProfitChart';
import { SellableProfitStack } from './SellableProfitStack';
import { RipenessChart } from './RipenessChart';
import { cropSamplesFor, forecastFor, pastEstimatesFor, shipDayFor } from './select';
import { realDays, realEvidence, realForecast, realRooms, realShipping, shippingMeta } from './__fixtures__/realData';

// "Done when": the three charts render on real data for every room-day without errors.
describe('every room-day in app/data', () => {
  it('renders all three charts', () => {
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a.map(String).join(' '));
    try {
      for (const d of realDays) {
        // Real D16 fields from L09, no fixture.
        expect(d.optimal_from).not.toBeUndefined();
        expect(d.look_day).not.toBeUndefined();
        const card = d;
        const rows = forecastFor(realForecast, d.room, d.today);
        expect(rows.length).toBeGreaterThan(0);
        const ship = shipDayFor(realShipping, d.room, d.today, shippingMeta.truck.default_destination);
        const { container } = render(
          <>
            <ProfitChart rows={rows} card={card} shipDay={ship} />
            <SellableProfitStack rows={rows} card={card} sellableTarget={shippingMeta.truck.earliest_sellable_share} />
            <RipenessChart
              rows={rows}
              today={d.today}
              pctRedNow={d.pct_red_now}
              past={pastEstimatesFor(realDays, d.room, d.today)}
              samples={cropSamplesFor(realEvidence, d.room)}
              actualHarvest={realRooms.find((r) => r.room === d.room)?.actual_harvest}
            />
          </>,
        );
        // No NaN reaches the SVG.
        expect(container.innerHTML).not.toMatch(/NaN|undefined/);
        cleanup();
      }
    } finally {
      console.error = orig;
    }
    expect(errors).toEqual([]);
  }, 60_000);
});
