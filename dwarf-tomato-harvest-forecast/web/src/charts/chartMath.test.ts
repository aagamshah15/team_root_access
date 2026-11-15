import { describe, expect, it } from 'vitest';
import { bandRuns, bothFinding, bothHoldRuns, dayBand, layoutPills, nearestIndex, profitFinding, withD16 } from './chartMath';
import { ripenessSentence, shareInWords, stageIndex, stageName } from './ripeness';
import { daysBetween, euro, pct, pctShare, shortDate } from './format';
import type { DayCard, ForecastRow } from './types';

// Hand-made card: sellable from 10 Nov, zone 11–12 Nov, best 11 Nov (same as
// the real tomatonuts card on 6 Nov with the D16 fixture).
const card: DayCard = {
  room: 'r', today: '2024-11-06', pct_red_now: 34, sellable_share_now: 0.5,
  earliest_sellable_day: '2024-11-10', best_day: '2024-11-11', losses_start_day: '2024-11-12',
  profit_best_m2_day: 0.066, optimal_from: '2024-11-11', optimal_to: '2024-11-12', look_day: '2024-11-13',
};
const dates = ['2024-11-08', '2024-11-09', '2024-11-10', '2024-11-11', '2024-11-12', '2024-11-13', '2024-11-14'];

describe('dayBand', () => {
  it('splits days into none / gain / zone / loss', () => {
    // 8, 9 Nov: before sellable → none; 10 Nov: sellable, before zone → gain;
    // 11–12 Nov: zone; 13 Nov on: after zone → loss.
    expect(dates.map((d) => dayBand(d, card))).toEqual(['none', 'none', 'gain', 'zone', 'zone', 'loss', 'loss']);
  });
  it('falls back to best_day as a one-day zone without D16 fields', () => {
    const old: DayCard = { ...card, optimal_from: undefined, optimal_to: undefined };
    // zone = 11 Nov only; 12 Nov is after it → loss.
    expect(dayBand('2024-11-11', old)).toBe('zone');
    expect(dayBand('2024-11-12', old)).toBe('loss');
  });
  it('draws no zone when the zone is null (published as none)', () => {
    const noZone: DayCard = { ...card, optimal_from: null, optimal_to: null };
    // No zone: 11 Nov is sellable and before losses start (12 Nov) → gain; 12 Nov → loss.
    expect(dayBand('2024-11-11', noZone)).toBe('gain');
    expect(dayBand('2024-11-12', noZone)).toBe('loss');
  });
  it('uses losses_start_day when there is no best day at all', () => {
    const none: DayCard = { ...card, best_day: null, optimal_from: null, optimal_to: null };
    expect(dayBand('2024-11-12', none)).toBe('loss');
    expect(dayBand('2024-11-10', none)).toBe('gain');
  });
});

describe('bandRuns', () => {
  it('groups consecutive days, dropping not-sellable days', () => {
    expect(bandRuns(dates, card)).toEqual([
      { band: 'gain', from: '2024-11-10', to: '2024-11-10' },
      { band: 'zone', from: '2024-11-11', to: '2024-11-12' },
      { band: 'loss', from: '2024-11-13', to: '2024-11-14' },
    ]);
  });
});

describe('bothHoldRuns', () => {
  it('keeps zone days where the sellable share meets the target', () => {
    const rows = dates.map((d, i) => ({ date: d, sellable_share: [0.7, 0.85, 0.925, 0.94, 0.975, 1, 1][i] })) as ForecastRow[];
    // Zone is 11–12 Nov; share 0.94 on 11 Nov < 0.95, 0.975 on 12 Nov ≥ 0.95 → only 12 Nov.
    expect(bothHoldRuns(rows, card, 0.95)).toEqual([{ band: 'both', from: '2024-11-12', to: '2024-11-12' }]);
    expect(bothFinding(bothHoldRuns(rows, card, 0.95), 95)).toBe(
      'Both hold on 12 Nov: 95% of pots ready to sell and profit in the blue zone.',
    );
    expect(bothFinding([], 95)).toMatch(/^No day/);
  });
});

describe('layoutPills', () => {
  it('keeps pills inside the chart and drops overlapping ones to a new row', () => {
    // Pills 80 wide at x = 100, 130, 300 in a 0–390 chart.
    // A: left 60 row 0 (ends 140). B: left 90 overlaps A → row 1. C: left 260 fits row 0.
    const out = layoutPills(
      [{ key: 'a', x: 100, width: 80 }, { key: 'b', x: 130, width: 80 }, { key: 'c', x: 300, width: 80 }], 0, 390,
    );
    expect(out.map((p) => [p.key, p.left, p.row])).toEqual([['a', 60, 0], ['b', 90, 1], ['c', 260, 0]]);
  });
  it('clamps at the edges', () => {
    // x = 380, width 80 → centred left would be 340, clamped to 390 − 80 = 310.
    expect(layoutPills([{ key: 'a', x: 380, width: 80 }], 0, 390)[0].left).toBe(310);
  });
});

describe('withD16 and finding', () => {
  it('fills only missing fields from the fixture', () => {
    const base: DayCard = { ...card, optimal_from: undefined, optimal_to: null, look_day: undefined };
    const merged = withD16(base, { optimal_from: '2024-11-01', optimal_to: '2024-11-02', look_day: '2024-11-03' });
    expect([merged.optimal_from, merged.optimal_to, merged.look_day]).toEqual(['2024-11-01', null, '2024-11-03']);
  });
  it('writes the three goals in plain words', () => {
    expect(
      profitFinding({ ship: '2024-11-09', profit: '2024-11-11', look: '2024-11-13' }, {
        shipName: 'Munich', zoneSharePct: 90, zoneFrom: '2024-11-11', zoneTo: '2024-11-12',
      }),
    ).toBe(
      'Three good days for three goals: ship to Munich on 9 Nov, most profit on 11 Nov, best shelf look from 13 Nov. Any day in blue is within 10% of the best profit.',
    );
    expect(profitFinding({ ship: null, profit: '2024-11-11', look: null })).toBe('One good day: most profit on 11 Nov.');
    // Best profit −€0.435 per m² per day: no day is good.
    expect(profitFinding({ ship: '2024-11-10', profit: '2024-11-10', look: null }, { bestProfit: -0.435 })).toBe(
      'Every harvest day in this forecast loses money; the smallest loss is on 10 Nov.',
    );
  });
  it('finds the nearest x', () => {
    expect(nearestIndex([0, 10, 20], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20], 16)).toBe(2);
  });
});

describe('ripeness scale', () => {
  it('maps % red to the six stages at the documented edges', () => {
    // Edges 10, 20, 35, 60, 90.
    expect([0, 9.9, 10, 19, 20, 34.2, 35, 59, 60, 89, 90, 100].map((p) => stageIndex(p))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
    expect(stageName(34.2)).toBe('Turning');
  });
  it('says the share in words', () => {
    expect(shareInWords(34.2)).toBe('about a third');
    expect(shareInWords(2)).toBe('almost none');
    expect(shareInWords(52)).toBe('about half');
    expect(ripenessSentence(34.2)).toBe('Turning: about a third of fruit weight is red.');
  });
});

describe('format', () => {
  it('formats dates, euros and shares', () => {
    expect(shortDate('2024-11-13')).toBe('13 Nov');
    expect(daysBetween('2024-10-31', '2024-11-02')).toBe(2);
    expect(euro(0.058)).toBe('€0.058');
    expect(euro(-0.2)).toBe('−€0.200');
    expect(pctShare(0.525)).toBe('53%');
    expect(pct(34.2)).toBe('34%');
  });
});
