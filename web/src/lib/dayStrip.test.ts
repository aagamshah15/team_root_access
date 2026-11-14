import { describe, expect, it } from 'vitest';
import { buildStrip, tileState } from './dayStrip';
import type { DayCard } from '../data/types';

// Hand-worked card: today 6 Nov; sellable from 9 Nov; zone 10–12 Nov with the best day 11 Nov;
// losses start 13 Nov; look day 13 Nov.
const card = {
  room: 'r', today: '2024-11-06', earliest_sellable_day: '2024-11-09', best_day: '2024-11-11',
  optimal_from: '2024-11-10', optimal_to: '2024-11-12', losses_start_day: '2024-11-13', look_day: '2024-11-13',
} as DayCard;
const fc = ['06', '07', '08', '09', '10', '11', '12', '13', '14'].map((d) => ({ date: `2024-11-${d}` }));

describe('tileState', () => {
  it('follows the card dates: plain → gain → zone → best → zone → loss', () => {
    // expected by hand: 6,7,8 plain (not sellable); 9 gain; 10 zone; 11 best; 12 zone; 13,14 loss
    expect(fc.map((r) => tileState(r.date, card))).toEqual(['plain', 'plain', 'plain', 'gain', 'zone', 'best', 'zone', 'loss', 'loss']);
  });
  it('without the D16 zone fields, falls back to gain/best/loss only', () => {
    const old = { ...card, optimal_from: undefined, optimal_to: undefined } as DayCard;
    // 10 and 12 become gain (sellable, before losses start)
    expect(fc.map((r) => tileState(r.date, old))).toEqual(['plain', 'plain', 'plain', 'gain', 'gain', 'best', 'gain', 'loss', 'loss']);
  });
  it('nothing sellable in the forecast: all plain except the best day', () => {
    const none = { ...card, earliest_sellable_day: null, optimal_from: null, optimal_to: null, losses_start_day: null } as DayCard;
    expect(tileState('2024-11-09', none)).toBe('plain');
    expect(tileState('2024-11-11', none)).toBe('best');
  });
});

describe('buildStrip', () => {
  it('marks today and places the three pins on their tiles', () => {
    const { tiles, pins } = buildStrip(fc, card, '2024-11-06', '2024-11-09');
    expect(tiles[0].today).toBe(true);
    expect(tiles.filter((t) => t.today)).toHaveLength(1);
    // ship 9 Nov = index 3, profit 11 Nov = index 5, look 13 Nov = index 7
    expect(pins.map((p) => [p.id, p.index])).toEqual([['ship', 3], ['profit', 5], ['look', 7]]);
    expect(tiles[7].pins).toEqual(['look']);
  });
  it('a point beyond the forecast has no tile (index null) but keeps its date', () => {
    const { pins } = buildStrip(fc, { ...card, look_day: '2024-12-01' }, '2024-11-06', null);
    expect(pins.find((p) => p.id === 'look')).toEqual({ id: 'look', label: 'Look', date: '2024-12-01', index: null });
    expect(pins.find((p) => p.id === 'ship')?.date).toBeNull();
  });
});
