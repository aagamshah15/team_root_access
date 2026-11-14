/**
 * Browser-side checks for the "Add a room" form (lane L10, decision D17).
 *
 * Every rule here mirrors `docs/input-contract.md`. Nothing is uploaded: files are
 * read with File.text() in the browser and only a summary of the checks is kept.
 * All functions are pure (they take text and dates, return findings) so they can be
 * tested without a browser.
 */

/** One plain-words finding shown next to a field. "error" blocks the room; "warning" doesn't. */
export interface Finding {
  level: "error" | "warning";
  message: string;
}

/** What a file check returns: findings plus a short summary of what passed. */
export interface FileCheck {
  ok: boolean; // no errors (warnings allowed)
  findings: Finding[];
  passed: string[]; // plain lines such as "412 rows, 3 Sep 2024 – 19 Oct 2024"
  rows: number;
  firstDate?: string; // ISO yyyy-mm-dd
  lastDate?: string;
}

/**
 * Limits used by the checks. They restate `docs/input-contract.md`; change both together.
 * (Kept in one place so they can move to `config/crop.yaml` / published data later.)
 */
export const RULES = {
  /** Plausible greenhouse air temperature, °C. Outside this we suspect a broken sensor or °F. */
  tempMinC: -10,
  tempMaxC: 50,
  /** Longest gap allowed between log rows before we warn, in days (contract: "no gap longer than a day"). */
  maxGapDays: 1,
  /** Largest believable fruit weight for one dwarf-tomato plant, grams. Above this we suspect wrong units. */
  maxPlantFruitG: 5000,
  /** Room name length limit (characters). */
  maxNameLength: 60,
} as const;

/** Accepted column names (lower case). The first is the name in the contract; the rest are aliases we also accept. */
export const CLIMATE_COLUMNS = {
  timestamp: ["timestamp", "date", "datetime", "time"],
  room: ["room", "team", "compartment"],
  airTemp: ["air_temp_c", "temperature_c", "air_temperature", "t_air", "t_mean", "temp"],
} as const;

export const PLANT_COLUMNS = {
  date: ["date", "timestamp"],
  room: ["room", "team", "compartment"],
  plant: ["plant", "plant_id"],
  fruitTotal: ["fruit_weight_g", "fw_total", "total_fruit_g"],
  fruitRed: ["red_fruit_weight_g", "fw_red", "red_fruit_g"],
  pctRed: ["pct_red", "pct_red_weight", "percent_red"],
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------------------------------------------------------------- dates

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

/** Whole days from a to b (both "yyyy-mm-dd"). Example: daysBetween("2024-09-03", "2024-09-05") = 2. */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** "2024-09-03" -> "3 Sep 2024", the date style used across the app. */
export function formatDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Today's date in the browser's local time as "yyyy-mm-dd". */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ---------------------------------------------------------------- CSV

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

/** Index of the first header matching any accepted name, or -1. */
export function findColumn(header: string[], names: readonly string[]): number {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

/** "rows 4, 9, 12 and 3 more" — at most three row numbers in a message (row 1 = header, so data starts at 2). */
export function rowList(lines: number[]): string {
  const shown = lines.slice(0, 3).join(", ");
  return lines.length > 3 ? `rows ${shown} and ${lines.length - 3} more` : lines.length === 1 ? `row ${shown}` : `rows ${shown}`;
}

// ---------------------------------------------------------------- form fields

/** Room name: required, at most RULES.maxNameLength characters. */
export function checkRoomName(name: string): Finding[] {
  const n = name.trim();
  if (!n) return [{ level: "error", message: "Give the room a name, for example “North 2”." }];
  if (n.length > RULES.maxNameLength) return [{ level: "error", message: `Keep the name under ${RULES.maxNameLength} characters.` }];
  return [];
}

/** Area in m²: required, a number above zero. */
export function checkArea(area: string): Finding[] {
  if (area.trim() === "") return [{ level: "error", message: "Enter the growing area in square metres (m²)." }];
  const n = toNumber(area.replace(",", "."));
  if (n === null) return [{ level: "error", message: "Area must be a number, for example 96 or 96.5." }];
  if (n <= 0) return [{ level: "error", message: "Area must be more than 0 m²." }];
  return [];
}

/**
 * Planting date: required, a real date, not after today, and on or before the first climate-log day
 * (warmth and costs count from planting, so the log has to cover it). A log that starts more than
 * RULES.maxGapDays after planting is only a warning: the forecast can start, but early warmth is missing.
 */
export function checkPlantingDate(planted: string, today: string, firstLogDate?: string): Finding[] {
  if (!planted.trim()) return [{ level: "error", message: "Planting date is required: warmth, days grown and costs all count from it." }];
  const p = isoDate(planted);
  if (!p) return [{ level: "error", message: "Enter the planting date as a date, for example 2027-03-01." }];
  if (daysBetween(today, p) > 0) return [{ level: "error", message: `Planting date ${formatDate(p)} is in the future. Add the room once it is planted.` }];
  if (firstLogDate) {
    if (daysBetween(p, firstLogDate) < 0)
      return [{ level: "error", message: `The climate log starts on ${formatDate(firstLogDate)}, before the planting date ${formatDate(p)}. Check the planting date, or remove log rows from before planting.` }];
    const gap = daysBetween(p, firstLogDate);
    if (gap > RULES.maxGapDays)
      return [{ level: "warning", message: `The climate log starts ${gap} days after planting (${formatDate(firstLogDate)}). Warmth for those first days will be missing, so the forecast is less sure.` }];
  }
  return [];
}

/** Warning for rows dated after today: usually a wrong clock or date format in the export. */
function futureRows(last: string): Finding {
  return { level: "warning", message: `Some rows are dated after today (latest ${formatDate(last)}). Check the logger's clock and the date format.` };
}

// ---------------------------------------------------------------- climate log

/**
 * Check a climate log CSV against the contract: a timestamp and an air temperature (°C) column,
 * dates readable and in time order (per room if the file has a room column), temperatures plausible,
 * no gap longer than RULES.maxGapDays. If the file holds several rooms and one matches `roomName`,
 * only that room's rows are checked. With `today`, rows dated after it get a warning.
 */
export function checkClimateLog(text: string, roomName = "", today?: string): FileCheck {
  const csv = parseCsv(text);
  const findings: Finding[] = [];
  const passed: string[] = [];
  const iTime = findColumn(csv.header, CLIMATE_COLUMNS.timestamp);
  const iTemp = findColumn(csv.header, CLIMATE_COLUMNS.airTemp);
  const iRoom = findColumn(csv.header, CLIMATE_COLUMNS.room);

  const missing: string[] = [];
  if (iTime < 0) missing.push("“timestamp” (date and time, e.g. 2027-03-01T12:00)");
  if (iTemp < 0) missing.push("“air_temp_c” (air temperature in °C)");
  if (csv.rows.length === 0 && csv.header.length === 0) {
    return { ok: false, findings: [{ level: "error", message: "The file is empty." }], passed, rows: 0 };
  }
  if (missing.length) {
    findings.push({ level: "error", message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(" and ")}. Columns found: ${csv.header.join(", ") || "none"}.` });
    return { ok: false, findings, passed, rows: csv.rows.length };
  }
  passed.push("Required columns found (timestamp, air temperature)");

  // Pick the rows for this room when the file has several rooms.
  let rows = csv.rows.map((r, k) => ({ r, line: k + 2 }));
  if (iRoom >= 0) {
    const rooms = [...new Set(rows.map(({ r }) => (r[iRoom] ?? "").trim()))].filter(Boolean);
    const match = rooms.find((x) => x.toLowerCase() === roomName.trim().toLowerCase());
    if (rooms.length > 1 && match) {
      rows = rows.filter(({ r }) => (r[iRoom] ?? "").trim() === match);
      passed.push(`File has ${rooms.length} rooms; checked the rows for “${match}”`);
    } else if (rooms.length > 1) {
      findings.push({ level: "warning", message: `The file has rows for ${rooms.length} rooms (${rooms.slice(0, 4).join(", ")}${rooms.length > 4 ? ", …" : ""}) and none is named like this room. Send one file per room, or name the room as in the file.` });
    }
  }
  if (rows.length === 0) {
    findings.push({ level: "error", message: "The file has a header but no data rows." });
    return { ok: false, findings, passed, rows: 0 };
  }

  const badDate: number[] = [];
  const badTemp: number[] = [];
  const outOfRange: number[] = [];
  const outOfOrder: number[] = [];
  const temps: number[] = [];
  const lastByRoom = new Map<string, string>();
  let first: string | undefined;
  let last: string | undefined;
  let longestGap = 0;
  let gapAfter = "";
  const roomKey = (r: string[]) => (iRoom >= 0 ? (r[iRoom] ?? "").trim() : "");
  // Order is checked on the full timestamp text (ISO sorts as text); gaps on calendar days.
  const lastStampByRoom = new Map<string, string>();

  for (const { r, line } of rows) {
    const stamp = (r[iTime] ?? "").trim();
    const d = isoDate(stamp);
    if (!d) { badDate.push(line); continue; }
    const key = roomKey(r);
    const prevStamp = lastStampByRoom.get(key);
    if (prevStamp !== undefined && stamp.replace(" ", "T") < prevStamp.replace(" ", "T")) outOfOrder.push(line);
    const prev = lastByRoom.get(key);
    if (prev !== undefined) {
      const gap = daysBetween(prev, d);
      if (gap > longestGap) { longestGap = gap; gapAfter = prev; }
    }
    lastStampByRoom.set(key, stamp);
    if (prev === undefined || d > prev) lastByRoom.set(key, d);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;

    const t = toNumber(r[iTemp], csv.delimiter);
    if (t === null) badTemp.push(line);
    else {
      temps.push(t);
      if (t < RULES.tempMinC || t > RULES.tempMaxC) outOfRange.push(line);
    }
  }

  if (badDate.length) findings.push({ level: "error", message: `Can't read the date in ${rowList(badDate)}. Use ISO dates such as 2027-03-01 or 2027-03-01T12:00+01:00.` });
  if (outOfOrder.length) findings.push({ level: "error", message: `Rows are not in time order (${rowList(outOfOrder)} go back in time). Sort the file by timestamp, oldest first.` });
  if (badTemp.length) findings.push({ level: "warning", message: `Air temperature is blank or not a number in ${rowList(badTemp)}. Those readings will be skipped.` });

  const median = temps.length ? [...temps].sort((a, b) => a - b)[Math.floor(temps.length / 2)] : NaN;
  if (temps.length && median > RULES.tempMaxC) {
    findings.push({ level: "error", message: `Temperatures look like °F (typical value ${median}). We need °C.` });
  } else if (outOfRange.length) {
    findings.push({ level: "warning", message: `Air temperature outside ${RULES.tempMinC} to ${RULES.tempMaxC} °C in ${rowList(outOfRange)}. Check the sensor; those readings may be skipped.` });
  }
  if (longestGap > RULES.maxGapDays) {
    findings.push({ level: "warning", message: `Longest gap in the log is ${longestGap} days (after ${formatDate(gapAfter)}). Gaps longer than a day make the warmth total less sure.` });
  }
  if (temps.length === 0 && !badDate.length) findings.push({ level: "error", message: "No usable air temperature readings." });
  if (today && last && daysBetween(today, last) > 0) findings.push(futureRows(last));

  if (first && last) passed.push(`${rows.length} rows, ${formatDate(first)} – ${formatDate(last)}`);
  if (temps.length && !outOfRange.length && median <= RULES.tempMaxC) passed.push("Air temperatures in a believable range (°C)");
  if (!outOfOrder.length && !badDate.length) passed.push("Dates readable and in time order");

  return { ok: !findings.some((f) => f.level === "error"), findings, passed, rows: rows.length, firstDate: first, lastDate: last };
}

// ---------------------------------------------------------------- plant weighings

/**
 * Check a plant weighings CSV: a date, a total fruit weight (g) and either red fruit weight (g) or % red.
 * Weights must be numbers ≥ 0, red ≤ total, % red within 0–100, and no weighing before planting.
 * A blank weight is a missing measurement (warning), not an error: the demo's final-harvest rows
 * record only red fruit weight.
 * Warns when no plant shows red fruit yet (the contract asks for at least one sample from the colour-turning stage).
 */
export function checkPlantWeighings(text: string, plantingDate?: string, roomName = "", today?: string): FileCheck {
  const csv = parseCsv(text);
  const findings: Finding[] = [];
  const passed: string[] = [];
  if (csv.header.length === 0) return { ok: false, findings: [{ level: "error", message: "The file is empty." }], passed, rows: 0 };
  const iDate = findColumn(csv.header, PLANT_COLUMNS.date);
  const iTotal = findColumn(csv.header, PLANT_COLUMNS.fruitTotal);
  const iRed = findColumn(csv.header, PLANT_COLUMNS.fruitRed);
  const iPct = findColumn(csv.header, PLANT_COLUMNS.pctRed);
  const iRoom = findColumn(csv.header, PLANT_COLUMNS.room);

  const missing: string[] = [];
  if (iDate < 0) missing.push("“date”");
  if (iTotal < 0) missing.push("“fruit_weight_g” (total fruit weight per plant, grams)");
  if (iRed < 0 && iPct < 0) missing.push("“red_fruit_weight_g” or “pct_red” (red fruit, grams or % of weight)");
  if (missing.length) {
    findings.push({ level: "error", message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(" and ")}. Columns found: ${csv.header.join(", ") || "none"}.` });
    return { ok: false, findings, passed, rows: csv.rows.length };
  }
  passed.push("Required columns found (date, fruit weight, red fruit)");

  let rows = csv.rows.map((r, k) => ({ r, line: k + 2 }));
  if (iRoom >= 0) {
    const rooms = [...new Set(rows.map(({ r }) => (r[iRoom] ?? "").trim()))].filter(Boolean);
    const match = rooms.find((x) => x.toLowerCase() === roomName.trim().toLowerCase());
    if (rooms.length > 1 && match) {
      rows = rows.filter(({ r }) => (r[iRoom] ?? "").trim() === match);
      passed.push(`File has ${rooms.length} rooms; checked the rows for “${match}”`);
    } else if (rooms.length > 1) {
      findings.push({ level: "warning", message: `The file has weighings for ${rooms.length} rooms and none is named like this room. Send one file per room, or name the room as in the file.` });
    }
  }
  if (rows.length === 0) {
    findings.push({ level: "error", message: "The file has a header but no data rows." });
    return { ok: false, findings, passed, rows: 0 };
  }

  const badDate: number[] = [];
  const badWeight: number[] = [];
  const incomplete: number[] = [];
  const redOverTotal: number[] = [];
  const badPct: number[] = [];
  const beforePlanting: number[] = [];
  const totals: number[] = [];
  const dates = new Set<string>();
  let anyRed = false;
  let first: string | undefined;
  let last: string | undefined;

  for (const { r, line } of rows) {
    const d = isoDate(r[iDate] ?? "");
    if (!d) badDate.push(line);
    else {
      dates.add(d);
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
      if (plantingDate && daysBetween(plantingDate, d) < 0) beforePlanting.push(line);
    }
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const total = toNumber(cell(iTotal), csv.delimiter);
    const red = toNumber(cell(iRed), csv.delimiter);
    const pct = toNumber(cell(iPct), csv.delimiter);
    // Junk text or a negative number is an error; a blank cell is just a missing measurement.
    const junk = (i: number, n: number | null) => i >= 0 && cell(i) !== "" && (n === null || n < 0);
    if (junk(iTotal, total) || junk(iRed, red) || junk(iPct, pct)) { badWeight.push(line); continue; }
    if ((red ?? 0) > 0 || (pct ?? 0) > 0) anyRed = true;
    if (total === null || (red === null && pct === null)) { incomplete.push(line); continue; }
    totals.push(total);
    if (red !== null && red > total) redOverTotal.push(line);
    if (pct !== null && pct > 100) badPct.push(line);
  }

  if (badDate.length) findings.push({ level: "error", message: `Can't read the date in ${rowList(badDate)}. Use ISO dates such as 2027-04-15.` });
  if (beforePlanting.length && plantingDate) findings.push({ level: "error", message: `Weighings dated before the planting date (${formatDate(plantingDate)}) in ${rowList(beforePlanting)}. Check the planting date or those rows.` });
  if (badWeight.length) findings.push({ level: "error", message: `A weight or % red is negative or not a number in ${rowList(badWeight)}.` });
  if (incomplete.length) findings.push({ level: "warning", message: `${incomplete.length} row${incomplete.length === 1 ? " has" : "s have"} no total fruit weight or no red fruit figure (first: ${rowList(incomplete)}). They can't give a share of red and will be skipped for that.` });
  if (totals.length === 0 && !badWeight.length) findings.push({ level: "error", message: "No row has both a total fruit weight and a red fruit figure." });
  if (redOverTotal.length) findings.push({ level: "error", message: `Red fruit weighs more than all fruit in ${rowList(redOverTotal)}. Check the two weight columns aren't swapped.` });
  if (badPct.length) findings.push({ level: "error", message: `% red must be between 0 and 100 in ${rowList(badPct)}.` });

  const maxTotal = totals.length ? Math.max(...totals) : 0;
  if (maxTotal > RULES.maxPlantFruitG) findings.push({ level: "warning", message: `Some plants carry over ${RULES.maxPlantFruitG} g of fruit. Check the weights are per plant and in grams.` });
  else if (totals.length && maxTotal > 0 && maxTotal < 5) findings.push({ level: "warning", message: "All fruit weights are under 5 — they look like kilograms. We need grams per plant." });
  if (today && last && daysBetween(today, last) > 0) findings.push(futureRows(last));
  if (totals.length && !anyRed) findings.push({ level: "warning", message: "No plant shows red fruit yet. The forecast stays warmth-only until a weighing from the colour-turning stage arrives." });

  if (first && last) passed.push(`${rows.length} plants weighed on ${dates.size} day${dates.size === 1 ? "" : "s"} (${formatDate(first)}${first !== last ? ` – ${formatDate(last)}` : ""})`);
  if (!badWeight.length && !redOverTotal.length && !badPct.length) passed.push("Weights are numbers and red ≤ total");
  if (anyRed) passed.push("At least one weighing shows red fruit");

  return { ok: !findings.some((f) => f.level === "error"), findings, passed, rows: rows.length, firstDate: first, lastDate: last };
}

// ---------------------------------------------------------------- photos

/** Photo name rule from the contract: room_YYYYMMDD_HHMM.jpg (or .jpeg / .png). Room part may contain letters, digits, - and _. */
const PHOTO_NAME = /^(.+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.(jpe?g|png)$/i;

/**
 * Check a set of canopy photo file names (optional feed). Names must follow room_YYYYMMDD_HHMM.jpg,
 * with real dates on or after planting. Photos far from noon get a warning: lamp-lit photos are purple
 * and unreliable for colour.
 */
export function checkPhotos(names: string[], plantingDate?: string): FileCheck {
  const findings: Finding[] = [];
  const passed: string[] = [];
  if (names.length === 0) return { ok: true, findings, passed, rows: 0 };
  const badName: string[] = [];
  const beforePlanting: string[] = [];
  const offNoon: string[] = [];
  const days = new Set<string>();
  let first: string | undefined;
  let last: string | undefined;
  for (const n of names) {
    const m = PHOTO_NAME.exec(n);
    const d = m ? isoDate(`${m[2]}-${m[3]}-${m[4]}`) : null;
    const hour = m ? Number(m[5]) : NaN;
    if (!m || !d || hour > 23 || Number(m[6]) > 59) { badName.push(n); continue; }
    days.add(d);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
    if (plantingDate && daysBetween(plantingDate, d) < 0) beforePlanting.push(n);
    if (hour < 10 || hour > 14) offNoon.push(n);
  }
  const list = (xs: string[]) => xs.slice(0, 3).join(", ") + (xs.length > 3 ? ` and ${xs.length - 3} more` : "");
  if (badName.length) findings.push({ level: "error", message: `Name photos like north2_20270315_1200.jpg (room, date, time). Not readable: ${list(badName)}.` });
  if (beforePlanting.length) findings.push({ level: "warning", message: `Photos from before planting will be ignored: ${list(beforePlanting)}.` });
  if (offNoon.length) findings.push({ level: "warning", message: `${offNoon.length} photo${offNoon.length === 1 ? " was" : "s were"} taken far from noon. Lamp-lit photos look purple and are not used for colour.` });
  if (first && last) passed.push(`${names.length - badName.length} photos over ${days.size} day${days.size === 1 ? "" : "s"} (${formatDate(first)} – ${formatDate(last)})`);
  return { ok: !findings.some((f) => f.level === "error"), findings, passed, rows: names.length, firstDate: first, lastDate: last };
}

// ---------------------------------------------------------------- whole form

export interface RoomDraftInput {
  name: string;
  area: string;
  plantingDate: string;
  climate?: FileCheck;
  plants?: FileCheck;
  photos?: FileCheck;
}

/**
 * Field-by-field findings for the whole form. Climate log and plant weighings are required files;
 * photos are optional. `today` is "yyyy-mm-dd".
 */
export function checkRoom(input: RoomDraftInput, today: string): Record<"name" | "area" | "plantingDate" | "climate" | "plants" | "photos", Finding[]> {
  return {
    name: checkRoomName(input.name),
    area: checkArea(input.area),
    plantingDate: checkPlantingDate(input.plantingDate, today, input.climate?.firstDate),
    climate: input.climate ? input.climate.findings : [{ level: "error", message: "Add the room’s climate log (CSV)." }],
    plants: input.plants ? input.plants.findings : [{ level: "error", message: "Add at least one plant weighing file (CSV)." }],
    photos: input.photos ? input.photos.findings : [],
  };
}

/** True when no field has an error. */
export function isReady(findings: Record<string, Finding[]>): boolean {
  return Object.values(findings).every((fs) => !fs.some((f) => f.level === "error"));
}
