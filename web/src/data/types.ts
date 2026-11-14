/* Types for the published files in app/data/ (contracts/app-data.md). Fields added in wave 2 (D16 zone and
 * look day, explain.json) are optional: the app shows "—" when a build does not have them yet. */

export type ISODate = string;

export interface Meta {
  source: string;
  built_at: string;
  as_of: { from: ISODate; to: ISODate };
  mock?: boolean;
  [k: string]: unknown;
}
export interface Doc<R, M extends Meta = Meta> { meta: M; rows: R[] }

export interface Customer { customer_id: string; name: string; tagline: string; rooms: string[] }

export interface Room {
  room: string;
  display_name: string;
  customer_id: string;
  area_m2: number | null;
  planted?: ISODate | null;
  actual_harvest: ISODate | null;
}

export type Status = 'harvest_now' | 'plan_harvest' | 'keep_growing' | 'check_crop';
export type Level = 'high' | 'medium' | 'low';
export type Agreement = 'agree' | 'mixed' | 'conflict';

/** days.json: the decision card for one room on one "today". */
export interface DayCard {
  room: string;
  today: ISODate;
  status: Status;
  pct_red_now: number | null;
  pct_red_low: number | null;
  pct_red_high: number | null;
  sellable_share_now: number | null;
  model: string;
  earliest_sellable_day: ISODate | null;
  best_day: ISODate | null;
  losses_start_day: ISODate | null;
  best_day_low: ISODate | null;
  best_day_high: ISODate | null;
  profit_best_m2_day: number | null;
  profit_today_m2_day: number | null;
  confidence: Level;
  conf_day_range_days: number | null;
  conf_agreement: Agreement;
  conf_freshness_days: number | null;
  conf_reasons: string[];
  conf_day_range_level?: Level;
  conf_agreement_level?: Level;
  conf_freshness_level?: Level;
  /** D16 (wave 2, L09) */
  optimal_from?: ISODate | null;
  optimal_to?: ISODate | null;
  look_day?: ISODate | null;
  /** D14 shipping extension */
  weight_complete_day?: ISODate | null;
  k_x1000?: number | null;
  /** Room-specific plant-to-plant spread in % red points, fitted on the other rooms (L09); falls back to meta.truck.pot_spread_sd. */
  pot_spread_sd?: number | null;
}

/** forecast.json: one row per room × today × day ahead (0–21). */
export interface ForecastRow {
  room: string;
  today: ISODate;
  date: ISODate;
  pct_red: number;
  pct_red_low: number;
  pct_red_high: number;
  sellable_share: number;
  profit_m2_day: number;
  profit_low: number;
  profit_high: number;
  cost_to_date_m2: number;
}

export interface WhatIfRow {
  room: string;
  today: ISODate;
  delta_c: number;
  best_day: ISODate | null;
  days_change: number;
  profit_best_m2_day: number | null;
  profit_change_m2_day: number | null;
  extra_energy_cost_m2_day: number | null;
  note: string;
}
export interface HeatingFit { eur_m2_day_per_c: number; r2: number | null; n: number; note?: string }
export interface WhatIfMeta extends Meta {
  note?: string;
  heating_fit?: HeatingFit;
  heating_fit_by_today?: Record<ISODate, HeatingFit>;
}

export interface EvidenceRow {
  room: string;
  date: ISODate;
  photo: string | null;
  photo_usable: boolean;
  lamps_on: boolean | null;
  red_index: number | null;
  green_pct: number | null;
  canopy_distance_mm: number | null;
  gdd_cum: number | null;
  last_sample_date: ISODate | null;
  last_sample_pct_red: number | null;
  last_sample_fw_g: number | null;
}

export interface AlertRow {
  room: string;
  date: ISODate;
  kind: 'behind_schedule' | 'ahead_of_schedule' | 'sensor_check' | 'room_drift' | string;
  severity: 'info' | 'warning';
  title: string;
  message: string;
  numbers: Record<string, unknown>;
}

export interface BacktestRow { test: string; method: string; value: number; unit: string; n: number; note: string }
export interface BacktestPerRoom { room: string; test?: string; method: string; predicted: string | number; actual: string | number; error: number }
export interface BacktestMeta extends Meta { per_room?: BacktestPerRoom[] }

export interface Destination { id: string; name: string; distance_km: number; transit_days: number }
export interface Truck {
  temp_c: number;
  driving_hours_per_day: number;
  avg_speed_kmh: number;
  same_day_km: number;
  max_transit_days: number;
  shop_temp_c: number;
  best_band_pct_red: [number, number];
  end_of_life_pct_red: number;
  min_best_shelf_days: number;
  default_destination?: string;
  base_temp_c: number;
  pot_spread_sd: number;
  sellable_red_share: number;
  earliest_sellable_share: number;
  pot_z: number[];
}
export interface ShippingMeta extends Meta { destinations?: Destination[]; truck?: Truck }
export interface ShippingRow {
  room: string;
  today: ISODate;
  destination: string;
  pluck_day: ISODate;
  pluck_reason: 'weight' | 'sellable' | 'today';
  ship_by_day: ISODate | null;
  pct_at_pluck: number;
  pct_on_arrival: number;
  sellable_on_arrival: number;
  best_from: number | null;
  best_until: number | null;
  sell_until: number | null;
  profit_m2_day: number | null;
  best_profit_day: ISODate | null;
  profit_best_m2_day: number | null;
}

export type KpiId = 'best_day' | 'pots_ready' | 'profit_best' | 'confidence' | 'look_day' | 'ship_day';
export interface ExplainInput { name: string; value: string | number | null; unit?: string | null; source?: string | null }
/** explain.json (wave 2, L09): drives the "How is this worked out?" panel. */
export interface ExplainRow {
  room: string;
  today: ISODate;
  kpi: KpiId;
  meaning: string;
  steps: string[];
  inputs: ExplainInput[];
  caveats: string[];
}

export interface Assumption { name: string; value: string | number | null; unit: string | null; source: string; if_wrong: string }

export interface AppData {
  customers: Doc<Customer>;
  rooms: Doc<Room>;
  days: Doc<DayCard>;
  forecast: Doc<ForecastRow>;
  whatif: Doc<WhatIfRow, WhatIfMeta>;
  evidence: Doc<EvidenceRow>;
  alerts: Doc<AlertRow>;
  backtest: Doc<BacktestRow, BacktestMeta>;
  assumptions: Doc<Assumption>;
  shipping: Doc<ShippingRow, ShippingMeta>;
  explain: Doc<ExplainRow>;
}
