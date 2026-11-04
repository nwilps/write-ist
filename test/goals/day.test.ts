/**
 * The writer's day (ADR-0040): local time, ending where the app says, midnight
 * until a settings page says otherwise.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  dayEndsAt,
  DEFAULT_DAY_ENDS_AT,
  daysBetween,
  isDay,
  weekdayOf,
  writingDayOf,
} from "../../src/goals/day.ts";

describe("where the day ends", () => {
  it("is midnight, from the one function a settings page will drive", () => {
    expect(DEFAULT_DAY_ENDS_AT).toEqual({ hour: 0, minute: 0 });
    expect(dayEndsAt()).toEqual({ hour: 0, minute: 0 });
  });

  it("puts 23:59:59 on one day and 00:00:00 on the next, in local time", () => {
    expect(writingDayOf(new Date(2026, 10, 3, 23, 59, 59))).toBe("2026-11-03");
    expect(writingDayOf(new Date(2026, 10, 4, 0, 0, 0))).toBe("2026-11-04");
    expect(writingDayOf(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
    expect(writingDayOf(new Date(2027, 0, 1, 0, 0))).toBe("2027-01-01");
  });

  it("follows whatever the function says, so a setting can move it", () => {
    const fourAm = { hour: 4, minute: 0 };
    expect(writingDayOf(new Date(2026, 10, 4, 3, 59), fourAm)).toBe("2026-11-03");
    expect(writingDayOf(new Date(2026, 10, 4, 4, 0), fourAm)).toBe("2026-11-04");
    expect(writingDayOf(new Date(2026, 10, 1, 1, 0), { hour: 4, minute: 30 })).toBe("2026-10-31");
  });
});

describe("daylight saving", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("does not lose or repeat a day when the clocks change, even with a late day end", () => {
    process.env.TZ = "America/New_York";
    const twoThirty = { hour: 2, minute: 30 };
    // 2026-03-08 02:00-03:00 does not exist; 2026-11-01 01:00-02:00 happens twice.
    expect(writingDayOf(new Date("2026-03-08T06:59:00Z"), twoThirty)).toBe("2026-03-07");
    expect(writingDayOf(new Date("2026-03-08T07:00:00Z"), twoThirty)).toBe("2026-03-08");
    expect(writingDayOf(new Date("2026-11-01T05:45:00Z"), twoThirty)).toBe("2026-10-31");
    expect(writingDayOf(new Date("2026-11-01T06:45:00Z"), twoThirty)).toBe("2026-10-31");
    expect(writingDayOf(new Date("2026-11-01T07:30:00Z"), twoThirty)).toBe("2026-11-01");
  });
});

describe("counting days", () => {
  it("adds and measures whole days across months, years and leap days", () => {
    expect(addDays("2026-11-03", 1)).toBe("2026-11-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-11-03", -29)).toBe("2026-10-05");
    expect(daysBetween("2026-10-05", "2026-11-03")).toBe(29);
    expect(daysBetween("2026-11-03", "2026-10-05")).toBe(-29);
  });

  it("names the weekday, Monday first", () => {
    expect(weekdayOf("2026-11-02")).toBe("Mon");
    expect(weekdayOf("2026-11-08")).toBe("Sun");
    expect(weekdayOf("2026-11-07")).toBe("Sat");
  });

  it("knows a real date from a made-up one", () => {
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("yesterday")).toBe(false);
  });
});
