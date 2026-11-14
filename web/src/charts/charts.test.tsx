import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProfitChart } from './ProfitChart';
import { SellableProfitStack } from './SellableProfitStack';
import { RipenessChart } from './RipenessChart';
import { RipenessScale } from './RipenessScale';
import { withD16 } from './chartMath';
import { cropSamplesFor, forecastFor, pastEstimatesFor, shipDayFor } from './select';
import { d16Fixture } from './__fixtures__/d16.fixture';
import { realDays, realEvidence, realForecast, realShipping } from './__fixtures__/realData';

// Real data: tomatonuts on 6 Nov 2024 (the mockup's "Room West").
// From days.json: best 11 Nov, sellable from 10 Nov. D16: zone 11–12 Nov, look 13 Nov
// (fixture kept for tests; it matches L09's published values, checked below). shipping.json Munich pluck day: read below.
const ROOM = 'tomatonuts';
const TODAY = '2024-11-06';
const card = withD16(realDays.find((d) => d.room === ROOM && d.today === TODAY)!, d16Fixture[`${ROOM}|${TODAY}`]);
const rows = forecastFor(realForecast, ROOM, TODAY);
const ship = shipDayFor(realShipping, ROOM, TODAY, 'munich');

describe('D16 fixture vs published data', () => {
  it('matches L09 on the reference room-day', () => {
    const real = realDays.find((d) => d.room === ROOM && d.today === TODAY)!;
    expect([real.optimal_from, real.optimal_to, real.look_day]).toEqual(['2024-11-11', '2024-11-12', '2024-11-13']);
    expect(d16Fixture[`${ROOM}|${TODAY}`]).toEqual({ optimal_from: '2024-11-11', optimal_to: '2024-11-12', look_day: '2024-11-13' });
  });
});

describe('ProfitChart', () => {
  it('puts the three markers on the right dates', () => {
    const { container } = render(<ProfitChart rows={rows} card={card} shipDay={ship} shipName="Munich" />);
    const at = (k: string) => container.querySelector(`[data-marker="${k}"]`)?.getAttribute('data-date');
    expect(ship).not.toBeNull();
    expect(at('ship')).toBe(ship);
    expect(at('profit')).toBe('2024-11-11');
    expect(at('look')).toBe('2024-11-13');
    expect(screen.getByText('Profit · 11 Nov')).toBeInTheDocument();
    expect(container.querySelector('.hc-best-dot')).not.toBeNull();
  });

  it('draws the zone over exactly the optimal days, gain before and loss after', () => {
    const { container } = render(<ProfitChart rows={rows} card={card} />);
    const band = (b: string) => [...container.querySelectorAll(`[data-band="${b}"]`)].map((e) => [e.getAttribute('data-from'), e.getAttribute('data-to')]);
    expect(band('zone')).toEqual([['2024-11-11', '2024-11-12']]);
    expect(band('gain')).toEqual([['2024-11-10', '2024-11-10']]);
    expect(band('loss')).toEqual([['2024-11-13', '2024-11-27']]);
    // Zone is a full-height rect between the two neighbouring half-days.
    const rect = container.querySelector('rect.hc-zone')!;
    expect(Number(rect.getAttribute('width'))).toBeGreaterThan(0);
  });

  it('has one y-axis and a dashed €0 line when profit goes negative', () => {
    const { container } = render(<ProfitChart rows={rows} card={card} />);
    expect(container.querySelectorAll('[data-axis="y"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="zero-line"]')).not.toBeNull();
  });

  it('shows a one-line tooltip whose details link calls back with the day', () => {
    const onDetails = vi.fn();
    const { container } = render(<ProfitChart rows={rows} card={card} onDetails={onDetails} />);
    const plot = container.querySelector('.hc-plot') as HTMLElement;
    fireEvent.keyDown(plot, { key: 'ArrowRight' }); // first day = today
    const tip = container.querySelector('.hc-tip')!;
    expect(tip.textContent).toBe('6 Nov · −€0.177 · details ›');   // real data after D19 (five-room spread)
    expect(tip.textContent).not.toMatch(/\n/);
    expect(tip.querySelectorAll('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'details ›' }));
    expect(onDetails).toHaveBeenCalledWith('2024-11-06');
    fireEvent.keyDown(plot, { key: 'Escape' });
    expect(container.querySelector('.hc-tip')).toBeNull();
  });

  it('offers the numbers table and a finding above the chart', () => {
    render(<ProfitChart rows={rows} card={card} shipDay={ship} shipName="Munich" zoneSharePct={90} />);
    expect(screen.getByText('Show the numbers')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1);
    expect(screen.getByText(/^Three good days for three goals: ship to Munich on/)).toBeInTheDocument();
  });

  it('hides markers that fall outside the forecast', () => {
    const { container } = render(<ProfitChart rows={rows} card={{ ...card, look_day: null }} shipDay={null} />);
    expect(container.querySelector('[data-marker="look"]')).toBeNull();
    expect(container.querySelector('[data-marker="ship"]')).toBeNull();
    expect(screen.getByText('Look: not reached in this forecast')).toBeInTheDocument();
  });
});

describe('SellableProfitStack', () => {
  it('stacks two panels on one date axis, each with its own single y-axis', () => {
    const { container } = render(<SellableProfitStack rows={rows} card={card} sellableTarget={0.95} />);
    const panels = container.querySelectorAll('[data-panel]');
    expect(panels).toHaveLength(2);
    panels.forEach((p) => expect(p.querySelectorAll('[data-axis="y"]')).toHaveLength(1));
    expect(container.querySelectorAll('[data-axis="x"]')).toHaveLength(1);
  });

  it('bands the days where both hold', () => {
    // Zone 11–12 Nov; sellable share 1.0 on both (forecast.json) ≥ 0.95.
    const { container } = render(<SellableProfitStack rows={rows} card={card} sellableTarget={0.95} />);
    const b = container.querySelector('[data-band="both"]')!;
    expect([b.getAttribute('data-from'), b.getAttribute('data-to')]).toEqual(['2024-11-11', '2024-11-12']);
    expect(screen.getByText('Both hold from 11 Nov to 12 Nov: 95% of pots ready to sell and profit in the blue zone.')).toBeInTheDocument();
  });
});

describe('RipenessChart and scale', () => {
  it('marks today, the actual harvest and only crop samples known by today', () => {
    const { container } = render(
      <RipenessChart
        rows={rows}
        today={TODAY}
        pctRedNow={card.pct_red_now}
        past={pastEstimatesFor(realDays, ROOM, TODAY)}
        samples={cropSamplesFor(realEvidence, ROOM)}
        actualHarvest="2024-11-12"
      />,
    );
    expect(container.querySelector('[data-marker="today"]')!.getAttribute('data-date')).toBe(TODAY);
    expect(container.querySelector('[data-marker="harvest"]')!.getAttribute('data-date')).toBe('2024-11-12');
    // Samples on 22 Oct and 5 Nov are inside the chart (starts 20 Oct) and ≤ today; 7 Oct is before it.
    expect([...container.querySelectorAll('[data-sample]')].map((e) => e.getAttribute('data-sample'))).toEqual(['2024-10-22', '2024-11-05']);
    // 34.2% red → Turning (edges 10/20/35).
    expect(screen.getByText('Turning: about a third of fruit weight is red. Approximate stage.')).toBeInTheDocument();
  });

  it('outlines exactly one stage on the bar', () => {
    const { container } = render(<RipenessScale pctRed={62} />);
    const on = container.querySelectorAll('[data-current="true"]');
    expect(on).toHaveLength(1);
    expect(on[0].getAttribute('data-stage')).toBe('Light red');
  });
});
