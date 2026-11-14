import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { display, expandKpi, isCompact, type CompactMeta, type CompactRow } from './explainCompact';
import type { DayCard } from '../data/types';

describe('display (mirror of harvest/explain.py display())', () => {
  it('hand checks from the Python docstring', () => {
    expect(display('2024-11-11', 'date')).toBe('Mon 11 Nov');
    expect(display(34.24, 'pct')).toBe('34%');
    expect(display(0.957, 'share')).toBe('96%');
    expect(display(1, 'days')).toBe('1 day');
    expect(display(0.0581, 'eur_m2_day')).toBe('€0.058 per m² per day');
    expect(display(null, 'date')).toBe('not within the forecast');
    expect(display(13, 'c')).toBe('13 °C');
    expect(display(12.5, 'num')).toBe('12.5');   // Python f'{v:.1f}' stripped
    expect(display(20, 'num')).toBe('20');
  });
});

describe('expandKpi', () => {
  const meta = { kpis: { best_day: { title: 'T', meaning: 'm', steps: ['Best {best_day}, red {pct_red_now}, zone {zone_share}, x {missing}'],
    inputs: [{ name: 'Red', key: 'pct_red_now', unit: '%', kind: 'pct', source: 'src' }, { name: 'Density', key: 'density', unit: 'pots per m²', kind: 'num', source: '{spread_source}' }], caveats: ['c'] } },
    constants: { zone_share: 0.9 }, spread_sources: { fitted: 'F', setting: 'S' } } as unknown as CompactMeta;
  const row: CompactRow = { room: 'r', today: '2024-11-06', values: { density: 20, spread_fitted: true } };
  const card = { room: 'r', today: '2024-11-06', best_day: '2024-11-11', pct_red_now: 29.4, model: 'warmth' } as unknown as DayCard;
  it('fills placeholders from values, then the card, then constants', () => {
    const ex = expandKpi(meta, row, card, 'best_day')!;
    // zone_share has no kind -> plain text "0.9"; unknown key -> "—"
    expect(ex.steps[0]).toBe('Best Mon 11 Nov, red 29%, zone 0.9, x —');
    expect(ex.inputs).toEqual([{ name: 'Red', value: '29%', unit: null, source: 'src' }, { name: 'Density', value: '20', unit: 'pots per m²', source: 'F' }]);
    expect(expandKpi(meta, row, card, 'look_day')).toBeUndefined();
  });
  it('expands every KPI for every row of the real explain.json without unfilled keys', () => {
    let doc: { meta: unknown; rows: CompactRow[] } | null = null;
    try { doc = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'data', 'explain.json'), 'utf8')); } catch { return; }
    const days = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'data', 'days.json'), 'utf8')).rows as DayCard[];
    const cards = new Map(days.map((d) => [`${d.room}|${d.today}`, d]));
    if (!doc || !isCompact(doc.meta)) return;
    for (const r of doc.rows) {
      for (const k of ['best_day', 'pots_ready', 'profit_best', 'confidence', 'look_day', 'ship_day'] as const) {
        const ex = expandKpi(doc.meta, r, cards.get(`${r.room}|${r.today}`)!, k)!;
        // An input may legitimately read "—" when its value is null, e.g. no optimal zone on a loss-making day (L09 a5be9f5).
        const text = [ex.meaning, ...ex.steps, ...ex.inputs.filter((i) => i.value !== '—').map((i) => `${i.value} ${i.source}`)].join(' ');
        expect(text, `${r.room} ${r.today} ${k}`).not.toMatch(/\{\w+\}|— |NaN|undefined/);
      }
    }
  });
});
