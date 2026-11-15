import type { ISODate } from './types';

const DAY_MS = 864e5;
export const DASH = '—';

/** UTC Date for an ISO day string. */
export const parse = (s: ISODate): Date => new Date(s + 'T00:00:00Z');
export const iso = (d: Date): ISODate => d.toISOString().slice(0, 10);
/** The ISO day `n` days after `s` (negative for before). */
export const addDays = (s: ISODate, n: number): ISODate => iso(new Date(parse(s).getTime() + n * DAY_MS));
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** "€0.07", "−€0.43". */
export function euro(v: number | null | undefined, dp = 2): string {
  if (!isNum(v)) return DASH;
  const s = '€' + Math.abs(v).toFixed(dp);
  return v < 0 ? '−' + s : s;
}
/** Percent already 0–100. */
export const pct = (v: number | null | undefined): string => (!isNum(v) ? DASH : `${Math.round(v)}%`);
/** Share 0–1 shown as percent. */
export const share = (v: number | null | undefined): string => (!isNum(v) ? DASH : `${Math.round(v * 100)}%`);
