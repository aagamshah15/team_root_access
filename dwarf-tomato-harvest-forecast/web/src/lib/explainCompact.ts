/* Read L09's compact explain.json back into contract-shaped rows: a TypeScript mirror of expand(), lookup()
 * and display() in harvest/explain.py (keep the two in step).
 *   meta.kpis[kpi] = {title, meaning, steps (templates with {key}), inputs [{name, key, unit, kind, source}], caveats}
 *   rows = one per room × today: {room, today, values}
 * A {key} is looked up in the row's values, then the room-day's days.json card, then meta.constants. */
import type { DayCard, ExplainInput, ExplainRow, KpiId } from '../data/types';
import { day } from '../data/format';

export interface CompactInput { name: string; key: string; unit: string; kind: string; source: string }
export interface CompactKpi { title: string; meaning: string; steps: string[]; inputs: CompactInput[]; caveats: string[] }
export interface CompactMeta {
  kpis: Partial<Record<KpiId, CompactKpi>>;
  constants?: Record<string, unknown>;
  spread_sources?: { fitted: string; setting: string };
}
export interface CompactRow { room: string; today: string; values: Record<string, unknown> }

/** Same words as MODEL_WORDS / REASON_WORDS in harvest/explain.py. */
const MODEL_WORDS: Record<string, string> = {
  warmth: 'warmth since planting only',
  'warmth+sample': 'warmth since planting, adjusted to the latest crop sample',
  'warmth+camera': 'warmth since planting, timed by the canopy camera',
  'warmth+camera+sample': 'warmth since planting, timed by the canopy camera and adjusted to the latest crop sample',
};
const REASON_WORDS: Record<string, string> = {
  weight: 'the fruit has finished gaining weight', sellable: 'enough pots would sell on arrival',
  today: 'everything is already in place today', beyond_forecast: 'that is beyond the 21-day forecast',
};
/** Kind of every placeholder that is not an input (KINDS in harvest/explain.py). */
const KINDS: Record<string, string> = {
  best_day: 'date', best_day_low: 'date', best_day_high: 'date', optimal_from: 'date', optimal_to: 'date',
  look_day: 'date', weight_complete_day: 'date', pluck_day: 'date', ship_by_day: 'date',
  pct_red_low: 'pct', pct_red_high: 'pct', sellable_share_now: 'share',
  revenue_m2: 'eur_m2', net_m2: 'eur_m2', profit_best_m2_day: 'eur_m2_day', profit_today_m2_day: 'eur_m2_day',
  conf_reasons: 'list', days_grown: 'num', min_shelf: 'days',
};

/** How a value reads in a sentence (display() in harvest/explain.py). Hand checks in explainCompact.test.ts. */
export function display(v: unknown, kind: string): string {
  if (v == null) return 'not within the forecast';
  const n = Number(v);
  switch (kind) {
    case 'date': return day(String(v));
    case 'pct': return `${n.toFixed(0)}%`;
    case 'share': return `${(100 * n).toFixed(0)}%`;
    case 'eur_m2_day': return `€${n.toFixed(3)} per m² per day`;
    case 'eur_m2': return `€${n.toFixed(2)} per m²`;
    case 'eur': return `€${n.toFixed(2)}`;
    case 'g': return `${n.toFixed(0)} g`;
    case 'dd_day': return `${n.toFixed(1)} degree-days`;
    case 'c': return `${n} °C`;
    case 'days': { const d = Math.round(n); return `${d} day${d === 1 ? '' : 's'}`; }
    case 'list': return Array.isArray(v) ? v.map(String).join('; ') : String(v);
  }
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(1).replace(/\.?0+$/, '');
  return String(v);
}

const MISSING = Symbol('missing');
function lookup(key: string, ...srcs: Record<string, unknown>[]): unknown {
  for (const s of srcs) if (key in s) return s[key];
  return MISSING;
}

/** True when explain.json is in the compact shape. */
export const isCompact = (meta: unknown): meta is CompactMeta =>
  !!meta && typeof meta === 'object' && typeof (meta as CompactMeta).kpis === 'object' && (meta as CompactMeta).kpis !== null;

/** One KPI's contract row for a room-day, or undefined if the meta has no text for it. Inputs carry the
 * displayed value (with its unit already in it), so the drawer shows "Mon 11 Nov", "96%", "€0.058 …". */
export function expandKpi(meta: CompactMeta, row: CompactRow, card: DayCard, kpi: KpiId): (ExplainRow & { title: string }) | undefined {
  const t = meta.kpis[kpi];
  if (!t) return undefined;
  const values = row.values ?? {};
  const consts: Record<string, unknown> = {
    ...(meta.constants ?? {}),
    model_words: MODEL_WORDS[card.model] ?? card.model,
    pluck_reason_words: REASON_WORDS[String(values.pluck_reason)] ?? 'there is no plan yet',
    spread_source: meta.spread_sources?.[values.spread_fitted ? 'fitted' : 'setting'] ?? '',
  };
  // zone_sentence: mirrors harvest/explain.py expand() (L09 a5be9f5), including the no-zone case.
  const zonePct = Math.round(100 * (1 - Number((meta.constants ?? {} as Record<string, unknown>).zone_share ?? 0.9)));
  consts.zone_sentence = card.optimal_from == null
    ? `No optimal harvest zone today: even the best day is estimated to lose money, so "within ${zonePct}% of the best day's profit" has no meaning.`
    : `Days within ${zonePct}% of the best day's profit make the optimal harvest zone: ${display(card.optimal_from, 'date')} to ${display(card.optimal_to, 'date')}.`;
  const kinds: Record<string, string> = { ...KINDS };
  for (const k of Object.values(meta.kpis)) for (const i of k?.inputs ?? []) kinds[i.key] = i.kind;
  const cardRec = card as unknown as Record<string, unknown>;
  const fmt = (key: string) => {
    const v = lookup(key, values, cardRec, consts);
    return v === MISSING ? '—' : display(v, kinds[key] ?? 'text');
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => fmt(k));
  const inputs: ExplainInput[] = t.inputs.map((i) => {
    const kind = i.kind;
    const showsUnit = !['num', 'text'].includes(kind);   // display() already writes the unit for these kinds
    return { name: i.name, value: fmt(i.key), unit: showsUnit ? null : i.unit || null, source: fill(i.source) };
  });
  return { room: row.room, today: row.today, kpi, title: t.title, meaning: fill(t.meaning), steps: t.steps.map(fill), inputs, caveats: [...t.caveats] };
}
