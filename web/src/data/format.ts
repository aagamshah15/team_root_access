/* Formatting helpers: dates, money, shares. They only format values from app/data; they compute nothing.
 * Dates are "YYYY-MM-DD" strings handled in UTC so a browser's time zone never shifts a day. */
import type { ISODate } from './types';

const DAY_MS = 864e5;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DASH = '—';

/** UTC Date for an ISO day string. */
export const parse = (s: ISODate): Date => new Date(s + 'T00:00:00Z');
export const iso = (d: Date): ISODate => d.toISOString().slice(0, 10);
/** The ISO day `n` days after `s` (negative for before). */
export const addDays = (s: ISODate, n: number): ISODate => iso(new Date(parse(s).getTime() + n * DAY_MS));
/** Whole days from `a` to `b` (positive when b is later). */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
/** Every ISO day from `a` to `b`, both included. */
export function daysBetween(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Wed 6 Nov" */
export const day = (s?: ISODate | null): string => {
  if (!s) return DASH;
  const d = parse(s);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
/** "6 Nov" */
export const short = (s?: ISODate | null): string => {
  if (!s) return DASH;
  const d = parse(s);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
/** "3 Sep 2024" */
export const long = (s?: ISODate | null): string => (s ? `${short(s)} ${parse(s).getUTCFullYear()}` : DASH);
/** "MON 11 NOV": the tag and hero date style (DESIGN.md). */
export const tagDate = (s?: ISODate | null): string => (s ? day(s).toUpperCase() : DASH);
/** "06 NOV": field-log date. */
export const logDate = (s?: ISODate | null): string => {
  if (!s) return DASH;
  const d = parse(s);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()].toUpperCase()}`;
};
/** One-letter weekday for a day tile ("W"). */
export const weekdayLetter = (s: ISODate): string => WD[parse(s).getUTCDay()][0];
export const dayOfMonth = (s: ISODate): number => parse(s).getUTCDate();

/** "today", "tomorrow", "in 5 days", "2 days ago". */
export function rel(from: ISODate, to?: ISODate | null): string {
  if (!to) return '';
  const n = diffDays(from, to);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
/** "7–16 Nov" style range; a single day when both ends match. */
export const span = (a?: ISODate | null, b?: ISODate | null): string => {
  if (!a || !b) return DASH;
  if (a === b) return short(a);
  const [da, db] = [parse(a), parse(b)];
  if (da.getUTCMonth() === db.getUTCMonth()) return `${da.getUTCDate()}–${short(b)}`;
  return `${short(a)}–${short(b)}`;
};

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** "€0.07", "−€0.43". */
export function euro(v: number | null | undefined, dp = 2): string {
  if (!isNum(v)) return DASH;
  const s = '€' + Math.abs(v).toFixed(dp);
  return v < 0 ? '−' + s : s;
}
export const signedEuro = (v: number | null | undefined, dp = 2): string => (!isNum(v) ? DASH : (v > 0 ? '+' : '') + euro(v, dp));
/** Percent already 0–100. */
export const pct = (v: number | null | undefined): string => (!isNum(v) ? DASH : `${Math.round(v)}%`);
/** Share 0–1 shown as percent. */
export const share = (v: number | null | undefined): string => (!isNum(v) ? DASH : `${Math.round(v * 100)}%`);
export const plural = (n: number | null | undefined, w: string): string => (!isNum(n) ? DASH : `${n} ${w}${n === 1 ? '' : 's'}`);
export const km = (v: number): string => v.toLocaleString('en');
export const signedC = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)} °C`;
export const humanKey = (k: string): string =>
  k.replace(/_/g, ' ').replace(/\bpct\b/g, '%').replace(/\bgdd\b/g, 'degree-days').replace(/\bc\b/g, '°C');
