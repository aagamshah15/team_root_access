/* Data layer: loading against the real published files in ../app/data, the Store look-ups, formatting and the
 * ripeness stage map. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalise, REQUIRED, OPTIONAL } from './load';
import { Store } from './store';
import { addDays, diffDays, euro, pct, share, span, tagDate, logDate } from './format';
import { stageIndex, ripenessWords } from '../lib/ripeness';
import { buildExplainer } from '../lib/explain';
import type { AppData } from './types';

const DATA = resolve(__dirname, '..', '..', '..', 'app', 'data');
const read = (f: string) => { try { return JSON.parse(readFileSync(resolve(DATA, `${f}.json`), 'utf8')); } catch { return null; } };
function realData(): AppData {
  const out: Record<string, unknown> = {};
  for (const f of [...REQUIRED, ...OPTIONAL]) out[f] = normalise(read(f));
  return out as unknown as AppData;
}

describe('format', () => {
  it('dates in UTC', () => {
    expect(addDays('2024-10-31', 1)).toBe('2024-11-01');
    expect(diffDays('2024-11-06', '2024-11-11')).toBe(5);
    expect(tagDate('2024-11-11')).toBe('MON 11 NOV');   // 11 Nov 2024 was a Monday
    expect(logDate('2024-11-06')).toBe('06 NOV');
    expect(span('2024-11-07', '2024-11-16')).toBe('7–16 Nov');
    expect(span('2024-10-30', '2024-11-02')).toBe('30 Oct–2 Nov');
  });
  it('missing values show a dash, never NaN', () => {
    expect(euro(null)).toBe('—');
    expect(euro(-0.435)).toBe('−€0.43');   // toFixed(2) of 0.435 rounds to 0.43 in binary floating point
    expect(pct(undefined)).toBe('—');
    expect(share(0.533)).toBe('53%');
  });
});

describe('ripeness stages (USDA classes on % red by weight)', () => {
  it('maps cut points', () => {
    // 0 → Green; 5 → Breakers; 29 → Turning; 30 → Pink; 75 → Light red; 95 → Red
    expect([0, 5, 29, 30, 75, 95].map(stageIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stageIndex(null)).toBeNull();
    expect(ripenessWords(29.4)).toBe('Turning: about 29% of fruit weight is red (approximate stage)');
  });
});

describe('normalise', () => {
  it('a broken file degrades to an empty document', () => {
    expect(normalise(null).rows).toEqual([]);
    expect(normalise({ rows: 'x' } as never).rows).toEqual([]);
    expect(normalise({ meta: { source: 's' } as never, rows: [1] }).meta.as_of).toEqual({ from: '', to: '' });
  });
});

describe('Store on the real app/data', () => {
  const data = realData();
  const s = new Store(data);
  it('indexes every room-day card and its 22-day forecast', () => {
    expect(s.customers.length).toBeGreaterThan(0);
    for (const d of data.days.rows) {
      const fc = s.forecast(d.room, d.today);
      expect(fc.length, `${d.room} ${d.today}`).toBeGreaterThan(0);
      expect(fc[0].date).toBe(d.today);
      for (let i = 1; i < fc.length; i++) expect(fc[i].date > fc[i - 1].date).toBe(true);
    }
  });
  it('clamps today into the replay range', () => {
    expect(s.clampToday('2000-01-01')).toBe(s.minToday);
    expect(s.clampToday('2099-01-01')).toBe(s.maxToday);
  });
  it('a room is "harvested" from its actual harvest date on', () => {
    const room = data.rooms.rows.find((r) => r.actual_harvest)!;
    expect(s.roomState(room.room, room.actual_harvest!).kind).toBe('harvested');
    expect(s.roomState(room.room, addDays(room.actual_harvest!, -1)).kind).toBe('live');
  });
  it('recent alerts cover 7 days up to today', () => {
    const a = data.alerts.rows[0];
    expect(s.recentAlerts([a.room], a.date)).toContain(a);
    expect(s.recentAlerts([a.room], addDays(a.date, 6))).toContain(a);
    expect(s.recentAlerts([a.room], addDays(a.date, 7))).not.toContain(a);
    expect(s.recentAlerts([a.room], addDays(a.date, -1))).not.toContain(a);
  });
  it('crop samples are unique by date and known by today', () => {
    const room = data.rooms.rows[0].room;
    const sm = s.samples(room, s.maxToday);
    expect(new Set(sm.map((x) => x.date)).size).toBe(sm.length);
    expect(sm.every((x) => x.date <= s.maxToday)).toBe(true);
  });
  it('explainer falls back to the decision card when explain.json has no row, using its values', () => {
    const d = data.days.rows.find((r) => r.sellable_share_now != null && r.sellable_share_now > 0)!;
    const ex = buildExplainer('pots_ready', undefined, d, data.assumptions.rows);
    expect(ex.fallback).toBe(true);
    expect(ex.inputs[0].value).toBe(share(d.sellable_share_now));
    expect(ex.caveats.length).toBeGreaterThan(0);
  });
  it('explainer uses explain.json when it has the row', () => {
    const d = data.days.rows[0];
    const row = { room: d.room, today: d.today, kpi: 'best_day' as const, meaning: 'm', steps: ['a'], inputs: [{ name: 'n', value: 1 }], caveats: ['c'] };
    const ex = buildExplainer('best_day', row, d, data.assumptions.rows);
    expect(ex).toMatchObject({ fallback: false, meaning: 'm', steps: ['a'], caveats: ['c'] });
  });
});
