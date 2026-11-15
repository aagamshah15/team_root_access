
/**
 * Read the calendar date at the start of an ISO 8601 value ("2024-09-03", "2024-09-03T12:00+01:00",
 * "2024-09-03 12:00"). Returns "yyyy-mm-dd" or null. We take the date as written, not converted
 * to the browser's time zone, because the contract asks for the greenhouse's local time.
 */
export function isoDate(value: string): string | null {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}


/** A parsed CSV: lower-cased trimmed header names and the data rows (header removed). */
export interface Csv {
  header: string[];
  rows: string[][];
  delimiter: "," | ";";
}

/**
 * Parse CSV text. Handles quoted fields, doubled quotes, CRLF line ends and a leading BOM.
 * Uses ";" when the header line has semicolons but no commas (common in European exports);
 * in that case "21,5" is later read as 21.5 by `toNumber`. Blank lines are skipped.
 */
export function parseCsv(text: string): Csv {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter: "," | ";" = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) records.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) records.push(row);
  const [head = [], ...rows] = records;
  return { header: head.map((h) => h.trim().toLowerCase()), rows, delimiter };
}

/** Number from a CSV cell; accepts a decimal comma for ";" files. Empty or junk -> null. */
export function toNumber(cell: string | undefined, delimiter: "," | ";" = ","): number | null {
  if (cell === undefined) return null;
  let s = cell.trim();
  if (s === "") return null;
  if (delimiter === ";") s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
