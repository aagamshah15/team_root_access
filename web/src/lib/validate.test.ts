import { describe, expect, it } from "vitest";
import { isoDate, parseCsv, toNumber } from "./validate";

describe("date helpers", () => {
  it("reads the calendar date as written, ignoring time and zone", () => {
    expect(isoDate("2027-03-01T23:30-08:00")).toBe("2027-03-01");
    expect(isoDate("2027-03-01 12:00")).toBe("2027-03-01");
    expect(isoDate("2027-02-30")).toBeNull(); // no 30 Feb
    expect(isoDate("01/03/2027")).toBeNull();
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
});
