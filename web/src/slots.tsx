/* Slots for work owned by other lanes, so this shell builds and runs before they merge:
 *   - Charts (L08): `src/charts/index.ts` exporting ProfitChart, SellableProfitStack, RipenessChart with the
 *     props below. Until it exists, a labelled placeholder shows where each chart goes.
 *   - Add a room (L10): `src/screens/AddRoom.tsx` with a default export (or named `AddRoom`) taking
 *     AddRoomProps. Until it exists, a placeholder screen explains what is coming.
 * import.meta.glob resolves at build time: a missing file is simply an empty match, never a build error. */
import type { ComponentType, ReactNode } from 'react';
import type { DayCard, ForecastRow, ISODate, Room, Customer } from './data/types';

/* ---------- chart props (the contract with L08) ---------- */
export interface ProfitChartProps {
  /** forecast.json rows for this room and today, oldest first (days 0–21). */
  rows: ForecastRow[];
  /** days.json card: best_day, earliest_sellable_day, losses_start_day, optimal_from/to, look_day, best_day_low/high. */
  day: DayCard;
  /** Ship point: pluck day for the chosen destination (shipping.json), or null if beyond the forecast. */
  shipDay: ISODate | null;
  /** Destination name for the Ship pill caption, e.g. "Munich". */
  shipLabel: string | null;
  /** Replay only: the grower's actual harvest date (rooms.json). */
  actualHarvest: ISODate | null;
  /** Best day under the temperature what-if when the slider is moved off 0, else null. */
  whatIfBestDay: ISODate | null;
  /** "details ›" in the tooltip: open the explainer for that date. */
  onDetails?: (date: ISODate) => void;
}
export interface SellableProfitStackProps {
  rows: ForecastRow[];
  day: DayCard;
  /** Share of pots that must sell (0–1) for the earliest sellable day; shipping.json meta.truck.earliest_sellable_share. */
  sellableTarget: number | null;
}
export interface RipenessChartProps {
  rows: ForecastRow[];
  day: DayCard;
  /** Earlier decision cards up to today (the "estimates made each day" line). */
  history: DayCard[];
  /** Crop samples known by today. */
  samples: { date: ISODate; pct_red: number }[];
  today: ISODate;
  actualHarvest: ISODate | null;
}
interface ChartsModule {
  ProfitChart?: ComponentType<ProfitChartProps>;
  SellableProfitStack?: ComponentType<SellableProfitStackProps>;
  RipenessChart?: ComponentType<RipenessChartProps>;
}

const chartMods = import.meta.glob<ChartsModule>('./charts/index.{ts,tsx}', { eager: true });
import.meta.glob('./charts/charts.css', { eager: true });   // L08's chart styles (integrator, wave-2 merge)
const charts: ChartsModule = Object.values(chartMods)[0] ?? {};

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="chart-placeholder" role="img" aria-label={`${title}: chart placeholder`}>
      <span className="micro">Chart slot</span>
      <b>{title}</b>
      <span>{note}</span>
    </div>
  );
}

/** `fallback` renders under the placeholder only (finding line, numbers table); a real chart owns its own. */
type WithFallback<P> = P & { fallback?: ReactNode };

/* Integrator adapter (wave-2 merge): L08's components take `card` (and slightly different names) where this
 * shell passes `day`. Map the shell's props to L08's here so neither lane's code has to change. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChart = ComponentType<any>;

export function ProfitChartSlot({ fallback, ...p }: WithFallback<ProfitChartProps>): ReactNode {
  const C = charts.ProfitChart as AnyChart | undefined;
  return C ? <C rows={p.rows} card={p.day} shipDay={p.shipDay} shipName={p.shipLabel ?? undefined} onDetails={p.onDetails} />
    : <><Placeholder title="Harvest window: profit by harvest day" note="Drawn by the charts lane (L08)." />{fallback}</>;
}
export function SellableProfitSlot({ fallback, ...p }: WithFallback<SellableProfitStackProps>): ReactNode {
  const C = charts.SellableProfitStack as AnyChart | undefined;
  return C ? <C rows={p.rows} card={p.day} sellableTarget={p.sellableTarget ?? 0.95} />
    : <><Placeholder title="Pots ready to sell and profit, on one date axis" note="Drawn by the charts lane (L08)." />{fallback}</>;
}
export function RipenessChartSlot({ fallback, ...p }: WithFallback<RipenessChartProps>): ReactNode {
  const C = charts.RipenessChart as AnyChart | undefined;
  return C ? <C rows={p.rows} today={p.today} pctRedNow={p.day.pct_red_now} actualHarvest={p.actualHarvest}
      past={p.history.filter((h) => h.today < p.today).map((h) => ({ date: h.today, pct_red: h.pct_red_now }))}
      samples={p.samples.map((s) => ({ date: s.date, pct_red: s.pct_red }))} />
    : <><Placeholder title="Ripeness forecast with its likely range" note="Drawn by the charts lane (L08)." />{fallback}</>;
}

/* ---------- Add a room (the contract with L10) ---------- */
export interface AddRoomProps {
  /** The customer the room would belong to. */
  customer: Customer | undefined;
  /** Existing rooms, e.g. to warn about a duplicate name. */
  rooms: Room[];
  /** Go back to My greenhouses. */
  onDone: () => void;
}
type AddRoomModule = { default?: ComponentType<AddRoomProps>; AddRoom?: ComponentType<AddRoomProps> };
const addMods = import.meta.glob<AddRoomModule>('./screens/AddRoom.tsx', { eager: true });
const addMod: AddRoomModule = Object.values(addMods)[0] ?? {};
export const AddRoomScreen: ComponentType<AddRoomProps> | null = addMod.default ?? addMod.AddRoom ?? null;
