/** Small, locale-independent formatters so tests and screens agree on text. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse "YYYY-MM-DD" as a UTC date (no time-zone drift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2024-11-13" → "13 Nov". */
export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** Euro amount per m² per day with 3 decimals: 0.058 → "€0.058", −0.2 → "−€0.200". */
export function euro(v: number): string {
  const s = Math.abs(v).toFixed(3);
  return v < 0 ? `−€${s}` : `€${s}`;
}

/** Share 0–1 → whole percent: 0.525 → "53%". */
export function pctShare(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Percent 0–100 → whole percent: 34.2 → "34%". */
export function pct(v: number): string {
  return `${Math.round(v)}%`;
}
