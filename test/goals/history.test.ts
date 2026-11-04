/**
 * Words written in a day, and the streak read from them (ADR-0040).
 *
 * 2026-11-02 is a Monday; the weeks below are Mon 2 … Sun 8, Mon 9 … Sun 15.
 */
import { describe, expect, it } from "vitest";
import type { Weekday } from "../../src/goals/day.ts";
import { chartDays, DEFAULT_WEEKDAYS, met, streaks, wordsOn, type Goals } from "../../src/goals/history.ts";

function goals(goal: number | undefined, days: Record<string, number>, weekdays: readonly Weekday[] = DEFAULT_WEEKDAYS): Goals {
  return { goal, weekdays, days: new Map(Object.entries(days)) };
}
const WEEKDAYS_ONLY: readonly Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

describe("words in a day", () => {
  it("are never below zero, however many were cut", () => {
    const held = goals(500, { "2026-11-03": -40 });
    expect(wordsOn(held, "2026-11-03")).toBe(0);
    expect(wordsOn(held, "2026-11-04")).toBe(0);
  });
});

describe("a streak with every day counting", () => {
  it("is the run of days the goal was met, ending today", () => {
    const held = goals(100, { "2026-11-02": 100, "2026-11-03": 250, "2026-11-04": 100 });
    expect(streaks(held, "2026-11-04")).toEqual({ current: 3, best: 3 });
  });

  it("is broken by a missed day, and best remembers the longer run", () => {
    const held = goals(100, {
      "2026-11-02": 100, "2026-11-03": 100, "2026-11-04": 100,
      "2026-11-05": 99,
      "2026-11-06": 100,
    });
    expect(streaks(held, "2026-11-06")).toEqual({ current: 1, best: 3 });
  });

  it("is not broken by today while today is still being written", () => {
    const held = goals(100, { "2026-11-02": 100, "2026-11-03": 100, "2026-11-04": 20 });
    expect(streaks(held, "2026-11-04")).toEqual({ current: 2, best: 2 });
  });

  it("is broken by a whole day with nothing recorded", () => {
    const held = goals(100, { "2026-11-02": 100, "2026-11-04": 100 });
    expect(streaks(held, "2026-11-04")).toEqual({ current: 1, best: 1 });
  });

  it("is nothing without a goal, or without a history", () => {
    expect(streaks(goals(undefined, { "2026-11-03": 900 }), "2026-11-03")).toEqual({ current: 0, best: 0 });
    expect(streaks(goals(100, {}), "2026-11-03")).toEqual({ current: 0, best: 0 });
  });

  it("does not count a day that was cut back below the goal", () => {
    const held = goals(100, { "2026-11-02": 100, "2026-11-03": -500 });
    expect(streaks(held, "2026-11-04")).toEqual({ current: 0, best: 1 });
  });
});

describe("a streak with only some weekdays counting", () => {
  it("steps over a weekend that is not counted, neither breaking nor extending", () => {
    // Fri 6 met, Sat 7 and Sun 8 nothing, Mon 9 met.
    const held = goals(100, { "2026-11-06": 100, "2026-11-09": 100 }, WEEKDAYS_ONLY);
    expect(streaks(held, "2026-11-09")).toEqual({ current: 2, best: 2 });
    expect(met(held, "2026-11-07")).toBe(false);
  });

  it("does not let words written on a day that is not counted extend it", () => {
    const held = goals(100, { "2026-11-06": 100, "2026-11-07": 5000, "2026-11-08": 5000 }, WEEKDAYS_ONLY);
    expect(streaks(held, "2026-11-08")).toEqual({ current: 1, best: 1 });
  });

  it("is still broken by a missed day that is counted", () => {
    const held = goals(100, { "2026-11-05": 100, "2026-11-06": 10, "2026-11-09": 100 }, WEEKDAYS_ONLY);
    expect(streaks(held, "2026-11-09")).toEqual({ current: 1, best: 1 });
  });

  it("can be any subset, such as Tuesdays and Thursdays", () => {
    const held = goals(100, { "2026-11-03": 100, "2026-11-05": 100, "2026-11-10": 100 }, ["Tue", "Thu"]);
    expect(streaks(held, "2026-11-10")).toEqual({ current: 3, best: 3 });
    // Wed 11 and Thu 12: Thursday not yet written does not break it.
    expect(streaks(held, "2026-11-12")).toEqual({ current: 3, best: 3 });
    // Once Thursday is over and unmet, it does.
    expect(streaks(held, "2026-11-13")).toEqual({ current: 0, best: 3 });
  });

  it("is nothing when no day counts", () => {
    expect(streaks(goals(100, { "2026-11-03": 900 }, []), "2026-11-03")).toEqual({ current: 0, best: 0 });
  });
});

describe("the chart's thirty days", () => {
  it("run oldest first, ending today, with the days that count and the ones met", () => {
    const held = goals(100, { "2026-11-06": 120, "2026-11-07": 300, "2026-11-09": 40 }, WEEKDAYS_ONLY);
    const days = chartDays(held, "2026-11-09");
    expect(days).toHaveLength(30);
    expect(days[0]!.day).toBe("2026-10-11");
    expect(days[29]).toEqual({ day: "2026-11-09", words: 40, counted: true, met: false });
    expect(days.find((day) => day.day === "2026-11-06")).toMatchObject({ words: 120, counted: true, met: true });
    expect(days.find((day) => day.day === "2026-11-07")).toMatchObject({ words: 300, counted: false, met: false });
  });
});
