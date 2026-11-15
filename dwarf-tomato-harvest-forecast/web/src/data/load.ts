/* Load the published JSON files. Required files fail loudly; optional ones (shipping, explain) fall back to an
 * empty document so a build without them still renders, with "—" where their values would be. */
import type { AppData, Doc, Meta } from './types';

export const REQUIRED = ['customers', 'rooms', 'days', 'forecast', 'whatif', 'evidence', 'alerts', 'backtest', 'assumptions'] as const;
export const OPTIONAL = ['shipping', 'explain'] as const;

const emptyDoc = (): Doc<never> => ({ meta: { source: '', built_at: '', as_of: { from: '', to: '' } }, rows: [] });

async function fetchJSON(url: string): Promise<Doc<unknown>> {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return (await r.json()) as Doc<unknown>;
}

/** Fetch every file from `base` (default "data/", relative to the page so it works from any folder). */
export async function loadData(base = 'data/'): Promise<AppData> {
  const req = await Promise.all(REQUIRED.map((f) => fetchJSON(`${base}${f}.json`)));
  const opt = await Promise.all(OPTIONAL.map((f) => fetchJSON(`${base}${f}.json`).catch(() => emptyDoc())));
  const out: Record<string, Doc<unknown>> = {};
  REQUIRED.forEach((f, i) => (out[f] = normalise(req[i])));
  OPTIONAL.forEach((f, i) => (out[f] = normalise(opt[i])));
  return out as unknown as AppData;
}

/** Guard against a file with no rows array or meta, so one bad file degrades to "—" rather than a crash. */
export function normalise<R>(doc: Partial<Doc<R>> | null | undefined): Doc<R> {
  const meta: Partial<Meta> = (doc && typeof doc.meta === 'object' && doc.meta) || {};
  const base = { source: '', built_at: '' };
  const asOf = { from: '', to: '' };
  return {
    meta: { ...base, ...meta, as_of: { ...asOf, ...(meta.as_of || {}) } } as Meta,
    rows: Array.isArray(doc?.rows) ? (doc!.rows as R[]) : [],
  };
}

/** True when any file says it is mock data (it never ships; the banner says so). */
export const isMock = (d: AppData): boolean => Object.values(d).some((doc) => (doc as Doc<unknown>).meta?.mock === true);
