import { describe, expect, it } from "vitest";
import {
  checkArea,
  checkClimateLog,
  checkPhotos,
  checkPlantingDate,
  checkPlantWeighings,
  checkRoom,
  checkRoomName,
  daysBetween,
  formatDate,
  isReady,
  isoDate,
  parseCsv,
  rowList,
  toNumber,
} from "./validate";

// ---------------------------------------------------------------- fixtures (tiny CSVs)

/** Good climate log: 3 days, hourly-ish, in order, plausible °C. */
const CLIMATE_GOOD = `room,timestamp,air_temp_c
north,2027-03-01T00:00+01:00,19.5
north,2027-03-01T12:00+01:00,24.0
north,2027-03-02T00:00+01:00,18.9
north,2027-03-02T12:00+01:00,23.1
north,2027-03-03T00:00+01:00,19.2
`;
/** Same rows, temperature column missing. */
const CLIMATE_NO_TEMP = `room,timestamp,humidity
north,2027-03-01T00:00+01:00,80
`;
/** Row 4 (third data row) goes back in time. */
const CLIMATE_WRONG_ORDER = `timestamp,air_temp_c
2027-03-01T00:00,19.5
2027-03-02T00:00,19.0
2027-03-01T12:00,24.0
2027-03-03T00:00,19.2
`;
/** The team's own daily table shape (team/date/T_mean aliases), two rooms. */
const CLIMATE_DEMO_SHAPE = `team,date,dap,T_mean,T_min
tomatonuts,2024-09-03,0,22.737,19.6
tomatonuts,2024-09-04,1,21.248,17.9
mugrow,2024-09-03,0,22.1,19.0
mugrow,2024-09-04,1,21.0,18.0
`;

const PLANTS_GOOD = `room,date,plant,fruit_weight_g,red_fruit_weight_g
north,2027-04-10,1,210.5,0
north,2027-04-10,2,198.0,12.4
north,2027-04-24,1,260.0,95.0
`;
const PLANTS_NO_RED = `date,plant,fruit_weight_g
2027-04-10,1,210.5
`;
/** The team's plants table shape: fw_total / fw_red / pct_red_weight. */
const PLANTS_DEMO_SHAPE = `team,sample,date,plant,fw_total,fw_red,pct_red_weight
tomatonuts,destructive,2024-10-07,301-1,93.13,0.0,0.0
tomatonuts,destructive,2024-11-05,301-2,250.0,120.0,48.0
`;

// ---------------------------------------------------------------- helpers

describe("date helpers", () => {
  it("reads the calendar date as written, ignoring time and zone", () => {
    expect(isoDate("2027-03-01T23:30-08:00")).toBe("2027-03-01");
    expect(isoDate("2027-03-01 12:00")).toBe("2027-03-01");
    expect(isoDate("2027-02-30")).toBeNull(); // no 30 Feb
    expect(isoDate("01/03/2027")).toBeNull();
  });
  it("counts whole days", () => {
    // 3 Sep -> 5 Nov 2024: 27 (rest of Sep) + 31 (Oct) + 5 = 63
    expect(daysBetween("2024-09-03", "2024-11-05")).toBe(63);
    expect(daysBetween("2024-09-05", "2024-09-03")).toBe(-2);
  });
  it("formats dates the app's way", () => {
    expect(formatDate("2027-03-01")).toBe("1 Mar 2027");
  });
});

describe("parseCsv / toNumber", () => {
  it("handles quotes, CRLF and a BOM", () => {
    const csv = parseCsv('﻿Room,Note\r\nnorth,"a, ""b"""\r\n\r\n');
    expect(csv.header).toEqual(["room", "note"]);
    expect(csv.rows).toEqual([["north", 'a, "b"']]);
  });
  it("detects semicolon files and decimal commas", () => {
    const csv = parseCsv("timestamp;air_temp_c\n2027-03-01;21,5\n");
    expect(csv.delimiter).toBe(";");
    expect(toNumber(csv.rows[0][1], csv.delimiter)).toBe(21.5);
  });
  it("lists at most three rows", () => {
    expect(rowList([4])).toBe("row 4");
    expect(rowList([4, 5, 6, 7, 8])).toBe("rows 4, 5, 6 and 2 more");
  });
});

// ---------------------------------------------------------------- form fields

describe("room name and area", () => {
  it("requires a name", () => {
    expect(checkRoomName("  ")[0].level).toBe("error");
    expect(checkRoomName("North 2")).toEqual([]);
    expect(checkRoomName("x".repeat(61))[0].level).toBe("error");
  });
  it("requires an area above 0", () => {
    expect(checkArea("")[0].level).toBe("error");
    expect(checkArea("abc")[0].level).toBe("error");
    expect(checkArea("0")[0].message).toMatch(/more than 0/);
    expect(checkArea("-5")[0].level).toBe("error");
    expect(checkArea("96,5")).toEqual([]); // decimal comma accepted
    expect(checkArea("96")).toEqual([]);
  });
});

describe("planting date", () => {
  const today = "2027-04-30";
  it("is required", () => {
    expect(checkPlantingDate("", today)[0].message).toMatch(/required/);
  });
  it("can't be in the future", () => {
    expect(checkPlantingDate("2027-05-01", today)[0].message).toMatch(/future/);
    expect(checkPlantingDate("2027-04-30", today)).toEqual([]); // today itself is fine
  });
  it("must be on or before the first log day", () => {
    // planted 3 Mar, log starts 1 Mar -> log starts before planting -> error
    const after = checkPlantingDate("2027-03-03", today, "2027-03-01");
    expect(after[0].level).toBe("error");
    expect(after[0].message).toMatch(/before the planting date/);
    // demo rooms: planted and logged from the same day -> fine
    expect(checkPlantingDate("2024-09-03", today, "2024-09-03")).toEqual([]);
  });
  it("warns when the log starts more than a day after planting", () => {
    // planted 1 Mar, log from 5 Mar -> 4 days of warmth missing
    const w = checkPlantingDate("2027-03-01", today, "2027-03-05");
    expect(w[0].level).toBe("warning");
    expect(w[0].message).toMatch(/4 days after planting/);
  });
});

// ---------------------------------------------------------------- climate log

describe("climate log", () => {
  it("passes a good file and reports its date range", () => {
    const c = checkClimateLog(CLIMATE_GOOD, "North");
    expect(c.ok).toBe(true);
    expect(c.findings).toEqual([]);
    expect(c.rows).toBe(5);
    expect(c.firstDate).toBe("2027-03-01");
    expect(c.lastDate).toBe("2027-03-03");
    expect(c.passed).toContain("5 rows, 1 Mar 2027 – 3 Mar 2027");
  });
  it("names a missing column", () => {
    const c = checkClimateLog(CLIMATE_NO_TEMP);
    expect(c.ok).toBe(false);
    expect(c.findings[0].message).toMatch(/air_temp_c/);
    expect(c.findings[0].message).toMatch(/Columns found: room, timestamp, humidity/);
  });
  it("flags rows that go back in time", () => {
    const c = checkClimateLog(CLIMATE_WRONG_ORDER);
    expect(c.ok).toBe(false);
    // header is row 1, so the third data row is row 4
    expect(c.findings[0].message).toMatch(/not in time order \(row 4/);
  });
  it("accepts the team's own daily table (aliases) and picks the matching room", () => {
    const c = checkClimateLog(CLIMATE_DEMO_SHAPE, "mugrow");
    expect(c.ok).toBe(true);
    expect(c.rows).toBe(2);
    expect(c.passed[1]).toMatch(/2 rooms; checked the rows for “mugrow”/);
  });
  it("checks order per room when several rooms share a file", () => {
    // tomatonuts 3–4 Sep then mugrow 3–4 Sep: no room goes back in time
    const c = checkClimateLog(CLIMATE_DEMO_SHAPE, "new room");
    expect(c.findings.some((f) => /time order/.test(f.message))).toBe(false);
    expect(c.findings[0]).toMatchObject({ level: "warning" });
  });
  it("spots °F and out-of-range readings", () => {
    // median of 70, 72, 75 is 72 > 50 -> looks like °F
    const f = checkClimateLog("timestamp,air_temp_c\n2027-03-01,70\n2027-03-02,72\n2027-03-03,75\n");
    expect(f.ok).toBe(false);
    expect(f.findings[0].message).toMatch(/°F/);
    // one reading of 85 among normal ones -> warning on row 3
    const r = checkClimateLog("timestamp,air_temp_c\n2027-03-01,20\n2027-03-02,85\n2027-03-03,21\n");
    expect(r.ok).toBe(true);
    expect(r.findings[0].message).toMatch(/outside -10 to 50 °C in row 3/);
  });
  it("warns about gaps longer than a day", () => {
    // 1 Mar -> 4 Mar is a 3-day gap
    const c = checkClimateLog("timestamp,air_temp_c\n2027-03-01,20\n2027-03-04,21\n");
    expect(c.findings[0].message).toMatch(/Longest gap in the log is 3 days \(after 1 Mar 2027\)/);
  });
  it("warns about rows dated after today", () => {
    // log runs to 3 Mar 2027 but today is 2 Mar 2027
    const c = checkClimateLog(CLIMATE_GOOD, "north", "2027-03-02");
    expect(c.ok).toBe(true);
    expect(c.findings[0].message).toMatch(/dated after today \(latest 3 Mar 2027\)/);
    expect(checkPlantWeighings(PLANTS_GOOD, "2027-03-01", "", "2027-04-20").findings[0].message).toMatch(/latest 24 Apr 2027/);
  });
  it("rejects unreadable dates and empty files", () => {
    const c = checkClimateLog("timestamp,air_temp_c\n01/03/2027,20\n");
    expect(c.findings[0].message).toMatch(/Can't read the date in row 2/);
    expect(checkClimateLog("").ok).toBe(false);
    expect(checkClimateLog("timestamp,air_temp_c\n").findings[0].message).toMatch(/no data rows/);
  });
});

// ---------------------------------------------------------------- plant weighings

describe("plant weighings", () => {
  it("passes a good file", () => {
    const p = checkPlantWeighings(PLANTS_GOOD, "2027-03-01");
    expect(p.ok).toBe(true);
    expect(p.findings).toEqual([]);
    // 3 plants on 2 days: 10 Apr and 24 Apr
    expect(p.passed).toContain("3 plants weighed on 2 days (10 Apr 2027 – 24 Apr 2027)");
  });
  it("names missing red-fruit column", () => {
    const p = checkPlantWeighings(PLANTS_NO_RED);
    expect(p.ok).toBe(false);
    expect(p.findings[0].message).toMatch(/red_fruit_weight_g.*pct_red/);
  });
  it("rejects weighings before the planting date", () => {
    // planted 15 Apr; the two 10 Apr rows (rows 2 and 3) come before it
    const p = checkPlantWeighings(PLANTS_GOOD, "2027-04-15");
    expect(p.ok).toBe(false);
    expect(p.findings[0].message).toMatch(/before the planting date \(15 Apr 2027\) in rows 2, 3/);
  });
  it("catches red heavier than total, bad % and negative weights", () => {
    const p = checkPlantWeighings("date,fruit_weight_g,red_fruit_weight_g,pct_red\n2027-04-10,100,150,40\n2027-04-10,100,10,140\n2027-04-10,-3,0,0\n");
    const msgs = p.findings.map((f) => f.message).join(" | ");
    expect(msgs).toMatch(/negative or not a number in row 4/);
    expect(msgs).toMatch(/Red fruit weighs more than all fruit in row 2/);
    expect(msgs).toMatch(/between 0 and 100 in row 3/);
  });
  it("warns about kilograms and no red fruit yet", () => {
    const p = checkPlantWeighings("date,fruit_weight_g,pct_red\n2027-04-10,0.21,0\n2027-04-10,0.19,0\n");
    expect(p.ok).toBe(true);
    expect(p.findings.map((f) => f.message).join(" ")).toMatch(/kilograms.*No plant shows red/);
  });
  it("skips rows with a blank total as a warning, like the demo's final harvest rows", () => {
    // row 3 has red weight only (total not measured): skipped with a warning, file still OK
    const p = checkPlantWeighings("date,fw_total,fw_red\n2024-11-21,336.8,299.5\n2024-11-21,,322.7\n");
    expect(p.ok).toBe(true);
    expect(p.findings[0]).toMatchObject({ level: "warning" });
    expect(p.findings[0].message).toMatch(/1 row has no total fruit weight.*row 3/);
    // junk text is still an error
    expect(checkPlantWeighings("date,fw_total,fw_red\n2024-11-21,abc,3\n").ok).toBe(false);
    // nothing usable at all -> error
    expect(checkPlantWeighings("date,fw_total,fw_red\n2024-11-21,,3\n").ok).toBe(false);
  });
  it("accepts the team's plants table (fw_total / fw_red aliases)", () => {
    const p = checkPlantWeighings(PLANTS_DEMO_SHAPE, "2024-09-03", "tomatonuts");
    expect(p.ok).toBe(true);
    expect(p.passed).toContain("At least one weighing shows red fruit");
  });
});

// ---------------------------------------------------------------- photos

describe("photos", () => {
  it("is optional", () => {
    expect(checkPhotos([])).toMatchObject({ ok: true, findings: [] });
  });
  it("checks names, dates and noon", () => {
    const p = checkPhotos(["north_20270310_1200.jpg", "north_20270311_0400.jpg", "IMG_1234.jpg", "north_20270228_1200.png"], "2027-03-01");
    expect(p.ok).toBe(false);
    const msgs = p.findings.map((f) => f.message).join(" | ");
    expect(msgs).toMatch(/Not readable: IMG_1234.jpg/);
    expect(msgs).toMatch(/before planting will be ignored: north_20270228_1200.png/);
    expect(msgs).toMatch(/1 photo was taken far from noon/); // the 04:00 one
    // 3 readable photos on 3 days, 28 Feb – 11 Mar
    expect(p.passed[0]).toBe("3 photos over 3 days (28 Feb 2027 – 11 Mar 2027)");
  });
});

// ---------------------------------------------------------------- whole form

describe("checkRoom", () => {
  it("is ready only when every required field passes", () => {
    const climate = checkClimateLog(CLIMATE_GOOD, "North");
    const plants = checkPlantWeighings(PLANTS_GOOD, "2027-03-01");
    const good = checkRoom({ name: "North", area: "96", plantingDate: "2027-03-01", climate, plants }, "2027-04-30");
    expect(isReady(good)).toBe(true);
    const noFiles = checkRoom({ name: "North", area: "96", plantingDate: "2027-03-01" }, "2027-04-30");
    expect(isReady(noFiles)).toBe(false);
    expect(noFiles.climate[0].message).toMatch(/climate log/);
    // planting after the first log day (1 Mar) blocks the room
    const late = checkRoom({ name: "North", area: "96", plantingDate: "2027-03-02", climate, plants }, "2027-04-30");
    expect(isReady(late)).toBe(false);
  });
});
