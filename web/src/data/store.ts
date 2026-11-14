/* Indexes over the loaded files and the look-ups the screens need. Lookups only: no figure is computed here
 * beyond picking rows, sorting them and counting alerts. */
import { addDays } from './format';
import { expandKpi, isCompact, type CompactRow } from '../lib/explainCompact';
import type {
  AlertRow, AppData, Customer, DayCard, Destination, EvidenceRow, ExplainRow, ForecastRow, ISODate, KpiId, Room,
  ShippingRow, Truck, WhatIfRow,
} from './types';

/** An alert counts as "recent" for this many days (a display rule from the wave-1 app, not a model setting). */
export const ALERT_DAYS = 7;
/** SPEC D3: the replay "today" defaults to 6 Nov 2024. */
export const DEFAULT_TODAY = '2024-11-06';

function groupBy<R>(rows: R[], key: (r: R) => string): Map<string, R[]> {
  const m = new Map<string, R[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}
const byField = <R,>(f: keyof R) => (a: R, b: R) => (String(a[f]) < String(b[f]) ? -1 : String(a[f]) > String(b[f]) ? 1 : 0);

export type RoomState =
  | { kind: 'live'; room: string; meta: Room | undefined; d: DayCard }
  | { kind: 'harvested'; room: string; meta: Room }
  | { kind: 'none'; room: string; meta: Room | undefined };

export class Store {
  readonly data: AppData;
  readonly customers: Customer[];
  readonly rooms: Map<string, Room>;
  private days: Map<string, DayCard>;
  readonly daysByRoom: Map<string, DayCard[]>;
  private forecastBy: Map<string, ForecastRow[]>;
  private whatifBy: Map<string, WhatIfRow>;
  readonly deltas: number[];
  private evidenceBy: Map<string, EvidenceRow>;
  readonly evidenceByRoom: Map<string, EvidenceRow[]>;
  readonly alerts: AlertRow[];
  private shipBy: Map<string, ShippingRow>;
  readonly destinations: Destination[];
  readonly truck: Truck | null;
  private explainBy: Map<string, ExplainRow>;
  private explainCompact: Map<string, CompactRow>;
  readonly minToday: ISODate;
  readonly maxToday: ISODate;

  constructor(data: AppData) {
    this.data = data;
    this.customers = data.customers.rows;
    this.rooms = new Map(data.rooms.rows.map((r) => [r.room, r]));
    this.days = new Map(data.days.rows.map((r) => [`${r.room}|${r.today}`, r]));
    this.daysByRoom = groupBy(data.days.rows, (r) => r.room);
    this.daysByRoom.forEach((v) => v.sort(byField<DayCard>('today')));
    this.forecastBy = groupBy(data.forecast.rows, (r) => `${r.room}|${r.today}`);
    this.forecastBy.forEach((v) => v.sort(byField<ForecastRow>('date')));
    this.whatifBy = new Map(data.whatif.rows.map((r) => [`${r.room}|${r.today}|${Number(r.delta_c)}`, r]));
    this.deltas = [...new Set(data.whatif.rows.map((r) => Number(r.delta_c)))].sort((a, b) => a - b);
    this.evidenceBy = new Map(data.evidence.rows.map((r) => [`${r.room}|${r.date}`, r]));
    this.evidenceByRoom = groupBy(data.evidence.rows, (r) => r.room);
    this.evidenceByRoom.forEach((v) => v.sort(byField<EvidenceRow>('date')));
    this.alerts = data.alerts.rows.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    this.shipBy = new Map(data.shipping.rows.map((r) => [`${r.room}|${r.today}|${r.destination}`, r]));
    this.destinations = data.shipping.meta.destinations ?? [];
    this.truck = data.shipping.meta.truck ?? null;
    // explain.json comes in L09's compact shape (meta.kpis + rows of values) or the contract's row shape.
    const compact = isCompact(data.explain.meta);
    this.explainCompact = new Map(compact ? (data.explain.rows as unknown as CompactRow[]).map((r) => [`${r.room}|${r.today}`, r]) : []);
    this.explainBy = new Map(compact ? [] : data.explain.rows.map((r) => [`${r.room}|${r.today}|${r.kpi}`, r]));
    const todays = data.days.rows.map((r) => r.today).sort();
    this.minToday = todays[0] ?? DEFAULT_TODAY;
    this.maxToday = todays[todays.length - 1] ?? DEFAULT_TODAY;
  }

  customer(id: string | null | undefined): Customer | undefined {
    return this.customers.find((c) => c.customer_id === id) ?? this.customers[0];
  }
  roomName(id: string): string {
    return this.rooms.get(id)?.display_name ?? id;
  }
  /** Clamp a requested "today" into the replay range. */
  clampToday(t: ISODate): ISODate {
    return t < this.minToday ? this.minToday : t > this.maxToday ? this.maxToday : t;
  }
  day(room: string, today: ISODate): DayCard | undefined {
    return this.days.get(`${room}|${today}`);
  }
  forecast(room: string, today: ISODate): ForecastRow[] {
    return this.forecastBy.get(`${room}|${today}`) ?? [];
  }
  whatif(room: string, today: ISODate, delta: number): WhatIfRow | undefined {
    return this.whatifBy.get(`${room}|${today}|${delta}`);
  }
  evidence(room: string, date: ISODate): EvidenceRow | undefined {
    return this.evidenceBy.get(`${room}|${date}`);
  }
  /** The last `n` evidence rows up to and including `today`, newest first. */
  evidenceTrail(room: string, today: ISODate, n: number): EvidenceRow[] {
    return (this.evidenceByRoom.get(room) ?? []).filter((e) => e.date <= today).slice(-n).reverse();
  }
  /** Crop samples known by `today`, one per sample date (from the evidence trail). */
  samples(room: string, today: ISODate): { date: ISODate; pct_red: number; fw_g: number | null }[] {
    const seen = new Map<ISODate, { date: ISODate; pct_red: number; fw_g: number | null }>();
    for (const e of this.evidenceByRoom.get(room) ?? []) {
      if (e.last_sample_date && e.last_sample_date <= today && e.last_sample_pct_red != null && !seen.has(e.last_sample_date)) {
        seen.set(e.last_sample_date, { date: e.last_sample_date, pct_red: e.last_sample_pct_red, fw_g: e.last_sample_fw_g });
      }
    }
    return [...seen.values()].sort(byField('date'));
  }
  /** Decision cards up to and including `today` (the "earlier estimates" line). */
  history(room: string, today: ISODate): DayCard[] {
    return (this.daysByRoom.get(room) ?? []).filter((d) => d.today <= today);
  }
  ship(room: string, today: ISODate, dest: string): ShippingRow | undefined {
    return this.shipBy.get(`${room}|${today}|${dest}`);
  }
  /** The explainer row for one KPI (expanded from the compact file when needed). */
  explain(room: string, today: ISODate, kpi: KpiId): (ExplainRow & { title?: string }) | undefined {
    const row = this.explainCompact.get(`${room}|${today}`);
    const card = this.day(room, today);
    if (row && card && isCompact(this.data.explain.meta)) return expandKpi(this.data.explain.meta, row, card, kpi);
    return this.explainBy.get(`${room}|${today}|${kpi}`);
  }
  /** Optimal-zone share (e.g. 0.9 = within 10% of the best profit), from explain.json meta.constants when published. */
  zoneShare(): number | null {
    const m = this.data.explain.meta as { constants?: { zone_share?: unknown } };
    const z = Number(m.constants?.zone_share);
    return Number.isFinite(z) && z > 0 && z < 1 ? z : null;
  }
  defaultDestination(): string | null {
    return this.truck?.default_destination ?? this.destinations[0]?.id ?? null;
  }
  /** Alerts for these rooms dated within the last ALERT_DAYS days up to `today`. */
  recentAlerts(rooms: string[], today: ISODate): AlertRow[] {
    const from = addDays(today, -(ALERT_DAYS - 1));
    return this.alerts.filter((a) => rooms.includes(a.room) && a.date <= today && a.date >= from);
  }
  /** Is the room live on `today`, already harvested, or without a forecast? */
  roomState(room: string, today: ISODate): RoomState {
    const meta = this.rooms.get(room);
    if (meta?.actual_harvest && today >= meta.actual_harvest) return { kind: 'harvested', room, meta };
    const d = this.day(room, today);
    if (!d) return { kind: 'none', room, meta };
    return { kind: 'live', room, meta, d };
  }
  /** The heating fit used for today's what-if numbers (per-today when published). */
  heatingFit(today: ISODate) {
    const m = this.data.whatif.meta;
    return m.heating_fit_by_today?.[today] ?? m.heating_fit ?? null;
  }
}
